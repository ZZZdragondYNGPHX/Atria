import { illustrationAssetIds } from '../../../public/shared/native-media-contract.js';
import { admitBlob } from './blob-admission.js';
import { filePayload, isFilePayload, payloadHash } from '../file-payload.js';
import { withAccountFileGrowth, withAccountQuota } from '../../storage/account-quota.js';
import { retainedBlobHashes, recoveryReferences } from '../recovery-roots.js';
import { assertAccountPath } from '../../storage/path-boundary.js';
import { nativeTaskScheduler } from '../task-scheduler.js';
import { validateMaintenanceBudget } from '../session-maintenance.js';
import { PERSONA_NAMESPACE, personaAvatars, personaDocumentReferences } from '../persona-contract.js';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { durableWriteAsync, durableRemoveAsync } from '../../storage/durable-file.js';
import { resolveUserDirectory } from '../../constants.js';

import { NATIVE_RESOURCE_KINDS, assertAssetRef } from '../contracts.js';
import { ConflictError, NotFoundError } from '../../storage/errors.js';
import { assertWritable } from '../../storage/read-only-mode.js';
import { getNativeDocument, listNativeDocuments, putImmutable, putMutable, hashNativeDocument, withNativeResourceWrite } from './common.js';
import { ILLUSTRATION_NAMESPACE } from '../../../public/shared/native-illustration-contract.js';
import { readIllustrationState } from '../session-illustrations.js';
const blobScopes = new AsyncLocalStorage();
const blobReaders = new Map();
const blobIdentity = (handle, hash) => JSON.stringify([handle, hash]);

function toBuffer(value) {
    if (isFilePayload(value)) return value;
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    throw new TypeError('AssetStore bytes must be a Buffer or Uint8Array');
}

function digest(bytes) {
    return payloadHash(bytes);
}

async function resourceSetupAssetReferences(tx, handle, assetId) {
    const references = [];
    for (const record of await tx.listResources({ kind: NATIVE_RESOURCE_KINDS.personaRevision, handle })) {
        if (record.doc.avatar?.assetId !== assetId) continue;
        const root = await getNativeDocument(tx, { kind: NATIVE_RESOURCE_KINDS.persona, handle, personaId: record.doc.personaId });
        if (root?.publishedRevisionIds?.includes(record.doc.revisionId)) references.push({ kind: 'persona-revision', personaId: record.doc.personaId, revisionId: record.doc.revisionId });
    }
    for (const record of await tx.listResources({ kind: NATIVE_RESOURCE_KINDS.personaMigration, handle })) {
        if (personaDocumentReferences(record.doc.items, 'assetId', assetId)) references.push({ kind: 'persona-migration', sourceDigest: record.key.sourceDigest });
    }
    for (const record of await tx.listResources({ kind: NATIVE_RESOURCE_KINDS.sessionState, handle })) {
        if (record.key.namespace === PERSONA_NAMESPACE && personaAvatars(record.doc).some(ref => ref.assetId === assetId)) references.push({ kind: 'persona-snapshot', sessionId: record.key.sessionId, head: record.key.head });
    }
    for (const kind of [NATIVE_RESOURCE_KINDS.session, NATIVE_RESOURCE_KINDS.savePoint]) {
        for (const record of await tx.listResources({ kind, handle })) {
            for (const head of new Set([record.doc.illustrationHead, ...Object.values(record.doc.illustrationHeads ?? {})].filter(Boolean))) {
                const state = await readIllustrationState(tx, handle, record.doc.sessionId, head);
                if (illustrationAssetIds(state).includes(assetId)) references.push({ kind: 'session-illustration', sessionId: record.doc.sessionId,
                    ...(record.doc.saveId ? { saveId: record.doc.saveId } : {}), namespace: ILLUSTRATION_NAMESPACE, head });
            }
        }
    }
    for (const kind of [NATIVE_RESOURCE_KINDS.sessionState, NATIVE_RESOURCE_KINDS.packageState]) {
        for (const record of await tx.listResources({ kind, handle })) {
            const worlds = kind === NATIVE_RESOURCE_KINDS.sessionState
                ? record.key.namespace === 'atri_world_selection' ? record.doc?.worlds : []
                : record.key.namespace?.startsWith('atri_resource_setup_') ? record.doc?.resolved?.worldSelection?.worlds : [];
            if (worlds?.some(world => world.revision?.assetIds?.includes(assetId))) references.push({ ...record.key, kind: kind === NATIVE_RESOURCE_KINDS.sessionState ? 'session-world-snapshot' : 'work-resource-default' });
        }
    }
    // Durable in-flight/uncertain jobs and recent temporary edits are roots.
    // Completed jobs and abandoned drafts retain a recovery grace, while
    // published media remains rooted by Session/SavePoint presentation or its
    // independent authoring Job. Archiving an image retains its bytes.
    // GC quarantine markers are never ownership references.
    const holds = value => value === assetId || value && typeof value === 'object' && Object.values(value).some(holds);
    for (const record of await tx.listResources({ kind: NATIVE_RESOURCE_KINDS.versionedJsonResource, handle })) {
        const type = record.key.resourceType, age = Date.now() - (record.doc.updatedAt ?? record.doc.publishedAt ?? record.doc.createdAt ?? 0);
        if (!type.startsWith('atri.visual.') || type === 'atri.visual.gc' || type === 'atri.visual.prepared' && record.doc.expiresAt < Date.now()
            || type === 'atri.visual.draft' && age > 30 * 86400000
            || type === 'atri.visual.mask' && record.doc.createdAt && age > 7 * 86400000
            || type === 'atri.visual.job' && ['published', 'failed', 'cancelled', 'stale'].includes(record.doc.status) && age > 7 * 86400000 && !(record.doc.source?.kind === 'authoring' && record.doc.status === 'published')) continue;
        if (holds(record.doc)) references.push({ kind: type, resourceId: record.key.resourceId });
    }
    return references;
}

export class AssetStore {
    constructor({ engine, directoriesByHandle }) {
        if (!engine) throw new TypeError('AssetStore requires { engine }');
        if (typeof directoriesByHandle !== 'function') {
            throw new TypeError('AssetStore requires { directoriesByHandle }');
        }
        this._engine = engine;
        this._directoriesByHandle = directoriesByHandle;
    }

    _refKey(handle, assetId) {
        return { kind: NATIVE_RESOURCE_KINDS.assetRef, handle, assetId };
    }

    _blobRoot(handle) {
        return resolveUserDirectory(this._directoriesByHandle(handle), 'nativeBlobs');
    }

    _blobPath(handle, contentHash) {
        return assertAccountPath(this._directoriesByHandle(handle).root, path.join(this._blobRoot(handle), contentHash.slice(0, 2), contentHash));
    }

    async putBlob(handle, bytesValue) {
        assertWritable();
        const bytes = toBuffer(bytesValue);
        const contentHash = digest(bytes);
        return this.withBlobLease(handle, contentHash, async () => {
            const blobPath = this._blobPath(handle, contentHash);
            if (!fs.existsSync(blobPath)) await withAccountFileGrowth(handle, bytes.length, () => durableWriteAsync(blobPath, isFilePayload(bytes) ? bytes.stream() : bytes), this._engine);
            else {
                const file = await fsp.open(blobPath, 'r');
                try { await admitBlob(file, handle, contentHash, bytes.length); } finally { await file.close(); }
            }
            return contentHash;
        });
    }

    async withBlobLease(handle, contentHash, operation) {
        const key = JSON.stringify([handle, contentHash]);
        if (blobScopes.getStore()?.get(key)?.open) return operation();
        return withNativeResourceWrite(handle, 'blob:' + contentHash, () => {
            const scope = { open: true }, owners = new Map(blobScopes.getStore() ?? []); owners.set(key, scope);
            return blobScopes.run(owners, async () => { try { return await operation(); } finally { scope.open = false; } });
        });
    }

    async withBlobPublication(handle, payloads, operation) {
        // Accept a lazy iterable so publishing a media-heavy package does not
        // materialize every asset at once just to acquire its content leases.
        const hashes = [...new Set(Array.from(payloads, bytes => digest(toBuffer(bytes))))].sort();
        const lock = index => index < hashes.length ? this.withBlobLease(handle, hashes[index], () => lock(index + 1))
            : withAccountQuota(this._engine, handle, async () => {
                const created = [];
                for (const hash of hashes) if (!await this.hasBlob(handle, hash)) created.push(hash);
                try { return await this._engine.withTransaction(handle, () => operation()); } catch (error) {
                    // A failed quota/metadata commit has no newly published
                    // refs. Recover a committed FS journal before deciding;
                    // never remove a blob that its recovered commit retained.
                    const roots = await this._engine.withTransaction(handle, async tx => new Set([
                        ...await retainedBlobHashes(tx, handle),
                        ...(await tx.listResources({ kind: NATIVE_RESOURCE_KINDS.assetRef, handle })).map(row => row.doc.contentHash),
                        ...(await tx.listResources({ kind: NATIVE_RESOURCE_KINDS.packageVersion, handle })).map(row => row.doc.packageContentHash),
                    ]));
                    for (const hash of created) if (!roots.has(hash) && !blobReaders.has(blobIdentity(handle, hash))) await durableRemoveAsync(this._blobPath(handle, hash));
                    throw error;
                }
            });
        return lock(0);
    }

    async hasBlob(handle, contentHash) {
        if (!/^[a-f0-9]{64}$/.test(String(contentHash || ''))) {
            throw new TypeError('AssetStore contentHash must be a lowercase SHA-256 digest');
        }
        return fs.existsSync(this._blobPath(handle, contentHash));
    }

    async readBlob(handle, contentHash) {
        if (!/^[a-f0-9]{64}$/.test(String(contentHash || ''))) {
            throw new TypeError('AssetStore contentHash must be a lowercase SHA-256 digest');
        }
        const blobPath = this._blobPath(handle, contentHash);
        let file;
        try {
            file = await fsp.open(blobPath, 'r');
            await admitBlob(file, handle, contentHash);
            return await file.readFile();
        } catch (error) { if (error.code === 'ENOENT') return null; throw error; } finally { await file?.close(); }
    }

    async withBlobPayload(handle, contentHash, operation) {
        if (!/^[a-f0-9]{64}$/.test(String(contentHash || ''))) throw new TypeError('Invalid AssetStore contentHash');
        return this.withBlobLease(handle, contentHash, async () => {
            const file = await fsp.open(this._blobPath(handle, contentHash), 'r'); let payload;
            try {
                await admitBlob(file, handle, contentHash);
                payload = filePayload(file, Number((await file.stat()).size), contentHash);
                return await operation(payload);
            } finally { if (payload) await payload.close(); else await file.close(); }
        });
    }

    async blobStamp(handle, contentHash) {
        if (!/^[a-f0-9]{64}$/.test(String(contentHash || ''))) throw new TypeError('Invalid AssetStore contentHash');
        try {
            const stat = await fsp.stat(this._blobPath(handle, contentHash), { bigint: true });
            if (!stat.isFile()) throw new TypeError('Native Blob must be a file');
            return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs, stat.birthtimeNs].join(':');
        } catch (error) {
            if (error.code === 'ENOENT') return null;
            throw error;
        }
    }

    async getRef(handle, assetId) {
        return this._engine.withTransaction(handle, tx => getNativeDocument(
            tx,
            this._refKey(handle, assetId),
        ));
    }

    async listRefs(handle) {
        return this._engine.withTransaction(handle, tx => listNativeDocuments(tx, {
            kind: NATIVE_RESOURCE_KINDS.assetRef,
            handle,
        }));
    }

    async put(handle, refValue, bytesValue) {
        assertWritable();
        const ref = assertAssetRef(refValue);
        const bytes = toBuffer(bytesValue);
        const contentHash = digest(bytes);
        if (contentHash !== ref.contentHash || bytes.length !== ref.size) {
            throw new ConflictError('native_asset_integrity_mismatch', {
                assetId: ref.assetId,
                expectedHash: ref.contentHash,
                actualHash: contentHash,
                expectedSize: ref.size,
                actualSize: bytes.length,
            });
        }

        // Blob first, logical reference last. A crash between these operations
        // leaves only an unreferenced content-addressed blob, which GC can reap.
        return this.withBlobPublication(handle, [bytes], async () => {
            await this.putBlob(handle, bytes);

            await this._engine.withTransaction(handle, tx => putImmutable(
                tx,
                this._refKey(handle, ref.assetId),
                ref,
            ));
            return ref;
        });
    }

    async read(handle, assetId) {
        const ref = await this.getRef(handle, assetId);
        if (!ref) return null;
        const bytes = await this.readBlob(handle, ref.contentHash);
        if (!bytes) throw new NotFoundError('native asset blob', { assetId, contentHash: ref.contentHash });
        if (bytes.length !== ref.size) throw new ConflictError('native_asset_corrupt', { assetId });
        return { ref, bytes };
    }

    // Verify with bounded memory, then stream the requested range from the same
    // open immutable blob. No parallel cache or asset persistence authority.
    async openDelivery(handle, assetId) {
        const ref = await this.getRef(handle, assetId);
        if (!ref) return null;
        return this.withBlobLease(handle, ref.contentHash, async () => {
            const delivery = await this._openDelivery(handle, assetId);
            if (!delivery) return null;
            const key = blobIdentity(handle, ref.contentHash);
            blobReaders.set(key, (blobReaders.get(key) ?? 0) + 1);
            let closed = false;
            return { ...delivery, close: async () => {
                if (closed) return; closed = true;
                try { await delivery.close(); } finally {
                    const remaining = blobReaders.get(key) - 1;
                    if (remaining) blobReaders.set(key, remaining); else blobReaders.delete(key);
                }
            } };
        });
    }

    async _openDelivery(handle, assetId) {
        const ref = await this.getRef(handle, assetId);
        if (!ref) return null;
        let file;
        try {
            file = await fs.promises.open(this._blobPath(handle, ref.contentHash), 'r');
            await admitBlob(file, handle, ref.contentHash, ref.size);
            return { ref, stream: (start, end) => file.createReadStream({ start, end, autoClose: false }), close: () => file.close() };
        } catch (error) {
            await file?.close();
            if (error.code === 'ENOENT') throw new NotFoundError('native asset blob', { assetId });
            throw error;
        }
    }

    async deleteRef(handle, assetId) {
        return withNativeResourceWrite(handle, 'asset:' + assetId, () => this._deleteRef(handle, assetId));
    }

    async _deleteRef(handle, assetId) {
        assertWritable();
        return this._engine.withTransaction(handle, async (tx) => {
            const references = await resourceSetupAssetReferences(tx, handle, assetId);
            references.push(...await recoveryReferences(tx, handle, this._refKey(handle, assetId)));
            for (const record of await tx.listResources({ kind: NATIVE_RESOURCE_KINDS.timelineVariant, handle })) {
                if (record.doc?.metadata?.attachments?.some(item => item.assetId === assetId)) {
                    references.push({ kind: 'session-variant', sessionId: record.doc.sessionId,
                        messageId: record.doc.messageId, variantId: record.doc.variantId });
                }
            }
            for (const record of await tx.listResources({
                kind: NATIVE_RESOURCE_KINDS.worldRevision,
                handle,
            })) {
                if (record.doc?.assetIds?.includes(assetId)) {
                    references.push({
                        kind: 'world-revision',
                        worldId: record.doc.worldId,
                        worldRevisionId: record.doc.worldRevisionId,
                    });
                }
            }
            if (references.length) {
                throw new ConflictError('native_asset_ref_referenced', { assetId, references });
            }
            return tx.deleteResource(this._refKey(handle, assetId));
        });
    }

    async getReferences(handle, assetId) {
        const ref = await this.getRef(handle, assetId);
        if (!ref) return [];
        return this._engine.withTransaction(handle, async (tx) => {
            const references = await resourceSetupAssetReferences(tx, handle, assetId);
            for (const record of await tx.listResources({ kind: NATIVE_RESOURCE_KINDS.timelineVariant, handle })) {
                if (record.doc?.metadata?.attachments?.some(item => item.assetId === assetId)) {
                    references.push({ kind: 'session-variant', sessionId: record.doc.sessionId,
                        messageId: record.doc.messageId, variantId: record.doc.variantId });
                }
            }
            for (const record of await tx.listResources({
                kind: NATIVE_RESOURCE_KINDS.worldRevision,
                handle,
            })) {
                if (record.doc?.assetIds?.includes(assetId)) {
                    references.push({
                        kind: 'world-revision',
                        worldId: record.doc.worldId,
                        worldRevisionId: record.doc.worldRevisionId,
                    });
                }
            }
            return references;
        });
    }

    async inspectGarbageBlob(handle, contentHash, now = Date.now()) {
        if (!/^[a-f0-9]{64}$/.test(contentHash)) throw new TypeError('Invalid Blob hash');
        return this._engine.withTransaction(handle, async tx => {
            const progress = await getNativeDocument(tx, { kind: NATIVE_RESOURCE_KINDS.maintenance, handle, scope: 'blobs' });
            const candidate = progress?.candidates?.find(item => item.hash === contentHash);
            if (!candidate || now - candidate.quarantinedAt < 60000) throw new ConflictError('native_blob_quarantine_active');
            const roots = new Set([...await retainedBlobHashes(tx, handle),
                ...(await tx.listResources({ kind: NATIVE_RESOURCE_KINDS.assetRef, handle })).map(row => row.doc.contentHash),
                ...(await tx.listResources({ kind: NATIVE_RESOURCE_KINDS.packageVersion, handle })).map(row => row.doc.packageContentHash)]);
            if (roots.has(contentHash) || blobReaders.has(blobIdentity(handle, contentHash))) throw new ConflictError('native_blob_referenced');
            const stat = await fsp.stat(this._blobPath(handle, contentHash));
            if (!stat.isFile() || stat.mtimeMs !== candidate.mtimeMs) throw new ConflictError('storage_preview_stale');
            return { hash: contentHash, bytes: stat.size, version: hashNativeDocument(candidate),
                reason: 'unreferenced-blob-past-quarantine', recoverable: false };
        });
    }

    async cleanGarbageBlob(handle, contentHash, expectedVersion) {
        assertWritable();
        return withNativeResourceWrite(handle, 'maintenance:blobs', () => this.withBlobLease(handle, contentHash, async () => {
            const checked = await this.inspectGarbageBlob(handle, contentHash);
            if (checked.version !== expectedVersion) throw new ConflictError('storage_preview_stale');
            const removed = await durableRemoveAsync(this._blobPath(handle, contentHash));
            return { cleaned: removed, processedBytes: removed ? checked.bytes : 0, physicalBytesReleased: removed ? checked.bytes : 0 };
        }));
    }

    async gcBlobs(handle, options = {}) {
        assertWritable();
        const budget = { retainHashes: [], now: Date.now(), graceMs: 60000, batchSize: 32, scanLimit: 128, maxScanBytes: 65536, ...options };
        validateMaintenanceBudget(budget);
        for (const hash of budget.retainHashes) if (!/^[a-f0-9]{64}$/.test(hash)) throw new TypeError('Invalid retained Blob hash');
        return withNativeResourceWrite(handle, 'maintenance:blobs', () => this._gcBlobs(handle, budget));
    }

    async _gcBlobs(handle, { retainHashes, now, graceMs, batchSize, scanLimit, maxScanBytes, signal }) {
        const key = { kind: NATIVE_RESOURCE_KINDS.maintenance, handle, scope: 'blobs' };
        const pause = () => signal?.aborted || nativeTaskScheduler.hasForegroundWork(handle);
        if (pause()) return [];
        const roots = async () => this._engine.withTransaction(handle, async tx => {
            const refs = await tx.listResources({ kind: NATIVE_RESOURCE_KINDS.assetRef, handle });
            const versions = await tx.listResources({ kind: NATIVE_RESOURCE_KINDS.packageVersion, handle });
            return new Set([...retainHashes, ...await retainedBlobHashes(tx, handle), ...refs.map(item => item.doc.contentHash), ...versions.map(item => item.doc.packageContentHash)]);
        });
        const referenced = await roots(), generation = hashNativeDocument([...referenced].sort());
        const progress = await this._engine.withTransaction(handle, tx => getNativeDocument(tx, key));
        const valid = progress?.generation === generation;
        if (!valid || progress.phase === 'complete' || progress.phase === 'mark') {
            const candidates = [], scan = valid && progress.phase === 'mark' ? progress.scan : { prefix: 0, after: '' };
            // One hash directory and bounded names per slice. Directory entries
            // are small metadata; payloads are never read by Blob maintenance.
            let prefixes;
            try { prefixes = (await fsp.readdir(this._blobRoot(handle))).filter(name => /^[a-f0-9]{2}$/.test(name)).sort(); } catch (error) { if (error.code !== 'ENOENT') throw error; return []; }
            const prefix = prefixes.find(name => parseInt(name, 16) >= scan.prefix);
            if (!prefix) {
                await this._engine.withTransaction(handle, tx => putMutable(tx, key, { schemaVersion: 1, generation, candidates: [], cursor: 0, scan: { prefix: 256, after: '' }, phase: 'complete' }));
                return [];
            }
            if (parseInt(prefix, 16) !== scan.prefix) scan.after = '';
            scan.prefix = parseInt(prefix, 16);
            let names = [];
            try { names = (await fsp.readdir(path.join(this._blobRoot(handle), prefix))).filter(name => /^[a-f0-9]{64}$/.test(name) && name.startsWith(prefix)).sort(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
            const limit = Math.min(scanLimit, Math.max(1, Math.floor(maxScanBytes / 128)));
            const page = names.filter(name => name > scan.after).slice(0, limit);
            for (const name of page) {
                if (pause()) return [];
                if (referenced.has(name)) continue;
                const stat = await fsp.stat(this._blobPath(handle, name)).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
                if (!stat?.isFile()) continue;
                const old = progress?.candidates.find(item => item.hash === name && item.mtimeMs === stat.mtimeMs);
                candidates.push({ hash: name, mtimeMs: stat.mtimeMs, quarantinedAt: old?.quarantinedAt ?? now });
            }
            const after = page.at(-1) ?? scan.after;
            const nextScan = names.some(name => name > after) ? { prefix: scan.prefix, after } : { prefix: scan.prefix + 1, after: '' };
            const phase = candidates.length ? 'quarantine' : nextScan.prefix === 256 ? 'complete' : 'mark';
            await this._engine.withTransaction(handle, tx => putMutable(tx, key, { schemaVersion: 1, generation, candidates, cursor: 0, scan: nextScan, phase }));
            return [];
        }
        if (progress.candidates.some(item => now - item.quarantinedAt < graceMs)) return [];
        const deleted = []; let cursor = progress.cursor;
        const end = Math.min(progress.candidates.length, cursor + batchSize);
        for (; cursor < end && !pause(); cursor++) {
            const item = progress.candidates[cursor];
            if (blobReaders.has(blobIdentity(handle, item.hash))) break;
            await this.withBlobLease(handle, item.hash, async () => {
                if (pause() || blobReaders.has(blobIdentity(handle, item.hash)) || (await roots()).has(item.hash)) return;
                const stat = await fsp.stat(this._blobPath(handle, item.hash)).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
                if (stat?.mtimeMs !== item.mtimeMs) return;
                if (await durableRemoveAsync(this._blobPath(handle, item.hash))) deleted.push(item.hash);
            });
        }
        const phase = cursor < progress.candidates.length ? 'sweep' : progress.scan.prefix === 256 ? 'complete' : 'mark';
        await this._engine.withTransaction(handle, tx => putMutable(tx, key, { ...progress, cursor, phase }));
        return deleted;
    }
}
