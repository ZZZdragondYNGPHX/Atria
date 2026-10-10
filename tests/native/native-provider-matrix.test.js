import { createServer } from 'node:http';
import { createNativeMessagesProvider } from '../../src/native/adapters/native-messages-provider.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { renderPromptMessages } from '../../src/native/model-prompt-runtime/prompt-renderers.js';

function fixture(format, overrides = {}) {
    const resolved = {
        pathFingerprint: 'a'.repeat(64), route: {},
        connection: { connectionProfileId: 'conn-test', endpoint: 'https://example.invalid/v1beta', options: {}, networkPolicy: {} },
        model: { remoteModelId: 'test-model', providerHints: {}, messageFormat: {} },
        generation: { sampling: {}, output: { maxTokens: 4096 }, streaming: {}, reasoning: {}, cache: {}, stop: {}, toolChoice: {}, providerExtensions: {}, ...overrides },
    };
    const promptIr = { schemaVersion: 1, requestId: 'test', directives: ['System'], contextSlots: [], history: [], input: 'Hello', responseDirectives: [], tools: [], outputContract: null, provenance: [] };
    const snapshot = { requestId: 'test', promptIr, contextPlan: { source: {}, items: [], budget: { reservedOutputTokens: 4096 } } };
    return { resolved, snapshot, provider: createNativeMessagesProvider({ format }) };
}

describe.each(['anthropic', 'gemini'])('Native %s transport', format => {
    test.each(['valid', 'missing_terminal', 'missing_block_stop', 'missing_signature', 'incomplete'])('G04 native stream %s cannot publish an incomplete envelope', async kind => {
        const signed = format === 'anthropic'
            ? [{ type: 'thinking', thinking: 'summary', signature: 'native-signature' }, { type: 'text', text: 'done' }]
            : [{ text: 'done', thoughtSignature: 'native-signature' }];
        if (kind === 'missing_signature') {
            if (format === 'anthropic') delete signed[0].signature;
            else signed[0].thoughtSignature = '';
        }
        const events = format === 'anthropic'
            ? [{ type: 'message_start', message: { content: [] } }, ...signed.flatMap((content_block, index) => [
                { type: 'content_block_start', index, content_block },
                ...(kind === 'missing_block_stop' ? [] : [{ type: 'content_block_stop', index }]),
            ]), { type: 'message_delta', delta: { stop_reason: kind === 'incomplete' ? 'max_tokens' : 'end_turn' } },
            ...(kind === 'missing_terminal' ? [] : [{ type: 'message_stop' }])]
            : [{ candidates: [{ content: { parts: signed }, ...(kind === 'missing_terminal' || kind === 'missing_block_stop' ? {} : { finishReason: kind === 'incomplete' ? 'MAX_TOKENS' : 'STOP' }) }] }];
        const f = fixture(format);
        const provider = createNativeMessagesProvider({ format, fetchImpl: async () => new Response(events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join(''),
            { headers: { 'Content-Type': 'text/event-stream' } }) });
        const response = await provider.send(provider.renderRequest(f), { secret: 'synthetic-native-secret', signal: new AbortController().signal });
        const consume = async () => provider.normalizeResponse(await provider.parseStream(response));
        if (kind === 'valid') expect((await consume()).text).toBe('done');
        else await expect(consume()).rejects.toMatchObject({ code: 'generation_response_invalid' });
    });

    test('G04 nonstream missing signature/opaque data is not a valid native envelope', () => {
        const f = fixture(format); const binding = f.provider.renderRequest(f).binding;
        const content = format === 'anthropic' ? [{ type: 'redacted_thinking' }] : [{ text: 'summary', thoughtSignature: '' }];
        expect(() => f.provider.normalizeResponse({ binding, value: format === 'anthropic'
            ? { content, stop_reason: 'end_turn' } : { candidates: [{ content: { parts: content }, finishReason: 'STOP' }] } })).toThrow('generation_response_invalid');
    });
    test.each([false, true])('real HTTP stream=%s uses protocol auth and normalizes text', async streaming => {
        const requests = [];
        const server = createServer(async (req, res) => {
            let raw = ''; for await (const bytes of req) raw += bytes;
            requests.push({ headers: req.headers, url: req.url, body: JSON.parse(raw) });
            if (!streaming) {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify(format === 'anthropic' ? { content: [{ type: 'text', text: '你好' }], stop_reason: 'end_turn' } : { candidates: [{ content: { parts: [{ text: '你好' }] }, finishReason: 'STOP' }] }));
            } else {
                res.writeHead(200, { 'content-type': 'text/event-stream' });
                const chunks = format === 'anthropic' ? [
                    { type: 'message_start', message: { content: [] } },
                    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
                    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '你' } },
                    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '好' } },
                    { type: 'content_block_stop', index: 0 },
                    { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
                    { type: 'message_stop' },
                ] : ['你', '好'].map((text, index) => ({ candidates: [{ content: { parts: [{ text }] }, ...(index === 1 ? { finishReason: 'STOP' } : {}) }] }));
                res.end(chunks.map(chunk => 'data: ' + JSON.stringify(chunk) + '\n\n').join(''));
            }
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        try {
            const f = fixture(format, { streaming: { enabled: streaming } });
            f.resolved.connection.endpoint = `http://127.0.0.1:${server.address().port}/v1beta`;
            const rendered = f.provider.renderRequest(f);
            expect(JSON.stringify(rendered)).not.toContain('test-secret');
            const response = await f.provider.send(rendered, { secret: 'test-secret', signal: new AbortController().signal });
            const deltas = [];
            const result = f.provider.normalizeResponse(await f.provider.parseStream(response, { onChunk: chunk => deltas.push(chunk.delta) }));
            expect(result.assistantText).toBe('你好');
            expect(deltas.join('')).toBe(streaming ? '你好' : '');
            expect(requests[0].headers[format === 'anthropic' ? 'x-api-key' : 'x-goog-api-key']).toBe('test-secret');
            expect(requests[0].headers.authorization).toBeUndefined();
            expect(requests[0].url).toBe(format === 'gemini' ? '/v1beta/models/test-model:' + (streaming ? 'streamGenerateContent?alt=sse' : 'generateContent') : '/v1beta');
        } finally {
            server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
        }
    });

    test('signed tool history remains private, survives actual replay and rejects a changed target or edited content', async () => {
        const f = fixture(format);
        f.snapshot.promptIr.input = 'look up';
        const content = format === 'anthropic'
            ? [{ type: 'thinking', thinking: 'provider summary', signature: 'signed-state' }, { type: 'tool_use', id: 'call-1', name: 'lookup', input: { q: 'test' } }]
            : [{ functionCall: { name: 'lookup', args: { q: 'test' } }, thoughtSignature: 'signed-state' }];
        const binding = f.provider.renderRequest(f).binding;
        const normalized = f.provider.normalizeResponse({ binding, sequence: renderPromptMessages(f.snapshot.promptIr), value: format === 'anthropic' ? { content, stop_reason: 'tool_use' } : { candidates: [{ content: { parts: content }, finishReason: 'STOP' }] } });
        expect(JSON.stringify(normalized)).not.toContain('signed-state');
        f.snapshot.promptIr.input = '';
        f.snapshot.promptIr.history = [
            { role: 'user', content: 'look up' },
            { role: 'assistant', content: normalized.text, tool_calls: normalized.toolCalls.map(call => call.raw), providerState: normalized.providerState },
            { role: 'tool', tool_call_id: normalized.toolCalls[0].id, content: 'result' },
        ];
        const rendered = f.provider.renderRequest(f);
        expect(JSON.stringify(rendered)).not.toContain('signed-state');
        let wire;
        const transport = createNativeMessagesProvider({ format, fetchImpl: async (_, options) => { wire = options.body; return new Response('{}'); } });
        await transport.send(rendered, { secret: 'synthetic-secret' });
        expect(wire).toContain('signed-state');
        f.resolved.model.remoteModelId = 'different';
        expect(() => f.provider.renderRequest(f)).toThrow('generation_continuation_unavailable');
        f.resolved.model.remoteModelId = 'test-model';
        f.snapshot.promptIr.history[1].content = 'edited';
        expect(() => f.provider.renderRequest(f)).toThrow('generation_continuation_unavailable');
    });

    test('unknown options and interleaved system authority fail before HTTP', () => {
        const f = fixture(format);
        f.resolved.connection.options = { arbitrary: true };
        expect(() => f.provider.renderRequest(f)).toThrow();
        f.resolved.connection.options = {};
        f.snapshot.promptIr.responseDirectives = ['post-input authority'];
        expect(() => f.provider.renderRequest(f)).toThrow();
    });

    test('unsupported response modalities fail instead of silently dropping content', () => {
        const f = fixture(format);
        const value = format === 'anthropic' ? { content: [{ type: 'image', source: {} }] }
            : { candidates: [{ content: { parts: [{ inlineData: {} }] } }] };
        expect(() => f.provider.normalizeResponse({ value })).toThrow('generation_response_invalid');
    });
});

test('Gemini external cached content cannot bypass Native context accounting', async () => {
    const f = fixture('gemini', { cache: { cachedContent: 'cachedContents/example' } });
    expect(() => f.provider.renderRequest(f)).toThrow('generation_adapter_control_unsupported');
    expect(await f.provider.resolveCapabilities()).toContainEqual(expect.objectContaining({ capability: 'generation.cache', state: 'unsupported' }));
});

test('provider controls map without leaking settings between protocols', () => {
    const claude = fixture('anthropic', { reasoning: { mode: 'adaptive', effort: 'high' }, cache: { mode: 'ephemeral', ttl: '1h' } });
    expect(claude.provider.renderRequest(claude).body).toMatchObject({ thinking: { type: 'adaptive' }, output_config: { effort: 'high' }, cache_control: { type: 'ephemeral', ttl: '1h' } });
    const gemini = fixture('gemini', { reasoning: { budgetTokens: 1024 } });
    expect(gemini.provider.renderRequest(gemini).body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 1024 });
    const openai = fixture('anthropic', { reasoning: { effort: 'high' }, cache: { retention: '24h', key: 'cache-key' } });
    const request = createHttpGenerationProvider().renderRequest(openai);
    expect(request.body).toMatchObject({ reasoning_effort: 'high', max_completion_tokens: 4096, prompt_cache_key: 'cache-key', prompt_cache_retention: '24h' });
    expect(request.body.max_tokens).toBeUndefined();
    expect(() => createHttpGenerationProvider({ format: 'raw-text' }).renderRequest(openai)).toThrow();
});

describe.each(['openai-compatible', 'anthropic', 'gemini'])('%s HTTP failures', format => {
    test.each([[400, 'generation_provider_request_rejected'], [422, 'generation_provider_request_rejected'],
        [401, 'generation_provider_authentication_failed'], [403, 'generation_provider_authentication_failed'],
        [404, 'generation_provider_endpoint_not_found']])('HTTP %s exposes only a safe code', async (status, code) => {
        const fetchImpl = async () => new Response('raw provider failure with test-secret', { status });
        const provider = format === 'openai-compatible' ? createHttpGenerationProvider({ fetchImpl })
            : createNativeMessagesProvider({ format, fetchImpl });
        let failure;
        try { await provider.send(provider.renderRequest(fixture(format === 'openai-compatible' ? 'anthropic' : format)),
            { secret: 'test-secret', signal: new AbortController().signal }); } catch (error) { failure = error; }
        expect(failure).toMatchObject({ name: 'GenerationError', code, message: code });
        expect(failure.cause).toBeUndefined();
        expect(JSON.stringify(failure)).not.toContain('test-secret');
    });
    test.each([429, 503])('HTTP %s keeps provider fallback classification', async status => {
        const fetchImpl = async () => new Response('temporary failure', { status });
        const provider = format === 'openai-compatible' ? createHttpGenerationProvider({ fetchImpl })
            : createNativeMessagesProvider({ format, fetchImpl });
        await expect(provider.send(provider.renderRequest(fixture(format === 'openai-compatible' ? 'anthropic' : format)),
            { secret: 'test-secret', signal: new AbortController().signal })).rejects.toMatchObject({ kind: 'provider' });
    });
});

test('explicit gateway mode adapts non-string enums on the wire and preserves canonical tool authority', () => {
    const f = fixture('anthropic');
    const provider = createHttpGenerationProvider();
    f.snapshot.promptIr.tools = [{ type: 'function', function: { name: 'confirm', parameters: {
        type: 'object', properties: { confirmed: { type: 'boolean', enum: [true] },
            count: { type: 'integer', enum: [1, 2] }, nested: { type: 'array', items: { type: 'string', enum: ['yes', 'no'] } } },
        required: ['confirmed'], additionalProperties: false,
    } } }];
    const canonical = structuredClone(f.snapshot.promptIr.tools);
    expect(provider.renderRequest(f).body.tools).toEqual(canonical);
    f.resolved.connection.options = { toolSchemaMode: 'string-enums' };
    const schema = provider.renderRequest(f).body.tools[0].function.parameters;
    expect(schema.properties.confirmed).toEqual({ type: 'boolean', description: 'Allowed values: [true].' });
    expect(schema.properties.count.enum).toBeUndefined();
    expect(schema.properties.nested.items.enum).toEqual(['yes', 'no']);
    expect(schema.required).toEqual(['confirmed']); expect(schema.additionalProperties).toBe(false);
    expect(f.snapshot.promptIr.tools).toEqual(canonical);
    f.snapshot.promptIr.tools[0].function.strict = true;
    expect(() => provider.renderRequest(f)).toThrow('generation_adapter_control_unsupported');
    f.resolved.connection.options = { toolSchemaMode: 'invalid' };
    expect(() => provider.renderRequest(f)).toThrow('generation_adapter_control_unsupported');
});

test('explicit streaming and output floor support thinking gateways within the reserved model budget', () => {
    const f = fixture('anthropic', { output: { maxTokens: 512 }, streaming: { enabled: false } });
    const provider = createHttpGenerationProvider();
    expect(provider.renderRequest(f).body).toMatchObject({ max_tokens: 512, stream: false });
    f.resolved.connection.options = { minimumOutputTokens: 4096, responseMode: 'stream' };
    expect(provider.renderRequest(f).body).toMatchObject({ max_tokens: 4096, stream: true });
    expect(f.resolved.generation.output.maxTokens).toBe(512);
    expect(f.resolved.generation.streaming.enabled).toBe(false);
    f.resolved.generation.reasoning = { effort: 'low' };
    const body = provider.renderRequest(f).body;
    expect(body.max_completion_tokens).toBe(4096); expect(body.max_tokens).toBeUndefined();
    f.resolved.connection.options.minimumOutputTokens = 4097;
    expect(() => provider.renderRequest(f)).toThrow('generation_adapter_output_budget');
});

test.each([{ minimumOutputTokens: -1 }, { minimumOutputTokens: 1.5 }, { responseMode: 'guess' }])('invalid gateway controls fail before sending: %j', options => {
    const f = fixture('anthropic'); f.resolved.connection.options = options;
    expect(() => createHttpGenerationProvider().renderRequest(f)).toThrow('generation_adapter_control_unsupported');
    expect(() => createHttpGenerationProvider({ format: 'raw-text' }).renderRequest(f)).toThrow('generation_adapter_control_unsupported');
});
