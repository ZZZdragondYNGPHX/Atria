import { sessionDelegationFixture } from './session-delegation-fixture.js';
import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';
import { readAttempt } from '../../../src/native/orchestration/controller-common.js';

const id = kind => createNativeId('orchestration' + kind);
const port = (name, type, required = true) => ({ name, type, required });
const edge = (from, to, input, maxVisits = 2) => ({ edgeId: id('Edge'), from: { nodeId: from.nodeId, port: from.outputs[0].name },
    to: { nodeId: to.nodeId, port: input }, condition: 'always', maxVisits, loopBack: false });
export const sessionChildPlannerRedoTask = body => body.input.map(item => { try { return JSON.parse(item.content); } catch { return null; } }).find(item => item?.nodeId);

/** Existing delegated Source/Scheduler/bank and Review/Graph controllers; only
 * the simulated remote response is synthetic. No child World writer. */
export async function sessionChildReviewPlannerRedoFixture(make, { childRequests = 7 } = {}) {
    let topology;
    const visits = new Map();
    const f = await sessionDelegationFixture(make, { childSteps: 1, childRequests, parentRequests: 9,
        configureChild: async (child, { seeded, h }) => {
            const final = child.definition.nodes[0], output = child.definition.nodes[1], actor = final.policy.audiencePinId;
            const route = await seeded.persistence.getRuntimeRoute(h.handle, child.dependencyPins[0].resourceRef.runtimeRouteId);
            const node = async (kind, label, inputs) => {
                const model = { ...seeded.model, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'session-child-redo-' + label };
                await seeded.persistence.saveModelProfile(h.handle, model);
                const owned = { ...route, runtimeRouteId: createNativeId('runtimeRoute'), modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId },
                    executionPolicy: { ...route.executionPolicy, allowedModelProfileIds: [model.modelProfileId] } };
                await seeded.persistence.saveRuntimeRoute(h.handle, owned);
                const pinId = 'child.redo.' + label;
                child.dependencyPins.push({ pinId, port: 'model', resourceRef: { scope: 'player', runtimeRouteId: owned.runtimeRouteId }, integrity: hash(owned) });
                return { nodeId: id('Node'), kind, label: 'Original child ' + label, inputs, outputs: [port('response', kind === 'agent' ? 'text' : 'json', false)],
                    dependencyPinIds: [pinId, actor], capabilities: ['generation.send', ...kind === 'planner' ? ['graph.patch'] : []],
                    policy: { agentPinId: pinId, audiencePinId: actor, ...kind === 'review' ? { maxRounds: 2 } : {} } };
            };
            const first = await node('agent', 'a', []), planner = await node('planner', 'planner', [port('evidence', 'text')]);
            const review = await node('review', 'review', [port('a', 'text'), port('control', 'json')]);
            final.inputs = [port('a', 'text'), port('control', 'json'), port('review', 'json')];
            child.definition.nodes = [first, planner, review, final, output]; child.definition.entryNodeIds = [first.nodeId];
            child.definition.edges = [edge(first, planner, 'evidence'), edge(first, review, 'a'), edge(planner, review, 'control'),
                edge(first, final, 'a', 1), edge(planner, final, 'control', 1), edge(review, final, 'review', 1), ...child.definition.edges];
            child.definition.capabilityCeiling = ['generation.send', 'graph.patch'];
            child.definition.graphChangePolicy = { allowedOperations: ['setPendingPriority', 'requestFinalize'], allowedNodeKinds: [] };
            // This independently published seven-Model closure keeps the original
            // child maxSteps64; existing five-Model quality plans are unchanged.
            Object.assign(child.definition.limits, { maxAttempts: 8, maxNodes: 5, maxEdges: 7,
                maxEdgeVisits: 10, maxPatches: 2, maxReviews: 2, maxReplans: 0, maxLoopIterations: 0 });
            topology = { first, planner, review, final, output };
        }, configureParent: async (plan, _args, parent) => {
            parent.delegator.capabilities.push('graph.patch'); plan.definition.capabilityCeiling.push('graph.patch');
            plan.definition.graphChangePolicy = { allowedOperations: ['setPendingPriority', 'requestFinalize'], allowedNodeKinds: [] };
        }, responsePayload: async (body, _index, parent) => {
            const task = sessionChildPlannerRedoTask(body), nodeId = task?.nodeId;
            const round = (visits.get(nodeId) ?? 0) + 1; visits.set(nodeId, round);
            if (nodeId === topology.first.nodeId) return 'CHILD_PLANNER_REDO_A_' + round;
            if (nodeId === topology.planner.nodeId) return JSON.stringify({ operations: round === 1
                ? [{ op: 'setPendingPriority', nodeId: topology.final.nodeId, priority: 7 }] : [{ op: 'requestFinalize' }] });
            if (nodeId === topology.review.nodeId) {
                const targets = await f.h.engine.withTransaction(f.h.handle, async tx => {
                    const parentRoot = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
                    const roots = await tx.listResources({ kind: 'atri_orchestration_run', handle: f.h.handle });
                    const child = roots.find(row => row.doc.parentRef?.parentRunId === parentRoot.runId)?.doc ?? parentRoot;
                    const ids = [];
                    for (const target of task.reviewTargets ?? []) {
                        const attempt = (await readAttempt(tx, f.h.handle, child, target.attemptId)).doc;
                        if (attempt.nodeId === topology.first.nodeId && attempt.resultRefs.some(ref => hash(ref) === hash(target.resultRef))) ids.push(attempt.attemptId);
                    }
                    return ids;
                });
                if (targets.length !== 1 || !JSON.stringify(body.input).includes('CHILD_PLANNER_REDO_A_' + round)) throw new Error('Missing actual typed child A evidence');
                return JSON.stringify({ decision: round === 1 ? 'rerun' : 'approve', reasonCode: round === 1 ? 'draft_incomplete' : 'quality_ready', targetAttemptIds: targets });
            }
            if (nodeId === topology.final.nodeId) return 'CHILD_REDO_TERMINAL';
            return JSON.stringify(body.input).includes(parent.delegator.label) ? 'PARENT_ACCEPTED_CHILD_REDO' : 'The NPC waits for the player choice.';
        } });
    return { ...f, get core() { return f.core; }, get authority() { return f.authority; }, get effectRef() { return f.effectRef; }, redo: topology };
}
