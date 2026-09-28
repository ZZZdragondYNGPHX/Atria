const SENSITIVE_KEY = /^(?:authorization|cookie|set-cookie|password|passwd|token|csrfToken|accessToken|refreshToken|api[_-]?key|secret|secretValue|credentials)$/i;

export function redact(value) {
    if (Array.isArray(value)) return value.map(redact);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
        .map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? '[REDACTED]' : redact(item)]));
    return value;
}

export function safeUrl(value, base) {
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')
        || /[\\\u0000-\u0020]/.test(value)) throw new Error('Use a root-relative path on the configured Atria origin.');
    const url = new URL(value, base);
    if (url.origin !== new URL(base).origin || url.username || url.password) throw new Error('Cross-origin navigation is blocked.');
    return url;
}

export function requireWrite(config, confirmed) {
    if (!config.allowWrites) throw new Error('Write/interaction tools are disabled. Restart with --allow-writes only for a trusted development instance.');
    if (confirmed !== true) throw new Error('This operation requires confirm=true after the user approves the intended change.');
}

export function apiUrl(config, path, query = {}) {
    if (/[?#]/.test(path) || !path.startsWith('/api/native/') || /%|(?:^|\/)\.{1,2}(?:\/|$)/.test(path)) {
        throw new Error('API path must be an unencoded Native path; pass query parameters separately.');
    }
    const url = safeUrl(path, config.url);
    if (/(?:^|\/)(?:secrets?|credentials)(?:\/|$)/i.test(url.pathname)) throw new Error('Secret and credential endpoints are not exposed.');
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    return url;
}

export function routeMatches(template, path) {
    const actual = path.split('/');
    const pattern = template.split('/');
    for (let i = 0; i < pattern.length; i++) {
        if (pattern[i] === '*') return actual.slice(i).length > 0 && actual.slice(i).every(Boolean);
        if (pattern[i].startsWith(':')) { if (!actual[i]) return false; }
        else if (pattern[i] !== actual[i]) return false;
    }
    return pattern.length === actual.length;
}

export function diagnosticUrl(value) {
    try { const url = new URL(value); return url.origin === 'null' ? url.protocol : url.origin + url.pathname; }
    catch { return '[invalid URL]'; }
}
