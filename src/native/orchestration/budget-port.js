import { ConflictError } from '../../storage/errors.js';
import { hashNativeDocument } from '../repositories/common.js';
import { assertNativeId } from '../identity.js';
import { readRunControl } from '../run-control.js';
import { fields } from '../../../public/shared/native-values.js';
import { assertNativeTurnQuota } from './native-turn-quota.js';
import { orchestrationComputeAttemptId, inspectComputeChildClosure, inspectComputeEffectClosure, assertComputeBudget } from '../../../public/shared/native-compute-budget.js';
import { RpRunControl } from '../rp-run-control.js';

// V3 BudgetPort (interface §8.1/§13): a typed dispatcher onto the three original
// banks. It owns no ledger, price or limit; every decision is the original
// Session RunControl, Project Task or RP RunControl reducer.
const fail = code => { throw Object.assign(new TypeError(code), { code }); };
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const ADMITTED = new Set(['charged', 'unknown', 'settled']);
const sendBanks = new WeakMap();

/** Original adapter provenance only; this is neither a balance nor a grant. */
export function assertOriginalSendBank(bank, { budgetPort, handle, authorityRef, effectId }) {
    const original = sendBanks.get(bank);
    if (!original || original.budgetPort !== budgetPort || original.handle !== handle || original.effectId !== effectId
        || original.authorityDigest !== hashNativeDocument(authorityRef)
        || original.authorityDigest !== hashNativeDocument(bank.authorityRef)) fail('native_orchestration_budget_bank_invalid');
}

/** Stable provider sub-send identity (§13.2): never random, one per Effect ordinal. */
export function sendAttemptId(effectId, providerSendOrdinal) {
    assertNativeId(effectId, 'orchestrationEffect');
    if (!Number.isSafeInteger(providerSendOrdinal) || providerSendOrdinal < 0 || providerSendOrdinal > 1023) fail('native_orchestration_send_ordinal_invalid');
    return orchestrationComputeAttemptId({ kind: 'provider_send', effectId, ordinal: providerSendOrdinal });
}

export function localWorkAttemptId(effectId, localWorkOrdinal) {
    assertNativeId(effectId, 'orchestrationEffect');
    if (!Number.isSafeInteger(localWorkOrdinal) || localWorkOrdinal < 0 || localWorkOrdinal > 1023) fail('native_orchestration_send_ordinal_invalid');
    return orchestrationComputeAttemptId({ kind: 'local_work', effectId, ordinal: localWorkOrdinal });
}

export function assertBudgetAuthorityRef(ref) {
    if (ref?.authority === 'project_task') {
        fields(ref, ['authority', 'projectId', 'taskId', 'operationId'], 'Project budget authority');
        assertNativeId(ref.projectId, 'project');
        if (typeof ref.taskId !== 'string' || !ref.taskId) fail('native_orchestration_budget_unavailable');
    } else if (ref?.authority === 'run_control' && ref.domain === 'session') {
        fields(ref, ['authority', 'domain', 'sessionId', 'operationId'], 'Session budget authority');
        assertNativeId(ref.sessionId, 'session');
    } else if (ref?.authority === 'run_control' && ref.domain === 'rp_chat') {
        fields(ref, ['authority', 'domain', 'controlId', 'operationId', 'source'], 'RP budget authority');
        assertNativeId(ref.controlId, 'rpControl');
        if (ref.operationId !== hashNativeDocument({ controlId: ref.controlId, input: ref.source?.input, purpose: ref.source?.purpose, outputSlot: ref.source?.outputSlot })) fail('native_orchestration_budget_unavailable');
    } else fail('native_orchestration_budget_unavailable');
    if (!digest(ref.operationId)) fail('native_orchestration_budget_unavailable');
    return ref;
}

export function assertBudgetAttemptRef(ref) {
    if (ref?.kind === 'local_work') {
        fields(ref, ['kind', 'authorityRef', 'effectId', 'localWorkOrdinal', 'attemptId', 'reservationId'], 'Local budget attempt reference');
        assertBudgetAuthorityRef(ref.authorityRef);
        if (ref.attemptId !== localWorkAttemptId(ref.effectId, ref.localWorkOrdinal)
            || (ref.reservationId !== null && (typeof ref.reservationId !== 'string' || !ref.reservationId))) fail('native_orchestration_budget_attempt_invalid');
        return ref;
    }
    fields(ref, ['authorityRef', 'effectId', 'providerSendOrdinal', 'attemptId', 'reservationId'], 'Budget attempt reference');
    assertBudgetAuthorityRef(ref.authorityRef);
    if (ref.attemptId !== sendAttemptId(ref.effectId, ref.providerSendOrdinal)) fail('native_orchestration_budget_attempt_invalid');
    if (ref.reservationId !== null && (typeof ref.reservationId !== 'string' || !ref.reservationId)) fail('native_orchestration_budget_attempt_invalid');
    return ref;
}

function assertAttemptProvenance(ref, row) {
    if (!row || (row.reservationId ?? null) !== ref.reservationId) fail('native_orchestration_budget_attempt_missing');
    const provenance = { kind: ref.kind === 'local_work' ? 'local_work' : 'provider_send', effectId: ref.effectId,
        ordinal: ref.kind === 'local_work' ? ref.localWorkOrdinal : ref.providerSendOrdinal };
    if (hashNativeDocument(row.orchestration ?? null) !== hashNativeDocument(provenance)) fail('native_orchestration_budget_attempt_invalid');
    return row;
}

export class BudgetPort {
    constructor({ sessionCore, projectAgent, projectRepository, rpControl }) {
        Object.assign(this, { sessionCore, projectAgent, projectRepository, rpControl });
    }

    #rpContext(handle, controlId, source, tx) {
        if (!(this.rpControl instanceof RpRunControl)) fail('native_orchestration_budget_unavailable');
        return RpRunControl.prototype.context.call(this.rpControl, handle, controlId, source, tx ? { tx } : undefined);
    }

    /** Admission-time authority for one source operation. A source without an original bank is refused. */
    async authorityFor(handle, source, { tx } = {}) {
        if (source?.domain === 'native_session') {
            if (!this.sessionCore) fail('native_orchestration_budget_unavailable');
            const snapshot = await this.sessionCore.observe(handle, source.sessionId);
            const anchor = { branchId: snapshot.revision.branchId, revisionId: snapshot.revision.revisionId };
            return { authority: 'run_control', domain: 'session', sessionId: source.sessionId, operationId: hashNativeDocument({ lane: 'turn', anchor }) };
        }
        if (source?.domain === 'project') {
            if (!this.projectAgent) fail('native_orchestration_budget_unavailable');
            const { task, project } = await this.projectAgent[tx ? 'observeComputeSource' : 'observeContext'](handle, source.projectId, source.taskId);
            if (project.revision.revision !== task.baseRevision) throw new ConflictError('native_generation_revision_conflict');
            return { authority: 'project_task', projectId: source.projectId, taskId: source.taskId, operationId: this.#projectOperation(source, task) };
        }
        if (source?.domain === 'rp_chat') {
            if (!this.rpControl) fail('native_orchestration_budget_unavailable');
            fields(source, ['domain', 'controlId', 'source'], 'RP budget source');
            const ref = { authority: 'run_control', domain: 'rp_chat', controlId: source.controlId, source: structuredClone(source.source),
                operationId: hashNativeDocument({ controlId: source.controlId, input: source.source.input, purpose: source.source.purpose, outputSlot: source.source.outputSlot }) };
            await this.#rpContext(handle, source.controlId, source.source, tx);
            return assertBudgetAuthorityRef(ref);
        }
        fail('native_orchestration_budget_unavailable');
    }

    #projectOperation(ref, task) {
        return hashNativeDocument({ projectId: ref.projectId, taskId: ref.taskId, revision: task.baseRevision, executionFingerprint: task.executionFingerprint });
    }

    // Each admission call re-derives the current original source and refuses a moved operation.
    async #session(handle, ref) {
        const snapshot = await this.sessionCore.observe(handle, ref.sessionId);
        const anchor = { branchId: snapshot.revision.branchId, revisionId: snapshot.revision.revisionId };
        if (hashNativeDocument({ lane: 'turn', anchor }) !== ref.operationId) throw new ConflictError('native_generation_revision_conflict');
        return { snapshot, anchor };
    }

    async #project(handle, ref, { tx } = {}) {
        // Final consumption already owns the original Task/Studio queues. The
        // original transaction reader avoids queuing behind our own boundary.
        const { task, project } = await this.projectAgent[tx ? 'observeComputeSource' : 'observeContext'](handle, ref.projectId, ref.taskId);
        if (project.revision.revision !== task.baseRevision || this.#projectOperation(ref, task) !== ref.operationId) throw new ConflictError('native_generation_revision_conflict');
        return task;
    }

    async reserveChild(handle, { authorityRef, parentReservationId, childRunId, ceiling, limits }) {
        assertBudgetAuthorityRef(authorityRef); assertNativeId(childRunId, 'orchestrationRun');
        const input = { reservationId: childRunId, parentReservationId, consumerId: childRunId, limits: ceiling };
        let result;
        if (authorityRef.domain === 'session') {
            const { snapshot, anchor } = await this.#session(handle, authorityRef);
            result = await this.sessionCore.runs.reserveComputeChild(handle, snapshot, anchor, limits, input);
        } else if (authorityRef.authority === 'project_task') {
            const task = await this.#project(handle, authorityRef);
            result = await this.projectAgent.reserveComputeChild(handle, authorityRef.projectId, authorityRef.taskId, task.baseRevision, limits, input, task.executionFingerprint);
        } else result = await this.rpControl.reserveComputeChild(handle, authorityRef.controlId, authorityRef.source, limits, input);
        return { reservationId: result.reservation.reservationId, status: result.reservation.status, ceiling: result.reservation.limits, replayed: result.replayed };
    }

    async admitAttempt(handle, { authorityRef, reservationId = null, effectId, providerSendOrdinal, requestId, targetFingerprint, inputFingerprint, upperBound, limits, reserve, quotaProof }) {
        assertBudgetAuthorityRef(authorityRef);
        const attempt = { attemptId: sendAttemptId(effectId, providerSendOrdinal), requestId, targetFingerprint, estimatedTokens: upperBound, inputFingerprint,
            orchestration: { kind: 'provider_send', effectId, ordinal: providerSendOrdinal } };
        const options = { ...(reservationId === null ? {} : { reservationId }), ...(reserve ? { reserve } : {}) };
        let result;
        if (authorityRef.domain === 'session') {
            const { snapshot, anchor } = await this.#session(handle, authorityRef);
            const policy = snapshot.manifest.runtime?.experienceContract?.generationBudget ?? null;
            const quota = policy !== null || quotaProof !== undefined ? assertNativeTurnQuota(quotaProof,
                { sessionCore: this.sessionCore, handle, sessionId: snapshot.session.sessionId, requestId, anchor, policy }).quota : null;
            result = await this.sessionCore.runs.admitCompute(handle, snapshot, anchor, limits, attempt, options, quota);
        } else if (authorityRef.authority === 'project_task') {
            if (quotaProof !== undefined) fail('native_generation_budget_lane_denied');
            const task = await this.#project(handle, authorityRef);
            result = await this.projectAgent.admitGeneration(handle, authorityRef.projectId, authorityRef.taskId, task.baseRevision, limits, attempt, task.executionFingerprint, options);
        } else {
            if (quotaProof !== undefined) fail('native_generation_budget_lane_denied');
            result = await this.rpControl.admitCompute(handle, authorityRef.controlId, authorityRef.source, limits, attempt, options);
        }
        return { budgetAttemptRef: { authorityRef: structuredClone(authorityRef), effectId, providerSendOrdinal, attemptId: attempt.attemptId, reservationId },
            compute: result.compute, replayed: result.replayed, limits: result.limits };
    }

    // Observation/settlement follow the frozen operation identity, not current source.
    async observeAttempt(handle, budgetAttemptRef) {
        const { authorityRef: ref, attemptId } = assertBudgetAttemptRef(budgetAttemptRef);
        if (budgetAttemptRef.kind === 'local_work') {
            const engine = ref.domain === 'session' ? this.sessionCore.runs.repo._engine : ref.authority === 'project_task' ? this.projectRepository.engine : this.rpControl._engine;
            return engine.withTransaction(handle, async tx => {
                const ledger = await this.#ledger(handle, tx, ref);
                const row = ledger?.localWork?.find(item => item.attemptId === attemptId);
                return structuredClone(assertAttemptProvenance(budgetAttemptRef, row));
            });
        }
        const row = ref.domain === 'session' ? (await this.sessionCore.runs.observeCompute(handle, ref.sessionId, ref.operationId, attemptId)).compute
            : ref.authority === 'project_task' ? (await this.projectAgent.observeCompute(handle, ref.projectId, ref.taskId, attemptId)).compute
                : (await this.rpControl.observeCompute(handle, ref.controlId, ref.operationId, attemptId)).compute;
        return structuredClone(assertAttemptProvenance(budgetAttemptRef, row));
    }

    async settleAttempt(handle, budgetAttemptRef, usage) {
        const { authorityRef: ref, attemptId } = assertBudgetAttemptRef(budgetAttemptRef);
        if (budgetAttemptRef.kind === 'local_work') return this.settleLocalWork(handle, ref, attemptId, usage);
        if (ref.domain === 'session') return this.sessionCore.runs.settleCompute(handle, ref.sessionId, ref.operationId, attemptId, usage);
        if (ref.authority === 'project_task') return this.projectAgent.settleGeneration(handle, ref.projectId, ref.taskId, attemptId, usage);
        return this.rpControl.settleCompute(handle, ref.controlId, ref.operationId, attemptId, usage);
    }

    async releaseUnused(handle, { authorityRef, reservationId }) {
        assertBudgetAuthorityRef(authorityRef);
        const result = authorityRef.domain === 'session' ? await this.sessionCore.runs.releaseComputeChild(handle, authorityRef.sessionId, authorityRef.operationId, reservationId)
            : authorityRef.authority === 'project_task' ? await this.projectAgent.releaseComputeChild(handle, authorityRef.projectId, authorityRef.taskId, reservationId)
                : await this.rpControl.releaseComputeChild(handle, authorityRef.controlId, authorityRef.operationId, reservationId);
        return { reservationId, status: result.reservation.status, replayed: result.replayed };
    }

    async chargeLocalWork(handle, { authorityRef, reservationId = null, limits, attempt, effectId, localWorkOrdinal }) {
        assertBudgetAuthorityRef(authorityRef);
        if (attempt.orchestration !== undefined) fail('native_orchestration_budget_attempt_invalid');
        const orchestration = { kind: 'local_work', effectId, ordinal: localWorkOrdinal };
        if (orchestrationComputeAttemptId(orchestration) !== attempt.attemptId) fail('native_orchestration_budget_attempt_invalid');
        attempt = { ...attempt, orchestration };
        const options = reservationId === null ? {} : { reservationId };
        if (authorityRef.domain === 'session') {
            const { snapshot, anchor } = await this.#session(handle, authorityRef);
            return (await this.sessionCore.runs.chargeLocalWork(handle, snapshot, anchor, limits, attempt, options))?.localWork ?? null;
        }
        if (authorityRef.authority === 'project_task') {
            const task = await this.#project(handle, authorityRef);
            return this.projectAgent.chargeLocalWork(handle, authorityRef.projectId, authorityRef.taskId, task.baseRevision, limits, attempt, task.executionFingerprint, options);
        }
        return (await this.rpControl.chargeLocalWork(handle, authorityRef.controlId, authorityRef.source, limits, attempt, options)).localWork;
    }

    async settleLocalWork(handle, authorityRef, attemptId, usage) {
        assertBudgetAuthorityRef(authorityRef);
        if (authorityRef.domain === 'session') return this.sessionCore.runs.settleLocalWork(handle, authorityRef.sessionId, authorityRef.operationId, attemptId, usage);
        if (authorityRef.authority === 'project_task') return this.projectAgent.settleLocalWork(handle, authorityRef.projectId, authorityRef.taskId, attemptId, usage);
        return this.rpControl.settleLocalWork(handle, authorityRef.controlId, authorityRef.operationId, attemptId, usage);
    }

    async assertCurrent(handle, authorityRef, { tx } = {}) {
        assertBudgetAuthorityRef(authorityRef);
        if (authorityRef.domain === 'session') await this.#session(handle, authorityRef);
        else if (authorityRef.authority === 'project_task') await this.#project(handle, authorityRef, { tx });
        else await this.#rpContext(handle, authorityRef.controlId, authorityRef.source, tx);
    }

    async #ledger(handle, tx, authority) {
        if (authority.domain === 'session') return (await readRunControl(tx, handle, authority.sessionId))?.operations[authority.operationId]?.compute;
        if (authority.authority === 'project_task') return (await this.projectRepository.get(handle, authority.projectId, authority.taskId))?.compute;
        if (!(this.rpControl instanceof RpRunControl)) fail('native_orchestration_budget_unavailable');
        return (await RpRunControl.prototype.status.call(this.rpControl, handle, authority.controlId, { tx }))?.operations[authority.operationId]?.compute;
    }

    /** Exact root Effect costs; unrelated Runs do not become this Run's receipts. */
    async observeEffectClosure(handle, input, { tx } = {}) {
        fields(input, ['authorityRef', 'effectIds'], 'Effect budget closure');
        const { authorityRef, effectIds } = input;
        assertBudgetAuthorityRef(authorityRef);
        if (!tx || typeof tx.getResource !== 'function') fail('native_orchestration_budget_transaction_required');
        const engine = authorityRef.domain === 'session' ? this.sessionCore?.runs.repo._engine
            : authorityRef.authority === 'project_task' ? this.projectRepository?.engine : this.rpControl?._engine;
        if (!engine) fail('native_orchestration_budget_unavailable');
        return engine.withTransaction(handle, async active => {
            if (active !== tx) fail('native_orchestration_budget_transaction_required');
            const ledger = await this.#ledger(handle, tx, authorityRef);
            if (!ledger) fail('native_orchestration_budget_unavailable');
            const facts = inspectComputeEffectClosure({ compute: ledger }, effectIds);
            const rows = [...facts.modelAttempts, ...facts.localWork].toSorted((a, b) => a.attemptId.localeCompare(b.attemptId));
            const budgetAttemptRefs = rows.map(row => {
                const marker = row.orchestration;
                if (!marker || row.attemptId !== orchestrationComputeAttemptId(marker)) fail('native_orchestration_budget_attempt_invalid');
                return assertBudgetAttemptRef({ ...(marker.kind === 'local_work' ? { kind: 'local_work', localWorkOrdinal: marker.ordinal } : { providerSendOrdinal: marker.ordinal }),
                    authorityRef: structuredClone(authorityRef), effectId: marker.effectId, attemptId: row.attemptId, reservationId: row.reservationId ?? null });
            });
            return { authorityRef: structuredClone(authorityRef), effectIds: facts.effectIds, budgetAttemptRefs,
                closed: !facts.overrun && facts.effectIds.every(id => rows.some(row => row.orchestration.effectId === id)) && rows.every(row => row.status === 'settled'),
                snapshotDigest: hashNativeDocument({ authorityRef, effectIds: facts.effectIds,
                    modelAttempts: facts.modelAttempts.toSorted((a, b) => a.attemptId.localeCompare(b.attemptId)),
                    localWork: facts.localWork.toSorted((a, b) => a.attemptId.localeCompare(b.attemptId)), overrun: facts.overrun }) };
        });
    }

    /** Historical original-bank observation; never releases or grants execution. */
    async observeChildClosure(handle, input, { tx } = {}) {
        fields(input, ['authorityRef', 'reservationId', 'expectedParentReservationId', 'expectedCeiling'], 'Child budget closure');
        const { authorityRef, reservationId, expectedParentReservationId, expectedCeiling } = input;
        assertBudgetAuthorityRef(authorityRef); assertNativeId(reservationId, 'orchestrationRun');
        if (expectedParentReservationId !== null) assertNativeId(expectedParentReservationId, 'orchestrationRun');
        if (!tx || typeof tx.getResource !== 'function') fail('native_orchestration_budget_transaction_required');
        const engine = authorityRef.domain === 'session' ? this.sessionCore?.runs.repo._engine
            : authorityRef.authority === 'project_task' ? this.projectRepository?.engine : this.rpControl?._engine;
        if (!engine) fail('native_orchestration_budget_unavailable');
        // Join the caller's actual original Engine transaction, rather than
        // accepting an arbitrary object as a snapshot or opening a second read.
        return engine.withTransaction(handle, async active => {
            if (active !== tx) fail('native_orchestration_budget_transaction_required');
            const ledger = await this.#ledger(handle, tx, authorityRef);
            if (!ledger) fail('native_orchestration_child_budget_unavailable');
            if (!ledger.reservations?.some(row => row.reservationId === reservationId)) fail('native_orchestration_child_budget_unavailable');
            const facts = inspectComputeChildClosure({ compute: ledger }, reservationId);
            if (facts.reservation.parentReservationId !== expectedParentReservationId
                || hashNativeDocument(facts.reservation.limits) !== hashNativeDocument(expectedCeiling)) fail('native_orchestration_budget_reservation_mismatch');
            const reservations = [facts.reservation, ...facts.descendantReservations].sort((a, b) => a.reservationId.localeCompare(b.reservationId));
            for (const row of reservations) {
                assertNativeId(row.reservationId, 'orchestrationRun');
                if (row.consumerId !== row.reservationId) fail('native_orchestration_budget_reservation_mismatch');
            }
            const rows = [...facts.modelAttempts.map(row => ({ kind: 'provider_send', row })), ...facts.localWork.map(row => ({ kind: 'local_work', row }))]
                .sort((a, b) => a.row.attemptId.localeCompare(b.row.attemptId));
            const budgetAttemptRefs = rows.map(({ kind, row }) => {
                const marker = row.orchestration;
                if (!marker || marker.kind !== kind || orchestrationComputeAttemptId(marker) !== row.attemptId) fail('native_orchestration_budget_attempt_invalid');
                return assertBudgetAttemptRef({ ...(kind === 'local_work' ? { kind, localWorkOrdinal: marker.ordinal } : { providerSendOrdinal: marker.ordinal }),
                    authorityRef: structuredClone(authorityRef), effectId: marker.effectId, attemptId: row.attemptId, reservationId: row.reservationId });
            });
            const closed = facts.reservation.status === 'released' && !facts.overrun
                && facts.descendantReservations.every(row => row.status === 'released') && rows.every(({ row }) => row.status === 'settled');
            const snapshotDigest = hashNativeDocument({ schemaVersion: 1, kind: 'child_budget_closure', authorityRef,
                reservationId, expectedParentReservationId, expectedCeiling, reservations,
                modelAttempts: facts.modelAttempts.toSorted((a, b) => a.attemptId.localeCompare(b.attemptId)),
                localWork: facts.localWork.toSorted((a, b) => a.attemptId.localeCompare(b.attemptId)), overrun: facts.overrun });
            return { authorityRef: structuredClone(authorityRef), reservationId, parentReservationId: facts.reservation.parentReservationId,
                status: facts.reservation.status, closed, overrun: facts.overrun,
                reservationRefs: reservations.map(row => ({ reservationId: row.reservationId, parentReservationId: row.parentReservationId, status: row.status })),
                budgetAttemptRefs, snapshotDigest };
        });
    }

    /** Pure original-bank proof for a child whose metadata is already durable. */
    async verifyReservation({ handle, tx, root, parent }) {
        const authorityRef = assertBudgetAuthorityRef(root.budgetAuthorityRef);
        if (!root.parentRef || root.parentRef.parentRunId !== parent.runId
            || hashNativeDocument(authorityRef) !== hashNativeDocument(parent.budgetAuthorityRef)) fail('native_orchestration_child_authority_invalid');
        const ledger = await this.#ledger(handle, tx, authorityRef);
        const reservation = ledger?.reservations?.find(row => row.reservationId === root.runId);
        const parentReservationId = parent.parentRef ? parent.runId : null;
        if (!reservation || reservation.status !== 'held' || reservation.consumerId !== root.runId || reservation.parentReservationId !== parentReservationId)
            fail('native_orchestration_child_budget_unavailable');
        if (hashNativeDocument(reservation.limits) !== hashNativeDocument(root.parentRef.budgetCeiling)) fail('native_orchestration_budget_reservation_mismatch');
        return { status: 'held', reservationId: root.runId, authorityRef: structuredClone(authorityRef), parentReservationId };
    }

    /**
     * EffectController hook, called inside the Host transaction. It reads the
     * original bank in the same Engine transaction without taking domain locks
     * and never charges: a missing or foreign record is not an admission.
     */
    async verifyBudgetAttempt({ handle, tx, root, intent, budgetAttemptRef, expectedSend }) {
        const ref = assertBudgetAttemptRef(budgetAttemptRef), authority = ref.authorityRef;
        if (hashNativeDocument(authority) !== hashNativeDocument(root.budgetAuthorityRef)) fail('native_orchestration_budget_authority_mismatch');
        if (ref.effectId !== intent.effectId) fail('native_orchestration_budget_attempt_invalid');
        if (root.parentRef && ref.reservationId !== root.runId) fail('native_orchestration_budget_reservation_mismatch');
        const ledger = await this.#ledger(handle, tx, authority);
        const row = (ref.kind === 'local_work' ? ledger?.localWork : ledger?.attempts)?.find(item => item.attemptId === ref.attemptId);
        if (!row || !ADMITTED.has(row.status) || (row.reservationId ?? null) !== ref.reservationId) fail('native_orchestration_budget_attempt_missing');
        assertAttemptProvenance(ref, row);
        // The immutable Effect describes the logical action. A real send also
        // proves the exact final compiled request admitted by the original bank.
        if (expectedSend !== undefined) {
            fields(expectedSend, ['requestId', 'targetFingerprint', 'inputFingerprint'], 'Expected provider send');
            if (ref.kind === 'local_work' || typeof expectedSend.requestId !== 'string' || !expectedSend.requestId
                || !digest(expectedSend.targetFingerprint) || !digest(expectedSend.inputFingerprint)
                || row.requestId !== expectedSend.requestId || row.targetFingerprint !== expectedSend.targetFingerprint
                || row.inputFingerprint !== expectedSend.inputFingerprint) fail('native_orchestration_budget_send_mismatch');
        }
        return { status: row.status };
    }

    /** Send-bound adapter for the trusted GenerationHost path. The ordinal advances on every real send, retry or fallback. */
    sendBank(handle, { authorityRef, reservationId = null, limits, effectId, firstOrdinal, assertCurrent, quotaProof }) {
        assertBudgetAuthorityRef(authorityRef);
        // A reservation already carries the leaf Route ceiling. Passing that
        // ceiling to bindComputeBudget would tighten the entire original bank
        // and consume the parent's later allowance. Keep the trusted root
        // operation limits distinct; the original reservation enforces its leaf.
        const rootLimits = reservationId === null ? null : assertComputeBudget(structuredClone(limits));
        let ordinal = firstOrdinal;
        let localOrdinal = 0;
        let rpPrefixDigest = null;
        const admitted = new Map(), localIdentities = new Map();
        const bank = {
            authorityRef,
            assertCurrent: async () => {
                await this.assertCurrent(handle, authorityRef);
                if (authorityRef.domain === 'rp_chat') {
                    const context = await this.#rpContext(handle, authorityRef.controlId, authorityRef.source);
                    if (rpPrefixDigest !== null && rpPrefixDigest !== context.prefixDigest) throw new ConflictError('native_generation_revision_conflict');
                    rpPrefixDigest = context.prefixDigest;
                }
                await assertCurrent?.();
            },
            rpContext: () => {
                if (authorityRef.domain !== 'rp_chat') fail('native_orchestration_budget_unavailable');
                return this.#rpContext(handle, authorityRef.controlId, authorityRef.source);
            },
            admit: async ({ requestId, targetFingerprint, inputFingerprint, upperBound, reserve, limits: routeLimits }) => {
                const providerSendOrdinal = ordinal++;
                let result;
                try {
                    result = await this.admitAttempt(handle, { authorityRef, reservationId, effectId, providerSendOrdinal, requestId, targetFingerprint, inputFingerprint, upperBound, limits: rootLimits ?? routeLimits ?? limits, reserve, quotaProof });
                } catch (error) {
                    if (error.code !== 'storage_commit_unknown') throw error;
                    const budgetAttemptRef = { authorityRef: structuredClone(authorityRef), effectId, providerSendOrdinal,
                        attemptId: sendAttemptId(effectId, providerSendOrdinal), reservationId };
                    // Observation is evidence only. Even a found admission cannot
                    // turn an unknown durable ACK into a fresh send permission.
                    let budgetObservation = null;
                    try { budgetObservation = await this.observeAttempt(handle, budgetAttemptRef); } catch { /* Owner loss or missing facts remain unresolved. */ }
                    throw Object.assign(new ConflictError('native_orchestration_budget_reconcile_required'), { budgetAttemptRef, budgetObservation });
                }
                // A replay returns the original fact; it is never a second send permit.
                if (result.replayed) throw new ConflictError('native_orchestration_send_replayed');
                admitted.set(result.budgetAttemptRef.attemptId, result.budgetAttemptRef);
                return result;
            },
            settle: (attemptId, usage) => {
                const ref = admitted.get(attemptId);
                if (!ref) fail('native_generation_attempt_conflict');
                return this.settleAttempt(handle, ref, usage);
            },
            nextLocalWorkAttemptId: () => {
                const current = localOrdinal++, attemptId = localWorkAttemptId(effectId, current);
                localIdentities.set(attemptId, current); return attemptId;
            },
            chargeLocalWork: async (localLimits, attempt) => {
                if (!localIdentities.has(attempt.attemptId)) fail('native_orchestration_budget_attempt_invalid');
                const localWorkOrdinal = localIdentities.get(attempt.attemptId);
                try {
                    return await this.chargeLocalWork(handle, { authorityRef, reservationId, limits: rootLimits ?? localLimits ?? limits, attempt, effectId, localWorkOrdinal });
                } catch (error) {
                    if (error.code === 'native_generation_attempt_conflict') throw new ConflictError('native_orchestration_send_replayed');
                    if (error.code !== 'storage_commit_unknown') throw error;
                    const budgetAttemptRef = { kind: 'local_work', authorityRef: structuredClone(authorityRef), effectId, localWorkOrdinal, attemptId: attempt.attemptId, reservationId };
                    let budgetObservation = null;
                    try { budgetObservation = await this.observeAttempt(handle, budgetAttemptRef); } catch { /* Missing facts remain unresolved; no local retry. */ }
                    throw Object.assign(new ConflictError('native_orchestration_budget_reconcile_required'), { budgetAttemptRef, budgetObservation });
                }
            },
            settleLocalWork: (attemptId, usage) => this.settleLocalWork(handle, authorityRef, attemptId, usage),
            nextOrdinal: () => ordinal,
        };
        sendBanks.set(bank, { budgetPort: this, handle, effectId, authorityDigest: hashNativeDocument(authorityRef) });
        return bank;
    }
}
