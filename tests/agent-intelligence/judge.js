import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { blindPair, validateComparison } from './comparison.js';
import { canonical, hash, loadFixture, selectCases } from './cases.js';
import { EvaluationBudget } from './budget.js';
import { jsonSafe } from './report.js';

export const JUDGE_RULE = Object.freeze({ version: 's06-observation-v1', score: '0 absent/violated, 1 poor, 2 partial, 3 adequate, 4 strong',
    preference: 'Compare completion and the supplied dimensions; do not reward length. Return uncertain when evidence is insufficient.',
    output: 'JSON only: preference (left/right/tie/uncertain), confidence (0..1), scores {left:{each dimension:0..4},right:{each dimension:0..4}}, rationale (one short public sentence, no private reasoning).' });
const equal = (a, b) => canonical(a) === canonical(b);
const requireValue = (value, reason) => { if (!value) throw new Error(reason); };
const fields = (value, names) => requireValue(value && equal(Object.keys(value).sort(), [...names].sort()), 'judge_fields_invalid');

function inputFor(comparison, pair) {
    const entry = selectCases({ purpose: 'evaluation', split: comparison.split }).find(item => item.caseId === pair.caseId);
    const fixture = loadFixture(entry, { purpose: 'evaluation' });
    const blind = blindPair(comparison, pair.pairId, { purpose: 'evaluation' });
    const reversed = parseInt(hash(pair.pairId).slice(0, 2), 16) % 2 === 1;
    const state = arm => ({ execution: pair[arm].trial.executionStatus, authority: pair[arm].trial.authorityStatus,
        review: pair[arm].trial.reviewStatus, status: pair[arm].artifact.status,
        checks: Object.fromEntries(Object.entries(pair[arm].trial.checks).map(([name, check]) => [name, check.status])) });
    return { rule: JUDGE_RULE, dimensions: entry.behaviorDimensions, task: fixture.input,
        visibleFacts: entry.entrance === 'rp' ? fixture.memory.visible : [],
        left: { output: blind.left, outcome: state(reversed ? 'candidate' : 'baseline') },
        right: { output: blind.right, outcome: state(reversed ? 'baseline' : 'candidate') } };
}
function validateGrade(grade, dimensions) {
    fields(grade, ['preference', 'confidence', 'scores', 'rationale']);
    requireValue(['left', 'right', 'tie', 'uncertain'].includes(grade.preference) && Number.isFinite(grade.confidence)
        && grade.confidence >= 0 && grade.confidence <= 1 && typeof grade.rationale === 'string'
        && Buffer.byteLength(grade.rationale) <= 512, 'judge_grade_invalid');
    fields(grade.scores, ['left', 'right']);
    for (const arm of ['left', 'right']) {
        fields(grade.scores[arm], dimensions);
        requireValue(Object.values(grade.scores[arm]).every(score => Number.isSafeInteger(score) && score >= 0 && score <= 4), 'judge_score_invalid');
    }
}
function derive(report) {
    const counts = Object.fromEntries(['observed', 'unavailable', 'failed', 'invalid_response', 'budget_blocked'].map(status => [status, report.pairs.filter(pair => pair.status === status).length]));
    const entries = Object.values(report.ledger.entries).filter(entry => report.pairs.some(pair => pair.trialId === entry.trialId));
    return { ...counts, requests: entries.length, tokens: entries.reduce((sum, item) => sum + item.tokens, 0),
        usageStatus: entries.length === 0 ? 'unavailable' : entries.every(item => item.usageStatus === 'provider_reported') ? 'provider_reported' : 'reserved_upper_bound',
        humanPreference: 'not_run', disagreements: 'not_observed_single_judge', price: 'unavailable', promotion: 'ineligible' };
}

/** One independently prepared, blind observation per available pair; never a promotion vote. */
export async function runModelJudge(comparison, bridge, { onPair = () => {} } = {}) {
    validateComparison(comparison);
    requireValue(comparison.mode === 'model' && comparison.liveIdentity && equal(comparison.liveIdentity, bridge.identity), 'judge_connection_drift');
    const invocationId = randomUUID();
    const report = { schemaVersion: 1, comparisonHash: hash(comparison), ruleHash: hash(JUDGE_RULE),
        evaluatorRevision: hash(fs.readFileSync(new URL('./judge.js', import.meta.url), 'utf8')), liveIdentity: bridge.identity,
        limits: { maxRequests: bridge.budget.maxRequests, maxTotalTokens: bridge.budget.maxTotalTokens },
        invocationId, pairs: [], observations: [], ledger: null, summary: null };
    for (const pair of comparison.pairs) {
        const trialId = `${invocationId}:${pair.pairId}:judge`;
        const item = { pairId: pair.pairId, trialId, requestId: trialId + ':request', binding: null, inputHash: null, status: 'unavailable', responseHash: null, gradeHash: null, grade: null };
        if (pair.baseline.artifact && pair.candidate.artifact) {
            const input = inputFor(comparison, pair);
            item.binding = blindPair(comparison, pair.pairId, { purpose: 'evaluation' }).binding; item.inputHash = hash(input);
            try {
                const result = await bridge.rp({ requestId: item.requestId, trialId, fixtureHash: item.inputHash,
                    messages: [{ role: 'user', content: canonical(input) }], tools: [] });
                item.responseHash = hash(result.response.assistantText);
                try {
                    // No fenced-text or tool-call repair; malformed judge output remains an observation failure.
                    const grade = JSON.parse(result.response.assistantText);
                    validateGrade(grade, input.dimensions); requireValue(result.response.toolCalls.length === 0, 'judge_tools_disallowed');
                    item.grade = grade; item.gradeHash = hash(grade); item.status = 'observed';
                } catch { item.status = 'invalid_response'; }
            } catch (error) { item.status = error.code === 'comparison_budget_blocked' ? 'budget_blocked' : 'failed'; }
        }
        report.pairs.push(item); await onPair(item);
    }
    const ids = new Set(report.pairs.map(pair => pair.trialId));
    report.observations = bridge.observations().filter(item => ids.has(item.trialId));
    report.ledger = bridge.budget.snapshot(); report.summary = derive(report);
    return validateJudgeReport(report, comparison);
}

export function validateJudgeReport(report, comparison) {
    validateComparison(comparison); jsonSafe(report);
    requireValue(Buffer.byteLength(JSON.stringify(report)) <= 4 * 1024 * 1024, 'judge_capacity_exceeded');
    fields(report, ['schemaVersion', 'comparisonHash', 'ruleHash', 'evaluatorRevision', 'liveIdentity', 'limits', 'invocationId', 'pairs', 'observations', 'ledger', 'summary']);
    requireValue(report.schemaVersion === 1 && report.comparisonHash === hash(comparison) && report.ruleHash === hash(JUDGE_RULE)
        && /^[a-f0-9]{64}$/.test(report.evaluatorRevision) && equal(report.liveIdentity, comparison.liveIdentity)
        && /^[a-f0-9-]{36}$/.test(report.invocationId), 'judge_envelope_drift');
    fields(report.limits, ['maxRequests', 'maxTotalTokens']);
    new EvaluationBudget(report.limits, { snapshot: report.ledger });
    requireValue(report.ledger && Array.isArray(report.pairs) && report.pairs.length === comparison.pairs.length && Array.isArray(report.observations), 'judge_coverage_missing');
    const seen = new Set(); const attempts = new Set();
    for (const item of report.pairs) {
        fields(item, ['pairId', 'trialId', 'requestId', 'binding', 'inputHash', 'status', 'responseHash', 'gradeHash', 'grade']);
        const pair = comparison.pairs.find(pair => pair.pairId === item.pairId);
        requireValue(pair && !seen.has(item.pairId) && item.trialId === `${report.invocationId}:${pair.pairId}:judge`
            && item.requestId === item.trialId + ':request' && ['observed', 'unavailable', 'failed', 'invalid_response', 'budget_blocked'].includes(item.status), 'judge_pair_binding_invalid');
        seen.add(item.pairId);
        const observations = report.observations.filter(event => event.trialId === item.trialId);
        const charges = Object.entries(report.ledger.entries).filter(([, entry]) => entry.trialId === item.trialId);
        requireValue(observations.length <= 1 && observations.length === charges.length, 'judge_attempts_invalid');
        for (const event of observations) {
            const names = ['requestId', 'inputTokens', 'snapshotHash', 'configurationHash', 'attemptId', 'trialId', 'status', 'usage', 'durationMs'];
            if (Object.hasOwn(event, 'httpStatus')) names.push('httpStatus', 'contentType');
            if (Object.hasOwn(event, 'failureCode')) names.push('failureCode');
            if (Object.hasOwn(event, 'toolNames')) names.push('toolNames', 'finalTextPresent');
            fields(event, names);
            requireValue(Number.isSafeInteger(event.inputTokens) && event.inputTokens >= 0 && Number.isSafeInteger(event.durationMs) && event.durationMs >= 0
                && /^[a-f0-9]{64}$/.test(event.snapshotHash) && /^[a-f0-9]{64}$/.test(event.configurationHash)
                && ['started', 'sent', 'completed', 'invalid_response', 'cancelled', 'failed'].includes(event.status), 'judge_observation_invalid');
            const charge = report.ledger.entries[event.attemptId];
            requireValue(event.requestId === item.requestId && charge?.kind === 'grader' && charge.trialId === item.trialId
                && !attempts.has(event.attemptId) && event.attemptId === item.requestId + ':send:1', 'judge_charge_unbound');
            requireValue(event.usage === null ? charge.usageStatus === 'reserved_upper_bound'
                : charge.usageStatus === 'provider_reported' && charge.tokens === event.usage.totalTokens, 'judge_usage_drift');
            attempts.add(event.attemptId);
        }
        if (!pair.baseline.artifact || !pair.candidate.artifact) requireValue(item.status === 'unavailable' && item.binding === null && item.inputHash === null && charges.length === 0, 'judge_missing_output_forged');
        else requireValue(item.binding === blindPair(comparison, pair.pairId, { purpose: 'evaluation' }).binding
            && item.inputHash === hash(inputFor(comparison, pair)), 'judge_input_drift');
        if (item.status === 'observed') {
            validateGrade(item.grade, inputFor(comparison, pair).dimensions);
            requireValue(item.gradeHash === hash(item.grade) && observations[0]?.status === 'completed' && /^[a-f0-9]{64}$/.test(item.responseHash), 'judge_success_without_response');
        } else requireValue(item.grade === null && item.gradeHash === null, 'judge_failed_grade_forged');
    }
    requireValue(attempts.size === report.observations.length && equal(report.summary, derive(report)), 'judge_summary_drift');
    return report;
}
