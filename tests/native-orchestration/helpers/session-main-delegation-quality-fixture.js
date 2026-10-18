import { sessionDelegationFixture } from './session-delegation-fixture.js';
import { createNativeId } from '../../../src/native/identity.js';

const id = kind => createNativeId('orchestration' + kind);
const port = (name, type) => ({ name, type, required: true });
const edge = (from, to, input, maxVisits = 1) => ({ edgeId: id('Edge'), from: { nodeId: from.nodeId, port: from.outputs[0].name },
    to: { nodeId: to.nodeId, port: input }, condition: 'always', maxVisits, loopBack: false });
export const sessionMainDelegationTask = body => body.input.map(item => { try { return JSON.parse(item.content); } catch { return null; } }).find(value => value?.nodeId);

/** One already-published G2 DAG. The original Host API chooses Delegate;
 * no new node kind, trigger field, authority, bank or child Source is added. */
export async function sessionMainDelegationQualityFixture(make) {
    let topology, reviewRound = 0, draftRound = 0;
    const f = await sessionDelegationFixture(make, { childSteps: 1, childRequests: 1, parentRequests: 8, maxConcurrency: 2,
        configureParent: async (plan, _args, existing) => {
            const { delegator, narrator, output } = existing;
            const model = (kind, label, inputs) => ({ nodeId: id('Node'), kind, label, inputs,
                outputs: [{ name: 'response', type: kind === 'agent' ? 'text' : 'json', required: false }],
                dependencyPinIds: ['narrator.route', existing.parentSource.pinId],
                capabilities: ['generation.send', ...kind === 'planner' ? ['graph.patch'] : []],
                policy: { agentPinId: 'narrator.route', audiencePinId: existing.parentSource.pinId, ...kind === 'review' ? { maxRounds: 2 } : {} } });
            const planner = model('planner', 'Published Game parent planning task', []);
            const draft = model('agent', 'Published Game parent evidence task', [port('control', 'json')]);
            const review = model('review', 'Published Game parent quality task', [port('draft', 'text')]);
            delegator.inputs = [port('draft', 'text'), port('quality', 'json'), port('control', 'json')];
            plan.definition.nodes = [planner, draft, review, delegator, narrator, output];
            plan.definition.entryNodeIds = [planner.nodeId];
            const formal = plan.definition.edges.find(item => item.to.nodeId === output.nodeId);
            plan.definition.edges = [edge(planner, draft, 'control', 2), edge(planner, delegator, 'control'), edge(draft, review, 'draft', 2),
                edge(draft, delegator, 'draft'), edge(review, delegator, 'quality'), edge(delegator, narrator, 'advice'), formal];
            plan.definition.capabilityCeiling.push('graph.patch');
            plan.definition.graphChangePolicy = { allowedOperations: ['setPendingPriority', 'requestFinalize'], allowedNodeKinds: [] };
            topology = { ...existing, planner, draft, review };
        },
        responsePayload: async (body, index) => {
            if (body.model === 'session-delegated-distinct-model') return 'CHILD_USED_CURRENT_REVIEWED_ACTOR_EVIDENCE_' + index;
            const task = sessionMainDelegationTask(body);
            if (task?.nodeId === topology.planner.nodeId) return JSON.stringify({ operations: [{ op: 'setPendingPriority', nodeId: topology.draft.nodeId, priority: 7 }] });
            if (task?.nodeId === topology.draft.nodeId) return 'CURRENT_PARENT_ACTOR_EVIDENCE_' + ++draftRound;
            if (task?.nodeId === topology.review.nodeId) {
                if (task.reviewTargets?.length !== 1 || !JSON.stringify(body.input).includes('CURRENT_PARENT_ACTOR_EVIDENCE')) throw new Error('Missing actual current review evidence');
                const rerun = reviewRound++ === 0;
                return JSON.stringify({ decision: rerun ? 'rerun' : 'approve', reasonCode: rerun ? 'draft_incomplete' : 'quality_ready', targetAttemptIds: task.reviewTargets.map(item => item.attemptId) });
            }
            if (task?.nodeId === topology.delegator.nodeId) return 'PARENT_USED_ONLY_APPROVED_CHILD_ADVICE';
            if (task?.nodeId === topology.narrator.nodeId) return 'The NPC waits for the player choice.';
            throw new Error('Unexpected published Game graph task');
        } });
    const original = f.authority.runSessionDelegation.bind(f.authority);
    f.authority.runSessionDelegation = args => original({ ...args, mode: 'delegate' });
    return { ...f, get effectRef() { return f.effectRef; }, get authority() { return f.authority; }, get core() { return f.core; }, topology };
}
