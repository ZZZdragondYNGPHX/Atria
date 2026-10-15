import { AsyncLocalStorage } from 'node:async_hooks';
import { NativeHostOwner } from './native-host-owner.js';
import { NATIVE_RESOURCE_KINDS } from '../native/contracts.js';
import { hashNativeDocument, putMutable } from '../native/repositories/common.js';

const active = new AsyncLocalStorage();
const administrative = new AsyncLocalStorage();
const maintenance = new AsyncLocalStorage();
const error = () => Object.assign(new Error('Native Host fence is no longer current'), { code: 'native_orchestration_writer_unavailable' });

/** Attach once to the original Engine, before any repository, recovery or schema write. */
export function attachNativeHostLifecycle(engine, { directoriesByHandle, dataRoot = null, hostOwner = null, installTransactionPolicy = null }) {
    if (engine.nativeHostLifecycle) throw new TypeError('Native Host lifecycle is already attached');
    const owner = hostOwner ?? new NativeHostOwner();
    const ownerLease = owner.retainStorageEngine();
    // Bounded Storage fence metadata precedes business quota/recovery policy.
    // Original policy still wraps every business transaction, inside ownership.
    const infrastructureTransaction = engine.withTransaction.bind(engine), closeEngine = engine.close.bind(engine);
    if (installTransactionPolicy !== null) installTransactionPolicy(engine);
    const transaction = engine.withTransaction.bind(engine);
    const ready = new Map(), fences = new Map(), minimumGenerations = new Map(), operations = new Set(), blocked = new Set();
    let accepting = true, databaseReady, closing, paused = false, maintenanceDone = null;

    function assertActive(handle, bypassBlock = false) {
        owner.assertActive();
        const permit = maintenance.getStore();
        if (!accepting || (paused && !(permit?.open && permit.lifecycle === lifecycle)) || (!bypassBlock && blocked.has(handle))) throw error();
    }

    async function ensureDatabase() {
        owner.assertActive();
        if (dataRoot !== null) await ownerLease.acquireLocal(dataRoot);
        if (['mysql', 'postgres'].includes(engine.kind)) {
            databaseReady ??= owner.acquireDatabase(engine);
            await databaseReady;
        }
    }

    async function ensure(handle, bypassBlock = false) {
        assertActive(handle, bypassBlock);
        await ownerLease.acquireLocal(directoriesByHandle(handle).root);
        if (!ready.has(handle)) {
            const pending = (async () => {
                // Local roots (including SQL installations) share the same
                // identity/guard protocol. Obtain ownership before recovery.
                const identity = await ownerLease.acquireLocal(directoriesByHandle(handle).root);
                await ensureDatabase();
                const fenceKey = { kind: NATIVE_RESOURCE_KINDS.hostFence, handle };
                const fence = await infrastructureTransaction(handle, async tx => {
                    owner.assertActive();
                    const previous = await tx.getResource(fenceKey);
                    if (previous && (hashNativeDocument(previous.doc) !== previous.integrity || previous.doc.schemaVersion !== 1
                        || !Number.isSafeInteger(previous.doc.generation) || previous.doc.generation < 1)) throw error();
                    const generation = Math.max(previous?.doc.generation ?? 0, minimumGenerations.get(handle) ?? 0) + 1;
                    if (!Number.isSafeInteger(generation)) throw error();
                    const next = { schemaVersion: 1, generation, hostBootId: owner.hostBootId, ownerInstanceId: identity.instanceId };
                    await putMutable(tx, fenceKey, next, { expectedIntegrity: previous?.integrity ?? null });
                    owner.assertActive();
                    return next;
                }, { retryMode: 'known_rollback_only' });
                fences.set(handle, fence);
                minimumGenerations.set(handle, fence.generation);
            })();
            ready.set(handle, pending);
            // Failure is sticky for this boot. Never reconnect under old authority.
        }
        await ready.get(handle);
        assertActive(handle, bypassBlock);
    }

    async function checkFence(handle, tx) {
        owner.assertActive();
        const expected = fences.get(handle);
        if (!expected) throw error();
        // Session-scoped SQL Owner and a shared fence row lock are distinct:
        // takeover must wait for all old write transactions to finish.
        if (typeof tx.lockNativeHostFence === 'function') await tx.lockNativeHostFence(handle);
        const record = await tx.getResource({ kind: NATIVE_RESOURCE_KINDS.hostFence, handle });
        if (!record || hashNativeDocument(record.doc) !== record.integrity || hashNativeDocument(expected) !== record.integrity) throw error();
        return expected;
    }

    function track(handle, operation) {
        assertActive(handle);
        const entry = { handle, promise: Promise.resolve().then(operation) };
        operations.add(entry);
        return entry.promise.finally(() => operations.delete(entry));
    }

    async function manageHandle(handle, operation) {
        assertActive(handle);
        if (active.getStore()?.open) throw error();
        blocked.add(handle);
        const previous = [...operations].filter(entry => entry.handle === handle);
        const entry = { handle, promise: (async () => {
            try {
                await ensure(handle, true);
                await Promise.allSettled(previous.map(entry => entry.promise));
                owner.assertActive();
                const scope = { lifecycle, handle, open: true };
                let result;
                try { result = await administrative.run(scope, operation); } finally { scope.open = false; }
                ready.delete(handle); fences.delete(handle);
                return result;
            } catch (failure) {
                if (!failure.storageRollbackConfirmed) owner.invalidate();
                throw failure;
            } finally { blocked.delete(handle); }
        })() };
        operations.add(entry);
        return entry.promise.finally(() => operations.delete(entry));
    }

    const lifecycle = {
        hostBootId: owner.hostBootId,
        attachStorageEngine(other, options = {}) {
            owner.assertActive();
            if (closing) throw error();
            return attachNativeHostLifecycle(other, { directoriesByHandle, dataRoot, ...options, hostOwner: owner });
        },
        async withMaintenance(operation, { retireWhen = () => false } = {}) {
            assertActive();
            if (maintenanceDone || typeof operation !== 'function' || typeof retireWhen !== 'function' || active.getStore()?.open) throw error();
            paused = true;
            const previous = [...operations].map(entry => entry.promise);
            let finished;
            const scope = { lifecycle, open: true };
            maintenanceDone = new Promise(resolve => { finished = resolve; });
            try {
                await Promise.allSettled(previous);
                owner.assertActive();
                const result = await maintenance.run(scope, operation);
                // Successful handover retires source admission before its
                // replacement is exposed. Failure can keep the source live.
                if (retireWhen(result)) accepting = false;
                return result;
            } finally { scope.open = false; paused = false; maintenanceDone = null; finished(); }
        },
        async assertWriter(handle, tx) {
            const scope = active.getStore();
            if (!scope?.open || scope.lifecycle !== lifecycle || scope.handle !== handle || scope.tx !== tx) throw error();
            return checkFence(handle, tx);
        },
        assertActive: () => { owner.assertActive(); if (!accepting) throw error(); },
        // Correlated workers consult this permit; they never receive Engine ownership.
        invalidate: () => owner.invalidate(),
        // The existing backup/restore authority invokes this after installing
        // data. New admission then publishes a higher storage generation.
        afterRestore: handle => manageHandle(handle, async () => {}),
        async withAdministrativeTransaction(handle, fn, options = {}) {
            const scope = administrative.getStore();
            if (!scope?.open || scope.lifecycle !== lifecycle || scope.handle !== handle) throw error();
            return transaction(handle, async tx => {
                await checkFence(handle, tx);
                const result = await fn(tx);
                await checkFence(handle, tx);
                return result;
            }, options);
        },
    };
    Object.defineProperty(engine, 'nativeHostLifecycle', { value: Object.freeze(lifecycle) });

    engine.withTransaction = async (handle, fn, options = {}) => {
        const scope = active.getStore();
        if (scope?.open && scope.lifecycle === lifecycle && scope.handle === handle) {
            owner.assertActive();
            return fn(scope.tx);
        }
        return track(handle, async () => {
            await ensure(handle);
            return transaction(handle, async tx => {
                await checkFence(handle, tx);
                const state = { lifecycle, handle, tx: null, open: true };
                const scoped = new Proxy(tx, { get(target, field) {
                    const value = target[field];
                    if (typeof value !== 'function') return value;
                    return (...args) => {
                        owner.assertActive();
                        if (!state.open) throw error();
                        return value.apply(target, args);
                    };
                } });
                state.tx = scoped;
                try {
                    const result = await active.run(state, () => fn(scoped));
                    await checkFence(handle, tx);
                    return result;
                } finally { state.open = false; }
            }, { ...options, retryMode: 'known_rollback_only' });
        });
    };

    for (const method of ['ping', 'dumpUser', 'scanNativeCandidates']) {
        if (typeof engine[method] !== 'function') continue;
        const original = engine[method].bind(engine);
        engine[method] = async (handle, ...args) => track(handle, async () => {
            if (handle != null) await ensure(handle); else await ensureDatabase();
            return original(handle, ...args);
        });
    }

    // File publications also enter the existing quota admission path. File
    // Engines need this ownership boundary even without a SQL account mutex.
    const accountLock = typeof engine.withAccountLock === 'function' ? engine.withAccountLock.bind(engine) : async (_handle, operation) => operation();
    engine.withAccountLock = async (handle, operation) => track(handle, async () => {
        await ensure(handle);
        return accountLock(handle, async () => {
            owner.assertActive();
            const result = await operation();
            owner.assertActive();
            return result;
        });
    });

    for (const method of ['deleteUser', 'restoreUser']) {
        const original = engine[method].bind(engine);
        engine[method] = (handle, ...args) => manageHandle(handle, () => original(handle, ...args));
    }

    engine.close = () => {
        if (maintenance.getStore()?.open && maintenance.getStore().lifecycle === lifecycle) return Promise.reject(error());
        closing ??= (async () => {
            accepting = false;
            await maintenanceDone;
            await Promise.allSettled([...operations].map(entry => entry.promise));
            // If Engine close fails keep ownership until process exit. A new
            // Host must never enter while the old Engine may still write.
            await closeEngine();
            await ownerLease.release();
        })();
        return closing;
    };
    return lifecycle;
}
