import { readRpOutput } from './rp-output-contracts.js';
import { readSessionOutput } from './session-output-contracts.js';
import { readProjectReviewOutput } from './project-review-output-contracts.js';
import { ConflictError, NotFoundError } from '../../storage/errors.js';
import { assertWritable } from '../../storage/read-only-mode.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { createNativeId, assertNativeId } from '../identity.js';
import { cloneNativeDocument, hashNativeDocument, putImmutable, putMutable, withNativeResourceWrites } from '../repositories/common.js';
import { assertCounter, assertDigest, assertObject, assertPlanRef, assertPlanDefinition, assertToken } from '../../../public/shared/native-orchestration-contracts.js';
import { assertComputeAllocation } from '../../../public/shared/native-compute-budget.js';
import { checkedRecord, planDefinitionHash } from './plan-repository.js';
import { readApproval } from './effect-contracts.js';
import { holdsConcurrencySlot, readAttempt } from './controller-common.js';
import { readHandoff } from './handoff-contracts.js';
import { readTaskLocalOutput } from './task-local-output-contracts.js';
import { readHandoffReturn } from './handoff-return-contracts.js';

export const RUN_STATUSES = Object.freeze(['admitted', 'running', 'waiting_approval', 'reconciling', 'blocked', 'completed', 'partial', 'failed', 'cancelled', 'stale']);
const TERMINAL = new Set(['completed', 'partial', 'failed', 'cancelled', 'stale']);
const PROGRESS = ['steps', 'attempts', 'patches', 'replans', 'reviews', 'delegates', 'handoffs', 'edgeVisits', 'loopIterations', 'depth'];
export const TREE_LOGICAL_COUNTERS = Object.freeze(PROGRESS.filter(field => field !== 'depth'));
const limitField = field => 'max' + field[0].toUpperCase() + field.slice(1);
export const initialTreeProgress = (depth, deadlineAt) => ({ ...Object.fromEntries(TREE_LOGICAL_COUNTERS.map(field => [field, 0])), depth, deadlineAt });
const runKey = (handle, runId) => ({ kind: K.orchestrationRun, handle, runId });
const recordKey = (handle, runId, recordType, recordId) => ({ kind: K.orchestrationRecord, handle, runId, recordType, recordId });
const readRunOutput = (tx, handle, root, options) => root.graph.outputContract.kind === 'rp_narration'
    ? root.sourceBinding.sourceAuthority === 'native_session' ? readSessionOutput(tx, handle, root)
        : root.sourceBinding.sourceAuthority === 'rp_chat' ? readRpOutput(tx, handle, root) : null
    : root.graph.outputContract.kind === 'project_review' ? readProjectReviewOutput(tx, handle, root, options)
        : readTaskLocalOutput(tx, handle, root);
export const childBudgetReceiptId = runId => 'oreceipt_' + hashNativeDocument({ kind: 'child_budget_ready', runId }).slice(0, 32);

/** Admission bound from original durable Attempts, never a second scheduler. */
export async function assertRunTreeConcurrency(tx, handle, root, { additionalSlots = 0 } = {}) {
    assertCounter(additionalSlots, 'additionalSlots');
    const members = new Map();
    for (const listed of await tx.listResources({ kind: K.orchestrationRun, handle })) {
        if (hashNativeDocument(listed.doc) !== listed.integrity) throw new TypeError('Corrupt Run tree');
        if (listed.doc.rootRunId !== root.rootRunId) continue;
        assertRunRoot(listed.doc, handle); members.set(listed.doc.runId, listed.doc);
    }
    const ancestors = [root];
    let at = root;
    while (at.parentRef) {
        at = members.get(at.parentRef.parentRunId);
        if (!at || ancestors.some(item => item.runId === at.runId)) throw new TypeError('Invalid Run ancestry');
        ancestors.push(at);
    }
    for (const ancestor of ancestors) {
        let active = 0;
        for (const member of members.values()) {
            let candidate = member, hops = 0;
            while (candidate.runId !== ancestor.runId && candidate.parentRef && hops++ <= members.size) {
                candidate = members.get(candidate.parentRef.parentRunId);
                if (!candidate) throw new TypeError('Missing Run ancestor');
            }
            if (candidate.runId !== ancestor.runId) continue;
            for (const attemptId of member.attemptRefs) if (holdsConcurrencySlot(member, (await readAttempt(tx, handle, member, attemptId)).doc)) active++;
        }
        if (active + additionalSlots > ancestor.limits.maxConcurrency) throw new ConflictError('native_orchestration_tree_concurrency_exhausted');
    }
}

// Original bank observations are recorded separately from the immutable child
// identity. A restored receipt never overrides the current ancestor epochs.
export async function assertChildRunCurrent(tx, handle, root, { requireBudget = true } = {}) {
    const seen = new Set([root.runId]);
    let child = root;
    while (child.parentRef) {
        const ref = child.parentRef;
        if (seen.has(ref.parentRunId)) throw new TypeError('Cyclic Run ancestry');
        seen.add(ref.parentRunId);
        const parent = (await checkedRecord(tx, runKey(handle, ref.parentRunId)))?.doc;
        if (!parent) throw new ConflictError('native_orchestration_parent_stale');
        assertRunRoot(parent, handle);
        const { doc: attempt } = await readAttempt(tx, handle, parent, ref.nodeAttemptId);
        if (parent.cancelRequested || parent.status !== 'running' || parent.epoch !== ref.parentEpoch || attempt.epoch !== parent.epoch
            || attempt.sourceBindingDigest !== root.sourceBinding.bindingDigest
            || (parent.parentRef?.depth ?? 0) + 1 !== ref.depth
            || !['running', 'waiting_effect', 'waiting_approval', 'waiting_child'].includes(attempt.status)
            || parent.rootRunId !== root.rootRunId || parent.sourceBinding.bindingDigest !== root.sourceBinding.bindingDigest
            || hashNativeDocument(parent.budgetAuthorityRef) !== hashNativeDocument(root.budgetAuthorityRef)
            || parent.hostBootId !== root.hostBootId || parent.hostGeneration !== root.hostGeneration) throw new ConflictError('native_orchestration_parent_stale');
        if (attempt.status === 'waiting_child') await readHandoff(tx, handle, parent, attempt, child);
        child = parent;
    }
    if (child.runId !== root.rootRunId) throw new ConflictError('native_orchestration_parent_stale');
    if (root.parentRef && requireBudget) {
        const receipt = (await checkedRecord(tx, recordKey(handle, root.runId, 'receipt', childBudgetReceiptId(root.runId))))?.doc;
        if (!receipt || receipt.receiptKind !== 'child_budget_ready' || receipt.runId !== root.runId || receipt.epoch !== root.epoch
            || receipt.reservationId !== root.runId || receipt.sourceBindingDigest !== root.sourceBinding.bindingDigest
            || receipt.budgetCeilingDigest !== hashNativeDocument(root.parentRef.budgetCeiling)
            || hashNativeDocument(receipt.authorityRef) !== hashNativeDocument(root.budgetAuthorityRef)) throw new ConflictError('native_orchestration_child_budget_unconfirmed');
    }
}

export function assertRunRoot(root, handle) {
    assertObject(root, ['schemaVersion', 'runId', 'ownerRef', 'planRef', 'sourceBinding', 'parentRef', 'rootRunId', 'budgetAuthorityRef', 'hostBootId', 'hostGeneration', 'epoch', 'stateVersion', 'graphRevision', 'eventSeq', 'status', 'graph', 'nodeControl', 'attemptRefs', 'pendingEffectRefs', 'pendingApprovalRefs', 'resultRefs', 'outputClaims', 'progress', 'treeProgress', 'limits', 'retentionPolicyRef', 'cancelRequested', 'createdAt', 'updatedAt'], 'RunRoot');
    if (root.schemaVersion !== 1 || root.ownerRef?.handle !== handle || !RUN_STATUSES.includes(root.status) || typeof root.cancelRequested !== 'boolean') throw new TypeError('Invalid RunRoot identity/status');
    assertObject(root.ownerRef, ['handle'], 'ownerRef');
    assertNativeId(root.runId, 'orchestrationRun'); assertNativeId(root.rootRunId, 'orchestrationRun'); assertPlanRef(root.planRef);
    if (root.parentRef !== null) {
        assertObject(root.parentRef, ['parentRunId', 'nodeAttemptId', 'delegationId', 'returnContract', 'parentEpoch', 'depth', 'inputRefs', 'inputDigest', 'effectiveGrantDigest', 'budgetCeiling', 'logicalCeiling'], 'parentRef');
        assertNativeId(root.parentRef.parentRunId, 'orchestrationRun'); assertNativeId(root.parentRef.nodeAttemptId, 'orchestrationAttempt');
        assertToken(root.parentRef.delegationId, 'delegationId'); assertCounter(root.parentRef.parentEpoch, 'parentEpoch'); assertCounter(root.parentRef.depth, 'depth', 1);
        assertDigest(root.parentRef.inputDigest, 'inputDigest'); assertDigest(root.parentRef.effectiveGrantDigest, 'effectiveGrantDigest');
        assertComputeAllocation(root.parentRef.budgetCeiling);
        assertObject(root.parentRef.logicalCeiling, TREE_LOGICAL_COUNTERS, 'logicalCeiling');
        for (const field of TREE_LOGICAL_COUNTERS) {
            assertCounter(root.parentRef.logicalCeiling[field], 'logicalCeiling.' + field);
            if (root.parentRef.logicalCeiling[field] > root.limits[limitField(field)]) throw new TypeError('Logical grant exceeds immutable Plan limit');
        }
        if (!Array.isArray(root.parentRef.inputRefs) || hashNativeDocument(root.parentRef.inputRefs) !== root.parentRef.inputDigest
            || root.rootRunId === root.runId || root.parentRef.parentRunId === root.runId
            || root.parentRef.returnContract?.kind !== 'result' || hashNativeDocument(root.parentRef.returnContract) !== hashNativeDocument(root.graph.outputContract)
            || root.runId !== 'orun_' + hashNativeDocument({ parentRunId: root.parentRef.parentRunId, parentAttemptId: root.parentRef.nodeAttemptId, delegationId: root.parentRef.delegationId }).slice(0, 32)) throw new TypeError('Invalid child Run identity/inputs');
    } else if (root.rootRunId !== root.runId) throw new TypeError('Root Run must own its root identity');
    for (const field of ['epoch', 'stateVersion', 'graphRevision', 'eventSeq', 'createdAt', 'updatedAt']) assertCounter(root[field], field);
    assertCounter(root.hostGeneration, 'hostGeneration', 1);
    if (typeof root.hostBootId !== 'string' || !root.hostBootId) throw new TypeError('RunRoot hostBootId is missing');
    if (!root.sourceBinding || !root.budgetAuthorityRef || !root.retentionPolicyRef) throw new TypeError('RunRoot original authority references are missing');
    assertDigest(root.sourceBinding.bindingDigest, 'sourceBinding.bindingDigest');
    const binding = Object.fromEntries(Object.entries(root.sourceBinding).filter(([field]) => field !== 'bindingDigest'));
    if (hashNativeDocument(binding) !== root.sourceBinding.bindingDigest) throw new TypeError('SourceBinding digest mismatch');
    for (const field of ['attemptRefs', 'pendingEffectRefs', 'pendingApprovalRefs', 'resultRefs', 'outputClaims']) if (!Array.isArray(root[field])) throw new TypeError('RunRoot.' + field + ' must be an array');
    const claimIds = new Set();
    for (const claim of root.outputClaims) {
        assertObject(claim, ['runId', 'claimId'], 'OutputClaimRef');
        if (claim.runId !== root.runId || typeof claim.claimId !== 'string' || !/^oclaim_[a-f0-9]{32}$/.test(claim.claimId)
            || claimIds.has(claim.claimId)) throw new TypeError('Invalid own-Run OutputClaimRef');
        claimIds.add(claim.claimId);
    }
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
    assertObject(root.treeProgress, [...PROGRESS, 'deadlineAt'], 'treeProgress');
    for (const field of PROGRESS) {
        assertCounter(root.treeProgress[field], 'treeProgress.' + field);
        if (root.treeProgress[field] < root.progress[field] || root.treeProgress[field] > root.limits[limitField(field)]
            || (root.parentRef && field !== 'depth' && root.treeProgress[field] > root.parentRef.logicalCeiling[field])) throw new TypeError('Run tree logical limit exceeded: ' + field);
    }
    assertCounter(root.treeProgress.deadlineAt, 'treeProgress.deadlineAt');
    if (root.treeProgress.deadlineAt > root.progress.deadlineAt) throw new TypeError('Tree deadline cannot exceed its local deadline');
    if (['completed', 'partial'].includes(root.status) && (root.pendingEffectRefs.length || root.pendingApprovalRefs.length || !root.outputClaims.length)) throw new TypeError('Run cannot finish with pending effects/approvals or without an output claim');
    return root;
}

/** Durable Host control metadata. Original domain admission supplies source/budget truth. */
export class RunRepository {
    constructor({ engine, authorize, admit, assertWriter, now = Date.now }) {
        for (const [name, value] of Object.entries({ authorize, admit, assertWriter, now })) if (typeof value !== 'function') throw new TypeError('RunRepository requires ' + name);
        Object.assign(this, { engine, authorize, admit, assertWriter, now });
    }

    async #command(handle, commandId, operation, body, apply, { replayFlag = false, resourceIds = [] } = {}) {
        assertWritable();
        assertNativeId(commandId, 'orchestrationCommand');
        const input = cloneNativeDocument(body);
        // Internal commands have stable logical identities. CAS read versions
        // are guards, not a new action; exact semantic payload stays bound.
        const payloadHash = hashNativeDocument({ operation, body: replayFlag ? { runId: input.runId, operation: input.operation, detail: input.detail } : input });
        const commandKey = { kind: K.orchestrationCommand, handle, commandId };
        const runResourceIds = resourceIds.map(id => assertNativeId(id, 'orchestrationRun'));
        const lineageIds = input.runId ? await this.#lineageIds(handle, input.runId) : [];
        // A source/control scope may already hold its Run ancestry. Every
        // command must acquire those same Run resources before its command ID;
        // otherwise an independent replay can hold command -> wait Run while
        // the existing Run holder needs that command to commit its own facts.
        return withNativeResourceWrites(handle, [...runResourceIds, ...lineageIds], () => withNativeResourceWrites(handle, [commandId], () => this.engine.withTransaction(handle, async tx => {
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
        }, { retryMode: 'known_rollback_only' })));
    }

    async #lineageIds(handle, runId) {
        assertNativeId(runId, 'orchestrationRun');
        return this.engine.withTransaction(handle, async tx => {
            const ids = [], seen = new Set();
            let currentId = runId;
            while (currentId) {
                if (seen.has(currentId)) throw new TypeError('Cyclic Run ancestry');
                seen.add(currentId); ids.push(currentId);
                const record = await checkedRecord(tx, runKey(handle, currentId));
                if (!record) throw new NotFoundError('orchestration_run');
                assertRunRoot(record.doc, handle); currentId = record.doc.parentRef?.parentRunId;
            }
            return ids;
        });
    }

    /** Order same-source metadata control without turning a lock into a grant.
     * The trusted caller supplies the original domain boundary and opens its
     * own fresh Engine control transaction inside operation. Unlike ephemeral
     * consumption, a legitimate control write may change this Run's stamps.
     */
    async withSourceControl(handle, runId, operation, { withAuthority } = {}) {
        if (typeof operation !== 'function' || typeof withAuthority !== 'function')
            throw new TypeError('Source control requires an operation and original authority boundary');
        const lineageIds = await this.#lineageIds(handle, runId);
        return withNativeResourceWrites(handle, lineageIds, () => withAuthority(operation));
    }

    /** Serialize ephemeral body consumption with the original Run command tree. */
    async withConsumption(handle, runId, consume, { withAuthority = operation => operation() } = {}) {
        if (typeof consume !== 'function' || typeof withAuthority !== 'function') throw new TypeError('Run consumption requires a consumer and authority boundary');
        const lineageIds = await this.#lineageIds(handle, runId);
        return withNativeResourceWrites(handle, lineageIds, async () => {
            // Body Ports supply the original Source authority boundary here:
            // Run ancestors -> Runtime -> Session -> Engine. A second read in
            // an already-open SQL snapshot is insufficient.
            const result = await withAuthority(() => this.engine.withTransaction(handle, async tx => {
                const fence = await this.assertWriter(handle, tx);
                await this.authorize({ handle, operation: 'runs.get', body: { runId }, tx });
                const initial = [];
                for (const id of lineageIds) initial.push(await this.#root(tx, handle, id));
                const root = cloneNativeDocument(initial[0].doc);
                if (root.cancelRequested || root.status !== 'running' || root.hostBootId !== fence.hostBootId
                    || root.hostGeneration !== fence.generation) throw new ConflictError('native_orchestration_consumption_stale');
                await assertChildRunCurrent(tx, handle, root);
                const stamps = initial.map(record => record.integrity), denied = Symbol('consumption denied');
                const value = await consume({ tx, root, fence, deny: () => denied });
                const currentFence = await this.assertWriter(handle, tx);
                const current = [];
                for (const id of lineageIds) current.push(await this.#root(tx, handle, id));
                const stale = current.some((record, index) => record.integrity !== stamps[index])
                    || currentFence.hostBootId !== fence.hostBootId || currentFence.generation !== fence.generation;
                // Reentrant, legitimate controller writes share this transaction.
                // Commit their facts before refusing stale body consumption.
                return { denied: stale || value === denied, value: stale || value === denied ? null : value };
            }));
            if (result.denied) throw new ConflictError('native_orchestration_consumption_stale');
            return result.value;
        });
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
                treeProgress: initialTreeProgress(0, timestamp + plan.definition.limits.deadlineMs),
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
            await assertChildRunCurrent(tx, handle, root);
            if (root.cancelRequested || !['admitted', 'running'].includes(root.status) || root.nodeControl[input.nodeId]?.disposition !== 'eligible') throw new ConflictError('native_orchestration_attempt_not_admitted');
            if (root.parentRef && (hashNativeDocument(input.budgetRef) !== hashNativeDocument(root.budgetAuthorityRef)
                || input.effectiveGrantDigest !== root.parentRef.effectiveGrantDigest || hashNativeDocument(input.inputRefs) !== root.parentRef.inputDigest)) throw new ConflictError('native_orchestration_child_authority_invalid');
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
    async control(handle, commandId, body, reduce, { resourceIds = [] } = {}) {
        assertObject(body, ['runId', 'expectedEpoch', 'expectedStateVersion', 'expectedGraphRevision', 'operation', 'detail'], 'control');
        this.#assertGuard(body);
        if (!['graph.patch', 'attempt.reserve', 'attempt.activate', 'attempt.settle', 'result.publish', 'output.publish', 'project.round.finish', 'fanout.freeze', 'effect.prepare', 'effect.ready', 'effect.claim', 'effect.observe', 'approval.request', 'approval.decide', 'join.freeze', 'join.settle', 'loop.advance', 'run.resume', 'run.delegate', 'run.handoff', 'run.returnHandoff', 'run.childBudget'].includes(body.operation)
            || typeof reduce !== 'function') throw new TypeError('Unsupported Host controller operation');
        const timestamp = this.now();
        return this.#command(handle, commandId, 'runs.control.' + body.operation, body, async (tx, input, fence) => {
            const record = await this.#root(tx, handle, input.runId), root = record.doc;
            this.#guard(root, input, fence);
            if (root.parentRef && input.operation !== 'effect.observe') await assertChildRunCurrent(tx, handle, root, { requireBudget: input.operation !== 'run.childBudget' });
            const result = await reduce({ tx, root: cloneNativeDocument(root), plan: cloneNativeDocument(record.planRevision), fence, now: timestamp });
            assertObject(result, ['root', 'eventType', 'reasonCode', 'outcome'], 'controller result');
            const next = cloneNativeDocument(result.root);
            if (input.operation === 'run.returnHandoff') {
                const receipt = await readHandoffReturn(tx, handle, { ...next, eventSeq: root.eventSeq + 1 }, input.detail.childRunId);
                if (!receipt || receipt.decisionSeq !== root.eventSeq + 1) throw new TypeError('Handoff return requires complete facts');
            }
            if (hashNativeDocument(next.outputClaims) !== hashNativeDocument(root.outputClaims) && input.operation !== 'output.publish')
                throw new TypeError('Only output publication may claim output');
            if (hashNativeDocument(next.treeProgress) !== hashNativeDocument(root.treeProgress)) throw new TypeError('Only RunRepository may accumulate treeProgress');
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
        }, { replayFlag: true, resourceIds });
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
        for (const field of ['capabilityCeiling', 'graphChangePolicy', 'outputContract', 'entryNodeIds']) {
            if (hashNativeDocument(record.doc.graph[field]) !== hashNativeDocument(revision.doc.definition[field]))
                throw new TypeError('Run immutable graph contract differs from its Plan: ' + field);
        }
        record.planRevision = revision.doc;
        if (record.doc.outputClaims.length && !await readRunOutput(tx, handle, record.doc)) throw new TypeError('Run output lacks complete facts');
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
        const delta = Object.fromEntries(TREE_LOGICAL_COUNTERS.map(field => [field, next.progress[field] - record.doc.progress[field]]));
        if (Object.values(delta).some(value => !Number.isSafeInteger(value) || value < 0)) throw new TypeError('Logical costs cannot be reset');
        const accumulate = (current, depth, deadlineAt) => ({ ...Object.fromEntries(TREE_LOGICAL_COUNTERS.map(field => [field, current[field] + delta[field]])),
            depth: Math.max(current.depth, depth), deadlineAt: Math.min(current.deadlineAt, deadlineAt) });
        const root = { ...next, treeProgress: accumulate(record.doc.treeProgress, next.progress.depth, next.progress.deadlineAt),
            stateVersion: record.doc.stateVersion + 1, eventSeq: record.doc.eventSeq + 1, updatedAt: timestamp };
        const check = value => {
            for (const field of TREE_LOGICAL_COUNTERS) if (value.treeProgress[field] > value.limits[limitField(field)]
                || value.parentRef && value.treeProgress[field] > value.parentRef.logicalCeiling[field]) throw new ConflictError('native_orchestration_tree_limit_exhausted');
            if (value.treeProgress.depth > value.limits.maxDepth) throw new ConflictError('native_orchestration_tree_limit_exhausted');
            if (Object.values(delta).some(cost => cost > 0) && timestamp >= value.treeProgress.deadlineAt) throw new ConflictError('native_orchestration_tree_limit_exhausted');
        };
        check(root);
        assertRunRoot(root, handle);
        if ((root.outputClaims.length || ['completed', 'partial'].includes(root.status))
            && !await readRunOutput(tx, handle, root, { pendingCommand: true })) throw new TypeError('Run completion requires verified output facts');
        const ancestors = [], seen = new Set([root.runId]);
        let parentId = root.parentRef?.parentRunId;
        while (parentId) {
            if (seen.has(parentId)) throw new TypeError('Cyclic Run ancestry');
            seen.add(parentId);
            const ancestorRecord = await checkedRecord(tx, runKey(handle, parentId));
            if (!ancestorRecord) throw new NotFoundError('orchestration_run');
            const ancestor = cloneNativeDocument(ancestorRecord.doc); assertRunRoot(ancestor, handle);
            const treeProgress = accumulate(ancestor.treeProgress, root.treeProgress.depth, ancestor.progress.deadlineAt);
            if (hashNativeDocument(treeProgress) !== hashNativeDocument(ancestor.treeProgress)) {
                ancestor.treeProgress = treeProgress; ancestor.stateVersion++; ancestor.eventSeq++; ancestor.updatedAt = timestamp;
                check(ancestor); assertRunRoot(ancestor, handle); ancestors.push({ record: ancestorRecord, next: ancestor });
            }
            parentId = ancestor.parentRef?.parentRunId;
        }
        for (const ancestor of ancestors) {
            await putMutable(tx, runKey(handle, ancestor.next.runId), ancestor.next, { expectedIntegrity: ancestor.record.integrity });
            await this.#event(tx, handle, ancestor.next, 'descendant_logical_progress', null, timestamp);
        }
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
