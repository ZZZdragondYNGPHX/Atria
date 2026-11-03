import { cloneAdmittedDocument, copyStateDocument, putImmutable, nativeDocumentBytes, readNativeRecord } from './repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from './contracts.js';
import { freezeRecordValue, freezeRecordCollection, immutableRecordValue, immutableRecordCollection } from './record-values.js';
import { copyRecordState, copyReceiptState } from './record-state.js';
import { textDelta, applyTextDelta } from './state-text-delta.js';
import { arrayShift, spliceStateArray } from './state-array-delta.js';
import { RECORD_SNAPSHOT_FORMAT, isRecordSnapshot, restoreRecordSnapshot } from './state-record-snapshot.js';
import { RECORD_PAGE_FORMAT, isRecordPageSnapshot, storeRecordPages, restoreRecordPages } from './state-record-pages.js';

const FORMAT = 'atria-world-state-v3';
const maxDeltaDepth = 128;
const encodedState = doc => doc?.format === FORMAT || doc?.format === 'atria-world-state-v2' || doc?.format === RECORD_SNAPSHOT_FORMAT || doc?.format === RECORD_PAGE_FORMAT;
const namespaces = new Set(['atri_world_state', 'atri_lifecycle', 'atri_task_results', 'atri_action_receipts', 'atri_subjects']);
export const deltaStateNamespace = namespace => namespaces.has(namespace);
const decoded = new WeakMap();
const cacheBytes = 64 * 1024 * 1024, cachedStateBytes = cacheBytes;
const pendingStateBytes = 16 * 1024 * 1024, cachedWeights = new WeakMap();
function freezeRecords(key, value) {
    if (key.namespace === 'atri_subjects') return freezeRecordValue(value);
    if (key.namespace === 'atri_lifecycle') for (const domain of Object.values(value.domains ?? {})) {
        if (domain.records) freezeRecordCollection(domain.records);
    }
    if (key.namespace === 'atri_action_receipts') for (const receipt of value.receipts ?? []) freezeRecordValue(receipt);
    return value;
}
const cacheKey = key => [key.handle, key.sessionId, key.namespace, key.head].join('\0');
function stateCache(tx) { if (tx.nativeStateCache) return tx.nativeStateCache; let cache = decoded.get(tx); if (!cache) { cache = new Map(); decoded.set(tx, cache); } return cache; }
function trimCache(cache) {
    let bytes = 0;
    for (const value of cache.values()) bytes += cachedWeights.get(value) ?? pendingStateBytes;
    while (cache.size > 32 || bytes > cacheBytes) {
        const first = cache.keys().next().value;
        bytes -= cachedWeights.get(cache.get(first)) ?? pendingStateBytes; cache.delete(first);
    }
}
function remember(cache, key, value, knownBytes = pendingStateBytes) {
    cache.delete(key); cache.set(key, value);
    if (!cachedWeights.has(value)) {
        // A valid large live world may occupy the cache, rather than silently
        // disabling replay reuse at 16 MiB. The total byte budget is unchanged.
        // Writes already measured their state. Charging four tiny concurrent
        // writes as 16 MiB each would evict the live world on every publication.
        cachedWeights.set(value, knownBytes);
        value.then(entry => {
            cachedWeights.set(value, entry.bytes);
            if (entry.bytes > cachedStateBytes && cache.get(key) === value) cache.delete(key);
            trimCache(cache);
        }, () => { if (cache.get(key) === value) cache.delete(key); });
    }
    trimCache(cache);
}
const object = value => value !== null && !Array.isArray(value) && typeof value === 'object';
const container = value => object(value) || Array.isArray(value);
// JSON punctuation/property overhead plus one separator, excluding path/value.
const operationBytes = Object.fromEntries(['replace', 'length', 'remove', 'text', 'splice'].map(op => [op,
    Buffer.byteLength(JSON.stringify({ op, path: [], ...(op === 'remove' ? {} : { value: 0 }) })) - 2 - Number(op !== 'remove') + 1]));
function difference(before, after) {
    const result = { patch: [], bytes: 0, work: 0 };
    const append = (op, path, pathBytes, value, valueBytes = 0, expandedBytes = valueBytes) => {
        result.patch.push({ op, path, ...(op === 'remove' ? {} : { value }) });
        result.bytes += operationBytes[op] + pathBytes + valueBytes;
        result.work += operationBytes[op] + pathBytes + expandedBytes;
    };
    function visit(left, right, path, pathBytes) {
        if (left === right) return nativeDocumentBytes(right);
        const start = result.patch.length, startBytes = result.bytes, startWork = result.work;
        let size;
        if (Array.isArray(left) && Array.isArray(right)) {
            size = 2 + Math.max(0, right.length - 1);
            let drop = arrayShift(left, right), splices = 0, probes = 256;
            const recordTable = immutableRecordCollection(left) && right.length >= 64;
            const remove = (index, count) => {
                const splice = { start: index, deleteCount: count, items: [] }, bytes = nativeDocumentBytes(splice);
                append('splice', path, pathBytes, splice, bytes, Math.max(bytes, left.length * 8));
                splices++;
            };
            if (drop) remove(0, drop);
            for (let index = 0; index < right.length; index++) {
                const item = right[index];
                // Retention removes records inside a table. Match the following
                // retained run rather than diffing every subsequent row against
                // its neighbour. Always compare aligned values after the splice.
                if (recordTable && splices < 8 && probes && index + 4 <= right.length
                    && typeof item?.id === 'string' && left[index + drop]?.id !== item.id) {
                    const at = index + drop, limit = Math.min(left.length - 3, at + 65);
                    for (let next = at + 1; next < limit && probes; next++) {
                        probes--;
                        if (left[next]?.id !== item.id || left[next + 1]?.id !== right[index + 1]?.id
                            || left[next + 2]?.id !== right[index + 2]?.id || left[next + 3]?.id !== right[index + 3]?.id) continue;
                        remove(index, next - at); drop += next - at; break;
                    }
                }
                const prior = index + drop;
                if (prior < left.length && left[prior] === item) { size += nativeDocumentBytes(item); continue; }
                const childPath = [...path, index], childPathBytes = pathBytes + String(index).length + Number(path.length > 0);
                if (prior < left.length) size += visit(left[prior], item, childPath, childPathBytes);
                else { const bytes = nativeDocumentBytes(item); size += bytes; append('replace', childPath, childPathBytes, item, bytes); }
            }
            if (right.length < left.length - drop) append('length', path, pathBytes, right.length, String(right.length).length);
        } else if (object(left) && object(right)) {
            const keys = Object.keys(right); size = 2 + Math.max(0, keys.length - 1);
            for (const field of Object.keys(left)) if (!Object.hasOwn(right, field)) {
                append('remove', [...path, field], pathBytes + nativeDocumentBytes(field) + Number(path.length > 0));
            }
            for (const field of keys) {
                const fieldBytes = nativeDocumentBytes(field), childPath = [...path, field], childPathBytes = pathBytes + fieldBytes + Number(path.length > 0);
                size += fieldBytes + 1;
                if (Object.hasOwn(left, field)) size += visit(left[field], right[field], childPath, childPathBytes);
                else { const bytes = nativeDocumentBytes(right[field]); size += bytes; append('replace', childPath, childPathBytes, right[field], bytes); }
            }
        } else {
            size = nativeDocumentBytes(right);
            const parts = typeof left === 'string' && typeof right === 'string' ? textDelta(left, right) : null;
            const bytes = parts ? nativeDocumentBytes(parts) : Infinity;
            if (bytes + operationBytes.text < size + operationBytes.replace) append('text', path, pathBytes, parts, bytes, size);
            else append('replace', path, pathBytes, right, size);
        }
        // Compute subtree bytes during the same walk. Re-measuring each parent
        // would turn a storage saving into repeated full-population CPU work.
        const replacementBytes = operationBytes.replace + pathBytes + size;
        if (result.patch.length - start > 1 && replacementBytes < result.bytes - startBytes) {
            result.patch.length = start; result.bytes = startBytes; result.work = startWork;
            append('replace', path, pathBytes, right, size);
        }
        return size;
    }
    visit(before, after, [], 2);
    return result;
}
function apply(value, patch) {
    const detach = item => immutableRecordValue(item) || immutableRecordCollection(item) ? Array.isArray(item) ? item.slice() : { ...item } : item;
    const writablePath = path => {
        value = detach(value);
        let parent = value;
        for (const field of path) {
            if (!container(parent) || !Object.hasOwn(parent, field)) throw new TypeError('Missing Delta parent');
            const child = detach(parent[field]);
            if (child !== parent[field]) Object.defineProperty(parent, field, { value: child, writable: true, enumerable: true, configurable: true });
            parent = child;
        }
        return parent;
    };
    for (const item of patch) {
        if (!Array.isArray(item.path) || item.path.some(part => typeof part !== 'string' && (!Number.isSafeInteger(part) || part < 0)) || !['replace', 'remove', 'length', 'text', 'splice'].includes(item.op)) throw new TypeError('Invalid State Delta');
        if (item.op === 'length') {
            const target = writablePath(item.path);
            if (!Array.isArray(target) || !Number.isSafeInteger(item.value) || item.value < 0 || item.value > target.length) throw new TypeError('Invalid Delta array length');
            target.length = item.value; continue;
        }
        if (!item.path.length) {
            if (item.op === 'text') value = applyTextDelta(value, item.value);
            else if (item.op === 'splice') value = spliceStateArray(value, item.value, cloneAdmittedDocument);
            else if (item.op === 'replace') value = cloneAdmittedDocument(item.value);
            else throw new TypeError('Invalid root Delta');
            continue;
        }
        const parent = writablePath(item.path.slice(0, -1));
        if (!container(parent)) throw new TypeError('Invalid Delta parent');
        const field = item.path.at(-1);
        if (Array.isArray(parent) && (!Number.isSafeInteger(field) || field > parent.length || item.op === 'remove')) throw new TypeError('Invalid Delta array index');
        if (item.op === 'remove') delete parent[field];
        else {
            const previous = Object.hasOwn(parent, field) ? parent[field] : null;
            Object.defineProperty(parent, field, { value: item.op === 'text' ? applyTextDelta(previous, item.value)
                : item.op === 'splice' ? spliceStateArray(previous, item.value, cloneAdmittedDocument)
                    : cloneAdmittedDocument(item.value), writable: true, enumerable: true, configurable: true });
        }
    }
    return value;
}
async function decodeState(tx, key, record, cache) {
    const patches = [], seen = new Set(), integrity = record.integrity, depth = encodedState(record.doc) ? record.doc.depth : 0;
    const replayBytes = encodedState(record.doc) ? record.doc.replayBytes : 0;
    const replayWork = encodedState(record.doc) ? record.doc.replayWork ?? replayBytes : 0;
    let value;
    for (;;) {
        const doc = record.doc;
        if (seen.has(key.head) || seen.size > maxDeltaDepth) throw new TypeError('State Delta replay bound');
        seen.add(key.head);
        if (!encodedState(doc)) {
            if (key.namespace === 'atri_world_state') throw new TypeError('Unsupported World State');
            value = cloneAdmittedDocument(doc); break;
        }
        if (doc.contentHash !== key.head) throw new TypeError('Invalid State Delta identity');
        if (!Number.isSafeInteger(doc.depth) || doc.depth < 0 || doc.depth > maxDeltaDepth) throw new TypeError('Invalid State Delta identity');
        if (isRecordSnapshot(doc)) { value = await restoreRecordSnapshot(tx, key, doc); break; }
        if (isRecordPageSnapshot(doc)) { value = await restoreRecordPages(tx, key, doc); break; }
        if (doc.kind === 'snapshot' && doc.depth === 0) { value = cloneAdmittedDocument(doc.value); break; }
        if (doc.kind !== 'delta' || !Array.isArray(doc.patch)) throw new TypeError('Invalid State encoding');
        patches.push(doc.patch);
        const baseKey = { ...key, head: doc.baseHead };
        if (seen.has(baseKey.head)) throw new TypeError('State Delta ancestry cycle');
        const cached = cache.get(cacheKey(baseKey));
        if (cached) {
            const base = await cached;
            if (doc.depth !== base.depth + 1) throw new TypeError('State Delta depth mismatch');
            // Keep unchanged admitted records shared across historical states;
            // apply() detaches only the paths written by the incoming deltas.
            value = copyStateDocument(base.value); break;
        }
        const base = await readNativeRecord(tx, baseKey);
        if (!base || doc.depth !== (encodedState(base.doc) ? base.doc.depth : 0) + 1) throw new TypeError('Missing State Delta dependency');
        key = baseKey; record = base;
    }
    // Cold chains start from one full snapshot; warm replay copies changed paths.
    for (const patch of patches.reverse()) value = apply(value, patch);
    return { value: freezeRecords(key, value), depth, replayBytes, replayWork, bytes: nativeDocumentBytes(value), integrity };
}
async function storedState(tx, key, record) {
    const cache = stateCache(tx), id = cacheKey(key);
    let entry = cache.get(id);
    if (!entry || (await entry).integrity !== record.integrity) {
        entry = decodeState(tx, key, record, cache);
        remember(cache, id, entry);
    } else remember(cache, id, entry);
    const result = await entry;
    if (result.bytes > cachedStateBytes) cache.delete(id);
    return result;
}
export async function readStoredState(tx, key, record, { shareRecordValues = false } = {}) {
    const value = (await storedState(tx, key, record)).value;
    if (shareRecordValues && key.namespace === 'atri_subjects') return value;
    if (shareRecordValues && key.namespace === 'atri_action_receipts') return copyReceiptState(value);
    return shareRecordValues && key.namespace === 'atri_lifecycle' && value.domains
        ? copyRecordState(value) : cloneAdmittedDocument(value);
}
export async function putStoredState(tx, key, value, previousHead = null) {
    if (key.kind !== K.sessionState || !deltaStateNamespace(key.namespace)) throw new TypeError('Invalid State identity');
    const existing = await readNativeRecord(tx, key);
    if (existing) return;
    const fullBytes = nativeDocumentBytes(value);
    let doc = { format: FORMAT, kind: 'snapshot', value, contentHash: key.head, depth: 0, replayBytes: 0, replayWork: 0 };
    if (previousHead && previousHead !== key.head) {
        const previousKey = { ...key, head: previousHead }, previous = await readNativeRecord(tx, previousKey);
        if (previous) {
            const before = await storedState(tx, previousKey, previous), delta = difference(before.value, value), { patch } = delta;
            const bytes = delta.bytes + (patch.length ? 1 : 2);
            const { depth, replayBytes, replayWork } = before;
            // Text copies save disk but still reconstruct their expanded text.
            // Bound that work as well as ancestry and encoded replay bytes.
            if (bytes * 2 < fullBytes && depth < maxDeltaDepth && replayBytes + bytes < fullBytes && replayWork + delta.work < fullBytes * 8) {
                doc = { format: FORMAT, kind: 'delta', baseHead: previousHead, patch, contentHash: key.head,
                    depth: depth + 1, replayBytes: replayBytes + bytes, replayWork: replayWork + delta.work };
            }
        }
    }
    if (doc.kind === 'snapshot') doc = await storeRecordPages(tx, key, doc, fullBytes);
    await putImmutable(tx, key, doc, { shareImmutableValues: true });
    if (fullBytes <= cachedStateBytes) remember(stateCache(tx), cacheKey(key), Promise.resolve({ value: freezeRecords(key,
        key.namespace === 'atri_lifecycle' && value.domains ? copyRecordState(value)
            : key.namespace === 'atri_action_receipts' ? copyReceiptState(value) : cloneAdmittedDocument(value)), depth: doc.depth, replayBytes: doc.replayBytes, replayWork: doc.replayWork, bytes: fullBytes,
    integrity: (await readNativeRecord(tx, key)).integrity }), fullBytes);
}
