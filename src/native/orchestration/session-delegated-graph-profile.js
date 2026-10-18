import { hashNativeDocument as hash } from '../repositories/common.js';
import { nodeModelRoutePins } from '../../../public/shared/native-orchestration-contracts.js';
import { audienceContextPin } from './audience-source-contracts.js';

const equal = (a, b) => hash(a) === hash(b);
const fail = () => { throw Object.assign(new TypeError('native_orchestration_session_child_graph_unavailable'), { code: 'native_orchestration_session_child_graph_unavailable' }); };

/** Original published child Model dependencies. This projection neither grants
 * graph.patch nor changes the original delegated capability intersection. */
export function sessionDelegatedGraphProfile(plan) {
    const graph = plan.definition, models = graph.nodes.filter(node => ['agent', 'planner'].includes(node.kind));
    const planners = models.filter(node => node.kind === 'planner'), outputs = graph.nodes.filter(node => node.kind === 'output');
    if (!models.some(node => node.kind === 'agent') || outputs.length !== 1 || graph.nodes.length !== models.length + 1
        || graph.outputContract.kind !== 'result' || graph.outputContract.allowPartial || graph.outputContract.resultPolicy?.outputType !== 'text'
        || !equal([...graph.capabilityCeiling].sort(), ['generation.send', ...planners.length ? ['graph.patch'] : []].sort())
        || graph.graphChangePolicy.allowedNodeKinds.length || (!planners.length ? graph.graphChangePolicy.allowedOperations.length
        : !graph.graphChangePolicy.allowedOperations.length || graph.graphChangePolicy.allowedOperations.some(op => !['setPendingPriority', 'requestReplan', 'requestFinalize'].includes(op)))
        || graph.nodes.some(node => node.policy.allowedPlanPinIds?.length)) fail();
    const output = outputs[0], incoming = {}, ordered = [];
    if (output.nodeId !== graph.outputContract.ownerNodeId || output.capabilities.length || output.dependencyPinIds.length
        || output.inputs.length !== 1 || output.inputs[0].type !== 'text' || !output.inputs[0].required || output.outputs.length) fail();
    for (const node of models) {
        const routes = nodeModelRoutePins(node, plan.dependencyPins);
        if (routes.length !== 1 || node.dependencyPinIds.length !== 2 || !audienceContextPin(node, plan.dependencyPins)
            || !equal(node.capabilities, ['generation.send', ...node.kind === 'planner' ? ['graph.patch'] : []])
            || node.outputs.length !== 1 || node.outputs[0].type !== (node.kind === 'planner' ? 'json' : 'text')
            || node.inputs.some(port => !['text', ...planners.length ? ['json'] : []].includes(port.type)
                || !port.required && !graph.edges.some(edge => edge.loopBack && edge.to.nodeId === node.nodeId && edge.to.port === port.name))) fail();
        incoming[node.nodeId] = graph.edges.filter(edge => !edge.loopBack && edge.to.nodeId === node.nodeId).toSorted((a, b) => a.edgeId.localeCompare(b.edgeId));
        if (new Set(incoming[node.nodeId].map(edge => edge.from.nodeId)).size !== incoming[node.nodeId].length
            || node.inputs.some(port => graph.edges.filter(edge => edge.to.nodeId === node.nodeId && edge.to.port === port.name).length !== 1)) fail();
    }
    for (const edge of graph.edges) {
        const from = models.find(node => node.nodeId === edge.from.nodeId), to = graph.nodes.find(node => node.nodeId === edge.to.nodeId);
        if (!from || !to || !['always', 'success'].includes(edge.condition)
            || edge.loopBack && (from.kind !== 'planner' || from !== to || edge.condition !== 'always' || to.inputs.find(port => port.name === edge.to.port)?.required)
            || !planners.length && edge.maxVisits !== 1 || edge.from.port !== from.outputs[0].name
            || !to.inputs.some(port => port.name === edge.to.port && port.type === from.outputs[0].type)) fail();
    }
    if (!equal([...graph.entryNodeIds].sort(), models.filter(node => !incoming[node.nodeId].length).map(node => node.nodeId).sort())) fail();
    while (ordered.length < models.length) {
        const node = models.find(node => !ordered.includes(node) && incoming[node.nodeId].every(edge => ordered.some(from => from.nodeId === edge.from.nodeId)));
        if (!node) fail(); ordered.push(node);
    }
    const terminal = graph.edges.filter(edge => edge.to.nodeId === output.nodeId);
    if (terminal.length !== 1 || terminal[0].from.nodeId !== ordered.at(-1).nodeId || ordered.at(-1).kind !== 'agent'
        || models.some(node => !graph.edges.some(edge => edge.from.nodeId === node.nodeId))
        || plan.dependencyPins.some(pin => !models.some(node => node.dependencyPinIds.includes(pin.pinId)))) fail();
    return { ordered, models, planners, incoming, output, final: ordered.at(-1), terminalNodeId: ordered.at(-1).nodeId };
}
