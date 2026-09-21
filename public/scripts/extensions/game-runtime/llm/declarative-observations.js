import { compileFormula, evaluateFormulaAst } from '../logic/formula.js';
import { loadGamePackageJsonResource } from '../package-loader.js';

const OBSERVATION_ID_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const MAX_OBSERVATION_COUNT = 64;

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertKnownFields(source, allowed, label) {
    for (const key of Object.keys(source)) {
        if (!allowed.has(key)) {
            throw new Error(label + ` contains unknown field '${key}'`);
        }
    }
}

export function compileGameObservationDefinitions(raw) {
    if (!Array.isArray(raw)) {
        throw new Error('Game Observation resource must be an array');
    }
    if (raw.length > MAX_OBSERVATION_COUNT) {
        throw new Error('Game Observation resource exceeds 64 projectors');
    }

    const seen = new Set();
    return raw.map((entry, index) => {
        if (!isPlainObject(entry)) {
            throw new Error('Game Observation projector ' + index + ' must be an object');
        }
        assertKnownFields(entry, new Set(['id', 'formula']), 'Game Observation projector ' + index);

        const id = String(entry.id || '').trim();
        if (!OBSERVATION_ID_PATTERN.test(id)) {
            throw new Error('Game Observation projector id is invalid');
        }
        if (seen.has(id)) {
            throw new Error(`Duplicate Game Observation projector '${id}'`);
        }
        seen.add(id);

        if (typeof entry.formula !== 'string' || !entry.formula.trim()) {
            throw new Error(`Game Observation projector '${id}' requires formula`);
        }
        const ast = compileFormula(entry.formula);

        return Object.freeze({
            id,
            select(world, context) {
                return evaluateFormulaAst(ast, {
                    world,
                    args: context || {},
                    selectors: {},
                });
            },
        });
    });
}

export async function loadGameObservationDefinitions(packageState, options = {}) {
    const resource = packageState?.manifest?.llm?.observations;
    if (!resource) return [];

    const charId = String(packageState?.charId || '').trim();
    if (!charId) {
        throw new Error('Game Observation resource cannot load without a character package id');
    }

    const raw = await loadGamePackageJsonResource(charId, resource, {
        fetchImpl: options.fetchImpl,
        headers: options.headers || {},
    });
    return compileGameObservationDefinitions(raw);
}
