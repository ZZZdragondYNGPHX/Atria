import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';
import { rpModelFixture } from './rp-model-fixture.js';

const id = kind => createNativeId('orchestration' + kind);
const port = (name, type, required = true) => ({ name, type, required });
const edge = (from, out, to, input) => ({ edgeId: id('Edge'), from: { nodeId: from.nodeId, port: out }, to: { nodeId: to.nodeId, port: input }, condition: 'always', maxVisits: 1, loopBack: false });

export async function rpFanoutFixture(make, { maxConcurrency = 2, strategy = 'all-success', branchCount = 2, quorum = branchCount,
    joinDeadlineMs = 60000, allowPartial = false, failurePolicy = 'continue', ...options } = {}) {
    let profile;
    const f = await rpModelFixture(make, { ...options, configurePlan: async (plan, { h, seeded, route }) => {
        route = { ...route, policy: { ...route.policy, timeoutMs: 60000 } };
        await seeded.persistence.saveRuntimeRoute(h.handle, route);
        route = await seeded.persistence.getRuntimeRoute(h.handle, route.runtimeRouteId);
        plan.dependencyPins[0].integrity = hash(route);
        const narrator = plan.definition.nodes[0], output = plan.definition.nodes[1];
        const fanout = { nodeId: id('Node'), kind: 'fanout', label: 'Authorized advisory branches', inputs: [], outputs: [port('task', 'task.result', false)],
            dependencyPinIds: [], capabilities: [], policy: { maxConcurrency, failurePolicy } };
        const join = { nodeId: id('Node'), kind: 'join', label: 'All advisory branches', inputs: [], outputs: [port('joined', 'text', false)],
            dependencyPinIds: [], capabilities: [], policy: { strategy, quorum, deadlineMs: joinDeadlineMs } };
        const branches = [];
        for (let i = 0; i < branchCount; i++) {
            const next = { ...route, runtimeRouteId: createNativeId('runtimeRoute'), displayName: 'Declared branch ' + i };
            await seeded.persistence.saveRuntimeRoute(h.handle, next);
            const current = await seeded.persistence.getRuntimeRoute(h.handle, next.runtimeRouteId), pinId = 'branch' + i + '.route';
            plan.dependencyPins.push({ pinId, port: 'model', resourceRef: { scope: 'player', runtimeRouteId: next.runtimeRouteId }, integrity: hash(current) });
            branches.push({ ...narrator, nodeId: id('Node'), label: 'Branch ' + i, inputs: [port('task', 'task.result')], dependencyPinIds: [pinId], policy: { agentPinId: pinId } });
            join.inputs.push(port('branch' + i, 'text'));
        }
        narrator.inputs = [port('joined', 'text')]; output.capabilities = ['chat.output'];
        plan.definition.nodes = [fanout, ...branches, join, narrator, output]; plan.definition.entryNodeIds = [fanout.nodeId];
        plan.definition.edges = [...branches.flatMap((branch, i) => [edge(fanout, 'task', branch, 'task'), edge(branch, 'response', join, 'branch' + i)]),
            edge(join, 'joined', narrator, 'joined'), ...plan.definition.edges];
        plan.definition.capabilityCeiling = ['generation.send', 'chat.output'];
        Object.assign(plan.definition.limits, { maxSteps: 100, maxConcurrency });
        Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', allowPartial, resultPolicy: { outputType: 'text', maxBytes: 65536 } });
        profile = { fanout, join, narrator, branches };
    } });
    return { ...f, profile };
}
