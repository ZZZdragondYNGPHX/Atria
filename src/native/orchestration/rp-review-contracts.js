import { hashNativeDocument as hash } from '../repositories/common.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { controlRecordKey, readAttempt, readGraphReviewReceipt } from './controller-common.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { readAttemptSettlement } from './attempt-settlement.js';
import { readEffect } from './effect-contracts.js';
import { readModelCompletionReceipt } from './model-port.js';
import { assertRpControlWork } from './rp-control-work-contracts.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { RP_REVIEW_REASON_CODES } from './rp-review-profile.js';
import { assertOutputTransition } from './output-transition-contracts.js';
import { readContextRetrievalCompletions } from './context-retrieval-contracts.js';
import { assertAudienceRunCapture } from './audience-source-contracts.js';

const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid RP Review completion facts'); };
export const rpReviewModelReceiptId = (runId, attemptId) => 'oreceipt_' + hash({ kind: 'rp_graph_review_model', runId, attemptId }).slice(0, 32);

/** Original Model-to-Review facts only; approve is not an Effect approval. */
export async function readRpReviewCompletion(tx, handle, root, attemptId) {
    const { doc: producer } = await readAttempt(tx, handle, root, attemptId), receiptId = rpReviewModelReceiptId(root.runId, attemptId);
    const receipt = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId)))?.doc;
    if (!receipt) return null;
    assertObject(receipt, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'producerAttemptId', 'sourceBindingDigest', 'grantDigest',
        'modelEffectId', 'modelReceiptRef', 'modelPayloadHash', 'responseText', 'reviewReceiptRef', 'reviewIntegrity', 'localWork', 'decisionSeq', 'createdAt'], 'RP Review Model receipt');
    const review = await readGraphReviewReceipt(tx, handle, root, producer), settlement = await readAttemptSettlement(tx, handle, root, producer);
    const intent = (await readEffect(tx, handle, root, receipt.modelEffectId)).doc, model = await readModelCompletionReceipt(handle, tx, root, intent);
    const retrievalCompletions = await readContextRetrievalCompletions(tx, handle, root, intent, producer);
    let response;
    try { response = JSON.parse(receipt.responseText); } catch { invalid(); }
    assertObject(response, ['decision', 'reasonCode'], 'Review response');
    if (receipt.schemaVersion !== 1 || receipt.receiptKind !== 'rp_graph_review_model' || receipt.receiptId !== receiptId || receipt.runId !== root.runId
        || receipt.producerAttemptId !== attemptId || producer.status !== 'completed' || producer.epoch !== receipt.epoch || receipt.epoch > root.epoch
        || producer.sourceBindingDigest !== root.sourceBinding.bindingDigest || receipt.sourceBindingDigest !== root.sourceBinding.bindingDigest
        || receipt.grantDigest !== producer.effectiveGrantDigest || !equal(producer.effectRefs, [receipt.modelEffectId, ...retrievalCompletions.map(item => item.effectId)]) || producer.resultRefs.length
        || !review || hash(review) !== receipt.reviewIntegrity || !equal(receipt.reviewReceiptRef, { runId: root.runId, receiptId: review.receiptId })
        || !equal(response, { decision: review.decision, reasonCode: review.reasonCode }) || review.decisionSeq >= receipt.decisionSeq
        || !RP_REVIEW_REASON_CODES.includes(response.reasonCode) || (response.decision === 'approve') !== (response.reasonCode === 'quality_ready')
        || intent.nodeAttemptId !== attemptId || intent.epoch !== producer.epoch || intent.sourceBindingDigest !== root.sourceBinding.bindingDigest || intent.grantDigest !== receipt.grantDigest
        || !model || !equal(model.receiptRef, receipt.modelReceiptRef) || hash(receipt.responseText) !== receipt.modelPayloadHash
        || model.observation.dispatchEvidence.reference.resultPayloadHash !== receipt.modelPayloadHash
        || !equal(settlement.effectReceiptRefs, [receipt.modelReceiptRef.receiptId, ...retrievalCompletions.map(item => item.receiptId)]) || settlement.reasonCode !== 'rp_graph_review_decided'
        || settlement.decisionSeq !== receipt.decisionSeq || settlement.createdAt !== receipt.createdAt || receipt.decisionSeq > root.eventSeq
        || review.evidenceRefs.length !== 1 || review.evidenceRefs[0].runId !== root.runId || review.targetAttemptIds.length !== 1
        || !producer.inputRefs.some(ref => equal(ref, review.evidenceRefs[0]))) invalid();
    const draft = await readGraphNodeResult(tx, handle, root, review.evidenceRefs[0].resultId);
    if (!draft || draft.producer.attemptId !== review.targetAttemptIds[0] || !draft.record.envelope.audienceConstraint.nodeIds.includes(producer.nodeId)) invalid();
    const input = intent.inputRef;
    const reviewerNode = root.graph.nodes.find(node => node.nodeId === producer.nodeId);
    if (reviewerNode.policy?.audiencePinId || Object.hasOwn(input, 'audienceCapture')) {
        const plan = await readPlanRevision(tx, handle, root.planRef);
        assertAudienceRunCapture(root, reviewerNode, plan.dependencyPins, input);
    }
    if (input.kind !== 'native_rp_intent' || input.nodeId !== producer.nodeId || !equal(input.planRef, root.planRef) || !equal(input.sourceRef, root.sourceBinding.sourceRef)
        || !equal(input.acceptedGraphResultRefs, review.evidenceRefs) || !equal(producer.inputRefs, [input, ...review.evidenceRefs])) invalid();
    const edge = root.graph.edges.find(item => item.from.nodeId === draft.producer.nodeId && item.to.nodeId === producer.nodeId);
    if (!edge) invalid();
    const bindings = [{ edgeId: edge.edgeId, producerAttemptId: draft.producer.attemptId }], traversalId = 'oreceipt_' + hash({ runId: root.runId, bindings, reservedAttemptId: null }).slice(0, 32);
    await assertOutputTransition(tx, handle, root, { published: draft, output: producer,
        receipt: { decisionSeq: receipt.decisionSeq, traversalReceiptRef: { runId: root.runId, receiptId: traversalId } } });
    await assertRpControlWork(tx, handle, root, receipt.modelEffectId, receipt.localWork);
    return { receipt, review, producer, settlement, draft, retrievalCompletions, modelEffectId: receipt.modelEffectId };
}
