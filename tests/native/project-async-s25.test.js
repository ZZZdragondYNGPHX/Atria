import { expect, jest, test } from '@jest/globals';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { projectSource, services } from '../agent-intelligence/project-fixture.js';
import { GoalContinuationService } from '../../src/native/agent-intelligence/goal-continuation.js';
import { NativeTaskScheduler } from '../../src/native/task-scheduler.js';

for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    test(`S25 ${kind} an existing pending Project wake stops at Review without submitting another background worker`, async () => {
        const h = await make();
        try {
            const p = services(h), source = projectSource(), projectId = source.project.projectId;
            const project = await p.studio.createProject(h.handle, source), intent = 'Rename the Project after review';
            const task = await p.agent.createTask(h.handle, projectId, { intent, baseRevision: project.revision.revision });
            const scheduler = new NativeTaskScheduler({ concurrency: 1 }), submit = jest.spyOn(scheduler, 'submit');
            const host = { ...p, persistence: { _engine: h.engine } }, continuation = new GoalContinuationService({ host, scheduler });
            const goal = await continuation.goals.create(h.handle, { subject: { kind: 'user', actorId: null }, scope: { domain: 'project', projectId }, intent,
                criteria: [{ criterionId: 'name', description: 'Formal Project name', selector: { kind: 'project_field', path: ['project', 'displayName'] },
                    path: ['fieldValue'], equals: 'Reviewed name' }], invariants: [],
                budget: { maxRequests: 2, maxTokens: 64000, localWork: { maxJobs: 32, maxItems: 1000, maxInputBytes: 16777216 } } });
            await continuation.bind(h.handle, { goalId: goal.goalId, expectedSequence: 0, taskId: task.taskId });
            await p.agent.queueGoalWake(h.handle, projectId, task.taskId, goal.goalId, 'queued-before-review');
            await p.agent.setPlan(h.handle, projectId, task.taskId, { summary: 'Rename', steps: [{ id: 'rename', title: 'Rename', impact: 'low' }] });
            const proposal = structuredClone(project.source); proposal.project.displayName = 'Reviewed name';
            await p.agent.executeTool(h.handle, projectId, task.taskId, { name: 'atri_agent_project_save', args: { source: proposal, stepId: 'rename' } });
            let release;
            let entered;
            const started = new Promise(resolve => { entered = resolve; });
            const blocker = scheduler.submit({ owner: h.handle, anchor: {}, kind: 'auxiliary_task', executionClass: 'background', resources: [],
                key: 'blocker', fingerprint: 'blocker', fresh: async () => true,
                run: () => new Promise(resolve => { release = resolve; entered(); }), finalize: async value => value });
            await started;
            const queued = await continuation.pump(h.handle, { goalId: goal.goalId });
            expect(typeof queued.operationId).toBe('string'); submit.mockClear();
            await p.agent.prepareReview(h.handle, projectId, task.taskId);
            const before = await p.agent.getTask(h.handle, projectId, task.taskId);
            expect(before.status).toBe('review'); expect(before.goalBinding.wakes[0].status).toBe('pending');
            const result = await continuation.pump(h.handle, { goalId: goal.goalId });
            expect(result.continuation).toBe('stopped'); expect(submit).not.toHaveBeenCalled();
            release(null); await blocker.result;
            await expect(queued.completion).rejects.toMatchObject({ code: 'operation_stale' });
            const after = await p.agent.getTask(h.handle, projectId, task.taskId);
            expect(after.status).toBe('review'); expect(after.goalBinding.wakes).toEqual(before.goalBinding.wakes);
            expect(after.compute.attempts).toEqual(before.compute.attempts);
            expect((await p.studio.getProject(h.handle, projectId)).revision.revision).toBe(project.revision.revision);
            const restored = new GoalContinuationService({ host, scheduler: new NativeTaskScheduler() });
            expect((await restored.pump(h.handle, { goalId: goal.goalId })).continuation).toBe('stopped');
            expect((await p.agent.getTask(h.handle, projectId, task.taskId)).goalBinding.wakes).toEqual(before.goalBinding.wakes);
        } finally { await h.cleanup(); }
    }, 30000);
}
