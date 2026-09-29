import { ASSET_TYPES } from './native-frontend-media.js';
// Native Frontend v3: data-only contracts shared by compiler and consumers.
export const FRONTEND_VERSION = 3;
export const BRIDGE_VERSION = 1;
export const FRONTEND_LIMITS = Object.freeze({ bytes: 2 * 1024 * 1024, totalBytes: 32 * 1024 * 1024, resources: 256, nodes: 4096, depth: 64 });

export function fields(value, allowed, label = 'Frontend') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(label + ' must be an object');
    for (const key of Object.keys(value)) {
        if (!allowed.includes(key)) throw new TypeError(label + ' unsupported field: ' + key);
    }
    return value;
}

export function identifier(value) {
    if (typeof value !== 'string' || !/^[a-zA-Z][a-zA-Z0-9._-]{0,63}$/.test(value)
        || ['constructor', 'prototype', '__proto__'].includes(value)) throw new TypeError('Invalid Frontend semantic identifier');
    return value;
}

export function resourcePath(value) {
    if (typeof value !== 'string' || value.length > 512 || !/^[a-zA-Z0-9_./-]+$/.test(value)
        || value.split('/').some(part => !part || part === '.' || part === '..')) throw new TypeError('Invalid Frontend resource path');
    return value;
}

export function list(value, normalize, key = item => item.id) {
    if (!Array.isArray(value) || value.length > FRONTEND_LIMITS.resources) throw new TypeError('Frontend list exceeds limits');
    const result = value.map(normalize);
    if (new Set(result.map(key)).size !== result.length) throw new TypeError('Duplicate Frontend identity');
    return result;
}

export function assertFeatures(value = []) {
    return list(value, item => {
        fields(item, ['id', 'version', 'required']);
        identifier(item.id);
        if (!Number.isSafeInteger(item.version) || item.version < 1 || typeof item.required !== 'boolean') throw new TypeError('Invalid Frontend feature');
        return { ...item };
    });
}

// No optional extension runtime is implemented in Phase 1. Negotiation must
// not confuse accepting a versioned declaration with providing that feature.
export function frontendFeatureAvailability(features) {
    return assertFeatures(features).map(feature => {
        if (feature.id === 'remote-media' && feature.version === 1) return { ...feature, status: 'available', reasonCode: 'frontend_feature_available' };
        if (feature.required) throw new TypeError('Unsupported required Frontend feature: ' + feature.id + '@' + feature.version);
        return { ...feature, status: 'unsupported', reasonCode: 'frontend_feature_not_implemented' };
    });
}

export function assertFrontendExperience(value, { authoring = false } = {}) {
    fields(value, ['mode', 'frontend', 'features'], 'Frontend Experience');
    if (!['text', 'component', 'hybrid', 'full'].includes(value.mode)) throw new TypeError('Invalid Experience mode');
    if (value.mode === 'text') {
        if (value.frontend !== undefined || value.features !== undefined) throw new TypeError('Text Experience cannot own Frontend');
        return { mode: 'text' };
    }
    const field = authoring ? 'source' : 'entry';
    fields(value.frontend, ['kind', 'version', field], 'Frontend reference');
    if (value.frontend.kind !== 'native' || value.frontend.version !== 3) throw new TypeError('Frontend must be native@3');
    const path = resourcePath(value.frontend[field]);
    if (!path.endsWith('.json') || (!authoring && !/^runtime\/frontend\/(?:.+\/)?index\.json$/.test(path))) throw new TypeError('Invalid Frontend index path');
    return { mode: value.mode, frontend: { kind: 'native', version: 3, [field]: path }, features: assertFeatures(value.features) };
}

export function assertFrontendSourceIndex(value) {
    fields(value, ['format', 'version', 'primaryView', 'views', 'components', 'styles', 'assets', 'bridge', 'media', 'localization']);
    if (value.format !== 'atria-frontend-source' || value.version !== 3) throw new TypeError('Invalid Frontend Source Index');
    const components = list(value.components, item => {
        fields(item, ['id', 'source']); identifier(item.id); resourcePath(item.source);
        if (!item.source.endsWith('.aui')) throw new TypeError('Component source must be .aui');
        return { ...item };
    });
    const views = list(value.views, item => {
        fields(item, ['id', 'root', 'surface']); identifier(item.id); identifier(item.root);
        if (!components.some(component => component.id === item.root)) throw new TypeError('Unknown View root Component');
        if (!['app.root', 'chat.header', 'chat.footer', 'composer.before', 'composer.after', 'sidebar.left', 'sidebar.right', 'drawer', 'modal'].includes(item.surface)) throw new TypeError('Unknown View surface');
        return { ...item };
    });
    if (!views.some(view => view.id === value.primaryView)) throw new TypeError('Unknown Primary View');
    const resources = (items, style) => list(items ?? [], item => {
        fields(item, style ? ['id', 'source'] : ['id', 'source', 'mediaType']);
        identifier(item.id); resourcePath(item.source);
        if (style ? !item.source.endsWith('.css') : !ASSET_TYPES.includes(item.mediaType)) throw new TypeError('Unsupported Frontend resource type');
        return { ...item };
    });
    for (const key of ['bridge', 'media', 'localization']) if (value[key] !== undefined) resourcePath(value[key]);
    return { ...value, views, components, styles: resources(value.styles, true), assets: resources(value.assets, false) };
}
