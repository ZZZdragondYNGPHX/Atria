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

let onLoad = async () => {}, onInfer = async () => {};
const infer = jest.fn(async () => { await onInfer(); return { data: [1, 0] }; });
const load = jest.fn(async () => { await onLoad(); return infer; });
jest.unstable_mockModule('../../src/transformers.js', () => ({ getPipeline: load }));
const { router } = await import('../../src/endpoints/vectors.js');
const { getTransformersVector } = await import('../../src/vectors/embedding.js');
afterEach(() => { onLoad = async () => {}; onInfer = async () => {}; load.mockClear(); infer.mockClear(); });

async function fixture(make, lane = 'session', maxJobs = 5) {
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
    const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { profile: { handle: h.handle }, directories: h.dirs }; next(); });
    app.use(createRetrievalMiddleware(() => store, () => '', async () => ({ persistence: seeded.persistence, core: installed.core, ...project })));
    app.use(router); const server = app.listen(0, '127.0.0.1');
    const bank = async () => context.kind === 'project' ? (await project.agent.getTask(h.handle, context.projectId, context.taskId)).compute
        : Object.values((await installed.core.runs.status(h.handle, base.session.sessionId))?.operations ?? {}).find(row => row.compute)?.compute;
    return { ...h, ...project, ...seeded, installed, base, context, profile, limits, bank, request: supertest(server),
        body: { nativeRetrievalRef: retrievalRef(profile), collectionId: 'local-work', computeContext: context },
        async cleanup() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h.cleanup(); } };
}
for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    for (const lane of ['session', 'project']) test(`G05 Transformers ${kind}/${lane} actual index consumer charges local inference on the original bank`, async () => {
        const h = await fixture(make, lane);
        try {
            await h.request.post('/insert').send({ ...h.body, items: [{ hash: 1, text: 'A historical promise', index: 0 }, { hash: 2, text: 'A different source', index: 1 }] }).expect(200);
            await h.request.post('/query').send({ ...h.body, searchText: 'Promise', topK: 1, threshold: 0 }).expect(200);
            const bank = await h.bank();
            expect(bank.attempts).toEqual([]); expect(bank.limits).toEqual(h.limits);
            expect(bank.localWork).toHaveLength(5);
            expect(bank.localWork.filter(row => row.kind === 'embedding_local')).toHaveLength(3);
            expect(bank.localWork.every(row => row.status === 'settled' && row.usage.outcome === 'completed')).toBe(true);
            expect(load).toHaveBeenCalledTimes(3); expect(infer).toHaveBeenCalledTimes(3);
            await h.request.post('/query').send({ ...h.body, searchText: 'No extra work', topK: 1, threshold: 0 }).expect(429);
            expect(load).toHaveBeenCalledTimes(3); expect((await h.bank()).localWork).toHaveLength(5);
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
