import { hashNativeDocument as hash, equalNativeDocuments as equal } from '../repositories/common.js';
import { assertComputeLedger } from '../../../public/shared/native-compute-budget.js';
import { readOriginalProjectTask } from './project-tool-receipts.js';
import { readAttempt } from './controller-common.js';
import { readEffect } from './effect-contracts.js';
import { readFanoutFrame, readFanoutMembership, readFanoutReplanScope } from './fanout-controller.js';
import { sendAttemptId } from './budget-port.js';
import { projectReplanScope } from './project-replan-contracts.js';
import { readGraphPlannerCompletion } from './graph-planner-completion.js';
import { assertProjectControlWork } from './project-quality-contracts.js';

const denied = code => { throw Object.assign(new TypeError(code), { code }); };

/** The frozen branch is a scope boundary. Initial support adopts scheduling
 * proposals only; expanding/repeating/cancelling its frozen work requires a
 * corresponding consumer and cold proof, rather than a new permission. */
export async function assertProjectFanoutPlannerPatch(tx, handle, root, producer, patch) {
    const fanoutAttemptId = producer.inputRefs[0]?.fanoutAttemptId;
    const frame = fanoutAttemptId ? await readFanoutFrame(tx, handle, root, fanoutAttemptId) : null;
    const branch = frame?.branches.find(branch => branch.scopeNodeIds.includes(producer.nodeId));
    const fanout = frame ? (await readAttempt(tx, handle, root, fanoutAttemptId)).doc : null;
    if (!frame || !branch || fanout.status !== 'running' || frame.epoch !== root.epoch
        || frame.sourceBindingDigest !== root.sourceBinding.bindingDigest || !equal(frame.parentBudgetRef, root.budgetAuthorityRef)
        || !await readFanoutMembership(tx, handle, root, frame, producer.attemptId)) denied('native_orchestration_fanout_stale');
    assertProjectFanoutPlannerOperations(frame, producer, patch.operations);
    if (patch.operations.some(operation => operation.op === 'requestReplan')) {
        const scoped = await readFanoutReplanScope(tx, handle, root, producer), pure = projectReplanScope(root.graph, producer.nodeId);
        if (!scoped || scoped.target.nodeId !== pure.target.nodeId) denied('native_orchestration_project_replan_unavailable');
    }
}

/** Also used by the cold reader after the original Frame/Model proof. */
export function assertProjectFanoutPlannerOperations(frame, producer, operations) {
    const branch = frame.branches.find(branch => branch.scopeNodeIds.includes(producer.nodeId));
    if (!branch || producer.inputRefs[0]?.fanoutAttemptId !== frame.fanoutAttemptId) denied('native_orchestration_fanout_stale');
    for (const operation of operations) {
        if (!['requestFinalize', 'requestReplan', 'setPendingPriority'].includes(operation.op)) denied('native_orchestration_fanout_planner_control_pending');
        if (operation.op === 'setPendingPriority' && !branch.scopeNodeIds.includes(operation.nodeId)) denied('native_orchestration_patch_denied');
    }
}

/** Original paid Planner completion selects only its published local return. */
export async function projectFanoutReplan({ tx, root, completion, progress, branch, service, handle, requestsForNode = () => 1 }) {
    const fact = await readGraphPlannerCompletion(tx, handle, root, completion.attemptId, { verifyControlWork: assertProjectControlWork });
    if (!fact || !fact.patch.requests.replan || fact.patch.requests.finalize || !equal(fact.controlRef, completion.controlRef))
        denied('native_orchestration_project_replan_unavailable');
    const scope = await readFanoutReplanScope(tx, handle, root, fact.producer), pure = projectReplanScope(root.graph, fact.producer.nodeId);
    if (!scope || scope.target.nodeId !== pure.target.nodeId || !progress.has(scope.target.nodeId)
        || !equal(scope.branch.scopeNodeIds, branch.scopeNodeIds)) denied('native_orchestration_project_replan_unavailable');
    const repeated = scope.affectedNodeIds.filter(id => progress.has(id));
    for (const id of repeated) {
        const node = root.graph.nodes.find(node => node.nodeId === id);
        if (!['agent', 'planner', 'review', 'judge'].includes(node.kind) || node.capabilities.some(capability => !['generation.send', 'graph.patch'].includes(capability)))
            denied('native_orchestration_review_irreversible_dependency');
    }
    // Every affected member still sends from this bank; only repeated members
    // open a new Attempt, unexecuted ones keep their frozen reservation.
    const requests = scope.affectedNodeIds.reduce((sum, id) => sum + requestsForNode(root.graph.nodes.find(node => node.nodeId === id)), 0);
    const capacity = await service.budgetPort.observeCapacity(handle, { authorityRef: root.budgetAuthorityRef, reservationId: root.parentRef ? root.runId : null }, { tx });
    if (!capacity || capacity.overrun || capacity.remaining.requests < requests
        || root.progress.attempts + repeated.length > root.limits.maxAttempts) denied('native_orchestration_project_graph_budget_unavailable');
    return { ...scope, loopBindings: scope.loops.map(edge => ({ edge, ...completion })) };
}

/** Accounting only: already admitted sends occupy this same original bank,
 * including in-flight/unknown sibling sends whose Result is not published.
 * This never proves a Result, Source permission, or a reusable Model grant. */
export async function readProjectFanoutPaidModelNodes(tx, handle, root) {
    const authority = root.budgetAuthorityRef;
    const source = root.sourceBinding.sourceRef;
    const task = await readOriginalProjectTask(tx, handle, source);
    if (root.sourceBinding.sourceAuthority !== 'project' || authority.authority !== 'project_task' || root.parentRef && (!root.parentRef.budgetCeiling || !root.parentRef.effectiveGrantDigest)
        || authority.projectId !== source.projectId || authority.taskId !== source.taskId || task?.baseRevision !== source.revision
        || authority.operationId !== hash({ projectId: source.projectId, taskId: source.taskId, revision: source.revision, executionFingerprint: source.executionFingerprint })
        || !equal(root.sourceBinding.budgetAuthorityRef, authority)) denied('native_orchestration_budget_unavailable');
    const bank = assertComputeLedger(task.compute), paid = new Set();
    if (root.parentRef) {
        const allocation = bank.reservations.find(row => row.reservationId === root.runId);
        if (!allocation || allocation.status !== 'held' || !equal(allocation.limits, root.parentRef.budgetCeiling)
            || allocation.parentReservationId !== (root.parentRef.depth === 1 ? null : root.parentRef.parentRunId))
            denied('native_orchestration_budget_unavailable');
    }
    for (const id of root.attemptRefs) {
        const attempt = (await readAttempt(tx, handle, root, id)).doc;
        for (const effectId of attempt.effectRefs) {
            const effect = (await readEffect(tx, handle, root, effectId)).doc;
            if (effect.capability !== 'generation.send') continue;
            const rows = bank.attempts.filter(row => row.orchestration?.effectId === effectId);
            if (!rows.length) continue;
            const input = attempt.inputRefs[0], delegated = input.kind === 'native_project_delegation';
            let expectedInput = input;
            if (delegated) {
                if (!effect.inputRef.acceptedResultRef || !Object.hasOwn(effect.inputRef, 'returnReceiptRef')
                    || effect.inputRef.parentInputDigest !== attempt.inputDigest) denied('native_orchestration_budget_attempt_invalid');
                if (root.parentRef) {
                    expectedInput = { ...input, kind: 'native_project_delegated_intent', acceptedResultRef: effect.inputRef.acceptedResultRef,
                        returnReceiptRef: effect.inputRef.returnReceiptRef, parentInputDigest: attempt.inputDigest };
                    delete expectedInput.childPlanRef;
                } else {
                    const logical = effect.inputRef;
                    const resolver = { kind: 'native_project_delegation', role: logical.role, requestId: logical.requestId,
                        sourceRef: logical.sourceRef, planRef: logical.planRef, nodeId: logical.nodeId, childPlanRef: input.childPlanRef,
                        ...(logical.fanoutAttemptId ? { fanoutAttemptId: logical.fanoutAttemptId } : {}),
                        acceptedGraphResultRefs: logical.acceptedGraphResultRefs ?? [],
                        ...(logical.acceptedControlRefs ? { acceptedControlRefs: logical.acceptedControlRefs } : {}),
                        ...(logical.projectQualityTask?.feedback ? { reviewFeedbackRef: logical.projectQualityTask.feedback } : {}),
                        graphBindings: logical.controlGraph?.bindings?.toSorted((a, b) => a.edgeId.localeCompare(b.edgeId)) };
                    if (logical.kind !== 'native_project_intent' || logical.grantDigest !== attempt.effectiveGrantDigest || !equal(resolver, input))
                        denied('native_orchestration_budget_attempt_invalid');
                    expectedInput = logical;
                }
            }
            if (effect.nodeAttemptId !== attempt.attemptId || effect.epoch !== attempt.epoch
                || effect.sourceBindingDigest !== root.sourceBinding.bindingDigest || effect.grantDigest !== attempt.effectiveGrantDigest
                || effect.inputHash !== hash(effect.inputRef) || !equal(effect.inputRef, expectedInput)
                || !equal(attempt.budgetRef, authority)) denied('native_orchestration_budget_attempt_invalid');
            for (const [ordinal, row] of rows.entries()) if (row.orchestration.kind !== 'provider_send' || row.orchestration.ordinal !== ordinal
                || row.attemptId !== sendAttemptId(effectId, ordinal) || (row.reservationId ?? null) !== (root.parentRef ? root.runId : null)
                || !['charged', 'unknown', 'settled'].includes(row.status)) denied('native_orchestration_budget_attempt_invalid');
            paid.add(attempt.nodeId);
        }
    }
    return paid;
}
