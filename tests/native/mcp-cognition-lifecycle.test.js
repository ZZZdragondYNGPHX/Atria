import { afterEach, expect, jest, test } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { evolutionFixture, runEvolution, price } from '../agent-intelligence/evolution-fixture.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { ProjectTaskRepository } from '../../src/native/agent-intelligence/project-task-repository.js';

const cleanup = [];
afterEach(async () => { jest.restoreAllMocks(); for (const fn of cleanup.splice(0)) await fn(); });
async function fixture() {
    const f = await evolutionFixture(makeTempFsEngineHarness, 'project-strategy'); cleanup.push(f.h.cleanup);
    const app = express(); app.use(express.json({ limit: '1mb' }));
    app.use((req, _res, next) => { req.user = { profile: { handle: f.h.handle } }; next(); });
    app.use('/generation', createNativeGenerationRouter(() => f.host, () => null));
    return { ...f, app, input: { scope: f.scope, subject: f.subject } };
}

test('Evolution preflight uses stored observations and stale Native configuration cannot enable automatic execution', async () => {
    const f = await fixture(), before = await f.repository.get(f.h.handle, f.scope, f.subject);
    jest.spyOn(f.host.agent, 'listTasks').mockImplementation(() => { throw new Error('Mutable Task list prohibited'); });
    jest.spyOn(f.service.experience, 'inspect').mockImplementation(() => { throw new Error('Reconciliation prohibited in preflight'); });
    const view = await f.service.preflight(f.h.handle, f.input);
    expect(view.validity).toBe('not_reconciled'); expect(Array.isArray(view.choices)).toBe(true);
    expect(await f.repository.get(f.h.handle, f.scope, f.subject)).toEqual(before);
    const route = { ...f.route, policy: { ...f.route.policy, timeoutMs: f.route.policy.timeoutMs + 1 } };
    await f.host.persistence.saveRuntimeRoute(f.h.handle, route);
    await supertest(f.app).post('/generation/evolution/controlled-configure').send({ expectedObservationFingerprint: view.observationFingerprint,
        input: { ...f.input, target: f.target, mode: 'auto', routeId: route.runtimeRouteId, price, expectedSequence: before.sequence } }).expect(409);
    expect(await f.repository.get(f.h.handle, f.scope, f.subject)).toEqual(before);
    expect((await f.repository.owner(f.h.handle)).attempts).toEqual([]);
});

test('controlled human labels cannot auto-publish; exact independent rollback rejects stale publication then restores native target', async () => {
    const f = await fixture(), { job, candidate } = await runEvolution(f);
    // Synthetic evaluator evidence only tests authority flow, not real model quality.
    for (const pair of candidate.report.pairs) {
        const doc = await f.repository.get(f.h.handle, f.scope, f.subject);
        const result = await supertest(f.app).post('/generation/evolution/controlled-label').send({ ...f.input, jobId: job.id,
            candidateId: candidate.candidateId, pairHash: pair.pairHash, preference: 'candidate',
            deltas: Object.fromEntries(pair.case.behaviorDimensions.map(d => [d, 1])), expectedSequence: doc.sequence }).expect(200);
        expect(result.body.automaticPublication).toBe('suppressed');
    }
    let doc = await f.repository.get(f.h.handle, f.scope, f.subject);
    expect(doc.publications).toEqual([]);
    const entry = doc.jobs.find(j => j.id === job.id).candidates[0];
    await f.service.publish(f.h.handle, { ...f.input, jobId: job.id, candidateId: candidate.candidateId, expectedReportHash: hash(entry.report), review: true });
    doc = await f.repository.get(f.h.handle, f.scope, f.subject); const publication = doc.publications[0];
    const input = { ...f.input, publicationId: publication.id, expectedSequence: doc.sequence, expectedPublicationFingerprint: hash(publication) };
    await supertest(f.app).post('/generation/evolution/controlled-rollback').send({ ...input, expectedPublicationFingerprint: 'a'.repeat(64) }).expect(409);
    expect((await f.repository.get(f.h.handle, f.scope, f.subject)).publications[0].status).toBe('published');
    await supertest(f.app).post('/generation/evolution/controlled-rollback').send(input).expect(200);
    doc = await f.repository.get(f.h.handle, f.scope, f.subject);
    expect(doc.policy.mode).toBe('paused'); expect(doc.publications[0].status).toBe('rolled_back');
    expect((await f.service.targets.check(f.h.handle, f.scope, f.subject, f.target, candidate.candidateId)).actual).toEqual(candidate.base);
}, 60000);

test('source retention preview performs no deletion and exact Native source-set CAS preserves concurrent changes', async () => {
    const f = await fixture(), service = f.service.experience, tasks = new ProjectTaskRepository({ engine: f.h.engine });
    await f.host.agent.takeOver(f.h.handle, f.subject, f.previousTask.taskId);
    service.now = () => Date.now() + 3 * 86400000;
    const input = { scope: f.scope, days: 1, limit: 10 }, view = await service.observeSourceRetention(f.h.handle, input);
    expect(view.selected).toHaveLength(1); expect(view.validity).toBe('not_reconciled');
    const original = await tasks.get(f.h.handle, f.subject, f.previousTask.taskId);
    expect(original.status).toBe('taken_over');
    await tasks.save(f.h.handle, { ...original, sequence: original.sequence + 1, updatedAt: original.updatedAt + 1 }, hash(original));
    await expect(service.purgeSources(f.h.handle, input, { expectedSourceSetFingerprint: view.sourceSetFingerprint }))
        .rejects.toMatchObject({ code: 'source_retention_review_stale' });
    expect(await tasks.get(f.h.handle, f.subject, f.previousTask.taskId)).not.toBeNull();
    const current = await service.observeSourceRetention(f.h.handle, input);
    expect(await service.purgeSources(f.h.handle, input, { expectedSourceSetFingerprint: current.sourceSetFingerprint })).toMatchObject({ deleted: 1, conflicts: 0 });
    expect(await tasks.get(f.h.handle, f.subject, f.previousTask.taskId)).toBeNull();
});

test('controlled Evidence sequence and deletion bind the original Native record even if a client proposes a much newer sequence', async () => {
    const f = await evolutionFixture(makeTempFsEngineHarness, 'rp-skill'); cleanup.push(f.h.cleanup);
    const doc = await f.service.experience.repository.get(f.h.handle, f.scope, f.subject), evidenceId = doc.feedback[0].source.id;
    const record = await f.service.experience.evidence.get(f.h.handle, evidenceId);
    const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { profile: { handle: f.h.handle } }; next(); });
    app.use('/generation', createNativeGenerationRouter(() => f.host, () => null));
    const input = { evidenceId, sequence: record.sequence + 1, status: 'completed', trace: record.trace, output: null };
    await supertest(app).post('/generation/evidence/controlled').send({ action: 'update', expectedSequence: record.sequence - 1,
        input: { ...input, sequence: record.sequence + 100 } }).expect(400);
    expect(await f.service.experience.evidence.get(f.h.handle, evidenceId)).toEqual(record);
    await supertest(app).post('/generation/evidence/controlled').send({ action: 'update', expectedSequence: record.sequence, input }).expect(200);
    const updated = await f.service.experience.evidence.get(f.h.handle, evidenceId); expect(updated.sequence).toBe(record.sequence + 1);
    await supertest(app).post('/generation/evidence/controlled').send({ action: 'delete', input: { evidenceId }, expectedRecordFingerprint: hash(record) }).expect(409);
    expect(await f.service.experience.evidence.get(f.h.handle, evidenceId)).toEqual(updated);
    await supertest(app).post('/generation/evidence/controlled').send({ action: 'delete', input: { evidenceId }, expectedRecordFingerprint: hash(updated) }).expect(200);
    expect(await f.service.experience.evidence.get(f.h.handle, evidenceId)).toBeNull();
});
