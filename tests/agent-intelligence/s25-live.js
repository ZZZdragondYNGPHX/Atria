// Finite ordinary fast/slow comparison. --live alone uses the shared API quota.
// Both arms use real installed Session, original Host/writer and identical facts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fetch as httpFetch, Agent } from 'undici';
import { setConfigFilePath } from '../../src/util.js';
import { FsEngine } from '../../src/storage/engines/fs-engine.js';
import { createNativeId } from '../../src/native/identity.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { projectInformation } from '../../public/shared/native-information-runtime.js';
import { sessionFixture, installFixture } from '../native/helpers/session-fixture.js';
import { lifecycleFixture } from '../native/helpers/lifecycle-fixture.js';
import { closed, authorityFixture } from '../native/helpers/authority-fixture.js';
import { seedGenerationProfiles } from '../native/helpers/generation-fixture.js';
import { withPrivateTestRun } from './private-test-run.js';

setConfigFilePath(fileURLToPath(new URL('../../default/config.yaml', import.meta.url)));
globalThis.Atria = { getContext: () => ({ constants: { promptRoles: { SYSTEM: 0, USER: 1, ASSISTANT: 2 }, wiPosition: { before: 0, after: 1 } },
    skills: { list: async () => [], invocationSettings: async () => ({ skills: {} }) } }) };
assert(process.argv.slice(2).every(flag => ['--live', '--preflight'].includes(flag)), 'Supported modes: --live or --preflight');
const live = process.argv.includes('--live') && !process.argv.includes('--preflight');
const facts = '公开配送资料：当前09:30，车辆总重420公斤，目的地最晚10:15收货。南桥用时20分钟，但限重300公斤；山路不限重，用时50分钟；北堤限重600公斤，用时35分钟。没有其它道路、特殊通行许可或运输工具。现在尚未出发。用户要求：比较三条路线，推荐可行路线并说明排除理由，不代替用户决定出发。';
const narratorPrompt = '仅根据公开配送资料回答用户。若存在后台建议，它只是有待核对的建议，不能替代原资料。输出规定JSON envelope，narrative为自然中文正文，使用“推荐路线：…；预计到达：…；排除理由：…；行动状态：待你确认”格式；给出计算依据，不补充未给出的事实，不声称已经出发或完成配送。outcomes和diagnostics为空数组。';
const slowPrompt = '你是作品显式声明的后台路线复核Task。仅根据公开配送资料比较所有路线的重量和时间条件，计算到达时刻。输出JSON {"text":"简短中文复核建议"}，它只是建议，不代表已经执行，不新增事实。';
const computeBudget = { maxRequests: 3, maxTokens: 96000, localWork: { maxJobs: 32, maxItems: 128, maxInputBytes: 16777216 } };
const summary = { stage: 'S25', status: 'started', apiRequests: 0, sends: [], arms: {}, failures: [],
    predeclaredQualityFloor: ['recommend_north_embankment', 'arrival_10_05', 'reject_overweight_south_bridge', 'reject_late_mountain_route', 'await_user_confirmation'],
    limitations: ['One finite synthetic RP Session task, not general hard-case quality or Project slow-path acceptance',
        'Quality floor uses fixed factual/textual checks; it is not a full semantic or human preference evaluation',
        'Fast and slow both receive all original facts; slow alone consumes one actual authored background advisory',
        'Single sequential timing observations do not establish latency benefit; background completion is included in total slow time',
        'No default classifier, new scheduler or production policy changes', 'No automatic durable app-closed wake claim',
        'Provider currency and upstream retries unknown', 'Raw input/output fixtures are discarded'] };
const safeReason = error => /^[a-z0-9_:-]{1,120}$/i.test(error?.code ?? '') ? error.code : 's25_local_or_transport_failure';

function makeHarness(directory, arm) {
    const root = path.join(directory, arm), dirs = { root };
    for (const key of ['assets', 'files', 'characters', 'chats', 'user', 'worlds']) { dirs[key] = path.join(root, key); fs.mkdirSync(dirs[key], { recursive: true }); }
    return { handle: 's25', dirs, engine: new FsEngine({ directoriesByHandle: owner => { assert.equal(owner, 's25'); return dirs; } }) };
}
function costs(control) {
    const retired = control?.retiredCompute ?? {}, ledgers = Object.values(control?.operations ?? {}).flatMap(row => row.compute ? [row.compute] : []);
    const attempts = ledgers.flatMap(row => row.attempts), work = ledgers.flatMap(row => row.localWork ?? []);
    return { attempts: (retired.modelAttempts ?? 0) + attempts.length,
        knownTokens: (retired.knownTotalTokens ?? 0) + attempts.reduce((sum, row) => sum + (row.usage?.totalTokens ?? 0), 0),
        unknownAttempts: (retired.unknownAttempts ?? 0) + attempts.filter(row => row.usage?.totalTokens == null).length,
        unknownUpperTokens: (retired.unknownUpperTokens ?? 0) + attempts.filter(row => row.usage?.totalTokens == null).reduce((sum, row) => sum + row.estimatedTokens, 0),
        localJobs: (retired.localJobs ?? 0) + work.length,
        localWallMs: (retired.localWallMs ?? 0) + work.reduce((sum, row) => sum + (row.usage?.wallMs ?? 0), 0),
        localEstimatedInputBytes: (retired.localEstimatedInputBytes ?? 0) + work.reduce((sum, row) => sum + row.estimatedInputBytes, 0),
        localFailedJobs: (retired.localFailedJobs ?? 0) + work.filter(row => row.usage?.outcome === 'failed').length,
        unknownLocalJobs: (retired.localUnknownJobs ?? 0) + work.filter(row => !row.usage).length };
}
function fixture() {
    const f = sessionFixture(), { taskRuntime, lifecycleRuntime } = lifecycleFixture(), authority = authorityFixture();
    const textSchema = closed({ text: { type: 'string', maxLength: 2048 } });
    const notes = lifecycleRuntime.domains[0];
    notes.recordSchema = textSchema; notes.commands = [{ id: 'save', argsSchema: textSchema, event: 'notes.saved', assign: { text: { formula: 'args.text' } } }];
    lifecycleRuntime.domains.push({ ...structuredClone(notes), id: 'facts', initial: { text: facts } });
    const counter = closed({ effectiveTurns: { type: 'integer', minimum: 0, maximum: 1000000 } });
    lifecycleRuntime.domains.push({ ...structuredClone(notes), id: 'progress', recordSchema: counter, initial: { effectiveTurns: 0 },
        commands: [{ id: 'advance', argsSchema: counter, event: 'progress.changed', assign: { effectiveTurns: { formula: 'args.effectiveTurns' } } }] });
    lifecycleRuntime.workflows = [];
    const slow = taskRuntime.tasks[0]; slow.context = ['projection'];
    slow.resultPolicy = { resultClass: 'declared_app_command', sink: 'app_command' };
    slow.variants[0].outputSchema = textSchema;
    slow.variants[0].resultBinding = { kind: 'app.command', domainId: 'notes', commandId: 'save', recordId: 'main' };
    lifecycleRuntime.automations[0].action = { kind: 'task', taskId: slow.id, variantId: 'default', input: {} };
    const narrative = { id: 'narrate', bindingSlotId: 'structured', executionClass: 'turn_blocking', inputSchema: closed({ stages: { type: 'array', maxItems: 0, items: closed({}) } }),
        context: ['projection'], resultPolicy: { resultClass: 'presentation', sink: 'artifact' }, variants: [{ id: 'default',
            prompt: { resourceId: createNativeId('promptProgram'), revision: 'r1' }, generation: { resourceId: createNativeId('generationProfile'), revision: 'r1' }, requiredCapabilities: [],
            outputSchema: closed({ schemaVersion: { type: 'integer', minimum: 1, maximum: 1 }, narrative: { type: 'string', minLength: 1, maxLength: 2400 },
                outcomes: { type: 'array', maxItems: 0, items: closed({}) }, diagnostics: { type: 'array', maxItems: 0, items: closed({}) } }) }] };
    taskRuntime.tasks.push(narrative); taskRuntime.turn = { policy: 'authority-first', stages: [], narratorTaskId: 'narrate' };
    const resources = [];
    for (const [task, body] of [[slow, slowPrompt], [narrative, narratorPrompt]]) {
        const variant = task.variants[0], moduleId = createNativeId('promptModule');
        resources.push({ resourceType: 'core.prompt-module', resource: { schemaVersion: 1, promptModuleId: moduleId, revision: 'r1', displayName: task.id,
            target: 'system.foundation', stages: ['stage.main'], body } },
        { resourceType: 'core.prompt-program', resource: { schemaVersion: 1, promptProgramId: variant.prompt.resourceId, revision: 'r1', displayName: task.id,
            stages: [{ stageId: 'stage.main', moduleRefs: [{ resourceType: 'core.prompt-module', scope: 'package', packageId: f.manifest.packageId,
                packageVersionId: f.manifest.packageVersionId, resourceId: moduleId, revision: 'r1' }] }] } },
        { resourceType: 'core.generation-profile', resource: { schemaVersion: 1, generationProfileId: variant.generation.resourceId, revision: 'r1', displayName: task.id, output: { maxTokens: 4096 } } });
    }
    f.manifest.resources = resources.map(item => ({ ...item, origin: { scope: 'package', packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId } }));
    const source = (id, domainId) => ({ id, kind: 'application', semantic: 'truth', scopeId: 'session', domainId, fields: [['text']] });
    const view = (id, taskId, sources) => ({ id, audience: 'task', taskId, sources, exposure: ['context'], knowledge: false, memory: false, maxItems: 8, maxCharacters: 8192 });
    const playerView = { id: 'player.facts', audience: 'player', sources: ['facts'], exposure: ['display'], knowledge: false, memory: false, maxItems: 8, maxCharacters: 8192 };
    const narratorView = { ...playerView, id: 'narrator.facts', audience: 'narrator', sources: ['facts', 'background.advice'], exposure: ['context'] };
    const authorityRuntime = { ...authority.contract.authorityRuntime, intentObservation: { viewIds: ['player.facts'], maxItems: 8, maxBytes: 16384 } };
    const transaction = { ...authority.logic.transactions[0], id: 'request.review', verb: 'request_review', inputSchema: closed({}),
        reads: [], validators: [], resolution: { kind: 'deterministic', cases: [], fallback: 'success' }, effects: [], derivedPublications: [],
        receipt: { schema: closed({ label: { type: 'string', maxLength: 128 } }), projection: { label: 'Review requested; vehicle remains stationary.' }, maxBytes: 32768 } };
    f.sourceFiles = new Map([['logic.json', Buffer.from(JSON.stringify({ ...authority.logic, transactions: [transaction], derivedPublications: [] }))]]);
    f.manifest.runtime = { game: { logic: 'logic.json' }, experienceContract: { schemaVersion: 1, capabilities: [
        { id: 'generation-budget', version: 1, required: true }, { id: 'authority-transaction', version: 1, required: true }], dataResources: [], taskRuntime, lifecycleRuntime, authorityRuntime,
    informationRuntime: { schemaVersion: 1, actors: [], graphs: [], sources: [source('facts', 'facts'), source('background.advice', 'notes')],
        views: [view('slow.input', 'summarize', ['facts']), view('narrator.input', 'narrate', ['facts', 'background.advice']), playerView, narratorView] },
    generationBudget: { schemaVersion: 1, resolverAttempts: 1, narratorAttempts: 2, turnAttempts: 2,
        backgroundAttempts: 1, backgroundWindowTurns: 4, backgroundPeriodTurns: 20, backgroundPeriodAttempts: 1,
        turnCounter: { domainId: 'progress', recordId: 'main', field: 'effectiveTurns' } } } };
    return f;
}
function grade(text) {
    return { recommend_north_embankment: /推荐路线[：:]\s*北堤/.test(text), arrival_10_05: /预计到达[：:]\s*10[：:]05/.test(text),
        reject_overweight_south_bridge: text.includes('南桥') && /超重|超过.*300|420.*300/.test(text),
        reject_late_mountain_route: text.includes('山路') && /10[：:]20/.test(text) && /10[：:]15|迟|超过|晚于/.test(text),
        await_user_confirmation: /行动状态[：:]\s*待你确认/.test(text) && !/已(经)?(出发|抵达|送达|完成配送)/.test(text) };
}
async function arm(run, config, template, label, dispatcher) {
    const h = makeHarness(run.directory, label), result = { status: 'started', phases: {}, quality: null };
    summary.arms[label] = result;
    let f, base, activeSend, stage = 'fixture';
    const start = performance.now(), cpu = process.cpuUsage();
    try {
        f = await installFixture(h, template); base = await f.core.create(h.handle, f.start);
        const command = async action => { base = await f.core.applyLifecycleCommand(h.handle, base.session.sessionId,
            { type: 'lifecycle', invocationId: randomUUID(), action }, { expectedRevisionId: base.revision.revisionId }); };
        await command({ kind: 'experience.ready' });
        await command({ kind: 'app.command', domainId: 'facts', commandId: 'save', recordId: 'main', args: { text: facts } });
        await command({ kind: 'app.command', domainId: 'progress', commandId: 'advance', recordId: 'main', args: { effectiveTurns: 4 } });
        const initial = base;
        const url = new URL(config.endpoint); if (/\/v1\/?$/.test(url.pathname)) url.pathname = url.pathname.replace(/\/$/, '') + '/chat/completions';
        const seeded = await seedGenerationProfiles({ ...h, endpoint: url.toString(), roles: ['narrator', 'intent_resolver'] });
        await seeded.persistence.saveModelProfile(h.handle, { ...seeded.model, remoteModelId: config.model,
            limits: { contextTokens: config.contextTokens, outputTokens: 4096 }, tokenizer: { encoding: config.tokenizer, source: 'explicit_s25_test_config' } });
        for (const route of seeded.routes) await seeded.persistence.saveRuntimeRoute(h.handle, { ...route, policy: { timeoutMs: config.timeoutMs, maxRetries: 0, maxFallbackAttempts: 0 },
            executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget } });
        const underlying = createHttpGenerationProvider({ fetchImpl: async (endpoint, options) => {
            assert(live, 's25_preflight_send_denied');
            const body = JSON.parse(options.body), sent = JSON.stringify(body.messages);
            assert(sent.includes(facts), 's25_original_facts_missing');
            if (stage === 'narrator' && label === 'slow') {
                const advice = base.states.atri_lifecycle.domains.notes.records.find(row => row.id === 'main').value.text;
                assert(sent.includes(advice), 's25_background_advice_not_consumed'); result.checks.adviceConsumedByOriginalProjection = true;
            }
            await run.quota.waitAvailable(options.signal); run.quota.admit('s25-' + randomUUID()); summary.apiRequests++;
            activeSend = { arm: label, stage, ordinal: summary.apiRequests, requestHash: hash(body), httpStatus: null }; summary.sends.push(activeSend);
            try { const response = await httpFetch(endpoint, { ...options, dispatcher }); activeSend.httpStatus = response.status; return response; }
            catch (error) { activeSend.failure = safeReason(error.cause ?? error); throw error; }
        } });
        const provider = { ...underlying, normalizeResponse(raw) {
            Object.assign(activeSend, { finishReason: raw.choices?.[0]?.finish_reason ?? 'unknown', inputTokens: raw.usage?.prompt_tokens ?? null,
                outputTokens: raw.usage?.completion_tokens ?? null, totalTokens: raw.usage?.total_tokens ?? null });
            return underlying.normalizeResponse(raw);
        } };
        const host = new NativeGenerationHost({ ...seeded, sessionCore: f.core, packageInstaller: f.packageInstaller,
            secretPort: { resolveSecret: async () => config.apiKey }, providers: { 'provider.openai-compatible': provider } });
        const slotBindings = { structured: { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId } };
        const input = () => ({ sessionId: base.session.sessionId, revisionId: base.revision.revisionId, slotBindings });
        const selection = projectInformation(base, 'narrator.input', { purpose: 'context' });
        result.configurationHash = hash({ model: config.model, limits: config.contextTokens, computeBudget, narratorPrompt, packageVersion: base.session.packageVersionId });
        result.inputHash = hash(selection.items.map(({ sourceId, data }) => ({ sourceId, data })));
        result.checks = { zeroSendPreflight: false };
        await host.prepareLifecycle(h.handle, input());
        assert.equal(costs(await f.core.runs.status(h.handle, base.session.sessionId)).attempts, 0);
        result.checks.zeroSendPreflight = true;
        if (!live) { result.status = 'zero_send_preflight_passed'; return; }
        const pairedStarted = performance.now(), pairedCpu = process.cpuUsage();
        if (label === 'slow') {
            stage = 'background'; const phaseStart = performance.now();
            const executed = await host.executeLifecycle(h.handle, input()); base = executed.snapshot;
            assert.equal(executed.results.length, 1); assert.equal(executed.results[0].deliveryReceipt.kind, 'model_delivery');
            assert.equal(base.states.atri_lifecycle.outbox[0].status, 'completed'); assert.deepEqual(base.timeline, initial.timeline);
            assert.equal(base.states.atri_lifecycle.domains.facts.records[0].value.text, facts);
            const advice = base.states.atri_lifecycle.domains.notes.records.find(row => row.id === 'main').value.text;
            assert.equal(advice, executed.results[0].payload.text);
            result.background = { wallMs: performance.now() - phaseStart, invocationId: executed.results[0].invocationId,
                deliveryKind: executed.results[0].deliveryReceipt.kind, normalizedResultHash: executed.results[0].normalizedResultHash,
                appliedTextHash: hash(advice), completedOutbox: true, timelineUnchanged: true, cost: costs(await f.core.runs.status(h.handle, base.session.sessionId)) };
        }
        stage = 'narrator'; const narrationStarted = performance.now(), narratorInvocation = 's25-turn-' + randomUUID();
        base = await host.executeTurn(h.handle, { ...input(), invocationId: narratorInvocation }, undefined, undefined,
            { transaction: { transactionId: 'request.review', input: {} } });
        result.phases.narratorWallMs = performance.now() - narrationStarted;
        const body = base.timeline.at(-1).content, receipt = base.states.atri_task_results.records.find(row => row.invocationId === narratorInvocation);
        assert.equal(receipt.kind, 'turn'); assert.equal(base.timeline.at(-1).role, 'assistant');
        result.receipt = { kind: receipt.kind, invocationId: receipt.invocationId, branchId: receipt.branchId, storedRevisionId: receipt.storedRevisionId };
        result.body = { characters: body.length, hash: hash(body) }; result.quality = grade(body);
        result.qualityPassed = Object.values(result.quality).every(Boolean);
        assert.equal(base.states.atri_lifecycle.domains.facts.records[0].value.text, facts);
        if (label === 'fast') {
            assert.equal(base.states.atri_lifecycle.outbox[0].status, 'pending'); result.checks.fastNoBackgroundSend = summary.sends.filter(row => row.arm === label).length === 1;
            assert(result.checks.fastNoBackgroundSend);
        }
        const observed = process.cpuUsage(pairedCpu);
        result.observedDecision = { wallMs: performance.now() - pairedStarted, cpuUserMicros: observed.user, cpuSystemMicros: observed.system, cpuScope: 'process' };
        result.status = result.qualityPassed ? 'quality_floor_passed' : 'quality_floor_failed';
    } catch (error) {
        result.status = 'failed'; result.failedPhase = stage; summary.failures.push({ arm: label, phase: stage, code: safeReason(error),
            localMessage: stage === 'fixture' ? String(error.message).slice(0, 180) : undefined });
    } finally {
        try { if (base) result.cost = costs(await f.core.runs.status(h.handle, base.session.sessionId)); }
        catch (error) { result.costUnavailable = safeReason(error); }
        const observed = process.cpuUsage(cpu);
        result.observedIncludingSetup = { wallMs: performance.now() - start, cpuUserMicros: observed.user, cpuSystemMicros: observed.system, cpuScope: 'process' };
        await h.engine.close();
    }
}
async function runStage(run) {
    const config = run.connection(), template = fixture();
    const dispatcher = new Agent({ connect: { timeout: 30000 }, headersTimeout: 240000, bodyTimeout: 240000 });
    try { for (const label of ['fast', 'slow']) await arm(run, config, template, label, dispatcher); }
    finally { await dispatcher.close(); }
    const { fast, slow } = summary.arms;
    assert.equal(fast.configurationHash, slow.configurationHash, 's25_configuration_mismatch');
    assert.equal(fast.inputHash, slow.inputHash, 's25_input_mismatch');
    if (summary.failures.length) { summary.status = 'failed'; process.exitCode = 1; }
    else if (!live) summary.status = 'zero_send_preflight_passed';
    else {
        summary.status = fast.qualityPassed && slow.qualityPassed ? 'finite_quality_floor_passed' : 'finite_quality_floor_failed';
        summary.comparison = { fastQualityPassed: fast.qualityPassed, slowQualityPassed: slow.qualityPassed,
            extraRequests: slow.cost.attempts - fast.cost.attempts, extraKnownTokens: slow.cost.knownTokens - fast.cost.knownTokens,
            extraLocalJobs: slow.cost.localJobs - fast.cost.localJobs, qualityGain: !fast.qualityPassed && slow.qualityPassed,
            totalLatencyDeltaMs: slow.observedDecision.wallMs - fast.observedDecision.wallMs,
            conclusion: fast.qualityPassed && slow.qualityPassed ? 'Same quality floor; no observed quality gain from extra background work' : 'Inspect finite quality failures; no generalized gain claim' };
        if (!fast.qualityPassed || !slow.qualityPassed) process.exitCode = 1;
    }
}
try {
    if (live) {
        const privateRoot = execFileSync('git', ['config', '--get', 'atria.private.directory'], { encoding: 'utf8' }).trim();
        const directory = path.basename(privateRoot).toLowerCase() === 'document' ? privateRoot : path.join(privateRoot, 'Document');
        await withPrivateTestRun(directory, runStage);
    } else {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-s25-preflight-'));
        try { await runStage({ directory, connection: () => ({ endpoint: 'http://127.0.0.1:1/not-used', apiKey: 'unused-synthetic', model: 's25-preflight',
            contextTokens: 64000, tokenizer: 'cl100k_base', timeoutMs: 240000 }) }); }
        finally { fs.rmSync(directory, { recursive: true, force: true }); }
    }
} catch (error) { summary.status = 'failed'; summary.failures.push({ phase: 'configuration_or_comparison', code: safeReason(error) }); process.exitCode = 1; }
console.log(JSON.stringify(summary));
