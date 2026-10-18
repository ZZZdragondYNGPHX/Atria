import { assertObject, assertCounter, assertDigest } from '../../../public/shared/native-orchestration-contracts.js';
import { assertNativeId } from '../identity.js';
import { hashNativeDocument as hash, equalNativeDocuments as equal } from '../repositories/common.js';
import { controlRecordKey, readAttempt } from './controller-common.js';
import { checkedRecord } from './plan-repository.js';
import { readResultPublication } from './result-publication-contracts.js';
import { readAttemptSettlement, attemptReceiptId } from './attempt-settlement.js';
import { assertBudgetAttemptRef, assertBudgetAuthorityRef } from './budget-port.js';
import { assertSessionDelegatedClosure } from './session-delegation-contracts.js';
import { assertProjectDelegatedClosure } from './project-delegation-contracts.js';
import { isRpDelegatedControlGraph, assertRpDelegatedClosure } from './rp-delegation-control-contracts.js';
import { assertOutputTransition } from './output-transition-contracts.js';

const invalid = () => { throw new TypeError('Invalid task-local output facts'); };
export const taskLocalOutputKey = root => hash({ kind: 'task_local_output', runId: root.runId,
    sourceBindingDigest: root.sourceBinding.bindingDigest, nodeId: root.graph.outputContract.ownerNodeId,
    slot: root.graph.outputContract.slot, consumerRef: taskLocalConsumer(root) });
export const taskLocalConsumer = root => ({ kind: 'parent_attempt', runId: root.parentRef.parentRunId,
    nodeAttemptId: root.parentRef.nodeAttemptId, epoch: root.parentRef.parentEpoch,
    returnContract: root.parentRef.returnContract, sourceBindingDigest: root.sourceBinding.bindingDigest });
export const taskLocalClaimId = root => 'oclaim_' + hash({ kind: 'task_local_output_claim', runId: root.runId, outputKey: taskLocalOutputKey(root) }).slice(0, 32);
export const taskLocalReceiptId = runId => 'oreceipt_' + hash({ kind: 'task_local_output', runId }).slice(0, 32);
export const childClosureReceiptId = runId => 'oreceipt_' + hash({ kind: 'child_budget_closed', runId }).slice(0, 32);

function receiptRef(value, runId) {
    assertObject(value, ['runId', 'receiptId'], 'Output receipt ref');
    assertNativeId(value.receiptId, 'orchestrationReceipt');
    if (value.runId !== runId) invalid();
}

export function assertTaskLocalClaim(claim, root) {
    assertObject(claim, ['schemaVersion', 'claimId', 'runId', 'nodeAttemptId', 'outputKey', 'sourceBindingDigest', 'resultRef',
        'consumerRef', 'operationRef', 'status', 'domainReceiptRef'], 'TaskLocalOutputClaim');
    if (!root.parentRef || claim.schemaVersion !== 1 || claim.runId !== root.runId || claim.claimId !== taskLocalClaimId(root)
        || claim.outputKey !== taskLocalOutputKey(root) || claim.sourceBindingDigest !== root.sourceBinding.bindingDigest
        || !equal(claim.consumerRef, taskLocalConsumer(root)) || !equal(claim.operationRef, { kind: 'task_local_output', runId: root.runId, outputKey: claim.outputKey })
        || claim.status !== 'committed' || claim.domainReceiptRef !== null) invalid();
    assertNativeId(claim.nodeAttemptId, 'orchestrationAttempt');
    assertObject(claim.resultRef, ['runId', 'resultId'], 'Output Result ref');
    assertNativeId(claim.resultRef.resultId, 'orchestrationResult');
    if (claim.resultRef.runId !== root.runId) invalid();
    return claim;
}

/** Historical consistency only. This never reauthorizes a recipient or observes a new bank balance. */
export async function readTaskLocalOutput(tx, handle, root) {
    if (!root.parentRef) return null;
    const claimId = taskLocalClaimId(root), claimRow = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'output', claimId));
    const outputRow = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', taskLocalReceiptId(root.runId)));
    const closedRow = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', childClosureReceiptId(root.runId)));
    if (!claimRow && !outputRow && !closedRow && !root.outputClaims.length) return null;
    if (!claimRow || !outputRow || !closedRow || !equal(root.outputClaims, [{ runId: root.runId, claimId }])) invalid();
    const claim = assertTaskLocalClaim(claimRow.doc, root), receipt = outputRow.doc, closure = closedRow.doc;
    assertObject(receipt, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'graphRevision', 'claimRef', 'claimIntegrity',
        'publicationReceiptRef', 'traversalReceiptRef', 'producerReceiptRef', 'outputAttemptReceiptRef', 'budgetClosureReceiptRef',
        'decisionSeq', 'createdAt'], 'TaskLocalOutputReceipt');
    assertObject(closure, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'authorityRef', 'reservationId',
        'parentReservationId', 'budgetCeilingDigest', 'reservationRefs', 'budgetAttemptRefs', 'snapshotDigest', 'decisionSeq', 'createdAt'], 'ChildBudgetClosedReceipt');
    for (const row of [receipt, closure]) {
        if (row.schemaVersion !== 1 || row.runId !== root.runId) invalid();
        assertCounter(row.epoch, 'output epoch'); assertCounter(row.decisionSeq, 'output sequence', 1); assertCounter(row.createdAt, 'createdAt');
        if (row.epoch > root.epoch || row.decisionSeq > root.eventSeq) invalid();
    }
    if (receipt.receiptKind !== 'task_local_output' || receipt.receiptId !== taskLocalReceiptId(root.runId)
        || !equal(receipt.claimRef, { runId: root.runId, claimId }) || receipt.claimIntegrity !== claimRow.integrity
        || receipt.graphRevision > root.graphRevision || closure.receiptKind !== 'child_budget_closed'
        || closure.receiptId !== childClosureReceiptId(root.runId) || closure.reservationId !== root.runId
        || closure.parentReservationId !== (root.parentRef.depth === 1 ? null : root.parentRef.parentRunId)
        || closure.budgetCeilingDigest !== hash(root.parentRef.budgetCeiling) || !equal(closure.authorityRef, root.budgetAuthorityRef)
        || closure.epoch !== receipt.epoch || closure.decisionSeq !== receipt.decisionSeq || closure.createdAt !== receipt.createdAt) invalid();
    assertBudgetAuthorityRef(closure.authorityRef); assertDigest(closure.snapshotDigest, 'closure snapshot');
    if (!Array.isArray(closure.reservationRefs) || !closure.reservationRefs.length || !Array.isArray(closure.budgetAttemptRefs)) invalid();
    const ids = new Set();
    for (const row of closure.reservationRefs) {
        assertObject(row, ['reservationId', 'parentReservationId', 'status'], 'Closed reservation ref');
        assertNativeId(row.reservationId, 'orchestrationRun');
        if (row.status !== 'released' || ids.has(row.reservationId)) invalid();
        ids.add(row.reservationId);
    }
    if (!closure.reservationRefs.some(row => row.reservationId === root.runId && row.parentReservationId === closure.parentReservationId)
        || closure.reservationRefs.some(row => row.reservationId !== root.runId && !ids.has(row.parentReservationId))) invalid();
    const budgetIds = new Set();
    for (const row of closure.budgetAttemptRefs) {
        assertBudgetAttemptRef(row);
        if (!equal(row.authorityRef, root.budgetAuthorityRef) || !ids.has(row.reservationId) || budgetIds.has(row.attemptId)) invalid();
        budgetIds.add(row.attemptId);
    }
    for (const field of ['publicationReceiptRef', 'traversalReceiptRef', 'producerReceiptRef', 'outputAttemptReceiptRef', 'budgetClosureReceiptRef']) receiptRef(receipt[field], root.runId);
    if (receipt.budgetClosureReceiptRef.receiptId !== closure.receiptId) invalid();
    const published = await readResultPublication(tx, handle, root, claim.resultRef.resultId);
    const output = (await readAttempt(tx, handle, root, claim.nodeAttemptId)).doc;
    const settled = await readAttemptSettlement(tx, handle, root, output);
    if (!published || receipt.publicationReceiptRef.receiptId !== published.receipt.receiptId
        || receipt.producerReceiptRef.receiptId !== published.attemptReceipt.receiptId
        || receipt.outputAttemptReceiptRef.receiptId !== attemptReceiptId(root.runId, output.attemptId)
        || output.nodeId !== root.graph.outputContract.ownerNodeId || output.status !== 'completed' || output.epoch !== receipt.epoch
        || output.graphRevision !== receipt.graphRevision || output.effectRefs.length || output.effectiveGrantDigest !== root.parentRef.effectiveGrantDigest
        || !equal(output.budgetRef, root.budgetAuthorityRef) || !equal(output.inputRefs, [claim.resultRef]) || output.inputDigest !== hash([claim.resultRef])
        || !equal(output.resultRefs, [claim.resultRef]) || settled.effectReceiptRefs.length || settled.decisionSeq !== receipt.decisionSeq
        || settled.createdAt !== receipt.createdAt || published.receipt.epoch !== receipt.epoch) invalid();
    if (['native_session', 'project'].includes(root.sourceBinding.sourceAuthority)) {
        const producer = (await readAttempt(tx, handle, root, published.receipt.producerAttemptId)).doc;
        await assertOutputTransition(tx, handle, root, { published: { ...published, producer, settlement: published.attemptReceipt }, output, receipt });
        (root.sourceBinding.sourceAuthority === 'native_session' ? assertSessionDelegatedClosure : assertProjectDelegatedClosure)(root, published.graphHistory, closure);
        return { claim, receipt, closure, publication: published };
    }
    if (isRpDelegatedControlGraph(root)) {
        await assertOutputTransition(tx, handle, root,
            { published: { ...published, settlement: published.attemptReceipt }, output, receipt });
        assertRpDelegatedClosure(root, published.graphHistory, closure);
        return { claim, receipt, closure, publication: published };
    }
    const traversal = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', receipt.traversalReceiptRef.receiptId)))?.doc;
    const producer = (await readAttempt(tx, handle, root, published.receipt.producerAttemptId)).doc;
    const graphEdge = root.graph.edges.find(item => item.from.nodeId === producer.nodeId && item.to.nodeId === output.nodeId);
    const bindings = graphEdge ? [{ edgeId: graphEdge.edgeId, producerAttemptId: producer.attemptId }] : [];
    const traversalId = 'oreceipt_' + hash({ runId: root.runId, bindings, reservedAttemptId: null }).slice(0, 32);
    if (!traversal || !graphEdge || traversal.receiptId !== traversalId || receipt.traversalReceiptRef.receiptId !== traversalId) invalid();
    assertObject(traversal, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'graphRevision', 'bindings', 'producerReceiptRefs',
        'nodeAttemptId', 'inputDigest', 'edgeAdmissionRefs', 'edgeVisits', 'loopIterations', 'decisionSeq', 'createdAt'], 'Output graph traversal');
    if (traversal.schemaVersion !== 1 || traversal.receiptKind !== 'graph_transition' || traversal.runId !== root.runId
        || traversal.epoch !== receipt.epoch || traversal.graphRevision !== receipt.graphRevision || !equal(traversal.bindings, bindings)
        || traversal.nodeAttemptId !== output.attemptId || traversal.inputDigest !== output.inputDigest
        || !equal(traversal.producerReceiptRefs, [published.attemptReceipt.receiptId])
        || traversal.decisionSeq > receipt.decisionSeq || traversal.decisionSeq <= published.receipt.decisionSeq
        || !Array.isArray(traversal.edgeAdmissionRefs) || traversal.edgeAdmissionRefs.length !== 1) invalid();
    const edgeId = 'oreceipt_' + hash({ kind: 'edge_admission', runId: root.runId, edgeId: graphEdge.edgeId,
        producerAttemptId: producer.attemptId, nodeAttemptId: output.attemptId }).slice(0, 32);
    const admitted = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', edgeId)))?.doc;
    if (!admitted) invalid();
    assertObject(admitted, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'graphRevision', 'edgeId', 'producerAttemptId',
        'nodeAttemptId', 'sourceBindingDigest', 'edgeVisit', 'loopIteration', 'decisionSeq', 'createdAt'], 'Output edge admission');
    if (!equal(traversal.edgeAdmissionRefs, [edgeId]) || admitted.schemaVersion !== 1 || admitted.receiptKind !== 'edge_admission'
        || admitted.receiptId !== edgeId || admitted.runId !== root.runId || admitted.epoch !== receipt.epoch || admitted.graphRevision !== receipt.graphRevision
        || admitted.edgeId !== graphEdge.edgeId || admitted.producerAttemptId !== producer.attemptId || admitted.nodeAttemptId !== output.attemptId
        || admitted.sourceBindingDigest !== root.sourceBinding.bindingDigest || admitted.decisionSeq !== traversal.decisionSeq
        || admitted.createdAt !== traversal.createdAt || admitted.edgeVisit !== 1 || admitted.loopIteration !== 0
        || traversal.edgeVisits[graphEdge.edgeId] !== 1 || root.progress.edgeVisitCounts[graphEdge.edgeId] !== 1 || traversal.loopIterations !== 0) invalid();
    const modelRefs = closure.budgetAttemptRefs.filter(row => row.kind !== 'local_work');
    if (modelRefs.length !== 1 || modelRefs[0].effectId !== published.receipt.effectId || modelRefs[0].providerSendOrdinal !== 0
        || closure.budgetAttemptRefs.some(row => row.effectId !== published.receipt.effectId || row.reservationId !== root.runId)) invalid();
    return { claim, receipt, closure };
}
