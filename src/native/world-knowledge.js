import { assertNativeId } from './identity.js';

export const KNOWLEDGE_BINDING_MODES = Object.freeze(['augment', 'override']);
export const KNOWLEDGE_SOURCE_KINDS = Object.freeze(['package', 'library', 'session', 'project']);
export const KNOWLEDGE_VISIBILITY_TARGETS = Object.freeze(['narrator', 'actor', 'agent', 'user']);

export const WORLD_KNOWLEDGE_FORBIDDEN_IDENTITY_FIELDS = Object.freeze([
    'uid',
    'worldInfoUid',
    'worldBookName',
    'bookName',
    'filename',
    'fileName',
    'path',
    'charaFilename',
    'selected_world_info',
]);

function plain(value, field) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(field + ' must be a plain object');
    }
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
        throw new TypeError(field + ' must be a plain object');
    }
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

function assertOnlyKeys(value, allowed, field) {
    for (const key of Object.keys(value)) {
        if (!allowed.has(key)) throw new TypeError(`${field} contains unsupported field '${key}'`);
    }
}

function noLegacyWorldKnowledgeIdentity(value, label) {
    plain(value, label);
    for (const field of WORLD_KNOWLEDGE_FORBIDDEN_IDENTITY_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(value, field)) {
            throw new TypeError(`${label} must not use legacy World/Knowledge identity field '${field}'`);
        }
    }
    return value;
}

function optionalTimestamp(value, field) {
    return value == null ? undefined : timestamp(value, field);
}

function optionalText(value, field, options) {
    return value == null ? undefined : text(value, field, options);
}

function uniqueNativeIds(values, kind, field) {
    if (values === undefined) return [];
    if (!Array.isArray(values)) throw new TypeError(field + ' must be an array');
    const out = values.map((value, index) => assertNativeId(value, kind, field + '[' + index + ']'));
    if (new Set(out).size !== out.length) throw new TypeError(field + ' must not contain duplicates');
    return out;
}

function uniqueStrings(values, field, allowed = null) {
    if (values === undefined) return [];
    if (!Array.isArray(values)) throw new TypeError(field + ' must be an array');
    const out = values.map((value, index) => text(value, field + '[' + index + ']', { maxLength: 1024 }));
    if (new Set(out).size !== out.length) throw new TypeError(field + ' must not contain duplicates');
    if (allowed) {
        for (const value of out) {
            if (!allowed.includes(value)) throw new TypeError(`${field} contains unsupported value '${value}'`);
        }
    }
    return out;
}

function optionalJsonObject(value, field) {
    if (value === undefined) return undefined;
    return cloneJson(plain(value, field), field);
}

function assertDiscovery(value) {
    if (value === undefined) return undefined;
    plain(value, 'KnowledgeEntry.discovery');
    assertOnlyKeys(value, new Set(['keywords', 'aliases', 'regex', 'semanticHints', 'vectorHints']), 'KnowledgeEntry.discovery');
    return Object.freeze({
        ...(value.keywords === undefined ? {} : { keywords: uniqueStrings(value.keywords, 'KnowledgeEntry.discovery.keywords') }),
        ...(value.aliases === undefined ? {} : { aliases: uniqueStrings(value.aliases, 'KnowledgeEntry.discovery.aliases') }),
        ...(value.regex === undefined ? {} : { regex: uniqueStrings(value.regex, 'KnowledgeEntry.discovery.regex') }),
        ...(value.semanticHints === undefined ? {} : { semanticHints: cloneJson(value.semanticHints, 'KnowledgeEntry.discovery.semanticHints') }),
        ...(value.vectorHints === undefined ? {} : { vectorHints: cloneJson(value.vectorHints, 'KnowledgeEntry.discovery.vectorHints') }),
    });
}

function assertApplicability(value) {
    if (value === undefined) return undefined;
    plain(value, 'KnowledgeEntry.applicability');
    assertOnlyKeys(
        value,
        new Set(['stateConditions', 'stateEvents', 'stateActivation']),
        'KnowledgeEntry.applicability',
    );
    return Object.freeze({
        ...(value.stateConditions === undefined ? {} : { stateConditions: cloneJson(value.stateConditions, 'KnowledgeEntry.applicability.stateConditions') }),
        ...(value.stateEvents === undefined ? {} : { stateEvents: cloneJson(value.stateEvents, 'KnowledgeEntry.applicability.stateEvents') }),
        ...(value.stateActivation === undefined ? {} : { stateActivation: cloneJson(value.stateActivation, 'KnowledgeEntry.applicability.stateActivation') }),
    });
}

function assertLifecycle(value) {
    if (value === undefined) return undefined;
    plain(value, 'KnowledgeEntry.lifecycle');
    assertOnlyKeys(value, new Set(['probability', 'sticky', 'cooldown', 'delay']), 'KnowledgeEntry.lifecycle');
    if (
        value.probability !== undefined
        && (
            typeof value.probability !== 'number'
            || !Number.isFinite(value.probability)
            || value.probability < 0
            || value.probability > 100
        )
    ) {
        throw new TypeError('KnowledgeEntry.lifecycle.probability must be between 0 and 100');
    }
    return Object.freeze({
        ...(value.probability === undefined ? {} : { probability: value.probability }),
        ...(value.sticky === undefined ? {} : { sticky: cloneJson(value.sticky, 'KnowledgeEntry.lifecycle.sticky') }),
        ...(value.cooldown === undefined ? {} : { cooldown: cloneJson(value.cooldown, 'KnowledgeEntry.lifecycle.cooldown') }),
        ...(value.delay === undefined ? {} : { delay: cloneJson(value.delay, 'KnowledgeEntry.lifecycle.delay') }),
    });
}

function assertRelations(value) {
    if (value === undefined) return undefined;
    plain(value, 'KnowledgeEntry.relations');
    assertOnlyKeys(
        value,
        new Set(['requiredEntryIds', 'relatedEntryIds', 'exclusiveGroup']),
        'KnowledgeEntry.relations',
    );
    return Object.freeze({
        ...(value.requiredEntryIds === undefined ? {} : {
            requiredEntryIds: uniqueNativeIds(value.requiredEntryIds, 'knowledgeEntry', 'KnowledgeEntry.relations.requiredEntryIds'),
        }),
        ...(value.relatedEntryIds === undefined ? {} : {
            relatedEntryIds: uniqueNativeIds(value.relatedEntryIds, 'knowledgeEntry', 'KnowledgeEntry.relations.relatedEntryIds'),
        }),
        ...(value.exclusiveGroup == null ? {} : {
            exclusiveGroup: text(value.exclusiveGroup, 'KnowledgeEntry.relations.exclusiveGroup', { maxLength: 256 }),
        }),
    });
}

function assertDelivery(value) {
    if (value === undefined) return undefined;
    plain(value, 'KnowledgeEntry.delivery');
    assertOnlyKeys(value, new Set(['target', 'position', 'priority', 'visibility']), 'KnowledgeEntry.delivery');
    if (value.priority !== undefined && (typeof value.priority !== 'number' || !Number.isFinite(value.priority))) {
        throw new TypeError('KnowledgeEntry.delivery.priority must be a finite number');
    }
    return Object.freeze({
        ...(value.target == null ? {} : { target: text(value.target, 'KnowledgeEntry.delivery.target', { maxLength: 256 }) }),
        ...(value.position == null ? {} : { position: text(value.position, 'KnowledgeEntry.delivery.position', { maxLength: 256 }) }),
        ...(value.priority === undefined ? {} : { priority: value.priority }),
        ...(value.visibility === undefined ? {} : {
            visibility: uniqueStrings(
                value.visibility,
                'KnowledgeEntry.delivery.visibility',
                KNOWLEDGE_VISIBILITY_TARGETS,
            ),
        }),
    });
}

export function assertWorld(value) {
    noLegacyWorldKnowledgeIdentity(value, 'World');
    assertOnlyKeys(
        value,
        new Set(['worldId', 'displayName', 'currentRevisionId', 'createdAt', 'updatedAt']),
        'World',
    );
    const currentRevisionId = value.currentRevisionId == null
        ? null
        : assertNativeId(value.currentRevisionId, 'worldRevision', 'World.currentRevisionId');
    return Object.freeze({
        worldId: assertNativeId(value.worldId, 'world', 'World.worldId'),
        displayName: text(value.displayName, 'World.displayName', { maxLength: 256 }),
        currentRevisionId,
        ...(optionalTimestamp(value.createdAt, 'World.createdAt') === undefined ? {} : { createdAt: value.createdAt }),
        ...(optionalTimestamp(value.updatedAt, 'World.updatedAt') === undefined ? {} : { updatedAt: value.updatedAt }),
    });
}

export function assertWorldRevision(value) {
    noLegacyWorldKnowledgeIdentity(value, 'WorldRevision');
    assertOnlyKeys(
        value,
        new Set([
            'worldRevisionId',
            'worldId',
            'schema',
            'baseline',
            'knowledgeBindingIds',
            'assetIds',
            'metadata',
            'createdAt',
        ]),
        'WorldRevision',
    );
    return Object.freeze({
        worldRevisionId: assertNativeId(value.worldRevisionId, 'worldRevision', 'WorldRevision.worldRevisionId'),
        worldId: assertNativeId(value.worldId, 'world', 'WorldRevision.worldId'),
        ...(value.schema === undefined ? {} : { schema: optionalJsonObject(value.schema, 'WorldRevision.schema') }),
        ...(value.baseline === undefined ? {} : { baseline: optionalJsonObject(value.baseline, 'WorldRevision.baseline') }),
        knowledgeBindingIds: uniqueNativeIds(
            value.knowledgeBindingIds,
            'knowledgeBinding',
            'WorldRevision.knowledgeBindingIds',
        ),
        assetIds: uniqueNativeIds(value.assetIds, 'asset', 'WorldRevision.assetIds'),
        metadata: value.metadata === undefined ? {} : optionalJsonObject(value.metadata, 'WorldRevision.metadata'),
        ...(optionalTimestamp(value.createdAt, 'WorldRevision.createdAt') === undefined ? {} : { createdAt: value.createdAt }),
    });
}

export function assertKnowledgeBase(value) {
    noLegacyWorldKnowledgeIdentity(value, 'KnowledgeBase');
    assertOnlyKeys(
        value,
        new Set(['knowledgeBaseId', 'displayName', 'currentRevisionId', 'createdAt', 'updatedAt']),
        'KnowledgeBase',
    );
    return Object.freeze({
        knowledgeBaseId: assertNativeId(value.knowledgeBaseId, 'knowledgeBase', 'KnowledgeBase.knowledgeBaseId'),
        displayName: text(value.displayName, 'KnowledgeBase.displayName', { maxLength: 256 }),
        currentRevisionId: value.currentRevisionId == null
            ? null
            : assertNativeId(value.currentRevisionId, 'knowledgeRevision', 'KnowledgeBase.currentRevisionId'),
        ...(optionalTimestamp(value.createdAt, 'KnowledgeBase.createdAt') === undefined ? {} : { createdAt: value.createdAt }),
        ...(optionalTimestamp(value.updatedAt, 'KnowledgeBase.updatedAt') === undefined ? {} : { updatedAt: value.updatedAt }),
    });
}

export function assertKnowledgeRevision(value) {
    noLegacyWorldKnowledgeIdentity(value, 'KnowledgeRevision');
    assertOnlyKeys(
        value,
        new Set(['knowledgeRevisionId', 'knowledgeBaseId', 'entryIds', 'metadata', 'createdAt']),
        'KnowledgeRevision',
    );
    return Object.freeze({
        knowledgeRevisionId: assertNativeId(
            value.knowledgeRevisionId,
            'knowledgeRevision',
            'KnowledgeRevision.knowledgeRevisionId',
        ),
        knowledgeBaseId: assertNativeId(value.knowledgeBaseId, 'knowledgeBase', 'KnowledgeRevision.knowledgeBaseId'),
        entryIds: uniqueNativeIds(value.entryIds, 'knowledgeEntry', 'KnowledgeRevision.entryIds'),
        metadata: value.metadata === undefined ? {} : optionalJsonObject(value.metadata, 'KnowledgeRevision.metadata'),
        ...(optionalTimestamp(value.createdAt, 'KnowledgeRevision.createdAt') === undefined ? {} : { createdAt: value.createdAt }),
    });
}

export function assertKnowledgeEntry(value) {
    noLegacyWorldKnowledgeIdentity(value, 'KnowledgeEntry');
    assertOnlyKeys(
        value,
        new Set([
            'knowledgeEntryId',
            'content',
            'discovery',
            'applicability',
            'lifecycle',
            'relations',
            'delivery',
            'metadata',
        ]),
        'KnowledgeEntry',
    );
    return Object.freeze({
        knowledgeEntryId: assertNativeId(value.knowledgeEntryId, 'knowledgeEntry', 'KnowledgeEntry.knowledgeEntryId'),
        content: text(value.content, 'KnowledgeEntry.content', { allowEmpty: true, maxLength: 4 * 1024 * 1024 }),
        ...(value.discovery === undefined ? {} : { discovery: assertDiscovery(value.discovery) }),
        ...(value.applicability === undefined ? {} : { applicability: assertApplicability(value.applicability) }),
        ...(value.lifecycle === undefined ? {} : { lifecycle: assertLifecycle(value.lifecycle) }),
        ...(value.relations === undefined ? {} : { relations: assertRelations(value.relations) }),
        ...(value.delivery === undefined ? {} : { delivery: assertDelivery(value.delivery) }),
        metadata: value.metadata === undefined ? {} : optionalJsonObject(value.metadata, 'KnowledgeEntry.metadata'),
    });
}

export function assertKnowledgeBinding(value) {
    noLegacyWorldKnowledgeIdentity(value, 'KnowledgeBinding');
    assertOnlyKeys(
        value,
        new Set([
            'knowledgeBindingId',
            'source',
            'enabled',
            'mode',
            'target',
            'visibility',
            'priority',
            'metadata',
        ]),
        'KnowledgeBinding',
    );
    plain(value.source, 'KnowledgeBinding.source');
    assertOnlyKeys(
        value.source,
        new Set(['kind', 'knowledgeBaseId', 'knowledgeRevisionId']),
        'KnowledgeBinding.source',
    );
    if (!KNOWLEDGE_SOURCE_KINDS.includes(value.source.kind)) {
        throw new TypeError('KnowledgeBinding.source.kind must be one of: ' + KNOWLEDGE_SOURCE_KINDS.join(', '));
    }
    if (typeof value.enabled !== 'boolean') throw new TypeError('KnowledgeBinding.enabled must be boolean');
    if (!KNOWLEDGE_BINDING_MODES.includes(value.mode)) {
        throw new TypeError('KnowledgeBinding.mode must be one of: ' + KNOWLEDGE_BINDING_MODES.join(', '));
    }
    if (value.priority !== undefined && (typeof value.priority !== 'number' || !Number.isFinite(value.priority))) {
        throw new TypeError('KnowledgeBinding.priority must be a finite number');
    }
    return Object.freeze({
        knowledgeBindingId: assertNativeId(
            value.knowledgeBindingId,
            'knowledgeBinding',
            'KnowledgeBinding.knowledgeBindingId',
        ),
        source: Object.freeze({
            kind: value.source.kind,
            knowledgeBaseId: assertNativeId(
                value.source.knowledgeBaseId,
                'knowledgeBase',
                'KnowledgeBinding.source.knowledgeBaseId',
            ),
            knowledgeRevisionId: assertNativeId(
                value.source.knowledgeRevisionId,
                'knowledgeRevision',
                'KnowledgeBinding.source.knowledgeRevisionId',
            ),
        }),
        enabled: value.enabled,
        mode: value.mode,
        ...(value.target === undefined ? {} : { target: cloneJson(value.target, 'KnowledgeBinding.target') }),
        ...(value.visibility === undefined ? {} : {
            visibility: uniqueStrings(
                value.visibility,
                'KnowledgeBinding.visibility',
                KNOWLEDGE_VISIBILITY_TARGETS,
            ),
        }),
        ...(value.priority === undefined ? {} : { priority: value.priority }),
        metadata: value.metadata === undefined ? {} : optionalJsonObject(value.metadata, 'KnowledgeBinding.metadata'),
    });
}

export function assertPackagedWorldSnapshot(value) {
    plain(value, 'PackagedWorldSnapshot');
    assertOnlyKeys(value, new Set(['world', 'revision']), 'PackagedWorldSnapshot');
    const world = assertWorld(value.world);
    const revision = assertWorldRevision(value.revision);
    if (revision.worldId !== world.worldId) {
        throw new TypeError('PackagedWorldSnapshot revision must belong to World');
    }
    if (world.currentRevisionId !== revision.worldRevisionId) {
        throw new TypeError('PackagedWorldSnapshot must pin World.currentRevisionId to its exact WorldRevision');
    }
    return Object.freeze({ world, revision });
}

export function assertPackagedKnowledgeSnapshot(value) {
    plain(value, 'PackagedKnowledgeSnapshot');
    assertOnlyKeys(value, new Set(['knowledgeBase', 'revision', 'entries']), 'PackagedKnowledgeSnapshot');
    const knowledgeBase = assertKnowledgeBase(value.knowledgeBase);
    const revision = assertKnowledgeRevision(value.revision);
    if (revision.knowledgeBaseId !== knowledgeBase.knowledgeBaseId) {
        throw new TypeError('PackagedKnowledgeSnapshot revision must belong to KnowledgeBase');
    }
    if (knowledgeBase.currentRevisionId !== revision.knowledgeRevisionId) {
        throw new TypeError('PackagedKnowledgeSnapshot must pin KnowledgeBase.currentRevisionId to its exact revision');
    }
    if (!Array.isArray(value.entries)) throw new TypeError('PackagedKnowledgeSnapshot.entries must be an array');
    const entries = value.entries.map(assertKnowledgeEntry);
    const entryIds = entries.map(entry => entry.knowledgeEntryId);
    if (new Set(entryIds).size !== entryIds.length) {
        throw new TypeError('PackagedKnowledgeSnapshot.entries contains duplicate IDs');
    }
    if (
        revision.entryIds.length !== entryIds.length
        || revision.entryIds.some(entryId => !entryIds.includes(entryId))
    ) {
        throw new TypeError('PackagedKnowledgeSnapshot entries must exactly match KnowledgeRevision.entryIds');
    }
    return Object.freeze({ knowledgeBase, revision, entries });
}
