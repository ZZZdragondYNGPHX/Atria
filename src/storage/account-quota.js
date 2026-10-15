import { AsyncLocalStorage } from 'node:async_hooks';
import { assertRecoveryWrite, assertRecoveryDelete } from '../native/recovery-roots.js';
import { measureAccount } from './resource-accounting.js';
import { resourceContentBytes } from './resource-catalog.js';

const context = new AsyncLocalStorage();
const authorities = new WeakMap();
let defaultEngine = null;
export function accountEngineForDirectory(handle, root) {
    const authority = defaultEngine && authorities.get(defaultEngine);
    if (!authority) return null;
    try { return authority.directoriesByHandle(handle).root === root ? defaultEngine : null; } catch { return null; }
}
export async function accountQuotaLimit(engine, handle) {
    return authorities.has(engine) ? authorities.get(engine).limit(handle) : -1;
}

export class AccountQuotaError extends Error {
    constructor(code, details) { super(code); this.code = code; this.status = 413; this.details = details; }
}

const contentBytes = record => record == null ? 0 : resourceContentBytes(record.doc !== undefined ? record.doc
    : record.header && record.body ? { header: record.header, body: record.body } : record);

/** Serialize admission and commit, using engine isolation for the actual data.
 * No speculative reservation survives the transaction: FS redo/SQL commit is
 * the durable boundary. Reads and decreasing writes remain usable over quota.
 */
export function installAccountQuota(engine, { directoriesByHandle, limit, makeDefault = false }) {
    const original = engine.withTransaction.bind(engine);
    const authority = { engine, directoriesByHandle, limit, tails: new Map(), original };
    authorities.set(engine, authority);
    if (makeDefault) defaultEngine = engine;
    engine.withTransaction = (handle, operation) => {
        const active = context.getStore();
        if (active?.open && active.engine === engine && active.handle === handle && active.tx) return operation(active.tx);
        return withAccountQuota(engine, handle, async scope => original(handle, async tx => {
            const proxy = new Proxy(tx, { get(target, name) {
                const value = target[name];
                if (!['putResource', 'putResourceIfMatch', 'deleteResource'].includes(name)) return typeof value === 'function' ? value.bind(target) : value;
                return async (key, ...args) => {
                    if (name !== 'deleteResource') await assertRecoveryWrite(target, key);
                    else await assertRecoveryDelete(target, key);
                    if (!Number.isFinite(scope.limit) || scope.limit < 0) return value.call(target, key, ...args);
                    if (scope.used == null) {
                        const measured = await measureAccount({ engine, tx, handle, directories: directoriesByHandle(handle) });
                        if (measured.totalBytes == null) throw new AccountQuotaError('storage_usage_unavailable', { errors: measured.errors });
                        scope.used = measured.totalBytes;
                    }
                    const before = await target.getResource(key);
                    const deleting = name === 'deleteResource';
                    const next = deleting ? null : args[name === 'putResourceIfMatch' ? 1 : 0];
                    // Native records have identical canonical representation in every engine.
                    // Legacy file handlers are measured again by the enclosing request gate.
                    const delta = contentBytes(next) - contentBytes(before);
                    const managementReduction = next?.doc?.protocol === 'atria.storage-center.v1'
                        && next.doc.type === 'task' && ['clean', 'purge'].includes(next.doc.action);
                    if (!managementReduction) assertQuotaGrowth(scope, delta);
                    const result = await value.call(target, key, ...args);
                    if (name !== 'putResourceIfMatch' || result.updated) scope.used += delta;
                    return result;
                };
            } });
            const priorTx = scope.tx; scope.tx = proxy;
            try { return await operation(proxy); } finally { scope.tx = priorTx; }
        }));
    };
    return engine;
}

function assertQuotaGrowth(scope, delta) {
    if (delta > 0 && scope.used + delta > scope.limit) throw new AccountQuotaError('storage_quota_exceeded', {
        usedBytes: scope.used, requestedBytes: delta, quotaBytes: scope.limit,
    });
}

export async function withAccountQuota(engine, handle, operation) {
    const authority = authorities.get(engine);
    if (!authority) return operation({ limit: -1 });
    const active = context.getStore();
    if (active?.open && active.engine === engine && active.handle === handle) return operation(active);
    const previous = authority.tails.get(handle) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
        const scope = { engine, handle, limit: await authority.limit(handle), used: null, open: true, tx: null };
        return context.run(scope, async () => { try { return await operation(scope); } finally { scope.open = false; } });
    });
    authority.tails.set(handle, next);
    try { return await next; } finally { if (authority.tails.get(handle) === next) authority.tails.delete(handle); }
}

export async function withAccountFileGrowth(handle, delta, operation, engine = defaultEngine) {
    if (!engine || !authorities.has(engine)) return operation();
    return withAccountQuota(engine, handle, async scope => {
        const growth = typeof delta === 'function' ? await delta() : delta;
        if (Number.isFinite(scope.limit) && scope.limit >= 0) {
            const authority = authorities.get(engine);
            const measured = await measureAccount({ engine, handle, directories: authority.directoriesByHandle(handle) });
            if (measured.totalBytes == null) throw new AccountQuotaError('storage_usage_unavailable', { errors: measured.errors });
            scope.used = measured.totalBytes; assertQuotaGrowth(scope, growth);
        }
        try { return await operation(); } finally { scope.used = null; }
    });
}
