import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectModelFixture } from './helpers/project-model-fixture.js';
import { configureProjectToolPlan } from './helpers/project-tool-fixture.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { createNativeId } from '../../src/native/identity.js';
import { readAttempt } from '../../src/native/orchestration/controller-common.js';
import { readProjectReviewOutput } from '../../src/native/orchestration/project-review-output-contracts.js';

const harnesses = CONTRACT_HARNESSES;
const edge = (from, fromPort, to, toPort) => ({ edgeId: createNativeId('orchestrationEdge'), from: { nodeId: from.nodeId, port: fromPort },
    to: { nodeId: to.nodeId, port: toPort }, condition: 'always', maxVisits: 1, loopBack: false });
const response = (text, index, unknown = false) => ({ id: 'fanout-response-' + index, status: 'completed', output: [{ id: 'fanout-message-' + index,
    type: 'message', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text, annotations: [] }] }],
...unknown ? {} : { usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } } });

async function fixture(make, { unknown = false, any = false, scopeDag = false, withInput = false, failure = false } = {}) {
    let fanout, proposed, pureModels, business = 0, arrivals = 0, both;
    const gate = new Promise(resolve => { both = resolve; });
    const f = await projectModelFixture(make, { maxModelRounds: 3, responseStatus: index => failure && index === 1 ? 400 : 200, changeRoute: route => ({ ...route, executionPolicy: { ...route.executionPolicy,
        computeBudget: { ...route.executionPolicy.computeBudget, maxRequests: 10, localWork: { ...route.executionPolicy.computeBudget.localWork, maxJobs: 160 } } } }),
    configurePlan: async args => {
        const { plan, seeded, h, original, route } = args;
        proposed = structuredClone(original); proposed.project.displayName = 'Joined advisory proposal';
        await configureProjectToolPlan(['atri_agent_set_plan', 'atri_agent_project_save', 'atri_agent_prepare_review'])(args);
        await seeded.persistence.saveModelProfile(h.handle, { ...seeded.model, limits: { ...seeded.model.limits, contextTokens: 65536 } });
        const graph = plan.definition, worker = graph.nodes[0], output = graph.nodes[1];
        worker.inputs = [{ name: 'joined', type: 'text', required: false }, { name: 'continuation', type: 'json', required: false }];
        const model = label => ({ ...structuredClone(worker), nodeId: createNativeId('orchestrationNode'), label,
            dependencyPinIds: ['studio.route'], capabilities: ['generation.send'] });
        const planner = { ...model('Choose independent advisory work'), kind: 'planner', inputs: [], outputs: [{ name: 'control', type: 'json', required: false }],
            capabilities: ['generation.send', 'graph.patch'] };
        fanout = { nodeId: createNativeId('orchestrationNode'), kind: 'fanout', label: 'Run declared advisory tasks', dependencyPinIds: [], capabilities: [],
            inputs: [{ name: 'control', type: 'json', required: true }], outputs: [{ name: 'scope', type: 'task.result', required: false }],
            policy: { maxConcurrency: any || failure ? 1 : 2, failurePolicy: failure ? 'fail_fast' : 'continue' } };
        const left = { ...model('Independent left advisory'), inputs: [{ name: 'scope', type: 'task.result', required: true }], outputs: [{ name: 'draft', type: 'text', required: false }] };
        const right = { ...structuredClone(left), nodeId: createNativeId('orchestrationNode'), label: 'Independent right advisory' };
        pureModels = [];
        for (const [node, pinId, remoteModelId] of [[left, 'left.route', 'project-fanout-left'], [right, 'right.route', 'project-fanout-right']]) {
            const profile = { ...seeded.model, modelProfileId: createNativeId('modelProfile'), remoteModelId,
                capabilities: [{ capability: 'generation.tools', state: 'unsupported', provenance: [{ kind: 'adapter-metadata', source: 'Pure branch has no tool support' }] }],
                limits: { ...seeded.model.limits, contextTokens: 65536 } };
            const ownedRoute = { ...route, runtimeRouteId: createNativeId('runtimeRoute'), modelProfileRef: { scope: 'player', modelProfileId: profile.modelProfileId },
                executionPolicy: { ...route.executionPolicy, allowedModelProfileIds: [profile.modelProfileId] } };
            await seeded.persistence.saveModelProfile(h.handle, profile); await seeded.persistence.saveRuntimeRoute(h.handle, ownedRoute);
            plan.dependencyPins.push({ pinId, port: 'model', resourceRef: { scope: 'player', runtimeRouteId: ownedRoute.runtimeRouteId }, integrity: hash(ownedRoute) });
            node.dependencyPinIds = [pinId]; node.policy = { agentPinId: pinId }; pureModels.push(profile);
        }
        const join = { nodeId: createNativeId('orchestrationNode'), kind: 'join', label: 'Join typed advisory Results', dependencyPinIds: [], capabilities: [],
            inputs: [{ name: 'left', type: 'text', required: true }, { name: 'right', type: 'text', required: true }], outputs: [{ name: 'joined', type: 'text', required: false }],
            policy: { strategy: any ? 'any-success' : 'all-success', quorum: any ? 1 : 2, deadlineMs: 120000 } };
        graph.nodes = [planner, fanout, left, right, join, worker, output]; graph.entryNodeIds = [planner.nodeId];
        graph.edges = [edge(planner, 'control', fanout, 'control'), edge(fanout, 'scope', left, 'scope'), edge(fanout, 'scope', right, 'scope'),
            edge(left, 'draft', join, 'left'), edge(right, 'draft', join, 'right'), edge(join, 'joined', worker, 'joined'), edge(worker, 'response', output, 'response'),
            { ...edge(worker, 'response', worker, 'continuation'), loopBack: true, maxVisits: 2 }];
        if (scopeDag) {
            for (const [entry, port] of [[left, 'left'], [right, 'right']]) {
                const tail = { ...structuredClone(entry), nodeId: createNativeId('orchestrationNode'), label: entry.label + ' downstream synthesis',
                    inputs: [{ name: 'draft', type: 'text', required: true }] };
                graph.nodes.splice(graph.nodes.indexOf(join), 0, tail);
                graph.edges = graph.edges.filter(item => !(item.from.nodeId === entry.nodeId && item.to.nodeId === join.nodeId));
                graph.edges.push(edge(entry, 'draft', tail, 'draft'), edge(tail, 'draft', join, port));
            }
        }
        if (withInput) {
            const upstream = { ...model('Source evidence before Fanout'), inputs: [], outputs: [{ name: 'draft', type: 'text', required: false }] };
            graph.nodes.unshift(upstream); graph.entryNodeIds = [upstream.nodeId];
            planner.inputs.push({ name: 'evidence', type: 'text', required: true }); fanout.inputs.push({ name: 'evidence', type: 'text', required: true });
            graph.edges.push(edge(upstream, 'draft', planner, 'evidence'), edge(upstream, 'draft', fanout, 'evidence'));
        }
        graph.capabilityCeiling.push('graph.patch'); graph.graphChangePolicy = { allowedOperations: ['setPendingPriority'], allowedNodeKinds: [] };
        Object.assign(graph.limits, { maxNodes: 12, maxEdges: 24, maxSteps: 180, maxAttempts: 16, maxPatches: 2, maxConcurrency: 2, maxLoopIterations: 2, maxEdgeVisits: 16, deadlineMs: 240000 });
        Object.assign(graph.outputContract, { kind: 'project_review', resultPolicy: { outputType: 'json', maxBytes: 16384 } });
    }, responseBody: async ({ body, index }) => {
        const authored = (body.input ?? []).flatMap(item => { try { return [JSON.parse(item.content)]; } catch { return []; } })
            .findLast(item => item?.kind?.startsWith('native_project_graph'));
        if (authored?.kind === 'native_project_graph_planner') return response(JSON.stringify({ operations: [{ op: 'setPendingPriority', nodeId: fanout.nodeId, priority: 1 }] }), index);
        if (authored?.kind === 'native_project_graph_work') {
            if (authored.authoredTask === 'Source evidence before Fanout') return response('Exact typed source evidence before Fanout', index);
            if (!authored.authoredTask.includes('downstream')) { arrivals++; if (arrivals === 2) both(); if (!any && !failure) await gate; }
            return response('Independent advisory evidence ' + index, index, unknown && index === 1);
        }
        const round = business++;
        return { id: 'formal-response-' + index, status: 'completed', output: [{ id: 'formal-tool-' + index, type: 'function_call', status: 'completed', call_id: 'formal-call-' + index,
            name: ['atri_agent_set_plan', 'atri_agent_project_save', 'atri_agent_prepare_review'][round],
            arguments: JSON.stringify(round === 0 ? { summary: 'Execute joined evidence', steps: [{ id: 'rename', title: 'Rename Project' }] }
                : round === 1 ? { source: proposed, stepId: 'rename' } : {}) }], usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } };
    } });
    return Object.assign(f, { pureModels, arrivals: () => arrivals });
}

describe.each(harnesses)('$name original Project composable Fanout Join', ({ make }) => {
    test('published Planner and actual two-HTTP Scheduler Fanout Join feed original tools and human Review', async () => {
        const f = await fixture(make);
        try {
            await f.run(); const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(f.requests.slice(1, 3).map(request => request.model).sort()).toEqual(['project-fanout-left', 'project-fanout-right']);
            const children = [...f.scheduler.operations.values()].filter(item => item.key.startsWith('project-fanout:'));
            expect(children).toHaveLength(2);
            for (const model of f.pureModels) expect(children.filter(item => item.resources.includes('model:' + f.h.handle + ':' + model.modelProfileId))).toHaveLength(1);
            expect(f.arrivals()).toBe(2); expect(root.status).toBe('completed'); expect(root.graphRevision).toBe(1); expect(f.requests).toHaveLength(6);
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.status).toBe('review'); expect(task.attempts.filter(attempt => attempt.kind === 'generation')).toHaveLength(3);
            expect(task.compute.attempts).toHaveLength(6); expect(task.compute.attempts.every(row => row.status === 'settled')).toBe(true);
            expect(JSON.stringify(f.requests[3])).toContain('Independent advisory evidence');
            await f.h.engine.withTransaction(f.h.handle, async tx => expect((await readProjectReviewOutput(tx, f.h.handle, root)).receipt.costs.closed).toBe(true));
            expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.original.project.displayName);
        } finally { await f.cleanup(); }
    }, 240000);

    test('typed DAG evidence crosses the frozen Fanout into reserved downstream scope Attempts before Join', async () => {
        const f = await fixture(make, { scopeDag: true, withInput: true });
        try {
            await f.run(); const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.status).toBe('completed'); expect(root.graphRevision).toBe(1); expect(f.arrivals()).toBe(2); expect(f.requests).toHaveLength(9);
            expect(f.requests.filter(request => ['project-fanout-left', 'project-fanout-right'].includes(request.model))).toHaveLength(4);
            for (const request of f.requests.filter(request => ['project-fanout-left', 'project-fanout-right'].includes(request.model)))
                expect(JSON.stringify(request)).toContain('Exact typed source evidence before Fanout');
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.status).toBe('review'); expect(task.compute.attempts).toHaveLength(9); expect(task.compute.attempts.every(row => row.status === 'settled')).toBe(true);
            await f.h.engine.withTransaction(f.h.handle, async tx => expect((await readProjectReviewOutput(tx, f.h.handle, root)).receipt.costs.closed).toBe(true));
        } finally { await f.cleanup(); }
    }, 300000);

    test('paid-unknown branch remains charged and cannot reach any original tool or final output', async () => {
        const f = await fixture(make, { unknown: true });
        try {
            await expect(f.run()).rejects.toThrow(); const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(root.status).not.toBe('completed'); expect(root.outputClaims).toEqual([]); expect(task.attempts.every(attempt => !attempt.calls.length)).toBe(true);
            expect(task.compute.attempts).toHaveLength(3); expect(task.compute.attempts.filter(row => row.status === 'unknown')).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 180000);

    test('real Source replacement after both paid branch sends prevents Join output and every tool', async () => {
        const f = await fixture(make); let sends = 0, release;
        const replaced = new Promise(resolve => { release = resolve; });
        f.onResponse(async ({ index }) => {
            if (!index) return;
            if (++sends === 2) { await f.writeProject(); release(); }
            await replaced;
        });
        try {
            await expect(f.run()).rejects.toThrow();
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.status).not.toBe('completed'); expect(root.outputClaims).toEqual([]); expect(f.requests).toHaveLength(3);
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.attempts.every(attempt => !attempt.calls.length)).toBe(true); expect(task.compute.attempts).toHaveLength(3);
            expect(task.compute.attempts.every(row => row.status === 'settled')).toBe(true);
            expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe('Independent original Project edit');
        } finally { release(); await f.cleanup(); }
    }, 180000);

    test('known paid branch rejection settles failed Join and cancels unsent scope without any tool', async () => {
        const f = await fixture(make, { failure: true, scopeDag: true });
        try {
            await expect(f.run()).rejects.toMatchObject({ code: 'native_orchestration_project_fanout_failed' });
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.outputClaims).toEqual([]); expect(f.requests).toHaveLength(2); expect(f.arrivals()).toBe(1);
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.attempts.every(attempt => !attempt.calls.length)).toBe(true); expect(task.compute.attempts).toHaveLength(2);
            expect(task.compute.attempts.every(row => row.status === 'settled')).toBe(true);
            const attempts = await f.h.engine.withTransaction(f.h.handle, async tx => Promise.all(root.attemptRefs.map(id => readAttempt(tx, f.h.handle, root, id))));
            expect(attempts.filter(record => record.doc.status === 'cancelled')).toHaveLength(3);
            expect(attempts.filter(record => record.doc.status === 'failed')).toHaveLength(3);
        } finally { await f.cleanup(); }
    }, 180000);

    test('any-success Join cancels queued entry and reserved scope tail before either acquires a paid send', async () => {
        const f = await fixture(make, { any: true, scopeDag: true });
        try {
            await f.run(); const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.status).toBe('completed'); expect(f.arrivals()).toBe(1); expect(f.requests).toHaveLength(6);
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId); expect(task.compute.attempts).toHaveLength(6);
            const attempts = await f.h.engine.withTransaction(f.h.handle, async tx => Promise.all(root.attemptRefs.map(id => readAttempt(tx, f.h.handle, root, id))));
            const cancelled = attempts.map(record => record.doc).filter(attempt => attempt.status === 'cancelled');
            expect(cancelled).toHaveLength(2); expect(cancelled.filter(attempt => attempt.inputState === 'reserved')).toHaveLength(1);
            expect(cancelled.every(attempt => !attempt.effectRefs.length)).toBe(true);
            await f.h.engine.withTransaction(f.h.handle, async tx => expect((await readProjectReviewOutput(tx, f.h.handle, root)).receipt.costs.closed).toBe(true));
        } finally { await f.cleanup(); }
    }, 180000);
});
