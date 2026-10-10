import { expect, test } from '@jest/globals';
import { evolutionFixture, syntheticReport } from './evolution-fixture.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { parseBlindGrade, automatedAcceptance, developmentReadiness } from './m1-acceptance.js';
import { selectCases } from '../../src/native/agent-intelligence/evaluation/cases.js';
import { promotionDecision } from '../../src/native/agent-intelligence/evolution-evaluator.js';
import { evolutionHash as hash } from '../../src/native/agent-intelligence/evolution-repository.js';
import { qualityEnvelope } from '../../src/native/agent-intelligence/evaluation/quality.js';

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

test('three funded development pairs can qualify only for freezing and any negative dimension blocks it', () => {
    const f = fundedReport(), cases = selectCases({ purpose: 'evaluation', split: 'development' }).filter(c => c.entrance === 'rp');
    f.report.pairs = f.report.pairs.filter(p => p.repetition === 1);
    f.independent = f.report.pairs.map((p, i) => {
        const observation = f.independent.find(o => o.pairHash === p.pairHash);
        p.case = cases[i]; const { pairHash: _old, ...identity } = p; p.pairHash = hash(identity);
        return { ...observation, pairHash: p.pairHash };
    });
    const used = new Set(f.report.pairs.flatMap(p => [...p.baseline.charges, ...p.candidate.charges].map(c => c.id).concat(p.judge.chargeIds)));
    f.report.charges = f.report.charges.filter(c => used.has(c.id));
    expect(developmentReadiness(f.report, f.independent, f.owner, 'm1')).toMatchObject({ accepted: true, wins: 3 });
    expect(automatedAcceptance(f.report, f.independent, f.owner, 'm1', { tokensAdvisory: true }).accepted).toBe(false);
    const pair = f.report.pairs[0]; pair.judge.deltas[pair.case.behaviorDimensions[0]] = -1;
    const { pairHash: _old, ...identity } = pair; pair.pairHash = hash(identity); f.independent[0].pairHash = pair.pairHash;
    expect(developmentReadiness(f.report, f.independent, f.owner, 'm1').reasons).toContain('behavior_regression_or_ungraded');
});

test('automated engineering acceptance never fills human labels or grants production promotion', () => {
    const f = fundedReport(), before = JSON.stringify(f.report);
    expect(automatedAcceptance(f.report, f.independent, f.owner, 'm1')).toMatchObject({ accepted: true, humanPreference: 'not_observed', currencyCost: 'unavailable' });
    expect(JSON.stringify(f.report)).toBe(before);
    expect(promotionDecision(f.report).eligible).toBe(false);
    expect(f.report.pairs.every(p => p.human === null)).toBe(true);
});

test('new report consumers reject legacy source independence and cannot silently omit required quality grades', () => {
    const f = fundedReport(); f.report.schemaVersion = 2;
    f.report.quality = qualityEnvelope('rp', selectCases({ purpose: 'evaluation', split: 'promotion' }).filter(c => c.entrance === 'rp'), 'promotion');
    expect(automatedAcceptance(f.report, f.independent, f.owner, 'm1').reasons).toContain('source_unready');
    delete f.report.pairs[0].judge.deltas.player_agency;
    expect(automatedAcceptance(f.report, f.independent, f.owner, 'm1').reasons).toContain('quality_ungraded_or_changed');
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
test('explicit advisory acceptance reports resource overages while preserving funding and quality gates', () => {
    const f = fundedReport(); f.owner.breached = true;
    const charge = f.report.pairs[0].candidate.charges[0], paid = f.owner.attempts.find(a => a.id === charge.id);
    charge.tokens = paid.tokens = 20; charge.usage.totalTokens = paid.usage.totalTokens = 20;
    const p = f.report.pairs[0], { pairHash: _old, ...identity } = p; p.pairHash = hash(identity); f.independent[0].pairHash = p.pairHash;
    expect(automatedAcceptance(f.report, f.independent, f.owner, 'm1', { tokensAdvisory: true })).toMatchObject({ accepted: true,
        resourceWarnings: ['advisory_breach', 'candidate_tokens_increased'], productionPromotion: 'ineligible_without_original_gate' });
    f.independent[0].preference = 'baseline';
    expect(automatedAcceptance(f.report, f.independent, f.owner, 'm1', { tokensAdvisory: true }).accepted).toBe(false);
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
