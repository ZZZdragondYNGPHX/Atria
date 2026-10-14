import { runNativeStudioAgentTask } from '../../public/scripts/native/studio-agent.js';
import { executeProjectSkillWork } from './skill-invocation.js';
import { prepareRetrievalCompute } from './retrieval-compute.js';
import { hashNativeDocument } from './repositories/common.js';
import { ConflictError } from '../storage/errors.js';
import { nativeTaskScheduler } from './task-scheduler.js';
import { assertComputeBudget } from '../../public/shared/native-compute-budget.js';
import { fields } from '../../public/shared/native-values.js';

const stopped = task => ['review', 'blocked', 'conflict', 'taken_over', 'completed', 'committing', 'cancelled'].includes(task.status);
const identifier = value => { if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(value)) throw new TypeError('Explicit Native identity required'); return value; };

// One implementation of the existing Studio runner for HTTP and Goal hosts.
// It always stops at Review. No caller can add a formal Commit tool.
export async function executeNativeProjectAgent({ host, handle, projectId, taskId, signal, check = async () => {}, routeRef,
    requestId, maxModelRounds = 12, contextMessage = async () => null, observeCheck = check, initialExpectedSequence }) {
    const { agent, studio } = host;
    let contextFingerprint, contextSequence, firstContext = true, round = 0;
    const current = async () => { signal?.throwIfAborted(); await check(); };
    const observe = async () => { signal?.throwIfAborted(); await observeCheck(); };
    const client = {
        getAgentContext: async (project, task) => {
            await observe(); const context = await agent.getContext(handle, project, task);
            if (firstContext && initialExpectedSequence !== undefined && context.task.sequence !== initialExpectedSequence) throw new ConflictError('native_generation_task_stopped');
            firstContext = false; contextFingerprint = context.task.executionFingerprint; contextSequence = context.task.sequence; return context;
        },
        getAgentTask: (project, task) => agent.getTask(handle, project, task),
        resumeAgentTask: async (project, task) => {
            await observe(); return agent.resumeTask(handle, project, task, { expectedSequence: contextSequence, effectPolicy: 'no-background-model' });
        },
        preflight: (project, revision) => studio.preflightProject(handle, project, { baseRevision: revision }),
        beginAgentGeneration: async (project, task) => {
            await current(); const value = await agent.getTask(handle, project, task);
            if (value.executionFingerprint !== contextFingerprint) throw new ConflictError('native_generation_task_stopped');
            return agent.beginGeneration(handle, project, task, { expectedSequence: value.sequence });
        },
        finishAgentGeneration: (project, task, input) => agent.finishGeneration(handle, project, task, input),
        executeAgentTool: async (project, task, input) => { await current(); return agent.executeTool(handle, project, task, { ...input, effectPolicy: 'no-background-model' }); },
    };
    return runNativeStudioAgentTask({ projectId, taskId, abortSignal: signal, maxModelRounds, client,
        request: async () => ({ routes: (await host.persistence.listRuntimeRoutes(handle)).filter(route => !routeRef || route.runtimeRouteId === routeRef.runtimeRouteId) }),
        work: async (context, operation, input) => {
            await current();
            const compute = await prepareRetrievalCompute({ handle, context, profile: { mode: 'embed', purpose: 'studio.skill.v1' }, persistence: host.persistence, core: host.sessionCore, agent, studio });
            return executeProjectSkillWork({ operation, input, compute, repository: host.skillRepository(handle), projectId,
                settings: operation === 'list' ? (await host.extensions.settings(handle)).value : undefined, signal });
        },
        generate: async ({ source, ...request }) => {
            await current(); const extra = await contextMessage();
            const result = await host.execute(handle, { ...source, role: request.role, messages: extra ? [request.messages[0], extra, ...request.messages.slice(1)] : request.messages,
                tools: request.tools, ...(routeRef ? { routeRef } : {}), requestId: requestId(round++) }, signal, undefined,
            { scheduled: true, ...(routeRef ? { effectPolicy: 'no-background-model' } : {}) });
            await observe();
            return { ...result.response, snapshot: result.snapshot, routing: result.routing };
        },
    });
}

export class NativeProjectAgentExecutor {
    constructor({ host, scheduler = nativeTaskScheduler }) { Object.assign(this, { host, scheduler }); }
    async configuration(handle) {
        // Include every fallback and credential target in the approval fence.
        const routes = (await this.host.persistence.listRuntimeRoutes(handle)).filter(value => value.role === 'role.studio');
        const modelIds = new Set(routes.map(value => value.modelProfileRef.modelProfileId));
        const models = (await this.host.persistence.listModelProfiles(handle)).filter(value => modelIds.has(value.modelProfileId));
        const connectionIds = new Set([...routes.map(value => value.connectionProfileRef.connectionProfileId), ...models.map(value => value.connectionProfileRef.connectionProfileId)]);
        const connections = (await this.host.persistence.listConnectionProfiles(handle)).filter(value => connectionIds.has(value.connectionProfileId));
        return { routes, models, connections };
    }
    async preflight(handle, projectId, taskId, input) {
        fields(input, ['runtimeRouteId', 'maxModelRounds'], 'Project Agent generation preflight');
        identifier(projectId); identifier(taskId); identifier(input.runtimeRouteId);
        if (!Number.isSafeInteger(input.maxModelRounds) || input.maxModelRounds < 1 || input.maxModelRounds > 12) throw new TypeError('Bounded model rounds required');
        const task = await this.host.agent.observeTask(handle, projectId, taskId);
        const revision = await this.host.studio.getRevision(handle, projectId);
        if (stopped(task) || task.baseRevision !== revision.revision || task.attempts.some(value => value.kind === 'generation' && value.status === 'started')) throw new ConflictError('native_generation_task_stopped');
        const configuration = await this.configuration(handle);
        const route = configuration.routes.find(value => value.runtimeRouteId === input.runtimeRouteId && value.scope === 'player');
        if (!route) throw new ConflictError('native_generation_route_missing');
        if (route.policy.maxRetries !== 0 || route.policy.maxFallbackAttempts !== 0) throw new ConflictError('native_generation_automatic_resend_denied');
        const budget = assertComputeBudget(route.executionPolicy?.computeBudget);
        // The original Host charges the durable Task bank before each send.
        // A missing budget is never interpreted as unlimited delegation.
        return { projectId, taskId, baseRevision: task.baseRevision, expectedSequence: task.sequence, runtimeRouteId: input.runtimeRouteId,
            maxModelRounds: input.maxModelRounds, taskFingerprint: hashNativeDocument(task), configurationFingerprint: hashNativeDocument(configuration),
            budget, existingCompute: task.compute ?? null, providerTargets: configuration.connections.map(value => ({ connectionProfileId: value.connectionProfileId,
                endpoint: value.endpoint, secretRef: value.secretRef ?? null, providerAdapter: value.providerAdapter, transport: value.transport })),
            effects: ['explicit-paid-model-generation', 'native-task-proposals', 'temporary-review-preview'], stop: 'human-review-before-formal-commit' };
    }
    async start(handle, projectId, taskId, input) {
        fields(input, ['runtimeRouteId', 'maxModelRounds', 'requestId', 'expectedPreflightFingerprint'], 'Project Agent generation start');
        identifier(input.requestId);
        for (const operation of this.scheduler.operations.values()) if (operation.owner === handle && operation.view.anchor?.projectId === projectId
            && operation.view.anchor?.taskId === taskId && operation.view.anchor?.requestId === input.requestId) {
            if (operation.fingerprint !== hashNativeDocument(input)) throw new ConflictError('native_generation_request_conflict');
            return this.scheduler.project(handle, operation.view.operationId);
        }
        const view = await this.preflight(handle, projectId, taskId, { runtimeRouteId: input.runtimeRouteId, maxModelRounds: input.maxModelRounds });
        if (hashNativeDocument(view) !== input.expectedPreflightFingerprint) throw new ConflictError('native_generation_preflight_conflict');
        const host = Object.create(this.host), agent = Object.create(this.host.agent);
        // Keep Experience collection; prevent unrelated automatic Evolution sends.
        agent._onExperienceCollected = null; host.agent = agent;
        const check = async () => {
            if (hashNativeDocument(await this.configuration(handle)) !== view.configurationFingerprint) throw new ConflictError('native_generation_configuration_conflict');
            if ((await host.studio.getRevision(handle, projectId)).revision !== view.baseRevision) throw new ConflictError('native_generation_revision_conflict');
        };
        let began = false;
        const operation = this.scheduler.submit({ owner: handle, anchor: { projectId, taskId, requestId: input.requestId, runtimeRouteId: input.runtimeRouteId },
            kind: 'model_task', executionClass: 'interactive', resources: [projectId, taskId], key: 'project-agent:' + taskId,
            fingerprint: hashNativeDocument(input), retry: false,
            fresh: async () => { await check(); return began || hashNativeDocument(await host.agent.observeTask(handle, projectId, taskId)) === view.taskFingerprint; },
            run: async ({ signal }) => {
                began = true;
                return executeNativeProjectAgent({ host, handle, projectId, taskId, signal, check, routeRef: { scope: 'player', runtimeRouteId: input.runtimeRouteId },
                    initialExpectedSequence: view.expectedSequence, maxModelRounds: input.maxModelRounds, requestId: round => 'project:' + hashNativeDocument({ requestId: input.requestId, round }) });
            }, finalize: async result => ({ task: result.task }) });
        void operation.result.catch(() => {});
        return this.scheduler.project(handle, operation.operationId);
    }
    status(handle, projectId, taskId, operationId) {
        const operation = this.scheduler.project(handle, operationId);
        if (operation.anchor?.projectId !== projectId || operation.anchor?.taskId !== taskId || operation.kind !== 'model_task') throw new ConflictError('native_generation_operation_conflict');
        return operation;
    }
    cancel(handle, projectId, taskId, operationId) {
        this.status(handle, projectId, taskId, operationId);
        this.scheduler.cancel(handle, operationId);
        return this.status(handle, projectId, taskId, operationId);
    }
}
