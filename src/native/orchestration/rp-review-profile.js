import { equalNativeDocuments } from '../repositories/common.js';
import { nodeModelRoutePins } from '../../../public/shared/native-orchestration-contracts.js';
import { audienceContextPin } from './audience-source-contracts.js';

const fail = () => { throw Object.assign(new TypeError('native_orchestration_rp_review_plan_unavailable'), { code: 'native_orchestration_rp_review_plan_unavailable' }); };
const one = (ports, type) => ports.length === 1 && ports[0].type === type;

/** The draft explicitly shares with BOTH Review and Narrator. A Model review
 * cannot create a recipient, launder a summary or approve a domain Effect. */
export function rpReviewProfile(plan) {
    const graph = plan.definition, review = graph.nodes.find(node => node.kind === 'review');
    if (!review) return null;
    const draft = graph.nodes.find(node => graph.entryNodeIds.includes(node.nodeId)), agents = graph.nodes.filter(node => node.kind === 'agent');
    const narrator = agents.find(node => node !== draft), output = graph.nodes.find(node => node.kind === 'output');
    if (graph.nodes.length !== 4 || agents.length !== 2 || !draft || draft.kind !== 'agent' || !narrator || !output || graph.edges.length !== 4
        || graph.outputContract.kind !== 'rp_narration' || !equalNativeDocuments(graph.entryNodeIds, [draft.nodeId]) || draft.inputs.length || !one(draft.outputs, 'text')
        || !one(review.inputs, 'text') || !review.inputs[0].required || !one(review.outputs, 'json') || narrator.inputs.length !== 2
        || narrator.inputs.some(port => !port.required) || !narrator.inputs.some(port => port.type === 'text') || !narrator.inputs.some(port => port.type === 'json')
        || graph.graphChangePolicy.allowedOperations.length || graph.graphChangePolicy.allowedNodeKinds.length || graph.limits.maxReviews < 1 || graph.limits.maxAttempts < 4) fail();
    for (const node of [draft, review]) {
        const retrievalPins = node.capabilities.includes('memory.retrieve') ? plan.dependencyPins.filter(pin => node.dependencyPinIds.includes(pin.pinId)
            && pin.port === 'context' && pin.resourceRef.scope === 'player' && pin.resourceRef.retrievalProfileId) : [];
        if (!equalNativeDocuments([...node.capabilities].sort(), ['generation.send', ...retrievalPins.length ? ['memory.retrieve'] : []].sort()) || !nodeModelRoutePins(node, plan.dependencyPins).length
            || node.dependencyPinIds.length !== nodeModelRoutePins(node, plan.dependencyPins).length + retrievalPins.length + (audienceContextPin(node, plan.dependencyPins) ? 1 : 0)) fail();
    }
    const edge = (from, to, type) => graph.edges.find(item => item.from.nodeId === from.nodeId && item.to.nodeId === to.nodeId
        && from.outputs.some(port => port.name === item.from.port && port.type === type) && to.inputs.some(port => port.name === item.to.port && port.type === type));
    const reviewInput = edge(draft, review, 'text'), transfer = edge(draft, narrator, 'text'), reviewGate = edge(review, narrator, 'json');
    if (!reviewInput || !transfer || !reviewGate || [reviewInput, transfer, reviewGate].some(item => item.condition !== 'always' || item.loopBack)
        || transfer.maxVisits !== 1 || reviewGate.maxVisits !== 1) fail();
    const used = new Set([...draft.dependencyPinIds, ...review.dependencyPinIds, ...narrator.dependencyPinIds]);
    if (plan.dependencyPins.some(pin => !used.has(pin.pinId))) fail();
    return { draft, review, transfer, reviewInput, reviewGate, narration: { ...plan, definition: { ...graph, nodes: [{ ...narrator, inputs: [] }, output], capabilityCeiling: [...new Set([...narrator.capabilities, ...output.capabilities])], entryNodeIds: [narrator.nodeId],
        edges: graph.edges.filter(item => ![reviewInput, transfer, reviewGate].includes(item)) }, dependencyPins: plan.dependencyPins.filter(pin => narrator.dependencyPinIds.includes(pin.pinId)) } };
}

// Fixed control labels cannot carry a summary of an invalidated/private body
// back to a producer that was never a Result recipient.
export const RP_REVIEW_REASON_CODES = Object.freeze(['quality_ready', 'draft_incomplete', 'source_inconsistent', 'unsupported_facts', 'agency_violation', 'style_mismatch', 'unclear_motivation']);
export const rpReviewOutputContract = Object.freeze({ name: 'atria_graph_review', schema: { type: 'object', properties: {
    decision: { type: 'string', enum: ['approve', 'rerun'] }, reasonCode: { type: 'string', enum: RP_REVIEW_REASON_CODES } }, required: ['decision', 'reasonCode'], additionalProperties: false } });
