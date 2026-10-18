import { hashNativeDocument as hash } from '../repositories/common.js';
import { nodeModelRoutePins, assertResultPolicy } from '../../../public/shared/native-orchestration-contracts.js';
import { delegatedRpSourcePins } from './delegated-source-contracts.js';

const equal = (a, b) => hash(a) === hash(b);
const fail = () => { throw Object.assign(new TypeError('native_orchestration_rp_child_control_unavailable'), { code: 'native_orchestration_rp_child_control_unavailable' }); };

/** Published task-local Planner controls. Other child combinations remain
 * explicitly unsupported; this supplies neither a grant nor a writer. */
export function rpDelegatedControlProfile(plan) {
    const graph = plan.definition, planners = graph.nodes.filter(node => node.kind === 'planner');
    if (!planners.length) return null;
    const agents = graph.nodes.filter(node => node.kind === 'agent'), outputs = graph.nodes.filter(node => node.kind === 'output');
    const terminal = agents[0], output = outputs[0];
    if (agents.length !== 1 || outputs.length !== 1 || graph.nodes.length !== planners.length + 2
        || graph.outputContract.kind !== 'result' || graph.outputContract.allowPartial || assertResultPolicy(graph.outputContract).outputType !== 'text'
        || output.nodeId !== graph.outputContract.ownerNodeId || output.capabilities.length || output.dependencyPinIds.length || output.outputs.length
        || !equal([...graph.capabilityCeiling].sort(), ['generation.send', 'graph.patch'].sort())
        || !graph.graphChangePolicy.allowedOperations.length || graph.graphChangePolicy.allowedNodeKinds.length
        || graph.graphChangePolicy.allowedOperations.some(op => !['setPendingPriority', 'markBlocked', 'requestReplan', 'requestFinalize'].includes(op))) fail();
    const models = [...planners, terminal], sources = delegatedRpSourcePins(plan);
    for (const node of models) {
        const routes = nodeModelRoutePins(node, plan.dependencyPins), sourcePins = sources.filter(pin => node.dependencyPinIds.includes(pin.pinId));
        if (!equal([...node.capabilities].sort(), ['generation.send', ...node.kind === 'planner' ? ['graph.patch'] : []].sort())
            || node.outputs.length !== 1 || node.outputs[0].type !== (node.kind === 'planner' ? 'json' : 'text')
            || !routes.length || sourcePins.length !== sources.length || node.dependencyPinIds.length !== routes.length + sourcePins.length) fail();
    }
    const terminalEdges = graph.edges.filter(edge => edge.to.nodeId === output.nodeId);
    if (terminalEdges.length !== 1 || terminalEdges[0].from.nodeId !== terminal.nodeId
        || graph.edges.some(edge => !['always', 'success'].includes(edge.condition) || edge.from.nodeId === output.nodeId
            || edge.from.nodeId === terminal.nodeId && edge.to.nodeId !== output.nodeId
            || edge.loopBack && (edge.from.nodeId !== edge.to.nodeId || !planners.some(node => node.nodeId === edge.from.nodeId)))) fail();
    const used = new Set(models.flatMap(node => node.dependencyPinIds));
    if (plan.dependencyPins.some(pin => !used.has(pin.pinId))) fail();
    const needed = new Set([output.nodeId]);
    for (let changed = true; changed;) {
        changed = false;
        for (const edge of graph.edges) if (!edge.loopBack && needed.has(edge.to.nodeId) && !needed.has(edge.from.nodeId)) {
            needed.add(edge.from.nodeId); changed = true;
        }
    }
    if (needed.size !== graph.nodes.length || graph.entryNodeIds.some(id => !planners.some(node => node.nodeId === id))) fail();
    return { models, planners, narrator: terminal, output, terminalNodeId: terminal.nodeId, fanouts: [] };
}
