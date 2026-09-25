import { loadGamePackageJsonResource } from '../package-loader.js';
import { compileDeclarativeLogic } from './declarative.js';

export async function loadGameLogicDefinition(packageState, options = {}) {
    const entry = String(packageState?.runtime?.game?.logic || '').trim();
    if (!entry) {
        return {
            commands: [],
            reducers: [],
            rules: [],
            interpretations: [],
            source: null,
        };
    }

    if (!entry.endsWith('.json')) {
        throw new Error(
            `Game Logic entry '${entry}' is not yet safe to execute. Package-loaded Game Logic currently requires a declarative .json entry until the restricted advanced-JavaScript runtime is implemented.`,
        );
    }

    const raw = await loadGamePackageJsonResource(packageState, entry, {
        fetchImpl: options.fetchImpl,
        headers: options.headers || {},
    });
    const compiled = compileDeclarativeLogic(raw);

    return {
        commands: [...compiled.commands],
        reducers: [...compiled.reducers],
        rules: [...compiled.rules],
        interpretations: [...compiled.interpretations],
        source: {
            kind: 'declarative',
            entry,
        },
    };
}
