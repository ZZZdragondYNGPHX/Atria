import { randomUUID } from 'node:crypto';
import { hash, PILOT_CASE_SET_REVISION, PILOT_CASES } from '../../src/native/agent-intelligence/evaluation/cases.js';
import { createFrozenEvaluationBridge } from '../../src/native/agent-intelligence/evaluation/worker-bridge.js';
import { parseEvaluationJson } from '../../src/native/agent-intelligence/evaluation/json.js';
import { parseBlindGrade } from './m1-acceptance.js';

export function validateF2Scope(scope, controls, identity, prepareOnly) {
    if (scope?.schemaVersion !== 1 || scope.purpose !== 'f2_source_calibration' || scope.pilotCaseSetRevision !== PILOT_CASE_SET_REVISION
        || scope.controlHash !== hash(controls) || controls.origin !== 'engineering_control' || controls.controls?.length !== 12
        || scope.maxSends !== 60 || scope.maxSecondarySends !== 12 || scope.retries !== 0 || scope.extraction !== 0 || scope.promotion !== 0
        || scope.publication !== 0 || scope.testedHead !== identity.testedHead || scope.evaluatorRevision !== identity.evaluatorRevision
        || scope.runnerRevision !== identity.runnerRevision || !Number.isSafeInteger(scope.initialAccounting?.requests) || !Number.isSafeInteger(scope.initialAccounting?.tokens)
        || scope.initialAccounting?.requests !== identity.initialAccounting?.requests
        || scope.initialAccounting?.tokens !== identity.initialAccounting?.tokens) throw new Error('f2_scope_changed');
    for (const domain of ['rp', 'project']) {
        const rows = controls.controls.filter(c => c.domain === domain);
        if (rows.length !== 6 || new Set(rows.map(c => c.group + ':' + c.flipped)).size !== 6
            || rows.some(c => !['known_violation', 'counterfactual', 'missing_evidence'].includes(c.group) || typeof c.flipped !== 'boolean'
                || c.expected !== (c.group === 'missing_evidence' ? 'uncertain' : c.flipped ? 'left' : 'right')
                || !PILOT_CASES.some(entry => entry.split === 'development' && entry.entrance === domain && entry.caseId === c.caseId && entry.fixtureHash === c.fixtureHash))) throw new Error('f2_control_changed');
    }
    if (!prepareOnly && (scope.stepPermission?.explicitAuthorization !== true || scope.stepPermission.maxSends !== 12
        || !/^[a-f0-9]{64}$/.test(scope.stepPermission.evidenceHash))) throw new Error('f2_step_permission_required');
    return scope;
}

export async function runF2Domain({ f, kind, primaryConfig, secondaryConfig, controls, scope, entry, store, signal }) {
    const domain = kind === 'rp-skill' ? 'rp' : 'project';
    if (hash(primaryConfig) !== scope.configurations[kind].primary || hash(secondaryConfig) !== scope.configurations[kind].secondary) throw new Error('f2_configuration_changed');
    const doc = await f.repository.get(f.h.handle, f.scope, f.subject);
    const settings = await f.service.targets.evaluationSettings(f.h.handle, f.scope, f.subject, f.target);
    if (hash(settings) !== scope.configurations[kind].settings) throw new Error('f2_baseline_changed');
    const job = { id: 'm1-f2-' + randomUUID(), scopeId: doc.scopeId, domain, price: null, targetPin: doc.policy.targetPin };
    entry.calibration = [];
    for (const control of controls.controls.filter(c => c.domain === domain)) for (const [label, config] of [['primary', primaryConfig], ['secondary', secondaryConfig]]) {
        const gradeJob = { ...job, id: job.id + (label === 'secondary' ? ':independent' : ':primary') };
        const bridge = await createFrozenEvaluationBridge(config, async payload => (await f.evaluator.send(f.h.handle, gradeJob, config,
            { ...payload, arm: 'judge' }, signal, async () => {})).raw);
        try {
            const response = await bridge.rp({ requestId: randomUUID(), trialId: gradeJob.id + ':' + control.group + ':' + control.flipped,
                fixtureHash: control.fixtureHash, messages: control.messages, tools: [], kind: 'grader' });
            const text = response.response.assistantText || response.response.text;
            const pair = { case: PILOT_CASES.find(c => c.caseId === control.caseId) };
            let raw, normalized = null;
            try { raw = parseEvaluationJson(text); if (control.expected !== 'uncertain') normalized = parseBlindGrade(text, pair, control.flipped); }
            catch { raw = { preference: 'unavailable' }; }
            const passed = control.expected === 'uncertain' ? raw.preference === 'uncertain' && raw.deltas && !Object.keys(raw.deltas).length
                && typeof raw.rationale === 'string' && raw.rationale.length <= 512
                : raw.preference === control.expected && normalized?.preference === 'candidate'
                    && Object.values(normalized.deltas).every(v => v >= 0) && Object.values(normalized.deltas).some(v => v > 0);
            entry.calibration.push({ group: control.group, flipped: control.flipped, label, passed, preference: raw.preference, requestHash: hash(control.messages) });
            store(kind + '-f2-calibration.json', entry.calibration);
            if (!passed) throw new Error('f2_calibration_failed');
        } finally { bridge.cleanup(); }
    }
    const report = await f.evaluator.probe(f.h.handle, job, primaryConfig, settings, signal, async () => {},
        async pair => store(kind + '-source-' + pair.case.caseId + '.json', pair), async trial => store(kind + '-source-trial-' + trial.caseId + '.json', trial),
        { profileId: domain === 'rp' ? 'rp.m1.information' : 'project.m1.related', split: 'development', repetitions: 1, mode: 'source_probe' });
    store(kind + '-source-probe.json', report);
    entry.status = 'f2_sources_observed'; entry.sourceReportHash = hash(report);
    entry.baselineHeadroom = 'requires_evidence_review'; entry.semanticEffect = 'not_a_paired_trial';
    if ((await f.repository.get(f.h.handle, f.scope, f.subject)).jobs.length) throw new Error('f2_candidate_job_forbidden');
}
