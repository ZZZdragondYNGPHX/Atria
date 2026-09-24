import { createServer } from 'node:http';
import { createNativeMessagesProvider } from '../../src/native/adapters/native-messages-provider.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';

function fixture(format, overrides = {}) {
    const resolved = {
        connection: { connectionProfileId: 'conn-test', endpoint: 'https://example.invalid/v1beta', options: {}, networkPolicy: {} },
        model: { remoteModelId: 'test-model', providerHints: {}, messageFormat: {} },
        generation: { sampling: {}, output: { maxTokens: 4096 }, streaming: {}, reasoning: {}, cache: {}, stop: {}, toolChoice: {}, providerExtensions: {}, ...overrides },
    };
    const promptIr = { schemaVersion: 1, requestId: 'test', directives: ['System'], contextSlots: [], history: [], input: 'Hello', responseDirectives: [], tools: [], outputContract: null, provenance: [] };
    const snapshot = { promptIr, contextPlan: { budget: { reservedOutputTokens: 4096 } } };
    return { resolved, snapshot, provider: createNativeMessagesProvider({ format }) };
}

describe.each(['anthropic', 'gemini'])('Native %s transport', format => {
    test.each([false, true])('real HTTP stream=%s uses protocol auth and normalizes text', async streaming => {
        const requests = [];
        const server = createServer(async (req, res) => {
            let raw = ''; for await (const bytes of req) raw += bytes;
            requests.push({ headers: req.headers, url: req.url, body: JSON.parse(raw) });
            if (!streaming) {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify(format === 'anthropic' ? { content: [{ type: 'text', text: '你好' }] } : { candidates: [{ content: { parts: [{ text: '你好' }] } }] }));
            } else {
                res.writeHead(200, { 'content-type': 'text/event-stream' });
                const chunks = format === 'anthropic' ? [
                    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
                    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '你' } },
                    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '好' } },
                ] : ['你', '好'].map(text => ({ candidates: [{ content: { parts: [{ text }] } }] }));
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

    test('signed tool history survives replay and rejects a changed owner or edited content', () => {
        const f = fixture(format);
        const content = format === 'anthropic'
            ? [{ type: 'thinking', thinking: 'provider summary', signature: 'signed-state' }, { type: 'tool_use', id: 'call-1', name: 'lookup', input: { q: 'test' } }]
            : [{ functionCall: { name: 'lookup', args: { q: 'test' } }, thoughtSignature: 'signed-state' }];
        const binding = f.provider.renderRequest(f).binding;
        const normalized = f.provider.normalizeResponse({ binding, value: format === 'anthropic' ? { content } : { candidates: [{ content: { parts: content } }] } });
        f.snapshot.promptIr.input = '';
        f.snapshot.promptIr.history = [
            { role: 'user', content: 'look up' },
            { role: 'assistant', content: normalized.text, tool_calls: normalized.toolCalls.map(call => call.raw), providerState: normalized.providerState },
            { role: 'tool', tool_call_id: normalized.toolCalls[0].id, content: 'result' },
        ];
        expect(JSON.stringify(f.provider.renderRequest(f).body)).toContain('signed-state');
        f.resolved.model.remoteModelId = 'different';
        expect(() => f.provider.renderRequest(f)).toThrow('generation_adapter_control_unsupported');
        f.resolved.model.remoteModelId = 'test-model';
        f.snapshot.promptIr.history[1].content = 'edited';
        expect(() => f.provider.renderRequest(f)).toThrow('generation_adapter_control_unsupported');
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
