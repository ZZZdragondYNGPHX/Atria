import { rpModelFixture } from './rp-model-fixture.js';
import { seedControlActorAudiences } from './rp-control-audience-fixture.js';
import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';

const id = kind => createNativeId('orchestration' + kind);
export const bodyText = body => body.messages.flatMap(message => typeof message.content === 'string' ? [message.content] : message.content.map(part => part.text ?? '')).join('\n');

export async function rpComposableFanoutFixture(make, { usage = true, maxRequests = null, maxConcurrency = 2, judge = true, withPlanner = true, quality = true, scopePlanner = false, joinStrategy = 'all-success', scopeResponse = null } = {}) {
    let nodes, source;
    const f = await rpModelFixture(make, { usage, configurePlan: async (plan, env) => {
        const [narrator, output] = plan.definition.nodes;
        const route = { ...env.route, executionPolicy: { ...env.route.executionPolicy,
            computeBudget: { ...env.route.executionPolicy.computeBudget, maxRequests: maxRequests ?? 5 + Number(withPlanner) + Number(quality) + Number(quality && judge), localWork: { ...env.route.executionPolicy.computeBudget.localWork, maxJobs: 64 } } } };
        await env.seeded.persistence.saveRuntimeRoute(env.h.handle, route);
        plan.dependencyPins[0].integrity = hash(await env.seeded.persistence.getRuntimeRoute(env.h.handle, route.runtimeRouteId));
        const port = (name, type, required = true) => ({ name, type, required });
        const node = async (kind, label, inputs) => {
            const connection = { ...env.seeded.connection, connectionProfileId: createNativeId('connectionProfile'), displayName: label };
            await env.seeded.persistence.saveConnectionProfile(env.h.handle, connection);
            const model = { ...env.seeded.model, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'fanout-' + label,
                connectionProfileRef: { scope: 'player', connectionProfileId: connection.connectionProfileId } };
            await env.seeded.persistence.saveModelProfile(env.h.handle, model);
            const owned = { ...route, runtimeRouteId: createNativeId('runtimeRoute'), displayName: label,
                modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId }, connectionProfileRef: model.connectionProfileRef,
                executionPolicy: { ...route.executionPolicy, allowedModelProfileIds: [model.modelProfileId] } };
            await env.seeded.persistence.saveRuntimeRoute(env.h.handle, owned);
            const pinId = 'fanout.' + label;
            plan.dependencyPins.push({ pinId, port: 'model', resourceRef: { scope: 'player', runtimeRouteId: owned.runtimeRouteId },
                integrity: hash(await env.seeded.persistence.getRuntimeRoute(env.h.handle, owned.runtimeRouteId)) });
            return { nodeId: id('Node'), kind, label, inputs, outputs: [port('response', kind === 'agent' ? 'text' : 'json')],
                dependencyPinIds: [pinId], capabilities: ['generation.send', ...kind === 'planner' ? ['graph.patch'] : []],
                policy: { agentPinId: pinId, ...kind === 'review' ? { maxRounds: 2 } : {} } };
        };
        const planner = withPlanner ? await node('planner', 'planner', []) : null;
        const a = await node(scopePlanner ? 'planner' : 'agent', 'branch-a', [port('task', 'task.result')]);
        const a2 = await node('agent', 'branch-a-next', [port('previous', scopePlanner ? 'json' : 'text')]);
        const b = await node('agent', 'branch-b', [port('task', 'task.result')]);
        const after = await node('agent', 'after-join', [port('joined', 'text')]);
        const review = quality ? await node('review', 'review', [port('draft', 'text')]) : null;
        const chooser = quality && judge ? await node('judge', 'judge', [port('draft', 'text'), port('quality', 'json')]) : null;
        const fanout = { nodeId: id('Node'), kind: 'fanout', label: 'Frozen work', inputs: withPlanner ? [port('control', 'json')] : [], outputs: [port('response', 'task.result')],
            dependencyPinIds: [], capabilities: [], policy: { maxConcurrency, failurePolicy: 'continue' } };
        const join = { nodeId: id('Node'), kind: 'join', label: 'Deterministic barrier', inputs: [port('a', 'text'), port('b', 'text')], outputs: [port('response', 'text')],
            dependencyPinIds: [], capabilities: [], policy: { strategy: joinStrategy, quorum: 2, deadlineMs: 60000 } };
        narrator.inputs = [port('draft', 'text'), ...review ? [port('quality', 'json')] : [], ...chooser ? [port('choice', 'json')] : []]; output.capabilities = ['chat.output'];
        const edge = (from, to, input, condition = 'success') => ({ edgeId: id('Edge'), from: { nodeId: from.nodeId, port: 'response' },
            to: { nodeId: to.nodeId, port: input }, condition, maxVisits: 1, loopBack: false });
        plan.definition.nodes = [...planner ? [planner] : [], fanout, a, a2, b, join, after, ...review ? [review] : [], ...chooser ? [chooser] : [], narrator, output];
        plan.definition.entryNodeIds = [(planner ?? fanout).nodeId]; plan.definition.edges = [...planner ? [edge(planner, fanout, 'control')] : [],
            edge(fanout, a, 'task'), edge(fanout, b, 'task'), edge(a, a2, 'previous'), edge(a2, join, 'a', 'always'), edge(b, join, 'b', 'always'),
            edge(join, after, 'joined'), edge(after, narrator, 'draft'), ...review ? [edge(after, review, 'draft'), edge(review, narrator, 'quality')] : [],
            ...chooser ? [edge(after, chooser, 'draft'), edge(review, chooser, 'quality'), edge(chooser, narrator, 'choice')] : [], ...plan.definition.edges];
        plan.definition.capabilityCeiling = ['generation.send', ...planner || scopePlanner ? ['graph.patch'] : [], 'chat.output'];
        plan.definition.graphChangePolicy = { allowedOperations: scopePlanner ? ['requestFinalize', 'setPendingPriority'] : planner ? ['requestFinalize'] : [], allowedNodeKinds: [] };
        Object.assign(plan.definition.limits, { maxSteps: 100, maxAttempts: plan.definition.nodes.length, maxConcurrency, maxNodes: plan.definition.nodes.length,
            maxEdges: plan.definition.edges.length, maxEdgeVisits: plan.definition.edges.length });
        Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 65536 } });
        source = await seedControlActorAudiences(plan, env); nodes = { planner, fanout, a, a2, b, join, after, review, judge: chooser, narrator };
        // Preserve one independently pinned B branch. Its neighbors stay A;
        // their Result body access is decided by the original Source contract.
        for (const target of [a2, after]) {
            const removed = target.policy.audiencePinId;
            target.dependencyPinIds = target.dependencyPinIds.map(pin => pin === removed ? a.policy.audiencePinId : pin);
            target.policy.audiencePinId = a.policy.audiencePinId; plan.dependencyPins = plan.dependencyPins.filter(pin => pin.pinId !== removed);
        }
    }, responsePayload: body => {
        const content = bodyText(body), nodeId = content.match(/"task":\{"nodeId":"([^"]+)"/)?.[1];
        if (nodeId === nodes.planner?.nodeId) return JSON.stringify({ operations: [{ op: 'requestFinalize' }] });
        if (scopePlanner && nodeId === nodes.a.nodeId) return JSON.stringify({ operations: scopeResponse ? scopeResponse(nodes)
            : [{ op: 'setPendingPriority', nodeId: nodes.a2.nodeId, priority: 2 }, { op: 'requestFinalize' }] });
        for (const name of ['a', 'a2', 'b', 'after']) if (nodeId === nodes[name].nodeId) return 'ADVISORY_' + name.toUpperCase();
        if (nodeId === nodes.review?.nodeId) return JSON.stringify({ decision: 'approve', reasonCode: 'quality_ready',
            targetAttemptIds: JSON.parse(content.match(/"evidence":(\[[^\]]+\])/)?.[1] ?? '[]').map(item => item.attemptId) });
        if (nodeId === nodes.judge?.nodeId) return JSON.stringify({ reasonCode: 'candidate_selected',
            selectedResultRef: JSON.parse(content.match(/"candidates":(\[[^\]]+\])/)?.[1] ?? '[]')[0].resultRef });
        if (nodeId !== nodes.narrator.nodeId) throw new Error('Missing actual Fanout graph task');
        return 'Final joined and reviewed RP.';
    } });
    return { ...f, nodes, source };
}
