import { expect, test } from '@jest/globals';
import { EvaluationBudget } from './budget.js';
import { M1ApiQuota, M1AdvisoryRepository } from './m1-quota.js';
import { evolutionFixture } from './evolution-fixture.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';

test('advisory restore preserves sticky history and unknown charges while allowing new sends', () => {
    const strict = new EvaluationBudget({ maxRequests: 1, maxTotalTokens: 10 });
    strict.reserve({ requestId: 'old', trialId: 'trial', inputTokens: 5, reservedOutput: 5 }); strict.settle('old', 11);
    const budget = new EvaluationBudget({ maxRequests: 1, maxTotalTokens: 10 }, { snapshot: strict.snapshot(), advisory: true });
    expect(budget.reserve({ requestId: 'new', trialId: 'trial', inputTokens: 10, reservedOutput: 10 }).status).toBe('passed');
    budget.settle('new', null);
    expect(budget.snapshot()).toMatchObject({ breached: true, requests: 2, tokens: 31 });
    expect(budget.entries.get('old').tokens).toBe(11);
    expect(budget.entries.get('new').usageStatus).toBe('reserved_upper_bound');
});
test('persistent quota counts migration carry and rejects the 2001st rolling-day admission', () => {
    let stored; const now = () => 100000000;
    const quota = new M1ApiQuota({ schemaVersion: 1, carry: { requests: 1999, at: now() }, admissions: [] }, next => { stored = structuredClone(next); }, now);
    quota.admit('allowed');
    expect(() => new M1ApiQuota(stored, () => {}, now).admit('denied')).toThrow('m1_api_daily_limit');
    expect(stored.admissions).toHaveLength(1);
});
test('quota enforces twenty per rolling minute and allows expired day carry', () => {
    let at = 100000000; const quota = new M1ApiQuota({ schemaVersion: 1, carry: { requests: 2000, at: 0 }, admissions: [] }, () => {}, () => at);
    for (let i = 0; i < 20; i++) quota.admit('send-' + i);
    expect(() => quota.admit('too-fast')).toThrow('m1_api_rate_limit');
    at += 60001; quota.admit('later');
});
test('cumulative ceiling counts expired carry and survives restart without admitting call 1001', () => {
    let stored;
    const now = () => 100000000;
    const quota = new M1ApiQuota({ schemaVersion: 1, carry: { requests: 999, at: 0 }, admissions: [] }, next => { stored = structuredClone(next); }, now, { maxTotalRequests: 1000 });
    quota.admit('call-1000');
    expect(() => new M1ApiQuota(stored, () => {}, now, { maxTotalRequests: 1000 }).admit('call-1001')).toThrow('m1_api_total_limit');
    expect(stored.admissions).toHaveLength(1);
});
test('private advisory owner retains overreports and continues through original persistence', async () => {
    const f = await evolutionFixture(makeTempFsEngineHarness, 'rp-skill', { repositoryClass: M1AdvisoryRepository });
    try {
        await f.repository.reserve(f.h.handle, { id: 'old', scopeId: 'scope', jobId: 'job', kind: 'baseline', upperBound: 10 });
        await f.repository.settle(f.h.handle, 'old', 11, { usage: { totalTokens: 11 } });
        await f.repository.reserve(f.h.handle, { id: 'new', scopeId: 'scope', jobId: 'job', kind: 'baseline', upperBound: 10 });
        expect(await f.repository.owner(f.h.handle)).toMatchObject({ breached: false, attempts: [{ id: 'old', tokens: 11 }, { id: 'new', status: 'reserved' }] });
        await f.repository.mutateOwner(f.h.handle, d => { d.breached = true; });
        await f.repository.settle(f.h.handle, 'new', 5, { usage: { totalTokens: 5 } });
        expect((await f.repository.owner(f.h.handle)).breached).toBe(true);
    } finally { f.h.cleanup(); }
});
