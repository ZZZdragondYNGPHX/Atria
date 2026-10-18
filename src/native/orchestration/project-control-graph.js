import { equalNativeDocuments as equal } from '../repositories/common.js';
import { nodeModelRoutePins } from '../../../public/shared/native-orchestration-contracts.js';

const fail = () => { throw Object.assign(new TypeError('native_orchestration_project_control_graph_unavailable'), { code: 'native_orchestration_project_control_graph_unavailable' }); };

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
        if (['fanout', 'join'].includes(node.kind)) {
            if (node.capabilities.length || node.dependencyPinIds.length || node.outputs.length !== 1
                || node.outputs[0].type !== (node.kind === 'fanout' ? 'task.result' : 'text')) fail();
            continue;
        }
        if (!['agent', 'planner', 'review', 'judge'].includes(node.kind) || node.outputs.length !== 1 || node.outputs[0].type !== (node.kind === 'agent' ? 'text' : 'json')
            || !equal(node.capabilities, ['generation.send', ...node.kind === 'planner' || node.kind === 'agent' && node.capabilities.includes('agent.delegate') && node.capabilities.includes('graph.patch') ? ['graph.patch'] : [], ...node.capabilities.includes('agent.delegate') ? ['agent.delegate'] : []])
            || !nodeModelRoutePins(node, plan.dependencyPins).length || node.dependencyPinIds.length !== nodeModelRoutePins(node, plan.dependencyPins).length + (node.policy.allowedPlanPinIds?.length ?? 0)) fail();
        if (node.capabilities.includes('agent.delegate') && (!['agent', 'planner'].includes(node.kind)
            || !node.policy.allowedPlanPinIds?.length || node.kind === 'agent' && node.policy.allowedPlanPinIds.length !== 1)) fail();
        if (node.kind === 'planner' && !graph.graphChangePolicy.allowedOperations.length) fail();
    }
    for (const edge of graph.edges) {
        if (!['always', 'success'].includes(edge.condition)) fail();
        if (edge.loopBack && (edge.condition !== 'always' || edge.maxVisits > graph.limits.maxLoopIterations
            || !(edge.from.nodeId === worker.nodeId && edge.to.nodeId === worker.nodeId
                || pure.some(node => node.kind === 'planner' && node.nodeId === edge.from.nodeId)
                    && pure.some(node => ['agent', 'planner'].includes(node.kind) && node.nodeId === edge.to.nodeId)))) fail();
        if (!edge.loopBack && edge.from.nodeId === worker.nodeId && edge.to.nodeId !== output.nodeId) fail();
    }
    const loop = graph.edges.find(edge => edge.loopBack && edge.to.nodeId === worker.nodeId);
    const used = new Set(graph.nodes.flatMap(node => node.dependencyPinIds));
    if (plan.dependencyPins.some(pin => !used.has(pin.pinId))) fail();
    const definition = { ...graph, nodes: [{ ...worker, inputs: loop ? worker.inputs.filter(port => port.name === loop.to.port) : [] }, output],
        entryNodeIds: [worker.nodeId], edges: [terminal[0], ...loop ? [loop] : []], capabilityCeiling: worker.capabilities,
        graphChangePolicy: { allowedOperations: [], allowedNodeKinds: [] } };
    return { pure, worker, output, fanouts: projectFanoutGroups(graph, worker.nodeId), executionPlan: { ...plan, definition, dependencyPins: plan.dependencyPins.filter(pin => worker.dependencyPinIds.includes(pin.pinId)) } };
}

/** Scope is derived from published edges. No reservation, grant or schedule
 * is created by this read-only topology description. */
export function projectFanoutGroups(graph, finalWorkerId) {
    const groups = [], used = new Set(), joins = new Set();
    for (const fanout of graph.nodes.filter(node => node.kind === 'fanout')) {
        const transfers = graph.edges.filter(edge => edge.from.nodeId === fanout.nodeId && !edge.loopBack);
        if (!transfers.length) fail();
        const branches = transfers.map(transfer => {
            const entry = graph.nodes.find(node => node.nodeId === transfer.to.nodeId), scope = new Set(), ends = new Set(), pending = [entry?.nodeId];
            while (pending.length) {
                const id = pending.pop(), node = graph.nodes.find(node => node.nodeId === id);
                if (scope.has(id)) continue;
                if (node?.kind === 'join') { ends.add(id); continue; }
                if (!['agent', 'planner', 'judge'].includes(node?.kind) || id === finalWorkerId || used.has(id)
                    || !equal(node.capabilities, ['generation.send', ...node.kind === 'planner' ? ['graph.patch'] : []])) fail();
                scope.add(id);
                const outgoing = graph.edges.filter(edge => edge.from.nodeId === id);
                if (!outgoing.length || outgoing.some(edge => edge.loopBack)) fail();
                pending.push(...outgoing.map(edge => edge.to.nodeId));
            }
            if (ends.size !== 1 || !entry || graph.edges.some(edge => edge.to.nodeId === entry.nodeId && edge.edgeId !== transfer.edgeId)) fail();
            for (const id of scope) {
                if (id !== entry.nodeId && graph.edges.some(edge => edge.to.nodeId === id && !scope.has(edge.from.nodeId))) fail();
            }
            return { entry, scopeNodeIds: [...scope].sort(), joinId: [...ends][0], transfer };
        });
        const joinId = branches[0].joinId, join = graph.nodes.find(node => node.nodeId === joinId);
        if (joins.has(joinId) || branches.some(branch => branch.joinId !== joinId) || join.policy.quorum > branches.reduce((count, branch) =>
            count + graph.edges.filter(edge => branch.scopeNodeIds.includes(edge.from.nodeId) && edge.to.nodeId === joinId).length, 0)) fail();
        for (const branch of branches) for (const id of branch.scopeNodeIds) { if (used.has(id)) fail(); used.add(id); }
        const members = graph.edges.filter(edge => edge.to.nodeId === joinId);
        if (!members.length || members.some(edge => !branches.some(branch => branch.scopeNodeIds.includes(edge.from.nodeId)) || edge.condition !== 'always'
            || graph.nodes.find(node => node.nodeId === edge.from.nodeId)?.kind !== 'agent')) fail();
        joins.add(joinId); groups.push({ fanout, join, branches, members });
    }
    if (graph.nodes.some(node => node.kind === 'join' && !joins.has(node.nodeId))) fail();
    return groups;
}

export const projectPlannerOutputContract = Object.freeze({ name: 'atria_project_graph_patch', schema: { type: 'object', properties: {
    operations: { type: 'array', minItems: 1, items: { type: 'object' } } }, required: ['operations'], additionalProperties: false } });

export const projectGraphReviewOutputContract = Object.freeze({ name: 'atria_project_graph_review', schema: { type: 'object', properties: {
    decision: { type: 'string', enum: ['approve', 'rerun'] }, reasonCode: { type: 'string' },
    targetAttemptIds: { type: 'array', minItems: 1, items: { type: 'string' } } }, required: ['decision', 'reasonCode', 'targetAttemptIds'], additionalProperties: false } });

export const projectGraphJudgeOutputContract = Object.freeze({ name: 'atria_project_graph_judge', schema: { type: 'object', properties: {
    selectedResultRef: { type: 'object', properties: { runId: { type: 'string' }, resultId: { type: 'string' } },
        required: ['runId', 'resultId'], additionalProperties: false }, reasonCode: { type: 'string', enum: ['candidate_selected'] } },
required: ['selectedResultRef', 'reasonCode'], additionalProperties: false } });
