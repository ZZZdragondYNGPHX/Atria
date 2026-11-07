import { rememberRuntimeEvidence, runtimeGenerationError } from './runtime-client.js';
import { nativeSessionRuntime } from './session-runtime.js';

const REPLY_ROLES = new Set(['narrator', 'intent_resolver', 'event_interpreter']);

export async function executeNativeGeneration({ role, messages = [], tools = [], outputContract = null, abortSignal, source, onChunk, ...options } = {}) {
    const payload = await executeNativeOperation('execute', { role, messages, tools, outputContract, ...options }, { abortSignal, source, onChunk,
        notify: role === undefined || REPLY_ROLES.has(role) });
    rememberRuntimeEvidence(payload);
    return { ...payload.response, requestInfo: payload.snapshot, snapshot: payload.snapshot, routing: payload.routing };
}

/** Mark the start of a user-initiated generation: it gets a fresh request
 * allowance on its revision. Retries inside the generation share it. */
export async function beginNativeGeneration({ sessionId, revisionId, abortSignal, generationId = crypto.randomUUID() } = {}) {
    const headers = globalThis.Atria?.getContext?.()?.getRequestHeaders?.() || {};
    const current = await fetch('/api/native/generation/play/budget', { method: 'POST', signal: abortSignal,
        headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, revisionId }) });
    const budget = await current.json();
    if (!current.ok) throw runtimeGenerationError(budget.error, current.status);
    const response = await fetch('/api/native/generation/play/begin', { method: 'POST', signal: abortSignal,
        headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, revisionId, generationId, expectedGenerationId: budget.generationId }) });
    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw runtimeGenerationError(payload.error || 'native_generation_begin_failed', response.status);
    }
    return response.json();
}

export async function executeNativeOperation(kind, options, { abortSignal, source, onChunk, notify = true } = {}) {
    if (!['execute', 'task', 'turn'].includes(kind)) throw new TypeError('Unknown Native operation');
    const snapshot = nativeSessionRuntime.snapshot;
    const identity = source || (nativeSessionRuntime.active ? {
        sessionId: snapshot.session.sessionId, revisionId: snapshot.revision.revisionId,
    } : null);
    if (!identity) throw Object.assign(new Error('Open a Native Session or Project before generating.'), { code: 'native_generation_context_required' });
    const reply = nativeSessionRuntime.replyExecution;
    const headers = globalThis.Atria?.getContext?.()?.getRequestHeaders?.() || {};
    const response = await fetch('/api/native/generation/' + kind, {
        method: 'POST', signal: abortSignal, headers: { ...headers, 'Content-Type': 'application/json', ...(onChunk ? { Accept: 'text/event-stream' } : {}) },
        body: JSON.stringify({ ...identity, ...options,
            ...(reply?.sessionId === identity.sessionId ? { generationId: reply.generationId } : {}),
            requestId: 'request-' + Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('') }),
    });
    let payload;
    if (response.headers?.get('content-type')?.includes('text/event-stream')) {
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let pending = '';
        while (true) {
            const { value, done } = await reader.read();
            pending += decoder.decode(value, { stream: !done });
            const lines = pending.split('\n'); pending = lines.pop();
            for (const line of lines) {
                if (!line.startsWith('data:')) continue;
                const event = JSON.parse(line.slice(5));
                if (event.error) throw Object.assign(runtimeGenerationError(event.error, undefined, { notify }),
                    event.originalResponse ? { originalResponse: event.originalResponse } : {});
                if (event.chunk) { try { onChunk?.(event.chunk); } catch { /* Presentation observers do not own the request. */ } }
                if (event.result) payload = event.result;
            }
            if (done) break;
        }
        if (!payload) throw new Error('Native generation stream ended without a result');
    } else payload = await response.json();
    if (!response.ok) throw runtimeGenerationError(payload.error || 'Native generation failed', response.status, { notify });
    rememberRuntimeEvidence(payload);
    return payload;
}

export function nativeGenerationActive() { return nativeSessionRuntime.active; }
