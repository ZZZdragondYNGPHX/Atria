import { cloneAdmittedDocument, putImmutable } from './repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from './contracts.js';

const FORMAT = 'atria-world-state-v2';
const namespaces = new Set(['atri_world_state', 'atri_lifecycle', 'atri_task_results', 'atri_action_receipts']);
export const deltaStateNamespace = namespace => namespaces.has(namespace);
const decoded = new WeakMap();
const cacheKey = key => [key.handle, key.sessionId, key.namespace, key.head].join('\0');
function stateCache(tx) { if (tx.nativeStateCache) return tx.nativeStateCache; let cache = decoded.get(tx); if (!cache) { cache = new Map(); decoded.set(tx, cache); } return cache; }
function remember(cache, key, value) { if (cache.size >= 8) cache.delete(cache.keys().next().value); cache.set(key, value); }
const object = value => value !== null && !Array.isArray(value) && typeof value === 'object';
const container = value => object(value) || Array.isArray(value);
function difference(before, after, path = [], result = []) {
    if (before === after) return result;
    if (Array.isArray(before) && Array.isArray(after)) {
        for (let index = 0; index < after.length; index++) {
            if (index < before.length) difference(before[index], after[index], [...path, index], result);
            else result.push({ op: 'replace', path: [...path, index], value: after[index] });
        }
        if (after.length < before.length) result.push({ op: 'length', path, value: after.length });
        return result;
    }
    if (!object(before) || !object(after)) result.push({ op: 'replace', path, value: after });
    else {
        for (const field of Object.keys(before)) if (!Object.hasOwn(after, field)) result.push({ op: 'remove', path: [...path, field] });
        for (const field of Object.keys(after)) {
            if (!Object.hasOwn(before, field)) result.push({ op: 'replace', path: [...path, field], value: after[field] });
            else difference(before[field], after[field], [...path, field], result);
        }
    }
    return result;
}
function apply(value, patch) {
    for (const item of patch) {
        if (!Array.isArray(item.path) || item.path.some(part => typeof part !== 'string' && (!Number.isSafeInteger(part) || part < 0)) || !['replace', 'remove', 'length'].includes(item.op)) throw new TypeError('Invalid State Delta');
        if (item.op === 'length') {
            let target = value;
            for (const field of item.path) { if (!container(target) || !Object.hasOwn(target, field)) throw new TypeError('Missing Delta array'); target = target[field]; }
            if (!Array.isArray(target) || !Number.isSafeInteger(item.value) || item.value < 0 || item.value > target.length) throw new TypeError('Invalid Delta array length');
            target.length = item.value; continue;
        }
        if (!item.path.length) { if (item.op !== 'replace') throw new TypeError('Invalid root Delta'); value = cloneAdmittedDocument(item.value); continue; }
        let parent = value;
        for (const field of item.path.slice(0, -1)) { if (!container(parent) || !Object.hasOwn(parent, field)) throw new TypeError('Missing Delta parent'); parent = parent[field]; }
        if (!container(parent)) throw new TypeError('Invalid Delta parent');
        const field = item.path.at(-1);
        if (Array.isArray(parent) && (!Number.isSafeInteger(field) || field > parent.length || item.op === 'remove')) throw new TypeError('Invalid Delta array index');
        if (item.op === 'remove') delete parent[field];
        else Object.defineProperty(parent, field, { value: cloneAdmittedDocument(item.value), writable: true, enumerable: true, configurable: true });
    }
    return value;
}
async function decodeState(tx, key, record, cache) {
    const patches = [], seen = new Set(), integrity = record.integrity, depth = record.doc?.format === FORMAT ? record.doc.depth : 0;
    let value;
    for (;;) {
        const doc = record.doc;
        if (seen.has(key.head) || seen.size > 32) throw new TypeError('State Delta replay bound');
        seen.add(key.head);
        if (doc?.format !== FORMAT) {
            if (key.namespace === 'atri_world_state') throw new TypeError('Unsupported World State');
            value = cloneAdmittedDocument(doc); break;
        }
        if (doc.contentHash !== key.head || !Number.isSafeInteger(doc.depth) || doc.depth < 0 || doc.depth > 32) throw new TypeError('Invalid State Delta identity');
        if (doc.kind === 'snapshot' && doc.depth === 0) { value = cloneAdmittedDocument(doc.value); break; }
        if (doc.kind !== 'delta' || !Array.isArray(doc.patch)) throw new TypeError('Invalid State encoding');
        patches.push(doc.patch);
        const baseKey = { ...key, head: doc.baseHead };
        if (seen.has(baseKey.head)) throw new TypeError('State Delta ancestry cycle');
        const cached = cache.get(cacheKey(baseKey));
        if (cached) {
            const base = await cached;
            if (doc.depth !== base.depth + 1) throw new TypeError('State Delta depth mismatch');
            value = cloneAdmittedDocument(base.value); break;
        }
        const base = await tx.getResource(baseKey);
        if (!base || doc.depth !== (base.doc?.format === FORMAT ? base.doc.depth : 0) + 1) throw new TypeError('Missing State Delta dependency');
        key = baseKey; record = base;
    }
    // Clone the full snapshot once, not once per ancestor in the delta chain.
    for (const patch of patches.reverse()) value = apply(value, patch);
    return { value, depth, bytes: Buffer.byteLength(JSON.stringify(value)), integrity };
}
async function storedState(tx, key, record) {
    const cache = stateCache(tx), id = cacheKey(key);
    let entry = cache.get(id);
    if (!entry || (await entry).integrity !== record.integrity) {
        entry = decodeState(tx, key, record, cache);
        remember(cache, id, entry);
    }
    const result = await entry;
    if (result.bytes > 4 * 1024 * 1024) cache.delete(id);
    return result;
}
export async function readStoredState(tx, key, record) {
    return cloneAdmittedDocument((await storedState(tx, key, record)).value);
}
export async function putStoredState(tx, key, value, previousHead = null) {
    if (key.kind !== K.sessionState || !deltaStateNamespace(key.namespace)) throw new TypeError('Invalid State identity');
    const existing = await tx.getResource(key);
    if (existing) { await readStoredState(tx, key, existing); return; }
    const fullBytes = Buffer.byteLength(JSON.stringify(value));
    let doc = { format: FORMAT, kind: 'snapshot', value, contentHash: key.head, depth: 0, replayBytes: 0 };
    if (previousHead && previousHead !== key.head) {
        const previousKey = { ...key, head: previousHead }, previous = await tx.getResource(previousKey);
        if (previous) {
            const before = (await storedState(tx, previousKey, previous)).value, patch = difference(before, value);
            const bytes = Buffer.byteLength(JSON.stringify(patch));
            const depth = previous.doc?.format === FORMAT ? previous.doc.depth : 0, replayBytes = previous.doc?.format === FORMAT ? previous.doc.replayBytes : 0;
            if (bytes * 2 < fullBytes && depth < 32 && replayBytes + bytes < fullBytes) {
                doc = { format: FORMAT, kind: 'delta', baseHead: previousHead, patch, contentHash: key.head,
                    depth: depth + 1, replayBytes: replayBytes + bytes };
            }
        }
    }
    await putImmutable(tx, key, doc);
    if (fullBytes <= 4 * 1024 * 1024) remember(stateCache(tx), cacheKey(key), Promise.resolve({ value: cloneAdmittedDocument(value), depth: doc.depth, bytes: fullBytes,
        integrity: (await tx.getResource(key)).integrity }));
}
