import { nodePromptPinCount, nodeModelRoutePins } from '../../../public/shared/native-orchestration-contracts.js';
import { equalNativeDocuments } from '../repositories/common.js';
import { audienceContextPin } from './audience-source-contracts.js';

const fail = () => { throw Object.assign(new TypeError('native_orchestration_rp_agent_graph_unavailable'), { code: 'native_orchestration_rp_agent_graph_unavailable' }); };

/** Advisory RP DAG; each node independently admits its declared Audience. */
export function rpAgentGraphProfile(plan) {
    const graph = plan.definition, agents = graph.nodes.filter(node => node.kind === 'agent');
    if (agents.length < 2) return null;
    const output = graph.nodes.find(node => node.kind === 'output'), ordered = [], inputs = {};
    if (graph.nodes.length !== agents.length + 1 || !output || graph.outputContract.kind !== 'rp_narration'
        || graph.graphChangePolicy.allowedOperations.length || graph.graphChangePolicy.allowedNodeKinds.length) fail();
    const terminal = graph.edges.filter(edge => edge.to.nodeId === output.nodeId);
    if (terminal.length !== 1 || graph.edges.some(edge => edge.from.nodeId === output.nodeId)) fail();
    const narrator = agents.find(node => node.nodeId === terminal[0].from.nodeId);
    if (!narrator) fail();
    for (const node of agents) {
        const retrievalPins = node.capabilities.includes('memory.retrieve') ? plan.dependencyPins.filter(pin => node.dependencyPinIds.includes(pin.pinId)
            && pin.port === 'context' && pin.resourceRef.scope === 'player' && pin.resourceRef.retrievalProfileId) : [];
        if (node.outputs.length !== 1 || node.outputs[0].type !== 'text'
            || !equalNativeDocuments([...node.capabilities].sort(), ['generation.send', ...retrievalPins.length ? ['memory.retrieve'] : []].sort()) || !nodeModelRoutePins(node, plan.dependencyPins).length
            || (node.dependencyPinIds.length - nodePromptPinCount(node)) !== nodeModelRoutePins(node, plan.dependencyPins).length + retrievalPins.length + (audienceContextPin(node, plan.dependencyPins) ? 1 : 0)) fail();
        inputs[node.nodeId] = graph.edges.filter(edge => edge.to.nodeId === node.nodeId).sort((a, b) => a.edgeId.localeCompare(b.edgeId));
        if (inputs[node.nodeId].length !== node.inputs.length || new Set(inputs[node.nodeId].map(edge => edge.from.nodeId)).size !== inputs[node.nodeId].length
            || node.inputs.some(port => port.type !== 'text' || !port.required
            || inputs[node.nodeId].filter(edge => edge.to.port === port.name).length !== 1)) fail();
        const edges = graph.edges.filter(edge => edge.from.nodeId === node.nodeId);
        if (!edges.length || node === narrator && edges.length !== 1) fail();
        for (const edge of edges) {
            const next = graph.nodes.find(item => item.nodeId === edge.to.nodeId);
            if (edge.from.port !== node.outputs[0].name || edge.condition !== 'always' || edge.loopBack || edge.maxVisits !== 1
                || !next?.inputs.some(port => port.name === edge.to.port && port.type === 'text' && port.required)) fail();
        }
    }
    if (!equalNativeDocuments([...graph.entryNodeIds].sort(), agents.filter(node => !inputs[node.nodeId].length).map(node => node.nodeId).sort())) fail();
    while (ordered.length < agents.length) {
        const ready = agents.find(node => !ordered.includes(node) && inputs[node.nodeId].every(edge => ordered.some(producer => producer.nodeId === edge.from.nodeId)));
        if (!ready) fail();
        ordered.push(ready);
    }
    if (ordered.at(-1) !== narrator) fail();
    const drafts = ordered.slice(0, -1);
    const used = new Set(agents.flatMap(node => node.dependencyPinIds));
    if (plan.dependencyPins.some(pin => !used.has(pin.pinId))) fail();
    return { draft: drafts[0], drafts, inputs, narration: { ...plan, definition: { ...graph,
        nodes: [{ ...narrator, inputs: [] }, output], capabilityCeiling: [...new Set([...narrator.capabilities, ...output.capabilities])], entryNodeIds: [narrator.nodeId], edges: terminal },
    dependencyPins: plan.dependencyPins.filter(pin => narrator.dependencyPinIds.includes(pin.pinId)) } };
}

/** Derive only order; priorities never grant a node or Result permission. */
export function rpAgentGraphOrder(profile, nodeControl) {
    const nodes = [...profile.drafts, profile.narration.definition.nodes[0]], ordered = [];
    while (ordered.length < nodes.length) {
        const ready = nodes.filter(node => !ordered.includes(node) && profile.inputs[node.nodeId].every(edge => ordered.some(source => source.nodeId === edge.from.nodeId)));
        ready.sort((a, b) => nodeControl[b.nodeId].priority - nodeControl[a.nodeId].priority);
        if (!ready.length) fail();
        ordered.push(ready[0]);
    }
    return ordered;
}
