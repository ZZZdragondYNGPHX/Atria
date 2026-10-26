import { immutableRecordValue } from '../record-values.js';
import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

import { ConflictError } from '../../storage/errors.js';
import { readStoredState, deltaStateNamespace } from '../state-delta.js';

// Property names recur throughout state records. Cache only their JSON spelling,
// never mutable values or document hashes; canonical bytes remain unchanged.
const encodedKeys = new Map();
function encodedKey(key) {
    if (key.length > 256) return JSON.stringify(key);
    const cached = encodedKeys.get(key);
    if (cached !== undefined) return cached;
    const text = JSON.stringify(key);
    if (encodedKeys.size >= 1024) encodedKeys.clear();
    encodedKeys.set(key, text);
    return text;
}

// Only host-owned immutable JSON can reuse canonical bytes. Bound retained text,
// not the number of worlds; mutable containers are always visited again.
const canonicalValues = new Map();
const canonicalLimit = 32 * 1024 * 1024;
let canonicalBytes = 0;
function canonicalValue(value) {
    let entry = canonicalValues.get(value);
    if (entry) return entry;
    const text = stableJson(value, false), bytes = Buffer.byteLength(text);
    entry = { text, bytes };
    const weight = text.length * 2;
    if (weight <= canonicalLimit / 4) {
        while (canonicalBytes + weight > canonicalLimit || canonicalValues.size >= 4096) {
            const first = canonicalValues.keys().next().value;
            canonicalBytes -= canonicalValues.get(first).text.length * 2;
            canonicalValues.delete(first);
        }
        canonicalValues.set(value, entry); canonicalBytes += weight;
    }
    return entry;
}
function stableJson(value, reuse = true) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (reuse && immutableRecordValue(value)) return canonicalValue(value).text;
    // Preserve the existing canonical bytes (including sparse array slots),
    // without allocating a callback and intermediate array at every level.
    if (Array.isArray(value)) {
        let text = '[';
        for (let index = 0; index < value.length; index++) {
            if (index) text += ',';
            if (index in value) text += stableJson(value[index], reuse);
        }
        return text + ']';
    }
    const keys = Object.keys(value).sort();
    let text = '{';
    for (let index = 0; index < keys.length; index++) {
        if (index) text += ',';
        const key = keys[index];
        text += encodedKey(key) + ':' + stableJson(value[key], reuse);
    }
    return text + '}';
}

export function cloneNativeDocument(value) {
    return structuredClone(value);
}

// For already admitted JSON trees only. These contain no transferables,
// prototypes or graph cycles, so the general structured-clone protocol is
// unnecessary. External inputs still use their existing admission boundary.
export function cloneAdmittedDocument(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(cloneAdmittedDocument);
    const copy = {};
    for (const key of Object.keys(value)) {
        const child = cloneAdmittedDocument(value[key]);
        if (key === '__proto__') Object.defineProperty(copy, key, { value: child, enumerable: true, writable: true, configurable: true });
        else copy[key] = child;
    }
    return copy;
}

// Internal state writes may borrow sealed record payloads. Copy every mutable
// envelope before the first await, preserving the write's snapshot semantics.
function copyStateDocument(value) {
    if (value === null || typeof value !== 'object' || immutableRecordValue(value)) return value;
    if (Array.isArray(value)) return value.map(copyStateDocument);
    const copy = {};
    for (const key of Object.keys(value)) {
        const child = copyStateDocument(value[key]);
        if (key === '__proto__') Object.defineProperty(copy, key, { value: child, enumerable: true, writable: true, configurable: true });
        else copy[key] = child;
    }
    return copy;
}

export function serializeNativeDocument(value) {
    return stableJson(value);
}

export function hashNativeDocument(value) {
    if (immutableRecordValue(value)) {
        const entry = canonicalValue(value);
        return entry.hash ??= createHash('sha256').update(entry.text).digest('hex');
    }
    return createHash('sha256').update(stableJson(value)).digest('hex');
}

// JSON byte accounting for admitted trees. Key order does not affect size;
// immutable record payloads share the same cached bytes used for identity.
export function nativeDocumentBytes(value) {
    if (value === null || typeof value !== 'object') return Buffer.byteLength(JSON.stringify(value) ?? 'null');
    if (immutableRecordValue(value)) return canonicalValue(value).bytes;
    if (Array.isArray(value)) {
        let size = 2 + Math.max(0, value.length - 1);
        for (let index = 0; index < value.length; index++) size += nativeDocumentBytes(value[index]);
        return size;
    }
    let size = 2, count = 0;
    for (const key of Object.keys(value)) {
        if (value[key] === undefined) continue;
        size += Number(count++ > 0) + Buffer.byteLength(encodedKey(key)) + 1 + nativeDocumentBytes(value[key]);
    }
    return size;
}

/** Compare already admitted JSON data directly, without serializing or hashing.
 * Object key order and signed zero have the same meaning as canonical JSON.
 * Computation inputs may require key order too: guest scripts can enumerate it. */
export function equalNativeDocuments(left, right, orderedKeys = false) {
    if (left === right) return true;
    if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
    if (Array.isArray(left)) {
        if (!Array.isArray(right) || left.length !== right.length) return false;
        for (let index = 0; index < left.length; index++) {
            if ((index in left) !== (index in right) || index in left && !equalNativeDocuments(left[index], right[index], orderedKeys)) return false;
        }
        return true;
    }
    if (Array.isArray(right)) return false;
    const keys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (keys.length !== rightKeys.length) return false;
    for (let index = 0; index < keys.length; index++) {
        const key = keys[index];
        if (orderedKeys && key !== rightKeys[index] || !Object.hasOwn(right, key) || !equalNativeDocuments(left[key], right[key], orderedKeys)) return false;
    }
    return true;
}

export function nativeRecord(value, {
    existing = null,
    createdAt = undefined,
    updatedAt = undefined,
    shareImmutableValues = false,
} = {}) {
    const integrity = hashNativeDocument(value), doc = shareImmutableValues ? copyStateDocument(value) : cloneNativeDocument(value);
    const now = Date.now();
    return {
        doc,
        integrity,
        createdAt: Number(createdAt ?? existing?.createdAt ?? now),
        updatedAt: Number(updatedAt ?? now),
    };
}

export async function putImmutable(tx, key, value, { shareImmutableValues = false } = {}) {
    const record = nativeRecord(value, { shareImmutableValues });
    const { doc, integrity } = record;
    const existing = await readNativeRecord(tx, key);
    if (existing) {
        if (existing.integrity === integrity) return cloneNativeDocument(existing.doc);
        throw new ConflictError('native_immutable_conflict', { key });
    }
    const result = await tx.putResourceIfMatch(key, null, record);
    if (result.updated) return doc;
    const raced = await readNativeRecord(tx, key);
    if (raced?.integrity === integrity) return cloneNativeDocument(raced.doc);
    throw new ConflictError('native_immutable_conflict', { key });
}

export async function putMutable(tx, key, value, { expectedIntegrity = undefined } = {}) {
    const existing = await readNativeRecord(tx, key);
    const record = nativeRecord(value, { existing });
    if (expectedIntegrity === undefined) {
        await tx.putResource(key, record);
        return record.doc;
    }
    const result = await tx.putResourceIfMatch(key, expectedIntegrity, record);
    if (!result.updated) throw new ConflictError('native_write_conflict', { key });
    return record.doc;
}

// Internal borrowed record. Callers may inspect it, but must copy before mutation
// or returning a public mutable document. SQL engines already return fresh rows.
export function readNativeRecord(tx, key) {
    return tx.getImmutableResource ? tx.getImmutableResource(key) : tx.getResource(key);
}

export async function getNativeDocument(tx, key) {
    const record = await tx.getResource(key);
    if (record && key.kind === 'atri_session_state' && deltaStateNamespace(key.namespace)) return readStoredState(tx, key, record);
    return record ? record.doc : null;
}

export async function listNativeDocuments(tx, filter) {
    const records = await tx.listResources(filter);
    return records.map(record => record.doc);
}


// FS transactions publish commit-last but do not isolate concurrent operations.
// Keep each Native resource's repository writes ordered across repository instances.
const resourceWrites = new Map();
const heldResourceWrites = new AsyncLocalStorage();
export async function withNativeResourceWrite(handle, resourceId, operation) {
    const key = JSON.stringify([handle, resourceId]);
    if (heldResourceWrites.getStore()?.get(key)?.open) return operation();
    const next = (resourceWrites.get(key) || Promise.resolve()).catch(() => {}).then(() => {
        const scope = { open: true }, held = new Map(heldResourceWrites.getStore() ?? []); held.set(key, scope);
        return heldResourceWrites.run(held, async () => { try { return await operation(); } finally { scope.open = false; } });
    });
    resourceWrites.set(key, next);
    try { return await next; } finally { if (resourceWrites.get(key) === next) resourceWrites.delete(key); }
}


export function withNativeResourceWrites(handle, resourceIds, operation) {
    const ids = [...new Set(resourceIds)].sort();
    const enter = index => index === ids.length ? operation() : withNativeResourceWrite(handle, ids[index], () => enter(index + 1));
    return enter(0);
}
