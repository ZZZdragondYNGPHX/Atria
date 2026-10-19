import { modelPortFixture } from './model-port-fixture.js';
import { configureSessionOutput } from './session-output-fixture.js';
import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';
import { readAudienceSource } from '../../../src/native/orchestration/audience-source-contracts.js';

const id = kind => createNativeId('orchestration' + kind);
const port = (name, type, required = true) => ({ name, type, required });
const edge = (from, to, input, maxVisits = 2) => ({ edgeId: id('Edge'), from: { nodeId: from.nodeId, port: from.outputs[0].name },
    to: { nodeId: to.nodeId, port: input }, condition: 'always', maxVisits, loopBack: false });
const task = body => body.input.map(item => { try { return JSON.parse(item.content); } catch { return null; } }).find(value => value?.nodeId);

/** Two authored independent targets, two real Review Nodes and a settled
 * downstream Agent all use original Results, control receipts and one bank. */
export async function sessionMultiReviewFixture(make, { maxRequests = 11, invalidTarget = false, unreadable = false } = {}) {
    let topology, independentTargets = [];
    const visits = new Map();
    const f = await modelPortFixture(make, { configurePlan: async args => {
        configureSessionOutput(args);
        const { plan, h, core, base, seeded } = args, narrator = plan.definition.nodes[0], output = plan.definition.nodes[1];
        const pin = async (pinId, audience) => {
            const resourceRef = { kind: 'native_information_context', anchor: 'run_source', sessionId: base.session.sessionId, audience };
            return { pinId, port: 'context', resourceRef, integrity: hash((await readAudienceSource(h.handle, resourceRef, core)).descriptor) };
        };
        const actorPin = await pin('multi-review.actor', { kind: 'actor', id: base.manifest.actors[0].actorId });
        const narratorPin = await pin('multi-review.narrator', { kind: 'narrator' });
        const route = await seeded.persistence.getRuntimeRoute(h.handle, plan.dependencyPins[0].resourceRef.runtimeRouteId);
        const parentRoute = { ...route, executionPolicy: { ...route.executionPolicy, computeBudget: { ...route.executionPolicy.computeBudget, maxRequests,
            localWork: { ...route.executionPolicy.computeBudget.localWork, maxJobs: 192, maxItems: 10000 } } } };
        await seeded.persistence.saveRuntimeRoute(h.handle, parentRoute); plan.dependencyPins[0].integrity = hash(parentRoute);
        const routePin = async (pinId, remoteModelId) => {
            const model = { ...seeded.model, modelProfileId: createNativeId('modelProfile'), remoteModelId };
            await seeded.persistence.saveModelProfile(h.handle, model);
            const next = { ...parentRoute, runtimeRouteId: createNativeId('runtimeRoute'), modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId },
                executionPolicy: { ...parentRoute.executionPolicy, allowedModelProfileIds: [model.modelProfileId] } };
            await seeded.persistence.saveRuntimeRoute(h.handle, next);
            plan.dependencyPins.push({ pinId, port: 'model', resourceRef: { scope: 'player', runtimeRouteId: next.runtimeRouteId }, integrity: hash(next) });
            return pinId;
        };
        const secondRoute = await routePin('multi-review.second.route', 'session-multi-review-second-agent');
        const firstReviewRoute = await routePin('multi-review.first.route', 'session-multi-review-first-reviewer');
        const secondReviewRoute = await routePin('multi-review.final.route', 'session-multi-review-final-reviewer');
        const node = (label, kind, routePin, inputs, audiencePin = actorPin) => ({ nodeId: id('Node'), kind, label, inputs,
            outputs: [port(kind === 'review' ? 'decision' : 'advice', kind === 'review' ? 'json' : 'text', false)],
            dependencyPinIds: [routePin, audiencePin.pinId], capabilities: ['generation.send'],
            policy: { agentPinId: routePin, audiencePinId: audiencePin.pinId, ...(kind === 'review' ? { maxRounds: 2 } : {}) } });
        const first = node('FIRST_TYPED_TARGET', 'agent', 'narrator.route', []);
        const second = node('SECOND_TYPED_TARGET', 'agent', secondRoute, [], unreadable ? narratorPin : actorPin);
        const firstReview = node('FIRST_INDEPENDENT_REVIEW', 'review', firstReviewRoute, [port('first', 'text'), port('second', 'text')]);
        const merge = node('SETTLED_MERGE_IN_REDO_CLOSURE', 'agent', 'narrator.route', [port('first', 'text'), port('second', 'text'), port('quality', 'json')]);
        const secondReview = node('SECOND_REVIEW_REQUESTS_ORIGINAL_CLOSURE', 'review', secondReviewRoute,
            [port('first', 'text'), port('second', 'text'), port('merged', 'text')]);
        narrator.inputs = [port('merged', 'text'), port('quality', 'json')];
        narrator.dependencyPinIds.push(narratorPin.pinId); narrator.policy.audiencePinId = narratorPin.pinId;
        plan.definition.nodes = [first, second, firstReview, merge, secondReview, narrator, output];
        plan.definition.entryNodeIds = [first.nodeId, second.nodeId];
        plan.definition.edges = [edge(first, firstReview, 'first'), edge(second, firstReview, 'second'),
            edge(first, merge, 'first'), edge(second, merge, 'second'), edge(firstReview, merge, 'quality'),
            edge(first, secondReview, 'first'), edge(second, secondReview, 'second'), edge(merge, secondReview, 'merged'),
            edge(merge, narrator, 'merged', 1), edge(secondReview, narrator, 'quality', 1), ...plan.definition.edges];
        Object.assign(plan.definition.limits, { maxSteps: 220, maxAttempts: 12, maxNodes: 16, maxEdges: 24, maxEdgeVisits: 24, maxReviews: 4, deadlineMs: 300000 });
        plan.dependencyPins.push(actorPin, narratorPin); topology = { first, second, firstReview, merge, secondReview, narrator, output };
    }, responseBody: ({ body, index }) => {
        const current = task(body), round = (visits.get(current?.nodeId) ?? 0) + 1; visits.set(current?.nodeId, round);
        let text;
        if (current?.reviewTargets) {
            const redo = current.nodeId === topology.secondReview.nodeId && round === 1;
            if (current.nodeId === topology.firstReview.nodeId) independentTargets = current.reviewTargets.map(item => item.attemptId);
            if (independentTargets.length !== 2 || independentTargets.some(attemptId => !current.reviewTargets.some(item => item.attemptId === attemptId)))
                throw new Error('Missing original independent typed Review targets');
            text = JSON.stringify({ decision: redo ? 'rerun' : 'approve', reasonCode: redo ? 'draft_incomplete' : 'quality_ready',
                targetAttemptIds: invalidTarget && redo ? [id('Attempt')] : independentTargets });
        } else text = current?.nodeId === topology.first.nodeId ? 'FIRST_' + round : current?.nodeId === topology.second.nodeId ? 'SECOND_' + round
            : current?.nodeId === topology.merge.nodeId ? 'MERGE_' + round : 'The NPC awaits your choice after both Reviews.';
        return { id: 'multi-review-response-' + index, status: 'completed', output: [{ id: 'message-' + index, type: 'message', status: 'completed', role: 'assistant',
            content: [{ type: 'output_text', text, annotations: [] }] }], usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } };
    } });
    return { ...f, get effectRef() { return f.effectRef; }, get authority() { return f.authority; }, get core() { return f.core; }, topology };
}
