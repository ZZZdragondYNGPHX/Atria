// Disposable S23 fixture. Explicit --live uses the shared private test quota.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { fetch as httpFetch, Agent } from 'undici';
import { setConfigFilePath } from '../../src/util.js';
import { FsEngine } from '../../src/storage/engines/fs-engine.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { PredictionService, PREDICTION_OUTPUT_SCHEMA } from '../../src/native/prediction-service.js';
import { assertTaskValue } from '../../public/shared/native-task-contract.js';
import { projectInformation } from '../../public/shared/native-information-runtime.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { seedGenerationProfiles } from '../native/helpers/generation-fixture.js';
import { withPrivateTestRun } from './private-test-run.js';
import { installedPredictionFixture } from '../native/helpers/prediction-fixture.js';

setConfigFilePath(fileURLToPath(new URL('../../default/config.yaml', import.meta.url)));
globalThis.Atria = { getContext: () => ({ constants: { promptRoles: { SYSTEM: 0, USER: 1, ASSISTANT: 2 }, wiPosition: { before: 0, after: 1 } },
    skills: { list: async () => [], invocationSettings: async () => ({ skills: {} }) } }) };
const preflightOnly = !process.argv.includes('--live') || process.argv.includes('--preflight');
const summary = { stage: 'S23', status: 'started', apiRequests: 0, checks: {}, usage: [], failures: [],
    limitations: ['finite synthetic observation/action', 'confidence uncalibrated', 'real outcome not observed', 'currency and upstream retries unknown', 'raw material discarded'] };
const hash = hashNativeDocument;
function harness(directory) {
    const root = path.join(directory, 's23-fs'), dirs = { root };
    for (const key of ['assets', 'files', 'characters', 'chats', 'user', 'worlds']) {
        dirs[key] = path.join(root, key); fs.mkdirSync(dirs[key], { recursive: true });
    }
    return { handle: 's23', dirs, engine: new FsEngine({ directoriesByHandle: handle => {
        assert.equal(handle, 's23'); return dirs;
    } }) };
}
function costs(control) {
    const retired = control?.retiredCompute ?? {}, operations = Object.values(control?.operations ?? {});
    const attempts = operations.flatMap(op => op.compute?.attempts ?? []);
    return { attempts: (retired.modelAttempts ?? 0) + attempts.length,
        knownTokens: (retired.knownTotalTokens ?? 0) + attempts.reduce((n, row) => n + (row.usage?.totalTokens ?? 0), 0),
        unknownAttempts: (retired.unknownAttempts ?? 0) + attempts.filter(row => row.usage?.totalTokens == null).length,
        unknownUpperTokens: (retired.unknownUpperTokens ?? 0) + attempts.filter(row => row.usage?.totalTokens == null).reduce((n, row) => n + row.estimatedTokens, 0),
        localJobs: (retired.localJobs ?? 0) + operations.flatMap(op => op.compute?.localWork ?? []).length };
}
async function runStage(run) {
    summary.phase = 'connection';
    const config = run.connection();
    assert(config.apiKey && config.endpoint && config.model, 's23_connection_missing');
    const url = new URL(config.endpoint);
    if (/\/v1\/?$/.test(url.pathname)) url.pathname = url.pathname.replace(/\/$/, '') + '/chat/completions';
    const h = harness(run.directory);
    const dispatcher = new Agent({ connect: { timeout: 30000 }, headersTimeout: 240000, bodyTimeout: 240000 });
    let tracked;
    try {
        summary.phase = 'fixture';
        const seeded = await seedGenerationProfiles({ ...h, endpoint: url.toString() });
        const f = await installedPredictionFixture(h, seeded.routes[0].runtimeRouteId, fixture => {
            const resources = fixture.base.manifest.resources;
            resources.find(item => item.resourceType === 'core.generation-profile').resource.output.maxTokens = 2048;
            resources.find(item => item.resourceType === 'core.prompt-module').resource.body += ' Write concise Chinese. Preserve uncertainty; describe possible consequences, never assert that the action already happened. Return only the requested JSON object.';
        });
        const base = f.base;
        await seeded.persistence.saveModelProfile(h.handle, { ...seeded.model, remoteModelId: config.model,
            limits: { contextTokens: config.contextTokens, outputTokens: 2048 }, tokenizer: { encoding: config.tokenizer, source: 'explicit_s23_private_config' } });
        for (const route of seeded.routes) await seeded.persistence.saveRuntimeRoute(h.handle, { ...route,
            policy: { timeoutMs: config.timeoutMs, maxRetries: 0, maxFallbackAttempts: 0 }, executionPolicy: { schemaVersion: 1,
                allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget: { maxRequests: 1, maxTokens: 64000,
                    localWork: { maxJobs: 32, maxItems: 4096, maxInputBytes: 16777216 } } } });
        const underlying = createHttpGenerationProvider({ fetchImpl: async (endpoint, options) => {
            assert(!preflightOnly, 's23_preflight_send_denied');
            await run.quota.waitAvailable(options.signal); run.quota.admit('s23-' + randomUUID()); summary.apiRequests++;
            const response = await httpFetch(endpoint, { ...options, dispatcher });
            summary.httpStatus = response.status; return response;
        } });
        const provider = { ...underlying, normalizeResponse(raw) {
            summary.usage.push({ finishReason: raw.choices?.[0]?.finish_reason ?? 'unknown',
                inputTokens: raw.usage?.prompt_tokens ?? null, outputTokens: raw.usage?.completion_tokens ?? null, totalTokens: raw.usage?.total_tokens ?? null });
            return underlying.normalizeResponse(raw);
        } };
        const host = new NativeGenerationHost({ ...seeded, sessionCore: f.core, packageInstaller: f.packageInstaller,
            secretPort: { resolveSecret: async () => config.apiKey }, providers: { 'provider.openai-compatible': provider } });
        const service = new PredictionService({ host });
        const observation = projectInformation(base, 'player.notes', { purpose: 'display', includeRollups: false });
        const request = { ...f.body, request: { ...f.body.request, invocationId: 's23-' + randomUUID() } };
        const before = hash({ revision: base.revision, states: base.states, timeline: base.timeline });
        const controlBefore = costs(await f.core.runs.status(h.handle, base.session.sessionId));
        tracked = { core: f.core, sessionId: base.session.sessionId, before, controlBefore };
        summary.phase = 'preflight';
        const preview = await service.preflight(h.handle, request);
        const context = JSON.stringify(preview.snapshot.contextPlan);
        assert(!context.includes('PRIVATE PREDICTION SENTINEL'), 's23_private_context');
        assert(context.includes('observation') && context.includes('action'), 's23_narrow_context_missing');
        assert.equal(summary.apiRequests, 0);
        assert.deepEqual(costs(await f.core.runs.status(h.handle, base.session.sessionId)), controlBefore);
        summary.checks.zeroSendPreflight = true;
        if (!preflightOnly) {
            summary.phase = 'prediction';
            const artifact = await service.prepare(h.handle, { ...request, request: { ...request.request, invocationId: 's23-' + randomUUID() } });
            assert.equal(artifact.kind, 'hypothetical'); assert.equal(artifact.mode, 'model_prediction');
            assert.equal(artifact.uncertainty.realOutcome, 'not_observed');
            assertTaskValue({ prediction: artifact.prediction, assumptions: artifact.assumptions, supportRefs: artifact.supportRefs,
                uncertainty: { confidence: artifact.uncertainty.confidence, limitations: artifact.uncertainty.limitations } }, PREDICTION_OUTPUT_SCHEMA);
            const refs = new Set(observation.items.map(item => item.id));
            assert(artifact.supportRefs.every(ref => refs.has(ref)), 's23_support_ref_denied');
            assert(!JSON.stringify(artifact).includes('PRIVATE PREDICTION SENTINEL'), 's23_private_output');
            summary.cost = costs(await f.core.runs.status(h.handle, base.session.sessionId));
            assert.equal(summary.apiRequests, 1); assert.equal(summary.cost.attempts - controlBefore.attempts, 1);
            assert(summary.cost.knownTokens > controlBefore.knownTokens || summary.cost.unknownAttempts > controlBefore.unknownAttempts, 's23_cost_missing');
            summary.output = { predictionCharacters: artifact.prediction.length, assumptions: artifact.assumptions.length,
                supportRefs: artifact.supportRefs.length, limitations: artifact.uncertainty.limitations.length,
                outputHash: hash(artifact), requestSnapshotHash: artifact.execution.requestSnapshotHash };
            summary.checks.typedOutputAndChargedAttempt = true;
        }
        const after = await f.core.load(h.handle, base.session.sessionId);
        assert.equal(hash({ revision: after.revision, states: after.states, timeline: after.timeline }), before, 's23_state_changed');
        summary.checks.revisionWorldClockMemoryTimelineOutboxTaskResultsUnchanged = true;
        summary.status = preflightOnly ? 'preflight_passed' : 'finite_provider_exit_passed';
        delete summary.phase; return summary;
    } finally {
        try {
            if (tracked) {
                const current = await tracked.core.load(h.handle, tracked.sessionId);
                summary.cost = costs(await tracked.core.runs.status(h.handle, tracked.sessionId));
                summary.checks.revisionWorldClockMemoryTimelineOutboxTaskResultsUnchanged = hash({ revision: current.revision, states: current.states, timeline: current.timeline }) === tracked.before;
                summary.checks.previousComputePreserved = summary.cost.attempts >= tracked.controlBefore.attempts
                    && summary.cost.knownTokens >= tracked.controlBefore.knownTokens && summary.cost.unknownAttempts >= tracked.controlBefore.unknownAttempts;
            }
        } finally { h.engine.close?.(); await dispatcher.close(); }
    }
}
try {
    const privateRoot = execFileSync('git', ['config', '--get', 'atria.private.directory'], { encoding: 'utf8' }).trim();
    const directory = path.basename(privateRoot).toLowerCase() === 'document' ? privateRoot : path.join(privateRoot, 'Document');
    const result = await withPrivateTestRun(directory, runStage);
    console.log(JSON.stringify(result));
} catch (error) {
    summary.status = 'failed';
    summary.failures.push({ code: /^[a-zA-Z0-9_:-]{1,120}$/.test(error?.code ?? '') ? error.code : 's23_local_or_transport_failure', phase: summary.phase ?? 'configuration',
        localMessage: summary.phase === 'fixture' ? String(error.message).slice(0, 160) : undefined });
    console.log(JSON.stringify(summary)); process.exitCode = 1;
}
