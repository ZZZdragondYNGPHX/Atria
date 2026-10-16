import { ConflictError } from '../../storage/errors.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { assertNativeId } from '../identity.js';
import { cloneNativeDocument, hashNativeDocument, putImmutable, putMutable } from '../repositories/common.js';
import { assertObject, assertToken, assertPlanRef, assertPlanDefinition, assertDigest } from '../../../public/shared/native-orchestration-contracts.js';
import { assertComputeAllocation } from '../../../public/shared/native-compute-budget.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { controlCommandId, controlRecordKey, holdsConcurrencySlot, readAttempt } from './controller-common.js';
import { assertRunRoot, childBudgetReceiptId, initialTreeProgress, TREE_LOGICAL_COUNTERS } from './run-repository.js';
import { handoffReceiptId } from './handoff-contracts.js';

const fail = code => { throw new ConflictError(code); };
const terminal = new Set(['completed', 'partial', 'failed', 'cancelled', 'stale']);
const key = (handle, runId) => ({ kind: K.orchestrationRun, handle, runId });
export const delegatedRunId = (parentRunId, parentAttemptId, delegationId) => 'orun_' + hashNativeDocument({ parentRunId, parentAttemptId, delegationId }).slice(0, 32);

/** Durable child identity first, original bank reservation/observation afterward. */
export class DelegateController {
    constructor({ runs, authorizeDelegation, verifyReservation }) {
        if (!runs || typeof authorizeDelegation !== 'function' || typeof verifyReservation !== 'function') throw new TypeError('Delegation requires original scope and reservation authorities');
        Object.assign(this, { runs, authorizeDelegation, verifyReservation });
    }

    async #scope(args, grantDigest) {
        const decision = await this.authorizeDelegation(args);
        if (decision?.allowed !== true || decision.effectiveGrantDigest !== grantDigest
            || decision.parentGrantDigest !== args.parentAttempt.effectiveGrantDigest
            || decision.budgetCeilingDigest !== hashNativeDocument(args.budgetCeiling)
            || decision.sourceBindingDigest !== args.parent.sourceBinding.bindingDigest) fail('native_orchestration_delegation_denied');
    }

    async #allowedPlan(handle, tx, parent, node, childPlanRef, parentPlan) {
        const blueprint = parentPlan ?? await readPlanRevision(tx, handle, parent.planRef);
        const allowed = blueprint.dependencyPins.filter(pin => pin.port === 'plan' && node.policy.allowedPlanPinIds.includes(pin.pinId)
            && node.dependencyPinIds.includes(pin.pinId) && hashNativeDocument(pin.resourceRef) === hashNativeDocument(childPlanRef));
        if (!allowed.length) fail('native_orchestration_child_plan_not_allowed');
        const child = await readPlanRevision(tx, handle, childPlanRef);
        if (!allowed.some(pin => pin.integrity === hashNativeDocument(child))) fail('native_orchestration_child_plan_pin_stale');
        return child;
    }

    async delegate(handle, input) {
        return this.#delegate(handle, input, false);
    }

    async handoff(handle, input) {
        return this.#delegate(handle, input, true);
    }

    async #delegate(handle, input, handoff) {
        assertObject(input, ['runId', 'expectedEpoch', 'expectedStateVersion', 'expectedGraphRevision', 'parentAttemptId', 'delegationId', 'childPlanRef', 'inputRefs', 'inputDigest', 'effectiveGrantDigest', 'returnContract', 'budgetCeiling'], 'delegate');
        const { parentAttemptId, delegationId, childPlanRef, inputRefs, inputDigest, effectiveGrantDigest, returnContract, budgetCeiling, ...guard } = cloneNativeDocument(input);
        assertNativeId(parentAttemptId, 'orchestrationAttempt'); assertToken(delegationId, 'delegationId'); assertPlanRef(childPlanRef);
        assertDigest(inputDigest, 'inputDigest'); assertDigest(effectiveGrantDigest, 'effectiveGrantDigest');
        if (!Array.isArray(inputRefs) || hashNativeDocument(inputRefs) !== inputDigest) throw new TypeError('Delegation inputs require their exact digest');
        // The original bank's validator is also the grant descriptor validator;
        // this is an approved cap, never another balance or allocation reducer.
        assertComputeAllocation(budgetCeiling);
        const before = await this.runs.get(handle, guard.runId), childRunId = delegatedRunId(guard.runId, parentAttemptId, delegationId);
        const ancestorIds = [], seen = new Set([before.runId]);
        let observed = before;
        while (observed.parentRef) {
            if (seen.has(observed.parentRef.parentRunId)) throw new TypeError('Cyclic Run ancestry');
            observed = await this.runs.get(handle, observed.parentRef.parentRunId);
            seen.add(observed.runId); ancestorIds.push(observed.runId);
        }
        const detail = { parentAttemptId, delegationId, childPlanRef, inputRefs, inputDigest, effectiveGrantDigest, returnContract, budgetCeiling };
        const operation = handoff ? 'run.handoff' : 'run.delegate';
        return this.runs.control(handle, controlCommandId(operation, childRunId), { ...guard, operation, detail }, async ({ tx, root: parent, plan, fence, now }) => {
            const attemptRecord = await readAttempt(tx, handle, parent, parentAttemptId), parentAttempt = attemptRecord.doc;
            const node = parent.graph.nodes.find(item => item.nodeId === parentAttempt.nodeId);
            if (parent.cancelRequested || parent.status !== 'running' || parentAttempt.status !== 'running' || parentAttempt.epoch !== parent.epoch
                || parentAttempt.sourceBindingDigest !== parent.sourceBinding.bindingDigest || !node.capabilities.includes('agent.delegate')
                || !['agent', 'router', 'planner', 'judge', 'review'].includes(node.kind)
                || hashNativeDocument(parentAttempt.budgetRef) !== hashNativeDocument(parent.budgetAuthorityRef)) fail('native_orchestration_delegation_not_admitted');
            // This first handoff profile yields an effect-free parent. A late
            // Effect observation must never reactivate a suspended producer.
            if (handoff && (parentAttempt.effectRefs.length || parentAttempt.resultRefs.length)) fail('native_orchestration_handoff_not_admitted');
            const revision = await this.#allowedPlan(handle, tx, parent, node, childPlanRef, plan);
            assertPlanDefinition(revision.definition, revision.dependencyPins);
            const definition = revision.definition;
            if (definition.outputContract.kind !== 'result' || hashNativeDocument(returnContract) !== hashNativeDocument(definition.outputContract)
                || definition.capabilityCeiling.some(capability => !parent.graph.capabilityCeiling.includes(capability) || !node.capabilities.includes(capability))
                || Object.keys(definition.limits).some(field => definition.limits[field] > parent.limits[field])) fail('native_orchestration_child_authority_invalid');
            const ancestorRecords = [];
            for (const ancestorId of ancestorIds) {
                const record = await checkedRecord(tx, key(handle, ancestorId));
                if (!record) fail('native_orchestration_parent_stale');
                assertRunRoot(record.doc, handle); ancestorRecords.push(record);
            }
            const ancestors = [parent, ...ancestorRecords.map(record => record.doc)];
            const tree = ancestors.at(-1);
            if (tree.runId !== parent.rootRunId) fail('native_orchestration_parent_stale');
            const depth = (parent.parentRef?.depth ?? 0) + 1;
            const members = new Map();
            for (const record of await tx.listResources({ kind: K.orchestrationRun, handle })) {
                if (hashNativeDocument(record.doc) !== record.integrity) throw new TypeError('Corrupt delegation tree');
                if (record.doc.rootRunId !== tree.runId) continue;
                members.set(record.doc.runId, record.doc);
            }
            for (const ancestor of ancestors) {
                let live = 0;
                for (const member of members.values()) {
                    if (terminal.has(member.status)) continue;
                    let at = member, hops = 0;
                    while (at.runId !== ancestor.runId && at.parentRef && hops++ <= members.size) {
                        at = members.get(at.parentRef.parentRunId);
                        if (!at) throw new TypeError('Missing delegation ancestor');
                    }
                    if (hops > members.size) throw new TypeError('Cyclic delegation ancestry');
                    if (at.runId !== ancestor.runId) continue;
                    if (handoff) {
                        if (member.status === 'admitted') live++;
                        for (const id of member.attemptRefs) {
                            const attempt = (await readAttempt(tx, handle, member, id)).doc;
                            if (id !== parentAttemptId && holdsConcurrencySlot(member, attempt)) live++;
                        }
                    } else if (member.runId !== ancestor.runId) live++;
                }
                if (!handoff) for (const attemptId of ancestor.attemptRefs) if (holdsConcurrencySlot(ancestor, (await readAttempt(tx, handle, ancestor, attemptId)).doc)) live++;
                if (ancestor.cancelRequested || ancestor.hostBootId !== fence.hostBootId || ancestor.hostGeneration !== fence.generation
                    || ancestor.sourceBinding.bindingDigest !== parent.sourceBinding.bindingDigest || hashNativeDocument(ancestor.budgetAuthorityRef) !== hashNativeDocument(parent.budgetAuthorityRef)
                    || ancestor.treeProgress.delegates >= Math.min(ancestor.limits.maxDelegates, ancestor.parentRef?.logicalCeiling.delegates ?? Infinity)
                    || (handoff && (ancestor.treeProgress.handoffs >= Math.min(ancestor.limits.maxHandoffs, ancestor.parentRef?.logicalCeiling.handoffs ?? Infinity)
                        || ancestor.treeProgress.steps >= Math.min(ancestor.limits.maxSteps, ancestor.parentRef?.logicalCeiling.steps ?? Infinity)))
                    || depth > ancestor.limits.maxDepth || depth > definition.limits.maxDepth
                    || live >= ancestor.limits.maxConcurrency || now >= ancestor.progress.deadlineAt) fail('native_orchestration_delegation_limit_exhausted');
            }
            const logicalCeiling = Object.fromEntries(TREE_LOGICAL_COUNTERS.map(field => {
                const limit = 'max' + field[0].toUpperCase() + field.slice(1);
                return [field, Math.min(definition.limits[limit], ...ancestors.map(ancestor =>
                    Math.min(ancestor.limits[limit], ancestor.parentRef?.logicalCeiling[field] ?? Infinity) - ancestor.treeProgress[field]
                    - (field === 'delegates' || handoff && ['handoffs', 'steps'].includes(field) ? 1 : 0)))];
            }));
            if (Object.values(logicalCeiling).some(value => value < 0) || logicalCeiling.attempts < 1 || logicalCeiling.steps < 1) fail('native_orchestration_tree_limit_exhausted');
            await this.#scope({ handle, tx, parent, parentAttempt, childPlan: revision, inputRefs, effectiveGrantDigest, budgetCeiling,
                phase: handoff ? 'handoff' : 'delegate' }, effectiveGrantDigest);
            const parentRef = { parentRunId: parent.runId, nodeAttemptId: parentAttemptId, delegationId, returnContract, parentEpoch: parent.epoch, depth, inputRefs, inputDigest, effectiveGrantDigest, budgetCeiling, logicalCeiling };
            const child = { ...cloneNativeDocument(parent), runId: childRunId, planRef: childPlanRef, parentRef, rootRunId: tree.runId,
                epoch: 0, stateVersion: 0, graphRevision: 0, eventSeq: 0, status: 'admitted', graph: definition,
                nodeControl: Object.fromEntries(definition.nodes.map(item => [item.nodeId, { disposition: 'eligible', priority: 0, reasonCode: null }])),
                attemptRefs: [], pendingEffectRefs: [], pendingApprovalRefs: [], resultRefs: [], outputClaims: [],
                progress: { ...Object.fromEntries(Object.keys(parent.progress).filter(field => !['deadlineAt', 'edgeVisitCounts'].includes(field)).map(field => [field, 0])),
                    depth, edgeVisitCounts: {}, deadlineAt: Math.min(parent.progress.deadlineAt, tree.progress.deadlineAt, now + definition.limits.deadlineMs) },
                treeProgress: initialTreeProgress(depth, Math.min(parent.progress.deadlineAt, tree.progress.deadlineAt, now + definition.limits.deadlineMs)),
                limits: definition.limits, cancelRequested: false, createdAt: now, updatedAt: now };
            assertRunRoot(child, handle);
            const receiptId = 'oreceipt_' + hashNativeDocument({ kind: 'delegation', childRunId }).slice(0, 32);
            const receipt = { schemaVersion: 1, receiptKind: 'delegation', receiptId, runId: parent.runId, childRunId, parentRef, budgetCeiling,
                sourceBindingDigest: parent.sourceBinding.bindingDigest, authorityRef: parent.budgetAuthorityRef, decisionSeq: parent.eventSeq + 1, createdAt: now };
            await putMutable(tx, key(handle, childRunId), child, { expectedIntegrity: null });
            await putImmutable(tx, controlRecordKey(handle, parent.runId, 'receipt', receiptId), receipt);
            let handoffReceipt = null;
            if (handoff) {
                const identity = { parentRunId: parent.runId, parentAttemptId, childRunId, parentEpoch: parent.epoch };
                handoffReceipt = { schemaVersion: 1, receiptKind: 'handoff', receiptId: handoffReceiptId(childRunId), runId: parent.runId, childRunId,
                    parentAttemptId, parentEpoch: parent.epoch, hostBootId: parent.hostBootId, hostGeneration: parent.hostGeneration,
                    sourceBindingDigest: parent.sourceBinding.bindingDigest, parentGrantDigest: parentAttempt.effectiveGrantDigest,
                    childGrantDigest: effectiveGrantDigest, inputDigest, childPlanRef,
                    budgetCeilingDigest: hashNativeDocument(budgetCeiling), returnContractDigest: hashNativeDocument(returnContract), entryNodeIds: definition.entryNodeIds,
                    returnNodeId: parentAttempt.nodeId, terminalPolicy: 'verified_result_or_failure', controlToken: hashNativeDocument(identity),
                    decisionSeq: parent.eventSeq + 1, createdAt: now };
                await putImmutable(tx, controlRecordKey(handle, parent.runId, 'receipt', handoffReceipt.receiptId), handoffReceipt);
                await putMutable(tx, controlRecordKey(handle, parent.runId, 'attempt', parentAttemptId),
                    { ...parentAttempt, status: 'waiting_child' }, { expectedIntegrity: attemptRecord.integrity });
                parent.progress.handoffs++; parent.progress.steps++;
            }
            await putImmutable(tx, controlRecordKey(handle, childRunId, 'event', 'event:0'), {
                schemaVersion: 1, runId: childRunId, eventSeq: 0, epoch: 0, graphRevision: 0, type: 'child_admitted_unfunded', reasonCode: 'original_reservation_unconfirmed', createdAt: now });
            parent.progress.delegates++; parent.progress.depth = Math.max(parent.progress.depth, depth);
            return { root: parent, eventType: handoff ? 'control_handed_off' : 'child_delegated', reasonCode: null,
                outcome: { childRunId, delegationReceipt: receipt, ...(handoff ? { handoffReceipt } : {}) } };
        }, { resourceIds: [...ancestorIds, childRunId] });
    }

    async confirmBudget(handle, input) {
        assertObject(input, ['runId', 'expectedEpoch', 'expectedStateVersion', 'expectedGraphRevision'], 'confirmChildBudget');
        const before = await this.runs.get(handle, input.runId);
        if (!before.parentRef) fail('native_orchestration_child_authority_invalid');
        const receiptId = childBudgetReceiptId(before.runId);
        return this.runs.control(handle, controlCommandId('run.childBudget', receiptId), { ...input, operation: 'run.childBudget', detail: {} }, async ({ tx, root, now }) => {
            if (root.cancelRequested || root.status !== 'admitted') fail('native_orchestration_child_authority_invalid');
            const parent = (await checkedRecord(tx, key(handle, root.parentRef.parentRunId)))?.doc;
            const { doc: parentAttempt } = await readAttempt(tx, handle, parent, root.parentRef.nodeAttemptId);
            const node = parent.graph.nodes.find(item => item.nodeId === parentAttempt.nodeId);
            const childPlan = await this.#allowedPlan(handle, tx, parent, node, root.planRef);
            await this.#scope({ handle, tx, parent, parentAttempt, childPlan, inputRefs: root.parentRef.inputRefs,
                effectiveGrantDigest: root.parentRef.effectiveGrantDigest, budgetCeiling: root.parentRef.budgetCeiling, phase: 'confirm_budget' }, root.parentRef.effectiveGrantDigest);
            // This callback may only observe the original bank. A lost reserve
            // ACK never creates another root bank or another child identity.
            const observation = await this.verifyReservation({ handle, tx, root, parent });
            const parentReservationId = parent.parentRef ? parent.runId : null;
            if (observation?.status !== 'held' || observation.reservationId !== root.runId || observation.parentReservationId !== parentReservationId
                || hashNativeDocument(observation.authorityRef) !== hashNativeDocument(root.budgetAuthorityRef)) fail('native_orchestration_child_budget_unconfirmed');
            const receipt = { schemaVersion: 1, receiptKind: 'child_budget_ready', receiptId, runId: root.runId, epoch: root.epoch,
                reservationId: root.runId, parentReservationId, authorityRef: root.budgetAuthorityRef, sourceBindingDigest: root.sourceBinding.bindingDigest,
                budgetCeilingDigest: hashNativeDocument(root.parentRef.budgetCeiling),
                decisionSeq: root.eventSeq + 1, createdAt: now };
            await putImmutable(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId), receipt);
            return { root, eventType: 'child_budget_confirmed', reasonCode: null, outcome: { childRunId: root.runId, budgetReceipt: receipt } };
        }, { resourceIds: [before.rootRunId, before.parentRef.parentRunId] });
    }
}
