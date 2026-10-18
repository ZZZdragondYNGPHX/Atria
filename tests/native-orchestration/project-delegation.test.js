import { BudgetPort } from '../../src/native/orchestration/budget-port.js';
import { inspectComputeReservation } from '../../public/shared/native-compute-budget.js';
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

async function fixture(make, { mode = 'handoff', failure = null, dynamic = false, badPlanPin = false, reviewRedo = false, tightBudget = false, childPlanner = false, parentPatch = true, onParent = null, childDynamic = false, badChildPin = false, childLoop = null, childRequests = null, parentLoopIterations = 2, childQuality = null, childMaxRounds = 2, childFanout = false, childFanoutUsageUnknown = false, childFanoutPlanner = false } = {}) {
    let childFanoutPlannerNode, childFanoutNode, childJoinNode, childBranches, releaseChildBranches, arrivedChildBranches = 0;
    const bothChildBranches = new Promise(resolve => { releaseChildBranches = resolve; });
    let childQualityNode, childDraft, childAlternative, childFinal, childDraftRound = 0, childQualityRound = 0;
    let proposed, delegator, refinement, childPlanRef, operations, childControl, childControlTarget, childAdded, childOperations, childLoopEdge, childPlannerRound = 0, business = 0, reviewRound = 0, parentRound = 0, refinementRound = 0;
    const f = await projectModelFixture(make, { maxModelRounds: 3, responseStatus: index => failure === 'known' && index === 1 ? 400 : 200,
        changeRoute: route => ({ ...route, executionPolicy: { ...route.executionPolicy, computeBudget: { ...route.executionPolicy.computeBudget,
            maxRequests: childFanoutPlanner ? 9 : reviewRedo ? tightBudget ? 11 : 14 : childDynamic || childLoop === 'self' || childFanout ? 8 : 10, localWork: { ...route.executionPolicy.computeBudget.localWork, maxJobs: 160 } } } }),
        configurePlan: async args => {
            const { plan, seeded, h, original, route, host } = args;
            proposed = structuredClone(original); proposed.project.displayName = 'Advisory delegated Project proposal';
            await configureProjectToolPlan(['atri_agent_set_plan', 'atri_agent_project_save', 'atri_agent_prepare_review'])(args);
            await seeded.persistence.saveModelProfile(h.handle, { ...seeded.model, limits: { ...seeded.model.limits, contextTokens: 65536 } });
            const pure = { ...seeded.model, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'project-delegated-distinct-model',
                capabilities: [{ capability: 'generation.tools', state: 'unsupported', provenance: [{ kind: 'adapter-metadata', source: 'Advisory child has no tools' }] }],
                limits: { ...seeded.model.limits, contextTokens: 65536 } };
            const childRoute = { ...route, runtimeRouteId: createNativeId('runtimeRoute'), modelProfileRef: { scope: 'player', modelProfileId: pure.modelProfileId },
                executionPolicy: { ...route.executionPolicy, allowedModelProfileIds: [pure.modelProfileId], computeBudget: { maxRequests: childRequests ?? (childFanoutPlanner ? 4 : childFanout ? 3 : childQuality === 'review' ? 5 : childQuality === 'judge' ? 4 : childLoop === 'nonself' ? 5 : childPlanner ? 3 : 2), maxTokens: 20000,
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
            if (childDynamic) {
                const futureModel = { ...pure, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'project-child-dynamic-owned-model' };
                const futureRoute = { ...childRoute, runtimeRouteId: createNativeId('runtimeRoute'), modelProfileRef: { scope: 'player', modelProfileId: futureModel.modelProfileId },
                    executionPolicy: { ...childRoute.executionPolicy, allowedModelProfileIds: [futureModel.modelProfileId] } };
                await seeded.persistence.saveModelProfile(h.handle, futureModel); await seeded.persistence.saveRuntimeRoute(h.handle, futureRoute);
                child.dependencyPins.push({ pinId: 'child.future', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: futureRoute.runtimeRouteId }, integrity: hash(futureRoute) });
                const terminal = children[1]; terminal.inputs = [port('control', 'json'), port('dynamic', 'text', false)];
                childControlTarget = terminal.nodeId;
                child.definition.nodes = [childControl, terminal, output]; child.definition.entryNodeIds = [childControl.nodeId];
                child.definition.edges = [edge(childControl, 'control', terminal, 'control'), edge(terminal, 'advice', output, 'result')];
                child.definition.graphChangePolicy = { allowedOperations: ['addNode', 'addEdge'], allowedNodeKinds: ['agent'] };
                childAdded = { ...structuredClone(children[0]), nodeId: createNativeId('orchestrationNode'), label: 'Added Project child from published owned model pin',
                    inputs: [port('control', 'json')], dependencyPinIds: [badChildPin ? 'child.undeclared' : 'child.future'],
                    policy: { agentPinId: badChildPin ? 'child.undeclared' : 'child.future' } };
                childOperations = [{ op: 'addNode', node: childAdded }, { op: 'addEdge', edge: edge(childControl, 'control', childAdded, 'control') },
                    { op: 'addEdge', edge: edge(childAdded, 'advice', terminal, 'dynamic') }];
            }
            if (childLoop) {
                child.definition.graphChangePolicy = { allowedOperations: ['requestReplan', 'requestFinalize'], allowedNodeKinds: [] };
                const terminal = children[1], target = childLoop === 'self' ? childControl : children[0];
                target.inputs.push(port('return', 'json', false));
                childLoopEdge = { ...edge(childControl, 'control', target, 'return'), loopBack: true };
                if (childLoop === 'self') {
                    terminal.inputs = [port('control', 'json')];
                    child.definition.nodes = [childControl, terminal, output]; child.definition.entryNodeIds = [childControl.nodeId];
                    child.definition.edges = [edge(childControl, 'control', terminal, 'control'), edge(terminal, 'advice', output, 'result'), childLoopEdge];
                } else {
                    // The published nonself return selects the earlier pure
                    // Agent. requestReplan itself acquires no target field.
                    children[0].inputs = [port('return', 'json', false)]; childControl.inputs = [port('evidence', 'text')]; terminal.inputs = [port('control', 'json')];
                    child.definition.nodes = [children[0], childControl, terminal, output]; child.definition.entryNodeIds = [children[0].nodeId];
                    child.definition.edges = [{ ...edge(children[0], 'advice', childControl, 'evidence'), maxVisits: 2 },
                        edge(childControl, 'control', terminal, 'control'), edge(terminal, 'advice', output, 'result'), childLoopEdge];
                }
            }
            if (childQuality) {
                childDraft = children[0]; childFinal = children[1];
                childQualityNode = { ...structuredClone(childDraft), nodeId: createNativeId('orchestrationNode'), kind: childQuality,
                    label: 'Project child actual typed ' + childQuality, inputs: [port('draft', 'text')], outputs: [port('decision', 'json', false)],
                    policy: { agentPinId: 'child.model', ...childQuality === 'review' ? { maxRounds: childMaxRounds } : {} } };
                childFinal.inputs = [port('draft', 'text', childQuality !== 'judge'), port('decision', 'json')];
                child.definition.nodes = [childDraft, childQualityNode, childFinal, output];
                child.definition.edges = [{ ...edge(childDraft, 'advice', childQualityNode, 'draft'), maxVisits: childQuality === 'review' ? childMaxRounds : 1 },
                    edge(childDraft, 'advice', childFinal, 'draft'), edge(childQualityNode, 'decision', childFinal, 'decision'), edge(childFinal, 'advice', output, 'result')];
                if (childQuality === 'judge') {
                    childAlternative = { ...structuredClone(childDraft), nodeId: createNativeId('orchestrationNode'), label: 'Project child second typed candidate' };
                    childQualityNode.inputs.push(port('alternative', 'text')); childFinal.inputs.push(port('alternative', 'text', false));
                    child.definition.nodes.splice(1, 0, childAlternative); child.definition.entryNodeIds.push(childAlternative.nodeId);
                    child.definition.edges.push(edge(childAlternative, 'advice', childQualityNode, 'alternative'), edge(childAlternative, 'advice', childFinal, 'alternative'));
                }
            }
            if (childFanout) {
                const alternative = { ...structuredClone(children[0]), nodeId: createNativeId('orchestrationNode'), label: 'Original child independent branch B',
                    dependencyPinIds: ['child.branchB'], policy: { agentPinId: 'child.branchB' } };
                children[0].label = 'Original child independent branch A';
                childBranches = [children[0], alternative];
                const branchConnection = { ...seeded.connection, connectionProfileId: createNativeId('connectionProfile') };
                const branchModel = { ...pure, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'project-child-fanout-distinct-B',
                    connectionProfileRef: { scope: 'player', connectionProfileId: branchConnection.connectionProfileId } };
                const branchRoute = { ...childRoute, runtimeRouteId: createNativeId('runtimeRoute'), modelProfileRef: { scope: 'player', modelProfileId: branchModel.modelProfileId },
                    connectionProfileRef: branchModel.connectionProfileRef, executionPolicy: { ...childRoute.executionPolicy, allowedModelProfileIds: [branchModel.modelProfileId] } };
                await seeded.persistence.saveConnectionProfile(h.handle, branchConnection); await seeded.persistence.saveModelProfile(h.handle, branchModel); await seeded.persistence.saveRuntimeRoute(h.handle, branchRoute);
                child.dependencyPins.push({ pinId: 'child.branchB', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: branchRoute.runtimeRouteId }, integrity: hash(branchRoute) });
                childFanoutNode = { nodeId: createNativeId('orchestrationNode'), kind: 'fanout', label: 'Freeze actual child advisory branches', inputs: [],
                    outputs: [port('scope', 'task.result', false)], dependencyPinIds: [], capabilities: [], policy: { maxConcurrency: 2, failurePolicy: 'continue' } };
                for (const node of childBranches) node.inputs = [port('scope', 'task.result')];
                childJoinNode = { nodeId: createNativeId('orchestrationNode'), kind: 'join', label: 'Join child actual typed receipts', inputs: [port('left', 'text'), port('right', 'text')],
                    outputs: [port('joined', 'text', false)], dependencyPinIds: [], capabilities: [], policy: { strategy: 'all-success', quorum: 2, deadlineMs: 120000 } };
                children[1].inputs = [port('joined', 'text')];
                child.definition.nodes = [childFanoutNode, ...childBranches, childJoinNode, children[1], output]; child.definition.entryNodeIds = [childFanoutNode.nodeId];
                child.definition.edges = [edge(childFanoutNode, 'scope', children[0], 'scope'), edge(childFanoutNode, 'scope', alternative, 'scope'),
                    edge(children[0], 'advice', childJoinNode, 'left'), edge(alternative, 'advice', childJoinNode, 'right'), edge(childJoinNode, 'joined', children[1], 'joined'), edge(children[1], 'advice', output, 'result')];
                if (childFanoutPlanner) {
                    childFanoutPlannerNode = { ...structuredClone(children[0]), nodeId: createNativeId('orchestrationNode'), kind: 'planner', label: 'Project child original frozen scope Planner',
                        outputs: [port('control', 'json', false)], capabilities: ['generation.send', 'graph.patch'] };
                    children[0].inputs = [port('control', 'json')];
                    child.definition.nodes.splice(1, 0, childFanoutPlannerNode);
                    child.definition.edges = child.definition.edges.map(item => item.from.nodeId === childFanoutNode.nodeId && item.to.nodeId === children[0].nodeId
                        ? edge(childFanoutNode, 'scope', childFanoutPlannerNode, 'scope') : item);
                    child.definition.edges.push(edge(childFanoutPlannerNode, 'control', children[0], 'control'));
                    child.definition.capabilityCeiling.push('graph.patch');
                    child.definition.graphChangePolicy = { allowedOperations: ['setPendingPriority', 'requestFinalize'], allowedNodeKinds: [] };
                }
            }
            Object.assign(plan.definition.limits, { maxNodes: 12, maxEdges: 24, maxSteps: 180, maxAttempts: reviewRedo ? 20 : 16, maxDepth: 2,
                maxDelegates: 2, maxHandoffs: 2, maxReviews: reviewRedo ? 2 : plan.definition.limits.maxReviews, maxEdgeVisits: 24, maxLoopIterations: parentLoopIterations, maxConcurrency: mode === 'delegate' || childFanout ? 2 : 1, deadlineMs: 180000 });
            child.definition.limits = { ...plan.definition.limits, maxNodes: childPlanner ? 4 : 3, maxEdges: childDynamic ? 4 : childPlanner ? 3 : 2, maxSteps: 64, maxAttempts: childPlanner ? 4 : 3, maxDepth: 1,
                maxDelegates: 0, maxHandoffs: 0, maxEdgeVisits: childDynamic ? 4 : childPlanner ? 3 : 2, maxLoopIterations: 0 };
            if (childLoop) Object.assign(child.definition.limits, { maxNodes: childLoop === 'self' ? 3 : 4, maxEdges: childLoop === 'self' ? 3 : 4,
                maxAttempts: childLoop === 'self' ? 4 : 6, maxEdgeVisits: childLoop === 'self' ? 3 : 5, maxLoopIterations: 1, maxReplans: 1 });
            if (childQuality) Object.assign(child.definition.limits, { maxNodes: child.definition.nodes.length, maxEdges: child.definition.edges.length,
                maxAttempts: childQuality === 'review' ? 6 : 5, maxEdgeVisits: childQuality === 'review' ? 5 : 6,
                maxReviews: childQuality === 'review' ? childMaxRounds : 0 });
            if (childFanout) Object.assign(child.definition.limits, { maxNodes: 6, maxEdges: 6, maxAttempts: 6, maxEdgeVisits: 6, maxConcurrency: 2 });
            if (childFanoutPlanner) Object.assign(child.definition.limits, { maxNodes: 7, maxEdges: 7, maxAttempts: 7, maxEdgeVisits: 7 });
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
            if ((childPlanner || childFanoutPlanner) && parentPatch) {
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
        }, responseBody: async ({ body, index }) => {
            const childTask = body.model === 'project-delegated-distinct-model' || childFanout && body.model === 'project-child-fanout-distinct-B'
                ? (body.input ?? []).flatMap(item => { try { return [JSON.parse(item.content)]; } catch { return []; } })
                    .findLast(item => item?.kind === 'native_project_delegated_work') : null;
            if (childFanoutPlanner && childTask?.nodeId === childBranches[0].nodeId) return response('CHILD_CONCURRENT_ADVICE_A', index);
            if (childFanout && (childBranches.some(node => node.nodeId === childTask?.nodeId) || childFanoutPlanner && childTask?.nodeId === childFanoutPlannerNode.nodeId)) {
                if (++arrivedChildBranches === 2) releaseChildBranches();
                await bothChildBranches; // A serial consumer must hit the original Route deadline.
                return response(childFanoutPlanner && childTask.nodeId === childFanoutPlannerNode.nodeId
                    ? JSON.stringify({ operations: [{ op: 'setPendingPriority', nodeId: childBranches[0].nodeId, priority: 7 }] })
                    : childTask.nodeId === childBranches[0].nodeId ? 'CHILD_CONCURRENT_ADVICE_A' : 'CHILD_CONCURRENT_ADVICE_B', index,
                !(childFanoutUsageUnknown && childTask.nodeId === childBranches[1].nodeId));
            }
            if (childQuality && childTask?.nodeId === childQualityNode.nodeId) return response(JSON.stringify(childQuality === 'review'
                ? { decision: ++childQualityRound === 1 ? 'rerun' : 'approve', reasonCode: childQualityRound === 1 ? 'incomplete_proposal' : 'quality_ready',
                    targetAttemptIds: [childTask.reviewTargets[0].attemptId] }
                : { selectedResultRef: childTask.candidateRefs[0], reasonCode: 'candidate_selected' }), index);
            if (childQuality && childTask?.nodeId === childDraft.nodeId) return response('PROJECT_CHILD_QUALITY_DRAFT_' + ++childDraftRound, index);
            if (childQuality && childAlternative && childTask?.nodeId === childAlternative.nodeId) return response('PROJECT_CHILD_OTHER_CANDIDATE', index);
            if (childQuality && childTask?.nodeId === childFinal.nodeId) return response('PROJECT_CHILD_REVIEWED_TERMINAL', index);
            if (childLoop && body.model === 'project-delegated-distinct-model' && childTask?.authoredTask === 'Project child declared Planner')
                return response(JSON.stringify({ operations: [{ op: childPlannerRound++ === 0 ? 'requestReplan' : 'requestFinalize' }] }), index);
            if (body.model === 'project-delegated-distinct-model' && failure === 'tools') return { id: 'forbidden-child-tool', status: 'completed', output: [{ id: 'forbidden-call', type: 'function_call', status: 'completed', call_id: 'forbidden-child-call', name: 'atri_agent_project_save', arguments: JSON.stringify({ source: proposed }) }], usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } };
            if (body.model === 'project-child-dynamic-owned-model') return response('DYNAMIC_CHILD_FROM_EXACT_OWNED_PIN', index);
            if (body.model === 'project-delegated-distinct-model' && childPlanner && !childLoop && index === 1) return response(JSON.stringify({ operations: childDynamic ? childOperations : [{ op: 'setPendingPriority', nodeId: childControlTarget, priority: 7 }, { op: 'requestFinalize' }] }), index);
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
    return Object.assign(f, { delegator, refinement, childPlanRef, childControl, childControlTarget, childAdded, childLoopEdge, childDraft, childAlternative, childFinal, childQualityNode, childBranches, childFanoutNode, childJoinNode, childFanoutPlannerNode, get arrivedChildBranches() { return arrivedChildBranches; } });
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


test('SQLite Planner dynamically publishes a true Delegate and original parent consumes the closed child before tools', async () => {
    const f = await fixture(makeTempSqliteEngineHarness, { dynamic: true, mode: 'delegate' });
    try {
        f.onResponse(async ({ index }) => {
            if (index !== 1) return;
            const { parent, child } = await roots(f);
            const lineage = await f.h.engine.withTransaction(f.h.handle, tx => readProjectDelegation(tx, f.h.handle, parent, child.runId));
            expect(lineage.mode).toBe('delegate'); expect(lineage.handoff).toBeNull(); expect(lineage.parentAttempt.status).toBe('running');
            expect((await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId)).attempts[0].calls).toEqual([]);
        });
        await f.run(); const { parent, child } = await roots(f);
        expect(parent.status).toBe('completed'); expect(child.status).toBe('completed'); expect(parent.graphRevision).toBe(1);
        expect(parent.progress).toMatchObject({ delegates: 1, handoffs: 0, patches: 1 }); expect(f.requests).toHaveLength(7);
        expect(f.requests.slice(1, 3).every(body => body.model === 'project-delegated-distinct-model' && !body.tools?.length)).toBe(true);
        expect(JSON.stringify(f.requests[3])).toContain('ACTUAL_PROJECT_CHILD_ADVICE_2');
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            const lineage = await readProjectDelegation(tx, f.h.handle, parent, child.runId);
            expect(lineage.mode).toBe('delegate'); expect(lineage.handoff).toBeNull();
            const producer = lineage.parentAttempt, effect = (await readEffect(tx, f.h.handle, parent, producer.effectRefs[0])).doc;
            expect(effect.inputRef.returnReceiptRef).toBeNull();
            expect((await readProjectDelegationContinuation(tx, f.h.handle, parent, producer, effect)).lineage.mode).toBe('delegate');
            expect((await readTaskLocalOutput(tx, f.h.handle, child)).publication.graphHistory.settled).toBe(true);
            expect((await readProjectReviewOutput(tx, f.h.handle, parent)).receipt.costs.closed).toBe(true);
        });
        const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
        expect(task.status).toBe('review'); expect(task.attempts.filter(row => row.kind === 'generation')).toHaveLength(3);
        expect(task.compute.attempts).toHaveLength(7); expect(task.compute.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(task.compute.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released' })]);
        expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.original.project.displayName);
    } finally { await f.cleanup(); }
}, 180000);


test('SQLite Project child Planner publishes a pure Agent using its initial owned pin and original held child budget', async () => {
    const f = await fixture(makeTempSqliteEngineHarness, { childPlanner: true, childDynamic: true });
    try {
        await f.run(); const { parent, child } = await roots(f);
        expect(parent.status).toBe('completed'); expect(child.status).toBe('completed'); expect(child.graphRevision).toBe(1);
        expect(child.graph.nodes).toContainEqual(f.childAdded); expect(child.resultRefs).toHaveLength(2); expect(f.requests).toHaveLength(8);
        expect(f.requests.map(body => body.model).slice(1, 4)).toEqual(['project-delegated-distinct-model', 'project-child-dynamic-owned-model', 'project-delegated-distinct-model']);
        for (const body of f.requests.slice(1, 4)) expect(body.tools?.length ?? 0).toBe(0);
        expect(JSON.stringify(f.requests[1])).toContain('child.future'); expect(JSON.stringify(f.requests[2])).toContain('Host-validated advisory child GraphPatch');
        expect(JSON.stringify(f.requests[3])).toContain('DYNAMIC_CHILD_FROM_EXACT_OWNED_PIN'); expect(JSON.stringify(f.requests[4])).toContain('ACTUAL_PROJECT_CHILD_ADVICE_3');
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            const output = await readTaskLocalOutput(tx, f.h.handle, child), history = output.publication.graphHistory;
            expect(history.controls).toHaveLength(1); expect(history.models).toHaveLength(3); expect(history.effects).toHaveLength(3); expect(history.settled).toBe(true);
            expect(history.controls[0].patch.appliedOperations.map(operation => operation.op)).toEqual(['addNode', 'addEdge', 'addEdge']);
            const added = history.results.find(fact => fact.producer.nodeId === f.childAdded.nodeId);
            expect(added.producer.graphRevision).toBe(1); expect(added.modelEffect.inputRef.routeRef).toEqual(history.plan.dependencyPins.find(pin => pin.pinId === 'child.future').resourceRef);
            const key = { kind: K.orchestrationRun, handle: f.h.handle, runId: child.runId }, saved = await tx.getResource(key), doc = structuredClone(saved.doc);
            doc.graph.nodes.find(node => node.nodeId === f.childAdded.nodeId).label = 'Rehashed graph without its original accepted proposal';
            try { await tx.putResource(key, { ...saved, doc, integrity: hash(doc) }); await expect(readTaskLocalOutput(tx, f.h.handle, doc)).rejects.toThrow(); }
            finally { await tx.putResource(key, saved); }
            expect((await readTaskLocalOutput(tx, f.h.handle, child)).publication.graphHistory.settled).toBe(true);
            expect((await readProjectReviewOutput(tx, f.h.handle, parent)).receipt.costs.closed).toBe(true);
        });
        const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
        expect(task.status).toBe('review'); expect(task.compute.limits.maxRequests).toBe(8); expect(task.compute.attempts).toHaveLength(8);
        expect(task.compute.attempts.every(row => row.status === 'settled')).toBe(true); expect(task.compute.attempts.filter(row => row.reservationId === child.runId)).toHaveLength(3);
        expect(task.compute.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: 3 }) })]);
        expect(task.attempts.filter(row => row.kind === 'generation')).toHaveLength(3);
        expect(task.attempts.flatMap(row => row.calls.map(call => call.name))).toEqual(['atri_agent_set_plan', 'atri_agent_project_save', 'atri_agent_prepare_review']);
        expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.original.project.displayName);
    } finally { await f.cleanup(); }
}, 180000);

test('Project child Planner cannot add an Agent with an undeclared model dependency or spend a replacement child allocation', async () => {
    const f = await fixture(makeTempSqliteEngineHarness, { childPlanner: true, childDynamic: true, badChildPin: true });
    try {
        await expect(f.run()).rejects.toThrow(); const { parent, child } = await roots(f);
        expect(f.requests).toHaveLength(2); expect(child.status).toBe('blocked'); expect(child.graphRevision).toBe(0);
        expect(child.graph.nodes).not.toContainEqual(f.childAdded); expect(child.resultRefs).toEqual([]); expect(child.outputClaims).toEqual([]); expect(parent.outputClaims).toEqual([]);
        const patches = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle, runId: child.runId, recordType: 'patch' }));
        expect(patches).toHaveLength(1); expect(patches[0].doc.accepted).toBe(false);
        const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
        expect(task.compute.attempts).toHaveLength(2); expect(task.compute.attempts.every(row => row.status === 'settled')).toBe(true); expect(task.attempts.every(row => !row.calls.length)).toBe(true);
        expect(task.compute.limits.maxRequests).toBe(8);
        expect(task.compute.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: 3 }) })]);
        expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.original.project.displayName);
    } finally { await f.cleanup(); }
}, 90000);


for (const childLoop of ['self', 'nonself']) test('SQLite Project child published Planner ' + childLoop + ' return keeps its old paid history and original Task Review', async () => {
    const f = await fixture(makeTempSqliteEngineHarness, { childPlanner: true, childLoop, parentLoopIterations: 3 });
    const expectedChild = childLoop === 'self' ? 3 : 5, expectedTotal = expectedChild + 5;
    try {
        await f.run(); const { parent, child } = await roots(f);
        expect(parent.status).toBe('completed'); expect(child.status).toBe('completed'); expect(child.graphRevision).toBe(2);
        expect(parent.limits.maxLoopIterations).toBe(3); expect(parent.progress.loopIterations).toBe(2); expect(parent.treeProgress.loopIterations).toBe(3);
        expect(child.progress).toMatchObject({ attempts: expectedChild + 1, patches: 2, replans: 1, loopIterations: 1, delegates: 0, handoffs: 0 });
        expect(child.progress.edgeVisitCounts[f.childLoopEdge.edgeId]).toBe(1); expect(child.outputClaims).toHaveLength(1); expect(parent.outputClaims).toHaveLength(1);
        expect(f.requests).toHaveLength(expectedTotal); expect(f.requests.slice(1, expectedChild + 1).every(body => body.model === 'project-delegated-distinct-model' && !body.tools?.length)).toBe(true);
        const plannerIndices = childLoop === 'self' ? [1, 2] : [2, 4], terminalIndex = expectedChild;
        expect(JSON.stringify(f.requests[plannerIndices[0]])).toContain(f.childLoopEdge.edgeId);
        expect(JSON.stringify(f.requests[plannerIndices[1]])).toContain(childLoop === 'self' ? 'requestReplan' : 'ACTUAL_PROJECT_CHILD_ADVICE_3');
        expect(JSON.stringify(f.requests[plannerIndices[1]])).not.toContain('ACTUAL_PROJECT_CHILD_ADVICE_1');
        expect(JSON.stringify(f.requests[terminalIndex])).toContain('requestFinalize'); expect(JSON.stringify(f.requests[terminalIndex])).not.toContain('requestReplan');
        expect(JSON.stringify(f.requests[expectedChild + 1])).toContain('ACTUAL_PROJECT_CHILD_ADVICE_' + terminalIndex);
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            const local = await readTaskLocalOutput(tx, f.h.handle, child), history = local.publication.graphHistory;
            expect(history.controls).toHaveLength(2); expect(history.controls.map(fact => fact.producer.attemptNumber)).toEqual([1, 2]);
            expect(history.effects).toHaveLength(expectedChild); expect(history.loopIterations).toBe(1); expect(history.settled).toBe(true);
            expect(history.controls.map(fact => fact.patch.requests)).toEqual([{ finalize: false, replan: true }, { finalize: true, replan: false }]);
            expect((await readProjectReviewOutput(tx, f.h.handle, parent)).receipt.costs.closed).toBe(true);
            const second = childLoop === 'self' ? history.controls[1].producer : history.results.find(fact => fact.producer.nodeId === f.childLoopEdge.to.nodeId && fact.producer.attemptNumber === 2).producer;
            const loopBinding = second.inputRefs[0].graphBindings.find(binding => binding.edgeId === f.childLoopEdge.edgeId);
            const admissionId = 'oreceipt_' + hash({ kind: 'edge_admission', runId: child.runId, edgeId: loopBinding.edgeId,
                producerAttemptId: loopBinding.producerAttemptId, nodeAttemptId: second.attemptId }).slice(0, 32);
            const key = controlRecordKey(f.h.handle, child.runId, 'receipt', admissionId), stored = await tx.getResource(key), doc = { ...stored.doc, edgeVisit: 0 };
            try { await tx.putResource(key, { ...stored, doc, integrity: hash(doc) }); await expect(readTaskLocalOutput(tx, f.h.handle, child)).rejects.toThrow(); }
            finally { await tx.putResource(key, stored); }
            expect((await readTaskLocalOutput(tx, f.h.handle, child)).publication.graphHistory.settled).toBe(true);
        });
        const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
        expect(task.status).toBe('review'); expect(task.compute.limits.maxRequests).toBe(expectedTotal); expect(task.compute.attempts).toHaveLength(expectedTotal);
        expect(task.compute.attempts.every(row => row.status === 'settled')).toBe(true); expect(task.compute.attempts.filter(row => row.reservationId === child.runId)).toHaveLength(expectedChild);
        expect(task.compute.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: expectedChild }) })]);
        expect(task.attempts.flatMap(row => row.calls.map(call => call.name))).toEqual(['atri_agent_set_plan', 'atri_agent_project_save', 'atri_agent_prepare_review']);
        expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.original.project.displayName);
    } finally { await f.cleanup(); }
}, 180000);

test('Project child published Planner return cannot reset its held allocation to fund another paid round', async () => {
    const f = await fixture(makeTempSqliteEngineHarness, { childPlanner: true, childLoop: 'self', childRequests: 2 });
    try {
        await expect(f.run()).rejects.toThrow(); const { parent, child } = await roots(f);
        expect(f.requests).toHaveLength(2); expect(child.status).toBe('blocked'); expect(parent.status).toBe('blocked'); expect(child.graphRevision).toBe(0);
        expect(child.progress.replans).toBe(0); expect(child.progress.loopIterations).toBe(0); expect(child.resultRefs).toEqual([]); expect(child.outputClaims).toEqual([]); expect(parent.outputClaims).toEqual([]);
        const patches = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle, runId: child.runId, recordType: 'patch' }));
        expect(patches.map(row => row.doc)).toEqual([expect.objectContaining({ accepted: false, appliedOperations: [], issues: [{ code: 'native_orchestration_graph_budget_unavailable' }] })]);
        const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
        expect(task.compute.attempts).toHaveLength(2); expect(task.compute.attempts.every(row => row.status === 'settled')).toBe(true); expect(task.attempts.every(row => !row.calls.length)).toBe(true);
        expect(task.compute.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: 2 }) })]);
        expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.original.project.displayName);
    } finally { await f.cleanup(); }
}, 90000);


test('Project child return retains the original aggregate two-loop ceiling before the final formal send', async () => {
    const f = await fixture(makeTempSqliteEngineHarness, { childPlanner: true, childLoop: 'self', parentLoopIterations: 2 });
    try {
        await expect(f.run()).rejects.toMatchObject({ code: 'native_orchestration_tree_limit_exhausted' });
        const { parent, child } = await roots(f);
        expect(f.requests).toHaveLength(7); expect(parent.status).toBe('blocked'); expect(parent.outputClaims).toEqual([]); expect(parent.pendingEffectRefs).toEqual([]);
        expect(parent.limits.maxLoopIterations).toBe(2); expect(parent.progress.loopIterations).toBe(1); expect(parent.treeProgress.loopIterations).toBe(2);
        expect(child.status).toBe('completed'); expect(child.progress.loopIterations).toBe(1); expect(child.outputClaims).toHaveLength(1);
        const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
        expect(task.status).toBe('working'); expect(task.compute.limits.maxRequests).toBe(8); expect(task.compute.attempts).toHaveLength(7);
        expect(task.compute.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(task.compute.attempts.filter(row => row.reservationId === child.runId)).toHaveLength(3);
        expect(task.compute.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: 3 }) })]);
        expect(task.attempts.flatMap(row => row.calls.map(call => call.name))).toEqual(['atri_agent_set_plan', 'atri_agent_project_save']);
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            expect((await readTaskLocalOutput(tx, f.h.handle, child)).publication.graphHistory.settled).toBe(true);
            expect(await readProjectReviewOutput(tx, f.h.handle, parent)).toBeNull();
        });
        expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.original.project.displayName);
        expect(f.requests).toHaveLength(7);
    } finally { await f.cleanup(); }
}, 180000);


test('SQLite Project child pure Review redoes the actual typed target and closes all old fees before the original three tools and human Review', async () => {
    const f = await fixture(makeTempSqliteEngineHarness, { childQuality: 'review' });
    try {
        await f.run(); const { parent, child } = await roots(f);
        expect(f.requests).toHaveLength(10); expect(parent.status).toBe('completed'); expect(child.status).toBe('completed'); expect(child.graphRevision).toBe(0);
        expect(child.progress).toMatchObject({ attempts: 6, reviews: 2, loopIterations: 0, edgeVisits: 5 }); expect(child.outputClaims).toHaveLength(1);
        expect(JSON.stringify(f.requests[2])).toContain('reviewTargets'); expect(JSON.stringify(f.requests[3])).toContain('incomplete_proposal');
        expect(JSON.stringify(f.requests[4])).toContain('PROJECT_CHILD_QUALITY_DRAFT_2'); expect(JSON.stringify(f.requests[4])).not.toContain('PROJECT_CHILD_QUALITY_DRAFT_1');
        expect(JSON.stringify(f.requests[5])).toContain('PROJECT_CHILD_QUALITY_DRAFT_2'); expect(JSON.stringify(f.requests[5])).not.toContain('PROJECT_CHILD_QUALITY_DRAFT_1');
        expect(f.requests.slice(1, 6).every(body => body.model === 'project-delegated-distinct-model' && !body.tools?.length)).toBe(true);
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            const local = await readTaskLocalOutput(tx, f.h.handle, child), history = local.publication.graphHistory;
            const reviews = history.controls.filter(fact => fact.review); expect(reviews.map(fact => fact.review.decision)).toEqual(['rerun', 'approve']);
            expect(reviews).toHaveLength(2); expect(history.effects).toHaveLength(5); expect(history.results).toHaveLength(2); expect(history.settled).toBe(true);
            const [old, current] = history.results; expect(old.producer.nodeId).toBe(f.childDraft.nodeId); expect(current.producer.nodeId).toBe(f.childDraft.nodeId);
            expect(current.producer.attemptNumber).toBe(old.producer.attemptNumber + 1); expect(reviews[0].review.targetAttemptIds).toEqual([old.producer.attemptId]);
            expect(reviews[0].review.replacements).toEqual([{ targetAttemptId: old.producer.attemptId, attemptId: current.producer.attemptId }]);
            expect(await readAttemptInvalidation(tx, f.h.handle, child, old.producer)).toMatchObject({ reviewReceiptId: reviews[0].review.receiptId });
            await expect(assertAttemptConsumable(tx, f.h.handle, child, old.producer)).rejects.toThrow();
            expect((await readProjectReviewOutput(tx, f.h.handle, parent)).receipt.costs.closed).toBe(true);
            const key = controlRecordKey(f.h.handle, child.runId, 'attempt', current.producer.attemptId), saved = await tx.getResource(key), changed = structuredClone(saved.doc);
            delete changed.inputRefs[0].reviewFeedbackRef; changed.inputDigest = hash(changed.inputRefs);
            try { await tx.putResource(key, { ...saved, doc: changed, integrity: hash(changed) }); await expect(readTaskLocalOutput(tx, f.h.handle, child)).rejects.toThrow(); }
            finally { await tx.putResource(key, saved); }
            expect((await readTaskLocalOutput(tx, f.h.handle, child)).receipt).toEqual(local.receipt);
        });
        const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
        expect(task.status).toBe('review'); expect(task.compute.limits.maxRequests).toBe(10); expect(task.compute.attempts).toHaveLength(10);
        expect(task.compute.attempts.every(row => row.status === 'settled')).toBe(true); expect(task.compute.attempts.filter(row => row.reservationId === child.runId)).toHaveLength(5);
        expect(task.compute.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: 5 }) })]);
        expect(task.attempts.flatMap(row => row.calls.map(call => call.name))).toEqual(['atri_agent_set_plan', 'atri_agent_project_save', 'atri_agent_prepare_review']);
        expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.original.project.displayName);
    } finally { await f.cleanup(); }
}, 180000);

for (const limit of ['round', 'bank']) test('Project child Review cannot redo beyond its original ' + limit + ' bound or erase the paid draft', async () => {
    const f = await fixture(makeTempSqliteEngineHarness, { childQuality: 'review', childMaxRounds: limit === 'round' ? 1 : 2, childRequests: limit === 'bank' ? 4 : 5 });
    try {
        await expect(f.run()).rejects.toThrow(); const { parent, child } = await roots(f);
        expect(f.requests).toHaveLength(3); expect(child.graphRevision).toBe(0); expect(child.resultRefs).toHaveLength(1); expect(child.outputClaims).toEqual([]); expect(parent.outputClaims).toEqual([]);
        expect(child.progress.reviews).toBe(1); expect(child.status).toBe('blocked');
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            const rows = await tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle, runId: child.runId, recordType: 'attempt' });
            expect(rows.map(row => row.doc).filter(attempt => attempt.nodeId === f.childDraft.nodeId)).toHaveLength(1);
            expect(await readAttemptInvalidation(tx, f.h.handle, child, rows.find(row => row.doc.nodeId === f.childDraft.nodeId).doc)).toBeNull();
            const receipts = await tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle, runId: child.runId, recordType: 'receipt' });
            expect(receipts.filter(row => row.doc.receiptKind === 'native_project_failure').map(row => row.doc.reasonCode)).toEqual([limit === 'round'
                ? 'native_orchestration_review_limit_exhausted' : 'native_orchestration_review_rerun_budget_unavailable']);
        });
        const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId); expect(task.compute.attempts).toHaveLength(3);
        expect(task.compute.attempts.every(row => row.status === 'settled')).toBe(true); expect(task.attempts.every(row => !row.calls.length)).toBe(true);
        expect(task.compute.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: limit === 'bank' ? 4 : 5 }) })]);
        expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.original.project.displayName);
    } finally { await f.cleanup(); }
}, 90000);

test('SQLite Project child Judge passes only its explicit typed selected candidate to the fixed terminal and original human Review', async () => {
    const f = await fixture(makeTempSqliteEngineHarness, { childQuality: 'judge' });
    try {
        await f.run(); const { parent, child } = await roots(f); expect(f.requests).toHaveLength(9); expect(child.status).toBe('completed');
        expect(JSON.stringify(f.requests[3])).toContain('candidateRefs'); expect(JSON.stringify(f.requests[4])).toContain('selectedResultRef');
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            const history = (await readTaskLocalOutput(tx, f.h.handle, child)).publication.graphHistory;
            const [judge] = history.controls; expect(judge.candidates).toHaveLength(2); expect(judge.selectedResultRef).toEqual(judge.candidates[0].receipt.resultRef);
            const selected = judge.candidates.find(fact => hash(fact.receipt.resultRef) === hash(judge.selectedResultRef));
            const excluded = judge.candidates.find(fact => fact !== selected);
            expect(JSON.stringify(f.requests[4])).toContain(selected.record.payload); expect(JSON.stringify(f.requests[4])).not.toContain(excluded.record.payload);
            expect(history.effects).toHaveLength(4); expect(history.settled).toBe(true); expect((await readProjectReviewOutput(tx, f.h.handle, parent)).receipt.costs.closed).toBe(true);
        });
        const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId); expect(task.status).toBe('review'); expect(task.compute.attempts).toHaveLength(9);
        expect(task.compute.attempts.every(row => row.status === 'settled')).toBe(true); expect(task.compute.attempts.filter(row => row.reservationId === child.runId)).toHaveLength(4);
        expect(task.compute.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: 4 }) })]);
        expect(task.attempts.flatMap(row => row.calls.map(call => call.name))).toEqual(['atri_agent_set_plan', 'atri_agent_project_save', 'atri_agent_prepare_review']);
    } finally { await f.cleanup(); }
}, 180000);


test('SQLite Project child Fanout runs two independently owned Models concurrently and joins their original receipts before TaskLocal and formal human Review', async () => {
    const f = await fixture(makeTempSqliteEngineHarness, { childFanout: true });
    try {
        await f.run(); const { parent, child } = await roots(f);
        expect(f.requests).toHaveLength(8); expect(parent.status).toBe('completed'); expect(child.status).toBe('completed'); expect(child.graphRevision).toBe(0);
        expect(child.progress).toMatchObject({ attempts: 6, delegates: 0, handoffs: 0, edgeVisits: 6, loopIterations: 0 }); expect(child.outputClaims).toHaveLength(1);
        expect(f.requests.slice(1, 3).map(body => body.model).sort()).toEqual(['project-delegated-distinct-model', 'project-child-fanout-distinct-B'].sort());
        expect(f.requests.slice(1, 4).every(body => !body.tools?.length)).toBe(true);
        expect(JSON.stringify(f.requests[3])).toContain('CHILD_CONCURRENT_ADVICE_A'); expect(JSON.stringify(f.requests[3])).toContain('CHILD_CONCURRENT_ADVICE_B');
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            const local = await readTaskLocalOutput(tx, f.h.handle, child), history = local.publication.graphHistory;
            expect(history.fanouts).toHaveLength(1); const [joined] = history.fanouts;
            expect(joined.joinReceipt.outcome).toBe('completed'); expect(joined.joinReceipt.acceptedResultRefs).toHaveLength(2); expect(joined.frame.maxConcurrency).toBe(2);
            expect(joined.frame.branches).toHaveLength(2); expect(joined.scopeAttempts).toHaveLength(2); expect(joined.providerEffects).toHaveLength(2);
            expect(history.effects).toHaveLength(3); expect(history.settled).toBe(true); expect((await readProjectReviewOutput(tx, f.h.handle, parent)).receipt.costs.closed).toBe(true);
            const key = controlRecordKey(f.h.handle, child.runId, 'join', joined.joinReceipt.joinId), saved = await tx.getResource(key), changed = { ...saved.doc, acceptedResultRefs: [] };
            try { await tx.putResource(key, { ...saved, doc: changed, integrity: hash(changed) }); await expect(readTaskLocalOutput(tx, f.h.handle, child)).rejects.toThrow(); }
            finally { await tx.putResource(key, saved); }
            expect((await readTaskLocalOutput(tx, f.h.handle, child)).receipt).toEqual(local.receipt);
        });
        const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
        expect(task.status).toBe('review'); expect(task.compute.limits.maxRequests).toBe(8); expect(task.compute.attempts).toHaveLength(8);
        expect(task.compute.attempts.every(row => row.status === 'settled')).toBe(true); expect(task.compute.attempts.filter(row => row.reservationId === child.runId)).toHaveLength(3);
        expect(task.compute.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: 3 }) })]);
        expect(task.attempts.flatMap(row => row.calls.map(call => call.name))).toEqual(['atri_agent_set_plan', 'atri_agent_project_save', 'atri_agent_prepare_review']);
        expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.original.project.displayName);
    } finally { await f.cleanup(); }
}, 180000);

test('Project child Fanout cannot split a replacement bank or send its members when the original held allocation cannot fund the terminal', async () => {
    const f = await fixture(makeTempSqliteEngineHarness, { childFanout: true, childRequests: 2 });
    try {
        await expect(f.run()).rejects.toThrow(); const { parent, child } = await roots(f);
        expect(f.requests).toHaveLength(1); expect(child.status).toBe('blocked'); expect(child.resultRefs).toEqual([]); expect(child.outputClaims).toEqual([]); expect(parent.outputClaims).toEqual([]);
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            const rows = await tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle, runId: child.runId, recordType: 'receipt' });
            expect(rows.some(row => row.doc.receiptKind === 'fanout_frame')).toBe(false);
            expect(rows.filter(row => row.doc.receiptKind === 'native_project_failure').map(row => row.doc.reasonCode)).toEqual(['native_orchestration_graph_budget_unavailable']);
        });
        const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
        expect(task.compute.attempts).toHaveLength(1); expect(task.compute.attempts[0].status).toBe('settled'); expect(task.attempts.every(row => !row.calls.length)).toBe(true);
        expect(task.compute.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: 2 }) })]);
        expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.original.project.displayName);
    } finally { await f.cleanup(); }
}, 90000);

// Actual paid nested-capture boundaries; no new Source, bank or retry fixture.
async function assertPaidChildFanoutStopped(f, { unknown = false, checkpoint = null } = {}) {
    const { parent, child } = await roots(f), task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
    expect(f.requests).toHaveLength(3); expect(f.requests.slice(1).map(body => body.model).sort())
        .toEqual(['project-delegated-distinct-model', 'project-child-fanout-distinct-B'].sort());
    expect(parent.status).not.toBe('completed'); expect(child.status).not.toBe('completed'); expect(parent.outputClaims).toEqual([]); expect(child.outputClaims).toEqual([]);
    if (unknown) expect(child.status).toBe('reconciling');
    expect(task.compute.limits.maxRequests).toBe(8); expect(task.compute.attempts).toHaveLength(3); expect(task.compute.attempts[0].status).toBe('settled');
    expect(new Set(task.compute.attempts.map(row => row.attemptId)).size).toBe(3);
    expect(task.compute.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: unknown ? 'held' : 'released', limits: expect.objectContaining({ maxRequests: 3 }) })]);
    expect(task.attempts.every(row => !row.calls.length)).toBe(true); expect(task.changeSets).toEqual([]);
    if (checkpoint) {
        expect(child.runId).toBe(checkpoint.childRunId); expect(child.sourceBinding).toEqual(checkpoint.sourceBinding);
        expect(task.compute.attempts.filter(row => row.reservationId === child.runId).map(row => row.attemptId).sort()).toEqual(checkpoint.feeIds);
        expect(parent.pendingEffectRefs).toEqual([]); expect(child.pendingEffectRefs).toEqual([]);
        expect(task.compute.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(task.compute.attempts.map(row => row.attemptId).sort()).toEqual(checkpoint.modelAttempts.map(row => row.attemptId).sort());
        for (const before of checkpoint.modelAttempts) {
            // The original charge identity survives its legitimate usage/status settlement.
            const identity = row => Object.fromEntries(Object.entries(row).filter(([key]) => !['status', 'usage'].includes(key)));
            expect(identity(task.compute.attempts.find(row => row.attemptId === before.attemptId))).toEqual(identity(before));
        }
        expect(checkpoint.localWork.length).toBeGreaterThan(0);
        expect(task.compute.localWork).toEqual(expect.arrayContaining(checkpoint.localWork));
        expect(task.compute.localWork.every(row => row.status === 'settled')).toBe(true);
        expect(task.compute.reservations[0]).toEqual({ ...checkpoint.reservation, status: 'released' });
        const originalBank = inspectComputeReservation({ compute: task.compute }), allocation = inspectComputeReservation({ compute: task.compute }, child.runId);
        expect(originalBank).toMatchObject({ used: { requests: 3 }, delegated: { requests: 0 }, remaining: { requests: 5 }, overrun: false });
        expect(allocation).toMatchObject({ used: { requests: 2 }, remaining: { requests: 1 }, overrun: false });
    }
    await f.h.engine.withTransaction(f.h.handle, async tx => {
        const attempts = await Promise.all(child.attemptRefs.map(id => readAttempt(tx, f.h.handle, child, id)));
        for (const [index, node] of f.childBranches.entries()) {
            const records = attempts.filter(record => record.doc.nodeId === node.nodeId); expect(records).toHaveLength(1); expect(records[0].doc.effectRefs).toHaveLength(1);
            const effect = (await readEffect(tx, f.h.handle, child, records[0].doc.effectRefs[0])).doc;
            const fees = task.compute.attempts.filter(row => row.orchestration?.effectId === effect.effectId);
            expect(fees).toHaveLength(1); expect(fees[0].reservationId).toBe(child.runId); expect(fees[0].status).toBe(unknown && index === 1 ? 'unknown' : 'settled');
            expect(effect.sourceBindingDigest).toBe(child.sourceBinding.bindingDigest);
            if (unknown && index === 1) expect(records[0].doc.resultRefs).toEqual([]);
        }
        if (checkpoint) {
            const failures = (await tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle, runId: child.runId, recordType: 'receipt' }))
                .map(row => row.doc).filter(row => row.receiptKind === 'native_project_failure');
            expect(failures).toHaveLength(1); const [failure] = failures;
            const branchEffectIds = attempts.filter(record => f.childBranches.some(node => node.nodeId === record.doc.nodeId)).flatMap(record => record.doc.effectRefs).sort();
            expect(failure.effectIds.toSorted()).toEqual(branchEffectIds); expect(branchEffectIds).toHaveLength(2);
            expect(failure.status).toBe('blocked'); expect(child.status).toBe('blocked'); expect(failure.costs.closed).toBe(true);
            const costs = await f.authority.execution.budgetPort.observeEffectClosure(f.h.handle,
                { authorityRef: child.budgetAuthorityRef, effectIds: failure.effectIds }, { tx });
            expect(failure.costs).toEqual(costs);
            expect(costs.budgetAttemptRefs.filter(ref => ref.kind !== 'local_work').map(ref => ref.attemptId).sort()).toEqual(checkpoint.feeIds);
            expect(costs.budgetAttemptRefs.every(ref => ref.reservationId === child.runId)).toBe(true);
        }
        expect(await readTaskLocalOutput(tx, f.h.handle, child)).toBeNull(); expect(await readProjectReviewOutput(tx, f.h.handle, parent)).toBeNull();
    });
    expect(f.requests).toHaveLength(3); return { parent, child, task };
}

test('SQLite Project child Fanout retains both paid branch fees when the original human Project Source is replaced before either response', async () => {
    const f = await fixture(makeTempSqliteEngineHarness, { childFanout: true });
    let releaseSourceWrite; const sourceWritten = new Promise(resolve => { releaseSourceWrite = resolve; });
    let sent = 0, checkpoint = null;
    try {
        f.onResponse(async ({ body }) => {
            if (!['project-delegated-distinct-model', 'project-child-fanout-distinct-B'].includes(body.model)) return;
            if (++sent === 2) {
                try {
                    const { child } = await roots(f), task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
                    checkpoint = { sourceBinding: structuredClone(child.sourceBinding), childRunId: child.runId,
                        feeIds: task.compute.attempts.filter(row => row.reservationId === child.runId).map(row => row.attemptId).sort(),
                        modelAttempts: structuredClone(task.compute.attempts), localWork: structuredClone(task.compute.localWork ?? []),
                        reservation: structuredClone(task.compute.reservations.find(row => row.reservationId === child.runId)) };
                    await f.writeProject();
                } finally { releaseSourceWrite(); }
            }
            await sourceWritten;
        });
        await expect(f.run()).rejects.toThrow(); expect(sent).toBe(2); expect(checkpoint).toBeTruthy(); expect(checkpoint.feeIds).toHaveLength(2);
        const { child } = await assertPaidChildFanoutStopped(f, { checkpoint }), project = await f.studio.observeProject(f.h.handle, f.projectId);
        expect(project.source.project.displayName).toBe('Independent original Project edit'); expect(project.revision.revision).not.toBe(child.sourceBinding.sourceRef.revision);
    } finally { releaseSourceWrite(); await f.cleanup(); }
}, 120000);

test('SQLite Project child Fanout keeps a paid usage_unknown member and its original held bank without TaskLocal, formal tools or replay', async () => {
    const f = await fixture(makeTempSqliteEngineHarness, { childFanout: true, childFanoutUsageUnknown: true });
    try {
        await expect(f.run()).rejects.toThrow(); await assertPaidChildFanoutStopped(f, { unknown: true });
        expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.original.project.displayName);
    } finally { await f.cleanup(); }
}, 120000);

test('SQLite Project child frozen scope Planner controls its reserved Agent before original Join TaskLocal and formal human Review', async () => {
    const f = await fixture(makeTempSqliteEngineHarness, { childFanout: true, childFanoutPlanner: true });
    try {
        await f.run(); const { parent, child } = await roots(f);
        expect(f.requests).toHaveLength(9); expect(parent.status).toBe('completed'); expect(child.status).toBe('completed'); expect(child.graphRevision).toBe(1);
        expect(child.progress).toMatchObject({ attempts: 7, patches: 1, delegates: 0, handoffs: 0, edgeVisits: 7, loopIterations: 0 }); expect(child.outputClaims).toHaveLength(1);
        expect(f.requests.slice(1, 3).map(body => body.model).sort()).toEqual(['project-delegated-distinct-model', 'project-child-fanout-distinct-B'].sort());
        expect(f.requests.slice(1, 5).every(body => !body.tools?.length)).toBe(true);
        expect(JSON.stringify(f.requests[3])).toContain('setPendingPriority'); expect(child.nodeControl[f.childBranches[0].nodeId].priority).toBe(7);
        expect(JSON.stringify(f.requests[4])).toContain('CHILD_CONCURRENT_ADVICE_A'); expect(JSON.stringify(f.requests[4])).toContain('CHILD_CONCURRENT_ADVICE_B');
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            const local = await readTaskLocalOutput(tx, f.h.handle, child), history = local.publication.graphHistory;
            expect(history.fanouts).toHaveLength(1); const [joined] = history.fanouts;
            expect(joined.joinReceipt.outcome).toBe('completed'); expect(joined.joinReceipt.acceptedResultRefs).toHaveLength(2); expect(joined.frame.maxConcurrency).toBe(2);
            expect(joined.frame.branches).toHaveLength(2); expect(joined.scopeAttempts).toHaveLength(3); expect(joined.providerEffects).toHaveLength(3);
            expect(history.effects).toHaveLength(4); expect(history.settled).toBe(true); expect((await readProjectReviewOutput(tx, f.h.handle, parent)).receipt.costs.closed).toBe(true);
            expect(joined.frame.graphRevision).toBe(0);
            const planners = history.controls.filter(fact => fact.controlRef.kind === 'graph_planner_control'); expect(planners).toHaveLength(1);
            expect(planners[0].patch.appliedOperations).toEqual([{ op: 'setPendingPriority', nodeId: f.childBranches[0].nodeId, priority: 7 }]);
            const reserved = joined.scopeAttempts.find(item => item.attempt.nodeId === f.childBranches[0].nodeId).attempt;
            expect(reserved.reservationRef.producerAttemptId).toBe(joined.frame.fanoutAttemptId); expect(reserved.graphRevision).toBe(1);
            const key = controlRecordKey(f.h.handle, child.runId, 'join', joined.joinReceipt.joinId), saved = await tx.getResource(key), changed = { ...saved.doc, acceptedResultRefs: [] };
            try { await tx.putResource(key, { ...saved, doc: changed, integrity: hash(changed) }); await expect(readTaskLocalOutput(tx, f.h.handle, child)).rejects.toThrow(); }
            finally { await tx.putResource(key, saved); }
            expect((await readTaskLocalOutput(tx, f.h.handle, child)).receipt).toEqual(local.receipt);
        });
        const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
        expect(task.status).toBe('review'); expect(task.compute.limits.maxRequests).toBe(9); expect(task.compute.attempts).toHaveLength(9);
        expect(task.compute.attempts.every(row => row.status === 'settled')).toBe(true); expect(task.compute.attempts.filter(row => row.reservationId === child.runId)).toHaveLength(4);
        expect(task.compute.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: 4 }) })]);
        expect(task.attempts.flatMap(row => row.calls.map(call => call.name))).toEqual(['atri_agent_set_plan', 'atri_agent_project_save', 'atri_agent_prepare_review']);
        expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.original.project.displayName);
    } finally { await f.cleanup(); }
}, 180000);

test('Project child scope Planner cannot increase the original held three-request allocation before any scope send', async () => {
    const f = await fixture(makeTempSqliteEngineHarness, { childFanout: true, childFanoutPlanner: true, childRequests: 3 });
    try {
        await expect(f.run()).rejects.toMatchObject({ code: 'operation_child_failed',
            cause: { code: 'native_orchestration_graph_budget_unavailable' } }); expect(f.requests).toHaveLength(1);
        const { parent, child } = await roots(f), task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
        expect(parent.outputClaims).toEqual([]); expect(child.outputClaims).toEqual([]);
        expect(task.compute.limits.maxRequests).toBe(9); expect(task.compute.attempts).toHaveLength(1);
        expect(task.compute.attempts[0].status).toBe('settled'); expect(task.compute.attempts[0].reservationId ?? null).toBeNull();
        expect(task.compute.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: 3 }) })]);
        expect(task.attempts.flatMap(row => row.calls)).toEqual([]);
        expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.original.project.displayName);
        f.h.engine.closeHandle(f.h.handle); f.recreateExecutor();
        expect(() => f.h.engine.nativeHostLifecycle.assertActive()).not.toThrow();
        expect((await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId)).compute).toEqual(task.compute);
        await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
        expect((await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId)).compute).toEqual(task.compute);
    } finally { await f.cleanup(); }
}, 90000);
