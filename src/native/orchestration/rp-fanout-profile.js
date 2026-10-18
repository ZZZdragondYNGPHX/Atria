import { equalNativeDocuments as same } from '../repositories/common.js';
import { nodeModelRoutePins } from '../../../public/shared/native-orchestration-contracts.js';
import { audienceContextPin } from './audience-source-contracts.js';

const fail = () => { throw Object.assign(new TypeError('native_orchestration_rp_fanout_unavailable'), { code: 'native_orchestration_rp_fanout_unavailable' }); };

/** One explicit same-Source advisory group using the original Join policies.
 * Other graph shapes do not acquire an implicit RP consumer. */
export function rpFanoutProfile(plan) {
    const graph = plan.definition;
    if (!graph.nodes.some(node => ['fanout', 'join'].includes(node.kind))) return null;
    const fanouts = graph.nodes.filter(node => node.kind === 'fanout'), joins = graph.nodes.filter(node => node.kind === 'join');
    const agents = graph.nodes.filter(node => node.kind === 'agent'), outputs = graph.nodes.filter(node => node.kind === 'output');
    if (fanouts.length !== 1 || joins.length !== 1 || outputs.length !== 1 || agents.length < 3 || graph.nodes.length !== agents.length + 3
        || graph.outputContract.kind !== 'rp_narration' || graph.graphChangePolicy.allowedOperations.length || graph.graphChangePolicy.allowedNodeKinds.length) fail();
    const [fanout] = fanouts, [join] = joins, [output] = outputs;
    if (!same(graph.entryNodeIds, [fanout.nodeId]) || fanout.inputs.length || fanout.outputs.length !== 1 || fanout.outputs[0].type !== 'task.result'
        || !['continue', 'fail_fast'].includes(fanout.policy.failurePolicy) || fanout.capabilities.length || fanout.dependencyPinIds.length
        || join.capabilities.length || join.dependencyPinIds.length || join.outputs.length !== 1 || join.outputs[0].type !== 'text') fail();
    const joinEdges = graph.edges.filter(edge => edge.from.nodeId === join.nodeId), terminal = graph.edges.filter(edge => edge.to.nodeId === output.nodeId);
    const narrator = joinEdges.length === 1 ? agents.find(node => node.nodeId === joinEdges[0].to.nodeId) : null;
    const branches = agents.filter(node => node !== narrator).sort((a, b) => a.nodeId.localeCompare(b.nodeId));
    if (!narrator || terminal.length !== 1 || terminal[0].from.nodeId !== narrator.nodeId || graph.edges.length !== branches.length * 2 + 2
        || join.inputs.length !== branches.length || join.policy.quorum > branches.length) fail();
    const transfers = [], members = [];
    for (const node of agents) {
        const pins = nodeModelRoutePins(node, plan.dependencyPins);
        if (!pins.length || node.dependencyPinIds.length !== pins.length + (audienceContextPin(node, plan.dependencyPins) ? 1 : 0) || !same(node.capabilities, ['generation.send'])
            || node.outputs.length !== 1 || node.outputs[0].type !== 'text' || node.inputs.length !== 1 || !node.inputs[0].required
            || node.inputs[0].type !== (node === narrator ? 'text' : 'task.result')) fail();
        const incoming = graph.edges.filter(edge => edge.to.nodeId === node.nodeId), outgoing = graph.edges.filter(edge => edge.from.nodeId === node.nodeId);
        if (incoming.length !== 1 || outgoing.length !== 1 || incoming[0].to.port !== node.inputs[0].name || outgoing[0].from.port !== node.outputs[0].name) fail();
        if (node !== narrator) {
            if (incoming[0].from.nodeId !== fanout.nodeId || outgoing[0].to.nodeId !== join.nodeId) fail();
            transfers.push(incoming[0]); members.push(outgoing[0]);
        }
    }
    for (const edge of graph.edges) {
        const from = graph.nodes.find(node => node.nodeId === edge.from.nodeId), to = graph.nodes.find(node => node.nodeId === edge.to.nodeId);
        const source = from?.outputs.find(port => port.name === edge.from.port), target = to?.inputs.find(port => port.name === edge.to.port);
        if (edge.loopBack || edge.maxVisits !== 1 || edge.condition !== 'always' || !source || !target?.required || source.type !== target.type) fail();
    }
    if (new Set(members.map(edge => edge.to.port)).size !== branches.length || graph.edges.some(edge => edge.from.nodeId === output.nodeId)
        || plan.dependencyPins.some(pin => !agents.some(node => node.dependencyPinIds.includes(pin.pinId)))) fail();
    return { fanout, join, branches, transfers, members, transfer: joinEdges[0], narration: { ...plan, definition: { ...graph,
        nodes: [{ ...narrator, inputs: [] }, output], entryNodeIds: [narrator.nodeId], edges: terminal,
        capabilityCeiling: [...new Set([...narrator.capabilities, ...output.capabilities])] },
    dependencyPins: plan.dependencyPins.filter(pin => narrator.dependencyPinIds.includes(pin.pinId)) } };
}
