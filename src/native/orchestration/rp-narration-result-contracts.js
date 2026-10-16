import { readHandoffReturn } from './handoff-return-contracts.js';
import { assertNativeId } from '../identity.js';
import { assertObject, assertCounter, assertDigest } from '../../../public/shared/native-orchestration-contracts.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { rpNativeOutputKey } from '../rp-output-protocol.js';
import { assertResultRecord, resultDependencyDigest } from './result-contracts.js';
import { modelResultId } from './result-publication-contracts.js';
import { controlRecordKey, readAttempt } from './controller-common.js';
import { checkedRecord } from './plan-repository.js';
import { readAttemptSettlement } from './attempt-settlement.js';
import { readEffect } from './effect-contracts.js';
import { readModelCompletionReceipt } from './model-port.js';

const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid RP Narrator Result facts'); };
export const rpNarrationPublicationId = resultId => 'oreceipt_' + hash({ kind: 'rp_narration_result', resultId }).slice(0, 32);
export const rpNarrationAudience = (root, grantDigest) => ({ kind: 'rp_output', runId: root.runId, nodeId: root.graph.outputContract.ownerNodeId,
    epoch: root.epoch, controlId: root.sourceBinding.sourceRequest.controlId,
    outputKey: rpNativeOutputKey(root.sourceBinding.sourceRequest.controlId, root.sourceBinding.sourceRequest.source),
    sourceBindingDigest: root.sourceBinding.bindingDigest, grantDigest, taskPurpose: 'original_rp_narration' });

export function rpNarrationResult({ root, proof, payload, grantDigest, now }) {
    const resultId = modelResultId(root.runId, proof.effectId), resultRef = { runId: root.runId, resultId };
    const envelope = { schemaVersion: 1, runId: root.runId, resultId, producerAttemptId: proof.producerAttemptId,
        outputType: 'text', outputSchemaRef: { kind: 'native_builtin', schema: 'text' },
        payloadRef: { kind: 'orchestration_result_payload', runId: root.runId, resultId, integrity: proof.payloadHash },
        sourceRefs: [{ kind: 'run_source', runId: root.runId, epoch: root.epoch, sourceBindingDigest: root.sourceBinding.bindingDigest,
            sourceAuthority: 'rp_chat', sourceRef: root.sourceBinding.sourceRef },
        { kind: 'effect_receipt', runId: root.runId, effectId: proof.effectId, receiptId: proof.receiptRef.receiptId, observedEpoch: root.epoch }],
        dependencyDigest: '', audienceConstraint: rpNarrationAudience(root, grantDigest), disclosureConstraint: { kind: 'same_source_rp_output_only' },
        qualityRefs: [], status: 'complete', createdAt: now };
    envelope.dependencyDigest = resultDependencyDigest(envelope);
    return { resultRef, record: assertResultRecord({ schemaVersion: 1, runId: root.runId, resultId, envelope, payload }, { outputContract: root.graph.outputContract }) };
}

/** Historical protected record, not a body-consumption or fresh writer grant. */
export async function readRpNarrationResult(tx, handle, root) {
    if (!root.resultRefs.length) return null;
    if (root.parentRef !== null || root.graph.outputContract.kind !== 'rp_narration' || root.sourceBinding.sourceAuthority !== 'rp_chat'
        || root.resultRefs.length !== 1) invalid();
    const [resultRef] = root.resultRefs;
    const saved = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'result', resultRef.resultId));
    const publication = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', rpNarrationPublicationId(resultRef.resultId)));
    if (!saved || !publication) invalid();
    const record = assertResultRecord(saved.doc, { outputContract: root.graph.outputContract }), receipt = publication.doc;
    assertObject(receipt, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'producerAttemptId', 'resultRef', 'resultIntegrity',
        'modelEffectId', 'modelReceiptRef', 'grantDigest', 'sourceBindingDigest', 'audienceDigest', 'decisionSeq', 'createdAt'], 'RP Narrator publication');
    assertCounter(receipt.epoch, 'epoch'); assertCounter(receipt.decisionSeq, 'decisionSeq', 1); assertCounter(receipt.createdAt, 'createdAt');
    for (const field of ['resultIntegrity', 'grantDigest', 'sourceBindingDigest', 'audienceDigest']) assertDigest(receipt[field], field);
    for (const [field, kind] of [['receiptId', 'orchestrationReceipt'], ['runId', 'orchestrationRun'], ['producerAttemptId', 'orchestrationAttempt'], ['modelEffectId', 'orchestrationEffect']]) assertNativeId(receipt[field], kind);
    assertObject(receipt.modelReceiptRef, ['runId', 'receiptId'], 'RP model receipt');
    if (receipt.modelReceiptRef.runId !== root.runId || resultRef.resultId !== modelResultId(root.runId, receipt.modelEffectId)) invalid();
    assertNativeId(receipt.modelReceiptRef.receiptId, 'orchestrationReceipt');
    const producer = (await readAttempt(tx, handle, root, receipt.producerAttemptId)).doc;
    const settlement = await readAttemptSettlement(tx, handle, root, producer);
    const intent = (await readEffect(tx, handle, root, receipt.modelEffectId)).doc;
    const model = await readModelCompletionReceipt(handle, tx, root, intent);
    const source = root.sourceBinding, audience = { ...rpNarrationAudience(root, producer.effectiveGrantDigest), epoch: receipt.epoch };
    if (receipt.schemaVersion !== 1 || receipt.receiptKind !== 'rp_narration_result' || receipt.receiptId !== rpNarrationPublicationId(resultRef.resultId)
        || receipt.runId !== root.runId || receipt.epoch > root.epoch || receipt.epoch !== producer.epoch || producer.status !== 'completed'
        || !equal(resultRef, receipt.resultRef) || !equal(resultRef, { runId: root.runId, resultId: record.resultId })
        || receipt.resultIntegrity !== saved.integrity || receipt.resultIntegrity !== hash(record) || record.envelope.status !== 'complete'
        || record.envelope.producerAttemptId !== producer.attemptId || !equal(record.envelope.audienceConstraint, audience)
        || receipt.audienceDigest !== hash(audience) || receipt.grantDigest !== producer.effectiveGrantDigest
        || receipt.sourceBindingDigest !== source.bindingDigest || !equal(producer.resultRefs, [resultRef]) || !equal(producer.effectRefs, [receipt.modelEffectId])
        || settlement.reasonCode !== 'rp_narration_ready' || settlement.decisionSeq !== receipt.decisionSeq || settlement.createdAt !== receipt.createdAt
        || receipt.decisionSeq > root.eventSeq || !equal(settlement.effectReceiptRefs, [receipt.modelReceiptRef.receiptId])
        || !model || !equal(model.receiptRef, receipt.modelReceiptRef) || intent.nodeAttemptId !== producer.attemptId
        || intent.epoch !== receipt.epoch || intent.grantDigest !== receipt.grantDigest || intent.sourceBindingDigest !== source.bindingDigest
        || !equal(record.envelope.sourceRefs, [{ kind: 'run_source', runId: root.runId, epoch: receipt.epoch,
            sourceBindingDigest: source.bindingDigest, sourceAuthority: 'rp_chat', sourceRef: source.sourceRef },
        { kind: 'effect_receipt', runId: root.runId, effectId: receipt.modelEffectId, receiptId: receipt.modelReceiptRef.receiptId, observedEpoch: receipt.epoch }])) invalid();
    const input = intent.inputRef;
    if (input.kind !== 'native_rp_intent' || input.nodeId !== producer.nodeId || input.role !== 'narrator'
        || !equal(input.planRef, root.planRef) || !equal(input.sourceRef, source.sourceRef)
        || !equal(input.audience, { kind: 'narrator' }) || producer.inputDigest !== hash(producer.inputRefs)) invalid();
    if (producer.inputRefs[0]?.kind === 'native_rp_delegation') {
        if (producer.inputRefs.length !== 1 || input.parentInputDigest !== producer.inputDigest || !input.acceptedResultRef || !input.returnReceiptRef) invalid();
        const returned = await readHandoffReturn(tx, handle, root, input.acceptedResultRef.runId);
        if (!returned || !equal(returned.resultRef, input.acceptedResultRef)
            || !equal(input.returnReceiptRef, { runId: root.runId, receiptId: returned.receiptId })
            || returned.parentAttemptId !== producer.attemptId || returned.parentGrantDigest !== producer.effectiveGrantDigest
            || returned.decisionSeq >= receipt.decisionSeq) invalid();
    } else if (!equal(producer.inputRefs, [input])) invalid();
    return { record, receipt, settlement, producer };
}
