export const REDACTED = '[REDACTED]';

const SENSITIVE_KEY_PATTERN = /(?:^|[_-])(api[_-]?key|authorization|cookie|session|csrf|password|passwd|secret|access[_-]?token|refresh[_-]?token|oauth|bearer|jwt|credential|private[_-]?key)(?:$|[_-])/i;
const AUTHORIZATION_PATTERN = /\b(authorization\s*[:=]\s*(?:bearer|basic)\s+)([^\s,;]+)/gi;
const BEARER_PATTERN = /\b(bearer\s+)([A-Za-z0-9._~+/-]{12,})/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const OPENAI_STYLE_KEY_PATTERN = /\b(?:sk|pk)-[A-Za-z0-9_-]{16,}\b/g;
const QUERY_SECRET_PATTERN = /([?&](?:api[_-]?key|key|token|access[_-]?token|refresh[_-]?token|secret|password)=)([^&#\s]+)/gi;
const INLINE_SECRET_PATTERN = /\b(api[_-]?key|apikey|token|secret|password|passwd|authorization)\s*[=:]\s*["']?([^\s"',&]+)/gi;
const HEX_SECRET_PATTERN = /\b[a-f0-9]{40,}\b/gi;
const LONG_TOKEN_PATTERN = /\b(?=[A-Za-z0-9_+/-]{48,}\b)(?=[A-Za-z0-9_+/-]*[A-Za-z])(?=[A-Za-z0-9_+/-]*\d)[A-Za-z0-9_+/-]{48,}\b/g;

export function isSensitiveKey(key) {
    return SENSITIVE_KEY_PATTERN.test(String(key || ''));
}

export function redactText(value) {
    return String(value ?? '')
        .replace(AUTHORIZATION_PATTERN, '$1' + REDACTED)
        .replace(BEARER_PATTERN, '$1' + REDACTED)
        .replace(JWT_PATTERN, REDACTED)
        .replace(OPENAI_STYLE_KEY_PATTERN, REDACTED)
        .replace(QUERY_SECRET_PATTERN, '$1' + REDACTED)
        .replace(INLINE_SECRET_PATTERN, '$1=' + REDACTED)
        .replace(HEX_SECRET_PATTERN, REDACTED)
        .replace(LONG_TOKEN_PATTERN, REDACTED);
}

function isPlainObject(value) {
    if (!value || typeof value !== 'object') return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

function redactInternal(value, options, seen, depth) {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return redactText(value).slice(0, options.maxStringLength);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'bigint') return String(value) + 'n';
    if (typeof value === 'function') return '[Function ' + (value.name || 'anonymous') + ']';
    if (depth >= options.maxDepth) return '[MaxDepth]';
    if (value instanceof Error) {
        return {
            name: redactText(value.name || 'Error'),
            message: redactText(value.message || String(value)),
            ...(value.stack ? { stack: redactText(value.stack) } : {}),
            ...(value.cause !== undefined ? { cause: redactInternal(value.cause, options, seen, depth + 1) } : {}),
        };
    }
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    try {
        if (Array.isArray(value)) {
            return value.slice(0, options.maxArrayLength)
                .map(item => redactInternal(item, options, seen, depth + 1));
        }
        if (!isPlainObject(value)) return redactText(String(value)).slice(0, options.maxStringLength);
        const output = {};
        for (const [key, nestedValue] of Object.entries(value).slice(0, options.maxObjectKeys)) {
            output[key] = isSensitiveKey(key)
                ? REDACTED
                : redactInternal(nestedValue, options, seen, depth + 1);
        }
        return output;
    } finally {
        seen.delete(value);
    }
}

export function redactValue(value, options = {}) {
    const normalized = {
        maxDepth: Number.isFinite(options.maxDepth) ? Math.max(1, options.maxDepth) : 8,
        maxArrayLength: Number.isFinite(options.maxArrayLength) ? Math.max(1, options.maxArrayLength) : 100,
        maxObjectKeys: Number.isFinite(options.maxObjectKeys) ? Math.max(1, options.maxObjectKeys) : 100,
        maxStringLength: Number.isFinite(options.maxStringLength) ? Math.max(64, options.maxStringLength) : 12000,
    };
    try {
        return redactInternal(value, normalized, new WeakSet(), 0);
    } catch {
        return '[Unserializable]';
    }
}
