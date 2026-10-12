import express from 'express';
import request from 'supertest';
import { jest, test, expect } from '@jest/globals';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { installedPredictionFixture } from './helpers/prediction-fixture.js';
import { assertPredictionCapture } from '../../src/native/prediction-service.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';

async function fixture() {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installedPredictionFixture(h);
        const host = { sessionCore: f.core };
        host.executePrediction = jest.fn(async (handle, input, capture) => {
            const data = assertPredictionCapture(capture, { host, handle });
            return { record: { payload: { prediction: 'The public note may be updated.', assumptions: ['Declared action succeeds.'],
                supportRefs: data.observation.items.map(item => item.id), uncertainty: { confidence: 0.5, limitations: ['Not an observed outcome.'] } },
            requestSnapshotHash: 'a'.repeat(64), rawResultHash: 'b'.repeat(64), promptProgramRef: data.variant.prompt,
            generationProfileRef: data.variant.generation, runtimeRouteId: input.routeRef.runtimeRouteId,
            execution: { connection: { providerAdapter: 'fixture.provider', endpoint: 'PRIVATE ENDPOINT', options: { secret: 'PRIVATE SECRET' } },
                model: { remoteModelId: 'fixture.model' } } } };
        });
        const app = express(); app.use(express.json());
        app.use((req, _res, next) => { req.user = { profile: { handle: h.handle } }; next(); });
        app.use(createNativeGenerationRouter(() => host));
        return { ...f, h, host, app };
    } catch (error) { await h.cleanup(); throw error; }
}

test('S23 HTTP projects a server capture and excludes private execution fields without publishing Session state', async () => {
    const f = await fixture();
    try {
        const result = await request(f.app).post('/prediction/prepare').send(f.body);
        expect(result.status).toBe(200);
        expect(result.headers['cache-control']).toBe('private, no-store');
        expect(result.body).toMatchObject({ kind: 'hypothetical', mode: 'model_prediction', uncertainty: { realOutcome: 'not_observed' } });
        expect(JSON.stringify(result.body)).not.toContain('PRIVATE');
        expect(f.host.executePrediction).toHaveBeenCalledTimes(1);
        expect(await f.core.load(f.h.handle, f.base.session.sessionId)).toEqual(f.base);
        const current = await request(f.app).post('/prediction/current').send({ sessionId: f.body.sessionId, artifact: result.body });
        expect(current.status).toBe(200); expect(current.body).toEqual({ current: true });
        expect(f.host.executePrediction).toHaveBeenCalledTimes(1);
    } finally { await f.h.cleanup(); }
});

test('S23 HTTP rejects caller authority and stale requests, and source freshness does not invoke prediction again', async () => {
    const f = await fixture();
    try {
        const artifact = (await request(f.app).post('/prediction/prepare').send(f.body)).body;
        for (const body of [{ ...f.body, handle: 'author' }, { ...f.body, request: { ...f.body.request, observation: 'FORGED' } },
            { ...f.body, request: { ...f.body.request, viewId: 'actor' } }]) {
            expect((await request(f.app).post('/prediction/prepare').send(body)).status).toBe(400);
        }
        await f.core.appendTimeline(f.h.handle, f.body.sessionId, { role: 'user', content: 'A newer turn.' });
        const stale = await request(f.app).post('/prediction/prepare').send(f.body);
        expect(stale.status).toBe(409); expect(stale.body.error).toBe('native_prediction_revision_conflict');
        expect((await request(f.app).post('/prediction/current').send({ sessionId: f.body.sessionId, artifact })).body).toEqual({ current: false });
        expect(f.host.executePrediction).toHaveBeenCalledTimes(1);
        const anonymous = express(); anonymous.use(express.json()); anonymous.use(createNativeGenerationRouter(() => f.host));
        expect((await request(anonymous).post('/prediction/prepare').send(f.body)).status).toBe(401);
        expect((await request(anonymous).post('/prediction/current').send({ sessionId: f.body.sessionId, artifact })).status).toBe(401);
    } finally { await f.h.cleanup(); }
});

test('S23 HTTP exposes a bounded failure code without provider or private diagnostic text', async () => {
    const f = await fixture();
    try {
        f.host.executePrediction.mockRejectedValueOnce(Object.assign(new Error('PRIVATE SECRET DIAGNOSTIC'), { code: 'upstream_private_failure' }));
        const result = await request(f.app).post('/prediction/prepare').send(f.body);
        expect(result.status).toBe(400); expect(result.body).toEqual({ error: 'native_prediction_failed' });
        expect(result.headers['cache-control']).toBe('private, no-store');
        expect(await f.core.load(f.h.handle, f.body.sessionId)).toEqual(f.base);
    } finally { await f.h.cleanup(); }
});
