import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectReadFixture, configureProjectToolPlan, projectReadResponse } from './helpers/project-tool-fixture.js';
import { ProjectAgentService } from '../../src/native/project-agent.js';
import { readEffect } from '../../src/native/orchestration/effect-contracts.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));

describe.each(harnesses)('$name original Project tool writer currentness', ({ make }) => {
    test.each(['project_read', 'task_load', 'recovery'])('a human plan during original tool writer %s remains authoritative', async phase => {
        const f = await projectReadFixture(make, { configurePlan: configureProjectToolPlan(['atri_agent_set_plan']), responseBody: () => {
            const response = projectReadResponse();
            response.output[0].name = 'atri_agent_set_plan';
            response.output[0].arguments = JSON.stringify({ summary: 'Older Model plan', steps: [{ id: 'model', title: 'Old Model proposal' }] });
            return response;
        } });
        const execute = ProjectAgentService.prototype.executeTool, operate = ProjectAgentService.prototype._operate;
        const recover = ProjectAgentService.prototype._recover, getProject = f.studio.getProject, getTask = f.repository.get;
        let writing = false, operating = false, changed = false, humanFingerprint;
        ProjectAgentService.prototype.executeTool = async function (...args) {
            if (args[3].nativeEffectPermit === undefined) return execute.apply(this, args);
            writing = true;
            try { return await execute.apply(this, args); } finally { writing = false; }
        };
        ProjectAgentService.prototype._operate = async function (...args) {
            const previous = operating;
            if (writing) operating = true;
            try { return await operate.apply(this, args); } finally { operating = previous; }
        };
        const edit = async () => {
            if (operating && !changed) {
                changed = true;
                const task = await f.agent.setPlan(f.h.handle, f.projectId, f.task.taskId,
                    { summary: 'Human plan during tool writer await', steps: [{ id: 'human', title: 'Keep this human plan' }] });
                humanFingerprint = task.executionFingerprint;
            }
        };
        f.studio.getProject = async function (...args) {
            const project = await getProject.apply(this, args);
            if (phase === 'project_read') await edit();
            return project;
        };
        f.repository.get = async function (...args) {
            const ambient = f.h.engine.hasActiveTransaction(f.h.handle), task = await getTask.apply(this, args);
            if (phase === 'task_load' && !ambient) await edit();
            return task;
        };
        ProjectAgentService.prototype._recover = async function (...args) {
            const result = await recover.apply(this, args);
            if (phase === 'recovery') await edit();
            return result;
        };
        try {
            const result = await f.run().then(value => ({ value }), error => ({ error }));
            expect(changed).toBe(true);
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.plan.summary).toBe('Human plan during tool writer await');
            expect(task.executionFingerprint).toBe(humanFingerprint);
            expect(task.attempts[0].calls).toEqual([]);
            expect(task.conversation).toEqual(f.task.conversation);
            expect(result.error).toMatchObject({ code: { project_read: 'native_orchestration_source_stale',
                task_load: 'native_write_conflict', recovery: 'project_agent_sequence_conflict' }[phase] });
            expect(task.compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            const tool = await f.h.engine.withTransaction(f.h.handle, async tx => (await readEffect(tx, f.h.handle, root, f.effects[1].effectId)).doc);
            expect(tool.status).toBe('dispatching');
            expect(root.outputClaims).toEqual([]); expect(f.requests).toHaveLength(1);
        } finally {
            ProjectAgentService.prototype.executeTool = execute; ProjectAgentService.prototype._operate = operate;
            ProjectAgentService.prototype._recover = recover; f.studio.getProject = getProject; f.repository.get = getTask;
            await f.cleanup();
        }
    }, 30000);
});
