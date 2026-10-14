import { nativeTaskScheduler } from '../task-scheduler.js';
import { hashNativeDocument } from '../repositories/common.js';
import { AgentGoalService } from './goal-service.js';
import { fields, text } from './contracts.js';
import { ConflictError } from '../../storage/errors.js';
import { executeNativeProjectAgent } from '../project-agent-executor.js';
import { randomUUID } from 'node:crypto';
import { goalContextMessage } from '../../../public/shared/agent-goal-context.js';

const definition = goal => hashNativeDocument(Object.fromEntries(['subject', 'scope', 'anchor', 'intent', 'criteria', 'invariants', 'budget'].map(key => [key, goal[key]])));
const eligible = goal => goal.subject.kind === 'user' && ['active', 'waiting'].includes(goal.status);
const stoppedTask = task => ['review', 'blocked', 'completed', 'cancelled', 'taken_over', 'committing', 'conflict'].includes(task.status);
export class GoalContinuationService {
    constructor({ host, chatRepo, scheduler = nativeTaskScheduler }) {
        Object.assign(this, { host, scheduler });
        this.goals = new AgentGoalService({ engine: host.persistence._engine, sessionCore: host.sessionCore, studio: host.studio, agent: host.agent, chatRepo });
    }
    async _controlledConfiguration(handle) {
        const routes = (await this.host.persistence.listRuntimeRoutes(handle)).filter(route => route.role === 'role.studio');
        const modelIds = new Set(routes.map(route => route.modelProfileRef.modelProfileId));
        const connectionIds = new Set(routes.map(route => route.connectionProfileRef.connectionProfileId));
        const models = (await this.host.persistence.listModelProfiles(handle)).filter(model => modelIds.has(model.modelProfileId));
        for (const model of models) connectionIds.add(model.connectionProfileRef.connectionProfileId);
        const connections = (await this.host.persistence.listConnectionProfiles(handle)).filter(connection => connectionIds.has(connection.connectionProfileId));
        return { routes, models, connections };
    }
    async preflight(handle, input) {
        fields(input, ['goalId', ...(input.taskId === undefined ? [] : ['taskId'])], 'Goal controlled preflight');
        const goal = await this.goals._stored(handle, { goalId: input.goalId });
        const taskId = input.taskId ?? goal.execution?.taskId;
        if (taskId && (goal.scope.domain !== 'project' || goal.execution && goal.execution.taskId !== taskId)) throw new ConflictError('goal_execution_binding_conflict');
        const task = taskId ? await this.host.agent.observeTask(handle, goal.scope.projectId, taskId) : null;
        const configuration = task ? await this._controlledConfiguration(handle) : { routes: [], models: [], connections: [] };
        const source = goal.scope.domain === 'project' ? await this.host.studio.getRevision(handle, goal.scope.projectId)
            : goal.scope.domain === 'rp_session' ? (await this.host.sessionCore.observe(handle, goal.scope.sessionId)).revision : goal.anchor;
        return { goal, goalDefinitionFingerprint: definition(goal), taskId: taskId ?? null, taskFingerprint: hashNativeDocument(task),
            sourceFingerprint: hashNativeDocument(source), configurationFingerprint: hashNativeDocument(configuration), budget: goal.budget,
            providerTargets: configuration.connections.map(c => ({ connectionProfileId: c.connectionProfileId, endpoint: c.endpoint, secretRef: c.secretRef ?? null,
                providerAdapter: c.providerAdapter, transport: c.transport })),
            execution: task ? 'explicit_background_model_under_native_budget' : 'evidence_only_no_background_model' };
    }
    async controlled(handle, input) {
        fields(input, ['action', 'goalId', 'expectedSequence', 'expectedGoalDefinition', 'expectedTaskFingerprint', 'expectedSourceFingerprint',
            'expectedConfigurationFingerprint', ...(input.eventId === undefined ? [] : ['eventId']), ...(input.taskId === undefined ? [] : ['taskId'])], 'Controlled Goal execution');
        if (!['bind', 'wake', 'pump', 'resume'].includes(input.action)) throw new TypeError('Fixed controlled Goal action required');
        const view = await this.preflight(handle, { goalId: input.goalId, ...(input.taskId ? { taskId: input.taskId } : {}) });
        if (view.goal.sequence !== input.expectedSequence || view.goalDefinitionFingerprint !== input.expectedGoalDefinition
            || view.taskFingerprint !== input.expectedTaskFingerprint || view.sourceFingerprint !== input.expectedSourceFingerprint
            || view.configurationFingerprint !== input.expectedConfigurationFingerprint) throw new ConflictError('goal_controlled_preflight_stale');
        const fence = async () => {
            const goal = await this.goals._stored(handle, { goalId: input.goalId });
            if (definition(goal) !== input.expectedGoalDefinition
                || view.taskId && hashNativeDocument(await this._controlledConfiguration(handle)) !== input.expectedConfigurationFingerprint)
                throw new ConflictError('goal_controlled_execution_stale');
        };
        if (input.action === 'bind') return this.bind(handle, { goalId: input.goalId, expectedSequence: input.expectedSequence, taskId: input.taskId });
        if (input.action === 'resume') return this.control(handle, { goalId: input.goalId, expectedSequence: input.expectedSequence, action: 'resume' });
        if (input.action === 'wake') return this.wake(handle, { goalId: input.goalId, eventId: input.eventId }, { fence });
        return this.pump(handle, { goalId: input.goalId }, { fence });
    }
    async control(handle, input) {
        const goal = await this.goals.control(handle, input);
        if (goal.execution && ['pause', 'cancel'].includes(input.action)) {
            const task = await this.host.agent.getTask(handle, goal.scope.projectId, goal.execution.taskId);
            for (const wake of task.goalBinding?.wakes ?? []) if (wake.status === 'running' && wake.operationId) {
                try { this.scheduler.cancel(handle, wake.operationId); } catch (error) { if (error.code !== 'operation_not_found') throw error; }
            }
            if (input.action === 'cancel' && !['completed', 'cancelled', 'taken_over', 'committing'].includes(task.status)) await this.host.agent.takeOver(handle, goal.scope.projectId, task.taskId);
        }
        return goal;
    }
    async inspect(handle, input) {
        fields(input, ['goalId'], 'Goal continuation inspection');
        const goal = await this.goals.get(handle, input);
        const task = goal.execution ? await this.host.agent.getTask(handle, goal.scope.projectId, goal.execution.taskId) : null;
        return { goal, taskId: task?.taskId ?? null, wakes: task?.goalBinding?.wakes ?? [], compute: task?.compute ?? null };
    }
    async bind(handle, input) {
        fields(input, ['goalId', 'expectedSequence', 'taskId'], 'Goal execution binding');
        const goal = await this.goals.get(handle, { goalId: input.goalId });
        if (goal.sequence !== input.expectedSequence || !eligible(goal) || goal.scope.domain !== 'project'
            || (goal.execution && goal.execution.taskId !== input.taskId)) throw new ConflictError('goal_execution_binding_conflict');
        await this.host.agent.bindGoal(handle, goal.scope.projectId, input.taskId, { goalId: goal.goalId, definitionHash: definition(goal),
            intent: goal.intent, revision: goal.anchor.baseRevision, limits: goal.budget });
        if (goal.execution) return goal;
        return this.goals.repository.save(handle, { ...goal, execution: { kind: 'project_task', taskId: input.taskId }, sequence: goal.sequence + 1, updatedAt: Date.now() }, hashNativeDocument(goal));
    }
    async wake(handle, input, { fence = null } = {}) {
        fields(input, ['goalId', 'eventId'], 'Goal wake');
        text(input.eventId, 'Goal event');
        if (input.eventId.length > 160) throw new TypeError('Goal event bounds');
        let goal = await this.goals._stored(handle, { goalId: input.goalId });
        if (!goal.execution && goal.scope.domain !== 'project') return this.goals.observe(handle, input);
        if (!goal.execution) throw new ConflictError('goal_execution_unavailable');
        if (!eligible(goal)) return goal;
        goal = await this._verify(handle, goal);
        if (!eligible(goal)) return goal;
        const task = await this.host.agent.getTask(handle, goal.scope.projectId, goal.execution.taskId);
        if (stoppedTask(task)) return goal;
        await this.host.agent.queueGoalWake(handle, goal.scope.projectId, task.taskId, goal.goalId, input.eventId);
        return this.pump(handle, { goalId: goal.goalId }, { fence });
    }
    async _verify(handle, goal) {
        const { agent } = this.host, projectId = goal.scope.projectId, taskId = goal.execution.taskId;
        const attemptId = randomUUID();
        const ticket = await agent.chargeGoalWork(handle, projectId, taskId, goal.goalId, { attemptId,
            requestId: 'goal-proof:' + randomUUID(), targetFingerprint: definition(goal), kind: 'goal_validate',
            estimatedItems: 1, estimatedInputBytes: Buffer.byteLength(JSON.stringify(goal), 'utf8') });
        // The original Task evidence fingerprint includes its bank. Persist the
        // conservative occupancy before capture; settling afterwards would
        // invalidate our own exact source proof. No completed CPU is invented.
        if (ticket) await agent.settleLocalWork(handle, projectId, taskId, attemptId, null);
        return this.goals.evaluate(handle, { goalId: goal.goalId, expectedSequence: goal.sequence });
    }
    async pump(handle, input, { fence = null } = {}) {
        fields(input, ['goalId'], 'Goal pump');
        let goal = await this.goals._stored(handle, input);
        await fence?.();
        if (!goal.execution || !eligible(goal)) return goal;
        goal = await this._verify(handle, goal);
        if (!eligible(goal)) return goal;
        const projectId = goal.scope.projectId, taskId = goal.execution.taskId;
        const task = await this.host.agent.getTask(handle, projectId, taskId);
        if (task.goalBinding?.goalId !== goal.goalId || task.goalBinding.definitionHash !== definition(goal)) throw new ConflictError('goal_execution_binding_conflict');
        if (stoppedTask(task)) return { goal, task, continuation: 'stopped' };
        // A previous claim might already have sent. Never turn it into a free resend.
        if (task.goalBinding.wakes.some(wake => wake.status === 'running' || wake.status === 'unknown')) return { goal, task, continuation: 'unknown' };
        const wake = task.goalBinding.wakes.find(item => item.status === 'pending');
        if (!wake) return { goal, task, continuation: 'idle' };
        const operation = this.scheduler.submit({ owner: handle, anchor: { projectId, goalId: goal.goalId, taskId }, kind: 'auxiliary_task', executionClass: 'background',
            resources: [projectId, taskId], key: 'goal:' + goal.goalId, fingerprint: hashNativeDocument({ goal: definition(goal), eventId: wake.eventId }), retry: false,
            fresh: async () => {
                await fence?.();
                const task = await this.host.agent.getTask(handle, projectId, taskId);
                return !stoppedTask(task) && eligible(await this._verify(handle, await this.goals._stored(handle, { goalId: goal.goalId })));
            },
            run: async ({ signal, operationId }) => {
                await this.host.agent.claimGoalWake(handle, projectId, taskId, goal.goalId, wake.eventId, operationId);
                try {
                    const result = await this._project(handle, goal, wake, signal, fence);
                    await this.host.agent.finishGoalWake(handle, projectId, taskId, goal.goalId, wake.eventId, operationId, 'done');
                    return result;
                } catch (error) {
                    await this.host.agent.finishGoalWake(handle, projectId, taskId, goal.goalId, wake.eventId, operationId, signal.aborted ? 'cancelled' : 'unknown');
                    throw error;
                }
            }, finalize: async result => ({ ...result, goal: await this._verify(handle, await this.goals._stored(handle, { goalId: goal.goalId })) }) });
        // HTTP acknowledgement does not await this Promise; the durable Task
        // wake stores failure/unknown independently, and rejection is observed.
        void operation.result.catch(() => {});
        return { goal, task, operationId: operation.operationId, completion: operation.result };
    }
    async _project(handle, goal, wake, signal, fence = null) {
        const projectId = goal.scope.projectId, taskId = goal.execution.taskId;
        const check = async () => {
            signal.throwIfAborted();
            await fence?.();
            const stored = await this.goals._stored(handle, { goalId: goal.goalId });
            if (!eligible(stored)) throw new ConflictError('goal_execution_stopped');
            const current = await this._verify(handle, stored);
            if (!eligible(current) || current.execution?.taskId !== taskId) throw new ConflictError('goal_execution_stopped');
        };
        return executeNativeProjectAgent({ host: this.host, handle, projectId, taskId, signal, check,
            observeCheck: async () => { await fence?.(); if (!eligible(await this.goals._stored(handle, { goalId: goal.goalId }))) throw new ConflictError('goal_execution_stopped'); },
            requestId: round => 'goal:' + hashNativeDocument({ goalId: goal.goalId, eventId: wake.eventId, round }),
            contextMessage: async () => goalContextMessage({ goals: [await this.goals.get(handle, { goalId: goal.goalId })] }) });
    }
}
