import { expect, test, jest } from '@jest/globals';
import * as originalCases from '../../src/native/agent-intelligence/evaluation/cases.js';
// Gate-unit controls use an explicit mock catalogue. No independent fixture
// content is read, generated, graded or claimed as empirical acceptance here.
const input = 'Synthetic engineering control input';
jest.unstable_mockModule('../../src/native/agent-intelligence/evaluation/cases.js', () => ({ ...originalCases,
    selectCases: options => originalCases.selectCases(options).map(c => options.split === 'promotion' ? { ...c, inputHash: originalCases.hash(input) } : c) }));
const { pilotPromotionAcceptance } = await import('./m1-f3-promotion.js');
const { f3GradeMessages } = await import('./m1-f3.js');
const { evolutionEvaluatorRevision, promotionDecision } = await import('../../src/native/agent-intelligence/evolution-evaluator.js');
const { qualityEnvelope } = await import('../../src/native/agent-intelligence/evaluation/quality.js');
const { selectCases, hash, PILOT_CASE_SET_REVISION, RENEWAL_PILOT_CASE_SET_REVISION } = await import('../../src/native/agent-intelligence/evaluation/cases.js');

function fixture(domain = 'rp', caseSetRevision = PILOT_CASE_SET_REVISION) {
    const cases = selectCases({ purpose: 'evaluation', split: 'promotion', profileId: domain === 'rp' ? 'rp.m1.information' : 'project.m1.related', caseSetRevision });
    const owner = { attempts: [] }, independent = [];
    const report = { origin: 'm1_f3_promotion', domain, evaluatorRevision: evolutionEvaluatorRevision(), caseSetRevision,
        quality: qualityEnvelope(domain, cases, 'promotion'), configurations: { baseline: 'base', candidate: 'candidate' },
        settings: { baseline: 'base-settings', candidate: 'candidate-settings' }, comparisonCalibration: [], pairs: [], charges: [] };
    const receipt = (id, trialId, kind, jobId) => {
        const c = { id, trialId, kind, requestHash: hash([id, 'request']), snapshotHash: hash([id, 'snapshot']), tokens: 10,
            status: 'reported', usage: { totalTokens: 10 }, cost: null };
        owner.attempts.push({ ...c, jobId }); return c;
    };
    for (const group of ['known_violation', 'counterfactual', 'missing_evidence', 'focused_source']) for (const flipped of [false, true]) for (const label of ['primary', 'secondary']) {
        const id = group + flipped + label;
        report.comparisonCalibration.push({ group, flipped, label, jobId: 'control', passed: true, charge: receipt(id, 'control:' + id, 'judge', 'control') });
    }
    for (const entry of cases) for (const repetition of [1, 2, 3]) {
        const slot = entry.caseId + repetition;
        const preference = report.pairs.length < 6 ? 'candidate' : 'tie';
        const grade = { preference, deltas: Object.fromEntries(entry.behaviorDimensions.map(d => [d, preference === 'candidate' ? 1 : 0])), rationale: 'Engineering control.' };
        const pair = { case: entry, scenario: { input }, repetition, human: null };
        for (const arm of ['baseline', 'candidate']) {
            const charge = receipt(slot + arm, slot + ':' + arm, arm, 'job'); report.charges.push(charge);
            pair[arm] = { trialId: charge.trialId, configurationHash: report.configurations[arm], settingsHash: report.settings[arm],
                output: domain === 'rp' ? 'Synthetic control response' : JSON.stringify({ conversation: [], status: 'review', tools: [] }),
                error: null, requestHashes: [charge.requestHash], charges: [charge], checks: Object.fromEntries([...entry.expectedInvariants, 'isolation', 'target_consumed'].map(k => [k, true])) };
        }
        const judge = receipt(slot + 'judge', slot + ':judge', 'judge', 'job'); report.charges.push(judge);
        pair.judge = { ...grade, chargeIds: [judge.id] }; pair.pairHash = hash(pair); report.pairs.push(pair);
        const second = receipt(slot + 'second', slot + ':second', 'judge', 'job:independent');
        independent.push({ ...grade, origin: 'independent_model', pairHash: pair.pairHash, model: 'secondary', primaryModel: 'primary',
            chargeId: second.id, requestHash: second.requestHash, snapshotHash: second.snapshotHash });
    }
    report.gradeProtocolHash = hash(f3GradeMessages(report.pairs[0], false)[0].content);
    return { report, independent, owner };
}
const check = f => pilotPromotionAcceptance(f.report, f.independent, f.owner, 'job');
const rehash = f => { for (let i = 0; i < f.report.pairs.length; i++) {
    const p = f.report.pairs[i]; delete p.pairHash; p.pairHash = hash(p); if (f.independent[i]) f.independent[i].pairHash = p.pairHash;
} };

test.each(['rp', 'project'])('renewal %s promotion retains six wins and rejects historical case substitution', domain => {
    const f = fixture(domain, RENEWAL_PILOT_CASE_SET_REVISION); f.report.judgeMode = 'primary_only'; f.independent = [];
    f.report.comparisonCalibration = f.report.comparisonCalibration.filter(c => c.label === 'primary');
    expect(check(f)).toMatchObject({ accepted: true, wins: 6 });
    f.report.pairs[0].case = fixture(domain).report.pairs[0].case; rehash(f);
    expect(check(f).reasons).toContain('independent_cases_incomplete');
});

test.each(['rp', 'project'])('primary-only %s promotion requires six primary wins without a second model', domain => {
    const f = fixture(domain); f.report.judgeMode = 'primary_only'; f.independent = [];
    f.report.comparisonCalibration = f.report.comparisonCalibration.filter(c => c.label === 'primary');
    expect(check(f)).toMatchObject({ accepted: true, wins: 6, judgeMode: 'primary_only' });
    expect(promotionDecision(f.report).eligible).toBe(false);
    f.report.pairs[0].judge.preference = 'tie'; rehash(f);
    expect(check(f).reasons).toContain('improvement_threshold_not_met');
});

test.each(['rp', 'project'])('synthetic %s promotion controls require six unanimous wins and never grant production eligibility', domain => {
    const f = fixture(domain);
    expect(check(f)).toMatchObject({ accepted: true, wins: 6, humanPreference: 'not_observed' });
    expect(promotionDecision(f.report).eligible).toBe(false);
});

test.each(['one_missing_pair', 'five_wins', 'disagreement', 'negative_delta', 'invalid', 'same_model', 'duplicate_trial', 'configuration_drift'])('promotion rejects %s', failure => {
    const f = fixture();
    if (failure === 'one_missing_pair') f.report.pairs.pop();
    if (failure === 'five_wins') { f.report.pairs[0].judge.preference = 'tie'; f.independent[0].preference = 'tie'; }
    if (failure === 'disagreement') f.independent[0].preference = 'baseline';
    if (failure === 'negative_delta') f.independent[0].deltas.knowledge_boundary = -1;
    if (failure === 'invalid') { f.independent[0].preference = 'uncertain'; f.independent[0].deltas = {}; }
    if (failure === 'same_model') f.independent[0].model = f.independent[0].primaryModel;
    if (failure === 'duplicate_trial') f.report.pairs[1].baseline.trialId = f.report.pairs[0].baseline.trialId;
    if (failure === 'configuration_drift') f.report.pairs[0].candidate.settingsHash = 'other-settings';
    rehash(f); expect(check(f).accepted).toBe(false);
});

test('promotion retains unknown retry usage and rejects an omitted funded trial send', () => {
    const f = fixture(), paid = { ...f.owner.attempts.find(a => a.kind === 'candidate'), id: 'failed-retry', status: 'unknown', usage: null, tokens: 500 };
    f.owner.attempts.push(paid);
    expect(check(f).reasons).toContain('trial_send_accounting_incomplete');
    const { jobId: _jobId, ...charge } = paid;
    f.report.charges.push(charge); f.report.pairs[0].candidate.charges.push(charge); rehash(f);
    expect(check(f).accepted).toBe(true);
});
