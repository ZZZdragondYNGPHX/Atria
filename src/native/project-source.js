import {
    ATRIA_PACKAGE_CAPABILITIES,
    ATRIA_PACKAGE_PERMISSIONS,
    assertActor,
    assertEntryPoint,
    assertProject,
} from './contracts.js';
import { assertNativeId } from './identity.js';
import {
    assertKnowledgeBinding,
    assertPackagedKnowledgeSnapshot,
    assertPackagedWorldSnapshot,
} from './world-knowledge.js';
import { assertExactResourceRef } from './model-prompt-runtime/contracts.js';
import {
    assertVersionedModelPromptResource,
    collectVersionedModelPromptResourceRefs,
    getVersionedModelPromptResourceIdentity,
} from './model-prompt-runtime/resources.js';

export const ATRIA_PROJECT_FORMAT = 'atria-project-source';
export const ATRIA_PROJECT_SCHEMA_VERSION = 1;
export const ATRIA_PROJECT_MANIFEST = 'atria.project.json';

const PROJECT_KEYS = new Set([
    'format',
    'schemaVersion',
    'project',
    'package',
    'worlds',
    'knowledge',
    'knowledgeBindings',
    'resources',
    'dependencies',
    'assetFiles',
]);

const PACKAGE_SOURCE_KEYS = new Set([
    'name',
    'version',
    'description',
    'author',
    'actors',
    'entryPoints',
    'capabilities',
    'permissions',
    'runtime',
    'orchestration',
    'memory',
    'ui',
    'skills',
    'presets',
    'processors',
    'localization',
    'metadata',
]);

function plain(value, field) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(field + ' must be a plain object');
    }
    return value;
}

function text(value, field, { maxLength = 4096 } = {}) {
    if (typeof value !== 'string' || !value) throw new TypeError(field + ' must be a non-empty string');
    if (value.length > maxLength) throw new TypeError(field + ' is too long');
    return value;
}

function cloneJson(value, field) {
    try {
        return structuredClone(value);
    } catch {
        throw new TypeError(field + ' must contain cloneable JSON data');
    }
}

function assertOnlyKeys(value, allowed, field) {
    for (const key of Object.keys(value)) {
        if (!allowed.has(key)) throw new TypeError(`${field} contains unsupported field '${key}'`);
    }
}

function unique(values, field, keyOf) {
    const out = values.map(item => item);
    const keys = out.map(keyOf);
    if (new Set(keys).size !== keys.length) throw new TypeError(field + ' contains duplicate references');
    return out;
}

function projectPath(value, field) {
    const path = text(value, field, { maxLength: 512 });
    if (
        path.includes('\\')
        || path.startsWith('/')
        || /^[A-Za-z]:/.test(path)
        || path.split('/').some(segment => !segment || segment === '.' || segment === '..')
    ) {
        throw new TypeError(field + ' must be a safe project-relative path');
    }
    return path;
}

function assertPermissions(values) {
    if (!Array.isArray(values)) throw new TypeError('AtriaProject.package.permissions must be an array');
    const permissions = values.map((item, index) => {
        plain(item, `AtriaProject.package.permissions[${index}]`);
        if (!ATRIA_PACKAGE_PERMISSIONS.includes(item.permission)) {
            throw new TypeError(`Unsupported AtriaProject permission '${String(item.permission)}'`);
        }
        if (typeof item.required !== 'boolean') {
            throw new TypeError('AtriaProject permission required must be boolean');
        }
        return Object.freeze({
            permission: item.permission,
            required: item.required,
            ...(item.reason == null ? {} : { reason: text(item.reason, 'AtriaProject permission reason', { maxLength: 1024 }) }),
            ...(item.constraints === undefined ? {} : { constraints: cloneJson(item.constraints, 'AtriaProject permission constraints') }),
        });
    });
    if (new Set(permissions.map(item => item.permission)).size !== permissions.length) {
        throw new TypeError('AtriaProject.package.permissions contains duplicate permissions');
    }
    return permissions;
}

function assertPackageSource(value) {
    plain(value, 'AtriaProject.package');
    assertOnlyKeys(value, PACKAGE_SOURCE_KEYS, 'AtriaProject.package');
    if (!Array.isArray(value.actors)) throw new TypeError('AtriaProject.package.actors must be an array');
    if (!Array.isArray(value.entryPoints) || value.entryPoints.length === 0) {
        throw new TypeError('AtriaProject.package.entryPoints must contain at least one EntryPoint');
    }
    if (!Array.isArray(value.capabilities)) throw new TypeError('AtriaProject.package.capabilities must be an array');

    const actors = value.actors.map(assertActor);
    const entryPoints = value.entryPoints.map(assertEntryPoint);
    const capabilities = value.capabilities.map((capability, index) => {
        text(capability, `AtriaProject.package.capabilities[${index}]`, { maxLength: 128 });
        if (!ATRIA_PACKAGE_CAPABILITIES.includes(capability)) {
            throw new TypeError(`Unsupported AtriaProject capability '${capability}'`);
        }
        return capability;
    });
    if (new Set(capabilities).size !== capabilities.length) {
        throw new TypeError('AtriaProject.package.capabilities contains duplicate capabilities');
    }

    const actorIds = new Set(actors.map(actor => actor.actorId));
    for (const entryPoint of entryPoints) {
        for (const actorId of entryPoint.actorIds) {
            if (!actorIds.has(actorId)) throw new TypeError('Project EntryPoint references unknown actorId ' + actorId);
        }
    }

    const out = {
        name: text(value.name, 'AtriaProject.package.name', { maxLength: 256 }),
        version: text(value.version, 'AtriaProject.package.version', { maxLength: 128 }),
        actors,
        entryPoints,
        capabilities,
        permissions: assertPermissions(value.permissions || []),
    };
    for (const key of [
        'description',
        'author',
        'runtime',
        'orchestration',
        'memory',
        'ui',
        'skills',
        'presets',
        'processors',
        'localization',
        'metadata',
    ]) {
        if (value[key] !== undefined) out[key] = cloneJson(value[key], 'AtriaProject.package.' + key);
    }
    return Object.freeze(out);
}

function assertDependencies(value = {}) {
    plain(value, 'AtriaProject.dependencies');
    assertOnlyKeys(
        value,
        new Set(['worlds', 'knowledge', 'knowledgeBindings', 'assets', 'resources']),
        'AtriaProject.dependencies',
    );

    const worlds = unique((value.worlds || []).map((item, index) => {
        plain(item, `AtriaProject.dependencies.worlds[${index}]`);
        assertOnlyKeys(item, new Set(['worldId', 'worldRevisionId']), `AtriaProject.dependencies.worlds[${index}]`);
        return Object.freeze({
            worldId: assertNativeId(item.worldId, 'world', 'Project World dependency worldId'),
            worldRevisionId: assertNativeId(item.worldRevisionId, 'worldRevision', 'Project World dependency worldRevisionId'),
        });
    }), 'AtriaProject.dependencies.worlds', item => item.worldId + '@' + item.worldRevisionId);

    const knowledge = unique((value.knowledge || []).map((item, index) => {
        plain(item, `AtriaProject.dependencies.knowledge[${index}]`);
        assertOnlyKeys(item, new Set(['knowledgeBaseId', 'knowledgeRevisionId']), `AtriaProject.dependencies.knowledge[${index}]`);
        return Object.freeze({
            knowledgeBaseId: assertNativeId(item.knowledgeBaseId, 'knowledgeBase', 'Project Knowledge dependency knowledgeBaseId'),
            knowledgeRevisionId: assertNativeId(item.knowledgeRevisionId, 'knowledgeRevision', 'Project Knowledge dependency knowledgeRevisionId'),
        });
    }), 'AtriaProject.dependencies.knowledge', item => item.knowledgeBaseId + '@' + item.knowledgeRevisionId);

    const knowledgeBindings = unique((value.knowledgeBindings || []).map((id, index) => (
        assertNativeId(id, 'knowledgeBinding', `AtriaProject.dependencies.knowledgeBindings[${index}]`)
    )), 'AtriaProject.dependencies.knowledgeBindings', item => item);

    const assets = unique((value.assets || []).map((item, index) => {
        plain(item, `AtriaProject.dependencies.assets[${index}]`);
        assertOnlyKeys(item, new Set(['assetId', 'contentHash']), `AtriaProject.dependencies.assets[${index}]`);
        if (typeof item.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(item.contentHash)) {
            throw new TypeError(`AtriaProject.dependencies.assets[${index}].contentHash must be a lowercase SHA-256 digest`);
        }
        return Object.freeze({
            assetId: assertNativeId(item.assetId, 'asset', 'Project Asset dependency assetId'),
            contentHash: item.contentHash,
        });
    }), 'AtriaProject.dependencies.assets', item => item.assetId);

    const resources = unique((value.resources || []).map((item, index) => {
        const ref = assertExactResourceRef(item, null, `AtriaProject.dependencies.resources[${index}]`);
        if (ref.scope !== 'library') {
            throw new TypeError(`AtriaProject.dependencies.resources[${index}].scope must be 'library'`);
        }
        return ref;
    }), 'AtriaProject.dependencies.resources', item => (
        item.resourceType + ':' + item.resourceId + '@' + item.revision
    ));

    return Object.freeze({ worlds, knowledge, knowledgeBindings, assets, resources });
}

function assertProjectModelPromptResources(value = [], projectId) {
    if (!Array.isArray(value)) throw new TypeError('AtriaProject.resources must be an array');
    const resources = value.map((item, index) => {
        const field = `AtriaProject.resources[${index}]`;
        plain(item, field);
        assertOnlyKeys(item, new Set(['resourceType', 'resource']), field);
        const resource = assertVersionedModelPromptResource(item.resourceType, item.resource);
        const identity = getVersionedModelPromptResourceIdentity(item.resourceType, resource);
        for (const ref of collectVersionedModelPromptResourceRefs(item.resourceType, resource)) {
            if (ref.scope === 'package') {
                throw new TypeError(field + ' must not reference package-owned resources');
            }
            if (ref.scope === 'project' && ref.projectId !== projectId) {
                throw new TypeError(field + ' project ref must reference the enclosing Project');
            }
        }
        return Object.freeze({
            resourceType: identity.resourceType,
            resource,
        });
    });
    unique(resources, 'AtriaProject.resources', item => {
        const identity = getVersionedModelPromptResourceIdentity(item.resourceType, item.resource);
        return identity.resourceType + ':' + identity.resourceId + '@' + identity.revision;
    });
    return Object.freeze(resources);
}

function assertAssetFiles(value = []) {
    if (!Array.isArray(value)) throw new TypeError('AtriaProject.assetFiles must be an array');
    const assets = value.map((item, index) => {
        plain(item, `AtriaProject.assetFiles[${index}]`);
        assertOnlyKeys(item, new Set(['assetId', 'path', 'mediaType', 'logicalName', 'metadata']), `AtriaProject.assetFiles[${index}]`);
        return Object.freeze({
            assetId: assertNativeId(item.assetId, 'asset', 'AtriaProject assetId'),
            path: projectPath(item.path, 'AtriaProject asset path'),
            ...(item.mediaType == null ? {} : { mediaType: text(item.mediaType, 'AtriaProject asset mediaType', { maxLength: 256 }) }),
            ...(item.logicalName == null ? {} : { logicalName: text(item.logicalName, 'AtriaProject asset logicalName', { maxLength: 512 }) }),
            ...(item.metadata === undefined ? {} : { metadata: cloneJson(item.metadata, 'AtriaProject asset metadata') }),
        });
    });
    unique(assets, 'AtriaProject.assetFiles assetId', item => item.assetId);
    unique(assets, 'AtriaProject.assetFiles path', item => item.path);
    return assets;
}

export function assertAtriaProjectSource(value) {
    plain(value, 'AtriaProject');
    assertOnlyKeys(value, PROJECT_KEYS, 'AtriaProject');
    if (value.format !== ATRIA_PROJECT_FORMAT) {
        throw new TypeError(`AtriaProject.format must be '${ATRIA_PROJECT_FORMAT}'`);
    }
    if (value.schemaVersion !== ATRIA_PROJECT_SCHEMA_VERSION) {
        throw new TypeError('AtriaProject.schemaVersion must be 1');
    }

    const project = assertProject(value.project);
    const packageSource = assertPackageSource(value.package);
    const worlds = (value.worlds || []).map(assertPackagedWorldSnapshot);
    const knowledge = (value.knowledge || []).map(assertPackagedKnowledgeSnapshot);
    const knowledgeBindings = (value.knowledgeBindings || []).map(assertKnowledgeBinding);
    const resources = assertProjectModelPromptResources(value.resources || [], project.projectId);
    const dependencies = assertDependencies(value.dependencies || {});
    const assetFiles = assertAssetFiles(value.assetFiles || []);

    if (worlds.some(item => item.world.worldId === undefined)) {
        throw new TypeError('AtriaProject.worlds contains invalid World');
    }

    const worldIds = new Set(worlds.map(item => item.world.worldId));
    for (const dependency of dependencies.worlds) worldIds.add(dependency.worldId);

    const localKnowledge = new Map(knowledge.map(item => [
        item.knowledgeBase.knowledgeBaseId + '@' + item.revision.knowledgeRevisionId,
        item,
    ]));
    const dependencyKnowledge = new Set(dependencies.knowledge.map(item => (
        item.knowledgeBaseId + '@' + item.knowledgeRevisionId
    )));
    const bindingIds = new Set(knowledgeBindings.map(item => item.knowledgeBindingId));
    for (const bindingId of dependencies.knowledgeBindings) bindingIds.add(bindingId);
    const assetIds = new Set([...assetFiles.map(item => item.assetId), ...dependencies.assets.map(item => item.assetId)]);

    for (const binding of knowledgeBindings) {
        if (binding.source.kind !== 'project') {
            throw new TypeError('Project-owned KnowledgeBinding source.kind must be project');
        }
        const key = binding.source.knowledgeBaseId + '@' + binding.source.knowledgeRevisionId;
        if (!localKnowledge.has(key)) {
            throw new TypeError('Project-owned KnowledgeBinding must resolve to Project-owned Knowledge');
        }
    }

    for (const snapshot of worlds) {
        for (const bindingId of snapshot.revision.knowledgeBindingIds) {
            if (!bindingIds.has(bindingId)) {
                throw new TypeError('Project WorldRevision references an undeclared KnowledgeBinding ' + bindingId);
            }
        }
        for (const assetId of snapshot.revision.assetIds) {
            if (!assetIds.has(assetId)) {
                throw new TypeError('Project WorldRevision references undeclared Project asset ' + assetId);
            }
        }
    }

    for (const entryPoint of packageSource.entryPoints) {
        for (const worldId of entryPoint.worldIds) {
            if (!worldIds.has(worldId)) {
                throw new TypeError('Project EntryPoint references undeclared World ' + worldId);
            }
        }
        for (const bindingId of entryPoint.knowledgeBindingIds) {
            if (!bindingIds.has(bindingId)) {
                throw new TypeError('Project EntryPoint references undeclared KnowledgeBinding ' + bindingId);
            }
        }
    }

    for (const snapshot of knowledge) {
        const known = new Set(snapshot.entries.map(entry => entry.knowledgeEntryId));
        for (const entry of snapshot.entries) {
            for (const relationId of [
                ...(entry.relations?.requiredEntryIds || []),
                ...(entry.relations?.relatedEntryIds || []),
            ]) {
                if (!known.has(relationId)) {
                    throw new TypeError('Project KnowledgeEntry relation references missing entry ' + relationId);
                }
            }
        }
    }

    // Keep an explicit reference to dependencyKnowledge so exact standalone
    // Knowledge dependencies remain part of the validated authoring contract.
    void dependencyKnowledge;

    return Object.freeze({
        format: ATRIA_PROJECT_FORMAT,
        schemaVersion: ATRIA_PROJECT_SCHEMA_VERSION,
        project,
        package: packageSource,
        worlds: Object.freeze(worlds),
        knowledge: Object.freeze(knowledge),
        knowledgeBindings: Object.freeze(knowledgeBindings),
        resources,
        dependencies,
        assetFiles: Object.freeze(assetFiles),
    });
}

export function validateAtriaProjectSource(value) {
    try {
        return { ok: true, errors: [], project: assertAtriaProjectSource(value) };
    } catch (error) {
        return { ok: false, errors: [error?.message || String(error)], project: null };
    }
}
