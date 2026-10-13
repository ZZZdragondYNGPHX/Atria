import { createHash, randomUUID } from 'node:crypto';
import { protocolEndpoint } from './protocol-endpoint.js';

export const A2A_PROTOCOL_VERSION = '1.0';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const states = new Set(['TASK_STATE_SUBMITTED', 'TASK_STATE_WORKING', 'TASK_STATE_COMPLETED', 'TASK_STATE_FAILED', 'TASK_STATE_CANCELED', 'TASK_STATE_INPUT_REQUIRED', 'TASK_STATE_REJECTED', 'TASK_STATE_AUTH_REQUIRED']);
function fail(code, message, dispatched = false) {
    return Object.assign(new Error(message), { code, dispatched, outcome: dispatched ? 'unknown' : 'failed' });
}
function id(value) { return typeof value === 'string' && value.length > 0 && value.length <= 256; }
function parts(value) {
    if (!Array.isArray(value) || !value.length || value.length > 32) throw fail('a2a_content_unsupported', 'Invalid bounded A2A content.', true);
    return value.map(part => {
        if (!object(part) || 'kind' in part || 'url' in part || 'raw' in part || 'file' in part || 'filename' in part || ('text' in part) === ('data' in part) || (part.mediaType && !['text/plain', 'application/json'].includes(part.mediaType))) throw fail('a2a_content_unsupported', 'Only text and JSON A2A parts are supported.', true);
        if ('text' in part && typeof part.text !== 'string') throw fail('a2a_content_unsupported', 'A2A text must be a string.', true);
        return { ...('text' in part ? { text: part.text } : { data: part.data }), ...(part.mediaType ? { mediaType: part.mediaType } : {}) };
    });
}
function message(value) {
    if (!object(value) || 'kind' in value || !id(value.messageId) || !id(value.contextId) || value.role !== 'ROLE_AGENT' || (value.extensions?.length)) throw fail('a2a_message_invalid', 'Invalid A2A 1.0 agent message.', true);
    if (value.taskId !== undefined && !id(value.taskId)) throw fail('a2a_message_invalid', 'Invalid A2A task identity.', true);
    return { messageId: value.messageId, contextId: value.contextId, ...(value.taskId ? { taskId: value.taskId } : {}), role: value.role, parts: parts(value.parts) };
}
function task(value, identity) {
    if (!object(value) || 'kind' in value || !id(value.id) || !id(value.contextId) || !object(value.status) || !states.has(value.status.state)) throw fail('a2a_task_invalid', 'Invalid A2A 1.0 task.', true);
    if (identity && (value.id !== identity.id || value.contextId !== identity.contextId)) throw fail('a2a_identity_mismatch', 'A2A task/context identity changed.', true);
    if (value.history?.length) throw fail('a2a_history_unsupported', 'Unrequested A2A history is unsupported.', true);
    const status = { state: value.status.state };
    if (value.status.message) {
        status.message = message(value.status.message);
        if (status.message.contextId !== value.contextId || (status.message.taskId && status.message.taskId !== value.id)) throw fail('a2a_identity_mismatch', 'Status message identity changed.', true);
    }
    if (value.status.timestamp !== undefined) {
        if (typeof value.status.timestamp !== 'string' || !Number.isFinite(Date.parse(value.status.timestamp))) throw fail('a2a_task_invalid', 'Invalid A2A status timestamp.', true);
        status.timestamp = value.status.timestamp;
    }
    if (value.artifacts !== undefined && (!Array.isArray(value.artifacts) || value.artifacts.length > 16)) throw fail('a2a_content_unsupported', 'Invalid bounded A2A artifacts.', true);
    const artifacts = (value.artifacts || []).map(artifact => {
        if (!object(artifact) || !id(artifact.artifactId) || artifact.extensions?.length) throw fail('a2a_content_unsupported', 'Invalid A2A artifact.', true);
        return { artifactId: artifact.artifactId, parts: parts(artifact.parts) };
    });
    return { id: value.id, contextId: value.contextId, status, artifacts };
}

/** Finite A2A 1.0 JSON-RPC subset; caller owns local permission and task identities. */
export function createA2aHttpClient({ url, skillIds = [], headers = {}, fetchImpl = globalThis.fetch, maxRequestBytes = 16384, maxResponseBytes = 65536 }) {
    const endpoint = protocolEndpoint(url, 'a2a', { query: false });
    if (!object(headers) || Object.keys(headers).some(key => key.toLowerCase() !== 'authorization') || Object.values(headers).some(value => typeof value !== 'string' || !/^Bearer [\x21-\x7e]+$/.test(value))) throw fail('a2a_auth_unsupported', 'Only explicit bearer authentication is supported.');
    if (![maxRequestBytes, maxResponseBytes].every(value => Number.isSafeInteger(value) && value > 0 && value <= 1048576)) throw fail('a2a_bounds_invalid', 'Invalid A2A byte bounds.');
    if (!Array.isArray(skillIds) || !skillIds.length || skillIds.length > 8 || skillIds.some(value => !id(value)) || new Set(skillIds).size !== skillIds.length) throw fail('a2a_skill_denied', 'Invalid exact skill allowlist.');
    let sequence = 0;
    let card;
    const authorized = Object.keys(headers).length > 0;
    function security(requirements, schemes) {
        if (requirements === undefined || (Array.isArray(requirements) && !requirements.length)) return;
        if (!Array.isArray(requirements) || !requirements.some(requirement => {
            if (!object(requirement) || !object(requirement.schemes)) return false;
            const names = Object.keys(requirement.schemes);
            if (!names.length) return true;
            const scopes = requirement.schemes[names[0]]?.list;
            return authorized && names.length === 1 && object(schemes?.[names[0]]) && Object.keys(schemes[names[0]]).every(key => key === 'httpAuthSecurityScheme') && schemes[names[0]].httpAuthSecurityScheme?.scheme?.toLowerCase() === 'bearer' && object(requirement.schemes[names[0]]) && (scopes === undefined || (Array.isArray(scopes) && !scopes.length));
        })) throw fail('a2a_auth_unsupported', 'A2A authentication requirements are unsupported.', true);
    }
    function validateCard(value) {
        if (!object(value) || !Array.isArray(value.supportedInterfaces) || !value.supportedInterfaces.some(item => object(item) && item.url === endpoint.href && item.protocolBinding === 'JSONRPC' && item.protocolVersion === A2A_PROTOCOL_VERSION && !item.tenant) || !object(value.capabilities) || value.capabilities.extensions?.some(item => !object(item) || item.required === true) || !Array.isArray(value.skills)) throw fail('a2a_card_unsupported', 'A2A card does not match the fixed endpoint, binding and revision.', true);
        if (!Array.isArray(value.defaultInputModes) || !value.defaultInputModes.includes('text/plain') || !Array.isArray(value.defaultOutputModes) || !value.defaultOutputModes.some(mode => ['text/plain', 'application/json'].includes(mode))) throw fail('a2a_modes_unsupported', 'A2A text/JSON modes are required.', true);
        security(value.securityRequirements, value.securitySchemes);
        const skills = skillIds.map(skillId => {
            const skill = value.skills.find(item => object(item) && item.id === skillId);
            if (!skill) throw fail('a2a_skill_denied', 'Configured A2A skill is not present in card.', true);
            security(skill.securityRequirements, value.securitySchemes);
            if (skill.inputModes?.length && !skill.inputModes.includes('text/plain')) throw fail('a2a_modes_unsupported', 'Skill does not accept text.', true);
            if (skill.outputModes?.length && !skill.outputModes.some(mode => ['text/plain', 'application/json'].includes(mode))) throw fail('a2a_modes_unsupported', 'Skill does not produce text/JSON.', true);
            return { id: skill.id };
        });
        return { supportedInterfaces: [{ url: endpoint.href, protocolBinding: 'JSONRPC', protocolVersion: A2A_PROTOCOL_VERSION }], skills };
    }
    async function request(method, params, options = {}, validator) {
        const rpc = method !== 'GetAgentCard';
        const payload = rpc ? { jsonrpc: '2.0', id: ++sequence, method, params } : undefined;
        const body = rpc ? JSON.stringify(payload) : undefined;
        if (body && Buffer.byteLength(body) > maxRequestBytes) throw fail('a2a_request_too_large', 'A2A request exceeds its bound.');
        const operation = async () => {
            options.signal?.throwIfAborted();
            let response;
            let dispatched = false;
            try {
                dispatched = true;
                response = await fetchImpl(rpc ? endpoint.href : new URL('/.well-known/agent-card.json', endpoint).href, { method: rpc ? 'POST' : 'GET', redirect: 'error', signal: options.signal, headers: { ...headers, Accept: 'application/json', 'A2A-Version': A2A_PROTOCOL_VERSION, ...(rpc ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body } : {}) });
                if (!response.ok) throw fail('a2a_http_error', 'A2A HTTP request failed.', true);
                if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) throw fail('a2a_media_unsupported', 'Only finite JSON A2A responses are supported.', true);
                const chunks = [];
                let bytes = 0;
                for await (const chunk of response.body) {
                    bytes += chunk.byteLength;
                    if (bytes > maxResponseBytes) throw fail('a2a_response_too_large', 'A2A result exceeds its bound.', true);
                    chunks.push(Buffer.from(chunk));
                }
                const envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
                let result = envelope;
                if (rpc) {
                    if (!object(envelope) || envelope.jsonrpc !== '2.0' || envelope.id !== payload.id || 'method' in envelope || ('result' in envelope) === ('error' in envelope)) throw fail('a2a_envelope_invalid', 'Invalid A2A JSON-RPC envelope.', true);
                    if ('error' in envelope) throw Object.assign(fail('a2a_remote_error', 'Remote A2A operation failed.', true), { outcome: 'failed' });
                    result = envelope.result;
                }
                const projected = validator(result);
                return { result: projected, evidence: { protocolVersion: A2A_PROTOCOL_VERSION, method, requestFingerprint: hash(payload || { method }), responseFingerprint: hash(projected) } };
            } catch (error) {
                try { await response?.body?.cancel(); } catch { /* Closed or locked reader. */ }
                if (error.code?.startsWith('a2a_')) throw error;
                const failure = fail(options.signal?.aborted ? 'a2a_cancelled' : 'a2a_transport_unknown', 'A2A operation did not produce a verified result.', dispatched);
                if (options.signal?.aborted) failure.outcome = 'cancelled';
                throw failure;
            }
        };
        return options.aroundRequest ? options.aroundRequest({ method }, operation) : operation();
    }
    function ready() { if (!card) throw fail('a2a_not_initialized', 'A2A card has not been verified.'); }
    function identity(value) {
        ready();
        if (!object(value) || !id(value.id) || !id(value.contextId) || Object.keys(value).some(key => !['id', 'contextId'].includes(key))) throw fail('a2a_identity_denied', 'An exact previously acquired task/context identity is required.');
    }
    return {
        async initialize(options) {
            const response = await request('GetAgentCard', undefined, options, validateCard);
            card = response.result;
            return response;
        },
        async sendMessage(skillId, text, options) {
            ready();
            if (!card.skills.some(skill => skill.id === skillId) || typeof text !== 'string' || !text.length) throw fail('a2a_skill_denied', 'A2A requires an allowed skill and public text.');
            return request('SendMessage', { message: { messageId: randomUUID(), role: 'ROLE_USER', parts: [{ text }] }, configuration: { acceptedOutputModes: ['text/plain', 'application/json'], historyLength: 0, returnImmediately: true } }, options, result => {
                if (!object(result) || ('task' in result) === ('message' in result)) throw fail('a2a_result_invalid', 'Expected an A2A SendMessageResponse oneof.', true);
                return 'task' in result ? { task: task(result.task) } : { message: message(result.message) };
            });
        },
        async getTask(value, options) {
            identity(value);
            return request('GetTask', { id: value.id, historyLength: 0 }, options, result => task(result, value));
        },
        async cancelTask(value, options) {
            identity(value);
            return request('CancelTask', { id: value.id }, options, result => task(result, value));
        },
    };
}
