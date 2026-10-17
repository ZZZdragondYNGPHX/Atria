import { hashNativeDocument as hash } from '../repositories/common.js';
import { nodeModelRoutePins } from '../../../public/shared/native-orchestration-contracts.js';
import { audienceContextPin, projectAudienceSource } from './audience-source-contracts.js';

const fail = () => { throw Object.assign(new TypeError('native_orchestration_turn_plan_unavailable'), { code: 'native_orchestration_turn_plan_unavailable' }); };
const equal = (a, b) => hash(a) === hash(b);

/** Original published Nodes/Edges drive this acyclic Session consumer. Control
 * nodes carry receipts, model nodes carry advisory Results; only the terminal
 * Narrator can reach the original Session writer. */
export function sessionAgentGraphProfile(plan) {
    const graph = plan.definition, models = graph.nodes.filter(node => ['agent', 'review'].includes(node.kind));
    const controls = graph.nodes.filter(node => ['fanout', 'join'].includes(node.kind)), outputs = graph.nodes.filter(node => node.kind === 'output');
    if (models.length < 2 && !controls.length) return null;
    const [output] = outputs, incoming = {}, steps = [];
    if (outputs.length !== 1 || graph.nodes.length !== models.length + controls.length + 1
        || graph.outputContract.kind !== 'rp_narration' || graph.outputContract.allowPartial
        || graph.graphChangePolicy.allowedOperations.length || graph.graphChangePolicy.allowedNodeKinds.length
        || output.inputs.length !== 1 || output.inputs[0].type !== 'text' || !output.inputs[0].required || output.outputs.length
        || output.dependencyPinIds.length || !equal(output.capabilities, ['chat.output'])
        || !equal([...graph.capabilityCeiling].sort(), ['chat.output', 'generation.send'])) fail();
    const terminal = graph.edges.filter(edge => edge.to.nodeId === output.nodeId);
    const narrator = terminal.length === 1 ? models.find(node => node.nodeId === terminal[0].from.nodeId) : null;
    if (!narrator || narrator.kind !== 'agent' || graph.edges.some(edge => edge.from.nodeId === output.nodeId)) fail();
    const work = [...models, ...controls];
    for (const node of work) {
        incoming[node.nodeId] = graph.edges.filter(edge => edge.to.nodeId === node.nodeId).sort((a, b) => a.edgeId.localeCompare(b.edgeId));
        if (incoming[node.nodeId].length !== node.inputs.length || new Set(incoming[node.nodeId].map(edge => edge.from.nodeId)).size !== node.inputs.length
            || node.inputs.some(port => !['text', 'json', 'task.result'].includes(port.type) || !port.required
                || incoming[node.nodeId].filter(edge => edge.to.port === port.name).length !== 1)) fail();
        if (models.includes(node)) {
            const pins = nodeModelRoutePins(node, plan.dependencyPins), audience = audienceContextPin(node, plan.dependencyPins);
            if (!pins.length || !audience || node.dependencyPinIds.length !== pins.length + 1 || !equal(node.capabilities, ['generation.send'])
                || node.outputs.length !== 1 || node.outputs[0].type !== (node.kind === 'review' ? 'json' : 'text')) fail();
        } else if (node.capabilities.length || node.dependencyPinIds.length || node.outputs.length !== 1
            || node.outputs[0].type !== (node.kind === 'fanout' ? 'task.result' : 'text')) fail();
        const outgoing = graph.edges.filter(edge => edge.from.nodeId === node.nodeId);
        if (!outgoing.length || node === narrator && outgoing.length !== 1) fail();
        for (const edge of outgoing) {
            const target = graph.nodes.find(next => next.nodeId === edge.to.nodeId);
            if (!['always', 'success'].includes(edge.condition) || edge.loopBack
                || edge.maxVisits !== (target?.kind === 'review' ? target.policy.maxRounds : 1)
                || edge.from.port !== node.outputs[0].name || !target?.inputs.some(port => port.name === edge.to.port && port.type === node.outputs[0].type && port.required)) fail();
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
        if (fanout.inputs.length || !['continue', 'fail_fast'].includes(fanout.policy.failurePolicy)) fail();
        const transfers = graph.edges.filter(edge => edge.from.nodeId === fanout.nodeId);
        const branches = transfers.map(edge => models.find(node => node.nodeId === edge.to.nodeId));
        if (!branches.length || branches.some(node => !node || node.kind !== 'agent' || node === narrator || usedBranches.has(node.nodeId)
            || node.inputs.length !== 1 || node.inputs[0].type !== 'task.result' || incoming[node.nodeId].length !== 1)) fail();
        const members = branches.map(node => graph.edges.filter(edge => edge.from.nodeId === node.nodeId));
        const join = members[0]?.length === 1 ? controls.find(node => node.kind === 'join' && node.nodeId === members[0][0].to.nodeId) : null;
        if (!join || usedJoins.has(join.nodeId) || members.some(edges => edges.length !== 1 || edges[0].to.nodeId !== join.nodeId || edges[0].condition !== 'always')
            || incoming[join.nodeId].length !== branches.length || join.policy.quorum > branches.length
            || join.inputs.some(port => port.type !== 'text') || graph.edges.filter(edge => edge.from.nodeId === join.nodeId)
            .some(edge => !models.some(node => node.kind === 'agent' && node.nodeId === edge.to.nodeId))) fail();
        usedJoins.add(join.nodeId); for (const node of branches) usedBranches.add(node.nodeId);
        fanouts.push({ fanout, join, branches, transfers, members: members.flat() });
    }
    if (controls.filter(node => node.kind === 'join').some(node => !usedJoins.has(node.nodeId))) fail();
    const reviews = models.filter(node => node.kind === 'review');
    if (reviews.length > 1) fail();
    let qualityReview = null;
    if (reviews.length) {
        const review = reviews[0], edges = incoming[review.nodeId], draft = edges.length === 1 ? models.find(node => node.nodeId === edges[0].from.nodeId) : null;
        if (!draft || draft.kind !== 'agent' || usedBranches.has(draft.nodeId) || incoming[narrator.nodeId].length !== 2
            || !incoming[narrator.nodeId].some(edge => edge.from.nodeId === draft.nodeId)
            || !incoming[narrator.nodeId].some(edge => edge.from.nodeId === review.nodeId)) fail();
        qualityReview = { draft, review };
    }
    const ordered = steps.filter(node => models.includes(node));
    return { ordered, steps, workers: ordered.slice(0, -1), narrator, incoming, output, qualityReview, fanouts };
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

export function sessionGraphResultReadable(base, producer, recipient, pins) {
    const from = sessionGraphAudience(base, producer, pins), to = sessionGraphAudience(base, recipient, pins);
    if (equal(from.pin.resourceRef, to.pin.resourceRef)) return true;
    if (from.information.knowledge || from.information.memory || from.information.narration?.expression) return false;
    const legal = new Set(to.information.projection.items.map(hash));
    return from.information.projection.items.every(item => legal.has(hash(item)));
}
