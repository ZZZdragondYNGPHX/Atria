import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectModelFixture } from './helpers/project-model-fixture.js';
import { configureProjectToolPlan } from './helpers/project-tool-fixture.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const replacement = { summary: 'Replacement plan', steps: [{ id: 'different', title: 'Replace old step' }] };
const original = { summary: 'Saved proposal plan', steps: [{ id: 'retained', title: 'Preserve proposal authority' }] };
const configure = async args => {
    await args.host.agent.setPlan(args.h.handle, args.task.projectId, args.task.taskId, original);
    await args.host.agent.executeTool(args.h.handle, args.task.projectId, args.task.taskId,
        { name: 'atri_agent_project_save', args: { source: args.original, stepId: 'retained' } });
    await configureProjectToolPlan(['atri_agent_set_plan', 'atri_agent_prepare_review'])(args);
    Object.assign(args.plan.definition.outputContract, { kind: 'project_review', resultPolicy: { outputType: 'json', maxBytes: 16384 } });
};

describe.each(harnesses)('$name original Project proposal step references', ({ make }) => {
    test('Plan replacement refuses orphaned proposals before persistence, retains valid IDs, and changes IDs only after an explicit reset', async () => {
        const f = await projectModelFixture(make, { configurePlan: configure });
        try {
            const before = await f.repository.get(f.h.handle, f.projectId, f.task.taskId);
            const error = await f.agent.setPlan(f.h.handle, f.projectId, f.task.taskId, replacement).then(() => null, error => error);
            expect(error.code).toBe('project_agent_plan_proposals_conflict'); expect(error.atriTaskPersistence).toBeUndefined();
            expect(hash(await f.repository.get(f.h.handle, f.projectId, f.task.taskId))).toBe(hash(before));
            const retained = await f.agent.setPlan(f.h.handle, f.projectId, f.task.taskId,
                { summary: 'Refine current steps', steps: [{ id: 'retained', title: 'Refined original step' }] });
            expect(retained.operations[0].stepId).toBe('retained'); expect(retained.plan.steps[0].title).toBe('Refined original step');
            await f.agent.resetOperations(f.h.handle, f.projectId, f.task.taskId);
            const replaced = await f.agent.setPlan(f.h.handle, f.projectId, f.task.taskId, replacement);
            expect(replaced.plan.steps[0].id).toBe('different'); expect(replaced.operations).toEqual([]); expect(f.requests).toEqual([]);
        } finally { await f.cleanup(); }
    }, 60000);

    test('a real Model tool proposal conflict records the stopped Root and preserves the original proposal and billed attempts', async () => {
        const f = await projectModelFixture(make, { configurePlan: configure, responseBody: () => ({ id: 'plan-ref-conflict', status: 'completed',
            output: [{ id: 'plan-ref-item', type: 'function_call', status: 'completed', call_id: 'plan-ref-call', name: 'atri_agent_set_plan', arguments: JSON.stringify(replacement) }],
            usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } }) });
        try {
            await expect(f.run()).rejects.toMatchObject({ code: 'project_agent_plan_proposals_conflict' });
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.plan.steps[0].id).toBe('retained'); expect(task.operations[0].stepId).toBe('retained'); expect(task.changeSets).toEqual([]);
            expect(task.compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
            const tool = task.compute.localWork.find(row => row.kind === 'project_tool');
            expect(tool).toMatchObject({ status: 'settled', usage: { outcome: 'failed' } });
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.status).toBe('reconciling'); expect(root.pendingEffectRefs).toHaveLength(1); expect(root.outputClaims).toEqual([]);
            const rows = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle, runId: root.runId, recordType: 'receipt' }));
            expect(rows.filter(row => row.doc.receiptKind === 'project_failure').map(row => row.doc.reasonCode)).toEqual(['project_plan_proposals_conflict']);
            expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);
});
