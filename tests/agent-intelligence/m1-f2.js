import { randomUUID } from 'node:crypto';
import { hash, canonical, publicCaseScenario, PILOT_CASE_SET_REVISION, PILOT_CASES } from '../../src/native/agent-intelligence/evaluation/cases.js';
import { createFrozenEvaluationBridge } from '../../src/native/agent-intelligence/evaluation/worker-bridge.js';
import { parseEvaluationJson } from '../../src/native/agent-intelligence/evaluation/json.js';
import { parseBlindGrade } from './m1-acceptance.js';

export function validateF2Scope(scope, controls, identity, prepareOnly) {
    const expanded = scope?.schemaVersion === 2 && scope.headroomAssessment === true && scope.apiHardLimits?.rollingDayRequests === 2000 && scope.apiHardLimits?.requestsPerMinute === 20;
    if (!(scope?.schemaVersion === 1 || expanded) || scope.purpose !== 'f2_source_calibration' || scope.pilotCaseSetRevision !== PILOT_CASE_SET_REVISION
        || scope.controlHash !== hash(controls) || controls.origin !== 'engineering_control' || controls.controls?.length !== 12
        || scope.extraction !== 0 || scope.promotion !== 0
        || scope.publication !== 0 || scope.testedHead !== identity.testedHead || scope.evaluatorRevision !== identity.evaluatorRevision
        || scope.runnerRevision !== identity.runnerRevision) throw new Error('f2_scope_changed');
    for (const domain of ['rp', 'project']) {
        const rows = controls.controls.filter(c => c.domain === domain);
        if (rows.length !== 6 || new Set(rows.map(c => c.group + ':' + c.flipped)).size !== 6
            || rows.some(c => !['known_violation', 'counterfactual', 'missing_evidence'].includes(c.group) || typeof c.flipped !== 'boolean'
                || c.expected !== (c.group === 'missing_evidence' ? 'uncertain' : c.flipped ? 'left' : 'right')
                || !PILOT_CASES.some(entry => entry.split === 'development' && entry.entrance === domain && entry.caseId === c.caseId && entry.fixtureHash === c.fixtureHash))) throw new Error('f2_control_changed');
    }
    void prepareOnly; // Configuration preparation does not create a times-permission gate.
    return scope;
}

export function f2CalibrationMessages(control) {
    return [...control.messages, { role: 'system', content: 'Output contract: rationale must contain at most 512 characters total (all dimensions combined). Use one brief sentence. Return exactly the required JSON, no prose outside JSON.' }];
}

export function parseF2SourceAssessment(text, entry, evidence) {
    const value = parseEvaluationJson(text);
    const excerpts = [evidence];
    const collect = v => { if (typeof v === 'string') excerpts.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(collect); };
    collect(JSON.parse(evidence));
    if (!value.dimensions || entry.behaviorDimensions.some(d => !Object.hasOwn(value.dimensions, d))) throw new Error('invalid_f2_source_assessment');
    const dimensions = Object.fromEntries(entry.behaviorDimensions.map(d => [d, value.dimensions[d]]));
    for (const row of Object.values(dimensions)) {
        if (!['met', 'gap', 'unknown'].includes(row?.status) || typeof row.quote !== 'string' || row.quote.length > 512
            || typeof row.rationale !== 'string' || row.rationale.length > 512
            || (row.status === 'unknown' ? row.quote !== '' : !row.quote || !excerpts.some(s => s.includes(row.quote)))) throw new Error('invalid_f2_source_assessment');
    }
    return { dimensions };
}

export function f2SourceEvidence(pair) {
    if (pair.case.entrance !== 'project') return canonical({ scenario: publicCaseScenario(pair.case), baseline: pair.baseline });
    const output = JSON.parse(pair.baseline.output);
    // The old Task's duplicated inspection/workspace/timeline is retained in
    // the raw report. The grader needs its actual conflict state and operations.
    if (output.priorConflictTask) {
        const { timeline, inspection, workspace, ...state } = output.priorConflictTask;
        void timeline; void inspection; void workspace;
        output.priorConflictTask = state;
    }
    const { checks, evidence, error, repairCount, completeness } = pair.baseline;
    return canonical({ scenario: publicCaseScenario(pair.case), baseline: { output: canonical(output), checks: checks ?? {}, evidence: evidence ?? [],
        error: error ?? null, repairCount: repairCount ?? null, completeness: completeness ?? [] } });
}

export async function runF2Domain({ f, kind, primaryConfig, secondaryConfig, controls, scope, entry, store, signal, resume = null }) {
    const domain = kind === 'rp-skill' ? 'rp' : 'project';
    if (hash(primaryConfig) !== scope.configurations[kind].primary || hash(secondaryConfig) !== scope.configurations[kind].secondary) throw new Error('f2_configuration_changed');
    const doc = await f.repository.get(f.h.handle, f.scope, f.subject);
    const settings = await f.service.targets.evaluationSettings(f.h.handle, f.scope, f.subject, f.target);
    if (hash(settings) !== scope.configurations[kind].settings) throw new Error('f2_baseline_changed');
    const job = { id: 'm1-f2-' + randomUUID(), scopeId: doc.scopeId, domain, price: null, targetPin: doc.policy.targetPin };
    if (resume && (resume.report?.domain !== domain || resume.calibration?.length !== 12 || resume.calibration.some(g => !g.passed)
        || resume.report?.origin !== 'host_source_probe' || resume.report.caseSetRevision !== PILOT_CASE_SET_REVISION
        || resume.report.configurations.baseline !== hash(primaryConfig) || resume.report.settings.baseline !== hash(settings)
        || resume.report.pairs.length !== 3 || resume.report.pairs.some(p => p.candidate !== null || p.judge !== null || p.human !== null
            || !PILOT_CASES.some(c => c.split === 'development' && c.entrance === domain && c.caseId === p.case.caseId && c.caseRevision === p.case.caseRevision)))) throw new Error('f2_resume_changed');
    entry.calibration = resume ? resume.calibration : [];
    for (const control of resume ? [] : controls.controls.filter(c => c.domain === domain)) for (const [label, config] of [['primary', primaryConfig], ['secondary', secondaryConfig]]) {
        const gradeJob = { ...job, id: job.id + (label === 'secondary' ? ':independent' : ':primary') };
        const bridge = await createFrozenEvaluationBridge(config, async payload => (await f.evaluator.send(f.h.handle, gradeJob, config,
            { ...payload, arm: 'judge' }, signal, async () => {})).raw);
        try {
            const messages = f2CalibrationMessages(control);
            const response = await bridge.rp({ requestId: randomUUID(), trialId: gradeJob.id + ':' + control.group + ':' + control.flipped,
                fixtureHash: control.fixtureHash, messages, tools: [], kind: 'grader' });
            const text = response.response.assistantText || response.response.text;
            const pair = { case: PILOT_CASES.find(c => c.caseId === control.caseId) };
            let raw, normalized = null;
            try { raw = parseEvaluationJson(text); if (control.expected !== 'uncertain') normalized = parseBlindGrade(text, pair, control.flipped); }
            catch { raw = { preference: 'unavailable' }; }
            const passed = control.expected === 'uncertain' ? raw.preference === 'uncertain' && raw.deltas && !Object.keys(raw.deltas).length
                && typeof raw.rationale === 'string' && raw.rationale.length <= 512
                : raw.preference === control.expected && normalized?.preference === 'candidate'
                    && Object.values(normalized.deltas).every(v => v >= 0) && Object.values(normalized.deltas).some(v => v > 0);
            entry.calibration.push({ group: control.group, flipped: control.flipped, label, passed, preference: raw.preference, messagesHash: hash(messages) });
            store(kind + '-f2-calibration.json', entry.calibration);
            if (!passed) throw new Error('f2_calibration_failed');
        } finally { bridge.cleanup(); }
    }
    const report = resume ? resume.report : await f.evaluator.probe(f.h.handle, job, primaryConfig, settings, signal, async () => {},
        async pair => store(kind + '-source-' + pair.case.caseId + '.json', pair), async trial => store(kind + '-source-trial-' + trial.caseId + '.json', trial),
        { profileId: domain === 'rp' ? 'rp.m1.information' : 'project.m1.related', split: 'development', repetitions: 1, mode: 'source_probe' });
    store(kind + '-source-probe.json', report);
    if (resume) { store(kind + '-f2-calibration.json', entry.calibration); entry.reusedEvidenceRun = resume.run; }
    entry.status = 'f2_sources_observed'; entry.sourceReportHash = hash(report);
    entry.baselineHeadroom = 'requires_evidence_review'; entry.semanticEffect = 'not_a_paired_trial';
    if (scope.headroomAssessment) {
        const assessments = [];
        for (const pair of report.pairs) {
            const evidence = f2SourceEvidence(pair);
            const observations = [];
            for (const [label, config] of [['primary', primaryConfig], ['secondary', secondaryConfig]]) {
                const prior = resume?.observations?.find(o => o.caseId === pair.case.caseId && o.label === label);
                if (prior) { const priorEvidence = prior.evidenceVariant === 'full_v1' ? canonical({ scenario: publicCaseScenario(pair.case), baseline: pair.baseline }) : evidence;
                    if (prior.evidenceHash !== hash(priorEvidence)) throw new Error('f2_resume_changed');
                    parseF2SourceAssessment(JSON.stringify(prior), pair.case, priorEvidence); observations.push(prior); continue; }
                const gradeJob = { ...job, id: job.id + (label === 'secondary' ? ':independent' : ':primary') };
                const bridge = await createFrozenEvaluationBridge(config, async payload => (await f.evaluator.send(f.h.handle, gradeJob, config,
                    { ...payload, arm: 'judge' }, signal, async () => {})).raw);
                try {
                    const response = await bridge.rp({ requestId: randomUUID(), trialId: gradeJob.id + ':source-assessment:' + pair.case.caseId,
                        fixtureHash: pair.case.fixtureHash, tools: [], kind: 'grader', messages: [
                            { role: 'system', content: 'Required semantic dimensions: ' + pair.case.behaviorDimensions.join(', ') + '. Return these dimensions only; baseline.checks and evidence names are engineering checks, not additional grading dimensions. Assess this single baseline using every required dimension and rubric. Return JSON only: {"dimensions":{dimension:{"status":"met|gap|unknown","quote":"exact substring from the supplied evidence","rationale":"brief reason"}}}. Each quote and rationale is at most 512 characters. met means the bounded evidence demonstrates the required behavior; gap requires a concrete contradiction or omission exposed by the evidence; unknown means evidence is insufficient (quote must be empty). Never infer semantic success from hard checks alone. Quotes must occur literally in the supplied evidence or its decoded text fields (normal newlines are valid). Do not invent scores or human preferences. This is source readiness only, never comparative or promotion eligibility.' },
                            { role: 'user', content: evidence },
                        ] });
                    observations.push({ label, origin: 'model_source_assessment', evidenceHash: hash(evidence),
                        ...parseF2SourceAssessment(response.response.assistantText || response.response.text, pair.case, evidence) });
                } finally { bridge.cleanup(); }
            }
            const sharedGaps = pair.case.behaviorDimensions.filter(d => observations.every(o => o.dimensions[d].status === 'gap'));
            assessments.push({ caseId: pair.case.caseId, observations, sharedGaps, humanPreference: 'not_observed' });
            store(kind + '-f2-source-assessments.json', assessments);
        }
        entry.baselineHeadroom = assessments.some(a => a.sharedGaps.length) ? 'observed_gap' : 'not_established';
        entry.sourceAssessmentHash = hash(assessments);
    }
    if ((await f.repository.get(f.h.handle, f.scope, f.subject)).jobs.length) throw new Error('f2_candidate_job_forbidden');
}
