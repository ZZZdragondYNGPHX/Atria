import { delegatedRpSourcePins } from './delegated-source-contracts.js';
import { equalNativeDocuments as equal } from '../repositories/common.js';
import { nodeModelRoutePins } from '../../../public/shared/native-orchestration-contracts.js';
import { audienceContextPin } from './audience-source-contracts.js';
import { RP_REVIEW_REASON_CODES } from './rp-review-profile.js';

const fail = () => { throw Object.assign(new TypeError('native_orchestration_rp_control_graph_unavailable'), { code: 'native_orchestration_rp_control_graph_unavailable' }); };

/** Keep the existing response grammars where the published graph actually
 * declares those original relationships. This only selects a codec; its old
 * consumer still performs every original Source/capability/typed-edge check.
 * Other model DAGs use the dependency consumer below, without a shape limit. */
function existingResponseProtocol(graph) {
    const allowed = ['agent', 'review', 'judge', 'output'];
    if (graph.nodes.some(node => ['fanout', 'join'].includes(node.kind))) {
        // Preserve the original codec only for its original one-step group.
        const fanouts = graph.nodes.filter(node => node.kind === 'fanout'), joins = graph.nodes.filter(node => node.kind === 'join');
        if (fanouts.length === 1 && joins.length === 1 && !graph.nodes.some(node => ['planner', 'review', 'judge'].includes(node.kind))
            && equal(graph.entryNodeIds, [fanouts[0].nodeId])) {
            const terminal = graph.edges.filter(edge => edge.to.nodeId === graph.outputContract.ownerNodeId);
            const narrator = graph.nodes.find(node => node.nodeId === terminal[0]?.from.nodeId);
            const branches = graph.nodes.filter(node => node.kind === 'agent' && node !== narrator);
            const outgoing = graph.edges.filter(edge => edge.from.nodeId === joins[0].nodeId);
            if (terminal.length === 1 && narrator?.kind === 'agent' && outgoing.length === 1 && outgoing[0].to.nodeId === narrator.nodeId
                && graph.edges.length === branches.length * 2 + 2 && branches.every(node => {
                const incoming = graph.edges.filter(edge => edge.to.nodeId === node.nodeId), leaving = graph.edges.filter(edge => edge.from.nodeId === node.nodeId);
                return incoming.length === 1 && incoming[0].from.nodeId === fanouts[0].nodeId && leaving.length === 1 && leaving[0].to.nodeId === joins[0].nodeId;
            })) return true;
        }
        return false;
    }
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
    if (!force && (graph.nodes.length === 2 || !graph.nodes.some(node => node.capabilities.includes('agent.delegate'))) && (!planners.length ? existingResponseProtocol(graph)
        : !graph.nodes.some(node => ['review', 'judge', 'fanout', 'join'].includes(node.kind)) && planners.length === 1 && graph.entryNodeIds.length === 1
            && graph.entryNodeIds[0] === planners[0].nodeId && !graph.edges.some(edge => !edge.loopBack && edge.to.nodeId === planners[0].nodeId))) return null;
    const output = graph.nodes.find(node => node.nodeId === graph.outputContract.ownerNodeId);
    const terminal = graph.edges.filter(edge => edge.to.nodeId === output?.nodeId);
    const narrator = graph.nodes.find(node => node.nodeId === terminal[0]?.from.nodeId);
    if (graph.outputContract.kind !== 'rp_narration' || graph.outputContract.slot !== 'assistant' || graph.outputContract.allowPartial
        || output?.kind !== 'output' || graph.nodes.filter(node => node.kind === 'output').length !== 1 || terminal.length !== 1 || narrator?.kind !== 'agent'
        || !equal(output.capabilities, ['chat.output']) || output.dependencyPinIds.length || output.outputs.length
        || narrator.outputs.length !== 1 || narrator.outputs[0].type !== 'text'
        || audienceContextPin(narrator, plan.dependencyPins)?.resourceRef.audience.kind === 'actor'
        || graph.edges.some(edge => edge.loopBack && (!planners.some(node => node.nodeId === edge.from.nodeId)
            || !graph.nodes.some(node => node.nodeId === edge.to.nodeId && ['agent', 'planner'].includes(node.kind))) || !['always', 'success'].includes(edge.condition)
            || edge.from.nodeId === output.nodeId || edge.from.nodeId === narrator.nodeId && edge.to.nodeId !== output.nodeId)) fail();
    const controls = graph.nodes.filter(node => ['fanout', 'join'].includes(node.kind));
    for (const node of controls) if (node.capabilities.length || node.dependencyPinIds.length || node.outputs.length !== 1
        || node.outputs[0].type !== (node.kind === 'fanout' ? 'task.result' : 'text')) fail();
    const models = graph.nodes.filter(node => node !== output && !controls.includes(node));
    for (const node of models) {
        const routes = nodeModelRoutePins(node, plan.dependencyPins), audience = audienceContextPin(node, plan.dependencyPins);
        const delegated = node.kind === 'agent' && node.capabilities.includes('agent.delegate');
        const plans = plan.dependencyPins.filter(pin => pin.port === 'plan' && node.dependencyPinIds.includes(pin.pinId));
        const sourcePins = delegatedRpSourcePins(plan).filter(pin => node.dependencyPinIds.includes(pin.pinId));
        const audiencePins = plan.dependencyPins.filter(pin => pin.port === 'context' && pin.resourceRef.kind === 'native_information_context'
            && node.dependencyPinIds.includes(pin.pinId));
        const retrieval = plan.dependencyPins.filter(pin => node.dependencyPinIds.includes(pin.pinId) && pin.port === 'context'
            && pin.resourceRef.scope === 'player' && pin.resourceRef.retrievalProfileId);
        if (!['agent', 'planner', 'review', 'judge'].includes(node.kind) || node.outputs.length !== 1 || node.outputs[0].type !== (node.kind === 'agent' ? 'text' : 'json')
            || !equal([...node.capabilities].sort(), ['generation.send', ...node.kind === 'planner' || delegated && node.capabilities.includes('graph.patch') ? ['graph.patch'] : [],
                ...delegated ? ['agent.delegate'] : [], ...retrieval.length ? ['memory.retrieve'] : []].sort())
            || !routes.length || plans.length !== Number(delegated) || delegated && !equal(node.policy.allowedPlanPinIds, [plans[0]?.pinId])
            || !delegated && (sourcePins.length || audiencePins.length !== Number(!!audience))
            || node.dependencyPinIds.length !== routes.length + retrieval.length + audiencePins.length + sourcePins.length + plans.length) fail();
    }
    const used = new Set(models.flatMap(node => node.dependencyPinIds));
    if (plan.dependencyPins.some(pin => !used.has(pin.pinId)) || planners.length && !graph.graphChangePolicy.allowedOperations.length) fail();
    const fanouts = rpControlFanoutGroups(graph, narrator.nodeId);
    if (fanouts.some(group => group.branches.some(branch => branch.scopeNodeIds.some(id => graph.nodes.find(node => node.nodeId === id).capabilities.includes('agent.delegate'))))) fail();
    return { models, narrator, output, fanouts };
}

export function rpControlPlannerTask(graph, dependencyPins) {
    return { kind: 'native_rp_graph_planner', instruction: 'Propose one bounded GraphPatch for this declared task using only the original graph policy and pinned dependencies. The proposal is not narration, permission, official facts, a budget extension or a domain write. Return only operations.',
        nodes: graph.nodes, edges: graph.edges, allowedOperations: graph.graphChangePolicy.allowedOperations,
        allowedNodeKinds: graph.graphChangePolicy.allowedNodeKinds, dependencyPins };
}

/** A requestReplan names no target. The published return edges must identify
 * one destination; every declared port to that destination is bound together.
 * This derives work from immutable topology, without invalidating any receipt
 * or creating a second scheduling, Source or spending authority. */
export function rpControlReplanScope(graph, plannerNodeId) {
    const pending = () => { throw Object.assign(new TypeError('native_orchestration_planner_replan_pending'), { code: 'native_orchestration_planner_replan_pending' }); };
    const loops = graph.edges.filter(edge => edge.loopBack && edge.from.nodeId === plannerNodeId);
    if (!loops.length || new Set(loops.map(edge => edge.to.nodeId)).size !== 1) pending();
    const target = graph.nodes.find(node => node.nodeId === loops[0].to.nodeId);
    if (!target || !['agent', 'planner'].includes(target.kind)) pending();
    const reach = (start, reverse = false) => {
        const seen = new Set(), work = [start];
        while (work.length) {
            const id = work.pop(); if (seen.has(id)) continue; seen.add(id);
            work.push(...graph.edges.filter(edge => !edge.loopBack && edge[reverse ? 'to' : 'from'].nodeId === id)
                .map(edge => edge[reverse ? 'from' : 'to'].nodeId));
        }
        return seen;
    };
    const affected = reach(target.nodeId), ancestors = reach(plannerNodeId, true);
    if (!affected.has(plannerNodeId) || graph.nodes.some(node => affected.has(node.nodeId) && ancestors.has(node.nodeId)
        && !['agent', 'planner', 'review', 'judge'].includes(node.kind))) pending();
    return { loops, target, affectedNodeIds: [...affected] };
}

export const rpControlReviewOutputContract = Object.freeze({ name: 'atria_graph_review', schema: { type: 'object', properties: {
    decision: { type: 'string', enum: ['approve', 'rerun'] }, reasonCode: { type: 'string', enum: RP_REVIEW_REASON_CODES },
    targetAttemptIds: { type: 'array', minItems: 1, items: { type: 'string' } } }, required: ['decision', 'reasonCode', 'targetAttemptIds'], additionalProperties: false } });

export const rpControlJudgeOutputContract = Object.freeze({ name: 'atria_graph_judge', schema: { type: 'object', properties: {
    selectedResultRef: { type: 'object', properties: { runId: { type: 'string' }, resultId: { type: 'string' } }, required: ['runId', 'resultId'], additionalProperties: false },
    reasonCode: { type: 'string', enum: ['candidate_selected'] } }, required: ['selectedResultRef', 'reasonCode'], additionalProperties: false } });

/** Read-only published branch topology. All admission stays in original controllers. */
export function rpControlFanoutGroups(graph, finalWorkerId, modelKinds = ['agent', 'planner']) {
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
                if (!modelKinds.includes(node?.kind) || id === finalWorkerId || used.has(id)) fail();
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
        if (!members.length || members.some(edge => !branches.some(branch => branch.scopeNodeIds.includes(edge.from.nodeId))
            || graph.nodes.find(node => node.nodeId === edge.from.nodeId)?.kind !== 'agent' || edge.condition !== 'always')) fail();
        joins.add(joinId); groups.push({ fanout, join, branches, members });
    }
    if (graph.nodes.some(node => node.kind === 'join' && !joins.has(node.nodeId))) fail();
    return groups;
}
