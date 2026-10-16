import { NATIVE_RESOURCE_KINDS as K } from './contracts.js';
import { RUN_NAMESPACE, assertRunState, assertRunContinuation, assertGenerationBudget } from '../../public/shared/native-run-contract.js';
import { getNativeDocument, putMutable, hashNativeDocument } from './repositories/common.js';
import { ConflictError } from '../storage/errors.js';
import { assertWritable, isReadOnly } from '../storage/read-only-mode.js';
import { chargeComputeAttempt, settleComputeAttempt, chargeLocalWork, settleLocalWork, retireComputeLedger, hasOpenComputeReservations, hasRetainedOrchestrationCompute,
    reserveComputeChild, releaseComputeChild, admitComputeAttempt } from '../../public/shared/native-compute-budget.js';
import { fields } from '../../public/shared/native-values.js';
import { assertSessionTaskHistory, sessionTaskHistoryLimits, completeSessionTaskHistory, sessionTaskPublicSummary } from '../../public/shared/native-session-task-history.js';

export const runFailure = code => Object.assign(new TypeError(code), { code });
const key = (handle, sessionId) => ({ kind: K.runControl, handle, sessionId });
const proofs = new WeakSet();
const controlVersions = new WeakMap();
function selectSessionTaskHistory(control, snapshot, operation, id, identity) {
    if (control?.headRevisionId && control.headRevisionId !== snapshot.revision.revisionId) throw new ConflictError('native_generation_revision_conflict');
    const history = control?.operations[operation]?.taskHistories?.[id];
    if (history && (history.invocationId !== identity.invocationId || history.fingerprint !== identity.fingerprint
        || history.inventoryFingerprint !== identity.inventoryFingerprint
        || (history.compaction && history.compaction.sourcePrefixFingerprint !== hashNativeDocument(history.compaction.sourceMessages)))) {
        throw runFailure('generation_continuation_unavailable');
    }
    return history;
}
function retireOperations(control, keep) {
    control.operations = Object.fromEntries(Object.entries(control.operations).filter(([, op]) => {
        if (keep(op) || hasRetainedOrchestrationCompute(op.compute) || Object.values(op.externalTasks ?? {}).some(row => row.orchestrationBinding)
            || hasOpenComputeReservations(op.compute) || op.compute?.attempts.some(row => row.status === 'charged') || op.compute?.localWork?.some(row => row.status === 'charged')) return true;
        if (op.compute) control.retiredCompute = retireComputeLedger(control.retiredCompute, op.compute);
        return false;
    }));
}

function computeOperation(control, snapshot, anchor, limits, { required = false } = {}) {
    if (control.headRevisionId !== snapshot.revision.revisionId) throw new ConflictError('native_generation_revision_conflict');
    if (required) {
        fields(anchor, ['branchId', 'revisionId'], 'Compute source anchor');
        if (anchor.branchId !== snapshot.revision.branchId || anchor.revisionId !== snapshot.revision.revisionId) throw new ConflictError('native_generation_revision_conflict');
    }
    const id = hashNativeDocument({ lane: 'turn', anchor });
    let op = control.operations[id];
    limits ??= op?.compute?.limits;
    if (!limits) { if (required) throw runFailure('native_generation_budget_unavailable'); return null; }
    if (!op) {
        if (Object.keys(control.operations).length >= 128) throw runFailure('native_run_continuation_limit');
        op = control.operations[id] = { lane: 'turn', anchor: structuredClone(anchor), attempts: {}, total: 0 };
    }
    return { id, op, limits };
}
// The original role/turn/background counters are shared by both original
// charge and stable admissions. This mutates only the unpublished control clone.
function chargeGenerationQuota(value, snapshot, request, policy) {
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
    op.attempts[lane] = (op.attempts[lane] ?? 0) + 1; op.total++;
    return { id, op };
}

export function retireRunOperations(control) { retireOperations(control, () => false); return control; }
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
        if (control.restoreState !== undefined && !['ready', 'review_required'].includes(control.restoreState)) throw runFailure('native_run_control_invalid');
        assertRunContinuation({ operations: control.operations, background: control.background, highWaterTurn: control.highWaterTurn,
            ...(control.retiredCompute === undefined ? {} : { retiredCompute: control.retiredCompute }) });
        if (control.mode && (!['pending', 'ordinary', 'ironman'].includes(control.mode)
            || !['pending', 'active', 'dead', 'terminal'].includes(control.status)
            || !Number.isSafeInteger(control.sequence) || control.sequence < 0)) throw runFailure('native_run_control_invalid');
    }
    if (control?.status === 'terminal') {
        retireOperations(control, () => false);
        controlVersions.set(control, record.integrity); return control;
    }
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
            ...(run.status === 'dead' && run.mode === 'ironman' ? { deathRevisionId: session.headRevisionId, cleanup: 'archived' } : {}),
        };
    }
    if (control && !run && session?.headRevisionId && session.headRevisionId !== control.headRevisionId) {
        control.headRevisionId = session.headRevisionId;
    }
    if (control && session?.headRevisionId) {
        const lifecycleHead = revision?.stateHeads.atri_lifecycle;
        const lifecycle = lifecycleHead && await getNativeDocument(tx, { kind: K.sessionState, handle, sessionId, namespace: 'atri_lifecycle', head: lifecycleHead });
        const pending = new Set(lifecycle?.outbox.filter(item => item.status === 'pending').map(item => item.invocationId));
        retireOperations(control, op => !['dead', 'terminal'].includes(control.status)
            && (op.lane === 'background' ? pending.has(op.anchor.invocationId) : op.anchor.revisionId === session.headRevisionId));
    }
    if (control && !session) retireRunOperations(control);
    if (control) controlVersions.set(control, record?.integrity ?? null);
    return control;
}
export async function assertRunAccess(tx, handle, sessionId, action, revisionId = undefined) {
    const control = await readRunControl(tx, handle, sessionId);
    if (!control) return null;
    if (control.restoreState === 'review_required' && !['status', 'inspect', 'save', 'export', 'import', 'cleanup'].includes(action)) throw runFailure('native_run_restore_review_required');
    if (control.status === 'terminal' && (!control.deathRevisionId || !['inspect', 'export'].includes(action)) && !['status', 'cleanup'].includes(action)) throw runFailure('native_run_terminal');
    if (control.status === 'dead' && !['status', 'inspect', 'rewind', 'save', 'export', 'import'].includes(action)) throw runFailure('native_run_dead');
    if (control.status === 'pending' && !['status', 'inspect', 'ready', 'start', 'persona'].includes(action)) throw runFailure('native_story_not_started');
    if (control.mode === 'ironman' && (action === 'rewind' || (revisionId && revisionId !== control.headRevisionId && control.status !== 'terminal'))) throw runFailure('native_run_rewind_denied');
    return control;
}
export async function writeRunControl(tx, handle, sessionId, control) {
    // Capacity/schema refusal belongs before admission is published and before
    // any provider send, rather than leaving an unreadable durable record.
    if (control.restoreState !== undefined && !['ready', 'review_required'].includes(control.restoreState)) throw runFailure('native_run_control_invalid');
    assertRunContinuation({ operations: control.operations, background: control.background, highWaterTurn: control.highWaterTurn,
        ...(control.retiredCompute === undefined ? {} : { retiredCompute: control.retiredCompute }) });
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
            if (value && !isReadOnly()) await writeRunControl(tx, handle, sessionId, value);
            return value;
        }));
    }
    async assert(handle, sessionId, action, revisionId) {
        return this.repo.withRunLock(handle, sessionId, () => this.repo._engine.withTransaction(handle, tx => assertRunAccess(tx, handle, sessionId, action, revisionId)));
    }
    async update(handle, sessionId, mutate, action = 'write', writeWhen = null) {
        return this.repo.withRunLock(handle, sessionId, () => this.repo._engine.withTransaction(handle, async tx => {
            if (!writeWhen) assertWritable();
            let value = await assertRunAccess(tx, handle, sessionId, action);
            if (!value) {
                const session = await getNativeDocument(tx, { kind: K.session, handle, sessionId });
                value = { schemaVersion: 1, operations: {}, background: {}, highWaterTurn: 0, headRevisionId: session?.headRevisionId ?? null };
                controlVersions.set(value, null);
            }
            if (writeWhen && !writeWhen(value)) return null;
            if (writeWhen) assertWritable();
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
    async externalTask(handle, sessionId, anchor, operationId, record = undefined) {
        const operation = hashNativeDocument({ lane: 'turn', anchor });
        if (record === undefined) {
            const control = await this.status(handle, sessionId);
            return structuredClone(control?.operations[operation]?.externalTasks?.[operationId] ?? null);
        }
        return this.update(handle, sessionId, control => {
            if (control.headRevisionId !== anchor.revisionId) throw new ConflictError('native_generation_revision_conflict');
            const op = control.operations[operation];
            // Admission must already have charged the same original bank.
            if (!op?.compute) throw runFailure('native_a2a_budget_unavailable');
            op.externalTasks ??= {};
            for (const [id, row] of Object.entries(op.externalTasks)) if (row.expiresAt <= Date.now() && !row.orchestrationBinding) delete op.externalTasks[id];
            if (!op.externalTasks[operationId] && Object.keys(op.externalTasks).length >= 32) throw runFailure('native_a2a_retention_limit');
            if (op.externalTasks[operationId] && hashNativeDocument(op.externalTasks[operationId].orchestrationBinding ?? null)
                !== hashNativeDocument(record.orchestrationBinding ?? null)) throw new ConflictError('native_a2a_orchestration_binding_conflict');
            if (op.externalTasks[operationId]?.acceptedReceipt && hashNativeDocument(op.externalTasks[operationId].acceptedReceipt)
                !== hashNativeDocument(record.acceptedReceipt ?? null)) throw new ConflictError('native_a2a_accepted_receipt_conflict');
            op.externalTasks[operationId] = structuredClone(record);
            return structuredClone(record);
        }, 'generate');
    }
    async sessionTaskHistory(handle, snapshot, anchor, identity, append = null) {
        const operation = hashNativeDocument({ lane: 'turn', anchor }), id = hashNativeDocument(identity.invocationId);
        const select = control => selectSessionTaskHistory(control, snapshot, operation, id, identity);
        if (!append) return this.repo.withRunLock(handle, snapshot.session.sessionId, () => this.repo._engine.withTransaction(handle, async tx => {
            const session = await getNativeDocument(tx, { kind: K.session, handle, sessionId: snapshot.session.sessionId });
            if (session?.headRevisionId !== snapshot.revision.revisionId) throw new ConflictError('native_generation_revision_conflict');
            return structuredClone(select(await assertRunAccess(tx, handle, snapshot.session.sessionId, 'write')) ?? null);
        }));
        return this.update(handle, snapshot.session.sessionId, control => {
            if (control.headRevisionId !== snapshot.revision.revisionId) throw new ConflictError('native_generation_revision_conflict');
            const previous = select(control);
            const next = assertSessionTaskHistory({ ...identity, messages: append.messages,
                ...(previous?.compaction ? { compaction: previous.compaction } : {}) });
            if (hashNativeDocument(previous?.messages ?? []) !== append.expectedPrefix
                || next.messages.length <= (previous?.messages.length ?? 0)
                || hashNativeDocument(next.messages.slice(0, previous?.messages.length ?? 0)) !== append.expectedPrefix) {
                throw new ConflictError('native_session_task_history_conflict');
            }
            let op = control.operations[operation];
            if (!op) {
                if (Object.keys(control.operations).length >= 128) throw runFailure('native_run_continuation_limit');
                op = control.operations[operation] = { lane: 'turn', anchor: structuredClone(anchor), attempts: {}, total: 0 };
            }
            op.taskHistories ??= {};
            if (!previous && Object.keys(op.taskHistories).length >= sessionTaskHistoryLimits.tasks) throw runFailure('native_session_task_history_limit');
            op.taskHistories[id] = structuredClone(next);
            return structuredClone(next);
        });
    }
    async compactSessionTaskHistory(handle, snapshot, anchor, identity, expectedPrefix, discardCheckpoints) {
        const operation = hashNativeDocument({ lane: 'turn', anchor }), id = hashNativeDocument(identity.invocationId);
        return this.repo.withRunLock(handle, snapshot.session.sessionId, () => this.repo._engine.withTransaction(handle, async tx => {
            assertWritable();
            const control = await assertRunAccess(tx, handle, snapshot.session.sessionId, 'write');
            const previous = selectSessionTaskHistory(control, snapshot, operation, id, identity);
            if (!previous || previous.compaction || !completeSessionTaskHistory(previous.messages)
                || hashNativeDocument(previous.messages) !== expectedPrefix) throw runFailure('generation_continuation_unavailable');
            const next = structuredClone(assertSessionTaskHistory({ ...identity, messages: [], compaction: { schemaVersion: 1, reason: 'context_budget',
                sourceMessages: previous.messages, sourcePrefixFingerprint: expectedPrefix,
                summary: sessionTaskPublicSummary(previous.messages), runtimeAuthorityFingerprint: '0'.repeat(64), sourceCheckpointIds: [] } }));
            const discarded = await discardCheckpoints(tx);
            next.compaction.sourceCheckpointIds = discarded.ids;
            next.compaction.runtimeAuthorityFingerprint = discarded.authorityFingerprint;
            assertSessionTaskHistory(next);
            control.operations[operation].taskHistories[id] = structuredClone(next);
            await writeRunControl(tx, handle, snapshot.session.sessionId, control);
            return structuredClone(next);
        }));
    }
    /** Observation only. Final admission still charges this same original CAS. */
    async checkGenerationQuota(handle, snapshot, request, policy) {
        assertGenerationBudget(policy, snapshot.manifest.runtime?.experienceContract?.lifecycleRuntime);
        if (hashNativeDocument(policy) !== hashNativeDocument(snapshot.manifest.runtime?.experienceContract?.generationBudget))
            throw runFailure('native_generation_budget_lane_denied');
        return this.repo.withRunLock(handle, snapshot.session.sessionId, () => this.repo._engine.withTransaction(handle, async tx => {
            const session = await getNativeDocument(tx, { kind: K.session, handle, sessionId: snapshot.session.sessionId });
            if (session?.headRevisionId !== snapshot.revision.revisionId) throw new ConflictError('native_generation_revision_conflict');
            const control = await assertRunAccess(tx, handle, snapshot.session.sessionId, 'write');
            chargeGenerationQuota(structuredClone(control ?? { schemaVersion: 1, operations: {}, background: {}, highWaterTurn: 0,
                headRevisionId: session.headRevisionId }), snapshot, request, policy);
        }));
    }

    async charge(handle, snapshot, request, policy) {
        return this.update(handle, snapshot.session.sessionId, value => {
            const { id, op } = chargeGenerationQuota(value, snapshot, request, policy);
            const limits = request.compute?.limits ?? op.compute?.limits;
            const compute = limits && request.compute ? chargeComputeAttempt(op, limits, request.compute.attempt, request.compute.options) : null;
            // Persist before send; errors above never publish a partial counter.
            return { operation: id, attempt: op.total, ...(compute ? { compute, limits: structuredClone(op.compute.limits) } : {}) };
        });
    }

    async chargeCompute(handle, snapshot, anchor, limits, attempt, options = {}) {
        return this.update(handle, snapshot.session.sessionId, value => {
            const selected = computeOperation(value, snapshot, anchor, limits);
            if (!selected) return null;
            const { id, op } = selected;
            const compute = chargeComputeAttempt(op, selected.limits, attempt, options);
            return { operation: id, compute, limits: structuredClone(op.compute.limits) };
        });
    }

    async reserveComputeChild(handle, snapshot, anchor, limits, input) {
        return this.update(handle, snapshot.session.sessionId, control => {
            const selected = computeOperation(control, snapshot, anchor, limits, { required: true });
            return { operation: selected.id, ...reserveComputeChild(selected.op, selected.limits, input), limits: structuredClone(selected.op.compute.limits) };
        });
    }

    /** quota is a Host-only original producer input, never an HTTP grant.
     * Both lanes use the root turn compute operation. A background quota keeps
     * its original invocation counter operation in this same control CAS. */
    async admitCompute(handle, snapshot, anchor, limits, attempt, options = {}, quota = null) {
        if (attempt.generationQuotaRef !== undefined) throw runFailure('native_generation_attempt_conflict');
        const trustedQuota = quota === null ? null : structuredClone(quota);
        if (trustedQuota !== null) {
            fields(trustedQuota, ['request', 'policy'], 'Generation quota');
            const { request, policy } = trustedQuota;
            fields(request, ['role', 'background', 'anchor'], 'Generation quota request');
            assertGenerationBudget(policy, snapshot.manifest.runtime?.experienceContract?.lifecycleRuntime);
            if (typeof request.background !== 'boolean'
                || typeof request.role !== 'string' || !/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(request.role)
                || (!request.background && !['narrator', 'intent_resolver'].includes(request.role))
                || hashNativeDocument(policy) !== hashNativeDocument(snapshot.manifest.runtime?.experienceContract?.generationBudget ?? null)) throw runFailure('native_generation_budget_lane_denied');
            fields(request.anchor, request.background ? ['invocationId'] : ['branchId', 'revisionId'], 'Generation quota anchor');
            if (request.background ? typeof request.anchor.invocationId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(request.anchor.invocationId)
                : hashNativeDocument(request.anchor) !== hashNativeDocument(anchor)) throw runFailure('native_generation_budget_lane_denied');
        }
        return this.update(handle, snapshot.session.sessionId, control => {
            const selected = computeOperation(control, snapshot, anchor, limits, { required: true });
            const generationQuotaRef = trustedQuota === null ? undefined : {
                operationId: hashNativeDocument({ lane: trustedQuota.request.background ? 'background' : 'turn', anchor: trustedQuota.request.anchor }),
                role: trustedQuota.request.role, background: trustedQuota.request.background,
                policyDigest: hashNativeDocument(trustedQuota.policy), anchorDigest: hashNativeDocument(trustedQuota.request.anchor),
            };
            const boundAttempt = { ...attempt, ...(generationQuotaRef === undefined ? {} : { generationQuotaRef }) };
            const admission = admitComputeAttempt(selected.op, selected.limits, boundAttempt, options);
            // A refused quota throws before the sole durable control write.
            // Observing/replaying a stable admission consumes no second quota.
            if (trustedQuota !== null) {
                if (!admission.replayed) chargeGenerationQuota(control, snapshot, trustedQuota.request, trustedQuota.policy);
            }
            return { operation: selected.id, compute: admission.attempt, replayed: admission.replayed, limits: structuredClone(selected.op.compute.limits),
                ...(admission.attempt.generationQuotaRef === undefined ? {} : { quotaOperation: admission.attempt.generationQuotaRef.operationId }) };
        });
    }

    async releaseComputeChild(handle, sessionId, operation, reservationId) {
        return this.update(handle, sessionId, control => {
            const op = control.operations[operation];
            if (!op?.compute) throw runFailure('native_generation_attempt_conflict');
            return { operation, ...releaseComputeChild(op, reservationId) };
        }, 'status');
    }

    async observeCompute(handle, sessionId, operation, attemptId) {
        return this.repo.withRunLock(handle, sessionId, () => this.repo._engine.withTransaction(handle, async tx => {
            const control = await assertRunAccess(tx, handle, sessionId, 'status');
            const ledger = control?.operations[operation]?.compute, compute = ledger?.attempts.find(row => row.attemptId === attemptId);
            if (!compute) throw runFailure('native_generation_attempt_conflict');
            return structuredClone({ operation, compute, limits: ledger.limits });
        }));
    }

    async chargeLocalWork(handle, snapshot, anchor, limits, attempt, { background = false, reservationId } = {}) {
        const id = hashNativeDocument({ lane: background ? 'background' : 'turn', anchor });
        return this.update(handle, snapshot.session.sessionId, value => {
            if (value.headRevisionId !== snapshot.revision.revisionId) throw new ConflictError('native_generation_revision_conflict');
            let op = value.operations[id];
            limits ??= op?.compute?.limits;
            if (!limits?.localWork && !op?.compute?.limits.localWork) { if (reservationId != null) throw runFailure('native_generation_budget_unavailable'); return null; }
            if (reservationId != null) {
                fields(anchor, ['branchId', 'revisionId'], 'Compute source anchor');
                if (anchor.branchId !== snapshot.revision.branchId || anchor.revisionId !== snapshot.revision.revisionId) throw new ConflictError('native_generation_revision_conflict');
            }
            if (!op) {
                if (Object.keys(value.operations).length >= 128) throw runFailure('native_run_continuation_limit');
                op = value.operations[id] = { lane: background ? 'background' : 'turn', anchor: structuredClone(anchor), attempts: {}, total: 0 };
            }
            const localWork = chargeLocalWork(op, limits, attempt, { reservationId });
            return { operation: id, localWork };
        }, 'write', value => {
            if (value.headRevisionId !== snapshot.revision.revisionId) throw new ConflictError('native_generation_revision_conflict');
            return reservationId != null || Boolean(limits?.localWork || value.operations[id]?.compute?.limits.localWork);
        });
    }
    async settleLocalWork(handle, sessionId, operation, attemptId, usage) {
        return this.update(handle, sessionId, value => {
            const op = value.operations[operation];
            if (!op) throw runFailure('native_generation_attempt_conflict');
            return settleLocalWork(op, attemptId, usage);
        }, 'status');
    }
    async settleCompute(handle, sessionId, operation, attemptId, usage) {
        return this.update(handle, sessionId, value => {
            const op = value.operations[operation];
            if (!op) throw runFailure('native_generation_attempt_conflict');
            return settleComputeAttempt(op, attemptId, usage);
        }, 'status');
    }
}
