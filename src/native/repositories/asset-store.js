import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { sync as writeFileAtomic } from 'write-file-atomic';

import { NATIVE_RESOURCE_KINDS, assertAssetRef } from '../contracts.js';
import { ConflictError, NotFoundError } from '../../storage/errors.js';
import { assertWritable } from '../../storage/read-only-mode.js';
import { getNativeDocument, listNativeDocuments, putImmutable } from './common.js';

function toBuffer(value) {
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    throw new TypeError('AssetStore bytes must be a Buffer or Uint8Array');
}

function digest(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
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
        return path.join(this._directoriesByHandle(handle).assets, 'atria-native', 'blobs');
    }

    _blobPath(handle, contentHash) {
        return path.join(this._blobRoot(handle), contentHash.slice(0, 2), contentHash);
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
        const blobPath = this._blobPath(handle, ref.contentHash);
        fs.mkdirSync(path.dirname(blobPath), { recursive: true });
        if (!fs.existsSync(blobPath)) writeFileAtomic(blobPath, bytes);

        await this._engine.withTransaction(handle, tx => putImmutable(
            tx,
            this._refKey(handle, ref.assetId),
            ref,
        ));
        return ref;
    }

    async read(handle, assetId) {
        const ref = await this.getRef(handle, assetId);
        if (!ref) return null;
        const blobPath = this._blobPath(handle, ref.contentHash);
        if (!fs.existsSync(blobPath)) {
            throw new NotFoundError('native asset blob', {
                assetId,
                contentHash: ref.contentHash,
            });
        }
        const bytes = fs.readFileSync(blobPath);
        if (bytes.length !== ref.size || digest(bytes) !== ref.contentHash) {
            throw new ConflictError('native_asset_corrupt', {
                assetId,
                contentHash: ref.contentHash,
            });
        }
        return { ref, bytes };
    }

    async deleteRef(handle, assetId) {
        assertWritable();
        return this._engine.withTransaction(handle, tx => tx.deleteResource(
            this._refKey(handle, assetId),
        ));
    }

    async getReferences(handle, assetId) {
        const ref = await this.getRef(handle, assetId);
        if (!ref) return [];
        return this._engine.withTransaction(handle, async (tx) => {
            const references = [];
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

    async gcBlobs(handle, { retainHashes = [] } = {}) {
        assertWritable();
        const referenced = new Set(retainHashes);
        for (const ref of await this.listRefs(handle)) referenced.add(ref.contentHash);

        const root = this._blobRoot(handle);
        if (!fs.existsSync(root)) return [];
        const deleted = [];
        for (const prefix of fs.readdirSync(root)) {
            const dir = path.join(root, prefix);
            let stat;
            try { stat = fs.statSync(dir); } catch { continue; }
            if (!stat.isDirectory()) continue;
            for (const name of fs.readdirSync(dir)) {
                if (!/^[a-f0-9]{64}$/.test(name) || referenced.has(name)) continue;
                fs.rmSync(path.join(dir, name), { force: true });
                deleted.push(name);
            }
            try {
                if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
            } catch { /* best-effort empty directory cleanup */ }
        }
        return deleted;
    }
}
