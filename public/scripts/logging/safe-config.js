import { redactValue } from './redact.js';

const SAFE_KEYS = Object.freeze([
    'appVersion', 'revision', 'branch', 'model', 'provider', 'orchestrationProfile',
    'featureToggles', 'storageBackend', 'extensions', 'network', 'runtime',
]);

function pickExtension(extension) {
    if (!extension || typeof extension !== 'object') return null;
    return {
        name: extension.name,
        displayName: extension.displayName,
        type: extension.type,
        version: extension.version,
        commit: extension.commit ?? extension.revision,
        origin: extension.origin ?? extension.repository,
        loadingOrder: extension.loadingOrder ?? extension.loading_order,
        enabled: extension.enabled,
        minimumVersion: extension.minimumVersion ?? extension.minimum_version,
        dependencies: extension.dependencies,
        operationId: extension.operationId ?? extension.operation_id,
    };
}

export function createSafeConfigSnapshot(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const snapshot = {};
    for (const key of SAFE_KEYS) {
        if (!Object.hasOwn(source, key)) continue;
        snapshot[key] = key === 'extensions' && Array.isArray(source.extensions)
            ? source.extensions.map(pickExtension).filter(Boolean)
            : source[key];
    }
    return redactValue(snapshot, { maxDepth: 6, maxArrayLength: 100, maxObjectKeys: 100, maxStringLength: 2000 });
}
