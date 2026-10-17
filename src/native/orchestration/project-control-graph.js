import { hashNativeDocument as hash } from '../repositories/common.js';
import { nodeModelRoutePins } from '../../../public/shared/native-orchestration-contracts.js';

const fail = () => { throw Object.assign(new TypeError('native_orchestration_project_control_graph_unavailable'), { code: 'native_orchestration_project_control_graph_unavailable' }); };
const equal = (a, b) => hash(a) === hash(b);

/** Domain admission only: arbitrary declared pure Agent/Planner dependencies
 * feed the original tool-bearing Task owner. No graph ordering lives here. */
export function projectControlGraph(plan) {
    const graph = plan.definition, output = graph.nodes.find(node => node.nodeId === graph.outputContract.ownerNodeId);
    const terminal = graph.edges.filter(edge => !edge.loopBack && edge.to.nodeId === output?.nodeId);
    const worker = graph.nodes.find(node => node.nodeId === terminal[0]?.from.nodeId);
    if (graph.outputContract.kind !== 'project_review' || !output || output.kind !== 'output' || terminal.length !== 1 || worker?.kind !== 'agent'
        || graph.nodes.filter(node => node.kind === 'output').length !== 1 || worker.outputs.length !== 1 || worker.outputs[0].type !== 'json') fail();
    const pure = graph.nodes.filter(node => node !== output && node !== worker), pins = nodeModelRoutePins(worker, plan.dependencyPins);
    if (!pure.length || !pins.length || graph.entryNodeIds.some(id => !pure.some(node => node.nodeId === id))) fail();
    for (const node of pure) {
        if (!['agent', 'planner', 'review'].includes(node.kind) || node.outputs.length !== 1 || node.outputs[0].type !== (node.kind === 'agent' ? 'text' : 'json')
            || !equal(node.capabilities, ['generation.send', ...node.kind === 'planner' ? ['graph.patch'] : []])
            || !nodeModelRoutePins(node, plan.dependencyPins).length || node.dependencyPinIds.length !== nodeModelRoutePins(node, plan.dependencyPins).length) fail();
        if (node.kind === 'planner' && !graph.graphChangePolicy.allowedOperations.length) fail();
    }
    for (const edge of graph.edges) {
        if (!['always', 'success'].includes(edge.condition)) fail();
        if (edge.loopBack && (edge.from.nodeId !== edge.to.nodeId || ![worker, ...pure.filter(node => node.kind === 'planner')].some(node => node.nodeId === edge.from.nodeId)
            || edge.condition !== 'always' || edge.maxVisits > graph.limits.maxLoopIterations)) fail();
        if (!edge.loopBack && edge.from.nodeId === worker.nodeId && edge.to.nodeId !== output.nodeId) fail();
    }
    const loop = graph.edges.find(edge => edge.loopBack && edge.to.nodeId === worker.nodeId);
    const used = new Set(graph.nodes.flatMap(node => node.dependencyPinIds));
    if (plan.dependencyPins.some(pin => !used.has(pin.pinId))) fail();
    const definition = { ...graph, nodes: [{ ...worker, inputs: loop ? worker.inputs.filter(port => port.name === loop.to.port) : [] }, output],
        entryNodeIds: [worker.nodeId], edges: [terminal[0], ...loop ? [loop] : []], capabilityCeiling: worker.capabilities,
        graphChangePolicy: { allowedOperations: [], allowedNodeKinds: [] } };
    return { pure, worker, output, executionPlan: { ...plan, definition, dependencyPins: plan.dependencyPins.filter(pin => worker.dependencyPinIds.includes(pin.pinId)) } };
}

export const projectPlannerOutputContract = Object.freeze({ name: 'atria_project_graph_patch', schema: { type: 'object', properties: {
    operations: { type: 'array', minItems: 1, items: { type: 'object' } } }, required: ['operations'], additionalProperties: false } });

export const projectGraphReviewOutputContract = Object.freeze({ name: 'atria_project_graph_review', schema: { type: 'object', properties: {
    decision: { type: 'string', enum: ['approve', 'rerun'] }, reasonCode: { type: 'string' },
    targetAttemptIds: { type: 'array', minItems: 1, items: { type: 'string' } } }, required: ['decision', 'reasonCode', 'targetAttemptIds'], additionalProperties: false } });
