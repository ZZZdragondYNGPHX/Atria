import { immutable, GenerationError } from '../model-prompt-runtime/execution-utils.js';

// Transport/tokenizer/stream decoding are host ports. No active host configuration is read.
// This minimal adapter supports explicit message and raw-text fixtures; unsupported
// generation controls fail closed until a provider-specific renderer implements them.
export function createGenerationProviderAdapter({ format, send, countTokens, parseStream, capabilities = [] }) {
    if (!['openai-compatible', 'raw-text'].includes(format)) throw new TypeError('Unsupported provider format');
    const metadata = immutable(capabilities);
    return Object.freeze({
        resolveCapabilities: async () => metadata,
        countTokens,
        renderRequest({ resolved, snapshot }) {
            const { generation, model, connection } = resolved;
            const ir = snapshot.promptIr;
            for (const section of ['reasoning', 'cache', 'toolChoice', 'providerExtensions']) {
                if (Object.keys(generation[section]).length) throw new GenerationError('generation_adapter_control_unsupported');
            }
            const allowed = { sampling: ['temperature', 'topP'], output: ['maxTokens'], stop: ['sequences'], streaming: ['enabled'] };
            for (const [section, keys] of Object.entries(allowed)) {
                if (Object.keys(generation[section]).some(key => !keys.includes(key))) throw new GenerationError('generation_adapter_control_unsupported');
            }
            if (Object.keys(connection.options).length || Object.keys(connection.networkPolicy).length
                || Object.keys(model.providerHints).length || Object.keys(model.messageFormat).length) {
                throw new GenerationError('generation_adapter_control_unsupported');
            }
            if (ir.tools.length || ir.outputContract || ir.prefill !== undefined) throw new GenerationError('generation_adapter_prompt_unsupported');
            const maxTokens = generation.output.maxTokens ?? snapshot.contextPlan.budget.reservedOutputTokens;
            if (!Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > snapshot.contextPlan.budget.reservedOutputTokens) {
                throw new GenerationError('generation_adapter_output_budget');
            }
            const body = { model: model.remoteModelId, max_tokens: maxTokens };
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
            if (generation.streaming.enabled !== undefined && typeof generation.streaming.enabled !== 'boolean') throw new GenerationError('generation_adapter_stream_invalid');
            body.stream = generation.streaming.enabled ?? false;
            const messages = [
                ...ir.directives.map(content => ({ role: 'system', content })),
                ...ir.contextSlots.map(content => ({ role: 'system', content })),
                ...ir.history,
                { role: 'user', content: ir.input },
                ...ir.responseDirectives.map(content => ({ role: 'system', content })),
            ];
            if (messages.some(item => !['system', 'user', 'assistant'].includes(item.role) || typeof item.content !== 'string')) {
                throw new GenerationError('generation_adapter_message_invalid');
            }
            if (format === 'openai-compatible') body.messages = messages;
            else body.prompt = messages.map(item => `${item.role}: ${item.content}`).join('\n') + '\nassistant:';
            return immutable({ endpoint: connection.endpoint, transport: connection.transport, body });
        },
        send,
        parseStream,
        normalizeResponse(raw) {
            const text = format === 'openai-compatible' ? raw?.choices?.[0]?.message?.content : raw?.choices?.[0]?.text;
            if (typeof text !== 'string') throw new GenerationError('generation_response_invalid');
            return { text };
        },
    });
}
