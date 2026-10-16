import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectModelFixture } from './helpers/project-model-fixture.js';
import { configureProjectToolPlan } from './helpers/project-tool-fixture.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const plan = { summary: 'Inspect then prepare an original Task plan', steps: [{ id: 'inspect', title: 'Inspect original source', impact: 'low' }] };
const calls = names => ({ id: 'batch-response', status: 'completed', output: names.map((name, i) => ({ id: 'batch-item-' + i,
    type: 'function_call', status: 'completed', call_id: 'batch-call-' + i, name,
    arguments: JSON.stringify(name === 'atri_agent_set_plan' ? plan : {}) })), usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } });

describe.each(harnesses)('$name original Project tool batch', ({ make }) => {
    test.each([
        { names: ['atri_agent_get_project', 'atri_agent_set_plan'], allowed: true },
        { names: ['atri_agent_reset_operations', 'atri_agent_set_plan'], allowed: false },
        { names: ['atri_agent_set_plan', 'atri_agent_get_project'], allowed: false },
    ])('advertises the actual contract and enforces $names before any prohibited Task call', async ({ names, allowed }) => {
        const f = await projectModelFixture(make, { configurePlan: configureProjectToolPlan(['atri_agent_get_project', 'atri_agent_set_plan', 'atri_agent_reset_operations']),
            responseBody: () => calls(names) });
        try {
            const result = await f.run().then(value => ({ value }), error => ({ error }));
            expect(result.error?.code ?? null).toBe(allowed ? null : 'native_orchestration_project_tool_batch_unavailable');
            const wire = JSON.stringify(f.requests[0]);
            expect(wire).toContain('The per-response proposal limit is 1');
            expect(wire).toContain('Any proposal call must be last');
            expect(f.requests[0].tools.map(tool => (tool.function ?? tool).name)).toEqual(['atri_agent_get_project', 'atri_agent_set_plan', 'atri_agent_reset_operations']);
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId), attempt = task.attempts.find(item => item.kind === 'generation');
            expect(attempt.calls.map(call => call.name)).toEqual(allowed ? names : []);
            expect(task.plan?.summary ?? null).toBe(allowed ? plan.summary : null);
            expect(task.compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
            expect(f.requests).toHaveLength(1); expect(task.changeSets).toEqual([]);
            expect((await f.studio.observeRevision(f.h.handle, f.projectId)).revision).toBe(f.task.baseRevision);
        } finally { await f.cleanup(); }
    }, 45000);
});
