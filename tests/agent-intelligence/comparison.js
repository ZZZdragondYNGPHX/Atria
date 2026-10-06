import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CASE_SET_REVISION, canonical, hash, loadFixture, selectCases } from './cases.js';
import { assertCandidate, projectFixtureSource, settingsFor } from './evaluation-settings.js';
import { captureFor, finishTrial, withIsolatedRuntime } from './runner.js';
import { jsonSafe, summarize, validateTrial } from './report.js';
import { EvaluationBudget, PilotBudget } from './budget.js';
import { nativeTaskScheduler } from '../../src/native/task-scheduler.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const same = (left, right) => canonical(left) === canonical(right);
const requireValue = (value, reason) => { if (!value) throw new Error(reason); };
function fields(value, names) {
    requireValue(value && same(Object.keys(value).sort(), [...names].sort()), 'Unknown/missing comparison fields');
}
export function evaluationRevision() {
    // Pin dirty implementation bytes too; HEAD alone cannot identify a local evaluator.
    return hash(['comparison.js', 'evaluation-settings.js', 'live-bridge.js', 'runner.js', 'adapters.js', 'cases.js', 'report.js', 'budget.js',
        '../../public/scripts/native/studio-agent.js', '../../public/scripts/agents/orchestrator/director-runtime.js',
        '../../src/native/project-agent.js', '../../src/native/authoring/studio-service.js', '../../src/native/task-scheduler.js']
        .map(name => [name, fs.readFileSync(new URL(name, import.meta.url), 'utf8')]));
}
function envelopeFor(entry, settings, evaluatorRevision, testedProductHead, liveIdentity = null) {
    return { caseRevision: entry.caseRevision, fixtureHash: entry.fixtureHash, inputHash: entry.inputHash, rubricRevision: entry.rubricRevision,
        settingsHash: hash(settings), evaluatorRevision, testedProductHead, transport: liveIdentity ? liveIdentity.configurationHash : 'scripted_or_unavailable',
        tools: entry.entrance === 'rp' ? 'per_run_message_editor' : 'private_studio_review_fixture',
        providerIdentity: 'unavailable', seed: liveIdentity ? 'unavailable' : 'scripted_deterministic', productionEffects: 'forbidden' };
}
function judgeResult(votes) {
    if (!votes.length) return { status: 'not_run', preference: null, disagreements: [] };
    const preferences = [...new Set(votes.map(vote => vote.preference))];
    return { status: preferences.length > 1 ? 'awaiting_review' : 'observed',
        preference: preferences.length === 1 ? preferences[0] : null,
        disagreements: preferences.length > 1 ? votes.map(vote => vote.judgeId) : [] };
}
function derived(report) {
    const trials = report.pairs.flatMap(pair => [pair.baseline.trial, pair.candidate.trial]);
    const failed = trials.some(trial => trial.executionStatus === 'failed' || trial.authorityStatus === 'failed');
    const blocked = trials.some(trial => trial.executionStatus === 'budget_blocked');
    return { ...summarize(trials), pairCount: report.pairs.length,
        status: failed ? 'failed' : blocked ? 'budget_blocked' : report.mode === 'model' ? report.liveIdentity ? 'model_observation' : 'unavailable' : 'structural_only',
        behaviorStatus: report.pairs.some(pair => pair.judge.status === 'awaiting_review') ? 'awaiting_review' : 'unavailable',
        tokenDelta: null, costDelta: null, latencyBenefit: 'unavailable' };
}

/** Serial synthetic evaluator; no route discovery, publication or production resource reads. */
export async function runComparison({ candidate, split, repetitions = 1, mode = 'scripted', maxRequests = 216, pilot = null, bridge = null, onTrial = () => {}, onBaseline = () => {} } = {}) {
    candidate = assertCandidate(candidate);
    const cases = selectCases({ purpose: 'evaluation', split });
    requireValue(Number.isSafeInteger(repetitions) && repetitions >= 1 && repetitions <= 3, 'Paired repetitions must be 1–3');
    requireValue(['scripted', 'model'].includes(mode) && (!bridge || mode === 'model'), 'Unknown comparison mode/live bridge binding');
    requireValue(Number.isSafeInteger(maxRequests) && maxRequests >= 1 && maxRequests <= 216, 'Finite comparison request limit required');
    const pilotLedger = new PilotBudget(pilot);
    return withIsolatedRuntime(async () => {
        const evaluatorRevision = evaluationRevision();
        const testedProductHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
        const report = { schemaVersion: 1, caseSetRevision: CASE_SET_REVISION, split, mode, repetitions, candidate,
            evaluatorRevision, testedProductHead, runId: randomUUID(), budget: { maxRequests, pilot: pilot ? structuredClone(pilot) : null, liveLimits: bridge ? { maxRequests: bridge.budget.maxRequests, maxTotalTokens: bridge.budget.maxTotalTokens } : null },
            pairs: [], judgments: [], ablations: [], liveIdentity: bridge?.identity ?? null, observations: [], ledger: null, baselineHash: null, summary: null, empiricalReady: false, publicationStatus: 'ineligible' };
        const sent = new Set(); const invocationId = report.runId;
        const { runRp, runProject } = mode === 'scripted' || bridge ? await import('./adapters.js') : {};
        const planned = cases.flatMap(entry => Array.from({ length: repetitions }, (_, index) => ({ entry, pair: {
            pairId: `${entry.caseId}:${index + 1}`, caseId: entry.caseId, repeat: index + 1, baseline: null, candidate: null, judge: judgeResult([]),
        } })));
        report.pairs = planned.map(item => item.pair);
        const slots = bridge ? ['baseline', 'candidate'].flatMap(arm => planned.map(item => ({ ...item, arm })))
            : planned.flatMap(item => (item.pair.repeat % 2 ? ['baseline', 'candidate'] : ['candidate', 'baseline']).map(arm => ({ ...item, arm })));
        for (const { entry, pair, arm } of slots) {
            const { pairId, repeat } = pair;
            const settings = settingsFor(candidate, arm);
            const capture = captureFor(entry, `${invocationId}:${pairId}:${arm}`);
            const started = Date.now(); let executionStatus = 'passed'; let reasonCode = 'capture_unavailable';
            if (mode === 'model' && !bridge) {
                executionStatus = pilotLedger.blocked ? 'budget_blocked' : 'unavailable';
                reasonCode = pilotLedger.blocked ? 'finite_pilot_missing' : 'independent_model_baseline_and_generation_bridge_missing';
                capture.completeness.push('independent_model_baseline', 'live_generation_bridge');
            } else {
                try {
                    const scheduled = nativeTaskScheduler.submit({ owner: 's06-fixture', kind: 'auxiliary_task', executionClass: 'maintenance',
                        anchor: { pairId, arm }, timeoutMs: bridge ? Math.min(2147483647, bridge.timeoutMs * 6 + 30000) : nativeTaskScheduler.timeoutMs, resources: ['s06-isolated-runtime'], key: `${invocationId}:${pairId}:${arm}`,
                        fingerprint: hash([candidate, entry.caseRevision, repeat, arm]), retry: false,
                        fresh: async () => evaluationRevision() === evaluatorRevision,
                        run: async () => (entry.entrance === 'rp' ? runRp : runProject)(entry, loadFixture(entry, { purpose: 'evaluation' }), capture, {
                            settings, bridge, beforeSend(requestId) {
                                if (sent.size >= maxRequests) {
                                    capture.budgetBlocked = true;
                                    throw Object.assign(new Error('comparison_budget_blocked'), { code: 'comparison_budget_blocked' });
                                }
                                if (sent.has(requestId)) throw new Error('Duplicate comparison request');
                                sent.add(requestId);
                            },
                        }), finalize: async () => null,
                    });
                    await scheduled.result;
                } catch (error) {
                    executionStatus = capture.budgetBlocked || error.code === 'comparison_budget_blocked' ? 'budget_blocked' : 'failed';
                    reasonCode = executionStatus === 'budget_blocked' ? 'comparison_budget_blocked' : /^[a-z_]{1,100}$/.test(error.code || '') ? error.code : 'adapter_execution_failed';
                    capture.completeness.push('adapter_execution');
                }
            }
            if (bridge) {
                capture.liveIdentity = bridge.identity; capture.settings = settings;
                capture.liveObservations = bridge.observations().filter(item => item.trialId === capture.trialId);
                capture.liveLedger = bridge.budget.snapshot();
            }
            const trial = finishTrial(entry, capture, { mode, testedProductHead, executionStatus, started, reasonCode });
            pair[arm] = { envelope: envelopeFor(entry, settings, evaluatorRevision, testedProductHead, bridge?.identity), trial,
                artifact: capture.artifact ?? null };

            await onTrial(pair[arm].trial);
            if (bridge && arm === 'baseline' && pair === planned.at(-1).pair) {
                const baseline = report.pairs.map(item => ({ pairId: item.pairId, record: item.baseline }));
                report.baselineHash = hash(baseline);
                await onBaseline({ schemaVersion: 1, runId: report.runId, caseSetRevision: CASE_SET_REVISION, split, repetitions, liveIdentity: report.liveIdentity,
                    baseline, integrity: report.baselineHash });
            }
        }
        if (bridge) {
            const ids = new Set(report.pairs.flatMap(pair => [pair.baseline.trial.trialId, pair.candidate.trial.trialId]));
            report.observations = bridge.observations().filter(item => ids.has(item.trialId));
            report.ledger = bridge.budget.snapshot();
        }
        report.ablations = ['single_body', 'shared_cognition', 'critic', 'director'].map(kind => ({ kind,
            status: kind === 'director' && mode === 'scripted' ? 'scripted_observation' : 'unavailable',
            reason: kind === 'director' && mode === 'scripted' ? 'original_director_path_only_no_behavior_or_cost_evidence' : 'no_pinned_equivalent_adapter' }));
        report.summary = derived(report);
        return validateComparison(report);
    });
}

export function validateComparison(report) {
    jsonSafe(report);
    requireValue(Buffer.byteLength(JSON.stringify(report)) <= 4 * 1024 * 1024, 'Comparison report capacity exceeded');
    fields(report, ['schemaVersion', 'caseSetRevision', 'split', 'mode', 'repetitions', 'candidate', 'evaluatorRevision', 'testedProductHead', 'runId',
        'budget', 'pairs', 'judgments', 'ablations', 'liveIdentity', 'observations', 'ledger', 'baselineHash', 'summary', 'empiricalReady', 'publicationStatus']);
    requireValue(report.schemaVersion === 1 && report.caseSetRevision === CASE_SET_REVISION, 'Comparison schema/case set drift');
    assertCandidate(report.candidate);
    const cases = selectCases({ purpose: 'evaluation', split: report.split });
    requireValue(['scripted', 'model'].includes(report.mode) && Number.isSafeInteger(report.repetitions) && report.repetitions >= 1 && report.repetitions <= 3, 'Invalid comparison coverage');
    requireValue(typeof report.runId === 'string' && /^[a-f0-9-]{36}$/.test(report.runId), 'Invalid evaluation invocation');
    requireValue(digest(report.evaluatorRevision) && /^[a-f0-9]{40}$/.test(report.testedProductHead), 'Exact evaluator/HEAD required');
    fields(report.budget, ['maxRequests', 'pilot', 'liveLimits']);
    requireValue(Number.isSafeInteger(report.budget.maxRequests) && report.budget.maxRequests >= 1 && report.budget.maxRequests <= 216, 'Invalid comparison budget');
    const pilot = new PilotBudget(report.budget.pilot);
    requireValue(Array.isArray(report.pairs) && report.pairs.length === cases.length * report.repetitions, 'Missing paired coverage');
    requireValue(Array.isArray(report.observations), 'Invalid live observations');
    if (report.liveIdentity) {
        requireValue(report.mode === 'model', 'Live identity requires model mode');
        fields(report.liveIdentity, ['configurationHash', 'promptHash', 'generationHash', 'routesHash', 'modelHash', 'providerAdapter', 'model', 'tokenizer', 'upstreamStatus', 'priceStatus']);
        requireValue(['configurationHash', 'promptHash', 'generationHash', 'routesHash', 'modelHash'].every(key => digest(report.liveIdentity[key]))
            && report.liveIdentity.providerAdapter === 'provider.openai-compatible' && typeof report.liveIdentity.model === 'string' && report.liveIdentity.model
            && ['cl100k_base', 'o200k_base'].includes(report.liveIdentity.tokenizer)
            && report.liveIdentity.upstreamStatus === 'unavailable' && report.liveIdentity.priceStatus === 'unavailable', 'Invalid live configuration');
        fields(report.budget.liveLimits, ['maxRequests', 'maxTotalTokens']);
        new EvaluationBudget(report.budget.liveLimits, { snapshot: report.ledger });
        requireValue(report.ledger !== null && digest(report.baselineHash)
            && report.baselineHash === hash(report.pairs.map(pair => ({ pairId: pair.pairId, record: pair.baseline }))), 'Independent baseline binding drift');
    } else requireValue(report.observations.length === 0 && report.ledger === null && report.baselineHash === null && report.budget.liveLimits === null, 'Live evidence without bridge identity');
    const pairIds = new Set(); const requestIds = new Set(); const taskIds = new Set(); const runIds = new Set();
    for (const pair of report.pairs) {
        fields(pair, ['pairId', 'caseId', 'repeat', 'baseline', 'candidate', 'judge']);
        const entry = cases.find(item => item.caseId === pair.caseId);
        requireValue(entry && Number.isSafeInteger(pair.repeat) && pair.repeat >= 1 && pair.repeat <= report.repetitions
            && pair.pairId === `${entry.caseId}:${pair.repeat}` && !pairIds.has(pair.pairId), 'Unknown/duplicate pair');
        pairIds.add(pair.pairId);
        const fixture = loadFixture(entry, { purpose: 'evaluation' });
        const sourceHash = hash(entry.entrance === 'rp' ? fixture : projectFixtureSource(fixture.projectName, entry.fixtureHash));
        for (const arm of ['baseline', 'candidate']) {
            const record = pair[arm]; fields(record, ['envelope', 'trial', 'artifact']);
            const expected = envelopeFor(entry, settingsFor(report.candidate, arm), report.evaluatorRevision, report.testedProductHead, report.liveIdentity);
            requireValue(same(record.envelope, expected), 'Mixed execution envelope');
            validateTrial(record.trial, entry);
            requireValue(record.trial.trialId === `${report.runId}:${pair.pairId}:${arm}` && record.trial.executionMode === report.mode
                && record.trial.testedProductHead === report.testedProductHead, 'Wrong arm/trial binding');
            for (const [name, seen] of [['requestIds', requestIds], ['taskIds', taskIds], ['runIds', runIds]]) {
                for (const id of record.trial.refs[name]) { requireValue(!seen.has(id), 'Cross-arm execution identity'); seen.add(id); }
            }
            if (report.mode === 'model' && !report.liveIdentity) requireValue(record.artifact === null && record.trial.metrics.generationCalls === 0
                && record.trial.executionStatus === (pilot.blocked ? 'budget_blocked' : 'unavailable'), 'Missing live bridge cannot execute');
            if (report.liveIdentity) {
                const settings = settingsFor(report.candidate, arm);
                const config = { inputHash: entry.inputHash, promptHash: hash([entry.inputHash, entry.entrance === 'rp' ? settings.rpPrompt : settings.projectSkill, report.liveIdentity.promptHash]),
                    skillHash: hash(entry.entrance === 'rp' ? [] : settings.projectSkill), presetHash: hash(settings), pinningStatus: 'exact' };
                config.fingerprint = hash(config);
                requireValue(same(record.trial.configuration, config), 'Live resource pin drift');
                const observations = report.observations.filter(item => item.trialId === record.trial.trialId);
                const charges = Object.values(report.ledger.entries).filter(item => item.trialId === record.trial.trialId);
                requireValue(charges.length === observations.length, 'Unobserved comparison charge');
                const usage = observations.length ? { status: observations.every(item => item.usage?.totalTokens !== undefined) ? 'provider_reported' : 'reserved_upper_bound',
                    totalTokens: charges.reduce((sum, item) => sum + item.tokens, 0), externalProviderCalls: observations.length, priceStatus: 'unavailable', upstreamStatus: 'unavailable' }
                    : { status: 'unavailable', totalTokens: null, externalProviderCalls: 0, priceStatus: 'unavailable', upstreamStatus: 'unavailable' };
                requireValue(same(record.trial.usage, usage), 'Live usage drift');
            }
            if (record.artifact !== null) {
                const artifact = record.artifact;
                fields(artifact, ['domain', 'output', 'status', 'sourceHash', 'outcomeHash', 'requestHashes', 'targetConsumed']);
                requireValue(artifact.domain === (entry.entrance === 'rp' ? 'rp_chat' : 'project') && typeof artifact.output === 'string'
                    && typeof artifact.status === 'string' && artifact.sourceHash === sourceHash && digest(artifact.outcomeHash)
                    && Array.isArray(artifact.requestHashes) && artifact.requestHashes.every(digest)
                    && artifact.requestHashes.length === record.trial.metrics.generationCalls
                    && typeof artifact.targetConsumed === 'boolean', 'Invalid isolated artifact');
                requireValue(artifact.outcomeHash === (entry.entrance === 'project' ? hash(JSON.parse(artifact.output)) : hash({ mes: artifact.output, extra: { reasoning: '' }, is_user: false })), 'Artifact outcome drift');
                requireValue(report.liveIdentity || record.trial.configuration.promptHash === artifact.requestHashes[0], 'Consumed request hash drift');
                if (record.trial.executionStatus === 'passed') requireValue(artifact.targetConsumed, 'Target absent from actual request');
            } else requireValue(record.trial.executionStatus !== 'passed', 'Success without captured artifact');
        }
        if (pair.baseline.artifact && pair.candidate.artifact) requireValue(pair.baseline.artifact.sourceHash === pair.candidate.artifact.sourceHash, 'Different source inputs');
    }
    const attempts = new Set();
    for (const item of report.observations) {
        const names = ['requestId', 'inputTokens', 'snapshotHash', 'configurationHash', 'attemptId', 'trialId', 'status', 'usage', 'durationMs'];
        if (Object.hasOwn(item, 'httpStatus')) names.push('httpStatus', 'contentType');
        if (Object.hasOwn(item, 'failureCode')) names.push('failureCode');
        if (Object.hasOwn(item, 'toolNames')) names.push('toolNames', 'finalTextPresent');
        fields(item, names);
        const trial = report.pairs.flatMap(pair => [pair.baseline.trial, pair.candidate.trial]).find(trial => trial.trialId === item.trialId);
        const charge = report.ledger.entries[item.attemptId];
        requireValue(trial?.refs.requestIds.includes(item.requestId) && !attempts.has(item.attemptId)
            && charge?.trialId === item.trialId && item.attemptId.startsWith(item.requestId + ':send:')
            && Number.isSafeInteger(item.inputTokens) && item.inputTokens >= 0 && Number.isSafeInteger(item.durationMs) && item.durationMs >= 0 && digest(item.snapshotHash) && digest(item.configurationHash)
            && ['started', 'sent', 'completed', 'invalid_response', 'cancelled', 'failed'].includes(item.status), 'Unbound live observation');
        if (item.usage !== null) requireValue(Number.isSafeInteger(item.usage.totalTokens) && item.usage.totalTokens >= 0
            && charge.tokens === item.usage.totalTokens && charge.usageStatus === 'provider_reported', 'Provider usage binding drift');
        else requireValue(charge.usageStatus === 'reserved_upper_bound', 'Unknown usage refunded');
        if (Object.hasOwn(item, 'httpStatus')) requireValue(Number.isSafeInteger(item.httpStatus) && item.httpStatus >= 100 && item.httpStatus <= 599 && typeof item.contentType === 'string', 'Invalid HTTP observation');
        if (Object.hasOwn(item, 'failureCode')) requireValue(['UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'aborted', 'transport_error'].includes(item.failureCode), 'Invalid transport observation');
        if (Object.hasOwn(item, 'toolNames')) requireValue(item.status === 'completed' && Array.isArray(item.toolNames)
            && item.toolNames.every(name => typeof name === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(name)) && typeof item.finalTextPresent === 'boolean', 'Invalid tool observation');
        attempts.add(item.attemptId);
    }
    requireValue(requestIds.size <= report.budget.maxRequests, 'Observed sends exceed budget');
    requireValue(Array.isArray(report.judgments) && report.judgments.length <= report.pairs.length * 3, 'Judgment capacity exceeded');
    const judgments = new Set();
    for (const vote of report.judgments) {
        fields(vote, ['pairId', 'judgeId', 'source', 'preference', 'binding']);
        const pair = report.pairs.find(item => item.pairId === vote.pairId);
        requireValue(pair?.baseline.artifact && pair?.candidate.artifact && typeof vote.judgeId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(vote.judgeId)
            && vote.source === 'human' && ['left', 'right', 'tie', 'uncertain'].includes(vote.preference)
            && vote.binding === hash([pair.baseline.artifact, pair.candidate.artifact, pair.baseline.envelope, pair.candidate.envelope]), 'Unbound/unsupported judgment');
        const id = vote.pairId + ':' + vote.judgeId;
        requireValue(!judgments.has(id), 'Duplicate judge'); judgments.add(id);
    }
    for (const pair of report.pairs) {
        const votes = report.judgments.filter(vote => vote.pairId === pair.pairId);
        requireValue(votes.length <= 3 && same(pair.judge, judgeResult(votes)), 'Forged judgment/disagreement or judge capacity');
    }
    requireValue(Array.isArray(report.ablations) && same(report.ablations, ['single_body', 'shared_cognition', 'critic', 'director'].map(kind => ({ kind,
        status: kind === 'director' && report.mode === 'scripted' ? 'scripted_observation' : 'unavailable',
        reason: kind === 'director' && report.mode === 'scripted' ? 'original_director_path_only_no_behavior_or_cost_evidence' : 'no_pinned_equivalent_adapter' }))), 'Ablation availability drift');
    requireValue(same(report.summary, derived(report)) && report.empiricalReady === false && report.publicationStatus === 'ineligible', 'Forged comparison eligibility/summary');
    return report;
}

// Explicit evaluator-only projection; an extraction caller gets no promotion output.
export function blindPair(report, pairId, { purpose } = {}) {
    validateComparison(report);
    selectCases({ purpose, split: report.split });
    requireValue(purpose === 'evaluation', 'Blind judgment is evaluator-only');
    const pair = report.pairs.find(item => item.pairId === pairId);
    requireValue(pair?.baseline.artifact && pair?.candidate.artifact, 'Pair outputs unavailable');
    const reversed = parseInt(hash(pairId).slice(0, 2), 16) % 2 === 1;
    return { pairId, binding: hash([pair.baseline.artifact, pair.candidate.artifact, pair.baseline.envelope, pair.candidate.envelope]),
        left: pair[reversed ? 'candidate' : 'baseline'].artifact.output, right: pair[reversed ? 'baseline' : 'candidate'].artifact.output };
}
export function recordJudgment(report, vote) {
    validateComparison(report);
    const next = structuredClone(report); next.judgments.push(structuredClone(vote));
    for (const pair of next.pairs) pair.judge = judgeResult(next.judgments.filter(item => item.pairId === pair.pairId));
    next.summary = derived(next);
    return validateComparison(next);
}
