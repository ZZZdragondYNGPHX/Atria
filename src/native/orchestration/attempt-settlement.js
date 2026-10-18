import { assertNativeId } from '../identity.js';
import { assertObject, assertCounter, assertToken } from '../../../public/shared/native-orchestration-contracts.js';
import { equalNativeDocuments, hashNativeDocument, putImmutable, putMutable } from '../repositories/common.js';
import { checkedRecord } from './plan-repository.js';
import { controlRecordKey } from './controller-common.js';

export const SETTLED_ATTEMPT_STATUSES = Object.freeze(['completed', 'partial', 'failed', 'cancelled', 'stale']);
export const attemptReceiptId = (runId, attemptId) => 'oreceipt_' + hashNativeDocument({ kind: 'node_attempt', runId, attemptId }).slice(0, 32);

export function assertResultRefs(refs) {
    if (!Array.isArray(refs)) throw new TypeError('ResultRefs must be an array');
    const seen = new Set();
    for (const ref of refs) {
        assertObject(ref, ['runId', 'resultId'], 'ResultRef');
        assertNativeId(ref.runId, 'orchestrationRun'); assertNativeId(ref.resultId, 'orchestrationResult');
        const digest = hashNativeDocument(ref);
        if (seen.has(digest)) throw new TypeError('Duplicate ResultRef');
        seen.add(digest);
    }
}

/** Called only after the Host controller has checked original authority/effects. */
export async function writeAttemptSettlement({ tx, handle, root, record, outcome, resultRefs, effectReceiptRefs, reasonCode, now }) {
    if (!SETTLED_ATTEMPT_STATUSES.includes(outcome) || SETTLED_ATTEMPT_STATUSES.includes(record.doc.status)) throw new TypeError('Invalid Attempt settlement transition');
    if (record.doc.inputState === 'reserved' && (!['cancelled', 'stale'].includes(outcome) || resultRefs.length || effectReceiptRefs.length)) throw new TypeError('Unprepared reservation cannot produce a result');
    assertResultRefs(resultRefs);
    for (const ref of effectReceiptRefs) assertNativeId(ref, 'orchestrationReceipt');
    if (new Set(effectReceiptRefs).size !== effectReceiptRefs.length) throw new TypeError('Duplicate EffectReceipt');
    if (reasonCode !== null) assertToken(reasonCode, 'reasonCode');
    const attempt = record.doc, receiptId = attemptReceiptId(root.runId, attempt.attemptId);
    const receipt = { schemaVersion: 1, receiptKind: 'node_attempt', receiptId, runId: root.runId, nodeAttemptId: attempt.attemptId,
        epoch: attempt.epoch, graphRevision: attempt.graphRevision, sourceBindingDigest: attempt.sourceBindingDigest, inputState: attempt.inputState, inputDigest: attempt.inputDigest,
        outcome, resultRefs, effectReceiptRefs, decisionSeq: root.eventSeq + 1, reasonCode, createdAt: now };
    await putImmutable(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId), receipt);
    await putMutable(tx, controlRecordKey(handle, root.runId, 'attempt', attempt.attemptId), { ...attempt, status: outcome, resultRefs, endedAt: now, reasonCode }, { expectedIntegrity: record.integrity });
    return receipt;
}

export async function readAttemptSettlement(tx, handle, root, attempt) {
    const receiptId = attemptReceiptId(root.runId, attempt.attemptId);
    const record = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId));
    if (!record) throw new TypeError('Settled Attempt lacks an immutable receipt');
    const receipt = record.doc;
    assertObject(receipt, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'nodeAttemptId', 'epoch', 'graphRevision', 'sourceBindingDigest', 'inputState', 'inputDigest', 'outcome', 'resultRefs', 'effectReceiptRefs', 'decisionSeq', 'reasonCode', 'createdAt'], 'NodeAttemptReceipt');
    if (receipt.schemaVersion !== 1 || receipt.receiptKind !== 'node_attempt' || receipt.receiptId !== receiptId || receipt.runId !== root.runId
        || receipt.nodeAttemptId !== attempt.attemptId || receipt.epoch !== attempt.epoch || receipt.graphRevision !== attempt.graphRevision
        || receipt.sourceBindingDigest !== attempt.sourceBindingDigest || receipt.inputState !== attempt.inputState || receipt.inputDigest !== attempt.inputDigest
        || !SETTLED_ATTEMPT_STATUSES.includes(receipt.outcome) || receipt.outcome !== attempt.status
        || !equalNativeDocuments(receipt.resultRefs, attempt.resultRefs) || receipt.createdAt !== attempt.endedAt
        || receipt.reasonCode !== attempt.reasonCode) throw new TypeError('Attempt receipt identity/state mismatch');
    assertResultRefs(receipt.resultRefs);
    assertCounter(receipt.decisionSeq, 'decisionSeq', 1); assertCounter(receipt.createdAt, 'createdAt');
    if (receipt.decisionSeq > root.eventSeq) throw new TypeError('Attempt receipt is ahead of the durable Run');
    if (!Array.isArray(receipt.effectReceiptRefs)) throw new TypeError('Invalid EffectReceipt references');
    for (const ref of receipt.effectReceiptRefs) assertNativeId(ref, 'orchestrationReceipt');
    if (new Set(receipt.effectReceiptRefs).size !== receipt.effectReceiptRefs.length) throw new TypeError('Duplicate EffectReceipt');
    if (receipt.reasonCode !== null) assertToken(receipt.reasonCode, 'reasonCode');
    return receipt;
}
