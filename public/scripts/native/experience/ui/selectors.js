import { cloneGameUiValue } from './clone.js';

const SELECTOR_ID_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;

function clone(value) {
    return cloneGameUiValue(value);
}

function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.freeze(value);
    for (const child of Object.values(value)) {
        deepFreeze(child, seen);
    }
    return value;
}

function sameValue(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeDefinitions(definitions) {
    if (!Array.isArray(definitions)) {
        throw new Error('Selector Runtime definitions must be an array');
    }

    const seen = new Set();
    return definitions.map((raw, index) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            throw new Error('Selector definition ' + index + ' must be an object');
        }
        const id = String(raw.id || '').trim();
        if (!SELECTOR_ID_PATTERN.test(id)) {
            throw new Error('Selector id must match /^[a-z][a-z0-9._-]{0,63}$/');
        }
        if (seen.has(id)) {
            throw new Error(`Duplicate selector id '${id}'`);
        }
        seen.add(id);
        if (typeof raw.select !== 'function') {
            throw new Error(`Selector '${id}' requires select()`);
        }
        return Object.freeze({ id, select: raw.select });
    });
}

export function createSelectorRuntime(options = {}) {
    if (typeof options.getWorldState !== 'function') {
        throw new Error('Selector Runtime requires getWorldState()');
    }

    const definitions = normalizeDefinitions(options.definitions || []);
    const values = new Map();
    const listeners = new Map();

    function evaluate(definition, worldState) {
        const value = definition.select(deepFreeze(clone(worldState)));
        return clone(value);
    }

    function refresh() {
        const worldState = options.getWorldState();
        const changed = [];

        for (const definition of definitions) {
            const next = evaluate(definition, worldState);
            const previous = values.get(definition.id);
            if (values.has(definition.id) && sameValue(previous, next)) continue;

            values.set(definition.id, clone(next));
            changed.push(definition.id);
            for (const listener of listeners.get(definition.id) || []) {
                listener(clone(next), clone(previous));
            }
        }

        return changed;
    }

    function get(selectorId) {
        const id = String(selectorId || '').trim();
        const definition = definitions.find(item => item.id === id);
        if (!definition) {
            throw new Error(`Unknown selector '${id}'`);
        }
        if (!values.has(id)) {
            const worldState = options.getWorldState();
            values.set(id, evaluate(definition, worldState));
        }
        return clone(values.get(id));
    }

    function subscribe(selectorId, listener) {
        const id = String(selectorId || '').trim();
        if (!definitions.some(item => item.id === id)) {
            throw new Error(`Unknown selector '${id}'`);
        }
        if (typeof listener !== 'function') {
            throw new Error('Selector listener must be a function');
        }
        if (!listeners.has(id)) listeners.set(id, new Set());
        listeners.get(id).add(listener);
        return () => listeners.get(id)?.delete(listener);
    }

    return Object.freeze({
        get,
        refresh,
        subscribe,
        list() {
            return definitions.map(definition => definition.id);
        },
        snapshot() {
            const output = {};
            for (const definition of definitions) {
                output[definition.id] = get(definition.id);
            }
            return output;
        },
    });
}
