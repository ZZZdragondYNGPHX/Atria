import { BudgetPort } from '../../src/native/orchestration/budget-port.js';
import { makeTempSqliteEngineHarness, CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectModelFixture } from './helpers/project-model-fixture.js';
import { configureProjectToolPlan } from './helpers/project-tool-fixture.js';
import { planFixture } from './fixtures.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { createNativeId } from '../../src/native/identity.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { readProjectDelegation, readProjectDelegationContinuation } from '../../src/native/orchestration/project-delegation-contracts.js';
import { readProjectReviewOutput } from '../../src/native/orchestration/project-review-output-contracts.js';
import { readAttempt, controlRecordKey, readAttemptInvalidation, assertAttemptConsumable } from '../../src/native/orchestration/controller-common.js';
import { resultDependencyDigest } from '../../src/native/orchestration/result-contracts.js';
import { readTaskLocalOutput, childClosureReceiptId } from '../../src/native/orchestration/task-local-output-contracts.js';
import { readEffect } from '../../src/native/orchestration/effect-contracts.js';
import { readGraphPlannerCompletion } from '../../src/native/orchestration/graph-planner-completion.js';
import { readGraphReviewCompletion } from '../../src/native/orchestration/graph-review-completion.js';
import { assertProjectControlWork } from '../../src/native/orchestration/project-quality-contracts.js';
import { PROJECT_QUALITY_REASONS } from '../../src/native/orchestration/project-quality-profile.js';

const edge = (from, port, to, input) => ({ edgeId: createNativeId('orchestrationEdge'), from: { nodeId: from.nodeId, port },
    to: { nodeId: to.nodeId, port: input }, condition: 'always', maxVisits: 1, loopBack: false });
const port = (name, type, required = true) => ({ name, type, required });
const response = (text, index, usage = true) => ({ id: 'project-delegate-' + index, status: 'completed', output: [{ id: 'project-delegate-message-' + index,
    type: 'message', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text, annotations: [] }] }],
...usage ? { usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } } : {} });

async function fixture(make, { mode = 'handoff', failure = null, dynamic = false, badPlanPin = false, reviewRedo = false, tightBudget = false, childPlanner = false, parentPatch = true, onParent = null } = {}) {
    let proposed, delegator, refinement, childPlanRef, operations, childControl, childControlTarget, business = 0, reviewRound = 0, parentRound = 0, refinementRound = 0;
    const f = await projectModelFixture(make, { maxModelRounds: 3, responseStatus: index => failure === 'known' && index === 1 ? 400 : 200,
        changeRoute: route => ({ ...route, executionPolicy: { ...route.executionPolicy, computeBudget: { ...route.executionPolicy.computeBudget,
            maxRequests: reviewRedo ? tightBudget ? 11 : 14 : 10, localWork: { ...route.executionPolicy.computeBudget.localWork, maxJobs: 160 } } } }),
        configurePlan: async args => {
            const { plan, seeded, h, original, route, host } = args;
            proposed = structuredClone(original); proposed.project.displayName = 'Advisory delegated Project proposal';
            await configureProjectToolPlan(['atri_agent_set_plan', 'atri_agent_project_save', 'atri_agent_prepare_review'])(args);
            await seeded.persistence.saveModelProfile(h.handle, { ...seeded.model, limits: { ...seeded.model.limits, contextTokens: 65536 } });
            const pure = { ...seeded.model, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'project-delegated-distinct-model',
                capabilities: [{ capability: 'generation.tools', state: 'unsupported', provenance: [{ kind: 'adapter-metadata', source: 'Advisory child has no tools' }] }],
                limits: { ...seeded.model.limits, contextTokens: 65536 } };
            const childRoute = { ...route, runtimeRouteId: createNativeId('runtimeRoute'), modelProfileRef: { scope: 'player', modelProfileId: pure.modelProfileId },
                executionPolicy: { ...route.executionPolicy, allowedModelProfileIds: [pure.modelProfileId], computeBudget: { maxRequests: childPlanner ? 3 : 2, maxTokens: 20000,
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
            if (childPlanner) {
                childControl = { ...structuredClone(children[0]), nodeId: createNativeId('orchestrationNode'), kind: 'planner', label: 'Project child declared Planner',
                    inputs: [], outputs: [port('control', 'json', false)], capabilities: ['generation.send', 'graph.patch'] };
                children[0].inputs = [port('control', 'json')]; childControlTarget = children[0].nodeId;
                child.definition.nodes.unshift(childControl); child.definition.entryNodeIds = [childControl.nodeId];
                child.definition.edges.unshift(edge(childControl, 'control', children[0], 'control'));
                child.definition.capabilityCeiling.push('graph.patch');
                child.definition.graphChangePolicy = { allowedOperations: ['setPendingPriority', 'requestFinalize'], allowedNodeKinds: [] };
            }
            Object.assign(plan.definition.limits, { maxNodes: 12, maxEdges: 24, maxSteps: 180, maxAttempts: reviewRedo ? 20 : 16, maxDepth: 2,
                maxDelegates: 2, maxHandoffs: 2, maxReviews: reviewRedo ? 2 : plan.definition.limits.maxReviews, maxEdgeVisits: 24, maxLoopIterations: 2, maxConcurrency: mode === 'delegate' ? 2 : 1, deadlineMs: 180000 });
            child.definition.limits = { ...plan.definition.limits, maxNodes: childPlanner ? 4 : 3, maxEdges: childPlanner ? 3 : 2, maxSteps: 64, maxAttempts: childPlanner ? 4 : 3, maxDepth: 1,
                maxDelegates: 0, maxHandoffs: 0, maxEdgeVisits: childPlanner ? 3 : 2, maxLoopIterations: 0 };
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
            if (childPlanner && parentPatch) {
                delegator.capabilities.splice(1, 0, 'graph.patch'); graph.capabilityCeiling.push('graph.patch');
                graph.graphChangePolicy = { allowedOperations: ['setPendingPriority', 'requestFinalize'], allowedNodeKinds: [] };
            }
            graph.outputContract = { ...graph.outputContract, kind: 'project_review', resultPolicy: { outputType: 'json', maxBytes: 16384 } };
            plan.dependencyPins.push({ pinId: 'delegate.child', port: 'plan', resourceRef: childPlanRef, integrity: hash(childRevision) });
            if (reviewRedo) {
                refinement = { ...structuredClone(upstream), nodeId: createNativeId('orchestrationNode'), label: 'Refine actual delegated proposal', inputs: [port('proposal', 'text')] };
                const review = { ...structuredClone(upstream), nodeId: createNativeId('orchestrationNode'), kind: 'review', label: 'Review the actual completed delegated proposal',
                    inputs: [port('proposal', 'text'), port('refinement', 'text')], outputs: [port('control', 'json', false)], policy: { agentPinId: 'studio.route', maxRounds: 2 } };
                worker.inputs.push(port('review', 'json'), port('refinement', 'text', false));
                graph.nodes.splice(2, 0, refinement, review);
                graph.edges = [{ ...edge(upstream, 'advice', delegator, 'upstream'), maxVisits: 2 },
                    { ...edge(delegator, 'advice', refinement, 'proposal'), maxVisits: 2 },
                    { ...edge(delegator, 'advice', review, 'proposal'), maxVisits: 2 },
                    { ...edge(refinement, 'advice', review, 'refinement'), maxVisits: 2 }, edge(delegator, 'advice', worker, 'advice'),
                    edge(refinement, 'advice', worker, 'refinement'), { ...edge(review, 'control', worker, 'review'), maxVisits: 3 }, edge(worker, 'response', formalOutput, 'response'),
                    { ...edge(worker, 'response', worker, 'continuation'), loopBack: true, maxVisits: 2 }];
            }
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
            if (onParent) await onParent(args);
        }, responseBody: ({ body, index }) => {
            if (body.model === 'project-delegated-distinct-model' && failure === 'tools') return { id: 'forbidden-child-tool', status: 'completed', output: [{ id: 'forbidden-call', type: 'function_call', status: 'completed', call_id: 'forbidden-child-call', name: 'atri_agent_project_save', arguments: JSON.stringify({ source: proposed }) }], usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } };
            if (body.model === 'project-delegated-distinct-model' && childPlanner && index === 1) return response(JSON.stringify({ operations: [{ op: 'setPendingPriority', nodeId: childControlTarget, priority: 7 }, { op: 'requestFinalize' }] }), index);
            if (body.model === 'project-delegated-distinct-model') return response('ACTUAL_PROJECT_CHILD_ADVICE_' + index, index, failure !== 'usage_unknown');
            const authored = (body.input ?? []).flatMap(item => { try { return [JSON.parse(item.content)]; } catch { return []; } })
                .findLast(item => item?.kind?.startsWith('native_project_graph'));
            if (authored?.kind === 'native_project_graph_planner') return response(JSON.stringify({ operations }), index);
            if (authored?.kind === 'native_project_graph_review') {
                const strings = value => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];
                const ids = strings(body).filter(text => text.includes('Graph evidence: ') && text.includes('PARENT_DELEGATION_ADVICE_')).flatMap(text => [...text.matchAll(/Graph evidence: .*?"producerAttemptId":"(oattempt_[a-f0-9]+)"/g)].map(match => match[1]));
                const rerun = reviewRound++ === 0;
                return response(JSON.stringify({ decision: rerun ? 'rerun' : 'approve', reasonCode: rerun ? 'incomplete_proposal' : 'quality_ready', targetAttemptIds: [...new Set(ids)] }), index);
            }
            if (reviewRedo && authored?.authoredTask === 'Refine actual delegated proposal') return response('REFINED_DELEGATION_ADVICE_' + ++refinementRound, index);
            if (authored) return response(authored.authoredTask === 'Original upstream evidence brief' ? 'ACTUAL_UPSTREAM_BRIEF'
                : reviewRedo ? 'PARENT_DELEGATION_ADVICE_' + ++parentRound : 'PARENT_USED_ONLY_ACTUAL_CHILD_ADVICE', index);
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
    return Object.assign(f, { delegator, refinement, childPlanRef, childControl, childControlTarget });
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

const sqliteHarness = CONTRACT_HARNESSES.find(harness => harness.name === 'SqliteEngine');
describe('SqliteEngine Project Review over completed pure delegation', () => {
    test('bounded Review creates a new parent Attempt and child Run while retaining both original child costs', async () => {
        const f = await fixture(sqliteHarness.make, { reviewRedo: true });
        const diagnosticStartedAt = Date.now();
        let beforeReplacement = null;
        try {
            f.onResponse(async ({ index }) => {
                if (process.env.ATRIA_PROJECT_REDO_PROFILE) process.stderr.write('Project redo HTTP ' + index + ' ' + (Date.now() - diagnosticStartedAt) + '\n');
                if (index !== 6) return;
                const children = await f.h.engine.withTransaction(f.h.handle, async tx => (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }))
                    .map(row => row.doc).filter(root => root.parentRef).sort((a, b) => a.createdAt - b.createdAt));
                const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
                const oldFees = task.compute.attempts.filter(row => row.reservationId === children[0].runId);
                expect(children).toHaveLength(2); expect(children[0].status).toBe('completed'); expect(children[1].runId).not.toBe(children[0].runId);
                expect(oldFees).toHaveLength(2); expect(oldFees.every(row => row.status === 'settled')).toBe(true);
                expect(task.attempts.every(attempt => !attempt.calls.length)).toBe(true);
                beforeReplacement = { oldRunId: children[0].runId, feeIds: oldFees.map(row => row.attemptId) };
            });
            try { await f.run(); } catch (error) {
                if (process.env.ATRIA_PROJECT_REDO_PROFILE) {
                    const { parent } = await roots(f), task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
                    process.stderr.write('Project redo failure ' + JSON.stringify({ elapsed: Date.now() - diagnosticStartedAt, requests: f.requests.length,
                        parent: { status: parent.status, attempts: parent.attemptRefs, pending: parent.pendingEffectRefs },
                        costs: task.compute.attempts.map(row => ({ attemptId: row.attemptId, status: row.status, reservationId: row.reservationId })) }) + '\n');
                }
                throw error;
            }
            const { parent } = await roots(f);
            const children = await f.h.engine.withTransaction(f.h.handle, async tx => (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }))
                .map(row => row.doc).filter(root => root.parentRef).sort((a, b) => a.createdAt - b.createdAt));
            expect(parent.status).toBe('completed'); expect(parent.progress.delegates).toBe(2); expect(parent.progress.handoffs).toBe(2); expect(parent.progress.reviews).toBe(2);
            expect(f.requests).toHaveLength(14); expect(children).toHaveLength(2); expect(children.every(child => child.status === 'completed')).toBe(true);
            expect(children[0].runId).toBe(beforeReplacement.oldRunId);
            expect(JSON.stringify(f.requests[8])).toContain('ACTUAL_PROJECT_CHILD_ADVICE_7'); expect(JSON.stringify(f.requests[8])).toContain('incomplete_proposal');
            expect(JSON.stringify(f.requests[11])).toContain('PARENT_DELEGATION_ADVICE_2'); expect(JSON.stringify(f.requests[11])).not.toContain('PARENT_DELEGATION_ADVICE_1');
            expect(JSON.stringify(f.requests[11])).toContain('REFINED_DELEGATION_ADVICE_2'); expect(JSON.stringify(f.requests[11])).not.toContain('REFINED_DELEGATION_ADVICE_1');
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const attempts = await Promise.all(parent.attemptRefs.map(ref => readAttempt(tx, f.h.handle, parent, ref)));
                const delegated = attempts.map(row => row.doc).filter(attempt => attempt.nodeId === f.delegator.nodeId).sort((a, b) => a.attemptNumber - b.attemptNumber);
                expect(delegated).toHaveLength(2); expect(delegated.map(attempt => attempt.status)).toEqual(['completed', 'completed']);
                expect(delegated[1].attemptNumber).toBe(delegated[0].attemptNumber + 1);
                expect(await readAttemptInvalidation(tx, f.h.handle, parent, delegated[0])).toBeTruthy();
                await expect(assertAttemptConsumable(tx, f.h.handle, parent, delegated[0])).rejects.toMatchObject({ code: 'native_orchestration_attempt_superseded' });
                expect(await readAttemptInvalidation(tx, f.h.handle, parent, delegated[1])).toBeNull();
                const refined = attempts.map(row => row.doc).filter(attempt => attempt.nodeId === f.refinement.nodeId).sort((a, b) => a.attemptNumber - b.attemptNumber);
                expect(refined).toHaveLength(2); expect(refined.map(attempt => attempt.status)).toEqual(['completed', 'completed']);
                expect(refined[1].attemptNumber).toBe(refined[0].attemptNumber + 1); expect(refined[1].inputRefs[0].requestId).not.toBe(refined[0].inputRefs[0].requestId);
                await expect(assertAttemptConsumable(tx, f.h.handle, parent, refined[0])).rejects.toMatchObject({ code: 'native_orchestration_attempt_superseded' });
                const reviews = [];
                for (const { doc } of attempts.filter(({ doc }) => parent.graph.nodes.find(node => node.nodeId === doc.nodeId).kind === 'review'))
                    reviews.push(await readGraphReviewCompletion(tx, f.h.handle, parent, doc.attemptId, { verifyControlWork: assertProjectControlWork, reasonCodes: PROJECT_QUALITY_REASONS }));
                expect(reviews.map(fact => fact.review.decision)).toEqual(['rerun', 'approve']);
                expect(reviews[0].review.invalidatedAttemptIds).toEqual([delegated[0].attemptId, refined[0].attemptId].sort());
                expect(reviews[0].review.replacements).toEqual([{ targetAttemptId: delegated[0].attemptId, attemptId: delegated[1].attemptId }]);
                for (const child of children) {
                    expect((await readProjectDelegation(tx, f.h.handle, parent, child.runId)).parentAttempt.attemptId).toBe(child.parentRef.nodeAttemptId);
                    expect((await readTaskLocalOutput(tx, f.h.handle, child)).publication.graphHistory.settled).toBe(true);
                }
                expect((await readProjectReviewOutput(tx, f.h.handle, parent)).receipt.costs.closed).toBe(true);
            });
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.status).toBe('review'); expect(task.attempts.filter(attempt => attempt.kind === 'generation')).toHaveLength(3);
            expect(task.compute.attempts).toHaveLength(14); expect(task.compute.attempts.every(row => row.status === 'settled')).toBe(true);
            expect(task.compute.attempts.filter(row => beforeReplacement.feeIds.includes(row.attemptId))).toHaveLength(2);
            expect(task.compute.reservations).toHaveLength(2); expect(task.compute.reservations.every(row => row.status === 'released')).toBe(true);
            expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.original.project.displayName);
        } finally { await f.cleanup(); }
    }, 180000);

    test('redo admission includes the new child ceiling and cannot reset the old spent allocation', async () => {
        const f = await fixture(sqliteHarness.make, { reviewRedo: true, tightBudget: true });
        const bank = f.authority.execution.budgetPort, observeCapacity = bank.observeCapacity, remainingRequests = [];
        bank.observeCapacity = async function (...args) {
            const actual = await observeCapacity.apply(this, args); remainingRequests.push(actual.remaining.requests); return actual;
        };
        try {
            await expect(f.run()).rejects.toMatchObject({ code: 'generation_execution_failed' });
            expect(remainingRequests.at(-1)).toBe(5);
            const { parent, child } = await roots(f);
            expect(f.requests).toHaveLength(6); expect(parent.progress.delegates).toBe(1); expect(child.status).toBe('completed'); expect(parent.outputClaims).toEqual([]);
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const attempts = await Promise.all(parent.attemptRefs.map(ref => readAttempt(tx, f.h.handle, parent, ref)));
                const delegated = attempts.map(row => row.doc).filter(attempt => attempt.nodeId === f.delegator.nodeId);
                expect(delegated).toHaveLength(1); expect(await readAttemptInvalidation(tx, f.h.handle, parent, delegated[0])).toBeNull();
                expect((await readTaskLocalOutput(tx, f.h.handle, child)).publication.graphHistory.settled).toBe(true);
            });
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.attempts.every(attempt => !attempt.calls.length)).toBe(true); expect(task.changeSets).toEqual([]);
            expect(task.compute.attempts).toHaveLength(6); expect(task.compute.attempts.every(row => row.status === 'settled')).toBe(true);
            expect(task.compute.localWork.filter(row => row.kind === 'graph_control_adopt' && row.usage?.outcome === 'failed')).toEqual([expect.objectContaining({ status: 'settled' })]);
            expect(task.compute.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released' })]);
        } finally { bank.observeCapacity = observeCapacity; await f.cleanup(); }
    }, 120000);
});


test('SQLite Project child Planner controls the declared Agent DAG and reaches original tools and human Review', async () => {
    const f = await fixture(makeTempSqliteEngineHarness, { childPlanner: true });
    try {
        await f.run(); const { parent, child } = await roots(f);
        expect(parent.status).toBe('completed'); expect(child.status).toBe('completed'); expect(child.graphRevision).toBe(1);
        expect(child.progress).toMatchObject({ patches: 1, attempts: 4, delegates: 0, handoffs: 0, loopIterations: 0 });
        expect(child.nodeControl[f.childControlTarget].priority).toBe(7); expect(child.resultRefs).toHaveLength(2);
        expect(f.requests).toHaveLength(8); expect(f.requests.slice(1, 4).every(body => body.model === 'project-delegated-distinct-model' && !body.tools?.length)).toBe(true);
        expect(JSON.stringify(f.requests[2])).toContain('setPendingPriority'); expect(JSON.stringify(f.requests[3])).toContain('ACTUAL_PROJECT_CHILD_ADVICE_2');
        expect(JSON.stringify(f.requests[4])).toContain('ACTUAL_PROJECT_CHILD_ADVICE_3');
        for (const body of f.requests.slice(1, 4)) expect(JSON.stringify(body)).toContain('ACTUAL_UPSTREAM_BRIEF');
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            const local = await readTaskLocalOutput(tx, f.h.handle, child), history = local.publication.graphHistory;
            expect(history.controls).toHaveLength(1); expect(history.effects).toHaveLength(3); expect(history.settled).toBe(true);
            const planner = history.controls[0];
            expect((await readGraphPlannerCompletion(tx, f.h.handle, child, planner.producer.attemptId, { verifyControlWork: assertProjectControlWork })).patch.requests.finalize).toBe(true);
            expect((await readProjectReviewOutput(tx, f.h.handle, parent)).receipt.costs.closed).toBe(true);
            const key = controlRecordKey(f.h.handle, child.runId, 'receipt', planner.receipt.receiptId), saved = await tx.getResource(key);
            const doc = { ...saved.doc, localWork: [] };
            try { await tx.putResource(key, { ...saved, doc, integrity: hash(doc) }); await expect(readTaskLocalOutput(tx, f.h.handle, child)).rejects.toThrow(); }
            finally { await tx.putResource(key, saved); }
            expect((await readTaskLocalOutput(tx, f.h.handle, child)).publication.graphHistory.settled).toBe(true);
        });
        const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
        expect(task.status).toBe('review'); expect(task.attempts.filter(attempt => attempt.kind === 'generation')).toHaveLength(3);
        expect(task.compute.attempts).toHaveLength(8); expect(task.compute.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(task.compute.attempts.filter(row => row.reservationId === child.runId)).toHaveLength(3);
        expect(task.compute.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released' })]);
        expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.original.project.displayName);
    } finally { await f.cleanup(); }
}, 180000);

test('Project child Planner requires the original explicit parent Node graph.patch capability before any Run', async () => {
    let report, runs;
    await expect(fixture(makeTempSqliteEngineHarness, { childPlanner: true, parentPatch: false, onParent: async ({ plan, host, h }) => {
        const draft = await host.turnOrchestration.plans.create(h.handle, createNativeId('orchestrationCommand'), plan);
        report = await host.turnOrchestration.plans.validate(h.handle, { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash });
        runs = await h.engine.withTransaction(h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: h.handle }));
        throw new Error('Project child explicit parent capability checked');
    } })).rejects.toThrow('Project child explicit parent capability checked');
    expect(report.status).toBe('invalid'); expect(report.issues).toContainEqual(expect.objectContaining({ code: 'native_orchestration_child_authority_invalid', severity: 'blocking' }));
    expect(runs).toEqual([]);
}, 60000);
