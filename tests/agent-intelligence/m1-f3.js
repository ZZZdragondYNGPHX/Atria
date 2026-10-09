// Delegated private engineering investigation. Never registered in production.
import { randomUUID } from 'node:crypto';
import { hash, canonical, selectCases, publicCaseScenario, PILOT_CASE_SET_REVISION } from '../../src/native/agent-intelligence/evaluation/cases.js';
import { evolutionEvaluatorRevision, promotionDecision } from '../../src/native/agent-intelligence/evolution-evaluator.js';
import { qualityEnvelope } from '../../src/native/agent-intelligence/evaluation/quality.js';
import { createFrozenEvaluationBridge } from '../../src/native/agent-intelligence/evaluation/worker-bridge.js';
import { parseBlindGrade } from './m1-acceptance.js';
import { f2SourceEvidence, f2SourceMessages, parseF2SourceAssessment, reusableF2Calibration, f2JudgeTransport } from './m1-f2.js';

const profileFor = domain => domain === 'rp' ? 'rp.m1.information' : 'project.m1.related';
const equal = (a, b) => canonical(a) === canonical(b);
const paidMatches = (charge, paid) => paid && ['id', 'trialId', 'kind', 'requestHash', 'snapshotHash', 'tokens', 'status', 'usage', 'cost']
    .every(key => equal(charge[key], paid[key]));

export function validateF3Calibration(source, scope, controls, kind, primaryConfig, secondaryConfig) {
    const domain = kind === 'rp-skill' ? 'rp' : 'project', configs = { primary: primaryConfig, secondary: secondaryConfig };
    if (source.entry?.judgeMode !== 'dual' || source.entry.status !== 'f2_sources_observed' || source.entry.baselineHeadroom !== 'observed_gap'
        || controls.origin !== 'engineering_control' || controls.controls?.length !== 12 || controls.sourceControls?.length !== 8
        || hash(controls) !== scope.controlHash || primaryConfig.model.remoteModelId === secondaryConfig.model.remoteModelId) throw new Error('f3_dual_source_unready');
    const comparisons = controls.controls.filter(c => c.domain === domain), sources = controls.sourceControls.filter(c => c.pair.case.entrance === domain);
    if (comparisons.length !== 6 || new Set(comparisons.map(c => c.group + ':' + c.flipped)).size !== 6
        || ['known_violation', 'counterfactual', 'missing_evidence'].some(group => [false, true].some(flipped =>
            !comparisons.some(c => c.group === group && c.flipped === flipped)))
        || sources.length !== 4 || ['positive', 'known_violation', 'missing_evidence', domain === 'rp' ? 'unsupported_rule' : 'communication_omission']
        .some(group => !sources.some(c => c.group === group))) throw new Error('f3_calibration_changed');
    for (const control of controls.controls.filter(c => c.domain === domain)) for (const label of ['primary', 'secondary']) {
        if (!source.entry.calibration.some(row => reusableF2Calibration(row, control, label, configs[label], scope.judgeOutputTokens,
            scope.judgeReasoningEffort?.[label] ?? null))) throw new Error('f3_calibration_changed');
    }
    for (const control of controls.sourceControls.filter(c => c.pair.case.entrance === domain)) for (const label of ['primary', 'secondary']) {
        const messagesHash = hash(f2SourceMessages(control.pair)), transportHash = hash(f2JudgeTransport(configs[label], scope.judgeOutputTokens,
            scope.judgeReasoningEffort?.[label] ?? null));
        if (!source.entry.sourceCalibration.some(row => row.label === label && row.group === control.group && row.passed === true
            && row.messagesHash === messagesHash && row.configurationHash === hash(configs[label]) && row.transportConfigurationHash === transportHash
            && Object.entries(control.expected).every(([dimension, status]) => row.statuses[dimension] === status))) throw new Error('f3_calibration_changed');
    }
    for (const pair of source.report.pairs) {
        const rows = source.assessments.filter(row => row.caseId === pair.case.caseId);
        if (rows.length !== 1 || rows[0].observations.length !== 2 || new Set(rows[0].observations.map(o => o.label)).size !== 2) throw new Error('f3_assessment_changed');
        const evidence = f2SourceEvidence(pair), messagesHash = hash(f2SourceMessages(pair));
        for (const observation of rows[0].observations) {
            const config = configs[observation.label];
            if (!config || observation.messagesHash !== messagesHash || observation.evidenceHash !== hash(evidence)
                || observation.configurationHash !== hash(config) || observation.transportConfigurationHash !== hash(f2JudgeTransport(config,
                scope.judgeOutputTokens, scope.judgeReasoningEffort?.[observation.label] ?? null))) throw new Error('f3_assessment_changed');
            parseF2SourceAssessment(JSON.stringify(observation), pair.case, evidence);
        }
        const shared = pair.case.behaviorDimensions.filter(dimension => rows[0].observations.every(o => o.dimensions[dimension].status === 'gap'));
        if (!equal(rows[0].sharedGaps, shared)) throw new Error('f3_assessment_changed');
    }
    if (source.assessments.length !== 3) throw new Error('f3_assessment_changed');
    if (!source.assessments.some(row => row.sharedGaps.length)) throw new Error('f3_headroom_unestablished');
}

export function validateF3Baseline(report, domain, config, settings, ledger) {
    const cases = selectCases({ purpose: 'evaluation', split: 'development', profileId: profileFor(domain) });
    if (report?.origin !== 'host_source_probe' || report.domain !== domain || report.caseSetRevision !== PILOT_CASE_SET_REVISION
        || report.configurations.baseline !== hash(config) || report.settings.baseline !== hash(settings) || report.pairs.length !== 3
        || cases.some(entry => report.pairs.filter(pair => equal(pair.case, entry) && pair.repetition === 1).length !== 1)) throw new Error('f3_baseline_changed');
    for (const pair of report.pairs) {
        const { pairHash, ...identity } = pair;
        if (pairHash !== hash(identity) || pair.human !== null || pair.candidate !== null || pair.judge !== null
            || !equal(pair.scenario, publicCaseScenario(pair.case)) || !pair.baseline.output || pair.baseline.error
            || !pair.baseline.requestHashes.length || [...pair.case.expectedInvariants, 'isolation', 'target_consumed'].some(k => pair.baseline.checks[k] !== true)
            || pair.baseline.configurationHash !== hash(config) || pair.baseline.settingsHash !== hash(settings)
            || !pair.baseline.charges.length) throw new Error('f3_baseline_incomplete');
        for (const charge of pair.baseline.charges) {
            const paid = ledger.entries[charge.id];
            if (charge.kind !== 'baseline' || charge.trialId !== pair.baseline.trialId || !report.charges.some(c => equal(c, charge))
                || !paid?.settled || paid.trialId !== charge.trialId || paid.tokens !== charge.tokens
                || !['reported', 'unknown'].includes(charge.status)) throw new Error('f3_baseline_unfunded');
        }
    }
    return report;
}

// The cached F2 baseline retains its original charge and trial identity. It is
// not inserted into a new owner ledger or described as a fresh paired trial.
export function pilotDevelopmentReadiness(report, independent, owner, jobId, baseline, ledger) {
    const reasons = [], required = selectCases({ purpose: 'evaluation', split: 'development', profileId: profileFor(report.domain) });
    let wins = 0;
    if (report.origin !== 'm1_f3_development' || report.evaluatorRevision !== evolutionEvaluatorRevision()
        || report.caseSetRevision !== PILOT_CASE_SET_REVISION || report.baselineReuse.reportHash !== hash(baseline)
        || report.configurations.baseline !== baseline.configurations.baseline || report.settings.baseline !== baseline.settings.baseline
        || !equal(report.quality, qualityEnvelope(report.domain, required, 'development'))) reasons.push('evaluation_identity_changed');
    if (report.pairs.length !== 3 || required.some(c => report.pairs.filter(p => equal(p.case, c) && p.repetition === 1).length !== 1)) reasons.push('development_cases_incomplete');
    const seen = new Set();
    for (const charge of report.charges) {
        if (seen.has(charge.id) || !paidMatches(charge, owner.attempts.find(a => a.id === charge.id && a.jobId === jobId))) reasons.push('durable_charge_mismatch');
        seen.add(charge.id);
    }
    for (const pair of report.pairs) {
        const old = baseline.pairs.find(p => equal(p.case, pair.case));
        const { pairHash, ...identity } = pair;
        if (pair.human !== null || pairHash !== hash(identity) || !equal(pair.scenario, publicCaseScenario(pair.case))
            || !old || !equal(pair.baseline, old.baseline)) reasons.push('pair_or_reused_baseline_changed');
        for (const charge of pair.baseline.charges) {
            const paid = ledger.entries[charge.id];
            if (!paid?.settled || paid.trialId !== charge.trialId || paid.tokens !== charge.tokens) reasons.push('baseline_usage_missing');
        }
        const observations = independent.filter(o => o.pairHash === pairHash), observation = observations[0];
        if (observations.length !== 1 || observation?.origin !== 'independent_model' || observation.model === observation.primaryModel
            || !owner.attempts.some(a => a.id === observation.chargeId && a.jobId === jobId + ':independent' && a.kind === 'judge'
                && ['reported', 'unknown'].includes(a.status) && a.requestHash === observation.requestHash && a.snapshotHash === observation.snapshotHash)) reasons.push('independent_model_observation_missing');
        if (!pair.judge?.chargeIds?.length || pair.judge.chargeIds.some(id => !report.charges.some(c => c.id === id && c.kind === 'judge'))) reasons.push('primary_model_observation_unfunded');
        if (!['candidate', 'tie'].includes(pair.judge?.preference) || observation?.preference !== pair.judge?.preference) reasons.push('model_regression_uncertainty_or_disagreement');
        if (pair.judge?.preference === 'candidate' && observation?.preference === 'candidate') wins++;
        for (const dimension of pair.case.behaviorDimensions) if (!Number.isInteger(pair.judge?.deltas?.[dimension]) || pair.judge.deltas[dimension] < 0
            || !Number.isInteger(observation?.deltas?.[dimension]) || observation.deltas[dimension] < 0) reasons.push('behavior_regression_or_ungraded');
        const trial = pair.candidate;
        if (trial?.error || !trial?.output || !trial?.requestHashes?.length || trial.configurationHash !== report.configurations.candidate
            || trial.settingsHash !== report.settings.candidate || [...pair.case.expectedInvariants, 'isolation', 'target_consumed'].some(k => trial?.checks?.[k] !== true)) reasons.push('authority_or_execution_incomplete');
        if (!trial?.charges?.length || trial.charges.some(c => c.kind !== 'candidate' || c.trialId !== trial.trialId
            || !report.charges.some(p => equal(p, c)) || !paidMatches(c, owner.attempts.find(a => a.id === c.id && a.jobId === jobId)))) reasons.push('candidate_usage_missing');
    }
    if (independent.length !== 3) reasons.push('independent_model_observation_missing');
    if (wins < 2) reasons.push('improvement_threshold_not_met');
    return { accepted: !reasons.length, reasons: [...new Set(reasons)], wins, tokensAdvisory: true, humanPreference: 'not_observed',
        currencyCost: 'unavailable', productionPromotion: 'original_gate_unchanged', baselineReuse: 'cached_F2_development_observation' };
}

// Exact subtree aliases reduce repeated Project sources/history. Nothing is
// truncated: both observed arms can be reconstructed from sharedEvidence.
export function f3SharedEvidence(left, right) {
    const counts = new Map(), sharedEvidence = {};
    const visit = value => {
        if (value && typeof value === 'object' && Object.hasOwn(value, '$f3ref')) throw new Error('f3_evidence_reference_conflict');
        if (typeof value === 'string' || value && typeof value === 'object') {
            const key = canonical(value);
            if (key.length >= 48) counts.set(key, (counts.get(key) || 0) + 1);
        }
        if (value && typeof value === 'object') Object.values(value).forEach(visit);
    };
    visit(left); visit(right);
    const ids = new Map([...counts].filter(([, count]) => count > 1).map(([key]) => key).sort().map((key, i) => [key, 's' + i.toString(36)]));
    const children = value => Array.isArray(value) ? value.map(encode)
        : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) : value;
    const encode = value => {
        const key = canonical(value);
        if (counts.get(key) > 1) {
            const id = ids.get(key);
            if (!Object.hasOwn(sharedEvidence, id)) sharedEvidence[id] = children(value);
            return { $f3ref: id };
        }
        return children(value);
    };
    const arms = { left: encode(left), right: encode(right) };
    return { ...arms, sharedEvidence };
}

export function f3GradeMessages(pair, flipped) {
    const evidence = trial => JSON.parse(f2SourceEvidence({ case: pair.case, baseline: trial })).baseline;
    const arms = f3SharedEvidence(evidence(pair[flipped ? 'candidate' : 'baseline']), evidence(pair[flipped ? 'baseline' : 'candidate']));
    return [{ role: 'system', content: 'Blindly compare both complete observed responses against every supplied rubric dimension. A {"$f3ref":id} is an exact subtree alias into sharedEvidence; expand all aliases, including nested ones, before assessing either arm. The shared pool deduplicates repetition without removing observations. Return JSON only: {"preference":"left|right|tie|uncertain","deltas":{dimension:integer from -4 to 4},"rationale":"at most 512 characters"}. Every delta is right minus left, independent of preference. Retain unknown/missing evidence; do not infer semantic success from hard checks. In RP, exposed support is required for every binding rule, penalty, eligibility restriction and unknown current/private fact, including later clauses. Creative gestures do not authorize new rules. In Project, Host status is corroboration, not model-authored communication: inspect modelStatements for explicitly requested status explanation; complete public windows with requested explanation omitted are gaps, unavailable windows unknown. Do not penalize a correct proposal merely because its status explanation is missing. Evaluate the whole response, with no majority-vote cancellation of contradictions.' },
        { role: 'user', content: canonical({ ...pair.scenario, dimensions: pair.case.behaviorDimensions,
            ...arms }) }];
}

export async function prepareF3Investigation(f, targetPin) {
    const capture = await f.service.targets.capture(f.h.handle, f.scope, f.subject, f.target);
    const original = await f.repository.get(f.h.handle, f.scope, f.subject);
    if (hash(capture) !== targetPin || !original?.policy || original.jobs.length || original.publications.length
        || original.policy.targetPin !== targetPin || !equal(original.policy.target, f.target)
        || original.policy.routeId !== f.route.runtimeRouteId || original.policy.price !== null) throw new Error('f3_investigation_policy_changed');
    // Remove the legacy fixture proxy correction. Model observations are
    // carried only by the explicit investigation envelope below.
    const view = await f.service.experience.inspect(f.h.handle, { scope: f.scope, subject: f.subject });
    for (const item of view.feedback.filter(item => item.kind === 'explicit' && item.status === 'active')) {
        const current = await f.service.experience.inspect(f.h.handle, { scope: f.scope, subject: f.subject });
        await f.service.experience.withdraw(f.h.handle, { scope: f.scope, subject: f.subject, id: item.id, expectedSequence: current.sequence });
    }
    // The delegated test cannot pass production configure/start without real
    // feedback. Reuse the exact existing private policy, marking only its
    // test execution mode; never grant production source/diagnosis eligibility.
    await f.repository.mutate(f.h.handle, f.scope, f.subject, doc => {
        doc.policy.mode = 'review'; doc.policy.reason = 'm1_private_investigation';
    });
    return capture;
}

export async function runF3Domain({ f, kind, primaryConfig, secondaryConfig, scope, source, controls, ledger, entry, store, signal }) {
    const domain = kind === 'rp-skill' ? 'rp' : 'project', profileId = profileFor(domain);
    const baselineSettings = await f.service.targets.evaluationSettings(f.h.handle, f.scope, f.subject, f.target);
    validateF3Baseline(source.report, domain, primaryConfig, baselineSettings, ledger());
    validateF3Calibration(source, scope, controls, kind, primaryConfig, secondaryConfig);
    if (hash(source.report) !== scope.baselineHashes[kind] || hash(source.assessments) !== scope.assessmentHashes[kind]) throw new Error('f3_source_changed');
    const capture = await prepareF3Investigation(f, scope.configurations[kind].targetPin);
    const doc = await f.repository.get(f.h.handle, f.scope, f.subject);
    if (hash(capture) !== scope.configurations[kind].targetPin) throw new Error('f3_target_changed');
    const job = { id: 'm1-f3-' + randomUUID(), batchHash: hash(source.assessments), diagnosisId: null,
        dependencies: { feedbackRefs: [], diagnosis: null }, policyFingerprint: doc.policy.fingerprint, target: f.target, targetPin: hash(capture),
        status: 'running', operationId: null, createdAt: Date.now(), candidates: [], reason: null };
    await f.repository.mutate(f.h.handle, f.scope, f.subject, d => { d.jobs.push(job); });
    const paidJob = { ...job, scopeId: doc.scopeId, domain, price: null };
    const fresh = async () => {
        await f.service._fresh(f.h.handle, f.scope, f.subject, job.id);
        if (hash(await f.service.targets.capture(f.h.handle, f.scope, f.subject, f.target)) !== hash(capture)) throw new Error('f3_base_changed');
    };
    const investigation = { origin: 'test_only_investigation', productionTrigger: 'not_established', sourceReportHash: hash(source.report),
        findings: source.assessments.map(row => ({ caseId: row.caseId, sharedGaps: row.sharedGaps,
            observations: row.observations.map(o => ({ origin: o.origin, label: o.label, dimensions: o.dimensions })) })) };
    entry.investigation = investigation; entry.jobId = job.id;
    const extractionConfig = f2JudgeTransport(primaryConfig, 8000, 'low');
    const input = { instruction: 'Return JSON only: {"edits":[{"before":"exact unique original fragment, or empty string to append","after":"minimal corrected fragment or appended instruction"}],"rationale":"public hypothesis at most 1024 bytes"}. Use one to four edits against base, never a full replacement. Prefer a short append. This is a delegated private engineering investigation, not user feedback or a proven root cause. Generalize the observed development deficiency without case names, answers or private facts. Preserve other base instructions and Skill frontmatter. Change only the declared field, no tools, identity, authority, connection, guards or output owner. Keep player choices and uncertainty while offering expressive in-world NPC action. For Project preserve actual source reads, dependencies and uncommitted Review; accurately explain actual outcomes in public model text. State expected benefit and a counterexample. Independent promotion fixtures are unavailable.',
        feedback: [], diagnosis: null, investigation, field: capture.field, base: capture.body, allowedDeclaration: capture.declaration };
    const proposal = await f.evaluator.extract(f.h.handle, paidJob, extractionConfig, signal, fresh, input);
    store(kind + '-f3-extraction.json', { proposal, inputHash: hash(input), configurationHash: hash(extractionConfig) });
    const candidate = await f.service.targets.prepare(f.h.handle, f.scope, f.subject, f.target, capture, proposal.value);
    const checked = await f.service.targets.check(f.h.handle, f.scope, f.subject, f.target, candidate.candidateId);
    entry.candidateValueHash = hash(proposal.value);
    await f.repository.mutate(f.h.handle, f.scope, f.subject, d => {
        const j = d.jobs.find(j => j.id === job.id); j.status = 'evaluating';
        j.candidates.push({ candidateId: candidate.candidateId, diff: candidate.diff, rationale: proposal.rationale,
            base: checked.base, desired: checked.desired, report: null, decision: { eligible: false, reasons: ['evaluation_pending'] } });
    });
    store(kind + '-f3-frozen-candidate.json', { candidate, base: checked.base, desired: checked.desired, valueHash: entry.candidateValueHash });
    const settings = await f.service.targets.evaluationSettings(f.h.handle, f.scope, f.subject, f.target, candidate.candidateId);
    const config = await f.evaluator.configuration(f.h.handle, f.route.runtimeRouteId, settings.projectPromptRef || null);
    if (!equal(primaryConfig.model, config.model) || !equal(primaryConfig.connection, config.connection) || !equal(primaryConfig.generation, config.generation)) throw new Error('f3_paired_configuration_changed');
    // Original isolated worker executes the candidate settings as a one-arm
    // source probe. Only parent accounting labels are mapped to candidate.
    const send = f.evaluator.send;
    let probe;
    try {
        f.evaluator.send = (handle, j, c, payload, abort, check) => send(handle, j, c, { ...payload, arm: 'candidate' }, abort, check);
        probe = await f.evaluator.probe(f.h.handle, paidJob, config, settings, signal, fresh,
            pair => store(kind + '-f3-candidate-' + pair.case.caseId + '.json', pair),
            trial => store(kind + '-f3-trial-' + trial.caseId + '.json', trial),
            { profileId, split: 'development', repetitions: 1, mode: 'source_probe' });
    } finally { f.evaluator.send = send; }
    const report = { schemaVersion: 2, origin: 'm1_f3_development', evaluatorRevision: evolutionEvaluatorRevision(), caseSetRevision: PILOT_CASE_SET_REVISION,
        domain, quality: probe.quality, policyFingerprint: job.policyFingerprint, targetPin: job.targetPin, price: null,
        configurations: { baseline: hash(primaryConfig), candidate: hash(config) }, settings: { baseline: hash(baselineSettings), candidate: hash(settings) },
        baselineReuse: { reportHash: hash(source.report), evaluatorRevision: source.report.evaluatorRevision, origin: 'cached_F2_development_observation' },
        pairs: probe.pairs.map(pair => ({ case: pair.case, scenario: pair.scenario, repetition: 1,
            baseline: structuredClone(source.report.pairs.find(old => old.case.caseId === pair.case.caseId).baseline), candidate: pair.baseline, judge: null, human: null })),
        charges: probe.charges, createdAt: Date.now() };
    store(kind + '-f3-development-report.json', report);
    entry.independent = [];
    for (const pair of report.pairs) {
        for (const [label, original] of [['primary', primaryConfig], ['secondary', secondaryConfig]]) {
            const transport = f2JudgeTransport(original, scope.judgeOutputTokens, scope.judgeReasoningEffort?.[label] ?? null);
            const flipped = parseInt(hash([label, pair.case.caseRevision, entry.candidateValueHash]).slice(0, 2), 16) % 2 === 1;
            let charge;
            const bridge = await createFrozenEvaluationBridge(transport, async payload => {
                const response = await send(f.h.handle, { ...paidJob, id: label === 'secondary' ? job.id + ':independent' : job.id }, transport,
                    { ...payload, arm: 'judge' }, signal, fresh); charge = response.charge; return response.raw;
            });
            try {
                const messages = f3GradeMessages(pair, flipped);
                const response = await bridge.rp({ requestId: randomUUID(), trialId: job.id + ':' + label + ':' + pair.case.caseId,
                    fixtureHash: pair.case.fixtureHash, tools: [], kind: 'grader', messages });
                let grade;
                try { grade = parseBlindGrade(response.response.assistantText || response.response.text, pair, flipped); }
                catch { grade = { status: 'invalid', preference: 'uncertain', deltas: {}, rationale: 'Grader response invalid; retained without retry or score repair.' }; }
                if (label === 'primary') { report.charges.push(charge); pair.judge = { ...grade, chargeIds: [charge.id] }; pair.pairHash = hash(pair); }
                else entry.independent.push({ ...grade, origin: 'independent_model', pairHash: pair.pairHash,
                    model: original.model.remoteModelId, primaryModel: primaryConfig.model.remoteModelId, configurationHash: hash(transport),
                    chargeId: charge.id, requestHash: charge.requestHash, snapshotHash: charge.snapshotHash });
                store(kind + '-f3-grade-' + pair.case.caseId + '-' + label + '.json', { grade, charge, flipped, messagesHash: hash(messages) });
            } finally { bridge.cleanup(); }
        }
        store(kind + '-f3-development-report.json', report); store(kind + '-independent.json', entry.independent);
    }
    entry.developmentReadiness = pilotDevelopmentReadiness(report, entry.independent, await f.repository.owner(f.h.handle), job.id, source.report, ledger());
    entry.status = 'f3_development_observed'; entry.lifecycle = { performedThisRun: false };
    const decision = promotionDecision(report);
    await f.repository.mutate(f.h.handle, f.scope, f.subject, d => {
        const j = d.jobs.find(j => j.id === job.id); j.status = 'awaiting_review'; j.candidates[0].report = report; j.candidates[0].decision = decision;
    });
    const final = await f.repository.get(f.h.handle, f.scope, f.subject), finalJob = final.jobs.find(j => j.id === job.id);
    store(kind + '-job.json', { doc: final, job: finalJob, candidate: finalJob.candidates[0] });
}
