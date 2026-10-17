import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectModelFixture } from './helpers/project-model-fixture.js';
import { configureProjectToolPlan } from './helpers/project-tool-fixture.js';
import { hashNativeDocument as hash, putMutable } from '../../src/native/repositories/common.js';
import { createNativeId } from '../../src/native/identity.js';
import { readAttempt, controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { readGraphJudgeCompletion, graphJudgeModelReceiptId } from '../../src/native/orchestration/graph-judge-completion.js';
import { projectJudgeReaderOptions } from '../../src/native/orchestration/project-control-input-contracts.js';
import { readProjectReviewOutput } from '../../src/native/orchestration/project-review-output-contracts.js';

const edge = (from, fromPort, to, toPort) => ({ edgeId: createNativeId('orchestrationEdge'), from: { nodeId: from.nodeId, port: fromPort },
    to: { nodeId: to.nodeId, port: toPort }, condition: 'always', maxVisits: 1, loopBack: false });
const strings = value => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];
const evidence = body => strings(body).flatMap(text => [...text.matchAll(/Graph evidence: (\{[^\n]+\})\n/g)].map(match => JSON.parse(match[1])));
const response = (text, index, unknown = false) => ({ id: 'judge-response-' + index, status: 'completed', output: [{ id: 'judge-message-' + index,
    type: 'message', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text, annotations: [] }] }],
...unknown ? {} : { usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } } });

async function fixture(make, { invalid = false, required = false, unknown = false, fanout = false, rerun = false } = {}) {
    let proposed, judge, fanoutNode, business = 0, reviews = 0, arrivals = 0, release;
    const gate = new Promise(resolve => { release = resolve; });
    const f = await projectModelFixture(make, { maxModelRounds: 3, changeRoute: route => ({ ...route, executionPolicy: { ...route.executionPolicy,
        computeBudget: { ...route.executionPolicy.computeBudget, maxRequests: 12, localWork: { ...route.executionPolicy.computeBudget.localWork, maxJobs: 160 } } } }),
    configurePlan: async args => {
        const { plan, seeded, h, original, route } = args;
        proposed = structuredClone(original); proposed.project.displayName = 'Explicit Judge choice';
        await configureProjectToolPlan(['atri_agent_set_plan', 'atri_agent_project_save', 'atri_agent_prepare_review'])(args);
        await seeded.persistence.saveModelProfile(h.handle, { ...seeded.model, limits: { ...seeded.model.limits, contextTokens: 65536 } });
        const pureModel = { ...seeded.model, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'project-pure-judge-fixture',
            capabilities: [{ capability: 'generation.tools', state: 'unsupported', provenance: [{ kind: 'adapter-metadata', source: 'Pure Judge graph has no tools' }] }],
            limits: { ...seeded.model.limits, contextTokens: 65536 } };
        const pureRoute = { ...route, runtimeRouteId: createNativeId('runtimeRoute'), modelProfileRef: { scope: 'player', modelProfileId: pureModel.modelProfileId },
            executionPolicy: { ...route.executionPolicy, allowedModelProfileIds: [pureModel.modelProfileId] } };
        await seeded.persistence.saveModelProfile(h.handle, pureModel); await seeded.persistence.saveRuntimeRoute(h.handle, pureRoute);
        plan.dependencyPins.push({ pinId: 'pure.route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: pureRoute.runtimeRouteId }, integrity: hash(pureRoute) });
        const graph = plan.definition, worker = graph.nodes[0], output = graph.nodes[1];
        const candidates = [0, 1, 2].map(index => ({ ...structuredClone(worker), nodeId: createNativeId('orchestrationNode'), label: 'Candidate option ' + index,
            dependencyPinIds: ['pure.route'], capabilities: ['generation.send'], policy: { agentPinId: 'pure.route' }, inputs: [], outputs: [{ name: 'draft', type: 'text', required: false }] }));
        judge = { ...structuredClone(candidates[0]), nodeId: createNativeId('orchestrationNode'), kind: 'judge', label: 'Choose one of three actual candidates',
            inputs: candidates.map((_, i) => ({ name: 'candidate' + i, type: 'text', required: true })), outputs: [{ name: 'control', type: 'json', required: false }] };
        const review = { ...structuredClone(judge), nodeId: createNativeId('orchestrationNode'), kind: 'review', label: 'Review exact Judge choice',
            inputs: [{ name: 'choice', type: 'json', required: true }, ...candidates.map((_, i) => ({ name: 'candidate' + i, type: 'text', required: required && i === 0 }))],
            policy: { agentPinId: 'pure.route', maxRounds: rerun ? 2 : 1 } };
        worker.inputs = [{ name: 'choice', type: 'json', required: true }, { name: 'review', type: 'json', required: true },
            ...candidates.map((_, i) => ({ name: 'candidate' + i, type: 'text', required: false })), { name: 'continuation', type: 'json', required: false }];
        graph.nodes = [...candidates, judge, review, worker, output]; graph.entryNodeIds = candidates.map(node => node.nodeId);
        graph.edges = candidates.flatMap((node, i) => [edge(node, 'draft', judge, 'candidate' + i), edge(node, 'draft', review, 'candidate' + i), edge(node, 'draft', worker, 'candidate' + i)]);
        graph.edges.push(edge(judge, 'control', review, 'choice'), edge(judge, 'control', worker, 'choice'), edge(review, 'control', worker, 'review'),
            edge(worker, 'response', output, 'response'), { ...edge(worker, 'response', worker, 'continuation'), loopBack: true, maxVisits: 2 });
        if (rerun) for (const incoming of graph.edges.filter(item => item.to.nodeId === judge.nodeId || item.to.nodeId === review.nodeId)) incoming.maxVisits = 2;
        for (const incoming of graph.edges.filter(item => !item.loopBack && item.to.nodeId === worker.nodeId && ['choice', 'review'].includes(item.to.port))) incoming.maxVisits = 3;
        if (fanout) {
            const planner = { ...structuredClone(judge), nodeId: createNativeId('orchestrationNode'), kind: 'planner', label: 'Prioritize published Judge',
                inputs: [], capabilities: ['generation.send', 'graph.patch'] };
            fanoutNode = { nodeId: createNativeId('orchestrationNode'), kind: 'fanout', label: 'Actual concurrent evidence branches', dependencyPinIds: [], capabilities: [],
                inputs: [{ name: 'control', type: 'json', required: true }], outputs: [{ name: 'scope', type: 'task.result', required: false }],
                policy: { maxConcurrency: 2, failurePolicy: 'continue' } };
            const branches = [0, 1].map(index => ({ ...structuredClone(candidates[0]), nodeId: createNativeId('orchestrationNode'), label: 'Fanout evidence ' + index,
                inputs: [{ name: 'scope', type: 'task.result', required: true }] }));
            const join = { nodeId: createNativeId('orchestrationNode'), kind: 'join', label: 'Join actual concurrent evidence', dependencyPinIds: [], capabilities: [],
                inputs: branches.map((_, i) => ({ name: 'branch' + i, type: 'text', required: true })), outputs: [{ name: 'joined', type: 'text', required: false }],
                policy: { strategy: 'all-success', quorum: 2, deadlineMs: 120000 } };
            for (const candidate of candidates) candidate.inputs = [{ name: 'joined', type: 'text', required: true }];
            graph.nodes.unshift(planner, fanoutNode, ...branches, join); graph.entryNodeIds = [planner.nodeId];
            graph.edges.push(edge(planner, 'control', fanoutNode, 'control'), ...branches.flatMap((branch, i) =>
                [edge(fanoutNode, 'scope', branch, 'scope'), edge(branch, 'draft', join, 'branch' + i)]),
            ...candidates.map(candidate => edge(join, 'joined', candidate, 'joined')));
            graph.capabilityCeiling.push('graph.patch'); graph.graphChangePolicy = { allowedOperations: ['setPendingPriority'], allowedNodeKinds: [] };
        }
        Object.assign(graph.limits, { maxNodes: 16, maxEdges: 32, maxSteps: 180, maxAttempts: 16, maxReviews: 2, maxPatches: 2, maxConcurrency: 2, maxLoopIterations: 2, maxEdgeVisits: 32, deadlineMs: 180000 });
        Object.assign(graph.outputContract, { kind: 'project_review', resultPolicy: { outputType: 'json', maxBytes: 16384 } });
    }, responseBody: async ({ body, index }) => {
        const authored = (body.input ?? []).flatMap(item => { try { return [JSON.parse(item.content)]; } catch { return []; } })
            .findLast(item => item?.kind?.startsWith('native_project_graph'));
        if (authored?.kind === 'native_project_graph_planner') return response(JSON.stringify({ operations: [{ op: 'setPendingPriority', nodeId: judge.nodeId, priority: 3 }] }), index);
        if (authored?.kind === 'native_project_graph_work') {
            if (authored.authoredTask.startsWith('Fanout evidence')) { if (++arrivals === 2) release(); await gate; }
            return response(authored.authoredTask, index);
        }
        if (authored?.kind === 'native_project_graph_judge') {
            const refs = evidence(body);
            return response(JSON.stringify({ selectedResultRef: invalid ? { runId: refs[0].resultRef.runId, resultId: createNativeId('orchestrationResult') }
                : evidence(strings(body).find(text => text.includes('Graph evidence: ') && text.endsWith('Candidate option 1')))[0].resultRef, reasonCode: 'candidate_selected' }), index, unknown);
        }
        if (authored?.kind === 'native_project_graph_review') {
            const redo = rerun && reviews++ === 0;
            return response(JSON.stringify({ decision: redo ? 'rerun' : 'approve', reasonCode: redo ? 'incomplete_proposal' : 'quality_ready',
                targetAttemptIds: [...new Set(evidence(body).map(item => item.producerAttemptId))] }), index);
        }
        const round = business++;
        return { id: 'formal-response-' + index, status: 'completed', output: [{ id: 'formal-tool-' + index, type: 'function_call', status: 'completed', call_id: 'formal-call-' + index,
            name: ['atri_agent_set_plan', 'atri_agent_project_save', 'atri_agent_prepare_review'][round],
            arguments: JSON.stringify(round === 0 ? { summary: 'Use selected evidence', steps: [{ id: 'rename', title: 'Rename Project' }] }
                : round === 1 ? { source: proposed, stepId: 'rename' } : {}) }], usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } };
    } });
    return Object.assign(f, { judge, arrivals: () => arrivals });
}

async function assertFailedJudgeParse(f, root, task) {
    expect(task.compute.localWork.filter(row => row.kind === 'graph_control_parse')).toEqual([expect.objectContaining({ status: 'settled',
        usage: expect.objectContaining({ outcome: 'failed' }) })]);
    await f.h.engine.withTransaction(f.h.handle, async tx => {
        const attempts = await Promise.all(root.attemptRefs.map(ref => readAttempt(tx, f.h.handle, root, ref)));
        const attempt = attempts.find(row => row.doc.nodeId === f.judge.nodeId).doc;
        expect(await readGraphJudgeCompletion(tx, f.h.handle, root, attempt.attemptId, projectJudgeReaderOptions)).toBeNull();
    });
}

describe.each(CONTRACT_HARNESSES)('$name original Project typed Judge', ({ make }) => {
    test.each([{ fanout: false, rerun: false }, { fanout: true, rerun: false }, { fanout: false, rerun: true }])('three actual candidates select one through Review and original tools to human Review fanout=$fanout rerun=$rerun', async ({ fanout, rerun }) => {
        const f = await fixture(make, { fanout, rerun }), sends = fanout || rerun ? 11 : 8;
        try {
            await f.run(); const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.status).toBe('completed'); expect(f.requests).toHaveLength(sends);
            expect(root.graphRevision).toBe(fanout ? 1 : 0); expect(f.arrivals()).toBe(fanout ? 2 : 0);
            expect(f.requests.slice(0, sends - 3).every(request => request.model === 'project-pure-judge-fixture')).toBe(true);
            for (const body of f.requests.filter(body => { const task = (body.input ?? []).findLast(item => { try { return JSON.parse(item.content)?.kind?.startsWith('native_project_graph'); } catch { return false; } }); return !task || JSON.parse(task.content).kind === 'native_project_graph_review'; })) {
                expect(JSON.stringify(body)).toContain('Candidate option 1');
                expect(JSON.stringify(body)).not.toContain('Candidate option 0'); expect(JSON.stringify(body)).not.toContain('Candidate option 2');
            }
            let judgeAttemptId;
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const attempts = await Promise.all(root.attemptRefs.map(ref => readAttempt(tx, f.h.handle, root, ref)));
                const attempt = attempts.findLast(row => row.doc.nodeId === f.judge.nodeId).doc;
                judgeAttemptId = attempt.attemptId;
                const fact = await readGraphJudgeCompletion(tx, f.h.handle, root, attempt.attemptId, projectJudgeReaderOptions);
                expect(fact.candidates).toHaveLength(3); expect(fact.receipt.localWork).toHaveLength(2); expect(attempt.resultRefs).toEqual([]);
                expect(fact.selectedResultRef).toEqual(fact.candidates.find(candidate => root.graph.nodes.find(node => node.nodeId === candidate.producer.nodeId).label === 'Candidate option 1').receipt.resultRef);
                expect((await readProjectReviewOutput(tx, f.h.handle, root)).receipt.costs.closed).toBe(true);
            });
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.status).toBe('review'); expect(task.attempts.filter(item => item.kind === 'generation')).toHaveLength(3);
            expect(task.compute.attempts).toHaveLength(sends); expect(task.compute.attempts.every(item => item.status === 'settled')).toBe(true);
            expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.original.project.displayName);
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const key = controlRecordKey(f.h.handle, root.runId, 'receipt', graphJudgeModelReceiptId(root.runId, judgeAttemptId));
                const record = await tx.getResource(key), selectedResultRef = record.doc.candidateRefs.find(ref => hash(ref) !== hash(record.doc.selectedResultRef));
                await putMutable(tx, key, { ...record.doc, selectedResultRef,
                    responseText: JSON.stringify({ selectedResultRef, reasonCode: 'candidate_selected' }) }, { expectedIntegrity: record.integrity });
            });
            await expect(f.h.engine.withTransaction(f.h.handle, tx => readGraphJudgeCompletion(tx, f.h.handle, root,
                judgeAttemptId, projectJudgeReaderOptions))).rejects.toThrow('Invalid Graph Judge completion facts');
            expect(f.requests).toHaveLength(sends);
        } finally { await f.cleanup(); }
    }, 180000);

    test.each(['invalid', 'required', 'unknown'])('%s cannot release candidate text to Review or original Project tools', async mode => {
        const f = await fixture(make, { [mode]: true });
        try {
            await expect(f.run()).rejects.toThrow(mode === 'invalid' ? 'generation_execution_failed'
                : mode === 'required' ? 'native_orchestration_project_judge_required_input' : 'native_orchestration_project_quality_unsettled');
            expect(f.requests).toHaveLength(4);
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.attempts.every(item => !item.calls.length)).toBe(true); expect(task.changeSets).toEqual([]); expect(task.plan).toBeNull();
            expect(task.compute.attempts).toHaveLength(4); expect(task.compute.attempts.at(-1).status).toBe(mode === 'unknown' ? 'unknown' : 'settled');
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.status).not.toBe('completed'); expect(root.outputClaims).toEqual([]);
            if (mode === 'invalid') await assertFailedJudgeParse(f, root, task);
        } finally { await f.cleanup(); }
    }, 120000);
});
