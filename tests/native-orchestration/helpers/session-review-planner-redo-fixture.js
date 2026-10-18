import { modelPortFixture } from './model-port-fixture.js';
import { configureSessionOutput } from './session-output-fixture.js';
import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';
import { readAudienceSource } from '../../../src/native/orchestration/audience-source-contracts.js';
import { readAttempt } from '../../../src/native/orchestration/controller-common.js';

const id = kind => createNativeId('orchestration' + kind);
const port = (name, type, required = true) => ({ name, type, required });
const edge = (from, to, input, maxVisits = 2) => ({ edgeId: id('Edge'), from: { nodeId: from.nodeId, port: from.outputs[0].name },
    to: { nodeId: to.nodeId, port: input }, condition: 'always', maxVisits, loopBack: false });
export const sessionPlannerRedoTask = body => body.input.map(item => { try { return JSON.parse(item.content); } catch { return null; } }).find(value => value?.nodeId);

/** A real reviewed causal closure includes a completed pure Planner. Its old
 * accepted patch and paid Model remain durable while new Attempts recompute. */
export async function sessionReviewPlannerRedoFixture(make, { maxRequests = 9 } = {}) {
    let topology;
    const visits = new Map();
    const f = await modelPortFixture(make, { configurePlan: async args => {
        configureSessionOutput(args);
        const { plan, h, core, base, seeded } = args, [narrator, output] = plan.definition.nodes;
        const pin = async (pinId, audience) => {
            const resourceRef = { kind: 'native_information_context', anchor: 'run_source', sessionId: base.session.sessionId, audience };
            return { pinId, port: 'context', resourceRef, integrity: hash((await readAudienceSource(h.handle, resourceRef, core)).descriptor) };
        };
        const actor = await pin('redo.actor', { kind: 'actor', id: base.manifest.actors[0].actorId });
        const final = await pin('redo.narrator', { kind: 'narrator' });
        const route = await seeded.persistence.getRuntimeRoute(h.handle, plan.dependencyPins[0].resourceRef.runtimeRouteId);
        const main = { ...route, executionPolicy: { ...route.executionPolicy, computeBudget: { ...route.executionPolicy.computeBudget, maxRequests,
            localWork: { ...route.executionPolicy.computeBudget.localWork, maxJobs: 96, maxItems: 10000 } } } };
        await seeded.persistence.saveRuntimeRoute(h.handle, main); plan.dependencyPins[0].integrity = hash(main);
        const makeNode = async (kind, label, inputs) => {
            const model = { ...seeded.model, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'session-redo-' + label };
            await seeded.persistence.saveModelProfile(h.handle, model);
            const owned = { ...main, runtimeRouteId: createNativeId('runtimeRoute'), modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId },
                executionPolicy: { ...main.executionPolicy, allowedModelProfileIds: [model.modelProfileId] } };
            await seeded.persistence.saveRuntimeRoute(h.handle, owned);
            const pinId = 'redo.' + label;
            plan.dependencyPins.push({ pinId, port: 'model', resourceRef: { scope: 'player', runtimeRouteId: owned.runtimeRouteId }, integrity: hash(owned) });
            return { nodeId: id('Node'), kind, label, inputs, outputs: [port('response', kind === 'agent' ? 'text' : 'json', false)],
                dependencyPinIds: [pinId, actor.pinId], capabilities: ['generation.send', ...kind === 'planner' ? ['graph.patch'] : []],
                policy: { agentPinId: pinId, audiencePinId: actor.pinId, ...kind === 'review' ? { maxRounds: 2 } : {} } };
        };
        const first = await makeNode('agent', 'a', []), planner = await makeNode('planner', 'planner', [port('seed', 'text')]);
        const second = await makeNode('agent', 'b', [port('control', 'json')]);
        const review = await makeNode('review', 'review', [port('a', 'text'), port('b', 'text'), port('control', 'json')]);
        narrator.inputs = [port('a', 'text'), port('b', 'text'), port('review', 'json')];
        narrator.policy.audiencePinId = final.pinId; narrator.dependencyPinIds.push(final.pinId);
        plan.definition.nodes = [first, planner, second, review, narrator, output]; plan.definition.entryNodeIds = [first.nodeId];
        plan.definition.edges = [edge(first, planner, 'seed'), edge(planner, second, 'control'), edge(first, review, 'a'),
            edge(second, review, 'b'), edge(planner, review, 'control'), edge(first, narrator, 'a', 1), edge(second, narrator, 'b', 1),
            edge(review, narrator, 'review', 1), ...plan.definition.edges];
        plan.definition.capabilityCeiling = ['generation.send', 'graph.patch', 'chat.output'];
        plan.definition.graphChangePolicy = { allowedOperations: ['setPendingPriority', 'requestFinalize'], allowedNodeKinds: [] };
        Object.assign(plan.definition.limits, { maxNodes: 6, maxEdges: 9, maxSteps: 120, maxAttempts: 10, maxReviews: 2, maxEdgeVisits: 14 });
        plan.dependencyPins.push(actor, final); topology = { first, planner, second, review, narrator, output };
    }, responseBody: async ({ body, index }) => {
        const task = sessionPlannerRedoTask(body), round = (visits.get(task?.nodeId) ?? 0) + 1; visits.set(task?.nodeId, round);
        let text;
        if (task?.nodeId === topology.first.nodeId) text = 'SESSION_A_' + round;
        else if (task?.nodeId === topology.planner.nodeId) text = JSON.stringify({ operations: [round === 1
            ? { op: 'setPendingPriority', nodeId: topology.second.nodeId, priority: 7 } : { op: 'requestFinalize' }] });
        else if (task?.nodeId === topology.second.nodeId) text = 'SESSION_B_' + round;
        else if (task?.nodeId === topology.review.nodeId) {
            const targetAttemptIds = await f.h.engine.withTransaction(f.h.handle, async tx => {
                const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId), ids = [];
                for (const ref of task.reviewTargets ?? []) {
                    const attempt = (await readAttempt(tx, f.h.handle, root, ref.attemptId)).doc;
                    if (attempt.nodeId === topology.first.nodeId && attempt.resultRefs.some(result => hash(result) === hash(ref.resultRef))) ids.push(attempt.attemptId);
                }
                return ids;
            });
            if (targetAttemptIds.length !== 1 || !JSON.stringify(body.input).includes('SESSION_A_' + round)) throw new Error('Missing fresh actual typed A evidence');
            text = JSON.stringify({ decision: round === 1 ? 'rerun' : 'approve', reasonCode: round === 1 ? 'draft_incomplete' : 'quality_ready', targetAttemptIds });
        } else if (task?.nodeId === topology.narrator.nodeId) text = 'The NPC awaits your choice after fresh reviewed advice.';
        else throw new Error('Unexpected real Session task');
        return { id: 'session-redo-' + index, status: 'completed', output: [{ id: 'message-' + index, type: 'message', status: 'completed', role: 'assistant',
            content: [{ type: 'output_text', text, annotations: [] }] }], usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } };
    } });
    return { ...f, get effectRef() { return f.effectRef; }, get authority() { return f.authority; }, get core() { return f.core; }, topology };
}
