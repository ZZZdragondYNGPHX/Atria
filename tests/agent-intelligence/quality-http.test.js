import { afterEach, expect, jest, test } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { QUALITY_REVISION, qualityRef } from '../../src/native/agent-intelligence/evaluation/quality.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';

afterEach(() => setReadOnly(false));
test('authenticated read-only profile metadata preserves unready sources and never creates a Host or evaluator', async () => {
    const host = jest.fn(() => { throw new Error('Host construction forbidden'); });
    const app = express();
    app.use((req, _res, next) => { if (req.headers['x-user']) req.user = { profile: { handle: req.headers['x-user'] } }; next(); });
    app.use('/api/native/generation', createNativeGenerationRouter(host));
    const api = supertest(app), path = '/api/native/generation/quality-profiles';
    expect((await api.get(path)).status).toBe(401);
    setReadOnly(true);
    const result = await api.get(path).set('x-user', 'fixture-owner');
    expect(result.status).toBe(200); expect(result.headers['cache-control']).toBe('private, no-store');
    expect(result.body.registryRevision).toBe(QUALITY_REVISION);
    for (const id of ['rp.narrative', 'project.agent', 'rp.creative_refusal']) {
        const profile = result.body.profiles.find(p => p.profileId === id);
        expect(profile.revision).toBe(qualityRef(id).revision);
        expect(profile.readiness).toEqual({ status: 'BLOCKED', code: 'source_unready' });
        expect(profile.criticalDimensions.length).toBeGreaterThan(0);
        expect(profile.sourceRequirements.length).toBeGreaterThan(0);
    }
    expect(result.body.refusalClassifications).toContain('provider_explicit_block');
    expect(result.body.modelAssessment).toMatchObject({ strongestSignal: 'suspected_failure', ruleVerification: 'host_checker_only' });
    expect(host).not.toHaveBeenCalled();
    expect((await api.post(path).set('x-user', 'fixture-owner')).status).toBe(404);
});
