import { expect, test } from '@jest/globals';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { evolutionFixture, runEvolution } from './evolution-fixture.js';
import { publishConsumeRollback } from './m1-f3-promotion.js';
import { AgentEvolutionRepository } from '../../src/native/agent-intelligence/evolution-repository.js';

const completion = (name, args, id) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
class ImmediateSyntheticRepository extends AgentEvolutionRepository {
    async reserve(handle, attempt) {
        // Synthetic comparison reserves many receipts without actual sends.
        // Preserve durable timestamps; only the mock transport skips pacing.
        return { ...await super.reserve(handle, attempt), createdAt: Date.now() };
    }
}

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
