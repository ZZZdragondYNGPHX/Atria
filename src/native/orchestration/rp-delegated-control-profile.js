import { hashNativeDocument as hash } from '../repositories/common.js';
import { nodeModelRoutePins, assertResultPolicy } from '../../../public/shared/native-orchestration-contracts.js';
import { delegatedRpSourcePins } from './delegated-source-contracts.js';
import { rpControlReplanScope } from './rp-control-graph.js';

const equal = (a, b) => hash(a) === hash(b);
const fail = () => { throw Object.assign(new TypeError('native_orchestration_rp_child_control_unavailable'), { code: 'native_orchestration_rp_child_control_unavailable' }); };

/** Published task-local pure Model DAG. Source, Route, Scheduler and held child
 * bank admission stay in the original captured delegation, not this shape. */
export function rpDelegatedControlProfile(plan) {
    const graph = plan.definition, planners = graph.nodes.filter(node => node.kind === 'planner');
    if (!graph.nodes.some(node => ['planner', 'review', 'judge'].includes(node.kind))
        && graph.nodes.filter(node => node.kind === 'agent').length < 2) return null;
    const models = graph.nodes.filter(node => ['agent', 'planner', 'review', 'judge'].includes(node.kind)), agents = models.filter(node => node.kind === 'agent');
    const outputs = graph.nodes.filter(node => node.kind === 'output'), output = outputs[0], sources = delegatedRpSourcePins(plan);
    if (!agents.length || outputs.length !== 1 || graph.nodes.length !== models.length + 1
        || graph.outputContract.kind !== 'result' || graph.outputContract.allowPartial || assertResultPolicy(graph.outputContract).outputType !== 'text'
        || output.nodeId !== graph.outputContract.ownerNodeId || output.capabilities.length || output.dependencyPinIds.length || output.outputs.length
        || output.inputs.length !== 1 || !output.inputs[0].required || output.inputs[0].type !== 'text'
        || !equal([...graph.capabilityCeiling].sort(), ['generation.send', ...planners.length ? ['graph.patch'] : []].sort())
        || planners.length && !graph.graphChangePolicy.allowedOperations.length || graph.graphChangePolicy.allowedNodeKinds.some(kind => kind !== 'agent')
        || graph.graphChangePolicy.allowedOperations.some(op => !['addNode', 'addEdge', 'setPendingPriority', 'markBlocked', 'requestReplan', 'requestFinalize'].includes(op))) fail();
    const incoming = {}, ordered = [];
    for (const node of models) {
        const routes = nodeModelRoutePins(node, plan.dependencyPins), sourcePins = sources.filter(pin => node.dependencyPinIds.includes(pin.pinId));
        if (!equal([...node.capabilities].sort(), ['generation.send', ...node.kind === 'planner' ? ['graph.patch'] : []].sort())
            || node.outputs.length !== 1 || node.outputs[0].type !== (node.kind === 'agent' ? 'text' : 'json')
            || !routes.length || sourcePins.length !== sources.length || node.dependencyPinIds.length !== routes.length + sourcePins.length
            || node.inputs.some(port => !['text', 'json'].includes(port.type))) fail();
        incoming[node.nodeId] = graph.edges.filter(edge => !edge.loopBack && edge.to.nodeId === node.nodeId);
        if (node.inputs.some(port => graph.edges.filter(edge => edge.to.nodeId === node.nodeId && edge.to.port === port.name).length > 1
            || port.required && !incoming[node.nodeId].some(edge => edge.to.port === port.name))) fail();
    }
    for (const edge of graph.edges) {
        const from = models.find(node => node.nodeId === edge.from.nodeId), to = graph.nodes.find(node => node.nodeId === edge.to.nodeId);
        if (!from || !to || !['always', 'success'].includes(edge.condition)
            || edge.from.port !== from.outputs[0].name || !to.inputs.some(port => port.name === edge.to.port && port.type === from.outputs[0].type)
            || edge.loopBack && (from.kind !== 'planner' || !['agent', 'planner'].includes(to.kind) || edge.condition !== 'always'
                || to.inputs.find(port => port.name === edge.to.port).required)) fail();
    }
    const terminalEdges = graph.edges.filter(edge => edge.to.nodeId === output.nodeId), terminal = models.find(node => node.nodeId === terminalEdges[0]?.from.nodeId);
    if (terminalEdges.length !== 1 || terminal?.kind !== 'agent') fail();
    const used = new Set(models.flatMap(node => node.dependencyPinIds));
    const canAddAgent = graph.graphChangePolicy.allowedOperations.includes('addNode') && graph.graphChangePolicy.allowedNodeKinds.includes('agent');
    if (plan.dependencyPins.some(pin => !used.has(pin.pinId) && (!canAddAgent || pin.port !== 'model' || pin.resourceRef.scope !== 'player'))) fail();
    const needed = new Set([output.nodeId]);
    for (let changed = true; changed;) {
        changed = false;
        for (const edge of graph.edges) if (!edge.loopBack && needed.has(edge.to.nodeId) && !needed.has(edge.from.nodeId)) {
            needed.add(edge.from.nodeId); changed = true;
        }
    }
    if (needed.size !== graph.nodes.length || !equal([...graph.entryNodeIds].sort(), models.filter(node => !incoming[node.nodeId].length).map(node => node.nodeId).sort())) fail();
    while (ordered.length < models.length) {
        const next = models.find(node => !ordered.includes(node) && incoming[node.nodeId].every(edge => ordered.some(from => from.nodeId === edge.from.nodeId)));
        if (!next) fail(); ordered.push(next);
    }
    for (const loop of graph.edges.filter(edge => edge.loopBack)) rpControlReplanScope(graph, loop.from.nodeId);
    return { models, planners, narrator: terminal, output, terminalNodeId: terminal.nodeId, incoming, ordered, fanouts: [] };
}
