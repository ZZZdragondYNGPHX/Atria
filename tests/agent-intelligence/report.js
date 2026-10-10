import { CASES, CASE_SET_REVISION, canonical, hash, validateCase } from './cases.js';

export const STATUSES = ['passed', 'failed', 'not_run', 'unavailable', 'budget_blocked', 'cancelled'];
function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function keys(value, names) {
    assert(value && typeof value === 'object' && !Array.isArray(value) && canonical(Object.keys(value).sort()) === canonical([...names].sort()), 'Unknown/missing v1 fields');
}
function string(value) { assert(typeof value === 'string' && value.trim().length > 0, 'Nonempty identity required'); }
function integer(value) { assert(Number.isSafeInteger(value) && value >= 0, 'Invalid count'); }
function strings(value) { assert(Array.isArray(value), 'Expected references'); value.forEach(string); assert(new Set(value).size === value.length, 'Duplicate reference'); }
function status(value) { assert(STATUSES.includes(value), 'Unknown status'); }
export function jsonSafe(value, seen = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number') { assert(Number.isFinite(value), 'Nonfinite JSON number'); return; }
    assert(value && typeof value === 'object' && !seen.has(value), 'Non JSON-safe/cyclic value');
    const proto = Object.getPrototypeOf(value);
    const plain = proto === null || (Object.getPrototypeOf(proto) === null && Object.prototype.toString.call(value) === '[object Object]');
    assert(Array.isArray(value) || plain, 'Non JSON object');
    seen.add(value); Object.values(value).forEach(item => jsonSafe(item, seen)); seen.delete(value);
}
export function observation(trialId, name, observed, expected) {
    const evidence = { evidenceId: `${trialId}:${name}`, kind: 'comparison', value: { observed, expected } };
    return { evidence, check: { status: canonical(observed) === canonical(expected) ? 'passed' : 'failed', evidenceRefs: [evidence.evidenceId], reasonCode: name } };
}
export const missingCheck = reasonCode => ({ status: 'unavailable', evidenceRefs: [], reasonCode });

export function validateTrial(trial, entry) {
    jsonSafe(trial); validateCase(entry);
    keys(trial, ['schemaVersion', 'caseId', 'caseRevision', 'trialId', 'executionMode', 'adapterId', 'adapterRevision', 'testedProductHead', 'configuration', 'refs',
        'executionStatus', 'finalTextStatus', 'authorityStatus', 'reviewStatus', 'checks', 'completeness', 'usage', 'metrics', 'behavior', 'evidence']);
    assert(trial.schemaVersion === 1 && trial.caseId === entry.caseId && trial.caseRevision === entry.caseRevision, 'Trial case/schema drift');
    ['trialId', 'adapterId', 'adapterRevision'].forEach(name => string(trial[name]));
    assert(trial.adapterId === `s01-${entry.entrance}` && /^[a-f0-9]{64}$/.test(trial.adapterRevision), 'Exact adapter identity/revision required');
    assert(/^[a-f0-9]{40}$/.test(trial.testedProductHead), 'Exact tested HEAD required');
    assert(['scripted', 'model'].includes(trial.executionMode), 'Unknown execution mode');
    keys(trial.configuration, ['inputHash', 'promptHash', 'skillHash', 'presetHash', 'pinningStatus', 'fingerprint']);
    assert(trial.configuration.inputHash === entry.inputHash, 'Input drift');
    assert(['exact', 'unavailable'].includes(trial.configuration.pinningStatus), 'Unknown pinning');
    for (const name of ['inputHash', 'promptHash', 'skillHash', 'presetHash']) assert(trial.configuration[name] === null || /^[a-f0-9]{64}$/.test(trial.configuration[name]), 'Invalid fingerprint');
    const { fingerprint, ...config } = trial.configuration;
    assert(fingerprint === hash(config), 'Configuration fingerprint mismatch');
    if (config.pinningStatus === 'exact') assert([config.promptHash, config.skillHash, config.presetHash].every(Boolean), 'Exact config incomplete');
    keys(trial.refs, ['runIds', 'requestIds', 'effectIds', 'taskIds', 'messageVariants']);
    for (const name of ['runIds', 'requestIds', 'effectIds', 'taskIds']) strings(trial.refs[name]);
    assert(Array.isArray(trial.refs.messageVariants), 'Invalid variants');
    const variants = new Set(); const variantRequests = new Set();
    for (const variant of trial.refs.messageVariants) {
        keys(variant, ['messageId', 'variantId', 'runId', 'requestIds']);
        string(variant.messageId); string(variant.variantId); strings(variant.requestIds);
        assert(trial.refs.runIds.includes(variant.runId) && variant.requestIds.every(id => trial.refs.requestIds.includes(id)), 'Variant/run/request mixing');
        for (const requestId of variant.requestIds) { assert(!variantRequests.has(requestId), 'Request shared across variants'); variantRequests.add(requestId); }
        const identity = `${variant.messageId}:${variant.variantId}`;
        assert(!variants.has(identity), 'Duplicate variant'); variants.add(identity);
    }
    if (entry.entrance === 'rp' && trial.metrics.generationCalls > 0) assert(variantRequests.size === trial.refs.requestIds.length, 'Unanchored variant request');
    assert(new Set(trial.refs.messageVariants.map(item => item.runId)).size === trial.refs.messageVariants.length, 'Run mixed between variants');
    for (const name of ['executionStatus', 'finalTextStatus', 'authorityStatus', 'reviewStatus']) status(trial[name]);
    strings(trial.completeness);
    assert(Array.isArray(trial.evidence), 'Evidence missing');
    const evidence = new Map();
    for (const item of trial.evidence) {
        keys(item, ['evidenceId', 'kind', 'value']); string(item.evidenceId);
        assert(item.evidenceId.startsWith(trial.trialId + ':') && !evidence.has(item.evidenceId), 'Evidence identity mismatch');
        assert(item.kind === 'comparison', 'Unknown evidence kind'); keys(item.value, ['observed', 'expected']);
        evidence.set(item.evidenceId, item);
    }
    keys(trial.checks, [...entry.expectedInvariants, 'isolation']);
    for (const [name, check] of Object.entries(trial.checks)) {
        keys(check, ['status', 'evidenceRefs', 'reasonCode']); status(check.status); strings(check.evidenceRefs); string(check.reasonCode);
        assert(check.evidenceRefs.every(ref => evidence.has(ref)), 'Unknown evidence reference');
        if (['passed', 'failed'].includes(check.status)) {
            assert(check.evidenceRefs.length > 0, 'Success/failure without evidence');
            const matches = check.evidenceRefs.every(ref => {
                const item = evidence.get(ref).value; return canonical(item.observed) === canonical(item.expected);
            });
            assert(check.status === (matches ? 'passed' : 'failed'), 'Forged check success');
        } else assert(trial.completeness.includes(name), 'Missing check hidden from completeness');
    }
    if (trial.authorityStatus === 'passed') assert(entry.expectedInvariants.every(name => trial.checks[name].status === 'passed'), 'Authority success with missing/failed check');
    if (trial.executionStatus === 'passed') {
        assert(trial.checks.isolation.status === 'passed' && trial.refs.requestIds.length > 0 && !trial.completeness.includes('adapter_execution'), 'Execution success without isolated execution');
    }
    for (const missing of ['provider_identity', 'price', 'behavior_grader']) assert(trial.completeness.includes(missing), 'Missing measurement hidden');
    if (config.pinningStatus === 'unavailable') assert(trial.completeness.some(item => item.includes('pinning') || item.includes('config')), 'Missing pinning hidden');
    keys(trial.usage, ['status', 'totalTokens', 'externalProviderCalls', 'priceStatus', 'upstreamStatus']);
    assert(['provider_reported', 'reserved_upper_bound', 'unavailable'].includes(trial.usage.status), 'Unknown usage');
    integer(trial.usage.externalProviderCalls);
    assert(trial.usage.priceStatus === 'unavailable' && trial.usage.upstreamStatus === 'unavailable', 'Unobserved economics/identity');
    if (trial.usage.status === 'unavailable') {
        assert(trial.usage.totalTokens === null && trial.completeness.includes('usage'), 'Missing usage cannot be zero/hidden');
    } else integer(trial.usage.totalTokens);
    if (trial.executionMode === 'scripted') assert(trial.usage.externalProviderCalls === 0 && trial.usage.status === 'unavailable', 'Scripted provider evidence');
    keys(trial.metrics, ['generationCalls', 'toolCalls', 'retryCount', 'repairCount', 'latencyMs']);
    Object.values(trial.metrics).forEach(integer);
    assert(trial.metrics.generationCalls === trial.refs.requestIds.length, 'Request count mismatch');
    assert(trial.metrics.generationCalls <= entry.limits.maxRequests && trial.metrics.repairCount <= entry.limits.maxRepairRounds, 'Case budget exceeded');
    keys(trial.behavior, entry.behaviorDimensions);
    for (const dimension of Object.values(trial.behavior)) {
        keys(dimension, ['status', 'score', 'judgeSource', 'disagreements', 'humanPreference']); status(dimension.status);
        assert(Array.isArray(dimension.disagreements), 'Invalid judge disagreements');
        if (dimension.status === 'passed') assert([0, 1, 2].includes(dimension.score) && typeof dimension.judgeSource === 'string' && dimension.judgeSource !== 'scripted', 'Behavior score without grader');
        else assert(dimension.score === null && dimension.judgeSource === null && dimension.humanPreference === null, 'Ungraded behavior score');
    }
    return trial;
}

export function summarize(trials) {
    const deterministic = Object.fromEntries(STATUSES.map(state => [state, 0]));
    const behavior = Object.fromEntries(STATUSES.map(state => [state, 0]));
    for (const trial of trials) {
        Object.values(trial.checks).forEach(check => deterministic[check.status]++);
        Object.values(trial.behavior).forEach(check => behavior[check.status]++);
    }
    return {
        trialCount: trials.length, executedTrials: trials.filter(item => item.metrics.generationCalls > 0).length,
        externalProviderCalls: trials.reduce((sum, trial) => sum + trial.usage.externalProviderCalls, 0),
        generationCalls: trials.reduce((sum, trial) => sum + trial.metrics.generationCalls, 0),
        toolCalls: trials.reduce((sum, trial) => sum + trial.metrics.toolCalls, 0),
        deterministic, behavior,
        usageMissingTrials: trials.filter(item => item.usage.status === 'unavailable').length,
        knownTokens: trials.reduce((sum, trial) => sum + (trial.usage.totalTokens ?? 0), 0),
        totalTokensStatus: trials.some(item => item.usage.status === 'unavailable') ? 'unavailable' : trials.some(item => item.usage.status === 'reserved_upper_bound') ? 'reserved_upper_bound' : 'provider_reported',
    };
}
export function empiricalReady(trials) {
    const pilot = ['rp_agency_d1', 'project_authoring_d1'];
    return trials.length === 6 && pilot.every(caseId => trials.filter(trial => trial.caseId === caseId).length === 3)
        && trials.every(trial => trial.executionMode === 'model' && trial.executionStatus === 'passed' && trial.configuration.pinningStatus === 'exact'
            && trial.usage.externalProviderCalls > 0 && trial.usage.externalProviderCalls === trial.metrics.generationCalls && trial.usage.status === 'provider_reported');
}
export function createReport(trials, mode, reasonCode) {
    const report = {
        schemaVersion: 1, caseSetRevision: CASE_SET_REVISION, cases: CASES, mode, trials,
        trialRefs: trials.map(trial => trial.trialId), summary: summarize(trials), empiricalReady: empiricalReady(trials), reasonCode,
    };
    return validateReport(report);
}
export function validateReport(report) {
    jsonSafe(report);
    keys(report, ['schemaVersion', 'caseSetRevision', 'cases', 'mode', 'trials', 'trialRefs', 'summary', 'empiricalReady', 'reasonCode']);
    assert(report.schemaVersion === 1 && report.caseSetRevision === CASE_SET_REVISION && canonical(report.cases) === canonical(CASES), 'Unknown report/case set revision');
    assert(['scripted', 'model'].includes(report.mode), 'Unknown report mode'); string(report.reasonCode);
    strings(report.trialRefs); assert(Array.isArray(report.trials), 'Trials missing');
    assert(canonical(report.trialRefs) === canonical(report.trials.map(trial => trial.trialId)), 'Unknown/duplicate trial refs');
    const requests = new Set();
    for (const trial of report.trials) {
        const entry = CASES.find(item => item.caseId === trial.caseId);
        assert(entry, 'Unknown case ref'); validateTrial(trial, entry);
        assert(trial.executionMode === report.mode, 'Mixed execution modes');
        for (const ref of trial.refs.requestIds) { assert(!requests.has(ref), 'Request mixed across trials'); requests.add(ref); }
    }
    assert(new Set(report.trials.map(item => item.testedProductHead)).size === 1, 'Mixed product revisions');
    assert(new Set(report.trials.map(item => item.adapterRevision)).size === 1, 'Mixed adapter revisions');
    for (const caseId of new Set(report.trials.map(item => item.caseId))) {
        assert(new Set(report.trials.filter(item => item.caseId === caseId).map(item => item.configuration.fingerprint)).size === 1, 'Mixed case configuration');
    }
    if (report.mode === 'scripted') assert(report.trials.length === 12 && new Set(report.trials.map(item => item.caseId)).size === 12, 'Incomplete scripted coverage');
    else assert(report.trials.length === 6 && ['rp_agency_d1', 'project_authoring_d1'].every(id => report.trials.filter(item => item.caseId === id).length === 3), 'Incomplete model pilot coverage');
    assert(canonical(report.summary) === canonical(summarize(report.trials)), 'Forged report counts/summary');
    assert(report.empiricalReady === empiricalReady(report.trials), 'Forged empirical success');
    return report;
}
export function validateMeasurements(sidecar, report) {
    validateReport(report); jsonSafe(sidecar);
    keys(sidecar, ['schemaVersion', 'reportRevision', 'trials']);
    assert(sidecar.schemaVersion === 1 && sidecar.reportRevision === hash(report), 'Unknown measurement schema/report');
    assert(Array.isArray(sidecar.trials), 'Measurements missing');
    const ids = new Set();
    for (const item of sidecar.trials) {
        keys(item, ['trialId', 'availability', 'callGraph', 'missing']);
        assert(report.trialRefs.includes(item.trialId) && !ids.has(item.trialId), 'Unknown/duplicate measurement trial'); ids.add(item.trialId);
        assert(item.availability === 'scripted_observation' || item.availability === 'unavailable', 'Unknown measurement mode'); strings(item.missing);
        assert(Array.isArray(item.callGraph), 'Call graph missing');
        const trial = report.trials.find(trial => trial.trialId === item.trialId);
        const observed = new Set();
        for (const call of item.callGraph) {
            keys(call, ['requestId', 'entry', 'callIndex', 'foreground']);
            assert(trial.refs.requestIds.includes(call.requestId) && !observed.has(call.requestId), 'Unknown/duplicate measurement request'); observed.add(call.requestId);
            assert(call.entry === (trial.caseId.startsWith('rp_') ? 'director' : 'studio') && call.foreground === true, 'Measurement entrance mismatch'); integer(call.callIndex);
        }
        assert(observed.size === trial.refs.requestIds.length, 'Measurement count mismatch');
    }
    assert(ids.size === report.trials.length, 'Missing measurement trials');
    return sidecar;
}
