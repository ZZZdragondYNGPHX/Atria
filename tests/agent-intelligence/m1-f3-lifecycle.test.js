import { expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { evolutionFixture, runEvolution, restoreEvolutionFixture } from './evolution-fixture.js';
import { publishConsumeRollback, recordRejectedF3Promotion, f3ReportForStorage, readF3StoredReport } from './m1-f3-promotion.js';
import { hash } from '../../src/native/agent-intelligence/evaluation/cases.js';
import { AgentEvolutionRepository } from '../../src/native/agent-intelligence/evolution-repository.js';
import { M1AdvisoryRepository } from './m1-quota.js';

const completion = (name, args, id) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });

test('oversized development keeps its full evidence for the separate promotion phase', () => {
    const report = { origin: 'm1_f3_development', observations: 'complete synthetic development evidence '.repeat(40000) };
    const stored = f3ReportForStorage(report);
    expect(stored.origin).toBe('m1_f3_lossless_archive');
    expect(stored.reportHash).toBe(hash(report));
    expect(readF3StoredReport(stored)).toEqual(report);
    expect(() => readF3StoredReport({ ...stored, reportHash: hash('changed') })).toThrow('f3_report_archive_changed');
});

test('explicit review binds all 149 paid receipts and keeps the owner capacity bounded', async () => {
    const f = await evolutionFixture(makeTempFsEngineHarness, 'project-prompt', { policyMode: 'review', repositoryClass: M1AdvisoryRepository });
    try {
        const { job, candidate } = await runEvolution(f);
        const initial = await f.repository.owner(f.h.handle);
        const jobCharges = initial.attempts.filter(a => a.jobId === job.id);
        await f.repository.mutateOwner(f.h.handle, owner => {
            const template = jobCharges[0];
            for (let i = jobCharges.length; i < 149; i++) owner.attempts.push({ ...template, id: 'synthetic-review-fee-' + i });
        });
        const owner = await f.repository.owner(f.h.handle);
        const expected = owner.attempts.filter(a => a.jobId === job.id).map(a => a.id);
        await f.service.publish(f.h.handle, { scope: f.scope, subject: f.subject, jobId: job.id,
            candidateId: candidate.candidateId, expectedReportHash: hash(candidate.report), review: true });
        const doc = await f.repository.get(f.h.handle, f.scope, f.subject);
        const publication = doc.publications.find(p => p.jobId === job.id);
        expect(publication.reservationIds).toEqual(expected);
        expect(publication.reservationIds).toHaveLength(149);
        expect(await f.repository.owner(f.h.handle)).toEqual(owner);
        const replaceIds = ids => f.repository.mutate(f.h.handle, f.scope, f.subject, saved => {
            const p = saved.publications[0]; p.reservationIds = ids;
            const { id: _id, status: _status, receipt: _receipt, activation: _activation, reason: _reason, ...intent } = p;
            p.id = hash(intent);
        });
        await expect(replaceIds([...expected, expected[0]])).rejects.toThrow('Invalid publication reservations');
        await expect(replaceIds(Array.from({ length: 2049 }, (_, i) => 'fee-' + i))).rejects.toThrow('Invalid publication state');
        expect((await f.repository.get(f.h.handle, f.scope, f.subject)).publications[0].reservationIds).toEqual(expected);
        await f.service.rollback(f.h.handle, { scope: f.scope, subject: f.subject, publicationId: publication.id });
        expect((await f.repository.get(f.h.handle, f.scope, f.subject)).publications[0].status).toBe('rolled_back');
    } finally { await f.h.cleanup(); }
}, 45000);
class ImmediateSyntheticRepository extends AgentEvolutionRepository {
    async reserve(handle, attempt) {
        // Synthetic comparison reserves many receipts without actual sends.
        // Preserve durable timestamps; only the mock transport skips pacing.
        return { ...await super.reserve(handle, attempt), createdAt: Date.now() };
    }
}

test('lossless oversized private report binds native delegated review and the actual next Project consumer', async () => {
    const f = await evolutionFixture(makeTempFsEngineHarness, 'project-prompt', { policyMode: 'review', repositoryClass: ImmediateSyntheticRepository,
        fetchImpl: async () => ({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({
            choices: [{ message: { content: 'Synthetic review acknowledgement.' } }], usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 } }) }) });
    try {
        const { job, candidate } = await runEvolution(f);
        const report = { ...candidate.report, origin: 'm1_f3_promotion', completePrivateHistory: 'synthetic complete native history '.repeat(170000) };
        const stored = f3ReportForStorage(report);
        await f.repository.mutate(f.h.handle, f.scope, f.subject, doc => { doc.jobs.find(j => j.id === job.id).candidates[0].report = stored; });
        expect(readF3StoredReport(stored)).toEqual(report);
        const entry = {};
        await publishConsumeRollback({ f, kind: 'project-prompt', job: { ...job, scopeId: (await f.repository.get(f.h.handle, f.scope, f.subject)).scopeId },
            candidate, report, entry, store: () => {}, signal: AbortSignal.timeout(30000), fresh: () => f.service._fresh(f.h.handle, f.scope, f.subject, job.id) });
        expect(entry.lifecycle).toMatchObject({ reportHash: hash(report), storedReportHash: hash(stored), nextRunConsumed: true, baseRestored: true });
        const doc = await f.repository.get(f.h.handle, f.scope, f.subject);
        expect(doc.publications[0]).toMatchObject({ reportHash: hash(stored), status: 'rolled_back' });
        expect(doc.jobs[0].candidates[0].decision.eligible).toBe(false);
    } finally { await f.h.cleanup(); }
}, 45000);

// Synthetic reports exercise publication and the actual next consumers only.
// No sealed content, empirical grades or real network calls enter these tests.
test.each(['rp-skill', 'project-prompt'])('F3 %s delegated review consumes the selected version and restores the exact base', async kind => {
    const sends = [];
    const f = await evolutionFixture(makeTempFsEngineHarness, kind, { policyMode: 'review', repositoryClass: ImmediateSyntheticRepository, fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body); sends.push(body);
        const message = kind === 'project-prompt' ? { content: 'Synthetic readiness acknowledgement.' }
            : { content: '', tool_calls: [completion('write_message', { text: 'The NPC waits for your choice.', mode: 'replace' }, 'write'), completion('finalize', {}, 'finalize')] };
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message }], usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 } }) };
    } });
    const entry = {}, saved = new Map();
    try {
        const { job, candidate } = await runEvolution(f);
        const ownerBefore = await f.repository.owner(f.h.handle);
        await publishConsumeRollback({ f, kind, job: { ...job, scopeId: (await f.repository.get(f.h.handle, f.scope, f.subject)).scopeId },
            candidate, report: candidate.report, entry, store: (name, value) => saved.set(name, value), signal: AbortSignal.timeout(30000),
            fresh: () => f.service._fresh(f.h.handle, f.scope, f.subject, job.id) });
        expect(entry.lifecycle).toMatchObject({ delegatedFixtureReview: true, automaticPromotion: false,
            nextRunConsumed: true, nextConfigurationMatchesCandidate: true, baseRestored: true });
        const final = await f.repository.get(f.h.handle, f.scope, f.subject);
        expect(final.publications).toHaveLength(1);
        expect(final.publications[0].status).toBe('rolled_back');
        expect(final.jobs[0].candidates[0].decision.eligible).toBe(false);
        expect(saved.has(kind + '-f3-lifecycle.json')).toBe(true);
        const owner = await f.repository.owner(f.h.handle);
        expect(owner.attempts.slice(ownerBefore.attempts.length)).toHaveLength(sends.length);
        expect(owner.attempts.slice(ownerBefore.attempts.length).every(a => a.jobId === job.id + ':activation' && a.status === 'reported')).toBe(true);
        expect(sends.length).toBeGreaterThan(0);
    } finally { await f.h.cleanup(); }
}, 45000);

test('unpublished evaluation restore preserves the frozen candidate and original paid identities', async () => {
    const f = await evolutionFixture(makeTempFsEngineHarness, 'project-prompt', { policyMode: 'review', repositoryClass: ImmediateSyntheticRepository });
    let restored;
    try {
        const result = await runEvolution(f), owner = await f.repository.owner(f.h.handle);
        restored = await restoreEvolutionFixture(makeTempFsEngineHarness, f.h.dataRoot, result, { evaluationOnly: true });
        expect(await restored.repository.get(restored.h.handle, restored.scope, restored.subject)).toEqual(result.doc);
        expect(await restored.repository.owner(restored.h.handle)).toEqual(owner);
        expect(await restored.service.targets.check(restored.h.handle, restored.scope, restored.subject, restored.target, result.candidate.candidateId))
            .toMatchObject({ base: result.candidate.base, desired: result.candidate.desired });
        const changed = structuredClone(result); changed.candidate.diff.after += '\nChanged';
        await expect(restoreEvolutionFixture(makeTempFsEngineHarness, f.h.dataRoot, changed, { evaluationOnly: true })).rejects.toThrow('resume_evaluation_changed');
        const resources = path.join(f.h.dataRoot, 'u/atria-native/resources/atri_agent_evolution');
        expect(fs.existsSync(resources)).toBe(true);
    } finally { restored?.h.cleanup(); f.h.cleanup(); }
}, 45000);

test('rejected oversized promotion keeps exact raw evidence and the bounded original journal', async () => {
    const f = await evolutionFixture(makeTempFsEngineHarness, 'project-prompt', { policyMode: 'review', repositoryClass: ImmediateSyntheticRepository });
    try {
        const result = await runEvolution(f), owner = await f.repository.owner(f.h.handle), saved = new Map();
        const report = { origin: 'synthetic_oversized_rejection', output: 'x'.repeat(5 * 1024 * 1024) };
        await expect(f.repository.mutate(f.h.handle, f.scope, f.subject, doc => { doc.jobs[0].candidates[0].report = report; }))
            .rejects.toThrow('Evolution scope capacity exceeded');
        const entry = { acceptance: { accepted: false, reasons: ['improvement_threshold_not_met'] } };
        await recordRejectedF3Promotion({ f, kind: 'project-prompt', job: result.job, report, entry, store: (name, value) => saved.set(name, value) });
        const final = await f.repository.get(f.h.handle, f.scope, f.subject);
        expect(final.jobs[0]).toMatchObject({ status: 'failed', reason: 'm1_promotion_unqualified:' + hash(report) });
        expect(final.jobs[0].candidates[0].report).toEqual(result.candidate.report);
        expect(final.publications).toHaveLength(0);
        expect(await f.repository.owner(f.h.handle)).toEqual(owner);
        expect(saved.get('project-prompt-f3-promotion-report.json')).toEqual(report);
        expect(entry).toMatchObject({ status: 'f3_promotion_unqualified', rejectedReportHash: hash(report) });
        await expect(recordRejectedF3Promotion({ f, kind: 'project-prompt', job: result.job, report,
            entry: { acceptance: { accepted: true } }, store: () => {} })).rejects.toThrow('f3_rejection_unestablished');
    } finally { await f.h.cleanup(); }
}, 45000);

test.each(['rp-skill', 'project-prompt'])('F3 %s restores the base when next-request transport fails', async kind => {
    const f = await evolutionFixture(makeTempFsEngineHarness, kind, { policyMode: 'review', repositoryClass: ImmediateSyntheticRepository, fetchImpl: async () => { throw new Error('Synthetic transport failure'); } });
    const entry = {}, saved = new Map();
    try {
        const { job, candidate } = await runEvolution(f);
        const operation = publishConsumeRollback({ f, kind, job: { ...job, scopeId: (await f.repository.get(f.h.handle, f.scope, f.subject)).scopeId },
            candidate, report: candidate.report, entry, store: (name, value) => saved.set(name, value), signal: AbortSignal.timeout(30000),
            fresh: () => f.service._fresh(f.h.handle, f.scope, f.subject, job.id) });
        await expect(operation).rejects.toThrow();
        expect(entry.lifecycle.baseRestored).toBe(true);
        expect(entry.lifecycle.nextRunConsumed).not.toBe(true);
        const final = await f.repository.get(f.h.handle, f.scope, f.subject);
        expect(final.publications[0].status).toBe('rolled_back');
        expect(saved.get(kind + '-f3-lifecycle.json').baseRestored).toBe(true);
    } finally { await f.h.cleanup(); }
}, 45000);
