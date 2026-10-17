import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';

const id = kind => createNativeId('orchestration' + kind);
export async function configureReview(plan, { h, seeded, route }) {
    const configured = { ...route, executionPolicy: { ...route.executionPolicy, computeBudget: { ...route.executionPolicy.computeBudget, maxRequests: 6 } } };
    await seeded.persistence.saveRuntimeRoute(h.handle, configured);
    const current = await seeded.persistence.getRuntimeRoute(h.handle, route.runtimeRouteId); plan.dependencyPins[0].integrity = hash(current);
    const pin = async (name, nodeId, kind, inputs, outputs, policy = {}) => {
        const next = { ...current, runtimeRouteId: createNativeId('runtimeRoute'), displayName: name };
        await seeded.persistence.saveRuntimeRoute(h.handle, next);
        const persisted = await seeded.persistence.getRuntimeRoute(h.handle, next.runtimeRouteId), pinId = name + '.route';
        plan.dependencyPins.push({ pinId, port: 'model', resourceRef: { scope: 'player', runtimeRouteId: next.runtimeRouteId }, integrity: hash(persisted) });
        return { nodeId, kind, label: name, inputs, outputs, dependencyPinIds: [pinId], capabilities: ['generation.send'], policy: { agentPinId: pinId, ...policy } };
    };
    const port = (name, type, required = false) => ({ name, type, required });
    const narrator = plan.definition.nodes[0], output = plan.definition.nodes[1];
    const draft = await pin('draft', id('Node'), 'agent', [], [port('draft', 'text')]);
    const review = await pin('review', id('Node'), 'review', [port('draft', 'text', true)], [port('review', 'json')], { maxRounds: 2 });
    narrator.inputs = [port('draft', 'text', true), port('review', 'json', true)]; output.capabilities = ['chat.output'];
    const edge = (from, fromPort, to, toPort, maxVisits = 1) => ({ edgeId: id('Edge'), from: { nodeId: from.nodeId, port: fromPort }, to: { nodeId: to.nodeId, port: toPort }, condition: 'always', maxVisits, loopBack: false });
    plan.definition.nodes = [draft, review, narrator, output]; plan.definition.entryNodeIds = [draft.nodeId];
    plan.definition.edges = [edge(draft, 'draft', review, 'draft', 2), edge(draft, 'draft', narrator, 'draft'), edge(review, 'review', narrator, 'review'), ...plan.definition.edges];
    plan.definition.capabilityCeiling = ['generation.send', 'chat.output']; plan.definition.limits.maxReviews = 2; plan.definition.limits.maxSteps = 80;
    Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 65536 } });
}
