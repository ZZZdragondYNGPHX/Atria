import { assertObject, assertCounter, assertDigest } from '../../../public/shared/native-orchestration-contracts.js';
import { assertNativeId } from '../identity.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { rpNativeOutputKey, rpNativeOutputOperationId, assertRpOutputReceipts, rpNarrationPayload } from '../rp-output-protocol.js';
import { checkedRecord } from './plan-repository.js';
import { controlRecordKey, readAttempt } from './controller-common.js';
import { readRpNarrationResult } from './rp-narration-result-contracts.js';
import { readEffect } from './effect-contracts.js';
import { attemptReceiptId, readAttemptSettlement } from './attempt-settlement.js';
import { assertBudgetAttemptRef, assertBudgetAuthorityRef } from './budget-port.js';
import { readRpPlannerCompletion } from './rp-planner-contracts.js';

const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid RP output completion facts'); };
export const rpOutputKey = root => rpNativeOutputKey(root.sourceBinding.sourceRequest.controlId, root.sourceBinding.sourceRequest.source);
export const rpOutputClaimId = root => 'oclaim_' + hash({ kind: 'rp_output_claim', runId: root.runId, outputKey: rpOutputKey(root) }).slice(0, 32);
export const rpOutputReceiptId = runId => 'oreceipt_' + hash({ kind: 'rp_output', runId }).slice(0, 32);
export const rpOutputClosureId = runId => 'oreceipt_' + hash({ kind: 'rp_output_costs_closed', runId }).slice(0, 32);
export const rpOutputDomainRef = root => ({ domain: 'rp_chat', controlId: root.sourceBinding.sourceRequest.controlId,
    outputKey: rpOutputKey(root), operationId: rpNativeOutputOperationId(rpOutputKey(root)) });
export const rpOutputConsumer = root => ({ kind: 'rp_chat', controlId: root.sourceBinding.sourceRequest.controlId,
    nodeId: root.graph.outputContract.ownerNodeId, slot: 'assistant' });

/** Historical consistency only; it issues no current body or execution capability. */
export async function readRpOutput(tx, handle, root) {
    if (root.graph.outputContract.kind !== 'rp_narration' || root.sourceBinding.sourceAuthority !== 'rp_chat' || root.parentRef !== null) return null;
    const claimId = rpOutputClaimId(root), claimRow = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'output', claimId));
    const receiptRow = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', rpOutputReceiptId(root.runId)));
    const closureRow = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', rpOutputClosureId(root.runId)));
    if (!claimRow && !receiptRow && !closureRow && !root.outputClaims.length) return null;
    if (!claimRow || !receiptRow || !closureRow || !equal(root.outputClaims, [{ runId: root.runId, claimId }])) invalid();
    const claim = claimRow.doc, receipt = receiptRow.doc, closure = closureRow.doc, domainRef = rpOutputDomainRef(root);
    assertObject(claim, ['schemaVersion', 'claimId', 'runId', 'nodeAttemptId', 'outputKey', 'sourceBindingDigest', 'resultRef',
        'consumerRef', 'operationRef', 'status', 'domainReceiptRef'], 'RP OutputClaim');
    if (claim.schemaVersion !== 1 || claim.runId !== root.runId || claim.claimId !== claimId || claim.outputKey !== rpOutputKey(root)
        || claim.sourceBindingDigest !== root.sourceBinding.bindingDigest || claim.status !== 'committed'
        || !equal(claim.consumerRef, rpOutputConsumer(root)) || !equal(claim.operationRef, { kind: 'native_rp_output', ...domainRef })
        || !equal(claim.domainReceiptRef, domainRef)) invalid();
    assertNativeId(claim.nodeAttemptId, 'orchestrationAttempt');
    assertObject(receipt, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'graphRevision', 'claimRef', 'claimIntegrity',
        'publicationReceiptRef', 'producerReceiptRef', 'traversalReceiptRef', 'outputAttemptReceiptRef', 'outputEffectId', 'outputEffectReceiptRef',
        'domainReceiptIntegrity', 'budgetClosureReceiptRef', 'decisionSeq', 'createdAt'], 'RP output receipt');
    assertObject(closure, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'authorityRef', 'effectIds',
        'budgetAttemptRefs', 'snapshotDigest', 'decisionSeq', 'createdAt'], 'RP output cost closure');
    for (const row of [receipt, closure]) {
        assertCounter(row.epoch, 'epoch'); assertCounter(row.decisionSeq, 'decisionSeq', 1); assertCounter(row.createdAt, 'createdAt');
        if (row.schemaVersion !== 1 || row.runId !== root.runId || row.epoch > root.epoch || row.decisionSeq > root.eventSeq) invalid();
    }
    assertCounter(receipt.graphRevision, 'graphRevision'); assertDigest(closure.snapshotDigest, 'snapshotDigest');
    assertDigest(receipt.claimIntegrity, 'claimIntegrity'); assertDigest(receipt.domainReceiptIntegrity, 'domainReceiptIntegrity');
    for (const field of ['publicationReceiptRef', 'producerReceiptRef', 'traversalReceiptRef', 'outputAttemptReceiptRef', 'outputEffectReceiptRef', 'budgetClosureReceiptRef']) {
        assertObject(receipt[field], ['runId', 'receiptId'], field); assertNativeId(receipt[field].receiptId, 'orchestrationReceipt');
        if (receipt[field].runId !== root.runId) invalid();
    }
    if (receipt.receiptKind !== 'rp_output' || receipt.receiptId !== rpOutputReceiptId(root.runId) || receipt.graphRevision > root.graphRevision
        || !equal(receipt.claimRef, { runId: root.runId, claimId }) || receipt.claimIntegrity !== claimRow.integrity
        || closure.receiptKind !== 'rp_output_costs_closed' || closure.receiptId !== rpOutputClosureId(root.runId)
        || receipt.budgetClosureReceiptRef.receiptId !== closure.receiptId || closure.epoch !== receipt.epoch
        || closure.decisionSeq !== receipt.decisionSeq || closure.createdAt !== receipt.createdAt || !equal(closure.authorityRef, root.budgetAuthorityRef)) invalid();
    assertBudgetAuthorityRef(closure.authorityRef);
    const published = await readRpNarrationResult(tx, handle, root);
    if (!published || !equal(claim.resultRef, published.receipt.resultRef) || published.receipt.epoch !== receipt.epoch
        || receipt.publicationReceiptRef.receiptId !== published.receipt.receiptId || receipt.producerReceiptRef.receiptId !== published.settlement.receiptId) invalid();
    const output = (await readAttempt(tx, handle, root, claim.nodeAttemptId)).doc;
    const settlement = await readAttemptSettlement(tx, handle, root, output);
    if (output.nodeId !== root.graph.outputContract.ownerNodeId || output.status !== 'completed' || output.epoch !== receipt.epoch
        || output.graphRevision !== receipt.graphRevision || output.effectiveGrantDigest !== published.receipt.grantDigest
        || !equal(output.inputRefs, [claim.resultRef]) || output.inputDigest !== hash([claim.resultRef]) || !equal(output.resultRefs, [claim.resultRef])
        || !equal(output.budgetRef, root.budgetAuthorityRef) || !equal(output.effectRefs, [receipt.outputEffectId])
        || settlement.reasonCode !== 'rp_output_committed' || settlement.decisionSeq !== receipt.decisionSeq || settlement.createdAt !== receipt.createdAt
        || !equal(settlement.effectReceiptRefs, [receipt.outputEffectReceiptRef.receiptId])
        || receipt.outputAttemptReceiptRef.receiptId !== attemptReceiptId(root.runId, output.attemptId)) invalid();
    const intent = (await readEffect(tx, handle, root, receipt.outputEffectId)).doc;
    const control = await checkedRecord(tx, { kind: K.rpRunControl, handle, controlId: domainRef.controlId });
    if (!control || control.doc.schemaVersion !== 1 || control.doc.controlId !== domainRef.controlId) invalid();
    assertRpOutputReceipts(control.doc);
    const original = control.doc.outputReceipts[claim.outputKey];
    if (!original || original.status !== 'committed' || !equal(original.domainReceipt.controlId, domainRef.controlId)
        || hash(original.domainReceipt) !== receipt.domainReceiptIntegrity || original.operationId !== domainRef.operationId
        || original.sourceDigest !== root.sourceBinding.sourceRef.prefixDigest || !equal(original.source, root.sourceBinding.sourceRequest.source)
        || original.payloadHash !== hash(rpNarrationPayload({ controlId: domainRef.controlId, source: original.source, text: published.record.payload }))
        || !equal(original.hostFence, { hostBootId: intent.hostBootId, generation: intent.hostGeneration })) invalid();
    if (intent.status !== 'confirmed' || intent.nodeAttemptId !== output.attemptId || intent.epoch !== receipt.epoch || intent.graphRevision !== receipt.graphRevision
        || intent.sourceBindingDigest !== root.sourceBinding.bindingDigest || intent.grantDigest !== output.effectiveGrantDigest
        || intent.capability !== 'chat.output' || intent.risk !== 'R2' || intent.requiresApproval || intent.approvalRef !== null || !intent.dispatchToken
        || !equal(intent.actionRef, { kind: 'native_rp_output', controlId: domainRef.controlId })
        || !equal(intent.targetRef, { kind: 'rp_chat', controlId: domainRef.controlId, outputKey: claim.outputKey })
        || intent.inputHash !== hash(intent.inputRef) || intent.inputRef.kind !== 'native_rp_narration'
        || !equal(intent.inputRef.resultRef, claim.resultRef) || intent.inputRef.payloadHash !== original.payloadHash
        || intent.inputRef.sourceDigest !== original.sourceDigest || intent.inputRef.modelEffectId !== published.receipt.modelEffectId
        || !equal(intent.inputRef.modelReceiptRef, published.receipt.modelReceiptRef) || !equal(intent.inputRef.inputAnchor, original.inputAnchor)
        || intent.inputRef.controlId !== domainRef.controlId || intent.inputRef.outputKey !== claim.outputKey || intent.inputRef.operationId !== domainRef.operationId
        || !equal(intent.dispatchPolicy, { idempotency: 'domain_key', operationKey: domainRef.operationId, reconcile: 'domain_status' })) invalid();
    const host = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', receipt.outputEffectReceiptRef.receiptId)))?.doc;
    if (!host) invalid();
    assertObject(host, ['schemaVersion', 'receiptId', 'effectId', 'runId', 'observationId', 'observedEpoch', 'outcome', 'dispatchEvidence', 'remoteOperationRef',
        'domainReceiptRef', 'budgetObservationRef', 'resultRefs', 'sourceRefs', 'reasonCode', 'observedAt'], 'RP Host Effect receipt');
    assertCounter(host.observedAt, 'observedAt');
    const hostReceiptId = 'oreceipt_' + hash({ effectId: intent.effectId, observationId: 'rp.output:' + intent.effectId }).slice(0, 32);
    if (host.schemaVersion !== 1 || host.receiptId !== hostReceiptId || receipt.outputEffectReceiptRef.receiptId !== hostReceiptId
        || host.runId !== root.runId || host.effectId !== intent.effectId || host.observationId !== 'rp.output:' + intent.effectId || host.observedEpoch !== receipt.epoch
        || host.outcome !== 'confirmed' || host.remoteOperationRef !== null || !equal(host.domainReceiptRef, domainRef)
        || !equal(host.dispatchEvidence, { kind: 'original_domain_receipt', reference: { ...domainRef, receiptIntegrity: hash(original) } })
        || !equal(host.sourceRefs, [root.sourceBinding.sourceRef]) || !equal(host.resultRefs, []) || host.reasonCode !== 'rp_output_committed'
        || host.observedAt > receipt.createdAt || host.budgetObservationRef.status !== 'settled'
        || !equal(Object.fromEntries(Object.keys(intent.budgetAttemptRef).map(field => [field, host.budgetObservationRef[field]])), intent.budgetAttemptRef)) invalid();
    const planner = await readRpPlannerCompletion(tx, handle, root), modelIds = [published.receipt.modelEffectId, ...(planner?.history.map(item => item.modelEffectId) ?? []),
        ...published.graphResults.map(item => item.receipt.modelEffectId), ...published.reviewCompletions.map(item => item.modelEffectId),
        ...(published.judgeCompletion ? [published.judgeCompletion.modelEffectId] : [])];
    if (!equal(closure.effectIds, [...modelIds, intent.effectId].sort()) || !Array.isArray(closure.budgetAttemptRefs)) invalid();
    const ids = new Set();
    for (const ref of closure.budgetAttemptRefs) {
        assertBudgetAttemptRef(ref);
        if (!equal(ref.authorityRef, root.budgetAuthorityRef) || !closure.effectIds.includes(ref.effectId) || ref.reservationId !== null || ids.has(ref.attemptId)) invalid();
        ids.add(ref.attemptId);
    }
    const sends = closure.budgetAttemptRefs.filter(ref => ref.kind !== 'local_work');
    const local = closure.budgetAttemptRefs.filter(ref => ref.kind === 'local_work');
    if (sends.length !== modelIds.length || modelIds.some(id => !sends.some(ref => ref.effectId === id && ref.providerSendOrdinal === 0))
        || !local.some(ref => ref.effectId === published.receipt.modelEffectId && ref.localWorkOrdinal === 0)
        || local.filter(ref => ref.effectId === intent.effectId).length !== 1 || !local.some(ref => equal(ref, intent.budgetAttemptRef))) invalid();
    const edge = root.graph.edges.find(item => item.from.nodeId === published.producer.nodeId && item.to.nodeId === output.nodeId);
    const bindings = edge ? [{ edgeId: edge.edgeId, producerAttemptId: published.producer.attemptId }] : [];
    const traversalId = 'oreceipt_' + hash({ runId: root.runId, bindings, reservedAttemptId: null }).slice(0, 32);
    const traversal = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', traversalId)))?.doc;
    if (!traversal || !edge || receipt.traversalReceiptRef.receiptId !== traversalId) invalid();
    assertObject(traversal, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'graphRevision', 'bindings', 'producerReceiptRefs',
        'nodeAttemptId', 'inputDigest', 'edgeAdmissionRefs', 'edgeVisits', 'loopIterations', 'decisionSeq', 'createdAt'], 'RP output traversal');
    const edgeId = 'oreceipt_' + hash({ kind: 'edge_admission', runId: root.runId, edgeId: edge.edgeId,
        producerAttemptId: published.producer.attemptId, nodeAttemptId: output.attemptId }).slice(0, 32);
    const admission = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', edgeId)))?.doc;
    const completedLoops = planner ? planner.history.length - 1 : 0;
    if (!admission) invalid();
    assertObject(admission, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'graphRevision', 'edgeId', 'producerAttemptId',
        'nodeAttemptId', 'sourceBindingDigest', 'edgeVisit', 'loopIteration', 'decisionSeq', 'createdAt'], 'RP edge admission');
    if (traversal.schemaVersion !== 1 || traversal.receiptKind !== 'graph_transition' || traversal.receiptId !== traversalId
        || traversal.runId !== root.runId || traversal.epoch !== receipt.epoch || traversal.graphRevision !== receipt.graphRevision
        || !equal(traversal.bindings, bindings) || traversal.nodeAttemptId !== output.attemptId || traversal.inputDigest !== output.inputDigest
        || !equal(traversal.producerReceiptRefs, [published.settlement.receiptId]) || !equal(traversal.edgeAdmissionRefs, [edgeId])
        || traversal.decisionSeq <= published.receipt.decisionSeq || traversal.decisionSeq >= receipt.decisionSeq
        || admission.schemaVersion !== 1 || admission.receiptKind !== 'edge_admission' || admission.receiptId !== edgeId
        || admission.runId !== root.runId || admission.epoch !== receipt.epoch || admission.graphRevision !== receipt.graphRevision
        || admission.producerAttemptId !== published.producer.attemptId || admission.nodeAttemptId !== output.attemptId || admission.edgeId !== edge.edgeId
        || admission.sourceBindingDigest !== root.sourceBinding.bindingDigest || admission.decisionSeq !== traversal.decisionSeq
        || admission.createdAt !== traversal.createdAt || admission.edgeVisit !== 1 || admission.loopIteration !== completedLoops
        || root.progress.edgeVisitCounts[edge.edgeId] !== 1 || traversal.edgeVisits[edge.edgeId] !== 1
        || traversal.loopIterations !== completedLoops || root.progress.loopIterations !== completedLoops) invalid();
    return { claim, receipt, closure, published, output, domainReceipt: original.domainReceipt };
}
