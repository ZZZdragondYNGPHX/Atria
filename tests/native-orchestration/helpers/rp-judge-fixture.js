import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';

const id = kind => createNativeId('orchestration' + kind);
export async function configureJudge(plan, { h, seeded, route }) {
    const narrator = plan.definition.nodes[0], output = plan.definition.nodes[1];
    const configured = { ...route, executionPolicy: { ...route.executionPolicy, computeBudget: { ...route.executionPolicy.computeBudget, maxRequests: 4 } } };
    await seeded.persistence.saveRuntimeRoute(h.handle, configured);
    const current = await seeded.persistence.getRuntimeRoute(h.handle, route.runtimeRouteId); plan.dependencyPins[0].integrity = hash(current);
    const port = (name, type, required = false) => ({ name, type, required });
    const makeNode = async (name, kind, inputs, type) => {
        const next = { ...current, runtimeRouteId: createNativeId('runtimeRoute'), displayName: name };
        await seeded.persistence.saveRuntimeRoute(h.handle, next);
        const persisted = await seeded.persistence.getRuntimeRoute(h.handle, next.runtimeRouteId), pinId = name + '.route';
        plan.dependencyPins.push({ pinId, port: 'model', resourceRef: { scope: 'player', runtimeRouteId: next.runtimeRouteId }, integrity: hash(persisted) });
        return { nodeId: id('Node'), kind, label: name, inputs, outputs: [port('response', type)], dependencyPinIds: [pinId], capabilities: ['generation.send'], policy: { agentPinId: pinId } };
    };
    const candidates = [await makeNode('candidateA', 'agent', [], 'text'), await makeNode('candidateB', 'agent', [], 'text')];
    const judge = await makeNode('judge', 'judge', [port('candidate0', 'text', true), port('candidate1', 'text', true)], 'json');
    narrator.inputs = [port('draft0', 'text'), port('draft1', 'text'), port('selection', 'json', true)]; output.capabilities = ['chat.output'];
    const edge = (from, to, input) => ({ edgeId: id('Edge'), from: { nodeId: from.nodeId, port: 'response' }, to: { nodeId: to.nodeId, port: input }, condition: 'always', maxVisits: 1, loopBack: false });
    plan.definition.nodes = [...candidates, judge, narrator, output]; plan.definition.entryNodeIds = candidates.map(node => node.nodeId);
    plan.definition.edges = [...candidates.map((node, i) => edge(node, judge, 'candidate' + i)), ...candidates.map((node, i) => edge(node, narrator, 'draft' + i)), edge(judge, narrator, 'selection'), ...plan.definition.edges];
    plan.definition.capabilityCeiling = ['generation.send', 'chat.output']; plan.definition.limits.maxSteps = 100;
    Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 65536 } });
}
