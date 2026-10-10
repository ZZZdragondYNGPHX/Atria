import { NATIVE_RESOURCE_KINDS as K } from './contracts.js';
import { RUN_NAMESPACE, assertRunState, assertRunContinuation } from '../../public/shared/native-run-contract.js';
import { getNativeDocument, putMutable, hashNativeDocument } from './repositories/common.js';
import { ConflictError } from '../storage/errors.js';
import { chargeComputeAttempt, settleComputeAttempt } from '../../public/shared/native-compute-budget.js';

export const runFailure = code => Object.assign(new TypeError(code), { code });
const key = (handle, sessionId) => ({ kind: K.runControl, handle, sessionId });
const proofs = new WeakSet();
const controlVersions = new WeakMap();
export function runPublicationProof() { const proof = {}; proofs.add(proof); return proof; }
export const validRunPublication = proof => Boolean(proof && proofs.has(proof));

// Current HEAD, never the caller's historical snapshot, determines run access.
// This also recovers a commit-last interruption between the Session HEAD CAS
// and writing its external control record. The control record survives deletion.
export async function readRunControl(tx, handle, sessionId) {
    const record = await tx.getResource(key(handle, sessionId));
    let control = record?.doc ? structuredClone(record.doc) : null;
    if (control) {
        if (hashNativeDocument(control) !== record.integrity || control.schemaVersion !== 1) throw runFailure('native_run_control_integrity');
        assertRunContinuation({ operations: control.operations, background: control.background, highWaterTurn: control.highWaterTurn });
        if (control.mode && (!['pending', 'ordinary', 'ironman'].includes(control.mode)
            || !['pending', 'active', 'dead', 'terminal'].includes(control.status)
            || !Number.isSafeInteger(control.sequence) || control.sequence < 0)) throw runFailure('native_run_control_invalid');
    }
    if (control?.status === 'terminal') { controlVersions.set(control, record.integrity); return control; }
    const session = await getNativeDocument(tx, { kind: K.session, handle, sessionId });
    const revision = session?.headRevisionId && await getNativeDocument(tx, { kind: K.sessionRevision, handle, sessionId, revisionId: session.headRevisionId });
    const head = revision?.stateHeads[RUN_NAMESPACE];
    const run = head && await getNativeDocument(tx, { kind: K.sessionState, handle, sessionId, namespace: RUN_NAMESPACE, head });
    if (run) {
        assertRunState(run);
        if (control?.mode && control.mode !== 'pending' && control.mode !== run.mode) throw runFailure('native_run_mode_conflict');
        if (control?.status === 'terminal') return control;
        control ??= { schemaVersion: 1, operations: {}, background: {}, highWaterTurn: 0 };
        if (control.headRevisionId && control.headRevisionId !== session.headRevisionId) {
            control.operations = Object.fromEntries(Object.entries(control.operations).filter(([, op]) => op.lane === 'background'));
            // A queued batch keeps its attempts across unrelated foreground commits.
            // Foreground restores publish a new branch/revision, never the old anchor.
            delete control.resumeSourceRevisionId;
        }
        control = {
            ...control,
            origin: { packageId: session.packageId, packageVersionId: session.packageVersionId,
                entryPointId: session.entryPointId, packageContentHash: session.packageContentHash },
            mode: run.mode, status: run.status === 'dead' && run.mode === 'ironman' ? 'terminal' : run.status,
            sequence: Math.max(control.sequence ?? 0, run.sequence), headRevisionId: session.headRevisionId,
            ...(run.status === 'dead' && run.mode === 'ironman' ? { deathRevisionId: session.headRevisionId, cleanup: 'pending' } : {}),
        };
    }
    if (control && !run && session?.headRevisionId && session.headRevisionId !== control.headRevisionId) {
        control.operations = Object.fromEntries(Object.entries(control.operations).filter(([, op]) => op.lane === 'background')); control.headRevisionId = session.headRevisionId;
    }
    if (control && session?.headRevisionId) {
        const lifecycleHead = revision?.stateHeads.atri_lifecycle;
        const lifecycle = lifecycleHead && await getNativeDocument(tx, { kind: K.sessionState, handle, sessionId, namespace: 'atri_lifecycle', head: lifecycleHead });
        const pending = new Set(lifecycle?.outbox.filter(item => item.status === 'pending').map(item => item.invocationId));
        control.operations = Object.fromEntries(Object.entries(control.operations).filter(([, op]) => op.lane !== 'background' || pending.has(op.anchor.invocationId)));
    }
    if (control) controlVersions.set(control, record?.integrity ?? null);
    return control;
}
export async function assertRunAccess(tx, handle, sessionId, action, revisionId = undefined) {
    const control = await readRunControl(tx, handle, sessionId);
    if (!control) return null;
    if (control.status === 'terminal' && !['status', 'cleanup'].includes(action)) throw runFailure('native_run_terminal');
    if (control.status === 'dead' && !['status', 'inspect', 'rewind', 'save', 'export', 'import'].includes(action)) throw runFailure('native_run_dead');
    if (control.status === 'pending' && !['status', 'inspect', 'ready', 'start', 'persona'].includes(action)) throw runFailure('native_story_not_started');
    if (control.mode === 'ironman' && (action === 'rewind' || (revisionId && revisionId !== control.headRevisionId))) throw runFailure('native_run_rewind_denied');
    return control;
}
export async function writeRunControl(tx, handle, sessionId, control) {
    const expectedIntegrity = controlVersions.has(control) ? controlVersions.get(control) : (await tx.getResource(key(handle, sessionId)))?.integrity ?? null;
    const result = await putMutable(tx, key(handle, sessionId), control, { expectedIntegrity });
    controlVersions.set(control, hashNativeDocument(control));
    return result;
}

export class RunControl {
    constructor(repo) { this.repo = repo; }
    async status(handle, sessionId) {
        return this.repo.withRunLock(handle, sessionId, () => this.repo._engine.withTransaction(handle, async tx => {
            const value = await readRunControl(tx, handle, sessionId);
            if (value) await writeRunControl(tx, handle, sessionId, value);
            return value;
        }));
    }
    async assert(handle, sessionId, action, revisionId) {
        return this.repo.withRunLock(handle, sessionId, () => this.repo._engine.withTransaction(handle, tx => assertRunAccess(tx, handle, sessionId, action, revisionId)));
    }
    async update(handle, sessionId, mutate) {
        return this.repo.withRunLock(handle, sessionId, () => this.repo._engine.withTransaction(handle, async tx => {
            let value = await assertRunAccess(tx, handle, sessionId, 'write');
            if (!value) {
                const session = await getNativeDocument(tx, { kind: K.session, handle, sessionId });
                value = { schemaVersion: 1, operations: {}, background: {}, highWaterTurn: 0, headRevisionId: session?.headRevisionId ?? null };
                controlVersions.set(value, null);
            }
            const result = await mutate(value);
            await writeRunControl(tx, handle, sessionId, value);
            return result;
        }));
    }
    async selection(handle, sessionId, anchor, fingerprint, selected = undefined) {
        return this.update(handle, sessionId, value => {
            const id = hashNativeDocument({ lane: 'turn', anchor });
            let op = value.operations[id];
            if (!op) {
                if (Object.keys(value.operations).length >= 128) throw runFailure('native_run_continuation_limit');
                op = value.operations[id] = { lane: 'turn', anchor: structuredClone(anchor), fingerprint, attempts: {}, total: 0 };
            }
            op.fingerprint ??= fingerprint;
            if (op.fingerprint !== fingerprint) throw new ConflictError('native_authority_input_conflict');
            if (selected !== undefined) {
                if (op.selection && hashNativeDocument(op.selection) !== hashNativeDocument(selected)) throw new ConflictError('native_authority_selection_conflict');
                op.selection = structuredClone(selected);
            }
            return op.selection ? structuredClone(op.selection) : null;
        });
    }
    async charge(handle, snapshot, request, policy) {
        const { sessionId } = snapshot.session;
        return this.update(handle, sessionId, value => {
            if (value.headRevisionId !== snapshot.revision.revisionId) throw new ConflictError('native_generation_revision_conflict');
            const { domainId, recordId, field } = policy.turnCounter;
            const turn = snapshot.states.atri_lifecycle.domains[domainId].records.find(r => r.id === recordId)?.value[field];
            if (!Number.isSafeInteger(turn) || turn < 0) throw runFailure('native_generation_turn_counter_missing');
            value.highWaterTurn = Math.max(value.highWaterTurn, turn);
            const anchor = request.anchor;
            const id = hashNativeDocument({ lane: request.background ? 'background' : 'turn', anchor });
            let op = value.operations[id];
            if (!op) {
                if (Object.keys(value.operations).length >= 128) throw runFailure('native_run_continuation_limit');
                op = value.operations[id] = { lane: request.background ? 'background' : 'turn', anchor: structuredClone(anchor), attempts: {}, total: 0 };
            }
            const lane = request.background ? 'background' : request.role;
            if (!['background', 'narrator', 'intent_resolver'].includes(lane)) throw runFailure('native_generation_budget_lane_denied');
            const max = request.background ? policy.backgroundAttempts : lane === 'narrator' ? policy.narratorAttempts : policy.resolverAttempts;
            if ((op.attempts[lane] ?? 0) >= max || (!request.background && op.total >= policy.turnAttempts)) throw runFailure('native_generation_budget_exhausted');
            if (request.background) {
                if (turn < policy.backgroundWindowTurns) throw runFailure('native_generation_background_not_due');
                const window = Math.floor(value.highWaterTurn / policy.backgroundWindowTurns);
                const period = Math.floor(value.highWaterTurn / policy.backgroundPeriodTurns);
                const entry = value.background[window] ?? { operation: id, count: 0, period };
                if (entry.operation !== id || entry.count >= policy.backgroundAttempts
                    || Object.values(value.background).filter(item => item.period === period).reduce((sum, item) => sum + item.count, 0) >= policy.backgroundPeriodAttempts) throw runFailure('native_generation_budget_exhausted');
                entry.count++; value.background[window] = entry;
                for (const [oldWindow, item] of Object.entries(value.background)) if (item.period < period) delete value.background[oldWindow];
            }
            const compute = request.compute ? chargeComputeAttempt(op, request.compute.limits, request.compute.attempt) : null;
            op.attempts[lane] = (op.attempts[lane] ?? 0) + 1; op.total++;
            // Persist before send. A process interruption is an unknown send,
            // not a refund or a new operation identity.
            return { operation: id, attempt: op.total, ...(compute ? { compute } : {}) };
        });
    }

    async chargeCompute(handle, snapshot, anchor, limits, attempt) {
        return this.update(handle, snapshot.session.sessionId, value => {
            if (value.headRevisionId !== snapshot.revision.revisionId) throw new ConflictError('native_generation_revision_conflict');
            const id = hashNativeDocument({ lane: 'turn', anchor });
            let op = value.operations[id];
            if (!op) {
                if (Object.keys(value.operations).length >= 128) throw runFailure('native_run_continuation_limit');
                op = value.operations[id] = { lane: 'turn', anchor: structuredClone(anchor), attempts: {}, total: 0 };
            }
            return { operation: id, compute: chargeComputeAttempt(op, limits, attempt) };
        });
    }

    async settleCompute(handle, sessionId, operation, attemptId, usage) {
        return this.update(handle, sessionId, value => {
            const op = value.operations[operation];
            if (!op) throw runFailure('native_generation_attempt_conflict');
            return settleComputeAttempt(op, attemptId, usage);
        });
    }
}
