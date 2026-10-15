import { createHash } from 'node:crypto';
import { NATIVE_RESOURCE_KINDS } from '../native/contracts.js';
import { serializeNativeDocument } from '../native/repositories/common.js';
import { visualSessionOwner } from '../native/visual-store.js';

// Business categories are independent of the engine and of the legacy inspector.
export const RESOURCE_CATEGORIES = Object.freeze([
    'sessions', 'projects', 'knowledge', 'media', 'personas', 'agents',
    'settings', 'recovery', 'cache',
]);
export const STORAGE_CENTER_PROTOCOL = 'atria.storage-center.v1';
export const RECOVERY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const families = {
    sessions: ['session', 'runControl', 'branch', 'timelineEntry', 'timelineVariant', 'sessionState', 'sessionRevision', 'savePoint', 'commitReceipt', 'sharedAccess', 'sharedAccessRevision', 'realm', 'realmRevision', 'playerContinuity', 'playerContinuityRevision'],
    projects: ['package', 'packageVersion', 'packageState', 'projectAgentTask'],
    knowledge: ['world', 'worldRevision', 'knowledgeBase', 'knowledgeRevision', 'knowledgeEntry', 'knowledgeBinding'],
    media: ['assetRef'],
    personas: ['persona', 'personaRevision', 'personaDefault', 'personaMigration'],
    agents: ['agentExperience', 'agentEvidence', 'agentGoal', 'agentEvolution', 'agentEvolutionOwner'],
    settings: ['connectionProfile', 'credentialTargetPermit', 'modelProfile', 'runtimeRoute', 'retrievalProfile'],
    cache: ['runtimeCheckpoint'],
    advanced: ['maintenance', 'versionedJsonResource', 'versionedJsonResourceRevision'],
};

export const NATIVE_CATEGORY_BY_KIND = Object.freeze(Object.fromEntries(
    Object.entries(families).flatMap(([category, names]) => names.map(name => [NATIVE_RESOURCE_KINDS[name], category])),
));

const settingsTypes = new Set([
    'core.prompt-module', 'core.prompt-program', 'core.generation-profile',
    'core.image-target', 'core.image-rendering', 'atri.extensions.official',
    'atri.extensions.settings', 'atri.extensions.plugin', 'atri.visual.budget',
]);
const visualTypes = new Set([
    'atri.visual.planner', 'atri.visual.prepared', 'atri.visual.job', 'atri.visual.commit',
    'atri.visual.scene', 'atri.visual.shot', 'atri.visual.state-change', 'atri.visual.director-scan',
    'atri.visual.draft', 'atri.visual.mask', 'atri.visual.gallery',
]);

/** Canonical UTF-8 JSON content bytes, excluding engine envelopes/indexes/logs. */
export function resourceContentBytes(value) {
    return Buffer.byteLength(serializeNativeDocument(value), 'utf8');
}

export function resourceFingerprint(value) {
    return createHash('sha256').update(serializeNativeDocument(value)).digest('hex');
}

/** Ownership must come from a stored business key; scope labels are not ownership. */
export function classifyNativeRecord(record) {
    const { key, doc } = record;
    const base = NATIVE_CATEGORY_BY_KIND[key.kind] ?? 'advanced';
    if (key.kind === NATIVE_RESOURCE_KINDS.maintenance) {
        if (doc?.protocol === STORAGE_CENTER_PROTOCOL) return doc.type === 'recovery' ? 'recovery' : 'cache';
        if (key.scope?.startsWith('session:')) return 'sessions';
        if (key.scope === 'blob-gc') return 'media';
        return 'advanced';
    }
    if ([NATIVE_RESOURCE_KINDS.versionedJsonResource, NATIVE_RESOURCE_KINDS.versionedJsonResourceRevision].includes(key.kind)) {
        const type = key.resourceType ?? doc?.resourceType;
        if (settingsTypes.has(type)) return 'settings';
        if (type === 'atri.visual.gc') return 'media';
        if (visualTypes.has(type)) return visualSessionOwner(record) ? 'sessions' : type === 'atri.visual.planner' ? 'cache' : 'advanced';
        return 'advanced';
    }
    return base;
}

export function nativeResourceIdentity(key) {
    return 'native:' + Buffer.from(serializeNativeDocument(key)).toString('base64url');
}

export function emptyResourceTotals() {
    return Object.fromEntries([...RESOURCE_CATEGORIES, 'advanced'].map(category => [category, { bytes: 0, count: 0 }]));
}

// These values are returned only after a domain adapter has checked the object.
// Enumeration alone never grants mutation rights or implies safe cache cleanup.
export function resourceCapabilities(reasons = {}) {
    return Object.fromEntries(['view', 'export', 'clean', 'trash', 'restore', 'purge'].map(action => [
        action, { allowed: reasons[action] === true, reason: reasons[action] === true ? null : reasons[action] || 'domain-check-required' },
    ]));
}
