import { afterEach, expect, jest, test } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { nativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { createNativeId } from '../../src/native/identity.js';

const cleanup = [];
afterEach(async () => { jest.restoreAllMocks(); for (const fn of cleanup.splice(0)) await fn(); });
async function fixture() {
    const h = await makeTempFsEngine(); cleanup.push(h.cleanup);
    const seeded = await seedGenerationProfiles({ ...h, endpoint: 'https://fixture.invalid/v1/chat/completions' });
    const projectId = createNativeId('project'), project = { source: { project: { projectId }, package: {}, resources: [] }, revision: { revision: 'r1' } };
    let release; const gate = new Promise(resolve => { release = resolve; });
    const fetchImpl = jest.fn(async () => { await gate; return { ok: true, status: 200, headers: { get: () => 'application/json' },
        json: async () => ({ choices: [{ message: { content: 'Synthetic Native result' } }], usage: { prompt_tokens: 11, completion_tokens: 3, total_tokens: 14 } }) }; });
    const secretPort = { resolveSecret: jest.fn(async () => 'synthetic-credential') };
    const host = new NativeGenerationHost({ ...seeded, studio: { getProject: async () => project },
        providers: { 'provider.openai-compatible': createHttpGenerationProvider({ fetchImpl }) }, secretPort });
    const input = { requestId: 'generation-' + createNativeId('revision'), role: 'narrator', projectId, revision: 'r1',
        routeRef: { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId }, messages: [{ role: 'user', content: 'Synthetic fixture only' }] };
    const preview = await host.execute(h.handle, input, undefined, undefined, { preview: true });
    const { createdAt: _time, ...stable } = preview.snapshot;
    const approvedReview = { snapshotFingerprint: hash(stable), configurationFingerprint: hash({ routes: await seeded.persistence.listRuntimeRoutes(h.handle),
        models: await seeded.persistence.listModelProfiles(h.handle), connections: await seeded.persistence.listConnectionProfiles(h.handle) }) };
    const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { profile: { handle: req.headers['x-user'] || h.handle } }; next(); });
    app.use('/generation', createNativeGenerationRouter(() => host, () => null));
    return { ...h, ...seeded, host, app, input, approvedReview, fetchImpl, secretPort, release };
}

test('detached reviewed Native generation acknowledges before completion and preserves owner-scoped result and observed usage', async () => {
    const f = await fixture();
    const started = await supertest(f.app).post('/generation/execute/start').send({ input: f.input, approvedReview: f.approvedReview }).expect(202);
    const id = started.body.operationId, operation = nativeTaskScheduler.operations.get(id), completion = operation.handle.result;
    expect((await supertest(f.app).get(`/generation/operations/${id}/result`).expect(409)).body.error).toBe('operation_result_unavailable');
    await supertest(f.app).get(`/generation/operations/${id}`).set('x-user', 'foreign-owner').expect(404);
    f.release(); await completion;
    const view = (await supertest(f.app).get(`/generation/operations/${id}`).expect(200)).body;
    expect(view.status).toBe('completed'); expect(view.observation.usage.total_tokens ?? view.observation.usage.totalTokens).toBe(14);
    expect(view.observation.currencyCost).toBeNull(); expect(view.resultAvailable).toBe(true);
    const result = await supertest(f.app).get(`/generation/operations/${id}/result`).expect(200);
    expect(result.body.response.text).toBe('Synthetic Native result'); expect(f.fetchImpl).toHaveBeenCalledTimes(1);
    await supertest(f.app).get(`/generation/operations/${id}/result`).set('x-user', 'foreign-owner').expect(404);
}, 15000);

test('configuration changed after preview is rejected at the actual Native send boundary before Secret or Provider access', async () => {
    const f = await fixture();
    await f.persistence.saveModelProfile(f.handle, { ...f.model, displayName: 'Changed after review' });
    const started = await supertest(f.app).post('/generation/execute/start').send({ input: f.input, approvedReview: f.approvedReview }).expect(202);
    const operation = nativeTaskScheduler.operations.get(started.body.operationId);
    if (operation.handle) await operation.handle.result.catch(() => {});
    expect(nativeTaskScheduler.project(f.handle, started.body.operationId).status).toBe('failed');
    expect(nativeTaskScheduler.project(f.handle, started.body.operationId).errorCode).toBe('native_generation_review_stale');
    expect(f.secretPort.resolveSecret).not.toHaveBeenCalled(); expect(f.fetchImpl).not.toHaveBeenCalled(); f.release();
});
