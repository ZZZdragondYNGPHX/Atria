import { rememberRuntimeEvidence, runtimeGenerationError } from './runtime-client.js';
import { nativeSessionRuntime } from './session-runtime.js';

export async function executeNativeGeneration({ role, messages = [], tools = [], outputContract = null, abortSignal, source, onChunk, ...options } = {}) {
    const snapshot = nativeSessionRuntime.snapshot;
    const identity = source || (nativeSessionRuntime.active ? {
        sessionId: snapshot.session.sessionId, revisionId: snapshot.revision.revisionId,
    } : null);
    if (!identity) throw Object.assign(new Error('Open a Native Session or Project before generating.'), { code: 'native_generation_context_required' });
    const headers = globalThis.Atria?.getContext?.()?.getRequestHeaders?.() || {};
    const response = await fetch('/api/native/generation/execute', {
        method: 'POST', signal: abortSignal, headers: { ...headers, 'Content-Type': 'application/json', ...(onChunk ? { Accept: 'text/event-stream' } : {}) },
        body: JSON.stringify({ ...identity, ...options, role, messages, tools, outputContract,
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
                if (event.error) throw runtimeGenerationError(event.error);
                if (event.chunk) { try { onChunk?.(event.chunk); } catch { /* Presentation observers do not own the request. */ } }
                if (event.result) payload = event.result;
            }
            if (done) break;
        }
        if (!payload) throw new Error('Native generation stream ended without a result');
    } else payload = await response.json();
    if (!response.ok) throw runtimeGenerationError(payload.error || 'Native generation failed', response.status);
    rememberRuntimeEvidence(payload);
    return { ...payload.response, requestInfo: payload.snapshot, snapshot: payload.snapshot, routing: payload.routing };
}

export function nativeGenerationActive() { return nativeSessionRuntime.active; }
