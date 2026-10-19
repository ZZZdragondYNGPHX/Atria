import { rpModelFixture } from './rp-model-fixture.js';
import { seedControlActorAudiences } from './rp-control-audience-fixture.js';
import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';

const id = kind => createNativeId('orchestration' + kind);
export const text = body => body.messages.flatMap(message => typeof message.content === 'string' ? [message.content] : message.content.map(part => part.text ?? '')).join('\n');

/** No new loop protocol: late Planner's sole published return edge names
 * the earlier Agent. Review remains approve, never a fake invalidation. */
export async function rpReviewReturnLoopFixture(make, { withJudge = false, maxRounds = 2, maxJobs = 64 } = {}) {
    let nodes, source, loop; const rounds = new Map(), calls = withJudge ? 10 : 8;
    const f = await rpModelFixture(make, { configurePlan: async (plan, env) => {
        const [narrator, output] = plan.definition.nodes;
        const route = { ...env.route, executionPolicy: { ...env.route.executionPolicy, computeBudget: {
            ...env.route.executionPolicy.computeBudget, maxRequests: calls,
            localWork: { ...env.route.executionPolicy.computeBudget.localWork, maxJobs } } } };
        await env.seeded.persistence.saveRuntimeRoute(env.h.handle, route);
        plan.dependencyPins[0].integrity = hash(await env.seeded.persistence.getRuntimeRoute(env.h.handle, route.runtimeRouteId));
        const port = (name, type, required = true) => ({ name, type, required });
        const node = async (label, kind, inputs) => {
            const connection = { ...env.seeded.connection, connectionProfileId: createNativeId('connectionProfile'), displayName: label };
            await env.seeded.persistence.saveConnectionProfile(env.h.handle, connection);
            const model = { ...env.seeded.model, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'review-return-' + label,
                connectionProfileRef: { scope: 'player', connectionProfileId: connection.connectionProfileId } };
            await env.seeded.persistence.saveModelProfile(env.h.handle, model);
            const owned = { ...route, runtimeRouteId: createNativeId('runtimeRoute'), displayName: label,
                modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId }, connectionProfileRef: model.connectionProfileRef,
                executionPolicy: { ...route.executionPolicy, allowedModelProfileIds: [model.modelProfileId] } };
            await env.seeded.persistence.saveRuntimeRoute(env.h.handle, owned);
            const pinId = 'review-return.' + label;
            plan.dependencyPins.push({ pinId, port: 'model', resourceRef: { scope: 'player', runtimeRouteId: owned.runtimeRouteId },
                integrity: hash(await env.seeded.persistence.getRuntimeRoute(env.h.handle, owned.runtimeRouteId)) });
            return { nodeId: id('Node'), kind, label, inputs, outputs: [port('response', kind === 'agent' ? 'text' : 'json')],
                capabilities: ['generation.send', ...kind === 'planner' ? ['graph.patch'] : []], dependencyPinIds: [pinId],
                policy: { agentPinId: pinId, ...kind === 'review' ? { maxRounds } : {} } };
        };
        const entry = await node('entry', 'planner', []);
        const target = await node('target', 'agent', [port('entry', 'json'), port('feedback', 'json', false)]);
        const review = await node('review', 'review', [port('draft', 'text')]);
        const judge = withJudge ? await node('judge', 'judge', [port('draft', 'text'), port('quality', 'json')]) : null;
        const late = await node('late', 'planner', [port('work', 'text'), port('quality', 'json'), ...judge ? [port('choice', 'json')] : []]);
        narrator.inputs = [port('work', 'text'), port('quality', 'json'), port('control', 'json'), ...judge ? [port('choice', 'json')] : []]; output.capabilities = ['chat.output'];
        const edge = (from, to, input, maxVisits = 1, loopBack = false) => ({ edgeId: id('Edge'),
            from: { nodeId: from.nodeId, port: 'response' }, to: { nodeId: to.nodeId, port: input }, condition: 'success', maxVisits, loopBack });
        loop = edge(late, target, 'feedback', 1, true);
        plan.definition.nodes = [entry, target, review, ...judge ? [judge] : [], late, narrator, output]; plan.definition.entryNodeIds = [entry.nodeId];
        plan.definition.edges = [edge(entry, target, 'entry', 2), edge(target, review, 'draft', 2), edge(target, late, 'work', 2), edge(review, late, 'quality', 2),
            ...judge ? [edge(target, judge, 'draft', 2), edge(review, judge, 'quality', 2), edge(judge, late, 'choice', 2), edge(judge, narrator, 'choice')] : [],
            edge(target, narrator, 'work'), edge(review, narrator, 'quality'), edge(late, narrator, 'control'), loop, ...plan.definition.edges];
        plan.definition.capabilityCeiling = ['generation.send', 'graph.patch', 'chat.output'];
        plan.definition.graphChangePolicy = { allowedOperations: ['requestReplan', 'requestFinalize'], allowedNodeKinds: [] };
        Object.assign(plan.definition.limits, { maxSteps: 160, maxAttempts: calls + 1, maxPatches: 3, maxReviews: 2,
            maxReplans: 1, maxLoopIterations: 1, maxEdges: plan.definition.edges.length, maxEdgeVisits: plan.definition.edges.length + (withJudge ? 7 : 4) });
        Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 65536 } });
        source = await seedControlActorAudiences(plan, env); nodes = { entry, target, review, judge, late, narrator };
    }, responsePayload: body => {
        const content = text(body), nodeId = content.match(/"task":\{"nodeId":"([^"]+)"/)?.[1], node = Object.values(nodes).find(item => item?.nodeId === nodeId);
        if (!node) throw new Error('Missing actual Review bounded-return task');
        const round = (rounds.get(nodeId) ?? 0) + 1; rounds.set(nodeId, round);
        if (node.kind === 'planner') return JSON.stringify({ operations: [{ op: node === nodes.late && round === 1 ? 'requestReplan' : 'requestFinalize' }] });
        if (node.kind === 'review') return JSON.stringify({ decision: 'approve', reasonCode: 'quality_ready',
            targetAttemptIds: JSON.parse(content.match(/"evidence":(\[[^\]]+\])/)?.[1] ?? '[]').map(item => item.attemptId) });
        if (node.kind === 'judge') return JSON.stringify({ reasonCode: 'candidate_selected',
            selectedResultRef: JSON.parse(content.match(/"candidates":(\[[^\]]+\])/)?.[1] ?? '[]')[0].resultRef });
        return node === nodes.narrator ? 'Final bounded Review return.' : 'ROUND_' + round + '_A_PRIVATE';
    } });
    return { ...f, nodes, source, loop, calls };
}
