import { BudgetPort } from '../../src/native/orchestration/budget-port.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectModelFixture } from './helpers/project-model-fixture.js';
import { configureProjectToolPlan } from './helpers/project-tool-fixture.js';
import { planFixture } from './fixtures.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { createNativeId } from '../../src/native/identity.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { readProjectDelegation, readProjectDelegationContinuation } from '../../src/native/orchestration/project-delegation-contracts.js';
import { readProjectReviewOutput } from '../../src/native/orchestration/project-review-output-contracts.js';
import { readAttempt, controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { resultDependencyDigest } from '../../src/native/orchestration/result-contracts.js';
import { readTaskLocalOutput, childClosureReceiptId } from '../../src/native/orchestration/task-local-output-contracts.js';
import { readEffect } from '../../src/native/orchestration/effect-contracts.js';

const edge = (from, port, to, input) => ({ edgeId: createNativeId('orchestrationEdge'), from: { nodeId: from.nodeId, port },
    to: { nodeId: to.nodeId, port: input }, condition: 'always', maxVisits: 1, loopBack: false });
const port = (name, type, required = true) => ({ name, type, required });
const response = (text, index, usage = true) => ({ id: 'project-delegate-' + index, status: 'completed', output: [{ id: 'project-delegate-message-' + index,
    type: 'message', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text, annotations: [] }] }],
...usage ? { usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } } : {} });

async function fixture(make, { mode = 'handoff', failure = null, dynamic = false, badPlanPin = false } = {}) {
    let proposed, delegator, childPlanRef, operations, business = 0;
    const f = await projectModelFixture(make, { maxModelRounds: 3, responseStatus: index => failure === 'known' && index === 1 ? 400 : 200,
        changeRoute: route => ({ ...route, executionPolicy: { ...route.executionPolicy, computeBudget: { ...route.executionPolicy.computeBudget,
            maxRequests: 10, localWork: { ...route.executionPolicy.computeBudget.localWork, maxJobs: 160 } } } }),
        configurePlan: async args => {
            const { plan, seeded, h, original, route, host } = args;
            proposed = structuredClone(original); proposed.project.displayName = 'Advisory delegated Project proposal';
            await configureProjectToolPlan(['atri_agent_set_plan', 'atri_agent_project_save', 'atri_agent_prepare_review'])(args);
            await seeded.persistence.saveModelProfile(h.handle, { ...seeded.model, limits: { ...seeded.model.limits, contextTokens: 65536 } });
            const pure = { ...seeded.model, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'project-delegated-distinct-model',
                capabilities: [{ capability: 'generation.tools', state: 'unsupported', provenance: [{ kind: 'adapter-metadata', source: 'Advisory child has no tools' }] }],
                limits: { ...seeded.model.limits, contextTokens: 65536 } };
            const childRoute = { ...route, runtimeRouteId: createNativeId('runtimeRoute'), modelProfileRef: { scope: 'player', modelProfileId: pure.modelProfileId },
                executionPolicy: { ...route.executionPolicy, allowedModelProfileIds: [pure.modelProfileId], computeBudget: { maxRequests: 2, maxTokens: 20000,
                    localWork: { maxJobs: 80, maxItems: 5000, maxInputBytes: 8388608 } } } };
            await seeded.persistence.saveModelProfile(h.handle, pure); await seeded.persistence.saveRuntimeRoute(h.handle, childRoute);
            const child = planFixture(), output = child.definition.nodes[0];
            const children = [0, 1].map(index => ({ nodeId: createNativeId('orchestrationNode'), kind: 'agent', label: 'Actual Project child task ' + index,
                inputs: index ? [port('previous', 'text')] : [], outputs: [port('advice', 'text', false)], dependencyPinIds: ['child.model'],
                capabilities: ['generation.send'], policy: { agentPinId: 'child.model' } }));
            output.inputs = [port('result', 'text')]; output.outputs = []; output.capabilities = []; output.dependencyPinIds = [];
            child.definition.nodes = [...children, output]; child.definition.entryNodeIds = [children[0].nodeId];
            child.definition.edges = [edge(children[0], 'advice', children[1], 'previous'), edge(children[1], 'advice', output, 'result')];
            child.definition.capabilityCeiling = ['generation.send']; child.definition.graphChangePolicy = { allowedOperations: [], allowedNodeKinds: [] };
            child.definition.outputContract = { ...child.definition.outputContract, kind: 'result', ownerNodeId: output.nodeId, slot: 'task_result',
                allowPartial: false, resultPolicy: { outputType: 'text', maxBytes: 65536 } };
            child.dependencyPins = [{ pinId: 'child.model', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: childRoute.runtimeRouteId }, integrity: hash(childRoute) }];
            Object.assign(plan.definition.limits, { maxNodes: 12, maxEdges: 24, maxSteps: 180, maxAttempts: 16, maxDepth: 2,
                maxDelegates: 2, maxHandoffs: 2, maxEdgeVisits: 24, maxLoopIterations: 2, maxConcurrency: mode === 'delegate' ? 2 : 1, deadlineMs: 180000 });
            child.definition.limits = { ...plan.definition.limits, maxNodes: 3, maxEdges: 2, maxSteps: 64, maxAttempts: 3, maxDepth: 1,
                maxDelegates: 0, maxHandoffs: 0, maxEdgeVisits: 2, maxLoopIterations: 0 };
            const plans = host.turnOrchestration.plans, draft = await plans.create(h.handle, createNativeId('orchestrationCommand'), child);
            const expected = { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash };
            const report = await plans.validate(h.handle, expected);
            if (report.status !== 'valid') throw new Error(JSON.stringify(report.issues));
            ({ planRef: childPlanRef } = await plans.publish(h.handle, createNativeId('orchestrationCommand'), { ...expected, validationDigest: validationDigest(report) }));
            const childRevision = await plans.getRevision(h.handle, childPlanRef), graph = plan.definition, worker = graph.nodes[0], formalOutput = graph.nodes[1];
            delegator = { ...structuredClone(worker), nodeId: createNativeId('orchestrationNode'), label: 'Parent analyzes delegated advice', inputs: [],
                outputs: [port('advice', 'text', false)], dependencyPinIds: ['studio.route', 'delegate.child'], capabilities: ['generation.send', 'agent.delegate'],
                policy: { agentPinId: 'studio.route', allowedPlanPinIds: ['delegate.child'] } };
            const upstream = { ...structuredClone(delegator), nodeId: createNativeId('orchestrationNode'), label: 'Original upstream evidence brief',
                inputs: [], dependencyPinIds: ['studio.route'], capabilities: ['generation.send'], policy: { agentPinId: 'studio.route' } };
            delegator.inputs = [port('upstream', 'text')];
            worker.inputs = [port('advice', 'text', false), port('continuation', 'json', false)];
            graph.nodes = [upstream, delegator, worker, formalOutput]; graph.entryNodeIds = [upstream.nodeId];
            graph.edges = [edge(upstream, 'advice', delegator, 'upstream'), edge(delegator, 'advice', worker, 'advice'), edge(worker, 'response', formalOutput, 'response'),
                { ...edge(worker, 'response', worker, 'continuation'), loopBack: true, maxVisits: 2 }];
            graph.capabilityCeiling.push('agent.delegate');
            graph.outputContract = { ...graph.outputContract, kind: 'project_review', resultPolicy: { outputType: 'json', maxBytes: 16384 } };
            plan.dependencyPins.push({ pinId: 'delegate.child', port: 'plan', resourceRef: childPlanRef, integrity: hash(childRevision) });
            if (dynamic) {
                const planner = { ...upstream, kind: 'planner', label: 'Plan a source-bound delegated Project task',
                    outputs: [port('control', 'json', false)], dependencyPinIds: ['studio.route', 'delegate.child'],
                    capabilities: ['generation.send', 'graph.patch', 'agent.delegate'],
                    policy: { agentPinId: 'studio.route', allowedPlanPinIds: ['delegate.child'] } };
                delegator.inputs = [port('control', 'json')];
                if (badPlanPin) {
                    delegator.dependencyPinIds = ['studio.route', 'delegate.unpublished'];
                    delegator.policy.allowedPlanPinIds = ['delegate.unpublished'];
                }
                worker.inputs.push(port('control', 'json'));
                graph.nodes = [planner, worker, formalOutput]; graph.entryNodeIds = [planner.nodeId];
                graph.edges = [{ ...edge(planner, 'control', worker, 'control'), maxVisits: 3 }, edge(worker, 'response', formalOutput, 'response'),
                    { ...edge(worker, 'response', worker, 'continuation'), loopBack: true, maxVisits: 2 }];
                graph.capabilityCeiling.push('graph.patch');
                graph.graphChangePolicy = { allowedOperations: ['addNode', 'addEdge'], allowedNodeKinds: ['agent'] };
                operations = [{ op: 'addNode', node: delegator }, { op: 'addEdge', edge: edge(planner, 'control', delegator, 'control') },
                    { op: 'addEdge', edge: edge(delegator, 'advice', worker, 'advice') }];
            }
        }, responseBody: ({ body, index }) => {
            if (body.model === 'project-delegated-distinct-model' && failure === 'tools') return { id: 'forbidden-child-tool', status: 'completed', output: [{ id: 'forbidden-call', type: 'function_call', status: 'completed', call_id: 'forbidden-child-call', name: 'atri_agent_project_save', arguments: JSON.stringify({ source: proposed }) }], usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } };
            if (body.model === 'project-delegated-distinct-model') return response('ACTUAL_PROJECT_CHILD_ADVICE_' + index, index, failure !== 'usage_unknown');
            const authored = (body.input ?? []).flatMap(item => { try { return [JSON.parse(item.content)]; } catch { return []; } })
                .findLast(item => item?.kind?.startsWith('native_project_graph'));
            if (authored?.kind === 'native_project_graph_planner') return response(JSON.stringify({ operations }), index);
            if (authored) return response(authored.authoredTask === 'Original upstream evidence brief' ? 'ACTUAL_UPSTREAM_BRIEF' : 'PARENT_USED_ONLY_ACTUAL_CHILD_ADVICE', index);
            const round = business++;
            return { id: 'formal-' + index, status: 'completed', output: [{ id: 'formal-tool-' + index, type: 'function_call', status: 'completed', call_id: 'formal-call-' + index,
                name: ['atri_agent_set_plan', 'atri_agent_project_save', 'atri_agent_prepare_review'][round], arguments: JSON.stringify(round === 0
                    ? { summary: 'Use actual delegated advice', steps: [{ id: 'rename', title: 'Rename Project' }] } : round === 1 ? { source: proposed, stepId: 'rename' } : {}) }],
            usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } };
        } });
    if (mode === 'delegate') {
        const run = f.authority.runProjectDelegation.bind(f.authority);
        f.authority.runProjectDelegation = args => run({ ...args, mode: 'delegate' });
    }
    return Object.assign(f, { delegator, childPlanRef });
}

async function roots(f) {
    return f.h.engine.withTransaction(f.h.handle, async tx => {
        const all = (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle })).map(row => row.doc);
        return { parent: all.find(root => !root.parentRef), child: all.find(root => root.parentRef) };
    });
}

function interceptChildRelease(f, afterRelease) {
    const original = BudgetPort.prototype.releaseUnused, target = f.authority.execution.budgetPort;
    let calls = 0;
    BudgetPort.prototype.releaseUnused = async function (handle, input) {
        const result = await original.call(this, handle, input);
        if (this === target && handle === f.h.handle && input.reservationId) await afterRelease(++calls);
        return result;
    };
    return { calls: () => calls, restore: () => { BudgetPort.prototype.releaseUnused = original; } };
}

describe.each(CONTRACT_HARNESSES)('$name original Project delegation', ({ make }) => {
    test.each(['handoff', 'delegate'])('%s runs a pinned two-Agent child DAG in the same Task before original tools and human Review', async mode => {
        const f = await fixture(make, { mode });
        const release = mode === 'delegate' ? interceptChildRelease(f, async count => {
            if (count === 1) throw Object.assign(new Error('Lost original child release ACK'), { code: 'storage_commit_unknown' });
        }) : null;
        try {
            f.onResponse(async ({ index }) => {
                if (index < 1 || index > 2) return;
                const { parent } = await roots(f), task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
                const producer = await f.h.engine.withTransaction(f.h.handle, tx => readAttempt(tx, f.h.handle, parent, parent.attemptRefs[1]));
                expect(producer.doc.status).toBe(mode === 'handoff' ? 'waiting_child' : 'running');
                expect(task.attempts).toHaveLength(1); expect(task.attempts[0].calls).toEqual([]); expect(task.changeSets).toEqual([]);
            });
            await f.run(); const { parent, child } = await roots(f);
            expect(parent.status).toBe('completed'); expect(child.status).toBe('completed'); expect(parent.progress.delegates).toBe(1);
            expect(parent.progress.handoffs).toBe(mode === 'handoff' ? 1 : 0); expect(f.requests).toHaveLength(7);
            expect(release?.calls() ?? 0).toBe(mode === 'delegate' ? 1 : 0);
            expect(f.requests.slice(1, 3).every(body => body.model === 'project-delegated-distinct-model' && !body.tools?.length)).toBe(true);
            expect(JSON.stringify(f.requests[2])).toContain('ACTUAL_PROJECT_CHILD_ADVICE_1');
            expect(JSON.stringify(f.requests[3])).toContain('ACTUAL_PROJECT_CHILD_ADVICE_2');
            expect(JSON.stringify(f.requests[4])).toContain('PARENT_USED_ONLY_ACTUAL_CHILD_ADVICE');
            for (const body of f.requests.slice(1, 3)) expect(JSON.stringify(body)).toContain('ACTUAL_UPSTREAM_BRIEF');
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const lineage = await readProjectDelegation(tx, f.h.handle, parent, child.runId);
                expect(lineage.mode).toBe(mode); expect(Boolean(lineage.handoff)).toBe(mode === 'handoff');
                const producer = (await readAttempt(tx, f.h.handle, parent, parent.attemptRefs[1])).doc;
                const effect = (await readEffect(tx, f.h.handle, parent, producer.effectRefs[0])).doc;
                const continuation = await readProjectDelegationContinuation(tx, f.h.handle, parent, producer, effect);
                expect(continuation).toBeTruthy(); expect((await readProjectReviewOutput(tx, f.h.handle, parent)).receipt.costs.closed).toBe(true);
            });
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.status).toBe('review'); expect(task.attempts.filter(attempt => attempt.kind === 'generation')).toHaveLength(3);
            expect(task.compute.attempts).toHaveLength(7); expect(task.compute.attempts.every(attempt => attempt.status === 'settled')).toBe(true);
            expect(task.compute.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released' })]);
            expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.original.project.displayName);
        } finally { release?.restore(); await f.cleanup(); }
    }, 180000);

    test('Planner publishes and consumes a dynamically added Delegate from the exact authored child pin', async () => {
        const f = await fixture(make, { dynamic: true });
        try {
            await f.run(); const { parent, child } = await roots(f);
            expect(parent.status).toBe('completed'); expect(child.status).toBe('completed'); expect(parent.graphRevision).toBe(1);
            expect(parent.progress.patches).toBe(1); expect(parent.progress.delegates).toBe(1); expect(parent.graph.nodes).toContainEqual(f.delegator);
            expect(f.requests).toHaveLength(7); expect(JSON.stringify(f.requests[0])).toContain('delegate.child');
            expect(f.requests.slice(1, 3).every(body => body.model === 'project-delegated-distinct-model' && !body.tools?.length)).toBe(true);
            for (const body of f.requests.slice(1, 3)) expect(JSON.stringify(body)).toContain('Host-validated advisory graph control');
            expect(JSON.stringify(f.requests[2])).toContain('ACTUAL_PROJECT_CHILD_ADVICE_1');
            expect(JSON.stringify(f.requests[3])).toContain('ACTUAL_PROJECT_CHILD_ADVICE_2');
            expect(JSON.stringify(f.requests[4])).toContain('PARENT_USED_ONLY_ACTUAL_CHILD_ADVICE');
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const lineage = await readProjectDelegation(tx, f.h.handle, parent, child.runId);
                expect(lineage.parentAttempt.graphRevision).toBe(1); expect(lineage.parentInput.acceptedControlRefs).toHaveLength(1);
                expect((await readTaskLocalOutput(tx, f.h.handle, child)).closure.budgetAttemptRefs.length).toBeGreaterThan(2);
                const changes = [
                    [controlRecordKey(f.h.handle, child.runId, 'result', child.resultRefs[0].resultId), doc => {
                        doc.payload = 'Invented rehashed intermediate advice'; doc.envelope.payloadRef.integrity = hash(doc.payload);
                        doc.envelope.dependencyDigest = resultDependencyDigest(doc.envelope);
                    }],
                    [controlRecordKey(f.h.handle, child.runId, 'receipt', childClosureReceiptId(child.runId)), doc => { doc.budgetAttemptRefs = []; }],
                ];
                for (const [key, mutate] of changes) {
                    const saved = await tx.getResource(key), doc = structuredClone(saved.doc); mutate(doc);
                    try { await tx.putResource(key, { ...saved, doc, integrity: hash(doc) }); await expect(readTaskLocalOutput(tx, f.h.handle, child)).rejects.toThrow(); }
                    finally { await tx.putResource(key, saved); }
                }
                expect((await readProjectReviewOutput(tx, f.h.handle, parent)).receipt.costs.closed).toBe(true);
            });
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.status).toBe('review'); expect(task.attempts.filter(attempt => attempt.kind === 'generation')).toHaveLength(3);
            expect(task.compute.attempts).toHaveLength(7); expect(task.compute.attempts.every(attempt => attempt.status === 'settled')).toBe(true);
            expect(task.compute.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released' })]);
            expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.original.project.displayName);
        } finally { await f.cleanup(); }
    }, 180000);

    test('Planner cannot add a Delegate with an unpublished child Plan pin', async () => {
        const f = await fixture(make, { dynamic: true, badPlanPin: true });
        try {
            await expect(f.run()).rejects.toThrow('native_orchestration_project_graph_patch_rejected');
            const { parent, child } = await roots(f); expect(child).toBeUndefined(); expect(parent.graphRevision).toBe(0);
            expect(parent.progress.delegates).toBe(0); expect(parent.graph.nodes).not.toContainEqual(f.delegator); expect(f.requests).toHaveLength(1);
            const patches = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle, runId: parent.runId, recordType: 'patch' }));
            expect(patches).toHaveLength(1); expect(patches[0].doc.accepted).toBe(false);
            expect(patches[0].doc.issues).toEqual([expect.objectContaining({ code: 'native_orchestration_delegation_denied' })]);
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.attempts.every(attempt => !attempt.calls.length)).toBe(true); expect(task.changeSets).toEqual([]);
            expect(task.compute.attempts).toHaveLength(1); expect(task.compute.attempts[0].status).toBe('settled'); expect(task.compute.reservations).toBeUndefined();
        } finally { await f.cleanup(); }
    }, 60000);

    test.each(['known', 'usage_unknown', 'tools'])('child %s cannot resume parent or release tools', async failure => {
        const f = await fixture(make, { failure });
        try {
            const error = await f.run().then(() => null, error => error); expect(error).toBeTruthy(); const { parent, child } = await roots(f);
            expect(parent.status).not.toBe('completed'); expect(child.status).not.toBe('completed'); expect(parent.outputClaims).toEqual([]);
            expect(f.requests).toHaveLength(2);
            expect(f.requests.slice(1).every(body => body.model === 'project-delegated-distinct-model')).toBe(true);
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.attempts.every(attempt => !attempt.calls.length)).toBe(true); expect(task.changeSets).toEqual([]);
            expect(task.compute.attempts).toHaveLength(2); expect(task.compute.attempts[0].status).toBe('settled');
            expect(task.compute.attempts.slice(1).every(attempt => attempt.status === (failure === 'usage_unknown' ? 'unknown' : 'settled'))).toBe(true);
            expect(task.compute.reservations[0].status).toBe(failure === 'known' ? 'released' : 'held');
            // The original frozen-request tool validator rejects before Model
            // completion. Settled fees do not invent a terminal Effect.
            const toolRejection = failure === 'tools' ? { code: error.cause?.code ?? error.code,
                status: child.status, pending: child.pendingEffectRefs.length, results: child.resultRefs } : null;
            expect(toolRejection).toEqual(failure === 'tools'
                ? { code: 'generation_response_invalid', status: 'reconciling', pending: 1, results: [] } : null);
        } finally { await f.cleanup(); }
    }, 120000);

    test('a real Source replacement after release cannot claim child output or resume parent tools', async () => {
        const f = await fixture(make), release = interceptChildRelease(f, async count => { if (count === 1) await f.writeProject(); });
        try {
            await expect(f.run()).rejects.toThrow(); const { parent, child } = await roots(f);
            expect(release.calls()).toBe(1); expect(f.requests).toHaveLength(3); expect(parent.outputClaims).toEqual([]); expect(child.outputClaims).toEqual([]);
            expect(parent.status).not.toBe('completed'); expect(child.status).not.toBe('completed');
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.attempts.every(attempt => !attempt.calls.length)).toBe(true); expect(task.changeSets).toEqual([]);
            expect(task.compute.attempts).toHaveLength(3); expect(task.compute.attempts.every(attempt => attempt.status === 'settled')).toBe(true);
            expect(task.compute.reservations[0].status).toBe('released');
            expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe('Independent original Project edit');
        } finally { release.restore(); await f.cleanup(); }
    }, 120000);

});
