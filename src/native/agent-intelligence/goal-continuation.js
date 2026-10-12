import { nativeTaskScheduler } from '../task-scheduler.js';
import { hashNativeDocument } from '../repositories/common.js';
import { AgentGoalService } from './goal-service.js';
import { fields, text } from './contracts.js';
import { ConflictError } from '../../storage/errors.js';
import { runNativeStudioAgentTask } from '../../../public/scripts/native/studio-agent.js';
import { executeProjectSkillWork } from '../skill-invocation.js';
import { prepareRetrievalCompute } from '../retrieval-compute.js';
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
    async wake(handle, input) {
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
        return this.pump(handle, { goalId: goal.goalId });
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
    async pump(handle, input) {
        fields(input, ['goalId'], 'Goal pump');
        let goal = await this.goals._stored(handle, input);
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
                const task = await this.host.agent.getTask(handle, projectId, taskId);
                return !stoppedTask(task) && eligible(await this._verify(handle, await this.goals._stored(handle, { goalId: goal.goalId })));
            },
            run: async ({ signal, operationId }) => {
                await this.host.agent.claimGoalWake(handle, projectId, taskId, goal.goalId, wake.eventId, operationId);
                try {
                    const result = await this._project(handle, goal, wake, signal);
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
    async _project(handle, goal, wake, signal) {
        const { agent, studio } = this.host, projectId = goal.scope.projectId, taskId = goal.execution.taskId;
        const check = async () => {
            signal.throwIfAborted();
            const stored = await this.goals._stored(handle, { goalId: goal.goalId });
            if (!eligible(stored)) throw new ConflictError('goal_execution_stopped');
            const current = await this._verify(handle, stored);
            if (!eligible(current) || current.execution?.taskId !== taskId) throw new ConflictError('goal_execution_stopped');
        };
        let contextFingerprint;
        const client = {
            getAgentContext: async (project, task) => {
                const context = await agent.getContext(handle, project, task);
                contextFingerprint = context.task.executionFingerprint;
                return context;
            },
            getAgentTask: (project, task) => agent.getTask(handle, project, task),
            resumeAgentTask: (project, task) => agent.resumeTask(handle, project, task),
            preflight: (project, revision) => studio.preflightProject(handle, project, { baseRevision: revision }),
            beginAgentGeneration: async (project, task) => {
                await check();
                const current = await agent.getTask(handle, project, task);
                if (current.executionFingerprint !== contextFingerprint) throw new ConflictError('native_generation_task_stopped');
                return agent.beginGeneration(handle, project, task, { expectedSequence: current.sequence });
            },
            finishAgentGeneration: (project, task, input) => agent.finishGeneration(handle, project, task, input),
            executeAgentTool: async (project, task, input) => { await check(); return agent.executeTool(handle, project, task, input); },
        };
        let round = 0;
        return runNativeStudioAgentTask({ projectId, taskId, abortSignal: signal, client,
            request: async () => ({ routes: await this.host.persistence.listRuntimeRoutes(handle) }),
            work: async (context, operation, input) => {
                await check();
                const compute = await prepareRetrievalCompute({ handle, context, profile: { mode: 'embed', purpose: 'studio.skill.v1' },
                    persistence: this.host.persistence, core: this.host.sessionCore, agent, studio });
                return executeProjectSkillWork({ operation, input, compute, repository: this.host.skillRepository(handle), projectId,
                    settings: operation === 'list' ? (await this.host.extensions.settings(handle)).value : undefined, signal });
            }, generate: async ({ source, ...request }) => {
                await check();
                const currentGoal = await this.goals.get(handle, { goalId: goal.goalId });
                const contextMessage = goalContextMessage({ goals: [currentGoal] });
                const result = await this.host.execute(handle, { ...source, role: request.role, messages: request.messages, tools: request.tools,
                    ...(contextMessage ? { messages: [request.messages[0], contextMessage, ...request.messages.slice(1)] } : {}),
                    requestId: 'goal:' + hashNativeDocument({ goalId: goal.goalId, eventId: wake.eventId, round: round++ }) }, signal);
                return { ...result.response, snapshot: result.snapshot, routing: result.routing };
            } });
    }
}
