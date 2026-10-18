import { rpDelegationFixture } from './rp-delegation-fixture.js';
import { rpChildQualityTask } from './rp-delegated-quality-fixture.js';
import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';
import { readDelegatedRpSource } from '../../../src/native/orchestration/delegated-source-contracts.js';
import { rpOperationInput } from '../../../src/native/rp-run-control.js';

const id = kind => createNativeId('orchestration' + kind);
const port = (name, type) => ({ name, type, required: true });
const edge = (from, to, input, maxVisits = 1) => ({ edgeId: id('Edge'), from: { nodeId: from.nodeId, port: 'response' },
    to: { nodeId: to.nodeId, port: input }, condition: 'always', maxVisits, loopBack: false });

/** Original RP Task dual Sources, child held bank, Controller/Model/Chat writers.
 * Seven child Models require independent owner59/11; child50/10 stay original. */
export async function rpChildReviewPlannerRedoFixture(make, { childRequests = 7 } = {}) {
    let nodes, sharedPin;
    const visits = new Map();
    const f = await rpDelegationFixture(make, { configurePlan: async (plan, env) => {
        const route = { ...env.route, executionPolicy: { ...env.route.executionPolicy, computeBudget: { ...env.route.executionPolicy.computeBudget,
            maxRequests: 8, localWork: { ...env.route.executionPolicy.computeBudget.localWork, maxJobs: 96 } } } };
        await env.seeded.persistence.saveRuntimeRoute(env.h.handle, route); plan.dependencyPins[0].integrity = hash(route);
    }, configureChildRoute: route => {
        route.executionPolicy.computeBudget.maxRequests = childRequests;
        route.executionPolicy.computeBudget.localWork.maxJobs = 64;
    }, configureChildPlan: async (plan, env) => {
        const terminal = plan.definition.nodes[0], output = plan.definition.nodes[1]; terminal.label = 'Original RP child Planner redo terminal';
        const base = await env.persistence.getRuntimeRoute(env.h.handle, plan.dependencyPins[0].resourceRef.runtimeRouteId);
        const node = async (kind, label, inputs) => {
            const connection = { ...env.connection, connectionProfileId: createNativeId('connectionProfile'), displayName: label };
            await env.persistence.saveConnectionProfile(env.h.handle, connection);
            const model = { ...env.model, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'rp-child-redo-' + label,
                connectionProfileRef: { scope: 'player', connectionProfileId: connection.connectionProfileId } };
            await env.persistence.saveModelProfile(env.h.handle, model);
            const route = { ...base, runtimeRouteId: createNativeId('runtimeRoute'), modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId },
                connectionProfileRef: model.connectionProfileRef, executionPolicy: { ...base.executionPolicy, allowedModelProfileIds: [model.modelProfileId] } };
            await env.persistence.saveRuntimeRoute(env.h.handle, route); const pinId = 'rp.child.redo.' + label;
            plan.dependencyPins.push({ pinId, port: 'model', resourceRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId }, integrity: hash(route) });
            return { nodeId: id('Node'), kind, label, inputs, outputs: [{ name: 'response', type: kind === 'agent' ? 'text' : 'json', required: false }],
                dependencyPinIds: [pinId], capabilities: ['generation.send', ...kind === 'planner' ? ['graph.patch'] : []],
                policy: { agentPinId: pinId, ...kind === 'review' ? { maxRounds: 2 } : {} } };
        };
        const first = await node('agent', 'a', []), planner = await node('planner', 'planner', [port('evidence', 'text')]);
        const review = await node('review', 'review', [port('a', 'text'), port('control', 'json')]);
        terminal.inputs = [port('a', 'text'), port('control', 'json'), port('review', 'json')];
        plan.definition.nodes = [first, planner, review, terminal, output]; plan.definition.entryNodeIds = [first.nodeId];
        plan.definition.edges = [edge(first, planner, 'evidence', 2), edge(first, review, 'a', 2), edge(planner, review, 'control', 2),
            edge(first, terminal, 'a'), edge(planner, terminal, 'control'), edge(review, terminal, 'review'), ...plan.definition.edges];
        plan.definition.capabilityCeiling = ['generation.send', 'graph.patch'];
        plan.definition.graphChangePolicy = { allowedOperations: ['setPendingPriority', 'requestFinalize'], allowedNodeKinds: [] };
        Object.assign(plan.definition.limits, { maxNodes: 5, maxEdges: 7, maxAttempts: 8, maxReviews: 2, maxPatches: 2,
            maxEdgeVisits: 10, maxReplans: 0, maxLoopIterations: 0 });
        const chat = await env.chats.get(env.h.handle, env.locator.charDir, env.locator.name), source = rpOperationInput(chat.body[0], 0);
        const resourceRef = { kind: 'native_rp_message', controlId: env.controlId, messageId: source.messageId, variantId: source.variantId, contentHash: source.contentHash };
        sharedPin = { pinId: 'rp.child.redo.exact-source', port: 'context', resourceRef, integrity: hash(await readDelegatedRpSource(env.h.handle, resourceRef, env.control)) };
        plan.dependencyPins.push(sharedPin); for (const item of [first, planner, review, terminal]) item.dependencyPinIds.push(sharedPin.pinId);
        nodes = { first, planner, review, terminal };
    }, configureParentPlan: plan => {
        plan.definition.nodes[0].capabilities.push('graph.patch');
        plan.definition.nodes.find(node => node.kind === 'output').capabilities = ['chat.output'];
        plan.definition.capabilityCeiling = [...plan.definition.nodes[0].capabilities, 'chat.output'];
        plan.definition.graphChangePolicy = { allowedOperations: ['setPendingPriority', 'requestFinalize'], allowedNodeKinds: [] };
        // New graph, explicitly published total: child46 + parent13 =59 steps;
        // child10 + parent1 =11 visits. No existing owner50 plan is changed.
        plan.definition.limits.maxSteps = 59; plan.definition.limits.maxEdgeVisits = 11;
        Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 65536 } });
        plan.dependencyPins.push(sharedPin); plan.definition.nodes[0].dependencyPinIds.push(sharedPin.pinId);
    }, responsePayload: body => {
        const task = rpChildQualityTask(body), round = (visits.get(task.nodeId) ?? 0) + 1; visits.set(task.nodeId, round);
        if (task.nodeId === nodes.first.nodeId) return 'RP_CHILD_REDO_A_' + round;
        if (task.nodeId === nodes.planner.nodeId) return JSON.stringify({ operations: round === 1
            ? [{ op: 'setPendingPriority', nodeId: nodes.terminal.nodeId, priority: 7 }] : [{ op: 'requestFinalize' }] });
        if (task.nodeId === nodes.review.nodeId) {
            const target = f.effects.findLast(effect => effect.proposal.inputRef.nodeId === nodes.first.nodeId)?.nodeAttemptId;
            if (!task.evidence.some(ref => ref.attemptId === target)) throw new Error('Missing current original RP child typed A evidence');
            return JSON.stringify({ decision: round === 1 ? 'rerun' : 'approve', reasonCode: round === 1 ? 'draft_incomplete' : 'quality_ready', targetAttemptIds: [target] });
        }
        return task.nodeId === nodes.terminal.nodeId ? 'RP_CHILD_REDO_TERMINAL' : 'RP_PARENT_ACCEPTS_CHILD_REDO';
    } });
    return { ...f, nodes };
}
