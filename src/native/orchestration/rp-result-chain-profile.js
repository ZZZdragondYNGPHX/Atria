import { hashNativeDocument as hash } from '../repositories/common.js';
import { nodeModelRoutePins } from '../../../public/shared/native-orchestration-contracts.js';

const fail = () => { throw Object.assign(new TypeError('native_orchestration_rp_result_chain_unavailable'), { code: 'native_orchestration_rp_result_chain_unavailable' }); };

/** Static same-audience RP drafting only. Result references carry no domain right. */
export function rpResultChainProfile(plan) {
    const graph = plan.definition, agents = graph.nodes.filter(node => node.kind === 'agent');
    if (agents.length < 2) return null;
    const output = graph.nodes.find(node => node.kind === 'output'), chain = [], transfers = [];
    let node = graph.nodes.find(node => node.nodeId === graph.entryNodeIds[0]);
    if (graph.nodes.length !== agents.length + 1 || !output || graph.outputContract.kind !== 'rp_narration'
        || graph.edges.length !== agents.length || graph.entryNodeIds.length !== 1 || graph.graphChangePolicy.allowedOperations.length || graph.graphChangePolicy.allowedNodeKinds.length) fail();
    while (node !== output) {
        if (!node || node.kind !== 'agent' || chain.includes(node) || node.outputs.length !== 1 || node.outputs[0].type !== 'text'
            || hash(node.capabilities) !== hash(['generation.send']) || !nodeModelRoutePins(node, plan.dependencyPins).length
            || node.dependencyPinIds.length !== nodeModelRoutePins(node, plan.dependencyPins).length
            || (chain.length === 0 ? node.inputs.length : node.inputs.length !== 1 || node.inputs[0].type !== 'text' || !node.inputs[0].required)) fail();
        const edges = graph.edges.filter(edge => edge.from.nodeId === node.nodeId), edge = edges[0];
        if (edges.length !== 1 || edge.from.port !== node.outputs[0].name || edge.condition !== 'always' || edge.loopBack || edge.maxVisits !== 1) fail();
        const next = graph.nodes.find(item => item.nodeId === edge.to.nodeId);
        if (!next?.inputs.some(port => port.name === edge.to.port && port.type === 'text' && port.required)) fail();
        chain.push(node); transfers.push(edge); node = next;
    }
    if (chain.length !== agents.length) fail();
    const narrator = chain.at(-1), drafts = chain.slice(0, -1), transfer = transfers[0];
    const used = new Set(agents.flatMap(node => node.dependencyPinIds));
    if (plan.dependencyPins.some(pin => !used.has(pin.pinId))) fail();
    return { draft: drafts[0], drafts, transfers: transfers.slice(0, -1), transfer, narration: { ...plan, definition: { ...graph,
        nodes: [{ ...narrator, inputs: [] }, output], entryNodeIds: [narrator.nodeId], edges: [transfers.at(-1)] },
    dependencyPins: plan.dependencyPins.filter(pin => narrator.dependencyPinIds.includes(pin.pinId)) } };
}
