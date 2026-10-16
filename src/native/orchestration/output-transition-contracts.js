import { hashNativeDocument as hash } from '../repositories/common.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { controlCommandId, controlRecordKey } from './controller-common.js';
import { checkedRecord } from './plan-repository.js';

const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid original output graph traversal'); };

/** Shared historical graph facts only; never a producer/recipient grant. */
export async function assertOutputTransition(tx, handle, root, { published, output, receipt }) {
    const edge = root.graph.edges.find(item => !item.loopBack && item.from.nodeId === published.producer.nodeId && item.to.nodeId === output.nodeId);
    if (!edge) invalid();
    const bindings = [{ edgeId: edge.edgeId, producerAttemptId: published.producer.attemptId }], identity = hash({ runId: root.runId, bindings, reservedAttemptId: null });
    const traversalId = 'oreceipt_' + identity.slice(0, 32), traversal = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', traversalId)))?.doc;
    const command = (await checkedRecord(tx, { kind: K.orchestrationCommand, handle, commandId: controlCommandId('loop.advance', identity) }))?.doc;
    const transfer = { edgeId: edge.edgeId, producerAttemptId: published.producer.attemptId, nodeAttemptId: output.attemptId };
    const edgeId = 'oreceipt_' + hash({ kind: 'edge_admission', runId: root.runId, ...transfer }).slice(0, 32);
    const admission = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', edgeId)))?.doc;
    if (!traversal || !admission || !command) invalid();
    assertObject(traversal, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'graphRevision', 'bindings', 'producerReceiptRefs',
        'nodeAttemptId', 'inputDigest', 'edgeAdmissionRefs', 'edgeVisits', 'loopIterations', 'decisionSeq', 'createdAt'], 'Output traversal');
    assertObject(admission, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'graphRevision', 'edgeId', 'producerAttemptId',
        'nodeAttemptId', 'sourceBindingDigest', 'edgeVisit', 'loopIteration', 'decisionSeq', 'createdAt'], 'Output edge');
    if (command.operation !== 'runs.control.loop.advance' || command.target !== root.runId
        || command.commandId !== controlCommandId('loop.advance', identity) || command.schemaVersion !== 1
        || command.payloadHash !== hash({ operation: command.operation, body: { runId: root.runId, operation: 'loop.advance', detail: { bindings, reservedAttemptId: null } } })
        || !equal(command.outcome?.traversalReceipt, traversal) || command.outcome.attemptId !== output.attemptId
        || output.attemptId !== 'oattempt_' + identity.slice(0, 32) || !equal(receipt.traversalReceiptRef, { runId: root.runId, receiptId: traversalId })
        || traversal.schemaVersion !== 1 || traversal.receiptId !== traversalId || traversal.receiptKind !== 'graph_transition'
        || traversal.runId !== root.runId || traversal.nodeAttemptId !== output.attemptId || traversal.graphRevision !== output.graphRevision
        || traversal.inputDigest !== output.inputDigest || !equal(traversal.bindings, bindings)
        || !equal(traversal.producerReceiptRefs, [published.settlement.receiptId]) || !equal(traversal.edgeAdmissionRefs, [edgeId])
        || !equal(traversal.edgeVisits, { [edge.edgeId]: 1 }) || traversal.loopIterations !== root.progress.loopIterations
        || admission.schemaVersion !== 1 || admission.receiptId !== edgeId || admission.receiptKind !== 'edge_admission'
        || admission.runId !== root.runId || admission.sourceBindingDigest !== root.sourceBinding.bindingDigest || admission.graphRevision !== output.graphRevision
        || Object.entries(transfer).some(([key, value]) => admission[key] !== value) || admission.edgeVisit !== 1
        || root.progress.edgeVisitCounts[edge.edgeId] !== 1 || admission.loopIteration !== root.progress.loopIterations
        || admission.epoch !== output.epoch || traversal.epoch !== output.epoch || traversal.decisionSeq >= receipt.decisionSeq
        || traversal.decisionSeq <= published.receipt.decisionSeq || admission.decisionSeq !== traversal.decisionSeq
        || admission.createdAt !== traversal.createdAt || command.outcome.versions?.epoch !== traversal.epoch) invalid();
}
