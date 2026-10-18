import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { serialize as serializeV8 } from 'node:v8';

import { ConflictError } from '../../storage/errors.js';
import { readWorldState } from '../state-delta.js';

class InvalidJsonValue extends Error {
    constructor(reason) { super(reason); this.path = []; }
}

function assertJsonValue(value, seen = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (typeof value !== 'object') throw new InvalidJsonValue('must contain JSON values only');
    if (seen.has(value)) throw new InvalidJsonValue('must not contain cycles');
    seen.add(value);
    if (Array.isArray(value)) {
        const length = value.length;
        let index = 0;
        try {
            for (; index < length; index++) if (index in value) assertJsonValue(value[index], seen);
        } catch (error) {
            if (error instanceof InvalidJsonValue) error.path.unshift(index);
            throw error;
        }
    } else {
        // Jest VM modules and plugin/worker boundaries can hand us ordinary
        // JSON objects from another realm, where direct prototype identity
        // differs from this realm's Object.prototype. Brand-check instead:
        // Dates/Maps/Sets/etc. retain distinct tags while cross-realm plain
        // objects (including null-prototype objects) remain [object Object].
        if (Object.prototype.toString.call(value) !== '[object Object]') {
            throw new InvalidJsonValue('must contain plain JSON objects only');
        }
        let key;
        try {
            for (const entry of Object.entries(value)) { key = entry[0]; assertJsonValue(entry[1], seen); }
        } catch (error) {
            if (error instanceof InvalidJsonValue) error.path.unshift(key);
            throw error;
        }
    }
    seen.delete(value);
}

function stableJson(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    // Preserve the existing canonical bytes (including sparse array slots),
    // without allocating a callback and intermediate array at every level.
    if (Array.isArray(value)) {
        let text = '[';
        for (let index = 0; index < value.length; index++) {
            if (index) text += ',';
            if (index in value) text += stableJson(value[index]);
        }
        return text + ']';
    }
    const keys = Object.keys(value).sort();
    let text = '{';
    for (let index = 0; index < keys.length; index++) {
        if (index) text += ',';
        const key = keys[index];
        text += JSON.stringify(key) + ':' + stableJson(value[key]);
    }
    return text + '}';
}

export function cloneNativeDocument(value, field = 'Native resource') {
    // Successful validation does not construct or maintain an error path.
    // Keep the original traversal/getter order; build its exact location only
    // when an invalid value propagates out of the recursive walk.
    try { assertJsonValue(value); } catch (error) {
        if (!(error instanceof InvalidJsonValue)) throw error;
        const location = field + error.path.map(key => typeof key === 'number' ? `[${key}]` : '.' + key).join('');
        throw new TypeError(`${location} ${error.message}`);
    }
    return structuredClone(value);
}

// Pure byte transformation only. Every caller still validates and freshly
// clones its entire input, then computes the key from those actual bytes.
// No resource/identity/permission/receipt/bank lookup is cached. Bounded memory
// avoids retaining an unbounded history of transient documents.
const canonicalDocuments = new Map();
let canonicalDocumentBytes = 0;
const MAX_CANONICAL_DOCUMENTS = 256;
const MAX_CANONICAL_BYTES = 4 * 1024 * 1024;

function canonicalDocument(value) {
    const cloned = cloneNativeDocument(value);
    if (cloned === null || typeof cloned !== 'object') return { text: stableJson(cloned), digest: null };
    // An exact local binary key preserves sparse slots and all cloned values.
    // It is never persisted: existing canonical text and SHA256 stay unchanged.
    const bytes = serializeV8(cloned).toString('base64');
    const cached = canonicalDocuments.get(bytes);
    if (cached) return cached;
    const entry = { text: stableJson(cloned), digest: null };
    const size = 2 * (bytes.length + entry.text.length);
    if (size <= MAX_CANONICAL_BYTES) {
        while (canonicalDocuments.size >= MAX_CANONICAL_DOCUMENTS || canonicalDocumentBytes + size > MAX_CANONICAL_BYTES) {
            const first = canonicalDocuments.keys().next().value, removed = canonicalDocuments.get(first);
            canonicalDocumentBytes -= 2 * (first.length + removed.text.length);
            canonicalDocuments.delete(first);
        }
        canonicalDocuments.set(bytes, entry); canonicalDocumentBytes += size;
    }
    return entry;
}

export function serializeNativeDocument(value) {
    return canonicalDocument(value).text;
}

export function hashNativeDocument(value) {
    const entry = canonicalDocument(value);
    return entry.digest ??= createHash('sha256').update(entry.text).digest('hex');
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
