import { expect, test } from '@jest/globals';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import express from 'express';
import request from 'supertest';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { installCognitionFixture } from './helpers/cognition-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { McpService } from '../../src/native/mcp-service.js';
import { NativeTaskScheduler, nativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';

async function fixture(maxJobs = 32, hook = async () => {}, harness = makeTempFsEngineHarness) {
    const h = await harness();
    const f = await installCognitionFixture(h, 'limited', undefined, ({ contract }) => {
        contract.informationRuntime.sources.push({ id: 'public-lines', kind: 'timeline', semantic: 'narrative', scopeId: 'session', fields: [['content']] });
        contract.informationRuntime.views.find(view => view.id === 'player').sources.push('public-lines');
    });
    const base = await f.core.appendTimeline(h.handle, f.snapshot.session.sessionId, { role: 'assistant', content: 'public synthetic words' }, { expectedRevisionId: f.snapshot.revision.revisionId });
    const seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:1/mcp' });
    const connection = { ...seeded.connection, providerAdapter: 'provider.mcp' };
    await seeded.persistence.saveConnectionProfile(h.handle, connection);
    const route = { ...seeded.routes[0], executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [seeded.model.modelProfileId],
        mcp: { protocolVersion: '2025-11-25', connectionProfileId: connection.connectionProfileId, toolNames: ['public_count'], resourceUris: ['public://fixture'], auth: 'none' },
        computeBudget: { maxRequests: 1, maxTokens: 4096, localWork: { maxJobs, maxItems: 10000, maxInputBytes: 16777216 } } } };
    await seeded.persistence.saveRuntimeRoute(h.handle, route);
    const host = { ...seeded, sessionCore: f.core, packageInstaller: f.packageInstaller };
    const calls = [], configurations = [], scheduler = new NativeTaskScheduler();
    const op = async (method, result, options) => options.aroundRequest({ method }, async () => {
        calls.push(method); await hook({ method, h, f, host, route });
        return { result, evidence: { protocolVersion: '2025-11-25', method, requestFingerprint: 'input', responseFingerprint: 'output' } };
    });
    const service = new McpService({ host, scheduler, clientFactory: config => { configurations.push(config); return {
        initialize: async options => { await op('initialize', {}, options); return op('notifications/initialized', {}, options); },
        listTools: options => op('tools/list', { tools: [{ name: 'public_count' }] }, options),
        callTool: (name, args, options) => op('tools/call', { content: [{ type: 'text', text: String(args.text.split(' ').length) }] }, options),
        listResources: options => op('resources/list', { resources: [{ uri: 'public://fixture' }] }, options),
        readResource: (uri, options) => op('resources/read', { contents: [{ uri, text: 'public fixture' }] }, options),
    }; } });
    const body = { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, viewId: 'player', itemId: 'public-lines:' + base.timeline.at(-1).messageId, toolName: 'public_count' };
    return { h, f, host, route, base, body, service, scheduler, calls, configurations, cleanup: async () => {
        for (const operation of scheduler.operations.values()) scheduler.cancel(h.handle, operation.view.operationId);
        while (scheduler.running.size) await new Promise(resolve => setTimeout(resolve, 5));
        await h.cleanup();
    } };
}

test.each(['tool', 'resource'])('S30 %s consumer charges each protocol operation and preserves original Session', async kind => {
    const f = await fixture();
    try {
        const body = kind === 'tool' ? f.body : { ...f.body, toolName: undefined, resourceUri: 'public://fixture' };
        delete body.toolName;
        if (kind === 'tool') body.toolName = 'public_count';
        const started = await f.service.start(f.h.handle, body);
        const artifact = await f.scheduler.operations.get(started.operationId).handle.result;
        expect(artifact.provenance).toMatchObject({ external: true, protocolVersion: '2025-11-25' });
        expect(f.calls).toHaveLength(4);
        expect(await f.f.core.load(f.h.handle, body.sessionId)).toEqual(f.base);
        const bank = await f.f.core.runs.status(f.h.handle, body.sessionId);
        const work = Object.values(bank.operations).flatMap(value => value.compute?.localWork ?? []);
        expect(work).toHaveLength(5); expect(work[0].kind).toBe('context_build');
        expect(work.slice(1).every(value => value.kind === 'mcp_protocol' && value.usage.outcome === 'completed')).toBe(true);
        expect((await f.service.status(f.h.handle, { operationId: started.operationId })).artifact).toEqual(artifact);
        await expect(f.service.status('other-owner', { operationId: started.operationId })).rejects.toThrow(/operation_missing/);
    } finally { await f.cleanup(); }
});

test('S30 explicit auth resolves only the selected owner exact SecretRef; no auth never resolves it', async () => {
    const f = await fixture(), refs = [];
    f.host.secretPort = { resolveSecret: async (ref, { handle }) => { refs.push({ ref, handle }); return 'synthetic-local-secret'; } };
    try {
        let started = await f.service.start(f.h.handle, f.body);
        await f.scheduler.operations.get(started.operationId).handle.result;
        expect(refs).toEqual([]); expect(f.configurations[0].headers).toEqual({});
        await f.host.persistence.saveRuntimeRoute(f.h.handle, { ...f.route, executionPolicy: { ...f.route.executionPolicy, mcp: { ...f.route.executionPolicy.mcp, auth: 'secret' } } });
        started = await f.service.start(f.h.handle, f.body);
        const artifact = await f.scheduler.operations.get(started.operationId).handle.result;
        expect(refs).toEqual([{ ref: { secretId: 'p4-synthetic-key', scope: 'player' }, handle: f.h.handle }]);
        expect(f.configurations.at(-1).headers).toEqual({ Authorization: 'Bearer synthetic-local-secret' });
        expect(JSON.stringify(artifact)).not.toContain('synthetic-local-secret');
    } finally { await f.cleanup(); }
});

test('S30 deny free text/private view/unlisted tool and no policy defaults to no invocation', async () => {
    const f = await fixture();
    try {
        await expect(f.service.start(f.h.handle, { ...f.body, text: 'caller input' })).rejects.toThrow();
        await expect(f.service.start(f.h.handle, { ...f.body, viewId: 'pov' })).rejects.toThrow(/display_denied/);
        await expect(f.service.start(f.h.handle, { ...f.body, toolName: 'unlisted' })).rejects.toThrow(/allowlist_denied/);
        await f.host.persistence.saveRuntimeRoute(f.h.handle, { ...f.route, executionPolicy: undefined });
        expect(await f.service.start(f.h.handle, f.body)).toMatchObject({ status: 'fallback' }); expect(f.calls).toEqual([]);
    } finally { await f.cleanup(); }
});

test.each([123, { token: 'synthetic' }])('S30 malformed secret value %# never reaches a remote request', async secret => {
    const f = await fixture(); f.host.secretPort = { resolveSecret: async () => secret };
    try {
        await f.host.persistence.saveRuntimeRoute(f.h.handle, { ...f.route, executionPolicy: { ...f.route.executionPolicy, mcp: { ...f.route.executionPolicy.mcp, auth: 'secret' } } });
        const started = await f.service.start(f.h.handle, f.body);
        await expect(f.scheduler.operations.get(started.operationId).handle.result).rejects.toMatchObject({ code: 'native_mcp_secret_unavailable' });
        expect(f.calls).toEqual([]);
    } finally { await f.cleanup(); }
});

test('S30 exhausted local budget prevents the next protocol operation without refund', async () => {
    const f = await fixture(2);
    try {
        const started = await f.service.start(f.h.handle, f.body);
        await expect(f.scheduler.operations.get(started.operationId).handle.result).rejects.toThrow(/budget/);
        expect(f.calls).toEqual(['initialize']);
    } finally { await f.cleanup(); }
});

test('S30 an allowed tool absent from actual discovery cannot be invoked', async () => {
    const f = await fixture(), factory = f.service.clientFactory;
    f.service.clientFactory = configuration => {
        const client = factory(configuration), list = client.listTools;
        client.listTools = async options => ({ ...await list(options), result: { tools: [] } });
        return client;
    };
    try {
        const started = await f.service.start(f.h.handle, f.body);
        await expect(f.scheduler.operations.get(started.operationId).handle.result).rejects.toThrow(/tool_unavailable/);
        expect(f.calls).toEqual(['initialize', 'notifications/initialized', 'tools/list']);
    } finally { await f.cleanup(); }
});

test.each(['route', 'revision', 'profile'])('S30 changed %s after dispatch suppresses external result and preserves consumed work', async kind => {
    const f = await fixture(32, async ({ method, h, f, host, route }) => {
        if (method !== 'tools/call') return;
        if (kind === 'route') await host.persistence.saveRuntimeRoute(h.handle, { ...route, displayName: 'changed' });
        else if (kind === 'profile') await host.persistence.saveConnectionProfile(h.handle, { ...await host.persistence.getConnectionProfile(h.handle, route.executionPolicy.mcp.connectionProfileId), displayName: 'changed' });
        else await f.core.appendTimeline(h.handle, f.snapshot.session.sessionId, { role: 'user', content: 'next' }, { expectedRevisionId: (await f.core.load(h.handle, f.snapshot.session.sessionId)).revision.revisionId });
    });
    try {
        const started = await f.service.start(f.h.handle, f.body);
        await expect(f.scheduler.operations.get(started.operationId).handle.result).rejects.toThrow(/source_stale/);
        expect((await f.service.status(f.h.handle, { operationId: started.operationId })).artifact).toBeNull();
        const bank = await f.f.core.runs.status(f.h.handle, f.body.sessionId);
        const work = Object.values(bank.operations).flatMap(value => value.compute?.localWork ?? []);
        const totals = kind === 'revision' ? bank.retiredCompute : { localJobs: work.length,
            localCompletedJobs: work.filter(row => row.usage.outcome === 'completed').length,
            localFailedJobs: work.filter(row => row.usage.outcome === 'failed').length };
        expect(totals).toMatchObject({ localJobs: 5, localCompletedJobs: 4, localFailedJobs: 1 });
    } finally { await f.cleanup(); }
});

test('S30 dispatched unknown failure is not retried and local work remains settled failed', async () => {
    const f = await fixture(32, async ({ method }) => {
        if (method === 'tools/call') throw Object.assign(new Error('lost response'), { code: 'mcp_transport_unknown', outcome: 'unknown' });
    });
    try {
        const started = await f.service.start(f.h.handle, f.body);
        await expect(f.scheduler.operations.get(started.operationId).handle.result).rejects.toThrow('lost response');
        expect(f.calls.filter(method => method === 'tools/call')).toHaveLength(1);
        expect((await f.service.status(f.h.handle, { operationId: started.operationId })).failure).toMatchObject({ outcome: 'unknown' });
        const work = Object.values((await f.f.core.runs.status(f.h.handle, f.body.sessionId)).operations).flatMap(value => value.compute?.localWork ?? []);
        expect(work.at(-1).usage.outcome).toBe('failed');
    } finally { await f.cleanup(); }
});

test('S30 cancellation suppresses late result without claiming remote rollback', async () => {
    let entered, release;
    const began = new Promise(resolve => { entered = resolve; });
    const f = await fixture(32, async ({ method }) => {
        if (method === 'tools/call') { entered(); await new Promise(resolve => { release = resolve; }); }
    });
    try {
        const started = await f.service.start(f.h.handle, f.body), operation = f.scheduler.operations.get(started.operationId);
        await began;
        expect(f.service.cancel(f.h.handle, { operationId: started.operationId })).toEqual({ cancelled: true, remoteRollbackConfirmed: false });
        await expect(operation.handle.result).rejects.toThrow(/cancelled/);
        release(); while (f.scheduler.running.size) await new Promise(resolve => setTimeout(resolve, 5));
        expect((await f.service.status(f.h.handle, { operationId: started.operationId })).artifact).toBeNull();
        const work = Object.values((await f.f.core.runs.status(f.h.handle, f.body.sessionId)).operations).flatMap(value => value.compute?.localWork ?? []);
        expect(work.at(-1).usage.outcome).toBe('cancelled');
    } finally { release?.(); await f.cleanup(); }
});

test('S30 engine isolation and suspended scope deny output without creating a second authority', async () => {
    const first = await fixture(), second = await fixture();
    try {
        const started = await first.service.start(first.h.handle, first.body);
        await first.scheduler.operations.get(started.operationId).handle.result;
        await expect(second.service.status(first.h.handle, { operationId: started.operationId })).rejects.toThrow(/operation_missing/);
        const next = await first.f.core.applyLifecycleCommand(first.h.handle, first.body.sessionId,
            { type: 'lifecycle', invocationId: 'mcp-suspend', action: { kind: 'scope.transition', scopeId: 'session', status: 'suspended' } },
            { expectedRevisionId: first.body.revisionId });
        await expect(first.service.start(first.h.handle, { ...first.body, revisionId: next.revision.revisionId })).rejects.toThrow(/display_denied/);
        expect((await first.service.status(first.h.handle, { operationId: started.operationId })).artifact).toBeNull();
    } finally { await first.cleanup(); await second.cleanup(); }
});

async function sdkFixture({ echo } = {}) {
    const root = process.env.ATRIA_MCP_SDK_ROOT, sdk = path.join(root, 'node_modules', '@modelcontextprotocol', 'sdk');
    expect(JSON.parse(await readFile(path.join(sdk, 'package.json'), 'utf8')).version).toBe('1.30.1');
    const { McpServer } = await import(pathToFileURL(path.join(sdk, 'dist/esm/server/mcp.js')).href);
    const { StreamableHTTPServerTransport } = await import(pathToFileURL(path.join(sdk, 'dist/esm/server/streamableHttp.js')).href);
    const { z } = await import(pathToFileURL(path.join(root, 'node_modules/zod/index.js')).href);
    const directory = await mkdtemp(path.join(tmpdir(), 'atria-mcp-consumer-public-')), file = path.join(directory, 'public.txt');
    await writeFile(file, 'Public synthetic resource: 3 planets.');
    const sessions = new Map(), servers = [], calls = [];
    const listener = http.createServer(async (req, res) => {
        try {
            const chunks = []; for await (const chunk of req) chunks.push(chunk);
            const body = JSON.parse(Buffer.concat(chunks).toString()); calls.push(body.method);
            let transport = sessions.get(req.headers['mcp-session-id']);
            if (!transport && body.method === 'initialize') {
                const server = new McpServer({ name: 'public-consumer-fixture', version: '1' });
                const echoed = req.headers.authorization?.slice('Bearer '.length);
                server.registerTool('public_count', { inputSchema: { text: z.string().max(4096) }, annotations: { readOnlyHint: true } },
                    async ({ text }) => ({ content: [{ type: 'text', text: echo === 'text' ? echoed : JSON.stringify({ characters: text.length, words: text.trim().split(/\s+/).length }) }],
                        ...(echo === 'json' ? { structuredContent: { nested: [echoed] } } : {}) }));
                server.registerResource('public', 'public://fixture', { mimeType: 'text/plain' }, async uri => ({ contents: [{ uri: uri.href, mimeType: 'text/plain', text: echo === 'resource' ? echoed : await readFile(file, 'utf8') }] }));
                transport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID, enableJsonResponse: true,
                    onsessioninitialized: id => sessions.set(id, transport) });
                servers.push(server); await server.connect(transport);
            }
            if (!transport) { res.writeHead(400); res.end(); return; }
            await transport.handleRequest(req, res, body);
        } catch { if (!res.headersSent) res.writeHead(500); res.end(); }
    });
    await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
    return { endpoint: `http://127.0.0.1:${listener.address().port}/mcp`, calls, cleanup: async () => {
        listener.closeAllConnections(); await new Promise(resolve => listener.close(resolve));
        for (const server of servers) await server.close();
        await rm(directory, { recursive: true, force: true });
    } };
}

if (process.env.ATRIA_MCP_SDK_ROOT) {
    test.each(['text', 'json', 'resource'])('S30 real SDK %s secret echo never becomes public and retains failed work', async echo => {
        const provider = await sdkFixture({ echo }), f = await fixture();
        const secret = 'synthetic-"review\\secret';
        f.host.secretPort = { resolveSecret: async () => secret };
        try {
            const connection = await f.host.persistence.getConnectionProfile(f.h.handle, f.route.executionPolicy.mcp.connectionProfileId);
            await f.host.persistence.saveConnectionProfile(f.h.handle, { ...connection, endpoint: provider.endpoint });
            await f.host.persistence.saveRuntimeRoute(f.h.handle, { ...f.route, executionPolicy: { ...f.route.executionPolicy, mcp: { ...f.route.executionPolicy.mcp, auth: 'secret' } } });
            const service = new McpService({ host: f.host, scheduler: f.scheduler });
            const body = { ...f.body };
            if (echo === 'resource') { delete body.toolName; body.resourceUri = 'public://fixture'; }
            const started = await service.start(f.h.handle, body);
            await expect(f.scheduler.operations.get(started.operationId).handle.result).rejects.toMatchObject({ code: 'native_mcp_response_contains_secret', message: 'native_mcp_response_contains_secret' });
            const status = await service.status(f.h.handle, { operationId: started.operationId });
            expect(status).toMatchObject({ status: 'failed', artifact: null, errorCode: 'native_mcp_response_contains_secret' });
            expect(JSON.stringify(status)).not.toContain(JSON.stringify(secret).slice(1, -1));
            const bank = await f.f.core.runs.status(f.h.handle, f.body.sessionId), work = Object.values(bank.operations).flatMap(value => value.compute?.localWork ?? []);
            expect(work.map(row => row.usage.outcome)).toEqual(['completed', 'completed', 'completed', 'completed', 'failed']);
            expect(provider.calls).toEqual(['initialize', 'notifications/initialized', echo === 'resource' ? 'resources/list' : 'tools/list', echo === 'resource' ? 'resources/read' : 'tools/call']);
        } finally { await f.cleanup(); await provider.cleanup(); }
    });

    test.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('S30 real SDK %s original service and HTTP consume tools/resources with bounded external provenance', async (_kind, harness) => {
        const provider = await sdkFixture(), f = await fixture(32, undefined, harness);
        let httpOperationId;
        try {
            const connection = await f.host.persistence.getConnectionProfile(f.h.handle, f.route.executionPolicy.mcp.connectionProfileId);
            await f.host.persistence.saveConnectionProfile(f.h.handle, { ...connection, endpoint: provider.endpoint });
            const service = new McpService({ host: f.host, scheduler: f.scheduler });
            const started = await service.start(f.h.handle, f.body), artifact = await f.scheduler.operations.get(started.operationId).handle.result;
            expect(JSON.parse(artifact.result.content[0].text)).toEqual({ characters: 22, words: 3 });
            expect(artifact.provenance.evidence.every(row => /^[a-f0-9]{64}$/.test(row.requestFingerprint))).toBe(true);
            const app = express(); app.use(express.json());
            app.use((req, _res, next) => { if (req.headers['x-synthetic-owner']) req.user = { profile: { handle: req.headers['x-synthetic-owner'] } }; next(); });
            app.use(createNativeGenerationRouter(() => f.host));
            expect((await request(app).post('/mcp/start').send(f.body)).status).toBe(401);
            expect((await request(app).post('/mcp/start').set('x-synthetic-owner', f.h.handle).send({ ...f.body, text: 'forbidden raw input' })).status).toBe(400);
            const resourceBody = { ...f.body, resourceUri: 'public://fixture' }; delete resourceBody.toolName;
            const response = await request(app).post('/mcp/start').set('x-synthetic-owner', f.h.handle).send(resourceBody);
            httpOperationId = response.body.operationId;
            expect(response.status).toBe(200); expect(response.headers['cache-control']).toBe('private, no-store');
            const httpService = new McpService({ host: f.host });
            let status;
            for (let count = 0; count < 100; count++) {
                status = await httpService.status(f.h.handle, { operationId: response.body.operationId });
                if (['completed', 'failed', 'stale', 'cancelled'].includes(status.status)) break;
                await new Promise(resolve => setTimeout(resolve, 5));
            }
            expect(status.status).toBe('completed'); expect(status.artifact.result.contents[0].text).toBe('Public synthetic resource: 3 planets.');
            const projected = await request(app).post('/mcp/status').set('x-synthetic-owner', f.h.handle).send({ operationId: response.body.operationId });
            expect(projected.body.artifact).toEqual(status.artifact);
            expect((await request(app).post('/mcp/status').set('x-synthetic-owner', 'other-owner').send({ operationId: response.body.operationId })).status).toBe(400);
            expect(provider.calls).toEqual(['initialize', 'notifications/initialized', 'tools/list', 'tools/call', 'initialize', 'notifications/initialized', 'resources/list', 'resources/read']);
            expect(await f.f.core.load(f.h.handle, f.body.sessionId)).toEqual(f.base);
            const bank = await f.f.core.runs.status(f.h.handle, f.body.sessionId);
            expect(Object.values(bank.operations).flatMap(value => value.compute?.localWork ?? [])).toHaveLength(10);
        } finally {
            if (httpOperationId) {
                nativeTaskScheduler.cancel(f.h.handle, httpOperationId);
                const operation = nativeTaskScheduler.operations.get(httpOperationId);
                while (nativeTaskScheduler.running.has(operation)) await new Promise(resolve => setTimeout(resolve, 5));
            }
            await f.cleanup(); await provider.cleanup();
        }
    });
}
