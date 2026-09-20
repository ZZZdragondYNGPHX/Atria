import { loadGamePackageJsonResource } from '../package-loader.js';
import { assertValidWorldState } from './schema.js';

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function loadGameWorldDefinition(packageState, options = {}) {
    const manifest = packageState?.manifest;
    const world = manifest?.world;
    if (!world) {
        return null;
    }

    const charId = String(packageState?.charId || '').trim();
    if (!charId) {
        throw new Error('Game World cannot load without a character package id');
    }

    const shared = {
        fetchImpl: options.fetchImpl,
        headers: options.headers || {},
    };
    const [schema, initialState] = await Promise.all([
        loadGamePackageJsonResource(charId, world.schema, shared),
        loadGamePackageJsonResource(charId, world.initial, shared),
    ]);

    if (!isPlainObject(schema)) {
        throw new Error('World schema must be a JSON object');
    }
    if (!isPlainObject(initialState)) {
        throw new Error('World initial state must be a JSON object');
    }

    assertValidWorldState(initialState, schema);

    return {
        schema: structuredClone(schema),
        initialState: structuredClone(initialState),
        schemaPath: world.schema,
        initialPath: world.initial,
    };
}
