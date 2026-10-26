import { recoverFsChatPatchJournals } from './fs-chat-range.js';
import { FsTransaction } from './fs-engine-transaction.js';
import { FsNativeStore, NATIVE_DATABASE } from './fs-native-store.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { AsyncLocalStorage } from 'node:async_hooks';
import { FsNativeCache } from './fs-native-cache.js';

const tails = new Map();
const active = new AsyncLocalStorage();
async function enqueue(root, operation) {
    const next = (tails.get(root) ?? Promise.resolve()).catch(() => {}).then(operation);
    tails.set(root, next);
    try { return await next; } finally { if (tails.get(root) === next) tails.delete(root); }
}

export class FsEngine {
    constructor({ directoriesByHandle, durabilityFault = () => {} }) {
        if (typeof directoriesByHandle !== 'function') {
            throw new TypeError('FsEngine requires { directoriesByHandle: (handle) => dirs }');
        }
        this.kind = 'fs';
        this._directoriesByHandle = directoriesByHandle;
        this._recoveredPatchJournals = new Set();
        this._nativeStores = new Map();
        this._durabilityFault = durabilityFault;
        this._nativeStateCache = new Map();
        this._nativeResourceCache = new FsNativeCache();
    }

    hasActiveTransaction(handle) {
        return Boolean(active.getStore()?.open && active.getStore()?.root === this._directoriesByHandle(handle).root);
    }

    async withTransaction(handle, fn) {
        const root = this._directoriesByHandle(handle).root;
        if (active.getStore()?.open && active.getStore()?.root === root) return fn(active.getStore().tx);
        return enqueue(root, () => this._withTransaction(handle, root, fn));
    }

    async _withTransaction(handle, root, fn) {
        // Whole-message local patches are protected by transient journals.
        // Sweep once per user/process before the first Repo transaction so a
        // crash cannot leave a partially rewritten JSONL visible to storage.
        if (!this._recoveredPatchJournals.has(handle)) {
            recoverFsChatPatchJournals(this._directoriesByHandle(handle));
            this._recoveredPatchJournals.add(handle);
        }
        const tx = new FsTransaction({ directoriesByHandle: this._directoriesByHandle, nativeResourceCache: this._nativeResourceCache, nativeStateCache: this._nativeStateCache });
        let store = this._nativeStores.get(handle);
        if (!store) {
            store = await FsNativeStore.open({ root, handle, files: tx, directoriesByHandle: this._directoriesByHandle,
                stateCache: this._nativeStateCache, fault: this._durabilityFault });
            this._nativeStores.set(handle, store);
        }
        return store.run(tx, native => {
            const scope = { root, tx: native, open: true };
            return active.run(scope, async () => {
                try { return await fn(native); } finally { scope.open = false; }
            });
        });
    }

    async ping(handle) { /* nothing to do */ }
    // Maintenance enumeration is speculative; the GC root generation is
    // revalidated under engine isolation before any deletion.
    async scanNativeCandidates(handle, filter) {
        return this.withTransaction(handle, tx => tx.listResources({ ...filter, scan: true }));
    }

    // The account directory owns both files and the Native WAL database.
    // Purging it is the admin handler's decision; detach connections either way.
    async deleteUser(handle) { this.closeHandle(handle); }

    // FS archives carry a standalone Native database snapshot at its normal
    // relative path. Engine-wide SQL dumps are only for non-FS adapters.
    async dumpUser(_handle) { return null; }
    async restoreUser(_handle, _stream) { /* Restored through Native resource conversion. */ }
    closeHandle(handle) {
        this._nativeStores.get(handle)?.close(); this._nativeStores.delete(handle);
        this._nativeStateCache.clear(); this._recoveredPatchJournals.delete(handle);
    }
    async checkpoint(handle) {
        await this.withTransaction(handle, () => {});
        const root = this._directoriesByHandle(handle).root;
        return enqueue(root, () => this._nativeStores.get(handle).checkpoint());
    }
    async snapshotNative(handle, destinationRoot) {
        await this.withTransaction(handle, () => {});
        const destination = path.join(destinationRoot, NATIVE_DATABASE);
        await fs.promises.mkdir(path.dirname(destination), { recursive: true });
        await enqueue(this._directoriesByHandle(handle).root, () => this._nativeStores.get(handle).backup(destination));
    }
    async dumpNative(handle) {
        const temporary = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'atria-native-backup-'));
        const cleanup = () => fs.promises.rm(temporary, { recursive: true, force: true });
        try {
            await this.snapshotNative(handle, temporary);
            const stream = fs.createReadStream(path.join(temporary, NATIVE_DATABASE));
            stream.once('close', () => { void cleanup().catch(() => { /* Temporary snapshot cleanup is best-effort. */ }); });
            return stream;
        } catch (error) { await cleanup(); throw error; }
    }
    async close() { for (const handle of [...this._nativeStores.keys()]) this.closeHandle(handle); }
}
