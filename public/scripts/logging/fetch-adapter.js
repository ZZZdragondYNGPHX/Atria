import {
    emitFrontendConsole,
    isFrontendConsoleDebugLoggingEnabled,
} from './console-adapter.js';
import { frontendLogStore } from './logger.js';

const WRAPPED_FETCH_ORIGINAL = Symbol.for('atria.frontend.logging.fetch.original');
const FRONTEND_FETCH_LOG_PREFIX = '[FrontendFetch]';
const FETCH_LOG_PATH_PREFIX = '/api/';
const FETCH_LOG_EXTRA_PATHS = new Set(['/csrf-token', '/version']);
let nextFetchId = 1;

function truncate(value, maxLength = 160) {
    const text = String(value ?? '');
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function normalizeHeaderEntries(headers) {
    if (!headers) return [];
    if (typeof Headers !== 'undefined' && headers instanceof Headers) return [...headers.entries()];
    if (Array.isArray(headers)) return headers.map(([name, value]) => [String(name || ''), String(value || '')]);
    if (typeof headers === 'object') {
        return Object.entries(headers).map(([name, value]) => [
            String(name || ''),
            Array.isArray(value) ? value.join(', ') : String(value || ''),
        ]);
    }
    return [];
}

function summarizeHeaders(headers, { response = false } = {}) {
    const summary = {};
    for (const [name, value] of normalizeHeaderEntries(headers)) {
        const normalizedName = String(name || '').trim().toLowerCase();
        if (normalizedName === 'content-type' || normalizedName === 'accept') {
            summary[normalizedName.replace(/-/g, '_')] = truncate(value, 120);
        } else if (normalizedName === 'x-csrf-token') {
            summary.x_csrf_token = 'present';
        } else if (response && normalizedName === 'x-atria-generation-id' && value) {
            summary.atri_generation_id = String(value);
        } else if (response && normalizedName === 'x-atria-server-persisted' && (value === '0' || value === '1')) {
            summary.atria_server_persisted = value === '1';
        }
    }
    return Object.keys(summary).length ? summary : undefined;
}

function summarizePersistTarget(target) {
    if (!target || typeof target !== 'object') return undefined;
    if (target.kind === 'group') return { kind: 'group', id: String(target.id || '') };
    if (target.kind === 'character') {
        return {
            kind: 'character',
            avatar_url: String(target.avatar_url || ''),
            file_name: String(target.file_name || ''),
        };
    }
    return { kind: String(target.kind || '') };
}

function summarizeMessageRoles(messages) {
    if (!Array.isArray(messages) || !messages.length) return undefined;
    const counts = {};
    for (const message of messages) {
        const role = typeof message?.role === 'string'
            ? message.role
            : message?.is_user ? 'user' : message?.is_system ? 'system' : 'assistant';
        counts[role] = Number(counts[role] || 0) + 1;
    }
    return counts;
}

function collectGenerationIds(value, ids = new Set(), depth = 0) {
    if (!value || depth > 6 || ids.size >= 8) return ids;
    if (Array.isArray(value)) {
        for (const item of value) collectGenerationIds(item, ids, depth + 1);
        return ids;
    }
    if (typeof value !== 'object') return ids;
    const id = typeof value.atri_generation_id === 'string' ? value.atri_generation_id.trim() : '';
    if (id) ids.add(id);
    for (const nested of Object.values(value)) collectGenerationIds(nested, ids, depth + 1);
    return ids;
}

function summarizeJsonBody(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
    const keys = Object.keys(payload);
    const summary = { kind: 'json', key_count: keys.length, keys: keys.slice(0, 16) };
    for (const field of ['type', 'model', 'api', 'api_type', 'chat_completion_source', 'stream', 'streaming', 'n', 'max_tokens', 'reasoning_effort', 'verbosity']) {
        if (!Object.hasOwn(payload, field)) continue;
        const value = payload[field];
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            summary[field] = typeof value === 'string' ? truncate(value, 120) : value;
        }
    }
    if (Array.isArray(payload.messages)) {
        summary.message_count = payload.messages.length;
        summary.message_roles = summarizeMessageRoles(payload.messages);
    }
    if (Array.isArray(payload.chat)) summary.chat_message_count = payload.chat.length;
    if (Array.isArray(payload.operations)) summary.operation_count = payload.operations.length;
    if (Array.isArray(payload.results)) summary.result_count = payload.results.length;
    const generationIds = Array.from(collectGenerationIds(payload));
    if (generationIds.length) summary.atri_generation_ids = generationIds;
    if (payload.atri_generation && typeof payload.atri_generation === 'object') {
        summary.atri_generation = {
            job_id: String(payload.atri_generation.job_id || ''),
            persist_target: summarizePersistTarget(payload.atri_generation.persist_target),
        };
    }
    if (payload.persist_target && typeof payload.persist_target === 'object') {
        summary.persist_target = summarizePersistTarget(payload.persist_target);
    }
    if (typeof payload.file_name === 'string') summary.file_name = payload.file_name;
    if (typeof payload.avatar_url === 'string') summary.avatar_url = payload.avatar_url;
    if (payload.id !== undefined && payload.id !== null) summary.id = String(payload.id);
    return summary;
}

function summarizeBody(body) {
    if (body === undefined || body === null) return undefined;
    if (typeof body === 'string') {
        const trimmed = body.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
                const parsed = JSON.parse(trimmed);
                return { chars: body.length, ...summarizeJsonBody(parsed) };
            } catch {
                // Fall through to a size-only summary.
            }
        }
        return { kind: 'string', chars: body.length };
    }
    if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
        const keys = [...new Set(body.keys())];
        return { kind: 'url_search_params', key_count: keys.length, keys: keys.slice(0, 16) };
    }
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
        const keys = [];
        const fileKeys = [];
        for (const [key, value] of body.entries()) {
            keys.push(String(key));
            if (typeof Blob !== 'undefined' && value instanceof Blob) fileKeys.push(String(key));
        }
        return {
            kind: 'form_data',
            key_count: keys.length,
            keys: [...new Set(keys)].slice(0, 16),
            file_keys: [...new Set(fileKeys)].slice(0, 16),
        };
    }
    if (typeof Blob !== 'undefined' && body instanceof Blob) return { kind: 'blob', size: body.size, type: body.type || '' };
    if (body instanceof ArrayBuffer) return { kind: 'array_buffer', size: body.byteLength };
    if (ArrayBuffer.isView(body)) return { kind: 'typed_array', size: body.byteLength };
    return { kind: body?.constructor?.name || typeof body };
}

function resolveRequest(input, init, locationObject) {
    const request = typeof Request !== 'undefined' && input instanceof Request ? input : null;
    const urlValue = request ? request.url : (typeof input === 'string' || input instanceof URL ? String(input) : '');
    const method = String(init?.method || request?.method || 'GET').toUpperCase();
    try {
        return { request, resolvedUrl: new URL(urlValue, locationObject.href), method };
    } catch {
        return { request, resolvedUrl: null, method };
    }
}

function buildRequestSummary(requestId, input, init, locationObject) {
    const { request, resolvedUrl, method } = resolveRequest(input, init, locationObject);
    if (!resolvedUrl || resolvedUrl.origin !== locationObject.origin) return null;
    if (!FETCH_LOG_EXTRA_PATHS.has(resolvedUrl.pathname) && !resolvedUrl.pathname.startsWith(FETCH_LOG_PATH_PREFIX)) return null;
    const queryKeys = [...new Set(resolvedUrl.searchParams.keys())].filter(Boolean).sort();
    const body = summarizeBody(init?.body);
    const headers = summarizeHeaders(init?.headers || request?.headers);
    return {
        request_id: requestId,
        method,
        path: resolvedUrl.pathname,
        ...(queryKeys.length ? { query_keys: queryKeys } : {}),
        ...(headers ? { headers } : {}),
        ...(body ? { body } : {}),
        ...(init?.cache ? { cache: String(init.cache) } : {}),
    };
}

function getDurationMs(startTime) {
    const end = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
    return Math.max(0, Math.round(end - startTime));
}

function requestCorrelation(summary, body) {
    let jobId = summary?.body?.atria_generation?.job_id || summary?.body?.atri_generation_ids?.[0] || '';
    if (!jobId && body && typeof body === 'object' && !Array.isArray(body)) {
        jobId = body?.atri_generation?.job_id || body?.atri_generation_id || '';
    }
    if (!jobId && typeof body === 'string') {
        const trimmed = body.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
                const parsed = JSON.parse(trimmed);
                jobId = parsed?.atri_generation?.job_id || parsed?.atri_generation_id || '';
            } catch {
                // Body summary already records only shape/size; correlation extraction is best-effort.
            }
        }
    }
    return jobId ? { requestId: String(jobId), generationId: String(jobId) } : {};
}

export function installFrontendFetchAdapter({
    store = frontendLogStore,
    globalObject = globalThis,
    locationObject = globalThis.window?.location,
} = {}) {
    if (!locationObject || typeof globalObject.fetch !== 'function') return;
    const current = globalObject.fetch;
    if (Object.prototype.hasOwnProperty.call(current, WRAPPED_FETCH_ORIGINAL)) return;
    const originalFetch = current.bind(globalObject);
    const wrapped = async (input, init) => {
        const requestId = nextFetchId++;
        const startTime = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
        const summary = buildRequestSummary(requestId, input, init, locationObject);
        if (summary) {
            store.append({
                level: 'debug',
                module: 'network',
                category: 'http',
                event: 'fetch.request',
                message: `${summary.method} ${summary.path}`,
                data: summary,
                correlation: requestCorrelation(summary, init?.body),
                source: 'fetch',
            });
            if (isFrontendConsoleDebugLoggingEnabled()) {
                emitFrontendConsole('debug', [FRONTEND_FETCH_LOG_PREFIX, { phase: 'request', ...summary }]);
            }
        }
        try {
            const response = await originalFetch(input, init);
            if (summary) {
                const headers = summarizeHeaders(response.headers, { response: true });
                const correlation = {
                    ...requestCorrelation(summary, init?.body),
                    ...(headers?.atri_generation_id ? {
                        requestId: headers.atri_generation_id,
                        generationId: headers.atri_generation_id,
                    } : {}),
                };
                const data = {
                    request_id: requestId,
                    method: summary.method,
                    path: summary.path,
                    status: response.status,
                    ok: response.ok,
                    duration_ms: getDurationMs(startTime),
                    ...(headers ? { headers } : {}),
                };
                store.append({
                    level: response.ok ? 'debug' : 'warn',
                    module: 'network',
                    category: 'http',
                    event: 'fetch.response',
                    message: `${summary.method} ${summary.path} -> ${response.status}`,
                    data,
                    correlation,
                    source: 'fetch',
                });
                if (isFrontendConsoleDebugLoggingEnabled()) {
                    emitFrontendConsole('debug', [FRONTEND_FETCH_LOG_PREFIX, { phase: 'response', ...data }]);
                }
            }
            return response;
        } catch (error) {
            if (summary) {
                const data = {
                    request_id: requestId,
                    method: summary.method,
                    path: summary.path,
                    duration_ms: getDurationMs(startTime),
                    aborted: error?.name === 'AbortError',
                    error_name: String(error?.name || ''),
                    error_message: truncate(error?.message || error || '', 240),
                };
                store.append({
                    level: 'error',
                    module: 'network',
                    category: 'http',
                    event: 'fetch.error',
                    message: `${summary.method} ${summary.path} failed: ${data.error_message}`,
                    data,
                    correlation: requestCorrelation(summary, init?.body),
                    source: 'fetch',
                });
                if (isFrontendConsoleDebugLoggingEnabled()) {
                    emitFrontendConsole('debug', [FRONTEND_FETCH_LOG_PREFIX, { phase: 'error', ...data }]);
                }
            }
            throw error;
        }
    };
    Object.defineProperty(wrapped, WRAPPED_FETCH_ORIGINAL, { value: originalFetch });
    globalObject.fetch = wrapped;
}

export const __frontendFetchAdapterTestUtils = Object.freeze({
    buildRequestSummary,
    summarizeBody,
    summarizeHeaders,
    WRAPPED_FETCH_ORIGINAL,
});
