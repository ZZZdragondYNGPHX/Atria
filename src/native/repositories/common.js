import { createHash } from 'node:crypto';

import { ConflictError } from '../../storage/errors.js';
import { readWorldState } from '../state-delta.js';

function stableJson(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
    return '{' + Object.keys(value)
        .sort()
        .map(key => JSON.stringify(key) + ':' + stableJson(value[key]))
        .join(',') + '}';
}

export function cloneNativeDocument(value) {
    return structuredClone(value);
}

export function serializeNativeDocument(value) {
    return stableJson(value);
}

export function hashNativeDocument(value) {
    return createHash('sha256').update(stableJson(value)).digest('hex');
}

export function nativeRecord(value, {
    existing = null,
    createdAt = undefined,
    updatedAt = undefined,
} = {}) {
    const doc = cloneNativeDocument(value);
    const now = Date.now();
    return {
        doc,
        integrity: hashNativeDocument(doc),
        createdAt: Number(createdAt ?? existing?.createdAt ?? now),
        updatedAt: Number(updatedAt ?? now),
    };
}

export async function putImmutable(tx, key, value) {
    const record = nativeRecord(value);
    const { doc, integrity } = record;
    const existing = await tx.getResource(key);
    if (existing) {
        if (existing.integrity === integrity) return existing.doc;
        throw new ConflictError('native_immutable_conflict', { key });
    }
    const result = await tx.putResourceIfMatch(key, null, record);
    if (result.updated) return doc;
    const raced = await tx.getResource(key);
    if (raced?.integrity === integrity) return raced.doc;
    throw new ConflictError('native_immutable_conflict', { key });
}

export async function putMutable(tx, key, value, { expectedIntegrity = undefined } = {}) {
    const existing = await tx.getResource(key);
    const record = nativeRecord(value, { existing });
    if (expectedIntegrity === undefined) {
        await tx.putResource(key, record);
        return record.doc;
    }
    const result = await tx.putResourceIfMatch(key, expectedIntegrity, record);
    if (!result.updated) throw new ConflictError('native_write_conflict', { key });
    return record.doc;
}

export async function getNativeDocument(tx, key) {
    const record = await tx.getResource(key);
    if (record && key.kind === 'atri_session_state' && key.namespace === 'atri_world_state') return readWorldState(tx, key, record);
    return record ? record.doc : null;
}

export async function listNativeDocuments(tx, filter) {
    const records = await tx.listResources(filter);
    return records.map(record => record.doc);
}


// FS transactions publish commit-last but do not isolate concurrent operations.
// Keep each Native resource's repository writes ordered across repository instances.
const resourceWrites = new Map();
export async function withNativeResourceWrite(handle, resourceId, operation) {
    const key = JSON.stringify([handle, resourceId]);
    const next = (resourceWrites.get(key) || Promise.resolve()).catch(() => {}).then(operation);
    resourceWrites.set(key, next);
    try { return await next; } finally { if (resourceWrites.get(key) === next) resourceWrites.delete(key); }
}


export function withNativeResourceWrites(handle, resourceIds, operation) {
    const ids = [...new Set(resourceIds)].sort();
    const enter = index => index === ids.length ? operation() : withNativeResourceWrite(handle, ids[index], () => enter(index + 1));
    return enter(0);
}
