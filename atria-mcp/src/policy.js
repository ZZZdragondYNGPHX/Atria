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
    throw new Error('Generic mutation and UI interaction are unavailable; use approved semantic actions.');
}

export function redactText(value) {
    if (/(?:api[_-]?key|password|passwd|token|secret|credential|authorization|cookie)["']?\s*:\s*(?:[>|]|\r?\n[ \t]+)/i.test(value)) return '[REDACTED SENSITIVE MULTILINE CONTENT]';
    return redactAssignments(value
        .replace(/-----BEGIN [^-]*(?:PRIVATE KEY|OPENSSH)[^-]*-----[\s\S]*?(?:-----END [^-]+-----|$)/g, '[REDACTED PRIVATE KEY]')
        .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]'))
        .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/g, '[REDACTED]')
        .replace(/[a-z][a-z0-9+.-]{0,63}:\/\/[^\s/"']+/gi, authority => {
            const at = authority.lastIndexOf('@');
            return at < 0 ? authority : authority.slice(0, authority.indexOf('://') + 3) + '[REDACTED]@' + authority.slice(at + 1);
        });
}

// Consume each key token once. A leading greedy word matcher before a secret
// keyword retries every suffix of long untrusted words and can block Control.
function redactAssignments(value) {
    const words = /[\w-]+/g, separator = /["']?\s*[:=]\s*/y;
    const assigned = /"(?:[^"\\\r\n]|\\[^\r\n])*"|'(?:[^'\\\r\n]|\\[^\r\n])*'|[^\s,;\r\n}]+/y;
    const sensitive = /api[_-]?key|password|passwd|token|secret|credential|authorization|cookie/i;
    const output = []; let cursor = 0, match;
    while ((match = words.exec(value))) {
        if (!sensitive.test(match[0])) continue;
        separator.lastIndex = words.lastIndex;
        if (!separator.exec(value)) continue;
        assigned.lastIndex = separator.lastIndex;
        const assignment = assigned.exec(value); if (!assignment) continue;
        const quote = assignment[0][0], quoted = (quote === '"' || quote === "'") && assignment[0].at(-1) === quote;
        output.push(value.slice(cursor, separator.lastIndex), quoted ? quote + '[REDACTED]' + quote : '[REDACTED]');
        cursor = words.lastIndex = assigned.lastIndex;
    }
    output.push(value.slice(cursor)); return output.join('');
}

export function apiUrl(config, path, query = {}) {
    if (/[?#]/.test(path) || !path.startsWith('/api/native/') || /%|(?:^|\/)\.{1,2}(?:\/|$)/.test(path)) {
        throw new Error('API path must be an unencoded Native path; pass query parameters separately.');
    }
    const url = safeUrl(path, config.url);
    if (/(?:^|\/)(?:secrets?|credentials)(?:\/|$)/i.test(url.pathname)) throw new Error('Secret and credential endpoints are not exposed.');
    // Discovered GET is not automatically a pure observation authority.
    if (/^\/api\/native\/product\/sessions\/[^/]+$/.test(path)
        || /^\/api\/native\/product\/works\/[^/]+\/resource-setup$/.test(path)
        || /^\/api\/native\/session\/asset\//.test(path)
        || /^\/api\/native\/generation\/visual\/(?:mask\/raster|gallery\/thumbnail)(?:\/|$)/.test(path)
        || /^\/api\/native\/studio\/projects\/[^/]+\/agent\/tasks(?:\/[^/]+(?:\/context)?)?$/.test(path)
        || /^\/api\/native\/generation\/illustration-images(?:\/[^/]+)?$/.test(path))
        throw new Error('Endpoint performs reconciliation; use the pure semantic observation action.');
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
