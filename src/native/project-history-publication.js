import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { NATIVE_RESOURCE_KINDS as K } from './contracts.js';
import { nativeRecord } from './repositories/common.js';
import { accountQuotaLimit, withAccountFileGrowth } from '../storage/account-quota.js';
import { listAccountFiles } from '../storage/resource-accounting.js';
import { resourceContentBytes, resourceFingerprint, STORAGE_CENTER_PROTOCOL } from '../storage/resource-catalog.js';
import { syncDirectoryAsync, durableWriteAsync } from '../storage/durable-file.js';
import { ConflictError } from '../storage/errors.js';
import { assertAccountPath } from '../storage/path-boundary.js';

const keyFor = (handle, projectId) => ({ kind: K.maintenance, handle, scope: 'storage-center:history:' + projectId });
const receiptKey = (handle, id) => ({ kind: K.maintenance, handle, scope: 'storage-center:receipt:' + id });
async function tree(directory) {
    const listing = await listAccountFiles(directory);
    if (listing.errors.length) throw new Error('Project history contains unreadable or linked files');
    const entries = [];
    for (const file of listing.files) entries.push({ path: file.relative, bytes: file.bytes,
        hash: createHash('sha256').update(await fsp.readFile(file.absolute)).digest('hex') });
    entries.sort((a, b) => a.path.localeCompare(b.path));
    return { signature: resourceFingerprint(entries), bytes: entries.reduce((sum, file) => sum + file.bytes, 0) };
}
async function exists(file) { try { await fsp.lstat(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
function operationRoot(store, handle, id) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new TypeError('Invalid file publication identity');
    const root = store._directoriesByHandle(handle).root;
    return assertAccountPath(root, path.join(root, 'atria-native', 'file-publications', id));
}

export async function inspectProjectHistory(store, handle, projectId) {
    const engine = store.quotaEngine(handle);
    const row = engine && await engine.withTransaction(handle, tx => tx.getResource(keyFor(handle, projectId)));
    if (!row || row.doc.protocol !== STORAGE_CENTER_PROTOCOL || row.doc.type !== 'file-publication'
        || row.doc.projectId !== projectId || row.integrity !== resourceFingerprint(row.doc)) throw new ConflictError('native_project_history_conflict');
    const doc = row.doc, root = operationRoot(store, handle, doc.id);
    const live = await tree(path.join(store.getProjectDirectory(handle, projectId), '.git')), next = await tree(path.join(root, 'next')), previous = await tree(path.join(root, 'previous'));
    const allowed = live.signature === doc.after.signature || live.signature === doc.before.signature
        || !await exists(path.join(store.getProjectDirectory(handle, projectId), '.git')) && previous.signature === doc.before.signature;
    return { target: { type: 'history', id: projectId }, name: projectId, version: resourceFingerprint(doc), bytes: Math.max(0, doc.after.bytes - doc.before.bytes),
        allowed, reason: allowed ? null : 'native_project_history_conflict',
        consequences: [next.signature === doc.after.signature ? 'publish-verified-local-history' : 'retain-verified-local-history'] };
}

export async function resumeProjectHistory(store, handle, projectId, version, operationId) {
    return store.withLifecycle(handle, projectId, async () => {
        const engine = store.quotaEngine(handle);
        const receipt = operationId && await engine.withTransaction(handle, tx => tx.getResource(receiptKey(handle, operationId)));
        if (receipt) return receipt.doc.result;
        const checked = await inspectProjectHistory(store, handle, projectId);
        if (checked.version !== version || !checked.allowed) throw new ConflictError('storage_preview_stale');
        await engine.withTransaction(handle, async tx => {
            const row = await tx.getResource(keyFor(handle, projectId));
            await tx.putResource(row.key, nativeRecord({ ...row.doc, status: 'pending', ...(operationId ? { reviewOperationId: operationId } : {}) }, { existing: row }));
        });
        await recoverProjectHistory(store, handle, projectId);
        const result = { repaired: true, target: { type: 'project', id: projectId }, backgroundModel: 'not-started' };
        return result;
    });
}

/** Complete/roll back a committed local file intent before exposing Git history. */
export async function recoverProjectHistory(store, handle, projectId) {
    const engine = store.quotaEngine(handle); if (!engine) return;
    const row = await engine.withTransaction(handle, tx => tx.getResource(keyFor(handle, projectId)));
    if (!row) return;
    const doc = row.doc;
    if (doc.protocol !== STORAGE_CENTER_PROTOCOL || doc.type !== 'file-publication' || doc.projectId !== projectId || doc.status === 'paused-review') throw new ConflictError('native_project_history_requires_review');
    const root = operationRoot(store, handle, doc.id), next = path.join(root, 'next'), previous = path.join(root, 'previous');
    const live = path.join(store.getProjectDirectory(handle, projectId), '.git');
    const liveTree = await tree(live), nextTree = await tree(next);
    if (liveTree.signature !== doc.after.signature) {
        if (nextTree.signature === doc.after.signature) {
            if (await exists(live)) {
                if (liveTree.signature !== doc.before.signature || await exists(previous)) throw new ConflictError('native_project_history_conflict');
                await fsp.rename(live, previous); await syncDirectoryAsync(path.dirname(live));
            }
            await fsp.rename(next, live); await syncDirectoryAsync(path.dirname(live));
        } else {
            // A crash while copying the new history never authorizes a partial
            // history. Put the complete original back, then discard the intent.
            if (!await exists(live) && await exists(previous)) await fsp.rename(previous, live);
            if ((await tree(live)).signature !== doc.before.signature) throw new ConflictError('native_project_history_conflict');
        }
    }
    await fsp.rm(root, { recursive: true, force: true });
    await engine.withTransaction(handle, async tx => {
        await tx.deleteResource(keyFor(handle, projectId));
        if (doc.reviewOperationId) await tx.putResource(receiptKey(handle, doc.reviewOperationId), nativeRecord({ protocol: STORAGE_CENTER_PROTOCOL, type: 'receipt', operationId: doc.reviewOperationId,
            result: { repaired: true, target: { type: 'project', id: projectId }, backgroundModel: 'not-started' } }));
    });
}

export async function commitProjectHistory(store, handle, projectId, operation) {
    return store.withLifecycle(handle, projectId, async () => {
        await store.assertActive(handle, projectId);
        const engine = store.quotaEngine(handle), directory = store.getProjectDirectory(handle, projectId);
        await recoverProjectHistory(store, handle, projectId);
        if (!engine || await accountQuotaLimit(engine, handle) < 0) return operation(directory);
        const temporary = await fsp.mkdtemp(path.join(os.tmpdir(), 'atria-project-history-'));
        try {
            const listing = await listAccountFiles(directory);
            if (listing.errors.length) throw new Error('Project source contains unreadable or linked files');
            await fsp.cp(directory, temporary, { recursive: true });
            const result = await operation(temporary), before = await tree(path.join(directory, '.git')), after = await tree(path.join(temporary, '.git'));
            if (before.signature === after.signature) return result;
            const doc = { protocol: STORAGE_CENTER_PROTOCOL, type: 'file-publication', id: randomUUID(), projectId,
                status: 'pending', before, after, createdAt: Date.now() };
            return await withAccountFileGrowth(handle, after.bytes - before.bytes + resourceContentBytes(doc), async () => {
                await engine.withTransaction(handle, tx => tx.putResource(keyFor(handle, projectId), nativeRecord(doc)));
                const destination = path.join(operationRoot(store, handle, doc.id), 'next');
                await fsp.mkdir(path.dirname(destination), { recursive: true });
                await fsp.cp(path.join(temporary, '.git'), destination, { recursive: true });
                for (const file of (await listAccountFiles(destination)).files) await durableWriteAsync(file.absolute, await fsp.readFile(file.absolute));
                await syncDirectoryAsync(destination);
                await recoverProjectHistory(store, handle, projectId);
                return result;
            }, engine);
        } finally { await fsp.rm(temporary, { recursive: true, force: true }); }
    });
}
