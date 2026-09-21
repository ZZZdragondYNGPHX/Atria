import { createWorldObservationProjector } from '../../game-runtime/llm/observation.js';
import { compileGameObservationDefinitions } from '../../game-runtime/llm/declarative-observations.js';
import { compileGameSelectorDefinitions } from '../../game-runtime/ui/declarative.js';
import { createSelectorRuntime } from '../../game-runtime/ui/selectors.js';

export const PROJECTION_EDITOR = Object.freeze({
    SELECTORS: 'selectors',
    OBSERVATIONS: 'observations',
});

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function compilerFor(kind) {
    if (kind === PROJECTION_EDITOR.SELECTORS) return compileGameSelectorDefinitions;
    if (kind === PROJECTION_EDITOR.OBSERVATIONS) return compileGameObservationDefinitions;
    throw new Error(`Unsupported projection editor '${kind}'`);
}

function labelFor(kind) {
    return kind === PROJECTION_EDITOR.SELECTORS ? 'Selector' : 'Observation';
}

function assertSourceArray(value, kind) {
    if (!Array.isArray(value)) {
        throw new Error(labelFor(kind) + ' source must be a JSON array');
    }
}

function buildModel(value, kind) {
    assertSourceArray(value, kind);
    compilerFor(kind)(value);
    return Object.freeze({
        editor: kind,
        entries: Object.freeze(value.map((entry, index) => Object.freeze({
            index,
            id: String(entry?.id || ''),
            formula: String(entry?.formula || ''),
        }))),
    });
}

export function parseProjectionDocument(kind, text) {
    let value;
    try {
        value = JSON.parse(String(text));
    } catch (error) {
        throw new Error(labelFor(kind) + ' source is not valid JSON: ' + (error?.message || String(error)));
    }
    assertSourceArray(value, kind);
    compilerFor(kind)(value);
    return {
        value,
        model: buildModel(value, kind),
    };
}

export function applyProjectionFieldPatch(value, kind, index, field, rawValue) {
    assertSourceArray(value, kind);
    if (!Number.isInteger(index) || index < 0 || index >= value.length) {
        throw new Error(labelFor(kind) + ' index is out of range');
    }
    if (!['id', 'formula'].includes(field)) {
        throw new Error(`Unsupported ${labelFor(kind)} editor field '${field}'`);
    }

    const next = clone(value);
    next[index][field] = String(rawValue || '').trim();
    compilerFor(kind)(next);
    return next;
}

function nextUniqueId(value, base) {
    const used = new Set(value.map(entry => String(entry?.id || '')));
    if (!used.has(base)) return base;
    for (let index = 2; index < 10000; index += 1) {
        const candidate = base + '_' + index;
        if (!used.has(candidate)) return candidate;
    }
    throw new Error('Could not allocate a unique projection id');
}

export function addProjectionEntry(value, kind) {
    assertSourceArray(value, kind);
    const next = clone(value);
    const base = kind === PROJECTION_EDITOR.SELECTORS ? 'new_selector' : 'new_observation';
    next.push({
        id: nextUniqueId(next, base),
        formula: kind === PROJECTION_EDITOR.SELECTORS
            ? 'world'
            : 'world',
    });
    compilerFor(kind)(next);
    return next;
}

export function removeProjectionEntry(value, kind, index) {
    assertSourceArray(value, kind);
    if (!Number.isInteger(index) || index < 0 || index >= value.length) {
        throw new Error(labelFor(kind) + ' index is out of range');
    }
    const next = clone(value);
    next.splice(index, 1);
    compilerFor(kind)(next);
    return next;
}

export function serializeProjectionDocument(value, kind) {
    assertSourceArray(value, kind);
    compilerFor(kind)(value);
    return JSON.stringify(value, null, 2) + '\n';
}

export function previewProjectionDocument(kind, value, world, options = {}) {
    assertSourceArray(value, kind);
    const safeWorld = world && typeof world === 'object' && !Array.isArray(world)
        ? clone(world)
        : {};

    if (kind === PROJECTION_EDITOR.SELECTORS) {
        const definitions = compileGameSelectorDefinitions(value);
        const runtime = createSelectorRuntime({
            getWorldState: () => safeWorld,
            definitions,
        });
        return Object.freeze({
            kind,
            values: Object.freeze(runtime.snapshot()),
        });
    }

    const projectors = compileGameObservationDefinitions(value);
    const projector = createWorldObservationProjector({
        projectors,
        eventLimit: 0,
    });
    return Object.freeze({
        kind,
        observation: projector.project({
            world: safeWorld,
            events: [],
            context: {
                purpose: 'studio_preview',
                role: String(options.role || 'narrator'),
            },
        }),
    });
}
