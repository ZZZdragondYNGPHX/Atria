import { ConflictError } from '../../storage/errors.js';
import { hashNativeDocument } from '../repositories/common.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { checkedRecord } from './plan-repository.js';
import { controlRecordKey } from './controller-common.js';

export const handoffReceiptId = childRunId => 'oreceipt_' + hashNativeDocument({ kind: 'handoff', childRunId }).slice(0, 32);

/** A waiting parent permits only the exact durable child it yielded to. */
export async function readHandoff(tx, handle, parent, attempt, child) {
    const receiptId = handoffReceiptId(child.runId);
    const receipt = (await checkedRecord(tx, controlRecordKey(handle, parent.runId, 'receipt', receiptId)))?.doc;
    if (!receipt) throw new ConflictError('native_orchestration_handoff_unconfirmed');
    assertObject(receipt, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'childRunId', 'parentAttemptId', 'parentEpoch',
        'hostBootId', 'hostGeneration', 'sourceBindingDigest', 'parentGrantDigest', 'childGrantDigest', 'inputDigest',
        'childPlanRef', 'budgetCeilingDigest', 'returnContractDigest', 'entryNodeIds', 'returnNodeId', 'terminalPolicy', 'controlToken', 'decisionSeq', 'createdAt'], 'HandoffReceipt');
    const identity = { parentRunId: parent.runId, parentAttemptId: attempt.attemptId, childRunId: child.runId, parentEpoch: parent.epoch };
    if (receipt.schemaVersion !== 1 || receipt.receiptKind !== 'handoff' || receipt.receiptId !== receiptId
        || receipt.runId !== parent.runId || receipt.childRunId !== child.runId || receipt.parentAttemptId !== attempt.attemptId
        || receipt.parentEpoch !== parent.epoch || receipt.hostBootId !== parent.hostBootId || receipt.hostGeneration !== parent.hostGeneration
        || receipt.sourceBindingDigest !== parent.sourceBinding.bindingDigest || receipt.parentGrantDigest !== attempt.effectiveGrantDigest
        || receipt.childGrantDigest !== child.parentRef.effectiveGrantDigest || receipt.inputDigest !== child.parentRef.inputDigest
        || hashNativeDocument(receipt.childPlanRef) !== hashNativeDocument(child.planRef)
        || receipt.budgetCeilingDigest !== hashNativeDocument(child.parentRef.budgetCeiling)
        || receipt.returnContractDigest !== hashNativeDocument(child.parentRef.returnContract)
        || hashNativeDocument(receipt.entryNodeIds) !== hashNativeDocument(child.graph.entryNodeIds)
        || receipt.returnNodeId !== attempt.nodeId || receipt.terminalPolicy !== 'verified_result_or_failure'
        || receipt.controlToken !== hashNativeDocument(identity) || !Number.isSafeInteger(receipt.decisionSeq)
        || receipt.decisionSeq < 1 || receipt.decisionSeq > parent.eventSeq
        || !Number.isSafeInteger(receipt.createdAt) || receipt.createdAt < 0) throw new ConflictError('native_orchestration_handoff_unconfirmed');
    return receipt;
}
