import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectModelFixture } from './helpers/project-model-fixture.js';
import { configureProjectToolPlan } from './helpers/project-tool-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { readProjectReviewOutput } from '../../src/native/orchestration/project-review-output-contracts.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
describe.each(harnesses)('$name original Project bounded repair output', ({ make }) => {
    test.each([false, true])('failed validation continues only within the original repair bound; repeatInvalid=%s', async repeatInvalid => {
        let valid, invalid;
        const f = await projectModelFixture(make, { maxModelRounds: 4,
            configurePlan: async args => {
                valid = structuredClone(args.original); valid.project.displayName = 'Corrected original Project proposal';
                invalid = structuredClone(valid); invalid.package.entryPoints = [];
                await args.host.agent.setPlan(args.h.handle, args.task.projectId, args.task.taskId,
                    { summary: 'Validate then repair bounded proposal', steps: [{ id: 'repair', title: 'Repair proposal', impact: 'low' }] });
                await args.host.agent.executeTool(args.h.handle, args.task.projectId, args.task.taskId,
                    { name: 'atri_agent_project_save', args: { source: invalid, stepId: 'repair' } });
                await configureProjectToolPlan(['atri_agent_set_plan', 'atri_agent_reset_operations', 'atri_agent_project_save', 'atri_agent_prepare_review'])(args);
                const { definition } = args.plan, node = definition.nodes[0];
                definition.outputContract = { ...definition.outputContract, kind: 'project_review', resultPolicy: { outputType: 'json', maxBytes: 16384 } };
                node.inputs.push({ name: 'continuation', type: 'json', required: false });
                definition.edges.push({ edgeId: createNativeId('orchestrationEdge'), from: { nodeId: node.nodeId, port: 'response' },
                    to: { nodeId: node.nodeId, port: 'continuation' }, condition: 'always', maxVisits: 3, loopBack: true });
                definition.limits.maxSteps = 100;
                await args.seeded.persistence.saveModelProfile(args.h.handle, { ...args.seeded.model,
                    limits: { ...args.seeded.model.limits, contextTokens: 65536 } });
            }, responseBody: ({ index }) => {
                const name = ['atri_agent_prepare_review', 'atri_agent_reset_operations', 'atri_agent_project_save', 'atri_agent_prepare_review'][index];
                const args = index === 2 ? { source: repeatInvalid ? invalid : valid, stepId: 'repair' } : {};
                return { id: 'repair-response-' + index, status: 'completed', output: [{ id: 'repair-item-' + index, type: 'function_call', status: 'completed',
                    call_id: 'repair-call-' + index, name, arguments: JSON.stringify(args) }], usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } };
            } });
        try {
            const before = (await f.studio.observeProject(f.h.handle, f.projectId)).source;
            const result = await f.run(), task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(result.task.status).toBe(repeatInvalid ? 'blocked' : 'review');
            expect(task.repairRound).toBe(repeatInvalid ? 2 : 1);
            expect(task.validation.status).toBe(repeatInvalid ? 'failed' : 'passed');
            expect(task.changeSets).toEqual([]); expect((await f.repository.get(f.h.handle, f.projectId, f.task.taskId)).commitIntent).toBeNull();
            expect(f.requests).toHaveLength(4);
            expect(task.compute.attempts).toHaveLength(4);
            expect(task.compute.attempts.every(row => row.status === 'settled' && row.usage.totalTokens === 20)).toBe(true);
            expect((await f.studio.observeProject(f.h.handle, f.projectId)).source).toEqual(before);
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.status).toBe(repeatInvalid ? 'blocked' : 'completed');
            expect(root.outputClaims).toHaveLength(repeatInvalid ? 0 : 1);
            const history = task.conversation.filter(message => message.role === 'tool').map(message => JSON.parse(message.content));
            expect(history.some(item => item.status === 'repair' && item.validation?.status === 'failed')).toBe(true);
            const facts = repeatInvalid ? null : await f.h.engine.withTransaction(f.h.handle, tx => readProjectReviewOutput(tx, f.h.handle, root));
            expect(facts?.receipt.costs.closed ?? false).toBe(!repeatInvalid);
            expect(facts?.receipt.costs.effectIds.length ?? 0).toBe(repeatInvalid ? 0 : 8);
        } finally { await f.cleanup(); }
    }, 120000);
});
