import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createMcpHttpClient, MCP_PROTOCOL_VERSION } from '../../src/native/mcp-http-client.js';

const url = 'http://127.0.0.1:12345/mcp';
function fixture(overrides = {}) {
    const calls = [];
    const client = createMcpHttpClient({ url, toolNames: ['stats'], resourceUris: ['fixture://public'], fetchImpl: async (_url, options) => {
        const request = JSON.parse(options.body);
        calls.push(request);
        if (!('id' in request)) return new Response(null, { status: 202 });
        const defaults = {
            initialize: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: { tools: {}, resources: {} }, serverInfo: { name: 'fixture', version: '1' } },
            'tools/list': { tools: [{ name: 'stats' }, { name: 'denied' }] },
            'tools/call': { content: [{ type: 'text', text: 'ok' }] },
            'resources/list': { resources: [{ uri: 'fixture://public' }, { uri: 'file://private' }] },
            'resources/read': { contents: [{ uri: 'fixture://public', text: 'public', mimeType: 'text/plain' }] },
        };
        return overrides.response?.(request, options) || new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: overrides[request.method] || defaults[request.method] }), { headers: { 'content-type': 'application/json' } });
    }, ...overrides.options });
    return { client, calls };
}

test('exact initialization, allowlist discovery, content and per-operation hooks', async () => {
    const { client, calls } = fixture();
    const methods = [];
    const options = { aroundRequest: async ({ method }, operation) => { methods.push(method); return operation(); } };
    const init = await client.initialize(options);
    assert.match(init.evidence.responseFingerprint, /^[a-f0-9]{64}$/);
    assert.equal('sessionId' in init.evidence, false);
    assert.deepEqual((await client.listTools(options)).result.tools, [{ name: 'stats' }]);
    assert.equal((await client.callTool('stats', { text: 'public' }, options)).result.content[0].text, 'ok');
    assert.equal((await client.listResources(options)).result.resources.length, 1);
    assert.equal((await client.readResource('fixture://public', options)).result.contents[0].text, 'public');
    assert.deepEqual(methods, calls.map(call => call.method));
    assert.deepEqual(calls[0].params.capabilities, {});
    assert.equal(calls[1].method, 'notifications/initialized');
    await assert.rejects(client.callTool('denied', {}), { code: 'mcp_tool_denied', dispatched: false });
    await assert.rejects(client.readResource('file://private'), { code: 'mcp_resource_denied' });
    assert.equal(calls.length, 6);
});

for (const endpoint of ['http://localhost/mcp', 'http://127.1/mcp', 'http://2130706433/mcp', 'http://0x7f000001/mcp', 'http://user@127.0.0.1/mcp', 'http://127.0.0.1.evil/mcp', 'http://127.0.0.1/mcp#x']) {
    test(`reject endpoint ${endpoint}`, () => assert.throws(() => createMcpHttpClient({ url: endpoint }), { code: 'mcp_endpoint_denied' }));
}
test('reject protocol fallback before initialized notification', async () => {
    const { client, calls } = fixture({ initialize: { protocolVersion: '2025-03-26', capabilities: {} } });
    await assert.rejects(client.initialize(), { code: 'mcp_protocol_unsupported' });
    assert.equal(calls.length, 1);
});
for (const [name, response, code] of [
    ['truncated SSE', () => new Response('event: message', { headers: { 'content-type': 'text/event-stream' } }), 'mcp_transport_unknown'],
    ['HTML', () => new Response('<html>', { headers: { 'content-type': 'text/html' } }), 'mcp_media_unsupported'],
    ['callback', () => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sampling/createMessage' }), { headers: { 'content-type': 'application/json' } }), 'mcp_envelope_invalid'],
    ['batch', () => new Response('[]', { headers: { 'content-type': 'application/json' } }), 'mcp_envelope_invalid'],
    ['redirect', () => new Response(null, { status: 302, headers: { location: 'http://example.com' } }), 'mcp_http_error'],
]) {
    test(`reject ${name} without retry`, async () => {
        const { client, calls } = fixture({ response });
        await assert.rejects(client.initialize(), { code, outcome: 'unknown', dispatched: true });
        assert.equal(calls.length, 1);
    });
}
test('request/result byte bounds and denial before dispatch', async () => {
    const { client, calls } = fixture({ options: { maxRequestBytes: 250, maxResponseBytes: 400 } });
    await client.initialize();
    await assert.rejects(client.callTool('stats', { text: 'x'.repeat(500) }), { code: 'mcp_request_too_large' });
    assert.equal(calls.length, 2);
    const oversized = fixture({ options: { maxResponseBytes: 20 } });
    await assert.rejects(oversized.client.initialize(), { code: 'mcp_response_too_large' });
});
for (const content of [[{ type: 'resource_link', uri: 'http://example.com' }], [{ type: 'image', data: 'AA==' }], [{ type: 'text', text: '<script>', mimeType: 'text/html' }]]) {
    test(`reject unsafe content ${content[0].type}/${content[0].mimeType || ''}`, async () => {
        const { client } = fixture({ 'tools/call': { content } });
        await client.initialize();
        await assert.rejects(client.callTool('stats', {}), { code: 'mcp_content_unsupported' });
    });
}
test('cancelled dispatched operation remains uncertain and advisory cancellation is metered', async () => {
    const abort = new AbortController();
    const { client, calls } = fixture({ response: request => {
        if (request.method === 'tools/call') { abort.abort(); throw new Error('closed'); }
    } });
    await client.initialize();
    const methods = [];
    await assert.rejects(client.callTool('stats', {}, { signal: abort.signal, aroundRequest: async ({ method }, operation) => { methods.push(method); return operation(); } }), { code: 'mcp_cancelled', outcome: 'cancelled', dispatched: true, cancellationNotification: 'acknowledged' });
    assert.deepEqual(methods, ['tools/call', 'notifications/cancelled']);
    assert.equal(calls.at(-1).params.requestId, calls.at(-2).id);
});
test('admission rejection and pre-abort never dispatch', async () => {
    const { client, calls } = fixture();
    await assert.rejects(client.initialize({ aroundRequest: async () => { throw new Error('budget'); } }), /budget/);
    const abort = new AbortController();
    abort.abort();
    await assert.rejects(client.initialize({ signal: abort.signal }));
    assert.equal(calls.length, 0);
});
test('invalid UTF-8 is not silently replaced', async () => {
    const { client } = fixture({ response: () => new Response(Buffer.from([0xff]), { headers: { 'content-type': 'application/json' } }) });
    await assert.rejects(client.initialize(), { code: 'mcp_transport_unknown', outcome: 'unknown' });
});
test('unsupported streamed server request is cancelled', async () => {
    let cancelled = false;
    const { client } = fixture({ response: () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('data: {"jsonrpc":"2.0","id":1,"method":"sampling/createMessage"}\n\n')); }, cancel() { cancelled = true; } }), { headers: { 'content-type': 'text/event-stream' } }) });
    await assert.rejects(client.initialize(), { code: 'mcp_envelope_invalid' });
    assert.equal(cancelled, true);
});
test('external metadata is projected out of tool and resource output', async () => {
    const { client } = fixture({
        'tools/call': { _meta: { secret: 'fixture' }, content: [{ type: 'text', text: 'ok', _meta: { x: 1 } }], structuredContent: { count: 2 }, isError: false },
        'resources/read': { _meta: { x: 1 }, contents: [{ uri: 'fixture://public', text: 'public', _meta: { x: 1 } }] },
    });
    await client.initialize();
    assert.deepEqual((await client.callTool('stats', {})).result, { content: [{ type: 'text', text: 'ok' }], structuredContent: { count: 2 }, isError: false });
    assert.deepEqual((await client.readResource('fixture://public')).result, { contents: [{ uri: 'fixture://public', text: 'public' }] });
});
test('cancel notification admission rejection preserves original cancellation', async () => {
    const abort = new AbortController();
    const { client } = fixture({ response: request => { if (request.method === 'tools/call') { abort.abort(); throw new Error('closed'); } } });
    await client.initialize();
    await assert.rejects(client.callTool('stats', {}, { signal: abort.signal, aroundRequest: async ({ method }, operation) => { if (method === 'notifications/cancelled') throw new Error('budget exhausted'); return operation(); } }), { code: 'mcp_cancelled', cancellationNotification: 'unconfirmed' });
});
test('initialize cancellation never sends protocol cancellation notification', async () => {
    const abort = new AbortController();
    const { client, calls } = fixture({ response: () => { abort.abort(); throw new Error('closed'); } });
    await assert.rejects(client.initialize({ signal: abort.signal }), { code: 'mcp_cancelled', dispatched: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'initialize');
});

test('real SDK 1.30.1 computes public statistics and reads a temporary public resource', { skip: !process.env.ATRIA_MCP_SDK_ROOT }, async () => {
    const root = process.env.ATRIA_MCP_SDK_ROOT;
    const sdk = path.join(root, 'node_modules', '@modelcontextprotocol', 'sdk');
    assert.equal(JSON.parse(await readFile(path.join(sdk, 'package.json'), 'utf8')).version, '1.30.1');
    const { McpServer } = await import(pathToFileURL(path.join(sdk, 'dist/esm/server/mcp.js')).href);
    const { StreamableHTTPServerTransport } = await import(pathToFileURL(path.join(sdk, 'dist/esm/server/streamableHttp.js')).href);
    const { z } = await import(pathToFileURL(path.join(root, 'node_modules/zod/index.js')).href);
    const directory = await mkdtemp(path.join(tmpdir(), 'atria-mcp-public-'));
    const file = path.join(directory, 'public.txt');
    await writeFile(file, 'Public synthetic resource: 3 planets.');
    const server = new McpServer({ name: 'public-fixture', version: '1' });
    server.registerTool('stats', { inputSchema: { text: z.string().max(1000) }, annotations: { readOnlyHint: true } }, async ({ text }) => ({ content: [{ type: 'text', text: JSON.stringify({ characters: text.length, words: text.trim().split(/\s+/).length }) }] }));
    server.registerResource('public', 'fixture://public', { mimeType: 'text/plain' }, async uri => ({ contents: [{ uri: uri.href, mimeType: 'text/plain', text: await readFile(file, 'utf8') }] }));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID, enableJsonResponse: true });
    await server.connect(transport);
    const httpServer = http.createServer(async (req, res) => {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        await transport.handleRequest(req, res, JSON.parse(Buffer.concat(chunks).toString()));
    });
    await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
    try {
        const client = createMcpHttpClient({ url: `http://127.0.0.1:${httpServer.address().port}/mcp`, toolNames: ['stats'], resourceUris: ['fixture://public'] });
        await client.initialize();
        assert.equal((await client.listTools()).result.tools[0].name, 'stats');
        const output = await client.callTool('stats', { text: 'Public synthetic text' });
        assert.deepEqual(JSON.parse(output.result.content[0].text), { characters: 21, words: 3 });
        assert.equal((await client.listResources()).result.resources[0].uri, 'fixture://public');
        assert.equal((await client.readResource('fixture://public')).result.contents[0].text, 'Public synthetic resource: 3 planets.');
    } finally {
        httpServer.closeAllConnections();
        await new Promise(resolve => httpServer.close(resolve));
        await server.close();
        await rm(directory, { recursive: true, force: true });
    }
});
