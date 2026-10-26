import { normalizeNativeResourceKey, encodeNativeResourceKey } from './native-resource-key.js';

// Exact immutable dependencies, never an account/session-wide table scan.
// Keep SQL parameter counts and filesystem descriptors bounded independently
// of the size of the history requested by the caller.
export async function readNativeSqlBatch(keys, handle, select) {
    const result = new Array(keys.length), groups = new Map();
    for (let index = 0; index < keys.length; index++) {
        const key = normalizeNativeResourceKey(keys[index]);
        if (key.handle !== handle) throw new TypeError('Transaction account mismatch');
        let group = groups.get(key.kind);
        if (!group) { group = []; groups.set(key.kind, group); }
        group.push({ index, resourceKey: encodeNativeResourceKey(key) });
    }
    for (const [kind, group] of groups) for (let offset = 0; offset < group.length; offset += 256) {
        const batch = group.slice(offset, offset + 256);
        const rows = await select(kind, [...new Set(batch.map(item => item.resourceKey))]);
        const byKey = new Map(rows.map(row => [encodeNativeResourceKey(row.key), row]));
        for (const item of batch) result[item.index] = byKey.get(item.resourceKey) ?? null;
    }
    return result;
}

export async function readNativeFileBatch(keys, read) {
    const result = new Array(keys.length); let cursor = 0, failure;
    await Promise.all(Array.from({ length: Math.min(keys.length, 16) }, async () => {
        while (!failure && cursor < keys.length) {
            const index = cursor++;
            try { result[index] = await read(keys[index]); } catch (error) { failure ??= error; }
        }
    }));
    if (failure) throw failure;
    return result;
}
