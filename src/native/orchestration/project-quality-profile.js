import { equalNativeDocuments as equal } from '../repositories/common.js';
import { nodeModelRoutePins } from '../../../public/shared/native-orchestration-contracts.js';

const fail = () => { throw Object.assign(new TypeError('native_orchestration_project_quality_plan_unavailable'), { code: 'native_orchestration_project_quality_plan_unavailable' }); };
const one = (ports, type) => ports.length === 1 && ports[0].type === type;

/** Author-explicit conditional quality work. Pure recommendations and their
 * bounded review precede the original tool-bearing Task generation. */
export function projectQualityProfile(plan) {
    const graph = plan.definition, review = graph.nodes.find(node => node.kind === 'review');
    if (!review) return null;
    const draft = graph.nodes.find(node => graph.entryNodeIds.includes(node.nodeId));
    const worker = graph.nodes.find(node => node.kind === 'agent' && node !== draft), output = graph.nodes.find(node => node.kind === 'output');
    if (graph.nodes.length !== 4 || !draft || draft.kind !== 'agent' || !worker || !output || graph.entryNodeIds.length !== 1
        || draft.inputs.length || !one(draft.outputs, 'text') || !one(review.inputs, 'text') || !review.inputs[0].required || !one(review.outputs, 'json')
        || graph.outputContract.kind !== 'project_review' || graph.graphChangePolicy.allowedOperations.length || graph.limits.maxReviews < 1) fail();
    const loop = graph.edges.find(edge => edge.loopBack), rounds = Math.min(graph.limits.maxReviews, review.policy.maxRounds);
    const edge = (from, to, type) => graph.edges.find(item => !item.loopBack && item.from.nodeId === from.nodeId && item.to.nodeId === to.nodeId
        && from.outputs.some(port => port.name === item.from.port && port.type === type) && to.inputs.some(port => port.name === item.to.port && port.type === type));
    const reviewInput = edge(draft, review, 'text'), transfer = edge(draft, worker, 'text'), gate = edge(review, worker, 'json'), final = edge(worker, output, 'json');
    if (!reviewInput || !transfer || !gate || !final || graph.edges.length !== 4 + (loop ? 1 : 0)
        || [reviewInput, transfer, gate, final].some(item => !['always', 'success'].includes(item.condition))
        || reviewInput.maxVisits < rounds || transfer.maxVisits !== 1 || gate.maxVisits !== 1 || final.maxVisits !== 1
        || worker.inputs.length !== (loop ? 3 : 2) || [transfer, gate].some(item => !worker.inputs.some(port => port.name === item.to.port && port.required === !loop))
        || loop && (loop.from.nodeId !== worker.nodeId || loop.to.nodeId !== worker.nodeId)) fail();
    for (const node of [draft, review]) {
        if (!equal(node.capabilities, ['generation.send']) || !nodeModelRoutePins(node, plan.dependencyPins).length
            || node.dependencyPinIds.length !== nodeModelRoutePins(node, plan.dependencyPins).length) fail();
    }
    const used = new Set([draft, review, worker].flatMap(node => node.dependencyPinIds));
    if (plan.dependencyPins.some(pin => !used.has(pin.pinId))) fail();
    const definition = { ...graph, nodes: [{ ...worker, inputs: loop ? worker.inputs.filter(port => port.name === loop.to.port) : [] }, output],
        entryNodeIds: [worker.nodeId], edges: [final, ...loop ? [loop] : []] };
    return { draft, review, worker, reviewInput, transfer, gate, final, rounds,
        executionPlan: { ...plan, definition, dependencyPins: plan.dependencyPins.filter(pin => worker.dependencyPinIds.includes(pin.pinId)) } };
}

export const PROJECT_QUALITY_REASONS = Object.freeze(['quality_ready', 'incomplete_proposal', 'source_inconsistent', 'unsupported_change', 'validation_missing']);
export const projectQualityOutputContract = Object.freeze({ name: 'atria_project_quality_review', schema: { type: 'object',
    properties: { decision: { type: 'string', enum: ['approve', 'rerun'] }, reasonCode: { type: 'string', enum: PROJECT_QUALITY_REASONS } },
    required: ['decision', 'reasonCode'], additionalProperties: false } });
