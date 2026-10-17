import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { hashNativeDocument } from '../repositories/common.js';
import { checkedRecord } from './plan-repository.js';
import { assertObject, assertCounter, assertDigest } from '../../../public/shared/native-orchestration-contracts.js';
import { assertNativeId } from '../identity.js';
import { ConflictError } from '../../storage/errors.js';

export const controlCommandId = (operation, identity) => 'ocmd_' + hashNativeDocument({ operation, identity }).slice(0, 32);
export const runGuard = root => ({ runId: root.runId, expectedEpoch: root.epoch, expectedStateVersion: root.stateVersion, expectedGraphRevision: root.graphRevision });
export const controlRecordKey = (handle, runId, recordType, recordId) => ({ kind: K.orchestrationRecord, handle, runId, recordType, recordId });
export const attemptInvalidationId = (runId, attemptId) => 'oreceipt_' + hashNativeDocument({ kind: 'attempt_invalidation', runId, attemptId }).slice(0, 32);
export const graphReviewReceiptId = (runId, attemptId) => 'oreceipt_' + hashNativeDocument({ kind: 'graph_review', runId, attemptId }).slice(0, 32);

export async function readGraphReviewReceipt(tx, handle, root, attempt) {
    const id = graphReviewReceiptId(root.runId, attempt.attemptId), record = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', id));
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
    for (const id of [...review.targetAttemptIds, ...review.invalidatedAttemptIds]) if (!root.attemptRefs.includes(id)) throw new TypeError('Graph Review target does not belong to Run');
    return review;
}

/** Historical facts remain readable; live consumers must reject superseded work. */
export async function readAttemptInvalidation(tx, handle, root, attempt) {
    const stored = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', attemptInvalidationId(root.runId, attempt.attemptId)));
    if (!stored) return null;
    const fact = stored.doc;
    assertObject(fact, ['schemaVersion', 'receiptKind', 'runId', 'attemptId', 'reviewReceiptId', 'reviewIntegrity'], 'Attempt invalidation');
    const storedReview = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', fact.reviewReceiptId)))?.doc;
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
    assertNativeId(attemptId, 'orchestrationAttempt');
    if (!root.attemptRefs.includes(attemptId)) throw new TypeError('Attempt does not belong to Run');
    const record = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'attempt', attemptId));
    if (!record) throw new TypeError('Missing Run attempt');
    const attempt = record.doc;
    assertObject(attempt, ['schemaVersion', 'runId', 'nodeId', 'attemptId', 'attemptNumber', 'epoch', 'graphRevision', 'inputState', 'reservationRef', 'inputRefs', 'inputDigest', 'sourceBindingDigest', 'effectiveGrantDigest', 'budgetRef', 'status', 'effectRefs', 'resultRefs', 'startedAt', 'endedAt', 'reasonCode'], 'NodeAttempt');
    if (attempt.schemaVersion !== 1 || attempt.runId !== root.runId || attempt.attemptId !== attemptId || !root.graph.nodes.some(node => node.nodeId === attempt.nodeId)) throw new TypeError('NodeAttempt identity mismatch');
    assertCounter(attempt.attemptNumber, 'attemptNumber', 1); assertCounter(attempt.epoch, 'attempt.epoch'); assertCounter(attempt.graphRevision, 'attempt.graphRevision');
    assertDigest(attempt.sourceBindingDigest, 'sourceBindingDigest');
    if (!['reserved', 'pending', 'running', 'waiting_effect', 'waiting_approval', 'waiting_child', 'blocked', 'completed', 'partial', 'failed', 'cancelled', 'stale'].includes(attempt.status)
        || !Array.isArray(attempt.effectRefs) || !Array.isArray(attempt.resultRefs)) throw new TypeError('Invalid NodeAttempt state');
    if (attempt.reservationRef !== null) {
        assertObject(attempt.reservationRef, ['producerAttemptId'], 'reservationRef');
        assertNativeId(attempt.reservationRef.producerAttemptId, 'orchestrationAttempt');
        if (!root.attemptRefs.includes(attempt.reservationRef.producerAttemptId) || attempt.reservationRef.producerAttemptId === attemptId) throw new TypeError('Invalid reservation producer');
    }
    if (attempt.inputState === 'prepared') {
        assertDigest(attempt.inputDigest, 'inputDigest'); assertDigest(attempt.effectiveGrantDigest, 'effectiveGrantDigest');
        if (attempt.status === 'reserved' || !Array.isArray(attempt.inputRefs) || hashNativeDocument(attempt.inputRefs) !== attempt.inputDigest
            || !attempt.budgetRef || Object.prototype.toString.call(attempt.budgetRef) !== '[object Object]') throw new TypeError('Invalid prepared Attempt inputs');
    } else if (attempt.inputState === 'reserved') {
        if (!attempt.reservationRef || !['reserved', 'blocked', 'cancelled', 'stale'].includes(attempt.status) || attempt.inputRefs !== null || attempt.inputDigest !== null
            || attempt.effectiveGrantDigest !== null || attempt.budgetRef !== null || attempt.effectRefs.length || attempt.resultRefs.length || attempt.startedAt !== null) throw new TypeError('Reserved identity has no executable inputs/grant/budget');
    } else throw new TypeError('Invalid Attempt input state');
    return record;
}
