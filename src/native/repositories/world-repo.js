import {
    NATIVE_RESOURCE_KINDS,
} from '../contracts.js';
import { assertWorld, assertWorldRevision } from '../world-knowledge.js';
import { ConflictError, NotFoundError } from '../../storage/errors.js';
import { assertWritable } from '../../storage/read-only-mode.js';
import { getNativeDocument, listNativeDocuments, putImmutable, putMutable } from './common.js';

export class WorldRepo {
    constructor({ engine }) {
        if (!engine) throw new TypeError('WorldRepo requires { engine }');
        this._engine = engine;
    }

    _worldKey(handle, worldId) {
        return { kind: NATIVE_RESOURCE_KINDS.world, handle, worldId };
    }

    _revisionKey(handle, worldId, worldRevisionId) {
        return { kind: NATIVE_RESOURCE_KINDS.worldRevision, handle, worldId, worldRevisionId };
    }

    async get(handle, worldId) {
        return this._engine.withTransaction(handle, tx => getNativeDocument(tx, this._worldKey(handle, worldId)));
    }

    async list(handle) {
        return this._engine.withTransaction(handle, tx => listNativeDocuments(tx, {
            kind: NATIVE_RESOURCE_KINDS.world,
            handle,
            orderBy: 'updatedAt',
        }));
    }

    async create(handle, value) {
        assertWritable();
        const world = assertWorld(value);
        return this._engine.withTransaction(handle, tx => putMutable(
            tx,
            this._worldKey(handle, world.worldId),
            world,
            { expectedIntegrity: null },
        ));
    }

    async save(handle, value, options = {}) {
        assertWritable();
        const world = assertWorld(value);
        return this._engine.withTransaction(handle, async (tx) => {
            if (world.currentRevisionId) {
                const revision = await getNativeDocument(
                    tx,
                    this._revisionKey(handle, world.worldId, world.currentRevisionId),
                );
                if (!revision) throw new NotFoundError('native world revision', {
                    worldId: world.worldId,
                    worldRevisionId: world.currentRevisionId,
                });
            }
            return putMutable(tx, this._worldKey(handle, world.worldId), world, options);
        });
    }

    async getRevision(handle, worldId, worldRevisionId) {
        return this._engine.withTransaction(handle, tx => getNativeDocument(
            tx,
            this._revisionKey(handle, worldId, worldRevisionId),
        ));
    }

    async listRevisions(handle, worldId) {
        return this._engine.withTransaction(handle, tx => listNativeDocuments(tx, {
            kind: NATIVE_RESOURCE_KINDS.worldRevision,
            handle,
            worldId,
            orderBy: 'createdAt',
        }));
    }

    async commitRevision(handle, value) {
        assertWritable();
        const revision = assertWorldRevision(value);
        return this._engine.withTransaction(handle, async (tx) => {
            const worldKey = this._worldKey(handle, revision.worldId);
            const world = await getNativeDocument(tx, worldKey);
            if (!world) throw new NotFoundError('native world', { worldId: revision.worldId });

            for (const knowledgeBindingId of revision.knowledgeBindingIds) {
                const binding = await getNativeDocument(tx, {
                    kind: NATIVE_RESOURCE_KINDS.knowledgeBinding,
                    handle,
                    knowledgeBindingId,
                });
                if (!binding) {
                    throw new NotFoundError('native knowledge binding', { knowledgeBindingId });
                }
            }
            for (const assetId of revision.assetIds) {
                const assetRef = await getNativeDocument(tx, {
                    kind: NATIVE_RESOURCE_KINDS.assetRef,
                    handle,
                    assetId,
                });
                if (!assetRef) throw new NotFoundError('native asset ref', { assetId });
            }

            await putImmutable(
                tx,
                this._revisionKey(handle, revision.worldId, revision.worldRevisionId),
                revision,
            );
            const next = assertWorld({
                ...world,
                currentRevisionId: revision.worldRevisionId,
                updatedAt: Math.max(Date.now(), Number(world.updatedAt || 0)),
            });
            await putMutable(tx, worldKey, next);
            return revision;
        });
    }

    async _revisionReferences(tx, handle, worldId, worldRevisionId) {
        const references = [];
        const world = await getNativeDocument(tx, this._worldKey(handle, worldId));
        if (world?.currentRevisionId === worldRevisionId) {
            references.push({ kind: 'world-current', worldId });
        }
        return references;
    }

    async getRevisionReferences(handle, worldId, worldRevisionId) {
        return this._engine.withTransaction(handle, tx => this._revisionReferences(
            tx,
            handle,
            worldId,
            worldRevisionId,
        ));
    }

    async deleteRevision(handle, worldId, worldRevisionId) {
        assertWritable();
        return this._engine.withTransaction(handle, async (tx) => {
            const references = await this._revisionReferences(tx, handle, worldId, worldRevisionId);
            if (references.length) {
                throw new ConflictError('native_world_revision_referenced', {
                    worldId,
                    worldRevisionId,
                    references,
                });
            }
            return tx.deleteResource(this._revisionKey(handle, worldId, worldRevisionId));
        });
    }

    async gcRevisions(handle, worldId, { retainRevisionIds = [] } = {}) {
        assertWritable();
        const retained = new Set(retainRevisionIds);
        return this._engine.withTransaction(handle, async (tx) => {
            const world = await getNativeDocument(tx, this._worldKey(handle, worldId));
            if (world?.currentRevisionId) retained.add(world.currentRevisionId);
            const deleted = [];
            for (const record of await tx.listResources({
                kind: NATIVE_RESOURCE_KINDS.worldRevision,
                handle,
                worldId,
            })) {
                const revisionId = record.key.worldRevisionId;
                if (retained.has(revisionId)) continue;
                if (await tx.deleteResource(record.key)) deleted.push(revisionId);
            }
            return deleted;
        });
    }

    async delete(handle, worldId) {
        assertWritable();
        return this._engine.withTransaction(handle, async (tx) => {
            for (const record of await tx.listResources({
                kind: NATIVE_RESOURCE_KINDS.worldRevision,
                handle,
                worldId,
            })) {
                await tx.deleteResource(record.key);
            }
            return tx.deleteResource(this._worldKey(handle, worldId));
        });
    }
}
