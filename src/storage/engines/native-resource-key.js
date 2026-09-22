import { createHash } from 'node:crypto';

import {
    NATIVE_RESOURCE_KINDS,
    assertNativeResourceKey,
    getNativeResourceKeyFields,
} from '../../native/contracts.js';

export const NATIVE_STORAGE_KINDS = Object.freeze(Object.values(NATIVE_RESOURCE_KINDS));
const NATIVE_KIND_SET = new Set(NATIVE_STORAGE_KINDS);

export function isNativeStorageKind(kind) {
    return NATIVE_KIND_SET.has(kind);
}

export function normalizeNativeResourceKey(key) {
    return assertNativeResourceKey(key);
}

export function encodeNativeResourceKey(key) {
    const normalized = normalizeNativeResourceKey(key);
    const fields = getNativeResourceKeyFields(normalized.kind).filter(field => field !== 'handle');
    return JSON.stringify(fields.map(field => normalized[field]));
}

export function decodeNativeResourceKey(kind, handle, encoded) {
    if (!isNativeStorageKind(kind)) throw new TypeError(`unsupported Native storage kind '${String(kind)}'`);
    let values;
    try {
        values = JSON.parse(encoded);
    } catch {
        throw new TypeError('invalid Native storage resource key encoding');
    }
    if (!Array.isArray(values)) throw new TypeError('invalid Native storage resource key encoding');
    const fields = getNativeResourceKeyFields(kind).filter(field => field !== 'handle');
    if (values.length !== fields.length) throw new TypeError('invalid Native storage resource key field count');
    const key = { kind, handle };
    fields.forEach((field, index) => { key[field] = values[index]; });
    return normalizeNativeResourceKey(key);
}

export function nativeResourceFileId(key) {
    const normalized = normalizeNativeResourceKey(key);
    return createHash('sha256')
        .update(normalized.kind)
        .update('\0')
        .update(encodeNativeResourceKey(normalized))
        .digest('hex');
}

export function nativeResourceMatchesFilter(key, filter) {
    if (!filter || key.kind !== filter.kind || key.handle !== filter.handle) return false;
    const fields = getNativeResourceKeyFields(key.kind);
    for (const field of fields) {
        if (field === 'handle') continue;
        if (filter[field] !== undefined && key[field] !== filter[field]) return false;
    }
    return true;
}

export function sortAndLimitNativeRecords(records, filter = {}) {
    const out = [...records];
    if (filter.orderBy === 'updatedAt') {
        out.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    } else if (filter.orderBy === 'createdAt') {
        out.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    } else {
        out.sort((a, b) => encodeNativeResourceKey(a.key).localeCompare(encodeNativeResourceKey(b.key)));
    }
    if (Number.isSafeInteger(filter.limit) && filter.limit >= 0) return out.slice(0, filter.limit);
    return out;
}
