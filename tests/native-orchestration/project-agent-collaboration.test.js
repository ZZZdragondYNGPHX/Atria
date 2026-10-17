import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectReadFixture, configureProjectToolPlan, projectReadResponse } from './helpers/project-tool-fixture.js';
import { projectReviewFixture } from './helpers/project-review-fixture.js';
import { projectToolCapability } from '../../src/native/orchestration/project-tool-contracts.js';
import { createNativeId } from '../../src/native/identity.js';
import { readAttempt } from '../../src/native/orchestration/controller-common.js';
import { readProjectRoundReceipt } from '../../src/native/orchestration/project-round-contracts.js';
import { readProjectReviewOutput } from '../../src/native/orchestration/project-review-output-contracts.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const configureCollaboration = async ({ plan }, names = ['atri_agent_set_plan', 'atri_agent_project_save', 'atri_agent_prepare_review']) => {
    const graph = plan.definition, original = graph.nodes[0], output = graph.nodes[1];
    const instructions = ['Plan the exact requested Project change.', 'Prepare proposed source in the original workspace.', 'Validate the candidate and prepare human Review; formal Commit remains with the user.'];
    const workers = names.map((name, index) => {
        const tool = plan.dependencyPins.find(pin => pin.port === 'tool' && pin.resourceRef.name === name);
        return { ...structuredClone(original), nodeId: index ? createNativeId('orchestrationNode') : original.nodeId, label: instructions[index],
            inputs: index ? [{ name: 'previous', type: 'json', required: true }] : [],
            dependencyPinIds: [...original.dependencyPinIds.filter(pinId => plan.dependencyPins.find(pin => pin.pinId === pinId)?.port === 'model'), tool.pinId],
            capabilities: ['generation.send', projectToolCapability(name)] };
    });
    graph.nodes = [...workers, output]; graph.edges = workers.map((worker, index) => ({ edgeId: createNativeId('orchestrationEdge'),
        from: { nodeId: worker.nodeId, port: worker.outputs[0].name }, to: { nodeId: index < workers.length - 1 ? workers[index + 1].nodeId : output.nodeId,
            port: index < workers.length - 1 ? 'previous' : output.inputs[0].name }, condition: 'success', maxVisits: 1, loopBack: false }));
    graph.limits.maxLoopIterations = 0;
};

describe.each(harnesses)('$name original Project task collaboration', ({ make }) => {
    test('three workers consume durable predecessor rounds and stop at original human Review', async () => {
        const f = await projectReviewFixture(make, { outputContract: true, configurePlan: configureCollaboration });
        try {
            await f.run(); const runs = f.authority.execution.runs, root = await runs.get(f.h.handle, f.effects[0].runId);
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(f.requests).toHaveLength(3); expect(root.status).toBe('completed'); expect(task.status).toBe('review');
            expect(root.progress.loopIterations).toBe(0); expect(root.progress.edgeVisits).toBe(3);
            expect(new Set(f.effects.map(effect => effect.runId)).size).toBe(1); expect(task.compute.attempts).toHaveLength(3);
            expect(task.compute.attempts.every(attempt => attempt.status === 'settled' && attempt.usage.totalTokens === 20)).toBe(true);
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const workers = [];
                for (const attemptId of root.attemptRefs) {
                    const { doc } = await readAttempt(tx, f.h.handle, root, attemptId);
                    if (doc.nodeId === root.graph.outputContract.ownerNodeId) continue;
                    workers.push(doc);
                    const fact = await readProjectRoundReceipt(tx, f.h.handle, root, attemptId, { projectAgent: f.agent });
                    expect(fact.receipt.round).toBe(workers.length - 1); expect(doc.attemptNumber).toBe(1);
                    expect(doc.budgetRef).toEqual(root.budgetAuthorityRef);
                }
                expect(new Set(workers.map(worker => worker.nodeId)).size).toBe(3);
                expect(await readProjectReviewOutput(tx, f.h.handle, root)).toBeTruthy();
            });
            for (const [index, request] of f.requests.entries()) {
                expect(JSON.stringify(request)).toContain('native_project_graph_task');
                expect(JSON.stringify(request)).toContain(root.graph.nodes[index].label);
            }
            expect((await f.studio.observeProject(f.h.handle, f.projectId)).revision.revision).toBe(f.task.baseRevision);
        } finally { await f.cleanup(); }
    }, 30000);

    test('a bounded final worker continuation keeps earlier workers and all original attempts and costs', async () => {
        const f = await projectReadFixture(make, { maxModelRounds: 3, configurePlan: async args => {
            const names = ['atri_agent_set_plan', 'atri_agent_get_project'];
            await configureProjectToolPlan(names)(args);
            await configureCollaboration(args, names);
            await args.seeded.persistence.saveModelProfile(args.h.handle, { ...args.seeded.model, limits: { ...args.seeded.model.limits, contextTokens: 65536 } });
            const graph = args.plan.definition, tail = graph.nodes[1];
            tail.inputs[0].required = false; tail.inputs.push({ name: 'continuation', type: 'json', required: false });
            graph.edges.push({ edgeId: createNativeId('orchestrationEdge'), from: { nodeId: tail.nodeId, port: tail.outputs[0].name },
                to: { nodeId: tail.nodeId, port: 'continuation' }, condition: 'always', maxVisits: 1, loopBack: true });
            graph.limits.maxLoopIterations = 1; graph.limits.maxEdgeVisits = 4;
        }, responseBody: ({ index }) => {
            const response = projectReadResponse(), call = response.output[0];
            call.call_id += index; call.name = ['atri_agent_set_plan', 'atri_agent_get_project', 'atri_agent_get_project'][index];
            if (index === 0) call.arguments = JSON.stringify({ summary: 'Authored collaboration', steps: [{ id: 'inspect', title: 'Inspect Project' }] });
            return response;
        } });
        try {
            await f.run(); const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(f.requests).toHaveLength(3); expect(root.progress.loopIterations).toBe(1);
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.compute.attempts).toHaveLength(3);
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const attempts = [];
                for (const attemptId of root.attemptRefs) {
                    const { doc } = await readAttempt(tx, f.h.handle, root, attemptId); attempts.push(doc);
                    expect(await readProjectRoundReceipt(tx, f.h.handle, root, attemptId, { projectAgent: f.agent })).toBeTruthy();
                }
                expect(attempts.map(attempt => attempt.attemptNumber)).toEqual([1, 1, 2]);
                expect(attempts.map(attempt => attempt.nodeId)).toEqual([root.graph.nodes[0].nodeId, root.graph.nodes[1].nodeId, root.graph.nodes[1].nodeId]);
                expect(attempts.every(attempt => attempt.status === 'completed')).toBe(true);
            });
        } finally { await f.cleanup(); }
    }, 30000);

    test('a worker cannot invoke a later worker tool or publish early Review', async () => {
        const f = await projectReviewFixture(make, { outputContract: true, responseOffset: -2, configurePlan: configureCollaboration });
        try {
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.status).not.toBe('review'); expect(task.changeSets).toEqual([]);
            expect(task.compute.attempts).toHaveLength(1);
        } finally { await f.cleanup(); }
    });
});
