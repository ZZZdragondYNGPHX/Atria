import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';

const id = kind => createNativeId('orchestration' + kind);
export async function configurePlanner(plan, { h, seeded, route }) {
    const narrator = plan.definition.nodes[0], output = plan.definition.nodes[1], plannerId = id('Node');
    const plannerRoute = { ...route, runtimeRouteId: createNativeId('runtimeRoute'), displayName: 'Explicit Planner Route' };
    await seeded.persistence.saveRuntimeRoute(h.handle, plannerRoute);
    const persisted = await seeded.persistence.getRuntimeRoute(h.handle, plannerRoute.runtimeRouteId);
    plan.dependencyPins.push({ pinId: 'planner.route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: persisted.runtimeRouteId }, integrity: hash(persisted) });
    const planner = { nodeId: plannerId, kind: 'planner', label: 'Bounded Planner', inputs: [], outputs: [{ name: 'patch', type: 'json', required: false }],
        dependencyPinIds: ['planner.route'], capabilities: ['generation.send', 'graph.patch'], policy: { agentPinId: 'planner.route' } };
    narrator.inputs = [{ name: 'plan', type: 'json', required: true }]; output.capabilities = ['chat.output'];
    plan.definition.nodes.unshift(planner); plan.definition.entryNodeIds = [plannerId]; plan.definition.capabilityCeiling = ['generation.send', 'graph.patch', 'chat.output'];
    plan.definition.edges.unshift({ edgeId: id('Edge'), from: { nodeId: plannerId, port: 'patch' }, to: { nodeId: narrator.nodeId, port: 'plan' }, condition: 'always', maxVisits: 1, loopBack: false });
    plan.definition.graphChangePolicy = { allowedOperations: ['setPendingPriority', 'markBlocked', 'requestFinalize'], allowedNodeKinds: [] };
    Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 65536 } });
    return narrator;
}

export async function configurePlannerLoop(plan, args, iterations = 2) {
    const narrator = await configurePlanner(plan, args), planner = plan.definition.nodes[0];
    planner.inputs = [{ name: 'feedback', type: 'json', required: false }];
    plan.definition.edges.push({ edgeId: id('Edge'), from: { nodeId: planner.nodeId, port: 'patch' }, to: { nodeId: planner.nodeId, port: 'feedback' },
        condition: 'always', maxVisits: iterations, loopBack: true });
    plan.definition.graphChangePolicy.allowedOperations.push('requestReplan');
    plan.definition.limits.maxReplans = iterations; plan.definition.limits.maxLoopIterations = iterations;
    return narrator;
}
