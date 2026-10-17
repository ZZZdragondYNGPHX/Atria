import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';
import { readAudienceSource } from '../../../src/native/orchestration/audience-source-contracts.js';
import { modelPortFixture } from './model-port-fixture.js';
import { configureSessionOutput } from './session-output-fixture.js';

const id = () => createNativeId('orchestrationNode');
const port = (name, type, required = true) => ({ name, type, required });
const edge = (from, to, input) => ({ edgeId: createNativeId('orchestrationEdge'), from: { nodeId: from.nodeId, port: from.outputs[0].name },
    to: { nodeId: to.nodeId, port: input }, condition: 'always', maxVisits: to.kind === 'review' ? to.policy.maxRounds : 1, loopBack: false });

export async function sessionFanoutFixture(make, { groups = 1, review = false, strategy = 'all-success', maxConcurrency = 2, usage = true, maxRequests = null, failurePolicy = 'continue', rejectFirst = false, unknownFirst = false, branchLengths = [1, 1], diamondSecond = false, distinctBranchModels = false, joinDeadlineMs = 120000, planner = false, plannerAudience = 2, dynamicAudience = 2, secondPlanner = false, reviewRerunOnce = false, plannerPatch = operations => operations } = {}) {
    let topology, operations, reviewCalls = 0, draftCalls = 0;
    const f = await modelPortFixture(make, { usage, responseStatus: unknownFirst || rejectFirst ? index => index === 1 ? unknownFirst ? null : 503 : 200 : null, configurePlan: async args => {
        configureSessionOutput(args);
        const { plan, h, core, base } = args, narrator = plan.definition.nodes[0], output = plan.definition.nodes[1];
        const route = await args.seeded.persistence.getRuntimeRoute(h.handle, plan.dependencyPins[0].resourceRef.runtimeRouteId);
        await args.seeded.persistence.saveRuntimeRoute(h.handle, { ...route, executionPolicy: { ...route.executionPolicy, computeBudget: {
            ...route.executionPolicy.computeBudget, maxRequests: maxRequests ?? groups * (branchLengths[0] + (diamondSecond ? 4 : branchLengths[1])) + (review ? 6 : 1) + (planner ? 2 : 0) + (secondPlanner ? 1 : 0),
            localWork: { ...route.executionPolicy.computeBudget.localWork, maxJobs: 192, maxItems: 10000 } } } });
        plan.dependencyPins[0].integrity = hash(await args.seeded.persistence.getRuntimeRoute(h.handle, route.runtimeRouteId));
        if (distinctBranchModels) {
            const model = { ...args.seeded.model, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'session-fanout-secondary-model' };
            await args.seeded.persistence.saveModelProfile(h.handle, model);
            const original = await args.seeded.persistence.getRuntimeRoute(h.handle, route.runtimeRouteId);
            const secondary = { ...original, runtimeRouteId: createNativeId('runtimeRoute'), modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId },
                executionPolicy: { ...original.executionPolicy, allowedModelProfileIds: [model.modelProfileId] } };
            await args.seeded.persistence.saveRuntimeRoute(h.handle, secondary);
            plan.dependencyPins.push({ pinId: 'fanout.secondary.route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: secondary.runtimeRouteId }, integrity: hash(secondary) });
        }
        const audiences = [...base.manifest.actors.map(actor => ({ kind: 'actor', id: actor.actorId })), { kind: 'narrator' }];
        for (const [index, audience] of audiences.entries()) {
            const ref = { kind: 'native_information_context', anchor: 'run_source', sessionId: base.session.sessionId, audience };
            const source = await readAudienceSource(h.handle, ref, core);
            plan.dependencyPins.push({ pinId: 'session.audience.' + index, port: 'context', resourceRef: ref, integrity: hash(source.descriptor) });
        }
        const agent = (label, audience, inputs) => ({ nodeId: id(), kind: 'agent', label, inputs, outputs: [port('advice', 'text', false)],
            dependencyPinIds: [distinctBranchModels && audience === 1 ? 'fanout.secondary.route' : 'narrator.route', 'session.audience.' + audience], capabilities: ['generation.send'],
            policy: { agentPinId: distinctBranchModels && audience === 1 ? 'fanout.secondary.route' : 'narrator.route', audiencePinId: 'session.audience.' + audience } });
        narrator.dependencyPinIds.push('session.audience.2'); narrator.policy.audiencePinId = 'session.audience.2';
        const nodes = [], edges = [], specs = [];
        for (let group = 0; group < groups; group++) {
            const fanout = { nodeId: id(), kind: 'fanout', label: 'Original Game fanout ' + group, inputs: [], outputs: [port('task', 'task.result', false)],
                dependencyPinIds: [], capabilities: [], policy: { maxConcurrency, failurePolicy } };
            const branches = [0, 1].map(index => agent('Game branch ' + group + ':' + index, index, [port('task', 'task.result')]));
            const scopes = branches.map((entry, index) => {
                const scope = [entry];
                if (diamondSecond && index === 1) {
                    const forks = [0, 1].map(fork => agent(entry.label + ' fork ' + fork, index, [port('previous', 'text')]));
                    const merge = agent(entry.label + ' scope merge', index, [port('first', 'text'), port('second', 'text')]);
                    scope.push(...forks, merge); edges.push(...forks.map(node => edge(entry, node, 'previous')),
                        ...forks.map((node, fork) => edge(node, merge, fork ? 'second' : 'first')));
                } else for (let step = 1; step < branchLengths[index]; step++) {
                    const next = agent(entry.label + ' scope step ' + step, index, [port('previous', 'text')]);
                    edges.push(edge(scope.at(-1), next, 'previous')); scope.push(next);
                }
                return scope;
            });
            const join = { nodeId: id(), kind: 'join', label: 'Original Game join ' + group,
                inputs: branches.map((_, index) => port('branch' + index, 'text')), outputs: [port('joined', 'text', false)],
                dependencyPinIds: [], capabilities: [], policy: { strategy, quorum: strategy === 'count-quorum' ? 1 : 2, deadlineMs: joinDeadlineMs } };
            nodes.push(fanout, ...scopes.flat(), join); edges.push(...branches.flatMap((branch, index) => [edge(fanout, branch, 'task'), edge(scopes[index].at(-1), join, 'branch' + index)]));
            specs.push({ fanout, branches, scopes, join });
        }
        let target = narrator;
        if (review) {
            const merge = agent('Game synthesis after original joins', 2, specs.map((_, index) => port('group' + index, 'text')));
            const draft = agent('Game draft after synthesis', 2, [port('synthesis', 'text')]);
            const reviewer = { ...agent('Game quality review after composed controls', 2, [port('draft', 'text')]), kind: 'review', outputs: [port('decision', 'json', false)], policy: { audiencePinId: 'session.audience.2', agentPinId: 'narrator.route', maxRounds: 2 } };
            narrator.inputs = [port('draft', 'text'), port('review', 'json')];
            nodes.push(merge, draft, reviewer); edges.push(edge(merge, draft, 'synthesis'), edge(draft, reviewer, 'draft'), edge(draft, narrator, 'draft'), edge(reviewer, narrator, 'review'));
            target = merge;
        } else narrator.inputs = specs.map((_, index) => port('group' + index, 'text'));
        edges.push(...specs.map((spec, index) => edge(spec.join, target, 'group' + index)), ...plan.definition.edges);
        plan.definition.nodes = [...nodes, narrator, output]; plan.definition.edges = edges; plan.definition.entryNodeIds = specs.map(spec => spec.fanout.nodeId);
        Object.assign(plan.definition.limits, { maxSteps: 240, maxConcurrency: Math.max(maxConcurrency, 2), deadlineMs: 300000,
            maxNodes: plan.definition.nodes.length, maxEdges: plan.definition.edges.length,
            maxAttempts: plan.definition.nodes.length + (review ? 2 : 0),
            maxEdgeVisits: plan.definition.edges.length + (review ? 2 : 0) });
        if (planner) {
            const plannerModel = { ...args.seeded.model, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'session-planner-distinct-model', limits: { ...args.seeded.model.limits, contextTokens: 65536 } };
            await args.seeded.persistence.saveModelProfile(h.handle, plannerModel);
            const originalRoute = await args.seeded.persistence.getRuntimeRoute(h.handle, route.runtimeRouteId);
            const plannerRoute = { ...originalRoute, runtimeRouteId: createNativeId('runtimeRoute'), modelProfileRef: { scope: 'player', modelProfileId: plannerModel.modelProfileId },
                executionPolicy: { ...originalRoute.executionPolicy, allowedModelProfileIds: [plannerModel.modelProfileId] } };
            await args.seeded.persistence.saveRuntimeRoute(h.handle, plannerRoute);
            plan.dependencyPins.push({ pinId: 'planner.route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: plannerRoute.runtimeRouteId }, integrity: hash(plannerRoute) });
            const producer = { ...agent('Game graph Planner before real controls', plannerAudience, []), kind: 'planner', outputs: [port('patch', 'json', false)],
                capabilities: ['generation.send', 'graph.patch'], dependencyPinIds: ['planner.route', 'session.audience.' + plannerAudience],
                policy: { agentPinId: 'planner.route', audiencePinId: 'session.audience.' + plannerAudience } };
            for (const spec of specs) { spec.fanout.inputs = [port('control', 'json')]; plan.definition.edges.push(edge(producer, spec.fanout, 'control')); }
            plan.definition.nodes.unshift(producer); plan.definition.entryNodeIds = [producer.nodeId];
            plan.definition.capabilityCeiling.push('graph.patch');
            plan.definition.graphChangePolicy = { allowedOperations: ['addNode', 'addEdge', 'setPendingPriority'], allowedNodeKinds: ['agent'] };
            const draft = review ? plan.definition.nodes.find(node => node.label === 'Game draft after synthesis') : narrator;
            draft.inputs.push(port('planned', 'text', false));
            const added = agent('Game dynamic advisory after accepted GraphPatch', dynamicAudience, [port('control', 'json')]);
            operations = plannerPatch([{ op: 'addNode', node: added }, { op: 'addEdge', edge: edge(producer, added, 'control') },
                { op: 'addEdge', edge: edge(added, draft, 'planned') }, { op: 'setPendingPriority', nodeId: added.nodeId, priority: 7 }]);
            Object.assign(plan.definition.limits, { maxNodes: plan.definition.nodes.length + 1, maxEdges: plan.definition.edges.length + 2,
                maxAttempts: plan.definition.limits.maxAttempts + 2, maxEdgeVisits: plan.definition.limits.maxEdgeVisits + specs.length + 2, maxPatches: 2 });
            topology = { specs, narrator, target, planner: producer, added, operations, plannerModel };
            if (secondPlanner) {
                const receiver = { ...producer, nodeId: id(), label: 'Game receiver Planner B inventory', inputs: [port('preceding', 'json')],
                    dependencyPinIds: ['planner.route', 'session.audience.1'], policy: { agentPinId: 'planner.route', audiencePinId: 'session.audience.1' } };
                plan.definition.nodes.splice(1, 0, receiver); plan.definition.edges.push(edge(producer, receiver, 'preceding'));
                for (const spec of specs) { spec.fanout.inputs.push(port('second-control', 'json')); plan.definition.edges.push(edge(receiver, spec.fanout, 'second-control')); }
                plan.definition.limits.maxNodes++; plan.definition.limits.maxAttempts++; plan.definition.limits.maxEdges += 1 + specs.length;
                plan.definition.limits.maxEdgeVisits += 1 + specs.length; topology.secondPlanner = receiver;
            }
        } else topology = { specs, narrator, target };
    }, responseBody: async ({ body, index }) => {
        const receiver = Boolean(topology.secondPlanner) && body.input.some(item => { try { return JSON.parse(item.content).nodeId === topology.secondPlanner.nodeId; } catch { return false; } });
        const input = JSON.stringify(body.input), text = receiver ? JSON.stringify({ operations: [{ op: 'setPendingPriority', nodeId: topology.specs[0].branches[1].nodeId, priority: 3 }] })
            : input.includes('Propose structured GraphPatch operations for this declared task') ? JSON.stringify({ operations })
                : input.includes('Return only the JSON decision approve or rerun')
                    ? JSON.stringify(reviewRerunOnce && reviewCalls++ === 0 ? { decision: 'rerun', reasonCode: 'draft_incomplete' } : { decision: 'approve', reasonCode: 'quality_ready' }) : input.includes('Game branch') ? 'GAME_ADVICE_' + index
                        : input.includes('Game dynamic advisory after') ? 'GAME_DYNAMIC_ADVICE' : input.includes('Game synthesis after') ? 'GAME_SYNTHESIS' : input.includes('Game draft after') ? 'GAME_REVIEW_DRAFT' + (reviewRerunOnce ? ++draftCalls : '') : 'The NPC waits for the player choice.';
        return { id: 'game-fanout-' + index, status: 'completed', output: [{ id: 'message-' + index, type: 'message', status: 'completed', role: 'assistant',
            content: [{ type: 'output_text', text, annotations: [] }] }], ...(usage ? { usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } } : {}) };
    } });
    return { ...f, get effectRef() { return f.effectRef; }, get authority() { return f.authority; }, get core() { return f.core; }, topology };
}
