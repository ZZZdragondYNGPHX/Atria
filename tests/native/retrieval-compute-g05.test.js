import { expect, test, jest } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import { createServer } from 'node:http';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import { makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture } from './helpers/session-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { projectSource, services as projectServices } from '../agent-intelligence/project-fixture.js';
import { NativeRetrievalPersistence } from '../../src/native/retrieval-persistence.js';
import { createRetrievalMiddleware } from '../../src/native/retrieval-execution.js';
import { prepareRetrievalCompute } from '../../src/native/retrieval-compute.js';
import { createNativeId } from '../../src/native/identity.js';
import { retrievalRef } from '../../public/scripts/native/retrieval-contracts.js';
import { router as vectors } from '../../src/endpoints/vectors.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { rerank } from '../../src/vectors/rerank.js';
import { getOpenAIBatchVector } from '../../src/vectors/openai-vectors.js';
import { emptyProvenance, captureEpisodes } from '../../public/scripts/agents/memory/source-provenance.js';
import { retrieveMemory } from '../../public/scripts/agents/memory/hybrid-retrieval.js';
import { webcrypto } from 'node:crypto';

async function fixture(make, maxRequests = 2) {
    const h = await make(), seen = [];
    let respond = () => ({ results: [{ index: 0, relevance_score: .9 }] });
    let respondEmbedding = body => ({ data: body.input.map((_, index) => ({ index, embedding: [1, 0] })), usage: { prompt_tokens: 3, total_tokens: 3 } });
    const server = createServer(async (req, res) => {
        let raw = ''; for await (const chunk of req) raw += chunk;
        seen.push({ path: req.url, body: JSON.parse(raw) });
        const body = req.url.endsWith('/rerank') ? await respond() : req.url.endsWith('/embeddings') ? await respondEmbedding(JSON.parse(raw))
            : { choices: [{ message: { role: 'assistant', content: 'Fresh answer.' } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } };
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const endpoint = `http://127.0.0.1:${server.address().port}/v1`;
    const installed = await installFixture(h), base = await installed.core.create(h.handle, installed.start);
    const seeded = await seedGenerationProfiles({ ...h, endpoint: endpoint + '/chat/completions', roles: ['narrator', 'studio'] });
    for (const route of seeded.routes) await seeded.persistence.saveRuntimeRoute(h.handle, { ...route, executionPolicy: { schemaVersion: 1,
        allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget: { maxRequests, maxTokens: 64000 } } });
    const profile = { retrievalProfileId: createNativeId('retrievalProfile'), revision: createNativeId('revision'), displayName: 'Finite ranker',
        mode: 'rerank', source: 'custom', model: 'test-rank', endpoint, secretRef: { secretId: 'synthetic' }, options: {} };
    const store = new NativeRetrievalPersistence({ engine: h.engine }); await store.commit(h.handle, profile);
    const computeServices = { core: installed.core, persistence: seeded.persistence, ...projectServices(h) };
    const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { profile: { handle: h.handle }, directories: h.dirs }; next(); });
    app.use(createRetrievalMiddleware(() => store, () => 'synthetic-key', async () => computeServices)); app.use(vectors);
    const computeContext = { kind: 'session', sessionId: base.session.sessionId, revisionId: base.revision.revisionId };
    const body = { nativeRetrievalRef: retrievalRef(profile), query: 'Why Alice?', documents: [{ text: 'Because of the storm', index: 0 }], computeContext };
    return { ...h, ...seeded, ...computeServices, base, profile, body, seen, store, request: supertest(app), respond: fn => { respond = fn; }, respondEmbedding: fn => { respondEmbedding = fn; },
        async cleanup() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h.cleanup(); } };
}

async function embeddingBody(f, items = [{ hash: 1, text: 'Current legal evidence', index: 0 }]) {
    const profile = { ...f.profile, retrievalProfileId: createNativeId('retrievalProfile'), mode: 'embed', source: 'openai', model: 'test-embed' };
    await f.store.commit(f.handle, profile);
    return { nativeRetrievalRef: retrievalRef(profile), collectionId: 'g05-embed', items, computeContext: f.body.computeContext };
}

for (const [kind, make] of [['fs', makeTempFsEngine], ['sqlite', makeTempSqliteEngineHarness]]) {
    test(`G05 ${kind} Embedding batches and narration consume the same original Run allowance`, async () => {
        const f = await fixture(make, 3);
        try {
            const body = await embeddingBody(f, Array.from({ length: 11 }, (_, index) => ({ hash: index + 1, text: 'Legal source ' + index, index })));
            await f.request.post('/insert').send(body).expect(200);
            expect(f.seen.map(row => row.body.input.length)).toEqual([10, 1]);
            const host = new NativeGenerationHost({ ...f, sessionCore: f.core,
                providers: { 'provider.openai-compatible': createHttpGenerationProvider() }, secretPort: { resolveSecret: async () => 'synthetic-key' } });
            await host.execute(f.handle, { sessionId: f.base.session.sessionId, revisionId: f.base.revision.revisionId, requestId: 'shared-embedding-narration', role: 'narrator' });
            const { items: _items, ...query } = body;
            await f.request.post('/query').send({ ...query, searchText: 'Legal source' }).expect(429);
            expect(f.seen).toHaveLength(3);
            const ledger = Object.values((await f.core.runs.status(f.handle, f.base.session.sessionId)).operations).find(row => row.compute).compute;
            expect(ledger.attempts.map(row => row.status)).toEqual(['settled', 'settled', 'settled']);
            expect(ledger.attempts.map(row => row.usage.totalTokens)).toEqual([3, 3, 15]);
            expect(new Set(ledger.attempts.map(row => row.attemptId)).size).toBe(3);
            expect(ledger.attempts[0].targetFingerprint).not.toBe(ledger.attempts[2].targetFingerprint);
        } finally { await f.cleanup(); }
    });
}

test('G05 query-multi spends one actual Embedding send; concurrent queries cannot exceed the remaining Run allowance', async () => {
    const f = await fixture(makeTempFsEngine, 2);
    try {
        const body = await embeddingBody(f);
        await f.request.post('/insert').send(body).expect(200);
        const { items: _items, collectionId, ...query } = body;
        const responses = await Promise.all([f.request.post('/query-multi').send({ ...query, collectionIds: [collectionId], searchText: 'evidence' }),
            f.request.post('/query').send({ ...query, collectionId, searchText: 'evidence' })]);
        expect(responses.map(row => row.status).sort()).toEqual([200, 429]);
        expect(f.seen).toHaveLength(2);
        const ledger = Object.values((await f.core.runs.status(f.handle, f.base.session.sessionId)).operations).find(row => row.compute).compute;
        expect(ledger.attempts).toHaveLength(2);
    } finally { await f.cleanup(); }
});

test('G05 scoped Embedding retains unknown cancellation and shares the original Project Task budget', async () => {
    const f = await fixture(makeTempFsEngine, 2), controller = new AbortController();
    try {
        const body = await embeddingBody(f), profile = await f.store.getExact(f.handle, body.nativeRetrievalRef);
        const source = projectSource(), project = await f.studio.createProject(f.handle, source);
        const task = await f.agent.createTask(f.handle, source.project.projectId, { intent: 'Read source evidence', baseRevision: project.revision.revision });
        const context = { kind: 'project', projectId: source.project.projectId, taskId: task.taskId, revision: project.revision.revision };
        const stale = await prepareRetrievalCompute({ ...f, context, profile });
        await f.agent.setPlan(f.handle, context.projectId, context.taskId, { summary: 'Changed task', steps: [{ id: 'read', title: 'Read evidence', impact: 'low' }] });
        const send = compute => getOpenAIBatchVector(['Legal evidence'], 'openai', f.dirs, profile.model,
            { reverseProxy: profile.endpoint, proxyPassword: 'synthetic-key' }, { nativeRetrieval: { compute, signal: controller.signal } });
        await expect(send(stale)).rejects.toMatchObject({ code: 'native_generation_task_stopped' });
        expect(f.seen).toHaveLength(0);
        const compute = await prepareRetrievalCompute({ ...f, context, profile });
        f.respondEmbedding(() => { controller.abort(); return { data: [{ index: 0, embedding: [1, 0] }] }; });
        await expect(send(compute)).rejects.toMatchObject({ name: 'AbortError' });
        expect((await f.agent.getTask(f.handle, context.projectId, context.taskId)).compute.attempts[0]).toMatchObject({ status: 'unknown', usage: null });
        await f.request.post('/insert').send({ ...body, computeContext: context }).expect(200);
        await f.request.post('/insert').send({ ...body, computeContext: context }).expect(429);
        expect(f.seen).toHaveLength(2);
        expect((await f.agent.getTask(f.handle, context.projectId, context.taskId)).compute.attempts).toHaveLength(2);
    } finally { await f.cleanup(); }
});

test('G05 scoped Embedding keeps old unbounded Routes and rejects unsupported budgeted providers before inference', async () => {
    const f = await fixture(makeTempFsEngine);
    try {
        const body = await embeddingBody(f), profile = await f.store.getExact(f.handle, body.nativeRetrievalRef);
        const unsupported = { ...profile, retrievalProfileId: createNativeId('retrievalProfile'), source: 'transformers', endpoint: '', secretRef: undefined };
        await f.store.commit(f.handle, unsupported);
        expect((await f.request.post('/insert').send({ ...body, nativeRetrievalRef: retrievalRef(unsupported) }).expect(400)).body.error)
            .toBe('native_retrieval_compute_unavailable');
        expect(f.seen).toHaveLength(0);
        const route = f.routes.find(row => row.role === 'role.narrator');
        await f.persistence.saveRuntimeRoute(f.handle, { ...route, executionPolicy: undefined });
        await f.request.post('/insert').send(body).expect(200);
        expect(f.seen).toHaveLength(1);
        expect(Object.values((await f.core.runs.status(f.handle, f.base.session.sessionId))?.operations ?? {}).every(row => !row.compute)).toBe(true);
    } finally { await f.cleanup(); }
});

test.each(['session', 'project'])('G05 %s scoped Embedding keeps the durable limit after Route budget removal', async lane => {
    const f = await fixture(makeTempFsEngine, 1);
    try {
        const body = await embeddingBody(f);
        let context = body.computeContext;
        if (lane === 'project') {
            const source = projectSource(), project = await f.studio.createProject(f.handle, source);
            const task = await f.agent.createTask(f.handle, source.project.projectId, { intent: 'Read evidence', baseRevision: project.revision.revision });
            context = { kind: 'project', projectId: source.project.projectId, taskId: task.taskId, revision: project.revision.revision };
        }
        await f.request.post('/insert').send({ ...body, computeContext: context }).expect(200);
        const route = f.routes.find(row => row.role === (lane === 'project' ? 'role.studio' : 'role.narrator'));
        await f.persistence.saveRuntimeRoute(f.handle, { ...route, executionPolicy: undefined });
        const { items: _items, ...query } = body;
        await f.request.post('/query').send({ ...query, computeContext: context, searchText: 'evidence' }).expect(429);
        expect(f.seen).toHaveLength(1);
    } finally { await f.cleanup(); }
});

test('G05 denied later Embedding batch keeps the prior index and charged first send', async () => {
    const f = await fixture(makeTempFsEngine, 1);
    try {
        const body = await embeddingBody(f);
        await f.request.post('/insert').send({ ...body, computeContext: undefined }).expect(200);
        const replacements = Array.from({ length: 11 }, (_, index) => ({ hash: index + 100, text: 'New source ' + index, index }));
        expect((await f.request.post('/insert').send({ ...body, items: replacements }).expect(429)).body.error)
            .toBe('native_generation_budget_exhausted');
        const found = await f.request.post('/query-by-vector').send({ nativeRetrievalRef: body.nativeRetrievalRef,
            collectionId: body.collectionId, vector: [1, 0] }).expect(200);
        expect(found.body.hashes).toEqual([1]); expect(f.seen).toHaveLength(2);
        const ledger = Object.values((await f.core.runs.status(f.handle, f.base.session.sessionId)).operations).find(row => row.compute).compute;
        expect(ledger.attempts).toHaveLength(1);
        expect(ledger.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 3 } });
    } finally { await f.cleanup(); }
});

test('G05 actual Memory client forwards the source Session anchor to Embedding insert and query', async () => {
    jest.unstable_mockModule('../../public/script.js', () => ({ getRequestHeaders: () => ({}) }));
    const { NativeRetrievalService } = await import('../../public/scripts/native/retrieval-client.js');
    const f = await fixture(makeTempFsEngine, 2), previousFetch = globalThis.fetch, previousAtria = globalThis.Atria, calls = [];
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    try {
        const body = await embeddingBody(f);
        globalThis.Atria = { getContext: () => ({ getRequestHeaders: () => ({}) }) };
        globalThis.fetch = async (url, options) => {
            if (url.endsWith('/retrieval')) return { ok: true, json: async () => f.store.list(f.handle) };
            const payload = JSON.parse(options.body); calls.push({ url, payload });
            const result = await f.request.post(url.replace('/api/vector', '')).send(payload);
            return { ok: result.status < 400, headers: new Headers({ 'content-type': 'application/json' }), json: async () => result.body };
        };
        const chat = [{ memory_os_source_id: 'source-a', mes: 'Alice lives by the harbor.' }];
        const state = emptyProvenance(); state.scopeId = 'chat'; captureEpisodes(state, chat, [0], state.scopeId);
        const snapshot = { state, chat, key: state.scopeId, assertCurrent: jest.fn() };
        const result = await retrieveMemory(snapshot, 'Alice harbor', { service: NativeRetrievalService,
            profile: { nativeRetrievalRef: body.nativeRetrievalRef, source: 'native', model: 'exact-fixture' },
            countTokens: async text => text.length, computeContext: body.computeContext });
        expect(result.diagnostics).not.toContain('vector_unavailable');
        expect(calls.filter(row => /\/(insert|query)$/.test(row.url)).map(row => row.payload.computeContext))
            .toEqual([body.computeContext, body.computeContext]);
        expect(result.sourceMessageIds).toEqual(['source-a']); expect(f.seen).toHaveLength(2);
        const ledger = Object.values((await f.core.runs.status(f.handle, f.base.session.sessionId)).operations).find(row => row.compute).compute;
        expect(ledger.attempts.map(row => row.status)).toEqual(['settled', 'settled']);
    } finally { globalThis.fetch = previousFetch; globalThis.Atria = previousAtria; await f.cleanup(); }
});

test('G05 rejected Embedding vectors preserve usage and stale source never reaches provider HTTP', async () => {
    const f = await fixture(makeTempFsEngine);
    try {
        const body = await embeddingBody(f);
        await f.request.post('/insert').send({ ...body, computeContext: { ...body.computeContext, revisionId: createNativeId('revision') } }).expect(400);
        expect(f.seen).toHaveLength(0);
        f.respondEmbedding(() => ({ data: null, usage: { total_tokens: 7, prompt_tokens: 7 } }));
        await f.request.post('/insert').send(body).expect(500);
        expect(f.seen).toHaveLength(1);
        const ledger = Object.values((await f.core.runs.status(f.handle, f.base.session.sessionId)).operations).find(row => row.compute).compute;
        expect(ledger.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 7, inputTokens: 7, outputTokens: null } });
    } finally { await f.cleanup(); }
});

for (const [kind, make] of [['fs', makeTempFsEngine], ['sqlite', makeTempSqliteEngineHarness]]) {
    test.each(['session', 'project'])(`G06 ${kind} %s effective limits survive Route relaxation/removal and diagnostics match durable receipts`, async lane => {
        const f = await fixture(make, 2);
        try {
            let context;
            if (lane === 'project') {
                const source = projectSource(), project = await f.studio.createProject(f.handle, source);
                const task = await f.agent.createTask(f.handle, source.project.projectId, { intent: 'Inspect current evidence', baseRevision: project.revision.revision });
                context = { projectId: source.project.projectId, taskId: task.taskId, revision: project.revision.revision, role: 'studio' };
            } else context = { sessionId: f.base.session.sessionId, revisionId: f.base.revision.revisionId, role: 'narrator' };
            const host = new NativeGenerationHost({ ...f, sessionCore: f.core,
                providers: { 'provider.openai-compatible': createHttpGenerationProvider() }, secretPort: { resolveSecret: async () => 'synthetic-key' } });
            const readLedger = async () => lane === 'project'
                ? (await f.agent.getTask(f.handle, context.projectId, context.taskId)).compute
                : Object.values((await f.core.runs.status(f.handle, context.sessionId)).operations).find(row => row.compute).compute;
            const send = requestId => host.execute(f.handle, { ...context, requestId });
            const first = await send('g06-first');
            expect(first.routing.compute).toMatchObject({ limits: { maxRequests: 2, maxTokens: 64000 }, observationScope: 'current_request', currencyStatus: 'unavailable' });
            expect(first.routing.compute.attempts).toEqual((await readLedger()).attempts);
            const route = f.routes.find(row => row.role === 'role.' + context.role);
            const executionPolicy = { schemaVersion: 1, allowedModelProfileIds: [f.model.modelProfileId], computeBudget: { maxRequests: 32, maxTokens: 128000 } };
            await f.persistence.saveRuntimeRoute(f.handle, { ...route, executionPolicy });
            const second = await send('g06-relaxed');
            expect(second.routing.compute.limits).toEqual({ maxRequests: 2, maxTokens: 64000 });
            expect(second.routing.compute.attempts).toEqual((await readLedger()).attempts.slice(1));
            delete executionPolicy.computeBudget;
            await f.persistence.saveRuntimeRoute(f.handle, { ...route, executionPolicy });
            await expect(send('g06-disabled')).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
            expect(f.seen).toHaveLength(2); expect((await readLedger()).attempts).toHaveLength(2);
        } finally { await f.cleanup(); }
    });
    test(`G05 ${kind} actual rerank and Narrator sends share one durable operation allowance`, async () => {
        const f = await fixture(make);
        try {
            await f.request.post('/rerank').send(f.body).expect(200);
            const host = new NativeGenerationHost({ persistence: f.persistence, library: f.library, sessionCore: f.core,
                providers: { 'provider.openai-compatible': createHttpGenerationProvider() }, secretPort: { resolveSecret: async () => 'synthetic-key' } });
            await host.execute(f.handle, { sessionId: f.base.session.sessionId, revisionId: f.base.revision.revisionId, requestId: 'fresh-narration', role: 'narrator' });
            await f.request.post('/rerank').send(f.body).expect(429);
            const op = Object.values((await f.core.runs.status(f.handle, f.base.session.sessionId)).operations).find(row => row.compute);
            expect(f.seen).toHaveLength(2); expect(op.compute.attempts).toHaveLength(2);
            expect(op.compute.attempts.map(row => row.status)).toEqual(['unknown', 'settled']);
            expect(op.compute.attempts[0].estimatedTokens).toBeGreaterThan(0);
            expect(op.compute.attempts[1].usage.totalTokens).toBe(15);
        } finally { await f.cleanup(); }
    });
    test(`G05 ${kind} concurrent rerank requests cannot spend the same remaining request`, async () => {
        const f = await fixture(make, 1);
        try {
            const results = await Promise.all([f.request.post('/rerank').send(f.body), f.request.post('/rerank').send(f.body)]);
            expect(results.map(result => result.status).sort()).toEqual([200, 429]); expect(f.seen).toHaveLength(1);
            await f.request.post('/rerank').send(f.body).expect(429);
            const op = Object.values((await f.core.runs.status(f.handle, f.base.session.sessionId)).operations).find(row => row.compute);
            expect(op.compute.attempts).toHaveLength(1); expect(op.compute.attempts[0].status).toBe('unknown');
        } finally { await f.cleanup(); }
    });
}
test('G05 rejected rerank output retains directly reported usage; stale and malformed input never sends', async () => {
    const f = await fixture(makeTempFsEngine);
    try {
        await f.request.post('/rerank').send({ ...f.body, query: '' }).expect(400);
        const { computeContext: _omitted, ...unbudgeted } = f.body;
        expect((await f.request.post('/rerank').send(unbudgeted).expect(400)).body.error).toBe('native_generation_budget_lane_denied');
        await f.request.post('/rerank').send({ ...f.body, computeContext: { ...f.body.computeContext, revisionId: createNativeId('revision') } }).expect(400);
        expect(f.seen).toHaveLength(0);
        f.respond(() => ({ usage: { total_tokens: 17, prompt_tokens: 12 }, results: null }));
        await f.request.post('/rerank').send(f.body).expect(500);
        const op = Object.values((await f.core.runs.status(f.handle, f.base.session.sessionId)).operations).find(row => row.compute);
        expect(op.compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 17, inputTokens: 12, outputTokens: null } });
    } finally { await f.cleanup(); }
});
test('G05 Project rerank consumes the original Task allowance and rejects changed Task authority before HTTP', async () => {
    const f = await fixture(makeTempFsEngine, 1);
    try {
        const source = projectSource(), project = await f.studio.createProject(f.handle, source);
        const task = await f.agent.createTask(f.handle, source.project.projectId, { intent: 'Resolve causal evidence', baseRevision: project.revision.revision });
        const context = { kind: 'project', projectId: source.project.projectId, taskId: task.taskId, revision: project.revision.revision };
        const stale = await prepareRetrievalCompute({ ...f, handle: f.handle, context, profile: f.profile });
        await f.agent.setPlan(f.handle, context.projectId, context.taskId, { summary: 'New plan', steps: [{ id: 'fresh', title: 'Read current evidence', impact: 'low' }] });
        await expect(rerank('custom', { reverseProxy: f.profile.endpoint, proxyPassword: 'synthetic-key' }, 'Why?', [{ text: 'because', index: 0 }], 1, f.dirs,
            { nativeRetrieval: { compute: stale, signal: new AbortController().signal } })).rejects.toMatchObject({ code: 'native_generation_task_stopped' });
        expect(f.seen).toHaveLength(0);
        await f.request.post('/rerank').send({ ...f.body, computeContext: context }).expect(200);
        await f.request.post('/rerank').send({ ...f.body, computeContext: context }).expect(429);
        expect((await f.agent.getContext(f.handle, context.projectId, context.taskId)).task.compute.attempts).toHaveLength(1);
    } finally { await f.cleanup(); }
});
test('G05 Hybrid rules execute Native client/middleware/HTTP only for competing causal sources, with source guard after denial', async () => {
    jest.unstable_mockModule('../../public/script.js', () => ({ getRequestHeaders: () => ({}) }));
    const { NativeRetrievalService } = await import('../../public/scripts/native/retrieval-client.js');
    const f = await fixture(makeTempFsEngine, 1), previousFetch = globalThis.fetch, previousAtria = globalThis.Atria;
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    try {
        globalThis.Atria = { getContext: () => ({ getRequestHeaders: () => ({}) }) };
        globalThis.fetch = async (url, options) => {
            const result = await f.request.post(url.replace('/api/vector', '')).send(JSON.parse(options.body));
            return { ok: result.status < 400, headers: new Headers({ 'content-type': 'application/json' }), json: async () => result.body };
        };
        const chat = [{ memory_os_source_id: 'cause-a', mes: 'Alice left because of the storm.' }, { memory_os_source_id: 'cause-b', mes: 'Alice left because of the promise.' }];
        const state = emptyProvenance(); state.scopeId = 'causal-chat'; captureEpisodes(state, chat, [0, 1], state.scopeId);
        let current = true;
        const snapshot = { state, chat, key: state.scopeId, assertCurrent: () => { if (!current) throw Object.assign(new Error('Source revoked'), { name: 'AbortError' }); } };
        const options = { service: NativeRetrievalService, rerankProfile: { nativeRetrievalRef: retrievalRef(f.profile) }, countTokens: async text => text.length,
            computeContext: f.body.computeContext, budget: 2400 };
        const ordinary = await retrieveMemory(snapshot, 'Alice', options);
        expect(ordinary.invocation.action).toBe('skip'); expect(f.seen).toHaveLength(0);
        const hard = await retrieveMemory(snapshot, 'Why did Alice leave?', options);
        expect(hard.invocation).toMatchObject({ action: 'rerank', outcome: 'completed' }); expect(f.seen).toHaveLength(1);
        const denied = await retrieveMemory(snapshot, 'Why did Alice leave?', options);
        expect(denied.invocation).toMatchObject({ outcome: 'unavailable', stop: 'native_generation_budget_exhausted' });
        expect(denied.sourceMessageIds.sort()).toEqual(['cause-a', 'cause-b']); expect(f.seen).toHaveLength(1);
        current = false; expect(() => denied.assertCurrent()).toThrow('Source revoked');
    } finally { globalThis.fetch = previousFetch; globalThis.Atria = previousAtria; await f.cleanup(); }
});
test('G05 actual cancelled rerank retains its unknown send; excessive optional inputs cannot charge', async () => {
    const f = await fixture(makeTempFsEngine), controller = new AbortController();
    try {
        await f.request.post('/rerank').send({ ...f.body, documents: Array.from({ length: 65 }, (_, index) => ({ text: 'because', index })) }).expect(400);
        expect(f.seen).toHaveLength(0);
        const compute = await prepareRetrievalCompute({ ...f, handle: f.handle, context: f.body.computeContext, profile: f.profile });
        f.respond(async () => { controller.abort(); return { results: [{ index: 0, relevance_score: .9 }] }; });
        await expect(rerank('custom', { reverseProxy: f.profile.endpoint, proxyPassword: 'synthetic-key' }, 'Why?', [{ text: 'because', index: 0 }], 1, f.dirs,
            { nativeRetrieval: { compute, signal: controller.signal } })).rejects.toMatchObject({ name: 'AbortError' });
        const op = Object.values((await f.core.runs.status(f.handle, f.base.session.sessionId)).operations).find(row => row.compute);
        expect(f.seen).toHaveLength(1); expect(op.compute.attempts).toHaveLength(1);
        expect(op.compute.attempts[0]).toMatchObject({ status: 'unknown', usage: null });
    } finally { await f.cleanup(); }
});
