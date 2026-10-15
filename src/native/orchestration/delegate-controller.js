import { ConflictError } from '../../storage/errors.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { assertNativeId } from '../identity.js';
import { cloneNativeDocument, hashNativeDocument, putImmutable, putMutable } from '../repositories/common.js';
import { assertObject, assertToken, assertPlanRef, assertPlanDefinition, assertDigest } from '../../../public/shared/native-orchestration-contracts.js';
import { assertComputeAllocation } from '../../../public/shared/native-compute-budget.js';
import { checkedRecord, planDefinitionHash } from './plan-repository.js';
import { controlCommandId, controlRecordKey, holdsConcurrencySlot, readAttempt } from './controller-common.js';
import { assertRunRoot, childBudgetReceiptId, initialTreeProgress, TREE_LOGICAL_COUNTERS } from './run-repository.js';

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

    async delegate(handle, input) {
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
        return this.runs.control(handle, controlCommandId('run.delegate', childRunId), { ...guard, operation: 'run.delegate', detail }, async ({ tx, root: parent, fence, now }) => {
            const { doc: parentAttempt } = await readAttempt(tx, handle, parent, parentAttemptId);
            const node = parent.graph.nodes.find(item => item.nodeId === parentAttempt.nodeId);
            if (parent.cancelRequested || parent.status !== 'running' || parentAttempt.status !== 'running' || parentAttempt.epoch !== parent.epoch
                || parentAttempt.sourceBindingDigest !== parent.sourceBinding.bindingDigest || !node.capabilities.includes('agent.delegate')
                || !['agent', 'router', 'planner', 'judge', 'review'].includes(node.kind)
                || hashNativeDocument(parentAttempt.budgetRef) !== hashNativeDocument(parent.budgetAuthorityRef)) fail('native_orchestration_delegation_not_admitted');
            const revision = (await checkedRecord(tx, { kind: K.orchestrationRevision, handle, planId: childPlanRef.planId, planRevisionId: childPlanRef.planRevisionId }))?.doc;
            if (!revision || revision.definitionHash !== childPlanRef.definitionHash
                || planDefinitionHash(revision.definition, revision.dependencyPins) !== childPlanRef.definitionHash) fail('native_orchestration_revision_mismatch');
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
                    while (at.parentRef && hops++ <= members.size) {
                        if (at.parentRef.parentRunId === ancestor.runId) { live++; break; }
                        at = members.get(at.parentRef.parentRunId);
                        if (!at) throw new TypeError('Missing delegation ancestor');
                    }
                }
                for (const attemptId of ancestor.attemptRefs) if (holdsConcurrencySlot(ancestor, (await readAttempt(tx, handle, ancestor, attemptId)).doc)) live++;
                if (ancestor.cancelRequested || ancestor.hostBootId !== fence.hostBootId || ancestor.hostGeneration !== fence.generation
                    || ancestor.sourceBinding.bindingDigest !== parent.sourceBinding.bindingDigest || hashNativeDocument(ancestor.budgetAuthorityRef) !== hashNativeDocument(parent.budgetAuthorityRef)
                    || ancestor.treeProgress.delegates >= Math.min(ancestor.limits.maxDelegates, ancestor.parentRef?.logicalCeiling.delegates ?? Infinity)
                    || depth > ancestor.limits.maxDepth || depth > definition.limits.maxDepth
                    || live >= ancestor.limits.maxConcurrency || now >= ancestor.progress.deadlineAt) fail('native_orchestration_delegation_limit_exhausted');
            }
            const logicalCeiling = Object.fromEntries(TREE_LOGICAL_COUNTERS.map(field => {
                const limit = 'max' + field[0].toUpperCase() + field.slice(1);
                return [field, Math.min(definition.limits[limit], ...ancestors.map(ancestor =>
                    Math.min(ancestor.limits[limit], ancestor.parentRef?.logicalCeiling[field] ?? Infinity) - ancestor.treeProgress[field] - (field === 'delegates' ? 1 : 0)))];
            }));
            if (Object.values(logicalCeiling).some(value => value < 0) || logicalCeiling.attempts < 1 || logicalCeiling.steps < 1) fail('native_orchestration_tree_limit_exhausted');
            await this.#scope({ handle, tx, parent, parentAttempt, childPlan: revision, inputRefs, effectiveGrantDigest, budgetCeiling, phase: 'delegate' }, effectiveGrantDigest);
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
            await putImmutable(tx, controlRecordKey(handle, childRunId, 'event', 'event:0'), {
                schemaVersion: 1, runId: childRunId, eventSeq: 0, epoch: 0, graphRevision: 0, type: 'child_admitted_unfunded', reasonCode: 'original_reservation_unconfirmed', createdAt: now });
            parent.progress.delegates++; parent.progress.depth = Math.max(parent.progress.depth, depth);
            return { root: parent, eventType: 'child_delegated', reasonCode: null, outcome: { childRunId, delegationReceipt: receipt } };
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
            await this.#scope({ handle, tx, parent, parentAttempt, childPlan: root.planRef, inputRefs: root.parentRef.inputRefs,
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
