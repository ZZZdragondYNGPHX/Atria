import { randomUUID } from 'node:crypto';
import { hash, canonical, publicCaseScenario, PILOT_CASE_SET_REVISION, PILOT_CASES } from '../../src/native/agent-intelligence/evaluation/cases.js';
import { createFrozenEvaluationBridge } from '../../src/native/agent-intelligence/evaluation/worker-bridge.js';
import { parseEvaluationJson } from '../../src/native/agent-intelligence/evaluation/json.js';
import { parseBlindGrade } from './m1-acceptance.js';
import { m1JudgeOutputConfiguration } from './m1-grader.js';

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
    const messages = control.messages.map(message => {
        if (control.domain !== 'project' || message.role !== 'user') return message;
        const content = parseEvaluationJson(message.content);
        for (const side of ['left', 'right']) if (typeof content[side] === 'string' && content[side].trim().startsWith('{')) {
            content[side] = projectSourceProjection(parseEvaluationJson(content[side]));
        }
        return { ...message, content: canonical(content) };
    });
    return [...messages, { role: 'system', content: 'Output contract: rationale must contain at most 512 characters total (all dimensions combined). Use one brief sentence. Return exactly the required JSON, no prose outside JSON.' }];
}

export function reusableF2Calibration(row, control, label, config, judgeOutputTokens = null) {
    return row.passed === true && row.group === control.group && row.flipped === control.flipped && row.label === label
        && row.configurationHash === hash(config) && row.messagesHash === hash(f2CalibrationMessages(control))
        && (judgeOutputTokens === null || row.transportConfigurationHash === hash(f2JudgeTransport(config, judgeOutputTokens)));
}

export function f2JudgeTransport(config, judgeOutputTokens = null) {
    const transport = judgeOutputTokens === null ? structuredClone(config) : m1JudgeOutputConfiguration(config, judgeOutputTokens);
    transport.connection.options = { ...transport.connection.options, responseMode: 'stream' };
    return transport;
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

function projectSourceProjection(value) {
    const output = structuredClone(value);
    // Keep actual public tool inputs and resource results. Task responses
    // repeat the full conversation/source history already retained in raw.
    if (output.tools) output.tools = output.tools.map(row => {
        const item = structuredClone(row);
        if (item.args?.source) { item.sourceInputHash = hash(item.args.source); delete item.args.source; }
        if (item.result?.taskId) {
            const result = item.result;
            item.result = Object.fromEntries(['taskId', 'baseRevision', 'status', 'validation', 'repairRound', 'maxRepairRounds', 'plan', 'review', 'changeSets']
                .filter(key => Object.hasOwn(result, key)).map(key => [key, result[key]]));
            item.resultHash = hash(result);
        } else if (item.name === 'atri_agent_get_project' && item.result?.source) {
            item.result = { source: item.result.source, sourceHash: hash(item.result.source) };
        }
        return item;
    });
    // The raw report retains the complete old Task. Its nested source copies
    // do not add evidence about the current baseline's requested correction.
    if (output.priorConflictTask) {
        const prior = output.priorConflictTask;
        output.priorConflictTask = Object.fromEntries(['taskId', 'projectId', 'baseRevision', 'status', 'recovery', 'validation', 'review', 'repairRound', 'changeSets']
            .filter(key => Object.hasOwn(prior, key)).map(key => [key, prior[key]]));
        output.priorConflictTask.operations = (prior.operations || []).map(row => {
            const { input, ...operation } = row.operation || {};
            return { ...Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'operation')), operation,
                inputHash: input ? hash(input) : null };
        });
    }
    return output;
}

export function f2SourceEvidence(pair) {
    if (pair.case.entrance !== 'project') return canonical({ scenario: publicCaseScenario(pair.case), baseline: pair.baseline });
    const output = projectSourceProjection(JSON.parse(pair.baseline.output));
    const { checks, evidence, error, repairCount, completeness } = pair.baseline;
    const facts = ['Fresh Task status: ' + output.status,
        'Fresh Task validation: ' + (output.validation?.status ?? 'not available'),
        'Validated proposal: ' + (output.validatedProposal ? 'present' : 'absent'),
        'Current source equals the recorded protected original source: ' + (hash(output.source) === hash(output.originalSource)),
        'Prior Task status: ' + output.priorConflictTask?.status,
        'Prior Task writes: ' + (output.priorConflictTask?.changeSets?.length ?? 0),
        ...['source', 'originalSource', 'validatedProposal'].flatMap(label => (output[label]?.package?.entryPoints || []).flatMap(point =>
            ['worldIds', 'primaryWorldId', 'knowledgeBindingIds'].map(field => label + '.' + point.displayName + '.' + field + ': ' + canonical(point[field])))),
        ...(output.validationHistory || []).map(row => 'Validation history: ' + canonical(row))];
    return canonical({ scenario: publicCaseScenario(pair.case), baseline: { output, facts, checks: checks ?? {}, evidence: evidence ?? [],
        error: error ?? null, repairCount: repairCount ?? null, completeness: completeness ?? [] } });
}

export async function runF2Domain({ f, kind, primaryConfig, secondaryConfig, controls, scope, entry, store, signal, resume = null }) {
    const domain = kind === 'rp-skill' ? 'rp' : 'project';
    if (hash(primaryConfig) !== scope.configurations[kind].primary || hash(secondaryConfig) !== scope.configurations[kind].secondary) throw new Error('f2_configuration_changed');
    const doc = await f.repository.get(f.h.handle, f.scope, f.subject);
    const settings = await f.service.targets.evaluationSettings(f.h.handle, f.scope, f.subject, f.target);
    if (hash(settings) !== scope.configurations[kind].settings) throw new Error('f2_baseline_changed');
    const job = { id: 'm1-f2-' + randomUUID(), scopeId: doc.scopeId, domain, price: null, targetPin: doc.policy.targetPin };
    if (resume && (!Array.isArray(resume.calibration) || resume.calibration.length > 12 || resume.calibration.some(g => !g.passed)
        || new Set(resume.calibration.map(g => g.group + ':' + g.flipped + ':' + g.label)).size !== resume.calibration.length)) throw new Error('f2_resume_changed');
    if (resume?.report && (resume.report.domain !== domain || resume.calibration.length !== 12
        || resume.report.origin !== 'host_source_probe' || resume.report.caseSetRevision !== PILOT_CASE_SET_REVISION
        || resume.report.configurations.baseline !== hash(primaryConfig) || resume.report.settings.baseline !== hash(settings)
        || resume.report.pairs.length !== 3 || resume.report.pairs.some(p => p.candidate !== null || p.judge !== null || p.human !== null
            || !PILOT_CASES.some(c => c.split === 'development' && c.entrance === domain && c.caseId === p.case.caseId && c.caseRevision === p.case.caseRevision)))) throw new Error('f2_resume_changed');
    const domainControls = controls.controls.filter(c => c.domain === domain);
    entry.calibration = (resume?.calibration || []).filter(row => domainControls.some(control =>
        reusableF2Calibration(row, control, row.label, row.label === 'primary' ? primaryConfig : secondaryConfig, scope.judgeOutputTokens ?? null)));
    for (const control of domainControls) for (const [label, config] of [['primary', primaryConfig], ['secondary', secondaryConfig]]) {
        if (entry.calibration.some(row => reusableF2Calibration(row, control, label, config, scope.judgeOutputTokens ?? null))) continue;
        const transportConfig = f2JudgeTransport(config, scope.judgeOutputTokens ?? null);
        const gradeJob = { ...job, id: job.id + (label === 'secondary' ? ':independent' : ':primary') };
        const bridge = await createFrozenEvaluationBridge(transportConfig, async payload => (await f.evaluator.send(f.h.handle, gradeJob, transportConfig,
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
            entry.calibration.push({ group: control.group, flipped: control.flipped, label, passed, preference: raw.preference,
                configurationHash: hash(config), transportConfigurationHash: hash(transportConfig), messagesHash: hash(messages) });
            store(kind + '-f2-calibration.json', entry.calibration);
            if (!passed) throw new Error('f2_calibration_failed');
        } finally { bridge.cleanup(); }
    }
    const report = resume?.report || await f.evaluator.probe(f.h.handle, job, primaryConfig, settings, signal, async () => {},
        async pair => store(kind + '-source-' + pair.case.caseId + '.json', pair), async trial => store(kind + '-source-trial-' + trial.caseId + '.json', trial),
        { profileId: domain === 'rp' ? 'rp.m1.information' : 'project.m1.related', split: 'development', repetitions: 1, mode: 'source_probe' });
    store(kind + '-source-probe.json', report);
    if (resume) { store(kind + '-f2-calibration.json', entry.calibration); entry.reusedCalibrationRun = resume.run; }
    if (resume?.report) entry.reusedEvidenceRun = resume.run;
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
                const transportConfig = f2JudgeTransport(config, scope.judgeOutputTokens ?? null);
                const bridge = await createFrozenEvaluationBridge(transportConfig, async payload => (await f.evaluator.send(f.h.handle, gradeJob, transportConfig,
                    { ...payload, arm: 'judge' }, signal, async () => {})).raw);
                try {
                    const response = await bridge.rp({ requestId: randomUUID(), trialId: gradeJob.id + ':source-assessment:' + pair.case.caseId,
                        fixtureHash: pair.case.fixtureHash, tools: [], kind: 'grader', messages: [
                            { role: 'system', content: 'Required semantic dimensions: ' + pair.case.behaviorDimensions.join(', ') + '. Return these dimensions only; baseline.checks and evidence names are engineering checks, not additional grading dimensions. Assess this single baseline using every required dimension and rubric. Return JSON only: {"dimensions":{dimension:{"status":"met|gap|unknown","quote":"exact substring from the supplied evidence","rationale":"brief reason"}}}. Each quote and rationale is at most 512 characters. met means the bounded evidence demonstrates the required behavior; gap requires a concrete contradiction or omission exposed by the evidence; unknown means evidence is insufficient (quote must be empty). Never infer semantic success from hard checks alone. Prefer copying a complete baseline.facts line verbatim as the quote; do not reconstruct partial JSON objects or omit fields inside a quoted object. An absent validated proposal makes proposal checks fail; this does not prove source corruption or an unauthorized write. Distinguish current-source preservation from proposed-source preservation and retain unknown where the proposal is missing. Quotes must occur literally in the supplied evidence or its decoded text fields (normal newlines are valid). Do not invent scores or human preferences. This is source readiness only, never comparative or promotion eligibility.' },
                            { role: 'user', content: evidence },
                        ] });
                    observations.push({ label, origin: 'model_source_assessment', configurationHash: hash(config), transportConfigurationHash: hash(transportConfig), evidenceHash: hash(evidence),
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
