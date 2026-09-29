const SENSITIVE_KEY = /^(?:authorization|cookie|set-cookie|password|passwd|token|csrfToken|accessToken|refreshToken|api[_-]?key|secret|secretValue|credentials|clientSecret|privateKey|access_token|refresh_token|csrf_token)$/i;

export function redact(value) {
    if (Array.isArray(value)) return value.map(redact);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
        .map(([key, item]) => [key, (SENSITIVE_KEY.test(key) || /(?:api[_-]?key|password|passwd|client[_-]?secret|private[_-]?key|access[_-]?token|refresh[_-]?token)$/i.test(key)) ? '[REDACTED]' : redact(item)]));
    return typeof value === 'string' ? redactText(value) : value;
}

export function safeUrl(value, base) {
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')
        || /[\\\u0000-\u0020]/.test(value)) throw new Error('Use a root-relative path on the configured Atria origin.');
    const url = new URL(value, base);
    if (url.origin !== new URL(base).origin || url.username || url.password) throw new Error('Cross-origin navigation is blocked.');
    return url;
}

export function denyMutation() {
    throw new Error('Product mutation and UI interaction are unavailable in Phase 1.');
}

export function redactText(value) {
    if (/(?:api[_-]?key|password|passwd|token|secret|credential|authorization|cookie)["']?\s*:\s*(?:[>|]|\r?\n[ \t]+)/i.test(value)) return '[REDACTED SENSITIVE MULTILINE CONTENT]';
    return value
        .replace(/-----BEGIN [^-]*(?:PRIVATE KEY|OPENSSH)[^-]*-----[\s\S]*?(?:-----END [^-]+-----|$)/g, '[REDACTED PRIVATE KEY]')
        .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
        .replace(/((?:[\w-]*(?:api[_-]?key|password|passwd|token|secret|credential|authorization|cookie)[\w-]*)["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;\r\n}]+)/gi, '$1[REDACTED]')
        .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/g, '[REDACTED]')
        .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[REDACTED]@');
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
