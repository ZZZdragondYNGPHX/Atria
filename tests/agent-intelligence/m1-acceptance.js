import { evolutionEvaluatorRevision } from '../../src/native/agent-intelligence/evolution-evaluator.js';
import { evolutionHash as hash } from '../../src/native/agent-intelligence/evolution-repository.js';
import { CASE_SET_REVISION, selectCases } from '../../src/native/agent-intelligence/evaluation/cases.js';
import { parseEvaluationJson } from '../../src/native/agent-intelligence/evaluation/json.js';

// This is the approved M1 engineering acceptance, never production eligibility.
// Model observations stay separate from report.pairs[].human.
export function parseBlindGrade(text, pair, flipped) {
    const grade = parseEvaluationJson(text);
    const dimensions = pair.case.behaviorDimensions;
    if (!['left', 'right', 'tie', 'uncertain'].includes(grade.preference) || typeof grade.rationale !== 'string' || grade.rationale.length > 512
        || !grade.deltas || Object.keys(grade.deltas).sort().join(',') !== [...dimensions].sort().join(',')
        || Object.values(grade.deltas).some(v => !Number.isInteger(v) || v < -4 || v > 4)) throw new Error('invalid_blind_grade');
    return { preference: ['tie', 'uncertain'].includes(grade.preference) ? grade.preference : (grade.preference === 'left') === flipped ? 'candidate' : 'baseline',
        deltas: Object.fromEntries(Object.entries(grade.deltas).map(([k, v]) => [k, flipped ? -v : v])), rationale: grade.rationale };
}

export function automatedAcceptance(report, independent, owner, jobId) {
    const reasons = [], required = selectCases({ purpose: 'evaluation', split: 'promotion' }).filter(c => c.entrance === report?.domain);
    let wins = 0, baselineTokens = 0, candidateTokens = 0;
    if (report?.origin !== 'host_evaluator' || report.evaluatorRevision !== evolutionEvaluatorRevision() || report.caseSetRevision !== CASE_SET_REVISION) reasons.push('evaluation_identity_changed');
    if (report?.pairs?.length !== 9 || required.some(c => [1, 2, 3].some(r => report?.pairs?.filter(p => p.case.caseId === c.caseId && p.repetition === r).length !== 1))) reasons.push('independent_cases_incomplete');
    const seen = new Set();
    for (const c of report?.charges || []) {
        const paid = owner.attempts.find(a => a.id === c.id && a.jobId === jobId);
        if (seen.has(c.id) || !paid || !['trialId', 'kind', 'requestHash', 'snapshotHash', 'tokens', 'status', 'usage', 'cost'].every(k => hash({ value: paid[k] }) === hash({ value: c[k] }))) reasons.push('durable_charge_mismatch');
        seen.add(c.id);
    }
    if (owner.attempts.filter(a => a.jobId === jobId).some(a => a.status !== 'reported')) reasons.push('job_usage_unsettled');
    for (const pair of report?.pairs || []) {
        const { pairHash, human, ...identity } = pair;
        if (human !== null || pairHash !== hash({ ...identity, human: null })) reasons.push('pair_identity_or_human_changed');
        const observation = independent.find(o => o.pairHash === pairHash);
        if (!observation || observation.origin !== 'independent_model' || observation.model === observation.primaryModel || !observation.chargeId
            || !owner.attempts.some(a => a.id === observation.chargeId && a.jobId === jobId + ':independent' && a.status === 'reported' && a.kind === 'judge'
                && a.requestHash === observation.requestHash && a.snapshotHash === observation.snapshotHash)) reasons.push('independent_model_observation_missing');
        if (!pair.judge?.chargeIds?.length || pair.judge.chargeIds.some(id => !report.charges.some(c => c.id === id && c.kind === 'judge'))) reasons.push('primary_model_observation_unfunded');
        if (!['candidate', 'tie'].includes(pair.judge?.preference) || observation?.preference !== pair.judge?.preference) reasons.push('model_regression_uncertainty_or_disagreement');
        if (observation?.preference === 'candidate' && pair.judge?.preference === 'candidate') wins++;
        for (const d of pair.case.behaviorDimensions) if (!Number.isInteger(pair.judge?.deltas?.[d]) || pair.judge.deltas[d] < 0
            || !Number.isInteger(observation?.deltas?.[d]) || observation.deltas[d] < 0) reasons.push('behavior_regression_or_ungraded');
        for (const arm of ['baseline', 'candidate']) {
            const trial = pair[arm];
            if (trial?.error || !trial?.output || !trial?.requestHashes?.length || [...pair.case.expectedInvariants, 'isolation', 'target_consumed'].some(k => trial?.checks?.[k] !== true)) reasons.push('authority_or_execution_incomplete');
            if (!trial?.charges?.length || trial.charges.some(c => c.status !== 'reported' || !owner.attempts.some(a => a.id === c.id && a.jobId === jobId && a.tokens === c.tokens && a.requestHash === c.requestHash && a.snapshotHash === c.snapshotHash))) reasons.push('usage_or_durable_charge_missing');
            const tokens = trial?.charges?.reduce((n, c) => n + c.tokens, 0) || 0;
            if (arm === 'baseline') baselineTokens += tokens; else candidateTokens += tokens;
        }
    }
    if (wins < 6) reasons.push('improvement_threshold_not_met');
    if (owner.breached || candidateTokens > baselineTokens) reasons.push('token_regression_or_budget_breach');
    return { accepted: reasons.length === 0, reasons: [...new Set(reasons)], wins, baselineTokens, candidateTokens,
        currencyCost: report?.price ? 'reported_in_primary_report' : 'unavailable', humanPreference: 'not_observed', productionPromotion: 'ineligible_without_original_gate',
        interpretation: 'Automated bounded engineering evidence; no human preference or net-benefit claim' };
}
