import { createNativeId, assertNativeId } from '../identity.js';
import { equalNativeDocuments as equal } from '../repositories/common.js';
import { rpAgentGraphProfile } from './rp-agent-graph-profile.js';
import { audienceContextPin } from './audience-source-contracts.js';

const fail = () => { throw Object.assign(new TypeError('native_orchestration_rp_planner_expansion_unavailable'), { code: 'native_orchestration_rp_planner_expansion_unavailable' }); };

// Only the selected Narrator Model pin and its explicitly owned retrieval
// pins can appear in a Host template. This data grants no runtime scope.
function templateAuthority(narrator, dependencyPins) {
    const pins = narrator.capabilities.includes('memory.retrieve') ? dependencyPins.filter(pin => narrator.dependencyPinIds.includes(pin.pinId)
        && pin.port === 'context' && pin.resourceRef.scope === 'player' && pin.resourceRef.retrievalProfileId).map(pin => pin.pinId).sort() : [];
    if (narrator.capabilities.includes('memory.retrieve') && !pins.length) fail();
    const audience = audienceContextPin(narrator, dependencyPins);
    return { dependencyPinIds: [narrator.policy.agentPinId, ...narrator.policy.promptPinId ? [narrator.policy.promptPinId] : [], ...pins, ...(audience ? [audience.pinId] : [])], capabilities: ['generation.send', ...pins.length ? ['memory.retrieve'] : []] };
}

/** Same-source advisory additions reuse only the already selected Narrator Model. */
export function rpPlannerExpansionProfile(plan, { planner, output, loop, allowed }) {
    const graph = plan.definition, terminal = graph.edges.filter(edge => edge.to.nodeId === output?.nodeId);
    const narrator = graph.nodes.find(node => node.nodeId === terminal[0]?.from.nodeId), agents = graph.nodes.filter(node => node.kind === 'agent');
    if (!output || !narrator || terminal.length !== 1 || graph.nodes.length !== agents.length + 2 || graph.outputContract.kind !== 'rp_narration'
        || !equal(graph.graphChangePolicy.allowedNodeKinds, ['agent']) || !['addNode', 'addEdge'].every(op => graph.graphChangePolicy.allowedOperations.includes(op))
        || graph.graphChangePolicy.allowedOperations.some(op => ![...allowed, 'addNode', 'addEdge'].includes(op))) fail();
    const authority = templateAuthority(narrator, plan.dependencyPins);
    const controls = graph.edges.filter(edge => edge.from.nodeId === planner.nodeId && !edge.loopBack);
    for (const node of agents) {
        const control = controls.filter(edge => edge.to.nodeId === node.nodeId), ports = node.inputs.filter(port => port.type === 'json');
        if (control.length !== 1 || ports.length !== 1 || !ports[0].required || control[0].to.port !== ports[0].name
            || control[0].from.port !== planner.outputs[0].name || control[0].condition !== 'always' || control[0].maxVisits !== 1) fail();
        if (node === narrator) {
            if (node.inputs.some(port => port !== ports[0] && (port.type !== 'text' || port.required))) fail();
        } else {
            if (node.inputs.length !== 1 || !equal(node.capabilities, authority.capabilities) || node.outputs.length !== 1 || node.outputs[0].type !== 'text'
                || !equal(node.dependencyPinIds, authority.dependencyPinIds) || node.policy.agentPinId !== narrator.policy.agentPinId
                || node.policy.audiencePinId !== narrator.policy.audiencePinId || node.policy.promptPinId !== narrator.policy.promptPinId) fail();
            const outgoing = graph.edges.filter(edge => edge.from.nodeId === node.nodeId);
            if (outgoing.length !== 1 || outgoing[0].to.nodeId !== narrator.nodeId || outgoing[0].from.port !== node.outputs[0].name
                || outgoing[0].condition !== 'always' || outgoing[0].loopBack || outgoing[0].maxVisits !== 1
                || !narrator.inputs.some(port => port.type === 'text' && port.name === outgoing[0].to.port)) fail();
        }
    }
    if (controls.length !== agents.length || graph.edges.length !== agents.length * 2 + (loop ? 1 : 0)) fail();
    const nodes = [...agents, output].map(node => ({ ...node, inputs: node.inputs.filter(port => port.type !== 'json'
        && (port.required || graph.edges.some(edge => edge.to.nodeId === node.nodeId && edge.to.port === port.name))).map(port => ({ ...port, required: true })) }));
    const used = new Set(nodes.flatMap(node => node.dependencyPinIds));
    if (plan.dependencyPins.some(pin => !used.has(pin.pinId) && !planner.dependencyPinIds.includes(pin.pinId))) fail();
    const projection = { ...plan, definition: { ...graph, nodes, edges: graph.edges.filter(edge => edge.from.nodeId !== planner.nodeId),
        entryNodeIds: agents.filter(node => node !== narrator).map(node => node.nodeId), capabilityCeiling: graph.capabilityCeiling.filter(capability => capability !== 'graph.patch'),
        graphChangePolicy: { allowedOperations: [], allowedNodeKinds: [] } }, dependencyPins: plan.dependencyPins.filter(pin => used.has(pin.pinId)) };
    const agentGraph = agents.length > 1 ? rpAgentGraphProfile(projection) : null;
    const narration = agentGraph?.narration ?? { ...projection, definition: { ...projection.definition, nodes: [{ ...narrator, inputs: [] }, output], entryNodeIds: [narrator.nodeId] } };
    return { planner, transfer: controls.find(edge => edge.to.nodeId === narrator.nodeId), transfers: controls, loop: loop ?? null,
        agentGraph, narration, expansion: { narratorNodeId: narrator.nodeId, pinId: narrator.policy.agentPinId } };
}

/** Host-allocated metadata, never a scope or a permission from Model JSON. */
export function rpPlannerExpansionTemplates(graph, dependencyPins = []) {
    const planner = graph.nodes.find(node => node.kind === 'planner');
    const terminal = graph.edges.find(edge => edge.to.nodeId === graph.outputContract.ownerNodeId);
    const narrator = graph.nodes.find(node => node.nodeId === terminal.from.nodeId);
    const slots = Math.max(0, graph.limits.maxNodes - graph.nodes.length);
    return narrator.inputs.filter(port => port.type === 'text' && !port.required && !graph.edges.some(edge => edge.to.nodeId === narrator.nodeId && edge.to.port === port.name)).slice(0, slots)
        .map(port => templateData(planner, narrator, port.name, createNativeId('orchestrationNode'), [createNativeId('orchestrationEdge'), createNativeId('orchestrationEdge')], dependencyPins));
}

function templateData(planner, narrator, slot, nodeId, edgeIds, dependencyPins) {
    const node = { nodeId, kind: 'agent', label: 'Declared advisory draft', inputs: [{ name: 'plan', type: 'json', required: true }],
        outputs: [{ name: 'response', type: 'text', required: false }], ...templateAuthority(narrator, dependencyPins), policy: { agentPinId: narrator.policy.agentPinId, ...(narrator.policy.promptPinId ? { promptPinId: narrator.policy.promptPinId } : {}),
            ...(narrator.policy.audiencePinId ? { audiencePinId: narrator.policy.audiencePinId } : {}) } };
    const edge = (id, from, to) => ({ edgeId: id, from, to, condition: 'always', maxVisits: 1, loopBack: false });
    return { node, edges: [edge(edgeIds[0], { nodeId: planner.nodeId, port: planner.outputs[0].name }, { nodeId, port: 'plan' }),
        edge(edgeIds[1], { nodeId, port: 'response' }, { nodeId: narrator.nodeId, port: slot })] };
}

export function assertRpPlannerExpansionOperations(graph, templates, operations, dependencyPins = []) {
    if (!Array.isArray(templates)) fail();
    const planner = graph.nodes.find(node => node.kind === 'planner'), terminal = graph.edges.find(edge => edge.to.nodeId === graph.outputContract.ownerNodeId);
    const narrator = graph.nodes.find(node => node.nodeId === terminal.from.nodeId), nodes = new Set(), edges = new Set(), ports = new Set();
    if (templates.length > graph.limits.maxNodes - graph.nodes.length) fail();
    for (const template of templates) {
        if (!template?.node || !Array.isArray(template.edges) || template.edges.length !== 2) fail();
        const nodeId = assertNativeId(template.node.nodeId, 'orchestrationNode'), slot = template.edges[1]?.to?.port;
        if (nodes.has(nodeId) || graph.nodes.some(node => node.nodeId === nodeId) || ports.has(slot)
            || !narrator.inputs.some(port => port.name === slot && port.type === 'text' && !port.required)
            || graph.edges.some(edge => edge.to.nodeId === narrator.nodeId && edge.to.port === slot)) fail();
        nodes.add(nodeId); ports.add(slot);
        for (const edge of template.edges) {
            assertNativeId(edge.edgeId, 'orchestrationEdge');
            if (edges.has(edge.edgeId) || graph.edges.some(item => item.edgeId === edge.edgeId)) fail();
            edges.add(edge.edgeId);
        }
        if (!equal(template, templateData(planner, narrator, slot, nodeId, template.edges.map(edge => edge.edgeId), dependencyPins))) fail();
    }
    for (const operation of operations) {
        if (operation.op === 'addNode' && !templates.some(template => equal(template.node, operation.node))
            || operation.op === 'addEdge' && !templates.some(template => template.edges.some(edge => equal(edge, operation.edge)))) fail();
    }
}
