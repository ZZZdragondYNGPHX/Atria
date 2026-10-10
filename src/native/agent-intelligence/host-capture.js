import { createEvidenceTrace } from '../../../public/shared/agent-evidence-trace.js';
import { hashNativeDocument } from '../repositories/common.js';

export async function beginHostCapture(repository, handle, scope, rootRunId, invocationId = rootRunId, lane = 'foreground', parentInvocationId = null) {
    const marker = await repository.begin(handle, { scope, rootRunId, origin: 'host' });
    const trace = createEvidenceTrace();
    let sequence = 0;
    const append = event => trace.append({ runId: rootRunId, lane, ...event });
    append({ type: 'run.started', eventId: rootRunId + '/started', requestId: invocationId, parentInvocationId });
    let queue = Promise.resolve(), failed = false;
    let closed = false;
    const attempts = new Map();
    const flush = (status = 'capturing', sources = null, outcome = null) => {
        const update = { sequence: ++sequence, status, trace: trace.snapshot(), sources, outcome };
        queue = queue.then(() => repository.update(handle, marker.evidenceId, update, 'host')).catch(() => { failed = true; });
        return queue.then(() => ({ evidenceId: marker.evidenceId, status: failed ? 'failed' : status, missing: trace.snapshot().missing }));
    };
    return {
        lane,
        nextAttempt(requestId) { const next = (attempts.get(requestId) || 0) + 1; attempts.set(requestId, next); return next; },
        append(event) { if (!closed) append(event); },
        async attempt(event) { if (!closed) { append(event); await flush(); } },
        async finish(snapshot, service) {
            const receipt = snapshot.states.atri_task_results?.records.find(item => item.invocationId === invocationId);
            const messageId = receipt?.authorityReceipt?.messageId;
            const message = snapshot.timeline.find(item => item.messageId === messageId);
            let sources = null, outcome = null;
            if (message && receipt) {
                outcome = { kind: 'turn', invocationId, branchId: snapshot.revision.branchId, revisionId: snapshot.revision.revisionId,
                    messageId, variantId: message.activeVariantId, receiptHash: hashNativeDocument(receipt) };
                try { sources = await service.capture(handle, scope, [{ kind: 'message', messageId }], { maxSources: 1, maxBytes: 131072, maxScanMessages: 8192 }); } catch { trace.miss('events_missing'); }
            } else trace.miss('events_missing');
            append({ type: 'run.completed', eventId: rootRunId + '/completed' });
            closed = true;
            return flush('completed', sources, outcome);
        },
        async fail(cancelled) {
            append({ type: cancelled ? 'run.cancelled' : 'run.failed', eventId: rootRunId + '/terminal' });
            closed = true;
            return flush(cancelled ? 'cancelled' : 'failed');
        },
        async finishTask(result) {
            const { snapshot, record } = result;
            append({ type: 'task.receipt', eventId: rootRunId + '/receipt', requestId: invocationId, status: record.status || 'recorded' });
            closed = true;
            return flush('completed', null, { kind: 'task', invocationId, branchId: snapshot.revision.branchId,
                revisionId: snapshot.revision.revisionId, messageId: null, variantId: null, receiptHash: hashNativeDocument(record) });
        },
    };
}
