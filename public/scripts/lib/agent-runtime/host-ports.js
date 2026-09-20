/** Host-independent adapters: no provider SDK, memory store or scheduling loop. */
export function createHostTokenCounter(context) {
    return async envelope => {
        const text = JSON.stringify(envelope);
        // Measure all fields, including tool arguments/reasoning, not just content.
        // UTF-8 bytes are explicitly an estimate when the host has no tokenizer.
        const value = typeof context.getTokenCountAsync === 'function'
            ? await context.getTokenCountAsync(text) : new TextEncoder().encode(text).length;
        if (!Number.isFinite(value) || value < 0) throw new TypeError('Invalid host token count');
        return Math.ceil(value);
    };
}

function assertActive(signal) {
    if (signal?.aborted) throw Object.assign(new Error('Memory recall aborted'), { name: 'AbortError' });
}

/** Wrap the existing Memory OS recall API. Only source IDs enter Runtime checkpoints. */
export function createMemoryOSPort(recallMemory) {
    if (typeof recallMemory !== 'function') throw new TypeError('Memory OS recall required');
    return { async recall({ query, signal, at, accountExistingState, corePacket }) {
        assertActive(signal);
        const result = await recallMemory(query, { signal, at, ...(accountExistingState === undefined ? {} : { accountExistingState }), ...(corePacket === undefined ? {} : { corePacket }) });
        const assertCurrent = () => {
            assertActive(signal);
            if (typeof result?.assertCurrent !== 'function') throw new TypeError('Memory guard required');
            result.assertCurrent();
        };
        assertCurrent();
        return {
            content: result.text, references: (result.selected || []).map(id => ({ id })),
            tokens: result.tokenCount, budget: result.budget, providers: result.providers,
            diagnostics: result.diagnostics, assertCurrent,
        };
    } };
}

/** Legacy world-info owns injection; never run a duplicate automatic memory query. */
export function createDelegatedMemoryPort(guard = () => {}) {
    return { async recall({ signal } = {}) {
        assertActive(signal);
        guard();
        return { content: '', references: [], ownership: 'legacy-world-info', assertCurrent: () => { assertActive(signal); guard(); } };
    } };
}

/** Streaming observers cannot publish late output after cancellation. */
export function guardRequestCallbacks(request, signal) {
    const guarded = { ...request };
    for (const key of ['onChunk', 'onUsage', 'onFirstChunk']) {
        if (typeof request[key] === 'function') guarded[key] = (...args) => {
            if (!signal?.aborted) return request[key](...args);
        };
    }
    return guarded;
}
