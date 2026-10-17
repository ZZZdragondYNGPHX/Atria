import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { AgentEvolutionService } from '../../src/native/agent-intelligence/evolution-service.js';
import { AgentEvolutionRepository, EVOLUTION_RULE, evolutionHash as hash } from '../../src/native/agent-intelligence/evolution-repository.js';
import { EvolutionEvaluator, evolutionEvaluatorRevision } from '../../src/native/agent-intelligence/evolution-evaluator.js';
import { CASE_SET_REVISION, selectCases, publicCaseScenario } from '../../src/native/agent-intelligence/evaluation/cases.js';
import { PromptPresetStore } from '../../src/native/model-prompt-runtime/presets.js';
import { createNativeId } from '../../src/native/identity.js';
import { NativeModelPromptPersistence, VersionedJsonResourceHandler } from '../../src/native/model-prompt-runtime/persistence.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { createSkillRepository } from '../../src/skills/repository.js';
import { ExtensionsStore } from '../../src/native/extensions-store.js';
import { skillEntryKey } from '../../public/shared/extension-contract.js';
import { ChatRepo } from '../../src/storage/repositories/chat-repo.js';
import { AgentEvidenceRepository } from '../../src/native/agent-intelligence/evidence-repository.js';
import { AgentEvidenceService } from '../../src/native/agent-intelligence/evidence-service.js';
import { RpEvidenceCaptureService } from '../../src/native/agent-intelligence/rp-capture-service.js';
import { NativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { createLiveBridge } from './live-bridge.js';
import { NativeNarratorOrchestrationAuthority } from '../../src/native/orchestration/native-turn-orchestration.js';
import { RpRunControl } from '../../src/native/rp-run-control.js';
import { RouteResolver } from '../../src/native/model-prompt-runtime/route-resolver.js';
import { createOrchestrationAuthoringService } from '../../src/native/orchestration/authoring-service.js';
import { validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { planFixture, prepareControllerOwnerRoot } from '../native-orchestration/fixtures.js';
import { services as sessionServices } from '../native/helpers/session-fixture.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { services, projectSource } from './project-fixture.js';

export const price = { source: 'Synthetic fixture price, no paid request', currency: 'USD', inputPerMillion: 1, outputPerMillion: 1, confirmedAt: 1000 };
export const testConfig = { endpoint: 'https://fixture.invalid/v1/chat/completions', model: 'fixture-model', tokenizer: 'cl100k_base', contextTokens: 32000,
    maxOutputTokens: 1024, maxRequests: 1, maxTotalTokens: 100000, timeoutMs: 10000 };
export const skillMd = text => '---\nname: guide\ndescription: Scoped guide\n---\n' + text;
export const rpScope = { domain: 'rp_chat', charDir: 'Actor', name: 'evolution', isGroup: false, groupId: '' };
export function syntheticReport(job, configs, settings) {
    const pairs = selectCases({ purpose: 'evaluation', split: 'promotion' }).filter(c => c.entrance === job.domain).flatMap(entry => [1, 2, 3].map(repetition => {
        const deltas = Object.fromEntries(entry.behaviorDimensions.map(d => [d, 1]));
        const trial = arm => ({ trialId: `${job.id}:${entry.caseId}:${repetition}:${arm}`, output: arm + ' output', configurationHash: hash(configs[arm]), settingsHash: hash(settings[arm]),
            checks: Object.fromEntries([...entry.expectedInvariants, 'isolation', 'target_consumed'].map(k => [k, true])), refs: { requestIds: [randomUUID()] }, evidence: [], error: null, repairCount: 0,
            requestHashes: [hash(arm)], charges: [{ id: randomUUID(), kind: arm, tokens: 10, status: 'reported', cost: 0.00001 }] });
        const pair = { case: entry, scenario: publicCaseScenario(entry), repetition, baseline: trial('baseline'), candidate: trial('candidate'), judge: { preference: 'candidate', deltas, rationale: 'Synthetic test observation' }, human: null };
        return { ...pair, pairHash: hash(pair) };
    }));
    return { schemaVersion: 1, origin: 'host_evaluator', evaluatorRevision: evolutionEvaluatorRevision(), caseSetRevision: CASE_SET_REVISION, rule: EVOLUTION_RULE,
        domain: job.domain, policyFingerprint: job.policyFingerprint, targetPin: job.targetPin, price: job.price, pairs, charges: pairs.flatMap(p => [...p.baseline.charges, ...p.candidate.charges]), createdAt: 1000,
        configurations: { baseline: hash(configs.baseline), candidate: hash(configs.candidate) }, settings: { baseline: hash(settings.baseline), candidate: hash(settings.candidate) } };
}
export async function evolutionFixture(make, targetKind = 'project-strategy', { realEvaluator = false, fetchImpl, connectionConfig = testConfig, policyMode = 'auto', confirmedPrice = price, repositoryClass = AgentEvolutionRepository, configureEvaluator = () => {}, nativeRpSteps = 1 } = {}) {
    const h = await make();
    const { studio, agent } = services(h), persistence = new NativeModelPromptPersistence({ engine: h.engine }), library = new VersionedJsonResourceHandler({ engine: h.engine });
    await createLiveBridge({ engine: h.engine, handle: h.handle, config: connectionConfig, secretPort: { resolveSecret: async () => 'not-used' }, fetchImpl: async () => { throw new Error('Unused seed bridge'); } });
    const source = projectSource(); const created = await studio.createProject(h.handle, source);
    const previousTask = await agent.createTask(h.handle, source.project.projectId, { intent: 'Source feedback', baseRevision: created.revision.revision });
    const nextTask = await agent.createTask(h.handle, source.project.projectId, { intent: 'Next task', baseRevision: created.revision.revision });
    const chatRepo = new ChatRepo({ engine: h.engine });
    const host = { persistence, library, studio, agent, providers: { 'provider.openai-compatible': createHttpGenerationProvider({ fetchImpl: fetchImpl || (async () => { throw new Error('Paid requests forbidden in fixture'); }) }) },
        secretPort: { resolveSecret: async () => 'fixture-secret-never-in-report' }, skillRepository: () => createSkillRepository(h.dirs.root), sessionCore: null };
    const repository = new repositoryClass({ engine: h.engine }), evaluator = new EvolutionEvaluator({ host, repository });
    configureEvaluator(evaluator);
    let extractionValue = targetKind.endsWith('strategy') ? 1 : 'Candidate guidance';
    if (!realEvaluator) {
        evaluator.extract = async (_handle, job) => {
            const id = randomUUID(); await repository.reserve(h.handle, { id, scopeId: job.scopeId, jobId: job.id, kind: 'extraction', upperBound: 20 }); await repository.settle(h.handle, id, 10, { usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 }, cost: 0.00001 });
            return { value: extractionValue, rationale: 'Synthetic hypothesis, not quality evidence' };
        };
        evaluator.compare = async (_handle, job, configs, settings) => {
            const report = syntheticReport(job, configs, settings);
            for (const [index, pair] of report.pairs.entries()) {
                for (const arm of ['baseline', 'candidate', 'judge']) {
                    const id = arm === 'judge' ? randomUUID() : pair[arm].charges[0].id;
                    const trialId = arm === 'judge' ? job.id + ':judge:' + index : pair[arm].trialId;
                    const charge = { id, kind: arm, trialId, requestHash: hash([trialId, 'request']), snapshotHash: hash([trialId, 'snapshot']), tokens: 10, status: 'reported', usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 }, cost: 0.00001 };
                    await repository.reserve(h.handle, { id, kind: arm, trialId, requestHash: charge.requestHash, snapshotHash: charge.snapshotHash, jobId: job.id, scopeId: job.scopeId, upperBound: 20 });
                    await repository.settle(h.handle, id, 10, { usage: charge.usage, cost: charge.cost });
                    if (arm === 'judge') { pair.judge.chargeIds = [id]; report.charges.push(charge); }
                    else { pair[arm].charges = [charge]; }
                }
                const { pairHash: _previous, ...identity } = pair; pair.pairHash = hash(identity);
            }
            report.charges = report.pairs.flatMap(p => [...p.baseline.charges, ...p.candidate.charges]).concat(report.charges.filter(c => c.kind === 'judge'));
            return report;
        };
    }
    const fixtureNow = Date.now();
    const service = new AgentEvolutionService({ host, chatRepo, scheduler: new NativeTaskScheduler({ concurrency: 1, retries: 0 }), evaluator, now: () => fixtureNow });
    let scope, subject, target, evidenceTarget;
    const rp = targetKind === 'rp-skill';
    scope = rp ? rpScope : { domain: 'project', projectId: source.project.projectId }; subject = rp ? 'Actor' : source.project.projectId;
    if (rp) {
        await chatRepo.save(h.handle, 'Actor', 'evolution', {}, [{ memory_os_source_id: 'user', is_user: true, name: 'User', mes: 'Wait for my choice.' }, { memory_os_source_id: 'npc', is_user: false, name: 'Actor', mes: 'A reply.', swipe_id: 0 }], null);
        const sources = new AgentEvidenceService({ chatRepo }), evidence = new AgentEvidenceRepository({ engine: h.engine }), capture = new RpEvidenceCaptureService({ repository: evidence, service: sources });
        const begun = await capture.begin(h.handle, { scope, rootRunId: 'source-run', selectors: [{ kind: 'message', messageId: 'user', floor: 0 }] });
        const output = (await sources.capture(h.handle, scope, [{ kind: 'message', messageId: 'npc', floor: 1 }], { maxSources: 4, maxBytes: 32768, maxScanMessages: 128 })).references[0];
        await capture.update(h.handle, { evidenceId: begun.evidenceId, sequence: 1, status: 'completed', trace: { schemaVersion: 1, events: [], missing: 0, reasons: [] }, output });
        evidenceTarget = (await service.experience.target(h.handle, { kind: 'evidence', id: begun.evidenceId, scope })).target;
    } else evidenceTarget = (await service.experience.target(h.handle, { kind: 'project_task', id: previousTask.taskId, scope })).target;
    await service.experience.submit(h.handle, { target: evidenceTarget, feedback: { kind: 'explicit', signal: 'correction', dimension: 'behavior', note: 'Preserve user decisions and authority.' }, expectedSequence: null });
    if (targetKind.endsWith('skill')) {
        const skillScope = rp ? { kind: 'character', characterFile: 'Actor.png' } : { kind: 'project', projectId: subject };
        await host.skillRepository(h.handle).install({ scope: skillScope, payload: { files: [{ path: 'SKILL.md', content: skillMd('Original guidance') }, { path: 'reference.txt', content: 'Original support' }] } });
        target = { kind: 'skill', scope: skillScope, name: 'guide' }; extractionValue = skillMd('Candidate guidance');
    } else if (targetKind === 'project-prompt') {
        const presets = new PromptPresetStore({ engine: h.engine });
        const module = { schemaVersion: 1, promptModuleId: createNativeId('promptModule'), revision: createNativeId('revision'), displayName: 'Style', target: 'system.style', stages: ['stage.main'], body: 'Original style' };
        const guard = { ...module, promptModuleId: createNativeId('promptModule'), target: 'system.foundation', body: 'Preserve Project authority and human review.' };
        const ref = r => ({ scope: 'library', resourceType: 'core.prompt-module', resourceId: r.promptModuleId, revision: r.revision });
        const program = { schemaVersion: 1, promptProgramId: createNativeId('promptProgram'), revision: createNativeId('revision'), displayName: 'Project', stages: [{ stageId: 'stage.main', moduleRefs: [ref(module), ref(guard)] }] };
        const oldRoute = (await persistence.listRuntimeRoutes(h.handle)).find(r => r.role === 'role.studio');
        const generation = (await library.getExact(h.handle, oldRoute.generationProfileRef)).snapshot;
        const saved = await presets.save(h.handle, { format: 'atria.prompt-preset', schemaVersion: 1, programId: program.promptProgramId, entries: [{ resourceType: 'core.prompt-program', resource: program }, { resourceType: 'core.prompt-module', resource: module }, { resourceType: 'core.prompt-module', resource: guard }, { resourceType: 'core.generation-profile', resource: generation }] }, { importing: true });
        const preset = await presets.get(h.handle, saved.presetId), moduleRef = preset.refs.find(r => r.resourceType === 'core.prompt-module' && preset.entries.some(e => e.resource.promptModuleId === r.resourceId && e.resource.body === module.body));
        await persistence.saveRuntimeRoute(h.handle, { ...oldRoute, promptProgramRef: preset.refs.find(r => r.resourceId === saved.presetId), generationProfileRef: preset.refs.find(r => r.resourceType === 'core.generation-profile') });
        target = { kind: 'project-prompt', presetId: saved.presetId, runtimeRouteId: oldRoute.runtimeRouteId, moduleRef };
        await service.targets.prompts.declare(h.handle, saved.presetId, { expectedRevision: preset.revision, moduleRefs: [moduleRef] });
    } else {
        target = { kind: 'project-strategy', taskId: nextTask.taskId, field: 'maxRepairRounds' };
        await agent.strategyCandidates(h.handle, subject, nextTask.taskId, { type: 'declare', expectedSequence: 0, allowedFields: ['maxRepairRounds'] });
    }
    if (targetKind.endsWith('skill')) {
        const store = new ExtensionsStore({ engine: h.engine }), before = await store.settings(h.handle);
        await store.saveSettings(h.handle, { ...before.value, skills: { [skillEntryKey(target)]: { paths: { [rp ? 'narrative' : 'studio']: 'always' } } } }, before.revision);
        host.extensions = store;
    }
    let route = (await persistence.listRuntimeRoutes(h.handle)).find(r => r.role === (rp ? 'role.orchestrator' : 'role.studio'));
    if (rp) {
        await prepareControllerOwnerRoot(h.dirs.root); attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        route = await persistence.saveRuntimeRoute(h.handle, { ...route, role: 'role.narrator', executionPolicy: { schemaVersion: 1,
            allowedModelProfileIds: [route.modelProfileRef.modelProfileId], continuity: 'none', reuse: 'disabled',
            computeBudget: { maxRequests: Math.max(4, nativeRpSteps + 1), maxTokens: 100000, localWork: { maxJobs: Math.max(32, nativeRpSteps * 16 + 8), maxItems: 10000, maxInputBytes: 16777216 } } } });
        route = await persistence.getRuntimeRoute(h.handle, route.runtimeRouteId);
        host.sessionCore = sessionServices(h).core;
        const control = new RpRunControl({ engine: h.engine, chatRepo }), { controlId } = await control.bind(h.handle, { charDir: rpScope.charDir, name: rpScope.name, isGroup: false, groupId: null });
        const resolver = new RouteResolver({ persistence, library, providers: host.providers });
        const { plans } = createOrchestrationAuthoringService(h.engine, { rpControl: control, modelResolver: resolver });
        host.turnOrchestration = new NativeNarratorOrchestrationAuthority({ engine: h.engine, sessionCore: host.sessionCore, rpControl: control, plans, modelResolver: resolver });
        const plan = planFixture(), output = plan.definition.nodes[0], nodeId = createNativeId('orchestrationNode');
        plan.definition.nodes = [{ nodeId, kind: 'agent', label: 'RP narrator', inputs: [], outputs: [{ name: 'response', type: 'text', required: false }], dependencyPinIds: ['rp.route'], capabilities: ['generation.send'], policy: { agentPinId: 'rp.route' } },
            { ...output, inputs: [{ name: 'response', type: 'text', required: true }], capabilities: ['chat.output'] }];
        plan.definition.entryNodeIds = [nodeId]; plan.definition.capabilityCeiling = ['generation.send', 'chat.output'];
        plan.definition.outputContract = { kind: 'rp_narration', ownerNodeId: output.nodeId, slot: 'assistant', allowPartial: false, resultPolicy: { outputType: 'text', maxBytes: 65536 } };
        plan.definition.edges = [{ edgeId: createNativeId('orchestrationEdge'), from: { nodeId, port: 'response' }, to: { nodeId: output.nodeId, port: 'response' }, condition: 'always', maxVisits: 1, loopBack: false }];
        if (!Number.isSafeInteger(nativeRpSteps) || nativeRpSteps < 1 || nativeRpSteps > 6) throw new Error('Invalid finite Native RP fixture steps');
        for (let index = 1; index < nativeRpSteps; index++) {
            const previous = plan.definition.nodes.at(-2), nextId = createNativeId('orchestrationNode');
            const next = { ...previous, nodeId: nextId, label: 'RP graph step ' + index, inputs: [{ name: 'response', type: 'text', required: true }] };
            const edge = plan.definition.edges.find(edge => edge.to.nodeId === output.nodeId);
            edge.to = { nodeId: nextId, port: 'response' };
            plan.definition.nodes.splice(plan.definition.nodes.length - 1, 0, next);
            plan.definition.edges.push({ ...edge, edgeId: createNativeId('orchestrationEdge'), from: { nodeId: nextId, port: 'response' }, to: { nodeId: output.nodeId, port: 'response' } });
        }
        plan.definition.limits.maxSteps = 50;
        plan.dependencyPins = [{ pinId: 'rp.route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId }, integrity: hash(route) }];
        const draft = await plans.create(h.handle, createNativeId('orchestrationCommand'), plan);
        const expected = { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash }, report = await plans.validate(h.handle, expected);
        if (report.status !== 'valid') throw new Error(JSON.stringify(report.issues));
        const { planRef } = await plans.publish(h.handle, createNativeId('orchestrationCommand'), { ...expected, validationDigest: validationDigest(report) });
        await plans.saveBinding(h.handle, createNativeId('orchestrationCommand'), { sourceSelector: { domain: 'rp_chat', controlId }, planRef, expectedVersion: null });
    }
    await service.budget(h.handle, { limits: { maxRequests: 120, maxTokens: 1000000, minIntervalMs: 1000 }, expectedSequence: 0 });
    await service.configure(h.handle, { scope, subject, target, mode: policyMode, routeId: route.runtimeRouteId, price: confirmedPrice, expectedSequence: 0 });
    return { h, host, service, repository, evaluator, scope, subject, target, previousTask, nextTask, route, source, setValue: value => { extractionValue = value; } };
}
export async function runEvolution(f) {
    const doc = await f.repository.get(f.h.handle, f.scope, f.subject);
    const start = await f.service.start(f.h.handle, { scope: f.scope, subject: f.subject, expectedSequence: doc.sequence });
    await f.service.wait(f.h.handle, start.jobId);
    const next = await f.repository.get(f.h.handle, f.scope, f.subject), job = next.jobs.find(j => j.id === start.jobId);
    return { doc: next, job, candidate: job.candidates[0] };
}
// Reopen a saved private fixture for lifecycle evidence only; never rerun trials.
export async function restoreEvolutionFixture(make, directory, result, { fetchImpl, repositoryClass = AgentEvolutionRepository, requireCurrentPublication = true, baselineOnly = false, evaluationOnly = false } = {}) {
    const h = await make();
    try {
        fs.cpSync(directory, h.dataRoot, { recursive: true });
        const { studio, agent } = services(h);
        const host = { persistence: new NativeModelPromptPersistence({ engine: h.engine }), library: new VersionedJsonResourceHandler({ engine: h.engine }), studio, agent,
            providers: { 'provider.openai-compatible': createHttpGenerationProvider({ fetchImpl }) },
            secretPort: { resolveSecret: async () => { throw new Error('restore_secret_not_configured'); } }, sessionCore: null,
            skillRepository: () => createSkillRepository(h.dirs.root), extensions: new ExtensionsStore({ engine: h.engine }) };
        const repository = new repositoryClass({ engine: h.engine }), evaluator = new EvolutionEvaluator({ host, repository });
        const service = new AgentEvolutionService({ host, chatRepo: new ChatRepo({ engine: h.engine }), evaluator, scheduler: new NativeTaskScheduler({ concurrency: 1, retries: 0 }) });
        const { scope, subject } = result.doc, target = baselineOnly ? result.target : result.job.target;

        const doc = await repository.get(h.handle, scope, subject);
        if (baselineOnly) {
            if (scope.domain === 'rp_chat') prepareRestoredNativeRpHost({ h, host });
            if (hash(doc) !== hash(result.doc) || doc.jobs.length || doc.publications.length || hash(target) !== hash(doc.policy?.target)
                || hash(await service.targets.capture(h.handle, scope, subject, target)) !== doc.policy.targetPin) throw new Error('f2_baseline_restore_changed');
            const route = await host.persistence.getRuntimeRoute(h.handle, target.runtimeRouteId || doc.policy.routeId);
            return { h, host, service, repository, evaluator, scope, subject, target, route };
        }
        const publication = doc.publications.find(p => p.jobId === result.job.id && p.candidateId === result.candidate.candidateId);
        const saved = doc.jobs.find(j => j.id === result.job.id)?.candidates.find(c => c.candidateId === result.candidate.candidateId);
        if (evaluationOnly) {
            if (scope.domain === 'rp_chat') prepareRestoredNativeRpHost({ h, host });
            if (publication || hash(doc) !== hash(result.doc) || !saved || hash(saved) !== hash(result.candidate)
                || hash(await service.targets.capture(h.handle, scope, subject, target)) !== result.job.targetPin) throw new Error('resume_evaluation_changed');
            const route = await host.persistence.getRuntimeRoute(h.handle, target.runtimeRouteId || result.doc.policy.routeId);
            return { h, host, service, repository, evaluator, scope, subject, target, route };
        }
        if (scope.domain === 'rp_chat' && requireCurrentPublication && publication?.status === 'published') prepareRestoredNativeRpHost({ h, host });
        if (!publication || !saved || hash(saved.report) !== hash(result.candidate.report)
            || requireCurrentPublication && !await service.targets.publicationCurrent(h.handle, scope, subject, publication)) throw new Error('resume_publication_changed');
        const route = await host.persistence.getRuntimeRoute(h.handle, target.runtimeRouteId || result.doc.policy.routeId);
        return { h, host, service, repository, evaluator, scope, subject, target, route, publication };
    } catch (error) { h.cleanup(); throw error; }
}
export async function labelAll(f, job, candidate) {
    let result;
    for (const pair of candidate.report.pairs) {
        const doc = await f.repository.get(f.h.handle, f.scope, f.subject);
        result = await f.service.label(f.h.handle, { scope: f.scope, subject: f.subject, jobId: job.id, candidateId: candidate.candidateId, pairHash: pair.pairHash,
            preference: 'candidate', deltas: Object.fromEntries(pair.case.behaviorDimensions.map(d => [d, 1])), expectedSequence: doc.sequence });
    }
    return result;
}
export const independentDigest = text => createHash('sha256').update(text).digest('hex');


// Reopening a writer is explicit; grading-only restores remain read-only.
// The original persisted identity is kept, so an active Host correctly rejects
// a competing restored writer instead of silently minting another authority.
export function prepareRestoredNativeRpHost(f) {
    const { h, host } = f;
    if (!h.engine.nativeHostLifecycle) attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
    if (host.turnOrchestration) return;
    host.sessionCore = sessionServices(h).core;
    const control = new RpRunControl({ engine: h.engine, chatRepo: new ChatRepo({ engine: h.engine }) });
    const resolver = new RouteResolver({ persistence: host.persistence, library: host.library, providers: host.providers });
    const { plans } = createOrchestrationAuthoringService(h.engine, { rpControl: control, modelResolver: resolver });
    host.turnOrchestration = new NativeNarratorOrchestrationAuthority({ engine: h.engine, sessionCore: host.sessionCore, rpControl: control, plans, modelResolver: resolver });
}
