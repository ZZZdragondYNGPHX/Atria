// Explicit local Native backend observation. Credentials stay in memory; the
// original Host and Evolution ledger own every send, including diagnostic use.
import '../util/config.js';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import writeFileAtomic from 'write-file-atomic';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { rpModelFixture } from './helpers/rp-model-fixture.js';
import { projectModelFixture } from './helpers/project-model-fixture.js';
import { configureProjectToolPlan } from './helpers/project-tool-fixture.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { EvolutionTargets } from '../../src/native/agent-intelligence/evolution-targets.js';
import { EvolutionEvaluator } from '../../src/native/agent-intelligence/evolution-evaluator.js';
import { M1ApiQuota, M1AdvisoryRepository } from '../agent-intelligence/m1-quota.js';
import { validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { PILOT_CASE_SET_REVISION } from '../../src/native/agent-intelligence/evaluation/cases.js';

const [domain, configFile, quotaFile] = process.argv.slice(2);
if (!['rp', 'project'].includes(domain) || !path.isAbsolute(configFile ?? '') || !path.isAbsolute(quotaFile ?? ''))
    throw new TypeError('Usage: native-live.mjs rp|project <absolute-private-api-config> <absolute-private-api-quota>');
const command = () => createNativeId('orchestrationCommand');
let fixture, repository, lock, descriptor, handle, requests = 0;
const summary = { domain, origin: 'native_backend_source_probe', semanticQuality: 'not_graded', monetaryPrice: 'unavailable', status: 'failed', transport: [] };
try {
    lock = path.join(path.dirname(quotaFile), 'm1-ledger.json.lock'); descriptor = fs.openSync(lock, 'wx', 0o600);
    fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid }));
    const { apiKey, ...config } = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    const url = new URL(config.endpoint);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || !apiKey || typeof config.model !== 'string'
        || ![config.contextTokens, config.maxOutputTokens, config.timeoutMs].every(value => Number.isSafeInteger(value) && value > 0)
        || config.maxOutputTokens >= config.contextTokens) throw new TypeError('Invalid explicit test connection');
    if (/\/v1\/?$/.test(url.pathname)) url.pathname = url.pathname.replace(/\/$/, '') + '/chat/completions';
    const quota = new M1ApiQuota(JSON.parse(fs.readFileSync(quotaFile, 'utf8')),
        value => writeFileAtomic.sync(quotaFile, JSON.stringify(value) + '\n', { mode: 0o600 }));
    const provider = createHttpGenerationProvider({ fetchImpl: async (endpoint, options) => {
        await quota.waitAvailable(options.signal); quota.admit(randomUUID()); requests++;
        try {
            const response = await fetch(endpoint, options);
            const metadata = { status: response.status, json: response.headers.get('content-type')?.includes('json') === true,
                stream: response.headers.get('content-type')?.includes('event-stream') === true };
            summary.transport.push(metadata);
            if (!response.ok) {
                const raw = await response.clone().text();
                metadata.hints = ['max_tokens', 'max_completion_tokens', 'api key', 'model', 'quota', 'billing', 'stream', 'rate limit'].filter(value => raw.toLowerCase().includes(value));
            } else if (domain === 'project' && metadata.json) {
                const observed = await response.clone().json();
                const allowed = new Set(['atri_agent_get_project', 'atri_agent_set_plan', 'atri_agent_reset_operations',
                    'atri_agent_project_save', 'atri_agent_prepare_review']);
                metadata.toolCalls = observed.choices?.[0]?.message?.tool_calls?.map(call => allowed.has(call.function?.name) ? call.function.name : 'unrecognized') ?? [];
                metadata.finishReason = ['stop', 'tool_calls', 'length'].includes(observed.choices?.[0]?.finish_reason)
                    ? observed.choices[0].finish_reason : 'other';
            }
            return response;
        } catch (error) {
            const code = error.cause?.code ?? error.code;
            summary.transport.push({ failure: ['UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'ECONNRESET', 'ETIMEDOUT',
                'ENOTFOUND', 'EAI_AGAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT'].includes(code) ? code : 'transport_failed' });
            throw error;
        }
    } });
    const configurePlan = plan => {
        const output = plan.definition.nodes.find(node => node.kind === 'output');
        if (domain === 'rp') { output.capabilities = ['chat.output']; plan.definition.capabilityCeiling.push('chat.output'); }
        Object.assign(plan.definition.outputContract, { kind: domain === 'rp' ? 'rp_narration' : 'project_review',
            ...(domain === 'rp' ? { slot: 'assistant' } : {}), resultPolicy: { outputType: domain === 'rp' ? 'text' : 'json', maxBytes: 65536 } });
        plan.definition.limits.maxSteps = 200;
    };
    fixture = domain === 'rp' ? await rpModelFixture(makeTempFsEngineHarness, { configurePlan }) : await projectModelFixture(makeTempFsEngineHarness, {
        format: 'openai-compatible', maxModelRounds: 6, configurePlan: async args => {
            await configureProjectToolPlan(['atri_agent_get_project', 'atri_agent_set_plan', 'atri_agent_reset_operations', 'atri_agent_project_save', 'atri_agent_prepare_review'])(args);
            configurePlan(args.plan);
            const node = args.plan.definition.nodes[0]; node.inputs.push({ name: 'continuation', type: 'json', required: false });
            args.plan.definition.edges.push({ edgeId: createNativeId('orchestrationEdge'), from: { nodeId: node.nodeId, port: 'response' },
                to: { nodeId: node.nodeId, port: 'continuation' }, condition: 'always', maxVisits: 5, loopBack: true });
        },
    });
    const f = fixture; handle = f.h.handle;
    f.host.providers['provider.openai-compatible'] = provider;
    f.host.secretPort = { resolveSecret: async ref => { if (ref.secretId !== f.connection.secretRef.secretId) throw new TypeError('Unexpected test Secret ref'); return apiKey; } };
    await f.persistence.saveConnectionProfile(handle, { ...f.connection, endpoint: url.toString() });
    await f.persistence.saveModelProfile(handle, { ...f.model, remoteModelId: config.model, tokenizer: { encoding: config.tokenizer, source: 'explicit_private_test_config' },
        limits: { contextTokens: config.contextTokens, outputTokens: config.maxOutputTokens } });
    const generation = { ...f.generation, revision: 'native-live', output: { maxTokens: config.maxOutputTokens } };
    summary.outputTokenLimit = generation.output.maxTokens;
    await f.library.commit(handle, 'core.generation-profile', generation);
    const pin = (await f.plans.getRevision(handle, f.planRef)).dependencyPins.find(pin => pin.port === 'model');
    const route = await f.persistence.getRuntimeRoute(handle, pin.resourceRef.runtimeRouteId);
    await f.persistence.saveRuntimeRoute(handle, { ...route, generationProfileRef: { ...route.generationProfileRef, revision: generation.revision },
        policy: { ...route.policy, timeoutMs: config.timeoutMs }, executionPolicy: { ...route.executionPolicy, computeBudget: {
            ...route.executionPolicy.computeBudget, maxRequests: domain === 'rp' ? 4 : 6,
            maxTokens: Math.max(route.executionPolicy.computeBudget.maxTokens, config.contextTokens * (domain === 'rp' ? 2 : 6)),
        } } });
    const currentRoute = await f.persistence.getRuntimeRoute(handle, route.runtimeRouteId), draft = await f.plans.get(handle, f.planRef.planId);
    pin.integrity = hash(currentRoute);
    const saved = await f.plans.save(handle, command(), { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash,
        definition: draft.definition, dependencyPins: draft.dependencyPins.map(value => value.pinId === pin.pinId ? pin : value), viewState: draft.viewState });
    const guard = { planId: saved.planId, expectedDraftVersion: saved.draftVersion, expectedDefinitionHash: saved.definitionHash };
    const validation = await f.plans.validate(handle, guard), published = await f.plans.publish(handle, command(), { ...guard, validationDigest: validationDigest(validation) });
    const binding = await f.plans.getBinding(handle, f.sourceSelector);
    await f.plans.saveBinding(handle, command(), { sourceSelector: f.sourceSelector, planRef: published.planRef, expectedVersion: binding.version });
    const targets = new EvolutionTargets({ host: f.host });
    const scope = domain === 'rp' ? { domain: 'rp_chat', charDir: 'Actor', name: 'main', isGroup: false, groupId: '' } : { domain: 'project', projectId: f.projectId };
    const subject = domain === 'rp' ? 'Actor' : f.projectId;
    const choice = (await targets.catalog(handle, scope, subject)).find(choice => choice.target.fieldPath === 'limits.maxSteps');
    const settings = await targets.evaluationSettings(handle, scope, subject, choice.target);
    repository = new M1AdvisoryRepository({ engine: f.h.engine });
    await repository.limits(handle, { maxRequests: 2000, maxTokens: 10000000, minIntervalMs: 3000 }, 0);
    const evaluator = new EvolutionEvaluator({ host: f.host, repository }), frozen = await evaluator.sourceProbeConfiguration(handle, route.runtimeRouteId);
    const report = await evaluator.probe(handle, { id: 'native-live:' + randomUUID(), scopeId: 'private-test', domain,
        policyFingerprint: 'engineering-observation', targetPin: hash(settings), price: null }, frozen, settings, new AbortController().signal,
    async () => {}, async () => {}, async () => {}, { profileId: domain === 'rp' ? 'rp.m1.information' : 'project.m1.related',
        caseSetRevision: PILOT_CASE_SET_REVISION, split: 'development', repetitions: 1, mode: 'source_probe' });
    summary.cases = report.pairs.map(pair => ({ caseId: pair.case.caseId, checks: pair.baseline.checks, charges: pair.baseline.charges.length }));
    summary.status = summary.cases.every(value => Object.values(value.checks).every(Boolean)) ? 'passed' : 'invariants_failed';
} catch (error) {
    summary.error = /^[a-z][a-z0-9_:.]{0,100}$/.test(error.code ?? '') ? error.code : /^[a-z][a-z0-9_]{0,100}$/.test(error.message ?? '') ? error.message : 'native_live_failed';
    summary.failureAt = error.stack?.split('\n').slice(1).flatMap(line => {
        const match = line.match(/\/(src|tests)\/([a-zA-Z0-9_./-]+\.[cm]?js:\d+:\d+)/);
        return match ? [match[1] + '/' + match[2]] : [];
    }).slice(0, 4);
} finally {
    summary.actualRequests = requests;
    try {
        const ledger = repository ? await repository.owner(handle) : null;
        if (ledger) {
            summary.reportedTokens = ledger.attempts.filter(value => value.status === 'reported').reduce((sum, value) => sum + value.tokens, 0);
            summary.unknownAttempts = ledger.attempts.filter(value => value.status !== 'reported').length;
        }
    } finally {
        try { await fixture?.cleanup(); } finally { if (descriptor !== undefined) { fs.closeSync(descriptor); fs.unlinkSync(lock); } }
    }
    console.log(JSON.stringify(summary));
    if (summary.status !== 'passed') process.exitCode = 1;
}
