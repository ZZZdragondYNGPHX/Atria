import { loadGamePackageJsonResource } from '../package-loader.js';
import { compileDeclarativeLogic } from './declarative.js';

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
    if (!entry.endsWith('.json')) {
        throw new Error(
            `Game Logic entry '${entry}' is not yet safe to execute. Package-loaded Game Logic currently requires a declarative .json entry until the restricted advanced-JavaScript runtime is implemented.`,
        );
    }

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
