import { expect, test } from '@jest/globals';
import { selectCases, publicCaseScenario, hash, PILOT_CASE_SET_REVISION, RENEWAL_PILOT_CASE_SET_REVISION } from '../../src/native/agent-intelligence/evaluation/cases.js';
import { qualityEnvelope } from '../../src/native/agent-intelligence/evaluation/quality.js';
import { evolutionEvaluatorRevision, promotionDecision } from '../../src/native/agent-intelligence/evolution-evaluator.js';
import { validateF3Baseline, validateF3Calibration, pilotDevelopmentReadiness, f3GradeMessages, f3SharedEvidence, prepareF3Investigation,
    f3CalibrationMessages, validF3Control, f3ExtractionInput, reusableF3Calibration, gradeF3Report, f3JudgeLabels,
    parseF3Grade, f3DevelopmentFeedback, f3ComparisonControls } from './m1-f3.js';
import { sendM1Evaluation } from './m1-grader.js';
import { evolutionFixture, runEvolution } from './evolution-fixture.js';
import { continueF3Promotion, f3ReportForStorage, readF3StoredReport } from './m1-f3-promotion.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';

const assessments = dimensions => Object.fromEntries(dimensions.map(d => [d, Object.fromEntries(['left', 'right'].map(side =>
    [side, { status: 'met', quote: null, reason: 'Observed complete behavior.' }]))]));

function example(domain = 'rp', caseSetRevision = PILOT_CASE_SET_REVISION) {
    const config = { identity: 'original' }, settings = { identity: 'baseline' }, candidateConfig = { identity: 'candidate' }, candidateSettings = { identity: 'candidate-settings' };
    const cases = selectCases({ purpose: 'evaluation', split: 'development', profileId: domain === 'rp' ? 'rp.m1.information' : 'project.m1.related', caseSetRevision });
    const ledger = { entries: {} }, owner = { attempts: [] }, independent = [];
    const charge = (id, trialId, kind) => ({ id, trialId, kind, requestHash: hash([id, 'request']), snapshotHash: hash([id, 'snapshot']),
        status: 'reported', tokens: 100, usage: { totalTokens: 100 }, cost: null });
    const baseline = { origin: 'host_source_probe', domain, caseSetRevision, evaluatorRevision: 'historical-revision',
        configurations: { baseline: hash(config) }, settings: { baseline: hash(settings) }, charges: [], pairs: [] };
    const report = { schemaVersion: 2, origin: 'm1_f3_development', domain, evaluatorRevision: evolutionEvaluatorRevision(),
        caseSetRevision, quality: qualityEnvelope(domain, cases, 'development'),
        configurations: { baseline: hash(config), candidate: hash(candidateConfig) }, settings: { baseline: hash(settings), candidate: hash(candidateSettings) }, charges: [], pairs: [] };
    for (const [i, entry] of cases.entries()) {
        const oldCharge = charge('old-' + i, 'old-trial-' + i, 'baseline');
        baseline.charges.push(oldCharge); ledger.entries[oldCharge.id] = { trialId: oldCharge.trialId, tokens: 100, settled: true };
        const trial = { trialId: oldCharge.trialId, configurationHash: hash(config), settingsHash: hash(settings),
            output: domain === 'project' ? JSON.stringify({ status: 'review', conversation: [], tools: [] }) : 'Actual bounded output', error: null,
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
    report.gradeProtocolHash = hash(f3GradeMessages(report.pairs[0], false)[0].content);
    report.comparisonCalibration = ['known_violation', 'counterfactual', 'missing_evidence', 'focused_source'].flatMap(group => [false, true].flatMap(flipped => ['primary', 'secondary'].map(label => {
        const id = [group, flipped, label].join(':'), receipt = charge(id, 'calibration:' + id, 'judge');
        owner.attempts.push({ ...receipt, jobId: 'calibration' });
        return { group, flipped, label, passed: true, jobId: 'calibration', charge: receipt };
    })));
    return { baseline, report, ledger, owner, independent, config, settings };
}
const readiness = f => pilotDevelopmentReadiness(f.report, f.independent, f.owner, 'job', f.baseline, f.ledger);
const rehash = pair => { delete pair.pairHash; pair.pairHash = hash(pair); };

test.each(['rp-skill', 'project-prompt'])('separate %s promotion preserves archived development and its funded identities', async kind => {
    const f = await evolutionFixture(makeTempFsEngineHarness, kind, { policyMode: 'review' });
    try {
        const original = await runEvolution(f), domain = kind === 'rp-skill' ? 'rp' : 'project', data = example(domain);
        const baselineSettings = await f.service.targets.evaluationSettings(f.h.handle, f.scope, f.subject, f.target);
        const settings = await f.service.targets.evaluationSettings(f.h.handle, f.scope, f.subject, f.target, original.candidate.candidateId);
        const primaryConfig = await f.evaluator.configuration(f.h.handle, f.route.runtimeRouteId);
        const candidateConfig = await f.evaluator.configuration(f.h.handle, f.route.runtimeRouteId, settings.projectPromptRef || null);
        data.baseline.configurations.baseline = hash(primaryConfig); data.baseline.settings.baseline = hash(baselineSettings);
        for (const pair of data.baseline.pairs) { pair.baseline.configurationHash = hash(primaryConfig); pair.baseline.settingsHash = hash(baselineSettings); rehash(pair); }
        const report = data.report;
        report.judgeMode = 'primary_only'; report.configurations = { baseline: hash(primaryConfig), candidate: hash(candidateConfig) };
        report.settings = { baseline: hash(baselineSettings), candidate: hash(settings) }; report.baselineReuse.reportHash = hash(data.baseline);
        report.comparisonCalibration = report.comparisonCalibration.filter(row => row.label === 'primary');
        report.syntheticFullHistory = 'complete development record '.repeat(50000);
        for (const pair of report.pairs) { pair.candidate.configurationHash = hash(candidateConfig); pair.candidate.settingsHash = hash(settings); rehash(pair); }
        const attempts = data.owner.attempts.filter(a => a.jobId === 'job' || report.comparisonCalibration.some(c => c.charge.id === a.id))
            .map(a => ({ ...a, jobId: a.jobId === 'job' ? original.job.id : a.jobId, scopeId: original.doc.scopeId, upperBound: a.tokens, createdAt: Date.now() }));
        await f.repository.mutateOwner(f.h.handle, owner => { owner.attempts.push(...attempts); });
        const stored = f3ReportForStorage(report);
        await f.repository.mutate(f.h.handle, f.scope, f.subject, doc => { doc.jobs.find(j => j.id === original.job.id).candidates[0].report = stored; });
        const doc = await f.repository.get(f.h.handle, f.scope, f.subject), job = doc.jobs.find(j => j.id === original.job.id);
        const result = { doc, job, candidate: job.candidates[0] }, ownerBefore = await f.repository.owner(f.h.handle);
        let promotionJob;
        f.evaluator.observePairs = async (_handle, currentJob, _configs, _settings, _signal, fresh) => {
            await fresh(); promotionJob = currentJob; throw new Error('synthetic_before_sealed_worker');
        };
        const entry = {};
        await expect(continueF3Promotion({ f, kind, result, source: { report: data.baseline },
            scope: { judgeMode: 'primary_only', separatePromotionJob: true, frozenCandidateHash: hash(result.candidate.diff.after) },
            entry, store: () => {}, signal: AbortSignal.timeout(15000), ledger: () => data.ledger,
            sealedDirectory: 'synthetic_no_contents_read', primaryConfig })).rejects.toThrow('synthetic_before_sealed_worker');
        expect(entry.developmentReadiness.accepted).toBe(true);
        expect(promotionJob.id).not.toBe(job.id);
        expect(await f.repository.owner(f.h.handle)).toEqual(ownerBefore);
        const final = await f.repository.get(f.h.handle, f.scope, f.subject);
        expect(final.publications).toEqual([]);
        for (const id of [job.id, promotionJob.id]) {
            const saved = final.jobs.find(j => j.id === id).candidates[0];
            expect(saved.candidateId).toBe(result.candidate.candidateId);
            expect(readF3StoredReport(saved.report)).toEqual(report);
        }
    } finally { f.h.cleanup(); }
});

test.each(['rp', 'project'])('renewal %s development retains the original threshold and rejects historical baseline substitution', domain => {
    const f = example(domain, RENEWAL_PILOT_CASE_SET_REVISION);
    expect(readiness(f)).toMatchObject({ accepted: true, wins: 2 });
    expect(validateF3Baseline(f.baseline, domain, f.config, f.settings, f.ledger)).toBe(f.baseline);
    const historical = example(domain);
    f.baseline = historical.baseline; f.report.baselineReuse.reportHash = hash(f.baseline);
    expect(readiness(f).reasons).toContain('evaluation_identity_changed');
});

test.each(['rp-skill', 'project-prompt'])('F3 %s private investigation withdraws proxy feedback while production start stays rejected', async kind => {
    const f = await evolutionFixture(makeTempFsEngineHarness, kind, { policyMode: 'review', confirmedPrice: null });
    try {
        const capture = await f.service.targets.capture(f.h.handle, f.scope, f.subject, f.target);
        const before = await f.repository.get(f.h.handle, f.scope, f.subject);
        await expect(prepareF3Investigation(f, '0'.repeat(64))).rejects.toThrow('f3_investigation_policy_changed');
        expect(await f.repository.get(f.h.handle, f.scope, f.subject)).toEqual(before);
        await prepareF3Investigation(f, hash(capture));
        const doc = await f.repository.get(f.h.handle, f.scope, f.subject);
        expect(doc.policy.fingerprint).toBe(before.policy.fingerprint);
        expect(doc.policy.reason).toBe('m1_private_investigation');
        const view = await f.service.experience.inspect(f.h.handle, { scope: f.scope, subject: f.subject });
        expect(view.feedback.some(row => row.kind === 'explicit' && row.status === 'active')).toBe(false);
        await expect(f.service.configure(f.h.handle, { scope: f.scope, subject: f.subject, target: f.target, mode: 'review',
            routeId: f.route.runtimeRouteId, price: null, expectedSequence: doc.sequence }))
            .rejects.toMatchObject({ code: 'agent_evolution_source_required' });
        await expect(f.service.start(f.h.handle, { scope: f.scope, subject: f.subject, expectedSequence: doc.sequence }))
            .rejects.toMatchObject({ code: 'agent_evolution_reflection_not_ready' });
        expect((await f.repository.get(f.h.handle, f.scope, f.subject)).jobs).toHaveLength(0);
        expect((await f.repository.owner(f.h.handle)).attempts).toHaveLength(0);
    } finally { await f.h.cleanup(); }
});

test('legacy dual F3 source gate rejects primary-only observations and missing calibration controls', () => {
    const config = { model: { remoteModelId: 'primary' } }, secondary = { model: { remoteModelId: 'secondary' } };
    const source = { entry: { judgeMode: 'primary_only', status: 'f2_sources_observed', baselineHeadroom: 'primary_observed_gap' } };
    expect(() => validateF3Calibration(source, {}, {}, 'rp-skill', config, secondary)).toThrow('f3_source_unready');
    source.entry = { ...source.entry, judgeMode: 'dual', baselineHeadroom: 'observed_gap' };
    const controls = { origin: 'engineering_control', controls: [], sourceControls: [] };
    expect(() => validateF3Calibration(source, { controlHash: hash(controls) }, controls, 'rp-skill', config, secondary)).toThrow('f3_source_unready');
});

test.each(['rp', 'project'])('primary-only %s development qualifies without second-model receipts and retains negative/invalid rejection', domain => {
    const f = example(domain); f.report.judgeMode = 'primary_only'; f.independent = [];
    f.report.comparisonCalibration = f.report.comparisonCalibration.filter(c => c.label === 'primary');
    expect(readiness(f)).toMatchObject({ accepted: true, wins: 2, judgeMode: 'primary_only' });
    f.report.pairs[0].judge.deltas[f.report.pairs[0].case.behaviorDimensions[0]] = -1;
    rehash(f.report.pairs[0]); expect(readiness(f).reasons).toContain('behavior_regression_or_ungraded');
    f.report.pairs[0].judge.preference = 'uncertain';
    rehash(f.report.pairs[0]); expect(readiness(f).accepted).toBe(false);
});

test('primary-only F3 grading sends only to the primary model without a secondary configuration', async () => {
    const observed = [], fixture = example();
    const f = await evolutionFixture(makeTempFsEngineHarness, 'rp-skill', { policyMode: 'review', confirmedPrice: null, fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body); observed.push(body.model);
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message: { content: JSON.stringify({
            preference: 'tie', assessments: assessments(fixture.report.pairs[0].case.behaviorDimensions), deltas: Object.fromEntries(fixture.report.pairs[0].case.behaviorDimensions.map(d => [d, 0])), rationale: 'Synthetic primary observation.' }) } }],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 } }) };
    } });
    try {
        const primaryConfig = await f.evaluator.configuration(f.h.handle, f.route.runtimeRouteId);
        f.evaluator.send = (handle, job, config, payload, signal, fresh) => sendM1Evaluation(f.evaluator, handle,
            { ...job, m1Envelope: 'm1-configured-output-v1' }, config, payload, signal, fresh);
        const doc = await f.repository.get(f.h.handle, f.scope, f.subject);
        const independent = await gradeF3Report({ f, kind: 'rp-skill', report: fixture.report, primaryConfig, secondaryConfig: null,
            scope: { judgeMode: 'primary_only', judgeOutputTokens: 1024 }, entry: { candidateValueHash: hash('synthetic') },
            paidJob: { id: 'synthetic-primary-only', scopeId: doc.scopeId, domain: 'rp', price: null }, fresh: async () => {},
            signal: AbortSignal.timeout(15000), store: () => {}, phase: 'development' });
        expect(independent).toEqual([]); expect(observed).toEqual(Array(3).fill(primaryConfig.model.remoteModelId));
        expect(fixture.report.pairs.every(p => p.judge.preference === 'tie' && p.judge.chargeIds.length === 1)).toBe(true);
        expect(f3JudgeLabels('primary_only')).toEqual(['primary']);
        expect(() => f3JudgeLabels('unknown')).toThrow('invalid_f3_judge_mode');
    } finally { await f.h.cleanup(); }
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

test('F2 qualification cannot substitute for the exact F3 protocol calibration', () => {
    const f = example(); delete f.report.comparisonCalibration;
    expect(readiness(f).reasons).toContain('comparison_protocol_uncalibrated');
    const other = example(); other.report.gradeProtocolHash = hash('F2 prompt');
    expect(readiness(other).reasons).toContain('comparison_protocol_uncalibrated');
    other.report.gradeProtocolHash = hash(f3GradeMessages(other.report.pairs[0], false)[0].content);
    other.report.comparisonCalibration[0].charge.snapshotHash = hash('unfunded');
    expect(readiness(other).reasons).toContain('comparison_protocol_uncalibrated');
});

test.each(['rp', 'project'])('F3 %s controls use the actual grading prompt and preserve counterfactual evidence', domain => {
    const f = example(domain), pair = f.report.pairs[0];
    const left = domain === 'rp' ? 'NPC retains uncertainty.' : JSON.stringify({ status: 'review', conversation: [{ content: 'Uncommitted, awaiting human Review.' }] });
    const right = domain === 'rp' ? 'NPC invents a penalty.' : JSON.stringify({ status: 'review', conversation: [] });
    const scenario = { ...pair.scenario, input: 'Counterfactual input', rubric: { knowledge_boundary: 'Counterfactual exposed requirement' } };
    const control = { caseId: pair.case.caseId, messages: [{ role: 'user', content: JSON.stringify({ ...scenario, dimensions: pair.case.behaviorDimensions, left, right }) }] };
    const msgs = f3CalibrationMessages(control, pair.case), actual = f3GradeMessages(pair, false);
    expect(msgs[0]).toEqual(actual[0]);
    const content = JSON.parse(msgs[1].content);
    expect(content.input).toBe('Counterfactual input'); expect(content.rubric).toEqual(scenario.rubric);
    const expand = v => v && typeof v === 'object' && v.$f3ref ? expand(content.sharedEvidence[v.$f3ref])
        : Array.isArray(v) ? v.map(expand) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, expand(x)])) : v;
    const observed = domain === 'rp' ? [expand(content.left).output, expand(content.right).output]
        : [expand(content.left).modelStatements, expand(content.right).modelStatements];
    const expected = domain === 'rp' ? [left, right] : [[{ origin: 'conversation.0.content', text: 'Uncommitted, awaiting human Review.' }], []];
    expect(observed).toEqual(expected);
});

test('F3 control contract retains unknown and rejects swapped delta signs or overlong rationale', () => {
    const entry = example().report.pairs[0].case;
    const grade = { preference: 'right', assessments: assessments(entry.behaviorDimensions), deltas: Object.fromEntries(entry.behaviorDimensions.map(d => [d, 1])), rationale: 'Observed.' };
    const control = { expected: 'right', flipped: false, requiredPositiveDimensions: ['knowledge_boundary'] };
    expect(validF3Control(JSON.stringify(grade), control, entry)).toBe(true);
    grade.deltas.knowledge_boundary = -1;
    expect(validF3Control(JSON.stringify(grade), control, entry)).toBe(false);
    expect(validF3Control(JSON.stringify({ preference: 'uncertain', deltas: {}, rationale: 'Evidence unavailable.' }), { expected: 'uncertain' }, entry)).toBe(true);
    expect(validF3Control(JSON.stringify({ ...grade, rationale: 'x'.repeat(513) }), control, entry)).toBe(false);
});

test('Project missing evidence remains unavailable under the F3 codec', () => {
    const entry = example('project').report.pairs[0].case;
    const messages = f3CalibrationMessages({ caseId: entry.caseId, messages: [{ role: 'user', content: JSON.stringify({ dimensions: entry.behaviorDimensions, left: 'Complete.', right: 'Done.' }) }] }, entry);
    const arms = JSON.parse(messages[1].content);
    expect(arms.left.modelStatements).toBeNull(); expect(arms.right.modelStatements).toBeNull();
});

test('Project counterfactual wrapper retains actual Task facts and its public statement', () => {
    const entry = example('project').report.pairs[0].case;
    const output = JSON.stringify({ observedAuthority: { status: 'review', validation: { status: 'passed' },
        conversation: [], priorConflictTask: { status: 'conflict' } }, engineeringControlStatement: 'Inspected without new edits; Review is uncommitted.' });
    const body = JSON.parse(f3CalibrationMessages({ caseId: entry.caseId, messages: [{ role: 'user', content:
        JSON.stringify({ dimensions: entry.behaviorDimensions, left: 'Complete.', right: output }) }] }, entry)[1].content);
    expect(body.right.facts).toContain('Fresh Task status: review');
    expect(body.right.facts).toContain('Prior Task status: conflict');
    const statement = body.right.modelStatements[0];
    expect(statement.origin).toBe('engineeringControlStatement');
    expect(body.sharedEvidence[statement.text.$f3ref]).toBe('Inspected without new edits; Review is uncommitted.');
});

test.each([false, true])('F3 rejects a winning-margin sign contradiction without repairing scores (flip=%s)', flipped => {
    const pair = example().report.pairs[0];
    const raw = { preference: 'left', assessments: assessments(pair.case.behaviorDimensions), deltas: Object.fromEntries(pair.case.behaviorDimensions.map(d => [d, 1])), rationale: 'Left is better.' };
    expect(() => parseF3Grade(JSON.stringify(raw), pair, flipped)).toThrow('contradictory_f3_grade');
    raw.deltas.knowledge_boundary = -1;
    expect(parseF3Grade(JSON.stringify(raw), pair, flipped).preference).toBe(flipped ? 'candidate' : 'baseline');
});

test('F3 requires every arm assessment and rejects a delta that hides a concrete gap', () => {
    const pair = example().report.pairs[0], dimensions = pair.case.behaviorDimensions;
    const raw = { preference: 'right', assessments: assessments(dimensions),
        deltas: Object.fromEntries(dimensions.map(d => [d, d === 'actor_voice' ? 1 : 0])), rationale: 'Right is more expressive.' };
    raw.assessments.knowledge_boundary.left.status = 'gap';
    expect(() => parseF3Grade(JSON.stringify(raw), pair, false)).toThrow('contradictory_f3_assessment');
    raw.deltas.knowledge_boundary = 1;
    expect(parseF3Grade(JSON.stringify(raw), pair, false).preference).toBe('candidate');
    raw.assessments.knowledge_boundary.left.quote = 'A fabricated quotation';
    expect(() => parseF3Grade(JSON.stringify(raw), pair, false, f3GradeMessages(pair, false))).toThrow('ungrounded_f3_assessment');
    raw.assessments.knowledge_boundary.left.quote = null;
    expect(parseF3Grade(JSON.stringify(raw), pair, true).assessments.knowledge_boundary.candidate.status).toBe('gap');
    delete raw.assessments.continuity;
    expect(() => parseF3Grade(JSON.stringify(raw), pair, false)).toThrow('incomplete_f3_assessment');
});

test('F3 accepts an exact structural JSON quotation without accepting invented keys', () => {
    const pair = example('project').report.pairs[0], dimensions = pair.case.behaviorDimensions;
    const raw = { preference: 'tie', assessments: assessments(dimensions),
        deltas: Object.fromEntries(dimensions.map(d => [d, 0])), rationale: 'Both observed.' };
    const messages = f3GradeMessages(pair, false);
    raw.assessments.status_accuracy.left.quote = '"status":"review"';
    expect(parseF3Grade(JSON.stringify(raw), pair, false, messages).preference).toBe('tie');
    raw.assessments.status_accuracy.left.quote = '"status":"committed"';
    expect(() => parseF3Grade(JSON.stringify(raw), pair, false, messages)).toThrow('ungrounded_f3_assessment');
});

test('prior development feedback is pinned and cannot silently replace original observations', () => {
    const f = example(), candidate = { valueHash: hash('value'), candidate: { diff: { before: 'Original', after: 'Prior edit' } } };
    const prior = { report: f.report, candidate }, expected = { reportHash: hash(f.report), candidateHash: hash(candidate), valueHash: candidate.valueHash };
    expect(f3DevelopmentFeedback(prior, expected).observations).toHaveLength(3);
    prior.report.pairs[0].judge.rationale = 'Changed evidence';
    expect(() => f3DevelopmentFeedback(prior, expected)).toThrow('f3_development_feedback_changed');
});

test('extraction receives available communication slots without inventing feedback or publishing rights', () => {
    const capture = { field: 'body', body: 'Original style', declaration: { allowedFields: ['body'] } };
    const input = f3ExtractionInput(capture, 'project', { origin: 'test_only_investigation' });
    expect(input.feedback).toEqual([]); expect(input.diagnosis).toBeNull(); expect(input.base).toBe(capture.body);
    expect(input.executionAffordances).toContain('no post-Review');
    expect(input.executionAffordances).toContain('set_plan');
    expect(input.executionAffordances).toContain('do not claim validation passed');
    expect(input.instruction).toContain('before must be empty');
    expect(input.instruction).toContain('Never set before equal to the complete base');
    expect(f3ExtractionInput(capture, 'rp', {}).requiredBehavior).toContain('unknown current/private facts');
});

test.each(['rp', 'project'])('F3 %s calibration must detect a focused source violation in either arm', domain => {
    const entry = example(domain).report.pairs[0].case;
    const dimension = domain === 'rp' ? 'knowledge_boundary' : 'status_accuracy';
    const sourceControls = ['positive', domain === 'rp' ? 'unsupported_rule' : 'communication_omission'].map((group, index) => ({
        group, pair: { case: entry, baseline: { output: index ? 'Focused violation.' : 'Supported behavior.' } },
        expected: { [dimension]: index ? 'gap' : 'met' },
    }));
    const controls = f3ComparisonControls({ controls: [], sourceControls }, domain);
    expect(controls.map(c => c.expected)).toEqual(['right', 'left']);
    expect(controls.every(c => c.requiredPositiveDimensions.includes(dimension))).toBe(true);
    const report = example(domain).report;
    report.comparisonCalibration = report.comparisonCalibration.filter(c => c.group !== 'focused_source');
    expect(readiness({ ...example(domain), report }).reasons).toContain('comparison_protocol_uncalibrated');
});

test('exact F3 calibration reuse requires unchanged messages, transport and original settled receipts', () => {
    const f = example(), pair = f.report.pairs[0], transport = { identity: 'actual-transport' };
    const control = { group: 'known_violation', flipped: false, caseId: pair.case.caseId, messages: [{ role: 'user', content:
        JSON.stringify({ ...pair.scenario, dimensions: pair.case.behaviorDimensions, left: 'Unexposed penalty.', right: 'An NPC offers a choice.' }) }] };
    const row = { ...f.report.comparisonCalibration[0], messagesHash: hash(f3CalibrationMessages(control, pair.case)), configurationHash: hash(transport) };
    f.ledger.entries[row.charge.id] = { settled: true, tokens: row.charge.tokens, trialId: row.charge.trialId };
    const reuse = (config = transport) => reusableF3Calibration(row, control, pair.case, 'primary', config, f.owner, f.ledger);
    expect(reuse()).toBe(true); expect(reuse({ identity: 'changed' })).toBe(false);
    f.ledger.entries[row.charge.id].settled = false; expect(reuse()).toBe(false);
    f.ledger.entries[row.charge.id].settled = true; row.messagesHash = hash('F2 protocol'); expect(reuse()).toBe(false);
});

test('sealed pair grading consumes worker scenario without opening independent sources again', () => {
    const f = example(), entry = selectCases({ purpose: 'evaluation', split: 'promotion', profileId: 'rp.m1.information' })[0];
    const pair = { ...f.report.pairs[0], case: entry, scenario: { input: 'Synthetic worker scenario control', rubric: {} } };
    const body = JSON.parse(f3GradeMessages(pair, false)[1].content);
    expect(body.input).toBe(pair.scenario.input); expect(body.dimensions).toEqual(entry.behaviorDimensions);
});
