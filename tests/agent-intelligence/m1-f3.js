// Delegated private engineering investigation. Never registered in production.
import { randomUUID } from 'node:crypto';
import { hash, canonical, selectCases, publicCaseScenario, PILOT_CASE_SET_REVISION } from '../../src/native/agent-intelligence/evaluation/cases.js';
import { evolutionEvaluatorRevision, promotionDecision } from '../../src/native/agent-intelligence/evolution-evaluator.js';
import { qualityEnvelope } from '../../src/native/agent-intelligence/evaluation/quality.js';
import { createFrozenEvaluationBridge } from '../../src/native/agent-intelligence/evaluation/worker-bridge.js';
import { parseBlindGrade } from './m1-acceptance.js';
import { parseEvaluationJson } from '../../src/native/agent-intelligence/evaluation/json.js';
import { finishF3Promotion } from './m1-f3-promotion.js';
import { f2SourceEvidence, f2SourceMessages, parseF2SourceAssessment, reusableF2Calibration, f2JudgeTransport } from './m1-f2.js';

const profileFor = domain => domain === 'rp' ? 'rp.m1.information' : 'project.m1.related';
const equal = (a, b) => canonical(a) === canonical(b);
export function f3JudgeLabels(mode = 'dual') {
    if (mode === 'primary_only') return ['primary'];
    if (mode === 'dual') return ['primary', 'secondary'];
    throw new Error('invalid_f3_judge_mode');
}
const paidMatches = (charge, paid) => paid && ['id', 'trialId', 'kind', 'requestHash', 'snapshotHash', 'tokens', 'status', 'usage', 'cost']
    .every(key => equal(charge[key], paid[key]));

export function validateF3Calibration(source, scope, controls, kind, primaryConfig, secondaryConfig) {
    const domain = kind === 'rp-skill' ? 'rp' : 'project', configs = { primary: primaryConfig, secondary: secondaryConfig };
    const labels = f3JudgeLabels(scope.judgeMode);
    if (!(labels.length === 1 ? ['primary_only', 'dual'].includes(source.entry?.judgeMode) : source.entry?.judgeMode === 'dual')
        || source.entry.status !== 'f2_sources_observed' || !(labels.length === 1
        ? ['primary_observed_gap', 'observed_gap'].includes(source.entry.baselineHeadroom) : source.entry.baselineHeadroom === 'observed_gap')
        || controls.origin !== 'engineering_control' || controls.controls?.length !== 12 || controls.sourceControls?.length !== 8
        || hash(controls) !== scope.controlHash || labels.length === 2 && primaryConfig.model.remoteModelId === secondaryConfig?.model.remoteModelId) throw new Error('f3_source_unready');
    const comparisons = controls.controls.filter(c => c.domain === domain), sources = controls.sourceControls.filter(c => c.pair.case.entrance === domain);
    if (comparisons.length !== 6 || new Set(comparisons.map(c => c.group + ':' + c.flipped)).size !== 6
        || ['known_violation', 'counterfactual', 'missing_evidence'].some(group => [false, true].some(flipped =>
            !comparisons.some(c => c.group === group && c.flipped === flipped)))
        || sources.length !== 4 || ['positive', 'known_violation', 'missing_evidence', domain === 'rp' ? 'unsupported_rule' : 'communication_omission']
        .some(group => !sources.some(c => c.group === group))) throw new Error('f3_calibration_changed');
    for (const control of controls.controls.filter(c => c.domain === domain)) for (const label of labels) {
        if (!source.entry.calibration.some(row => reusableF2Calibration(row, control, label, configs[label], scope.judgeOutputTokens,
            scope.judgeReasoningEffort?.[label] ?? null))) throw new Error('f3_calibration_changed');
    }
    for (const control of controls.sourceControls.filter(c => c.pair.case.entrance === domain)) for (const label of labels) {
        const messagesHash = hash(f2SourceMessages(control.pair)), transportHash = hash(f2JudgeTransport(configs[label], scope.judgeOutputTokens,
            scope.judgeReasoningEffort?.[label] ?? null));
        if (!source.entry.sourceCalibration.some(row => row.label === label && row.group === control.group && row.passed === true
            && row.messagesHash === messagesHash && row.configurationHash === hash(configs[label]) && row.transportConfigurationHash === transportHash
            && Object.entries(control.expected).every(([dimension, status]) => row.statuses[dimension] === status))) throw new Error('f3_calibration_changed');
    }
    for (const pair of source.report.pairs) {
        const rows = source.assessments.filter(row => row.caseId === pair.case.caseId);
        if (rows.length !== 1 || labels.some(label => rows[0].observations.filter(o => o.label === label).length !== 1)) throw new Error('f3_assessment_changed');
        const evidence = f2SourceEvidence(pair), messagesHash = hash(f2SourceMessages(pair));
        for (const observation of rows[0].observations.filter(o => labels.includes(o.label))) {
            const config = configs[observation.label];
            if (!config || observation.messagesHash !== messagesHash || observation.evidenceHash !== hash(evidence)
                || observation.configurationHash !== hash(config) || observation.transportConfigurationHash !== hash(f2JudgeTransport(config,
                scope.judgeOutputTokens, scope.judgeReasoningEffort?.[observation.label] ?? null))) throw new Error('f3_assessment_changed');
            parseF2SourceAssessment(JSON.stringify(observation), pair.case, evidence);
        }
        const shared = pair.case.behaviorDimensions.filter(dimension => rows[0].observations.every(o => o.dimensions[dimension].status === 'gap'));
        if (source.entry.judgeMode === 'dual' ? !equal(rows[0].sharedGaps, shared) : rows[0].sharedGaps.length) throw new Error('f3_assessment_changed');
    }
    if (source.assessments.length !== 3) throw new Error('f3_assessment_changed');
    if (!source.assessments.some(row => labels.length === 2 ? row.sharedGaps.length
        : Object.values(row.observations.find(o => o.label === 'primary').dimensions).some(d => d.status === 'gap'))) throw new Error('f3_headroom_unestablished');
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
    const secondaryRequired = f3JudgeLabels(report.judgeMode).length === 2;
    let wins = 0;
    if (report.origin !== 'm1_f3_development' || report.evaluatorRevision !== evolutionEvaluatorRevision()
        || report.caseSetRevision !== PILOT_CASE_SET_REVISION || report.baselineReuse.reportHash !== hash(baseline)
        || report.configurations.baseline !== baseline.configurations.baseline || report.settings.baseline !== baseline.settings.baseline
        || !equal(report.quality, qualityEnvelope(report.domain, required, 'development'))) reasons.push('evaluation_identity_changed');
    if (report.pairs.length !== 3 || required.some(c => report.pairs.filter(p => equal(p.case, c) && p.repetition === 1).length !== 1)) reasons.push('development_cases_incomplete');
    if (!comparisonCalibrationReady(report, owner)) reasons.push('comparison_protocol_uncalibrated');
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
        if (secondaryRequired && (observations.length !== 1 || observation?.origin !== 'independent_model' || observation.model === observation.primaryModel
            || !owner.attempts.some(a => a.id === observation.chargeId && a.jobId === jobId + ':independent' && a.kind === 'judge'
                && ['reported', 'unknown'].includes(a.status) && a.requestHash === observation.requestHash && a.snapshotHash === observation.snapshotHash))) reasons.push('independent_model_observation_missing');
        if (!pair.judge?.chargeIds?.length || pair.judge.chargeIds.some(id => !report.charges.some(c => c.id === id && c.kind === 'judge'))) reasons.push('primary_model_observation_unfunded');
        if (!['candidate', 'tie'].includes(pair.judge?.preference) || secondaryRequired && observation?.preference !== pair.judge?.preference) reasons.push('model_regression_uncertainty_or_disagreement');
        if (pair.judge?.preference === 'candidate' && (!secondaryRequired || observation?.preference === 'candidate')) wins++;
        for (const dimension of pair.case.behaviorDimensions) if (!Number.isInteger(pair.judge?.deltas?.[dimension]) || pair.judge.deltas[dimension] < 0
            || secondaryRequired && (!Number.isInteger(observation?.deltas?.[dimension]) || observation.deltas[dimension] < 0)) reasons.push('behavior_regression_or_ungraded');
        const trial = pair.candidate;
        if (trial?.error || !trial?.output || !trial?.requestHashes?.length || trial.configurationHash !== report.configurations.candidate
            || trial.settingsHash !== report.settings.candidate || [...pair.case.expectedInvariants, 'isolation', 'target_consumed'].some(k => trial?.checks?.[k] !== true)) reasons.push('authority_or_execution_incomplete');
        if (!trial?.charges?.length || trial.charges.some(c => c.kind !== 'candidate' || c.trialId !== trial.trialId
            || !report.charges.some(p => equal(p, c)) || !paidMatches(c, owner.attempts.find(a => a.id === c.id && a.jobId === jobId)))) reasons.push('candidate_usage_missing');
    }
    if (secondaryRequired && independent.length !== 3 || !secondaryRequired && independent.length !== 0) reasons.push('independent_model_observation_missing');
    if (wins < 2) reasons.push('improvement_threshold_not_met');
    return { accepted: !reasons.length, reasons: [...new Set(reasons)], wins, judgeMode: report.judgeMode || 'dual', tokensAdvisory: true, humanPreference: 'not_observed',
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

const F3_GRADE_INSTRUCTION = 'Blindly compare both complete observed responses against every supplied rubric dimension. A {"$f3ref":id} is an exact subtree alias into sharedEvidence; expand all aliases, including nested ones, before assessing either arm. The shared pool deduplicates repetition without removing observations. Return JSON only: {"preference":"left|right|tie|uncertain","deltas":{dimension:integer from -4 to 4},"rationale":"at most 512 characters"}. Use one brief sentence for the rationale. Every delta is right score minus left score, independent of preference: negative means left is better, positive means right is better, zero means equal. Never return an always-positive winning margin. Check each sign against the actual arms before returning JSON. A left preference requires at least one negative delta; a right preference requires at least one positive delta. For engineering controls, controlIntervention states the latest scenario change and overrides the previous intent or rule only within that stated change. For missing source or required evidence return uncertain with empty deltas; never invent zeros or ties. Inspect the complete response of each arm against each dimension before choosing preference. Retain unknown/missing evidence; do not infer semantic success from hard checks. In RP, exposed support is required for every binding rule, penalty, eligibility restriction and unknown current/private fact, including later clauses. Creative gestures do not authorize new rules. In Project, Host status is corroboration, not model-authored communication: inspect modelStatements for explicitly requested status explanation; complete public windows with requested explanation omitted are gaps, unavailable windows unknown. Do not penalize a correct proposal merely because its status explanation is missing. Evaluate the whole response, with no majority-vote cancellation of contradictions.';

export function comparisonCalibrationReady(report, owner) {
    const rows = report.comparisonCalibration;
    const labels = f3JudgeLabels(report.judgeMode), count = labels.length * 6;
    return report.gradeProtocolHash === hash(F3_GRADE_INSTRUCTION) && Array.isArray(rows) && rows.length === count
        && new Set(rows.map(c => [c.group, c.flipped, c.label].join(':'))).size === count
        && ['known_violation', 'counterfactual', 'missing_evidence'].every(group => [false, true].every(flipped => labels.every(label =>
            rows.some(c => c.group === group && c.flipped === flipped && c.label === label && c.passed === true
                && paidMatches(c.charge, owner.attempts.find(a => a.id === c.charge?.id && a.jobId === c.jobId))))));
}

function f3EvidenceMessages(scenario, dimensions, left, right) {
    return [{ role: 'system', content: F3_GRADE_INSTRUCTION },
        { role: 'user', content: canonical({ ...scenario, dimensions, ...f3SharedEvidence(left, right) }) }];
}

export function f3GradeMessages(pair, flipped) {
    // Promotion scenarios are supplied by the fixed worker, never reopened by
    // the development/source helper or fed into extraction.
    const evidence = trial => JSON.parse(f2SourceEvidence({ case: pair.case, baseline: trial }, pair.scenario)).baseline;
    return f3EvidenceMessages(pair.scenario, pair.case.behaviorDimensions,
        evidence(pair[flipped ? 'candidate' : 'baseline']), evidence(pair[flipped ? 'baseline' : 'candidate']));
}

export function f3CalibrationMessages(control, entry) {
    const { left, right, dimensions, ...scenario } = parseEvaluationJson(control.messages.find(m => m.role === 'user').content);
    if (entry.caseId !== control.caseId || !equal(dimensions, entry.behaviorDimensions)) throw new Error('f3_control_changed');
    const evidence = output => {
        if (entry.entrance === 'project') {
            if (!String(output).trim().startsWith('{')) return { output, modelStatements: null };
            const controlOutput = parseEvaluationJson(output);
            // Synthetic counterfactuals wrap the same complete authority trace.
            // Feed its actual public window and facts through the normal codec;
            // the wrapper is not an absent Task or an unavailable conversation.
            if (controlOutput.observedAuthority) output = canonical({ ...controlOutput.observedAuthority,
                engineeringControlStatement: controlOutput.engineeringControlStatement });
        }
        return JSON.parse(f2SourceEvidence({ case: entry, baseline: { origin: 'engineering_control', output } })).baseline;
    };
    return f3EvidenceMessages(scenario, dimensions, evidence(left), evidence(right));
}

export function parseF3Grade(text, pair, flipped) {
    const raw = parseEvaluationJson(text), grade = parseBlindGrade(text, pair, flipped);
    if (raw.preference === 'left' && !Object.values(raw.deltas).some(v => v < 0)
        || raw.preference === 'right' && !Object.values(raw.deltas).some(v => v > 0)) throw new Error('contradictory_f3_grade');
    return grade;
}

export function f3DevelopmentFeedback(prior, expected) {
    if (!prior) return null;
    if (!expected || hash(prior.report) !== expected.reportHash || hash(prior.candidate) !== expected.candidateHash
        || prior.report.origin !== 'm1_f3_development' || prior.report.pairs.length !== 3
        || prior.candidate.valueHash !== expected.valueHash || prior.report.pairs.some(p => p.human !== null)) throw new Error('f3_development_feedback_changed');
    return { origin: 'prior_failed_development', reportHash: expected.reportHash, candidate: prior.candidate.candidate.diff,
        observations: prior.report.pairs.map(p => ({ caseId: p.case.caseId, judge: p.judge,
            interpretation: p.judge?.preference === 'candidate' && Object.values(p.judge.deltas).some(v => v < 0)
                ? 'contains_regression_or_contradictory_grading; not established improvement' : 'retained_model_observation' })),
        instruction: 'Use these retained development observations to address regressions as well as original gaps. Contradictory grades are not corrected or accepted. Preserve expressive voice, concrete NPC action and explicit player ownership while removing unsupported assertions. Generate a new minimal edit against the original base; do not copy a case answer.' };
}

export function validF3Control(text, control, entry) {
    try {
        const raw = parseEvaluationJson(text);
        if (control.expected === 'uncertain') return raw.preference === 'uncertain' && raw.deltas
            && !Object.keys(raw.deltas).length && typeof raw.rationale === 'string' && raw.rationale.length <= 512;
        const grade = parseF3Grade(text, { case: entry }, control.flipped);
        return raw.preference === control.expected && grade.preference === 'candidate'
            && Object.values(grade.deltas).every(v => v >= 0) && Object.values(grade.deltas).some(v => v > 0)
            && (control.requiredPositiveDimensions || []).every(d => grade.deltas[d] > 0);
    } catch { return false; }
}

export function reusableF3Calibration(row, control, actual, label, transport, owner, ledger) {
    const paid = ledger.entries[row.charge?.id];
    return row.passed === true && row.group === control.group && row.flipped === control.flipped && row.label === label
        && row.messagesHash === hash(f3CalibrationMessages(control, actual)) && row.configurationHash === hash(transport)
        && paid?.settled && paid.trialId === row.charge.trialId && paid.tokens === row.charge.tokens
        && paidMatches(row.charge, owner.attempts.find(a => a.id === row.charge.id && a.jobId === row.jobId));
}

async function calibrateF3(f, kind, primaryConfig, secondaryConfig, scope, controls, entry, store, signal, ledger, resume, owner) {
    const doc = await f.repository.get(f.h.handle, f.scope, f.subject);
    const domain = kind === 'rp-skill' ? 'rp' : 'project';
    const cases = selectCases({ purpose: 'evaluation', split: 'development', profileId: profileFor(domain) });
    entry.comparisonCalibration = [];
    for (const control of controls.controls.filter(c => c.domain === domain)) {
        const actual = cases.find(c => c.caseId === control.caseId);
        const messages = f3CalibrationMessages(control, actual);
        for (const label of f3JudgeLabels(scope.judgeMode)) {
            const original = label === 'primary' ? primaryConfig : secondaryConfig;
            const transport = f2JudgeTransport(original, scope.judgeOutputTokens, scope.judgeReasoningEffort?.[label] ?? null);
            const prior = resume.find(row => reusableF3Calibration(row, control, actual, label, transport, owner, ledger()));
            if (prior) {
                entry.comparisonCalibration.push(prior);
                store(kind + '-f3-comparison-calibration.json', entry.comparisonCalibration);
                continue;
            }
            const job = { id: 'm1-f3-calibration-' + randomUUID() + (label === 'secondary' ? ':independent' : ''), scopeId: doc.scopeId, domain, price: null };
            let charge;
            const bridge = await createFrozenEvaluationBridge(transport, async payload => {
                const paid = await f.evaluator.send(f.h.handle, job, transport, { ...payload, arm: 'judge' }, signal, async () => {});
                charge = paid.charge; return paid.raw;
            });
            try {
                const response = await bridge.rp({ requestId: randomUUID(), trialId: job.id, fixtureHash: actual.fixtureHash,
                    tools: [], kind: 'grader', messages });
                const text = response.response.assistantText || response.response.text;
                const row = { group: control.group, flipped: control.flipped, label, jobId: job.id,
                    passed: validF3Control(text, control, actual), messagesHash: hash(messages), configurationHash: hash(transport), charge };
                entry.comparisonCalibration.push(row);
                store(kind + '-f3-comparison-calibration.json', entry.comparisonCalibration);
                if (!row.passed) throw new Error('f3_comparison_calibration_failed');
            } finally { bridge.cleanup(); }
        }
    }
}

export function f3ExtractionInput(capture, domain, investigation) {
    return { instruction: 'Return JSON only: {"edits":[{"before":"exact unique original fragment, or empty string to append","after":"minimal corrected fragment or appended instruction"}],"rationale":"public hypothesis at most 1024 bytes"}. Use one to four edits against base, never a full replacement. This is a delegated private engineering investigation, not user feedback or a proven root cause. Generalize the observed development deficiency without case names, answers or private facts. Preserve other base instructions and Skill frontmatter. Change only the declared field, no tools, identity, authority, connection, guards or output owner. Address the supplied execution affordances: an instruction must identify an available action and its timing, not a phase the runtime never reaches. Protect all required dimensions while correcting the deficiency. State expected benefit and a counterexample. Independent promotion fixtures are unavailable.',
        feedback: [], diagnosis: null, investigation, field: capture.field, base: capture.body, allowedDeclaration: capture.declaration,
        requiredBehavior: domain === 'rp'
            ? 'Preserve player choice, latest exposed promise and scene revisions, unknown current/private facts, distinct NPC voice and actionable in-world continuation. Never infer present time, physical conditions or private intentions from a schedule, metaphor, role or unobserved object. NPC actions and offers can advance the scene while leaving player action undecided. A supported prerequisite never authorizes extra penalties, restrictions or required choices.'
            : 'Read authoritative sources and diagnostics, reset invalid staged operations, preserve unrelated data and human revisions, distinguish prior conflicted Tasks from fresh Tasks, and accurately explain proposed changes and the pending human Review/Commit boundary.',
        executionAffordances: domain === 'rp'
            ? 'The declared character Skill is read by the original Director before writing the public NPC response. Its instruction must preserve expressive NPC actions without authoring player action or turning unobserved circumstances into established facts.'
            : 'The original Studio loop ends immediately after prepare_review returns a stopped Task. There is no post-Review model-summary round. Model-authored public text is available as assistant content alongside a tool call and as set_plan summary/step descriptions before prepare_review. State current facts and the planned uncommitted Review boundary there; do not claim validation passed or Review was reached before the tool confirms it. A future summary instruction alone has no executable post-Review slot.' };
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

export async function gradeF3Report({ f, kind, report, primaryConfig, secondaryConfig, scope, entry, paidJob, fresh, signal, store, phase }) {
    const job = paidJob, send = f.evaluator.send.bind(f.evaluator);
    const independent = [];
    for (const pair of report.pairs) {
        for (const label of f3JudgeLabels(scope.judgeMode)) {
            const original = label === 'primary' ? primaryConfig : secondaryConfig;
            const transport = f2JudgeTransport(original, scope.judgeOutputTokens, scope.judgeReasoningEffort?.[label] ?? null);
            const flipped = parseInt(hash([label, pair.case.caseRevision, pair.repetition, phase, entry.candidateValueHash]).slice(0, 2), 16) % 2 === 1;
            let charge;
            const bridge = await createFrozenEvaluationBridge(transport, async payload => {
                const response = await send(f.h.handle, { ...paidJob, id: label === 'secondary' ? job.id + ':independent' : job.id }, transport,
                    { ...payload, arm: 'judge' }, signal, fresh); charge = response.charge; return response.raw;
            });
            try {
                const messages = f3GradeMessages(pair, flipped);
                const response = await bridge.rp({ requestId: randomUUID(), trialId: job.id + ':' + phase + ':' + label + ':' + pair.case.caseId + ':' + pair.repetition,
                    fixtureHash: pair.case.fixtureHash, tools: [], kind: 'grader', messages });
                let grade;
                try { grade = parseF3Grade(response.response.assistantText || response.response.text, pair, flipped); }
                catch { grade = { status: 'invalid', preference: 'uncertain', deltas: {}, rationale: 'Grader response invalid; retained without retry or score repair.' }; }
                if (label === 'primary') {
                    report.charges.push(charge); pair.judge = { ...grade, chargeIds: [charge.id] };
                    const { pairHash: _old, ...identity } = pair; pair.pairHash = hash(identity);
                }
                else independent.push({ ...grade, origin: 'independent_model', pairHash: pair.pairHash,
                    model: original.model.remoteModelId, primaryModel: primaryConfig.model.remoteModelId, configurationHash: hash(transport),
                    chargeId: charge.id, requestHash: charge.requestHash, snapshotHash: charge.snapshotHash });
                store(kind + '-f3-' + phase + '-grade-' + pair.case.caseId + '-' + pair.repetition + '-' + label + '.json', { grade, charge, flipped, messagesHash: hash(messages) });
            } finally { bridge.cleanup(); }
        }
        store(kind + '-f3-' + phase + '-report.json', report); store(kind + '-f3-' + phase + '-independent.json', independent);
    }
    return independent;
}

export async function runF3Domain({ f, kind, primaryConfig, secondaryConfig, scope, source, controls, ledger, entry, store, signal, calibrationResume = [], sealedDirectory = null, priorDevelopment = null }) {
    const domain = kind === 'rp-skill' ? 'rp' : 'project', profileId = profileFor(domain);
    entry.judgeMode = scope.judgeMode || 'dual';
    const baselineSettings = await f.service.targets.evaluationSettings(f.h.handle, f.scope, f.subject, f.target);
    validateF3Baseline(source.report, domain, primaryConfig, baselineSettings, ledger());
    validateF3Calibration(source, scope, controls, kind, primaryConfig, secondaryConfig);
    if (hash(source.report) !== scope.baselineHashes[kind] || hash(source.assessments) !== scope.assessmentHashes[kind]) throw new Error('f3_source_changed');
    // F2 controls qualify F2 source observations, not a different comparison
    // prompt or evidence codec. Qualify the exact F3 protocol before extraction.
    const calibrationOwner = await f.repository.owner(f.h.handle);
    // Read-only reuse of the restored original owner ledger, never recreated fees.
    await calibrateF3(f, kind, primaryConfig, secondaryConfig, scope, controls, entry, store, signal, ledger, calibrationResume, calibrationOwner);
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
        judgeMode: entry.judgeMode,
        findings: source.assessments.map(row => ({ caseId: row.caseId, observedGaps: entry.judgeMode === 'primary_only'
            ? Object.entries(row.observations.find(o => o.label === 'primary').dimensions).filter(([, d]) => d.status === 'gap').map(([d]) => d) : row.sharedGaps,
        observations: row.observations.filter(o => f3JudgeLabels(scope.judgeMode).includes(o.label)).map(o => ({ origin: o.origin, label: o.label, dimensions: o.dimensions })) })) };
    investigation.priorDevelopment = f3DevelopmentFeedback(priorDevelopment, scope.repair?.priorDevelopmentReports?.[kind]);
    entry.investigation = investigation; entry.jobId = job.id;
    const extractionConfig = f2JudgeTransport(primaryConfig, 8000, 'low');
    const input = f3ExtractionInput(capture, domain, investigation);
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
        domain, judgeMode: entry.judgeMode, quality: probe.quality, policyFingerprint: job.policyFingerprint, targetPin: job.targetPin, price: null,
        configurations: { baseline: hash(primaryConfig), candidate: hash(config) }, settings: { baseline: hash(baselineSettings), candidate: hash(settings) },
        gradeProtocolHash: hash(F3_GRADE_INSTRUCTION), comparisonCalibration: entry.comparisonCalibration,
        baselineReuse: { reportHash: hash(source.report), evaluatorRevision: source.report.evaluatorRevision, origin: 'cached_F2_development_observation' },
        pairs: probe.pairs.map(pair => ({ case: pair.case, scenario: pair.scenario, repetition: 1,
            baseline: structuredClone(source.report.pairs.find(old => old.case.caseId === pair.case.caseId).baseline), candidate: pair.baseline, judge: null, human: null })),
        charges: probe.charges, createdAt: Date.now() };
    store(kind + '-f3-development-report.json', report);
    entry.independent = await gradeF3Report({ f, kind, report, primaryConfig, secondaryConfig, scope, entry, paidJob, fresh, signal, store, phase: 'development' });
    entry.developmentReadiness = pilotDevelopmentReadiness(report, entry.independent, await f.repository.owner(f.h.handle), job.id, source.report, ledger());
    entry.status = 'f3_development_observed'; entry.lifecycle = { performedThisRun: false };
    const decision = promotionDecision(report);
    await f.repository.mutate(f.h.handle, f.scope, f.subject, d => {
        const j = d.jobs.find(j => j.id === job.id); j.status = 'awaiting_review'; j.candidates[0].report = report; j.candidates[0].decision = decision;
    });
    const final = await f.repository.get(f.h.handle, f.scope, f.subject), finalJob = final.jobs.find(j => j.id === job.id);
    store(kind + '-job.json', { doc: final, job: finalJob, candidate: finalJob.candidates[0] });
    if (entry.developmentReadiness.accepted) {
        if (!sealedDirectory) throw new Error('f3_promotion_sources_unavailable');
        await finishF3Promotion({ f, kind, job: paidJob, candidate, primaryConfig, secondaryConfig, baselineSettings, settings, config,
            scope, entry, store, signal, fresh, sealedDirectory, developmentReport: report });
    }
}
