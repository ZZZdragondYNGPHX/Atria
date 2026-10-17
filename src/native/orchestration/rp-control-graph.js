import { hashNativeDocument as hash } from '../repositories/common.js';
import { nodeModelRoutePins } from '../../../public/shared/native-orchestration-contracts.js';
import { audienceContextPin } from './audience-source-contracts.js';
import { RP_REVIEW_REASON_CODES } from './rp-review-profile.js';

const fail = () => { throw Object.assign(new TypeError('native_orchestration_rp_control_graph_unavailable'), { code: 'native_orchestration_rp_control_graph_unavailable' }); };
const equal = (a, b) => hash(a) === hash(b);

/** Keep the existing response grammars where the published graph actually
 * declares those original relationships. This only selects a codec; its old
 * consumer still performs every original Source/capability/typed-edge check.
 * Other model DAGs use the dependency consumer below, without a shape limit. */
function existingResponseProtocol(graph) {
    const allowed = ['agent', 'review', 'judge', 'output'];
    if (graph.nodes.some(node => !allowed.includes(node.kind))) return true;
    const agents = graph.nodes.filter(node => node.kind === 'agent'), reviews = graph.nodes.filter(node => node.kind === 'review'),
        judges = graph.nodes.filter(node => node.kind === 'judge'), outputs = graph.nodes.filter(node => node.kind === 'output');
    if (!reviews.length && !judges.length && agents.length === 1) return true;
    if (outputs.length !== 1 || graph.graphChangePolicy.allowedOperations.length || graph.graphChangePolicy.allowedNodeKinds.length
        || graph.edges.some(edge => edge.condition !== 'always' || edge.loopBack)) return false;
    const output = outputs[0], terminal = graph.edges.filter(edge => edge.to.nodeId === output.nodeId);
    if (terminal.length !== 1) return false;
    const narrator = agents.find(node => node.nodeId === terminal[0].from.nodeId);
    if (!narrator) return false;
    const port = (ports, type, required) => ports.length === 1 && ports[0].type === type && (required === undefined || ports[0].required === required);
    const edge = (from, to) => graph.edges.filter(item => item.from.nodeId === from.nodeId && item.to.nodeId === to.nodeId).length === 1;
    if (!reviews.length && !judges.length) return agents.every(node => node.inputs.every(input => input.type === 'text' && input.required)
        && graph.edges.filter(item => item.to.nodeId === node.nodeId).length === node.inputs.length
        && new Set(graph.edges.filter(item => item.to.nodeId === node.nodeId).map(item => item.from.nodeId)).size === node.inputs.length)
        && graph.edges.every(item => item.maxVisits === 1);
    const drafts = agents.filter(node => node !== narrator);
    if (reviews.length === 1 && !judges.length && agents.length === 2 && graph.edges.length === 4 && graph.entryNodeIds.length === 1
        && graph.entryNodeIds[0] === drafts[0].nodeId && !drafts[0].inputs.length && port(drafts[0].outputs, 'text')
        && port(reviews[0].inputs, 'text', true) && port(reviews[0].outputs, 'json') && narrator.inputs.length === 2
        && narrator.inputs.every(input => input.required) && narrator.inputs.some(input => input.type === 'text') && narrator.inputs.some(input => input.type === 'json')
        && edge(drafts[0], reviews[0]) && edge(drafts[0], narrator) && edge(reviews[0], narrator)) return true;
    return judges.length === 1 && !reviews.length && agents.length === 3 && graph.edges.length === 6 && graph.entryNodeIds.length === 2
        && drafts.every(node => graph.entryNodeIds.includes(node.nodeId) && !node.inputs.length && port(node.outputs, 'text'))
        && judges[0].inputs.length === 2 && judges[0].inputs.every(input => input.type === 'text' && input.required) && port(judges[0].outputs, 'json')
        && narrator.inputs.length === 3 && narrator.inputs.filter(input => input.type === 'text' && !input.required).length === 2
        && narrator.inputs.filter(input => input.type === 'json' && input.required).length === 1
        && drafts.every(node => edge(node, judges[0]) && edge(node, narrator)) && edge(judges[0], narrator);
}

export function rpControlGraph(plan, { force = false } = {}) {
    const graph = plan.definition, planners = graph.nodes.filter(node => node.kind === 'planner');
    if (!force && (!planners.length ? existingResponseProtocol(graph)
        : !graph.nodes.some(node => ['review', 'judge'].includes(node.kind)) && planners.length === 1 && graph.entryNodeIds.length === 1
            && graph.entryNodeIds[0] === planners[0].nodeId && !graph.edges.some(edge => !edge.loopBack && edge.to.nodeId === planners[0].nodeId))) return null;
    const output = graph.nodes.find(node => node.nodeId === graph.outputContract.ownerNodeId);
    const terminal = graph.edges.filter(edge => edge.to.nodeId === output?.nodeId);
    const narrator = graph.nodes.find(node => node.nodeId === terminal[0]?.from.nodeId);
    if (graph.outputContract.kind !== 'rp_narration' || graph.outputContract.slot !== 'assistant' || graph.outputContract.allowPartial
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
        if (!['agent', 'planner', 'review', 'judge'].includes(node.kind) || node.outputs.length !== 1 || node.outputs[0].type !== (node.kind === 'agent' ? 'text' : 'json')
            || !equal([...node.capabilities].sort(), ['generation.send', ...node.kind === 'planner' ? ['graph.patch'] : [], ...retrieval.length ? ['memory.retrieve'] : []].sort())
            || !routes.length || node.dependencyPinIds.length !== routes.length + retrieval.length + Number(!!audience)) fail();
    }
    const used = new Set(models.flatMap(node => node.dependencyPinIds));
    if (plan.dependencyPins.some(pin => !used.has(pin.pinId)) || planners.length && !graph.graphChangePolicy.allowedOperations.length) fail();
    return { models, narrator, output };
}

export function rpControlPlannerTask(graph, dependencyPins) {
    return { kind: 'native_rp_graph_planner', instruction: 'Propose one bounded GraphPatch for this declared task using only the original graph policy and pinned dependencies. The proposal is not narration, permission, official facts, a budget extension or a domain write. Return only operations.',
        nodes: graph.nodes, edges: graph.edges, allowedOperations: graph.graphChangePolicy.allowedOperations,
        allowedNodeKinds: graph.graphChangePolicy.allowedNodeKinds, dependencyPins };
}

export const rpControlReviewOutputContract = Object.freeze({ name: 'atria_graph_review', schema: { type: 'object', properties: {
    decision: { type: 'string', enum: ['approve', 'rerun'] }, reasonCode: { type: 'string', enum: RP_REVIEW_REASON_CODES },
    targetAttemptIds: { type: 'array', minItems: 1, items: { type: 'string' } } }, required: ['decision', 'reasonCode', 'targetAttemptIds'], additionalProperties: false } });

export const rpControlJudgeOutputContract = Object.freeze({ name: 'atria_graph_judge', schema: { type: 'object', properties: {
    selectedResultRef: { type: 'object', properties: { runId: { type: 'string' }, resultId: { type: 'string' } }, required: ['runId', 'resultId'], additionalProperties: false },
    reasonCode: { type: 'string', enum: ['candidate_selected'] } }, required: ['selectedResultRef', 'reasonCode'], additionalProperties: false } });
