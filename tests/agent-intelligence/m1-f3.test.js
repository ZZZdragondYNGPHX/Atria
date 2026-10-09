import { expect, test } from '@jest/globals';
import { selectCases, publicCaseScenario, hash, PILOT_CASE_SET_REVISION } from '../../src/native/agent-intelligence/evaluation/cases.js';
import { qualityEnvelope } from '../../src/native/agent-intelligence/evaluation/quality.js';
import { evolutionEvaluatorRevision, promotionDecision } from '../../src/native/agent-intelligence/evolution-evaluator.js';
import { validateF3Baseline, validateF3Calibration, pilotDevelopmentReadiness, f3GradeMessages, f3SharedEvidence } from './m1-f3.js';

function example(domain = 'rp') {
    const config = { identity: 'original' }, settings = { identity: 'baseline' }, candidateConfig = { identity: 'candidate' }, candidateSettings = { identity: 'candidate-settings' };
    const cases = selectCases({ purpose: 'evaluation', split: 'development', profileId: domain === 'rp' ? 'rp.m1.information' : 'project.m1.related' });
    const ledger = { entries: {} }, owner = { attempts: [] }, independent = [];
    const charge = (id, trialId, kind) => ({ id, trialId, kind, requestHash: hash([id, 'request']), snapshotHash: hash([id, 'snapshot']),
        status: 'reported', tokens: 100, usage: { totalTokens: 100 }, cost: null });
    const baseline = { origin: 'host_source_probe', domain, caseSetRevision: PILOT_CASE_SET_REVISION, evaluatorRevision: 'historical-revision',
        configurations: { baseline: hash(config) }, settings: { baseline: hash(settings) }, charges: [], pairs: [] };
    const report = { schemaVersion: 2, origin: 'm1_f3_development', domain, evaluatorRevision: evolutionEvaluatorRevision(),
        caseSetRevision: PILOT_CASE_SET_REVISION, quality: qualityEnvelope(domain, cases, 'development'),
        configurations: { baseline: hash(config), candidate: hash(candidateConfig) }, settings: { baseline: hash(settings), candidate: hash(candidateSettings) }, charges: [], pairs: [] };
    for (const [i, entry] of cases.entries()) {
        const oldCharge = charge('old-' + i, 'old-trial-' + i, 'baseline');
        baseline.charges.push(oldCharge); ledger.entries[oldCharge.id] = { trialId: oldCharge.trialId, tokens: 100, settled: true };
        const trial = { trialId: oldCharge.trialId, configurationHash: hash(config), settingsHash: hash(settings), output: 'Actual bounded output', error: null,
            checks: Object.fromEntries([...entry.expectedInvariants, 'isolation', 'target_consumed'].map(k => [k, true])), requestHashes: [oldCharge.requestHash], charges: [oldCharge] };
        const oldPair = { case: entry, scenario: publicCaseScenario(entry), repetition: 1, baseline: trial, candidate: null, judge: null, human: null };
        oldPair.pairHash = hash(oldPair); baseline.pairs.push(oldPair);
        const newCharge = charge('new-' + i, 'new-trial-' + i, 'candidate'), judgeCharge = charge('judge-' + i, 'judge-trial-' + i, 'judge');
        owner.attempts.push({ ...newCharge, jobId: 'job' }, { ...judgeCharge, jobId: 'job' }); report.charges.push(newCharge, judgeCharge);
        const grade = { preference: i < 2 ? 'candidate' : 'tie', deltas: Object.fromEntries(entry.behaviorDimensions.map(d => [d, i < 2 ? 1 : 0])), rationale: 'Observed.' };
        const pair = { case: entry, scenario: publicCaseScenario(entry), repetition: 1, baseline: trial,
            candidate: { ...trial, trialId: newCharge.trialId, configurationHash: hash(candidateConfig), settingsHash: hash(candidateSettings), charges: [newCharge] },
            judge: { ...grade, chargeIds: [judgeCharge.id] }, human: null };
        pair.pairHash = hash(pair); report.pairs.push(pair);
        const second = charge('second-' + i, 'second-trial-' + i, 'judge'); owner.attempts.push({ ...second, jobId: 'job:independent' });
        independent.push({ ...grade, origin: 'independent_model', pairHash: pair.pairHash, model: 'second', primaryModel: 'first',
            chargeId: second.id, requestHash: second.requestHash, snapshotHash: second.snapshotHash });
    }
    report.baselineReuse = { reportHash: hash(baseline), origin: 'cached_F2_development_observation' };
    return { baseline, report, ledger, owner, independent, config, settings };
}
const readiness = f => pilotDevelopmentReadiness(f.report, f.independent, f.owner, 'job', f.baseline, f.ledger);
const rehash = pair => { delete pair.pairHash; pair.pairHash = hash(pair); };

test('F3 source gate rejects primary-only observations and missing calibration controls', () => {
    const config = { model: { remoteModelId: 'primary' } }, secondary = { model: { remoteModelId: 'secondary' } };
    const source = { entry: { judgeMode: 'primary_only', status: 'f2_sources_observed', baselineHeadroom: 'primary_observed_gap' } };
    expect(() => validateF3Calibration(source, {}, {}, 'rp-skill', config, secondary)).toThrow('f3_dual_source_unready');
    source.entry = { ...source.entry, judgeMode: 'dual', baselineHeadroom: 'observed_gap' };
    const controls = { origin: 'engineering_control', controls: [], sourceControls: [] };
    expect(() => validateF3Calibration(source, { controlHash: hash(controls) }, controls, 'rp-skill', config, secondary)).toThrow('f3_dual_source_unready');
});

test.each(['rp', 'project'])('F3 %s reuses exact funded baseline without claiming a new send or production eligibility', domain => {
    const f = example(domain);
    expect(validateF3Baseline(f.baseline, domain, f.config, f.settings, f.ledger)).toBe(f.baseline);
    expect(readiness(f)).toMatchObject({ accepted: true, wins: 2, humanPreference: 'not_observed', baselineReuse: 'cached_F2_development_observation' });
    expect(f.owner.attempts.some(a => a.kind === 'baseline')).toBe(false);
    expect(promotionDecision(f.report).eligible).toBe(false);
});

test('F3 baseline rejects promotion substitution, duplicate cases and input/configuration drift', () => {
    const f = example();
    expect(() => validateF3Baseline(f.baseline, 'rp', {}, f.settings, f.ledger)).toThrow('f3_baseline_changed');
    const altered = structuredClone(f.baseline); altered.pairs[1] = altered.pairs[0];
    expect(() => validateF3Baseline(altered, 'rp', f.config, f.settings, f.ledger)).toThrow('f3_baseline_changed');
    altered.pairs[0].case.split = 'promotion';
    expect(() => validateF3Baseline(altered, 'rp', f.config, f.settings, f.ledger)).toThrow('f3_baseline_changed');
});

test('F3 baseline preserves original hard checks and durable settlement', () => {
    const f = example();
    f.ledger.entries['old-0'].settled = false;
    expect(() => validateF3Baseline(f.baseline, 'rp', f.config, f.settings, f.ledger)).toThrow('f3_baseline_unfunded');
    f.ledger.entries['old-0'].settled = true; f.baseline.pairs[0].baseline.checks.target_consumed = false; rehash(f.baseline.pairs[0]);
    expect(() => validateF3Baseline(f.baseline, 'rp', f.config, f.settings, f.ledger)).toThrow('f3_baseline_incomplete');
});

test('F3 rejects a rewritten cached baseline even when the new pair hash is self-consistent', () => {
    const f = example(); f.report = structuredClone(f.report); f.report.pairs[0].baseline.output = 'Rewritten favorable baseline'; rehash(f.report.pairs[0]);
    expect(readiness(f).reasons).toContain('pair_or_reused_baseline_changed');
});

test.each(['disagreement', 'negative_dimension', 'missing_judge', 'same_model', 'one_win'])('F3 preserves dual development threshold for %s', failure => {
    const f = example();
    if (failure === 'disagreement') f.independent[0].preference = 'tie';
    if (failure === 'negative_dimension') f.independent[0].deltas.knowledge_boundary = -1;
    if (failure === 'missing_judge') f.independent.pop();
    if (failure === 'same_model') f.independent[0].model = f.independent[0].primaryModel;
    if (failure === 'one_win') { f.report.pairs[1].judge.preference = 'tie'; f.independent[1].preference = 'tie'; rehash(f.report.pairs[1]); f.independent[1].pairHash = f.report.pairs[1].pairHash; }
    expect(readiness(f).accepted).toBe(false);
});

test('F3 rejects candidate charges belonging to another job or with changed receipt identity', () => {
    const f = example(); f.owner.attempts[0].jobId = 'other';
    expect(readiness(f).reasons).toContain('candidate_usage_missing');
    f.owner.attempts[0].jobId = 'job'; f.owner.attempts[0].snapshotHash = hash('changed');
    expect(readiness(f).reasons).toContain('durable_charge_mismatch');
});

test('F3 graded evidence retains public model statements separately from Host status', () => {
    const f = example('project'), pair = f.report.pairs[0];
    pair.baseline.output = JSON.stringify({ status: 'review', conversation: [{ content: 'Still uncommitted; awaiting Review.' }], tools: [] });
    pair.candidate.output = JSON.stringify({ status: 'review', conversation: [], tools: [] });
    const messages = f3GradeMessages(pair, false), content = JSON.parse(messages[1].content);
    expect(content.left.modelStatements).toContainEqual({ origin: 'conversation.0.content', text: 'Still uncommitted; awaiting Review.' });
    expect(content.right.modelStatements).toEqual([]);
    expect(JSON.parse(f3GradeMessages(pair, true)[1].content).right).toEqual(content.left);
    expect(messages[0].content).toContain('complete public windows');
});

test('F3 shared Project evidence reconstructs both complete different arms without clipping observations', () => {
    const source = { body: 'Protected original source. '.repeat(300), metadata: { preserved: true } };
    const left = { source, originalSource: source, history: [{ source, status: 'review' }], statement: 'Explanation omitted.' };
    const right = { source, originalSource: source, history: [{ source, status: 'review' }], statement: 'Explicitly uncommitted Review.' };
    const encoded = f3SharedEvidence(left, right);
    const expand = value => value && typeof value === 'object' && Object.hasOwn(value, '$f3ref') ? expand(encoded.sharedEvidence[value.$f3ref])
        : Array.isArray(value) ? value.map(expand) : value && typeof value === 'object'
            ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expand(item)])) : value;
    expect(expand(encoded.left)).toEqual(left);
    expect(expand(encoded.right)).toEqual(right);
    expect(Object.keys(encoded.sharedEvidence).length).toBeGreaterThan(0);
    expect(JSON.stringify(encoded).length).toBeLessThan(JSON.stringify({ left, right }).length / 2);
});

test('F3 evidence aliases cannot reinterpret a model-authored reference marker', () => {
    expect(() => f3SharedEvidence({ output: { $f3ref: 'untrusted' } }, {})).toThrow('f3_evidence_reference_conflict');
});
