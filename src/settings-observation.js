// Scoped observation of SettingsRepo; never seed, migrate or persist on read.
const forbidden = /secret|credential|password|passwd|token|cookie|authorization|api[_-]?key|private[_-]?key|connection|runtimeRoute|modelProfile/i;
const unsafe = key => forbidden.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key);
function filter(value) {
    if (Array.isArray(value)) return value.map(filter);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !unsafe(key)).map(([key, item]) => [key, filter(item)]));
    return typeof value === 'string' ? value.replace(/Bearer\s+\S+|\bsk-[\w-]{12,}/gi, '[REDACTED]').replace(/((?:password|token|secret|api[_-]?key)\s*[:=]\s*)\S+/gi, '$1[REDACTED]') : value;
}
export function observeSettings(document, { operation = 'catalog', path = '', query = '', offset = 0, limit = 30 } = {}) {
    if (!['catalog', 'get', 'search'].includes(operation) || typeof path !== 'string' || path.length > 500 || typeof query !== 'string' || query.length > 200
        || !Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new TypeError('Invalid settings observation');
    const parts = path ? path.split('/') : [];
    if (parts.some(key => !key || unsafe(key))) throw new TypeError('Unavailable settings scope');
    let value = filter(document ?? {});
    for (const key of parts) value = value && Object.hasOwn(value, key) ? value[key] : undefined;
    if (operation === 'get') {
        if (!parts.length) throw new TypeError('Settings get requires a non-root scope');
        return { path, found: value !== undefined, value: value ?? null };
    }
    const rows = [];
    const walk = (item, prefix, depth) => {
        if (depth > 12 || rows.length >= 10000 || !item || typeof item !== 'object') return;
        for (const [key, child] of Object.entries(item)) {
            const childPath = prefix ? prefix + '/' + key : key;
            if (!query || childPath.toLowerCase().includes(query.toLowerCase())) rows.push({ path: childPath, type: Array.isArray(child) ? 'array' : typeof child });
            if (operation === 'search') walk(child, childPath, depth + 1);
            if (rows.length >= 10000) break;
        }
    };
    walk(value, path, 0);
    return { path, entries: rows.slice(offset, offset + limit), total: rows.length, nextOffset: offset + limit < rows.length ? offset + limit : null, capped: rows.length >= 10000 };
}
