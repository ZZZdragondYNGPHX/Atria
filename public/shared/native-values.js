// Bounded data-only validation shared by Native authority contracts.
const BLOCKED = new Set(['__proto__', 'prototype', 'constructor']);
export function fields(value, allowed, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(label + ' must be an object');
    for (const key of Object.keys(value)) if (!allowed.includes(key) || BLOCKED.has(key)) throw new Error(label + ': unknown field ' + key);
}
export function text(value, limit = 8192) {
    if (typeof value !== 'string' || value.length > limit) throw new Error('Expected bounded text');
    return value;
}
export function json(value, depth = 0, budget = { nodes: 0 }) {
    if (depth > 24 || ++budget.nodes > 32768) throw new Error('Native JSON exceeds complexity limit');
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

// json supplies the existing depth/node/string budgets and immutable copying.
// Reject non-JSON objects/hidden fields before it can erase their provenance.
export function assertJsonDeclaration(value, label = 'Native', maxBytes = 1048576) {
    function inspect(item, depth = 0, budget = { nodes: 0 }) {
        if (depth > 24 || ++budget.nodes > 32768) throw new TypeError(label + ' JSON complexity limit');
        if (!item || typeof item !== 'object') return;
        const array = Array.isArray(item);
        const proto = Object.getPrototypeOf(item);
        if (!array && proto !== null && Object.getPrototypeOf(proto) !== null) throw new TypeError(label + ' requires plain JSON objects');
        const keys = Reflect.ownKeys(item).filter(key => !(array && key === 'length'));
        if (array && keys.length !== item.length) throw new TypeError(label + ' requires dense JSON arrays');
        for (const key of keys) {
            const descriptor = Object.getOwnPropertyDescriptor(item, key);
            if (typeof key !== 'string' || key.length > 256 || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')
                || (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= item.length))) throw new TypeError(label + ' requires JSON fields');
            inspect(descriptor.value, depth + 1, budget);
        }
    }
    inspect(value);
    const result = json(value);
    if (new TextEncoder().encode(JSON.stringify(result)).byteLength > maxBytes) throw new TypeError(label + ' declaration byte limit');
    return result;
}
