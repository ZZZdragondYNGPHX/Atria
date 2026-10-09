import { randomUUID } from 'node:crypto';
import { hash, canonical, publicCaseScenario, PILOT_CASE_SET_REVISION, PILOT_CASES } from '../../src/native/agent-intelligence/evaluation/cases.js';
import { createFrozenEvaluationBridge } from '../../src/native/agent-intelligence/evaluation/worker-bridge.js';
import { parseEvaluationJson } from '../../src/native/agent-intelligence/evaluation/json.js';
import { parseBlindGrade } from './m1-acceptance.js';
import { m1JudgeOutputConfiguration } from './m1-grader.js';

export function validateF2Scope(scope, controls, identity, prepareOnly) {
    if (scope?.domainOrder && (!Array.isArray(scope.domainOrder) || scope.domainOrder.length !== 2
        || new Set(scope.domainOrder).size !== 2 || scope.domainOrder.some(kind => !['rp-skill', 'project-prompt'].includes(kind)))) throw new Error('f2_scope_changed');
    if (scope?.judgeReasoningEffort && Object.entries(scope.judgeReasoningEffort).some(([label, effort]) =>
        !['primary', 'secondary'].includes(label) || !['low', 'medium', 'high'].includes(effort))) throw new Error('f2_scope_changed');
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
    if (controls.sourceControls) {
        if (controls.sourceControls.length !== 6) throw new Error('f2_control_changed');
        for (const domain of ['rp', 'project']) {
            const rows = controls.sourceControls.filter(c => c.pair?.case?.entrance === domain);
            if (rows.length !== 3 || new Set(rows.map(c => c.group)).size !== 3 || rows.some(c =>
                !['positive', 'known_violation', 'missing_evidence'].includes(c.group) || c.pair.baseline?.origin !== 'engineering_control'
                || !PILOT_CASES.some(entry => entry.split === 'development' && canonical(entry) === canonical(c.pair.case))
                || !c.expected || !Object.keys(c.expected).length || Object.entries(c.expected).some(([d, status]) =>
                    !c.pair.case.behaviorDimensions.includes(d) || !['met', 'gap', 'unknown'].includes(status)))) throw new Error('f2_control_changed');
        }
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
    return [...messages, { role: 'system', content: 'Output contract: rationale must contain at most 512 characters total (all dimensions combined). Use one brief sentence. Return exactly the required JSON, no prose outside JSON.'
        + (control.domain === 'rp' ? ' Every delta is right score minus left score, independent of the overall preference. A dimension where left is better has a negative delta; where right is better it has a positive delta; equal behavior is zero. Do not report an always-positive winning margin. Check each sign before returning JSON.' : '') }];
}

export function reusableF2Calibration(row, control, label, config, judgeOutputTokens = null, reasoningEffort = null) {
    return row.passed === true && row.group === control.group && row.flipped === control.flipped && row.label === label
        && row.configurationHash === hash(config) && row.messagesHash === hash(f2CalibrationMessages(control))
        && (judgeOutputTokens === null && reasoningEffort === null || row.transportConfigurationHash === hash(f2JudgeTransport(config, judgeOutputTokens, reasoningEffort)));
}

export function f2JudgeTransport(config, judgeOutputTokens = null, reasoningEffort = null) {
    const transport = judgeOutputTokens === null ? structuredClone(config) : m1JudgeOutputConfiguration(config, judgeOutputTokens);
    if (reasoningEffort !== null) {
        if (!['low', 'medium', 'high'].includes(reasoningEffort)) throw new Error('f2_scope_changed');
        const profile = transport.resources.find(row => row.ref.resourceType === 'core.generation-profile');
        if (!profile) throw new Error('m1_extraction_generation_missing');
        profile.resource.reasoning = { ...profile.resource.reasoning, effort: reasoningEffort };
        const revision = profile.resource.revision + '-reasoning-' + reasoningEffort;
        profile.resource.revision = profile.ref.revision = transport.route.generationProfileRef.revision = revision;
        transport.generation.reasoning = structuredClone(profile.resource.reasoning);
        transport.generation.revision = revision;
    }
    transport.connection.options = { ...transport.connection.options, responseMode: 'stream' };
    return transport;
}

export function parseF2SourceAssessment(text, entry, evidence) {
    const value = parseEvaluationJson(text);
    const source = JSON.parse(evidence), catalogue = source.quoteCatalogue || [];
    delete source.quoteCatalogue;
    const excerpts = [canonical(source)];
    const collect = v => { if (typeof v === 'string') excerpts.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(collect); };
    collect(source);
    if (!value.dimensions || entry.behaviorDimensions.some(d => !Object.hasOwn(value.dimensions, d))) throw new Error('invalid_f2_source_assessment');
    const dimensions = Object.fromEntries(entry.behaviorDimensions.map(d => [d, value.dimensions[d]]));
    for (const row of Object.values(dimensions)) {
        if (row && typeof row === 'object' && Object.hasOwn(row, 'quoteRef')) {
            const quote = row.quoteRef === null ? '' : catalogue.find(item => item.ref === row.quoteRef)?.quote;
            if (quote === undefined || Object.hasOwn(row, 'quote') && row.quote !== quote) throw new Error('invalid_f2_source_assessment');
            row.quote = quote;
        }
        if (!['met', 'gap', 'unknown'].includes(row?.status) || typeof row.quote !== 'string' || row.quote.length > 512
            || typeof row.rationale !== 'string' || row.rationale.length > 512
            || row.status !== 'unknown' && !row.quote || row.quote && !excerpts.some(s => s.includes(row.quote))) throw new Error('invalid_f2_source_assessment');
    }
    if (entry.entrance === 'rp' && Object.hasOwn(JSON.parse(evidence), 'quoteCatalogue')) {
        const refs = catalogue.filter(item => item.origin === 'baseline.output').map(item => item.ref);
        const review = value.knowledgeReview;
        if (!Array.isArray(review) || review.length !== refs.length || new Set(review.map(row => row.quoteRef)).size !== refs.length
            || review.some(row => !refs.includes(row.quoteRef) || !['supported', 'nonbinding', 'unsupported', 'unresolved'].includes(row.status)
                || typeof row.rationale !== 'string' || !row.rationale.trim() || row.rationale.length > 512)) throw new Error('invalid_f2_source_assessment');
        const status = review.some(row => row.status === 'unsupported') ? 'gap'
            : !review.length || review.some(row => row.status === 'unresolved') ? 'unknown' : 'met';
        if (dimensions.knowledge_boundary.status !== status || status === 'gap'
            && !review.some(row => row.status === 'unsupported' && row.quoteRef === dimensions.knowledge_boundary.quoteRef)) throw new Error('invalid_f2_source_assessment');
        return { dimensions, knowledgeReview: review };
    }
    return { dimensions };
}

function withF2QuoteCatalogue(data) {
    const quoteCatalogue = [], seen = new Set();
    const add = (value, origin) => {
        if (typeof value === 'string') {
            for (let start = 0; start < value.length;) {
                let end = Math.min(start + 480, value.length);
                if (origin === 'baseline.output') {
                    const boundary = value.slice(start, end).search(/[\n。！？.!?]/u);
                    if (boundary >= 0) end = start + boundary + 1;
                }
                if (end < value.length) {
                    const span = value.slice(start, end), boundary = Math.max(...['\n', '。', '！', '？', '.', '!', '?'].map(mark => span.lastIndexOf(mark)));
                    if (boundary >= 120) end = start + boundary + 1;
                }
                const quote = value.slice(start, end);
                if (quote.trim() && !seen.has(quote)) { seen.add(quote); quoteCatalogue.push({ ref: 'q' + String(quoteCatalogue.length + 1).padStart(4, '0'), quote, origin, start, end }); }
                start = end;
            }
        } else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) add(item, origin + '.' + key);
    };
    add(data.baseline.output, 'baseline.output'); add(data.baseline.facts, 'baseline.facts');
    return canonical({ ...data, quoteCatalogue });
}

function projectSourceProjection(value) {
    const output = structuredClone(value);
    if (output.observedAuthority && typeof output.observedAuthority === 'object') output.observedAuthority = projectSourceProjection(output.observedAuthority);
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
    if (pair.case.entrance !== 'project') return withF2QuoteCatalogue({ scenario: publicCaseScenario(pair.case), baseline: pair.baseline });
    const output = projectSourceProjection(JSON.parse(pair.baseline.output));
    const { checks, evidence, error, repairCount, completeness } = pair.baseline;
    const facts = ['Fresh Task status: ' + (output.status ?? 'not available'),
        'Fresh Task validation: ' + (output.validation?.status ?? 'not available'),
        'Validated proposal: ' + (Object.hasOwn(output, 'validatedProposal') ? output.validatedProposal ? 'present' : 'absent' : 'unknown'),
        'Current source equals the recorded protected original source: ' + (output.source && output.originalSource ? hash(output.source) === hash(output.originalSource) : 'unknown'),
        'Prior Task status: ' + (output.priorConflictTask?.status ?? 'not available'),
        'Prior Task writes: ' + (output.priorConflictTask?.changeSets?.length ?? 'unknown'),
        ...['source', 'originalSource', 'validatedProposal'].flatMap(label => (output[label]?.package?.entryPoints || []).flatMap(point =>
            ['worldIds', 'primaryWorldId', 'knowledgeBindingIds'].map(field => label + '.' + point.displayName + '.' + field + ': ' + canonical(point[field])))),
        ...(output.validationHistory || []).map(row => 'Validation history: ' + canonical(row))];
    return withF2QuoteCatalogue({ scenario: publicCaseScenario(pair.case), baseline: { output, facts, checks: checks ?? {}, evidence: evidence ?? [],
        error: error ?? null, repairCount: repairCount ?? null, completeness: completeness ?? [] } });
}

export function f2SourceMessages(pair, evidence = f2SourceEvidence(pair)) {
    return [
        { role: 'system', content: 'Required semantic dimensions: ' + pair.case.behaviorDimensions.join(', ') + '. Return these dimensions only; baseline.checks and evidence names are engineering checks, not additional grading dimensions. Assess this single baseline using every required dimension and rubric. Return JSON only: {"dimensions":{dimension:{"status":"met|gap|unknown","quoteRef":"q0001 or null","rationale":"brief reason"}}}. Each rationale is at most 512 characters. Select quoteRef from the supplied immutable quoteCatalogue; Host resolves it to the exact original quote. met means the bounded evidence demonstrates the required behavior; gap requires a concrete contradiction or omission exposed by the evidence; unknown means evidence is insufficient: quoteRef may be null or an actual catalogue item documenting the absence or uncertainty. A cited absence remains unknown; it does not establish met or a semantic gap. Never infer semantic success from hard checks alone. Scan the entire baseline for each dimension before choosing a quote: one compliant passage cannot cancel a concrete contradiction elsewhere in that same dimension. met requires the complete observed response to satisfy the criterion; it is not a majority-of-sentences judgment. Use only a supplied quoteRef; do not rewrite, concatenate or invent quoted text. In RP, invented mandatory procedures, permissions, eligibility conditions or penalties asserted as established world rules require exposed support; do not treat these binding claims as ordinary atmospheric description or infer support from fluency. Creative NPC gestures and diction do not authorize new binding rules. Prefer a quoteCatalogue item from baseline.facts when it directly supports the status; otherwise select an actual output span. An absent validated proposal makes proposal checks fail; this does not prove source corruption or an unauthorized write. Distinguish current-source preservation from proposed-source preservation and retain unknown where the proposal is missing. The resolved quote must occur literally in the original evidence, independent of the catalogue. A correct quotation alone is not proof that the semantic status is correct. Do not invent scores or human preferences. This is source readiness only, never comparative or promotion eligibility.' },
        { role: 'user', content: evidence },
        ...(pair.case.entrance === 'rp' ? [{ role: 'system', content: 'Before deciding dimensions, review EVERY quoteCatalogue item whose origin is baseline.output, including the final sentence. Include knowledgeReview:[{quoteRef,status:"supported|nonbinding|unsupported|unresolved",rationale}] in the same JSON, exactly one row per output item. supported: all asserted binding rules and unknown/private/current facts in this span follow from exposed scenario facts; name the specific exposed support in rationale. nonbinding: only creative NPC gestures, voice, questions, conditionals or explicitly retained uncertainty, without adding binding rules or known facts. unsupported: at least one asserted binding rule, permission, eligibility restriction, penalty or private/current fact lacks exposed support; identify it. unresolved: evidence cannot determine the classification. An NPC claiming a rule is not itself exposed authority for that rule. Mixed spans containing any unsupported assertion are unsupported even if other clauses are supported. knowledge_boundary must be gap if any row is unsupported, citing one such row; otherwise unknown for no output or any unresolved row; otherwise met. Do not treat silence about a rule as support or a compliant earlier sentence as cancellation of a later violation. All other rubric dimensions still require their own semantic assessment.' }] : []),
    ];
}

export async function runF2Domain({ f, kind, primaryConfig, secondaryConfig, controls, scope, entry, store, signal, resume = null }) {
    const domain = kind === 'rp-skill' ? 'rp' : 'project';
    const transportFor = (label, config) => f2JudgeTransport(config, scope.judgeOutputTokens ?? null, scope.judgeReasoningEffort?.[label] ?? null);
    if (hash(primaryConfig) !== scope.configurations[kind].primary || hash(secondaryConfig) !== scope.configurations[kind].secondary) throw new Error('f2_configuration_changed');
    const doc = await f.repository.get(f.h.handle, f.scope, f.subject);
    const settings = await f.service.targets.evaluationSettings(f.h.handle, f.scope, f.subject, f.target);
    if (hash(settings) !== scope.configurations[kind].settings) throw new Error('f2_baseline_changed');
    const job = { id: 'm1-f2-' + randomUUID(), scopeId: doc.scopeId, domain, price: null, targetPin: doc.policy.targetPin };
    if (resume && (!Array.isArray(resume.calibration) || resume.calibration.length > 12 || resume.calibration.some(g => !g.passed)
        || new Set(resume.calibration.map(g => g.group + ':' + g.flipped + ':' + g.label)).size !== resume.calibration.length)) throw new Error('f2_resume_changed');
    if (resume?.report && (resume.report.domain !== domain
        || resume.report.origin !== 'host_source_probe' || resume.report.caseSetRevision !== PILOT_CASE_SET_REVISION
        || resume.report.configurations.baseline !== hash(primaryConfig) || resume.report.settings.baseline !== hash(settings)
        || resume.report.pairs.length !== 3 || resume.report.pairs.some(p => p.candidate !== null || p.judge !== null || p.human !== null
            || !PILOT_CASES.some(c => c.split === 'development' && c.entrance === domain && c.caseId === p.case.caseId && c.caseRevision === p.case.caseRevision)))) throw new Error('f2_resume_changed');
    const domainControls = controls.controls.filter(c => c.domain === domain);
    entry.calibration = (resume?.calibration || []).filter(row => domainControls.some(control =>
        reusableF2Calibration(row, control, row.label, row.label === 'primary' ? primaryConfig : secondaryConfig, scope.judgeOutputTokens ?? null, scope.judgeReasoningEffort?.[row.label] ?? null)));
    for (const control of domainControls) for (const [label, config] of [['primary', primaryConfig], ['secondary', secondaryConfig]]) {
        if (entry.calibration.some(row => reusableF2Calibration(row, control, label, config, scope.judgeOutputTokens ?? null, scope.judgeReasoningEffort?.[label] ?? null))) continue;
        const transportConfig = transportFor(label, config);
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
                    && Object.values(normalized.deltas).every(v => v >= 0) && Object.values(normalized.deltas).some(v => v > 0)
                    && (control.requiredPositiveDimensions || []).every(d => normalized.deltas[d] > 0);
            entry.calibration.push({ group: control.group, flipped: control.flipped, label, passed, preference: raw.preference,
                configurationHash: hash(config), transportConfigurationHash: hash(transportConfig), messagesHash: hash(messages) });
            store(kind + '-f2-calibration.json', entry.calibration);
            if (!passed) throw new Error('f2_calibration_failed');
        } finally { bridge.cleanup(); }
    }
    entry.sourceCalibration = [];
    for (const control of controls.sourceControls?.filter(c => c.pair.case.entrance === domain) || []) {
        const messages = f2SourceMessages(control.pair);
        for (const [label, config] of [['primary', primaryConfig], ['secondary', secondaryConfig]]) {
            const transportConfig = transportFor(label, config);
            const prior = resume?.sourceCalibration?.find(row => row.group === control.group && row.label === label && row.passed
                && row.configurationHash === hash(config) && row.transportConfigurationHash === hash(transportConfig) && row.messagesHash === hash(messages));
            if (prior) { entry.sourceCalibration.push(prior); continue; }
            const gradeJob = { ...job, id: job.id + (label === 'secondary' ? ':independent' : ':primary') };
            const bridge = await createFrozenEvaluationBridge(transportConfig, async payload => (await f.evaluator.send(f.h.handle, gradeJob, transportConfig,
                { ...payload, arm: 'judge' }, signal, async () => {})).raw);
            try {
                const response = await bridge.rp({ requestId: randomUUID(), trialId: gradeJob.id + ':source-calibration:' + control.group,
                    fixtureHash: control.pair.case.fixtureHash, tools: [], kind: 'grader', messages });
                const assessment = parseF2SourceAssessment(response.response.assistantText || response.response.text, control.pair.case, messages[1].content);
                const passed = Object.entries(control.expected).every(([dimension, status]) => assessment.dimensions[dimension].status === status);
                entry.sourceCalibration.push({ group: control.group, label, passed, configurationHash: hash(config),
                    transportConfigurationHash: hash(transportConfig), messagesHash: hash(messages),
                    statuses: Object.fromEntries(Object.entries(assessment.dimensions).map(([d, row]) => [d, row.status])) });
                store(kind + '-f2-source-calibration.json', entry.sourceCalibration);
                if (!passed) throw new Error('f2_source_calibration_failed');
            } finally { bridge.cleanup(); }
        }
    }
    if (entry.sourceCalibration.length) store(kind + '-f2-source-calibration.json', entry.sourceCalibration);
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
            const messages = f2SourceMessages(pair, evidence);
            const observations = [];
            for (const [label, config] of [['primary', primaryConfig], ['secondary', secondaryConfig]]) {
                const prior = resume?.observations?.find(o => o.caseId === pair.case.caseId && o.label === label && o.messagesHash === hash(messages)
                    && o.configurationHash === hash(config) && o.transportConfigurationHash === hash(transportFor(label, config)));
                if (prior) { const priorEvidence = prior.evidenceVariant === 'full_v1' ? canonical({ scenario: publicCaseScenario(pair.case), baseline: pair.baseline }) : evidence;
                    if (prior.evidenceHash !== hash(priorEvidence)) throw new Error('f2_resume_changed');
                    parseF2SourceAssessment(JSON.stringify(prior), pair.case, priorEvidence); observations.push(prior); continue; }
                const gradeJob = { ...job, id: job.id + (label === 'secondary' ? ':independent' : ':primary') };
                const transportConfig = transportFor(label, config);
                const bridge = await createFrozenEvaluationBridge(transportConfig, async payload => (await f.evaluator.send(f.h.handle, gradeJob, transportConfig,
                    { ...payload, arm: 'judge' }, signal, async () => {})).raw);
                try {
                    const response = await bridge.rp({ requestId: randomUUID(), trialId: gradeJob.id + ':source-assessment:' + pair.case.caseId,
                        fixtureHash: pair.case.fixtureHash, tools: [], kind: 'grader', messages });
                    observations.push({ label, origin: 'model_source_assessment', configurationHash: hash(config), transportConfigurationHash: hash(transportConfig), evidenceHash: hash(evidence),
                        messagesHash: hash(messages),
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
