import { ConflictError, NotFoundError } from '../../storage/errors.js';
import { assertWritable } from '../../storage/read-only-mode.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { createNativeId, assertNativeId } from '../identity.js';
import { cloneNativeDocument, hashNativeDocument, putImmutable, putMutable, withNativeResourceWrites } from '../repositories/common.js';
import { assertCounter, assertDigest, assertObject, assertPlanRef, assertPlanDefinition, assertToken } from '../../../public/shared/native-orchestration-contracts.js';
import { checkedRecord, planDefinitionHash } from './plan-repository.js';

export const RUN_STATUSES = Object.freeze(['admitted', 'running', 'waiting_approval', 'reconciling', 'blocked', 'completed', 'partial', 'failed', 'cancelled', 'stale']);
const TERMINAL = new Set(['completed', 'partial', 'failed', 'cancelled', 'stale']);
const PROGRESS = ['steps', 'attempts', 'patches', 'replans', 'reviews', 'delegates', 'handoffs', 'edgeVisits', 'loopIterations', 'depth'];
const runKey = (handle, runId) => ({ kind: K.orchestrationRun, handle, runId });
const recordKey = (handle, runId, recordType, recordId) => ({ kind: K.orchestrationRecord, handle, runId, recordType, recordId });

export function assertRunRoot(root, handle) {
    assertObject(root, ['schemaVersion', 'runId', 'ownerRef', 'planRef', 'sourceBinding', 'parentRef', 'rootRunId', 'budgetAuthorityRef', 'hostBootId', 'epoch', 'stateVersion', 'graphRevision', 'eventSeq', 'status', 'graph', 'attemptRefs', 'pendingEffectRefs', 'pendingApprovalRefs', 'resultRefs', 'outputClaims', 'progress', 'limits', 'retentionPolicyRef', 'cancelRequested', 'createdAt', 'updatedAt'], 'RunRoot');
    if (root.schemaVersion !== 1 || root.ownerRef?.handle !== handle || !RUN_STATUSES.includes(root.status) || typeof root.cancelRequested !== 'boolean') throw new TypeError('Invalid RunRoot identity/status');
    assertObject(root.ownerRef, ['handle'], 'ownerRef');
    assertNativeId(root.runId, 'orchestrationRun'); assertNativeId(root.rootRunId, 'orchestrationRun'); assertPlanRef(root.planRef);
    for (const field of ['epoch', 'stateVersion', 'graphRevision', 'eventSeq', 'createdAt', 'updatedAt']) assertCounter(root[field], field);
    if (typeof root.hostBootId !== 'string' || !root.hostBootId) throw new TypeError('RunRoot hostBootId is missing');
    if (!root.sourceBinding || !root.budgetAuthorityRef || !root.retentionPolicyRef) throw new TypeError('RunRoot original authority references are missing');
    assertDigest(root.sourceBinding.bindingDigest, 'sourceBinding.bindingDigest');
    const binding = Object.fromEntries(Object.entries(root.sourceBinding).filter(([field]) => field !== 'bindingDigest'));
    if (hashNativeDocument(binding) !== root.sourceBinding.bindingDigest) throw new TypeError('SourceBinding digest mismatch');
    for (const field of ['attemptRefs', 'pendingEffectRefs', 'pendingApprovalRefs', 'resultRefs', 'outputClaims']) if (!Array.isArray(root[field])) throw new TypeError('RunRoot.' + field + ' must be an array');
    assertObject(root.progress, [...PROGRESS, 'deadlineAt'], 'progress');
    for (const field of [...PROGRESS, 'deadlineAt']) assertCounter(root.progress[field], 'progress.' + field);
    if (['completed', 'partial'].includes(root.status) && (root.pendingEffectRefs.length || root.pendingApprovalRefs.length || !root.outputClaims.length)) throw new TypeError('Run cannot finish with pending effects/approvals or without an output claim');
    return root;
}

/** Durable Host control metadata. Original domain admission supplies source/budget truth. */
export class RunRepository {
    constructor({ engine, authorize, admit, assertWriter, now = Date.now }) {
        for (const [name, value] of Object.entries({ authorize, admit, assertWriter, now })) if (typeof value !== 'function') throw new TypeError('RunRepository requires ' + name);
        Object.assign(this, { engine, authorize, admit, assertWriter, now });
    }

    async #command(handle, commandId, operation, body, apply) {
        assertWritable();
        assertNativeId(commandId, 'orchestrationCommand');
        const input = cloneNativeDocument(body), payloadHash = hashNativeDocument({ operation, body: input });
        const commandKey = { kind: K.orchestrationCommand, handle, commandId };
        return withNativeResourceWrites(handle, [commandId, ...(input.runId ? [input.runId] : [])], () => this.engine.withTransaction(handle, async tx => {
            assertWritable();
            const fence = await this.assertWriter(handle, tx);
            await this.authorize({ handle, operation, body: input, tx });
            const previous = await checkedRecord(tx, commandKey);
            if (previous) {
                if (previous.doc.payloadHash !== payloadHash) throw new ConflictError('native_orchestration_command_conflict');
                return cloneNativeDocument(previous.doc.outcome);
            }
            const outcome = await apply(tx, input, fence);
            assertWritable();
            await putImmutable(tx, commandKey, { schemaVersion: 1, commandId, operation, target: input.runId ?? outcome.runId, payloadHash, outcome });
            return outcome;
        }, { retryMode: 'known_rollback_only' }));
    }

    async start(handle, commandId, body) {
        assertObject(body, ['planRef', 'sourceRequest', 'retentionPolicyRef'], 'start');
        assertPlanRef(body.planRef);
        const runId = createNativeId('orchestrationRun'), timestamp = this.now();
        return this.#command(handle, commandId, 'runs.start', body, async (tx, input, fence) => {
            const revision = await checkedRecord(tx, { kind: K.orchestrationRevision, handle, planId: input.planRef.planId, planRevisionId: input.planRef.planRevisionId });
            if (!revision) throw new NotFoundError('orchestration_plan_revision');
            const plan = revision.doc;
            if (plan.definitionHash !== input.planRef.definitionHash || planDefinitionHash(plan.definition, plan.dependencyPins) !== plan.definitionHash) throw new ConflictError('native_orchestration_revision_mismatch');
            assertPlanDefinition(plan.definition, plan.dependencyPins);
            // Pure original-authority checks only; no reservation, provider,
            // tool send or cross-domain write in this Engine transaction.
            const admission = cloneNativeDocument(await this.admit({ handle, tx, plan, sourceRequest: input.sourceRequest, retentionPolicyRef: input.retentionPolicyRef }));
            assertObject(admission, ['sourceBinding', 'budgetAuthorityRef'], 'admission');
            const root = { schemaVersion: 1, runId, ownerRef: { handle }, planRef: input.planRef, sourceBinding: admission.sourceBinding,
                parentRef: null, rootRunId: runId, budgetAuthorityRef: admission.budgetAuthorityRef, hostBootId: fence.hostBootId, epoch: fence.generation,
                stateVersion: 0, graphRevision: 0, eventSeq: 0, status: 'admitted', graph: plan.definition,
                attemptRefs: [], pendingEffectRefs: [], pendingApprovalRefs: [], resultRefs: [], outputClaims: [],
                progress: { ...Object.fromEntries(PROGRESS.map(field => [field, 0])), deadlineAt: timestamp + plan.definition.limits.deadlineMs },
                limits: plan.definition.limits, retentionPolicyRef: input.retentionPolicyRef, cancelRequested: false, createdAt: timestamp, updatedAt: timestamp };
            assertRunRoot(root, handle);
            await putMutable(tx, runKey(handle, runId), root, { expectedIntegrity: null });
            await this.#event(tx, handle, root, 'admitted', null, timestamp);
            return root;
        });
    }

    async get(handle, runId) {
        assertNativeId(runId, 'orchestrationRun');
        return this.engine.withTransaction(handle, async tx => {
            await this.authorize({ handle, operation: 'runs.get', body: { runId }, tx });
            return cloneNativeDocument((await this.#root(tx, handle, runId)).doc);
        });
    }

    async cancel(handle, commandId, body) {
        assertObject(body, ['runId', 'expectedEpoch', 'expectedStateVersion', 'expectedGraphRevision', 'reasonCode'], 'cancel');
        this.#assertGuard(body); assertToken(body.reasonCode, 'reasonCode');
        const timestamp = this.now();
        return this.#command(handle, commandId, 'runs.cancel', body, async (tx, input, fence) => {
            const record = await this.#root(tx, handle, input.runId), root = record.doc;
            this.#guard(root, input, fence);
            if (TERMINAL.has(root.status)) return root;
            const next = { ...root, cancelRequested: true, epoch: root.epoch + 1,
                status: root.pendingEffectRefs.length ? 'reconciling' : 'cancelled' };
            return this.#commit(tx, handle, record, next, 'cancel_requested', input.reasonCode, timestamp);
        });
    }

    async recover(handle, commandId, body) {
        assertObject(body, ['runId', 'expectedEpoch', 'expectedStateVersion', 'expectedGraphRevision'], 'recover');
        this.#assertGuard(body);
        const timestamp = this.now();
        return this.#command(handle, commandId, 'runs.recover', body, async (tx, input, fence) => {
            const record = await this.#root(tx, handle, input.runId), root = record.doc;
            this.#guard(root, input, fence, { previousBoot: true });
            if (root.hostBootId === fence.hostBootId || TERMINAL.has(root.status)) return root;
            // Recovered/backup data never automatically dispatches. Prior
            // approvals are unusable because both boot and epoch change.
            const next = { ...root, hostBootId: fence.hostBootId, epoch: Math.max(root.epoch + 1, fence.generation),
                status: root.pendingEffectRefs.length ? 'reconciling' : 'blocked' };
            return this.#commit(tx, handle, record, next, 'host_recovered', 'source_and_receipts_require_revalidation', timestamp);
        });
    }

    async beginAttempt(handle, commandId, body) {
        assertObject(body, ['runId', 'expectedEpoch', 'expectedStateVersion', 'expectedGraphRevision', 'nodeId', 'inputRefs', 'inputDigest', 'effectiveGrantDigest', 'budgetRef'], 'beginAttempt');
        this.#assertGuard(body); assertNativeId(body.nodeId, 'orchestrationNode');
        assertDigest(body.inputDigest, 'inputDigest'); assertDigest(body.effectiveGrantDigest, 'effectiveGrantDigest');
        if (!Array.isArray(body.inputRefs)) throw new TypeError('inputRefs must be an array');
        const attemptId = createNativeId('orchestrationAttempt'), timestamp = this.now();
        return this.#command(handle, commandId, 'runs.beginAttempt', body, async (tx, input, fence) => {
            const record = await this.#root(tx, handle, input.runId), root = record.doc;
            this.#guard(root, input, fence);
            if (root.cancelRequested || !['admitted', 'running'].includes(root.status) || !root.graph.nodes.some(node => node.nodeId === input.nodeId)) throw new ConflictError('native_orchestration_attempt_not_admitted');
            if (root.progress.attempts >= root.limits.maxAttempts || timestamp >= root.progress.deadlineAt) throw new ConflictError('native_orchestration_limit_exhausted');
            // Attempt refs preserve every prior identity; retry/redo cannot
            // overwrite receipts, input snapshots or actual spending.
            let number = 1;
            for (const ref of root.attemptRefs) {
                const attempt = await checkedRecord(tx, recordKey(handle, root.runId, 'attempt', ref));
                if (!attempt) throw new TypeError('RunRoot references a missing attempt');
                if (attempt.doc.nodeId === input.nodeId) {
                    if (!['completed', 'partial', 'failed', 'cancelled', 'stale'].includes(attempt.doc.status)) throw new ConflictError('native_orchestration_attempt_already_active');
                    number++;
                }
            }
            const attempt = { schemaVersion: 1, runId: root.runId, nodeId: input.nodeId, attemptId, attemptNumber: number, epoch: root.epoch, graphRevision: root.graphRevision,
                inputRefs: input.inputRefs, inputDigest: input.inputDigest, sourceBindingDigest: root.sourceBinding.bindingDigest, effectiveGrantDigest: input.effectiveGrantDigest,
                budgetRef: input.budgetRef, status: 'pending', effectRefs: [], resultRefs: [], startedAt: null, endedAt: null, reasonCode: null };
            await putImmutable(tx, recordKey(handle, root.runId, 'attempt', attemptId), attempt);
            const next = { ...root, status: 'running', attemptRefs: [...root.attemptRefs, attemptId], progress: { ...root.progress, attempts: root.progress.attempts + 1 } };
            const updated = await this.#commit(tx, handle, record, next, 'attempt_prepared', null, timestamp);
            return { runId: root.runId, attemptId, epoch: updated.epoch, stateVersion: updated.stateVersion, graphRevision: updated.graphRevision };
        });
    }

    async #root(tx, handle, runId) {
        const record = await checkedRecord(tx, runKey(handle, runId));
        if (!record) throw new NotFoundError('orchestration_run');
        assertRunRoot(record.doc, handle);
        if (record.doc.runId !== runId) throw new TypeError('RunRoot identity mismatch');
        const revision = await checkedRecord(tx, { kind: K.orchestrationRevision, handle, planId: record.doc.planRef.planId, planRevisionId: record.doc.planRef.planRevisionId });
        if (!revision || revision.doc.definitionHash !== record.doc.planRef.definitionHash
            || planDefinitionHash(revision.doc.definition, revision.doc.dependencyPins) !== record.doc.planRef.definitionHash) throw new TypeError('RunRoot Plan dependency mismatch');
        assertPlanDefinition(record.doc.graph, revision.doc.dependencyPins);
        if (hashNativeDocument(record.doc.limits) !== hashNativeDocument(revision.doc.definition.limits)
            || hashNativeDocument(record.doc.graph.limits) !== hashNativeDocument(record.doc.limits)) throw new TypeError('RunRoot limits cannot exceed the immutable Plan');
        return record;
    }

    #assertGuard(input) {
        assertNativeId(input.runId, 'orchestrationRun');
        for (const field of ['expectedEpoch', 'expectedStateVersion', 'expectedGraphRevision']) assertCounter(input[field], field);
    }

    #guard(root, input, fence, { previousBoot = false } = {}) {
        if (root.epoch !== input.expectedEpoch || root.stateVersion !== input.expectedStateVersion || root.graphRevision !== input.expectedGraphRevision
            || (!previousBoot && root.hostBootId !== fence.hostBootId)) throw new ConflictError('native_orchestration_run_conflict');
    }

    async #commit(tx, handle, record, next, type, reasonCode, timestamp) {
        const root = { ...next, stateVersion: record.doc.stateVersion + 1, eventSeq: record.doc.eventSeq + 1, updatedAt: timestamp };
        assertRunRoot(root, handle);
        await putMutable(tx, runKey(handle, root.runId), root, { expectedIntegrity: record.integrity });
        await this.#event(tx, handle, root, type, reasonCode, timestamp);
        return root;
    }

    async #event(tx, handle, root, type, reasonCode, timestamp) {
        await putImmutable(tx, recordKey(handle, root.runId, 'event', 'event:' + root.eventSeq), {
            schemaVersion: 1, runId: root.runId, eventSeq: root.eventSeq, epoch: root.epoch, graphRevision: root.graphRevision, type, reasonCode, createdAt: timestamp,
        });
    }
}
