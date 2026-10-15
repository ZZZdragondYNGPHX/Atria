import { ConflictError } from '../../storage/errors.js';
import { assertObject, assertCounter } from '../../../public/shared/native-orchestration-contracts.js';
import { hashNativeDocument, putImmutable } from '../repositories/common.js';
import { checkedRecord } from './plan-repository.js';
import { controlRecordKey, readAttempt } from './controller-common.js';

/** Shared control counters, not a Compute bank or dispatch permit. Callers
 * validate their own dependency/barrier/source authority before admission. */
export async function admitGraphEdges({ tx, handle, root, transfers, now }) {
    const rows = [], refs = [], seen = new Set(), counts = { ...root.progress.edgeVisitCounts };
    let loops = root.progress.loopIterations;
    for (const transfer of transfers) {
        assertObject(transfer, ['edgeId', 'producerAttemptId', 'nodeAttemptId'], 'edge transfer');
        const edge = root.graph.edges.find(item => item.edgeId === transfer.edgeId);
        const { doc: producer } = await readAttempt(tx, handle, root, transfer.producerAttemptId);
        const { doc: target } = await readAttempt(tx, handle, root, transfer.nodeAttemptId);
        if (!edge || producer.nodeId !== edge.from.nodeId || target.nodeId !== edge.to.nodeId || producer.epoch !== root.epoch || target.epoch !== root.epoch
            || producer.sourceBindingDigest !== root.sourceBinding.bindingDigest || target.sourceBindingDigest !== root.sourceBinding.bindingDigest) throw new TypeError('Graph edge transfer identity/source mismatch');
        const receiptId = 'oreceipt_' + hashNativeDocument({ kind: 'edge_admission', runId: root.runId, ...transfer }).slice(0, 32);
        if (seen.has(receiptId)) throw new TypeError('Duplicate edge transfer');
        seen.add(receiptId); refs.push(receiptId);
        const previous = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId));
        if (previous) {
            const row = previous.doc;
            assertObject(row, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'graphRevision', 'edgeId', 'producerAttemptId', 'nodeAttemptId', 'sourceBindingDigest', 'edgeVisit', 'loopIteration', 'decisionSeq', 'createdAt'], 'EdgeAdmission');
            if (row.schemaVersion !== 1 || row.receiptKind !== 'edge_admission' || row.receiptId !== receiptId || row.runId !== root.runId || row.epoch !== root.epoch
                || row.sourceBindingDigest !== root.sourceBinding.bindingDigest || Object.entries(transfer).some(([field, value]) => row[field] !== value)) throw new TypeError('Edge admission mismatch');
            for (const field of ['edgeVisit', 'loopIteration', 'decisionSeq', 'graphRevision', 'createdAt']) assertCounter(row[field], field);
            assertCounter(row.edgeVisit, 'edgeVisit', 1); assertCounter(row.decisionSeq, 'decisionSeq', 1);
            // A composed controller may see its own staged receipt at seq+1.
            if (row.edgeVisit > (counts[edge.edgeId] ?? 0) || row.loopIteration > loops || row.decisionSeq > root.eventSeq + 1 || row.graphRevision > root.graphRevision) throw new TypeError('Edge admission is ahead of Run progress');
            continue;
        }
        counts[edge.edgeId] = (counts[edge.edgeId] ?? 0) + 1;
        if (counts[edge.edgeId] > edge.maxVisits) throw new ConflictError('native_orchestration_edge_limit_exhausted');
        if (edge.loopBack) loops++;
        rows.push({ schemaVersion: 1, receiptKind: 'edge_admission', receiptId, runId: root.runId, epoch: root.epoch, graphRevision: root.graphRevision,
            ...transfer, sourceBindingDigest: root.sourceBinding.bindingDigest, edgeVisit: counts[edge.edgeId], loopIteration: loops, decisionSeq: root.eventSeq + 1, createdAt: now });
    }
    if (root.progress.edgeVisits + rows.length > root.limits.maxEdgeVisits || loops > root.limits.maxLoopIterations) throw new ConflictError('native_orchestration_limit_exhausted');
    for (const row of rows) await putImmutable(tx, controlRecordKey(handle, root.runId, 'receipt', row.receiptId), row);
    root.progress.edgeVisitCounts = counts; root.progress.edgeVisits += rows.length; root.progress.loopIterations = loops;
    return refs;
}
