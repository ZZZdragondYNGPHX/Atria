import { afterEach, expect, jest, test } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture } from './helpers/session-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { projectSource, services } from '../agent-intelligence/project-fixture.js';
import { NativeRetrievalPersistence } from '../../src/native/retrieval-persistence.js';
import { createRetrievalMiddleware } from '../../src/native/retrieval-execution.js';
import { createNativeId } from '../../src/native/identity.js';
import { retrievalRef } from '../../public/scripts/native/retrieval-contracts.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { retrieveMemory } from '../../public/scripts/agents/memory/hybrid-retrieval.js';
import { eligibleMemorySnapshot, resolveMemoryEligibility } from '../../public/scripts/agents/memory/eligibility.js';
import { memoryFixture, frozen } from '../memory-graph/hm1-fixture.js';
import { informationActor } from './helpers/information-fixture.js';
import fs from 'node:fs';

let onLoad = async () => {}, onInfer = async () => {};
const infer = jest.fn(async () => { await onInfer(); return { data: [1, 0] }; });
const load = jest.fn(async () => { await onLoad(); return infer; });
jest.unstable_mockModule('../../src/transformers.js', () => ({ getPipeline: load }));
const { router } = await import('../../src/endpoints/vectors.js');
const { getTransformersVector, getTransformersBatchVector } = await import('../../src/vectors/embedding.js');
afterEach(() => { onLoad = async () => {}; onInfer = async () => {}; load.mockClear(); infer.mockClear(); });

async function fixture(make, lane = 'session', maxJobs = 4) {
    const h = await make(), installed = await installFixture(h), base = await installed.core.create(h.handle, installed.start);
    const seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:1/never-send', roles: ['narrator', 'studio'] });
    const project = services(h), limits = { maxRequests: 2, maxTokens: 64000, localWork: { maxJobs, maxItems: 32, maxInputBytes: 1048576 } };
    for (const route of seeded.routes) await seeded.persistence.saveRuntimeRoute(h.handle, { ...route,
        executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget: limits } });
    let context = { kind: 'session', sessionId: base.session.sessionId, revisionId: base.revision.revisionId };
    if (lane === 'project') {
        const source = projectSource(), current = await project.studio.createProject(h.handle, source);
        const task = await project.agent.createTask(h.handle, source.project.projectId, { intent: 'Read local embeddings', baseRevision: current.revision.revision });
        context = { kind: 'project', projectId: source.project.projectId, taskId: task.taskId, revision: current.revision.revision };
    }
    const profile = { retrievalProfileId: createNativeId('retrievalProfile'), revision: createNativeId('revision'), displayName: 'Local inference fixture',
        mode: 'embed', source: 'transformers', model: 'fixture-local-model', endpoint: '', options: {} };
    const store = new NativeRetrievalPersistence({ engine: h.engine }); await store.commit(h.handle, profile);
    const app = express(); app.use(express.json({ limit: '2mb' })); app.use((req, _res, next) => { req.user = { profile: { handle: h.handle }, directories: h.dirs }; next(); });
    app.use('/api/native/generation', createNativeGenerationRouter(() => ({ ...seeded, sessionCore: installed.core, ...project })));
    app.use(createRetrievalMiddleware(() => store, () => '', async () => ({ persistence: seeded.persistence, core: installed.core, ...project })));
    app.use(router); const server = app.listen(0, '127.0.0.1');
    const bank = async () => context.kind === 'project' ? (await project.agent.getTask(h.handle, context.projectId, context.taskId)).compute
        : Object.values((await installed.core.runs.status(h.handle, base.session.sessionId))?.operations ?? {}).find(row => row.compute)?.compute;
    return { ...h, ...project, ...seeded, installed, base, context, profile, limits, bank, request: supertest(server),
        body: { nativeRetrievalRef: retrievalRef(profile), collectionId: 'local-work', computeContext: context },
        async cleanup() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h.cleanup(); } };
}

test.each(['session', 'project'])('G06 repeated H0 retrieval and necessary generation share the original %s 32-job bank', async lane => {
    const h = await fixture(makeTempFsEngineHarness, lane, 32);
    const m = memoryFixture(frozen.cases[7], { native: true, key: 'g06-shared-' + h.base.session.sessionId });
    try {
        const limits = { ...h.limits, localWork: { maxJobs: 32, maxItems: 4096, maxInputBytes: 16777216 } };
        const route = h.routes.find(row => row.role === (lane === 'session' ? 'role.narrator' : 'role.studio'));
        await h.persistence.saveRuntimeRoute(h.handle, { ...route, executionPolicy: { schemaVersion: 1,
            allowedModelProfileIds: [h.model.modelProfileId], computeBudget: limits } });
        const call = async (url, body) => {
            const { signal: _signal, profile: _profile, ...data } = body;
            const result = await h.request.post(url).send(data);
            if (result.status !== 200) throw Object.assign(new Error('Original work refused'), { code: result.body.error });
            return result.body;
        };
        const service = { admitCorpus: args => call('/api/native/generation/retrieval-work', args),
            ...Object.fromEntries(Object.entries({ listHashes: 'list', insert: 'insert', query: 'query', deleteByHashes: 'delete' })
                .map(([name, operation]) => [name, args => call('/' + operation, { ...args, nativeRetrievalRef: retrievalRef(h.profile) })])) };
        const recall = async () => retrieveMemory(eligibleMemorySnapshot(await m.retrievalSnapshot(),
            resolveMemoryEligibility(m.context, { requester: { kind: 'actor', id: informationActor } })), frozen.cases[7].queries[0].text,
        { service, profile: { nativeRetrievalRef: retrievalRef(h.profile) }, computeContext: h.context,
            countTokens: async text => Buffer.byteLength(text), budget: 2400 });
        const fetchImpl = jest.fn(async () => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Fresh answer.' } }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }), { headers: { 'content-type': 'application/json' } }));
        const host = new NativeGenerationHost({ ...h, sessionCore: h.installed.core,
            providers: { 'provider.openai-compatible': createHttpGenerationProvider({ fetchImpl }) }, secretPort: { resolveSecret: async () => 'synthetic-key' } });
        const { kind: _kind, ...generationContext } = h.context;
        const generate = requestId => host.execute(h.handle, { ...generationContext, role: lane === 'session' ? 'narrator' : 'studio', requestId });
        const first = await recall();
        expect(first.metrics.corpusSize).toBe(256); expect(first.diagnostics).not.toContain('vector_unavailable');
        expect((await h.bank()).localWork).toHaveLength(17);
        await generate('g06-first');
        const before = await h.bank(); expect(before.localWork).toHaveLength(22);
        const warm = await recall(); expect(warm.reuse.status).toBe('valid_hit');
        expect(warm.vectorInvocation).toMatchObject({ action: 'skip', reason: 'source_valid_base_coverage' });
        expect(warm.sourceMessageIds).toContain('s08-020');
        expect((await h.bank()).localWork).toHaveLength(25);
        expect(load).toHaveBeenCalledTimes(5); expect(infer).toHaveBeenCalledTimes(257);
        await generate('g06-second');
        const bank = await h.bank(); expect(bank.localWork).toHaveLength(30);
        expect(bank.localWork.slice(0, 22)).toEqual(before.localWork);
        expect(bank.localWork.slice(22, 25).map(row => [row.kind, row.status])).toEqual([
            ['memory_corpus', 'unknown'], ['memory_rank', 'unknown'], ['memory_pack', 'unknown']]);
        expect(bank.attempts).toHaveLength(2); expect(fetchImpl).toHaveBeenCalledTimes(2);
        const originalText = m.context.chat[0].mes; m.context.chat[0].mes = 'Edited source';
        expect(() => warm.assertCurrent()).toThrow(); m.context.chat[0].mes = originalText;
        await expect(recall()).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
        const exhausted = await h.bank(); expect(exhausted.localWork).toHaveLength(32);
        expect(exhausted.localWork.slice(0, 30)).toEqual(bank.localWork); expect(exhausted.attempts).toEqual(bank.attempts);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally { fs.rmSync(m.root, { recursive: true, force: true }); await h.cleanup(); }
}, 60000);
for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    for (const lane of ['session', 'project']) test(`G05 Transformers ${kind}/${lane} actual index consumer charges local inference on the original bank`, async () => {
        const h = await fixture(make, lane);
        try {
            await h.request.post('/insert').send({ ...h.body, items: [{ hash: 1, text: 'A historical promise', index: 0 }, { hash: 2, text: 'A different source', index: 1 }] }).expect(200);
            await h.request.post('/query').send({ ...h.body, searchText: 'Promise', topK: 1, threshold: 0 }).expect(200);
            const bank = await h.bank();
            expect(bank.attempts).toEqual([]); expect(bank.limits).toEqual(h.limits);
            expect(bank.localWork).toHaveLength(4);
            expect(bank.localWork.filter(row => row.kind === 'embedding_local').map(row => row.estimatedItems)).toEqual([2, 1]);
            expect(bank.localWork.find(row => row.kind === 'embedding_local').estimatedInputBytes)
                .toBe(Buffer.byteLength('A historical promiseA different source', 'utf8'));
            expect(bank.localWork.every(row => row.status === 'settled' && row.usage.outcome === 'completed')).toBe(true);
            expect(load).toHaveBeenCalledTimes(2); expect(infer).toHaveBeenCalledTimes(3);
            await h.request.post('/query').send({ ...h.body, searchText: 'No extra work', topK: 1, threshold: 0 }).expect(429);
            expect(load).toHaveBeenCalledTimes(2); expect((await h.bank()).localWork).toHaveLength(4);
        } finally { await h.cleanup(); }
    }, 60000);

    test(`G05 Transformers ${kind} quota refusal occurs before pipeline initialization`, async () => {
        const h = await fixture(make, 'session', 1);
        try {
            const rejected = await h.request.post('/insert').send({ ...h.body, items: [{ hash: 1, text: 'No room for inference', index: 0 }] });
            expect(rejected.status).toBeGreaterThanOrEqual(400); expect(load).not.toHaveBeenCalled(); expect(infer).not.toHaveBeenCalled();
            const bank = await h.bank(); expect(bank.localWork).toHaveLength(1);
            expect(bank.localWork[0]).toMatchObject({ kind: 'index_insert', status: 'settled', usage: { outcome: 'failed' } });
        } finally { await h.cleanup(); }
    }, 60000);

    test(`G05 Transformers ${kind} source change during model load stops before inference and retains initialized work`, async () => {
        const h = await fixture(make);
        try {
            onLoad = async () => { await h.installed.core.appendTimeline(h.handle, h.base.session.sessionId, { role: 'user', content: 'Source changed' },
                { expectedRevisionId: h.base.revision.revisionId }); };
            const rejected = await h.request.post('/insert').send({ ...h.body, items: [{ hash: 1, text: 'Historical data', index: 0 }] });
            expect(rejected.status).toBeGreaterThanOrEqual(400); expect(infer).not.toHaveBeenCalled();
            const run = await h.installed.core.runs.status(h.handle, h.base.session.sessionId);
            expect(run.retiredCompute).toMatchObject({ localJobs: 2, localFailedJobs: 2, localUnknownJobs: 0, modelAttempts: 0 });
        } finally { await h.cleanup(); }
    }, 60000);
}

test('G05 Transformers cancellation after inference retains cost; queued cancelled work never initializes a pipeline', async () => {
    const first = new AbortController(), second = new AbortController(), jobs = [];
    let enter, release;
    const entered = new Promise(resolve => { enter = resolve; }), hold = new Promise(resolve => { release = resolve; });
    const compute = { assertCurrent: async () => {}, beforeLocalWork: async input => { jobs.push(input); return jobs.length; },
        settleLocalWork: async (ticket, usage) => { jobs[ticket - 1].usage = usage; } };
    onInfer = async () => { enter(); await hold; first.abort(); };
    const active = getTransformersVector('First', 'exact-model', { compute, signal: first.signal });
    const activeRejected = active.catch(error => error);
    await entered;
    const queued = getTransformersVector('Second', 'other-model', { compute, signal: second.signal });
    const queuedRejected = queued.catch(error => error);
    second.abort(); release();
    expect(await activeRejected).toMatchObject({ name: 'AbortError' }); expect(await queuedRejected).toMatchObject({ name: 'AbortError' });
    expect(jobs).toHaveLength(1); expect(jobs[0].usage.outcome).toBe('cancelled'); expect(load).toHaveBeenCalledTimes(1);
});

test('G05 Transformers partial batch failure retains all admitted items and bytes; later texts are not inferred', async () => {
    const jobs = [], texts = ['第一条', 'Second', 'Never inferred'];
    let count = 0;
    onInfer = async () => { if (++count === 2) throw new Error('Local inference failed'); };
    const compute = { assertCurrent: async () => {}, beforeLocalWork: async input => { jobs.push(input); return 0; },
        settleLocalWork: async (_ticket, usage) => { jobs[0].usage = usage; } };
    await expect(getTransformersBatchVector(texts, 'exact-model', { compute })).rejects.toThrow('Local inference failed');
    expect(load).toHaveBeenCalledTimes(1); expect(infer).toHaveBeenCalledTimes(2);
    expect(jobs).toHaveLength(1); expect(jobs[0]).toMatchObject({ items: 3,
        inputBytes: Buffer.byteLength(texts.join(''), 'utf8'), usage: { outcome: 'failed' } });
});

test('G05 Transformers original insert batch is one local job beyond the remote ten-text batch limit', async () => {
    const h = await fixture(makeTempFsEngineHarness);
    try {
        const items = Array.from({ length: 12 }, (_, index) => ({ hash: index + 1, text: 'Source ' + index, index }));
        await h.request.post('/insert').send({ ...h.body, items }).expect(200);
        await h.request.post('/query').send({ ...h.body, searchText: 'Source', topK: 1, threshold: 0 }).expect(200);
        const bank = await h.bank();
        expect(bank.localWork).toHaveLength(4);
        expect(bank.localWork.filter(row => row.kind === 'embedding_local').map(row => row.estimatedItems)).toEqual([12, 1]);
        expect(load).toHaveBeenCalledTimes(2); expect(infer).toHaveBeenCalledTimes(13);
    } finally { await h.cleanup(); }
}, 60000);
