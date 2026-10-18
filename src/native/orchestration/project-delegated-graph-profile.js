import { hashNativeDocument as hash } from '../repositories/common.js';
import { nodeModelRoutePins } from '../../../public/shared/native-orchestration-contracts.js';

const equal = (a, b) => hash(a) === hash(b);
const fail = () => { throw new TypeError('Invalid Project delegated graph'); };

/** Published shape only. Delegation still requires the original parent Node
 * capability intersection, owned Routes, Source and held child reservation. */
export function projectDelegatedGraphProfile(plan) {
    const graph = plan.definition, models = graph.nodes.filter(node => ['agent', 'planner'].includes(node.kind));
    const planners = models.filter(node => node.kind === 'planner'), outputs = graph.nodes.filter(node => node.kind === 'output');
    const canAddAgent = graph.graphChangePolicy.allowedOperations.includes('addNode') && graph.graphChangePolicy.allowedNodeKinds.includes('agent');
    if (!models.some(node => node.kind === 'agent') || outputs.length !== 1 || graph.nodes.length !== models.length + 1
        || graph.outputContract.kind !== 'result' || graph.outputContract.allowPartial || graph.outputContract.resultPolicy?.outputType !== 'text'
        || !equal([...graph.capabilityCeiling].sort(), ['generation.send', ...planners.length ? ['graph.patch'] : []].sort())
        || graph.graphChangePolicy.allowedNodeKinds.some(kind => kind !== 'agent') || (!planners.length ? graph.graphChangePolicy.allowedOperations.length
        : !graph.graphChangePolicy.allowedOperations.length || graph.graphChangePolicy.allowedOperations.some(op => !['setPendingPriority', 'requestFinalize', 'addNode', 'addEdge'].includes(op)))
        || graph.nodes.some(node => node.policy.allowedPlanPinIds?.length)) fail();
    const output = outputs[0], incoming = {}, ordered = [];
    if (output.nodeId !== graph.outputContract.ownerNodeId || output.capabilities.length || output.dependencyPinIds.length
        || output.inputs.length !== 1 || output.inputs[0].type !== 'text' || !output.inputs[0].required || output.outputs.length) fail();
    for (const node of models) {
        if (nodeModelRoutePins(node, plan.dependencyPins).length !== 1 || node.dependencyPinIds.length !== 1
            || !equal(node.capabilities, ['generation.send', ...node.kind === 'planner' ? ['graph.patch'] : []])
            || node.outputs.length !== 1 || node.outputs[0].type !== (node.kind === 'planner' ? 'json' : 'text')
            || node.inputs.some(port => !['text', 'json'].includes(port.type))) fail();
        incoming[node.nodeId] = graph.edges.filter(edge => edge.to.nodeId === node.nodeId).toSorted((a, b) => a.edgeId.localeCompare(b.edgeId));
        if (incoming[node.nodeId].length > node.inputs.length || new Set(incoming[node.nodeId].map(edge => edge.from.nodeId)).size !== incoming[node.nodeId].length
            || node.inputs.some(port => incoming[node.nodeId].filter(edge => edge.to.port === port.name).length > 1
                || port.required && !incoming[node.nodeId].some(edge => edge.to.port === port.name))) fail();
    }
    for (const edge of graph.edges) {
        const from = models.find(node => node.nodeId === edge.from.nodeId), to = graph.nodes.find(node => node.nodeId === edge.to.nodeId);
        if (!from || !to || !['always', 'success'].includes(edge.condition) || edge.loopBack || edge.maxVisits !== 1
            || edge.from.port !== from.outputs[0].name || !to.inputs.some(port => port.name === edge.to.port && port.type === from.outputs[0].type)) fail();
    }
    if (!equal([...graph.entryNodeIds].sort(), models.filter(node => !incoming[node.nodeId].length).map(node => node.nodeId).sort())) fail();
    while (ordered.length < models.length) {
        const next = models.find(node => !ordered.includes(node) && incoming[node.nodeId].every(edge => ordered.some(from => from.nodeId === edge.from.nodeId)));
        if (!next) fail(); ordered.push(next);
    }
    const terminal = graph.edges.filter(edge => edge.to.nodeId === output.nodeId), needed = new Set([output.nodeId]);
    for (let changed = true; changed;) {
        changed = false;
        for (const edge of graph.edges) if (needed.has(edge.to.nodeId) && !needed.has(edge.from.nodeId)) { needed.add(edge.from.nodeId); changed = true; }
    }
    const final = models.find(node => node.nodeId === terminal[0]?.from.nodeId);
    if (terminal.length !== 1 || final?.kind !== 'agent' || needed.size !== graph.nodes.length
        || plan.dependencyPins.some(pin => pin.port !== 'model' || pin.resourceRef.scope !== 'player' || typeof pin.resourceRef.runtimeRouteId !== 'string'
            || !canAddAgent && !models.some(node => node.dependencyPinIds.includes(pin.pinId)))) fail();
    return { ordered, models, planners, incoming, output, final, terminalNodeId: final.nodeId };
}

/** Narrow capability-mechanism recognition; an explicit text Result contract
 * is mandatory. This does not replace the existing pure Agent contract. */
export function isProjectDelegatedControlPlan(plan) {
    try { return projectDelegatedGraphProfile(plan).planners.length > 0; } catch { return false; }
}
