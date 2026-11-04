/** Browser storage enumeration and deletion for the resource center. */
import { t, translate } from './i18n.js';

const MANAGEMENT_KEY = 'atria_storage_center_tasks_v1';
const assertUserKey = (category, key) => { if (category === 'sessionStorage' && key === MANAGEMENT_KEY) throw makeErr('E_READ_ONLY', t`Operation history is managed by the resource center.`); };

function makeErr(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
}
export function encodeCacheRequest(request) {
    return encodeURIComponent(JSON.stringify({ url: request.url, method: request.method, headers: [...request.headers.entries()].sort() }));
}
function decodeCacheRequest(token) {
    const decoded = decodeURIComponent(token);
    if (!decoded.startsWith('{')) return new Request(decoded);
    const { url, method, headers } = JSON.parse(decoded);
    return new Request(url, { method, headers });
}

async function digestValue(value, seen = new Map()) {
    if (value === null || typeof value !== 'object') return [typeof value, String(value)];
    if (seen.has(value)) return ['cycle', seen.get(value)];
    seen.set(value, seen.size);
    if (value instanceof Blob) return ['blob', value.type, await digestBytes(await value.arrayBuffer())];
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
        const bytes = value instanceof ArrayBuffer ? value : value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
        return [value.constructor.name, await digestBytes(bytes)];
    }
    if (value instanceof Date) return ['date', value.toISOString()];
    if (value instanceof Map) return ['map', await Promise.all([...value].map(async ([key, item]) => [await digestValue(key, seen), await digestValue(item, seen)]))];
    if (value instanceof Set) return ['set', await Promise.all([...value].map(item => digestValue(item, seen)))];
    if (Array.isArray(value)) return ['array', await Promise.all(value.map(item => digestValue(item, seen)))];
    return ['object', await Promise.all(Object.keys(value).sort().map(async key => [key, await digestValue(value[key], seen)]))];
}
async function digestBytes(bytes) {
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function fingerprintBrowserResource(pathArr) {
    const [category, ...rest] = pathArr;
    let value;
    if (['localStorage', 'sessionStorage'].includes(category) && rest.length === 1) {
        value = window[category].getItem(rest[0]);
        if (value === null) throw makeErr('E_NOT_FOUND', 'Browser resource no longer exists.');
    } else if (category === 'indexeddb' && rest.length === 3) value = (await readIdbRecord(...rest)).value;
    else if (category === 'cachestorage' && rest.length === 2) {
        if (!(await caches.keys()).includes(rest[0])) throw makeErr('E_NOT_FOUND', 'Browser resource no longer exists.');
        const response = await (await caches.open(rest[0])).match(decodeCacheRequest(rest[1]));
        if (!response || response.type === 'opaque') throw makeErr('E_UNAVAILABLE', 'This cache response cannot be verified.');
        value = { status: response.status, headers: [...response.headers.entries()].sort(), body: await response.arrayBuffer() };
    } else if (category === 'indexeddb' && [1, 2].includes(rest.length) || category === 'cachestorage' && rest.length === 1) {
        if (category === 'cachestorage' && !(await caches.keys()).includes(rest[0])) throw makeErr('E_NOT_FOUND', 'Browser resource no longer exists.');
        const response = await new BrowserProvider().fetch(pathArr);
        value = [];
        for (const entry of [...response.entries].sort((a, b) => a.key.localeCompare(b.key))) value.push([entry.key, await fingerprintBrowserResource([...pathArr, entry.key])]);
    } else throw makeErr('E_INVALID_PATH', 'Select individual browser records for a fixed operation.');
    return digestBytes(new TextEncoder().encode(JSON.stringify(await digestValue(value))));
}

function capabilities(overrides = {}) {
    return {
        view: false,
        viewContent: false,
        edit: false,
        delete: false,
        download: false,
        restore: false,
        ...overrides,
    };
}

export function estimateEntryBytes(key, value) {
    return ((key ?? '').length + (value ?? '').length) * 2;
}

async function safeListDatabases() {
    try {
        if (!indexedDB.databases) throw makeErr('E_UNAVAILABLE', 'IndexedDB enumeration is unavailable.');
        return await indexedDB.databases();
    } catch (error) {
        throw makeErr('E_UNAVAILABLE', error.message);
    }
}

async function safeCacheKeys() {
    try {
        if (!('caches' in window)) return [];
        return await caches.keys();
    } catch (error) {
        throw makeErr('E_UNAVAILABLE', error.message);
    }
}

function requestResult(request, code = 'E_UNKNOWN') {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(makeErr(code, request.error?.message || 'IndexedDB request failed'));
    });
}

function transactionResult(transaction, code = 'E_UNKNOWN') {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(makeErr(code, transaction.error?.message || 'IndexedDB transaction failed'));
        transaction.onabort = () => reject(makeErr(code, transaction.error?.message || 'IndexedDB transaction aborted'));
    });
}

function openDatabase(dbName) {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(makeErr('E_DB_OPEN_FAILED', `Cannot open ${dbName}: ${req.error?.message ?? 'unknown'}`));
        req.onupgradeneeded = () => {
            req.transaction?.abort();
        };
    });
}

function countStore(db, storeName) {
    const tx = db.transaction(storeName, 'readonly');
    return requestResult(tx.objectStore(storeName).count());
}

function bytesToBase64(bytes) {
    let binary = '';
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (const byte of view) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function base64ToBytes(text) {
    const binary = atob(text);
    return Uint8Array.from(binary, ch => ch.charCodeAt(0)).buffer;
}

function encodeIdbKeyValue(value) {
    if (typeof value === 'string') return { t: 's', v: value };
    if (typeof value === 'number') return { t: 'n', v: value };
    if (value instanceof Date) return { t: 'd', v: value.toISOString() };
    if (value instanceof ArrayBuffer) return { t: 'b', v: bytesToBase64(value) };
    if (ArrayBuffer.isView(value)) {
        return { t: 'b', v: bytesToBase64(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)) };
    }
    if (Array.isArray(value)) return { t: 'a', v: value.map(encodeIdbKeyValue) };
    throw makeErr('E_UNSUPPORTED_KEY', 'Unsupported IndexedDB key type.');
}

function decodeIdbKeyValue(encoded) {
    if (!encoded || typeof encoded !== 'object') throw makeErr('E_INVALID_PATH', 'Invalid IndexedDB key token.');
    if (encoded.t === 's') return String(encoded.v);
    if (encoded.t === 'n') return Number(encoded.v);
    if (encoded.t === 'd') return new Date(encoded.v);
    if (encoded.t === 'b') return base64ToBytes(String(encoded.v));
    if (encoded.t === 'a') return Array.isArray(encoded.v) ? encoded.v.map(decodeIdbKeyValue) : [];
    throw makeErr('E_INVALID_PATH', 'Unknown IndexedDB key token.');
}

function encodeIdbKey(key) {
    return encodeURIComponent(JSON.stringify(encodeIdbKeyValue(key)));
}

function decodeIdbKey(token) {
    try {
        return decodeIdbKeyValue(JSON.parse(decodeURIComponent(token)));
    } catch (error) {
        if (error?.code) throw error;
        throw makeErr('E_INVALID_PATH', 'Malformed IndexedDB key token.');
    }
}

function formatIdbKey(key) {
    if (key instanceof Date) return key.toISOString();
    if (Array.isArray(key)) return JSON.stringify(key);
    if (key instanceof ArrayBuffer || ArrayBuffer.isView(key)) return '[binary key]';
    return String(key);
}

function isPlainJsonValue(value, seen = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value !== 'object') return false;
    if (value instanceof Date || value instanceof Blob || value instanceof ArrayBuffer || ArrayBuffer.isView(value)
        || value instanceof Map || value instanceof Set) return false;
    if (seen.has(value)) return false;
    seen.add(value);
    if (Array.isArray(value)) {
        const ok = value.every(item => isPlainJsonValue(item, seen));
        seen.delete(value);
        return ok;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
        seen.delete(value);
        return false;
    }
    const ok = Object.values(value).every(item => isPlainJsonValue(item, seen));
    seen.delete(value);
    return ok;
}

function summarizeValue(value) {
    if (value === null) return 'null';
    if (typeof value === 'string') return value.length > 100 ? `${value.slice(0, 100)}…` : value;
    if (typeof value !== 'object') return String(value);
    if (value instanceof Date) return `Date(${value.toISOString()})`;
    if (value instanceof Blob) return `Blob(${value.size} B, ${value.type || 'unknown'})`;
    if (value instanceof ArrayBuffer) return `ArrayBuffer(${value.byteLength} B)`;
    if (ArrayBuffer.isView(value)) return `${value.constructor?.name || 'TypedArray'}(${value.byteLength} B)`;
    if (value instanceof Map) return `Map(${value.size})`;
    if (value instanceof Set) return `Set(${value.size})`;
    try {
        const text = JSON.stringify(value);
        return text.length > 120 ? `${text.slice(0, 120)}…` : text;
    } catch {
        return Object.prototype.toString.call(value);
    }
}

async function readStoreRows(dbName, storeName) {
    const db = await openDatabase(dbName);
    try {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const rows = [];
        await new Promise((resolve, reject) => {
            const req = store.openCursor();
            req.onerror = () => reject(makeErr('E_UNKNOWN', req.error?.message || 'Failed to enumerate IndexedDB records'));
            req.onsuccess = () => {
                const cursor = req.result;
                if (!cursor) {
                    resolve();
                    return;
                }
                const editable = isPlainJsonValue(cursor.value);
                rows.push({
                    key: encodeIdbKey(cursor.key),
                    label: formatIdbKey(cursor.key),
                    labelSuffix: '',
                    icon: 'file-code',
                    kind: 'idb-record',
                    sizeBytes: null,
                    mtimeMs: null,
                    childCount: 0,
                    canDrill: false,
                    canDelete: true,
                    note: summarizeValue(cursor.value),
                    capabilities: capabilities({
                        view: true,
                        viewContent: true,
                        edit: editable,
                        delete: true,
                    }),
                });
                cursor.continue();
            };
        });
        return rows;
    } finally {
        db.close();
    }
}

async function readIdbRecord(dbName, storeName, token) {
    const db = await openDatabase(dbName);
    try {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const key = decodeIdbKey(token);
        const value = await requestResult(store.get(key));
        if (value === undefined) throw makeErr('E_NOT_FOUND', 'IndexedDB record not found.');
        return { key, value, keyPath: store.keyPath };
    } finally {
        db.close();
    }
}

export class BrowserProvider {
    async fetch(pathArr) {
        const quota = null;
        const [category, ...rest] = pathArr;
        switch (category) {
            case 'localStorage':
            case 'sessionStorage':
                return this._fetchStorageKeys(quota, category, rest);
            case 'indexeddb':
                return this._fetchIndexedDb(quota, rest);
            case 'cachestorage':
                return this._fetchCacheStorage(quota, rest);
            default:
                throw makeErr('E_INVALID_PATH', `Unknown category: ${category}`);
        }
    }

    async _fetchStorageKeys(quota, kind, rest) {
        if (rest.length !== 0) throw makeErr('E_INVALID_PATH', `${kind} has no drilldown beyond keys.`);
        const storage = window[kind];
        const entries = [];
        for (let index = 0; index < storage.length; index++) {
            const key = storage.key(index);
            const editable = !(kind === 'sessionStorage' && key === MANAGEMENT_KEY);
            const value = storage.getItem(key) ?? '';
            entries.push({
                key,
                label: key,
                icon: 'key',
                kind: 'storage-key',
                sizeBytes: estimateEntryBytes(key, value),
                mtimeMs: null,
                canDrill: false,
                canDelete: editable,
                note: value.length > 100 ? `${value.slice(0, 100)}…` : value,
                capabilities: capabilities({ view: true, viewContent: true, edit: editable, delete: editable }),
            });
        }
        entries.sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0));
        return {
            target: { type: 'browser' },
            quota,
            path: [kind],
            breadcrumbs: [
                { label: t`Browser Storage`, path: [] },
                { label: kind, path: [kind] },
            ],
            isLeaf: true,
            canMutate: true,
            entries,
        };
    }

    async _fetchIndexedDb(quota, rest) {
        if (rest.length === 0) {
            const dbs = await safeListDatabases();
            const entries = [];
            for (const info of dbs) {
                if (!info.name) continue;
                let storeCount = null, failure = null;
                try {
                    const db = await openDatabase(info.name);
                    storeCount = db.objectStoreNames.length;
                    db.close();
                } catch (error) { failure = error.message; }
                entries.push({
                    key: info.name,
                    label: info.name,
                    labelSuffix: storeCount == null ? '' : ` (${storeCount} ${translate('stores')})`,
                    icon: 'database',
                    kind: 'idb-db',
                    sizeBytes: null,
                    mtimeMs: null,
                    childCount: storeCount,
                    canDrill: storeCount > 0,
                    canDelete: true,
                    note: failure,
                    capabilities: capabilities({ delete: true }),
                });
            }
            return {
                target: { type: 'browser' },
                quota,
                path: ['indexeddb'],
                breadcrumbs: [
                    { label: t`Browser Storage`, path: [] },
                    { label: 'IndexedDB', path: ['indexeddb'] },
                ],
                isLeaf: false,
                canMutate: true,
                entries,
            };
        }

        const [dbName, storeName, ...tail] = rest;
        if (!storeName) {
            const db = await openDatabase(dbName);
            try {
                const entries = [];
                for (const name of Array.from(db.objectStoreNames)) {
                    const count = await countStore(db, name);
                    entries.push({
                        key: name,
                        label: name,
                        labelSuffix: ` (${count} ${translate('records')})`,
                        icon: 'table',
                        kind: 'idb-store',
                        sizeBytes: null,
                        mtimeMs: null,
                        childCount: count,
                        canDrill: count > 0,
                        canDelete: true,
                        note: null,
                        capabilities: capabilities({ delete: true }),
                    });
                }
                return {
                    target: { type: 'browser' },
                    quota,
                    path: ['indexeddb', dbName],
                    breadcrumbs: [
                        { label: t`Browser Storage`, path: [] },
                        { label: 'IndexedDB', path: ['indexeddb'] },
                        { label: dbName, path: ['indexeddb', dbName] },
                    ],
                    isLeaf: false,
                    canMutate: true,
                    entries,
                };
            } finally {
                db.close();
            }
        }

        if (tail.length !== 0) throw makeErr('E_INVALID_PATH', 'IndexedDB record paths cannot be drilled further.');
        const entries = await readStoreRows(dbName, storeName);
        return {
            target: { type: 'browser' },
            quota,
            path: ['indexeddb', dbName, storeName],
            breadcrumbs: [
                { label: t`Browser Storage`, path: [] },
                { label: 'IndexedDB', path: ['indexeddb'] },
                { label: dbName, path: ['indexeddb', dbName] },
                { label: storeName, path: ['indexeddb', dbName, storeName] },
            ],
            isLeaf: true,
            canMutate: true,
            entries,
        };
    }

    async _fetchCacheStorage(quota, rest) {
        if (rest.length === 0) {
            const names = await safeCacheKeys();
            const entries = [];
            for (const name of names) {
                let requestCount = null, failure = null;
                try {
                    const cache = await caches.open(name);
                    requestCount = (await cache.keys()).length;
                } catch (error) { failure = error.message; }
                entries.push({
                    key: name,
                    label: name,
                    labelSuffix: requestCount == null ? '' : ` (${requestCount} ${translate('requests')})`,
                    icon: 'file-lines',
                    kind: 'cache',
                    sizeBytes: null,
                    mtimeMs: null,
                    childCount: requestCount,
                    canDrill: requestCount > 0,
                    canDelete: true,
                    note: failure,
                    capabilities: capabilities({ delete: true }),
                });
            }
            return {
                target: { type: 'browser' },
                quota,
                path: ['cachestorage'],
                breadcrumbs: [
                    { label: t`Browser Storage`, path: [] },
                    { label: 'Cache Storage', path: ['cachestorage'] },
                ],
                isLeaf: false,
                canMutate: true,
                entries,
            };
        }

        if (rest.length !== 1) throw makeErr('E_INVALID_PATH', 'Cache request paths cannot be drilled further.');
        const cacheName = rest[0];
        const cache = await caches.open(cacheName);
        const requests = await cache.keys();
        const entries = requests.map(request => ({
            key: encodeCacheRequest(request),
            label: request.url,
            labelSuffix: '',
            icon: 'link',
            kind: 'cache-request',
            sizeBytes: null,
            mtimeMs: null,
            childCount: 0,
            canDrill: false,
            canDelete: true,
            note: request.method,
            capabilities: capabilities({ view: true, viewContent: true, delete: true }),
        }));
        return {
            target: { type: 'browser' },
            quota,
            path: ['cachestorage', cacheName],
            breadcrumbs: [
                { label: t`Browser Storage`, path: [] },
                { label: 'Cache Storage', path: ['cachestorage'] },
                { label: cacheName, path: ['cachestorage', cacheName] },
            ],
            isLeaf: true,
            canMutate: true,
            entries,
        };
    }
}

export class BrowserMutator {
    async deleteAtPath(pathArr) {
        if (!Array.isArray(pathArr) || pathArr.length < 2) {
            throw makeErr('E_INVALID_PATH', `Path must have at least [category, key]: got ${JSON.stringify(pathArr)}`);
        }
        const [category, ...rest] = pathArr;
        assertUserKey(category, rest[0]);
        switch (category) {
            case 'localStorage':
            case 'sessionStorage':
                if (rest.length !== 1) throw makeErr('E_INVALID_PATH', `${category} path must be [category, key]`);
                window[category].removeItem(rest[0]);
                return { ok: true };
            case 'indexeddb':
                if (rest.length === 1) {
                    await this._deleteIdbDatabase(rest[0]);
                    return { ok: true };
                }
                if (rest.length === 2) {
                    await this._clearIdbStore(rest[0], rest[1]);
                    return { ok: true };
                }
                if (rest.length === 3) {
                    await this._deleteIdbRecord(rest[0], rest[1], rest[2]);
                    return { ok: true };
                }
                throw makeErr('E_INVALID_PATH', `IndexedDB path depth ${rest.length} invalid`);
            case 'cachestorage':
                if (rest.length === 1) {
                    await caches.delete(rest[0]);
                    return { ok: true };
                }
                if (rest.length === 2) {
                    const cache = await caches.open(rest[0]);
                    await cache.delete(decodeCacheRequest(rest[1]));
                    return { ok: true };
                }
                throw makeErr('E_INVALID_PATH', 'Cache Storage path depth invalid');
            case 'quota':
                throw makeErr('E_NOT_INSPECTABLE', 'Storage Quota is not deletable');
            default:
                throw makeErr('E_INVALID_PATH', `Unknown category: ${category}`);
        }
    }

    _deleteIdbDatabase(dbName) {
        return new Promise((resolve, reject) => {
            const req = indexedDB.deleteDatabase(dbName);
            let done = false;
            const timer = setTimeout(() => {
                if (done) return;
                done = true;
                reject(makeErr('E_DB_LOCKED', `Database "${dbName}" is locked by another connection. Try closing other Atria tabs and retry.`));
            }, 5000);
            req.onsuccess = () => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                resolve();
            };
            req.onerror = () => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                reject(makeErr('E_UNKNOWN', `Delete failed: ${req.error?.message ?? 'unknown'}`));
            };
        });
    }

    async _clearIdbStore(dbName, storeName) {
        const db = await openDatabase(dbName);
        try {
            const tx = db.transaction(storeName, 'readwrite');
            const committed = transactionResult(tx); committed.catch(() => {});
            await requestResult(tx.objectStore(storeName).clear()); await committed;
        } finally {
            db.close();
        }
    }

    async _deleteIdbRecord(dbName, storeName, token) {
        const db = await openDatabase(dbName);
        try {
            const tx = db.transaction(storeName, 'readwrite');
            const committed = transactionResult(tx); committed.catch(() => {});
            await requestResult(tx.objectStore(storeName).delete(decodeIdbKey(token))); await committed;
        } finally {
            db.close();
        }
    }
}
