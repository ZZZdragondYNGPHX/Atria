import { hashNativeDocument as hash } from '../repositories/common.js';
import { nodeModelRoutePins } from '../../../public/shared/native-orchestration-contracts.js';

const fail = () => { throw Object.assign(new TypeError('native_orchestration_rp_result_chain_unavailable'), { code: 'native_orchestration_rp_result_chain_unavailable' }); };

/** Static same-audience RP drafting only. Result references carry no domain right. */
export function rpResultChainProfile(plan) {
    const graph = plan.definition, agents = graph.nodes.filter(node => node.kind === 'agent');
    if (agents.length < 2) return null;
    const draft = graph.nodes.find(node => graph.entryNodeIds.includes(node.nodeId)), narrator = agents.find(node => node !== draft), output = graph.nodes.find(node => node.kind === 'output');
    if (graph.nodes.length !== 3 || agents.length !== 2 || !draft || !narrator || !output || graph.outputContract.kind !== 'rp_narration'
        || graph.edges.length !== 2 || hash(graph.entryNodeIds) !== hash([draft.nodeId]) || draft.kind !== 'agent'
        || draft.inputs.length || draft.outputs.length !== 1 || draft.outputs[0].type !== 'text'
        || narrator.inputs.length !== 1 || narrator.inputs[0].type !== 'text' || !narrator.inputs[0].required
        || hash(draft.capabilities) !== hash(['generation.send']) || graph.graphChangePolicy.allowedOperations.length || graph.graphChangePolicy.allowedNodeKinds.length
        || !nodeModelRoutePins(draft, plan.dependencyPins).length || draft.dependencyPinIds.length !== nodeModelRoutePins(draft, plan.dependencyPins).length) fail();
    const transfer = graph.edges.find(edge => edge.from.nodeId === draft.nodeId && edge.to.nodeId === narrator.nodeId);
    if (!transfer || transfer.from.port !== draft.outputs[0].name || transfer.to.port !== narrator.inputs[0].name || transfer.condition !== 'always' || transfer.loopBack || transfer.maxVisits !== 1) fail();
    const used = new Set([...draft.dependencyPinIds, ...narrator.dependencyPinIds]);
    if (plan.dependencyPins.some(pin => !used.has(pin.pinId))) fail();
    return { draft, transfer, narration: { ...plan, definition: { ...graph, nodes: [{ ...narrator, inputs: [] }, output], entryNodeIds: [narrator.nodeId],
        edges: graph.edges.filter(edge => edge !== transfer) }, dependencyPins: plan.dependencyPins.filter(pin => narrator.dependencyPinIds.includes(pin.pinId)) } };
}
