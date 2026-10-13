// Disposable finite S34 pilot. Production policy, promotion and user stores stay unchanged.
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { fetch as httpFetch, Agent } from 'undici';
import { setConfigFilePath } from '../../src/util.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { EvolutionEvaluator } from '../../src/native/agent-intelligence/evolution-evaluator.js';
import { withPrivateTestRun } from './private-test-run.js';
import { m1EvaluationConfiguration, sendM1Evaluation } from './m1-grader.js';

setConfigFilePath(fileURLToPath(new URL('../../default/config.yaml', import.meta.url)));
globalThis.Atria = { getContext: () => ({ constants: { promptRoles: { SYSTEM: 0, USER: 1, ASSISTANT: 2 }, wiPosition: { before: 0, after: 1 } },
    skills: { list: async () => [], invocationSettings: async () => ({ skills: {} }) } }) };
const { evolutionFixture } = await import('./evolution-fixture.js');
const { makeTempFsEngineHarness } = await import('../storage/harness/contract-harness.js');
const live = process.argv.includes('--live') && !process.argv.includes('--preflight');
const summary = { stage: 'S34', status: 'started', apiRequests: 0, attempts: [], domains: [], failures: [],
    limitations: ['public_synthetic_fixture_only', 'one_development_pair_per_domain', 'not_promotion_acceptance',
        'no_human_preference_fabricated', 'no_automatic_publication', 'currency_and_upstream_retries_unknown', 'raw_material_discarded'] };
const safeReason = error => /^[a-z_0-9:-]{1,120}$/i.test(error?.code || error?.message || '') ? error.code || error.message : 's34_local_or_transport_failure';
const totals = owner => ({ attempts: owner.attempts.length,
    reportedTokens: owner.attempts.filter(value => value.status === 'reported').reduce((sum, value) => sum + value.tokens, 0),
    unknownAttempts: owner.attempts.filter(value => value.status !== 'reported').length,
    unknownUpperTokens: owner.attempts.filter(value => value.status !== 'reported').reduce((sum, value) => sum + value.tokens, 0),
    monetaryCost: null });

async function runStage(run) {
    const privateConfig = run.connection();
    assert(privateConfig.apiKey && privateConfig.endpoint && privateConfig.model, 's34_connection_missing');
    const connectionConfig = { endpoint: privateConfig.endpoint, model: privateConfig.model, tokenizer: privateConfig.tokenizer,
        contextTokens: privateConfig.contextTokens, maxOutputTokens: 8000,
        // Only the fixture's never-sent seed bridge consumes these legacy constructor fields.
        timeoutMs: privateConfig.timeoutMs, maxRequests: 1, maxTotalTokens: Number.MAX_SAFE_INTEGER };
    const dispatcher = new Agent({ connect: { timeout: 30000 }, headersTimeout: 240000, bodyTimeout: 240000 });
    try {
        for (const [domain, kind, caseId] of [['rp', 'workspace-prompt', 'rp_agency_d1'], ['project', 'project-prompt', 'project_authoring_d1']]) {
            let f, fixtureStore;
            const result = { domain, status: 'started', phase: 'fixture', checks: {} };
            summary.domains.push(result);
            try {
                f = await evolutionFixture(async () => { fixtureStore = await makeTempFsEngineHarness(); return fixtureStore; }, kind, { realEvaluator: true, policyMode: 'review', confirmedPrice: null, connectionConfig,
                    fetchImpl: async (endpoint, options) => {
                        assert(live, 's34_preflight_send_denied');
                        await run.quota.waitAvailable(options.signal); run.quota.admit('s34-' + randomUUID()); summary.apiRequests++;
                        const attempt = { domain, ordinal: summary.apiRequests, httpStatus: null }; summary.attempts.push(attempt);
                        try {
                            const response = await httpFetch(endpoint, { ...options, dispatcher });
                            attempt.httpStatus = response.status;
                            return response;
                        } catch (error) { attempt.failure = safeReason(error.cause ?? error); throw error; }
                    },
                    configureEvaluator(evaluator) {
                        // Reuse the existing explicit local evaluation envelope for configured output capacity.
                        evaluator.configuration = (handle, routeId, projectPromptRef = null) => m1EvaluationConfiguration(evaluator.host, handle, routeId, projectPromptRef);
                        evaluator.send = (handle, job, config, payload, signal, fresh) => sendM1Evaluation(evaluator, handle,
                            { ...job, m1Envelope: 'm1-configured-output-v1', price: null }, config, payload, signal, fresh);
                        evaluator.compare = (handle, job, configs, settings, signal, fresh) => EvolutionEvaluator.prototype.compare.call(evaluator,
                            handle, job, configs, settings, signal, fresh, async () => {}, async () => {}, { split: 'development', repetitions: 1, caseIds: [caseId] });
                    } });
                f.host.secretPort = { resolveSecret: async () => privateConfig.apiKey };
                const provider = f.host.providers['provider.openai-compatible'], parse = provider.parseStream.bind(provider);
                f.host.providers['provider.openai-compatible'] = { ...provider, parseStream: async response => {
                    const raw = await parse(response), attempt = summary.attempts.at(-1);
                    if (attempt) Object.assign(attempt, { finishReason: raw.choices?.[0]?.finish_reason ?? null,
                        inputTokens: raw.usage?.prompt_tokens ?? null, outputTokens: raw.usage?.completion_tokens ?? null, totalTokens: raw.usage?.total_tokens ?? null });
                    return raw;
                } };
                result.phase = 'metadata';
                const capture = await f.service.targets.capture(f.h.handle, f.scope, f.subject, f.target);
                const experience = await f.service.experience.inspect(f.h.handle, { scope: f.scope, subject: f.subject });
                const trajectory = await f.service.experience.exportLearning(f.h.handle, { scope: f.scope, subject: f.subject,
                    expectedSequence: experience.sequence, purpose: 'offline-analysis' });
                const before = await f.repository.get(f.h.handle, f.scope, f.subject);
                result.trajectory = { integrity: trajectory.integrity, records: trajectory.records.length, sequence: trajectory.sequence };
                result.checks.zeroSendPreflight = (await f.repository.owner(f.h.handle)).attempts.length === 0;
                if (live) {
                    result.phase = 'optimizer';
                    const started = await f.service.startLearning(f.h.handle, { scope: f.scope, subject: f.subject, expectedSequence: before.sequence,
                        backend: 'native-prompt-optimizer-v1', purpose: 'prompt-optimization', trajectory });
                    result.jobId = started.jobId;
                    await f.service.wait(f.h.handle, started.jobId);
                    const current = await f.repository.get(f.h.handle, f.scope, f.subject), job = current.jobs.find(item => item.id === started.jobId);
                    const candidate = job.candidates[0], report = candidate?.report;
                    assert.equal(job.learning.trajectoryHash, trajectory.integrity, 's34_learning_pin_missing');
                    result.jobStatus = job.status;
                    result.report = report ? { origin: report.origin, reason: report.reason ?? null, pairs: report.pairs.length,
                        pairsSummary: report.pairs.map(pair => ({ caseId: pair.case.caseId, human: pair.human,
                            judge: pair.judge ? { preference: pair.judge.preference, deltas: pair.judge.deltas } : null,
                            baseline: { error: pair.baseline.error, checks: pair.baseline.checks, outputHash: hash(pair.baseline.output) },
                            candidate: { error: pair.candidate.error, checks: pair.candidate.checks, outputHash: hash(pair.candidate.output) } })) } : null;
                    result.decision = candidate?.decision ?? null;
                    assert.equal(job.status, 'awaiting_review', 's34_optimizer_incomplete');
                    assert.equal(report?.origin, 'host_evaluator', 's34_evaluation_unavailable');
                    assert.equal(report.pairs.length, 1, 's34_finite_pair_missing');
                    assert(report.pairs.every(pair => pair.human === null), 's34_fabricated_human_preference');
                    assert.equal(candidate.decision.eligible, false, 's34_promotion_gate_bypassed');
                    assert.equal(current.publications.length, 0, 's34_unexpected_publication');
                    assert.equal(hash(await f.service.targets.capture(f.h.handle, f.scope, f.subject, f.target)), hash(capture), 's34_effective_base_changed');
                    result.checks.exactProvenanceAndReviewGate = true;
                    const pair = report.pairs[0];
                    result.checks.bothActualOutputs = Boolean(pair.baseline.output && pair.candidate.output && !pair.baseline.error && !pair.candidate.error);
                    result.checks.hardChecks = ['baseline', 'candidate'].every(arm => [...pair.case.expectedInvariants, 'isolation', 'target_consumed'].every(key => pair[arm].checks[key] === true));
                    result.checks.judgeValid = ['baseline', 'candidate', 'tie', 'uncertain'].includes(pair.judge?.preference)
                        && Object.keys(pair.judge?.deltas ?? {}).length === pair.case.behaviorDimensions.length
                        && pair.case.behaviorDimensions.every(key => Number.isInteger(pair.judge.deltas[key]) && Math.abs(pair.judge.deltas[key]) <= 4);
                    result.status = result.checks.bothActualOutputs && result.checks.hardChecks && result.checks.judgeValid ? 'finite_provider_exit_passed' : 'finite_quality_failed';
                } else result.status = 'preflight_passed';
            } catch (error) {
                result.status = 'failed'; result.failure = safeReason(error);
                if (result.phase === 'fixture') result.localFailure = String(error.message).replaceAll(privateConfig.apiKey, '[secret]')
                    .replaceAll(privateConfig.endpoint, '[endpoint]').replaceAll(privateConfig.model, '[model]').slice(0, 160);
                summary.failures.push({ domain, phase: result.phase, code: result.failure });
            } finally {
                if (f) {
                    result.cost = totals(await f.repository.owner(f.h.handle));
                    for (const operation of f.service.scheduler.operations.values()) f.service.scheduler.cancel(f.h.handle, operation.view.operationId);
                    while (f.service.scheduler.running.size) await new Promise(resolve => setTimeout(resolve, 5));
                    await f.h.cleanup();
                } else await fixtureStore?.cleanup();
            }
            delete result.phase;
            console.log(JSON.stringify({ stage: 'S34', domain, status: result.status, apiRequests: summary.apiRequests, cost: result.cost }));
        }
    } finally { await dispatcher.close(); }
    summary.status = summary.domains.every(value => value.status === (live ? 'finite_provider_exit_passed' : 'preflight_passed'))
        ? live ? 'finite_provider_exit_passed' : 'preflight_passed' : 'finite_pilot_incomplete';
    return summary;
}

try {
    const privateRoot = execFileSync('git', ['config', '--get', 'atria.private.directory'], { encoding: 'utf8' }).trim();
    const directory = path.basename(privateRoot).toLowerCase() === 'document' ? privateRoot : path.join(privateRoot, 'Document');
    await withPrivateTestRun(directory, runStage);
} catch (error) { summary.status = 'failed'; summary.failures.push({ code: safeReason(error), phase: 'configuration_or_cleanup' }); }
console.log(JSON.stringify(summary));
if (!['finite_provider_exit_passed', 'preflight_passed'].includes(summary.status)) process.exitCode = 1;
