import { localforage } from '../lib.js';
import { translateShellText } from './atria-shell/localization.js';
import { loadEntryLocalization } from './entry-localization.js';

// Keep these names in one place: both the application and storage overview use them.
export const APPLICATION_BROWSER_STORES = Object.freeze({
    tokenCache: { name: 'Atria_ChatCompletions', legacyName: 'SillyTavern_ChatCompletions', category: 'cache', label: 'Token count cache' },
    thumbnails: { name: 'Atria_Thumbnails', legacyName: 'SillyTavern_Thumbnails', category: 'cache', label: 'Background thumbnail cache' },
    samplers: { name: 'Atria_TextCompletions', legacyName: 'SillyTavern_TextCompletions', category: 'preferences', label: 'Sampler preferences' },
    prompts: { name: 'Atria_Prompts', legacyName: 'SillyTavern_Prompts', category: 'sessions', label: 'Prompt diagnostics' },
});

const STORE = 'keyvaluepairs';
const BLOB_TEST_STORE = 'local-forage-detect-blob-support';
const KEEP_ALIVE_KEY = '__atria_migration_keepalive__';
const BLOCKED_TIMEOUT_MS = 15000;
const MIGRATION_FAILURE_MESSAGES = Object.freeze({
    'fallback-deferred': 'Browser data migration was postponed. Your old data is still there; reload when you are ready to continue.',
    'websql-unavailable': 'This browser uses an older database that cannot be moved safely here. Your data is still there; do not clear browser storage.',
    'data-conflict': 'Old and new browser data differ. Both are kept; resolve the conflict before reloading.',
    default: 'Browser data could not be moved safely. Your data is still preserved. Close other Atria tabs and reload; if the problem continues, check browser storage.',
});
const states = new Map();
let warningShown = false;
let fallbackConfirmation;
let earlyLocalization;

function migrationError(message, code = 'migration-failed') { return Object.assign(new Error(message), { code }); }

async function startupText(message) {
    try {
        earlyLocalization ??= loadEntryLocalization();
        return (await earlyLocalization).translate(message);
    } catch { return translateShellText(message); }
}

function reportFailure(error) {
    console.error('Browser storage migration did not finish:', error);
    if (warningShown) return;
    warningShown = true;
    const message = Object.hasOwn(MIGRATION_FAILURE_MESSAGES, error?.code) ? MIGRATION_FAILURE_MESSAGES[error.code] : MIGRATION_FAILURE_MESSAGES.default;
    const show = () => { void startupText(message).then(text => globalThis.toastr?.error(text, '', { timeOut: 0, extendedTimeOut: 0, closeButton: true })); };
    if (document.readyState === 'complete') show();
    else window.addEventListener('load', show, { once: true });
}

function requestResult(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || migrationError('IndexedDB request failed.'));
    });
}

function transactionResult(transaction) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error || migrationError('IndexedDB transaction was aborted.'));
        transaction.onerror = () => {}; // The abort event carries the final result.
    });
}

// Queue work inside request callbacks: a live transaction can still be inactive
// between events while an asynchronous blob comparison is in progress.
function holdTransaction(store) {
    let running = true, failure = null;
    const pending = [];
    const fail = error => {
        failure = error; running = false;
        while (pending.length) pending.shift().reject(error);
    };
    const next = () => {
        if (!running) return;
        try {
            const request = store.get(KEEP_ALIVE_KEY);
            request.onsuccess = () => {
                while (pending.length) {
                    const job = pending.shift();
                    try { job.resolve(job.action()); } catch (error) { job.reject(error); }
                }
                next();
            };
            request.onerror = () => fail(request.error || migrationError('IndexedDB transaction became unavailable.'));
        } catch (error) { fail(error); }
    };
    next();
    return {
        run(action) {
            if (!running) return Promise.reject(failure || migrationError('IndexedDB transaction has ended.'));
            return new Promise((resolve, reject) => pending.push({ action, resolve, reject }));
        },
        release() { running = false; },
    };
}

function asBytes(value) {
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return null;
}

function decodeLocalForageBlob(value) {
    if (!value || typeof value !== 'object' || !value.__local_forage_encoded_blob) return value;
    const data = atob(value.data);
    return new Blob([Uint8Array.from(data, char => char.charCodeAt(0))], { type: value.type });
}

// IndexedDB uses structured clone, so verify values including binary data and cycles.
async function equalValues(left, right, seen = { left: new WeakMap(), right: new WeakMap() }) {
    left = decodeLocalForageBlob(left); right = decodeLocalForageBlob(right);
    if (Object.is(left, right)) return true;
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
    if (seen.left.has(left)) return seen.left.get(left) === right;
    if (seen.right.has(right)) return false;
    seen.left.set(left, right); seen.right.set(right, left);
    if (left instanceof Blob || right instanceof Blob) {
        if (!(left instanceof Blob && right instanceof Blob) || left.size !== right.size || left.type !== right.type) return false;
        if ((left instanceof File || right instanceof File) && (!(left instanceof File && right instanceof File) || left.name !== right.name || left.lastModified !== right.lastModified)) return false;
        return equalValues(await left.arrayBuffer(), await right.arrayBuffer(), seen);
    }
    const a = asBytes(left), b = asBytes(right);
    if (a || b) return Boolean(a && b && left.constructor === right.constructor && a.length === b.length && a.every((byte, index) => byte === b[index]));
    if (left instanceof Date || right instanceof Date) return left instanceof Date && right instanceof Date && Object.is(left.getTime(), right.getTime());
    if (left instanceof RegExp || right instanceof RegExp) return left instanceof RegExp && right instanceof RegExp && String(left) === String(right);
    if (left instanceof Map || right instanceof Map) {
        if (!(left instanceof Map && right instanceof Map) || left.size !== right.size) return false;
        const aEntries = [...left], bEntries = [...right];
        for (let i = 0; i < aEntries.length; i++) if (!await equalValues(aEntries[i], bEntries[i], seen)) return false;
        return true;
    }
    if (left instanceof Set || right instanceof Set) {
        if (!(left instanceof Set && right instanceof Set) || left.size !== right.size) return false;
        return equalValues([...left], [...right], seen);
    }
    if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false;
    if (Array.isArray(left) && left.length !== right.length) return false;
    if (Object.getPrototypeOf(left) !== Object.prototype && !Array.isArray(left)) throw migrationError('An unsupported browser data value needs manual recovery.');
    const leftKeys = Object.keys(left).sort(), rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) return false;
    for (const key of leftKeys) if (!await equalValues(left[key], right[key], seen)) return false;
    return true;
}

// Opening a missing legacy database is aborted before it can be created.
async function legacyDatabaseVersion(name) {
    if (!globalThis.indexedDB) return null;
    if (typeof indexedDB.databases === 'function') {
        try {
            const entry = (await indexedDB.databases()).find(item => item.name === name);
            if (!entry) return null;
            if (Number.isSafeInteger(entry.version)) return entry.version;
        } catch { /* Try the non-creating probe below. */ }
    }
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(name); let absent = false;
        request.onupgradeneeded = event => { if (event.oldVersion === 0) { absent = true; request.transaction.abort(); } };
        request.onsuccess = () => { const version = request.result.version; request.result.close(); resolve(version); };
        request.onerror = () => absent ? resolve(null) : reject(request.error || migrationError('Could not inspect browser data.'));
        request.onblocked = () => reject(migrationError('Another tab is using browser data.'));
    });
}

async function openTarget(name) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(name); let cancelled = false;
        request.onupgradeneeded = () => { request.transaction.abort(); };
        request.onerror = () => reject(request.error || migrationError('Could not open the destination database.'));
        request.onsuccess = () => { const db = request.result; if (cancelled) { db.close(); return; } db.onversionchange = () => db.close(); resolve(db); };
        request.onblocked = () => { cancelled = true; reject(migrationError('Another tab is using the destination database.')); };
    });
}

async function copyRecords(targetDb, records) {
    const tx = targetDb.transaction(STORE, 'readwrite'), completion = transactionResult(tx);
    completion.catch(() => {});
    const store = tx.objectStore(STORE), lease = holdTransaction(store);
    try {
        for (const [key, value] of records) {
            const existingKey = await lease.run(() => requestResult(store.getKey(key)));
            if (existingKey !== undefined) {
                if (!await equalValues(await lease.run(() => requestResult(store.get(key))), value)) throw migrationError('The old and new browser data contain different values for the same key.', 'data-conflict');
            } else await lease.run(() => requestResult(store.put(value, key)));
        }
        for (const [key, value] of records) {
            if (await lease.run(() => requestResult(store.getKey(key))) === undefined || !await equalValues(await lease.run(() => requestResult(store.get(key))), value)) throw migrationError('The copied browser data could not be verified.');
        }
        lease.release();
        await completion;
    } catch (error) {
        lease.release();
        try { tx.abort(); } catch { /* Already completed or aborted. */ }
        await completion.catch(() => {});
        throw error;
    }
}

function deleteDatabase(name) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name); let timer;
        request.onsuccess = () => { clearTimeout(timer); resolve(); };
        request.onerror = () => { clearTimeout(timer); reject(request.error || migrationError('Could not remove the verified old database.')); };
        request.onblocked = () => { timer ??= setTimeout(() => reject(migrationError('Close other tabs to finish removing the old database.')), BLOCKED_TIMEOUT_MS); };
    });
}

async function migrateIndexedDb(oldName, targetDb, attempts = 0) {
    const version = await legacyDatabaseVersion(oldName);
    if (version == null) return;
    if (!targetDb) throw migrationError('The destination IndexedDB is unavailable.');
    if (!Number.isSafeInteger(version) || version >= Number.MAX_SAFE_INTEGER) throw migrationError('The old database version cannot be upgraded safely.');
    await new Promise((resolve, reject) => {
        const request = indexedDB.open(oldName, version + 1);
        let cancelled = false, absent = false, upgraded = false, failure, timer;
        request.onblocked = () => { timer ??= setTimeout(() => { cancelled = true; reject(migrationError('Close other tabs to move browser data.')); }, BLOCKED_TIMEOUT_MS); };
        request.onupgradeneeded = event => {
            clearTimeout(timer);
            upgraded = true;
            const db = request.result, tx = request.transaction;
            if (cancelled || event.oldVersion === 0) { absent = event.oldVersion === 0; tx.abort(); return; }
            const unknown = [...db.objectStoreNames].filter(name => name !== STORE && name !== BLOB_TEST_STORE);
            if (unknown.length) { failure = migrationError('The old database contains additional stores and was kept.'); tx.abort(); return; }
            if (!db.objectStoreNames.contains(STORE)) return;
            const store = tx.objectStore(STORE), lease = holdTransaction(store);
            (async () => {
                try {
                    const [keys, values] = await Promise.all([lease.run(() => requestResult(store.getAllKeys())), lease.run(() => requestResult(store.getAll()))]);
                    if (keys.length !== values.length) throw migrationError('The old database could not be read completely.');
                    await copyRecords(targetDb, keys.map((key, index) => [key, values[index]]));
                    // Once committed, old localForage tabs cannot write to the copied store.
                    await lease.run(() => { db.deleteObjectStore(STORE); lease.release(); });
                } catch (error) {
                    failure = error; lease.release();
                    try { tx.abort(); } catch { /* The transaction already ended. */ }
                }
            })();
        };
        request.onerror = () => {
            clearTimeout(timer);
            if (absent && !cancelled) resolve();
            else if (!cancelled && !failure && request.error?.name === 'VersionError' && attempts < 4) migrateIndexedDb(oldName, targetDb, attempts + 1).then(resolve, reject);
            else reject(failure || request.error || migrationError('Could not move the old database.'));
        };
        request.onsuccess = () => {
            clearTimeout(timer); request.result.close();
            if (cancelled) return;
            if (!upgraded) {
                if (attempts >= 4) reject(migrationError('The old database kept changing during migration.'));
                else migrateIndexedDb(oldName, targetDb, attempts + 1).then(resolve, reject);
            } else deleteDatabase(oldName).then(resolve, reject);
        };
    });
}

function legacyLocalStorageEntries(name) {
    const prefix = name + '/', entries = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) entries.push([key, localStorage.getItem(key)]);
    }
    return entries;
}

async function confirmFallbackMigration() {
    // Web Storage has no atomic compare-and-delete. Ask only when old fallback
    // data exists, so an old tab cannot keep writing while it is being moved.
    fallbackConfirmation ??= (async () => {
        if (document.readyState !== 'complete') await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
        const message = await startupText('Older browser data is ready to move. Close other Atria or SillyTavern tabs at this address, then choose OK. If you cancel, the old data stays where it is and you can reload to try again.');
        return window.confirm(message);
    })();
    if (!await fallbackConfirmation) throw Object.assign(migrationError('The user postponed migration of old browser storage.'), { code: 'fallback-deferred' });
}

async function migrateLocalStorage(oldName, target, targetDb) {
    const entries = legacyLocalStorageEntries(oldName);
    if (!entries.length) return;
    await confirmFallbackMigration();
    // Re-read after the user closes the other tabs; no data is removed on cancel.
    const currentEntries = legacyLocalStorageEntries(oldName);
    const serializer = await localforage.getSerializer();
    const records = currentEntries.map(([key, value]) => [key.slice(oldName.length + 1), serializer.deserialize(value)]);
    if (targetDb) await copyRecords(targetDb, records);
    else {
        const existing = new Set(await target.keys());
        for (const [key, value] of records) {
            if (existing.has(key)) {
                if (!await equalValues(await target.getItem(key), value)) throw migrationError('The old and new browser data contain different values for the same key.', 'data-conflict');
            } else await target.setItem(key, value);
        }
        for (const [key, value] of records) if (!await equalValues(await target.getItem(key), value)) throw migrationError('The copied browser data could not be verified.');
    }
    // A stale tab may still write legacy localStorage. Preserve it if it changed.
    const current = legacyLocalStorageEntries(oldName);
    if (current.length !== currentEntries.length || currentEntries.some(([key, value]) => localStorage.getItem(key) !== value)) throw migrationError('The old browser data changed during migration.');
    for (const [key, value] of currentEntries) {
        if (localStorage.getItem(key) !== value) throw migrationError('The old browser data changed during migration.');
        localStorage.removeItem(key);
    }
}

async function migrate(config, target) {
    await target.ready();
    if (target.driver() === localforage.WEBSQL) throw Object.assign(migrationError('Legacy WebSQL cannot be inspected safely in this browser.'), { code: 'websql-unavailable' });
    const targetDb = target.driver() === localforage.INDEXEDDB ? await openTarget(config.name) : null;
    try {
        await migrateIndexedDb(config.legacyName, targetDb);
        await migrateLocalStorage(config.legacyName, target, targetDb);
    } finally { targetDb?.close(); }
}

function createStore(config) {
    const target = localforage.createInstance({ name: config.name });
    const ready = migrate(config, target).catch(error => { states.set(config.name, { status: 'failed', code: error?.code || 'migration-failed' }); reportFailure(error); throw error; });
    ready.catch(() => {}); // The application may not use every store during this session.
    states.set(config.name, { status: 'running' });
    ready.then(() => states.set(config.name, { status: 'complete' }), () => {});
    return Object.fromEntries(['getItem', 'setItem', 'removeItem', 'clear'].map(method => [method, (...args) => ready.then(() => target[method](...args))]));
}

export const applicationBrowserStores = Object.freeze(Object.fromEntries(Object.entries(APPLICATION_BROWSER_STORES).map(([key, config]) => [key, createStore(config)])));
export const browserStorageMigrationState = name => states.get(name)?.status || null;
export const browserStorageMigrationIssues = () => [...new Set([...states.values()].filter(state => state.status === 'failed').map(state => state.code))];
