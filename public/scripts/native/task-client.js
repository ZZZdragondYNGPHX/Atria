import { executeNativeOperation } from './generation-client.js';
import { nativeSessionRuntime } from './session-runtime.js';

function current() {
    if (!nativeSessionRuntime.active || nativeSessionRuntime.history) throw new Error('Tasks require the active Session; explicitly fork historical work first');
    return nativeSessionRuntime.snapshot;
}
export async function invokeNativeTask({ taskId, variantId, input, invocationId = crypto.randomUUID(), abortSignal, onChunk, detached = false }) {
    const snapshot = current();
    const context = globalThis.Atria?.getContext?.();
    const payload = { taskId, variantId, input, invocationId,
        sessionId: snapshot.session.sessionId, revisionId: snapshot.revision.revisionId,
        slotBindings: context?.capabilitySettings?.atri_task_bindings?.[snapshot.session.packageId] ?? {} };
    if (detached) return operationRequest('/task/start', 'POST', payload);
    const result = await executeNativeOperation('task', payload, { abortSignal, onChunk });
    if (result.snapshot) await nativeSessionRuntime.acceptOperationSnapshot(result.snapshot);
    return result;
}
async function operationRequest(path, method, body) {
    const headers = globalThis.Atria?.getContext?.()?.getRequestHeaders?.() ?? {};
    const response = await fetch('/api/native/generation' + path, { method, headers: { ...headers, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw new Error('Native operation unavailable');
    return response.json();
}
export const readNativeOperation = operationId => operationRequest('/operations/' + encodeURIComponent(operationId), 'GET');
export const cancelNativeOperation = operationId => operationRequest('/operations/' + encodeURIComponent(operationId), 'DELETE');
export async function resolveNativeProposal({ invocationId, decision, payload }) {
    const snapshot = current();
    const next = await nativeSessionRuntime.request('command', { sessionId: snapshot.session.sessionId,
        expectedRevisionId: snapshot.revision.revisionId, command: { type: 'proposal.resolve', invocationId, decision, ...(payload === undefined ? {} : { payload }) } });
    await nativeSessionRuntime.acceptOperationSnapshot(next);
    return next;
}
