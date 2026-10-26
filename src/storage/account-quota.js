import { AsyncLocalStorage } from 'node:async_hooks';
import { assertRecoveryWrite, assertRecoveryDelete, recoveryRecords } from '../native/recovery-roots.js';
import { measureAccount } from './resource-accounting.js';
import { resourceContentBytes, REDUCTION_JOURNAL_BYTES } from './resource-catalog.js';
import { NATIVE_RESOURCE_KINDS } from '../native/contracts.js';

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
export function accountDirectoryRoot(engine, handle) { return authorities.get(engine)?.directoriesByHandle(handle).root; }

export class AccountQuotaError extends Error {
    constructor(code, details) { super(code); this.code = code; this.status = 413; this.details = details; }
}

const contentBytes = record => record == null ? 0 : resourceContentBytes(record.doc !== undefined ? record.doc
    : record.header && record.body ? { header: { ...record.header, chat_metadata: { ...record.header.chat_metadata, integrity: record.integrity } }, body: record.body } : record);

/** Serialize admission and commit, using engine isolation for the actual data.
 * No speculative reservation survives the transaction: FS redo/SQL commit is
 * the durable boundary. Reads and decreasing writes remain usable over quota.
 */
export function installAccountQuota(engine, { directoriesByHandle, limit, makeDefault = false }) {
    const installed = authorities.get(engine);
    if (installed) { installed.directoriesByHandle = directoriesByHandle; installed.limit = limit; if (makeDefault) defaultEngine = engine; return engine; }
    const original = engine.withTransaction.bind(engine);
    const authority = { engine, directoriesByHandle, limit, tails: new Map(), original };
    authorities.set(engine, authority);
    if (makeDefault) defaultEngine = engine;
    engine.withTransaction = (handle, operation, options = {}) => {
        const active = context.getStore();
        if (active?.open && active.engine === engine && active.handle === handle && active.tx) return operation(active.tx);
        return withAccountQuota(engine, handle, async scope => original(handle, async tx => {
            let initialUsed = null, netNative = 0;
            let roots = null;
            const loadRoots = async () => roots ??= await recoveryRecords(tx, handle);
            const finite = Number.isFinite(scope.limit) && scope.limit >= 0;
            const measure = async () => {
                if (scope.used == null) {
                    const measured = await measureAccount({ engine, tx, handle, directories: authority.directoriesByHandle(handle) });
                    if (measured.totalBytes == null) throw new AccountQuotaError('storage_usage_unavailable', { errors: measured.errors });
                    scope.used = measured.totalBytes;
                }
            };
            const proxy = new Proxy(tx, { get(target, name) {
                const value = target[name];
                // The existing Repo fallback performs one canonical full-resource
                // write. Avoid incremental mutation before finite quota admission.
                if (finite && ['appendChatMessages', 'patchChatMessages'].includes(name)) return async () => ({ status: 'unsupported' });
                if (finite && ['putChatState', 'putPresetState'].includes(name)) return async (key, namespace, doc) => {
                    await measure();
                    const previous = await target[name === 'putChatState' ? 'getChatState' : 'getPresetState'](key, namespace);
                    const delta = resourceContentBytes(doc) - (previous == null ? 0 : resourceContentBytes(previous));
                    assertQuotaGrowth(scope, delta);
                    const result = await value.call(target, key, namespace, doc); scope.used += delta; return result;
                };
                if (!['putResource', 'putResourceIfMatch', 'deleteResource'].includes(name)) return typeof value === 'function' ? value.bind(target) : value;
                return async (key, ...args) => {
                    if (name !== 'deleteResource') await assertRecoveryWrite(target, key, args[name === 'putResourceIfMatch' ? 1 : 0], loadRoots);
                    else await assertRecoveryDelete(target, key, loadRoots);
                    if (key.kind === NATIVE_RESOURCE_KINDS.maintenance) roots = null;
                    if (!finite) return value.call(target, key, ...args);
                    await measure();
                    if (initialUsed == null) initialUsed = scope.used;
                    const before = await target.getResource(key);
                    const deleting = name === 'deleteResource';
                    const next = deleting ? null : args[name === 'putResourceIfMatch' ? 1 : 0];
                    // Native records have identical canonical representation in every engine.
                    // Legacy file handlers are measured again by the enclosing request gate.
                    const delta = contentBytes(next) - contentBytes(before);
                    const reductionTask = row => row?.doc?.protocol === 'atria.storage-center.v1' && row.doc.type === 'task'
                        && row.doc.scope === 'server' && row.doc.handle === handle && ['clean', 'purge'].includes(row.doc.action)
                        && Array.isArray(row.doc.items) && row.doc.items.some(item => ['pending', 'processing', 'succeeded'].includes(item.status));
                    let managementReduction = key.kind === NATIVE_RESOURCE_KINDS.maintenance && key.scope === 'storage-center:task:' + next?.doc?.id
                        && (reductionTask(next) || reductionTask(before));
                    if (managementReduction && !reductionTask(before) && delta > 0) {
                        const rows = await target.listResources({ kind: NATIVE_RESOURCE_KINDS.maintenance, handle });
                        managementReduction = rows.filter(reductionTask).reduce((sum, row) => sum + contentBytes(row), 0) + contentBytes(next) <= REDUCTION_JOURNAL_BYTES;
                    }
                    const native = Object.values(NATIVE_RESOURCE_KINDS).includes(key.kind);
                    if (!managementReduction && !native) assertQuotaGrowth(scope, delta);
                    const result = await value.call(target, key, ...args);
                    if (name !== 'putResourceIfMatch' || result.updated) { scope.used += delta; if (native && !managementReduction) netNative += delta; }
                    return result;
                };
            } });
            const priorTx = scope.tx; scope.tx = proxy;
            try {
                const result = await operation(proxy);
                // Native writes are staged in the SQL transaction. Admit the
                // complete transaction net change before the durable commit.
                if (finite && netNative > 0 && scope.used > scope.limit && scope.used > initialUsed) throw new AccountQuotaError('storage_quota_exceeded', { usedBytes: initialUsed, requestedBytes: netNative, quotaBytes: scope.limit });
                return result;
            } finally { scope.tx = priorTx; }
        }, options));
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
        const run = () => context.run(scope, async () => { try { return await operation(scope); } finally { scope.open = false; } });
        return engine.withAccountLock ? engine.withAccountLock(handle, run) : run();
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
