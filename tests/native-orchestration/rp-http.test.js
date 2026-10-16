import express from 'express';
import request from 'supertest';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpModelFixture, RP_MODEL_TEXT } from './helpers/rp-model-fixture.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { nativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { createNativeId } from '../../src/native/identity.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const configurePlan = plan => {
    plan.definition.nodes.find(node => node.kind === 'output').capabilities = ['chat.output'];
    plan.definition.capabilityCeiling.push('chat.output');
    Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 65536 } });
};

describe.each(harnesses)('$name reviewed original RP HTTP', ({ make }) => {
    let f, app, enabled, authenticated;
    beforeEach(async () => {
        f = await rpModelFixture(make, { configurePlan }); enabled = true; authenticated = true;
        app = express(); app.use(express.json());
        app.use((req, _res, next) => { if (authenticated) req.user = { profile: { handle: f.h.handle, enabled } }; next(); });
        app.use('/api/native/generation', createNativeGenerationRouter(() => f.host));
    });
    afterEach(async () => { await f?.cleanup(); });
    const preflight = () => request(app).post('/api/native/generation/rp/preflight').send(f.input);
    const start = (review, input = f.input, boot = review.hostBootId) => request(app).post('/api/native/generation/rp/start')
        .set('X-Atria-Host-Boot-Id', boot).send({ input, expectedPreflightFingerprint: hash(review), expectedHostBootId: boot });

    test('preflight sends nothing; exact reviewed start commits one original Chat output and observes the same request after completion', async () => {
        const review = (await preflight().expect(200)).body;
        expect(f.requests).toHaveLength(0); expect(f.effects).toHaveLength(0);
        const source = await request(app).post('/api/native/generation/rp/source').set('X-Atria-Host-Boot-Id', review.hostBootId)
            .send({ locator: f.locator, expectedHostBootId: review.hostBootId }).expect(200);
        expect(source.body).toMatchObject({ controlId: f.controlId, restoreState: 'ready' });
        expect(review.budget.maxRequests).toBeGreaterThan(0); expect(review.outputContract.kind).toBe('rp_narration');
        const started = await start(review).expect(202), operation = nativeTaskScheduler.operations.get(started.body.operationId);
        const result = await operation.handle.result;
        expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(1);
        const again = await start(review).expect(202); expect(again.body.operationId).toBe(started.body.operationId);
        const status = await request(app).get('/api/native/generation/operations/' + started.body.operationId).expect(200);
        expect(status.body).toMatchObject({ status: 'completed', observation: { runId: result.runId, output: { status: 'committed' } } });
        expect(JSON.stringify(status.body)).not.toMatch(/synthetic.*secret|generated|dispatchToken|budgetAuthorityRef/);
        await request(app).get('/api/native/generation/operations/' + started.body.operationId + '/result').expect(409);
        const chat = await f.chats.get(f.h.handle, 'Actor', 'main');
        expect(chat.body.filter(row => row.mes === RP_MODEL_TEXT)).toHaveLength(1); expect(f.requests).toHaveLength(1);
    }, 30000);

    test('changed Binding, route and Host preflight refuse before any Provider or Chat mutation', async () => {
        const review = (await preflight().expect(200)).body;
        await start(review, f.input, 'previous-host').expect(409);
        await f.plans.saveBinding(f.h.handle, createNativeId('orchestrationCommand'), {
            sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: 0 });
        expect((await start(review).expect(409)).body.error).toBe('native_orchestration_rp_review_stale');
        const fresh = (await preflight().expect(200)).body;
        await f.persistence.saveRuntimeRoute(f.h.handle, { ...f.routes[0], displayName: 'Independent Route change' });
        await start(fresh).expect(503); expect(f.requests).toHaveLength(0);
        expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(2);
    });

    test('disabled accounts, missing review and caller authority injection cannot start paid work', async () => {
        const review = (await preflight().expect(200)).body;
        authenticated = false; await preflight().expect(401); authenticated = true;
        enabled = false; await start(review).expect(401); enabled = true;
        await request(app).post('/api/native/generation/rp/start').send({ input: f.input }).expect(400);
        await start(review, { ...f.input, approved: true, grant: 'caller' }).expect(400);
        await start(review, { ...f.input, floor: 0 }).expect(409);
        expect(f.requests).toHaveLength(0);
    });
});
