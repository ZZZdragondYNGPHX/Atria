import { hashNativeDocument as hash } from '../repositories/common.js';
import { nodeModelRoutePins } from '../../../public/shared/native-orchestration-contracts.js';
import { audienceContextPin, projectAudienceSource } from './audience-source-contracts.js';

const fail = () => { throw Object.assign(new TypeError('native_orchestration_turn_plan_unavailable'), { code: 'native_orchestration_turn_plan_unavailable' }); };
const equal = (a, b) => hash(a) === hash(b);

/** Original published Nodes/Edges drive this acyclic Session consumer. Control
 * nodes carry receipts, model nodes carry advisory Results; only the terminal
 * Narrator can reach the original Session writer. */
export function sessionAgentGraphProfile(plan) {
    const graph = plan.definition, models = graph.nodes.filter(node => ['agent', 'review', 'planner', 'judge'].includes(node.kind));
    const planners = models.filter(node => node.kind === 'planner'), judges = models.filter(node => node.kind === 'judge');
    const delegates = models.filter(node => node.policy.allowedPlanPinIds?.length);
    const controls = graph.nodes.filter(node => ['fanout', 'join'].includes(node.kind)), outputs = graph.nodes.filter(node => node.kind === 'output');
    if (models.length < 2 && !controls.length) return null;
    const [output] = outputs, incoming = {}, steps = [];
    if (outputs.length !== 1 || graph.nodes.length !== models.length + controls.length + 1
        || graph.outputContract.kind !== 'rp_narration' || graph.outputContract.allowPartial
        || (!planners.length && (graph.graphChangePolicy.allowedOperations.length || graph.graphChangePolicy.allowedNodeKinds.length))
        || planners.length && (!graph.graphChangePolicy.allowedOperations.length
            || graph.graphChangePolicy.allowedOperations.some(op => !['addNode', 'addEdge', 'setPendingPriority', 'requestFinalize'].includes(op))
            || graph.graphChangePolicy.allowedNodeKinds.some(kind => !['agent', 'planner', 'review', 'judge', 'fanout', 'join'].includes(kind)))
        || output.inputs.length !== 1 || output.inputs[0].type !== 'text' || !output.inputs[0].required || output.outputs.length
        || output.dependencyPinIds.length || !equal(output.capabilities, ['chat.output'])
        || !equal([...graph.capabilityCeiling].sort(), ['chat.output', 'generation.send', ...planners.length ? ['graph.patch'] : [], ...delegates.length ? ['agent.delegate'] : []].sort())) fail();
    const terminal = graph.edges.filter(edge => edge.to.nodeId === output.nodeId);
    const narrator = terminal.length === 1 ? models.find(node => node.nodeId === terminal[0].from.nodeId) : null;
    if (!narrator || narrator.kind !== 'agent' || graph.edges.some(edge => edge.from.nodeId === output.nodeId)) fail();
    const work = [...models, ...controls];
    for (const node of work) {
        incoming[node.nodeId] = graph.edges.filter(edge => edge.to.nodeId === node.nodeId).sort((a, b) => a.edgeId.localeCompare(b.edgeId));
        if (incoming[node.nodeId].length > node.inputs.length || new Set(incoming[node.nodeId].map(edge => edge.from.nodeId)).size !== incoming[node.nodeId].length
            || node.inputs.some(port => !['text', 'json', 'task.result'].includes(port.type) || !planners.length && !judges.length && !port.required
                || incoming[node.nodeId].filter(edge => edge.to.port === port.name).length !== (port.required ? 1 : incoming[node.nodeId].some(edge => edge.to.port === port.name) ? 1 : 0))) fail();
        if (models.includes(node)) {
            const pins = nodeModelRoutePins(node, plan.dependencyPins), audience = audienceContextPin(node, plan.dependencyPins);
            const children = node.policy.allowedPlanPinIds ?? [];
            if (children.length > 1 || children.length && (node.kind !== 'agent' || node === narrator
                || children.some(id => !node.dependencyPinIds.includes(id) || !plan.dependencyPins.some(pin => pin.pinId === id && pin.port === 'plan')))) fail();
            if (!pins.length || !audience || node.dependencyPinIds.length !== pins.length + 1 + children.length || !equal(node.capabilities, ['generation.send', ...node.kind === 'planner' ? ['graph.patch'] : [], ...children.length ? ['agent.delegate'] : []])
                || node.outputs.length !== 1 || node.outputs[0].type !== (['review', 'planner', 'judge'].includes(node.kind) ? 'json' : 'text')) fail();
        } else if (node.capabilities.length || node.dependencyPinIds.length || node.outputs.length !== 1
            || node.outputs[0].type !== (node.kind === 'fanout' ? 'task.result' : 'text')) fail();
        const outgoing = graph.edges.filter(edge => edge.from.nodeId === node.nodeId);
        if (!outgoing.length || node === narrator && outgoing.length !== 1) fail();
        for (const edge of outgoing) {
            const target = graph.nodes.find(next => next.nodeId === edge.to.nodeId);
            if (!['always', 'success'].includes(edge.condition) || edge.loopBack
                || edge.maxVisits !== (target?.kind === 'review' ? target.policy.maxRounds : 1)
                || edge.from.port !== node.outputs[0].name || !target?.inputs.some(port => port.name === edge.to.port && port.type === node.outputs[0].type && (port.required || planners.length || judges.length))) fail();
        }
    }
    if (!equal([...graph.entryNodeIds].sort(), work.filter(node => !incoming[node.nodeId].length).map(node => node.nodeId).sort())) fail();
    while (steps.length < work.length) {
        const ready = work.find(node => !steps.includes(node) && incoming[node.nodeId].every(edge => steps.some(from => from.nodeId === edge.from.nodeId)));
        if (!ready) fail(); steps.push(ready);
    }
    if (steps.at(-1) !== narrator || plan.dependencyPins.some(pin => !models.some(node => node.dependencyPinIds.includes(pin.pinId)))) fail();
    const fanouts = [], usedJoins = new Set(), usedBranches = new Set();
    for (const fanout of controls.filter(node => node.kind === 'fanout')) {
        if (incoming[fanout.nodeId].some(edge => !planners.some(node => node.nodeId === edge.from.nodeId)) || !['continue', 'fail_fast'].includes(fanout.policy.failurePolicy)) fail();
        const transfers = graph.edges.filter(edge => edge.from.nodeId === fanout.nodeId);
        const branches = transfers.map(edge => models.find(node => node.nodeId === edge.to.nodeId));
        if (!branches.length || branches.some(node => !node || node.kind !== 'agent' || node === narrator || node.policy.allowedPlanPinIds?.length || usedBranches.has(node.nodeId)
            || node.inputs.length !== 1 || node.inputs[0].type !== 'task.result' || incoming[node.nodeId].length !== 1)) fail();
        const branchScopes = branches.map(entry => {
            const scope = new Set(), joins = new Set(), pending = [entry.nodeId];
            while (pending.length) {
                const id = pending.pop();
                if (scope.has(id)) continue;
                const node = models.find(node => node.nodeId === id);
                if (!node || node.kind !== 'agent' || node === narrator || node.policy.allowedPlanPinIds?.length || usedBranches.has(id)) fail();
                scope.add(id);
                for (const edge of graph.edges.filter(edge => edge.from.nodeId === id)) {
                    const target = graph.nodes.find(node => node.nodeId === edge.to.nodeId);
                    if (target?.kind === 'join') joins.add(target.nodeId);
                    else pending.push(edge.to.nodeId);
                }
            }
            if (joins.size !== 1) fail();
            const joinId = [...joins][0], members = graph.edges.filter(edge => scope.has(edge.from.nodeId) && edge.to.nodeId === joinId);
            for (const id of scope) {
                if (incoming[id].some(edge => !scope.has(edge.from.nodeId) && !(id === entry.nodeId && edge.from.nodeId === fanout.nodeId))) fail();
                usedBranches.add(id);
            }
            return { entry, scopeNodeIds: [...scope].sort(), ordered: steps.filter(node => scope.has(node.nodeId)), members, joinId };
        });
        const members = branchScopes.flatMap(scope => scope.members), join = controls.find(node => node.kind === 'join' && node.nodeId === branchScopes[0].joinId);
        if (!join || usedJoins.has(join.nodeId) || branchScopes.some(scope => scope.joinId !== join.nodeId)
            || members.some(edge => edge.condition !== 'always') || incoming[join.nodeId].length !== members.length || join.policy.quorum > members.length
            || join.inputs.some(port => port.type !== 'text') || graph.edges.filter(edge => edge.from.nodeId === join.nodeId)
            .some(edge => !models.some(node => node.kind === 'agent' && node.nodeId === edge.to.nodeId))) fail();
        usedJoins.add(join.nodeId);
        fanouts.push({ fanout, join, branches, branchScopes, transfers, members });
    }
    if (controls.filter(node => node.kind === 'join').some(node => !usedJoins.has(node.nodeId))) fail();
    const reviews = models.filter(node => node.kind === 'review');
    if (reviews.length > 1) fail();
    let qualityReview = null;
    if (reviews.length) {
        const review = reviews[0], edges = incoming[review.nodeId], draft = edges.length === 1 ? models.find(node => node.nodeId === edges[0].from.nodeId) : null;
        if (!draft || draft.kind !== 'agent' || usedBranches.has(draft.nodeId) || incoming[narrator.nodeId].filter(edge => ['agent', 'review'].includes(models.find(node => node.nodeId === edge.from.nodeId)?.kind)).length !== 2
            || !incoming[narrator.nodeId].some(edge => edge.from.nodeId === draft.nodeId)
            || !incoming[narrator.nodeId].some(edge => edge.from.nodeId === review.nodeId)) fail();
        qualityReview = { draft, review };
    }
    for (const judge of judges) {
        const candidates = incoming[judge.nodeId].filter(edge => graph.nodes.find(node => node.nodeId === edge.from.nodeId)?.kind === 'agent');
        if (!candidates.length || incoming[judge.nodeId].some(edge => !['agent', 'planner', 'judge', 'review'].includes(graph.nodes.find(node => node.nodeId === edge.from.nodeId)?.kind))) fail();
    }
    const ordered = steps.filter(node => models.includes(node));
    return { ordered, steps, workers: ordered.slice(0, -1), narrator, incoming, output, qualityReview, fanouts, planners, judges };
}

/** This is a projection of the immutable original Session snapshot, including
 * the lawful own-output finalization phase. It grants no new Source read. */
export function sessionGraphAudience(base, node, pins) {
    const pin = audienceContextPin(node, pins);
    if (!pin) fail();
    const source = projectAudienceSource(pin.resourceRef, base);
    if (hash(source.policyDescriptor) !== pin.integrity) fail();
    return { ...source, pin, audience: pin.resourceRef.audience };
}

export function sessionGraphResultReadable(base, producer, recipient, pins, recipientPins = pins) {
    const from = sessionGraphAudience(base, producer, pins), to = sessionGraphAudience(base, recipient, recipientPins);
    if (equal(from.pin.resourceRef, to.pin.resourceRef)) return true;
    if (from.audience.kind === 'narrator' && to.audience.kind === 'actor') return false;
    const derivations = base.manifest.runtime?.experienceContract?.contextRuntime?.derivations ?? [];
    if (from.information.knowledge || from.information.memory || from.information.narration?.expression
        || derivations.some(declaration => declaration.viewId === from.information.projection.viewId)) return false;
    const legal = new Set(to.information.projection.items.map(hash));
    return from.information.projection.items.every(item => legal.has(hash(item)));
}
