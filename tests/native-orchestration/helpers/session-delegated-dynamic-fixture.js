import { sessionDelegationFixture } from './session-delegation-fixture.js';
import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';

const id = kind => createNativeId('orchestration' + kind);
const port = (name, type, required = true) => ({ name, type, required });
const edge = (from, to, input) => ({ edgeId: id('Edge'), from: { nodeId: from.nodeId, port: from.outputs[0].name },
    to: { nodeId: to.nodeId, port: input }, condition: 'always', maxVisits: 1, loopBack: false });

export async function sessionDelegatedDynamicFixture(make, { childRequests = 3, undeclaredModel = false } = {}) {
    let planner, added, operations;
    const f = await sessionDelegationFixture(make, { childSteps: 1, childRequests, parentRequests: childRequests + 2,
        configureChild: async (child, { seeded, h }) => {
            const terminal = child.definition.nodes[0], output = child.definition.nodes[1], actor = terminal.policy.audiencePinId;
            const base = await seeded.persistence.getRuntimeRoute(h.handle, child.dependencyPins[0].resourceRef.runtimeRouteId);
            const modelPin = async (pinId, remoteModelId) => {
                const model = { ...seeded.model, modelProfileId: createNativeId('modelProfile'), remoteModelId };
                await seeded.persistence.saveModelProfile(h.handle, model);
                const route = { ...base, runtimeRouteId: createNativeId('runtimeRoute'), modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId },
                    executionPolicy: { ...base.executionPolicy, allowedModelProfileIds: [model.modelProfileId] } };
                await seeded.persistence.saveRuntimeRoute(h.handle, route);
                child.dependencyPins.push({ pinId, port: 'model', resourceRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId }, integrity: hash(route) });
            };
            await modelPin('child.planner', 'session-child-dynamic-planner');
            await modelPin('child.dynamic', 'session-child-dynamic-owned-spare');
            planner = { nodeId: id('Node'), kind: 'planner', label: 'Original Actor child dynamic Planner', inputs: [], outputs: [port('control', 'json', false)],
                dependencyPinIds: ['child.planner', actor], capabilities: ['generation.send', 'graph.patch'], policy: { agentPinId: 'child.planner', audiencePinId: actor } };
            terminal.inputs = [port('control', 'json'), port('dynamic', 'text', false)];
            child.definition.nodes.unshift(planner); child.definition.entryNodeIds = [planner.nodeId];
            child.definition.edges.unshift(edge(planner, terminal, 'control'));
            child.definition.capabilityCeiling = ['generation.send', 'graph.patch'];
            child.definition.graphChangePolicy = { allowedOperations: ['addNode', 'addEdge'], allowedNodeKinds: ['agent'] };
            Object.assign(child.definition.limits, { maxAttempts: 4, maxNodes: 4, maxEdges: 4, maxEdgeVisits: 4, maxPatches: 1 });
            const pinId = undeclaredModel ? 'undeclared.child.model' : 'child.dynamic';
            added = { nodeId: id('Node'), kind: 'agent', label: 'Original child dynamically planned Actor A analysis', inputs: [port('control', 'json')],
                outputs: [port('advice', 'text', false)], dependencyPinIds: [pinId, actor], capabilities: ['generation.send'], policy: { agentPinId: pinId, audiencePinId: actor } };
            operations = [{ op: 'addNode', node: added }, { op: 'addEdge', edge: edge(planner, added, 'control') }, { op: 'addEdge', edge: edge(added, terminal, 'dynamic') }];
            // The Output and its one producer are authored before any proposal.
            if (child.definition.edges.at(-1).to.nodeId !== output.nodeId) throw new TypeError('Invalid fixture terminal');
        }, configureParent: async (plan, _args, topology) => {
            topology.delegator.capabilities.push('graph.patch'); plan.definition.capabilityCeiling.push('graph.patch');
            plan.definition.graphChangePolicy = { allowedOperations: ['addNode', 'addEdge'], allowedNodeKinds: ['agent'] };
        }, responsePayload: (body, _index, topology) => body.model === 'session-child-dynamic-planner' ? JSON.stringify({ operations })
            : body.model === 'session-child-dynamic-owned-spare' ? 'DYNAMIC_CHILD_ACTOR_ADVICE'
                : body.model === 'session-delegated-distinct-model' ? 'CHILD_DYNAMIC_TERMINAL_ADVICE'
                    : JSON.stringify(body.input).includes(topology.delegator.label) ? 'PARENT_ACCEPTED_CHILD_DYNAMIC' : 'The NPC waits for the player choice.',
    });
    return { ...f, get authority() { return f.authority; }, get core() { return f.core; }, get effectRef() { return f.effectRef; }, planner, added, operations };
}
