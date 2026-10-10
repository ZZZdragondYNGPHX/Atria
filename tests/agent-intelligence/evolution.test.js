import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { evolutionFixture, runEvolution, labelAll, independentDigest } from './evolution-fixture.js';
import { AgentEvolutionRepository, evolutionHash as hash } from '../../src/native/agent-intelligence/evolution-repository.js';
import { promotionDecision } from '../../src/native/agent-intelligence/evolution-evaluator.js';
import { AgentEvolutionService } from '../../src/native/agent-intelligence/evolution-service.js';
import { SettingsRepo } from '../../src/storage/repositories/settings-repo.js';
import { contentSha256 } from '../../public/shared/content-sha256.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';
import { updatePresetLibrary } from '../../public/scripts/lib/agent-workspace/presets.js';

const cleanup = [];
afterEach(async () => { setReadOnly(false); jest.restoreAllMocks(); for (const fn of cleanup.splice(0)) await fn(); });
async function fixture(make, kind) { const f = await evolutionFixture(make, kind); cleanup.push(f.h.cleanup); return f; }

test('shared content identity matches the existing SHA-256 format for UTF-8 and block boundaries', () => {
    for (const text of ['', 'abc', '正文💡', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), '文'.repeat(100000)]) expect(contentSha256(text)).toBe(independentDigest(text));
});

describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s bounded evolution', (_name, make) => {
    test.each(['project-strategy', 'project-skill', 'rp-skill', 'workspace-prompt', 'workspace-strategy', 'project-prompt'])('%s follows original feedback -> diagnosis -> candidate -> comparison -> local automatic CAS -> rollback', async kind => {
        const f = await fixture(make, kind), before = await f.service.targets.capture(f.h.handle, f.scope, f.subject, f.target);
        const { job, candidate } = await runEvolution(f);
        expect(job.status).toBe('awaiting_review'); expect(candidate.decision.eligible).toBe(false);
        expect((await f.service.targets.check(f.h.handle, f.scope, f.subject, f.target, candidate.candidateId)).actual).toEqual(candidate.base);
        const experience = await f.service.experience.inspect(f.h.handle, { scope: f.scope, subject: f.subject });
        expect(experience.diagnoses.at(-1).origin).toBe('model_hypothesis');
        await labelAll(f, job, candidate);
        const doc = await f.repository.get(f.h.handle, f.scope, f.subject), publication = doc.publications[0];
        expect(publication).toMatchObject({ status: 'published', reason: 'eligible_local_auto', activation: null });
        expect(publication.receipt.exactBindingHash).toBe(hash(candidate.desired));
        expect((await f.service.targets.check(f.h.handle, f.scope, f.subject, f.target, candidate.candidateId)).actual).toEqual(candidate.desired);
        const reverted = await f.service.rollback(f.h.handle, { scope: f.scope, subject: f.subject, publicationId: publication.id });
        expect(reverted.publications[0].status).toBe('rolled_back'); expect(reverted.policy.mode).toBe('paused');
        expect((await f.service.targets.check(f.h.handle, f.scope, f.subject, f.target, candidate.candidateId)).actual).toEqual(candidate.base);
        expect((await f.service.targets.capture(f.h.handle, f.scope, f.subject, f.target)).base).toEqual(before.base);
    });
    test('owner ledger serializes competing scopes, restores unknown usage and cannot erase a breach', async () => {
        const h = await make(); cleanup.push(h.cleanup); const repo = new AgentEvolutionRepository({ engine: h.engine });
        await repo.limits(h.handle, { maxRequests: 2, maxTokens: 100, minIntervalMs: 1000 }, 0);
        const reserve = (id, scopeId = 'scope') => repo.reserve(h.handle, { id, scopeId, jobId: id, kind: 'candidate', upperBound: 60 });
        const competing = await Promise.allSettled([reserve('one', 'A'), reserve('two', 'B')]);
        expect(competing.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        const ledger = await repo.owner(h.handle), id = ledger.attempts[0].id;
        expect(repo.totals(ledger)).toMatchObject({ requests: 1, tokens: 60 });
        expect((await new AgentEvolutionRepository({ engine: h.engine }).owner(h.handle)).attempts[0].status).toBe('reserved');
        await repo.settle(h.handle, id); expect(repo.totals(await repo.owner(h.handle)).tokens).toBe(60);
        await expect(repo.settle(h.handle, id, 0)).rejects.toThrow('settled');
        await repo.limits(h.handle, { maxRequests: 2, maxTokens: 200, minIntervalMs: 1000 }, (await repo.owner(h.handle)).sequence);
        await reserve('overage'); await repo.settle(h.handle, 'overage', 80);
        expect((await repo.owner(h.handle)).breached).toBe(true);
        await expect(reserve('later')).rejects.toThrow('budget_blocked');
        await expect(repo.limits(h.handle, { maxRequests: 1, maxTokens: 1, minIntervalMs: 1000 })).rejects.toThrow('discard');
    });
    test('pause cancels pending publication, leaves cumulative reservation and never restarts a model job', async () => {
        const f = await fixture(make, 'project-strategy');
        const { job, candidate } = await runEvolution(f), doc = await f.repository.get(f.h.handle, f.scope, f.subject);
        await f.service.mode(f.h.handle, { scope: f.scope, subject: f.subject, mode: 'paused', expectedSequence: doc.sequence });
        await expect(f.service.label(f.h.handle, { scope: f.scope, subject: f.subject, jobId: job.id, candidateId: candidate.candidateId,
            pairHash: candidate.report.pairs[0].pairHash, preference: 'candidate', deltas: { repair_quality: 1 }, expectedSequence: doc.sequence })).rejects.toThrow('cancelled');
        expect((await f.service.inspect(f.h.handle, { scope: f.scope, subject: f.subject })).owner.totals.requests).toBe(28);
        expect((await f.service.targets.check(f.h.handle, f.scope, f.subject, f.target, candidate.candidateId)).actual).toEqual(candidate.base);
    });
    test.each([['before', 'restart'], ['after', 'restart'], ['before', 'request'], ['after', 'request']])('original target response loss %s commit recovers intent exactly once via %s', async (timing, recovery) => {
        const f = await fixture(make, 'project-strategy'); const { job, candidate } = await runEvolution(f);
        const write = f.service.targets.write.bind(f.service.targets);
        const spy = jest.spyOn(f.service.targets, 'write').mockImplementationOnce(async (...args) => {
            if (timing === 'after') await write(...args); throw new Error('Injected target response loss');
        });
        await expect(labelAll(f, job, candidate)).rejects.toThrow('response loss'); spy.mockRestore();
        let doc = await f.repository.get(f.h.handle, f.scope, f.subject); expect(doc.publications[0].receipt).toBeNull();
        if (recovery === 'request') await f.service.publish(f.h.handle, { scope: f.scope, subject: f.subject, jobId: job.id,
            candidateId: candidate.candidateId, expectedReportHash: hash(doc.jobs.find(j => j.id === job.id).candidates[0].report), review: true });
        const reopened = new AgentEvolutionService({ host: f.host, evaluator: f.evaluator, now: f.service.now });
        // Reuse the original authenticated source adapter; this constructor's
        // source service is otherwise intentionally independent of job state.
        reopened.experience = f.service.experience;
        doc = await reopened.reconcile(f.h.handle, { scope: f.scope, subject: f.subject });
        expect(doc.publications[0].status).toBe('published'); expect(doc.publications).toHaveLength(1);
        const sequence = (await f.host.agent.getTask(f.h.handle, f.subject, f.nextTask.taskId)).sequence;
        await reopened.reconcile(f.h.handle, { scope: f.scope, subject: f.subject });
        expect((await f.host.agent.getTask(f.h.handle, f.subject, f.nextTask.taskId)).sequence).toBe(sequence);
    });
    test('correcting an exact feedback dependency pauses and clears reports; subsequent user bindings are preserved', async () => {
        const f = await fixture(make, 'workspace-prompt'); const { job, candidate } = await runEvolution(f); await labelAll(f, job, candidate);
        const settingsRepo = new SettingsRepo({ engine: f.h.engine }), settings = await settingsRepo.get(f.h.handle);
        settings.atri_capabilities.orchestrator.agentWorkspace = updatePresetLibrary(settings.atri_capabilities.orchestrator.agentWorkspace, { type: 'bind', scope: 'character', subjectId: 'Actor.png', presetId: null });
        await settingsRepo.save(f.h.handle, settings);
        const experience = await f.service.experience.inspect(f.h.handle, { scope: f.scope, subject: f.subject });
        await f.service.experience.correct(f.h.handle, { scope: f.scope, subject: f.subject, id: experience.feedback[0].id, expectedSequence: experience.sequence,
            feedback: { kind: 'explicit', signal: 'correction', dimension: 'behavior', note: 'Withdraw the previous hypothesis.' } });
        const doc = await f.service.reconcile(f.h.handle, { scope: f.scope, subject: f.subject });
        expect(doc.policy.mode).toBe('paused'); expect(doc.jobs[0].candidates).toEqual([]);
        expect(doc.publications).toEqual([]); expect(doc.retired[0].status).toBe('source_revoked');
        expect((await settingsRepo.get(f.h.handle)).atri_capabilities.orchestrator.agentWorkspace.bindings.entries).toEqual([]);
    });
    test('Host Workspace generation rejects stale full saves and patches while preserving unrelated settings writes', async () => {
        const f = await fixture(make, 'workspace-strategy'), repo = new SettingsRepo({ engine: f.h.engine }), stale = await repo.get(f.h.handle);
        const { job, candidate } = await runEvolution(f); await labelAll(f, job, candidate);
        await expect(repo.save(f.h.handle, stale)).rejects.toThrow('workspace_write_conflict');
        await expect(repo.patch(f.h.handle, [{ op: 'replace', path: '/atri_capabilities/orchestrator/agentWorkspace', value: stale.atri_capabilities.orchestrator.agentWorkspace }])).rejects.toThrow('workspace_write_conflict');
        await repo.patch(f.h.handle, [{ op: 'replace', path: '/unrelated', value: 'new unrelated value' }]);
        expect((await repo.get(f.h.handle)).unrelated).toBe('new unrelated value');
    });
    test('read-only inspect remains readable, while budgets, policy and publish stay blocked', async () => {
        const f = await fixture(make, 'project-strategy'); const { job, candidate } = await runEvolution(f); setReadOnly(true);
        expect((await f.service.inspect(f.h.handle, { scope: f.scope, subject: f.subject })).readOnly).toBe(true);
        await expect(f.service.publish(f.h.handle, { scope: f.scope, subject: f.subject, jobId: job.id, candidateId: candidate.candidateId, expectedReportHash: hash(candidate.report), review: true })).rejects.toMatchObject({ code: 'storage_read_only' });
        await expect(f.service.budget(f.h.handle, { expectedSequence: 0, limits: { maxRequests: 1, maxTokens: 1, minIntervalMs: 1000 } })).rejects.toMatchObject({ code: 'storage_read_only' });
    });
});

test('promotion never accepts S06, missing independent cases, unknown cost, regressions or same-model votes alone', async () => {
    const f = await fixture(makeTempFsEngineHarness, 'project-strategy'); const { job, candidate } = await runEvolution(f);
    const report = structuredClone(candidate.report), pin = { policyFingerprint: report.policyFingerprint, targetPin: job.targetPin };
    for (const pair of report.pairs) pair.human = { pairHash: pair.pairHash, preference: 'candidate', deltas: Object.fromEntries(pair.case.behaviorDimensions.map(d => [d, 1])) };
    expect(promotionDecision(report, pin).eligible).toBe(true);
    for (const mutation of [r => { r.origin = 's06'; }, r => { r.pairs.pop(); }, r => { r.price = null; }, r => { r.pairs[0].human = null; },
        r => { r.pairs[0].human.preference = 'baseline'; }, r => { r.pairs[0].human.deltas = {}; }, r => { r.charges[0].status = 'unknown'; }, r => { r.evaluatorRevision = hash('different'); }]) {
        const bad = structuredClone(report); mutation(bad); expect(promotionDecision(bad, pin).eligible).toBe(false);
    }
    expect(promotionDecision(report, { ...pin, budgetBreached: true }).eligible).toBe(false);
});

test('generic SQLite dump/restore keeps shared unknown reservations and scope journals; original account removal deletes both kinds', async () => {
    const f = await fixture(makeTempSqliteEngineHarness, 'project-strategy');
    await f.repository.reserve(f.h.handle, { id: 'interrupted-send', scopeId: 'another-scope', jobId: 'other-job', kind: 'candidate', upperBound: 100 });
    const before = await f.repository.owner(f.h.handle), scope = await f.repository.get(f.h.handle, f.scope, f.subject);
    const chunks = []; for await (const chunk of await f.h.engine.dumpUser(f.h.handle)) chunks.push(chunk);
    await f.h.engine.deleteUser(f.h.handle);
    const { rm } = await import('node:fs/promises'); await rm(f.h.dirs.root, { recursive: true, force: true });
    expect(await f.repository.owner(f.h.handle)).toBeNull(); expect(await f.repository.get(f.h.handle, f.scope, f.subject)).toBeNull();
    const { Readable } = await import('node:stream'); await f.h.engine.restoreUser(f.h.handle, Readable.from(Buffer.concat(chunks)));
    expect(await f.repository.owner(f.h.handle)).toEqual(before); expect(await f.repository.get(f.h.handle, f.scope, f.subject)).toEqual(scope);
});

test.each(['project-skill', 'workspace-prompt', 'project-prompt'])('source withdrawal removes inactive %s derived history and retains only hash receipts and budget', async kind => {
    const f = await fixture(makeTempFsEngineHarness, kind), { job, candidate } = await runEvolution(f); await labelAll(f, job, candidate);
    const source = await f.service.experience.inspect(f.h.handle, { scope: f.scope, subject: f.subject });
    await f.service.experience.withdraw(f.h.handle, { scope: f.scope, subject: f.subject, id: source.feedback[0].id, expectedSequence: source.sequence });
    await f.service.reconcile(f.h.handle, { scope: f.scope, subject: f.subject });
    const current = await f.repository.get(f.h.handle, f.scope, f.subject);
    expect(current.jobs[0].candidates).toEqual([]); expect(current.publications).toEqual([]); expect(current.garbage).toEqual([]);
    expect(current.retired[0]).toMatchObject({ candidateId: candidate.candidateId, status: 'source_revoked' });
    expect(JSON.stringify(current)).not.toContain(candidate.rationale);
    await expect(f.service.targets.check(f.h.handle, f.scope, f.subject, f.target, candidate.candidateId)).rejects.toThrow();
    expect((await f.repository.owner(f.h.handle)).attempts).toHaveLength(28);
});

test('cancelling an actual parent provider send retains its durable upper bound and never resends after restart', async () => {
    let entered;
    const sent = new Promise(resolve => { entered = resolve; });
    const f = await evolutionFixture(makeTempFsEngineHarness, 'project-strategy', { realEvaluator: true, fetchImpl: async (_url, { signal }) => {
        entered(); return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('Cancelled fixture send'), { name: 'AbortError' })), { once: true }));
    } }); cleanup.push(f.h.cleanup);
    const config = await f.evaluator.configuration(f.h.handle, f.route.runtimeRouteId), controller = new AbortController();
    const job = { id: 'cancelled-parent-send', scopeId: (await f.repository.get(f.h.handle, f.scope, f.subject)).scopeId, price: null };
    const run = f.evaluator.extract(f.h.handle, job, config, controller.signal, async () => {}, { instruction: 'Synthetic cancellation', field: 'maxRepairRounds', base: 2 });
    const rejected = run.then(() => ({ completed: true }), error => ({ completed: false, error }));
    await sent; controller.abort(); expect((await rejected).completed).toBe(false);
    // GenerationService may reject on abort before the provider's finally settles.
    for (let i = 0; i < 20 && (await f.repository.owner(f.h.handle)).attempts[0].status === 'reserved'; i++) await new Promise(resolve => setTimeout(resolve, 5));
    const owner = await f.repository.owner(f.h.handle); expect(owner.attempts[0].status).toBe('unknown');
    expect(owner.attempts[0].tokens).toBe(owner.attempts[0].upperBound); expect(owner.attempts[0].tokens).toBeGreaterThan(0);
    expect((await new AgentEvolutionRepository({ engine: f.h.engine }).owner(f.h.handle)).attempts).toEqual(owner.attempts);
});

test('automatic authorization pins the declared base before a job; later target edits cannot borrow its policy', async () => {
    const f = await fixture(makeTempFsEngineHarness, 'project-skill');
    const repo = f.host.skillRepository(f.h.handle);
    await repo.writeFile({ scope: f.target.scope, name: f.target.name, path: 'SKILL.md', content: '---\nname: guide\ndescription: Scoped guide\n---\nUser edited base' });
    const doc = await f.repository.get(f.h.handle, f.scope, f.subject);
    await expect(f.service.start(f.h.handle, { scope: f.scope, subject: f.subject, expectedSequence: doc.sequence })).rejects.toThrow('authorized_base_changed');
    expect((await f.repository.owner(f.h.handle)).attempts).toEqual([]);
});

test('generic FS native resource files survive the original directory backup/restore and disappear on owner directory removal', async () => {
    const f = await fixture(makeTempFsEngineHarness, 'project-strategy');
    await f.repository.reserve(f.h.handle, { id: 'fs-unknown', scopeId: 'another-scope', jobId: 'other-job', kind: 'candidate', upperBound: 100 });
    const owner = await f.repository.owner(f.h.handle), scope = await f.repository.get(f.h.handle, f.scope, f.subject);
    const { cp, rm } = await import('node:fs/promises'); const copy = f.h.dataRoot + '/directory-backup';
    await cp(f.h.dirs.root, copy, { recursive: true }); await f.h.engine.deleteUser(f.h.handle); await rm(f.h.dirs.root, { recursive: true, force: true });
    expect(await f.repository.owner(f.h.handle)).toBeNull(); expect(await f.repository.get(f.h.handle, f.scope, f.subject)).toBeNull();
    await cp(copy, f.h.dirs.root, { recursive: true });
    expect(await f.repository.owner(f.h.handle)).toEqual(owner); expect(await f.repository.get(f.h.handle, f.scope, f.subject)).toEqual(scope);
});

test('manual target drift pauses automatic policy and distinguishes the historical receipt from the current binding', async () => {
    const f = await fixture(makeTempFsEngineHarness, 'workspace-strategy'), { job, candidate } = await runEvolution(f); await labelAll(f, job, candidate);
    const repo = new SettingsRepo({ engine: f.h.engine }), settings = await repo.get(f.h.handle);
    settings.atri_capabilities.orchestrator.agentWorkspace = updatePresetLibrary(settings.atri_capabilities.orchestrator.agentWorkspace, { type: 'bind', scope: 'character', subjectId: 'Actor.png', presetId: null });
    await repo.save(f.h.handle, settings);
    const view = await f.service.inspect(f.h.handle, { scope: f.scope, subject: f.subject });
    expect(view.scope.policy).toMatchObject({ mode: 'paused', reason: 'authoritative_binding_changed' });
    expect(view.bindingStates[0].current).toBe(false); expect(view.scope.publications[0].receipt).not.toBeNull();
});

test('a second RP chat cannot stack a new Skill policy on a still-published character version', async () => {
    const f = await fixture(makeTempFsEngineHarness, 'rp-skill'), { job, candidate } = await runEvolution(f); await labelAll(f, job, candidate);
    const scope = { ...f.scope, name: 'another-chat' };
    await expect(f.service.configure(f.h.handle, { scope, subject: f.subject, target: f.target, routeId: f.route.runtimeRouteId, price: null, mode: 'auto', expectedSequence: 0 })).rejects.toThrow('existing_publication_requires_rollback');
    expect((await f.repository.owner(f.h.handle)).attempts).toHaveLength(28);
});
