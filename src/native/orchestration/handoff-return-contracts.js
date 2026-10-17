import { assertObject, assertCounter, assertDigest } from '../../../public/shared/native-orchestration-contracts.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { assertNativeId } from '../identity.js';
import { checkedRecord } from './plan-repository.js';
import { controlRecordKey, readAttempt } from './controller-common.js';
import { handoffReceiptId } from './handoff-contracts.js';
import { readTaskLocalOutput } from './task-local-output-contracts.js';
import { assertRunRoot } from './run-repository.js';
import { readSessionDelegation } from './session-delegation-contracts.js';

export const handoffReturnReceiptId = childRunId => 'oreceipt_' + hash({ kind: 'handoff_return', childRunId }).slice(0, 32);
const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid Handoff return facts'); };

/** Historical return evidence, never a resumed parent capability. */
export async function readHandoffReturn(tx, handle, parent, childRunId) {
    assertNativeId(childRunId, 'orchestrationRun');
    const receiptId = handoffReturnReceiptId(childRunId), saved = await checkedRecord(tx, controlRecordKey(handle, parent.runId, 'receipt', receiptId));
    if (!saved) return null;
    const receipt = saved.doc;
    assertObject(receipt, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'parentAttemptId', 'parentInputDigest',
        'parentGrantDigest', 'childRunId', 'childEpoch', 'childGrantDigest', 'sourceBindingDigest', 'controlToken', 'handoffReceiptRef',
        'outputReceiptRef', 'budgetClosureReceiptRef', 'resultRef', 'resultIntegrity', 'audienceDigest', 'decisionSeq', 'createdAt'], 'HandoffReturnReceipt');
    if (receipt.schemaVersion !== 1 || receipt.receiptKind !== 'handoff_return' || receipt.receiptId !== receiptId
        || receipt.runId !== parent.runId || receipt.childRunId !== childRunId || receipt.sourceBindingDigest !== parent.sourceBinding.bindingDigest) invalid();
    for (const field of ['epoch', 'childEpoch', 'createdAt']) assertCounter(receipt[field], field);
    assertCounter(receipt.decisionSeq, 'return decisionSeq', 1);
    if (receipt.epoch > parent.epoch || receipt.decisionSeq > parent.eventSeq) invalid();
    for (const field of ['parentInputDigest', 'parentGrantDigest', 'childGrantDigest', 'sourceBindingDigest', 'controlToken', 'resultIntegrity', 'audienceDigest']) assertDigest(receipt[field], field);
    for (const field of ['handoffReceiptRef', 'outputReceiptRef', 'budgetClosureReceiptRef']) {
        assertObject(receipt[field], ['runId', 'receiptId'], field); assertNativeId(receipt[field].receiptId, 'orchestrationReceipt');
    }
    assertObject(receipt.resultRef, ['runId', 'resultId'], 'Returned ResultRef');
    assertNativeId(receipt.resultRef.resultId, 'orchestrationResult');
    const child = (await checkedRecord(tx, { kind: K.orchestrationRun, handle, runId: childRunId }))?.doc;
    if (!child) invalid();
    assertRunRoot(child, handle);
    const attempt = (await readAttempt(tx, handle, parent, receipt.parentAttemptId)).doc;
    if (receipt.childEpoch > child.epoch || child.parentRef?.parentRunId !== parent.runId || child.parentRef.nodeAttemptId !== attempt.attemptId
        || child.parentRef.parentEpoch !== receipt.epoch || child.parentRef.effectiveGrantDigest !== receipt.childGrantDigest
        || attempt.epoch !== receipt.epoch || attempt.inputDigest !== receipt.parentInputDigest || attempt.effectiveGrantDigest !== receipt.parentGrantDigest
        || attempt.inputRefs[0]?.kind !== ({ rp_chat: 'native_rp_delegation', native_session: 'native_session_delegation' })[parent.sourceBinding.sourceAuthority]
        || !equal(attempt.inputRefs[0].planRef, parent.planRef)
        || !equal(attempt.inputRefs[0].childPlanRef, child.planRef) || attempt.inputRefs[0].nodeId !== attempt.nodeId
        || !equal(attempt.budgetRef, child.budgetAuthorityRef) || !equal(parent.budgetAuthorityRef, child.budgetAuthorityRef)
        || child.sourceBinding.bindingDigest !== receipt.sourceBindingDigest || child.rootRunId !== parent.rootRunId
        || receipt.controlToken !== hash({ parentRunId: parent.runId, parentAttemptId: attempt.attemptId, childRunId, parentEpoch: receipt.epoch })
        || !equal(receipt.handoffReceiptRef, { runId: parent.runId, receiptId: handoffReceiptId(childRunId) })) invalid();
    const output = await readTaskLocalOutput(tx, handle, child);
    const result = await checkedRecord(tx, controlRecordKey(handle, childRunId, 'result', receipt.resultRef.resultId));
    if (!output || !result || output.receipt.epoch !== receipt.childEpoch || !equal(output.claim.resultRef, receipt.resultRef)
        || !equal(receipt.outputReceiptRef, { runId: childRunId, receiptId: output.receipt.receiptId })
        || !equal(receipt.budgetClosureReceiptRef, { runId: childRunId, receiptId: output.closure.receiptId })
        || result.integrity !== receipt.resultIntegrity || hash(result.doc.envelope.audienceConstraint) !== receipt.audienceDigest
        || !equal(result.doc.envelope.audienceConstraint, { kind: 'parent_attempt', parentRunId: parent.runId, parentAttemptId: attempt.attemptId,
            parentEpoch: receipt.epoch, sourceBindingDigest: receipt.sourceBindingDigest, grantDigest: receipt.parentGrantDigest,
            taskPurpose: parent.sourceBinding.sourceAuthority === 'native_session' ? 'original_native_session_delegation' : 'original_rp_delegation' })) invalid();
    if (parent.sourceBinding.sourceAuthority === 'native_session') {
        // The parent supplied by the return writer may have its staged next
        // event sequence. Lineage is checked against the actual original row.
        const actual = (await checkedRecord(tx, { kind: K.orchestrationRun, handle, runId: parent.runId }))?.doc;
        const lineage = actual && await readSessionDelegation(tx, handle, actual, childRunId);
        if (!lineage || lineage.mode !== 'handoff' || !equal(lineage.handoffReceiptRef, receipt.handoffReceiptRef)) invalid();
    }
    return parent.sourceBinding.sourceAuthority === 'native_session' ? { ...receipt, output, publication: output.publication } : receipt;
}
