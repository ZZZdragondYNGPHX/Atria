import { randomUUID } from 'node:crypto';

import { ConflictError, NotFoundError } from '../../storage/errors.js';
import { createNativeId } from '../identity.js';

export const STUDIO_RESOURCE_OPERATION_TYPES = Object.freeze({
    attach: 'resource.attach',
    fork: 'resource.fork',
    update: 'resource.update',
});

function cloneSource(source) {
    return structuredClone(source);
}

function requireRevision(value, field = 'revision') {
    if (typeof value !== 'string' || !value) throw new TypeError(field + ' is required');
    return value;
}

function originMetadata(ref, relationship) {
    return {
        resourceType: ref.resourceType,
        resourceId: ref.resourceId,
        revision: ref.revision,
        contentIdentity: ref.contentIdentity,
        relationship,
    };
}

function ensureMissing(items, predicate, code, details) {
    if (items.some(predicate)) throw new ConflictError(code, details);
}

function pushUnique(values, value) {
    if (!values.includes(value)) values.push(value);
}

function pushExactAssetDependency(source, assetId, contentHash) {
    const existing = source.dependencies.assets.find(item => item.assetId === assetId);
    if (existing) {
        if (existing.contentHash !== contentHash) {
            throw new ConflictError('library_resource_update_required', {
                resourceType: 'core.asset',
                resourceId: assetId,
                attachedRevision: existing.contentHash,
                requestedRevision: contentHash,
            });
        }
        return;
    }
    if (source.assetFiles.some(item => item.assetId === assetId)) {
        throw new ConflictError('library_resource_project_owned_collision', {
            resourceType: 'core.asset',
            resourceId: assetId,
            revision: contentHash,
        });
    }
    source.dependencies.assets.push({ assetId, contentHash });
}

function defaultForkPath(assetId) {
    return 'assets/forks/' + assetId;
}

export class LibraryAuthoringPlanner {
    constructor({ libraryService, idFactory = randomUUID }) {
        if (!libraryService) throw new TypeError('LibraryAuthoringPlanner requires libraryService');
        if (typeof idFactory !== 'function') throw new TypeError('LibraryAuthoringPlanner idFactory must be a function');
        this._library = libraryService;
        this._idFactory = idFactory;
    }

    async prepareForkInput(handle, target, input = {}) {
        const revision = requireRevision(input.revision);
        const exact = await this._library.getExact(handle, {
            resourceType: target.resourceType,
            resourceId: target.resourceId,
            revision,
        });

        if (target.resourceType === 'core.world') {
            return Object.freeze({
                ...input,
                revision,
                derivativeResourceId: input.derivativeResourceId || createNativeId('world', this._idFactory),
                derivativeRevision: input.derivativeRevision || createNativeId('worldRevision', this._idFactory),
                createdAt: input.createdAt ?? Date.now(),
            });
        }
        if (target.resourceType === 'core.knowledge') {
            const derivativeEntryIds = input.derivativeEntryIds || exact.snapshot.entries.map(() => (
                createNativeId('knowledgeEntry', this._idFactory)
            ));
            if (!Array.isArray(derivativeEntryIds) || derivativeEntryIds.length !== exact.snapshot.entries.length) {
                throw new TypeError('Knowledge fork derivativeEntryIds must match the exact revision entry count');
            }
            return Object.freeze({
                ...input,
                revision,
                derivativeResourceId: input.derivativeResourceId || createNativeId('knowledgeBase', this._idFactory),
                derivativeRevision: input.derivativeRevision || createNativeId('knowledgeRevision', this._idFactory),
                derivativeEntryIds: Object.freeze([...derivativeEntryIds]),
                createdAt: input.createdAt ?? Date.now(),
            });
        }
        if (target.resourceType === 'core.asset') {
            const derivativeResourceId = input.derivativeResourceId || createNativeId('asset', this._idFactory);
            return Object.freeze({
                ...input,
                revision,
                derivativeResourceId,
                path: input.path || defaultForkPath(derivativeResourceId),
            });
        }
        throw new TypeError('Fork is unsupported for Library resourceType ' + target.resourceType);
    }

    _attachWorld(source, exact) {
        const next = cloneSource(source);
        const existing = next.dependencies.worlds.find(item => item.worldId === exact.ref.resourceId);
        if (existing) {
            if (existing.worldRevisionId === exact.ref.revision) return next;
            throw new ConflictError('library_resource_update_required', {
                resourceType: exact.ref.resourceType,
                resourceId: exact.ref.resourceId,
                attachedRevision: existing.worldRevisionId,
                requestedRevision: exact.ref.revision,
            });
        }
        if (next.worlds.some(item => item.world.worldId === exact.ref.resourceId)) {
            throw new ConflictError('library_resource_project_owned_collision', exact.ref);
        }
        next.dependencies.worlds.push({
            worldId: exact.ref.resourceId,
            worldRevisionId: exact.ref.revision,
        });
        for (const bindingId of exact.snapshot.revision.knowledgeBindingIds) {
            pushUnique(next.dependencies.knowledgeBindings, bindingId);
        }
        return next;
    }

    _attachKnowledge(source, exact) {
        const next = cloneSource(source);
        const existing = next.dependencies.knowledge.find(item => (
            item.knowledgeBaseId === exact.ref.resourceId
        ));
        if (existing) {
            if (existing.knowledgeRevisionId === exact.ref.revision) return next;
            throw new ConflictError('library_resource_update_required', {
                resourceType: exact.ref.resourceType,
                resourceId: exact.ref.resourceId,
                attachedRevision: existing.knowledgeRevisionId,
                requestedRevision: exact.ref.revision,
            });
        }
        if (next.knowledge.some(item => item.knowledgeBase.knowledgeBaseId === exact.ref.resourceId)) {
            throw new ConflictError('library_resource_project_owned_collision', exact.ref);
        }
        next.dependencies.knowledge.push({
            knowledgeBaseId: exact.ref.resourceId,
            knowledgeRevisionId: exact.ref.revision,
        });
        return next;
    }

    _attachAsset(source, exact) {
        const next = cloneSource(source);
        pushExactAssetDependency(next, exact.ref.resourceId, exact.ref.revision);
        return next;
    }

    async _planAttach(handle, source, operation) {
        const revision = requireRevision(operation.input?.revision);
        const exact = await this._library.getExact(handle, {
            resourceType: operation.target.resourceType,
            resourceId: operation.target.resourceId,
            revision,
        });
        let next;
        if (operation.target.resourceType === 'core.world') next = this._attachWorld(source, exact);
        else if (operation.target.resourceType === 'core.knowledge') next = this._attachKnowledge(source, exact);
        else if (operation.target.resourceType === 'core.asset') next = this._attachAsset(source, exact);
        else throw new TypeError('Attach is unsupported for Library resourceType ' + operation.target.resourceType);

        return {
            next,
            fileWrites: [],
            change: Object.freeze({
                operationId: operation.operationId,
                kind: 'resource-attach',
                resource: exact.ref,
            }),
        };
    }

    async _planUpdate(handle, source, operation) {
        const fromRevision = requireRevision(operation.input?.fromRevision, 'fromRevision');
        const toRevision = requireRevision(operation.input?.toRevision, 'toRevision');
        if (fromRevision === toRevision) throw new TypeError('Explicit Library update requires a different toRevision');
        const exact = await this._library.getExact(handle, {
            resourceType: operation.target.resourceType,
            resourceId: operation.target.resourceId,
            revision: toRevision,
        });
        const next = cloneSource(source);

        if (operation.target.resourceType === 'core.world') {
            const item = next.dependencies.worlds.find(value => value.worldId === operation.target.resourceId);
            if (!item) throw new NotFoundError('attached library world', operation.target);
            if (item.worldRevisionId !== fromRevision) {
                throw new ConflictError('library_resource_revision_conflict', {
                    ...operation.target,
                    expectedRevision: fromRevision,
                    actualRevision: item.worldRevisionId,
                });
            }
            item.worldRevisionId = toRevision;
            for (const bindingId of exact.snapshot.revision.knowledgeBindingIds) {
                pushUnique(next.dependencies.knowledgeBindings, bindingId);
            }
        } else if (operation.target.resourceType === 'core.knowledge') {
            const item = next.dependencies.knowledge.find(value => (
                value.knowledgeBaseId === operation.target.resourceId
            ));
            if (!item) throw new NotFoundError('attached library knowledge', operation.target);
            if (item.knowledgeRevisionId !== fromRevision) {
                throw new ConflictError('library_resource_revision_conflict', {
                    ...operation.target,
                    expectedRevision: fromRevision,
                    actualRevision: item.knowledgeRevisionId,
                });
            }
            item.knowledgeRevisionId = toRevision;
        } else {
            throw new TypeError('Explicit update is unsupported for Library resourceType ' + operation.target.resourceType);
        }

        return {
            next,
            fileWrites: [],
            change: Object.freeze({
                operationId: operation.operationId,
                kind: 'resource-update',
                resourceType: operation.target.resourceType,
                resourceId: operation.target.resourceId,
                fromRevision,
                toRevision,
            }),
        };
    }

    async _forkWorld(handle, source, operation, exact) {
        const { derivativeResourceId: worldId, derivativeRevision: worldRevisionId, createdAt } = operation.input;
        if (typeof worldId !== 'string' || typeof worldRevisionId !== 'string' || !Number.isSafeInteger(createdAt)) {
            throw new TypeError('World fork requires deterministic derivative identities and createdAt');
        }
        const next = cloneSource(source);
        ensureMissing(
            next.worlds,
            item => item.world.worldId === worldId,
            'project_resource_target_exists',
            { resourceType: 'core.world', resourceId: worldId },
        );
        if (next.dependencies.worlds.some(item => item.worldId === worldId)) {
            throw new ConflictError('project_resource_target_exists', {
                resourceType: 'core.world',
                resourceId: worldId,
            });
        }

        for (const bindingId of exact.snapshot.revision.knowledgeBindingIds) {
            pushUnique(next.dependencies.knowledgeBindings, bindingId);
        }
        const assets = await this._library.list(handle, { resourceType: 'core.asset' });
        for (const assetId of exact.snapshot.revision.assetIds) {
            const item = assets.find(value => value.resourceId === assetId);
            if (!item?.currentRevision) {
                throw new NotFoundError('library world asset', {
                    worldId: exact.ref.resourceId,
                    assetId,
                });
            }
            pushExactAssetDependency(next, assetId, item.currentRevision);
        }

        next.worlds.push({
            world: {
                ...exact.snapshot.world,
                worldId,
                displayName: operation.input.displayName || (exact.snapshot.world.displayName + ' Fork'),
                currentRevisionId: worldRevisionId,
                createdAt,
                updatedAt: createdAt,
            },
            revision: {
                ...exact.snapshot.revision,
                worldRevisionId,
                worldId,
                metadata: {
                    ...(exact.snapshot.revision.metadata || {}),
                    atriaLibraryOrigin: originMetadata(exact.ref, 'fork'),
                },
                createdAt,
            },
        });

        return {
            next,
            fileWrites: [],
            change: Object.freeze({
                operationId: operation.operationId,
                kind: 'resource-fork',
                source: exact.ref,
                derivative: Object.freeze({
                    resourceType: 'core.world',
                    resourceId: worldId,
                    revision: worldRevisionId,
                }),
            }),
        };
    }

    _forkKnowledge(source, operation, exact) {
        const {
            derivativeResourceId: knowledgeBaseId,
            derivativeRevision: knowledgeRevisionId,
            derivativeEntryIds,
            createdAt,
        } = operation.input;
        if (
            typeof knowledgeBaseId !== 'string'
            || typeof knowledgeRevisionId !== 'string'
            || !Array.isArray(derivativeEntryIds)
            || derivativeEntryIds.length !== exact.snapshot.entries.length
            || !Number.isSafeInteger(createdAt)
        ) {
            throw new TypeError('Knowledge fork requires deterministic derivative identities and createdAt');
        }
        const next = cloneSource(source);
        ensureMissing(
            next.knowledge,
            item => item.knowledgeBase.knowledgeBaseId === knowledgeBaseId,
            'project_resource_target_exists',
            { resourceType: 'core.knowledge', resourceId: knowledgeBaseId },
        );
        if (next.dependencies.knowledge.some(item => item.knowledgeBaseId === knowledgeBaseId)) {
            throw new ConflictError('project_resource_target_exists', {
                resourceType: 'core.knowledge',
                resourceId: knowledgeBaseId,
            });
        }

        const idMap = new Map(exact.snapshot.entries.map((entry, index) => [
            entry.knowledgeEntryId,
            derivativeEntryIds[index],
        ]));
        const entries = exact.snapshot.entries.map((entry, index) => ({
            ...entry,
            knowledgeEntryId: derivativeEntryIds[index],
            ...(entry.relations ? {
                relations: {
                    ...entry.relations,
                    ...(entry.relations.requiredEntryIds ? {
                        requiredEntryIds: entry.relations.requiredEntryIds.map(id => idMap.get(id) || id),
                    } : {}),
                    ...(entry.relations.relatedEntryIds ? {
                        relatedEntryIds: entry.relations.relatedEntryIds.map(id => idMap.get(id) || id),
                    } : {}),
                },
            } : {}),
            metadata: {
                ...(entry.metadata || {}),
                atriaLibraryOrigin: originMetadata({
                    ...exact.ref,
                    resourceId: entry.knowledgeEntryId,
                }, 'fork'),
            },
        }));
        next.knowledge.push({
            knowledgeBase: {
                ...exact.snapshot.knowledgeBase,
                knowledgeBaseId,
                displayName: operation.input.displayName || (exact.snapshot.knowledgeBase.displayName + ' Fork'),
                currentRevisionId: knowledgeRevisionId,
                createdAt,
                updatedAt: createdAt,
            },
            revision: {
                ...exact.snapshot.revision,
                knowledgeRevisionId,
                knowledgeBaseId,
                entryIds: [...derivativeEntryIds],
                metadata: {
                    ...(exact.snapshot.revision.metadata || {}),
                    atriaLibraryOrigin: originMetadata(exact.ref, 'fork'),
                },
                createdAt,
            },
            entries,
        });
        return {
            next,
            fileWrites: [],
            change: Object.freeze({
                operationId: operation.operationId,
                kind: 'resource-fork',
                source: exact.ref,
                derivative: Object.freeze({
                    resourceType: 'core.knowledge',
                    resourceId: knowledgeBaseId,
                    revision: knowledgeRevisionId,
                }),
            }),
        };
    }

    _forkAsset(source, operation, exact) {
        const { derivativeResourceId: assetId, path } = operation.input;
        if (typeof assetId !== 'string' || typeof path !== 'string' || !path) {
            throw new TypeError('Asset fork requires derivativeResourceId and path');
        }
        const next = cloneSource(source);
        ensureMissing(
            next.assetFiles,
            item => item.assetId === assetId || item.path === path,
            'project_resource_target_exists',
            { resourceType: 'core.asset', resourceId: assetId, path },
        );
        if (next.dependencies.assets.some(item => item.assetId === assetId)) {
            throw new ConflictError('project_resource_target_exists', {
                resourceType: 'core.asset',
                resourceId: assetId,
            });
        }
        next.assetFiles.push({
            assetId,
            path,
            ...(exact.snapshot.ref.mediaType ? { mediaType: exact.snapshot.ref.mediaType } : {}),
            ...(exact.snapshot.ref.logicalName ? { logicalName: exact.snapshot.ref.logicalName } : {}),
            metadata: {
                atriaLibraryOrigin: originMetadata(exact.ref, 'fork'),
            },
        });
        return {
            next,
            fileWrites: [{ path, bytes: Buffer.from(exact.snapshot.bytes) }],
            change: Object.freeze({
                operationId: operation.operationId,
                kind: 'resource-fork',
                source: exact.ref,
                derivative: Object.freeze({
                    resourceType: 'core.asset',
                    resourceId: assetId,
                    revision: exact.ref.revision,
                }),
            }),
        };
    }

    async _planFork(handle, source, operation) {
        const revision = requireRevision(operation.input?.revision);
        const exact = await this._library.getExact(handle, {
            resourceType: operation.target.resourceType,
            resourceId: operation.target.resourceId,
            revision,
        });
        if (operation.target.resourceType === 'core.world') {
            return this._forkWorld(handle, source, operation, exact);
        }
        if (operation.target.resourceType === 'core.knowledge') {
            return this._forkKnowledge(source, operation, exact);
        }
        if (operation.target.resourceType === 'core.asset') {
            return this._forkAsset(source, operation, exact);
        }
        throw new TypeError('Fork is unsupported for Library resourceType ' + operation.target.resourceType);
    }

    async plan(handle, projectId, source, operation) {
        void projectId;
        if (operation.operationType === STUDIO_RESOURCE_OPERATION_TYPES.attach) {
            return this._planAttach(handle, source, operation);
        }
        if (operation.operationType === STUDIO_RESOURCE_OPERATION_TYPES.update) {
            return this._planUpdate(handle, source, operation);
        }
        if (operation.operationType === STUDIO_RESOURCE_OPERATION_TYPES.fork) {
            return this._planFork(handle, source, operation);
        }
        throw new TypeError('Unsupported Library authoring operation: ' + operation.operationType);
    }
}
