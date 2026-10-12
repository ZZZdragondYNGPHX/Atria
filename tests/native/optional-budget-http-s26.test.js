import { test, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture } from './helpers/session-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { NativeRetrievalPersistence } from '../../src/native/retrieval-persistence.js';
import { createRetrievalMiddleware } from '../../src/native/retrieval-execution.js';
import { createNativeId } from '../../src/native/identity.js';
import { retrievalRef } from '../../public/scripts/native/retrieval-contracts.js';
import { router as vectors } from '../../src/endpoints/vectors.js';

for (const [optionalWork, code, status] of [
    [{ mode: 'preserve_required' }, 'native_generation_required_budget_unknown', 503],
    [{ mode: 'preserve_required', requiredCompute: { maxRequests: 1, maxTokens: 40 } }, 'native_generation_required_budget_reserved', 429],
]) test(`S26 HTTP preserves ${code} through the real rerank boundary without a send charge`, async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installFixture(h), base = await f.core.create(h.handle, f.start);
        const seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:1/never-sent' });
        await seeded.persistence.saveRuntimeRoute(h.handle, { ...seeded.routes[0], executionPolicy: { schemaVersion: 1,
            allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget: { maxRequests: 1, maxTokens: 100000 }, optionalWork } });
        const store = new NativeRetrievalPersistence({ engine: h.engine });
        const profile = { retrievalProfileId: createNativeId('retrievalProfile'), revision: createNativeId('revision'), displayName: 'Local allocation test',
            mode: 'rerank', source: 'custom', model: 'fixture', endpoint: 'http://127.0.0.1:1/never-sent', options: {} };
        await store.commit(h.handle, profile);
        const app = express(); app.use(express.json());
        app.use((req, _res, next) => { req.user = { profile: { handle: h.handle }, directories: h.dirs }; next(); });
        app.use(createRetrievalMiddleware(() => store, () => '', async () => ({ core: f.core, persistence: seeded.persistence })));
        app.use(vectors);
        const before = await f.core.runs.status(h.handle, base.session.sessionId);
        const result = await request(app).post('/rerank').send({ nativeRetrievalRef: retrievalRef(profile), query: 'Cause?', documents: [{ text: 'A legal source.' }],
            computeContext: { kind: 'session', sessionId: base.session.sessionId, revisionId: base.revision.revisionId } });
        expect(result.status).toBe(status); expect(result.body).toEqual({ error: code });
        expect(await f.core.runs.status(h.handle, base.session.sessionId)).toEqual(before);
        expect((await f.core.load(h.handle, base.session.sessionId)).revision).toEqual(base.revision);
    } finally { await h.cleanup(); }
});
