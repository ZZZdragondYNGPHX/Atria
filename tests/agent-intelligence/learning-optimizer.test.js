import { afterEach, describe, expect, jest, test } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { evolutionFixture } from './evolution-fixture.js';
import { AgentEvolutionRepository, evolutionHash as hash } from '../../src/native/agent-intelligence/evolution-repository.js';
import { EvolutionEvaluator } from '../../src/native/agent-intelligence/evolution-evaluator.js';
import { LEARNING_OPTIMIZER_BACKEND } from '../../src/native/agent-intelligence/learning-optimizer.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';

const cleanups = [];
afterEach(async () => { setReadOnly(false); jest.restoreAllMocks(); for (const fn of cleanups.splice(0)) await fn(); });
async function fixture(make, kind = 'project-prompt', options = {}) {
    const f = await evolutionFixture(make, kind, { policyMode: 'review', ...options });
    cleanups.push(async () => {
        for (const op of f.service.scheduler.operations.values()) f.service.scheduler.cancel(f.h.handle, op.view.operationId);
        while (f.service.scheduler.running.size) await new Promise(resolve => setTimeout(resolve, 5));
        await f.h.cleanup();
    });
    const experience = await f.service.experience.inspect(f.h.handle, { scope: f.scope, subject: f.subject });
    const trajectory = await f.service.experience.exportLearning(f.h.handle, { scope: f.scope, subject: f.subject,
        expectedSequence: experience.sequence, purpose: 'offline-analysis' });
    const current = await f.repository.get(f.h.handle, f.scope, f.subject);
    return { ...f, experience, input: { scope: f.scope, subject: f.subject, expectedSequence: current.sequence,
        backend: LEARNING_OPTIMIZER_BACKEND, purpose: 'prompt-optimization', trajectory } };
}
function rehash(trajectory) { const { integrity: _old, ...content } = trajectory; trajectory.integrity = hash(content); return trajectory; }

describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s learning optimizer', (_name, make) => {
    test.each(['project-prompt'])('%s consumes current metadata into original candidates, evaluation and reversible publication', async kind => {
        const f = await fixture(make, kind), before = await f.service.targets.capture(f.h.handle, f.scope, f.subject, f.target);
        const started = await f.service.startLearning(f.h.handle, f.input);
        await f.service.wait(f.h.handle, started.jobId);
        const restored = new AgentEvolutionRepository({ engine: f.h.engine });
        let doc = await restored.get(f.h.handle, f.scope, f.subject);
        const job = doc.jobs.find(value => value.id === started.jobId), candidate = job.candidates[0];
        expect(job.learning).toEqual({ schemaVersion: 1, backend: LEARNING_OPTIMIZER_BACKEND,
            trajectoryHash: f.input.trajectory.integrity, scopeHash: f.input.trajectory.scopeHash,
            recordsHash: hash(f.input.trajectory.records), sourceSequence: f.input.trajectory.sequence });
        for (const learning of [{ ...job.learning, trajectoryHash: [job.learning.trajectoryHash] },
            { ...job.learning, scopeHash: hash({ domain: 'foreign' }) }]) {
            await expect(restored.mutate(f.h.handle, f.scope, f.subject, value => { value.jobs.find(item => item.id === job.id).learning = learning; })).rejects.toThrow();
        }
        expect((await restored.get(f.h.handle, f.scope, f.subject)).jobs.find(item => item.id === job.id).learning).toEqual(job.learning);
        expect(job.status).toBe('awaiting_review'); expect(candidate.decision.eligible).toBe(false);
        expect(doc.publications).toEqual([]);
        expect((await f.service.targets.check(f.h.handle, f.scope, f.subject, f.target, candidate.candidateId)).actual).toEqual(candidate.base);
        await expect(f.service.publish(f.h.handle, { scope: f.scope, subject: f.subject, jobId: job.id,
            candidateId: candidate.candidateId, expectedReportHash: hash(candidate.report) }, { automatic: true })).rejects.toThrow('review_required');
        doc = await f.service.publish(f.h.handle, { scope: f.scope, subject: f.subject, jobId: job.id,
            candidateId: candidate.candidateId, expectedReportHash: hash(candidate.report), review: true });
        expect(doc.publications[0].status).toBe('published');
        const reverted = await f.service.rollback(f.h.handle, { scope: f.scope, subject: f.subject, publicationId: doc.publications[0].id });
        expect(reverted.publications[0].status).toBe('rolled_back');
        expect((await f.service.targets.capture(f.h.handle, f.scope, f.subject, f.target)).base).toEqual(before.base);
        // Synthetic evaluator proves lifecycle only; no quality or training claim.
        expect((await restored.owner(f.h.handle)).attempts.length).toBeGreaterThan(0);
    });
    test('forged self-hashed metadata, owner, purpose and backend never reach the optimizer', async () => {
        const f = await fixture(make), extract = jest.spyOn(f.evaluator, 'extract');
        const forged = structuredClone(f.input.trajectory); forged.records[0].label.dimension = 'general'; forged.records[0].preference.dimension = 'general'; rehash(forged);
        await expect(f.service.startLearning(f.h.handle, { ...f.input, trajectory: forged })).rejects.toThrow('source_changed');
        const owner = structuredClone(f.input.trajectory); owner.ownerHash = hash('another-owner'); rehash(owner);
        await expect(f.service.startLearning(f.h.handle, { ...f.input, trajectory: owner })).rejects.toThrow('source mismatch');
        await expect(f.service.startLearning(f.h.handle, { ...f.input, purpose: 'offline-analysis' })).rejects.toThrow('Explicit optimizer');
        await expect(f.service.startLearning(f.h.handle, { ...f.input, backend: 'arbitrary-backend' })).rejects.toThrow('Explicit optimizer');
        await expect(f.service.startLearning(f.h.handle, { ...f.input, owner: f.h.handle })).rejects.toThrow();
        expect(extract).not.toHaveBeenCalled(); expect((await f.repository.owner(f.h.handle)).attempts).toEqual([]);
    });
    test('source changes while capturing the target reject the downloaded trajectory before charging', async () => {
        const f = await fixture(make), capture = f.service.targets.capture.bind(f.service.targets);
        jest.spyOn(f.service.targets, 'capture').mockImplementationOnce(async (...args) => {
            const value = await capture(...args);
            await f.service.experience.correct(f.h.handle, { scope: f.scope, subject: f.subject, expectedSequence: f.experience.sequence,
                id: f.experience.feedback[0].id, feedback: { kind: 'explicit', signal: 'correction', dimension: 'behavior', note: 'New source instruction' } });
            return value;
        });
        await expect(f.service.startLearning(f.h.handle, f.input)).rejects.toThrow('learning_sequence_conflict');
        expect((await f.repository.owner(f.h.handle)).attempts).toEqual([]);
    });
    test('automatic mode, non-prompt targets and read-only storage reject this pilot', async () => {
        const automatic = await fixture(make, 'project-prompt', { policyMode: 'auto' });
        await expect(automatic.service.startLearning(automatic.h.handle, automatic.input)).rejects.toThrow('review_prompt_required');
        const strategy = await fixture(make, 'project-strategy');
        await expect(strategy.service.startLearning(strategy.h.handle, strategy.input)).rejects.toThrow('review_prompt_required');
        const f = await fixture(make); setReadOnly(true);
        await expect(f.service.startLearning(f.h.handle, f.input)).rejects.toMatchObject({ code: 'storage_read_only' });
    });
    test('ordinary jobs cannot be relabeled as learning optimizer work through deduplication', async () => {
        const f = await fixture(make);
        const ordinary = await f.service.start(f.h.handle, { scope: f.scope, subject: f.subject, expectedSequence: f.input.expectedSequence });
        await f.service.wait(f.h.handle, ordinary.jobId);
        const view = await f.service.experience.inspect(f.h.handle, { scope: f.scope, subject: f.subject });
        const trajectory = await f.service.experience.exportLearning(f.h.handle, { scope: f.scope, subject: f.subject, expectedSequence: view.sequence, purpose: 'offline-analysis' });
        const before = await f.repository.get(f.h.handle, f.scope, f.subject), owner = await f.repository.owner(f.h.handle);
        await expect(f.service.startLearning(f.h.handle, { ...f.input, trajectory, expectedSequence: before.sequence })).rejects.toThrow('learning_optimizer_job_provenance_conflict');
        expect(await f.repository.get(f.h.handle, f.scope, f.subject)).toEqual(before);
        expect(before.jobs.find(job => job.id === ordinary.jobId).learning).toBeUndefined();
        expect(await f.repository.owner(f.h.handle)).toEqual(owner);
    });
});

test('S34 authenticated HTTP rejects unsolicited/forged optimizer inputs without sending', async () => {
    const f = await fixture(makeTempFsEngineHarness), app = express(); app.use(express.json({ limit: '300kb' }));
    app.use((req, _res, next) => { if (req.headers['x-owner']) req.user = { profile: { handle: req.headers['x-owner'] } }; next(); });
    app.use(createNativeGenerationRouter(() => f.host, () => f.service.experience.sources.chat?.repo));
    const endpoint = '/evolution/start-learning';
    expect((await request(app).post(endpoint).send(f.input)).status).toBe(401);
    const rejected = await request(app).post(endpoint).set('x-owner', f.h.handle).send({ ...f.input, purpose: 'offline-analysis' });
    expect(rejected.status).toBe(400); expect(rejected.headers['cache-control']).toBe('private, no-store');
    expect((await request(app).post(endpoint).set('x-owner', 'other').send(f.input)).status).toBe(400);
    expect((await f.repository.owner(f.h.handle)).attempts).toEqual([]);
});

test('S34 authenticated HTTP queues the exact learning request and stops locally before provider I/O', async () => {
    const fetchImpl = jest.fn(async () => { throw new Error('Provider I/O forbidden'); });
    const f = await fixture(makeTempFsEngineHarness, 'project-prompt', { fetchImpl }), app = express();
    app.use(express.json({ limit: '300kb' }));
    app.use((req, _res, next) => { if (req.headers['x-owner']) req.user = { profile: { handle: req.headers['x-owner'] } }; next(); });
    app.use(createNativeGenerationRouter(() => f.host, () => f.service.experience.sources.chat?.repo));
    const extract = jest.spyOn(EvolutionEvaluator.prototype, 'extract').mockRejectedValue(new Error('offline_http_fixture_stop'));
    const accepted = await request(app).post('/evolution/start-learning').set('x-owner', f.h.handle).send(f.input);
    expect(accepted.status).toBe(200);
    expect(accepted.headers['cache-control']).toBe('private, no-store');
    expect(accepted.body).toMatchObject({ jobId: expect.any(String), operationId: expect.any(String), status: 'queued' });
    await f.service.wait(f.h.handle, accepted.body.jobId).catch(() => {});
    // The original scheduler observes failures asynchronously before persisting its terminal state.
    for (let attempt = 0; attempt < 100; attempt++) {
        const value = await f.repository.get(f.h.handle, f.scope, f.subject);
        if (value.jobs.find(job => job.id === accepted.body.jobId)?.status === 'failed') break;
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    const current = await f.repository.get(f.h.handle, f.scope, f.subject), job = current.jobs.find(job => job.id === accepted.body.jobId);
    expect(job).toMatchObject({ status: 'failed', reason: 'job_interrupted', learning: { trajectoryHash: f.input.trajectory.integrity } });
    expect(current.publications).toEqual([]);
    expect(extract).toHaveBeenCalledTimes(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await f.repository.owner(f.h.handle)).attempts).toEqual([]);
});
