import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { createA2aHttpClient } from '../../src/native/a2a-http-client.js';

const endpoint = 'http://127.0.0.1:12345/rpc';
const agentCard = url => ({ name: 'Public synthetic statistics', description: 'Local test fixture', version: '1', supportedInterfaces: [{ url, protocolBinding: 'JSONRPC', protocolVersion: '1.0' }], capabilities: {}, defaultInputModes: ['text/plain'], defaultOutputModes: ['application/json'], skills: [{ id: 'stats', name: 'Statistics', description: 'Counts public words', tags: ['public'] }] });
const remoteTask = () => ({ id: 'task-1', contextId: 'context-1', status: { state: 'TASK_STATE_WORKING' }, artifacts: [{ artifactId: 'artifact-1', parts: [{ data: { words: 2 }, mediaType: 'application/json' }] }] });
function fixture(overrides = {}) {
    const calls = [];
    const client = createA2aHttpClient({ url: endpoint, skillIds: ['stats'], fetchImpl: async (url, options) => {
        const request = options.body ? JSON.parse(options.body) : { method: 'GetAgentCard' };
        calls.push({ url, options, request });
        const result = request.method === 'GetAgentCard' ? (overrides.card || agentCard(endpoint)) : (overrides.result || (request.method === 'SendMessage' ? { task: remoteTask() } : remoteTask()));
        return overrides.response?.(request, options) || new Response(JSON.stringify(request.method === 'GetAgentCard' ? result : { jsonrpc: '2.0', id: request.id, result }), { headers: { 'content-type': 'application/json' } });
    }, ...overrides.options });
    return { client, calls };
}
test('fixed 1.0 card, SendMessage and exact task/context methods with full hooks', async () => {
    const { client, calls } = fixture();
    const methods = [];
    const options = { aroundRequest: async ({ method }, operation) => { methods.push(method); return operation(); } };
    await client.initialize(options);
    const sent = await client.sendMessage('stats', 'public text', options);
    assert.equal(sent.result.task.status.state, 'TASK_STATE_WORKING');
    assert.match(calls[1].request.params.message.messageId, /^[a-f0-9-]{36}$/);
    assert.equal(calls[1].request.params.message.role, 'ROLE_USER');
    assert.equal('kind' in calls[1].request.params.message, false);
    assert.equal('skillId' in calls[1].request.params, false);
    await client.getTask({ id: 'task-1', contextId: 'context-1' }, options);
    await client.cancelTask({ id: 'task-1', contextId: 'context-1' }, options);
    assert.deepEqual(methods, ['GetAgentCard', 'SendMessage', 'GetTask', 'CancelTask']);
    assert.equal(calls[0].url, 'http://127.0.0.1:12345/.well-known/agent-card.json');
    assert.equal(calls[0].options.headers['A2A-Version'], '1.0');
    assert.equal(calls[1].options.redirect, 'error');
    assert.match(sent.evidence.responseFingerprint, /^[a-f0-9]{64}$/);
});
for (const url of ['http://localhost/rpc', 'http://127.1/rpc', 'http://2130706433/rpc', 'https://127.0.0.1/rpc', 'http://user@127.0.0.1/rpc', 'http://127.0.0.1.evil/rpc', 'http://127.0.0.1/rpc#x', 'http://127.0.0.1/rpc?token=x']) {
    test(`deny endpoint ${url}`, () => assert.throws(() => createA2aHttpClient({ url, skillIds: ['stats'] }), { code: 'a2a_endpoint_denied' }));
}
for (const [name, change] of [
    ['old protocol', card => { card.supportedInterfaces[0].protocolVersion = '0.3'; }],
    ['endpoint change', card => { card.supportedInterfaces[0].url = 'http://127.0.0.1:12346/rpc'; }],
    ['binding change', card => { card.supportedInterfaces[0].protocolBinding = 'HTTP+JSON'; }],
    ['required extension', card => { card.capabilities.extensions = [{ uri: 'fixture://required', required: true }]; }],
    ['missing skill', card => { card.skills = []; }],
    ['OAuth requirement', card => { card.securityRequirements = [{ schemes: { oauth: { list: [] } } }]; card.securitySchemes = { oauth: { oauth2SecurityScheme: {} } }; }],
]) {
    test(`deny card ${name}`, async () => {
        const card = agentCard(endpoint);
        change(card);
        const { client, calls } = fixture({ card });
        await assert.rejects(client.initialize());
        await assert.rejects(client.sendMessage('stats', 'public'), { code: 'a2a_not_initialized' });
        assert.equal(calls.length, 1);
    });
}
test('exact bearer requirement accepts only supplied authorization', async () => {
    const card = agentCard(endpoint);
    card.securitySchemes = { bearer: { httpAuthSecurityScheme: { scheme: 'Bearer' } } };
    card.securityRequirements = [{ schemes: { bearer: { list: [] } } }];
    await assert.rejects(fixture({ card }).client.initialize(), { code: 'a2a_auth_unsupported' });
    await fixture({ card, options: { headers: { Authorization: 'Bearer public-synthetic-token' } } }).client.initialize();
    assert.throws(() => fixture({ options: { headers: { Cookie: 'a=b' } } }), { code: 'a2a_auth_unsupported' });
});
test('response identity cannot change and owner identity is mandatory', async () => {
    const { client, calls } = fixture();
    await client.initialize();
    await assert.rejects(client.getTask({ id: 'task-1' }), { code: 'a2a_identity_denied', dispatched: false });
    await assert.rejects(client.getTask({ id: 'other', contextId: 'context-1' }), { code: 'a2a_identity_mismatch', dispatched: true });
    assert.equal(calls.length, 2);
});
for (const part of [{ url: 'http://example.com/file' }, { raw: 'AA==' }, { kind: 'text', text: 'old schema' }, { text: '<script>', mediaType: 'text/html' }, { text: 'x', data: {} }]) {
    test(`reject unsupported part ${JSON.stringify(part)}`, async () => {
        const result = { task: remoteTask() };
        result.task.artifacts[0].parts = [part];
        const { client } = fixture({ result });
        await client.initialize();
        await assert.rejects(client.sendMessage('stats', 'public'), { code: 'a2a_content_unsupported' });
    });
}
test('projection removes external metadata and semantic validation is inside hook', async () => {
    const result = { task: { ...remoteTask(), metadata: { secret: 'synthetic' } } };
    result.task.artifacts[0].metadata = { hidden: true };
    const { client } = fixture({ result });
    await client.initialize();
    const response = await client.sendMessage('stats', 'public');
    assert.equal('metadata' in response.result.task, false);
    assert.equal('metadata' in response.result.task.artifacts[0], false);
    let failedInside = false;
    const invalid = fixture({ result: { task: { ...remoteTask(), status: { state: 'completed' } } } });
    await invalid.client.initialize();
    await assert.rejects(invalid.client.sendMessage('stats', 'public', { aroundRequest: async (_descriptor, operation) => { try { return await operation(); } catch (error) { failedInside = true; throw error; } } }), { code: 'a2a_task_invalid' });
    assert.equal(failedInside, true);
});
test('unknown SendMessage is never automatically resent and raw remote error is hidden', async () => {
    const { client, calls } = fixture({ response: request => { if (request.method === 'SendMessage') throw new Error('private remote trace'); } });
    await client.initialize();
    await assert.rejects(client.sendMessage('stats', 'public'), error => error.code === 'a2a_transport_unknown' && error.outcome === 'unknown' && !JSON.stringify(error).includes('private remote trace') && !error.cause);
    assert.equal(calls.length, 2);
});
test('bounds, pre-abort and hook admission deny requests', async () => {
    const { client, calls } = fixture({ options: { maxRequestBytes: 300 } });
    await client.initialize();
    await assert.rejects(client.sendMessage('stats', 'x'.repeat(1000)), { code: 'a2a_request_too_large', dispatched: false });
    const abort = new AbortController();
    abort.abort();
    await assert.rejects(client.sendMessage('stats', 'public', { signal: abort.signal }));
    await assert.rejects(client.sendMessage('stats', 'public', { aroundRequest: async () => { throw new Error('budget'); } }), /budget/);
    assert.equal(calls.length, 1);
    await assert.rejects(fixture({ options: { maxResponseBytes: 10 } }).client.initialize(), { code: 'a2a_response_too_large' });
});
test('SSE response is cancelled without follow-up', async () => {
    let cancelled = false;
    const { client } = fixture({ response: () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'content-type': 'text/event-stream' } }) });
    await assert.rejects(client.initialize(), { code: 'a2a_media_unsupported' });
    assert.equal(cancelled, true);
});
test('direct agent Message uses 1.0 enum and bounded projection', async () => {
    const { client } = fixture({ result: { message: { messageId: 'agent-message', contextId: 'context-1', role: 'ROLE_AGENT', parts: [{ text: 'Public result', metadata: { x: 1 } }], metadata: { x: 1 } } } });
    await client.initialize();
    assert.deepEqual((await client.sendMessage('stats', 'public')).result.message, { messageId: 'agent-message', contextId: 'context-1', role: 'ROLE_AGENT', parts: [{ text: 'Public result' }] });
});
test('ProtoJSON omitted empty bearer scopes are supported', async () => {
    const card = agentCard(endpoint);
    card.securitySchemes = { bearer: { httpAuthSecurityScheme: { scheme: 'bearer' } } };
    card.securityRequirements = [{ schemes: { bearer: {} } }];
    await fixture({ card, options: { headers: { Authorization: 'Bearer public-token' } } }).client.initialize();
});
test('remote JSON-RPC errors do not expose raw data', async () => {
    const { client, calls } = fixture({ response: request => request.method === 'SendMessage' ? new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -1, message: 'private synthetic trace', data: { token: 'private' } } }), { headers: { 'content-type': 'application/json' } }) : undefined });
    await client.initialize();
    await assert.rejects(client.sendMessage('stats', 'public'), error => error.code === 'a2a_remote_error' && error.outcome === 'failed' && !error.message.includes('private') && !error.cause);
    assert.equal(calls.length, 2);
});
test('invalid UTF-8 result is rejected as unknown', async () => {
    const { client } = fixture({ response: () => new Response(Buffer.from([0xff]), { headers: { 'content-type': 'application/json' } }) });
    await assert.rejects(client.initialize(), { code: 'a2a_transport_unknown' });
});

test('real loopback A2A computes statistics, advances Task, reconnects and cancels', async () => {
    const tasks = new Map();
    const messages = [];
    let url;
    const server = http.createServer(async (req, res) => {
        res.setHeader('content-type', 'application/json');
        if (req.method === 'GET') { res.end(JSON.stringify(agentCard(url))); return; }
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const request = JSON.parse(Buffer.concat(chunks).toString());
        assert.equal(req.headers['a2a-version'], '1.0');
        let result;
        if (request.method === 'SendMessage') {
            messages.push(request.params.message.messageId);
            const text = request.params.message.parts[0].text;
            const created = { id: randomUUID(), contextId: randomUUID(), status: { state: 'TASK_STATE_WORKING' }, artifacts: [{ artifactId: randomUUID(), parts: [{ data: { characters: text.length, words: text.trim().split(/\s+/).length }, mediaType: 'application/json' }] }] };
            tasks.set(created.id, created);
            result = { task: created };
        } else {
            const existing = tasks.get(request.params.id);
            existing.status.state = request.method === 'CancelTask' ? 'TASK_STATE_CANCELED' : 'TASK_STATE_COMPLETED';
            result = existing;
        }
        res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${server.address().port}/rpc`;
    try {
        const first = createA2aHttpClient({ url, skillIds: ['stats'] });
        await first.initialize();
        const response = await first.sendMessage('stats', 'Public synthetic text');
        assert.deepEqual(response.result.task.artifacts[0].parts[0].data, { characters: 21, words: 3 });
        const acquired = { id: response.result.task.id, contextId: response.result.task.contextId };
        const rebuilt = createA2aHttpClient({ url, skillIds: ['stats'] });
        await rebuilt.initialize();
        assert.equal((await rebuilt.getTask(acquired)).result.status.state, 'TASK_STATE_COMPLETED');
        assert.equal((await rebuilt.cancelTask(acquired)).result.status.state, 'TASK_STATE_CANCELED');
        assert.equal(messages.length, 1);
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});
