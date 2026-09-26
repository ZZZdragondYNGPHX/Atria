import { compileFormula, evaluateFormulaAst } from '../logic/formula.js';
import { cloneGameUiValue } from './clone.js';

export const UI_ROOTS = Object.freeze(['world', 'ui', 'prefs', 'data', 'selectors', 'env', 'item', 'index', 'event', 'form']);
const BLOCKED = new Set(['__proto__', 'prototype', 'constructor']);
export const copy = cloneGameUiValue;
export function fields(value, allowed, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(label + ' must be an object');
    for (const key of Object.keys(value)) if (!allowed.includes(key) || BLOCKED.has(key)) throw new Error(label + ': unknown field ' + key);
}
export function id(value) {
    if (typeof value !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(value) || BLOCKED.has(value)) throw new Error('Invalid UI identifier');
    return value;
}
export function text(value, limit = 8192) {
    if (typeof value !== 'string' || value.length > limit) throw new Error('Expected bounded text');
    return value;
}
export function json(value, depth = 0, budget = { nodes: 0 }) {
    if (depth > 24 || ++budget.nodes > 32768) throw new Error('UI JSON exceeds complexity limit');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string') return text(value, 65536);
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (Array.isArray(value)) return Object.freeze(value.map(child => json(child, depth + 1, budget)));
    if (!value || typeof value !== 'object') throw new Error('Expected JSON value');
    const out = {};
    for (const [key, child] of Object.entries(value)) {
        if (BLOCKED.has(key)) throw new Error('Blocked JSON key');
        out[key] = json(child, depth + 1, budget);
    }
    return Object.freeze(out);
}
const functions = Object.freeze({
    length: value => typeof value === 'string' || Array.isArray(value) ? value.length : 0,
    contains: (value, item) => typeof value === 'string' || Array.isArray(value) ? value.includes(item) : false,
    coalesce: (value, fallback) => value ?? fallback,
    concat: (...values) => text(values.map(value => String(value ?? '')).join('')),
});
const calls = new Set(['min', 'max', 'clamp', 'round', 'floor', 'ceil', 'abs', ...Object.keys(functions)]);
export function expression(source) {
    text(source, 2048);
    // Bound parser nesting before recursion, including unary chains.
    if ((source.match(/[(!+-]/g) || []).length > 64) throw new Error('UI expression exceeds complexity limit');
    const ast = compileFormula(source, { strings: true, roots: UI_ROOTS });
    const roots = new Set();
    function inspect(node) {
        if (node.type === 'call' && !calls.has(node.callee)) throw new Error('Unknown UI expression function');
        if (node.type === 'reference') roots.add(node.path[0]);
        for (const child of Object.values(node)) {
            if (Array.isArray(child)) child.filter(item => item && typeof item === 'object').forEach(inspect);
            else if (child && typeof child === 'object') inspect(child);
        }
    }
    inspect(ast);
    return Object.freeze({ roots: Object.freeze([...roots]), read: context => evaluateFormulaAst(ast, context, { functions }) });
}
export function valueTemplate(raw, depth = 0) {
    if (depth > 16) throw new Error('UI value nesting exceeded');
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && Object.hasOwn(raw, 'expr')) {
        fields(raw, ['expr'], 'Expression');
        return expression(raw.expr);
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && Object.hasOwn(raw, 'template')) {
        fields(raw, ['template'], 'Template');
        const source = text(raw.template);
        const parts = []; let offset = 0;
        for (const match of source.matchAll(/\{\{([^{}]+)\}\}/g)) {
            parts.push(source.slice(offset, match.index), expression(match[1])); offset = match.index + match[0].length;
        }
        parts.push(source.slice(offset));
        if (parts.some(part => typeof part === 'string' && /\{\{|\}\}/.test(part))) throw new Error('Invalid UI template');
        return { read: context => text(parts.map(part => typeof part === 'string' ? part : String(part.read(context) ?? '')).join('')) };
    }
    if (Array.isArray(raw)) {
        const items = raw.map(item => valueTemplate(item, depth + 1));
        return { read: context => items.map(item => item.read(context)) };
    }
    if (raw && typeof raw === 'object') {
        json(raw);
        const entries = Object.entries(raw).map(([key, child]) => [key, valueTemplate(child, depth + 1)]);
        return { read: context => Object.fromEntries(entries.map(([key, child]) => [key, child.read(context)])) };
    }
    const literal = json(raw);
    return { read: () => literal };
}
