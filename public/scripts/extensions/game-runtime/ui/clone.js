function cloneFallback(value, seen = new Map()) {
    if (
        value === null
        || value === undefined
        || typeof value === 'string'
        || typeof value === 'number'
        || typeof value === 'boolean'
        || typeof value === 'bigint'
    ) {
        return value;
    }

    if (typeof value === 'function' || typeof value === 'symbol') {
        throw new Error('Game UI value is not cloneable');
    }

    if (seen.has(value)) {
        throw new Error('Game UI value contains a circular reference');
    }
    seen.set(value, true);

    if (Array.isArray(value)) {
        const output = value.map(item => cloneFallback(item, seen));
        seen.delete(value);
        return output;
    }

    if (value instanceof Date) {
        const output = new Date(value.getTime());
        seen.delete(value);
        return output;
    }

    if (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) {
        const output = {};
        for (const [key, child] of Object.entries(value)) {
            output[key] = cloneFallback(child, seen);
        }
        seen.delete(value);
        return output;
    }

    throw new Error('Game UI value contains an unsupported object type');
}

export function cloneGameUiValue(value) {
    if (value === undefined) return undefined;
    if (typeof globalThis.structuredClone === 'function') {
        return globalThis.structuredClone(value);
    }
    return cloneFallback(value);
}
