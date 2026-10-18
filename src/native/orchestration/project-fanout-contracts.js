import { readProjectDelegatedFanoutCompletion } from './project-delegated-fanout-contracts.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { readGraphFanoutCompletion } from './graph-fanout-completion.js';
import { readTaskGraphRevision } from './graph-revision-contracts.js';
import { readPlanRevision } from './plan-repository.js';
import { readEffect } from './effect-contracts.js';
import { readModelCompletionReceipt, readModelTerminalFact } from './model-port.js';
import { readOriginalProjectTask } from './project-tool-receipts.js';
import { assertBudgetAttemptRef, sendAttemptId } from './budget-port.js';
import { readGraphPlannerCompletion } from './graph-planner-completion.js';
import { assertProjectControlWork } from './project-quality-contracts.js';
import { assertProjectFanoutPlannerOperations } from './project-fanout-planner-contracts.js';
import { readProjectControlInputs } from './project-control-input-contracts.js';
import { readGraphFanoutInput } from './graph-fanout-completion.js';
import { readAttempt } from './controller-common.js';
import { assertOutputTransition } from './output-transition-contracts.js';

const same = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid original Project Fanout Join facts'); };

async function memberInput(tx, handle, root, attempt, { frame, branch, reservation, settlement }) {
    if (attempt.inputState === 'reserved') {
        if (!reservation || attempt.status !== 'cancelled' || attempt.inputRefs !== null || attempt.effectiveGrantDigest !== null
            || attempt.budgetRef !== null || attempt.reservationRef.producerAttemptId !== frame.fanoutAttemptId || !branch.scopeNodeIds.includes(attempt.nodeId)) invalid();
        return;
    }
    const input = attempt.inputRefs[0], snapshot = await readTaskGraphRevision(tx, handle, root, attempt.graphRevision);
    const node = snapshot.graph.nodes.find(node => node.nodeId === attempt.nodeId), plan = await readPlanRevision(tx, handle, root.planRef);
    const pin = plan.dependencyPins.find(pin => pin.pinId === node?.policy.agentPinId && node.dependencyPinIds.includes(pin.pinId));
    const task = await readOriginalProjectTask(tx, handle, root.sourceBinding.sourceRef);
    const original = task?.attempts.find(item => item.attemptId === input.projectAttemptId);
    if (root.sourceBinding.sourceAuthority !== 'project' || root.parentRef || !['agent', 'planner'].includes(node?.kind) || !same(node.capabilities, ['generation.send', ...node.kind === 'planner' ? ['graph.patch'] : []])
        || input.kind !== 'native_project_intent' || input.nodeId !== attempt.nodeId || input.role !== 'studio'
        || !same(input.planRef, root.planRef) || !same(input.sourceRef, root.sourceBinding.sourceRef)
        || input.fanoutAttemptId !== frame.fanoutAttemptId || !branch.scopeNodeIds.includes(node.nodeId)
        || !pin || pin.port !== 'model' || !same(input.routeRef, pin.resourceRef) || input.routeIntegrity !== pin.integrity
        || original?.kind !== 'generation' || original.requestId !== input.originalRequestId
        || typeof input.requestId !== 'string' || !input.requestId.startsWith('project-quality:')
        || attempt.inputDigest !== hash(attempt.inputRefs) || attempt.effectiveGrantDigest !== input.grantDigest
        || !same(attempt.budgetRef, root.budgetAuthorityRef)
        || (input.acceptedGraphResultRefs ?? []).some(ref => !attempt.inputRefs.some(actual => same(ref, actual)))
        || (input.acceptedControlRefs ?? []).some(ref => !attempt.inputRefs.some(actual => same(ref, actual)))) invalid();
    const bundle = input.controlGraph;
    if (!bundle || !same(input.acceptedGraphResultRefs, bundle.evidenceRefs) || !same(input.acceptedControlRefs ?? [], bundle.controlRefs)
        || !same(attempt.inputRefs, [input, ...bundle.evidenceRefs, ...bundle.controlRefs])) invalid();
    const facts = await readProjectControlInputs(tx, handle, root, null, bundle, { targetNodeId: node.nodeId });
    const fanout = (await readAttempt(tx, handle, root, frame.fanoutAttemptId)).doc;
    const inherited = facts.filter(fact => fanout.inputRefs.some(ref => same(ref, fact.controlRef ?? fact.receipt.resultRef)));
    for (const fact of inherited) await readGraphFanoutInput(tx, handle, root, frame.fanoutAttemptId, attempt,
        fact.controlRef ?? fact.receipt.resultRef, fact, { historical: true });
    for (const fact of facts.filter(fact => fact.record)) if (!fact.record.envelope.audienceConstraint.nodeIds.includes(node.nodeId)) invalid();
    const direct = facts.filter(fact => !inherited.includes(fact)), bindings = [...bundle.bindings].sort((a, b) => a.edgeId.localeCompare(b.edgeId));
    if (attempt.attemptId === branch.entryAttemptId) {
        if (bindings.length || direct.length) invalid();
    } else {
        if (!reservation || !bindings.length || direct.some(fact => !branch.scopeNodeIds.includes(fact.producer.nodeId)
            || !bindings.some(binding => binding.producerAttemptId === fact.producer.attemptId))
            || bindings.some(binding => !direct.some(fact => fact.producer.attemptId === binding.producerAttemptId
                && snapshot.graph.edges.some(edge => edge.edgeId === binding.edgeId && edge.from.nodeId === fact.producer.nodeId && edge.to.nodeId === node.nodeId)))) invalid();
        const identity = hash({ runId: root.runId, bindings, reservedAttemptId: attempt.attemptId });
        await assertOutputTransition(tx, handle, { ...root, graph: snapshot.graph }, { published: direct[0], additionalProducers: direct.slice(1), output: attempt,
            producerBindings: bindings, reservedAttemptId: attempt.attemptId, receipt: { decisionSeq: settlement.decisionSeq,
                traversalReceiptRef: { runId: root.runId, receiptId: 'oreceipt_' + identity.slice(0, 32) } } });
    }
}

async function controlInput(tx, handle, root, attempt, { settlement, frame }) {
    const input = attempt.inputRefs[0], node = root.graph.nodes.find(node => node.nodeId === attempt.nodeId);
    if (input.kind !== 'native_project_graph_control' || input.nodeId !== attempt.nodeId || !same(input.planRef, root.planRef)
        || !same(input.sourceRef, root.sourceBinding.sourceRef) || !same(attempt.budgetRef, root.budgetAuthorityRef)
        || attempt.effectiveGrantDigest !== hash({ handle: root.ownerRef.handle, source: root.sourceBinding, inputRefs: attempt.inputRefs })
        || node?.kind === 'fanout' && settlement.reasonCode !== 'project_fanout_join_' + settlement.outcome
        || node?.kind === 'join' && settlement.reasonCode !== null && !['join_deadline', 'join_member_unsuccessful', 'join_quorum_unreachable'].includes(settlement.reasonCode)) invalid();
    const bundle = input.controlGraph;
    if (!bundle || !same(input.acceptedGraphResultRefs, bundle.evidenceRefs) || !same(input.acceptedControlRefs, bundle.controlRefs)
        || !same(attempt.inputRefs, [input, ...bundle.evidenceRefs, ...bundle.controlRefs])) invalid();
    if (node.kind === 'fanout') {
        const facts = await readProjectControlInputs(tx, handle, root, null, bundle, { targetNodeId: node.nodeId });
        if (!bundle.bindings.length) {
            if (!root.graph.entryNodeIds.includes(node.nodeId) || facts.length) invalid();
        } else {
            const direct = facts.filter(fact => bundle.bindings.some(binding => binding.producerAttemptId === fact.producer.attemptId));
            const bindings = [...bundle.bindings].sort((a, b) => a.edgeId.localeCompare(b.edgeId));
            const receiptId = 'oreceipt_' + hash({ runId: root.runId, bindings, reservedAttemptId: null }).slice(0, 32);
            await assertOutputTransition(tx, handle, root, { published: direct[0], additionalProducers: direct.slice(1), output: attempt, producerBindings: bindings,
                receipt: { decisionSeq: settlement.decisionSeq, traversalReceiptRef: { runId: root.runId, receiptId } } });
        }
    } else if (bundle.bindings.length || bundle.evidenceRefs.length || bundle.controlRefs.length || input.fanoutAttemptId !== frame.fanoutAttemptId) invalid();
}

/** Same original Task bank, including settled rejected or late paid sends.
 * No usage is invented and unselected work is never omitted from the facts. */
export async function assertProjectFanoutMemberCost(tx, handle, root, attempt, { settlement, results, frame }) {
    const task = await readOriginalProjectTask(tx, handle, root.sourceBinding.sourceRef), bank = root.budgetAuthorityRef;
    if (!task || bank.authority !== 'project_task' || bank.projectId !== task.projectId || bank.taskId !== task.taskId
        || bank.operationId !== hash({ projectId: task.projectId, taskId: task.taskId, revision: root.sourceBinding.sourceRef.revision,
            executionFingerprint: root.sourceBinding.sourceRef.executionFingerprint }) || !same(root.sourceBinding.budgetAuthorityRef, bank)
        || attempt.effectRefs.length > 1) invalid();
    if (!attempt.effectRefs.length) {
        if (settlement.outcome !== 'cancelled' || settlement.effectReceiptRefs.length || results.length) invalid();
        return;
    }
    const effect = (await readEffect(tx, handle, root, attempt.effectRefs[0])).doc;
    const completed = await readModelCompletionReceipt(handle, tx, root, effect), terminal = completed ? null : await readModelTerminalFact(handle, tx, root, effect);
    const planner = root.graph.nodes.find(node => node.nodeId === attempt.nodeId)?.kind === 'planner' && settlement.outcome === 'completed'
        ? await readGraphPlannerCompletion(tx, handle, root, attempt.attemptId, { verifyControlWork: assertProjectControlWork }) : null;
    if (planner) {
        if (results.length || !same(planner.producer, attempt) || !same(planner.settlement, settlement)
            || !completed || !same(planner.receipt.modelReceiptRef, completed.receiptRef)) invalid();
        assertProjectFanoutPlannerOperations(frame, attempt, planner.patch.appliedOperations);
    }
    const fact = completed ?? terminal;
    if (!fact || effect.nodeAttemptId !== attempt.attemptId || effect.capability !== 'generation.send' || effect.risk !== 'R1' || effect.requiresApproval
        || effect.sourceBindingDigest !== root.sourceBinding.bindingDigest || effect.epoch !== attempt.epoch || effect.grantDigest !== attempt.effectiveGrantDigest
        || !same(effect.inputRef, attempt.inputRefs[0]) || effect.inputHash !== hash(attempt.inputRefs[0])
        || !same(settlement.effectReceiptRefs, [fact.receiptRef.receiptId])
        || (planner ? false : results.length ? !completed || settlement.outcome !== 'completed' : terminal?.kind !== (settlement.outcome === 'failed' ? 'rejected' : 'late_response'))) invalid();
    const sends = fact.observation.dispatchEvidence.reference.attempts;
    if (!sends?.length) invalid();
    for (const [ordinal, send] of sends.entries()) {
        const ref = assertBudgetAttemptRef(send.budgetAttemptRef), row = task.compute?.attempts.find(row => row.attemptId === ref.attemptId);
        if (!row || ref.kind !== undefined || !same(ref.authorityRef, bank) || ref.effectId !== effect.effectId || ref.providerSendOrdinal !== ordinal
            || ref.attemptId !== sendAttemptId(effect.effectId, ordinal) || !same(row.orchestration, { kind: 'provider_send', effectId: effect.effectId, ordinal })
            || (row.reservationId ?? null) !== ref.reservationId || root.parentRef && ref.reservationId !== root.runId || row.requestId !== send.requestId || row.targetFingerprint !== send.targetFingerprint
            || row.inputFingerprint !== send.inputFingerprint || !['charged', 'unknown', 'settled'].includes(row.status)
            || send.status === 'settled' && (row.status !== 'settled' || hash(row.usage) !== send.usageHash)) invalid();
    }
}

export function readProjectFanoutCompletion(tx, handle, root, joinAttemptId, { recipient = null } = {}) {
    if (root.parentRef) return readProjectDelegatedFanoutCompletion(tx, handle, root, joinAttemptId, { recipient });
    return readGraphFanoutCompletion(tx, handle, root, joinAttemptId,
        { verifyMemberInput: memberInput, verifyControlInput: controlInput, verifyMemberCost: assertProjectFanoutMemberCost, recipient });
}
