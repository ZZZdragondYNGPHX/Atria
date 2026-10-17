import { hashNativeDocument as hash } from '../repositories/common.js';
import { nodeModelRoutePins } from '../../../public/shared/native-orchestration-contracts.js';

const fail = () => { throw Object.assign(new TypeError('native_orchestration_rp_judge_plan_unavailable'), { code: 'native_orchestration_rp_judge_plan_unavailable' }); };
const one = (ports, type) => ports.length === 1 && ports[0].type === type;

/** Two explicit independent candidates, a quality selection, and one original
 * Narrator. Each candidate declares both consumers before it is produced. */
export function rpJudgeProfile(plan) {
    const graph = plan.definition, judge = graph.nodes.find(node => node.kind === 'judge');
    if (!judge) return null;
    const candidates = graph.entryNodeIds.map(id => graph.nodes.find(node => node.nodeId === id));
    const narrator = graph.nodes.find(node => node.kind === 'agent' && !graph.entryNodeIds.includes(node.nodeId));
    const output = graph.nodes.find(node => node.kind === 'output');
    if (graph.nodes.length !== 5 || candidates.length !== 2 || candidates.some(node => node?.kind !== 'agent' || node.inputs.length || !one(node.outputs, 'text'))
        || !narrator || !output || graph.edges.length !== 6 || graph.outputContract.kind !== 'rp_narration'
        || judge.inputs.length !== 2 || judge.inputs.some(port => port.type !== 'text' || !port.required) || !one(judge.outputs, 'json') || narrator.inputs.length !== 3
        || narrator.inputs.filter(port => port.type === 'text' && !port.required).length !== 2 || narrator.inputs.filter(port => port.type === 'json' && port.required).length !== 1
        || graph.graphChangePolicy.allowedOperations.length || graph.graphChangePolicy.allowedNodeKinds.length || graph.limits.maxAttempts < 5) fail();
    for (const node of [...candidates, judge]) {
        if (hash(node.capabilities) !== hash(['generation.send']) || !nodeModelRoutePins(node, plan.dependencyPins).length
            || node.dependencyPinIds.length !== nodeModelRoutePins(node, plan.dependencyPins).length) fail();
    }
    const edge = (from, to, type) => graph.edges.find(item => item.from.nodeId === from.nodeId && item.to.nodeId === to.nodeId
        && from.outputs.some(port => port.name === item.from.port && port.type === type) && to.inputs.some(port => port.name === item.to.port && port.type === type));
    const inputs = candidates.map(node => edge(node, judge, 'text')), transfers = candidates.map(node => edge(node, narrator, 'text'));
    const gate = edge(judge, narrator, 'json'), edges = [...inputs, ...transfers, gate];
    if (edges.some(item => !item || item.condition !== 'always' || item.loopBack || item.maxVisits !== 1) || new Set(edges).size !== 5
        || inputs[0].to.port === inputs[1].to.port || transfers[0].to.port === transfers[1].to.port) fail();
    const used = new Set([...candidates, judge, narrator].flatMap(node => node.dependencyPinIds));
    if (plan.dependencyPins.some(pin => !used.has(pin.pinId))) fail();
    return { candidates, judge, inputs, transfers, gate, narration: { ...plan, definition: { ...graph,
        nodes: [{ ...narrator, inputs: [] }, output], entryNodeIds: [narrator.nodeId], edges: graph.edges.filter(item => !edges.includes(item)) },
    dependencyPins: plan.dependencyPins.filter(pin => narrator.dependencyPinIds.includes(pin.pinId)) } };
}

export const rpJudgeOutputContract = Object.freeze({ name: 'atria_graph_judge', schema: { type: 'object', properties: {
    selectedCandidate: { type: 'integer', enum: [0, 1] }, reasonCode: { type: 'string', enum: ['candidate_selected'] } },
required: ['selectedCandidate', 'reasonCode'], additionalProperties: false } });
