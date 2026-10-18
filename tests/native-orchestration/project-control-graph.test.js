import { SqliteEngine } from '../../src/storage/engines/sqlite-engine.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { makeTempSqliteEngineHarness, CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectModelFixture } from './helpers/project-model-fixture.js';
import { configureProjectToolPlan } from './helpers/project-tool-fixture.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { createNativeId } from '../../src/native/identity.js';
import { controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { projectReplanScope, readProjectReplanHistory } from '../../src/native/orchestration/project-replan-contracts.js';
import { readReviewAdmission, readAttemptInvalidation } from '../../src/native/orchestration/controller-common.js';
import { readAttempt } from '../../src/native/orchestration/controller-common.js';
import { readGraphPlannerCompletion } from '../../src/native/orchestration/graph-planner-completion.js';
import { readGraphReviewCompletion } from '../../src/native/orchestration/graph-review-completion.js';
import { PROJECT_QUALITY_REASONS } from '../../src/native/orchestration/project-quality-profile.js';
import { assertProjectControlWork } from '../../src/native/orchestration/project-quality-contracts.js';
import { readProjectReviewOutput } from '../../src/native/orchestration/project-review-output-contracts.js';

const harnesses = CONTRACT_HARNESSES;
const textResponse = (text, index, usage = true) => ({ id: 'control-response-' + index, status: 'completed', output: [{ id: 'control-item-' + index,
    type: 'message', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text, annotations: [] }] }],
...(usage ? { usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } } : {}) });
const edge = (from, fromPort, to, toPort) => ({ edgeId: createNativeId('orchestrationEdge'), from: { nodeId: from.nodeId, port: fromPort },
    to: { nodeId: to.nodeId, port: toPort }, condition: 'always', maxVisits: 1, loopBack: false });

async function fixture(make, { escalation = false, unknown = false, differentRoutes = false, withReview = false, rerun = false, replan = false, multiPort = false, nonself = false, qualityBeforePlanner = false, maxQualityRounds = 2, rerunSecondReview = false, reviewPlannerRedo = false } = {}) {
    let operations, proposed, businessRound = 0, reviewRound = 0, plannerRound = 0, added, formalWorker, redoTopology, pureRound = 0;
    const f = await projectModelFixture(make, { maxModelRounds: 3, changeRoute: route => ({ ...route, executionPolicy: { ...route.executionPolicy,
        computeBudget: { ...route.executionPolicy.computeBudget, maxRequests: reviewPlannerRedo ? 11 : 12, localWork: { ...route.executionPolicy.computeBudget.localWork, maxJobs: 128 } } } }),
    configurePlan: async args => {
        const { plan, seeded, h, original, route } = args;
        proposed = structuredClone(original); proposed.project.displayName = 'Dynamically planned change';
        await configureProjectToolPlan(['atri_agent_set_plan', 'atri_agent_project_save', 'atri_agent_prepare_review'])(args);
        await seeded.persistence.saveModelProfile(h.handle, { ...seeded.model, limits: { ...seeded.model.limits, contextTokens: 65536 } });
        const graph = plan.definition, worker = graph.nodes[0], output = graph.nodes[1];
        formalWorker = worker;
        worker.inputs = [{ name: 'control', type: 'json', required: false }, { name: 'advisory', type: 'text', required: false }, { name: 'continuation', type: 'json', required: false }];
        const analysis = { ...structuredClone(worker), nodeId: createNativeId('orchestrationNode'), label: 'Analyze current source', inputs: [],
            outputs: [{ name: 'analysis', type: 'text', required: false }], dependencyPinIds: ['studio.route'], capabilities: ['generation.send'] };
        const planner = { ...structuredClone(analysis), nodeId: createNativeId('orchestrationNode'), kind: 'planner', label: 'Plan source-bound work',
            inputs: [{ name: 'analysis', type: 'text', required: true }], outputs: [{ name: 'control', type: 'json', required: false }], capabilities: ['generation.send', 'graph.patch'] };
        added = { ...structuredClone(analysis), nodeId: createNativeId('orchestrationNode'), label: 'Dynamically added advisory task',
            inputs: [{ name: 'control', type: 'json', required: true }], outputs: [{ name: 'analysis', type: 'text', required: false }] };
        if (differentRoutes) {
            const plannerModel = { ...seeded.model, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'project-planner-fixture',
                capabilities: [{ capability: 'generation.tools', state: 'unsupported', provenance: [{ kind: 'adapter-metadata', source: 'Pure advisory model has no tools' }] }], limits: { ...seeded.model.limits, contextTokens: 65536 } };
            const workerModel = { ...plannerModel, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'project-analysis-fixture' };
            await seeded.persistence.saveModelProfile(h.handle, plannerModel); await seeded.persistence.saveModelProfile(h.handle, workerModel);
            const owned = model => ({ ...route, modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId },
                executionPolicy: { ...route.executionPolicy, allowedModelProfileIds: [model.modelProfileId] } });
            const plannerRoute = { ...owned(plannerModel), runtimeRouteId: createNativeId('runtimeRoute'), displayName: 'Owned Planner route' };
            const workerRoute = { ...owned(workerModel), runtimeRouteId: createNativeId('runtimeRoute'), displayName: 'Owned analysis route' };
            for (const [pinId, ownedRoute] of [['planner.route', plannerRoute], ['analysis.route', workerRoute]]) {
                await seeded.persistence.saveRuntimeRoute(h.handle, ownedRoute);
                plan.dependencyPins.push({ pinId, port: 'model', resourceRef: { scope: 'player', runtimeRouteId: ownedRoute.runtimeRouteId }, integrity: hash(ownedRoute) });
            }
            planner.dependencyPinIds = ['planner.route']; planner.policy = { agentPinId: 'planner.route' };
            analysis.dependencyPinIds = ['analysis.route']; analysis.policy = { agentPinId: 'analysis.route' };
            added.dependencyPinIds = ['analysis.route']; added.policy = { agentPinId: 'analysis.route' };
        }
        if (escalation) { added.dependencyPinIds = worker.dependencyPinIds; added.capabilities = worker.capabilities; }
        operations = [{ op: 'addNode', node: added }, { op: 'addEdge', edge: edge(planner, 'control', added, 'control') },
            { op: 'addEdge', edge: edge(added, 'analysis', worker, 'advisory') }, { op: 'setPendingPriority', nodeId: added.nodeId, priority: 7 }];
        graph.nodes = [analysis, planner, worker, output]; graph.entryNodeIds = [analysis.nodeId];
        graph.edges = [edge(analysis, 'analysis', planner, 'analysis'), edge(planner, 'control', worker, 'control'), edge(worker, 'response', output, 'response'), { ...edge(worker, 'response', worker, 'continuation'), loopBack: true, maxVisits: 2 }];
        graph.capabilityCeiling.push('graph.patch'); graph.graphChangePolicy = { allowedOperations: ['addNode', 'addEdge', 'setPendingPriority', 'requestFinalize'], allowedNodeKinds: ['agent', 'planner'] };
        if (withReview) {
            const draft = { ...structuredClone(analysis), nodeId: createNativeId('orchestrationNode'), label: 'Static advisory task',
                inputs: [{ name: 'control', type: 'json', required: true }] };
            const review = { ...structuredClone(planner), nodeId: createNativeId('orchestrationNode'), kind: 'review', label: 'Review both independent advisory tasks',
                inputs: [{ name: 'draft', type: 'text', required: true }, { name: 'dynamic', type: 'text', required: false }],
                capabilities: ['generation.send'], policy: { agentPinId: planner.policy.agentPinId, maxRounds: 2 } };
            worker.inputs.push({ name: 'review', type: 'json', required: false });
            graph.nodes.splice(2, 0, draft, review);
            graph.edges.push(edge(planner, 'control', draft, 'control'), { ...edge(draft, 'analysis', review, 'draft'), maxVisits: 2 },
                { ...edge(review, 'control', worker, 'review') });
            graph.edges.find(item => item.from.nodeId === planner.nodeId && item.to.nodeId === draft.nodeId).maxVisits = 2;
            operations.push({ op: 'addEdge', edge: { ...edge(added, 'analysis', review, 'dynamic'), maxVisits: 2 } });
        }
        if (qualityBeforePlanner) {
            const quality = { ...structuredClone(planner), nodeId: createNativeId('orchestrationNode'), kind: 'review', label: 'Review current source evidence before bounded return',
                inputs: [{ name: 'draft', type: 'text', required: true }], capabilities: ['generation.send'],
                policy: { agentPinId: planner.policy.agentPinId, maxRounds: maxQualityRounds } };
            planner.inputs.push({ name: 'quality', type: 'json', required: true });
            graph.nodes.splice(1, 0, quality);
            graph.edges.push({ ...edge(analysis, 'analysis', quality, 'draft'), maxVisits: 2 }, { ...edge(quality, 'control', planner, 'quality'), maxVisits: 2 });
        }
        if (replan) {
            const target = nonself ? analysis : planner;
            target.inputs.push({ name: 'previous', type: 'json', required: false });
            graph.edges.find(item => item.to.nodeId === planner.nodeId).maxVisits = 2;
            graph.edges.push({ ...edge(planner, 'control', target, 'previous'), maxVisits: 1, loopBack: true });
            graph.graphChangePolicy.allowedOperations.push('requestReplan');
        }
        Object.assign(graph.limits, { maxSteps: 180, deadlineMs: 180000, maxAttempts: 16, maxReviews: 2, maxPatches: 4, maxLoopIterations: replan ? 3 : 2, maxEdgeVisits: 14 });
        if (rerunSecondReview) {
            const laterReview = graph.nodes.find(node => node.kind === 'review' && node.label === 'Review both independent advisory tasks');
            graph.limits.maxReviews = 3; graph.limits.maxEdgeVisits = graph.edges.length + 4;
            // This round-admission case publishes its two target branches up front.
            // The separate dynamic tests retain their original GraphPatch assertions.
            graph.nodes.splice(graph.nodes.indexOf(laterReview), 0, added);
            planner.inputs = planner.inputs.filter(port => port.name !== 'analysis');
            graph.edges = graph.edges.filter(item => !(item.from.nodeId === analysis.nodeId && item.to.nodeId === planner.nodeId)
                && !(item.from.nodeId === planner.nodeId && item.to.nodeId === worker.nodeId));
            graph.edges.push(edge(planner, 'control', added, 'control'), { ...edge(added, 'analysis', laterReview, 'dynamic'), maxVisits: 2 },
                edge(added, 'analysis', worker, 'advisory'));
            operations = [{ op: 'requestFinalize' }];
        }
        if (multiPort) {
            worker.inputs = [{ name: 'first', type: 'text', required: false }, { name: 'second', type: 'text', required: false }, { name: 'continuation', type: 'json', required: false }];
            graph.nodes = [analysis, worker, output]; graph.entryNodeIds = [analysis.nodeId];
            graph.edges = [edge(analysis, 'analysis', worker, 'first'), edge(analysis, 'analysis', worker, 'second'), edge(worker, 'response', output, 'response'),
                { ...edge(worker, 'response', worker, 'continuation'), loopBack: true, maxVisits: 2 }];
            graph.capabilityCeiling = graph.capabilityCeiling.filter(capability => capability !== 'graph.patch');
            graph.graphChangePolicy = { allowedOperations: [], allowedNodeKinds: [] };
        }
        if (reviewPlannerRedo) {
            const review = { ...structuredClone(planner), nodeId: createNativeId('orchestrationNode'), kind: 'review', label: 'Review causal work including original Planner',
                inputs: [{ name: 'source', type: 'text', required: true }, { name: 'draft', type: 'text', required: true }],
                capabilities: ['generation.send'], policy: { agentPinId: planner.policy.agentPinId, maxRounds: 2 } };
            worker.inputs = [{ name: 'advisory', type: 'text', required: false }, { name: 'review', type: 'json', required: true },
                { name: 'continuation', type: 'json', required: false }];
            graph.nodes = [analysis, planner, added, review, worker, output]; graph.entryNodeIds = [analysis.nodeId];
            const twice = item => ({ ...item, maxVisits: 2 });
            graph.edges = [twice(edge(analysis, 'analysis', planner, 'analysis')), twice(edge(planner, 'control', added, 'control')),
                twice(edge(analysis, 'analysis', review, 'source')), twice(edge(added, 'analysis', review, 'draft')),
                edge(added, 'analysis', worker, 'advisory'), { ...edge(review, 'control', worker, 'review'), maxVisits: 3 }, edge(worker, 'response', output, 'response'),
                { ...edge(worker, 'response', worker, 'continuation'), loopBack: true, maxVisits: 2 }];
            // Both proposals are the same lawful scheduling operation. Only
            // genuinely new advisory payloads constitute Planner progress.
            operations = [{ op: 'requestFinalize' }];
            graph.graphChangePolicy = { allowedOperations: ['requestFinalize'], allowedNodeKinds: [] };
            Object.assign(graph.limits, { maxSteps: 180, deadlineMs: 180000, maxAttempts: 12, maxReviews: 2, maxPatches: 2, maxLoopIterations: 2, maxEdgeVisits: 15 });
            redoTopology = { analysis, planner, draft: added, review, worker };
        }
        Object.assign(graph.outputContract, { kind: 'project_review', resultPolicy: { outputType: 'json', maxBytes: 16384 } });
    }, responseBody: ({ body, index }) => {
        const serialized = JSON.stringify(body);
        if (serialized.includes('native_project_graph_review')) {
            const strings = value => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];
            const ids = strings(body).flatMap(text => [...text.matchAll(/Graph evidence: .*?"producerAttemptId":"(oattempt_[a-f0-9]+)"/g)].map(match => match[1]));
            const redo = reviewPlannerRedo ? reviewRound++ === 0 : rerunSecondReview ? reviewRound++ === 1 : rerun && reviewRound++ === 0;
            const targets = reviewPlannerRedo ? strings(body).flatMap(text => [...text.matchAll(/Graph evidence: ([^\n]+)\n[^\n]*\nPROJECT_PLANNER_REDO_PURE_(1|3)(?=\n|$)/g)]
                .filter(match => match[2] === (redo ? '1' : '3')).map(match => JSON.parse(match[1]).producerAttemptId)) : [...new Set(ids)];
            if (reviewPlannerRedo && (targets.length !== 1 || !targets.every(id => ids.includes(id)))) throw new Error('Missing original Project typed Review target');
            return textResponse(JSON.stringify({ decision: redo ? 'rerun' : 'approve', reasonCode: redo ? 'incomplete_proposal' : 'quality_ready', targetAttemptIds: targets }), index);
        }
        if (serialized.includes('native_project_graph_planner')) return textResponse(JSON.stringify({ operations: replan && plannerRound++ === 0
            ? [{ op: 'setPendingPriority', nodeId: formalWorker.nodeId, priority: 1 }, { op: 'requestReplan' }] : operations }), index);
        if (serialized.includes('native_project_graph_work')) return textResponse(reviewPlannerRedo ? 'PROJECT_PLANNER_REDO_PURE_' + ++pureRound
            : 'Source-bound evidence from ' + (index ? 'dynamic worker' : 'analysis') + (nonself ? ' iteration ' + index : ''), index, !unknown);
        const round = businessRound++;
        return { id: 'business-response-' + index, status: 'completed', output: [{ id: 'business-item-' + index, type: 'function_call', status: 'completed', call_id: 'business-call-' + index,
            name: ['atri_agent_set_plan', 'atri_agent_project_save', 'atri_agent_prepare_review'][round], arguments: JSON.stringify(round === 0
                ? { summary: 'Use actual graph evidence', steps: [{ id: 'rename', title: 'Rename Project' }] } : round === 1 ? { source: proposed, stepId: 'rename' } : {}) }],
        usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } };
    } });
    return Object.assign(f, { added, redoTopology });
}

describe.each(harnesses)('$name original Project general graph consumer', ({ make }) => {
    test.each([false, true])('model GraphPatch creates and executes a non-template task with independent routes=%s before original tools and human Review', async differentRoutes => {
        const f = await fixture(make, { differentRoutes });
        try {
            f.onResponse(async ({ index }) => {
                if (index >= 3) return;
                const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
                expect(task.attempts).toHaveLength(1); expect(task.attempts[0].status).toBe('started'); expect(task.attempts[0].calls).toEqual([]);
                expect(task.changeSets).toEqual([]); expect(task.plan).toBeNull();
            });
            await f.run(); const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.status).toBe('completed'); expect(root.graphRevision).toBe(1); expect(root.progress.patches).toBe(1);
            expect(root.graph.nodes).toContainEqual(f.added); expect(root.nodeControl[f.added.nodeId].priority).toBe(7); expect(f.requests).toHaveLength(6);
            expect(JSON.stringify(f.requests[2])).toContain('Host-validated advisory graph control');
            expect(f.requests.slice(0, 4).map(request => request.model)).toEqual(differentRoutes
                ? ['project-analysis-fixture', 'project-planner-fixture', 'project-analysis-fixture', 'p4-fixture'] : Array(4).fill('p4-fixture'));
            expect(JSON.stringify(f.requests[3])).toContain('Source-bound evidence from dynamic worker');
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.status).toBe('review'); expect(task.attempts.filter(a => a.kind === 'generation')).toHaveLength(3);
            expect(task.compute.attempts).toHaveLength(6); expect(task.compute.attempts.every(row => row.status === 'settled')).toBe(true);
            expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.original.project.displayName);
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const planner = root.graph.nodes.find(node => node.kind === 'planner');
                const attempts = await Promise.all(root.attemptRefs.map(ref => readAttempt(tx, f.h.handle, root, ref)));
                const control = await readGraphPlannerCompletion(tx, f.h.handle, root, attempts.find(row => row.doc.nodeId === planner.nodeId).doc.attemptId,
                    { verifyControlWork: assertProjectControlWork });
                expect(control.patch.accepted).toBe(true); expect(control.patch.appliedOperations).toHaveLength(4);
                expect((await readProjectReviewOutput(tx, f.h.handle, root)).receipt.costs.closed).toBe(true);
            });
        } finally { await f.cleanup(); }
    }, 120000);

    test.each([false, true])('actual Planner DAG composes a typed multi-target Review with bounded local rerun=%s', async rerun => {
        const f = await fixture(make, { withReview: true, rerun, differentRoutes: true });
        try {
            await f.run(); const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.status).toBe('completed'); expect(root.progress.reviews).toBe(rerun ? 2 : 1); expect(root.graphRevision).toBe(1); expect(root.progress.edgeVisits).toBe(rerun ? 13 : 11);
            expect(f.requests).toHaveLength(rerun ? 11 : 8);
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const attempts = await Promise.all(root.attemptRefs.map(ref => readAttempt(tx, f.h.handle, root, ref)));
                const reviews = [];
                for (const { doc } of attempts) {
                    if (root.graph.nodes.find(node => node.nodeId === doc.nodeId).kind === 'review') reviews.push(await readGraphReviewCompletion(tx, f.h.handle, root, doc.attemptId,
                        { verifyControlWork: assertProjectControlWork, reasonCodes: PROJECT_QUALITY_REASONS }));
                }
                expect(reviews).toHaveLength(rerun ? 2 : 1); expect(reviews.at(-1).review.decision).toBe('approve');
                expect(reviews[0].targets).toHaveLength(2); expect(reviews[0].review.replacements).toHaveLength(rerun ? 2 : 0);
                expect((await readProjectReviewOutput(tx, f.h.handle, root)).receipt.costs.closed).toBe(true);
            });
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.status).toBe('review'); expect(task.attempts.filter(a => a.kind === 'generation')).toHaveLength(3);
            expect(task.compute.attempts).toHaveLength(rerun ? 11 : 8);
        } finally { await f.cleanup(); }
    }, 180000);

    test('pure DAG without a Planner consumes one Result through two exact authored ports', async () => {
        const f = await fixture(make, { multiPort: true });
        try {
            await f.run(); const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.status).toBe('completed'); expect(root.graphRevision).toBe(0); expect(f.requests).toHaveLength(4);
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                expect((await readProjectReviewOutput(tx, f.h.handle, root)).receipt.costs.closed).toBe(true);
            });
            const entry = root.graph.entryNodeIds[0];
            expect(root.graph.edges.filter(edge => edge.from.nodeId === entry).map(edge => root.progress.edgeVisitCounts[edge.edgeId])).toEqual([1, 1]);
        } finally { await f.cleanup(); }
    }, 120000);

    test('bounded Planner replan reuses required typed evidence through original nonloop and loop edges', async () => {
        const f = await fixture(make, { replan: true });
        try {
            await f.run(); const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.status).toBe('completed'); expect(root.graphRevision).toBe(2); expect(root.progress.replans).toBe(1);
            expect(root.progress.loopIterations).toBe(3); expect(f.requests).toHaveLength(7);
            const planner = root.graph.nodes.find(node => node.kind === 'planner');
            const incoming = root.graph.edges.filter(edge => edge.to.nodeId === planner.nodeId);
            expect(incoming.map(edge => root.progress.edgeVisitCounts[edge.edgeId]).sort()).toEqual([1, 2]);
        } finally { await f.cleanup(); }
    }, 120000);

    test('accepted GraphPatch commit unknown is adopted from exact durable facts without a second paid send or proposal', async () => {
        const f = await fixture(make);
        try {
            const runs = f.authority.execution.runs, control = runs.control.bind(runs); let injected = false;
            runs.control = async (...args) => {
                const outcome = await control(...args);
                if (!injected && args[2].operation === 'graph.patch') { injected = true; throw Object.assign(new Error('commit acknowledgement unknown'), { code: 'storage_commit_unknown' }); }
                return outcome;
            };
            await f.run(); const root = await runs.get(f.h.handle, f.effects[0].runId);
            expect(injected).toBe(true); expect(root.status).toBe('completed'); expect(root.progress.patches).toBe(1); expect(root.graphRevision).toBe(1);
            expect(f.requests).toHaveLength(6);
        } finally { await f.cleanup(); }
    }, 120000);

    test('real Run cancellation between Planner observation and GraphPatch CAS survives without a patch or tool', async () => {
        const f = await fixture(make);
        try {
            const runs = f.authority.execution.runs, control = runs.control.bind(runs); let injected = false;
            runs.control = async (...args) => {
                if (!injected && args[2].operation === 'graph.patch') {
                    injected = true; const root = await runs.get(f.h.handle, args[2].runId);
                    await runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), { runId: root.runId, expectedEpoch: root.epoch,
                        expectedStateVersion: root.stateVersion, expectedGraphRevision: root.graphRevision, reasonCode: 'project_graph_withdrawn' });
                }
                return control(...args);
            };
            await expect(f.run()).rejects.toThrow(); const root = await runs.get(f.h.handle, f.effects[0].runId);
            expect(injected).toBe(true); expect(root.cancelRequested).toBe(true); expect(root.graphRevision).toBe(0); expect(root.outputClaims).toEqual([]);
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId); expect(task.attempts.every(attempt => !attempt.calls.length)).toBe(true);
        } finally { await f.cleanup(); }
    }, 60000);

    test.each(['escalation', 'unknown'])('%s cannot produce a Project tool or final completion', async mode => {
        const f = await fixture(make, { escalation: mode === 'escalation', unknown: mode === 'unknown' });
        try {
            await expect(f.run()).rejects.toThrow();
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.attempts.every(attempt => !attempt.calls.length)).toBe(true); expect(task.changeSets).toEqual([]); expect(task.plan).toBeNull();
            expect(f.requests).toHaveLength(mode === 'unknown' ? 1 : 2);
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.status).not.toBe('completed'); expect(root.outputClaims).toEqual([]); expect(root.graphRevision).toBe(0);
            expect(task.compute.attempts[0].status).toBe(mode === 'unknown' ? 'unknown' : 'settled');
        } finally { await f.cleanup(); }
    }, 60000);
});


test('SQLite Project Planner returns along a published nonself edge to recompute earlier pure Model evidence', async () => {
    const f = await fixture(makeTempSqliteEngineHarness, { replan: true, nonself: true, differentRoutes: true });
    try {
        await f.run(); const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
        expect(root.status).toBe('completed'); expect(root.graphRevision).toBe(2); expect(root.progress.replans).toBe(1);
        expect(root.progress.loopIterations).toBe(3); expect(f.requests).toHaveLength(8);
        expect(f.requests.slice(0, 5).map(request => request.model)).toEqual(['project-analysis-fixture', 'project-planner-fixture', 'project-analysis-fixture', 'project-planner-fixture', 'project-analysis-fixture']);
        expect(JSON.stringify(f.requests[3])).toContain('iteration 2'); expect(JSON.stringify(f.requests[3])).not.toContain('iteration 0');
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            const history = await readProjectReplanHistory(tx, f.h.handle, root);
            expect(history.consumed.size).toBe(1);
            const planner = root.graph.nodes.find(node => node.kind === 'planner'), target = root.graph.nodes.find(node => node.nodeId === root.graph.entryNodeIds[0]);
            const attempts = await Promise.all(root.attemptRefs.map(id => readAttempt(tx, f.h.handle, root, id)));
            expect(attempts.filter(row => row.doc.nodeId === target.nodeId).map(row => row.doc.attemptNumber)).toEqual([1, 2]);
            expect(attempts.filter(row => row.doc.nodeId === planner.nodeId).map(row => row.doc.attemptNumber)).toEqual([1, 2]);
            const latest = history.current.get(target.nodeId), old = history.facts.find(fact => fact.producer.nodeId === target.nodeId && fact !== latest);
            expect(latest.record.payload).toContain('iteration 2'); expect(old.record.payload).toContain('iteration 0');
            const key = controlRecordKey(f.h.handle, root.runId, 'attempt', latest.producer.attemptId), saved = await tx.getResource(key);
            const inputRefs = [latest.producer.inputRefs[0]], doc = { ...saved.doc, inputRefs, inputDigest: hash(inputRefs) };
            try { await tx.putResource(key, { ...saved, doc, integrity: hash(doc) }); await expect(readProjectReplanHistory(tx, f.h.handle, root)).rejects.toThrow(); }
            finally { await tx.putResource(key, saved); }
            expect((await readProjectReviewOutput(tx, f.h.handle, root)).receipt.costs.closed).toBe(true);
        });
        const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
        expect(task.status).toBe('review'); expect(task.compute.attempts).toHaveLength(8); expect(task.compute.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(task.attempts.filter(row => row.kind === 'generation')).toHaveLength(3);
        expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.original.project.displayName);
    } finally { await f.cleanup(); }
}, 180000);


test('Project pure replan topology rejects a return interval containing formal Task capability', () => {
    const target = { nodeId: createNativeId('orchestrationNode'), kind: 'agent', capabilities: ['generation.send'] };
    const formal = { nodeId: createNativeId('orchestrationNode'), kind: 'agent', capabilities: ['generation.send', 'project.propose'] };
    const planner = { nodeId: createNativeId('orchestrationNode'), kind: 'planner', capabilities: ['generation.send', 'graph.patch'] };
    const graph = { nodes: [target, formal, planner], edges: [edge(target, 'text', formal, 'advice'), edge(formal, 'json', planner, 'evidence'),
        { ...edge(planner, 'json', target, 'feedback'), loopBack: true }] };
    expect(() => projectReplanScope(graph, planner.nodeId)).toThrow('native_orchestration_project_replan_unavailable');
});


test('SQLite Project bounded return repeats completed Model Review with current evidence before original formal tools', async () => {
    const f = await fixture(makeTempSqliteEngineHarness, { replan: true, nonself: true, differentRoutes: true, qualityBeforePlanner: true });
    try {
        await f.run(); const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
        expect(root.status).toBe('completed'); expect(root.graphRevision).toBe(2); expect(root.progress.replans).toBe(1);
        expect(root.progress.reviews).toBe(2); expect(root.progress.loopIterations).toBe(3); expect(f.requests).toHaveLength(10);
        const bodies = f.requests.filter(body => JSON.stringify(body).includes('native_project_graph_review'));
        expect(bodies).toHaveLength(2); expect(JSON.stringify(bodies[0])).toContain('iteration 0');
        expect(JSON.stringify(bodies[1])).toContain('iteration 3'); expect(JSON.stringify(bodies[1])).not.toContain('iteration 0');
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            const history = await readProjectReplanHistory(tx, f.h.handle, root), reviews = history.facts.filter(fact => fact.review);
            expect(history.consumed.size).toBe(1); expect(reviews).toHaveLength(2);
            expect(reviews.map(fact => fact.producer.attemptNumber)).toEqual([1, 2]);
            expect(history.current.get(reviews[0].producer.nodeId).producer.attemptId).toBe(reviews[1].producer.attemptId);
            for (const fact of reviews) {
                expect(fact.review.decision).toBe('approve'); expect(fact.review.invalidatedAttemptIds).toEqual([]); expect(fact.review.replacements).toEqual([]);
                expect(await readAttemptInvalidation(tx, f.h.handle, root, fact.producer)).toBeNull();
            }
            expect((await Promise.all(reviews.map(fact => readReviewAdmission(tx, f.h.handle, root, fact.producer)))).map(fact => fact.round)).toEqual([1, 2]);
            expect((await readProjectReviewOutput(tx, f.h.handle, root)).receipt.costs.closed).toBe(true);
        });
        const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
        expect(task.status).toBe('review'); expect(task.attempts.filter(row => row.kind === 'generation')).toHaveLength(3);
        expect(task.compute.attempts).toHaveLength(10); expect(task.compute.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(task.compute.localWork.every(row => row.status === 'settled')).toBe(true);
        expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.original.project.displayName);
        await f.h.engine.close();
        const fresh = new SqliteEngine({ directoriesByHandle: () => f.h.dirs });
        try { await fresh.withTransaction(f.h.handle, async tx => {
            const cold = (await tx.getResource({ kind: K.orchestrationRun, handle: f.h.handle, runId: root.runId })).doc;
            expect((await readProjectReviewOutput(tx, f.h.handle, cold)).receipt.costs.closed).toBe(true);
        }); } finally { await fresh.close(); }
        expect(f.requests).toHaveLength(10);
    } finally { await f.cleanup(); }
}, 180000);

test('SQLite Project original Review round ceiling denies another send after accepted bounded return', async () => {
    const f = await fixture(makeTempSqliteEngineHarness, { replan: true, nonself: true, differentRoutes: true, qualityBeforePlanner: true, maxQualityRounds: 1 });
    try {
        await expect(f.run()).rejects.toThrow('native_orchestration_review_limit_exhausted'); expect(f.requests).toHaveLength(4);
        const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
        expect(root.status).toBe('blocked'); expect(root.outputClaims).toEqual([]); expect(root.pendingEffectRefs).toEqual([]);
        expect(root.progress).toMatchObject({ replans: 1, reviews: 1 });
        const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
        expect(task.compute.attempts).toHaveLength(4); expect(task.compute.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(task.attempts.flatMap(row => row.calls)).toEqual([]);
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            const attempts = (await Promise.all(root.attemptRefs.map(id => readAttempt(tx, f.h.handle, root, id)))).map(row => row.doc);
            const review = root.graph.nodes.find(node => node.kind === 'review'), rounds = attempts.filter(row => row.nodeId === review.nodeId);
            expect(rounds).toHaveLength(2); expect((await readReviewAdmission(tx, f.h.handle, root, rounds[0])).round).toBe(1);
            expect(rounds[1]).toMatchObject({ startedAt: null, effectRefs: [] }); expect(await readReviewAdmission(tx, f.h.handle, root, rounds[1])).toBeNull();
        });
        expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.original.project.displayName);
    } finally { await f.cleanup(); }
}, 120000);


test('SQLite Project later Review uses its own admitted round after an independent earlier Review', async () => {
    const f = await fixture(makeTempSqliteEngineHarness, { withReview: true, qualityBeforePlanner: true, differentRoutes: true, rerunSecondReview: true });
    try {
        await f.run(); const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
        expect(root.status).toBe('completed'); expect(root.graphRevision).toBe(1); expect(root.progress.reviews).toBe(3);
        expect(f.requests).toHaveLength(12); expect(f.requests.filter(body => JSON.stringify(body).includes('native_project_graph_planner'))).toHaveLength(1);
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            const reviews = root.graph.nodes.filter(node => node.kind === 'review');
            expect(reviews).toHaveLength(2);
            const attempts = (await Promise.all(root.attemptRefs.map(id => readAttempt(tx, f.h.handle, root, id)))).map(row => row.doc);
            const facts = [];
            for (const node of reviews) {
                const rows = attempts.filter(row => row.nodeId === node.nodeId);
                for (const row of rows) facts.push(await readGraphReviewCompletion(tx, f.h.handle, root, row.attemptId,
                    { verifyControlWork: assertProjectControlWork, reasonCodes: PROJECT_QUALITY_REASONS }));
            }
            expect(facts.filter(fact => fact.review.decision === 'rerun')).toHaveLength(1);
            const redo = facts.find(fact => fact.review.decision === 'rerun');
            expect((await readReviewAdmission(tx, f.h.handle, root, redo.producer)).round).toBe(1);
            expect(redo.review.replacements).toHaveLength(2);
            const later = facts.find(fact => fact.producer.nodeId === redo.producer.nodeId && fact !== redo);
            expect(later.review.decision).toBe('approve'); expect((await readReviewAdmission(tx, f.h.handle, root, later.producer)).round).toBe(2);
            const earlier = facts.find(fact => fact.producer.nodeId !== redo.producer.nodeId);
            expect(earlier.review.decision).toBe('approve'); expect(await readAttemptInvalidation(tx, f.h.handle, root, earlier.producer)).toBeNull();
            expect((await readProjectReviewOutput(tx, f.h.handle, root)).receipt.costs.closed).toBe(true);
        });
        const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
        expect(task.status).toBe('review'); expect(task.compute.attempts).toHaveLength(12);
        expect(task.compute.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(task.attempts.filter(row => row.kind === 'generation')).toHaveLength(3);
        expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.original.project.displayName);
    } finally { await f.cleanup(); }
}, 180000);


test('SQLite Project Review recomputes its pure Planner causal descendants while retaining both original accepted patches and all paid work', async () => {
    const f = await fixture(makeTempSqliteEngineHarness, { reviewPlannerRedo: true, differentRoutes: true });
    let publishedReceipt, reviewReceiptId, invalidatedPlannerId;
    try {
        await f.run(); const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
        expect(root.status).toBe('completed'); expect(root.graphRevision).toBe(2); expect(f.requests).toHaveLength(11);
        expect(root.progress).toMatchObject({ attempts: 12, reviews: 2, patches: 2, replans: 0, edgeVisits: 15, loopIterations: 2 });
        expect(root.graph.graphChangePolicy).toEqual({ allowedOperations: ['requestFinalize'], allowedNodeKinds: [] });
        expect(root.nodeControl[f.added.nodeId].priority).toBe(0); expect(root.outputClaims).toHaveLength(1);
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            const history = await readProjectReplanHistory(tx, f.h.handle, root);
            const planners = history.facts.filter(fact => fact.patch), reviews = history.facts.filter(fact => fact.review);
            expect(planners).toHaveLength(2); expect(reviews.map(fact => fact.review.decision)).toEqual(['rerun', 'approve']);
            expect(planners.map(fact => fact.patch.appliedOperations)).toEqual([
                [{ op: 'requestFinalize' }], [{ op: 'requestFinalize' }],
            ]);
            expect(planners.map(fact => fact.patch.newGraphRevision)).toEqual([1, 2]);
            expect(new Set(planners.map(fact => fact.patch.patchId)).size).toBe(2);
            const first = reviews[0], second = reviews[1], oldPlanner = planners[0].producer, newPlanner = planners[1].producer;
            const oldA = history.facts.find(fact => fact.record?.payload === 'PROJECT_PLANNER_REDO_PURE_1');
            const newA = history.facts.find(fact => fact.record?.payload === 'PROJECT_PLANNER_REDO_PURE_3');
            const oldB = history.facts.find(fact => fact.record?.payload === 'PROJECT_PLANNER_REDO_PURE_2');
            const newB = history.facts.find(fact => fact.record?.payload === 'PROJECT_PLANNER_REDO_PURE_4');
            expect(first.review.invalidatedAttemptIds.toSorted()).toEqual([oldA.producer.attemptId, oldPlanner.attemptId, oldB.producer.attemptId].toSorted());
            expect(first.review.replacements).toEqual([{ targetAttemptId: oldA.producer.attemptId, attemptId: newA.producer.attemptId }]);
            for (const producer of [oldA.producer, oldPlanner, oldB.producer]) expect((await readAttemptInvalidation(tx, f.h.handle, root, producer)).reviewReceiptId).toBe(first.review.receiptId);
            expect(newPlanner.attemptId).not.toBe(oldPlanner.attemptId); expect(newPlanner.effectRefs[0]).not.toBe(oldPlanner.effectRefs[0]);
            expect(newPlanner.inputRefs[0].acceptedGraphResultRefs).toEqual([newA.receipt.resultRef]);
            expect(newB.producer.inputRefs[0].acceptedControlRefs).toEqual([planners[1].controlRef]);
            expect(second.review.evidenceRefs).toEqual(expect.arrayContaining([newA.receipt.resultRef, newB.receipt.resultRef]));
            expect(history.current.get(f.redoTopology.planner.nodeId).producer.attemptId).toBe(newPlanner.attemptId);
            const publication = await readProjectReviewOutput(tx, f.h.handle, root);
            expect(publication.receipt.costs.closed).toBe(true); publishedReceipt = publication.receipt;
            const old = await readGraphPlannerCompletion(tx, f.h.handle, root, oldPlanner.attemptId, { verifyControlWork: assertProjectControlWork });
            expect(old.patch).toEqual(planners[0].patch);
            reviewReceiptId = first.review.receiptId; invalidatedPlannerId = oldPlanner.attemptId;
        });
        const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
        expect(task.status).toBe('review'); expect(task.compute.limits.maxRequests).toBe(11);
        expect(task.compute.attempts).toHaveLength(11); expect(task.compute.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(task.attempts.filter(row => row.kind === 'generation')).toHaveLength(3);
        expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.original.project.displayName);
        const snapshot = structuredClone(task.compute), scheduler = f.scheduler, executor = f.executor;
        // Close the actual SQLite handle connection while retaining the valid
        // original Host owner. A new Scheduler/Executor reads the durable Task.
        f.h.engine.closeHandle(f.h.handle); f.recreateExecutor();
        expect(() => f.h.engine.nativeHostLifecycle.assertActive()).not.toThrow();
        expect(f.scheduler).not.toBe(scheduler); expect(f.executor).not.toBe(executor);
        const reopenedTask = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
        expect(reopenedTask.status).toBe('review'); expect(reopenedTask.compute).toEqual(snapshot);
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            const cold = (await tx.getResource({ kind: K.orchestrationRun, handle: f.h.handle, runId: root.runId })).doc;
            expect(cold).toEqual(root);
            expect((await readProjectReviewOutput(tx, f.h.handle, cold)).receipt).toEqual(publishedReceipt);
            const key = controlRecordKey(f.h.handle, cold.runId, 'receipt', reviewReceiptId), saved = await tx.getResource(key);
            const changed = { ...saved.doc, invalidatedAttemptIds: saved.doc.invalidatedAttemptIds.filter(id => id !== invalidatedPlannerId) };
            try {
                await tx.putResource(key, { ...saved, doc: changed, integrity: hash(changed) });
                await expect(readProjectReviewOutput(tx, f.h.handle, cold)).rejects.toThrow();
            } finally { await tx.putResource(key, saved); }
            expect((await readProjectReviewOutput(tx, f.h.handle, cold)).receipt).toEqual(publishedReceipt);
        });
        await f.run().catch(() => undefined); expect(f.requests).toHaveLength(11);
        expect((await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId)).compute).toEqual(snapshot);
    } finally { await f.cleanup(); }
}, 180000);
