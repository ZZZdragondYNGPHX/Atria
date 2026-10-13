import { createHash } from 'node:crypto';
import { protocolEndpoint } from './protocol-endpoint.js';
import { readServerEvents } from '../../public/shared/native-protocol-stream.js';
import { setTimeout as delay } from 'node:timers/promises';

export const MCP_PROTOCOL_VERSION = '2025-11-25';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function failure(code, message, dispatched = false, cause) {
    return Object.assign(new Error(message, { cause }), { code, dispatched, outcome: dispatched ? 'unknown' : 'failed' });
}

/** Fixed-revision, bounded JSON/SSE MCP client. Authority remains with its caller. */
export function createMcpHttpClient({ url, toolNames = [], resourceUris = [], headers = {}, fetchImpl = globalThis.fetch, maxResponseBytes = 65536, maxRequestBytes = 16384, timeoutMs = 30000, maxReconnects = 2 }) {
    const parsed = protocolEndpoint(url, 'mcp');
    if (!object(headers) || Object.keys(headers).some(key => key.toLowerCase() !== 'authorization') || Object.values(headers).some(value => typeof value !== 'string' || /[\r\n]/.test(value))) throw failure('mcp_headers_denied', 'Only an explicit authorization header is supported.');
    if (![maxRequestBytes, maxResponseBytes].every(value => Number.isSafeInteger(value) && value > 0 && value <= 1048576)) throw failure('mcp_bounds_invalid', 'Invalid MCP byte bounds.');
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000 || !Number.isSafeInteger(maxReconnects) || maxReconnects < 0 || maxReconnects > 16) throw failure('mcp_bounds_invalid', 'Invalid MCP stream limits.');
    const tools = new Set(toolNames);
    const resources = new Set(resourceUris);
    let sequence = 0;
    let initialized = false;
    let sessionId;
    let capabilities;
    async function post(method, params, options = {}, notification = false) {
        const operation = () => dispatch(method, params, options, notification);
        return options.aroundRequest ? options.aroundRequest({ method }, operation) : operation();
    }
    async function dispatch(method, params, options = {}, notification = false) {
        const signal = AbortSignal.any([...(options.signal ? [options.signal] : []), AbortSignal.timeout(timeoutMs)]);
        const { beforeRequest } = options;
        signal?.throwIfAborted();
        const request = { jsonrpc: '2.0', ...(notification ? {} : { id: ++sequence }), method, ...(params === undefined ? {} : { params }) };
        const body = JSON.stringify(request);
        if (Buffer.byteLength(body) > maxRequestBytes) throw failure('mcp_request_too_large', 'MCP request exceeds its byte bound.');
        await beforeRequest?.({ method });
        signal?.throwIfAborted();
        let dispatched = false;
        let response;
        try {
            dispatched = true;
            response = await fetchImpl(parsed.href, { method: 'POST', redirect: 'error', signal, headers: { ...headers, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': MCP_PROTOCOL_VERSION, ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}) }, body });
            if (response.status >= 300 || response.status < 200) throw failure('mcp_http_error', 'MCP HTTP operation failed.', true);
            if (notification) {
                if (response.status !== 202) throw failure('mcp_notification_invalid', 'Expected notification acknowledgement.', true);
                await response.body?.cancel();
                return { evidence: { protocolVersion: MCP_PROTOCOL_VERSION, method, requestFingerprint: fingerprint(request) } };
            }
            const initializeSessionId = method === 'initialize' ? response.headers.get('mcp-session-id') : null;
            if (initializeSessionId && !/^[\x21-\x7e]{1,256}$/.test(initializeSessionId)) throw failure('mcp_session_invalid', 'Invalid MCP session identifier.', true);
            const media = response.headers.get('content-type') || '';
            let envelope;
            if (/^text\/event-stream(?:\s*;|$)/i.test(media)) {
                let cursor, retry = 0, resumes = 0, remaining = maxResponseBytes;
                while (!envelope) {
                    for await (const event of readServerEvents(response.body, { maxBytes: remaining, signal, onBytes: count => { remaining -= count; if (remaining < 0) throw failure('mcp_response_too_large', 'MCP stream exceeds its byte bound.', true); } })) {
                        if (event.id !== undefined) {
                            if (event.id !== '' && !/^[\x21-\x7e]{1,256}$/.test(event.id)) throw failure('mcp_session_invalid', 'Invalid resume event identity.', true);
                            cursor = event.id || undefined;
                        }
                        if (event.retry !== undefined) retry = event.retry;
                        if (!event.data) continue;
                        const value = JSON.parse(event.data);
                        if (object(value) && value.jsonrpc === '2.0' && value.id === request.id && !('method' in value)) { envelope = value; break; }
                        // Notifications carry no local authority. Server requests
                        // are unsupported rather than automatically executed.
                        if (!object(value) || value.jsonrpc !== '2.0' || 'id' in value || typeof value.method !== 'string') throw failure('mcp_envelope_invalid', 'Unsupported stream message.', true);
                    }
                    if (envelope) break;
                    if (!cursor || resumes++ >= maxReconnects) throw failure('mcp_stream_interrupted', 'MCP stream ended without its response.', true);
                    await delay(retry, undefined, { signal });
                    const resume = async () => {
                        await beforeRequest?.({ method: 'stream/resume' });
                        signal.throwIfAborted();
                        const next = await fetchImpl(parsed.href, { method: 'GET', redirect: 'error', signal,
                            headers: { ...headers, Accept: 'text/event-stream', 'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
                                'Last-Event-ID': cursor, ...((sessionId || initializeSessionId) ? { 'Mcp-Session-Id': sessionId || initializeSessionId } : {}) } });
                        if (!next.ok || !/^text\/event-stream(?:\s*;|$)/i.test(next.headers.get('content-type') || '')) {
                            await next.body?.cancel(); throw failure('mcp_stream_interrupted', 'MCP resume failed.', true);
                        }
                        return next;
                    };
                    response = options.aroundRequest ? await options.aroundRequest({ method: 'stream/resume' }, resume) : await resume();
                }
            } else if (/^application\/json(?:\s*;|$)/i.test(media)) {
                const chunks = []; let size = 0;
                for await (const chunk of response.body) {
                    size += chunk.byteLength;
                    if (size > maxResponseBytes) throw failure('mcp_response_too_large', 'MCP response exceeds its byte bound.', true);
                    chunks.push(Buffer.from(chunk));
                }
                envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
            } else throw failure('mcp_media_unsupported', 'Expected JSON or SSE MCP response.', true);
            if (!object(envelope) || envelope.jsonrpc !== '2.0' || envelope.id !== request.id || 'method' in envelope || ('result' in envelope) === ('error' in envelope)) throw failure('mcp_envelope_invalid', 'Unsupported MCP response envelope or server request.', true);
            if ('error' in envelope) throw Object.assign(failure('mcp_remote_error', 'MCP server returned an error.', true), { outcome: 'failed' });
            if (!object(envelope.result)) throw failure('mcp_result_invalid', 'MCP result must be an object.', true);
            if (method === 'initialize') {
                const id = initializeSessionId;
                if (id && (!/^[\x21-\x7e]{1,256}$/.test(id))) throw failure('mcp_session_invalid', 'Invalid MCP session identifier.', true);
                sessionId = id || undefined;
            }
            return { result: envelope.result, evidence: { protocolVersion: MCP_PROTOCOL_VERSION, method, requestFingerprint: fingerprint(request), responseFingerprint: fingerprint(envelope.result) } };
        } catch (error) {
            try { await response?.body?.cancel(); } catch { /* Reader already closed or locked. */ }
            if (error.code?.startsWith('mcp_')) throw error;
            const wrapped = failure(signal?.aborted ? 'mcp_cancelled' : 'mcp_transport_unknown', 'MCP operation did not produce a verified response.', dispatched, error);
            if (signal?.aborted) {
                wrapped.outcome = 'cancelled';
                // Cancellation is advisory; its acknowledgement never proves rollback.
                if (!notification && method !== 'initialize' && dispatched) {
                    try {
                        await post('notifications/cancelled', { requestId: request.id, reason: 'Local request cancelled' }, { ...options, signal: AbortSignal.timeout(5000) }, true);
                        wrapped.cancellationNotification = 'acknowledged';
                    } catch {
                        wrapped.cancellationNotification = 'unconfirmed';
                    }
                }
            }
            throw wrapped;
        }
    }
    function ready(capability) {
        if (!initialized) throw failure('mcp_not_initialized', 'MCP client is not initialized.');
        if (!object(capabilities[capability])) throw failure('mcp_capability_missing', 'MCP server does not support the requested capability.');
    }
    function validateText(content) {
        if (!Array.isArray(content) || content.some(item => !object(item) || item.type !== 'text' || typeof item.text !== 'string' || (item.mimeType && !['text/plain', 'application/json'].includes(item.mimeType)))) throw failure('mcp_content_unsupported', 'Only bounded text/JSON content is supported.', true);
    }
    return {
        async initialize(options) {
            if (initialized) throw failure('mcp_already_initialized', 'MCP client is already initialized.');
            const result = await post('initialize', { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'atria-local-read', version: '1' } }, options);
            if (result.result.protocolVersion !== MCP_PROTOCOL_VERSION || !object(result.result.capabilities)) throw failure('mcp_protocol_unsupported', 'MCP protocol revision must match exactly.', true);
            capabilities = result.result.capabilities;
            await post('notifications/initialized', undefined, options, true);
            initialized = true;
            return result;
        },
        async listTools(options) {
            ready('tools');
            const response = await post('tools/list', {}, options);
            if (!Array.isArray(response.result.tools) || response.result.nextCursor || response.result.tools.some(item => !object(item) || typeof item.name !== 'string')) throw failure('mcp_discovery_invalid', 'Invalid or paginated MCP tool discovery.', true);
            return { ...response, result: { tools: response.result.tools.filter(item => tools.has(item.name)) } };
        },
        async callTool(name, args, options) {
            ready('tools');
            if (!tools.has(name) || !object(args)) throw failure('mcp_tool_denied', 'MCP tool is outside its exact allowlist.');
            const response = await post('tools/call', { name, arguments: args }, options);
            validateText(response.result.content);
            if (response.result.structuredContent !== undefined && !object(response.result.structuredContent)) throw failure('mcp_content_unsupported', 'Structured MCP content must be JSON object.', true);
            return { ...response, result: { content: response.result.content.map(item => ({ type: 'text', text: item.text, ...(item.mimeType ? { mimeType: item.mimeType } : {}) })), ...(response.result.structuredContent !== undefined ? { structuredContent: response.result.structuredContent } : {}), ...(response.result.isError !== undefined ? { isError: response.result.isError === true } : {}) } };
        },
        async listResources(options) {
            ready('resources');
            const response = await post('resources/list', {}, options);
            if (!Array.isArray(response.result.resources) || response.result.nextCursor || response.result.resources.some(item => !object(item) || typeof item.uri !== 'string')) throw failure('mcp_discovery_invalid', 'Invalid or paginated MCP resource discovery.', true);
            return { ...response, result: { resources: response.result.resources.filter(item => resources.has(item.uri)) } };
        },
        async readResource(uri, options) {
            ready('resources');
            if (!resources.has(uri)) throw failure('mcp_resource_denied', 'MCP resource is outside its exact allowlist.');
            const response = await post('resources/read', { uri }, options);
            if (!Array.isArray(response.result.contents) || response.result.contents.some(item => !object(item) || item.uri !== uri || typeof item.text !== 'string' || 'blob' in item || (item.mimeType && !['text/plain', 'application/json'].includes(item.mimeType)))) throw failure('mcp_content_unsupported', 'Only exact resource text/JSON is supported.', true);
            return { ...response, result: { contents: response.result.contents.map(item => ({ uri: item.uri, text: item.text, ...(item.mimeType ? { mimeType: item.mimeType } : {}) })) } };
        },
    };
}
