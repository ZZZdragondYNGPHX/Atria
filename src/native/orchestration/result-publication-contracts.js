import { assertNativeId } from '../identity.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { assertObject, assertCounter, assertDigest } from '../../../public/shared/native-orchestration-contracts.js';
import { checkedRecord } from './plan-repository.js';
import { controlRecordKey, readAttempt } from './controller-common.js';
import { assertResultRecord } from './result-contracts.js';
import { readAttemptSettlement } from './attempt-settlement.js';
import { readEffect } from './effect-contracts.js';
import { handoffReceiptId } from './handoff-contracts.js';
import { childBudgetReceiptId, assertRunRoot } from './run-repository.js';
import { readModelCompletionReceipt } from './model-port.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { readSessionDelegation, sessionDelegationResultSources, readSessionDelegatedGraphHistory } from './session-delegation-contracts.js';
import { readProjectDelegation, readProjectDelegatedGraphHistory } from './project-delegation-contracts.js';

export const modelResultId = (runId, effectId) => 'oresult_' + hash({ runId, effectId }).slice(0, 32);
export const resultPublicationReceiptId = (runId, resultId) => 'oreceipt_' + hash({ kind: 'result_publication', runId, resultId }).slice(0, 32);
const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid Result publication facts'); };
const ref = value => {
    assertObject(value, ['runId', 'receiptId'], 'Result publication receipt reference');
    assertNativeId(value.runId, 'orchestrationRun'); assertNativeId(value.receiptId, 'orchestrationReceipt');
};

export function assertResultPublicationReceipt(receipt) {
    assertObject(receipt, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'producerAttemptId', 'resultRef', 'resultIntegrity',
        'effectId', 'effectReceiptRef', 'handoffReceiptRef', 'delegationReceiptRef', 'budgetReadyReceiptRef', 'sourceBindingDigest',
        'producerGrantDigest', 'audienceDigest', 'decisionSeq', 'createdAt'], 'ResultPublicationReceipt');
    if (receipt.schemaVersion !== 1 || receipt.receiptKind !== 'result_publication') invalid();
    assertNativeId(receipt.runId, 'orchestrationRun'); assertNativeId(receipt.receiptId, 'orchestrationReceipt');
    assertNativeId(receipt.producerAttemptId, 'orchestrationAttempt'); assertNativeId(receipt.effectId, 'orchestrationEffect');
    assertObject(receipt.resultRef, ['runId', 'resultId'], 'Result reference');
    assertNativeId(receipt.resultRef.resultId, 'orchestrationResult');
    if (receipt.resultRef.runId !== receipt.runId || receipt.resultRef.resultId !== modelResultId(receipt.runId, receipt.effectId)
        || receipt.receiptId !== resultPublicationReceiptId(receipt.runId, receipt.resultRef.resultId)) invalid();
    for (const key of ['effectReceiptRef', 'delegationReceiptRef', 'budgetReadyReceiptRef']) ref(receipt[key]);
    if (receipt.handoffReceiptRef !== null) ref(receipt.handoffReceiptRef);
    for (const key of ['resultIntegrity', 'sourceBindingDigest', 'producerGrantDigest', 'audienceDigest']) assertDigest(receipt[key], key);
    assertCounter(receipt.epoch, 'epoch'); assertCounter(receipt.decisionSeq, 'decisionSeq', 1); assertCounter(receipt.createdAt, 'createdAt');
    return receipt;
}

/** Historical protected payload and complete immutable facts; never a recipient grant. */
export async function readResultPublication(tx, handle, root, resultId) {
    assertNativeId(resultId, 'orchestrationResult');
    const result = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'result', resultId));
    const receiptId = resultPublicationReceiptId(root.runId, resultId);
    const publication = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId));
    if (!result && !publication) return null;
    if (!result || !publication || !root.parentRef) invalid();
    const receipt = assertResultPublicationReceipt(publication.doc), envelope = result.doc.envelope;
    assertResultRecord(result.doc, { outputContract: root.graph.outputContract, expected: { runId: root.runId, resultId,
        producerAttemptId: receipt.producerAttemptId, producerEpoch: receipt.epoch,
        sourceBindingDigest: receipt.sourceBindingDigest, sourceRef: root.sourceBinding.sourceRef } });
    if (receipt.runId !== root.runId || receipt.resultIntegrity !== result.integrity || receipt.epoch !== envelope.sourceRefs[0].epoch
        || receipt.sourceBindingDigest !== root.sourceBinding.bindingDigest || receipt.audienceDigest !== hash(envelope.audienceConstraint)
        || receipt.epoch > root.epoch || receipt.decisionSeq > root.eventSeq || !root.resultRefs.some(item => equal(item, receipt.resultRef))
        || envelope.status !== 'complete' || envelope.audienceConstraint.parentRunId !== root.parentRef.parentRunId
        || envelope.audienceConstraint.parentAttemptId !== root.parentRef.nodeAttemptId || envelope.audienceConstraint.parentEpoch !== root.parentRef.parentEpoch
        || envelope.audienceConstraint.taskPurpose !== ({ rp_chat: 'original_rp_delegation', native_session: 'original_native_session_delegation', project: 'original_native_project_delegation' })[root.sourceBinding.sourceAuthority]) invalid();
    const attempt = (await readAttempt(tx, handle, root, receipt.producerAttemptId)).doc;
    const settlement = await readAttemptSettlement(tx, handle, root, attempt);
    const intent = (await readEffect(tx, handle, root, receipt.effectId)).doc;
    const completion = await readModelCompletionReceipt(handle, tx, root, intent);
    if (attempt.status !== 'completed' || attempt.epoch !== receipt.epoch || attempt.graphRevision > root.graphRevision || attempt.effectiveGrantDigest !== receipt.producerGrantDigest
        || !equal(attempt.resultRefs, [receipt.resultRef]) || !equal(attempt.effectRefs, [receipt.effectId])
        || settlement.decisionSeq !== receipt.decisionSeq || settlement.createdAt !== receipt.createdAt
        || !equal(settlement.effectReceiptRefs, [receipt.effectReceiptRef.receiptId])
        || intent.status !== 'confirmed' || intent.epoch !== receipt.epoch || intent.nodeAttemptId !== attempt.attemptId
        || intent.grantDigest !== receipt.producerGrantDigest || intent.sourceBindingDigest !== receipt.sourceBindingDigest
        || !completion || !equal(completion.receiptRef, receipt.effectReceiptRef)
        || receipt.effectReceiptRef.runId !== root.runId
        || !equal(envelope.sourceRefs[1], { kind: 'effect_receipt', runId: root.runId, effectId: receipt.effectId,
            receiptId: receipt.effectReceiptRef.receiptId, observedEpoch: receipt.epoch })) invalid();
    const parentRunId = root.parentRef.parentRunId;
    if (['native_session', 'project'].includes(root.sourceBinding.sourceAuthority)) {
        const session = root.sourceBinding.sourceAuthority === 'native_session';
        const parent = (await checkedRecord(tx, { kind: K.orchestrationRun, handle, runId: parentRunId }))?.doc;
        if (!parent) invalid();
        const lineage = await (session ? readSessionDelegation : readProjectDelegation)(tx, handle, parent, root.runId);
        if (!lineage || attempt.nodeId !== lineage.terminalNodeId || receipt.producerGrantDigest !== root.parentRef.effectiveGrantDigest
            || envelope.audienceConstraint.grantDigest !== lineage.parentAttempt.effectiveGrantDigest
            || !equal(receipt.handoffReceiptRef, lineage.handoffReceiptRef)
            || !equal(receipt.delegationReceiptRef, lineage.delegationReceiptRef)
            || !equal(receipt.budgetReadyReceiptRef, lineage.budgetReadyReceiptRef)
            || lineage.budgetReady.decisionSeq > receipt.decisionSeq
            || !equal(envelope.sourceRefs.slice(2), session ? sessionDelegationResultSources(root, attempt, lineage.plan) : [])
            || !session && (completion.observation.dispatchEvidence.reference.resultOutputType !== 'json'
                || completion.observation.dispatchEvidence.reference.resultPayloadHash !== hash({ text: result.doc.payload, toolCalls: [] }))) invalid();
        const publication = { record: result.doc, receipt, attemptReceipt: settlement, producer: attempt };
        const outputAttempts = [];
        for (const id of root.attemptRefs) {
            const actual = (await readAttempt(tx, handle, root, id)).doc;
            if (actual.nodeId === lineage.output.nodeId) outputAttempts.push(actual);
        }
        if (outputAttempts.length > 1) invalid();
        const graphHistory = await (session ? readSessionDelegatedGraphHistory : readProjectDelegatedGraphHistory)(tx, handle, root, { finalPublication: publication, output: outputAttempts[0] ?? null });
        return { ...publication, graphHistory };
    }
    if (!equal(receipt.handoffReceiptRef, { runId: parentRunId, receiptId: handoffReceiptId(root.runId) })
        || !equal(receipt.delegationReceiptRef, { runId: parentRunId, receiptId: 'oreceipt_' + hash({ kind: 'delegation', childRunId: root.runId }).slice(0, 32) })
        || !equal(receipt.budgetReadyReceiptRef, { runId: root.runId, receiptId: childBudgetReceiptId(root.runId) })) invalid();
    const handoff = (await checkedRecord(tx, controlRecordKey(handle, parentRunId, 'receipt', receipt.handoffReceiptRef.receiptId)))?.doc;
    const delegation = (await checkedRecord(tx, controlRecordKey(handle, parentRunId, 'receipt', receipt.delegationReceiptRef.receiptId)))?.doc;
    const ready = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', receipt.budgetReadyReceiptRef.receiptId)))?.doc;
    if (!handoff || !delegation || !ready) invalid();
    assertObject(handoff, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'childRunId', 'parentAttemptId', 'parentEpoch',
        'hostBootId', 'hostGeneration', 'sourceBindingDigest', 'parentGrantDigest', 'childGrantDigest', 'inputDigest', 'childPlanRef',
        'budgetCeilingDigest', 'returnContractDigest', 'entryNodeIds', 'returnNodeId', 'terminalPolicy', 'controlToken', 'decisionSeq', 'createdAt'], 'Historical HandoffReceipt');
    assertObject(delegation, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'childRunId', 'parentRef', 'budgetCeiling',
        'sourceBindingDigest', 'authorityRef', 'decisionSeq', 'createdAt'], 'Historical delegation receipt');
    assertObject(ready, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'reservationId', 'parentReservationId',
        'authorityRef', 'sourceBindingDigest', 'budgetCeilingDigest', 'decisionSeq', 'createdAt'], 'Historical child budget receipt');
    const parent = (await checkedRecord(tx, { kind: K.orchestrationRun, handle, runId: parentRunId }))?.doc;
    if (!parent) invalid();
    assertRunRoot(parent, handle);
    const parentAttempt = (await readAttempt(tx, handle, parent, root.parentRef.nodeAttemptId)).doc;
    assertCounter(handoff.decisionSeq, 'handoff decisionSeq', 1); assertCounter(handoff.createdAt, 'handoff createdAt');
    assertCounter(ready.decisionSeq, 'budget decisionSeq', 1); assertCounter(ready.createdAt, 'budget createdAt');
    if (handoff.schemaVersion !== 1 || handoff.receiptKind !== 'handoff' || handoff.receiptId !== receipt.handoffReceiptRef.receiptId || handoff.childRunId !== root.runId
        || handoff.runId !== parentRunId || handoff.parentAttemptId !== root.parentRef.nodeAttemptId
        || handoff.parentEpoch !== root.parentRef.parentEpoch || handoff.parentGrantDigest !== envelope.audienceConstraint.grantDigest
        || handoff.childGrantDigest !== receipt.producerGrantDigest || handoff.sourceBindingDigest !== receipt.sourceBindingDigest
        || handoff.hostBootId !== intent.hostBootId || handoff.hostGeneration !== intent.hostGeneration
        || !equal(handoff.childPlanRef, root.planRef) || handoff.inputDigest !== root.parentRef.inputDigest
        || handoff.budgetCeilingDigest !== hash(root.parentRef.budgetCeiling) || handoff.returnContractDigest !== hash(root.parentRef.returnContract)
        || !equal(handoff.entryNodeIds, root.graph.entryNodeIds) || handoff.returnNodeId !== parentAttempt.nodeId
        || handoff.terminalPolicy !== 'verified_result_or_failure' || handoff.decisionSeq > parent.eventSeq
        || handoff.controlToken !== hash({ parentRunId, parentAttemptId: root.parentRef.nodeAttemptId, childRunId: root.runId, parentEpoch: root.parentRef.parentEpoch })
        || parentAttempt.effectiveGrantDigest !== envelope.audienceConstraint.grantDigest || parentAttempt.epoch !== root.parentRef.parentEpoch
        || parent.sourceBinding.bindingDigest !== receipt.sourceBindingDigest || !equal(parent.budgetAuthorityRef, root.budgetAuthorityRef)
        || delegation.schemaVersion !== 1 || delegation.receiptKind !== 'delegation' || delegation.receiptId !== receipt.delegationReceiptRef.receiptId
        || delegation.runId !== parentRunId || delegation.childRunId !== root.runId || !equal(delegation.parentRef, root.parentRef)
        || !equal(delegation.budgetCeiling, root.parentRef.budgetCeiling) || delegation.sourceBindingDigest !== receipt.sourceBindingDigest
        || !equal(delegation.authorityRef, root.budgetAuthorityRef)
        || delegation.decisionSeq !== handoff.decisionSeq || delegation.createdAt !== handoff.createdAt
        || ready.schemaVersion !== 1 || ready.receiptKind !== 'child_budget_ready' || ready.receiptId !== receipt.budgetReadyReceiptRef.receiptId
        || ready.runId !== root.runId || ready.epoch !== receipt.epoch || ready.parentReservationId !== (parent.parentRef ? parentRunId : null)
        || ready.decisionSeq > receipt.decisionSeq
        || ready.reservationId !== root.runId || ready.sourceBindingDigest !== receipt.sourceBindingDigest
        || ready.budgetCeilingDigest !== hash(root.parentRef.budgetCeiling) || !equal(ready.authorityRef, root.budgetAuthorityRef)) invalid();
    return { record: result.doc, receipt, attemptReceipt: settlement };
}
