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
export function json(value, depth = 0, budget = { nodes: 0 }, copy = true) {
    if (depth > 24 || ++budget.nodes > 32768) throw new Error('Native JSON exceeds complexity limit');
    const admitted = value && typeof value === 'object' ? declarations.get(value) : undefined;
    if (admitted) {
        budget.nodes += admitted.nodes - 1;
        if (depth + admitted.height > 24 || budget.nodes > 32768) throw new Error('Native JSON exceeds complexity limit');
        return value;
    }
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string') return text(value, 65536);
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (Array.isArray(value)) {
        if (copy) return Object.freeze(value.map(child => json(child, depth + 1, budget)));
        for (let index = 0; index < value.length; index++) if (index in value) json(value[index], depth + 1, budget, false);
        return value;
    }
    if (!value || typeof value !== 'object') throw new Error('Expected JSON value');
    const out = {};
    for (const [key, child] of Object.entries(value)) {
        if (BLOCKED.has(key)) throw new Error('Blocked JSON key');
        const checked = json(child, depth + 1, budget, copy);
        if (copy) out[key] = checked;
    }
    return copy ? Object.freeze(out) : value;
}

// Only objects copied and deeply frozen here are reusable declarations. Merely
// freezing caller data does not bypass admission or a smaller byte budget.
const declarations = new WeakMap();
export function assertJsonDeclaration(value, label = 'Native', maxBytes = 1048576) {
    const admitted = value && typeof value === 'object' ? declarations.get(value) : undefined;
    if (admitted !== undefined) {
        if (admitted.bytes > maxBytes) throw new TypeError(label + ' declaration byte limit');
        return value;
    }
    const budget = { nodes: 0, height: 0 };
    function inspect(item, depth = 0) {
        if (depth > 24 || ++budget.nodes > 32768) throw new TypeError(label + ' JSON complexity limit');
        budget.height = Math.max(budget.height, depth);
        if (item === null || typeof item === 'boolean') return item;
        if (typeof item === 'string') return text(item, 65536);
        if (typeof item === 'number' && Number.isFinite(item)) return item;
        if (!item || typeof item !== 'object') throw new TypeError(label + ' requires JSON values');
        const known = declarations.get(item);
        if (known) {
            budget.nodes += known.nodes - 1;
            if (depth + known.height > 24 || budget.nodes > 32768) throw new TypeError(label + ' JSON complexity limit');
            budget.height = Math.max(budget.height, depth + known.height);
            return item;
        }
        const array = Array.isArray(item);
        const proto = Object.getPrototypeOf(item);
        if (!array && proto !== null && Object.getPrototypeOf(proto) !== null) throw new TypeError(label + ' requires plain JSON objects');
        const keys = Reflect.ownKeys(item).filter(key => !(array && key === 'length'));
        if (array && keys.length !== item.length) throw new TypeError(label + ' requires dense JSON arrays');
        const copy = array ? [] : {};
        for (const key of keys) {
            const descriptor = Object.getOwnPropertyDescriptor(item, key);
            if (typeof key !== 'string' || key.length > 256 || BLOCKED.has(key) || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')
                || (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= item.length))) throw new TypeError(label + ' requires JSON fields');
            copy[key] = inspect(descriptor.value, depth + 1);
        }
        return Object.freeze(copy);
    }
    const result = inspect(value);
    const bytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
    if (bytes > maxBytes) throw new TypeError(label + ' declaration byte limit');
    if (result && typeof result === 'object') declarations.set(result, { bytes, nodes: budget.nodes, height: budget.height });
    return result;
}
