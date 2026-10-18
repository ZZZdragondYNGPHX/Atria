import { modelPortFixture } from './model-port-fixture.js';
import { configureSessionOutput } from './session-output-fixture.js';
import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';
import { readAudienceSource } from '../../../src/native/orchestration/audience-source-contracts.js';

const id = kind => createNativeId('orchestration' + kind);
const port = (name, type, required = true) => ({ name, type, required });
const edge = (from, to, input, { maxVisits = 1, loopBack = false } = {}) => ({ edgeId: id('Edge'),
    from: { nodeId: from.nodeId, port: from.outputs[0].name }, to: { nodeId: to.nodeId, port: input }, condition: 'always', maxVisits, loopBack });
export const sessionReplanTask = body => body.input.map(item => { try { return JSON.parse(item.content); } catch { return null; } }).find(value => value?.nodeId);

export async function sessionReplanFixture(make, { self = false, withReview = false, withJudge = false, maxRounds = 2, maxRequests = self ? 3 : withJudge ? 9 : withReview ? 7 : 5, repeat = false, exhaustLoop = false, unknownAt = null } = {}) {
    if (self && withReview || withJudge && !withReview) throw new TypeError('This fixture declares quality control only on its nonself Actor return');
    let topology;
    const visits = new Map(), responseTexts = [];
    const f = await modelPortFixture(make, { responseStatus: ordinal => ordinal === unknownAt ? null : 200, configurePlan: async args => {
        configureSessionOutput(args);
        const { plan, h, core, base, seeded } = args, narrator = plan.definition.nodes[0], output = plan.definition.nodes[1];
        const pin = async (pinId, audience) => {
            const resourceRef = { kind: 'native_information_context', anchor: 'run_source', sessionId: base.session.sessionId, audience };
            return { pinId, port: 'context', resourceRef, integrity: hash((await readAudienceSource(h.handle, resourceRef, core)).descriptor) };
        };
        const actor = await pin('replan.actor', { kind: 'actor', id: base.manifest.actors[0].actorId });
        const final = await pin('replan.narrator', { kind: 'narrator' });
        const route = await seeded.persistence.getRuntimeRoute(h.handle, plan.dependencyPins[0].resourceRef.runtimeRouteId);
        const main = { ...route, executionPolicy: { ...route.executionPolicy, computeBudget: { ...route.executionPolicy.computeBudget, maxRequests,
            localWork: { ...route.executionPolicy.computeBudget.localWork, maxJobs: 96, maxItems: 10000 } } } };
        await seeded.persistence.saveRuntimeRoute(h.handle, main); plan.dependencyPins[0].integrity = hash(main);
        const model = { ...seeded.model, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'session-original-replan-planner' };
        await seeded.persistence.saveModelProfile(h.handle, model);
        const plannerRoute = { ...main, runtimeRouteId: createNativeId('runtimeRoute'), modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId },
            executionPolicy: { ...main.executionPolicy, allowedModelProfileIds: [model.modelProfileId] } };
        await seeded.persistence.saveRuntimeRoute(h.handle, plannerRoute);
        const advisory = { nodeId: id('Node'), kind: 'agent', label: 'Original Actor task with explicit published return port',
            inputs: [port('return', 'json', false)], outputs: [port('advice', 'text', false)], dependencyPinIds: ['narrator.route', actor.pinId],
            capabilities: ['generation.send'], policy: { agentPinId: 'narrator.route', audiencePinId: actor.pinId } };
        const qualityPins = [];
        const quality = async (kind, inputs) => {
            const ownedModel = { ...seeded.model, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'session-original-replan-' + kind };
            await seeded.persistence.saveModelProfile(h.handle, ownedModel);
            const ownedRoute = { ...main, runtimeRouteId: createNativeId('runtimeRoute'), modelProfileRef: { scope: 'player', modelProfileId: ownedModel.modelProfileId },
                executionPolicy: { ...main.executionPolicy, allowedModelProfileIds: [ownedModel.modelProfileId] } };
            await seeded.persistence.saveRuntimeRoute(h.handle, ownedRoute);
            const pinId = 'replan.' + kind + '.route';
            qualityPins.push({ pinId, port: 'model', resourceRef: { scope: 'player', runtimeRouteId: ownedRoute.runtimeRouteId }, integrity: hash(ownedRoute) });
            return { nodeId: id('Node'), kind, label: 'Original bounded Session ' + kind, inputs, outputs: [port('quality', 'json', false)],
                dependencyPinIds: [pinId, actor.pinId], capabilities: ['generation.send'],
                policy: { agentPinId: pinId, audiencePinId: actor.pinId, ...kind === 'review' ? { maxRounds } : {} } };
        };
        const review = withReview ? await quality('review', [port('advice', 'text')]) : null;
        const judge = withJudge ? await quality('judge', [port('advice', 'text'), port('quality', 'json')]) : null;
        const planner = { nodeId: id('Node'), kind: 'planner', label: 'Original bounded Session Planner', inputs: [self ? port('return', 'json', false) : port('advice', 'text'), ...review ? [port('quality', 'json')] : [], ...judge ? [port('choice', 'json')] : []],
            outputs: [port('control', 'json', false)], dependencyPinIds: ['replan.route', actor.pinId], capabilities: ['generation.send', 'graph.patch'],
            policy: { agentPinId: 'replan.route', audiencePinId: actor.pinId } };
        narrator.inputs = [...self ? [] : [port('advice', 'text')], port('control', 'json'), ...review ? [port('quality', 'json')] : [], ...judge ? [port('choice', 'json')] : []];
        narrator.policy.audiencePinId = final.pinId; narrator.dependencyPinIds.push(final.pinId);
        const back = edge(planner, self ? planner : advisory, 'return', { loopBack: true, maxVisits: repeat ? 2 : 1 });
        plan.definition.nodes = [...self ? [] : [advisory], ...review ? [review] : [], ...judge ? [judge] : [], planner, narrator, output]; plan.definition.entryNodeIds = [self ? planner.nodeId : advisory.nodeId];
        plan.definition.edges = [...self ? [] : [edge(advisory, planner, 'advice', { maxVisits: 3 }), edge(advisory, narrator, 'advice')],
            ...review ? [edge(advisory, review, 'advice', { maxVisits: 3 }), edge(review, planner, 'quality', { maxVisits: 3 }), edge(review, narrator, 'quality')] : [],
            ...judge ? [edge(advisory, judge, 'advice', { maxVisits: 3 }), edge(review, judge, 'quality', { maxVisits: 3 }), edge(judge, planner, 'choice', { maxVisits: 3 }), edge(judge, narrator, 'choice')] : [],
            back, edge(planner, narrator, 'control'), ...plan.definition.edges];
        plan.definition.capabilityCeiling = ['chat.output', 'generation.send', 'graph.patch'];
        plan.definition.graphChangePolicy = { allowedOperations: ['requestReplan', 'requestFinalize', ...exhaustLoop ? ['setPendingPriority'] : []], allowedNodeKinds: [] };
        Object.assign(plan.definition.limits, { maxSteps: 160, maxAttempts: 12, maxNodes: 12, maxEdges: 16, maxEdgeVisits: 20,
            ...withReview ? { maxReviews: 2 } : {}, maxPatches: 3, maxReplans: repeat || exhaustLoop ? 2 : 1, maxLoopIterations: repeat ? 2 : 1, deadlineMs: 300000 });
        plan.dependencyPins.push(actor, final, ...qualityPins, { pinId: 'replan.route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: plannerRoute.runtimeRouteId }, integrity: hash(plannerRoute) });
        topology = { advisory: self ? null : advisory, review, judge, planner, narrator, output, back };
    }, responseBody: ({ body, index }) => {
        const task = sessionReplanTask(body), round = (visits.get(task?.nodeId) ?? 0) + 1; visits.set(task?.nodeId, round);
        const operations = [...exhaustLoop ? [{ op: 'setPendingPriority', nodeId: topology.narrator.nodeId, priority: round }] : [],
            { op: round === 1 || repeat || exhaustLoop ? 'requestReplan' : 'requestFinalize' }];
        const text = task?.nodeId === topology.planner.nodeId ? JSON.stringify({ operations }, null, repeat && round > 1 ? 2 : undefined)
            : task?.nodeId === topology.review?.nodeId ? JSON.stringify({ decision: 'approve', reasonCode: 'quality_ready', ...task.reviewTargets ? { targetAttemptIds: task.reviewTargets.map(item => item.attemptId) } : {} })
                : task?.nodeId === topology.judge?.nodeId ? JSON.stringify({ selectedResultRef: task.candidateRefs[0], reasonCode: 'candidate_selected' })
                    : task?.nodeId === topology.advisory?.nodeId ? 'CURRENT_ACTOR_ADVICE_' + round : 'The NPC waits for your choice after bounded replanning.';
        responseTexts.push(text);
        return { id: 'session-replan-response-' + index, status: 'completed', output: [{ id: 'message-' + index, type: 'message', status: 'completed', role: 'assistant',
            content: [{ type: 'output_text', text, annotations: [] }] }], usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } };
    } });
    return { ...f, get effectRef() { return f.effectRef; }, get authority() { return f.authority; }, get core() { return f.core; }, topology, responseTexts };
}
