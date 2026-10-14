import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { CLIENT_CAPABILITIES_META_KEY, CLIENT_INFO_META_KEY, PROTOCOL_VERSION_META_KEY } from '@modelcontextprotocol/server';
import { createApprovalProtocol, isApprovalRequired } from '../src/protocol.js';
import { productFixture, httpFixture } from './helpers.js';
import { PUBLIC_TOOLS } from '../src/kernel.js';

const review = { action: 'fixture.write', risk: 'MUTATE', input: { value: 'exact' }, binding: 'bound-input',
    before: { target: { owner: 'alice', sessionId: 'session', revisionId: 'r1' }, serverBootId: 'boot-1' },
    authority: 'Native Fixture Authority', externalEffects: [] };
const accepted = { action: 'accept', content: { authorize: true, uses: 1 } };
function fixture(options = {}) {
    let time = Date.now(), version = '2026-07-28';
    const protocol = createApprovalProtocol({ now: () => time, getServer: () => ({
        getClientCapabilities: () => ({ elicitation: { form: {} } }),
        getClientVersion: () => ({ name: 'fixture', version: '1' }), getNegotiatedProtocolVersion: () => version,
    }), ...options });
    const ctx = ({ state, responses, client = 'fixture', form = true } = {}) => protocol.context({ mcpReq: {
        id: 1, method: 'tools/call', signal: new AbortController().signal, requestState: () => state, inputResponses: responses,
        envelope: { [PROTOCOL_VERSION_META_KEY]: version, [CLIENT_INFO_META_KEY]: { name: client, version: '1' },
            [CLIENT_CAPABILITIES_META_KEY]: form ? { elicitation: { form: {} } } : {} },
    } });
    const issue = async (value = review, context = ctx()) => {
        try { await protocol.approve(value, context); assert.fail('Expected approval continuation'); }
        catch (error) { assert.ok(isApprovalRequired(error), String(error)); return error.result; }
    };
    const resume = async (result, responses = { atria_authorization: accepted }, value = review, extra = {}) => {
        const context = ctx(extra);
        const state = await protocol.serverOptions.requestState.verify(result.requestState, context);
        context.mcpReq.requestState = () => state;
        context.mcpReq.inputResponses = responses;
        return protocol.approve(value, context);
    };
    return { protocol, ctx, issue, resume, advance: ms => { time += ms; }, legacy: () => { version = '2025-11-25'; } };
}

test('approval continuation is bounded metadata, does not authorize first entry, and is single-use', async () => {
    const f = fixture(), result = await f.issue();
    assert.equal(result.resultType, 'input_required');
    assert.deepEqual(Object.keys(result.inputRequests), ['atria_authorization']);
    assert.equal(result.inputRequests.atria_authorization.method, 'elicitation/create');
    assert.equal(result.inputRequests.atria_authorization.params.requestedSchema.properties.authorize.default, false);
    const payload = Buffer.from(result.requestState.split('.')[1], 'base64url').toString();
    assert.ok(!payload.includes('alice') && !payload.includes('bound-input') && !payload.includes('exact'));
    assert.deepEqual(await f.resume(result), accepted);
    await assert.rejects(f.resume(result), /stale|replayed/);
});

test('HMAC rejects tampered and foreign-instance requestState before authorization', async () => {
    const a = fixture(), b = fixture(), result = await a.issue();
    const parts = result.requestState.split('.'); parts[1] = Buffer.from('{}').toString('base64url');
    await assert.rejects(a.protocol.serverOptions.requestState.verify(parts.join('.'), a.ctx()));
    await assert.rejects(b.resume(result));
    await assert.rejects(a.resume(result, undefined, review, { client: 'other' }));
    assert.deepEqual(await a.resume(result), accepted, 'Invalid caller cannot consume the rightful caller nonce');
});

test('exact action/input/target/boot and scope are independently bound to the reviewed continuation', async () => {
    for (const changed of [
        { ...review, action: 'fixture.other' }, { ...review, input: { value: 'changed' } },
        { ...review, before: { ...review.before, serverBootId: 'boot-2' } },
        { ...review, before: { ...review.before, target: { ...review.before.target, owner: 'mallory' } } },
        { ...review, before: { ...review.before, target: { ...review.before.target, revisionId: 'r2' } } },
    ]) {
        const f = fixture(), result = await f.issue();
        await assert.rejects(f.resume(result, undefined, changed), /stale|bound/);
    }
});

test('decline, cancel, malformed, extra-field and destructive multi-use responses never authorize', async () => {
    for (const response of [{ action: 'decline' }, { action: 'cancel' },
        { action: 'accept', content: { authorize: true, uses: '1' } },
        { action: 'accept', content: { authorize: true, uses: 1, grants: ['*'] } },
        { action: 'accept', content: { authorize: false, uses: 1 } },
        { method: 'elicitation/create', result: accepted },
    ]) {
        const f = fixture(), result = await f.issue();
        await assert.rejects(f.resume(result, { atria_authorization: response }), /declined|cancelled|invalid/);
        await assert.rejects(f.resume(result), /stale|replayed/);
    }
    const f = fixture(), destructive = { ...review, risk: 'DESTRUCTIVE' }, result = await f.issue(destructive);
    assert.equal(result.inputRequests.atria_authorization.params.requestedSchema.properties.uses.maximum, 1);
    await assert.rejects(f.resume(result, { atria_authorization: { action: 'accept', content: { authorize: true, uses: 2 } } }, destructive), /one-shot/);
});

test('missing trusted capability, unsolicited responses, expiration, clearing and capacity fail closed', async () => {
    const f = fixture({ maxPending: 1, ttlMs: 5000 });
    await assert.rejects(f.protocol.approve(review, f.ctx({ form: false })), /unavailable/);
    await assert.rejects(f.protocol.approve(review, f.ctx({ responses: { atria_authorization: accepted } })), /Unsolicited/);
    const first = await f.issue();
    await assert.rejects(f.protocol.approve(review, f.ctx()), /capacity/);
    f.advance(5001);
    await assert.rejects(f.resume(first), /stale/);
    const next = await f.issue(); f.protocol.clear();
    await assert.rejects(f.resume(next), /stale/);
    assert.equal(f.protocol.describe(f.ctx()).tasksExtension.enabled, false);
});

test('wrapper preserves cancellation context and binds the exact tool invocation', async () => {
    const f = fixture(); let calls = 0;
    const handler = f.protocol.wrap(async (args, ctx) => {
        assert.equal(ctx.signal, ctx.mcpReq.signal); assert.equal(ctx.requestId, ctx.mcpReq.id);
        await f.protocol.approve(review, ctx); calls++; return { content: [] };
    }, { tool: 'atri_mutate' });
    const result = await handler({ action: review.action }, f.ctx());
    assert.equal(calls, 0);
    const context = f.ctx();
    const state = await f.protocol.serverOptions.requestState.verify(result.requestState, context);
    context.mcpReq.requestState = () => state; context.mcpReq.inputResponses = { atria_authorization: accepted };
    await assert.rejects(handler({ action: review.action, leaseId: 'unreviewed' }, context), /stale|bound/);
    await handler({ action: review.action }, context);
    assert.equal(calls, 1);
});

const protocolUrl = new URL('../src/protocol.js', import.meta.url).href;
const serverScript = `
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { createApprovalProtocol } from ${JSON.stringify(protocolUrl)};
serveStdio(() => {
    let server, writes = 0;
    const protocol = createApprovalProtocol({ getServer: () => server });
    server = new McpServer({name:'atria-protocol-fixture',version:'1'}, protocol.serverOptions);
    server.registerTool('inspect', {inputSchema:z.strictObject({})}, (_args,ctx) => ({content:[{type:'text',text:JSON.stringify({writes,...protocol.describe(ctx)})}]}));
    server.registerTool('write', {inputSchema:z.strictObject({value:z.string()})}, protocol.wrap(async(args,ctx) => {
        await protocol.approve({action:'fixture.write',risk:'MUTATE',input:args,before:{target:'test',serverBootId:'boot'},binding:args.value},ctx);
        return {content:[{type:'text',text:JSON.stringify({writes:++writes})}]};
    }, {tool:'write'}));
    return server;
});`;
async function connect(t, era, { form = true, respond = async () => accepted } = {}) {
    const transport = new StdioClientTransport({ command: process.execPath, args: ['--input-type=module', '-e', serverScript],
        cwd: fileURLToPath(new URL('../', import.meta.url)), stderr: 'pipe' });
    let stderr = ''; transport.stderr.on('data', b => { stderr += b; });
    const client = new Client({ name: 'atria-security-fixture', version: '1' }, {
        versionNegotiation: { mode: era === 'modern' ? { pin: '2026-07-28' } : 'legacy' },
        capabilities: form ? { elicitation: { form: {} } } : {},
    });
    if (form) client.setRequestHandler('elicitation/create', respond);
    t.after(async () => { await client.close(); assert.equal(stderr, ''); });
    await client.connect(transport);
    return { client, call: (name, args = {}) => client.callTool({ name, arguments: args }),
        inspect: async () => JSON.parse((await client.callTool({ name: 'inspect', arguments: {} })).content[0].text) };
}

for (const era of ['legacy', 'modern']) {
    test(`real stdio ${era}: exact protocol negotiation, trusted round trip, decline and no-capability fail closed`, async t => {
        let prompts = 0, allow = true;
        const f = await connect(t, era, { respond: async request => {
            prompts++; assert.equal(request.params.mode, 'form');
            assert.match(request.params.message, /exact Atria operation/);
            return allow ? accepted : { action: 'decline' };
        } });
        assert.equal(f.client.getProtocolEra(), era);
        assert.equal(f.client.getNegotiatedProtocolVersion(), era === 'modern' ? '2026-07-28' : '2025-11-25');
        assert.equal((await f.inspect()).trustedApprovalAvailable, true);
        const written = await f.call('write', { value: 'approved' });
        assert.equal(written.isError, undefined, JSON.stringify(written));
        assert.equal((await f.inspect()).writes, 1); assert.equal(prompts, 1);
        allow = false;
        assert.equal((await f.call('write', { value: 'declined' })).isError, true);
        assert.equal((await f.inspect()).writes, 1); assert.equal(prompts, 2);
        const blocked = await connect(t, era, { form: false });
        assert.equal((await blocked.inspect()).trustedApprovalAvailable, false);
        assert.equal((await blocked.call('write', { value: 'no-trusted-channel' })).isError, true);
        assert.equal((await blocked.inspect()).writes, 0);
    });

    test(`real stdio ${era}: a pending approval permits observation and request cancellation prevents dispatch`, async t => {
        let signalStarted, release;
        const started = new Promise(resolve => { signalStarted = resolve; });
        const response = new Promise(resolve => { release = resolve; });
        const f = await connect(t, era, { respond: async () => { signalStarted(); return response; } });
        const controller = new AbortController();
        const writing = f.client.callTool({ name: 'write', arguments: { value: 'cancel-before-dispatch' } }, { signal: controller.signal });
        // Attach rejection observation before aborting to avoid an unhandled rejection.
        const rejected = assert.rejects(writing);
        await started;
        assert.equal((await f.inspect()).writes, 0);
        controller.abort(); release(accepted);
        await rejected;
        assert.equal((await f.inspect()).writes, 0);
    });
}

test('modern raw wire rejects forged, changed and replayed continuations before any second dispatch', async t => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', serverScript], {
        cwd: fileURLToPath(new URL('../', import.meta.url)), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let sequence = 0, stderr = '';
    const requests = new Map(), lines = createInterface({ input: child.stdout });
    child.stderr.on('data', b => { stderr += b; });
    lines.on('line', line => {
        const message = JSON.parse(line), waiter = requests.get(message.id);
        if (waiter) { requests.delete(message.id); clearTimeout(waiter.timer); waiter.resolve(message); }
    });
    t.after(async () => {
        for (const pending of requests.values()) clearTimeout(pending.timer);
        child.stdin.end();
        await new Promise(resolve => {
            const timer = setTimeout(() => { child.kill(); resolve(); }, 2000);
            child.once('exit', () => { clearTimeout(timer); resolve(); });
        });
        lines.close(); assert.equal(stderr, '');
    });
    const meta = { [PROTOCOL_VERSION_META_KEY]: '2026-07-28', [CLIENT_INFO_META_KEY]: { name: 'raw-security-client', version: '1' },
        [CLIENT_CAPABILITIES_META_KEY]: { elicitation: { form: {} } } };
    const rpc = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { requests.delete(id); reject(new Error('Raw protocol timeout: ' + method)); }, 5000);
        requests.set(id, { resolve, timer });
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params: { ...params, _meta: params._meta ?? meta } }) + '\n');
    });
    assert.equal((await rpc('server/discover')).error, undefined);
    const request = { name: 'write', arguments: { value: 'precise' } };
    const first = await rpc('tools/call', request);
    assert.equal(first.result.resultType, 'input_required');
    const continuation = { requestState: first.result.requestState, inputResponses: { atria_authorization: accepted } };
    const forged = await rpc('tools/call', { ...request, ...continuation, requestState: first.result.requestState + 'tampered' });
    assert.equal(forged.error.code, -32602);
    const changed = await rpc('tools/call', { ...request, ...continuation, arguments: { value: 'different' } });
    assert.equal(changed.result.isError, true);
    const unsupported = await rpc('tools/call', { ...request, ...continuation, _meta: { ...meta, [CLIENT_CAPABILITIES_META_KEY]: {} } });
    assert.equal(unsupported.result.isError, true);
    const wrongClient = await rpc('tools/call', { ...request, ...continuation, _meta: { ...meta, [CLIENT_INFO_META_KEY]: { name: 'other', version: '1' } } });
    assert.equal(wrongClient.error.code, -32602);
    const completed = await rpc('tools/call', { ...request, ...continuation });
    assert.equal(completed.result.resultType, 'complete');
    assert.equal(JSON.parse(completed.result.content[0].text).writes, 1);
    const replayed = await rpc('tools/call', { ...request, ...continuation });
    assert.equal(replayed.result.isError, true);
    const observed = await rpc('tools/call', { name: 'inspect', arguments: {} });
    assert.equal(JSON.parse(observed.result.content[0].text).writes, 1);
});

test('complete Atria stdio entry negotiates modern protocol while preserving exact public surface and fail-closed policy', async t => {
    const product = await productFixture(), http = await httpFixture();
    t.after(product.cleanup); t.after(http.close);
    const transport = new StdioClientTransport({ command: process.execPath,
        args: [fileURLToPath(new URL('../src/cli.js', import.meta.url)), '--repo', product.root, '--url', http.origin],
        env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('ATRIA_'))), stderr: 'pipe' });
    let stderr = ''; transport.stderr.on('data', bytes => { stderr += bytes; });
    const client = new Client({ name: 'atria-modern-entry-fixture', version: '1' }, {
        versionNegotiation: { mode: { pin: '2026-07-28' } }, capabilities: { elicitation: { form: {} } },
    });
    t.after(async () => { await client.close(); assert.equal(stderr, ''); });
    await client.connect(transport);
    assert.equal(client.getNegotiatedProtocolVersion(), '2026-07-28');
    assert.deepEqual((await client.listTools()).tools.map(tool => tool.name).sort(), [...PUBLIC_TOOLS].sort());
    const status = JSON.parse((await client.callTool({ name: 'atri_status', arguments: {} })).content[0].text);
    assert.equal(status.productMutationAvailable, false, 'Client capability does not bypass absent Policy Ceiling');
    assert.equal(status.browser.started, false);
    assert.equal((await client.callTool({ name: 'atri_mutate', arguments: { action: 'chat.send', input: {} } })).isError, true);
    assert.equal(http.stats().writes, 0);
});

test('raw 2025 client receives legacy form requests and cannot replace approval with a model confirm field', async t => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', serverScript], {
        cwd: fileURLToPath(new URL('../', import.meta.url)), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let sequence = 0, approvals = 0, stderr = '';
    const requests = new Map(), lines = createInterface({ input: child.stdout });
    child.stderr.on('data', b => { stderr += b; });
    lines.on('line', line => {
        const message = JSON.parse(line);
        if (message.method === 'elicitation/create') {
            approvals++; assert.equal(message.params.mode, 'form');
            child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: accepted }) + '\n');
            return;
        }
        const waiter = requests.get(message.id);
        if (waiter) { requests.delete(message.id); clearTimeout(waiter.timer); waiter.resolve(message); }
    });
    t.after(async () => {
        for (const pending of requests.values()) clearTimeout(pending.timer);
        child.stdin.end();
        await new Promise(resolve => {
            const timer = setTimeout(() => { child.kill(); resolve(); }, 2000);
            child.once('exit', () => { clearTimeout(timer); resolve(); });
        });
        lines.close(); assert.equal(stderr, '');
    });
    const rpc = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { requests.delete(id); reject(new Error('Legacy protocol timeout: ' + method)); }, 5000);
        requests.set(id, { resolve, timer });
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
    const init = await rpc('initialize', { protocolVersion: '2025-11-25', clientInfo: { name: 'raw-legacy-client', version: '1' }, capabilities: { elicitation: { form: {} } } });
    assert.equal(init.result.protocolVersion, '2025-11-25');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const forged = await rpc('tools/call', { name: 'write', arguments: { value: 'model-assertion', confirm: true } });
    assert.equal(forged.result.isError, true); assert.equal(approvals, 0);
    const wrote = await rpc('tools/call', { name: 'write', arguments: { value: 'human-channel-round-trip' } });
    assert.equal(wrote.result.resultType, undefined, 'No modern result discriminator leaks onto the legacy wire');
    assert.equal(JSON.parse(wrote.result.content[0].text).writes, 1); assert.equal(approvals, 1);
});
