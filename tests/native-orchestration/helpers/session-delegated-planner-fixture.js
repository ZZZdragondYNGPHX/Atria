import { sessionDelegationFixture } from './session-delegation-fixture.js';
import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';

const id = kind => createNativeId('orchestration' + kind);

export async function sessionDelegatedPlannerFixture(make, { childRequests = 3, parentGrant = true, unknown = false, onParent = () => {} } = {}) {
    let planner, loop, plannerModelId, round = 0;
    const f = await sessionDelegationFixture(make, { childSteps: 1, childRequests, parentRequests: 5,
        responseStatus: count => unknown && count === 3 ? null : 200,
        configureChild: async (child, { seeded, h }) => {
            const terminal = child.definition.nodes[0], output = child.definition.nodes[1], actorPinId = terminal.policy.audiencePinId;
            const base = await seeded.persistence.getRuntimeRoute(h.handle, child.dependencyPins[0].resourceRef.runtimeRouteId);
            const model = { ...seeded.model, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'session-child-original-planner' };
            plannerModelId = model.remoteModelId; await seeded.persistence.saveModelProfile(h.handle, model);
            const route = { ...base, runtimeRouteId: createNativeId('runtimeRoute'), modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId },
                executionPolicy: { ...base.executionPolicy, allowedModelProfileIds: [model.modelProfileId] } };
            await seeded.persistence.saveRuntimeRoute(h.handle, route);
            child.dependencyPins.push({ pinId: 'child.planner', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId }, integrity: hash(route) });
            planner = { nodeId: id('Node'), kind: 'planner', label: 'Original Actor child bounded Planner',
                inputs: [{ name: 'feedback', type: 'json', required: false }], outputs: [{ name: 'control', type: 'json', required: false }],
                dependencyPinIds: ['child.planner', actorPinId], capabilities: ['generation.send', 'graph.patch'],
                policy: { agentPinId: 'child.planner', audiencePinId: actorPinId } };
            terminal.inputs = [{ name: 'control', type: 'json', required: true }];
            loop = { edgeId: id('Edge'), from: { nodeId: planner.nodeId, port: 'control' }, to: { nodeId: planner.nodeId, port: 'feedback' },
                condition: 'always', maxVisits: 1, loopBack: true };
            child.definition.nodes = [planner, terminal, output]; child.definition.entryNodeIds = [planner.nodeId];
            child.definition.edges.unshift(loop, { edgeId: id('Edge'), from: { nodeId: planner.nodeId, port: 'control' }, to: { nodeId: terminal.nodeId, port: 'control' }, condition: 'always', maxVisits: 1, loopBack: false });
            child.definition.capabilityCeiling = ['generation.send', 'graph.patch'];
            child.definition.graphChangePolicy = { allowedOperations: ['requestReplan', 'requestFinalize'], allowedNodeKinds: [] };
            Object.assign(child.definition.limits, { maxAttempts: 4, maxNodes: 3, maxEdges: 3, maxEdgeVisits: 3, maxPatches: 2, maxReplans: 1, maxLoopIterations: 1 });
        },
        configureParent: async (plan, args, topology) => {
            await onParent(plan, args, topology);
            if (!parentGrant) return;
            topology.delegator.capabilities.push('graph.patch'); plan.definition.capabilityCeiling.push('graph.patch');
            plan.definition.graphChangePolicy = { allowedOperations: ['requestReplan', 'requestFinalize'], allowedNodeKinds: [] };
        },
        responsePayload: (body, _index, topology) => body.model === plannerModelId ? JSON.stringify({ operations: [{ op: ++round === 1 ? 'requestReplan' : 'requestFinalize' }] })
            : body.model === 'session-delegated-distinct-model' ? 'CHILD_CONTROL_TERMINAL_ADVICE'
                : JSON.stringify(body.input).includes(topology.delegator.label) ? 'PARENT_ACCEPTED_CHILD_CONTROL' : 'The NPC waits for the player choice.',
    });
    return { ...f, get authority() { return f.authority; }, get core() { return f.core; }, get effectRef() { return f.effectRef; }, planner, plannerModelId, loop };
}
