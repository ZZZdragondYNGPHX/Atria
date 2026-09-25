import { normalizeNativeRegexScripts } from '../../public/shared/native-regex.js';
import { validateSkillDeclarations } from '../../public/scripts/native/skill-declarations.js';
import { assertNativeId } from './identity.js';
import { assertPackageModelPromptRuntimeMetadata } from './model-prompt-runtime/contracts.js';
import {
    assertPackageVersionedModelPromptResourceEnvelope,
    collectVersionedModelPromptResourceRefs,
    getVersionedModelPromptResourceIdentity,
} from './model-prompt-runtime/resources.js';
import {
    assertKnowledgeBinding,
    assertPackagedKnowledgeSnapshot,
    assertPackagedWorldSnapshot,
} from './world-knowledge.js';

export const NATIVE_SCHEMA_VERSION = 1;
export const ATRIA_PACKAGE_FORMAT = 'atria-package';
export const ATRIA_PACKAGE_SCHEMA_VERSION = 2;
export const ATRIA_SAVE_FORMAT = 'atria-save';
export const ATRIA_SAVE_SCHEMA_VERSION = 1;
export const ATRIA_SAVE_SCOPES = Object.freeze(['snapshot', 'session']);
export const SAVE_POINT_KINDS = Object.freeze(['auto', 'quick', 'manual']);

export const ATRIA_PACKAGE_CAPABILITIES = Object.freeze([
    'actor-interaction',
    'narrative',
    'game',
    'world-simulation',
    'tool',
    'custom-ui',
    'game-runtime',
    'orchestration',
    'memory',
    'knowledge',
    'skills',
    'processors',
]);

export const ATRIA_PACKAGE_PERMISSIONS = Object.freeze([
    'custom-ui',
    'generation',
    'runtime-tools',
    'world-write',
    'network',
    'clipboard',
    'asset-access',
]);

export const NATIVE_STORE_SCHEMA_VERSION = 1;
export const NATIVE_RESOURCE_KINDS = Object.freeze({
    package: 'atri_package',
    packageVersion: 'atri_package_version',
    packageState: 'atri_package_state',
    world: 'atri_world',
    worldRevision: 'atri_world_revision',
    knowledgeBase: 'atri_knowledge_base',
    knowledgeRevision: 'atri_knowledge_revision',
    knowledgeEntry: 'atri_knowledge_entry',
    knowledgeBinding: 'atri_knowledge_binding',
    session: 'atri_session',
    branch: 'atri_session_branch',
    timelineEntry: 'atri_timeline_entry',
    timelineVariant: 'atri_timeline_variant',
    sessionState: 'atri_session_state',
    sessionRevision: 'atri_session_revision',
    savePoint: 'atri_save_point',
    assetRef: 'atri_asset_ref',
    versionedJsonResource: 'atri_versioned_json_resource',
    versionedJsonResourceRevision: 'atri_versioned_json_resource_revision',
    connectionProfile: 'atri_connection_profile',
    modelProfile: 'atri_model_profile',
    runtimeRoute: 'atri_runtime_route',
    retrievalProfile: 'atri_retrieval_profile',
});

export const NATIVE_STORE_FAMILIES = Object.freeze([
    'packages',
    'package_versions',
    'package_states',
    'worlds',
    'world_revisions',
    'knowledge_bases',
    'knowledge_revisions',
    'knowledge_entries',
    'knowledge_bindings',
    'sessions',
    'session_branches',
    'timeline_entries',
    'timeline_variants',
    'session_states',
    'session_revisions',
    'save_points',
    'asset_refs',
]);

export const FORBIDDEN_NATIVE_IDENTITY_FIELDS = Object.freeze([
    'characterId',
    'charId',
    'charDir',
    'char_dir',
    'avatar_url',
    'avatarFilename',
    'characterName',
    'chatFile',
    'chatName',
    'messageIndex',
    'swipeIndex',
    'swipe_id',
]);

const HASH_RE = /^[a-f0-9]{64}$/;
const STATE_HEAD_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const RESOURCE_TYPE_RE = /^[a-z][a-z0-9]*(?:[._:-][a-z0-9][a-z0-9_-]*)+$/;
const NAMESPACE_RE = /^atri_[a-z0-9][a-z0-9_.-]*$/;

function plain(value, field) {
    if (
        !value
        || typeof value !== 'object'
        || Array.isArray(value)
        || Object.prototype.toString.call(value) !== '[object Object]'
    ) {
        throw new TypeError(field + ' must be a plain object');
    }
    // Native JSON contracts cross plugin/worker/Jest VM realms. Object-brand
    // validation accepts ordinary JSON objects across those boundaries while
    // still rejecting Date/Map/Set/class instances.
    return value;
}

function text(value, field, { allowEmpty = false, maxLength = 4096 } = {}) {
    if (typeof value !== 'string') throw new TypeError(field + ' must be a string');
    if (!allowEmpty && value.length === 0) throw new TypeError(field + ' must not be empty');
    if (value.length > maxLength) throw new TypeError(field + ' is too long');
    return value;
}

function timestamp(value, field) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new TypeError(field + ' must be a non-negative epoch-millisecond integer');
    }
    return value;
}

function sha256(value, field) {
    if (typeof value !== 'string' || !HASH_RE.test(value)) {
        throw new TypeError(field + ' must be a lowercase SHA-256 digest');
    }
    return value;
}

function jsonValue(value, field, seen = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'object') throw new TypeError(field + ' must contain JSON values only');
    if (seen.has(value)) throw new TypeError(field + ' must not contain cycles');
    seen.add(value);
    if (Array.isArray(value)) {
        value.forEach((item, index) => jsonValue(item, field + '[' + index + ']', seen));
    } else {
        plain(value, field);
        for (const [key, item] of Object.entries(value)) {
            jsonValue(item, field + '.' + key, seen);
        }
    }
    seen.delete(value);
    return value;
}

function cloneJson(value, field) {
    jsonValue(value, field);
    return structuredClone(value);
}

function noLegacyIdentity(value, label) {
    plain(value, label);
    for (const field of FORBIDDEN_NATIVE_IDENTITY_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(value, field)) {
            throw new TypeError(`${label} must not use legacy identity field '${field}'`);
        }
    }
    return value;
}

function uniqueIds(values, kind, field) {
    if (values === undefined) return [];
    if (!Array.isArray(values)) throw new TypeError(field + ' must be an array');
    const result = values.map((value, index) => assertNativeId(value, kind, field + '[' + index + ']'));
    if (new Set(result).size !== result.length) throw new TypeError(field + ' must not contain duplicates');
    return result;
}

function assertNamespace(value, field) {
    text(value, field, { maxLength: 128 });
    if (!NAMESPACE_RE.test(value)) throw new TypeError(field + ' must be an Atria-owned atri_* namespace');
    return value;
}

function assertStateHead(value, field) {
    if (typeof value !== 'string' || !STATE_HEAD_RE.test(value)) {
        throw new TypeError(field + ' must be an opaque state-head token without path separators');
    }
    return value;
}

function assertOnlyKeys(value, allowed, field) {
    for (const key of Object.keys(value)) {
        if (!allowed.has(key)) throw new TypeError(`${field} contains unsupported field '${key}'`);
    }
}

function assertKnownUniqueStrings(values, allowed, field) {
    if (!Array.isArray(values)) throw new TypeError(field + ' must be an array');
    const result = values.map((value, index) => text(value, field + '[' + index + ']', { maxLength: 128 }));
    if (new Set(result).size !== result.length) throw new TypeError(field + ' must not contain duplicates');
    for (const value of result) {
        if (!allowed.includes(value)) throw new TypeError(`${field} contains unsupported value '${value}'`);
    }
    return result;
}

export function assertActor(value) {
    noLegacyIdentity(value, 'Actor');
    const actorId = assertNativeId(value.actorId, 'actor', 'Actor.actorId');
    const displayName = text(value.displayName, 'Actor.displayName', { maxLength: 256 });
    return Object.freeze({
        actorId,
        displayName,
        ...(value.role == null ? {} : { role: text(value.role, 'Actor.role', { maxLength: 128 }) }),
        profile: value.profile === undefined ? {} : cloneJson(plain(value.profile, 'Actor.profile'), 'Actor.profile'),
        metadata: value.metadata === undefined ? {} : cloneJson(plain(value.metadata, 'Actor.metadata'), 'Actor.metadata'),
    });
}

export function assertEntryPoint(value) {
    noLegacyIdentity(value, 'EntryPoint');
    if (Object.prototype.hasOwnProperty.call(value, 'world')) {
        throw new TypeError('EntryPoint.world is retired; use worldIds/primaryWorldId');
    }
    const entryPointId = assertNativeId(value.entryPointId, 'entryPoint', 'EntryPoint.entryPointId');
    const displayName = text(value.displayName, 'EntryPoint.displayName', { maxLength: 256 });
    const actorIds = uniqueIds(value.actorIds, 'actor', 'EntryPoint.actorIds');
    const primaryActorId = value.primaryActorId == null
        ? undefined
        : assertNativeId(value.primaryActorId, 'actor', 'EntryPoint.primaryActorId');
    if (primaryActorId && !actorIds.includes(primaryActorId)) {
        throw new TypeError('EntryPoint.primaryActorId must be listed in EntryPoint.actorIds');
    }
    const worldIds = uniqueIds(value.worldIds, 'world', 'EntryPoint.worldIds');
    const primaryWorldId = value.primaryWorldId == null
        ? undefined
        : assertNativeId(value.primaryWorldId, 'world', 'EntryPoint.primaryWorldId');
    if (primaryWorldId && !worldIds.includes(primaryWorldId)) {
        throw new TypeError('EntryPoint.primaryWorldId must be listed in EntryPoint.worldIds');
    }
    const knowledgeBindingIds = uniqueIds(
        value.knowledgeBindingIds,
        'knowledgeBinding',
        'EntryPoint.knowledgeBindingIds',
    );
    const result = {
        entryPointId,
        displayName,
        actorIds,
        worldIds,
        knowledgeBindingIds,
    };
    if (primaryActorId) result.primaryActorId = primaryActorId;
    if (primaryWorldId) result.primaryWorldId = primaryWorldId;
    for (const key of [
        'initialStateOverlay',
        'initialTimeline',
        'ui',
        'runtime',
        'recommendations',
        'orchestration',
        'memory',
    ]) {
        if (value[key] !== undefined) result[key] = cloneJson(value[key], 'EntryPoint.' + key);
    }
    return Object.freeze(result);
}

export function assertPackageRecord(value) {
    noLegacyIdentity(value, 'Package');
    return Object.freeze({
        packageId: assertNativeId(value.packageId, 'package', 'Package.packageId'),
        displayName: text(value.displayName, 'Package.displayName', { maxLength: 256 }),
        currentVersionId: value.currentVersionId == null
            ? null
            : assertNativeId(value.currentVersionId, 'packageVersion', 'Package.currentVersionId'),
        ...(value.createdAt == null ? {} : { createdAt: timestamp(value.createdAt, 'Package.createdAt') }),
        ...(value.updatedAt == null ? {} : { updatedAt: timestamp(value.updatedAt, 'Package.updatedAt') }),
    });
}

export function assertPackageVersion(value) {
    noLegacyIdentity(value, 'PackageVersion');
    return Object.freeze({
        packageVersionId: assertNativeId(value.packageVersionId, 'packageVersion', 'PackageVersion.packageVersionId'),
        packageId: assertNativeId(value.packageId, 'package', 'PackageVersion.packageId'),
        version: text(value.version, 'PackageVersion.version', { maxLength: 128 }),
        packageContentHash: sha256(value.packageContentHash, 'PackageVersion.packageContentHash'),
        ...(value.createdAt == null ? {} : { createdAt: timestamp(value.createdAt, 'PackageVersion.createdAt') }),
    });
}

export function assertProject(value) {
    noLegacyIdentity(value, 'Project');
    return Object.freeze({
        projectId: assertNativeId(value.projectId, 'project', 'Project.projectId'),
        packageId: assertNativeId(value.packageId, 'package', 'Project.packageId'),
        displayName: text(value.displayName, 'Project.displayName', { maxLength: 256 }),
        ...(value.createdAt == null ? {} : { createdAt: timestamp(value.createdAt, 'Project.createdAt') }),
        ...(value.updatedAt == null ? {} : { updatedAt: timestamp(value.updatedAt, 'Project.updatedAt') }),
    });
}

export function assertSession(value) {
    noLegacyIdentity(value, 'Session');
    return Object.freeze({
        sessionId: assertNativeId(value.sessionId, 'session', 'Session.sessionId'),
        packageId: assertNativeId(value.packageId, 'package', 'Session.packageId'),
        packageVersionId: assertNativeId(value.packageVersionId, 'packageVersion', 'Session.packageVersionId'),
        packageVersion: text(value.packageVersion, 'Session.packageVersion', { maxLength: 128 }),
        packageContentHash: sha256(value.packageContentHash, 'Session.packageContentHash'),
        entryPointId: assertNativeId(value.entryPointId, 'entryPoint', 'Session.entryPointId'),
        activeBranchId: assertNativeId(value.activeBranchId, 'branch', 'Session.activeBranchId'),
        headRevisionId: value.headRevisionId == null
            ? null
            : assertNativeId(value.headRevisionId, 'revision', 'Session.headRevisionId'),
        ...(value.displayTitle == null ? {} : { displayTitle: text(value.displayTitle, 'Session.displayTitle', { maxLength: 256 }) }),
        createdAt: timestamp(value.createdAt, 'Session.createdAt'),
        updatedAt: timestamp(value.updatedAt, 'Session.updatedAt'),
    });
}

export function assertBranch(value) {
    noLegacyIdentity(value, 'Branch');
    let forkPoint = null;
    if (value.forkPoint != null) {
        plain(value.forkPoint, 'Branch.forkPoint');
        forkPoint = Object.freeze({
            messageId: assertNativeId(value.forkPoint.messageId, 'message', 'Branch.forkPoint.messageId'),
            variantId: value.forkPoint.variantId == null
                ? null
                : assertNativeId(value.forkPoint.variantId, 'variant', 'Branch.forkPoint.variantId'),
        });
    }
    return Object.freeze({
        branchId: assertNativeId(value.branchId, 'branch', 'Branch.branchId'),
        sessionId: assertNativeId(value.sessionId, 'session', 'Branch.sessionId'),
        parentBranchId: value.parentBranchId == null
            ? null
            : assertNativeId(value.parentBranchId, 'branch', 'Branch.parentBranchId'),
        forkPoint,
        ...(value.displayName == null ? {} : { displayName: text(value.displayName, 'Branch.displayName', { maxLength: 256 }) }),
        createdAt: timestamp(value.createdAt, 'Branch.createdAt'),
    });
}

export function assertTimelineEntry(value) {
    noLegacyIdentity(value, 'TimelineEntry');
    if (!Number.isSafeInteger(value.sequence) || value.sequence < 0) {
        throw new TypeError('TimelineEntry.sequence must be a non-negative ordering integer');
    }
    const variantIds = uniqueIds(value.variantIds, 'variant', 'TimelineEntry.variantIds');
    const activeVariantId = value.activeVariantId == null
        ? null
        : assertNativeId(value.activeVariantId, 'variant', 'TimelineEntry.activeVariantId');
    if (activeVariantId && !variantIds.includes(activeVariantId)) {
        throw new TypeError('TimelineEntry.activeVariantId must be listed in TimelineEntry.variantIds');
    }
    return Object.freeze({
        messageId: assertNativeId(value.messageId, 'message', 'TimelineEntry.messageId'),
        sessionId: assertNativeId(value.sessionId, 'session', 'TimelineEntry.sessionId'),
        branchId: assertNativeId(value.branchId, 'branch', 'TimelineEntry.branchId'),
        sequence: value.sequence,
        role: text(value.role, 'TimelineEntry.role', { maxLength: 64 }),
        content: text(value.content == null ? '' : value.content, 'TimelineEntry.content', { allowEmpty: true, maxLength: 4 * 1024 * 1024 }),
        ...(value.actorId == null ? {} : { actorId: assertNativeId(value.actorId, 'actor', 'TimelineEntry.actorId') }),
        variantIds,
        activeVariantId,
        metadata: value.metadata === undefined ? {} : cloneJson(plain(value.metadata, 'TimelineEntry.metadata'), 'TimelineEntry.metadata'),
    });
}

export function assertVariant(value) {
    noLegacyIdentity(value, 'Variant');
    return Object.freeze({
        variantId: assertNativeId(value.variantId, 'variant', 'Variant.variantId'),
        sessionId: assertNativeId(value.sessionId, 'session', 'Variant.sessionId'),
        messageId: assertNativeId(value.messageId, 'message', 'Variant.messageId'),
        content: text(value.content == null ? '' : value.content, 'Variant.content', { allowEmpty: true, maxLength: 4 * 1024 * 1024 }),
        metadata: value.metadata === undefined ? {} : cloneJson(plain(value.metadata, 'Variant.metadata'), 'Variant.metadata'),
        createdAt: timestamp(value.createdAt, 'Variant.createdAt'),
    });
}

export function assertSessionRevision(value) {
    noLegacyIdentity(value, 'SessionRevision');
    let timelineHead = null;
    if (value.timelineHead != null) {
        plain(value.timelineHead, 'SessionRevision.timelineHead');
        timelineHead = Object.freeze({
            messageId: assertNativeId(value.timelineHead.messageId, 'message', 'SessionRevision.timelineHead.messageId'),
            variantId: value.timelineHead.variantId == null
                ? null
                : assertNativeId(value.timelineHead.variantId, 'variant', 'SessionRevision.timelineHead.variantId'),
        });
    }
    plain(value.stateHeads, 'SessionRevision.stateHeads');
    const stateHeads = {};
    for (const [namespace, head] of Object.entries(value.stateHeads)) {
        stateHeads[assertNamespace(namespace, 'SessionRevision.stateHeads namespace')] = assertStateHead(head, 'SessionRevision.stateHeads.' + namespace);
    }
    return Object.freeze({
        revisionId: assertNativeId(value.revisionId, 'revision', 'SessionRevision.revisionId'),
        sessionId: assertNativeId(value.sessionId, 'session', 'SessionRevision.sessionId'),
        branchId: assertNativeId(value.branchId, 'branch', 'SessionRevision.branchId'),
        timelineHead,
        knowledgeHead: assertStateHead(value.knowledgeHead, 'SessionRevision.knowledgeHead'),
        stateHeads: Object.freeze(stateHeads),
        createdAt: timestamp(value.createdAt, 'SessionRevision.createdAt'),
    });
}

export function assertSavePoint(value) {
    noLegacyIdentity(value, 'SavePoint');
    if (!SAVE_POINT_KINDS.includes(value.kind)) {
        throw new TypeError('SavePoint.kind must be one of: ' + SAVE_POINT_KINDS.join(', '));
    }
    return Object.freeze({
        saveId: assertNativeId(value.saveId, 'savePoint', 'SavePoint.saveId'),
        sessionId: assertNativeId(value.sessionId, 'session', 'SavePoint.sessionId'),
        branchId: assertNativeId(value.branchId, 'branch', 'SavePoint.branchId'),
        revisionId: assertNativeId(value.revisionId, 'revision', 'SavePoint.revisionId'),
        kind: value.kind,
        ...(value.displayName == null ? {} : { displayName: text(value.displayName, 'SavePoint.displayName', { maxLength: 256 }) }),
        createdAt: timestamp(value.createdAt, 'SavePoint.createdAt'),
    });
}

export function assertAssetRef(value) {
    noLegacyIdentity(value, 'AssetRef');
    if (!Number.isSafeInteger(value.size) || value.size < 0) throw new TypeError('AssetRef.size must be a non-negative integer');
    return Object.freeze({
        assetId: assertNativeId(value.assetId, 'asset', 'AssetRef.assetId'),
        contentHash: sha256(value.contentHash, 'AssetRef.contentHash'),
        size: value.size,
        ...(value.mediaType == null ? {} : { mediaType: text(value.mediaType, 'AssetRef.mediaType', { maxLength: 256 }) }),
        ...(value.logicalName == null ? {} : { logicalName: text(value.logicalName, 'AssetRef.logicalName', { maxLength: 512 }) }),
    });
}

const PACKAGE_KEYS = new Set([
    'format',
    'schemaVersion',
    'nativeSchemaVersion',
    'packageId',
    'packageVersionId',
    'name',
    'version',
    'description',
    'author',
    'actors',
    'entryPoints',
    'capabilities',
    'permissions',
    'worlds',
    'knowledge',
    'knowledgeBindings',
    'resources',
    'runtime',
    'orchestration',
    'memory',
    'ui',
    'skills',
    'presets',
    'processors',
    'assets',
    'localization',
    'metadata',
]);

export function assertAtriaPackageManifest(value) {
    noLegacyIdentity(value, 'AtriaPackage');
    assertOnlyKeys(value, PACKAGE_KEYS, 'AtriaPackage');
    if (value.format !== ATRIA_PACKAGE_FORMAT) throw new TypeError(`AtriaPackage.format must be '${ATRIA_PACKAGE_FORMAT}'`);
    if (value.schemaVersion !== ATRIA_PACKAGE_SCHEMA_VERSION) throw new TypeError('AtriaPackage.schemaVersion must be 2');
    if (value.nativeSchemaVersion !== NATIVE_SCHEMA_VERSION) throw new TypeError('AtriaPackage.nativeSchemaVersion must be 1');

    const packageId = assertNativeId(value.packageId, 'package', 'AtriaPackage.packageId');
    const packageVersionId = assertNativeId(value.packageVersionId, 'packageVersion', 'AtriaPackage.packageVersionId');
    const name = text(value.name, 'AtriaPackage.name', { maxLength: 256 });
    const version = text(value.version, 'AtriaPackage.version', { maxLength: 128 });

    if (!Array.isArray(value.actors)) throw new TypeError('AtriaPackage.actors must be an array');
    if (!Array.isArray(value.entryPoints) || value.entryPoints.length === 0) {
        throw new TypeError('AtriaPackage.entryPoints must contain at least one EntryPoint');
    }
    if (!Array.isArray(value.assets)) throw new TypeError('AtriaPackage.assets must be an array');

    const actors = value.actors.map(assertActor);
    const entryPoints = value.entryPoints.map(assertEntryPoint);
    const assets = value.assets.map(assertAssetRef);
    const worlds = (value.worlds || []).map(assertPackagedWorldSnapshot);
    const knowledge = (value.knowledge || []).map(assertPackagedKnowledgeSnapshot);
    const knowledgeBindings = (value.knowledgeBindings || []).map(assertKnowledgeBinding);
    const hasModelPromptResources = value.resources !== undefined;
    const modelPromptResources = (value.resources || []).map((item, index) => (
        assertPackageVersionedModelPromptResourceEnvelope(item, {
            packageId,
            packageVersionId,
            field: 'AtriaPackage.resources[' + index + ']',
        })
    ));
    for (const [items, key, field] of [
        [actors, 'actorId', 'AtriaPackage.actors'],
        [entryPoints, 'entryPointId', 'AtriaPackage.entryPoints'],
        [assets, 'assetId', 'AtriaPackage.assets'],
        [worlds.map(item => item.world), 'worldId', 'AtriaPackage.worlds'],
        [knowledge.map(item => item.knowledgeBase), 'knowledgeBaseId', 'AtriaPackage.knowledge'],
        [knowledgeBindings, 'knowledgeBindingId', 'AtriaPackage.knowledgeBindings'],
    ]) {
        const ids = items.map(item => item[key]);
        if (new Set(ids).size !== ids.length) throw new TypeError(field + ' contains duplicate IDs');
    }

    const actorIds = new Set(actors.map(item => item.actorId));
    for (const entryPoint of entryPoints) {
        for (const actorId of entryPoint.actorIds) {
            if (!actorIds.has(actorId)) throw new TypeError('EntryPoint references unknown actorId ' + actorId);
        }
    }

    const worldIds = new Set(worlds.map(item => item.world.worldId));
    const assetIds = new Set(assets.map(item => item.assetId));
    const bindingIds = new Set(knowledgeBindings.map(item => item.knowledgeBindingId));
    const knowledgeRevisionKeys = new Set(knowledge.map(item => (
        item.knowledgeBase.knowledgeBaseId + '@' + item.revision.knowledgeRevisionId
    )));
    const modelPromptResourceKeys = new Set(modelPromptResources.map(item => {
        const identity = getVersionedModelPromptResourceIdentity(item.resourceType, item.resource);
        return identity.resourceType + ':' + identity.resourceId + '@' + identity.revision;
    }));
    if (modelPromptResourceKeys.size !== modelPromptResources.length) {
        throw new TypeError('AtriaPackage.resources contains duplicate exact identities');
    }
    for (const item of modelPromptResources) {
        for (const ref of collectVersionedModelPromptResourceRefs(item.resourceType, item.resource)) {
            const key = ref.resourceType + ':' + ref.resourceId + '@' + ref.revision;
            if (!modelPromptResourceKeys.has(key)) {
                throw new TypeError('AtriaPackage model/prompt resource references missing exact dependency ' + key);
            }
        }
    }

    for (const entryPoint of entryPoints) {
        for (const worldId of entryPoint.worldIds) {
            if (!worldIds.has(worldId)) throw new TypeError('EntryPoint references unknown worldId ' + worldId);
        }
        for (const bindingId of entryPoint.knowledgeBindingIds) {
            if (!bindingIds.has(bindingId)) throw new TypeError('EntryPoint references unknown knowledgeBindingId ' + bindingId);
        }
    }

    for (const snapshot of worlds) {
        for (const bindingId of snapshot.revision.knowledgeBindingIds) {
            if (!bindingIds.has(bindingId)) throw new TypeError('WorldRevision references unknown knowledgeBindingId ' + bindingId);
        }
        for (const assetId of snapshot.revision.assetIds) {
            if (!assetIds.has(assetId)) throw new TypeError('WorldRevision references unknown assetId ' + assetId);
        }
    }

    for (const binding of knowledgeBindings) {
        const key = binding.source.knowledgeBaseId + '@' + binding.source.knowledgeRevisionId;
        if (!knowledgeRevisionKeys.has(key)) {
            throw new TypeError('KnowledgeBinding source must resolve to an immutable Knowledge snapshot in this Package');
        }
    }

    const capabilities = assertKnownUniqueStrings(
        value.capabilities || [],
        ATRIA_PACKAGE_CAPABILITIES,
        'AtriaPackage.capabilities',
    );
    if (!Array.isArray(value.permissions)) throw new TypeError('AtriaPackage.permissions must be an array');
    const permissions = value.permissions.map((item, index) => {
        plain(item, 'AtriaPackage.permissions[' + index + ']');
        const permission = text(item.permission, 'AtriaPackage.permissions[' + index + '].permission', { maxLength: 128 });
        if (!ATRIA_PACKAGE_PERMISSIONS.includes(permission)) throw new TypeError(`Unsupported AtriaPackage permission '${permission}'`);
        if (typeof item.required !== 'boolean') throw new TypeError('AtriaPackage permission required must be boolean');
        return Object.freeze({
            permission,
            required: item.required,
            ...(item.reason == null ? {} : { reason: text(item.reason, 'AtriaPackage permission reason', { maxLength: 1024 }) }),
            ...(item.constraints === undefined ? {} : { constraints: cloneJson(item.constraints, 'AtriaPackage permission constraints') }),
        });
    });
    if (new Set(permissions.map(item => item.permission)).size !== permissions.length) {
        throw new TypeError('AtriaPackage.permissions contains duplicate permissions');
    }

    const out = {
        format: ATRIA_PACKAGE_FORMAT,
        schemaVersion: ATRIA_PACKAGE_SCHEMA_VERSION,
        nativeSchemaVersion: NATIVE_SCHEMA_VERSION,
        packageId,
        packageVersionId,
        name,
        version,
        actors,
        entryPoints,
        capabilities,
        permissions,
        worlds,
        knowledge,
        knowledgeBindings,
        resources: modelPromptResources,
        assets,
    };
    if (value.runtime !== undefined) {
        const runtime = cloneJson(plain(value.runtime, 'AtriaPackage.runtime'), 'AtriaPackage.runtime');
        if (runtime.modelPrompt !== undefined) {
            runtime.modelPrompt = assertPackageModelPromptRuntimeMetadata(runtime.modelPrompt, {
                packageId,
                packageVersionId,
            });
        }
        if (runtime.modelPrompt !== undefined && hasModelPromptResources) {
            for (const role of runtime.modelPrompt.roles) {
                for (const ref of [role.promptProgramRef, role.generationProfileRef].filter(Boolean)) {
                    const key = ref.resourceType + ':' + ref.resourceId + '@' + ref.revision;
                    if (!modelPromptResourceKeys.has(key)) {
                        throw new TypeError('Package.runtime.modelPrompt references missing exact resource ' + key);
                    }
                }
            }
        }
        out.runtime = Object.freeze(runtime);
    }
    for (const key of [
        'description',
        'author',
        'orchestration',
        'memory',
        'ui',
        'skills',
        'presets',
        'processors',
        'localization',
        'metadata',
    ]) {
        if (value[key] !== undefined) out[key] = cloneJson(value[key], 'AtriaPackage.' + key);
    }
    if (out.processors?.regex !== undefined) {
        if (!Array.isArray(out.processors.regex)) throw new TypeError('Invalid Package Regex scripts');
        // Earlier native packages did not require IDs. Derive stable local IDs so
        // their existing rules remain editable without changing their ownership.
        const used = new Set(out.processors.regex.map(rule => rule?.id).filter(Boolean));
        const scripts = out.processors.regex.map((rule, index) => {
            if (!rule || typeof rule !== 'object' || Array.isArray(rule) || rule.id !== undefined) return rule;
            let id = 'atri_game_regex_' + index;
            while (used.has(id)) id += '_';
            used.add(id);
            return { ...rule, id };
        });
        out.processors.regex = normalizeNativeRegexScripts(scripts);
    }
    if (out.skills !== undefined) validateSkillDeclarations(out.skills);
    return Object.freeze(out);
}

export function validateAtriaPackageManifest(value) {
    try {
        return { ok: true, errors: [], manifest: assertAtriaPackageManifest(value) };
    } catch (error) {
        return { ok: false, errors: [error?.message || String(error)], manifest: null };
    }
}

const SAVE_KEYS = new Set([
    'format',
    'schemaVersion',
    'nativeSchemaVersion',
    'scope',
    'exportedAt',
    'package',
    'root',
    'closure',
]);

function assertSavePackage(value) {
    plain(value, '.atriasave.package');
    return Object.freeze({
        packageId: assertNativeId(value.packageId, 'package', '.atriasave.package.packageId'),
        packageVersionId: assertNativeId(value.packageVersionId, 'packageVersion', '.atriasave.package.packageVersionId'),
        packageVersion: text(value.packageVersion, '.atriasave.package.packageVersion', { maxLength: 128 }),
        packageContentHash: sha256(value.packageContentHash, '.atriasave.package.packageContentHash'),
        entryPointId: assertNativeId(value.entryPointId, 'entryPoint', '.atriasave.package.entryPointId'),
    });
}

function assertSaveRoot(value, scope) {
    plain(value, '.atriasave.root');
    const saveId = value.saveId == null ? null : assertNativeId(value.saveId, 'savePoint', '.atriasave.root.saveId');
    if (scope === 'snapshot' && saveId === null) throw new TypeError('.atriasave snapshot scope requires root.saveId');
    return Object.freeze({
        sessionId: assertNativeId(value.sessionId, 'session', '.atriasave.root.sessionId'),
        revisionId: assertNativeId(value.revisionId, 'revision', '.atriasave.root.revisionId'),
        saveId,
    });
}

function assertStateRecord(value, index) {
    plain(value, '.atriasave.closure.stateRecords[' + index + ']');
    return Object.freeze({
        namespace: assertNamespace(value.namespace, '.atriasave.closure.stateRecords[' + index + '].namespace'),
        head: assertStateHead(value.head, '.atriasave.closure.stateRecords[' + index + '].head'),
        data: cloneJson(value.data, '.atriasave.closure.stateRecords[' + index + '].data'),
    });
}

function assertAttachment(value, index) {
    plain(value, '.atriasave.closure.attachments[' + index + ']');
    return Object.freeze({
        assetId: assertNativeId(value.assetId, 'asset', '.atriasave.closure.attachments[' + index + '].assetId'),
        ...(value.messageId == null ? {} : { messageId: assertNativeId(value.messageId, 'message', '.atriasave attachment messageId') }),
        ...(value.variantId == null ? {} : { variantId: assertNativeId(value.variantId, 'variant', '.atriasave attachment variantId') }),
    });
}

export function assertAtriaSave(value) {
    plain(value, '.atriasave');
    noLegacyIdentity(value, '.atriasave');
    assertOnlyKeys(value, SAVE_KEYS, '.atriasave');
    if (value.format !== ATRIA_SAVE_FORMAT) throw new TypeError(`.atriasave format must be '${ATRIA_SAVE_FORMAT}'`);
    if (value.schemaVersion !== ATRIA_SAVE_SCHEMA_VERSION) throw new TypeError('.atriasave schemaVersion must be 1');
    if (value.nativeSchemaVersion !== NATIVE_SCHEMA_VERSION) throw new TypeError('.atriasave nativeSchemaVersion must be 1');
    if (!ATRIA_SAVE_SCOPES.includes(value.scope)) throw new TypeError('.atriasave scope must be snapshot or session');

    const packageDependency = assertSavePackage(value.package);
    const root = assertSaveRoot(value.root, value.scope);
    plain(value.closure, '.atriasave.closure');

    const session = assertSession(value.closure.session);
    const branches = (value.closure.branches || []).map(assertBranch);
    const timelineEntries = (value.closure.timelineEntries || []).map(assertTimelineEntry);
    const variants = (value.closure.variants || []).map(assertVariant);
    const stateRecords = (value.closure.stateRecords || []).map(assertStateRecord);
    const revisions = (value.closure.revisions || []).map(assertSessionRevision);
    const savePoints = (value.closure.savePoints || []).map(assertSavePoint);
    const assetRefs = (value.closure.assetRefs || []).map(assertAssetRef);
    const attachments = (value.closure.attachments || []).map(assertAttachment);

    if (session.sessionId !== root.sessionId) throw new TypeError('.atriasave root.sessionId must match closure.session.sessionId');
    if (
        session.packageId !== packageDependency.packageId
        || session.packageVersionId !== packageDependency.packageVersionId
        || session.packageVersion !== packageDependency.packageVersion
        || session.packageContentHash !== packageDependency.packageContentHash
        || session.entryPointId !== packageDependency.entryPointId
    ) {
        throw new TypeError('.atriasave package dependency must exactly match the exported Session');
    }

    const branchIds = new Set(branches.map(item => item.branchId));
    const messageById = new Map(timelineEntries.map(item => [item.messageId, item]));
    const variantById = new Map(variants.map(item => [item.variantId, item]));
    const revisionById = new Map(revisions.map(item => [item.revisionId, item]));
    const saveById = new Map(savePoints.map(item => [item.saveId, item]));
    const assetIds = new Set(assetRefs.map(item => item.assetId));
    const stateKeys = new Set(stateRecords.map(item => item.namespace + '\0' + item.head));

    if (!branchIds.has(session.activeBranchId)) throw new TypeError('Session.activeBranchId is missing from .atriasave closure');
    if (!revisionById.has(root.revisionId)) throw new TypeError('root.revisionId is missing from .atriasave closure');
    if (session.headRevisionId && !revisionById.has(session.headRevisionId)) {
        throw new TypeError('Session.headRevisionId is missing from .atriasave closure');
    }
    if (root.saveId && !saveById.has(root.saveId)) throw new TypeError('root.saveId is missing from .atriasave closure');

    for (const branch of branches) {
        if (branch.sessionId !== session.sessionId) throw new TypeError('Every Branch must belong to the exported Session');
        if (branch.parentBranchId && !branchIds.has(branch.parentBranchId)) throw new TypeError('Branch parent is outside the exported closure');
    }
    for (const message of timelineEntries) {
        if (message.sessionId !== session.sessionId || !branchIds.has(message.branchId)) {
            throw new TypeError('TimelineEntry has an invalid session/branch reference');
        }
        for (const variantId of message.variantIds) {
            const variant = variantById.get(variantId);
            if (!variant || variant.messageId !== message.messageId) throw new TypeError('TimelineEntry references an invalid Variant');
        }
    }
    for (const variant of variants) {
        if (variant.sessionId !== session.sessionId || !messageById.has(variant.messageId)) {
            throw new TypeError('Variant has an invalid session/message reference');
        }
    }
    for (const revision of revisions) {
        if (revision.sessionId !== session.sessionId || !branchIds.has(revision.branchId)) {
            throw new TypeError('SessionRevision has an invalid session/branch reference');
        }
        if (revision.timelineHead) {
            const message = messageById.get(revision.timelineHead.messageId);
            if (!message) throw new TypeError('SessionRevision references a missing timeline head');
            if (revision.timelineHead.variantId) {
                const variant = variantById.get(revision.timelineHead.variantId);
                if (!variant || variant.messageId !== message.messageId) throw new TypeError('SessionRevision references an invalid head Variant');
            }
        }
        for (const [namespace, head] of Object.entries(revision.stateHeads)) {
            if (!stateKeys.has(namespace + '\0' + head)) throw new TypeError('SessionRevision references missing state ' + namespace + '@' + head);
        }
        if (!stateKeys.has('atri_knowledge\0' + revision.knowledgeHead)) {
            throw new TypeError('SessionRevision references missing state atri_knowledge@' + revision.knowledgeHead);
        }
    }
    for (const savePoint of savePoints) {
        if (
            savePoint.sessionId !== session.sessionId
            || !branchIds.has(savePoint.branchId)
            || !revisionById.has(savePoint.revisionId)
        ) {
            throw new TypeError('SavePoint has an invalid session/branch/revision reference');
        }
    }
    for (const attachment of attachments) {
        if (!assetIds.has(attachment.assetId)) throw new TypeError('Attachment references an unknown AssetRef');
        if (attachment.messageId && !messageById.has(attachment.messageId)) throw new TypeError('Attachment references an unknown TimelineEntry');
        if (attachment.variantId && !variantById.has(attachment.variantId)) throw new TypeError('Attachment references an unknown Variant');
    }
    if (root.saveId && saveById.get(root.saveId).revisionId !== root.revisionId) {
        throw new TypeError('root.saveId and root.revisionId must identify the same SavePoint');
    }
    if (value.scope === 'snapshot') {
        const rootRevision = revisionById.get(root.revisionId);
        if (session.headRevisionId !== root.revisionId || session.activeBranchId !== rootRevision.branchId) {
            throw new TypeError('.atriasave snapshot Session must publish the exported root Revision');
        }
    }

    return Object.freeze({
        format: ATRIA_SAVE_FORMAT,
        schemaVersion: ATRIA_SAVE_SCHEMA_VERSION,
        nativeSchemaVersion: NATIVE_SCHEMA_VERSION,
        scope: value.scope,
        exportedAt: timestamp(value.exportedAt, '.atriasave.exportedAt'),
        package: packageDependency,
        root,
        closure: Object.freeze({
            session,
            branches,
            timelineEntries,
            variants,
            stateRecords,
            revisions,
            savePoints,
            assetRefs,
            attachments,
        }),
    });
}

export function validateAtriaSave(value) {
    try {
        return { ok: true, errors: [], save: assertAtriaSave(value) };
    } catch (error) {
        return { ok: false, errors: [error?.message || String(error)], save: null };
    }
}

const RESOURCE_KEY_SPECS = Object.freeze({
    [NATIVE_RESOURCE_KINDS.package]: [['handle', 'handle'], ['packageId', 'package']],
    [NATIVE_RESOURCE_KINDS.packageVersion]: [['handle', 'handle'], ['packageId', 'package'], ['packageVersionId', 'packageVersion']],
    [NATIVE_RESOURCE_KINDS.packageState]: [['handle', 'handle'], ['packageId', 'package'], ['namespace', 'namespace']],
    [NATIVE_RESOURCE_KINDS.world]: [['handle', 'handle'], ['worldId', 'world']],
    [NATIVE_RESOURCE_KINDS.worldRevision]: [['handle', 'handle'], ['worldId', 'world'], ['worldRevisionId', 'worldRevision']],
    [NATIVE_RESOURCE_KINDS.knowledgeBase]: [['handle', 'handle'], ['knowledgeBaseId', 'knowledgeBase']],
    [NATIVE_RESOURCE_KINDS.knowledgeRevision]: [['handle', 'handle'], ['knowledgeBaseId', 'knowledgeBase'], ['knowledgeRevisionId', 'knowledgeRevision']],
    [NATIVE_RESOURCE_KINDS.knowledgeEntry]: [['handle', 'handle'], ['knowledgeBaseId', 'knowledgeBase'], ['knowledgeRevisionId', 'knowledgeRevision'], ['knowledgeEntryId', 'knowledgeEntry']],
    [NATIVE_RESOURCE_KINDS.knowledgeBinding]: [['handle', 'handle'], ['knowledgeBindingId', 'knowledgeBinding']],
    [NATIVE_RESOURCE_KINDS.session]: [['handle', 'handle'], ['sessionId', 'session']],
    [NATIVE_RESOURCE_KINDS.branch]: [['handle', 'handle'], ['sessionId', 'session'], ['branchId', 'branch']],
    [NATIVE_RESOURCE_KINDS.timelineEntry]: [['handle', 'handle'], ['sessionId', 'session'], ['branchId', 'branch'], ['messageId', 'message']],
    [NATIVE_RESOURCE_KINDS.timelineVariant]: [['handle', 'handle'], ['sessionId', 'session'], ['messageId', 'message'], ['variantId', 'variant']],
    [NATIVE_RESOURCE_KINDS.sessionState]: [['handle', 'handle'], ['sessionId', 'session'], ['namespace', 'namespace'], ['head', 'stateHead']],
    [NATIVE_RESOURCE_KINDS.sessionRevision]: [['handle', 'handle'], ['sessionId', 'session'], ['revisionId', 'revision']],
    [NATIVE_RESOURCE_KINDS.savePoint]: [['handle', 'handle'], ['sessionId', 'session'], ['saveId', 'savePoint']],
    [NATIVE_RESOURCE_KINDS.assetRef]: [['handle', 'handle'], ['assetId', 'asset']],
    [NATIVE_RESOURCE_KINDS.versionedJsonResource]: [['handle', 'handle'], ['resourceType', 'resourceType'], ['resourceId', 'token']],
    [NATIVE_RESOURCE_KINDS.versionedJsonResourceRevision]: [['handle', 'handle'], ['resourceType', 'resourceType'], ['resourceId', 'token'], ['revision', 'token']],
    [NATIVE_RESOURCE_KINDS.connectionProfile]: [['handle', 'handle'], ['connectionProfileId', 'connectionProfile']],
    [NATIVE_RESOURCE_KINDS.modelProfile]: [['handle', 'handle'], ['modelProfileId', 'modelProfile']],
    [NATIVE_RESOURCE_KINDS.retrievalProfile]: [['handle', 'handle'], ['retrievalProfileId', 'retrievalProfile'], ['revision', 'token']],
    [NATIVE_RESOURCE_KINDS.runtimeRoute]: [['handle', 'handle'], ['runtimeRouteId', 'runtimeRoute']],
});

function assertResourceKeyField(value, type, field) {
    if (type === 'handle') return text(value, field, { maxLength: 256 });
    if (type === 'namespace') return assertNamespace(value, field);
    if (type === 'stateHead') return assertStateHead(value, field);
    if (type === 'token') return assertStateHead(value, field);
    if (type === 'resourceType') {
        text(value, field, { maxLength: 192 });
        if (!RESOURCE_TYPE_RE.test(value)) throw new TypeError(field + ' must be a namespaced resource type');
        return value;
    }
    return assertNativeId(value, type, field);
}

export function assertNativeResourceKey(key) {
    plain(key, 'Native resource key');
    const spec = RESOURCE_KEY_SPECS[key.kind];
    if (!spec) throw new TypeError(`Unsupported Native resource kind '${String(key.kind)}'`);
    const allowed = new Set(['kind', ...spec.map(([field]) => field)]);
    for (const field of Object.keys(key)) {
        if (!allowed.has(field)) throw new TypeError(`Native resource key '${key.kind}' must not contain field '${field}'`);
    }
    const result = { kind: key.kind };
    for (const [field, type] of spec) result[field] = assertResourceKeyField(key[field], type, key.kind + '.' + field);
    return Object.freeze(result);
}

export function getNativeResourceKeyFields(kind) {
    const spec = RESOURCE_KEY_SPECS[kind];
    if (!spec) throw new TypeError(`Unsupported Native resource kind '${String(kind)}'`);
    return Object.freeze(spec.map(([field]) => field));
}
