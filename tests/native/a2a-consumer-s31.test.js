import { expect, test } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { FsEngine } from '../../src/storage/engines/fs-engine.js';
import { SqliteEngine } from '../../src/storage/engines/sqlite-engine.js';
import { services } from './helpers/session-fixture.js';
import { NativeModelPromptPersistence } from '../../src/native/model-prompt-runtime/persistence.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { installCognitionFixture } from './helpers/cognition-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { NativeTaskScheduler, nativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { describeSessionProtocols } from '../../src/native/session-public-work.js';
import { A2aService } from '../../src/native/a2a-service.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';

async function remoteFixture(hook = async () => {}) {
    const calls = [], tasks = new Map(); let endpoint;
    const server = http.createServer(async (req, res) => {
        try {
            const chunks = []; for await (const chunk of req) chunks.push(chunk);
            const body = req.method === 'GET' ? { method: 'GetAgentCard' } : JSON.parse(Buffer.concat(chunks).toString());
            calls.push({ method: body.method, params: body.params, authorization: req.headers.authorization });
            await hook({ body, req, res, tasks }); if (res.destroyed || res.writableEnded) return;
            res.setHeader('content-type', 'application/json');
            if (body.method === 'GetAgentCard') {
                res.end(JSON.stringify({ name: 'Public synthetic statistics', description: 'Local fixture', version: '1',
                    supportedInterfaces: [{ url: endpoint, protocolBinding: 'JSONRPC', protocolVersion: '1.0' }], capabilities: {},
                    defaultInputModes: ['text/plain'], defaultOutputModes: ['application/json'], skills: [{ id: 'stats', name: 'Statistics', description: 'Public word count', tags: ['public'] }] }));
                return;
            }
            let result;
            if (body.method === 'SendMessage') {
                const text = body.params.message.parts[0].text;
                const task = { id: randomUUID(), contextId: randomUUID(), status: { state: 'TASK_STATE_WORKING' },
                    artifacts: [{ artifactId: randomUUID(), parts: [{ data: { characters: text.length, words: text.trim().split(/\s+/).length }, mediaType: 'application/json' }] }] };
                tasks.set(task.id, task); result = { task };
            } else {
                result = tasks.get(body.params.id);
                result.status.state = body.method === 'CancelTask' ? 'TASK_STATE_CANCELED' : 'TASK_STATE_COMPLETED';
            }
            res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
        } catch { if (!res.headersSent) res.writeHead(500); res.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    endpoint = `http://127.0.0.1:${server.address().port}/rpc`;
    return { endpoint, calls, tasks, cleanup: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}

async function fixture(harness = makeTempFsEngineHarness, maxJobs = 32, hook, scheduler = new NativeTaskScheduler()) {
    const remote = await remoteFixture(hook), h = await harness();
    const f = await installCognitionFixture(h, 'limited', undefined, ({ contract }) => {
        contract.informationRuntime.sources.push({ id: 'public-lines', kind: 'timeline', semantic: 'narrative', scopeId: 'session', fields: [['content']] });
        contract.informationRuntime.views.find(view => view.id === 'player').sources.push('public-lines');
    });
    const base = await f.core.appendTimeline(h.handle, f.snapshot.session.sessionId, { role: 'assistant', content: 'public synthetic words' }, { expectedRevisionId: f.snapshot.revision.revisionId });
    const seeded = await seedGenerationProfiles({ ...h, endpoint: remote.endpoint });
    await seeded.persistence.saveConnectionProfile(h.handle, { ...seeded.connection, providerAdapter: 'provider.a2a' });
    const route = { ...seeded.routes[0], executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [seeded.model.modelProfileId],
        a2a: { protocolVersion: '1.0', connectionProfileId: seeded.connection.connectionProfileId, skillIds: ['stats'], auth: 'none' },
        computeBudget: { maxRequests: 1, maxTokens: 4096, localWork: { maxJobs, maxItems: 10000, maxInputBytes: 16777216 } } } };
    await seeded.persistence.saveRuntimeRoute(h.handle, route);
    const host = { ...seeded, sessionCore: f.core, packageInstaller: f.packageInstaller };
    const service = new A2aService({ host, scheduler });
    const body = { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, viewId: 'player', itemId: 'public-lines:' + base.timeline.at(-1).messageId, skillId: 'stats' };
    const result = async started => scheduler.operations.get(started.operationId).handle.result;
    return { h, f, base, host, scheduler, service, body, route, remote, result, cleanup: async () => {
        for (const operation of scheduler.operations.values()) scheduler.cancel(h.handle, operation.view.operationId);
        while (scheduler.running.size) await new Promise(resolve => setTimeout(resolve, 5));
        await h.cleanup(); await remote.cleanup();
    } };
}

test.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('S31 real %s consumer computes public statistics, rebuilds explicit GetTask and cancels acquired identity', async (_kind, harness) => {
    const f = await fixture(harness);
    try {
        const started = await f.service.start(f.h.handle, f.body), artifact = await f.result(started);
        expect(artifact.result.task.artifacts[0].parts[0].data).toEqual({ characters: 22, words: 3 });
        expect(artifact.result.task.status.state).toBe('TASK_STATE_WORKING');
        const rebuilt = new A2aService({ host: f.host, scheduler: f.scheduler });
        const connected = await rebuilt.reconnect(f.h.handle, { operationId: started.operationId }), completed = await f.result(connected);
        expect(completed.result.status.state).toBe('TASK_STATE_COMPLETED');
        expect(completed.provenance).toMatchObject({ external: true, protocolVersion: '1.0' });
        const cancelled = await rebuilt.cancel(f.h.handle, { operationId: started.operationId }), stopped = await f.result(cancelled);
        expect(stopped.result.status.state).toBe('TASK_STATE_CANCELED'); expect(stopped.remoteRollbackConfirmed).toBe(false);
        expect(f.remote.calls.map(row => row.method)).toEqual(['GetAgentCard', 'SendMessage', 'GetAgentCard', 'GetTask', 'GetAgentCard', 'CancelTask']);
        expect(new Set(f.remote.calls.filter(row => row.method !== 'GetAgentCard' && row.method !== 'SendMessage').map(row => row.params.id)).size).toBe(1);
        expect(await f.f.core.load(f.h.handle, f.body.sessionId)).toEqual(f.base);
        const bank = await f.f.core.runs.status(f.h.handle, f.body.sessionId), work = Object.values(bank.operations).flatMap(value => value.compute?.localWork ?? []);
        expect(work.map(row => row.kind)).toEqual(['context_build', ...Array(6).fill('a2a_protocol')]);
        expect(work.every(row => row.usage.outcome === 'completed')).toBe(true);
        expect((await rebuilt.status(f.h.handle, { operationId: started.operationId })).recovery).toBe('durable_identity');
    } finally { await f.cleanup(); }
});

test('S31 private/raw/caller remote identity are denied and absent policy never calls remote', async () => {
    const f = await fixture();
    try {
        await expect(f.service.start(f.h.handle, { ...f.body, text: 'caller text' })).rejects.toThrow();
        await expect(f.service.start(f.h.handle, { ...f.body, viewId: 'pov' })).rejects.toThrow(/display_denied/);
        await expect(f.service.start(f.h.handle, { ...f.body, skillId: 'unlisted' })).rejects.toThrow(/allowlist_denied/);
        await expect(f.service.reconnect(f.h.handle, { operationId: 'absent', id: 'remote', contextId: 'context' })).rejects.toThrow();
        await f.host.persistence.saveRuntimeRoute(f.h.handle, { ...f.route, executionPolicy: undefined });
        expect(await f.service.start(f.h.handle, f.body)).toMatchObject({ status: 'fallback' }); expect(f.remote.calls).toEqual([]);
    } finally { await f.cleanup(); }
});

test('S31 each actual card/protocol request is budgeted and exhausted budget never sends a message', async () => {
    const f = await fixture(makeTempFsEngineHarness, 2);
    try {
        const started = await f.service.start(f.h.handle, f.body);
        await expect(f.result(started)).rejects.toThrow(/budget/);
        expect(f.remote.calls.map(row => row.method)).toEqual(['GetAgentCard']);
    } finally { await f.cleanup(); }
});

test('S31 owner and Engine isolation protect acquired task identities', async () => {
    const first = await fixture(), second = await fixture();
    try {
        const started = await first.service.start(first.h.handle, first.body); await first.result(started);
        await expect(first.service.reconnect('other-owner', { operationId: started.operationId })).rejects.toThrow(/operation_missing/);
        await expect(second.service.reconnect(first.h.handle, { operationId: started.operationId })).rejects.toThrow(/operation_missing/);
        expect(second.remote.calls).toEqual([]);
    } finally { await first.cleanup(); await second.cleanup(); }
});

test('S31 auth resolves only the owner exact SecretRef and never publishes its value', async () => {
    const f = await fixture(), refs = [];
    f.host.secretPort = { resolveSecret: async (ref, { handle }) => { refs.push({ ref, handle }); return 'synthetic-local-token'; } };
    try {
        await f.host.persistence.saveRuntimeRoute(f.h.handle, { ...f.route, executionPolicy: { ...f.route.executionPolicy, a2a: { ...f.route.executionPolicy.a2a, auth: 'secret' } } });
        const artifact = await f.result(await f.service.start(f.h.handle, f.body));
        expect(refs).toEqual([{ ref: { scope: 'player', secretId: 'p4-synthetic-key' }, handle: f.h.handle }]);
        expect(f.remote.calls.every(row => row.authorization === 'Bearer synthetic-local-token')).toBe(true);
        expect(JSON.stringify(artifact)).not.toContain('synthetic-local-token');
    } finally { await f.cleanup(); }
});

test.each(['text', 'json', 'identity'])('S31 actual remote %s secret echo is refused before identity/publication and preserves failed work', async kind => {
    const secret = 'synthetic-"review\\secret';
    const f = await fixture(makeTempFsEngineHarness, 32, async ({ body, req, res }) => {
        if (body.method !== 'SendMessage') return;
        const echoed = req.headers.authorization.slice('Bearer '.length);
        const task = { id: kind === 'identity' ? echoed : 'public-task', contextId: 'public-context', status: { state: 'TASK_STATE_COMPLETED' },
            artifacts: [{ artifactId: 'public-artifact', parts: [kind === 'json' ? { data: { nested: [echoed] } } : { text: kind === 'text' ? echoed : 'public result' }] }] };
        res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { task } }));
    });
    f.host.secretPort = { resolveSecret: async () => secret };
    try {
        await f.host.persistence.saveRuntimeRoute(f.h.handle, { ...f.route, executionPolicy: { ...f.route.executionPolicy, a2a: { ...f.route.executionPolicy.a2a, auth: 'secret' } } });
        const started = await f.service.start(f.h.handle, f.body);
        await expect(f.result(started)).rejects.toMatchObject({ code: 'native_a2a_response_contains_secret', message: 'native_a2a_response_contains_secret' });
        const status = await f.service.status(f.h.handle, { operationId: started.operationId });
        expect(status).toMatchObject({ status: 'failed', artifact: null, canReconnect: false, errorCode: 'native_a2a_response_contains_secret' });
        expect(JSON.stringify(status)).not.toContain(JSON.stringify(secret).slice(1, -1));
        await expect(f.service.reconnect(f.h.handle, { operationId: started.operationId })).rejects.toThrow(/identity_unavailable/);
        const bank = await f.f.core.runs.status(f.h.handle, f.body.sessionId), work = Object.values(bank.operations).flatMap(value => value.compute?.localWork ?? []);
        expect(work.map(row => row.usage.outcome)).toEqual(['completed', 'completed', 'failed']);
        expect(f.remote.calls.map(row => row.method)).toEqual(['GetAgentCard', 'SendMessage']);
    } finally { await f.cleanup(); }
});

test.each([123, { token: 'synthetic' }])('S31 malformed secret value %# never reaches a remote request', async secret => {
    const f = await fixture(); f.host.secretPort = { resolveSecret: async () => secret };
    try {
        await f.host.persistence.saveRuntimeRoute(f.h.handle, { ...f.route, executionPolicy: { ...f.route.executionPolicy, a2a: { ...f.route.executionPolicy.a2a, auth: 'secret' } } });
        const started = await f.service.start(f.h.handle, f.body);
        await expect(f.result(started)).rejects.toMatchObject({ code: 'native_a2a_secret_unavailable' });
        expect(f.remote.calls).toEqual([]);
    } finally { await f.cleanup(); }
});

test('S31 dropped dispatched response remains unknown and never resends or invents identity', async () => {
    const f = await fixture(makeTempFsEngineHarness, 32, async ({ body, req }) => { if (body.method === 'SendMessage') req.socket.destroy(); });
    try {
        const started = await f.service.start(f.h.handle, f.body);
        await expect(f.result(started)).rejects.toThrow();
        const status = await f.service.status(f.h.handle, { operationId: started.operationId });
        expect(status.failure).toMatchObject({ outcome: 'unknown', dispatched: true, remoteRollbackConfirmed: false });
        await expect(f.service.reconnect(f.h.handle, { operationId: started.operationId })).rejects.toThrow(/identity_unavailable/);
        expect(f.remote.calls.filter(row => row.method === 'SendMessage')).toHaveLength(1);
    } finally { await f.cleanup(); }
});

test.each(['route', 'revision', 'scope', 'profile'])('S31 changed %s during actual remote response blocks stale publication and reconnect', async kind => {
    let f;
    f = await fixture(makeTempFsEngineHarness, 32, async ({ body }) => {
        if (body.method !== 'SendMessage') return;
        if (kind === 'route') await f.host.persistence.saveRuntimeRoute(f.h.handle, { ...f.route, displayName: 'changed' });
        else if (kind === 'profile') await f.host.persistence.saveConnectionProfile(f.h.handle, { ...await f.host.persistence.getConnectionProfile(f.h.handle, f.route.executionPolicy.a2a.connectionProfileId), displayName: 'changed' });
        else if (kind === 'revision') await f.f.core.appendTimeline(f.h.handle, f.body.sessionId, { role: 'user', content: 'next' }, { expectedRevisionId: f.body.revisionId });
        else await f.f.core.applyLifecycleCommand(f.h.handle, f.body.sessionId, { type: 'lifecycle', invocationId: 'a2a-suspend', action: { kind: 'scope.transition', scopeId: 'session', status: 'suspended' } }, { expectedRevisionId: f.body.revisionId });
    });
    try {
        const started = await f.service.start(f.h.handle, f.body);
        await expect(f.result(started)).rejects.toThrow(/source_stale/);
        expect((await f.service.status(f.h.handle, { operationId: started.operationId })).artifact).toBeNull();
        await expect(f.service.reconnect(f.h.handle, { operationId: started.operationId })).rejects.toThrow(/identity_unavailable/);
        const bank = await f.f.core.runs.status(f.h.handle, f.body.sessionId), work = Object.values(bank.operations).flatMap(value => value.compute?.localWork ?? []);
        const totals = bank.retiredCompute ?? { localJobs: work.length, localFailedJobs: work.filter(row => row.usage.outcome === 'failed').length };
        expect(totals).toMatchObject({ localJobs: 3, localFailedJobs: 1 });
    } finally { await f.cleanup(); }
});

test('S31 local cancel aborts actual pending request without claiming remote rollback', async () => {
    let entered, release;
    const began = new Promise(resolve => { entered = resolve; });
    const f = await fixture(makeTempFsEngineHarness, 32, async ({ body }) => {
        if (body.method === 'SendMessage') { entered(); await new Promise(resolve => { release = resolve; }); }
    });
    try {
        const started = await f.service.start(f.h.handle, f.body);
        await began;
        expect(await f.service.cancel(f.h.handle, { operationId: started.operationId })).toMatchObject({ cancelled: true, remoteRollbackConfirmed: false, remoteOutcome: 'unknown' });
        await expect(f.result(started)).rejects.toThrow(/cancelled/); release();
        while (f.scheduler.running.size) await new Promise(resolve => setTimeout(resolve, 5));
        const status = await f.service.status(f.h.handle, { operationId: started.operationId });
        expect(status.artifact).toBeNull(); expect(status.failure.remoteOutcome).toBe('unknown');
    } finally { release?.(); await f.cleanup(); }
});

test.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('S31 authenticated %s HTTP starts, projects, reconnects and cancels only the owner acquired task', async (_kind, harness) => {
    const f = await fixture(harness, 32, undefined, nativeTaskScheduler);
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { if (req.headers['x-synthetic-owner']) req.user = { profile: { handle: req.headers['x-synthetic-owner'] } }; next(); });
    app.use(createNativeGenerationRouter(() => f.host));
    const post = (action, body, owner = f.h.handle) => request(app).post('/a2a/' + action).set('x-synthetic-owner', owner).send(body);
    try {
        for (const action of ['start', 'status', 'reconnect', 'cancel']) {
            expect((await request(app).post('/a2a/' + action).send(action === 'start' ? f.body : { operationId: 'absent' })).status).toBe(401);
        }
        expect((await post('start', { ...f.body, text: 'forbidden caller input' })).status).toBe(400);
        expect((await post('start', { ...f.body, viewId: 'pov' })).status).toBe(400);
        expect(f.remote.calls).toHaveLength(0);
        const started = await post('start', f.body);
        expect(started.status).toBe(200); expect(started.headers['cache-control']).toBe('private, no-store');
        expect(started.body).toMatchObject({ status: 'queued', action: 'send', remoteRollbackConfirmed: false });
        const initial = await f.result(started.body), operation = { operationId: started.body.operationId };
        expect(initial.result.task.artifacts[0].parts[0].data.words).toBe(3);
        const before = f.remote.calls.length;
        for (const action of ['status', 'reconnect', 'cancel']) {
            const denied = await post(action, operation, 'other-owner');
            expect(denied.status).toBe(400); expect(denied.body.error).toBe('native_a2a_operation_missing');
            expect((await post(action, { ...operation, id: 'caller-remote-task', contextId: 'caller-context' })).status).toBe(400);
        }
        expect(f.remote.calls).toHaveLength(before);
        const projected = await post('status', operation);
        expect(projected.status).toBe(200); expect(projected.body.artifact).toEqual(initial);
        expect(projected.body).toMatchObject({ current: true, canReconnect: true, recovery: 'durable_identity' });
        const reconnected = await post('reconnect', operation);
        expect(reconnected.status).toBe(200); expect(reconnected.body.action).toBe('get');
        expect((await f.result(reconnected.body)).result.status.state).toBe('TASK_STATE_COMPLETED');
        const cancelled = await post('cancel', operation);
        expect(cancelled.status).toBe(200); expect(cancelled.body.action).toBe('cancel');
        expect((await f.result(cancelled.body)).result.status.state).toBe('TASK_STATE_CANCELED');
        const final = await post('status', operation);
        expect(final.body.artifact.remoteRollbackConfirmed).toBe(false);
        expect(f.remote.calls.map(row => row.method)).toEqual(['GetAgentCard', 'SendMessage', 'GetAgentCard', 'GetTask', 'GetAgentCard', 'CancelTask']);
        expect(await f.f.core.load(f.h.handle, f.body.sessionId)).toEqual(f.base);
    } finally { await f.cleanup(); }
});

for (const [kind, harness, Engine] of [['FS', makeTempFsEngineHarness, FsEngine], ['SQLite', makeTempSqliteEngineHarness, SqliteEngine]]) {
    test(`A2A ${kind} cold engine and scheduler restore exact remote identity without SendMessage replay`, async () => {
        const f = await fixture(harness); let engine;
        try {
            const started = await f.service.start(f.h.handle, f.body); await f.result(started);
            const before = await f.f.core.runs.status(f.h.handle, f.body.sessionId);
            engine = new Engine({ directoriesByHandle: handle => { if (handle !== f.h.handle) throw new Error('owner denied'); return f.h.dirs; } });
            const cold = services(f.h, engine), scheduler = new NativeTaskScheduler();
            const host = { ...f.host, sessionCore: cold.core, persistence: new NativeModelPromptPersistence({ engine }), packageInstaller: cold.packageInstaller };
            const rebuilt = new A2aService({ host, scheduler }), input = { operationId: started.operationId, sessionId: f.body.sessionId };
            expect(await rebuilt.status(f.h.handle, input)).toMatchObject({ status: 'interrupted', canReconnect: true, artifact: null, recovery: 'durable_identity' });
            expect(await cold.core.runs.status(f.h.handle, f.body.sessionId)).toEqual(before);
            const connected = await rebuilt.reconnect(f.h.handle, input), result = await scheduler.operations.get(connected.operationId).handle.result;
            expect(result.result.status.state).toBe('TASK_STATE_COMPLETED');
            expect(f.remote.calls.filter(row => row.method === 'SendMessage')).toHaveLength(1);
            expect(f.remote.calls.filter(row => row.method === 'GetTask')).toHaveLength(1);
            expect((await cold.core.runs.status(f.h.handle, f.body.sessionId)).operations).not.toEqual(before.operations);
            await expect(rebuilt.reconnect(f.h.handle, { operationId: started.operationId, sessionId: 'wrong' })).rejects.toMatchObject({ code: 'native_a2a_operation_missing' });
            expect(await cold.core.load(f.h.handle, f.body.sessionId)).toEqual(f.base);
        } finally { engine?.close?.(); await f.cleanup(); }
    });
}

test('protocol inventory exposes only disclosed public choices and durable acquired task references', async () => {
    const f = await fixture();
    try {
        const input = { sessionId: f.body.sessionId, revisionId: f.body.revisionId };
        const before = await describeSessionProtocols(f.host, f.h.handle, input);
        expect(before.services).toEqual([{ protocol: 'a2a', skillId: 'stats', label: 'A2A · stats' }]);
        expect(before.items).toEqual(expect.arrayContaining([expect.objectContaining({ viewId: 'player', itemId: f.body.itemId })]));
        expect(JSON.stringify(before)).not.toMatch(/secretRef|Authorization|PRIVATE/); expect(before.tasks).toEqual([]);
        const started = await f.service.start(f.h.handle, f.body); await f.result(started);
        const retained = await describeSessionProtocols(f.host, f.h.handle, input);
        expect(retained.tasks).toEqual([{ sessionId: input.sessionId, operationId: started.operationId, label: 'stats' }]);
        expect(retained).not.toHaveProperty('endpoint');
    } finally { await f.cleanup(); }
});
