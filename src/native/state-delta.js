import { equalNativeDocuments, putImmutable } from './repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from './contracts.js';

const FORMAT = 'atria-world-state-v2';
const object = value => value !== null && !Array.isArray(value) && typeof value === 'object';
function difference(before, after, path = [], result = []) {
    if (equalNativeDocuments(before, after)) return result;
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
function apply(before, patch) {
    let value = structuredClone(before);
    for (const item of patch) {
        if (!Array.isArray(item.path) || item.path.some(part => typeof part !== 'string') || !['replace', 'remove'].includes(item.op)) throw new TypeError('Invalid State Delta');
        if (!item.path.length) { if (item.op !== 'replace') throw new TypeError('Invalid root Delta'); value = structuredClone(item.value); continue; }
        let parent = value;
        for (const field of item.path.slice(0, -1)) { if (!object(parent) || !Object.hasOwn(parent, field)) throw new TypeError('Missing Delta parent'); parent = parent[field]; }
        if (!object(parent)) throw new TypeError('Invalid Delta parent');
        const field = item.path.at(-1);
        if (item.op === 'remove') delete parent[field];
        else Object.defineProperty(parent, field, { value: structuredClone(item.value), writable: true, enumerable: true, configurable: true });
    }
    return value;
}
export async function readWorldState(tx, key, record, seen = new Set()) {
    if (seen.has(key.head) || seen.size > 32) throw new TypeError('World State Delta replay bound');
    const doc = record.doc;
    if (doc?.format !== FORMAT || doc.contentHash !== key.head) throw new TypeError('Unsupported or corrupt World State');
    let value;
    if (doc.kind === 'snapshot') value = doc.value;
    else if (doc.kind === 'delta') {
        const baseKey = { ...key, head: doc.baseHead }, base = await tx.getResource(baseKey);
        if (!base || doc.depth !== base.doc.depth + 1) throw new TypeError('Missing World State Delta dependency');
        value = apply(await readWorldState(tx, baseKey, base, new Set(seen).add(key.head)), doc.patch);
    } else throw new TypeError('Invalid World State encoding');
    return value;
}
export async function putWorldState(tx, key, value, previousHead = null) {
    if (key.kind !== K.sessionState || key.namespace !== 'atri_world_state') throw new TypeError('Invalid World State identity');
    const existing = await tx.getResource(key);
    if (existing) { await readWorldState(tx, key, existing); return; }
    const fullBytes = Buffer.byteLength(JSON.stringify(value));
    let doc = { format: FORMAT, kind: 'snapshot', value, contentHash: key.head, depth: 0, replayBytes: 0 };
    if (previousHead && previousHead !== key.head) {
        const previousKey = { ...key, head: previousHead }, previous = await tx.getResource(previousKey);
        if (previous) {
            const before = await readWorldState(tx, previousKey, previous), patch = difference(before, value);
            const bytes = Buffer.byteLength(JSON.stringify(patch));
            if (bytes * 2 < fullBytes && previous.doc.depth < 32 && previous.doc.replayBytes + bytes < fullBytes) {
                doc = { format: FORMAT, kind: 'delta', baseHead: previousHead, patch, contentHash: key.head,
                    depth: previous.doc.depth + 1, replayBytes: previous.doc.replayBytes + bytes };
            }
        }
    }
    await putImmutable(tx, key, doc);
}
