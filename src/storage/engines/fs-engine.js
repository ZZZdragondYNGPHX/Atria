import { recoverFsChatPatchJournals } from './fs-chat-range.js';
import { FsTransaction } from './fs-engine-transaction.js';
import { FsNativeJournal } from './fs-native-journal.js';
import { AsyncLocalStorage } from 'node:async_hooks';

const tails = new Map();
const active = new AsyncLocalStorage();

export class FsEngine {
    constructor({ directoriesByHandle, durabilityFault = () => {} }) {
        if (typeof directoriesByHandle !== 'function') {
            throw new TypeError('FsEngine requires { directoriesByHandle: (handle) => dirs }');
        }
        this.kind = 'fs';
        this._directoriesByHandle = directoriesByHandle;
        this._recoveredPatchJournals = new Set();
        this._durabilityFault = durabilityFault;
        this._nativeStateCache = new Map();
    }

    // `handle` is accepted but unused by FsTransaction — its per-kind handlers
    // extract `handle` from key.handle / filter.handle themselves. SqliteEngine
    // *does* need it to pick the per-user DB before the transaction begins, so
    // the engine contract takes (handle, fn) uniformly.
    hasActiveTransaction(handle) {
        return Boolean(active.getStore()?.open && active.getStore()?.root === this._directoriesByHandle(handle).root);
    }

    async withTransaction(handle, fn) {
        const root = this._directoriesByHandle(handle).root;
        if (active.getStore()?.open && active.getStore()?.root === root) return fn(active.getStore().tx);
        const previous = tails.get(root) ?? Promise.resolve();
        const next = previous.catch(() => {}).then(() => this._withTransaction(handle, root, fn));
        tails.set(root, next);
        try { return await next; } finally { if (tails.get(root) === next) tails.delete(root); }
    }

    async _withTransaction(handle, root, fn) {
        // Whole-message local patches are protected by transient journals.
        // Sweep once per user/process before the first Repo transaction so a
        // crash cannot leave a partially rewritten JSONL visible to storage.
        if (!this._recoveredPatchJournals.has(handle)) {
            recoverFsChatPatchJournals(this._directoriesByHandle(handle));
            this._recoveredPatchJournals.add(handle);
        }
        const tx = new FsTransaction({ directoriesByHandle: this._directoriesByHandle });
        const journal = new FsNativeJournal(tx, root, handle, this._durabilityFault, this._nativeStateCache);
        await journal.recover();
        const scope = { root, tx: journal.tx, open: true };
        return active.run(scope, async () => {
            try {
                const result = await fn(journal.tx); await journal.commit(); return result;
            } catch (error) {
                this._nativeStateCache.clear(); throw error;
            } finally { scope.open = false; }
        });
    }

    async ping(handle) { /* nothing to do */ }
    // Maintenance enumeration is speculative; the GC root generation is
    // revalidated under engine isolation before any deletion.
    async scanNativeCandidates(handle, filter) {
        return new FsTransaction({ directoriesByHandle: this._directoriesByHandle }).listResources({ ...filter, scan: true });
    }

    /**
     * No-op by design: the fs engine has no engine-internal rows to wipe —
     * every byte of a user's data lives in the on-disk directory tree. The
     * admin `/delete` handler's `purge=true` branch is the single, explicit
     * owner of removing that directory; `deleteUser` here runs unconditionally
     * and must therefore preserve the dir when the admin chose `purge=false`.
     * Idempotent (it does nothing).
     * @param {string} _handle
     */
    async deleteUser(_handle) {
        // intentionally empty — see jsdoc above
    }

    /**
     * The fs engine has no engine-internal rows to dump. The on-disk
     * directory tree (already included by createBackupArchive's
     * file/directory loop) IS the backup. createBackupArchive's
     * `kind !== 'fs'` guard ensures this method is never called in
     * production. Returning null is the documented "nothing to dump"
     * signal.
     * @param {string} _handle
     * @returns {Promise<null>}
     */
    async dumpUser(_handle) {
        return null;
    }

    /**
     * fs restore is a no-op. Backup files for fs mode are
     * regular files inside the ZIP; restoreUserBackupArchive extracts them
     * via fs writes, not via this method. The engine.kind === 'fs' branch
     * in the restore handler does not call this.
     * @param {string} _handle
     * @param {import('node:stream').Readable} _stream
     * @returns {Promise<void>}
     */
    async restoreUser(_handle, _stream) {
        // Intentionally empty.
    }

    async close() { /* nothing to do */ }
}
