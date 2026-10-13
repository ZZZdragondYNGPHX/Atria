import { createServer } from 'node:http';
import { createServer as createTlsServer, request as tlsRequest } from 'node:https';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { createMcpHttpClient, MCP_PROTOCOL_VERSION } from '../../src/native/mcp-http-client.js';
import { createA2aHttpClient } from '../../src/native/a2a-http-client.js';
import { protocolEndpoint } from '../../src/native/protocol-endpoint.js';
import { readServerEvents } from '../../public/shared/native-protocol-stream.js';

async function serve(run) {
    const calls = [], server = createServer(async (req, res) => {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = raw ? JSON.parse(raw) : null; calls.push({ method: req.method, headers: req.headers, body });
        if (req.method === 'GET') {
            res.setHeader('Content-Type', 'text/event-stream');
            res.end('id: answer\ndata: ' + JSON.stringify({ jsonrpc: '2.0', id: 1, result: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: { tools: {} } } }) + '\n\n');
        } else if (body.method === 'initialize') {
            res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Mcp-Session-Id', 'saved-session');
            res.end('id: first\nretry: 1\ndata:\n\n');
        } else if (body.method === 'notifications/initialized') { res.writeHead(202); res.end(); }
        else {
            res.setHeader('Content-Type', 'text/event-stream');
            res.write(': heartbeat\r\n\r\ndata: ' + JSON.stringify({ jsonrpc: '2.0', method: 'notifications/progress', params: { message: '处理中' } }) + '\r\n\r\n');
            res.end('data: ' + JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { tools: [{ name: 'count' }] } }) + '\n\n');
        }
    });
    await new Promise(done => server.listen(0, '127.0.0.1', done));
    try { await run(`http://127.0.0.1:${server.address().port}/mcp`, calls); }
    finally { server.closeAllConnections(); await new Promise(done => server.close(done)); }
}

test('MCP real SSE reconnect uses GET and cursor, retains initialization session and charges every request', async () => {
    await serve(async (url, calls) => {
        const methods = [], client = createMcpHttpClient({ url, toolNames: ['count'] });
        const options = { aroundRequest: async ({ method }, send) => { methods.push(method); return send(); } };
        await client.initialize(options);
        expect((await client.listTools(options)).result.tools).toEqual([{ name: 'count' }]);
        expect(methods).toEqual(['initialize', 'stream/resume', 'notifications/initialized', 'tools/list']);
        expect(calls[1]).toMatchObject({ method: 'GET', headers: { 'last-event-id': 'first', 'mcp-session-id': 'saved-session' } });
        expect(calls[3].headers['mcp-session-id']).toBe('saved-session');
        expect(calls.filter(call => call.body?.method === 'initialize')).toHaveLength(1);
    });
});

test('HTTPS exact endpoints supported while insecure remote HTTP and URL credentials are rejected', () => {
    expect(protocolEndpoint('https://tools.example.test/mcp', 'mcp').origin).toBe('https://tools.example.test');
    expect(createMcpHttpClient({ url: 'https://tools.example.test/mcp' })).toBeDefined();
    expect(createA2aHttpClient({ url: 'https://agents.example.test/rpc', skillIds: ['read'] })).toBeDefined();
    for (const url of ['http://tools.example.test/mcp', 'https://user:secret@tools.example.test/mcp', 'https://tools.example.test/mcp#fragment']) {
        expect(() => protocolEndpoint(url, 'mcp')).toThrow();
    }
});

test('SSE decoder preserves split UTF8 and CRLF and stops at the consumer response', async () => {
    const bytes = new TextEncoder().encode('id: one\r\ndata: 中文\r\n\r\n');
    let index = 0, cancelled = false;
    const body = new ReadableStream({ pull(controller) { if (index < bytes.length) controller.enqueue(bytes.slice(index, ++index));  }, cancel() { cancelled = true; } });
    const events = [];
    for await (const event of readServerEvents(body)) { events.push(event); break; }
    expect(events).toEqual([{ id: 'one', data: '中文' }]); expect(cancelled).toBe(true);
});

test('SSE oversized and truncated results fail rather than becoming verified responses', async () => {
    const decode = async body => { for await (const event of readServerEvents(body, { maxBytes: 32 })) void event; };
    await expect(decode(new Response('data: ' + 'x'.repeat(40) + '\n\n').body)).rejects.toThrow('bound');
    await expect(decode(new Response('data: incomplete').body)).rejects.toThrow('Incomplete');
});

test('MCP mismatched streamed response never satisfies a pending request', async () => {
    const client = createMcpHttpClient({ url: 'https://tools.example.test/mcp', fetchImpl: async () => new Response('data: {"jsonrpc":"2.0","id":999,"result":{}}\n\n', { headers: { 'Content-Type': 'text/event-stream' } }) });
    await expect(client.initialize()).rejects.toMatchObject({ code: 'mcp_envelope_invalid', dispatched: true });
});

test('MCP connects to a real TLS server with certificate verification and bearer authentication', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'atria-protocol-tls-')); let server;
    try {
        const keyPath = join(directory, 'key.pem'), certPath = join(directory, 'cert.pem');
        execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath,
            '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
        const cert = await readFile(certPath), calls = [];
        server = createTlsServer({ key: await readFile(keyPath), cert }, async (req, res) => {
            let body = ''; for await (const chunk of req) body += chunk;
            const rpc = JSON.parse(body); calls.push(req.headers.authorization);
            if (!('id' in rpc)) { res.writeHead(202); res.end(); return; }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: rpc.method === 'initialize'
                ? { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: { tools: {} } } : { tools: [{ name: 'count' }] } }));
        });
        await new Promise(done => server.listen(0, '127.0.0.1', done));
        const fetchImpl = (url, options) => new Promise((resolve, reject) => {
            const request = tlsRequest(url, { method: options.method, headers: options.headers, signal: options.signal, ca: cert }, response => {
                resolve(new Response(response.statusCode === 202 ? null : Readable.toWeb(response), { status: response.statusCode, headers: response.headers }));
                if (response.statusCode === 202) response.resume();
            });
            request.on('error', reject); request.end(options.body);
        });
        const client = createMcpHttpClient({ url: `https://127.0.0.1:${server.address().port}/mcp`, fetchImpl,
            headers: { Authorization: 'Bearer public-test-token' }, toolNames: ['count'] });
        await client.initialize(); expect((await client.listTools()).result.tools).toEqual([{ name: 'count' }]);
        expect(calls).toEqual(Array(3).fill('Bearer public-test-token'));
    } finally {
        if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
        await rm(directory, { recursive: true, force: true });
    }
});
