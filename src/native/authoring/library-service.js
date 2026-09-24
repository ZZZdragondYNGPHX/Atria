import { createHash } from 'node:crypto';

import { assertAssetRef } from '../contracts.js';
import { assertNativeId } from '../identity.js';
import {
    assertPackagedKnowledgeSnapshot,
    assertPackagedWorldSnapshot,
} from '../world-knowledge.js';
import { NotFoundError } from '../../storage/errors.js';

export const LIBRARY_RESOURCE_TYPES = Object.freeze([
    'core.world',
    'core.knowledge',
    'core.knowledge-binding',
    'core.asset',
    'core.package',
    'core.prompt-module',
    'core.prompt-program',
    'core.generation-profile',
]);

const VERSIONED_JSON_LIBRARY_TYPES = new Set([
    'core.prompt-module',
    'core.prompt-program',
    'core.generation-profile',
]);

const HASH_RE = /^[a-f0-9]{64}$/;

function digestJson(value) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function exactReference({ resourceType, resourceId, revision, contentIdentity = revision }) {
    if (typeof resourceType !== 'string' || !resourceType) throw new TypeError('Library resourceType is required');
    if (typeof resourceId !== 'string' || !resourceId) throw new TypeError('Library resourceId is required');
    if (typeof revision !== 'string' || !revision) throw new TypeError('Library revision is required');
    return Object.freeze({
        resourceType,
        resourceId,
        revision,
        contentIdentity,
        immutable: true,
    });
}

function normalizeQuery(value = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('Library query must be an object');
    }
    if (value.resourceType != null && !LIBRARY_RESOURCE_TYPES.includes(value.resourceType)) {
        throw new TypeError('Unsupported Library resourceType: ' + value.resourceType);
    }
    return value;
}

export class NativeLibraryService {
    constructor({
        worldRepo,
        knowledgeRepo,
        assetStore,
        packageRepo = null,
        versionedJsonResources = null,
    }) {
        for (const [name, value] of Object.entries({ worldRepo, knowledgeRepo, assetStore })) {
            if (!value) throw new TypeError('NativeLibraryService requires ' + name);
        }
        this._worlds = worldRepo;
        this._knowledge = knowledgeRepo;
        this._assets = assetStore;
        this._packages = packageRepo;
        this._versionedJsonResources = versionedJsonResources;
    }

    async list(handle, query = {}) {
        const normalized = normalizeQuery(query);
        const types = normalized.resourceType ? [normalized.resourceType] : LIBRARY_RESOURCE_TYPES;
        const output = [];

        if (types.includes('core.world')) {
            for (const world of await this._worlds.list(handle)) {
                const revisions = await this._worlds.listRevisions(handle, world.worldId);
                output.push(Object.freeze({
                    resourceType: 'core.world',
                    resourceId: world.worldId,
                    displayName: world.displayName,
                    currentRevision: world.currentRevisionId,
                    revisions: Object.freeze(revisions.map(item => item.worldRevisionId)),
                    authority: 'native-library',
                }));
            }
        }

        if (types.includes('core.knowledge')) {
            for (const base of await this._knowledge.list(handle)) {
                const revisions = await this._knowledge.listRevisions(handle, base.knowledgeBaseId);
                output.push(Object.freeze({
                    resourceType: 'core.knowledge',
                    resourceId: base.knowledgeBaseId,
                    displayName: base.displayName,
                    currentRevision: base.currentRevisionId,
                    revisions: Object.freeze(revisions.map(item => item.knowledgeRevisionId)),
                    authority: 'native-library',
                }));
            }
        }

        if (types.includes('core.knowledge-binding')) {
            for (const binding of await this._knowledge.listBindings(handle)) {
                const base = await this._knowledge.get(handle, binding.source.knowledgeBaseId);
                output.push(Object.freeze({
                    resourceType: 'core.knowledge-binding',
                    resourceId: binding.knowledgeBindingId,
                    displayName: binding.metadata?.displayName || base?.displayName || binding.knowledgeBindingId,
                    currentRevision: digestJson(binding),
                    revisions: Object.freeze([digestJson(binding)]),
                    authority: 'native-library',
                    mutableRoot: true,
                }));
            }
        }

        if (types.includes('core.asset')) {
            for (const ref of await this._assets.listRefs(handle)) {
                output.push(Object.freeze({
                    resourceType: 'core.asset',
                    resourceId: ref.assetId,
                    displayName: ref.logicalName || ref.assetId,
                    currentRevision: ref.contentHash,
                    revisions: Object.freeze([ref.contentHash]),
                    authority: 'native-library',
                }));
            }
        }

        if (types.includes('core.package') && this._packages) {
            for (const record of await this._packages.list(handle)) {
                const versions = await this._packages.listVersions(handle, record.packageId);
                output.push(Object.freeze({
                    resourceType: 'core.package',
                    resourceId: record.packageId,
                    displayName: record.displayName || record.packageId,
                    currentRevision: record.currentVersionId,
                    revisions: Object.freeze(versions.map(item => item.packageVersionId)),
                    authority: 'native-library',
                }));
            }
        }

        if (this._versionedJsonResources) {
            for (const resourceType of types.filter(type => VERSIONED_JSON_LIBRARY_TYPES.has(type))) {
                for (const item of await this._versionedJsonResources.listWithRevisions(handle, { resourceType })) {
                    output.push(Object.freeze({
                        resourceType,
                        resourceId: item.resourceId,
                        displayName: item.displayName,
                        currentRevision: item.currentRevision,
                        revisions: item.revisions,
                        authority: 'native-library',
                    }));
                }
            }
        }

        const search = normalized.search == null ? '' : String(normalized.search).trim().toLowerCase();
        return Object.freeze(output
            .filter(item => !search || (
                item.resourceId.toLowerCase().includes(search)
                || item.displayName.toLowerCase().includes(search)
            ))
            .sort((left, right) => (
                left.resourceType.localeCompare(right.resourceType)
                || left.displayName.localeCompare(right.displayName)
            )));
    }

    async getExact(handle, value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new TypeError('Library exact reference must be an object');
        }
        const { resourceType, resourceId, revision } = value;
        if (!LIBRARY_RESOURCE_TYPES.includes(resourceType)) {
            throw new TypeError('Unsupported Library resourceType: ' + resourceType);
        }

        if (resourceType === 'core.world') {
            assertNativeId(resourceId, 'world', 'Library World resourceId');
            assertNativeId(revision, 'worldRevision', 'Library World revision');
            const [world, worldRevision] = await Promise.all([
                this._worlds.get(handle, resourceId),
                this._worlds.getRevision(handle, resourceId, revision),
            ]);
            if (!world || !worldRevision || worldRevision.worldId !== resourceId) {
                throw new NotFoundError('library world revision', { resourceId, revision });
            }
            const snapshot = assertPackagedWorldSnapshot({
                world: { ...world, currentRevisionId: revision },
                revision: worldRevision,
            });
            return Object.freeze({
                ref: exactReference({
                    resourceType,
                    resourceId,
                    revision,
                    contentIdentity: digestJson(snapshot),
                }),
                snapshot,
            });
        }

        if (resourceType === 'core.knowledge') {
            assertNativeId(resourceId, 'knowledgeBase', 'Library Knowledge resourceId');
            assertNativeId(revision, 'knowledgeRevision', 'Library Knowledge revision');
            const [knowledgeBase, knowledgeRevision, entries] = await Promise.all([
                this._knowledge.get(handle, resourceId),
                this._knowledge.getRevision(handle, resourceId, revision),
                this._knowledge.listEntries(handle, resourceId, revision),
            ]);
            if (!knowledgeBase || !knowledgeRevision || knowledgeRevision.knowledgeBaseId !== resourceId) {
                throw new NotFoundError('library knowledge revision', { resourceId, revision });
            }
            const snapshot = assertPackagedKnowledgeSnapshot({
                knowledgeBase: { ...knowledgeBase, currentRevisionId: revision },
                revision: knowledgeRevision,
                entries,
            });
            return Object.freeze({
                ref: exactReference({
                    resourceType,
                    resourceId,
                    revision,
                    contentIdentity: digestJson(snapshot),
                }),
                snapshot,
            });
        }

        if (VERSIONED_JSON_LIBRARY_TYPES.has(resourceType)) {
            if (!this._versionedJsonResources) {
                throw new TypeError('Versioned JSON resource handler is unavailable for Library lookup');
            }
            return this._versionedJsonResources.getExact(handle, {
                resourceType,
                resourceId,
                revision,
            });
        }

        if (resourceType === 'core.asset') {
            assertNativeId(resourceId, 'asset', 'Library Asset resourceId');
            if (typeof revision !== 'string' || !HASH_RE.test(revision)) {
                throw new TypeError('Library Asset revision must be a lowercase SHA-256 content hash');
            }
            const current = await this._assets.getRef(handle, resourceId);
            if (!current || current.contentHash !== revision) {
                throw new NotFoundError('library asset exact reference', { resourceId, revision });
            }
            const bytes = await this._assets.readBlob(handle, revision);
            if (!bytes) throw new NotFoundError('library asset content', { resourceId, revision });
            const ref = assertAssetRef({
                assetId: resourceId,
                contentHash: revision,
                size: bytes.length,
                ...(current.mediaType ? { mediaType: current.mediaType } : {}),
                ...(current.logicalName ? { logicalName: current.logicalName } : {}),
            });
            return Object.freeze({
                ref: exactReference({ resourceType, resourceId, revision }),
                snapshot: Object.freeze({ ref, bytes: Buffer.from(bytes) }),
            });
        }

        if (resourceType === 'core.knowledge-binding') {
            assertNativeId(resourceId, 'knowledgeBinding', 'Library KnowledgeBinding resourceId');
            const binding = await this._knowledge.getBinding(handle, resourceId);
            if (!binding) throw new NotFoundError('library knowledge binding', { resourceId });
            const actual = digestJson(binding);
            if (revision !== actual) {
                throw new NotFoundError('library knowledge binding content identity', {
                    resourceId,
                    revision,
                    actual,
                });
            }
            return Object.freeze({
                ref: exactReference({ resourceType, resourceId, revision }),
                snapshot: binding,
            });
        }

        if (!this._packages) throw new TypeError('PackageRepo is unavailable for Library package lookup');
        assertNativeId(resourceId, 'package', 'Library Package resourceId');
        assertNativeId(revision, 'packageVersion', 'Library Package revision');
        const [record, version] = await Promise.all([
            this._packages.get(handle, resourceId),
            this._packages.getVersion(handle, resourceId, revision),
        ]);
        if (!record || !version || version.packageId !== resourceId) {
            throw new NotFoundError('library package version', { resourceId, revision });
        }
        return Object.freeze({
            ref: exactReference({
                resourceType,
                resourceId,
                revision,
                contentIdentity: version.packageContentHash,
            }),
            snapshot: Object.freeze({
                package: Object.freeze({ ...record, currentVersionId: revision }),
                version,
            }),
        });
    }
}
