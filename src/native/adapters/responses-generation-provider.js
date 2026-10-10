import { renderPromptMessages } from '../model-prompt-runtime/prompt-renderers.js';
import { GenerationError, ProviderFailure, providerHttpFailure } from '../model-prompt-runtime/execution-utils.js';
import { serializeNativeDocument } from '../repositories/common.js';
import { captureNativeEnvelope, nativeEnvelopeBinding, readNativeEnvelope, discardNativeEnvelopes, assertNativeEnvelopeSafe, leaseNativeRequest, consumeNativeRequest, nativeExecutionObservation } from '../model-prompt-runtime/native-execution-envelope.js';
import { observedGenerationUsage } from './generation-usage.js';

const fail = () => { throw new GenerationError('generation_adapter_control_unsupported'); };
const keys = (value, allowed) => { if (Object.keys(value || {}).some(key => !allowed.includes(key))) fail(); };
export function createResponsesGenerationProvider({ fetchImpl = fetch } = {}) {
    const lower = ({ resolved, snapshot }) => {
        const { generation: g, connection, model } = resolved;
        const ir = snapshot.promptIr;
        for (const [section, allowed] of Object.entries({ sampling: ['temperature', 'topP'], output: ['maxTokens'],
            stop: [], streaming: ['enabled'], toolChoice: ['value'], reasoning: ['effort'], cache: ['key', 'retention'], providerExtensions: [] })) keys(g[section], allowed);
        keys(connection.options, []); keys(connection.networkPolicy, []); keys(model.messageFormat, []); keys(model.providerHints, []);
        if (ir.prefill !== undefined) fail();
        const max = g.output.maxTokens ?? snapshot.contextPlan.budget.reservedOutputTokens;
        if (!Number.isSafeInteger(max) || max < 1 || max > snapshot.contextPlan.budget.reservedOutputTokens) throw new GenerationError('generation_adapter_output_budget');
        const sequence = renderPromptMessages(ir);
        const binding = nativeEnvelopeBinding(resolved, snapshot, 'openai.responses.v1');
        const input = [];
        const publicInput = [];
        for (const [index, message] of sequence.entries()) {
            if (message.providerState) {
                input.push(...readNativeEnvelope(message.providerState, binding, sequence, index));
                publicInput.push({ role: 'assistant', content: message.content, nativeCheckpointId: message.providerState.checkpointId });
                continue;
            }
            if (message.role === 'tool') {
                const item = { type: 'function_call_output', call_id: message.tool_call_id, output: message.content };
                input.push(item); publicInput.push(item); continue;
            }
            if (message.content) {
                const item = { role: message.role, content: message.content };
                input.push(item); publicInput.push(item);
            }
            for (const call of message.tool_calls || []) {
                if (call.type !== 'function' || typeof call.id !== 'string' || typeof call.function?.name !== 'string' || typeof call.function.arguments !== 'string') fail();
                const item = { type: 'function_call', call_id: call.id, name: call.function.name, arguments: call.function.arguments };
                input.push(item); publicInput.push(item);
            }
        }
        const body = { model: model.remoteModelId, input, max_output_tokens: max, stream: g.streaming.enabled ?? false,
            store: false, include: ['reasoning.encrypted_content'] };
        if (typeof body.stream !== 'boolean') fail();
        if (g.sampling.temperature !== undefined) { if (!Number.isFinite(g.sampling.temperature) || g.sampling.temperature < 0) fail(); body.temperature = g.sampling.temperature; }
        if (g.sampling.topP !== undefined) { if (!Number.isFinite(g.sampling.topP) || g.sampling.topP < 0 || g.sampling.topP > 1) fail(); body.top_p = g.sampling.topP; }
        if (Object.keys(g.reasoning).length) {
            if (!['none', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(g.reasoning.effort)) fail();
            body.reasoning = { effort: g.reasoning.effort };
        }
        if (g.cache.key !== undefined) { if (typeof g.cache.key !== 'string' || !g.cache.key || g.cache.key.length > 512) fail(); body.prompt_cache_key = g.cache.key; }
        if (g.cache.retention !== undefined) { if (!['in_memory', '24h'].includes(g.cache.retention)) fail(); body.prompt_cache_retention = g.cache.retention; }
        if (ir.tools.length) body.tools = ir.tools.map(tool => {
            keys(tool, ['type', 'function']); keys(tool.function, ['name', 'description', 'parameters', 'strict']);
            if (tool.type !== 'function' || !tool.function?.name || !tool.function.parameters) fail();
            return { type: 'function', ...JSON.parse(serializeNativeDocument(tool.function)) };
        });
        if (Object.keys(g.toolChoice).length) {
            if (!['auto', 'none', 'required'].includes(g.toolChoice.value) || !ir.tools.length) fail();
            body.tool_choice = g.toolChoice.value;
        }
        if (ir.outputContract) {
            const contract = ir.outputContract;
            body.text = { format: contract.type === 'json_schema' ? { type: 'json_schema', ...contract.json_schema }
                : { type: 'json_schema', name: contract.name, schema: contract.schema, ...(contract.strict === undefined ? {} : { strict: contract.strict }) } };
            if (!body.text.format.name || !body.text.format.schema) fail();
        }
        // Native items stay in their original key/array order, including opaque fields.
        const wire = JSON.stringify(body);
        return { endpoint: connection.endpoint, body, publicBody: { ...body, input: publicInput }, wire, binding, sequence, resolved, snapshot };
    };
    return Object.freeze({
        contextTokenizer() { return text => Buffer.byteLength(String(text), 'utf8'); },
        resolveCapabilities: async () => ['generation.streaming', 'generation.tools', 'generation.structured-output', 'generation.reasoning', 'generation.cache', 'generation.continuation.active-execution']
            .map(capability => ({ capability, state: 'supported', provenance: [{ kind: 'adapter-metadata', source: 'native.openai.responses.v1' }] })),
        countTokens({ resolved, promptIr, contextPlan }) {
            return Buffer.byteLength(lower({ resolved, snapshot: { requestId: contextPlan.requestId, promptIr, contextPlan } }).wire, 'utf8') + 256;
        },
        renderRequest({ resolved, snapshot }) {
            return leaseNativeRequest(lower({ resolved, snapshot }));
        },
        async send(rendered, { secret, signal }) {
            const request = consumeNativeRequest(rendered, lower);
            let response;
            try {
                response = await fetchImpl(request.endpoint, { method: 'POST', signal, redirect: 'error',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` }, body: request.wire });
            } catch { if (signal.aborted) throw new GenerationError('generation_cancelled'); throw new ProviderFailure('transport'); }
            if (!response.ok) { await response.body?.cancel(); throw providerHttpFailure(response.status); }
            return { response, binding: request.binding, sequence: request.sequence };
        },
        async parseStream({ response, binding, sequence }, { onChunk, onUsage } = {}) {
            if (!response.headers.get('content-type')?.includes('text/event-stream')) return { value: await response.json(), binding, sequence };
            let pending = ''; let bytesRead = 0; let text = ''; let completed; const done = new Map();
            const decoder = new TextDecoder();
            const consume = line => {
                if (!line.startsWith('data:')) return;
                const value = JSON.parse(line.slice(5));
                if (value.response?.usage) onUsage?.(observedGenerationUsage(value.response.usage, { inputTokens: 'input_tokens', outputTokens: 'output_tokens', totalTokens: 'total_tokens' }));
                if (completed || ['error', 'response.failed', 'response.incomplete'].includes(value.type)) throw new GenerationError('generation_response_invalid');
                if (value.type === 'response.output_text.delta') { text += value.delta; onChunk?.({ text, delta: value.delta }); }
                if (value.type === 'response.output_item.done') { if (done.has(value.output_index)) throw new GenerationError('generation_response_invalid'); done.set(value.output_index, value.item); }
                if (value.type === 'response.completed') completed = value.response;
            };
            for await (const bytes of response.body) {
                bytesRead += bytes.length; if (bytesRead > 8 * 1024 * 1024) throw new GenerationError('generation_response_invalid');
                pending += decoder.decode(bytes, { stream: true }); const lines = pending.split('\n'); pending = lines.pop(); lines.forEach(consume);
            }
            consume(pending + decoder.decode());
            if (!completed || completed.status !== 'completed' || !Array.isArray(completed.output)
                || completed.output.length !== done.size || completed.output.some((item, index) => serializeNativeDocument(item) !== serializeNativeDocument(done.get(index)))) throw new GenerationError('generation_response_invalid');
            return { value: completed, binding, sequence };
        },
        readUsage({ value }) { return observedGenerationUsage(value?.usage, { inputTokens: 'input_tokens', outputTokens: 'output_tokens', totalTokens: 'total_tokens' }); },
        normalizeResponse({ value, binding, sequence }) {
            if (value?.status !== 'completed' || !Array.isArray(value.output) || value.error) throw new GenerationError('generation_response_invalid');
            let text = ''; const toolCalls = [];
            for (const item of value.output) {
                if (!item || !['message', 'reasoning', 'function_call'].includes(item.type)) throw new GenerationError('generation_response_invalid');
                if (item.type === 'message') {
                    if (item.role !== 'assistant' || !Array.isArray(item.content)) throw new GenerationError('generation_response_invalid');
                    for (const part of item.content) {
                        if (part.type !== 'output_text' || typeof part.text !== 'string') throw new GenerationError('generation_response_invalid');
                        text += part.text;
                    }
                } else if (item.type === 'function_call') {
                    if (typeof item.call_id !== 'string' || typeof item.name !== 'string' || typeof item.arguments !== 'string') throw new GenerationError('generation_response_invalid');
                    const args = JSON.parse(item.arguments);
                    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new GenerationError('generation_response_invalid');
                    const raw = { id: item.call_id, type: 'function', function: { name: item.name, arguments: item.arguments } };
                    toolCalls.push({ id: item.call_id, name: item.name, args, raw });
                } else if (typeof item.encrypted_content !== 'string' || !item.encrypted_content) throw new GenerationError('generation_response_invalid');
            }
            const usage = observedGenerationUsage(value.usage, { inputTokens: 'input_tokens', outputTokens: 'output_tokens', totalTokens: 'total_tokens' });
            const providerState = toolCalls.length ? captureNativeEnvelope({ binding, sequence, content: value.output, text, calls: toolCalls.map(call => call.raw) }) : null;
            if (!toolCalls.length) discardNativeEnvelopes(binding);
            return { text, assistantText: text, toolCalls, ...(usage ? { usage } : {}), ...(providerState ? { providerState } : {}),
                observation: { reportedModel: typeof value.model === 'string' ? value.model : null, upstreamIdentity: 'unknown',
                    nativeExecution: nativeExecutionObservation(binding, sequence, providerState),
                    cachedInputTokens: Number.isSafeInteger(value.usage?.input_tokens_details?.cached_tokens) && value.usage.input_tokens_details.cached_tokens >= 0 ? value.usage.input_tokens_details.cached_tokens : null,
                    nativeEnvelope: providerState ? 'captured_active_execution' : 'completed', hiddenAttempts: 'unknown' } };
        },
        assertResponseSafe(response, secret) { assertNativeEnvelopeSafe(response.providerState, secret); },
        discardExecution(rendered) { discardNativeEnvelopes(rendered.binding); },
    });
}
