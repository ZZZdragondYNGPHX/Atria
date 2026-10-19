import express from 'express';
import request from 'supertest';
import { createNativeOrchestrationRouter } from '../../src/endpoints/native-orchestration.js';
import { createNativeId } from '../../src/native/identity.js';
import { nativeToolFixture } from './helpers/native-tool-producer-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';

describe.each(CONTRACT_HARNESSES)('$name original Tool HTTP commands', ({ make }) => {
    test('authenticated published Tool executes once, is observed and freshly consumed through the closed API', async () => {
        const f = await nativeToolFixture(make);
        const app = express(); app.use(express.json());
        app.use((req, _res, next) => {
            if (req.get('X-Test-Owner')) req.user = { profile: { handle: req.get('X-Test-Owner'), enabled: true } };
            next();
        });
        app.use('/api/native/orchestration', createNativeOrchestrationRouter(() => ({ ...f.authoring, tools: f.authority })));
        const read = (method, body, owner = f.h.handle) => request(app).post('/api/native/orchestration/tools/' + method)
            .set('X-Test-Owner', owner).send({ schemaVersion: 1, body });
        const mutation = (method, body, boot = f.authoring.hostBootId) => request(app).post('/api/native/orchestration/tools/' + method)
            .set('X-Test-Owner', f.h.handle).set('X-Atria-Host-Boot-Id', boot)
            .send({ schemaVersion: 1, commandId: createNativeId('orchestrationCommand'), expectedHostBootId: boot, body });
        try {
            await request(app).post('/api/native/orchestration/tools/prepare').send({}).expect(401);
            await mutation('prepare', { planRef: f.planRef }, 'stale-host').expect(409);
            await mutation('prepare', { planRef: f.planRef, approved: true }).expect(400);
            expect(f.calls).toEqual([]);
            const prepared = (await mutation('prepare', { planRef: f.planRef }).expect(200)).body.outcome;
            const refs = { runId: prepared.runId, effectId: prepared.effectId };
            await read('consume', refs).expect(409);
            const completed = await mutation('dispatch', refs).expect(200);
            expect(completed.body.outcome.status).toBe('completed');
            expect(completed.headers['cache-control']).toContain('no-store');
            const calls = f.calls.length;
            expect((await read('observe', refs).expect(200)).body.outcome.status).toBe('completed');
            expect((await read('consume', refs).expect(200)).body.outcome).toMatchObject({ advisory: true, status: 'complete' });
            expect((await mutation('dispatch', refs).expect(200)).body.outcome).toEqual(completed.body.outcome);
            await read('consume', { ...refs, grantDigest: 'a'.repeat(64) }).expect(400);
            expect(f.calls).toHaveLength(calls); expect(f.errors).toEqual([]);
        } finally { await f.cleanup(); }
    }, 60000);
});
