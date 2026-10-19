import express from 'express';
import request from 'supertest';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { nativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { createNativeId } from '../../src/native/identity.js';
import { modelPortFixture } from './helpers/model-port-fixture.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';

describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s original Turn HTTP with V3 Binding', (_name, make) => {
    let f, app;
    beforeEach(async () => {
        f = await modelPortFixture(make);
        app = express(); app.use(express.json());
        app.use((req, _res, next) => { req.user = { profile: { handle: f.h.handle } }; next(); });
        app.use('/api/native/generation', createNativeGenerationRouter(() => f.host));
    });
    afterEach(async () => { await f?.cleanup(); });

    test('real stale route pins report safe unavailable through both existing Turn routes without sending', async () => {
        await f.seeded.persistence.saveRuntimeRoute(f.h.handle, { ...f.route, displayName: 'A changed pinned Route' });
        for (const suffix of ['/turn', '/turn/start']) {
            const response = await request(app).post('/api/native/generation' + suffix).send(f.input).expect(503);
            expect(response.body).toEqual({ error: 'native_orchestration_model_authority_unavailable' });
        }
        expect(f.requests).toHaveLength(0);
        expect((await f.core.observe(f.h.handle, f.input.sessionId)).revision.revisionId).toBe(f.base.revision.revisionId);
    });

    test('real detached Turn preserves a safe V3 error after Binding revocation and never finalizes a body', async () => {
        f.onResponse(() => f.plans.saveBinding(f.h.handle, createNativeId('orchestrationCommand'),
            { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: 0 }));
        const started = await request(app).post('/api/native/generation/turn/start').send(f.input).expect(202);
        const operation = nativeTaskScheduler.operations.get(started.body.operationId);
        await expect(operation.handle.result).rejects.toMatchObject({ code: 'native_orchestration_turn_selection_stale' });
        const observed = await request(app).get('/api/native/generation/operations/' + started.body.operationId).expect(200);
        expect(observed.body).toMatchObject({ status: 'failed', errorCode: 'native_orchestration_turn_selection_stale' });
        expect(JSON.stringify(observed.body)).not.toMatch(/Synthetic native narrator response|synthetic-model-secret/);
        expect((await f.core.observe(f.h.handle, f.input.sessionId)).revision.revisionId).toBe(f.base.revision.revisionId);
    });

    test('unrecognized internal error text and code are never returned by existing Turn routes', async () => {
        f.host.executeTurn = async () => { throw Object.assign(new Error('private synthetic exception body'), { code: 'private_internal_detail' }); };
        const sync = await request(app).post('/api/native/generation/turn').send(f.input).expect(400);
        const detached = await request(app).post('/api/native/generation/turn/start').send(f.input).expect(400);
        expect(sync.body).toEqual({ error: 'native_generation_failed' });
        expect(detached.body).toEqual({ error: 'native_task_start_failed' });
        expect(f.requests).toHaveLength(0);
    });
});
