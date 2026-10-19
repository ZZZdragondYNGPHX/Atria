import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';
import { readAudienceSource } from '../../../src/native/orchestration/audience-source-contracts.js';
import { modelPortFixture } from './model-port-fixture.js';
import { configureSessionOutput } from './session-output-fixture.js';

const id = () => createNativeId('orchestrationNode');
const port = (name, type, required = true) => ({ name, type, required });
const edge = (from, to, input) => ({ edgeId: createNativeId('orchestrationEdge'), from: { nodeId: from.nodeId, port: from.outputs[0].name },
    to: { nodeId: to.nodeId, port: input }, condition: 'always', maxVisits: 1, loopBack: false });
export const sessionScopeTask = body => body.input.map(item => {
    try { return JSON.parse(item.content); } catch { return null; }
}).find(item => item?.nodeId);

/** A published frozen scope, actual Model/Graph/Transition/Join consumers and
 * original Session bank. HTTP alone is synthetic. No dynamic scope topology. */
export async function sessionFanoutPlannerFixture(make, { crossBranchPriority = false, maxConcurrency = 2, replan = false } = {}) {
    let topology, plannerRound = 0;
    const f = await modelPortFixture(make, { configurePlan: async args => {
        configureSessionOutput(args);
        const { plan, h, core, base, seeded } = args, narrator = plan.definition.nodes[0], output = plan.definition.nodes[1];
        const route = await seeded.persistence.getRuntimeRoute(h.handle, plan.dependencyPins[0].resourceRef.runtimeRouteId);
        await seeded.persistence.saveRuntimeRoute(h.handle, { ...route, policy: { ...route.policy, timeoutMs: replan ? 60000 : route.policy.timeoutMs }, executionPolicy: { ...route.executionPolicy, computeBudget: {
            ...route.executionPolicy.computeBudget, maxRequests: replan ? 7 : 6,
            localWork: { ...route.executionPolicy.computeBudget.localWork, maxJobs: 192, maxItems: 10000 } } } });
        const ownerRoute = await seeded.persistence.getRuntimeRoute(h.handle, route.runtimeRouteId);
        plan.dependencyPins[0].integrity = hash(ownerRoute);
        const plannerModel = { ...seeded.model, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'game-frozen-scope-planner',
            limits: { ...seeded.model.limits, contextTokens: 65536 } };
        await seeded.persistence.saveModelProfile(h.handle, plannerModel);
        const plannerRoute = { ...ownerRoute, runtimeRouteId: createNativeId('runtimeRoute'),
            modelProfileRef: { scope: 'player', modelProfileId: plannerModel.modelProfileId },
            executionPolicy: { ...ownerRoute.executionPolicy, allowedModelProfileIds: [plannerModel.modelProfileId] } };
        await seeded.persistence.saveRuntimeRoute(h.handle, plannerRoute);
        plan.dependencyPins.push({ pinId: 'scope.planner.route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: plannerRoute.runtimeRouteId }, integrity: hash(plannerRoute) });
        for (const [index, audience] of [...base.manifest.actors.map(actor => ({ kind: 'actor', id: actor.actorId })), { kind: 'narrator' }].entries()) {
            const ref = { kind: 'native_information_context', anchor: 'run_source', sessionId: base.session.sessionId, audience };
            const source = await readAudienceSource(h.handle, ref, core);
            plan.dependencyPins.push({ pinId: 'scope.audience.' + index, port: 'context', resourceRef: ref, integrity: hash(source.descriptor) });
        }
        const agent = (label, audience, inputs) => ({ nodeId: id(), kind: 'agent', label, inputs, outputs: [port('text', 'text', false)],
            dependencyPinIds: ['narrator.route', 'scope.audience.' + audience], capabilities: ['generation.send'],
            policy: { agentPinId: 'narrator.route', audiencePinId: 'scope.audience.' + audience } });
        const planner = { ...agent('Actor A frozen scope Planner', 0, [port('task', 'task.result')]), kind: 'planner',
            outputs: [port('patch', 'json', false)], dependencyPinIds: ['scope.planner.route', 'scope.audience.0'],
            capabilities: ['generation.send', 'graph.patch'], policy: { agentPinId: 'scope.planner.route', audiencePinId: 'scope.audience.0' } };
        const first = agent('Actor A authored first draft', 0, [port('control', 'json')]);
        const preferred = agent('Actor A preferred pending draft', 0, [port('control', 'json')]);
        const merge = agent('Actor A terminal synthesis', 0, [port('first', 'text'), port('preferred', 'text')]);
        const sibling = agent('Actor B separate frozen branch', 1, [port('task', 'task.result')]);
        const fanout = { nodeId: id(), kind: 'fanout', label: 'Original frozen Game scopes', inputs: [], outputs: [port('task', 'task.result', false)],
            dependencyPinIds: [], capabilities: [], policy: { maxConcurrency, failurePolicy: crossBranchPriority ? 'fail_fast' : 'continue' } };
        const join = { nodeId: id(), kind: 'join', label: 'Original Game typed Join', inputs: [port('actorA', 'text'), port('actorB', 'text')],
            outputs: [port('joined', 'text', false)], dependencyPinIds: [], capabilities: [], policy: { strategy: 'all-success', quorum: 2, deadlineMs: 120000 } };
        narrator.inputs = [port('joined', 'text')]; narrator.dependencyPinIds.push('scope.audience.2'); narrator.policy.audiencePinId = 'scope.audience.2';
        plan.definition.nodes = [fanout, planner, first, preferred, merge, sibling, join, narrator, output];
        plan.definition.edges = [edge(fanout, planner, 'task'), edge(fanout, sibling, 'task'), edge(planner, first, 'control'), edge(planner, preferred, 'control'),
            edge(first, merge, 'first'), edge(preferred, merge, 'preferred'), edge(merge, join, 'actorA'), edge(sibling, join, 'actorB'), edge(join, narrator, 'joined'), ...plan.definition.edges];
        plan.definition.entryNodeIds = [fanout.nodeId]; plan.definition.capabilityCeiling.push('graph.patch');
        if (replan) {
            planner.inputs.push(port('return', 'json', false));
            plan.definition.edges.push({ ...edge(planner, planner, 'return'), loopBack: true });
        }
        plan.definition.graphChangePolicy = { allowedOperations: ['setPendingPriority', 'requestFinalize', ...replan ? ['requestReplan'] : []], allowedNodeKinds: [] };
        Object.assign(plan.definition.limits, { maxSteps: 240, maxConcurrency: Math.max(2, maxConcurrency), deadlineMs: 300000,
            maxNodes: plan.definition.nodes.length, maxEdges: plan.definition.edges.length,
            maxAttempts: plan.definition.nodes.length + Number(replan), maxEdgeVisits: plan.definition.edges.length, maxPatches: replan ? 2 : 1 });
        topology = { fanout, planner, first, preferred, merge, sibling, join, narrator,
            operations: [{ op: 'setPendingPriority', nodeId: (crossBranchPriority ? sibling : preferred).nodeId, priority: 7 }, { op: 'requestFinalize' }] };
    }, responseBody: async ({ body, index }) => {
        const nodeId = sessionScopeTask(body)?.nodeId;
        const text = nodeId === topology.planner.nodeId ? JSON.stringify({ operations: replan && ++plannerRound === 1 ? [{ op: 'requestReplan' }] : topology.operations })
            : nodeId === topology.narrator.nodeId ? 'The NPC waits for the player choice.' : 'GAME_SCOPE_ADVICE_' + index;
        return { id: 'game-scope-response-' + index, status: 'completed', output: [{ id: 'game-scope-message-' + index, type: 'message', status: 'completed', role: 'assistant',
            content: [{ type: 'output_text', text, annotations: [] }] }], usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } };
    } });
    return { ...f, get effectRef() { return f.effectRef; }, get authority() { return f.authority; }, get core() { return f.core; }, topology };
}
