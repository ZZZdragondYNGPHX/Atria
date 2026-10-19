import { projectFanoutGroups } from './project-control-graph.js';
import { equalNativeDocuments as equal } from '../repositories/common.js';
import { projectReplanScope } from './project-replan-contracts.js';
import { nodeModelRoutePins } from '../../../public/shared/native-orchestration-contracts.js';

const fail = () => { throw new TypeError('Invalid Project delegated graph'); };

/** Published shape only. Delegation still requires the original parent Node
 * capability intersection, owned Routes, Source and held child reservation. */
export function projectDelegatedGraphProfile(plan) {
    const graph = plan.definition, models = graph.nodes.filter(node => ['agent', 'planner', 'review', 'judge'].includes(node.kind));
    const reviews = models.filter(node => node.kind === 'review'), judges = models.filter(node => node.kind === 'judge');
    const passive = graph.nodes.filter(node => ['fanout', 'join'].includes(node.kind)), pure = [...models, ...passive];
    const delegates = models.filter(node => node.capabilities.includes('agent.delegate'));
    const planners = models.filter(node => node.kind === 'planner'), outputs = graph.nodes.filter(node => node.kind === 'output');
    const loops = graph.edges.filter(edge => edge.loopBack), canReplan = graph.graphChangePolicy.allowedOperations.includes('requestReplan');
    const canAddModel = graph.graphChangePolicy.allowedOperations.includes('addNode')
        && graph.graphChangePolicy.allowedNodeKinds.some(kind => ['agent', 'planner', 'review', 'judge'].includes(kind));
    const patchAuthority = planners.length || delegates.some(node => node.capabilities.includes('graph.patch'));
    if (!models.some(node => node.kind === 'agent') || outputs.length !== 1 || graph.nodes.length !== pure.length + 1
        || graph.outputContract.kind !== 'result' || graph.outputContract.allowPartial || graph.outputContract.resultPolicy?.outputType !== 'text'
        || !equal([...graph.capabilityCeiling].sort(), ['generation.send', ...patchAuthority ? ['graph.patch'] : [], ...delegates.length ? ['agent.delegate'] : []].sort())
        || graph.graphChangePolicy.allowedNodeKinds.some(kind => !['agent', 'planner', 'review', 'judge', 'fanout', 'join'].includes(kind)) || (!patchAuthority ? graph.graphChangePolicy.allowedOperations.length
        : !graph.graphChangePolicy.allowedOperations.length || graph.graphChangePolicy.allowedOperations.some(op => !['setPendingPriority', 'cancelPending', 'markBlocked', 'requestFinalize', 'requestReplan', 'addNode', 'addEdge'].includes(op)))
        || loops.length && !canReplan) fail();
    const output = outputs[0], incoming = {}, ordered = [];
    if (output.nodeId !== graph.outputContract.ownerNodeId || output.capabilities.length || output.dependencyPinIds.length
        || output.inputs.length !== 1 || output.inputs[0].type !== 'text' || !output.inputs[0].required || output.outputs.length) fail();
    for (const node of pure) {
        if (models.includes(node) && (nodeModelRoutePins(node, plan.dependencyPins).length !== 1 || node.dependencyPinIds.length !== 1 + (node.policy.allowedPlanPinIds?.length ?? 0)
            || !equal(node.capabilities, ['generation.send', ...node.kind === 'planner' || delegates.includes(node) && node.capabilities.includes('graph.patch') ? ['graph.patch'] : [], ...delegates.includes(node) ? ['agent.delegate'] : []])
            || delegates.includes(node) !== Boolean(node.policy.allowedPlanPinIds?.length)
            || delegates.includes(node) && (!['agent', 'planner'].includes(node.kind) || node.kind === 'agent' && node.policy.allowedPlanPinIds.length !== 1
                || node.policy.allowedPlanPinIds.some(id => !node.dependencyPinIds.includes(id) || !plan.dependencyPins.some(pin => pin.pinId === id && pin.port === 'plan')))
            || node.outputs.length !== 1 || node.outputs[0].type !== (['planner', 'review', 'judge'].includes(node.kind) ? 'json' : 'text')
            || node.inputs.some(port => !['text', 'json'].includes(port.type) && !(port.type === 'task.result' && graph.edges.some(edge => edge.to.nodeId === node.nodeId && edge.to.port === port.name && graph.nodes.find(source => source.nodeId === edge.from.nodeId)?.kind === 'fanout'))))) fail();
        if (passive.includes(node) && (node.capabilities.length || node.dependencyPinIds.length
            || node.outputs.length !== 1 || !(node.kind === 'fanout' ? node.outputs[0].type === 'task.result' : ['text', 'json'].includes(node.outputs[0].type)) || node.inputs.some(port => !['text', 'json'].includes(port.type) && !(port.type === 'task.result' && graph.edges.some(edge => edge.to.nodeId === node.nodeId && edge.to.port === port.name && graph.nodes.find(source => source.nodeId === edge.from.nodeId)?.kind === 'fanout'))))) fail();
        incoming[node.nodeId] = graph.edges.filter(edge => !edge.loopBack && edge.to.nodeId === node.nodeId).toSorted((a, b) => a.edgeId.localeCompare(b.edgeId));
        if (incoming[node.nodeId].length > node.inputs.length || new Set(incoming[node.nodeId].map(edge => edge.from.nodeId)).size !== incoming[node.nodeId].length
            || node.inputs.some(port => graph.edges.filter(edge => edge.to.nodeId === node.nodeId && edge.to.port === port.name).length > 1
                || port.required && !incoming[node.nodeId].some(edge => edge.to.port === port.name))) fail();
    }
    for (const edge of graph.edges) {
        const from = pure.find(node => node.nodeId === edge.from.nodeId), to = graph.nodes.find(node => node.nodeId === edge.to.nodeId);
        if (!from || !to || !['always', 'success'].includes(edge.condition) || edge.loopBack && (from.kind !== 'planner' || !['agent', 'planner'].includes(to.kind) || edge.condition !== 'always'
                || to.inputs.find(port => port.name === edge.to.port)?.required)
            || !canReplan && !reviews.length && edge.maxVisits !== 1
            || edge.from.port !== from.outputs[0].name || !to.inputs.some(port => port.name === edge.to.port && port.type === from.outputs[0].type)) fail();
    }
    if (!equal([...graph.entryNodeIds].sort(), pure.filter(node => !incoming[node.nodeId].length).map(node => node.nodeId).sort())) fail();
    while (ordered.length < pure.length) {
        const next = pure.find(node => !ordered.includes(node) && incoming[node.nodeId].every(edge => ordered.some(from => from.nodeId === edge.from.nodeId)));
        if (!next) fail(); ordered.push(next);
    }
    const terminal = graph.edges.filter(edge => edge.to.nodeId === output.nodeId), needed = new Set([output.nodeId]);
    for (let changed = true; changed;) {
        changed = false;
        for (const edge of graph.edges) if (!edge.loopBack && needed.has(edge.to.nodeId) && !needed.has(edge.from.nodeId)) { needed.add(edge.from.nodeId); changed = true; }
    }
    const final = models.find(node => node.nodeId === terminal[0]?.from.nodeId);
    if (terminal.length !== 1 || final?.kind !== 'agent' || needed.size !== graph.nodes.length
        || plan.dependencyPins.some(pin => pin.port === 'plan' ? !delegates.some(node => node.policy.allowedPlanPinIds.includes(pin.pinId))
            : pin.port !== 'model' || pin.resourceRef.scope !== 'player' || typeof pin.resourceRef.runtimeRouteId !== 'string'
                || !canAddModel && !models.some(node => node.dependencyPinIds.includes(pin.pinId)))) fail();
    for (const loop of loops) projectReplanScope(graph, loop.from.nodeId);
    const fanouts = projectFanoutGroups(graph, final.nodeId);
    return { ordered: ordered.filter(node => models.includes(node)), pure, models, planners, reviews, judges, delegates, fanouts, incoming, output, final, terminalNodeId: final.nodeId };
}

/** Narrow capability-mechanism recognition; an explicit text Result contract
 * is mandatory. This does not replace the existing pure Agent contract. */
export function isProjectDelegatedControlPlan(plan) {
    try { const shape = projectDelegatedGraphProfile(plan); return shape.planners.length + shape.reviews.length + shape.judges.length + shape.fanouts.length + shape.delegates.length > 0; } catch { return false; }
}
