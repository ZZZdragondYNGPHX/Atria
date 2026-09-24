import { createHash } from 'node:crypto';

import { ConflictError } from '../../storage/errors.js';

function assertJsonValue(value, field, seen = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (typeof value !== 'object') throw new TypeError(`${field} must contain JSON values only`);
    if (seen.has(value)) throw new TypeError(`${field} must not contain cycles`);
    seen.add(value);
    if (Array.isArray(value)) {
        value.forEach((item, index) => assertJsonValue(item, `${field}[${index}]`, seen));
    } else {
        // Jest VM modules and plugin/worker boundaries can hand us ordinary
        // JSON objects from another realm, where direct prototype identity
        // differs from this realm's Object.prototype. Brand-check instead:
        // Dates/Maps/Sets/etc. retain distinct tags while cross-realm plain
        // objects (including null-prototype objects) remain [object Object].
        if (Object.prototype.toString.call(value) !== '[object Object]') {
            throw new TypeError(`${field} must contain plain JSON objects only`);
        }
        for (const [key, item] of Object.entries(value)) {
            assertJsonValue(item, `${field}.${key}`, seen);
        }
    }
    seen.delete(value);
}

function stableJson(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
    return '{' + Object.keys(value)
        .sort()
        .map(key => JSON.stringify(key) + ':' + stableJson(value[key]))
        .join(',') + '}';
}

export function cloneNativeDocument(value, field = 'Native resource') {
    assertJsonValue(value, field);
    return structuredClone(value);
}

export function hashNativeDocument(value) {
    const cloned = cloneNativeDocument(value);
    return createHash('sha256').update(stableJson(cloned)).digest('hex');
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
    const doc = cloneNativeDocument(value);
    const integrity = hashNativeDocument(doc);
    const existing = await tx.getResource(key);
    if (existing) {
        if (existing.integrity === integrity) return existing.doc;
        throw new ConflictError('native_immutable_conflict', { key });
    }
    const record = nativeRecord(doc);
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
