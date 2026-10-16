import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectReadFixture, configureProjectToolPlan } from './helpers/project-tool-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { readProjectRoundReceipt } from '../../src/native/orchestration/project-round-contracts.js';
import { readProjectOwnedSource } from '../../src/native/orchestration/project-tool-receipts.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const plan = { summary: 'Prepare an original Project review', steps: [{ id: 'rename', title: 'Rename Project', impact: 'low' }] };
const fixture = async (make, { unpinned = false, invalid = false } = {}) => {
    let original;
    return projectReadFixture(make, { maxModelRounds: 3, configurePlan: async args => {
        original = structuredClone(args.original); original.project.displayName = 'Proposed Native Project name';
        if (invalid) original.package.entryPoints = [];
        await configureProjectToolPlan(['atri_agent_set_plan', 'atri_agent_project_save', ...unpinned ? [] : ['atri_agent_prepare_review']])(args);
        await args.seeded.persistence.saveModelProfile(args.h.handle, { ...args.seeded.model, limits: { ...args.seeded.model.limits, contextTokens: 65536 } });
        const { definition } = args.plan, node = definition.nodes[0];
        node.inputs.push({ name: 'continuation', type: 'json', required: false });
        definition.edges.push({ edgeId: createNativeId('orchestrationEdge'), from: { nodeId: node.nodeId, port: 'response' },
            to: { nodeId: node.nodeId, port: 'continuation' }, condition: 'always', maxVisits: 2, loopBack: true });
        definition.limits.maxLoopIterations = 2; definition.limits.maxEdgeVisits = Math.max(definition.limits.maxEdgeVisits, 3);
    }, responseBody: ({ index }) => ({ id: 'review-response-' + index, status: 'completed', output: [{ id: 'review-item-' + index,
        type: 'function_call', status: 'completed', call_id: 'review-call-' + index,
        name: ['atri_agent_set_plan', 'atri_agent_project_save', 'atri_agent_prepare_review'][index],
        arguments: JSON.stringify(index === 0 ? plan : index === 1 ? { source: original, stepId: 'rename' } : {}) }],
    usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } }) });
};

describe.each(harnesses)('$name original Project proposal and Review Effects', ({ make }) => {
    test('actual proposals and evaluated Workspace end at original human Review without a formal Project commit', async () => {
        const f = await fixture(make);
        try {
            await f.run(); const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.status).toBe('review'); expect(task.review.required).toBe(true); expect(task.validation.status).toBe('passed');
            expect(task.workspace.operations).toHaveLength(1); expect(task.workspace.operations[0].operationType).toBe('project.save');
            expect(task.changeSets).toEqual([]);
            expect((await f.repository.get(f.h.handle, f.projectId, f.task.taskId)).commitIntent).toBeNull();
            expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.original.project.displayName);
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const last = await readProjectRoundReceipt(tx, f.h.handle, root, root.attemptRefs.at(-1), { projectAgent: f.agent });
                expect(last.receipt.round).toBe(2);
                expect((await readProjectOwnedSource(tx, f.h.handle, root, { projectAgent: f.agent })).reviewSource).toBe(true);
            });
            expect(task.attempts.filter(item => item.kind === 'generation').every(item => item.status === 'completed')).toBe(true);
            expect(f.requests).toHaveLength(3); expect(task.compute.attempts).toHaveLength(3);
        } finally { await f.cleanup(); }
    }, 45000);

    test('generation.send and a proposal grant without the exact original Review descriptor cannot evaluate a Workspace', async () => {
        const f = await fixture(make, { unpinned: true });
        try {
            await expect(f.run()).rejects.toThrow('native_orchestration_project_tool_scope_unavailable');
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect((await f.repository.get(f.h.handle, f.projectId, f.task.taskId)).proposals).toHaveLength(1);
            expect(task.workspace).toBeNull(); expect(task.review).toBeNull(); expect(task.changeSets).toEqual([]);
            expect(task.compute.attempts).toHaveLength(3); expect(f.requests).toHaveLength(3);
        } finally { await f.cleanup(); }
    }, 45000);

    test.each([false, true])('Review final Task receipt ACK saved=%s never repeats the original Workspace evaluation', async saved => {
        const f = await fixture(make), save = f.repository.save.bind(f.repository), evaluate = f.studio.evaluateWorkspace.bind(f.studio);
        let writes = 0, evaluations = 0;
        f.studio.evaluateWorkspace = (...args) => { evaluations++; return evaluate(...args); };
        f.repository.save = async (handle, next, ...args) => {
            if (next.attempts.some(attempt => attempt.calls.some(call => call.nativeReceipt?.name === 'atri_agent_prepare_review'))) {
                if (++writes === 1) {
                    if (saved) await save(handle, next, ...args);
                    throw Object.assign(new Error('Synthetic lost Review Task receipt ACK'), { code: 'storage_commit_unknown' });
                }
            }
            return save(handle, next, ...args);
        };
        try {
            const result = await f.run().then(value => ({ value }), error => ({ error }));
            expect(Boolean(result.error)).toBe(!saved); expect(evaluations).toBe(1);
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.changeSets).toEqual([]); expect(task.compute.attempts).toHaveLength(3); expect(f.requests).toHaveLength(3);
            expect(task.attempts.flatMap(attempt => attempt.calls).filter(call => call.nativeReceipt?.name === 'atri_agent_prepare_review')).toHaveLength(saved ? 1 : 0);
        } finally { await f.cleanup(); }
    }, 45000);
});
