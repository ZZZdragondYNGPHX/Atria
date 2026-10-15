import { ConflictError, NotFoundError } from '../../storage/errors.js';
import { assertWritable } from '../../storage/read-only-mode.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { createNativeId, assertNativeId } from '../identity.js';
import { cloneNativeDocument, hashNativeDocument, putImmutable, putMutable, withNativeResourceWrites } from '../repositories/common.js';
import { assertCounter, assertDigest, assertObject, assertPlanRef, assertPlanDefinition, assertToken } from '../../../public/shared/native-orchestration-contracts.js';
import { checkedRecord, planDefinitionHash } from './plan-repository.js';
import { readApproval } from './effect-contracts.js';

export const RUN_STATUSES = Object.freeze(['admitted', 'running', 'waiting_approval', 'reconciling', 'blocked', 'completed', 'partial', 'failed', 'cancelled', 'stale']);
const TERMINAL = new Set(['completed', 'partial', 'failed', 'cancelled', 'stale']);
const PROGRESS = ['steps', 'attempts', 'patches', 'replans', 'reviews', 'delegates', 'handoffs', 'edgeVisits', 'loopIterations', 'depth'];
const runKey = (handle, runId) => ({ kind: K.orchestrationRun, handle, runId });
const recordKey = (handle, runId, recordType, recordId) => ({ kind: K.orchestrationRecord, handle, runId, recordType, recordId });

export function assertRunRoot(root, handle) {
    assertObject(root, ['schemaVersion', 'runId', 'ownerRef', 'planRef', 'sourceBinding', 'parentRef', 'rootRunId', 'budgetAuthorityRef', 'hostBootId', 'hostGeneration', 'epoch', 'stateVersion', 'graphRevision', 'eventSeq', 'status', 'graph', 'nodeControl', 'attemptRefs', 'pendingEffectRefs', 'pendingApprovalRefs', 'resultRefs', 'outputClaims', 'progress', 'limits', 'retentionPolicyRef', 'cancelRequested', 'createdAt', 'updatedAt'], 'RunRoot');
    if (root.schemaVersion !== 1 || root.ownerRef?.handle !== handle || !RUN_STATUSES.includes(root.status) || typeof root.cancelRequested !== 'boolean') throw new TypeError('Invalid RunRoot identity/status');
    assertObject(root.ownerRef, ['handle'], 'ownerRef');
    assertNativeId(root.runId, 'orchestrationRun'); assertNativeId(root.rootRunId, 'orchestrationRun'); assertPlanRef(root.planRef);
    for (const field of ['epoch', 'stateVersion', 'graphRevision', 'eventSeq', 'createdAt', 'updatedAt']) assertCounter(root[field], field);
    assertCounter(root.hostGeneration, 'hostGeneration', 1);
    if (typeof root.hostBootId !== 'string' || !root.hostBootId) throw new TypeError('RunRoot hostBootId is missing');
    if (!root.sourceBinding || !root.budgetAuthorityRef || !root.retentionPolicyRef) throw new TypeError('RunRoot original authority references are missing');
    assertDigest(root.sourceBinding.bindingDigest, 'sourceBinding.bindingDigest');
    const binding = Object.fromEntries(Object.entries(root.sourceBinding).filter(([field]) => field !== 'bindingDigest'));
    if (hashNativeDocument(binding) !== root.sourceBinding.bindingDigest) throw new TypeError('SourceBinding digest mismatch');
    for (const field of ['attemptRefs', 'pendingEffectRefs', 'pendingApprovalRefs', 'resultRefs', 'outputClaims']) if (!Array.isArray(root[field])) throw new TypeError('RunRoot.' + field + ' must be an array');
    assertObject(root.progress, [...PROGRESS, 'deadlineAt', 'edgeVisitCounts'], 'progress');
    for (const field of [...PROGRESS, 'deadlineAt']) assertCounter(root.progress[field], 'progress.' + field);
    assertObject(root.nodeControl, root.graph.nodes.map(node => node.nodeId), 'nodeControl');
    for (const [nodeId, control] of Object.entries(root.nodeControl)) {
        assertObject(control, ['disposition', 'priority', 'reasonCode'], 'nodeControl.' + nodeId);
        if (!['eligible', 'blocked', 'cancelled'].includes(control.disposition)) throw new TypeError('Invalid node disposition');
        assertCounter(control.priority, 'node priority');
        if (control.reasonCode !== null) assertToken(control.reasonCode, 'node reasonCode');
    }
    if (!root.progress.edgeVisitCounts || Object.prototype.toString.call(root.progress.edgeVisitCounts) !== '[object Object]') throw new TypeError('Invalid edge visit counts');
    let visits = 0;
    for (const [edgeId, count] of Object.entries(root.progress.edgeVisitCounts)) {
        const edge = root.graph.edges.find(item => item.edgeId === edgeId);
        assertCounter(count, 'edge visits');
        if (!edge || count > edge.maxVisits) throw new TypeError('Invalid/exhausted edge visit counter');
        visits += count;
    }
    if (visits !== root.progress.edgeVisits || visits > root.limits.maxEdgeVisits) throw new TypeError('Invalid total edge visits');
    for (const field of PROGRESS) {
        const limit = root.limits['max' + field[0].toUpperCase() + field.slice(1)];
        if (!Number.isSafeInteger(limit) || root.progress[field] > limit) throw new TypeError('Run progress exceeds ' + field + ' limit');
    }
    if (['completed', 'partial'].includes(root.status) && (root.pendingEffectRefs.length || root.pendingApprovalRefs.length || !root.outputClaims.length)) throw new TypeError('Run cannot finish with pending effects/approvals or without an output claim');
    return root;
}

/** Durable Host control metadata. Original domain admission supplies source/budget truth. */
export class RunRepository {
    constructor({ engine, authorize, admit, assertWriter, now = Date.now }) {
        for (const [name, value] of Object.entries({ authorize, admit, assertWriter, now })) if (typeof value !== 'function') throw new TypeError('RunRepository requires ' + name);
        Object.assign(this, { engine, authorize, admit, assertWriter, now });
    }

    async #command(handle, commandId, operation, body, apply, { replayFlag = false } = {}) {
        assertWritable();
        assertNativeId(commandId, 'orchestrationCommand');
        const input = cloneNativeDocument(body);
        // Internal commands have stable logical identities. CAS read versions
        // are guards, not a new action; exact semantic payload stays bound.
        const payloadHash = hashNativeDocument({ operation, body: replayFlag ? { runId: input.runId, operation: input.operation, detail: input.detail } : input });
        const commandKey = { kind: K.orchestrationCommand, handle, commandId };
        return withNativeResourceWrites(handle, [commandId, ...(input.runId ? [input.runId] : [])], () => this.engine.withTransaction(handle, async tx => {
            assertWritable();
            const fence = await this.assertWriter(handle, tx);
            await this.authorize({ handle, operation, body: input, tx });
            const previous = await checkedRecord(tx, commandKey);
            if (previous) {
                if (previous.doc.payloadHash !== payloadHash) throw new ConflictError('native_orchestration_command_conflict');
                const outcome = cloneNativeDocument(previous.doc.outcome);
                return replayFlag ? { outcome, replayed: true } : outcome;
            }
            const outcome = await apply(tx, input, fence);
            assertWritable();
            await putImmutable(tx, commandKey, { schemaVersion: 1, commandId, operation, target: input.runId ?? outcome.runId, payloadHash, outcome });
            return replayFlag ? { outcome, replayed: false } : outcome;
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
                parentRef: null, rootRunId: runId, budgetAuthorityRef: admission.budgetAuthorityRef, hostBootId: fence.hostBootId, hostGeneration: fence.generation, epoch: 0,
                stateVersion: 0, graphRevision: 0, eventSeq: 0, status: 'admitted', graph: plan.definition,
                nodeControl: Object.fromEntries(plan.definition.nodes.map(node => [node.nodeId, { disposition: 'eligible', priority: 0, reasonCode: null }])),
                attemptRefs: [], pendingEffectRefs: [], pendingApprovalRefs: [], resultRefs: [], outputClaims: [],
                progress: { ...Object.fromEntries(PROGRESS.map(field => [field, 0])), edgeVisitCounts: {}, deadlineAt: timestamp + plan.definition.limits.deadlineMs },
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
                pendingApprovalRefs: await this.#invalidateApprovals(tx, handle, root), status: root.pendingEffectRefs.length ? 'reconciling' : 'cancelled' };
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
            if (root.hostBootId === fence.hostBootId && root.hostGeneration === fence.generation) return root;
            // Recovered/backup data never automatically dispatches. Prior
            // approvals are unusable because both boot and epoch change.
            const next = { ...root, hostBootId: fence.hostBootId, hostGeneration: fence.generation, epoch: root.epoch + 1,
                pendingApprovalRefs: await this.#invalidateApprovals(tx, handle, root),
                status: TERMINAL.has(root.status) ? root.status : root.pendingEffectRefs.length ? 'reconciling' : 'blocked' };
            return this.#commit(tx, handle, record, next, 'host_recovered', 'source_and_receipts_require_revalidation', timestamp);
        });
    }

    async beginAttempt(handle, commandId, body) {
        assertObject(body, ['runId', 'expectedEpoch', 'expectedStateVersion', 'expectedGraphRevision', 'nodeId', 'inputRefs', 'inputDigest', 'effectiveGrantDigest', 'budgetRef'], 'beginAttempt');
        this.#assertGuard(body); assertNativeId(body.nodeId, 'orchestrationNode');
        assertDigest(body.inputDigest, 'inputDigest'); assertDigest(body.effectiveGrantDigest, 'effectiveGrantDigest');
        if (!Array.isArray(body.inputRefs) || hashNativeDocument(body.inputRefs) !== body.inputDigest) throw new TypeError('inputDigest must bind the actual inputRefs');
        if (!body.budgetRef || Object.prototype.toString.call(body.budgetRef) !== '[object Object]') throw new TypeError('Original budget reference is required');
        const attemptId = createNativeId('orchestrationAttempt'), timestamp = this.now();
        return this.#command(handle, commandId, 'runs.beginAttempt', body, async (tx, input, fence) => {
            const record = await this.#root(tx, handle, input.runId), root = record.doc;
            this.#guard(root, input, fence);
            if (root.cancelRequested || !['admitted', 'running'].includes(root.status) || root.nodeControl[input.nodeId]?.disposition !== 'eligible') throw new ConflictError('native_orchestration_attempt_not_admitted');
            if (root.progress.attempts >= root.limits.maxAttempts || timestamp >= root.progress.deadlineAt) throw new ConflictError('native_orchestration_limit_exhausted');
            // Attempt refs preserve every prior identity; retry/redo cannot
            // overwrite receipts, input snapshots or actual spending.
            for (const ref of root.attemptRefs) {
                const attempt = await checkedRecord(tx, recordKey(handle, root.runId, 'attempt', ref));
                if (!attempt) throw new TypeError('RunRoot references a missing attempt');
                if (attempt.doc.nodeId === input.nodeId) {
                    if (!['completed', 'partial', 'failed', 'cancelled', 'stale'].includes(attempt.doc.status)) throw new ConflictError('native_orchestration_attempt_already_active');
                    // Retry/redo/loop must use its guarded controller. A new
                    // generic command ID cannot bypass visits/review counters.
                    throw new ConflictError('native_orchestration_retry_requires_controller');
                }
            }
            const attempt = { schemaVersion: 1, runId: root.runId, nodeId: input.nodeId, attemptId, attemptNumber: 1, epoch: root.epoch, graphRevision: root.graphRevision,
                inputState: 'prepared', reservationRef: null,
                inputRefs: input.inputRefs, inputDigest: input.inputDigest, sourceBindingDigest: root.sourceBinding.bindingDigest, effectiveGrantDigest: input.effectiveGrantDigest,
                budgetRef: input.budgetRef, status: 'pending', effectRefs: [], resultRefs: [], startedAt: null, endedAt: null, reasonCode: null };
            await putImmutable(tx, recordKey(handle, root.runId, 'attempt', attemptId), attempt);
            const next = { ...root, status: 'running', attemptRefs: [...root.attemptRefs, attemptId], progress: { ...root.progress, attempts: root.progress.attempts + 1 } };
            const updated = await this.#commit(tx, handle, record, next, 'attempt_prepared', null, timestamp);
            return { runId: root.runId, attemptId, epoch: updated.epoch, stateVersion: updated.stateVersion, graphRevision: updated.graphRevision };
        });
    }

    /** Internal Host controller transaction, never an HTTP/plugin method dispatcher. */
    async control(handle, commandId, body, reduce) {
        assertObject(body, ['runId', 'expectedEpoch', 'expectedStateVersion', 'expectedGraphRevision', 'operation', 'detail'], 'control');
        this.#assertGuard(body);
        if (!['graph.patch', 'attempt.reserve', 'attempt.activate', 'attempt.settle', 'effect.prepare', 'effect.ready', 'effect.claim', 'effect.observe', 'approval.request', 'approval.decide', 'join.freeze', 'join.settle', 'loop.advance', 'run.resume'].includes(body.operation)
            || typeof reduce !== 'function') throw new TypeError('Unsupported Host controller operation');
        const timestamp = this.now();
        return this.#command(handle, commandId, 'runs.control.' + body.operation, body, async (tx, input, fence) => {
            const record = await this.#root(tx, handle, input.runId), root = record.doc;
            this.#guard(root, input, fence);
            const result = await reduce({ tx, root: cloneNativeDocument(root), plan: cloneNativeDocument(record.planRevision), fence, now: timestamp });
            assertObject(result, ['root', 'eventType', 'reasonCode', 'outcome'], 'controller result');
            const next = cloneNativeDocument(result.root);
            for (const field of ['runId', 'ownerRef', 'planRef', 'sourceBinding', 'parentRef', 'rootRunId', 'budgetAuthorityRef', 'hostBootId', 'hostGeneration', 'epoch', 'limits', 'retentionPolicyRef', 'createdAt']) {
                if (hashNativeDocument(next[field]) !== hashNativeDocument(root[field])) throw new TypeError('Controller cannot rewrite Run identity/authority: ' + field);
            }
            if (next.cancelRequested !== root.cancelRequested || (TERMINAL.has(root.status) && input.operation !== 'effect.observe')) throw new ConflictError('native_orchestration_run_not_mutable');
            if (TERMINAL.has(root.status) && (!['reconciling', 'blocked', root.status].includes(next.status)
                || hashNativeDocument(next.outputClaims) !== hashNativeDocument(root.outputClaims)
                || hashNativeDocument(next.resultRefs) !== hashNativeDocument(root.resultRefs))) throw new TypeError('Late observations cannot replace published output/results');
            for (const field of PROGRESS) if (next.progress[field] < root.progress[field]) throw new TypeError('Controller cannot reset progress');
            if (next.progress.deadlineAt > root.progress.deadlineAt) throw new TypeError('Controller cannot extend the original deadline');
            for (const [edgeId, count] of Object.entries(root.progress.edgeVisitCounts)) if ((next.progress.edgeVisitCounts[edgeId] ?? 0) < count) throw new TypeError('Controller cannot reset edge visits');
            assertPlanDefinition(next.graph, record.planRevision.dependencyPins);
            for (const field of ['capabilityCeiling', 'graphChangePolicy', 'outputContract', 'limits', 'entryNodeIds']) {
                if (hashNativeDocument(next.graph[field]) !== hashNativeDocument(record.planRevision.definition[field])) throw new TypeError('Controller cannot raise/change Plan graph authority: ' + field);
            }
            if (input.operation === 'graph.patch') {
                if (![root.graphRevision, root.graphRevision + 1].includes(next.graphRevision)) throw new TypeError('Graph revision must advance once per accepted patch');
            } else if (next.graphRevision !== root.graphRevision || hashNativeDocument(next.graph) !== hashNativeDocument(root.graph)) throw new TypeError('Only GraphPatch can change the task graph');
            assertToken(result.eventType, 'eventType');
            if (result.reasonCode !== null) assertToken(result.reasonCode, 'reasonCode');
            const updated = await this.#commit(tx, handle, record, next, result.eventType, result.reasonCode, timestamp);
            return { runId: root.runId, ...cloneNativeDocument(result.outcome), versions: { epoch: updated.epoch, stateVersion: updated.stateVersion, graphRevision: updated.graphRevision } };
        }, { replayFlag: true });
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
        record.planRevision = revision.doc;
        return record;
    }

    async #invalidateApprovals(tx, handle, root) {
        for (const approvalId of root.pendingApprovalRefs) {
            const record = await readApproval(tx, handle, root, approvalId);
            if (['pending', 'approved'].includes(record.doc.status)) {
                await putMutable(tx, recordKey(handle, root.runId, 'approval', approvalId), { ...record.doc, status: 'invalidated' }, { expectedIntegrity: record.integrity });
            }
        }
        return [];
    }

    #assertGuard(input) {
        assertNativeId(input.runId, 'orchestrationRun');
        for (const field of ['expectedEpoch', 'expectedStateVersion', 'expectedGraphRevision']) assertCounter(input[field], field);
    }

    #guard(root, input, fence, { previousBoot = false } = {}) {
        if (root.epoch !== input.expectedEpoch || root.stateVersion !== input.expectedStateVersion || root.graphRevision !== input.expectedGraphRevision
            || (!previousBoot && (root.hostBootId !== fence.hostBootId || root.hostGeneration !== fence.generation))) throw new ConflictError('native_orchestration_run_conflict');
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
