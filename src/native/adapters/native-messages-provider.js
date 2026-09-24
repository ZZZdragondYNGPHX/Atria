import { immutable, GenerationError, ProviderFailure } from '../model-prompt-runtime/execution-utils.js';
import { renderPromptMessages } from '../model-prompt-runtime/prompt-renderers.js';

const fail = () => { throw new GenerationError('generation_adapter_control_unsupported'); };
const keys = (value, allowed) => { if (Object.keys(value || {}).some(key => !allowed.includes(key))) fail(); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);

// Provider wire formats are adapters over PromptIR, never another prompt/config authority.
export function createNativeMessagesProvider({ format, fetchImpl = fetch } = {}) {
    if (!['anthropic', 'gemini'].includes(format)) throw new TypeError('Unsupported Native messages provider');
    const anthropic = format === 'anthropic';
    const binding = resolved => ({ provider: format, connectionProfileId: resolved.connection.connectionProfileId, model: resolved.model.remoteModelId });
    const render = ({ resolved, promptIr, reserve }) => {
        const { generation: g, connection, model } = resolved;
        for (const [section, allowed] of Object.entries({ sampling: ['temperature', 'topP'], output: ['maxTokens'],
            stop: ['sequences'], streaming: ['enabled'], toolChoice: ['value', 'name'], providerExtensions: [],
            reasoning: anthropic ? ['mode', 'budgetTokens', 'effort'] : ['budgetTokens', 'level'],
            cache: anthropic ? ['mode', 'ttl'] : [] })) keys(g[section], allowed);
        keys(connection.options, []); keys(connection.networkPolicy, []); keys(model.providerHints, []); keys(model.messageFormat, []);
        if (promptIr.prefill !== undefined) fail();
        const max = g.output.maxTokens ?? reserve;
        if (!Number.isSafeInteger(max) || max < 1 || max > reserve) throw new GenerationError('generation_adapter_output_budget');
        const streaming = g.streaming.enabled ?? false;
        if (typeof streaming !== 'boolean') fail();
        const sequence = renderPromptMessages(promptIr);
        const first = sequence.findIndex(message => message.role !== 'system');
        if (first < 0 || sequence.slice(first).some(message => message.role === 'system')) fail();
        const systems = sequence.slice(0, first).map(message => ({ text: message.content }));
        const callNames = new Map();
        const messages = sequence.slice(first).map(message => {
            for (const call of message.tool_calls || []) callNames.set(call.id, call.function?.name);
            if (message.providerState) {
                const state = message.providerState;
                if (message.role !== 'assistant' || JSON.stringify(state.binding) !== JSON.stringify(binding(resolved))) fail();
                if (state.text !== message.content || JSON.stringify(state.calls) !== JSON.stringify(message.tool_calls || [])) fail();
                return anthropic ? { role: 'assistant', content: state.content } : { role: 'model', parts: state.content };
            }
            if (message.role === 'tool') {
                const name = callNames.get(message.tool_call_id);
                if (!name) fail();
                return anthropic
                    ? { role: 'user', content: [{ type: 'tool_result', tool_use_id: message.tool_call_id, content: message.content }] }
                    : { role: 'user', parts: [{ functionResponse: { name, response: { result: message.content } } }] };
            }
            const parts = message.content ? [anthropic ? { type: 'text', text: message.content } : { text: message.content }] : [];
            for (const call of message.tool_calls || []) {
                const args = JSON.parse(call.function?.arguments);
                if (call.type !== 'function' || !object(args) || !call.id || !call.function.name) fail();
                parts.push(anthropic ? { type: 'tool_use', id: call.id, name: call.function.name, input: args }
                    : { functionCall: { name: call.function.name, args } });
            }
            if (!parts.length) fail();
            return anthropic ? { role: message.role, content: parts } : { role: message.role === 'assistant' ? 'model' : 'user', parts };
        });
        const body = anthropic ? { model: model.remoteModelId, max_tokens: max, stream: streaming, messages }
            : { contents: messages, generationConfig: { maxOutputTokens: max } };
        const config = anthropic ? body : body.generationConfig;
        if (systems.length) {
            if (anthropic) body.system = systems.map(item => ({ type: 'text', ...item }));
            else body.systemInstruction = { parts: systems };
        }
        if (g.sampling.temperature !== undefined) {
            if (!Number.isFinite(g.sampling.temperature) || g.sampling.temperature < 0 || g.sampling.temperature > (anthropic ? 1 : 2)) fail();
            config.temperature = g.sampling.temperature;
        }
        if (g.sampling.topP !== undefined) {
            if (!Number.isFinite(g.sampling.topP) || g.sampling.topP < 0 || g.sampling.topP > 1) fail();
            config[anthropic ? 'top_p' : 'topP'] = g.sampling.topP;
        }
        if (g.stop.sequences !== undefined) {
            if (!Array.isArray(g.stop.sequences) || g.stop.sequences.some(item => typeof item !== 'string')) fail();
            config[anthropic ? 'stop_sequences' : 'stopSequences'] = g.stop.sequences;
        }
        if (promptIr.tools.length) {
            const tools = promptIr.tools.map(tool => {
                keys(tool, ['type', 'function']); keys(tool.function, ['name', 'description', 'parameters', 'strict']);
                if (tool.type !== 'function' || !tool.function?.name || !object(tool.function.parameters)) fail();
                if (tool.function.strict) fail();
                return anthropic ? { name: tool.function.name, description: tool.function.description || '', input_schema: tool.function.parameters }
                    : { name: tool.function.name, description: tool.function.description || '', parametersJsonSchema: tool.function.parameters };
            });
            body.tools = anthropic ? tools : [{ functionDeclarations: tools }];
            const choice = g.toolChoice.value || 'auto';
            if (!['auto', 'none', 'required', 'tool'].includes(choice)) fail();
            if (choice === 'tool' && !tools.some(tool => tool.name === g.toolChoice.name)) fail();
            if (anthropic) body.tool_choice = choice === 'tool' ? { type: 'tool', name: g.toolChoice.name } : { type: choice === 'required' ? 'any' : choice };
            else body.toolConfig = { functionCallingConfig: { mode: { auto: 'AUTO', none: 'NONE', required: 'ANY', tool: 'ANY' }[choice], ...(choice === 'tool' ? { allowedFunctionNames: [g.toolChoice.name] } : {}) } };
        } else if (Object.keys(g.toolChoice).length) fail();
        if (promptIr.outputContract) {
            const contract = promptIr.outputContract;
            if (!object(contract.schema)) fail();
            if (anthropic) body.output_config = { format: { type: 'json_schema', schema: contract.schema } };
            else Object.assign(config, { responseMimeType: 'application/json', responseJsonSchema: contract.schema });
        }
        if (Object.keys(g.reasoning).length) {
            if (anthropic) {
                if (!['adaptive', 'enabled', 'disabled'].includes(g.reasoning.mode)) fail();
                body.thinking = { type: g.reasoning.mode };
                if (g.reasoning.mode === 'enabled') {
                    if (!Number.isSafeInteger(g.reasoning.budgetTokens) || g.reasoning.budgetTokens < 1024 || g.reasoning.budgetTokens >= max) fail();
                    body.thinking.budget_tokens = g.reasoning.budgetTokens;
                } else if (g.reasoning.budgetTokens !== undefined) fail();
                if (g.reasoning.effort !== undefined) {
                    if (g.reasoning.mode !== 'adaptive' || !['low', 'medium', 'high', 'max'].includes(g.reasoning.effort)) fail();
                    body.output_config = { ...body.output_config, effort: g.reasoning.effort };
                }
                if (g.reasoning.mode !== 'disabled' && (config.temperature !== undefined || config.top_p !== undefined || ['tool', 'any'].includes(body.tool_choice?.type))) fail();
            } else {
                if (g.reasoning.budgetTokens !== undefined && g.reasoning.level !== undefined) fail();
                config.thinkingConfig = {};
                if (g.reasoning.budgetTokens !== undefined) {
                    if (!Number.isSafeInteger(g.reasoning.budgetTokens) || g.reasoning.budgetTokens < -1 || g.reasoning.budgetTokens > max) fail();
                    config.thinkingConfig.thinkingBudget = g.reasoning.budgetTokens;
                }
                if (g.reasoning.level !== undefined) {
                    if (!['minimal', 'low', 'medium', 'high'].includes(g.reasoning.level)) fail();
                    config.thinkingConfig.thinkingLevel = g.reasoning.level;
                }
            }
        }
        if (Object.keys(g.cache).length) {
            if (anthropic) {
                if (g.cache.mode !== 'ephemeral' || (g.cache.ttl !== undefined && !['5m', '1h'].includes(g.cache.ttl))) fail();
                body.cache_control = { type: 'ephemeral', ...(g.cache.ttl ? { ttl: g.cache.ttl } : {}) };
            } else fail(); // External cached contexts cannot bypass Native context budgeting.
        }
        const endpoint = new URL(connection.endpoint);
        if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) fail();
        if (!anthropic) {
            endpoint.pathname = endpoint.pathname.replace(/\/$/, '') + '/models/' + encodeURIComponent(model.remoteModelId.replace(/^models\//, '')) + (streaming ? ':streamGenerateContent' : ':generateContent');
            if (streaming) endpoint.searchParams.set('alt', 'sse');
        }
        return { endpoint: endpoint.href, body, binding: binding(resolved) };
    };
    return Object.freeze({
        resolveCapabilities: async () => ['generation.streaming', 'generation.tools', 'generation.structured-output', 'generation.reasoning', 'generation.cache'].map(capability => ({ capability, state: capability === 'generation.cache' && !anthropic ? 'unsupported' : 'supported', provenance: [{ kind: 'adapter-metadata', source: 'native.' + format }] })),
        countTokens({ resolved, promptIr, contextPlan }) {
            const request = render({ resolved, promptIr, reserve: contextPlan.budget.reservedOutputTokens });
            // Provider tokenizers differ. A byte upper bound deliberately avoids
            // treating an OpenAI encoding as an exact Claude/Gemini tokenizer.
            return Buffer.byteLength(JSON.stringify(request.body), 'utf8') + 256;
        },
        renderRequest({ resolved, snapshot }) { return immutable(render({ resolved, promptIr: snapshot.promptIr, reserve: snapshot.contextPlan.budget.reservedOutputTokens })); },
        async send(request, { secret, signal }) {
            let response;
            try {
                response = await fetchImpl(request.endpoint, { method: 'POST', redirect: 'error', signal,
                    headers: { 'Content-Type': 'application/json', ...(anthropic ? { 'x-api-key': secret, 'anthropic-version': '2023-06-01' } : { 'x-goog-api-key': secret }) }, body: JSON.stringify(request.body) });
            } catch {
                if (signal?.aborted) throw new GenerationError('generation_cancelled');
                throw new ProviderFailure('transport');
            }
            if (!response.ok) { await response.body?.cancel(); throw new ProviderFailure(response.status === 429 || response.status >= 500 ? 'provider' : 'application'); }
            return { response, binding: request.binding };
        },
        async parseStream({ response, binding }, { onChunk } = {}) {
            if (!response.headers.get('content-type')?.includes('text/event-stream')) return { value: await response.json(), binding };
            const blocks = []; let pending = ''; let text = ''; let size = 0; const decoder = new TextDecoder();
            const consume = line => {
                if (!line.startsWith('data:')) return;
                const payload = line.slice(5).trim(); if (!payload || payload === '[DONE]') return;
                const value = JSON.parse(payload); if (value.error || value.type === 'error') throw new GenerationError('generation_response_invalid');
                let delta = '';
                if (anthropic) {
                    if (value.type === 'content_block_start') blocks[value.index] = { ...value.content_block };
                    if (value.type === 'content_block_delta') {
                        const block = blocks[value.index]; if (!block) fail();
                        const d = value.delta;
                        if (d.type === 'text_delta') { block.text = (block.text || '') + d.text; delta = d.text; } else if (d.type === 'thinking_delta') block.thinking = (block.thinking || '') + d.thinking;
                        else if (d.type === 'signature_delta') block.signature = (block.signature || '') + d.signature;
                        else if (d.type === 'input_json_delta') block.partial = (block.partial || '') + d.partial_json;
                        else fail();
                    }
                } else {
                    const parts = value.candidates?.[0]?.content?.parts || [];
                    blocks.push(...parts); delta = parts.filter(part => !part.thought && typeof part.text === 'string').map(part => part.text).join('');
                }
                text += delta; if (delta) onChunk?.({ text, delta });
            };
            for await (const bytes of response.body) {
                size += bytes.length; if (size > 8 * 1024 * 1024) throw new GenerationError('generation_response_invalid');
                pending += decoder.decode(bytes, { stream: true }); const lines = pending.split('\n'); pending = lines.pop(); lines.forEach(consume);
            }
            consume(pending + decoder.decode());
            for (const block of blocks) if (block.partial !== undefined) { block.input = JSON.parse(block.partial); delete block.partial; }
            return { value: anthropic ? { content: blocks } : { candidates: [{ content: { parts: blocks } }] }, binding };
        },
        normalizeResponse({ value, binding }) {
            const content = anthropic ? value?.content : value?.candidates?.[0]?.content?.parts;
            if (!Array.isArray(content) || value.error || (!anthropic && value.promptFeedback?.blockReason)) throw new GenerationError('generation_response_invalid');
            if (content.some(part => !object(part) || (anthropic
                ? !['text', 'tool_use', 'thinking', 'redacted_thinking'].includes(part.type) || (part.type === 'text' && typeof part.text !== 'string')
                : (typeof part.text !== 'string' && !object(part.functionCall))))) throw new GenerationError('generation_response_invalid');
            const text = content.filter(part => anthropic ? part.type === 'text' : !part.thought && typeof part.text === 'string').map(part => part.text).join('');
            const toolCalls = content.filter(part => anthropic ? part.type === 'tool_use' : part.functionCall).map((part, index) => {
                const name = anthropic ? part.name : part.functionCall.name; const args = anthropic ? part.input : part.functionCall.args;
                const id = anthropic ? part.id : (part.functionCall.id || `gemini_call_${index}`);
                if (typeof name !== 'string' || typeof id !== 'string' || !object(args)) throw new GenerationError('generation_response_invalid');
                return { id, name, args, raw: { id, type: 'function', function: { name, arguments: JSON.stringify(args) } } };
            });
            return { text, assistantText: text, toolCalls, providerState: { binding, content, text, calls: toolCalls.map(call => call.raw) } };
        },
    });
}
