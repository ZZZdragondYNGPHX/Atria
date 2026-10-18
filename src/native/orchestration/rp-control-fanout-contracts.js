import { assertRpDelegationFanoutClosure, readRpDelegationContinuation } from './rp-delegated-quality-contracts.js';
import { readGraphReviewCompletion } from './graph-review-completion.js';
import { hashNativeDocument as hash, equalNativeDocuments as same } from '../repositories/common.js';
import { readGraphFanoutCompletion } from './graph-fanout-completion.js';
import { readEffect } from './effect-contracts.js';
import { readModelCompletionReceipt, readModelTerminalFact } from './model-port.js';
import { checkedRecord } from './plan-repository.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { assertAudienceRunCapture, audienceContextPin } from './audience-source-contracts.js';
import { readRpControlInputs, assertRpControlInput, rpPlannerReaderOptions, rpReviewReaderOptions } from './rp-control-input-contracts.js';
import { assertOutputTransition } from './output-transition-contracts.js';
import { readContextRetrievalCompletions } from './context-retrieval-contracts.js';
import { assertBudgetAttemptRef, sendAttemptId } from './budget-port.js';
import { readGraphPlannerCompletion } from './graph-planner-completion.js';
import { assertRpFanoutPlannerOperations } from './rp-fanout-planner-contracts.js';

const invalid = () => { throw new TypeError('Invalid original RP control Fanout Join facts'); };

async function memberInput(tx, handle, root, attempt, { frame, branch, reservation, graphSnapshot, plan }) {
    if (attempt.inputState === 'reserved') {
        if (!reservation || attempt.status !== 'cancelled' || attempt.inputRefs !== null || attempt.effectiveGrantDigest !== null
            || attempt.budgetRef !== null || attempt.reservationRef.producerAttemptId !== frame.fanoutAttemptId || !branch.scopeNodeIds.includes(attempt.nodeId)) invalid();
        return;
    }
    if (graphSnapshot?.graphRevision !== attempt.graphRevision || !plan) invalid();
    const input = attempt.inputRefs[0], node = graphSnapshot.graph.nodes.find(node => node.nodeId === attempt.nodeId);
    const pin = plan.dependencyPins.find(pin => pin.pinId === node?.policy.agentPinId && node.dependencyPinIds.includes(pin.pinId));
    if (root.sourceBinding.sourceAuthority !== 'rp_chat' || root.parentRef || !['agent', 'planner', 'review'].includes(node?.kind)
        || !node.capabilities.includes('generation.send') || !['native_rp_intent', 'native_rp_delegation'].includes(input.kind) || input.nodeId !== attempt.nodeId || input.role !== 'narrator'
        || !same(input.planRef, root.planRef) || !same(input.sourceRef, root.sourceBinding.sourceRef)
        || !same(input.audience, audienceContextPin(node, plan.dependencyPins)?.resourceRef.audience ?? { kind: 'narrator' })
        || input.fanoutAttemptId !== frame.fanoutAttemptId || !branch.scopeNodeIds.includes(node.nodeId)
        || !pin || pin.port !== 'model' || !same(input.routeRef, pin.resourceRef)
        || typeof input.requestId !== 'string' || !input.controlGraph
        || attempt.inputDigest !== hash(attempt.inputRefs)
        || attempt.effectiveGrantDigest !== hash({ owner: handle, logicalInputRef: input, sourceBindingDigest: root.sourceBinding.bindingDigest })
        || !same(attempt.budgetRef, root.budgetAuthorityRef)
        || !same(input.acceptedGraphResultRefs, input.controlGraph.evidenceRefs)
        || !same(attempt.inputRefs, [input, ...input.controlGraph.evidenceRefs, ...input.controlGraph.controlRefs])) invalid();
    assertAudienceRunCapture(root, node, plan.dependencyPins, input);
}

async function controlInput(tx, handle, root, attempt, { settlement }) {
    const input = attempt.inputRefs[0], node = root.graph.nodes.find(node => node.nodeId === attempt.nodeId);
    if (input.kind !== 'native_rp_graph_control' || input.nodeId !== attempt.nodeId || !same(input.planRef, root.planRef)
        || !same(input.sourceRef, root.sourceBinding.sourceRef) || !same(attempt.budgetRef, root.budgetAuthorityRef)
        || attempt.effectiveGrantDigest !== hash({ handle: root.ownerRef.handle, source: root.sourceBinding, inputRefs: attempt.inputRefs })
        || node?.kind === 'fanout' && settlement.reasonCode !== 'rp_fanout_join_' + settlement.outcome
        || node?.kind === 'join' && settlement.reasonCode !== null && !['join_deadline', 'join_member_unsuccessful', 'join_quorum_unreachable'].includes(settlement.reasonCode)) invalid();
    const bundle = input.controlGraph;
    if (!bundle || !same(input.acceptedGraphResultRefs, bundle.evidenceRefs) || !same(input.acceptedControlRefs, bundle.controlRefs)
        || !same(attempt.inputRefs, [input, ...bundle.evidenceRefs, ...bundle.controlRefs])) invalid();
    if (node.kind === 'fanout') {
        const facts = await readRpControlInputs(tx, handle, root, bundle, { targetNodeId: node.nodeId });
        if (!bundle.bindings.length) {
            if (!root.graph.entryNodeIds.includes(node.nodeId) || facts.length) invalid();
        } else {
            const direct = facts.filter(fact => bundle.bindings.some(binding => binding.producerAttemptId === fact.producer.attemptId));
            const bindings = bundle.bindings.toSorted((a, b) => a.edgeId.localeCompare(b.edgeId));
            const receiptId = 'oreceipt_' + hash({ runId: root.runId, bindings, reservedAttemptId: null }).slice(0, 32);
            await assertOutputTransition(tx, handle, root, { published: direct[0], additionalProducers: direct.slice(1), output: attempt, producerBindings: bindings,
                receipt: { decisionSeq: settlement.decisionSeq, traversalReceiptRef: { runId: root.runId, receiptId } } });
        }
    } else if (bundle.bindings.length || bundle.evidenceRefs.length || bundle.controlRefs.length || input.fanoutAttemptId === undefined) invalid();
}

/** Same original RP bank, including settled rejected or late paid sends.
 * No usage is invented and unselected work is never omitted from the facts. */
async function memberCost(tx, handle, root, attempt, { settlement, results, frame }) {
    const bank = root.budgetAuthorityRef;
    const control = (await checkedRecord(tx, { kind: K.rpRunControl, handle, controlId: bank.controlId }))?.doc;
    const compute = control?.operations[bank.operationId]?.compute;
    if (!compute || bank.domain !== 'rp_chat' || !same(root.sourceBinding.budgetAuthorityRef, bank)) invalid();
    if (!attempt.effectRefs.length) {
        if (settlement.outcome !== 'cancelled' || settlement.effectReceiptRefs.length || results.length) invalid();
        return;
    }
    if (results.length > 1) invalid();
    const published = results[0] ?? null;
    const effect = published ? published.modelEffect : (await readEffect(tx, handle, root, attempt.effectRefs[0])).doc;
    const retrieval = published ? published.retrievalCompletions : await readContextRetrievalCompletions(tx, handle, root, effect, attempt);
    if (!effect || !Array.isArray(retrieval) || !same(attempt.effectRefs, [effect.effectId, ...retrieval.map(item => item.effectId)])) invalid();
    const completed = published ? published.modelCompletion : await readModelCompletionReceipt(handle, tx, root, effect);
    if (published && (!completed || published.receipt.modelEffectId !== effect.effectId || !same(published.receipt.modelReceiptRef, completed.receiptRef))) invalid();
    const planner = root.graph.nodes.find(node => node.nodeId === attempt.nodeId)?.kind === 'planner' && settlement.outcome === 'completed'
        ? await readGraphPlannerCompletion(tx, handle, root, attempt.attemptId, rpPlannerReaderOptions) : null;
    if (planner) {
        if (results.length || !same(planner.producer, attempt) || !same(planner.settlement, settlement)
            || !completed || !same(planner.receipt.modelReceiptRef, completed.receiptRef)) invalid();
        assertRpFanoutPlannerOperations(frame, attempt, planner.patch.appliedOperations);
        await assertRpControlInput(tx, handle, root, planner);
    }
    const review = root.graph.nodes.find(node => node.nodeId === attempt.nodeId)?.kind === 'review' && settlement.outcome === 'completed'
        ? await readGraphReviewCompletion(tx, handle, root, attempt.attemptId, rpReviewReaderOptions) : null;
    if (review) {
        if (results.length || !same(review.producer, attempt) || !same(review.settlement, settlement)
            || !completed || !same(review.receipt.modelReceiptRef, completed.receiptRef)) invalid();
        await assertRpControlInput(tx, handle, root, review);
    }
    if (published && attempt.inputRefs[0]?.reviewFeedbackRef) await assertRpControlInput(tx, handle, root, published);
    const delegation = attempt.inputRefs[0]?.kind === 'native_rp_delegation'
        ? published?.delegationContinuation ?? await readRpDelegationContinuation(tx, handle, root, attempt, effect) : null;
    const terminal = completed ? null : await readModelTerminalFact(handle, tx, root, effect);
    const fact = completed ?? terminal;
    if (!fact || effect.nodeAttemptId !== attempt.attemptId || effect.capability !== 'generation.send' || effect.risk !== 'R1' || effect.requiresApproval
        || effect.sourceBindingDigest !== root.sourceBinding.bindingDigest || effect.epoch !== attempt.epoch || effect.grantDigest !== attempt.effectiveGrantDigest
        || !same(effect.inputRef, delegation ? { ...attempt.inputRefs[0], kind: 'native_rp_intent',
            acceptedResultRef: delegation.output.claim.resultRef, returnReceiptRef: { runId: root.runId, receiptId: delegation.returnReceipt.receiptId },
            parentInputDigest: attempt.inputDigest } : attempt.inputRefs[0]) || effect.inputHash !== hash(effect.inputRef)
        || !same(settlement.effectReceiptRefs, [fact.receiptRef.receiptId, ...retrieval.map(item => item.receiptId)])
        || (planner || review ? false : results.length ? !completed || settlement.outcome !== 'completed' : terminal?.kind !== (settlement.outcome === 'failed' ? 'rejected' : 'late_response'))) invalid();
    if (delegation) assertRpDelegationFanoutClosure(root, delegation, compute);
    const sends = fact.observation.dispatchEvidence.reference.attempts;
    if (!sends?.length) invalid();
    for (const [ordinal, send] of sends.entries()) {
        const ref = assertBudgetAttemptRef(send.budgetAttemptRef), row = compute.attempts.find(row => row.attemptId === ref.attemptId);
        if (!row || ref.kind !== undefined || !same(ref.authorityRef, bank) || ref.effectId !== effect.effectId || ref.providerSendOrdinal !== ordinal
            || ref.attemptId !== sendAttemptId(effect.effectId, ordinal) || !same(row.orchestration, { kind: 'provider_send', effectId: effect.effectId, ordinal })
            || (row.reservationId ?? null) !== ref.reservationId || row.requestId !== send.requestId || row.targetFingerprint !== send.targetFingerprint
            || row.inputFingerprint !== send.inputFingerprint || !['charged', 'unknown', 'settled'].includes(row.status)
            || send.status === 'settled' && (row.status !== 'settled' || hash(row.usage) !== send.usageHash)) invalid();
    }
}

export function readRpControlFanoutCompletion(tx, handle, root, joinAttemptId, { recipient = null } = {}) {
    return readGraphFanoutCompletion(tx, handle, root, joinAttemptId,
        { verifyMemberInput: memberInput, verifyControlInput: controlInput, verifyMemberCost: memberCost, recipient });
}
