import { assertNoSecretMaterial } from './contracts.js';
import { immutable } from './execution-utils.js';

export function promptError(code) {
    const error = new TypeError('prompt_' + code);
    error.code = 'prompt_' + code;
    throw error;
}

export function typedValue(value, type) {
    if (!['string', 'number', 'boolean', 'json'].includes(type)
        || (type !== 'json' && typeof value !== type)
        || (type === 'number' && !Number.isFinite(value)) || value === undefined) promptError('parameter_type');
    assertNoSecretMaterial(value, 'Prompt value');
    // All inputs cross a JSON-only boundary; reject functions, undefined, cycles and non-JSON objects.
    const seen = new Set();
    const visit = (item, depth = 0) => {
        if (depth > 64 || seen.has(item)) promptError('value_limit');
        if (item === null || ['string', 'boolean'].includes(typeof item)) return;
        if (typeof item === 'number' && Number.isFinite(item)) return;
        if (typeof item !== 'object' || (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype)) promptError('parameter_type');
        seen.add(item);
        Object.values(item).forEach(child => visit(child, depth + 1));
        seen.delete(item);
    };
    visit(value);
    return immutable(value);
}

export function bindValues(definitions = {}, values = {}) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) promptError('parameters_invalid');
    assertNoSecretMaterial(values, 'Prompt parameters');
    if (Object.keys(values).some(key => !Object.hasOwn(definitions, key))) promptError('parameter_unknown');
    const result = Object.create(null);
    for (const [name, definition] of Object.entries(definitions)) {
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name) || ['constructor', 'prototype', '__proto__'].includes(name)) promptError('variable_name');
        const value = Object.hasOwn(values, name) ? values[name] : definition.default;
        if (value === undefined) {
            if (definition.required) promptError('parameter_required');
        } else {
            result[name] = typedValue(value, definition.type);
            if (definition.options && !definition.options.some(option => option.value === value)) promptError('parameter_option');
        }
    }
    return result;
}

export function readVariable(path, environment, declarations) {
    const parts = String(path).split('.');
    const [scope, name] = parts;
    if (parts.length < 2 || parts.some(part => !/^[A-Za-z0-9_]+$/.test(part)
        || ['__proto__', 'prototype', 'constructor'].includes(part))
        || !Object.hasOwn(declarations, scope) || !Object.hasOwn(declarations[scope], name)) promptError('variable_scope');
    let value = environment[scope];
    for (const part of parts.slice(1)) {
        if (value === null || typeof value !== 'object' || !Object.hasOwn(value, part)) return undefined;
        value = value[part];
    }
    return value;
}

function same(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a).sort();
    return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && same(a[key], b[key]));
}

export function evaluateCondition(condition, read, depth = 0) {
    if (!condition) return true;
    if (depth > 16) promptError('condition_limit');
    // Evaluate all branches so an invalid scope cannot hide behind short-circuiting.
    if (condition.all) return condition.all.map(item => evaluateCondition(item, read, depth + 1)).every(Boolean);
    if (condition.any) return condition.any.map(item => evaluateCondition(item, read, depth + 1)).some(Boolean);
    if (condition.not) return !evaluateCondition(condition.not, read, depth + 1);
    const actual = read(condition.path);
    const expected = condition.value;
    switch (condition.op) {
        case 'exists': return actual !== undefined;
        case 'eq': return same(actual, expected);
        case 'neq': return !same(actual, expected);
        case 'gt': case 'gte': case 'lt': case 'lte':
            if (typeof actual !== 'number' || typeof expected !== 'number') promptError('condition_type');
            return { gt: actual > expected, gte: actual >= expected, lt: actual < expected, lte: actual <= expected }[condition.op];
        case 'in':
            if (!Array.isArray(expected) || expected.length > 256) promptError('condition_limit');
            return expected.some(item => same(actual, item));
        case 'contains':
            if ((typeof actual !== 'string' && !Array.isArray(actual)) || actual.length > 4096) promptError('condition_limit');
            if (typeof actual === 'string') {
                if (typeof expected !== 'string') promptError('condition_type');
                return actual.includes(expected);
            }
            return actual.some(item => same(item, expected));
        default: return promptError('condition_invalid');
    }
}

export function interpolate(body, read) {
    if (typeof body !== 'string') promptError('body_invalid');
    const result = body.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, path) => {
        const value = read(path.trim());
        if (value === undefined) promptError('variable_missing');
        return typeof value === 'string' ? value : JSON.stringify(value);
    });
    if (result.length > 1024 * 1024) promptError('body_limit');
    return result;
}
