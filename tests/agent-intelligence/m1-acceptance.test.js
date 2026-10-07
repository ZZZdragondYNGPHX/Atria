import { expect, test } from '@jest/globals';
import { evolutionFixture, syntheticReport } from './evolution-fixture.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { parseBlindGrade, automatedAcceptance } from './m1-acceptance.js';
import { promotionDecision } from '../../src/native/agent-intelligence/evolution-evaluator.js';
import { evolutionHash as hash } from '../../src/native/agent-intelligence/evolution-repository.js';

function fundedReport() {
    const report = syntheticReport({ id: 'm1', domain: 'rp', price: null }, { baseline: {}, candidate: {} }, { baseline: {}, candidate: {} });
    const owner = { attempts: [], breached: false }, independent = [];
    report.charges = [];
    const charge = (id, kind, trialId, jobId) => ({ id, kind, trialId, jobId, requestHash: hash(id), snapshotHash: hash([id]), status: 'reported',
        tokens: 10, usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 }, cost: null });
    for (const [i, p] of report.pairs.entries()) {
        for (const arm of ['baseline', 'candidate']) {
            const paid = charge(arm + i, arm, p[arm].trialId, 'm1'); owner.attempts.push(paid);
            const { jobId: _job, ...publicCharge } = paid; p[arm].charges = [publicCharge]; report.charges.push(publicCharge);
        }
        const paid = charge('judge' + i, 'judge', 'judge' + i, 'm1'); owner.attempts.push(paid);
        const { jobId: _job, ...publicCharge } = paid; report.charges.push(publicCharge); p.judge.chargeIds = [paid.id];
        const { pairHash: _old, ...identity } = p; p.pairHash = hash(identity);
        const second = charge('independent' + i, 'judge', 'independent' + i, 'm1:independent'); owner.attempts.push(second);
        independent.push({ origin: 'independent_model', model: 'second-model', primaryModel: 'first-model', pairHash: p.pairHash, chargeId: second.id,
            requestHash: second.requestHash, snapshotHash: second.snapshotHash, preference: 'candidate', deltas: p.judge.deltas });
    }
    return { report, independent, owner };
}

test('automated engineering acceptance never fills human labels or grants production promotion', () => {
    const f = fundedReport(), before = JSON.stringify(f.report);
    expect(automatedAcceptance(f.report, f.independent, f.owner, 'm1')).toMatchObject({ accepted: true, humanPreference: 'not_observed', currencyCost: 'unavailable' });
    expect(JSON.stringify(f.report)).toBe(before);
    expect(promotionDecision(f.report).eligible).toBe(false);
    expect(f.report.pairs.every(p => p.human === null)).toBe(true);
});

test('missing independent model, disagreement and unaccounted usage remain acceptance failures', () => {
    for (const change of [f => f.independent.pop(), f => { f.independent[0].preference = 'baseline'; },
        f => { f.independent[0].model = 'first-model'; }, f => { f.owner.attempts[0].tokens++; },
        f => { f.report.pairs[0].candidate.checks.target_consumed = false; }, f => { f.owner.breached = true; }]) {
        const f = fundedReport(); change(f); expect(automatedAcceptance(f.report, f.independent, f.owner, 'm1').accepted).toBe(false);
    }
});

test('blind label direction follows the shuffle and malformed grades stay ungraded', () => {
    const pair = fundedReport().report.pairs[0];
    const deltas = Object.fromEntries(pair.case.behaviorDimensions.map(d => [d, 1]));
    expect(parseBlindGrade(JSON.stringify({ preference: 'right', deltas, rationale: 'Observed' }), pair, false).preference).toBe('candidate');
    expect(parseBlindGrade(JSON.stringify({ preference: 'right', deltas, rationale: 'Observed' }), pair, true).preference).toBe('baseline');
    expect(() => parseBlindGrade(JSON.stringify({ preference: 'candidate', deltas, rationale: 'Invalid' }), pair, false)).toThrow('invalid_blind_grade');
});

test('an explicit live connection seeds only its own fixture Route and review mode without sending', async () => {
    let calls = 0;
    const connectionConfig = { endpoint: 'https://explicit.invalid/v1', model: 'explicit-model', tokenizer: 'cl100k_base', contextTokens: 32000,
        maxOutputTokens: 1024, maxRequests: 120, maxTotalTokens: 250000, timeoutMs: 300000 };
    const f = await evolutionFixture(makeTempFsEngineHarness, 'rp-skill', { realEvaluator: true, connectionConfig, policyMode: 'review', confirmedPrice: null,
        fetchImpl: async () => { calls++; throw new Error('No send expected'); } });
    try {
        const config = await f.evaluator.configuration(f.h.handle, f.route.runtimeRouteId);
        expect(config.model.remoteModelId).toBe('explicit-model');
        expect(config.connection.endpoint).toBe('https://explicit.invalid/v1/chat/completions');
        expect((await f.repository.get(f.h.handle, f.scope, f.subject)).policy).toMatchObject({ mode: 'review', price: null });
        expect(calls).toBe(0);
    } finally { f.h.cleanup(); }
});
