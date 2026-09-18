/**
 * Browser-side storage provider/mutator used by the unified Storage Management
 * center. The provider exposes capability metadata; the shared inspector
 * decides which view/edit/delete/create controls are rendered.
 */
import { callGenericPopup, POPUP_TYPE } from './popup.js';
import { createStorageInspector } from './storage-inspector.js';
import { t, translate } from './i18n.js';

const MAX_IDB_ROWS = 200;
const MAX_CACHE_BODY_CHARS = 256 * 1024;

const BROWSER_CATEGORIES = Object.freeze([
    { key: 'localStorage', label: 'localStorage' },
    { key: 'sessionStorage', label: 'sessionStorage' },
    { key: 'indexeddb', label: 'IndexedDB' },
    { key: 'cachestorage', label: 'Cache Storage' },
    { key: 'quota', label: 'Storage Quota' },
]);

function makeErr(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
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

async function estimateQuota() {
    try {
        if (!navigator.storage?.estimate) return { usedBytes: 0, quotaBytes: null, over: false };
        const { usage = 0, quota = null } = await navigator.storage.estimate();
        return { usedBytes: usage, quotaBytes: quota, over: quota != null && usage > quota };
    } catch {
        return { usedBytes: 0, quotaBytes: null, over: false };
    }
}

async function safeListDatabases() {
    try {
        if (!indexedDB.databases) return [];
        return await indexedDB.databases();
    } catch {
        return [];
    }
}

async function safeCacheKeys() {
    try {
        if (!('caches' in window)) return [];
        return await caches.keys();
    } catch {
        return [];
    }
}

function iconForBrowserCategory(key) {
    switch (key) {
        case 'localStorage': return 'hard-drive';
        case 'sessionStorage': return 'clock';
        case 'indexeddb': return 'database';
        case 'cachestorage': return 'layer-group';
        case 'quota': return 'chart-pie';
        default: return 'file';
    }
}

function requestResult(request, code = 'E_UNKNOWN') {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(makeErr(code, request.error?.message || 'IndexedDB request failed'));
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
                if (!cursor || rows.length >= MAX_IDB_ROWS) {
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
    constructor() {
        this.id = 'browser';
        this.canMutate = true;
        this.dataSource = null;
    }

    canCreateAtPath(pathArr) {
        return Array.isArray(pathArr)
            && pathArr.length === 1
            && (pathArr[0] === 'localStorage' || pathArr[0] === 'sessionStorage');
    }

    async fetch(pathArr) {
        const quota = await estimateQuota();
        if (pathArr.length === 0) return this._fetchRoot(quota);
        const [category, ...rest] = pathArr;
        switch (category) {
            case 'localStorage':
            case 'sessionStorage':
                return this._fetchStorageKeys(quota, category, rest);
            case 'indexeddb':
                return this._fetchIndexedDb(quota, rest);
            case 'cachestorage':
                return this._fetchCacheStorage(quota, rest);
            case 'quota':
                return this._fetchQuotaLeaf(quota);
            default:
                throw makeErr('E_INVALID_PATH', `Unknown category: ${category}`);
        }
    }

    async readAtPath(pathArr, entry) {
        const [category, ...rest] = pathArr;
        if ((category === 'localStorage' || category === 'sessionStorage') && rest.length === 1) {
            const value = window[category].getItem(rest[0]);
            if (value === null) throw makeErr('E_NOT_FOUND', `${category} key not found.`);
            return {
                kind: 'storage-key',
                content: value,
                modifiedMs: null,
                capabilities: capabilities({ view: true, viewContent: true, edit: true, delete: true }),
            };
        }

        if (category === 'indexeddb' && rest.length === 3) {
            const [dbName, storeName, token] = rest;
            const record = await readIdbRecord(dbName, storeName, token);
            const editable = isPlainJsonValue(record.value);
            return {
                kind: 'idb-record',
                content: editable ? JSON.stringify(record.value, null, 2) : summarizeValue(record.value),
                modifiedMs: null,
                structuredEditable: editable,
                key: formatIdbKey(record.key),
                keyPath: record.keyPath,
                capabilities: capabilities({ view: true, viewContent: true, edit: editable, delete: true }),
            };
        }

        if (category === 'cachestorage' && rest.length === 2) {
            const [cacheName, requestToken] = rest;
            const url = decodeURIComponent(requestToken);
            const cache = await caches.open(cacheName);
            const response = await cache.match(url);
            if (!response) throw makeErr('E_NOT_FOUND', 'Cached response not found.');
            const clone = response.clone();
            let body = '';
            try {
                body = await clone.text();
                if (body.length > MAX_CACHE_BODY_CHARS) body = `${body.slice(0, MAX_CACHE_BODY_CHARS)}\n… preview truncated …`;
            } catch {
                body = '[binary or unreadable response body]';
            }
            const details = {
                requestUrl: url,
                response: {
                    status: response.status,
                    statusText: response.statusText,
                    type: response.type,
                    headers: Object.fromEntries(response.headers.entries()),
                    body,
                },
            };
            return {
                kind: 'cache-request',
                content: JSON.stringify(details, null, 2),
                modifiedMs: null,
                capabilities: capabilities({ view: true, viewContent: true, delete: true }),
            };
        }

        return {
            kind: entry?.kind || 'browser-resource',
            content: null,
            modifiedMs: null,
            capabilities: entry?.capabilities || capabilities({ view: true }),
        };
    }

    async _fetchRoot(quota) {
        const entries = [];
        for (const category of BROWSER_CATEGORIES) {
            let sizeBytes = null;
            let childCount = 0;
            let labelSuffix = '';
            let canDrill = true;

            if (category.key === 'localStorage' || category.key === 'sessionStorage') {
                const storage = window[category.key];
                childCount = storage.length;
                let bytes = 0;
                for (let index = 0; index < storage.length; index++) {
                    const key = storage.key(index);
                    bytes += estimateEntryBytes(key, storage.getItem(key) ?? '');
                }
                sizeBytes = bytes;
                labelSuffix = ` (${childCount})`;
                canDrill = true;
            } else if (category.key === 'indexeddb') {
                const dbs = await safeListDatabases();
                childCount = dbs.length;
                labelSuffix = ` (${childCount})`;
                canDrill = childCount > 0;
            } else if (category.key === 'cachestorage') {
                const names = await safeCacheKeys();
                childCount = names.length;
                labelSuffix = ` (${childCount})`;
                canDrill = childCount > 0;
            } else if (category.key === 'quota') {
                sizeBytes = quota.usedBytes;
                canDrill = false;
            }

            entries.push({
                key: category.key,
                label: category.label,
                labelSuffix,
                icon: iconForBrowserCategory(category.key),
                kind: 'category',
                sizeBytes,
                mtimeMs: null,
                childCount,
                canDrill,
                canDelete: false,
                note: null,
                capabilities: capabilities(),
            });
        }
        return {
            target: { type: 'browser' },
            quota,
            path: [],
            breadcrumbs: [{ label: t`Browser Storage`, path: [] }],
            isLeaf: false,
            canMutate: true,
            entries,
        };
    }

    async _fetchStorageKeys(quota, kind, rest) {
        if (rest.length !== 0) throw makeErr('E_INVALID_PATH', `${kind} has no drilldown beyond keys.`);
        const storage = window[kind];
        const entries = [];
        for (let index = 0; index < storage.length; index++) {
            const key = storage.key(index);
            const value = storage.getItem(key) ?? '';
            entries.push({
                key,
                label: key,
                icon: 'key',
                kind: 'storage-key',
                sizeBytes: estimateEntryBytes(key, value),
                mtimeMs: null,
                canDrill: false,
                canDelete: true,
                note: value.length > 100 ? `${value.slice(0, 100)}…` : value,
                capabilities: capabilities({ view: true, viewContent: true, edit: true, delete: true }),
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
                let storeCount = 0;
                try {
                    const db = await openDatabase(info.name);
                    storeCount = db.objectStoreNames.length;
                    db.close();
                } catch { /* unavailable DB */ }
                entries.push({
                    key: info.name,
                    label: info.name,
                    labelSuffix: ` (${storeCount} ${translate('stores')})`,
                    icon: 'database',
                    kind: 'idb-db',
                    sizeBytes: null,
                    mtimeMs: null,
                    childCount: storeCount,
                    canDrill: storeCount > 0,
                    canDelete: true,
                    note: null,
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
                    let count = 0;
                    try { count = await countStore(db, name); } catch { /* keep 0 */ }
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
                let requestCount = 0;
                try {
                    const cache = await caches.open(name);
                    requestCount = (await cache.keys()).length;
                } catch { /* leave 0 */ }
                entries.push({
                    key: name,
                    label: name,
                    labelSuffix: ` (${requestCount} ${translate('requests')})`,
                    icon: 'file-lines',
                    kind: 'cache',
                    sizeBytes: null,
                    mtimeMs: null,
                    childCount: requestCount,
                    canDrill: requestCount > 0,
                    canDelete: true,
                    note: null,
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
            key: encodeURIComponent(request.url),
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

    async _fetchQuotaLeaf(quota) {
        const note = quota.quotaBytes == null
            ? t`Browser did not report a quota.`
            : `${((quota.usedBytes / quota.quotaBytes) * 100).toFixed(1)}% used`;
        return {
            target: { type: 'browser' },
            quota,
            path: ['quota'],
            breadcrumbs: [
                { label: t`Browser Storage`, path: [] },
                { label: 'Storage Quota', path: ['quota'] },
            ],
            isLeaf: true,
            canMutate: true,
            entries: [{
                key: 'quota',
                label: 'Storage Quota',
                icon: 'chart-pie',
                kind: 'quota-leaf',
                sizeBytes: quota.usedBytes,
                mtimeMs: null,
                canDrill: false,
                canDelete: false,
                note,
                capabilities: capabilities({ view: true }),
            }],
        };
    }
}

export class BrowserMutator {
    async createAtPath(pathArr, key, value) {
        if (!Array.isArray(pathArr) || pathArr.length !== 1) {
            throw makeErr('E_INVALID_PATH', 'Create is supported only inside localStorage/sessionStorage.');
        }
        const [category] = pathArr;
        if (category !== 'localStorage' && category !== 'sessionStorage') {
            throw makeErr('E_INVALID_PATH', 'This browser storage category does not support create.');
        }
        window[category].setItem(String(key), String(value));
        return { ok: true };
    }

    async writeAtPath(pathArr, _entry, content) {
        if (!Array.isArray(pathArr) || pathArr.length < 2) {
            throw makeErr('E_INVALID_PATH', 'Storage write path is incomplete.');
        }
        const [category, ...rest] = pathArr;
        if (category === 'localStorage' || category === 'sessionStorage') {
            if (rest.length !== 1) throw makeErr('E_INVALID_PATH', `${category} path must be [category, key].`);
            window[category].setItem(rest[0], String(content));
            return { ok: true };
        }
        if (category === 'indexeddb' && rest.length === 3) {
            const [dbName, storeName, token] = rest;
            let value;
            try {
                value = JSON.parse(String(content));
            } catch (cause) {
                throw makeErr('E_INVALID_CONTENT', `IndexedDB record editor accepts JSON values: ${cause.message}`);
            }
            if (!isPlainJsonValue(value)) {
                throw makeErr('E_INVALID_CONTENT', 'This IndexedDB value cannot be safely represented as plain JSON.');
            }
            const key = decodeIdbKey(token);
            const db = await openDatabase(dbName);
            try {
                const tx = db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const request = store.keyPath == null ? store.put(value, key) : store.put(value);
                await requestResult(request);
            } finally {
                db.close();
            }
            return { ok: true };
        }
        throw makeErr('E_READ_ONLY', 'This browser resource is not editable.');
    }

    async deleteAtPath(pathArr) {
        if (!Array.isArray(pathArr) || pathArr.length < 2) {
            throw makeErr('E_INVALID_PATH', `Path must have at least [category, key]: got ${JSON.stringify(pathArr)}`);
        }
        const [category, ...rest] = pathArr;
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
                    await cache.delete(decodeURIComponent(rest[1]));
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
            await requestResult(tx.objectStore(storeName).clear());
        } finally {
            db.close();
        }
    }

    async _deleteIdbRecord(dbName, storeName, token) {
        const db = await openDatabase(dbName);
        try {
            const tx = db.transaction(storeName, 'readwrite');
            await requestResult(tx.objectStore(storeName).delete(decodeIdbKey(token)));
        } finally {
            db.close();
        }
    }
}

export async function openBrowserStorageInspector() {
    const container = document.createElement('div');
    container.classList.add('storageInspectorContainerWrapper');
    const inspector = createStorageInspector({
        provider: new BrowserProvider(),
        mutator: new BrowserMutator(),
        container,
    });
    await inspector.init();
    return callGenericPopup(container, POPUP_TYPE.DISPLAY, '', {
        wide: true,
        wider: true,
        large: true,
        allowVerticalScrolling: true,
        okButton: t`Close`,
    });
}
