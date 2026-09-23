import { getEncoding } from 'js-tiktoken';
import { immutable, GenerationError, ProviderFailure } from '../model-prompt-runtime/execution-utils.js';
import { renderPromptMessages } from '../model-prompt-runtime/prompt-renderers.js';

// Explicit-config transport. No preset, active model, browser settings or secret lookup.
export function createHttpGenerationProvider({ format = 'openai-compatible', fetchImpl = fetch } = {}) {
    const messages = format === 'openai-compatible';
    if (!messages && format !== 'raw-text') throw new TypeError('Unsupported Native provider');
    const supported = ['generation.streaming', ...(messages ? ['generation.tools', 'generation.structured-output'] : [])];
    const render = ({ resolved, promptIr, reserve }) => {
        const { generation, model, connection } = resolved;
        for (const section of ['reasoning', 'cache', 'providerExtensions']) {
            if (Object.keys(generation[section]).length) throw new GenerationError('generation_adapter_control_unsupported');
        }
        if (Object.keys(connection.networkPolicy).length || Object.keys(connection.options).length
            || Object.keys(model.messageFormat).length || Object.keys(model.providerHints).length) throw new GenerationError('generation_adapter_control_unsupported');
        const allowed = { sampling: ['temperature', 'topP'], output: ['maxTokens'], stop: ['sequences'], streaming: ['enabled'], toolChoice: ['value'] };
        for (const [section, keys] of Object.entries(allowed)) {
            if (Object.keys(generation[section]).some(key => !keys.includes(key))) throw new GenerationError('generation_adapter_control_unsupported');
        }
        const maxTokens = generation.output.maxTokens ?? reserve;
        if (!Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > reserve) throw new GenerationError('generation_adapter_output_budget');
        const sequence = renderPromptMessages(promptIr);
        const body = { model: model.remoteModelId, max_tokens: maxTokens, stream: generation.streaming.enabled ?? false };
        if (typeof body.stream !== 'boolean') throw new GenerationError('generation_adapter_stream_invalid');
        if (messages) body.messages = sequence;
        else {
            if (promptIr.tools.length || promptIr.outputContract || sequence.some(item => item.role === 'tool' || item.tool_calls)) throw new GenerationError('generation_adapter_prompt_unsupported');
            body.prompt = sequence.map(item => `${item.role}: ${item.content}`).join('\n') + (promptIr.prefill === undefined ? '\nassistant:' : '');
        }
        if (generation.sampling.temperature !== undefined) {
            if (!Number.isFinite(generation.sampling.temperature) || generation.sampling.temperature < 0) throw new GenerationError('generation_adapter_sampling_invalid');
            body.temperature = generation.sampling.temperature;
        }
        if (generation.sampling.topP !== undefined) {
            if (!Number.isFinite(generation.sampling.topP) || generation.sampling.topP < 0 || generation.sampling.topP > 1) throw new GenerationError('generation_adapter_sampling_invalid');
            body.top_p = generation.sampling.topP;
        }
        if (generation.stop.sequences !== undefined) {
            if (!Array.isArray(generation.stop.sequences) || generation.stop.sequences.some(item => typeof item !== 'string')) throw new GenerationError('generation_adapter_stop_invalid');
            body.stop = generation.stop.sequences;
        }
        if (promptIr.tools.length) {
            body.tools = promptIr.tools;
            body.tool_choice = generation.toolChoice.value ?? 'auto';
        } else if (generation.toolChoice.value !== undefined) throw new GenerationError('generation_adapter_prompt_unsupported');
        if (promptIr.outputContract) body.response_format = { type: 'json_schema', json_schema: promptIr.outputContract };
        return body;
    };
    return Object.freeze({
        resolveCapabilities: async () => supported.map(capability => ({ capability, state: 'supported', provenance: [{ kind: 'adapter-metadata', source: `native.${format}` }] })),
        countTokens({ resolved, promptIr, contextPlan }) {
            // Tokenizer is explicitly configured. Do not infer it from active host settings.
            const encoding = resolved.model.tokenizer?.encoding;
            if (!['cl100k_base', 'o200k_base'].includes(encoding)) throw new GenerationError('generation_adapter_control_unsupported');
            const body = render({ resolved, promptIr, reserve: contextPlan.budget.reservedOutputTokens });
            const encoder = getEncoding(encoding);
            return encoder.encode(JSON.stringify(body)).length + 32 * (body.messages?.length ?? 1);
        },
        renderRequest({ resolved, snapshot }) {
            return immutable({ endpoint: resolved.connection.endpoint,
                body: render({ resolved, promptIr: snapshot.promptIr, reserve: snapshot.contextPlan.budget.reservedOutputTokens }) });
        },
        async send(rendered, { secret, signal }) {
            let response;
            try {
                response = await fetchImpl(rendered.endpoint, { method: 'POST', signal, redirect: 'error',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` }, body: JSON.stringify(rendered.body) });
            } catch {
                if (signal.aborted) throw new GenerationError('generation_cancelled');
                throw new ProviderFailure('transport');
            }
            if (!response.ok) {
                await response.body?.cancel();
                throw new ProviderFailure(response.status === 429 || response.status >= 500 ? 'provider' : 'application');
            }
            return response;
        },
        async parseStream(response, { onChunk } = {}) {
            if (!response.headers.get('content-type')?.includes('text/event-stream')) return response.json();
            let pending = ''; let text = ''; const calls = new Map();
            const decoder = new TextDecoder();
            const consume = line => {
                if (!line.startsWith('data:')) return;
                const value = line.slice(5).trim();
                if (!value || value === '[DONE]') return;
                const chunk = JSON.parse(value);
                if (chunk.error) throw new GenerationError('generation_response_invalid');
                const delta = chunk.choices?.[0]?.delta;
                const content = messages ? (delta?.content || '') : (chunk.choices?.[0]?.text || '');
                text += content;
                if (content) onChunk?.({ text, delta: content });
                for (const call of delta?.tool_calls || []) {
                    const previous = calls.get(call.index) || { id: '', type: 'function', function: { name: '', arguments: '' } };
                    previous.id += call.id || '';
                    previous.function.name += call.function?.name || '';
                    previous.function.arguments += call.function?.arguments || '';
                    calls.set(call.index, previous);
                }
            };
            for await (const bytes of response.body) {
                pending += decoder.decode(bytes, { stream: true });
                const lines = pending.split('\n'); pending = lines.pop();
                lines.forEach(consume);
                if (text.length + pending.length > 8 * 1024 * 1024) throw new GenerationError('generation_response_invalid');
            }
            consume(pending + decoder.decode());
            return { choices: [{ text, message: { content: text, tool_calls: [...calls.values()] } }] };
        },
        normalizeResponse(raw) {
            const choice = raw?.choices?.[0];
            if (!choice || (messages && !choice.message)) throw new GenerationError('generation_response_invalid');
            const text = messages ? (choice?.message?.content ?? '') : choice?.text;
            if (typeof text !== 'string') throw new GenerationError('generation_response_invalid');
            const toolCalls = (choice?.message?.tool_calls || []).map(call => {
                if (call.type !== 'function' || typeof call.function?.name !== 'string' || typeof call.id !== 'string') throw new GenerationError('generation_response_invalid');
                const args = JSON.parse(call.function.arguments);
                if (!args || typeof args !== 'object' || Array.isArray(args)) throw new GenerationError('generation_response_invalid');
                return { id: call.id, name: call.function.name, args, raw: call };
            });
            return { text, assistantText: text, toolCalls };
        },
    });
}
