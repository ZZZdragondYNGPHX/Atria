import { hashNativeDocument as hash } from '../repositories/common.js';
import { nodeModelRoutePins } from '../../../public/shared/native-orchestration-contracts.js';
import { audienceContextPin } from './audience-source-contracts.js';

const fail = () => { throw Object.assign(new TypeError('native_orchestration_rp_control_graph_unavailable'), { code: 'native_orchestration_rp_control_graph_unavailable' }); };
const equal = (a, b) => hash(a) === hash(b);

/** Preserve the original explicit-loop/template consumer. A non-entry or
 * multiple Planner DAG uses dependency readiness, never a node-count template. */
export function rpControlGraph(plan, { force = false } = {}) {
    const graph = plan.definition, planners = graph.nodes.filter(node => node.kind === 'planner');
    if (!force && (!planners.length || planners.length === 1 && graph.entryNodeIds.length === 1
        && graph.entryNodeIds[0] === planners[0].nodeId && !graph.edges.some(edge => !edge.loopBack && edge.to.nodeId === planners[0].nodeId))) return null;
    const output = graph.nodes.find(node => node.nodeId === graph.outputContract.ownerNodeId);
    const terminal = graph.edges.filter(edge => edge.to.nodeId === output?.nodeId);
    const narrator = graph.nodes.find(node => node.nodeId === terminal[0]?.from.nodeId);
    if (!planners.length || graph.outputContract.kind !== 'rp_narration' || graph.outputContract.slot !== 'assistant' || graph.outputContract.allowPartial
        || output?.kind !== 'output' || graph.nodes.filter(node => node.kind === 'output').length !== 1 || terminal.length !== 1 || narrator?.kind !== 'agent'
        || !equal(output.capabilities, ['chat.output']) || output.dependencyPinIds.length || output.outputs.length
        || narrator.outputs.length !== 1 || narrator.outputs[0].type !== 'text'
        || audienceContextPin(narrator, plan.dependencyPins)?.resourceRef.audience.kind === 'actor'
        || graph.edges.some(edge => edge.loopBack || !['always', 'success'].includes(edge.condition)
            || edge.from.nodeId === output.nodeId || edge.from.nodeId === narrator.nodeId && edge.to.nodeId !== output.nodeId)) fail();
    const models = graph.nodes.filter(node => node !== output);
    for (const node of models) {
        const routes = nodeModelRoutePins(node, plan.dependencyPins), audience = audienceContextPin(node, plan.dependencyPins);
        const retrieval = plan.dependencyPins.filter(pin => node.dependencyPinIds.includes(pin.pinId) && pin.port === 'context'
            && pin.resourceRef.scope === 'player' && pin.resourceRef.retrievalProfileId);
        if (!['agent', 'planner'].includes(node.kind) || node.outputs.length !== 1 || node.outputs[0].type !== (node.kind === 'planner' ? 'json' : 'text')
            || !equal([...node.capabilities].sort(), ['generation.send', ...node.kind === 'planner' ? ['graph.patch'] : [], ...retrieval.length ? ['memory.retrieve'] : []].sort())
            || !routes.length || node.dependencyPinIds.length !== routes.length + retrieval.length + Number(!!audience)) fail();
    }
    const used = new Set(models.flatMap(node => node.dependencyPinIds));
    if (plan.dependencyPins.some(pin => !used.has(pin.pinId)) || !graph.graphChangePolicy.allowedOperations.length) fail();
    return { models, narrator, output };
}

export function rpControlPlannerTask(graph, dependencyPins) {
    return { kind: 'native_rp_graph_planner', instruction: 'Propose one bounded GraphPatch for this declared task using only the original graph policy and pinned dependencies. The proposal is not narration, permission, official facts, a budget extension or a domain write. Return only operations.',
        nodes: graph.nodes, edges: graph.edges, allowedOperations: graph.graphChangePolicy.allowedOperations,
        allowedNodeKinds: graph.graphChangePolicy.allowedNodeKinds, dependencyPins };
}
