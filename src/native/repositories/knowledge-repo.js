import { NATIVE_RESOURCE_KINDS } from '../contracts.js';
import {
    assertKnowledgeBase,
    assertKnowledgeBinding,
    assertKnowledgeEntry,
    assertKnowledgeRevision,
} from '../world-knowledge.js';
import { ConflictError, NotFoundError } from '../../storage/errors.js';
import { assertWritable } from '../../storage/read-only-mode.js';
import { getNativeDocument, listNativeDocuments, putImmutable, putMutable } from './common.js';

export class KnowledgeRepo {
    constructor({ engine }) {
        if (!engine) throw new TypeError('KnowledgeRepo requires { engine }');
        this._engine = engine;
    }

    _baseKey(handle, knowledgeBaseId) {
        return { kind: NATIVE_RESOURCE_KINDS.knowledgeBase, handle, knowledgeBaseId };
    }

    _revisionKey(handle, knowledgeBaseId, knowledgeRevisionId) {
        return {
            kind: NATIVE_RESOURCE_KINDS.knowledgeRevision,
            handle,
            knowledgeBaseId,
            knowledgeRevisionId,
        };
    }

    _entryKey(handle, knowledgeBaseId, knowledgeRevisionId, knowledgeEntryId) {
        return {
            kind: NATIVE_RESOURCE_KINDS.knowledgeEntry,
            handle,
            knowledgeBaseId,
            knowledgeRevisionId,
            knowledgeEntryId,
        };
    }

    _bindingKey(handle, knowledgeBindingId) {
        return { kind: NATIVE_RESOURCE_KINDS.knowledgeBinding, handle, knowledgeBindingId };
    }

    async get(handle, knowledgeBaseId) {
        return this._engine.withTransaction(handle, tx => getNativeDocument(
            tx,
            this._baseKey(handle, knowledgeBaseId),
        ));
    }

    async list(handle) {
        return this._engine.withTransaction(handle, tx => listNativeDocuments(tx, {
            kind: NATIVE_RESOURCE_KINDS.knowledgeBase,
            handle,
            orderBy: 'updatedAt',
        }));
    }

    async create(handle, value) {
        assertWritable();
        const base = assertKnowledgeBase(value);
        return this._engine.withTransaction(handle, tx => putMutable(
            tx,
            this._baseKey(handle, base.knowledgeBaseId),
            base,
            { expectedIntegrity: null },
        ));
    }

    async save(handle, value, options = {}) {
        assertWritable();
        const base = assertKnowledgeBase(value);
        return this._engine.withTransaction(handle, async (tx) => {
            if (base.currentRevisionId) {
                const revision = await getNativeDocument(
                    tx,
                    this._revisionKey(handle, base.knowledgeBaseId, base.currentRevisionId),
                );
                if (!revision) throw new NotFoundError('native knowledge revision', {
                    knowledgeBaseId: base.knowledgeBaseId,
                    knowledgeRevisionId: base.currentRevisionId,
                });
            }
            return putMutable(tx, this._baseKey(handle, base.knowledgeBaseId), base, options);
        });
    }

    async getRevision(handle, knowledgeBaseId, knowledgeRevisionId) {
        return this._engine.withTransaction(handle, tx => getNativeDocument(
            tx,
            this._revisionKey(handle, knowledgeBaseId, knowledgeRevisionId),
        ));
    }

    async listRevisions(handle, knowledgeBaseId) {
        return this._engine.withTransaction(handle, tx => listNativeDocuments(tx, {
            kind: NATIVE_RESOURCE_KINDS.knowledgeRevision,
            handle,
            knowledgeBaseId,
            orderBy: 'createdAt',
        }));
    }

    async getEntry(handle, knowledgeBaseId, knowledgeRevisionId, knowledgeEntryId) {
        return this._engine.withTransaction(handle, tx => getNativeDocument(
            tx,
            this._entryKey(handle, knowledgeBaseId, knowledgeRevisionId, knowledgeEntryId),
        ));
    }

    async listEntries(handle, knowledgeBaseId, knowledgeRevisionId) {
        return this._engine.withTransaction(handle, async (tx) => {
            const revision = await getNativeDocument(
                tx,
                this._revisionKey(handle, knowledgeBaseId, knowledgeRevisionId),
            );
            if (!revision) return [];
            const records = await tx.listResources({
                kind: NATIVE_RESOURCE_KINDS.knowledgeEntry,
                handle,
                knowledgeBaseId,
                knowledgeRevisionId,
            });
            const byId = new Map(records.map(record => [record.key.knowledgeEntryId, record.doc]));
            return revision.entryIds.map(entryId => byId.get(entryId)).filter(Boolean);
        });
    }

    async commitRevision(handle, revisionValue, entryValues) {
        assertWritable();
        const revision = assertKnowledgeRevision(revisionValue);
        if (!Array.isArray(entryValues)) throw new TypeError('KnowledgeRepo.commitRevision entries must be an array');
        const entries = entryValues.map(assertKnowledgeEntry);
        if (
            entries.length !== revision.entryIds.length
            || revision.entryIds.some((entryId, index) => entries[index]?.knowledgeEntryId !== entryId)
        ) {
            throw new TypeError('KnowledgeRepo.commitRevision entries must match KnowledgeRevision.entryIds in order');
        }

        return this._engine.withTransaction(handle, async (tx) => {
            const baseKey = this._baseKey(handle, revision.knowledgeBaseId);
            const base = await getNativeDocument(tx, baseKey);
            if (!base) throw new NotFoundError('native knowledge base', {
                knowledgeBaseId: revision.knowledgeBaseId,
            });

            for (const entry of entries) {
                await putImmutable(
                    tx,
                    this._entryKey(
                        handle,
                        revision.knowledgeBaseId,
                        revision.knowledgeRevisionId,
                        entry.knowledgeEntryId,
                    ),
                    entry,
                );
            }
            await putImmutable(
                tx,
                this._revisionKey(handle, revision.knowledgeBaseId, revision.knowledgeRevisionId),
                revision,
            );
            const next = assertKnowledgeBase({
                ...base,
                currentRevisionId: revision.knowledgeRevisionId,
                updatedAt: Math.max(Date.now(), Number(base.updatedAt || 0)),
            });
            await putMutable(tx, baseKey, next);
            return revision;
        });
    }

    async getBinding(handle, knowledgeBindingId) {
        return this._engine.withTransaction(handle, tx => getNativeDocument(
            tx,
            this._bindingKey(handle, knowledgeBindingId),
        ));
    }

    async listBindings(handle) {
        return this._engine.withTransaction(handle, tx => listNativeDocuments(tx, {
            kind: NATIVE_RESOURCE_KINDS.knowledgeBinding,
            handle,
        }));
    }

    async saveBinding(handle, value, options = {}) {
        assertWritable();
        const binding = assertKnowledgeBinding(value);
        if (binding.source.kind !== 'library') {
            throw new TypeError('KnowledgeRepo only stores Library-owned KnowledgeBindings');
        }
        return this._engine.withTransaction(handle, async (tx) => {
            {
                const revision = await getNativeDocument(
                    tx,
                    this._revisionKey(
                        handle,
                        binding.source.knowledgeBaseId,
                        binding.source.knowledgeRevisionId,
                    ),
                );
                if (!revision) throw new NotFoundError('native knowledge revision', binding.source);
            }
            return putMutable(tx, this._bindingKey(handle, binding.knowledgeBindingId), binding, options);
        });
    }

    async _revisionReferences(tx, handle, knowledgeBaseId, knowledgeRevisionId) {
        const references = [];
        const base = await getNativeDocument(tx, this._baseKey(handle, knowledgeBaseId));
        if (base?.currentRevisionId === knowledgeRevisionId) {
            references.push({ kind: 'knowledge-current', knowledgeBaseId });
        }
        const bindings = await tx.listResources({
            kind: NATIVE_RESOURCE_KINDS.knowledgeBinding,
            handle,
        });
        for (const record of bindings) {
            const source = record.doc?.source;
            if (
                source?.kind === 'library'
                && source.knowledgeBaseId === knowledgeBaseId
                && source.knowledgeRevisionId === knowledgeRevisionId
            ) {
                references.push({
                    kind: 'knowledge-binding',
                    knowledgeBindingId: record.doc.knowledgeBindingId,
                });
            }
        }
        return references;
    }

    async getRevisionReferences(handle, knowledgeBaseId, knowledgeRevisionId) {
        return this._engine.withTransaction(handle, tx => this._revisionReferences(
            tx,
            handle,
            knowledgeBaseId,
            knowledgeRevisionId,
        ));
    }

    async deleteRevision(handle, knowledgeBaseId, knowledgeRevisionId) {
        assertWritable();
        return this._engine.withTransaction(handle, async (tx) => {
            const references = await this._revisionReferences(
                tx,
                handle,
                knowledgeBaseId,
                knowledgeRevisionId,
            );
            if (references.length) {
                throw new ConflictError('native_knowledge_revision_referenced', {
                    knowledgeBaseId,
                    knowledgeRevisionId,
                    references,
                });
            }
            for (const record of await tx.listResources({
                kind: NATIVE_RESOURCE_KINDS.knowledgeEntry,
                handle,
                knowledgeBaseId,
                knowledgeRevisionId,
            })) {
                await tx.deleteResource(record.key);
            }
            return tx.deleteResource(this._revisionKey(handle, knowledgeBaseId, knowledgeRevisionId));
        });
    }

    async gcRevisions(handle, knowledgeBaseId, { retainRevisionIds = [] } = {}) {
        assertWritable();
        const retained = new Set(retainRevisionIds);
        return this._engine.withTransaction(handle, async (tx) => {
            const base = await getNativeDocument(tx, this._baseKey(handle, knowledgeBaseId));
            if (base?.currentRevisionId) retained.add(base.currentRevisionId);
            for (const binding of await tx.listResources({
                kind: NATIVE_RESOURCE_KINDS.knowledgeBinding,
                handle,
            })) {
                const source = binding.doc?.source;
                if (source?.kind === 'library' && source.knowledgeBaseId === knowledgeBaseId) {
                    retained.add(source.knowledgeRevisionId);
                }
            }
            const deleted = [];
            for (const record of await tx.listResources({
                kind: NATIVE_RESOURCE_KINDS.knowledgeRevision,
                handle,
                knowledgeBaseId,
            })) {
                const revisionId = record.key.knowledgeRevisionId;
                if (retained.has(revisionId)) continue;
                for (const entry of await tx.listResources({
                    kind: NATIVE_RESOURCE_KINDS.knowledgeEntry,
                    handle,
                    knowledgeBaseId,
                    knowledgeRevisionId: revisionId,
                })) {
                    await tx.deleteResource(entry.key);
                }
                if (await tx.deleteResource(record.key)) deleted.push(revisionId);
            }
            return deleted;
        });
    }

    async getBindingReferences(handle, knowledgeBindingId) {
        return this._engine.withTransaction(handle, async (tx) => {
            const references = [];
            for (const record of await tx.listResources({
                kind: NATIVE_RESOURCE_KINDS.worldRevision,
                handle,
            })) {
                if (record.doc?.knowledgeBindingIds?.includes(knowledgeBindingId)) {
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

    async deleteBinding(handle, knowledgeBindingId) {
        assertWritable();
        return this._engine.withTransaction(handle, async (tx) => {
            const references = [];
            for (const record of await tx.listResources({
                kind: NATIVE_RESOURCE_KINDS.worldRevision,
                handle,
            })) {
                if (record.doc?.knowledgeBindingIds?.includes(knowledgeBindingId)) {
                    references.push({
                        kind: 'world-revision',
                        worldRevisionId: record.doc.worldRevisionId,
                    });
                }
            }
            if (references.length) {
                throw new ConflictError('native_knowledge_binding_referenced', {
                    knowledgeBindingId,
                    references,
                });
            }
            return tx.deleteResource(this._bindingKey(handle, knowledgeBindingId));
        });
    }
}
