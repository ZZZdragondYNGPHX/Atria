import { expect, test } from '@jest/globals';
import { PILOT_CASES, PILOT_CASE_SET_REVISION, RENEWAL_PILOT_CASES, RENEWAL_PILOT_CASE_SET_REVISION,
    selectCases, loadFixture, validateCase, hash, canonical } from '../../src/native/agent-intelligence/evaluation/cases.js';
import { runRp, runProject } from '../../src/native/agent-intelligence/evaluation/adapters.js';
import { withIsolatedRuntime } from './runner.js';
import { f3ReportForStorage, readF3StoredReport } from './m1-f3-promotion.js';
import { promotionDecision } from '../../src/native/agent-intelligence/evolution-evaluator.js';

test('renewal requires explicit registered revision and never mixes the historical corpus', () => {
    const options = { purpose: 'evaluation', split: 'development', profileId: 'rp.m1.information' };
    expect(selectCases(options)).toEqual(PILOT_CASES.filter(c => c.split === options.split && c.profileId === options.profileId));
    expect(selectCases({ ...options, caseSetRevision: RENEWAL_PILOT_CASE_SET_REVISION })).toHaveLength(3);
    expect(RENEWAL_PILOT_CASE_SET_REVISION).not.toBe(PILOT_CASE_SET_REVISION);
    expect(RENEWAL_PILOT_CASES).toHaveLength(12);
    expect(new Set(RENEWAL_PILOT_CASES.map(c => c.provenance.groupId)).size).toBe(12);
    expect(RENEWAL_PILOT_CASES.every(c => !PILOT_CASES.some(old => old.caseId === c.caseId || old.fixtureHash === c.fixtureHash))).toBe(true);
    expect(() => selectCases({ ...options, caseSetRevision: hash('unregistered') })).toThrow('revision');
    expect(() => selectCases({ ...options, profileId: null, caseSetRevision: RENEWAL_PILOT_CASE_SET_REVISION })).toThrow('explicit profile');
    const sealed = RENEWAL_PILOT_CASES.find(c => c.split === 'promotion');
    expect(() => loadFixture(sealed, { purpose: 'extraction' })).toThrow('evaluator-only');
    expect(() => loadFixture(sealed, { purpose: 'evaluation' })).toThrow('source_unready');
    expect(() => validateCase({ ...sealed, fixtureHash: hash('changed') })).toThrow('identity');
});

test.each(RENEWAL_PILOT_CASES.filter(c => c.split === 'development'))('renewal native authority fixture: $sourceId', async entry => {
    const capture = { trialId: 'synthetic-renewal:' + entry.caseId, refs: { runIds: [], requestIds: [], effectIds: [], taskIds: [], messageVariants: [] },
        prompts: [], evidence: [], checks: {}, completeness: [], toolCalls: 0, repairCount: 0,
        observe(name, observed, expected) { this.checks[name] = canonical(observed) === canonical(expected); this.evidence.push({ name, observed, expected }); } };
    const fixture = loadFixture(entry, { purpose: 'evaluation' });
    await withIsolatedRuntime(() => entry.entrance === 'rp' ? runRp(entry, fixture, capture) : runProject(entry, fixture, capture,
        { settings: { projectSkill: 'Preserve original authority.', roundLimit: entry.limits.maxRequests }, beforeSend: () => {} }));
    expect(capture.checks).toEqual(expect.objectContaining(Object.fromEntries([...entry.expectedInvariants, 'isolation'].map(d => [d, true]))));
    expect(capture.refs.effectIds).toEqual([]);
});

test('private archive is lossless, hash-bound and remains ineligible for production promotion', () => {
    const report = { origin: 'm1_f3_promotion', observations: ['complete native history '.repeat(240000)], configurations: { baseline: 'b', candidate: 'c' } };
    const stored = f3ReportForStorage(report);
    expect(Buffer.byteLength(JSON.stringify(stored))).toBeLessThan(1024 * 1024);
    expect(readF3StoredReport(stored)).toEqual(report);
    expect(stored.reportHash).toBe(hash(report));
    expect(promotionDecision(stored).eligible).toBe(false);
    expect(() => readF3StoredReport({ ...stored, reportHash: hash('forged') })).toThrow('archive_changed');
    expect(() => readF3StoredReport({ ...stored, decodedBytes: stored.decodedBytes - 1 })).toThrow();
});
