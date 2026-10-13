// Bounded incremental SSE decoding shared by protocol clients. Closing the
// consumer cancels its reader, including streams kept open after a response.
export async function* readServerEvents(body, { maxBytes = 65536, signal, onBytes } = {}) {
    if (!body) throw new TypeError('Missing event stream');
    const reader = body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
    const abort = () => { void reader.cancel().catch(() => {}); };
    signal?.addEventListener('abort', abort, { once: true });
    let pending = '', bytes = 0, ended = false, event = { data: [] };
    const line = value => {
        if (!value) {
            const result = event; event = { data: [] };
            return result.data.length || result.id !== undefined || result.retry !== undefined ? { ...result, data: result.data.join('\n') } : null;
        }
        if (value.startsWith(':')) return null;
        const colon = value.indexOf(':'), field = colon < 0 ? value : value.slice(0, colon);
        let content = colon < 0 ? '' : value.slice(colon + 1);
        if (content.startsWith(' ')) content = content.slice(1);
        if (field === 'data') event.data.push(content);
        if (field === 'event') event.type = content;
        if (field === 'id' && !content.includes('\0')) event.id = content;
        if (field === 'retry' && /^\d+$/.test(content)) {
            const retry = Number(content); if (!Number.isSafeInteger(retry) || retry > 2147483647) throw new RangeError('Invalid event retry');
            event.retry = retry;
        }
        return null;
    };
    try {
        while (!ended) {
            signal?.throwIfAborted();
            const next = await reader.read(); ended = next.done;
            if (next.value) {
                bytes += next.value.byteLength; onBytes?.(next.value.byteLength);
                if (bytes > maxBytes) throw new RangeError('Event stream byte bound exceeded');
                pending += decoder.decode(next.value, { stream: true });
            }
            if (ended) pending += decoder.decode();
            let match;
            while ((match = /\r\n|\r|\n/.exec(pending))) {
                if (!ended && match[0] === '\r' && match.index === pending.length - 1) break;
                const value = pending.slice(0, match.index); pending = pending.slice(match.index + match[0].length);
                const result = line(value); if (result) yield result;
            }
        }
        signal?.throwIfAborted();
        // An unterminated event is not evidence of a complete protocol message.
        if (pending || event.data.length) throw new TypeError('Incomplete event stream');
    } finally {
        signal?.removeEventListener('abort', abort);
        try { await reader.cancel(); } finally { reader.releaseLock(); }
    }
}
