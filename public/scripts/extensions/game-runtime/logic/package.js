import { resolveGamePackageAssetUrl } from '../manifest.js';
import { loadGamePackageJsonResource } from '../package-loader.js';
import { compileDeclarativeLogic } from './declarative.js';

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRuntimeDefinitions(raw, label) {
    const source = isPlainObject(raw?.default) ? raw.default : raw;
    if (!isPlainObject(source)) {
        throw new Error(label + ' must export an object');
    }

    const allowed = new Set(['commands', 'reducers', 'rules']);
    for (const key of Object.keys(source)) {
        if (!allowed.has(key)) {
            throw new Error(label + ` contains unsupported export '${key}'`);
        }
    }

    for (const key of allowed) {
        if (source[key] !== undefined && !Array.isArray(source[key])) {
            throw new Error(label + '.' + key + ' must be an array');
        }
    }

    return {
        commands: [...(source.commands || [])],
        reducers: [...(source.reducers || [])],
        rules: [...(source.rules || [])],
    };
}

export async function loadGameLogicDefinition(packageState, options = {}) {
    const manifest = packageState?.manifest;
    const logic = manifest?.logic;
    if (!logic) {
        return {
            commands: [],
            reducers: [],
            rules: [],
            source: null,
        };
    }

    const charId = String(packageState?.charId || '').trim();
    if (!charId) {
        throw new Error('Game Logic cannot load without a character package id');
    }

    const entry = String(logic.entry || '').trim();
    if (entry.endsWith('.json')) {
        const raw = await loadGamePackageJsonResource(charId, entry, {
            fetchImpl: options.fetchImpl,
            headers: options.headers || {},
        });
        const compiled = compileDeclarativeLogic(raw);
        return {
            commands: [...compiled.commands],
            reducers: [...compiled.reducers],
            rules: [...compiled.rules],
            source: {
                kind: 'declarative',
                entry,
            },
        };
    }

    if (entry.endsWith('.js') || entry.endsWith('.mjs')) {
        const importModule = options.importModule || (url => import(url));
        if (typeof importModule !== 'function') {
            throw new Error('Game Logic module loader is unavailable');
        }
        const url = resolveGamePackageAssetUrl(charId, entry);
        const module = await importModule(url);
        const normalized = normalizeRuntimeDefinitions(module, 'Game Logic module');
        return {
            ...normalized,
            source: {
                kind: 'module',
                entry,
            },
        };
    }

    throw new Error(
        `Game Logic entry '${entry}' must be a .json declarative file or .js/.mjs module`,
    );
}

export function snapshotGameLogicDefinition(definition) {
    return {
        commands: clone(definition?.commands || []),
        reducers: clone(definition?.reducers || []),
        rules: clone(definition?.rules || []),
        source: clone(definition?.source || null),
    };
}
