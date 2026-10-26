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
    const { maxNodes = 32768, maxDepth = 24, maxString = 65536 } = budget;
    if (depth > maxDepth || ++budget.nodes > maxNodes) throw new Error('Native JSON exceeds complexity limit');
    const admitted = value && typeof value === 'object' ? declarations.get(value) : undefined;
    if (admitted) {
        budget.nodes += admitted.nodes - 1;
        if (depth + admitted.height > maxDepth || budget.nodes > maxNodes || admitted.maxString > maxString) throw new Error('Native JSON exceeds complexity limit');
        return value;
    }
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string') return text(value, maxString);
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

// Only owned objects admitted and deeply frozen here are reusable declarations. Merely
// freezing caller data does not bypass admission or a smaller byte budget.
const declarations = new WeakMap();
const encoder = new TextEncoder();
// Count the exact JSON UTF-8 representation without allocating encoded copies.
function stringBytes(value) {
    let bytes = 2;
    for (let index = 0; index < value.length; index++) {
        const code = value.charCodeAt(index);
        if (code === 34 || code === 92) bytes += 2;
        else if (code < 32) bytes += code === 8 || code === 9 || code === 10 || code === 12 || code === 13 ? 2 : 6;
        else if (code < 128) bytes++;
        else if (code < 2048) bytes += 2;
        else if (code >= 0xd800 && code <= 0xdfff) {
            const next = value.charCodeAt(index + 1);
            if (code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) { bytes += 4; index++; } else bytes += 6;
        } else bytes += 3;
    }
    return bytes;
}
const keyBytes = new Map();
function fieldBytes(key) {
    let bytes = keyBytes.get(key);
    if (bytes === undefined) {
        bytes = stringBytes(key);
        if (keyBytes.size >= 1024) keyBytes.clear();
        keyBytes.set(key, bytes);
    }
    return bytes;
}
const scalarBytes = value => typeof value === 'string' ? stringBytes(value) : String(value === 0 ? 0 : value).length;
export function jsonDeclarationBytes(value) {
    return declarations.get(value)?.bytes ?? encoder.encode(JSON.stringify(value)).byteLength;
}
export function assertJsonDeclaration(value, label = 'Native', maxBytes = 1048576, limits = {}) {
    return admitDeclaration(value, label, maxBytes, limits, false);
}
// JSON.parse owns a plain, dense data tree already: validate/freeze it in place
// instead of copying the sandbox response a second time on the host.
export function parseJsonDeclaration(source, label = 'Native', maxBytes = 1048576, limits = {}) {
    return admitDeclaration(JSON.parse(source), label, maxBytes, limits, true);
}
function admitDeclaration(value, label, maxBytes, { maxNodes = 32768, maxDepth = 24, maxString = 65536 }, owned) {
    const admitted = value && typeof value === 'object' ? declarations.get(value) : undefined;
    if (admitted !== undefined) {
        if (admitted.nodes > maxNodes || admitted.height > maxDepth || admitted.maxString > maxString) throw new TypeError(label + ' JSON complexity limit');
        if (admitted.bytes > maxBytes) throw new TypeError(label + ' declaration byte limit');
        return value;
    }
    let nodes = 0;
    function inspect(item, depth = 0) {
        if (depth > maxDepth || ++nodes > maxNodes) throw new TypeError(label + ' JSON complexity limit');
        if (item === null || typeof item === 'boolean') return item;
        if (typeof item === 'string') return text(item, maxString);
        if (typeof item === 'number' && Number.isFinite(item)) return item;
        if (!item || typeof item !== 'object') throw new TypeError(label + ' requires JSON values');
        const known = declarations.get(item);
        if (known) {
            nodes += known.nodes - 1;
            if (depth + known.height > maxDepth || nodes > maxNodes || known.maxString > maxString) throw new TypeError(label + ' JSON complexity limit');
            return item;
        }
        const array = Array.isArray(item);
        if (!owned) {
            const proto = Object.getPrototypeOf(item);
            if (!array && proto !== null && Object.getPrototypeOf(proto) !== null) throw new TypeError(label + ' requires plain JSON objects');
        }
        const keys = owned ? Object.keys(item) : Reflect.ownKeys(item).filter(key => !(array && key === 'length'));
        if (array && keys.length !== item.length) throw new TypeError(label + ' requires dense JSON arrays');
        const copy = owned ? item : array ? [] : {};
        const start = nodes;
        let bytes = 2 + Math.max(0, keys.length - 1), height = 0, longest = 0;
        for (const key of keys) {
            const descriptor = owned ? null : Object.getOwnPropertyDescriptor(item, key);
            if (typeof key !== 'string' || key.length > 256 || BLOCKED.has(key) || (!owned && (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')))
                || (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= item.length))) throw new TypeError(label + ' requires JSON fields');
            const child = inspect(owned ? item[key] : descriptor.value, depth + 1);
            if (!owned) copy[key] = child;
            const metadata = child !== null && typeof child === 'object' ? declarations.get(child) : undefined;
            bytes += (array ? 0 : fieldBytes(key) + 1) + (metadata ? metadata.bytes : scalarBytes(child));
            height = Math.max(height, 1 + (metadata?.height ?? 0));
            longest = Math.max(longest, metadata?.maxString ?? (typeof child === 'string' ? child.length : 0));
        }
        Object.freeze(copy);
        declarations.set(copy, { bytes, nodes: nodes - start + 1, height, maxString: longest });
        return copy;
    }
    const result = inspect(value);
    const bytes = result !== null && typeof result === 'object' ? declarations.get(result).bytes : scalarBytes(result);
    if (bytes > maxBytes) throw new TypeError(label + ' declaration byte limit');
    return result;
}
