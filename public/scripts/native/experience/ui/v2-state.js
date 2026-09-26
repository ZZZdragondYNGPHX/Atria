import { copy, fields, id, json, text } from './v2-values.js';

export function compileState(raw = {}, scopes = ['mount', 'session']) {
    fields(raw, Object.keys(raw), 'UI state');
    if (Object.keys(raw).length > 128) throw new Error('Too many UI fields');
    const result = {};
    for (const [key, definition] of Object.entries(raw)) {
        id(key);
        fields(definition, ['type', 'default', 'scope', 'required', 'min', 'max', 'minLength', 'maxLength', 'enum', 'step'], 'UI field');
        if (!['string', 'number', 'integer', 'boolean'].includes(definition.type)) throw new Error('Unknown UI field type');
        const scope = definition.scope ?? scopes[0];
        if (!scopes.includes(scope)) throw new Error('Unknown UI field scope');
        if (definition.required !== undefined && typeof definition.required !== 'boolean') throw new Error('Invalid required flag');
        for (const name of ['min', 'max', 'step', 'minLength', 'maxLength']) {
            if (definition[name] !== undefined && (typeof definition[name] !== 'number' || !Number.isFinite(definition[name]))) throw new Error('Invalid field bound');
        }
        if (definition.step !== undefined && definition.step <= 0) throw new Error('Invalid field step');
        for (const name of ['minLength', 'maxLength']) if (definition[name] !== undefined && (definition.type !== 'string' || !Number.isSafeInteger(definition[name]) || definition[name] < 0 || definition[name] > 65536)) throw new Error('Invalid string bound');
        for (const name of ['min', 'max', 'step']) if (definition[name] !== undefined && !['number', 'integer'].includes(definition.type)) throw new Error('Unexpected numeric bound');
        if (definition.min > definition.max || definition.minLength > definition.maxLength) throw new Error('Inverted field bounds');
        if (definition.enum !== undefined && (!Array.isArray(definition.enum) || definition.enum.length > 256)) throw new Error('Invalid field enum');
        const value = { ...json(definition), scope };
        assertFieldType(value, value.default);
        if (value.enum) {
            if (!value.enum.length || new Set(value.enum).size !== value.enum.length) throw new Error('Invalid field enum');
            value.enum.forEach(item => assertFieldType(value, item));
        }
        if (scopes.includes('player') && fieldErrors(value, value.default).length) throw new Error('Invalid preference default');
        result[key] = Object.freeze(value);
    }
    return Object.freeze(result);
}
function assertFieldType(definition, value) {
    if (definition.type === 'integer' ? !Number.isSafeInteger(value) : typeof value !== definition.type) throw new Error('UI field type mismatch');
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Non-finite UI value');
    if (typeof value === 'string') text(value, 65536);
}
export function fieldErrors(definition, value) {
    const errors = [];
    assertFieldType(definition, value);
    if (definition.required && (value === '' || value === false)) errors.push('required');
    if (typeof value === 'string' && (value.length < (definition.minLength ?? 0) || value.length > (definition.maxLength ?? 65536))) errors.push('length');
    if (typeof value === 'number') {
        if (value < (definition.min ?? -Infinity) || value > (definition.max ?? Infinity)) errors.push('range');
        if (definition.step && Math.abs((value - (definition.min ?? 0)) / definition.step - Math.round((value - (definition.min ?? 0)) / definition.step)) > 1e-8) errors.push('step');
    }
    if (definition.enum && !definition.enum.includes(value)) errors.push('enum');
    return errors;
}

// Host injects the existing settings authority. Components receive only declared
// values, never the backing settings object, a database handle or storage API.
export function createUiState(document, { read = () => undefined, write = () => {} } = {}) {
    const definitions = { ui: document.localState, prefs: document.preferences };
    const values = { ui: {}, prefs: {} };
    const listeners = new Set();
    for (const [root, entries] of Object.entries(definitions)) {
        for (const [key, definition] of Object.entries(entries)) {
            let value = definition.scope === 'mount' ? undefined : read(root, key, definition.scope);
            try { assertFieldType(definition, value); } catch { value = copy(definition.default); }
            if (root === 'prefs' && fieldErrors(definition, value).length) value = copy(definition.default);
            values[root][key] = value;
        }
    }
    function resolve(path) {
        const [root, key, extra] = String(path).split('.');
        if (extra !== undefined || !Object.hasOwn(definitions, root) || !Object.hasOwn(definitions[root], key)) throw new Error('Undeclared UI state path');
        return { root, key, definition: definitions[root][key] };
    }
    function set(path, value) {
        const { root, key, definition } = resolve(path);
        assertFieldType(definition, value);
        if (root === 'prefs' && fieldErrors(definition, value).length) throw new Error('Invalid preference value');
        if (Object.is(values[root][key], value)) return;
        if (definition.scope !== 'mount') write(root, key, definition.scope, copy(value));
        values[root][key] = copy(value);
        for (const listener of listeners) listener();
    }
    return Object.freeze({
        snapshot: () => copy(values),
        resolve,
        set,
        reset(path) { set(path, copy(resolve(path).definition.default)); },
        toggle(path) { const { root, key, definition } = resolve(path); if (definition.type !== 'boolean') throw new Error('Toggle requires boolean'); set(path, !values[root][key]); },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    });
}
