import { ConflictError } from '../../storage/errors.js';
import { hashNativeDocument } from '../repositories/common.js';
import { assertNativeId } from '../identity.js';
import { readRunControl } from '../run-control.js';
import { fields } from '../../../public/shared/native-values.js';

// V3 BudgetPort (interface §8.1/§13): a typed dispatcher onto the three original
// banks. It owns no ledger, price or limit; every decision is the original
// Session RunControl, Project Task or RP RunControl reducer.
const fail = code => { throw Object.assign(new TypeError(code), { code }); };
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const ADMITTED = new Set(['charged', 'unknown', 'settled']);

/** Stable provider sub-send identity (§13.2): never random, one per Effect ordinal. */
export function sendAttemptId(effectId, providerSendOrdinal) {
    assertNativeId(effectId, 'orchestrationEffect');
    if (!Number.isSafeInteger(providerSendOrdinal) || providerSendOrdinal < 0 || providerSendOrdinal > 1023) fail('native_orchestration_send_ordinal_invalid');
    return hashNativeDocument({ effectId, providerSendOrdinal });
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
    fields(ref, ['authorityRef', 'effectId', 'providerSendOrdinal', 'attemptId', 'reservationId'], 'Budget attempt reference');
    assertBudgetAuthorityRef(ref.authorityRef);
    if (ref.attemptId !== sendAttemptId(ref.effectId, ref.providerSendOrdinal)) fail('native_orchestration_budget_attempt_invalid');
    if (ref.reservationId !== null && (typeof ref.reservationId !== 'string' || !ref.reservationId)) fail('native_orchestration_budget_attempt_invalid');
    return ref;
}

export class BudgetPort {
    constructor({ sessionCore, projectAgent, projectRepository, rpControl }) {
        Object.assign(this, { sessionCore, projectAgent, projectRepository, rpControl });
    }

    /** Admission-time authority for one source operation. A source without an original bank is refused. */
    async authorityFor(handle, source) {
        if (source?.domain === 'native_session') {
            if (!this.sessionCore) fail('native_orchestration_budget_unavailable');
            const snapshot = await this.sessionCore.observe(handle, source.sessionId);
            const anchor = { branchId: snapshot.revision.branchId, revisionId: snapshot.revision.revisionId };
            return { authority: 'run_control', domain: 'session', sessionId: source.sessionId, operationId: hashNativeDocument({ lane: 'turn', anchor }) };
        }
        if (source?.domain === 'project') {
            if (!this.projectAgent) fail('native_orchestration_budget_unavailable');
            const { task } = await this.projectAgent.getContext(handle, source.projectId, source.taskId);
            return { authority: 'project_task', projectId: source.projectId, taskId: source.taskId, operationId: this.#projectOperation(source, task) };
        }
        if (source?.domain === 'rp_chat') {
            if (!this.rpControl) fail('native_orchestration_budget_unavailable');
            fields(source, ['domain', 'controlId', 'source'], 'RP budget source');
            const ref = { authority: 'run_control', domain: 'rp_chat', controlId: source.controlId, source: structuredClone(source.source),
                operationId: hashNativeDocument({ controlId: source.controlId, input: source.source.input, purpose: source.source.purpose, outputSlot: source.source.outputSlot }) };
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

    async #project(handle, ref) {
        const { task } = await this.projectAgent.getContext(handle, ref.projectId, ref.taskId);
        if (this.#projectOperation(ref, task) !== ref.operationId) throw new ConflictError('native_generation_revision_conflict');
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

    async admitAttempt(handle, { authorityRef, reservationId = null, effectId, providerSendOrdinal, requestId, targetFingerprint, inputFingerprint, upperBound, limits, reserve }) {
        assertBudgetAuthorityRef(authorityRef);
        const attempt = { attemptId: sendAttemptId(effectId, providerSendOrdinal), requestId, targetFingerprint, estimatedTokens: upperBound, inputFingerprint };
        const options = { ...(reservationId === null ? {} : { reservationId }), ...(reserve ? { reserve } : {}) };
        let result;
        if (authorityRef.domain === 'session') {
            const { snapshot, anchor } = await this.#session(handle, authorityRef);
            result = await this.sessionCore.runs.admitCompute(handle, snapshot, anchor, limits, attempt, options);
        } else if (authorityRef.authority === 'project_task') {
            const task = await this.#project(handle, authorityRef);
            result = await this.projectAgent.admitGeneration(handle, authorityRef.projectId, authorityRef.taskId, task.baseRevision, limits, attempt, task.executionFingerprint, options);
        } else result = await this.rpControl.admitCompute(handle, authorityRef.controlId, authorityRef.source, limits, attempt, options);
        return { budgetAttemptRef: { authorityRef: structuredClone(authorityRef), effectId, providerSendOrdinal, attemptId: attempt.attemptId, reservationId },
            compute: result.compute, replayed: result.replayed, limits: result.limits };
    }

    // Observation/settlement follow the frozen operation identity, not current source.
    async observeAttempt(handle, budgetAttemptRef) {
        const { authorityRef: ref, attemptId } = assertBudgetAttemptRef(budgetAttemptRef);
        const row = ref.domain === 'session' ? (await this.sessionCore.runs.observeCompute(handle, ref.sessionId, ref.operationId, attemptId)).compute
            : ref.authority === 'project_task' ? (await this.projectAgent.observeCompute(handle, ref.projectId, ref.taskId, attemptId)).compute
                : (await this.rpControl.observeCompute(handle, ref.controlId, ref.operationId, attemptId)).compute;
        return structuredClone(row);
    }

    async settleAttempt(handle, budgetAttemptRef, usage) {
        const { authorityRef: ref, attemptId } = assertBudgetAttemptRef(budgetAttemptRef);
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

    async chargeLocalWork(handle, { authorityRef, reservationId = null, limits, attempt }) {
        assertBudgetAuthorityRef(authorityRef);
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

    /**
     * EffectController hook, called inside the Host transaction. It reads the
     * original bank in the same Engine transaction without taking domain locks
     * and never charges: a missing or foreign record is not an admission.
     */
    async verifyBudgetAttempt({ handle, tx, root, intent, budgetAttemptRef }) {
        const ref = assertBudgetAttemptRef(budgetAttemptRef), authority = ref.authorityRef;
        if (hashNativeDocument(authority) !== hashNativeDocument(root.budgetAuthorityRef)) fail('native_orchestration_budget_authority_mismatch');
        if (ref.effectId !== intent.effectId) fail('native_orchestration_budget_attempt_invalid');
        let ledger;
        if (authority.domain === 'session') ledger = (await readRunControl(tx, handle, authority.sessionId))?.operations[authority.operationId]?.compute;
        else if (authority.authority === 'project_task') ledger = (await this.projectRepository.get(handle, authority.projectId, authority.taskId))?.compute;
        else ledger = (await this.rpControl.status(handle, authority.controlId))?.operations[authority.operationId]?.compute;
        const row = ledger?.attempts.find(item => item.attemptId === ref.attemptId);
        if (!row || !ADMITTED.has(row.status) || (row.reservationId ?? null) !== ref.reservationId) fail('native_orchestration_budget_attempt_missing');
        return { status: row.status };
    }

    /** Send-bound adapter for the trusted GenerationHost path. The ordinal advances on every real send, retry or fallback. */
    sendBank(handle, { authorityRef, reservationId = null, limits, effectId, firstOrdinal, assertCurrent }) {
        assertBudgetAuthorityRef(authorityRef);
        let ordinal = firstOrdinal;
        const admitted = new Map();
        return {
            authorityRef,
            assertCurrent: async () => {
                if (authorityRef.domain === 'session') await this.#session(handle, authorityRef);
                else if (authorityRef.authority === 'project_task') await this.#project(handle, authorityRef);
                else await this.rpControl.context(handle, authorityRef.controlId, authorityRef.source);
                await assertCurrent?.();
            },
            rpContext: () => {
                if (authorityRef.domain !== 'rp_chat') fail('native_orchestration_budget_unavailable');
                return this.rpControl.context(handle, authorityRef.controlId, authorityRef.source);
            },
            admit: async ({ requestId, targetFingerprint, inputFingerprint, upperBound, reserve, limits: routeLimits }) => {
                const providerSendOrdinal = ordinal++;
                const result = await this.admitAttempt(handle, { authorityRef, reservationId, effectId, providerSendOrdinal, requestId, targetFingerprint, inputFingerprint, upperBound, limits: routeLimits ?? limits, reserve });
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
            chargeLocalWork: (localLimits, attempt) => this.chargeLocalWork(handle, { authorityRef, reservationId, limits: localLimits ?? limits, attempt }),
            settleLocalWork: (attemptId, usage) => this.settleLocalWork(handle, authorityRef, attemptId, usage),
            nextOrdinal: () => ordinal,
        };
    }
}
