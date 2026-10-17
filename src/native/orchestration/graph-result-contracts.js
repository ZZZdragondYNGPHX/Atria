import { hashNativeDocument as hash } from '../repositories/common.js';
import { assertObject, assertResultPolicy } from '../../../public/shared/native-orchestration-contracts.js';
import { assertResultRecord, resultDependencyDigest } from './result-contracts.js';
import { modelResultId } from './result-publication-contracts.js';
import { controlRecordKey, readAttempt, assertAttemptConsumable } from './controller-common.js';
import { checkedRecord } from './plan-repository.js';
import { readAttemptSettlement } from './attempt-settlement.js';
import { readEffect } from './effect-contracts.js';
import { readModelCompletionReceipt } from './model-port.js';
import { assertNativeId } from '../identity.js';

const kinds = ['agent', 'planner', 'judge', 'review'];
const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid Graph Result facts'); };
export const graphResultPublicationId = (runId, resultId) => 'oreceipt_' + hash({ kind: 'graph_node_result', runId, resultId }).slice(0, 32);

export function graphResultContract(root, producer) {
    const node = root.graph.nodes.find(item => item.nodeId === producer.nodeId), policy = assertResultPolicy(root.graph.outputContract);
    if (root.sourceBinding.sourceAuthority !== 'rp_chat' || root.parentRef !== null || root.graphRevision !== 0 || producer.graphRevision !== 0
        || root.graph.graphChangePolicy.allowedOperations.length || !kinds.includes(node?.kind)
        || node.outputs.length !== 1 || !['text', 'json'].includes(node.outputs[0].type)) invalid();
    const recipients = root.graph.edges.filter(edge => edge.from.nodeId === node.nodeId && !edge.loopBack).map(edge => root.graph.nodes.find(item => item.nodeId === edge.to.nodeId));
    if (!recipients.length || recipients.some(item => !kinds.includes(item?.kind))) invalid();
    return { output: { kind: 'result', ownerNodeId: node.nodeId, slot: 'graph_result', allowPartial: false,
        resultPolicy: { outputType: node.outputs[0].type, maxBytes: policy.maxBytes } },
    audience: { kind: 'graph_nodes', runId: root.runId, nodeIds: [...new Set(recipients.map(item => item.nodeId))].sort(), epoch: producer.epoch,
        sourceBindingDigest: root.sourceBinding.bindingDigest, grantDigest: producer.effectiveGrantDigest, taskPurpose: 'original_rp_graph_result' } };
}

/** The JSON representation preserves the original generation response, just
 * as the existing Project Result does; control parsing remains separately metered. */
export function graphNodeResult({ root, producer, proof, text, now }) {
    const contract = graphResultContract(root, producer), outputType = contract.output.resultPolicy.outputType;
    if (proof.runId !== root.runId || proof.receiptRef.runId !== root.runId || proof.producerAttemptId !== producer.attemptId || proof.epoch !== producer.epoch || proof.outputType !== 'text' || hash(text) !== proof.payloadHash
        || !equal(proof.sourceBinding, root.sourceBinding)) invalid();
    const resultId = modelResultId(root.runId, proof.effectId), payload = outputType === 'text' ? text : { text, toolCalls: [] };
    const envelope = { schemaVersion: 1, runId: root.runId, resultId, producerAttemptId: producer.attemptId, outputType,
        outputSchemaRef: { kind: 'native_builtin', schema: outputType }, payloadRef: { kind: 'orchestration_result_payload', runId: root.runId, resultId, integrity: hash(payload) },
        sourceRefs: [{ kind: 'run_source', runId: root.runId, epoch: producer.epoch, sourceBindingDigest: root.sourceBinding.bindingDigest,
            sourceAuthority: 'rp_chat', sourceRef: root.sourceBinding.sourceRef },
        { kind: 'effect_receipt', runId: root.runId, effectId: proof.effectId, receiptId: proof.receiptRef.receiptId, observedEpoch: producer.epoch }],
        dependencyDigest: '', audienceConstraint: contract.audience, disclosureConstraint: { kind: 'same_source_graph_successors_only' }, qualityRefs: [], status: 'complete', createdAt: now };
    envelope.dependencyDigest = resultDependencyDigest(envelope);
    return assertResultRecord({ schemaVersion: 1, runId: root.runId, resultId, envelope, payload }, { outputContract: contract.output });
}

/** Historical read; the live recipient separately checks Source/grant/epoch and
 * invalidation. A durable Result or its audience list never grants a new read. */
export async function readGraphNodeResult(tx, handle, root, resultId, { recipient = null } = {}) {
    assertNativeId(resultId, 'orchestrationResult');
    const stored = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'result', resultId));
    const publication = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', graphResultPublicationId(root.runId, resultId)));
    if (!stored && !publication) return null;
    if (!stored || !publication) invalid();
    const receipt = publication.doc;
    assertObject(receipt, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'producerAttemptId', 'resultRef', 'resultIntegrity', 'modelEffectId',
        'modelReceiptRef', 'modelPayloadHash', 'producerGrantDigest', 'sourceBindingDigest', 'audienceDigest', 'decisionSeq', 'createdAt'], 'Graph Result publication');
    const { doc: producer } = await readAttempt(tx, handle, root, receipt.producerAttemptId), contract = graphResultContract(root, producer);
    const record = assertResultRecord(stored.doc, { outputContract: contract.output, expected: { runId: root.runId, resultId, producerAttemptId: producer.attemptId,
        producerEpoch: producer.epoch, sourceBindingDigest: root.sourceBinding.bindingDigest, sourceRef: root.sourceBinding.sourceRef, audienceConstraint: contract.audience } });
    const intent = (await readEffect(tx, handle, root, receipt.modelEffectId)).doc, model = await readModelCompletionReceipt(handle, tx, root, intent);
    const settlement = await readAttemptSettlement(tx, handle, root, producer), text = record.envelope.outputType === 'text' ? record.payload : record.payload.text;
    if (record.envelope.outputType === 'json') { assertObject(record.payload, ['text', 'toolCalls'], 'Graph generation result'); if (!equal(record.payload.toolCalls, [])) invalid(); }
    if (receipt.schemaVersion !== 1 || receipt.receiptKind !== 'graph_node_result' || receipt.receiptId !== graphResultPublicationId(root.runId, resultId)
        || receipt.runId !== root.runId || receipt.epoch !== producer.epoch || receipt.epoch > root.epoch || producer.status !== 'completed'
        || producer.sourceBindingDigest !== root.sourceBinding.bindingDigest || record.envelope.status !== 'complete'
        || receipt.resultIntegrity !== stored.integrity || receipt.producerGrantDigest !== producer.effectiveGrantDigest || receipt.sourceBindingDigest !== root.sourceBinding.bindingDigest
        || receipt.audienceDigest !== hash(contract.audience) || !equal(receipt.resultRef, { runId: root.runId, resultId })
        || resultId !== modelResultId(root.runId, receipt.modelEffectId) || !equal(producer.resultRefs, [receipt.resultRef]) || !root.resultRefs.some(ref => equal(ref, receipt.resultRef))
        || !equal(producer.effectRefs, [receipt.modelEffectId]) || intent.nodeAttemptId !== producer.attemptId || intent.grantDigest !== producer.effectiveGrantDigest
        || intent.epoch !== producer.epoch || intent.sourceBindingDigest !== root.sourceBinding.bindingDigest
        || !equal(record.envelope.sourceRefs[1], { kind: 'effect_receipt', runId: root.runId, effectId: intent.effectId, receiptId: receipt.modelReceiptRef.receiptId, observedEpoch: producer.epoch })
        || !model || !equal(model.receiptRef, receipt.modelReceiptRef) || receipt.modelPayloadHash !== hash(text)
        || model.observation.dispatchEvidence.reference.resultPayloadHash !== receipt.modelPayloadHash
        || !equal(settlement.effectReceiptRefs, [receipt.modelReceiptRef.receiptId]) || settlement.decisionSeq !== receipt.decisionSeq
        || settlement.createdAt !== receipt.createdAt || record.envelope.createdAt !== receipt.createdAt
        || settlement.reasonCode !== 'graph_result_published' || receipt.decisionSeq > root.eventSeq) invalid();
    if (recipient) {
        await assertAttemptConsumable(tx, handle, root, producer);
        const actual = (await readAttempt(tx, handle, root, recipient.attemptId)).doc;
        if (!equal(actual, recipient) || root.cancelRequested || root.status !== 'running' || !['running', 'waiting_effect'].includes(recipient.status)) invalid();
        if (recipient.epoch !== root.epoch || producer.epoch !== root.epoch || !contract.audience.nodeIds.includes(recipient.nodeId)
            || recipient.sourceBindingDigest !== root.sourceBinding.bindingDigest || !recipient.inputRefs.some(ref => equal(ref, receipt.resultRef))) invalid();
    }
    return { record, receipt, producer, settlement };
}
