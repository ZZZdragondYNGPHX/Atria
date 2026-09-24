import { NotFoundError, ConflictError } from '../../storage/errors.js';
import { assertWritable } from '../../storage/read-only-mode.js';
import {
    NATIVE_RESOURCE_KINDS,
} from '../contracts.js';
import {
    getNativeDocument,
    hashNativeDocument,
    listNativeDocuments,
    putImmutable,
    putMutable,
} from '../repositories/common.js';
import {
    assertConnectionProfile,
    assertModelProfile,
    assertRuntimeRoute,
} from './contracts.js';
import {
    VERSIONED_MODEL_PROMPT_RESOURCE_TYPES,
    assertVersionedModelPromptResource,
    collectVersionedModelPromptResourceRefs,
    getVersionedModelPromptResourceIdentity,
} from './resources.js';

// The FS engine has no transaction isolation. Serialize this authority's writes
// across persistence instances, as Native Session publication already does.
const runtimeWrites = new Map();
async function withRuntimeWrite(handle, operation) {
    const next = (runtimeWrites.get(handle) || Promise.resolve()).catch(() => {}).then(operation);
    runtimeWrites.set(handle, next);
    try { return await next; } finally { if (runtimeWrites.get(handle) === next) runtimeWrites.delete(handle); }
}

function exactRef(identity, contentIdentity) {
    return Object.freeze({
        resourceType: identity.resourceType,
        resourceId: identity.resourceId,
        revision: identity.revision,
        contentIdentity,
        immutable: true,
    });
}

export class VersionedJsonResourceHandler {
    constructor({ engine }) {
        if (!engine) throw new TypeError('VersionedJsonResourceHandler requires { engine }');
        this._engine = engine;
    }

    _rootKey(handle, resourceType, resourceId) {
        return {
            kind: NATIVE_RESOURCE_KINDS.versionedJsonResource,
            handle,
            resourceType,
            resourceId,
        };
    }

    _revisionKey(handle, resourceType, resourceId, revision) {
        return {
            kind: NATIVE_RESOURCE_KINDS.versionedJsonResourceRevision,
            handle,
            resourceType,
            resourceId,
            revision,
        };
    }

    async commit(handle, resourceType, value, { setCurrent = true } = {}) {
        assertWritable();
        const resource = assertVersionedModelPromptResource(resourceType, value);
        for (const ref of collectVersionedModelPromptResourceRefs(resourceType, resource)) {
            if (ref.scope !== 'library') {
                throw new TypeError('Library versioned resources may reference Library exact refs only');
            }
        }
        const identity = getVersionedModelPromptResourceIdentity(resourceType, resource);
        return withRuntimeWrite(handle, () => this._engine.withTransaction(handle, async (tx) => {
            assertWritable();
            await putImmutable(
                tx,
                this._revisionKey(handle, resourceType, identity.resourceId, identity.revision),
                resource,
            );
            if (setCurrent) {
                const previous = await getNativeDocument(tx, this._rootKey(handle, resourceType, identity.resourceId));
                await putMutable(tx, this._rootKey(handle, resourceType, identity.resourceId), {
                    resourceType,
                    resourceId: identity.resourceId,
                    displayName: identity.displayName,
                    currentRevision: identity.revision,
                    ...(previous?.archived === undefined ? {} : { archived: previous.archived }),
                });
            }
            return resource;
        }));
    }

    async setArchived(handle, resourceType, resourceId, archived) {
        if (!VERSIONED_MODEL_PROMPT_RESOURCE_TYPES.includes(resourceType) || typeof archived !== 'boolean') throw new TypeError('Invalid archive target');
        return withRuntimeWrite(handle, () => this._engine.withTransaction(handle, async tx => {
            assertWritable();
            const key = this._rootKey(handle, resourceType, resourceId); const root = await getNativeDocument(tx, key);
            if (!root) throw new NotFoundError('Library resource');
            await putMutable(tx, key, { ...root, archived });
            return { resourceType, resourceId, archived };
        }));
    }

    async getExact(handle, { resourceType, resourceId, revision }) {
        const resource = await this._engine.withTransaction(handle, tx => getNativeDocument(
            tx,
            this._revisionKey(handle, resourceType, resourceId, revision),
        ));
        if (!resource) {
            throw new NotFoundError('versioned model/prompt resource revision', {
                resourceType,
                resourceId,
                revision,
            });
        }
        const asserted = assertVersionedModelPromptResource(resourceType, resource);
        const identity = getVersionedModelPromptResourceIdentity(resourceType, asserted);
        if (identity.resourceId !== resourceId || identity.revision !== revision) {
            throw new Error('Versioned model/prompt resource key does not match persisted identity');
        }
        return Object.freeze({
            ref: exactRef(identity, hashNativeDocument(asserted)),
            snapshot: asserted,
            origin: Object.freeze({ scope: 'library' }),
        });
    }

    async getCurrent(handle, resourceType, resourceId) {
        const root = await this._engine.withTransaction(handle, tx => getNativeDocument(
            tx,
            this._rootKey(handle, resourceType, resourceId),
        ));
        if (!root) return null;
        return this.getExact(handle, {
            resourceType,
            resourceId,
            revision: root.currentRevision,
        });
    }

    async list(handle, { resourceType = null } = {}) {
        if (resourceType !== null && !VERSIONED_MODEL_PROMPT_RESOURCE_TYPES.includes(resourceType)) {
            throw new TypeError('Unsupported versioned model/prompt resourceType: ' + resourceType);
        }
        return this._engine.withTransaction(handle, async (tx) => {
            const roots = await listNativeDocuments(tx, {
                kind: NATIVE_RESOURCE_KINDS.versionedJsonResource,
                handle,
                ...(resourceType === null ? {} : { resourceType }),
                orderBy: 'updatedAt',
            });
            return Object.freeze(roots
                .filter(root => resourceType === null || root.resourceType === resourceType)
                .sort((left, right) => (
                    left.resourceType.localeCompare(right.resourceType)
                    || left.displayName.localeCompare(right.displayName)
                    || left.resourceId.localeCompare(right.resourceId)
                ))
                .map(root => Object.freeze({
                    ...root,
                    revisions: Object.freeze([]),
                })));
        });
    }

    async listRevisions(handle, resourceType, resourceId) {
        return this._engine.withTransaction(handle, async (tx) => {
            const resources = await listNativeDocuments(tx, {
                kind: NATIVE_RESOURCE_KINDS.versionedJsonResourceRevision,
                handle,
                resourceType,
                resourceId,
                orderBy: 'createdAt',
            });
            return Object.freeze(resources
                .map(resource => getVersionedModelPromptResourceIdentity(resourceType, resource).revision)
                .sort());
        });
    }

    async listWithRevisions(handle, { resourceType = null } = {}) {
        const roots = await this.list(handle, { resourceType });
        return Object.freeze(await Promise.all(roots.map(async root => Object.freeze({
            ...root,
            revisions: await this.listRevisions(handle, root.resourceType, root.resourceId),
        }))));
    }
}

function playerKey(kind, handle, idField, id) {
    return { kind, handle, [idField]: id };
}

export class NativeModelPromptPersistence {
    constructor({ engine }) {
        if (!engine) throw new TypeError('NativeModelPromptPersistence requires { engine }');
        this._engine = engine;
    }

    async _get(handle, kind, idField, id) {
        return this._engine.withTransaction(handle, tx => getNativeDocument(
            tx,
            playerKey(kind, handle, idField, id),
        ));
    }

    async _list(handle, kind) {
        return this._engine.withTransaction(handle, tx => listNativeDocuments(tx, {
            kind,
            handle,
            orderBy: 'updatedAt',
        }));
    }

    async _save(handle, kind, idField, id, value) {
        assertWritable();
        return this._engine.withTransaction(handle, tx => putMutable(
            tx,
            playerKey(kind, handle, idField, id),
            value,
        ));
    }

    async saveConnectionProfile(handle, value) {
        const profile = assertConnectionProfile(value);
        return withRuntimeWrite(handle, () => this._save(
            handle,
            NATIVE_RESOURCE_KINDS.connectionProfile,
            'connectionProfileId',
            profile.connectionProfileId,
            profile,
        ));
    }

    async getConnectionProfile(handle, connectionProfileId) {
        const value = await this._get(
            handle,
            NATIVE_RESOURCE_KINDS.connectionProfile,
            'connectionProfileId',
            connectionProfileId,
        );
        return value ? assertConnectionProfile(value) : null;
    }

    async listConnectionProfiles(handle) {
        return Object.freeze((await this._list(handle, NATIVE_RESOURCE_KINDS.connectionProfile))
            .map(assertConnectionProfile));
    }

    async saveModelProfile(handle, value) {
        return withRuntimeWrite(handle, async () => {
            const profile = assertModelProfile(value);
            const connection = await this.getConnectionProfile(handle, profile.connectionProfileRef.connectionProfileId);
            if (!connection) {
                throw new NotFoundError('connection profile', {
                    connectionProfileId: profile.connectionProfileRef.connectionProfileId,
                });
            }
            return this._save(
                handle,
                NATIVE_RESOURCE_KINDS.modelProfile,
                'modelProfileId',
                profile.modelProfileId,
                profile,
            );
        });
    }

    async getModelProfile(handle, modelProfileId) {
        const value = await this._get(
            handle,
            NATIVE_RESOURCE_KINDS.modelProfile,
            'modelProfileId',
            modelProfileId,
        );
        return value ? assertModelProfile(value) : null;
    }

    async listModelProfiles(handle) {
        return Object.freeze((await this._list(handle, NATIVE_RESOURCE_KINDS.modelProfile))
            .map(assertModelProfile));
    }

    async saveRuntimeRoute(handle, value) {
        return withRuntimeWrite(handle, async () => {
            const route = assertRuntimeRoute(value);
            if (route.scope !== 'player') throw new TypeError('P1 persistence accepts player Runtime Routes only');
            const [model, connection] = await Promise.all([
                this.getModelProfile(handle, route.modelProfileRef.modelProfileId),
                this.getConnectionProfile(handle, route.connectionProfileRef.connectionProfileId),
            ]);
            if (!model) {
                throw new NotFoundError('model profile', { modelProfileId: route.modelProfileRef.modelProfileId });
            }
            if (!connection) {
                throw new NotFoundError('connection profile', {
                    connectionProfileId: route.connectionProfileRef.connectionProfileId,
                });
            }
            for (const ref of route.fallbackRouteRefs) {
                const target = await this.getRuntimeRoute(handle, ref.runtimeRouteId);
                if (!target) throw new NotFoundError('fallback route');
                if (target.role !== route.role) throw new ConflictError('native_runtime_fallback_role');
            }
            const incoming = (await this.listRuntimeRoutes(handle)).filter(item => item.role !== route.role && item.fallbackRouteRefs.some(ref => ref.runtimeRouteId === route.runtimeRouteId));
            if (incoming.length) throw new ConflictError('native_runtime_fallback_role');
            return this._save(
                handle,
                NATIVE_RESOURCE_KINDS.runtimeRoute,
                'runtimeRouteId',
                route.runtimeRouteId,
                route,
            );
        });
    }

    async deleteProfile(handle, kind, id) {
        const definitions = { connections: [NATIVE_RESOURCE_KINDS.connectionProfile, 'connectionProfileId'], models: [NATIVE_RESOURCE_KINDS.modelProfile, 'modelProfileId'], routes: [NATIVE_RESOURCE_KINDS.runtimeRoute, 'runtimeRouteId'] };
        if (!definitions[kind]) throw new TypeError('Unsupported Runtime resource');
        return withRuntimeWrite(handle, () => this._engine.withTransaction(handle, async tx => {
            assertWritable();
            const [resourceKind, idField] = definitions[kind]; const key = playerKey(resourceKind, handle, idField, id);
            if (!await getNativeDocument(tx, key)) throw new NotFoundError('Runtime resource');
            const models = await listNativeDocuments(tx, { kind: NATIVE_RESOURCE_KINDS.modelProfile, handle });
            const routes = await listNativeDocuments(tx, { kind: NATIVE_RESOURCE_KINDS.runtimeRoute, handle });
            const usedBy = [];
            const add = (section, value, field) => usedBy.push({ section, id: value[field], displayName: value.displayName });
            if (kind === 'connections') for (const model of models) if (model.connectionProfileRef.connectionProfileId === id) add('models', model, 'modelProfileId');
            for (const route of routes) {
                if ((kind === 'connections' && route.connectionProfileRef.connectionProfileId === id)
                    || (kind === 'models' && route.modelProfileRef.modelProfileId === id)
                    || (kind === 'routes' && route.fallbackRouteRefs.some(ref => ref.runtimeRouteId === id))) add('routes', route, 'runtimeRouteId');
            }
            if (usedBy.length) throw new ConflictError('native_runtime_referenced', { usedBy });
            await tx.deleteResource(key); return { deleted: true };
        }));
    }

    async getRuntimeRoute(handle, runtimeRouteId) {
        const value = await this._get(
            handle,
            NATIVE_RESOURCE_KINDS.runtimeRoute,
            'runtimeRouteId',
            runtimeRouteId,
        );
        return value ? assertRuntimeRoute(value) : null;
    }

    async listRuntimeRoutes(handle) {
        return Object.freeze((await this._list(handle, NATIVE_RESOURCE_KINDS.runtimeRoute))
            .map(assertRuntimeRoute));
    }
}
