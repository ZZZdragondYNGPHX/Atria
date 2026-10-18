import { hashNativeDocument as hash, equalNativeDocuments as equal } from '../repositories/common.js';
import { assertObject, assertCounter } from '../../../public/shared/native-orchestration-contracts.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { controlCommandId, controlRecordKey } from './controller-common.js';


const invalid = () => { throw new TypeError('Invalid original output graph traversal'); };

/** Shared historical graph facts only; never a producer/recipient grant. */
export async function assertOutputTransition(tx, handle, root, { published, output, receipt, additionalProducers = [], allowLoopBack = false, producerBindings = null, reservedAttemptId = null }) {
    assertCounter(receipt.decisionSeq, 'publication decisionSeq', 1);
    const sources = [published, ...additionalProducers];
    const requested = producerBindings ?? sources.map(source => ({ producerAttemptId: source.producer.attemptId,
        edgeId: root.graph.edges.find(item => (allowLoopBack || !item.loopBack) && item.from.nodeId === source.producer.nodeId && item.to.nodeId === output.nodeId)?.edgeId }));
    if (!Array.isArray(requested) || !requested.length || sources.some(source => !requested.some(binding => binding.producerAttemptId === source.producer.attemptId))) invalid();
    const entries = requested.map(binding => {
        const source = sources.find(source => source.producer.attemptId === binding.producerAttemptId);
        const edge = root.graph.edges.find(item => item.edgeId === binding.edgeId && (allowLoopBack || !item.loopBack)
            && item.from.nodeId === source?.producer.nodeId && item.to.nodeId === output.nodeId);
        if (!source || !edge) invalid();
        const transfer = { edgeId: edge.edgeId, producerAttemptId: source.producer.attemptId, nodeAttemptId: output.attemptId };
        const admissionId = 'oreceipt_' + hash({ kind: 'edge_admission', runId: root.runId, ...transfer }).slice(0, 32);
        return { source, edge, transfer, admissionId };
    }).sort((a, b) => a.edge.edgeId.localeCompare(b.edge.edgeId));
    if (new Set(entries.map(item => item.edge.edgeId)).size !== entries.length) invalid();
    const bindings = entries.map(({ transfer }) => ({ edgeId: transfer.edgeId, producerAttemptId: transfer.producerAttemptId }));
    if (reservedAttemptId !== null && (reservedAttemptId !== output.attemptId || !output.reservationRef)) invalid();
    const identity = hash({ runId: root.runId, bindings, reservedAttemptId });
    const traversalId = 'oreceipt_' + identity.slice(0, 32), traversal = (await tx.getResource(controlRecordKey(handle, root.runId, 'receipt', traversalId)))?.doc;
    const command = (await tx.getResource({ kind: K.orchestrationCommand, handle, commandId: controlCommandId('loop.advance', identity) }))?.doc;
    if (!traversal || !command) invalid();
    assertObject(traversal, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'graphRevision', 'bindings', 'producerReceiptRefs',
        'nodeAttemptId', 'inputDigest', 'edgeAdmissionRefs', 'edgeVisits', 'loopIterations', 'decisionSeq', 'createdAt'], 'Output traversal');
    if (command.operation !== 'runs.control.loop.advance' || command.target !== root.runId
        || command.commandId !== controlCommandId('loop.advance', identity) || command.schemaVersion !== 1
        || command.payloadHash !== hash({ operation: command.operation, body: { runId: root.runId, operation: 'loop.advance', detail: { bindings, reservedAttemptId } } })
        || !equal(command.outcome?.traversalReceipt, traversal) || command.outcome.attemptId !== output.attemptId
        || output.attemptId !== (reservedAttemptId ?? 'oattempt_' + identity.slice(0, 32)) || !equal(receipt.traversalReceiptRef, { runId: root.runId, receiptId: traversalId })
        || traversal.schemaVersion !== 1 || traversal.receiptId !== traversalId || traversal.receiptKind !== 'graph_transition'
        || traversal.runId !== root.runId || traversal.nodeAttemptId !== output.attemptId || traversal.graphRevision !== output.graphRevision
        || traversal.inputDigest !== output.inputDigest || !equal(traversal.bindings, bindings)
        || !equal(traversal.producerReceiptRefs, entries.map(item => item.source.settlement.receiptId)) || !equal(traversal.edgeAdmissionRefs, entries.map(item => item.admissionId))
        || traversal.loopIterations > root.progress.loopIterations || traversal.decisionSeq >= receipt.decisionSeq || traversal.epoch !== output.epoch
        || command.outcome.versions?.epoch !== traversal.epoch) invalid();
    const visits = {};
    let loopIteration = traversal.loopIterations - entries.filter(item => item.edge.loopBack).length;
    if (loopIteration < 0) invalid();
    for (const { source, edge, transfer, admissionId } of entries) {
        if (edge.loopBack) loopIteration++;
        const admission = (await tx.getResource(controlRecordKey(handle, root.runId, 'receipt', admissionId)))?.doc;
        if (!admission) invalid();
        assertObject(admission, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'graphRevision', 'edgeId', 'producerAttemptId',
            'nodeAttemptId', 'sourceBindingDigest', 'edgeVisit', 'loopIteration', 'decisionSeq', 'createdAt'], 'Output edge');
        assertCounter(admission.edgeVisit, 'edgeVisit', 1); visits[edge.edgeId] = admission.edgeVisit;
        if (admission.schemaVersion !== 1 || admission.receiptId !== admissionId || admission.receiptKind !== 'edge_admission'
            || admission.runId !== root.runId || admission.sourceBindingDigest !== root.sourceBinding.bindingDigest || admission.graphRevision !== output.graphRevision
            || Object.entries(transfer).some(([key, value]) => admission[key] !== value) || admission.edgeVisit > edge.maxVisits
            || admission.edgeVisit > (root.progress.edgeVisitCounts[edge.edgeId] ?? 0) || admission.loopIteration !== loopIteration
            || admission.epoch !== output.epoch || traversal.decisionSeq <= source.receipt.decisionSeq || admission.decisionSeq !== traversal.decisionSeq
            || admission.createdAt !== traversal.createdAt) invalid();
    }
    if (!equal(traversal.edgeVisits, visits)) invalid();
}
