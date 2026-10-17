import { assertAudienceRunCapture } from './audience-source-contracts.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { controlRecordKey, readAttempt, readGraphReviewReceipt } from './controller-common.js';
import { readAttemptSettlement } from './attempt-settlement.js';
import { readEffect } from './effect-contracts.js';
import { readModelCompletionReceipt } from './model-port.js';
import { RP_REVIEW_REASON_CODES } from './rp-review-profile.js';

const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid Session Review completion facts'); };
export const sessionReviewModelReceiptId = (runId, attemptId) => 'oreceipt_' + hash({ kind: 'session_graph_review_model', runId, attemptId }).slice(0, 32);
export function parseSessionReview(text) {
    const value = JSON.parse(text); assertObject(value, ['decision', 'reasonCode'], 'Session Review');
    if (!['approve', 'rerun'].includes(value.decision) || !RP_REVIEW_REASON_CODES.includes(value.reasonCode)
        || (value.decision === 'approve') !== (value.reasonCode === 'quality_ready')) invalid();
    return value;
}

/** Original Model/Review/Attempt facts only; this grants no current read or redo. */
export async function readSessionReviewCompletion(tx, handle, root, attemptId) {
    const id = sessionReviewModelReceiptId(root.runId, attemptId), stored = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', id));
    if (!stored) return null;
    const receipt = stored.doc;
    assertObject(receipt, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'producerAttemptId', 'sourceBindingDigest', 'grantDigest',
        'modelEffectId', 'modelReceiptRef', 'modelPayloadHash', 'responseText', 'reviewReceiptRef', 'reviewIntegrity', 'decisionSeq', 'createdAt'], 'Session Review Model receipt');
    const producer = (await readAttempt(tx, handle, root, attemptId)).doc, review = await readGraphReviewReceipt(tx, handle, root, producer);
    const intent = (await readEffect(tx, handle, root, receipt.modelEffectId)).doc, model = await readModelCompletionReceipt(handle, tx, root, intent);
    const settlement = await readAttemptSettlement(tx, handle, root, producer), parsed = parseSessionReview(receipt.responseText);
    const input = intent.inputRef, plan = await readPlanRevision(tx, handle, root.planRef);
    const node = root.graph.nodes.find(node => node.nodeId === producer.nodeId), pin = plan.dependencyPins.find(pin => pin.pinId === node.policy.audiencePinId);
    if (root.sourceBinding.sourceAuthority !== 'native_session' || receipt.schemaVersion !== 1 || receipt.receiptKind !== 'session_graph_review_model'
        || receipt.receiptId !== id || receipt.runId !== root.runId || receipt.epoch !== producer.epoch || receipt.epoch > root.epoch
        || receipt.producerAttemptId !== attemptId || producer.status !== 'completed' || root.graph.nodes.find(node => node.nodeId === producer.nodeId)?.kind !== 'review'
        || receipt.sourceBindingDigest !== root.sourceBinding.bindingDigest || receipt.grantDigest !== producer.effectiveGrantDigest
        || !equal(producer.effectRefs, [receipt.modelEffectId]) || !equal(producer.resultRefs, [])
        || !model || !equal(model.receiptRef, receipt.modelReceiptRef) || intent.nodeAttemptId !== attemptId || intent.grantDigest !== producer.effectiveGrantDigest
        || intent.sourceBindingDigest !== root.sourceBinding.bindingDigest || receipt.modelPayloadHash !== hash(receipt.responseText)
        || model.observation.dispatchEvidence.reference.resultPayloadHash !== receipt.modelPayloadHash
        || !review || review.decision !== parsed.decision || review.reasonCode !== parsed.reasonCode || hash(review) !== receipt.reviewIntegrity
        || !equal(receipt.reviewReceiptRef, { runId: root.runId, receiptId: review.receiptId })
        || settlement.reasonCode !== 'session_graph_review_decided' || !equal(settlement.effectReceiptRefs, [receipt.modelReceiptRef.receiptId])
        || settlement.decisionSeq !== receipt.decisionSeq || settlement.createdAt !== receipt.createdAt || receipt.decisionSeq > root.eventSeq) invalid();
    if (input.kind !== 'native_turn_intent' || input.role !== 'narrator' || input.nodeId !== producer.nodeId || !equal(input.planRef, root.planRef)
        || input.grantDigest !== producer.effectiveGrantDigest || !equal(input.audience, pin?.resourceRef.audience)
        || !equal(input.acceptedGraphResultRefs, review.evidenceRefs) || !equal(producer.inputRefs, [input, ...review.evidenceRefs, ...(input.acceptedControlRefs ?? [])])
        || producer.inputDigest !== hash(producer.inputRefs) || review.targetAttemptIds.length !== 1 || review.evidenceRefs.length !== 1) invalid();
    assertAudienceRunCapture(root, node, plan.dependencyPins, input);
    const target = (await readAttempt(tx, handle, root, review.targetAttemptIds[0])).doc;
    if (root.graph.nodes.find(node => node.nodeId === target.nodeId)?.kind !== 'agent' || !equal(target.resultRefs, review.evidenceRefs)
        || target.sourceBindingDigest !== root.sourceBinding.bindingDigest) invalid();
    if (review.decision === 'rerun') {
        if (!review.invalidatedAttemptIds.includes(target.attemptId) || review.replacements.length !== 1 || review.replacements[0].targetAttemptId !== target.attemptId) invalid();
        for (const id of review.invalidatedAttemptIds) {
            const old = (await readAttempt(tx, handle, root, id)).doc;
            if (id === producer.attemptId || ![target.nodeId, producer.nodeId].includes(old.nodeId) || old.status !== 'completed') invalid();
        }
        const next = (await readAttempt(tx, handle, root, review.replacements[0].attemptId)).doc;
        const expected = { ...target.inputRefs[0], reviewFeedbackRef: { reviewReceiptRef: receipt.reviewReceiptRef, reasonCode: parsed.reasonCode } };
        if (next.nodeId !== target.nodeId || !equal(next.inputRefs, [expected, ...target.inputRefs.slice(1)]) || next.inputDigest !== hash(next.inputRefs)
            || next.effectiveGrantDigest !== target.effectiveGrantDigest || !equal(next.budgetRef, root.budgetAuthorityRef)) invalid();
    }
    return { receipt, review, producer, model, settlement };
}
