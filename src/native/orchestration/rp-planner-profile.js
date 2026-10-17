import { hashNativeDocument as hash } from '../repositories/common.js';
import { nodeModelRoutePins } from '../../../public/shared/native-orchestration-contracts.js';

const allowed = ['setPendingPriority', 'markBlocked', 'requestFinalize', 'requestReplan'];
const fail = () => { throw Object.assign(new TypeError('native_orchestration_rp_planner_plan_unavailable'), { code: 'native_orchestration_rp_planner_plan_unavailable' }); };

/** The initial RP Planner producer shares only the original Narrator audience.
 * It proposes bounded Host control; no actor, tool or domain grant is inferred. */
export function rpPlannerProfile(plan) {
    const graph = plan.definition, planner = graph.nodes.find(node => node.kind === 'planner');
    if (!planner) return null;
    const narrator = graph.nodes.find(node => node.kind === 'agent'), output = graph.nodes.find(node => node.kind === 'output');
    const loops = graph.edges.filter(edge => edge.loopBack), loop = loops[0];
    if (loops.length > 1 || loop && (loop.from.nodeId !== planner.nodeId || loop.to.nodeId !== planner.nodeId
        || loop.from.port !== planner.outputs[0]?.name || loop.condition !== 'always' || loop.maxVisits > graph.limits.maxLoopIterations
        || planner.inputs.length !== 1 || planner.inputs[0].name !== loop.to.port || planner.inputs[0].type !== 'json' || planner.inputs[0].required)) fail();
    if (graph.nodes.length !== 3 || !narrator || !output || graph.outputContract.kind !== 'rp_narration' || graph.edges.length !== 2 + loops.length || hash(graph.entryNodeIds) !== hash([planner.nodeId])
        || !loop && planner.inputs.length || planner.outputs.length !== 1 || planner.outputs[0].type !== 'json'
        || narrator.inputs.length !== 1 || narrator.inputs[0].type !== 'json' || !narrator.inputs[0].required
        || hash([...planner.capabilities].sort()) !== hash(['generation.send', 'graph.patch'].sort())
        || !nodeModelRoutePins(planner, plan.dependencyPins).length
        || planner.dependencyPinIds.length !== nodeModelRoutePins(planner, plan.dependencyPins).length
        || graph.graphChangePolicy.allowedNodeKinds.length || !graph.graphChangePolicy.allowedOperations.length
        || graph.graphChangePolicy.allowedOperations.some(op => !allowed.includes(op))) fail();
    const transfer = graph.edges.find(edge => edge.from.nodeId === planner.nodeId && edge.to.nodeId === narrator.nodeId);
    if (!transfer || transfer.from.port !== planner.outputs[0].name || transfer.to.port !== narrator.inputs[0].name
        || transfer.condition !== 'always' || transfer.loopBack || transfer.maxVisits !== 1) fail();
    const used = new Set([...planner.dependencyPinIds, ...narrator.dependencyPinIds]);
    if (plan.dependencyPins.some(pin => !used.has(pin.pinId))) fail();
    return { planner, transfer, loop: loop ?? null, narration: { ...plan, definition: { ...graph, nodes: [{ ...narrator, inputs: [] }, output],
        entryNodeIds: [narrator.nodeId], edges: graph.edges.filter(edge => edge !== transfer && edge !== loop),
        capabilityCeiling: graph.capabilityCeiling.filter(capability => capability !== 'graph.patch'), graphChangePolicy: { allowedOperations: [], allowedNodeKinds: [] } },
    dependencyPins: plan.dependencyPins.filter(pin => narrator.dependencyPinIds.includes(pin.pinId)) } };
}

export function rpPlannerTask(graph) {
    return { kind: 'native_rp_graph_planner', instruction: 'Propose one bounded GraphPatch for the current RP task. This is a control proposal, not narration, approval, a tool call or an official fact. Return only the requested JSON. Use only the listed node IDs and allowed operations. Do not invent permissions, budgets or nodes.',
        nodes: graph.nodes.map(({ nodeId, kind, label }) => ({ nodeId, kind, label })), allowedOperations: graph.graphChangePolicy.allowedOperations,
        outputOwnerNodeId: graph.outputContract.ownerNodeId };
}

export const rpPlannerOutputContract = Object.freeze({ name: 'atria_graph_patch', schema: { type: 'object', properties: {
    operations: { type: 'array', minItems: 1, items: { type: 'object' } } }, required: ['operations'], additionalProperties: false } });
