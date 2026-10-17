import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';

const id = kind => createNativeId('orchestration' + kind);

/** All branches execute serially through the original RP Host and bank. */
export async function configureAgentGraph(plan, { h, seeded, route }, shape = 'diamond') {
    const narrator = plan.definition.nodes[0], output = plan.definition.nodes[1], nodes = [];
    const connections = shape === 'one-draft' ? [[0, 1]] : shape === 'two-entries' ? [[0, 2], [1, 2]] : shape === 'diamond' ? [[0, 1], [0, 2], [1, 3], [2, 3]]
        : shape === 'merge' ? [[0, 2], [1, 2], [2, 3]] : [[0, 3], [1, 3], [2, 3]];
    for (let index = 0; index < (shape === 'one-draft' ? 1 : shape === 'two-entries' ? 2 : 3); index++) {
        const next = { ...route, runtimeRouteId: createNativeId('runtimeRoute'), displayName: 'Graph agent ' + index };
        await seeded.persistence.saveRuntimeRoute(h.handle, next);
        const current = await seeded.persistence.getRuntimeRoute(h.handle, next.runtimeRouteId), pinId = 'graph' + index + '.route';
        plan.dependencyPins.push({ pinId, port: 'model', resourceRef: { scope: 'player', runtimeRouteId: next.runtimeRouteId }, integrity: hash(current) });
        nodes.push({ ...narrator, nodeId: id('Node'), label: 'Graph agent ' + index, dependencyPinIds: [pinId], policy: { agentPinId: pinId } });
    }
    nodes.push(narrator);
    for (const [index, node] of nodes.entries()) node.inputs = connections.filter(([, to]) => to === index).map(([from]) => ({ name: 'from' + from, type: 'text', required: true }));
    plan.definition.nodes = [...nodes, output];
    plan.definition.entryNodeIds = nodes.filter(node => !node.inputs.length).map(node => node.nodeId);
    plan.definition.edges = [...connections.map(([from, to]) => ({ edgeId: id('Edge'), from: { nodeId: nodes[from].nodeId, port: 'response' },
        to: { nodeId: nodes[to].nodeId, port: 'from' + from }, condition: 'always', maxVisits: 1, loopBack: false })), ...plan.definition.edges];
    output.capabilities = ['chat.output']; plan.definition.capabilityCeiling = ['generation.send', 'chat.output'];
    Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 65536 } });
}
