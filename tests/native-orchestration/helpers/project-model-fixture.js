import http from 'node:http';
import { createNativeId } from '../../../src/native/identity.js';
import { NativeGenerationHost } from '../../../src/native/adapters/generation-host.js';
import { NativeProjectAgentExecutor } from '../../../src/native/project-agent-executor.js';
import { NativeTaskScheduler } from '../../../src/native/task-scheduler.js';
import { NativeNarratorOrchestrationAuthority } from '../../../src/native/orchestration/native-turn-orchestration.js';
import { createOrchestrationAuthoringService } from '../../../src/native/orchestration/authoring-service.js';
import { validationDigest } from '../../../src/native/orchestration/plan-repository.js';
import { RouteResolver } from '../../../src/native/model-prompt-runtime/route-resolver.js';
import { createHttpGenerationProvider } from '../../../src/native/adapters/http-generation-provider.js';
import { createResponsesGenerationProvider } from '../../../src/native/adapters/responses-generation-provider.js';
import { attachNativeHostLifecycle } from '../../../src/storage/native-host-lifecycle.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';
import { createSkillRepository } from '../../../src/skills/repository.js';
import { services as projectServices, projectSource } from '../../agent-intelligence/project-fixture.js';
import { services as sessionServices } from '../../native/helpers/session-fixture.js';
import { seedGenerationProfiles } from '../../native/helpers/generation-fixture.js';
import { planFixture, prepareControllerOwnerRoot } from '../fixtures.js';

const id = kind => createNativeId('orchestration' + kind);
export const PROJECT_MODEL_TEXT = 'Synthetic original Project model response.';
const limits = { maxRequests: 4, maxTokens: 100000, localWork: { maxJobs: 32, maxItems: 10000, maxInputBytes: 16777216 } };

// The actual original interactive Executor, scheduler, source, Context, bank,
// model Port and localhost Provider are used. Only remote content/usage is synthetic.
export async function projectModelFixture(make, { responseBody = null, responseStatus = 200, configureSource = async () => {}, configurePlan = async () => {}, changeRoute = route => route, maxModelRounds = 1, format = 'openai-responses' } = {}) {
    const h = await make(), requests = [], effects = [], operations = new Map();
    let afterSend = async () => {}, afterRound = async () => {}, round = null, roundArgs = null;
    const server = http.createServer(async (request, response) => {
        const parts = []; for await (const part of request) parts.push(part);
        const body = JSON.parse(Buffer.concat(parts).toString()); requests.push(body);
        try {
            await afterSend({ body, index: requests.length - 1 });
            response.writeHead(typeof responseStatus === 'function' ? responseStatus(requests.length - 1) : responseStatus, { 'content-type': 'application/json' });
            response.end(JSON.stringify(responseBody ? await responseBody({ body, index: requests.length - 1 }) : {
                id: 'synthetic-project-response', status: 'completed', output: [{ id: 'synthetic-project-message', type: 'message', status: 'completed', role: 'assistant',
                    content: [{ type: 'output_text', text: PROJECT_MODEL_TEXT, annotations: [] }] }], usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 },
            }));
        } catch (error) { response.destroy(error); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let scheduler;
    try {
        await prepareControllerOwnerRoot(h.dirs.root); attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        const svc = projectServices(h), original = projectSource(), projectId = original.project.projectId;
        await configureSource({ h, ...svc, source: original });
        const project = await svc.studio.createProject(h.handle, original);
        const task = await svc.agent.createTask(h.handle, projectId, { intent: 'Describe the current Project using original Native authority.', baseRevision: project.revision.revision });
        const core = sessionServices(h).core;
        const seeded = await seedGenerationProfiles({ ...h, roles: ['studio'], format, endpoint: `http://127.0.0.1:${server.address().port}/v1/responses` });
        await seeded.persistence.saveRuntimeRoute(h.handle, changeRoute({ ...seeded.routes[0], policy: { timeoutMs: 10000, maxRetries: 0, maxFallbackAttempts: 0 },
            executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [seeded.model.modelProfileId], continuity: 'none', reuse: 'disabled', computeBudget: limits } }));
        const route = await seeded.persistence.getRuntimeRoute(h.handle, seeded.routes[0].runtimeRouteId);
        const providers = format === 'openai-compatible' ? { 'provider.openai-compatible': createHttpGenerationProvider() } : { 'provider.openai-responses': createResponsesGenerationProvider() };
        const host = new NativeGenerationHost({ persistence: seeded.persistence, library: seeded.library, sessionCore: core, ...svc, providers,
            skillRepository: () => createSkillRepository(h.dirs.root), extensions: { settings: async () => ({ value: {} }) },
            secretPort: { resolveSecret: async () => 'synthetic-project-only-secret' } });
        const modelResolver = new RouteResolver({ persistence: host.persistence, library: host.library, providers });
        const { plans } = createOrchestrationAuthoringService(h.engine, { sessionCore: core, projectAgent: svc.agent, studio: svc.studio, modelResolver });
        const authority = new NativeNarratorOrchestrationAuthority({ engine: h.engine, sessionCore: core, projectAgent: svc.agent, projectRepository: svc.repository, modelResolver, plans });
        host.turnOrchestration = authority;
        const plan = planFixture(), output = plan.definition.nodes[0], nodeId = id('Node');
        plan.definition.nodes = [{ nodeId, kind: 'agent', label: 'Original Project executor', inputs: [], outputs: [{ name: 'response', type: 'json', required: false }],
            dependencyPinIds: ['studio.route'], capabilities: ['generation.send'], policy: { agentPinId: 'studio.route' } },
        { ...output, inputs: [{ name: 'response', type: 'json', required: true }] }];
        plan.definition.entryNodeIds = [nodeId]; plan.definition.capabilityCeiling = ['generation.send'];
        plan.definition.edges = [{ edgeId: id('Edge'), from: { nodeId, port: 'response' }, to: { nodeId: output.nodeId, port: 'response' }, condition: 'always', maxVisits: 1, loopBack: false }];
        plan.definition.limits.maxSteps = 50;
        plan.dependencyPins = [{ pinId: 'studio.route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId }, integrity: hash(route) }];
        await configurePlan({ plan, h, host, seeded, task, original, route });
        const draft = await plans.create(h.handle, id('Command'), plan), expected = { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash };
        const validation = await plans.validate(h.handle, expected);
        if (validation.status !== 'valid') throw new Error('Real Project mechanism fixture validation failed: ' + JSON.stringify(validation.issues));
        const { planRef } = await plans.publish(h.handle, id('Command'), { ...expected, validationDigest: validationDigest(validation) });
        const sourceSelector = { domain: 'project', projectId, taskId: task.taskId };
        await plans.saveBinding(h.handle, id('Command'), { sourceSelector, planRef, expectedVersion: null });
        // Observe original results without manufacturing a scope, grant or receipt.
        const prepareRound = authority.prepareProjectRound.bind(authority);
        authority.prepareProjectRound = async args => { roundArgs = args; round = await prepareRound(args); await afterRound({ args, round }); return round; };
        const prepareEffect = authority.execution.effects.prepare.bind(authority.execution.effects);
        authority.execution.effects.prepare = async (handle, input) => { const value = await prepareEffect(handle, input); effects.push({ runId: input.runId, effectId: input.effectId }); return value; };
        scheduler = new NativeTaskScheduler({ retries: 0 });
        let executor = new NativeProjectAgentExecutor({ host, scheduler });
        const input = { runtimeRouteId: route.runtimeRouteId, maxModelRounds };
        const preflight = () => executor.preflight(h.handle, projectId, task.taskId, input);
        const start = async (view, requestId = 'original-project-model') => {
            const operation = await executor.start(h.handle, projectId, task.taskId, { ...input, requestId, expectedPreflightFingerprint: hash(view ?? await preflight()) });
            operations.set(operation.operationId, { scheduler, result: scheduler.operations.get(operation.operationId)?.handle?.result }); return operation;
        };
        const finish = operation => operations.get(operation.operationId)?.result;
        return { h, ...svc, ...seeded, seeded, core, original, task, projectId, route, host, authority, plans, plan, planRef, sourceSelector, input, requests, effects,
            get scheduler() { return scheduler; }, get executor() { return executor; },
            get round() { return round; }, get roundArgs() { return roundArgs; },
            preflight, start, finish, run: async view => finish(await start(view)),
            recreateExecutor: () => { scheduler = new NativeTaskScheduler({ retries: 0 }); executor = new NativeProjectAgentExecutor({ host, scheduler }); },
            onResponse: callback => { afterSend = callback; }, onRound: callback => { afterRound = callback; },
            writeProject: async () => { const next = structuredClone(original); next.project.displayName = 'Independent original Project edit'; next.project.updatedAt = 20;
                return svc.studio.saveProjectSource(h.handle, projectId, { source: next, baseRevision: task.baseRevision, origin: { kind: 'human' } }); },
            cleanup: async () => {
                for (const [operationId, owned] of operations) { const operation = owned.scheduler.operations.get(operationId); if (operation) owned.scheduler.cancel(h.handle, operationId); }
                server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
                await Promise.allSettled([...operations.values()].map(owned => owned.result));
                await h.engine.close(); await h.cleanup();
            } };
    } catch (error) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h.engine.close(); await h.cleanup(); throw error; }
}
