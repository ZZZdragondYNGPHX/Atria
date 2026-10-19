import { sessionDelegationFixture } from './session-delegation-fixture.js';
import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';

const id = kind => createNativeId('orchestration' + kind);
const port = (name, type, required = true) => ({ name, type, required });
const edge = (from, to, input, maxVisits = 1) => ({ edgeId: id('Edge'), from: { nodeId: from.nodeId, port: from.outputs[0].name },
    to: { nodeId: to.nodeId, port: input }, condition: 'always', maxVisits, loopBack: false });
export const sessionChildQualityTask = body => body.input.map(item => { try { return JSON.parse(item.content); } catch { return null; } }).find(item => item?.nodeId);

export async function sessionDelegatedQualityFixture(make, { judge = false, childRequests = judge ? 4 : 5, maxRounds = 2 } = {}) {
    let draft, alternative, quality, final, reviewRound = 0, draftRound = 0;
    const f = await sessionDelegationFixture(make, { childSteps: 1, childRequests, parentRequests: childRequests + 2,
        configureChild: async (child, { seeded, h }) => {
            final = child.definition.nodes[0]; const output = child.definition.nodes[1], actor = final.policy.audiencePinId;
            const route = await seeded.persistence.getRuntimeRoute(h.handle, child.dependencyPins[0].resourceRef.runtimeRouteId);
            const model = { ...seeded.model, modelProfileId: createNativeId('modelProfile'), remoteModelId: judge ? 'session-child-original-judge' : 'session-child-original-review' };
            await seeded.persistence.saveModelProfile(h.handle, model);
            const controlRoute = { ...route, runtimeRouteId: createNativeId('runtimeRoute'), modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId },
                executionPolicy: { ...route.executionPolicy, allowedModelProfileIds: [model.modelProfileId] } };
            await seeded.persistence.saveRuntimeRoute(h.handle, controlRoute);
            child.dependencyPins.push({ pinId: 'child.quality', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: controlRoute.runtimeRouteId }, integrity: hash(controlRoute) });
            draft = { ...structuredClone(final), nodeId: id('Node'), label: 'Child advisory draft to assess', inputs: [] };
            quality = { nodeId: id('Node'), kind: judge ? 'judge' : 'review', label: judge ? 'Child original typed candidate Judge' : 'Child original bounded quality Review',
                inputs: [port('draft', 'text')], outputs: [port('decision', 'json', false)], dependencyPinIds: ['child.quality', actor], capabilities: ['generation.send'],
                policy: { agentPinId: 'child.quality', audiencePinId: actor, ...judge ? {} : { maxRounds } } };
            final.inputs = [port('draft', 'text', !judge), port('quality', 'json')];
            child.definition.nodes = [draft, quality, final, output]; child.definition.entryNodeIds = [draft.nodeId];
            child.definition.edges = [edge(draft, quality, 'draft', judge ? 1 : maxRounds), edge(draft, final, 'draft'), edge(quality, final, 'quality'), ...child.definition.edges];
            if (judge) {
                alternative = { ...structuredClone(draft), nodeId: id('Node'), label: 'Child second independent advisory candidate' };
                quality.inputs.push(port('alternative', 'text')); final.inputs.push(port('alternative', 'text', false));
                child.definition.nodes.splice(1, 0, alternative); child.definition.entryNodeIds.push(alternative.nodeId);
                child.definition.edges.push(edge(alternative, quality, 'alternative'), edge(alternative, final, 'alternative'));
            }
            Object.assign(child.definition.limits, { maxAttempts: judge ? 5 : 6, maxNodes: child.definition.nodes.length,
                maxEdges: child.definition.edges.length, maxEdgeVisits: judge ? 6 : 5, maxReviews: judge ? 0 : maxRounds });
        }, responsePayload: (body, _index, topology) => {
            const task = sessionChildQualityTask(body);
            if (task.nodeId === quality.nodeId) return judge
                ? JSON.stringify({ selectedResultRef: task.candidateRefs[0], reasonCode: 'candidate_selected' })
                : JSON.stringify({ decision: ++reviewRound === 1 ? 'rerun' : 'approve', reasonCode: reviewRound === 1 ? 'draft_incomplete' : 'quality_ready',
                    targetAttemptIds: [task.reviewTargets[0].attemptId] });
            if (task.nodeId === draft.nodeId) return judge ? 'CHILD_JUDGE_CANDIDATE_A' : 'CHILD_REVIEW_DRAFT_' + ++draftRound;
            if (task.nodeId === alternative?.nodeId) return 'CHILD_JUDGE_CANDIDATE_B';
            if (task.nodeId === final.nodeId) return 'CHILD_QUALITY_TERMINAL';
            return JSON.stringify(body.input).includes(topology.delegator.label) ? 'PARENT_ACCEPTED_CHILD_QUALITY' : 'The NPC waits for the player choice.';
        },
    });
    return { ...f, get authority() { return f.authority; }, get core() { return f.core; }, get effectRef() { return f.effectRef; }, draft, alternative, quality, final };
}
