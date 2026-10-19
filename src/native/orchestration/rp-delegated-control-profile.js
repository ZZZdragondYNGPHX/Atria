import { nodePromptPinCount, nodeModelRoutePins, assertResultPolicy } from '../../../public/shared/native-orchestration-contracts.js';
import { equalNativeDocuments as equal } from '../repositories/common.js';
import { delegatedRpSourcePins } from './delegated-source-contracts.js';
import { rpControlReplanScope, rpControlFanoutGroups } from './rp-control-graph.js';
import { audienceContextPin } from './audience-source-contracts.js';

const fail = () => { throw Object.assign(new TypeError('native_orchestration_rp_child_control_unavailable'), { code: 'native_orchestration_rp_child_control_unavailable' }); };

/** A published Actor source is delegable only when this exact parent Node
 * explicitly owns the same original pin. It is never a Narrator-wide grant. */
export function assertRpDelegatedAudiencePin(parentNode, parentPins, node, childPins) {
    const pin = audienceContextPin(node, childPins);
    if (!pin) { if (node.policy.audiencePinId !== undefined) fail(); return null; }
    if (pin.resourceRef.kind !== 'native_information_context' || pin.resourceRef.audience.kind !== 'actor'
        || !parentPins.some(parent => parent.port === 'context' && parentNode.dependencyPinIds.includes(parent.pinId)
            && parent.integrity === pin.integrity && equal(parent.resourceRef, pin.resourceRef))) fail();
    return pin;
}

/** Published task-local pure Model DAG. Source, Route, Scheduler and held child
 * bank admission stay in the original captured delegation, not this shape. */
export function rpDelegatedControlProfile(plan) {
    const graph = plan.definition, planners = graph.nodes.filter(node => node.kind === 'planner');
    if (!graph.nodes.some(node => ['planner', 'review', 'judge'].includes(node.kind))
        && graph.nodes.filter(node => node.kind === 'agent').length < 2
        && !graph.nodes.some(node => audienceContextPin(node, plan.dependencyPins) || node.capabilities.includes('agent.delegate'))) return null;
    const models = graph.nodes.filter(node => ['agent', 'planner', 'review', 'judge'].includes(node.kind)), agents = models.filter(node => node.kind === 'agent');
    const delegators = agents.filter(node => node.capabilities.includes('agent.delegate'));
    const passive = graph.nodes.filter(node => ['fanout', 'join'].includes(node.kind)), pure = [...models, ...passive];
    const outputs = graph.nodes.filter(node => node.kind === 'output'), output = outputs[0], sources = delegatedRpSourcePins(plan);
    if (!agents.length || outputs.length !== 1 || graph.nodes.length !== pure.length + 1
        || graph.outputContract.kind !== 'result' || graph.outputContract.allowPartial || assertResultPolicy(graph.outputContract).outputType !== 'text'
        || output.nodeId !== graph.outputContract.ownerNodeId || output.capabilities.length || output.dependencyPinIds.length || output.outputs.length
        || output.inputs.length !== 1 || !output.inputs[0].required || output.inputs[0].type !== 'text'
        || !equal([...graph.capabilityCeiling].sort(), ['generation.send', ...planners.length || delegators.some(node => node.capabilities.includes('graph.patch')) ? ['graph.patch'] : [], ...delegators.length ? ['agent.delegate'] : []].sort())
        || planners.length && !graph.graphChangePolicy.allowedOperations.length || graph.graphChangePolicy.allowedNodeKinds.some(kind => !['agent', 'planner', 'review', 'judge', 'fanout', 'join'].includes(kind))
        || graph.graphChangePolicy.allowedOperations.some(op => !['addNode', 'addEdge', 'setPendingPriority', 'cancelPending', 'markBlocked', 'requestReplan', 'requestFinalize'].includes(op))) fail();
    const incoming = {}, ordered = [];
    for (const node of models) {
        const routes = nodeModelRoutePins(node, plan.dependencyPins), sourcePins = sources.filter(pin => node.dependencyPinIds.includes(pin.pinId)),
            audience = audienceContextPin(node, plan.dependencyPins), delegated = delegators.includes(node),
            plans = plan.dependencyPins.filter(pin => pin.port === 'plan' && node.dependencyPinIds.includes(pin.pinId));
        if (!equal([...node.capabilities].sort(), ['generation.send', ...node.kind === 'planner' || delegated && node.capabilities.includes('graph.patch') ? ['graph.patch'] : [], ...delegated ? ['agent.delegate'] : []].sort())
            || node.outputs.length !== 1 || node.outputs[0].type !== (node.kind === 'agent' ? 'text' : 'json')
            || !routes.length || sourcePins.length !== (audience ? 0 : sources.length)
            || audience && (audience.resourceRef.kind !== 'native_information_context' || audience.resourceRef.audience.kind !== 'actor')
            || node.policy.audiencePinId !== undefined && !audience
            || plans.length !== Number(delegated) || delegated && !equal(node.policy.allowedPlanPinIds, [plans[0]?.pinId])
            || (node.dependencyPinIds.length - nodePromptPinCount(node)) !== routes.length + sourcePins.length + Number(!!audience) + plans.length
            || node.inputs.some(port => !['text', 'json'].includes(port.type) && !(port.type === 'task.result'
                && graph.edges.some(edge => edge.to.nodeId === node.nodeId && edge.to.port === port.name && passive.some(source => source.kind === 'fanout' && source.nodeId === edge.from.nodeId))))) fail();
        incoming[node.nodeId] = graph.edges.filter(edge => !edge.loopBack && edge.to.nodeId === node.nodeId);
        if (node.inputs.some(port => graph.edges.filter(edge => edge.to.nodeId === node.nodeId && edge.to.port === port.name).length > 1
            || port.required && !incoming[node.nodeId].some(edge => edge.to.port === port.name))) fail();
    }
    for (const node of passive) {
        if (node.capabilities.length || (node.dependencyPinIds.length - nodePromptPinCount(node)) || node.outputs.length !== 1
            || node.outputs[0].type !== (node.kind === 'fanout' ? 'task.result' : 'text') || node.inputs.some(port => !['text', 'json'].includes(port.type))) fail();
        incoming[node.nodeId] = graph.edges.filter(edge => !edge.loopBack && edge.to.nodeId === node.nodeId);
        if (node.inputs.some(port => graph.edges.filter(edge => edge.to.nodeId === node.nodeId && edge.to.port === port.name).length > 1
            || port.required && !incoming[node.nodeId].some(edge => edge.to.port === port.name))) fail();
    }
    for (const edge of graph.edges) {
        const from = pure.find(node => node.nodeId === edge.from.nodeId), to = graph.nodes.find(node => node.nodeId === edge.to.nodeId);
        if (!from || !to || !['always', 'success'].includes(edge.condition)
            || edge.from.port !== from.outputs[0].name || !to.inputs.some(port => port.name === edge.to.port && port.type === from.outputs[0].type)
            || edge.loopBack && (from.kind !== 'planner' || !['agent', 'planner'].includes(to.kind) || edge.condition !== 'always'
                || to.inputs.find(port => port.name === edge.to.port).required)) fail();
    }
    const terminalEdges = graph.edges.filter(edge => edge.to.nodeId === output.nodeId), terminal = models.find(node => node.nodeId === terminalEdges[0]?.from.nodeId);
    if (terminalEdges.length !== 1 || terminal?.kind !== 'agent') fail();
    const used = new Set(models.flatMap(node => node.dependencyPinIds));
    const canAddModel = graph.graphChangePolicy.allowedOperations.includes('addNode')
        && graph.graphChangePolicy.allowedNodeKinds.some(kind => ['agent', 'planner', 'review', 'judge'].includes(kind));
    if (plan.dependencyPins.some(pin => !used.has(pin.pinId) && (!canAddModel || pin.port !== 'model' || pin.resourceRef.scope !== 'player'))) fail();
    const needed = new Set([output.nodeId]);
    for (let changed = true; changed;) {
        changed = false;
        for (const edge of graph.edges) if (!edge.loopBack && needed.has(edge.to.nodeId) && !needed.has(edge.from.nodeId)) {
            needed.add(edge.from.nodeId); changed = true;
        }
    }
    if (needed.size !== graph.nodes.length || !equal([...graph.entryNodeIds].sort(), pure.filter(node => !incoming[node.nodeId].length).map(node => node.nodeId).sort())) fail();
    while (ordered.length < pure.length) {
        const next = pure.find(node => !ordered.includes(node) && incoming[node.nodeId].every(edge => ordered.some(from => from.nodeId === edge.from.nodeId)));
        if (!next) fail(); ordered.push(next);
    }
    for (const loop of graph.edges.filter(edge => edge.loopBack)) rpControlReplanScope(graph, loop.from.nodeId);
    const fanouts = rpControlFanoutGroups(graph, terminal.nodeId, ['agent', 'planner', 'review', 'judge']);
    if (fanouts.some(group => group.branches.some(branch => branch.scopeNodeIds.some(id => !['agent', 'planner', 'review', 'judge'].includes(graph.nodes.find(node => node.nodeId === id).kind))))) fail();
    return { models, planners, narrator: terminal, output, terminalNodeId: terminal.nodeId, incoming, ordered: ordered.filter(node => models.includes(node)), pure, fanouts };
}
