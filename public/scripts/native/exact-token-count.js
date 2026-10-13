// Cache scalar counts after legal source selection, never prompts or permission
// decisions. A counter function identifies its exact tokenizer configuration.
const counters = new WeakMap();
export function contextTokenCounter(counter, scope) {
    // Unidentified owners get only request-local reuse.
    let cache;
    if (scope) {
        let scopes = counters.get(counter);
        if (!scopes) counters.set(counter, scopes = new Map());
        cache = scopes.get(scope);
        if (!cache) { cache = { entries: new Map(), bytes: 0 }; scopes.set(scope, cache); }
        scopes.delete(scope); scopes.set(scope, cache);
        while (scopes.size > 16) scopes.delete(scopes.keys().next().value);
    } else cache = { entries: new Map(), bytes: 0 };
    const counted = async text => {
        text = String(text ?? '');
        if (cache.entries.has(text)) {
            const count = cache.entries.get(text); cache.entries.delete(text); cache.entries.set(text, count); return count;
        }
        const count = await counter(text);
        if (!Number.isSafeInteger(count) || count < 0) throw new TypeError('Invalid exact token count');
        const bytes = text.length * 2 + 32;
        if (bytes <= 65536 && !cache.entries.has(text)) {
            while (cache.entries.size >= 256 || cache.bytes + bytes > 65536) {
                const key = cache.entries.keys().next().value; cache.bytes -= key.length * 2 + 32; cache.entries.delete(key);
            }
            cache.entries.set(text, count); cache.bytes += bytes;
        }
        return count;
    };
    // Never sum fragment counts into a final Prompt count. This always calls
    // the original counter on the complete serialization.
    counted.complete = text => counter(String(text ?? ''));
    return counted;
}
