import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { hashNativeDocument } from '../repositories/common.js';

import { assertObject, assertCounter } from '../../../public/shared/native-orchestration-contracts.js';

import { ConflictError } from '../../storage/errors.js';

export const controlCommandId = (operation, identity) => 'ocmd_' + hashNativeDocument({ operation, identity }).slice(0, 32);
export const runGuard = root => ({ runId: root.runId, expectedEpoch: root.epoch, expectedStateVersion: root.stateVersion, expectedGraphRevision: root.graphRevision });
export const controlRecordKey = (handle, runId, recordType, recordId) => ({ kind: K.orchestrationRecord, handle, runId, recordType, recordId });
export const attemptInvalidationId = (runId, attemptId) => 'oreceipt_' + hashNativeDocument({ kind: 'attempt_invalidation', runId, attemptId }).slice(0, 32);
export const graphReviewReceiptId = (runId, attemptId) => 'oreceipt_' + hashNativeDocument({ kind: 'graph_review', runId, attemptId }).slice(0, 32);
export const reviewAdmissionId = (runId, attemptId) => 'oreceipt_' + hashNativeDocument({ kind: 'review_admission', runId, attemptId }).slice(0, 32);

export async function readReviewAdmission(tx, handle, root, attempt) {
    const receiptId = reviewAdmissionId(root.runId, attempt.attemptId), stored = await tx.getResource(controlRecordKey(handle, root.runId, 'receipt', receiptId));
    if (!stored) return null;
    const receipt = stored.doc;
    assertObject(receipt, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'nodeId', 'nodeAttemptId', 'epoch', 'sourceBindingDigest', 'grantDigest', 'round', 'decisionSeq', 'createdAt'], 'Review admission');
    if (receipt.schemaVersion !== 1 || receipt.receiptKind !== 'review_admission' || receipt.receiptId !== receiptId || receipt.runId !== root.runId
        || receipt.nodeId !== attempt.nodeId || receipt.nodeAttemptId !== attempt.attemptId || receipt.epoch !== attempt.epoch
        || receipt.sourceBindingDigest !== attempt.sourceBindingDigest || receipt.grantDigest !== attempt.effectiveGrantDigest || receipt.createdAt !== attempt.startedAt
        || root.graph.nodes.find(node => node.nodeId === attempt.nodeId)?.kind !== 'review') throw new TypeError('Invalid Review admission facts');
    for (const field of ['round', 'decisionSeq']) assertCounter(receipt[field], field, 1);
    if (receipt.decisionSeq > root.eventSeq) throw new TypeError('Review admission is ahead of durable Run');
    return receipt;
}

export async function readGraphReviewReceipt(tx, handle, root, attempt) {
    const id = graphReviewReceiptId(root.runId, attempt.attemptId), record = await tx.getResource(controlRecordKey(handle, root.runId, 'receipt', id));
    if (!record) return null;
    const review = record.doc;
    assertObject(review, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'graphRevision', 'reviewAttemptId', 'reviewerNodeId',
        'producerInputDigest', 'sourceBindingDigest', 'decision', 'targetAttemptIds', 'reasonCode', 'evidenceRefs', 'invalidatedAttemptIds', 'replacements', 'decisionSeq', 'createdAt'], 'Graph Review receipt');
    if (review.schemaVersion !== 1 || review.receiptKind !== 'graph_review' || review.receiptId !== id || review.runId !== root.runId
        || review.reviewAttemptId !== attempt.attemptId || review.reviewerNodeId !== attempt.nodeId || review.epoch !== attempt.epoch
        || review.graphRevision > root.graphRevision || review.producerInputDigest !== attempt.inputDigest || review.sourceBindingDigest !== attempt.sourceBindingDigest
        || !['approve', 'rerun'].includes(review.decision) || root.graph.nodes.find(node => node.nodeId === attempt.nodeId)?.kind !== 'review'
        || !Array.isArray(review.targetAttemptIds) || !review.targetAttemptIds.length || !Array.isArray(review.evidenceRefs) || !review.evidenceRefs.length
        || !Array.isArray(review.invalidatedAttemptIds) || !Array.isArray(review.replacements)
        || review.decision === 'approve' && (review.invalidatedAttemptIds.length || review.replacements.length)) throw new TypeError('Invalid Graph Review facts');
    for (const field of ['decisionSeq', 'createdAt', 'graphRevision', 'epoch']) assertCounter(review[field], field);
    if (review.decisionSeq > root.eventSeq || review.decisionSeq < 1) throw new TypeError('Graph Review is ahead of durable Run');
    if (!await readReviewAdmission(tx, handle, root, attempt)) throw new TypeError('Graph Review lacks its original admission');
    for (const id of [...review.targetAttemptIds, ...review.invalidatedAttemptIds]) if (!root.attemptRefs.includes(id)) throw new TypeError('Graph Review target does not belong to Run');
    return review;
}

/** Historical facts remain readable; live consumers must reject superseded work. */
export async function readAttemptInvalidation(tx, handle, root, attempt) {
    const stored = await tx.getResource(controlRecordKey(handle, root.runId, 'receipt', attemptInvalidationId(root.runId, attempt.attemptId)));
    if (!stored) return null;
    const fact = stored.doc;
    assertObject(fact, ['schemaVersion', 'receiptKind', 'runId', 'attemptId', 'reviewReceiptId', 'reviewIntegrity'], 'Attempt invalidation');
    const storedReview = (await tx.getResource(controlRecordKey(handle, root.runId, 'receipt', fact.reviewReceiptId)))?.doc;
    const reviewer = storedReview ? (await readAttempt(tx, handle, root, storedReview.reviewAttemptId)).doc : null;
    const review = reviewer ? await readGraphReviewReceipt(tx, handle, root, reviewer) : null;
    if (fact.schemaVersion !== 1 || fact.receiptKind !== 'attempt_invalidation' || fact.runId !== root.runId || fact.attemptId !== attempt.attemptId
        || !review || review.receiptKind !== 'graph_review' || review.runId !== root.runId || review.decision !== 'rerun'
        || hashNativeDocument(review) !== fact.reviewIntegrity || review.decisionSeq > root.eventSeq || !review.invalidatedAttemptIds.includes(attempt.attemptId))
        throw new TypeError('Invalid Attempt invalidation facts');
    return fact;
}

export async function assertAttemptCurrent(tx, handle, root, attempt) {
    if (await readAttemptInvalidation(tx, handle, root, attempt)) throw new ConflictError('native_orchestration_attempt_superseded');
}

export async function assertAttemptConsumable(tx, handle, root, attempt) {
    await assertAttemptCurrent(tx, handle, root, attempt);
    const review = await readGraphReviewReceipt(tx, handle, root, attempt);
    if (root.graph.nodes.find(node => node.nodeId === attempt.nodeId)?.kind === 'review' && !review) throw new ConflictError('native_orchestration_review_decision_required');
    if (review?.decision === 'rerun') throw new ConflictError('native_orchestration_review_rerun_pending');
}

// Passive fanout/join bookkeeping never holds an execution-resource slot.
// Their immutable Plan schema forbids effect capabilities.
export const holdsConcurrencySlot = (root, attempt) => ['running', 'waiting_effect', 'waiting_approval'].includes(attempt.status)
    && !['fanout', 'join'].includes(root.graph.nodes.find(node => node.nodeId === attempt.nodeId)?.kind);

export function graphReachable(graph, from, to) {
    const seen = new Set(), pending = [from];
    while (pending.length) {
        const id = pending.pop();
        if (id === to) return true;
        if (seen.has(id)) continue;
        seen.add(id); pending.push(...graph.edges.filter(edge => edge.from.nodeId === id).map(edge => edge.to.nodeId));
    }
    return false;
}

export async function readAttempt(tx, handle, root, attemptId) {
    const record = await tx.getResource(controlRecordKey(handle, root.runId, 'attempt', attemptId));
    if (!record) throw new TypeError('Missing Run attempt');
    return record;
}
