import { rpDelegationFixture } from './rp-delegation-fixture.js';
import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';
import { readDelegatedRpSource } from '../../../src/native/orchestration/delegated-source-contracts.js';
import { rpOperationInput } from '../../../src/native/rp-run-control.js';

const id = kind => createNativeId('orchestration' + kind);
const port = (name, type, required = true) => ({ name, type, required });
const edge = (from, to, input, maxVisits = 1) => ({ edgeId: id('Edge'), from: { nodeId: from.nodeId, port: 'response' },
    to: { nodeId: to.nodeId, port: input }, condition: 'always', maxVisits, loopBack: false });
export const rpChildQualityTask = body => {
    const content = body.messages.flatMap(message => typeof message.content === 'string' ? [message.content] : message.content.map(part => part.text ?? '')).join('\n');
    const nodeId = content.match(/"nodeId":"([^"]+)","label":"[^"]*","kind":"(?:agent|planner|review|judge)"/)?.[1];
    const evidence = content.match(/"evidence":(\[[^\]]*\])/), candidates = content.match(/"candidates":(\[[^\]]*\])/);
    return { nodeId, evidence: evidence ? JSON.parse(evidence[1]) : [], candidates: candidates ? JSON.parse(candidates[1]) : [] };
};

/** Owner declarations precede Plan publication. Every child stage has its own
 * Model/Route and both explicitly shared original RP Sources; no Narrator view. */
export async function rpDelegatedQualityFixture(make, { maxRounds = 2, childRequests = 7, unknownReview = false, parentMaxSteps = 50, parentMaxEdgeVisits = 10 } = {}) {
    let nodes, sharedPin, a = 0, reviewRound = 0;
    const f = await rpDelegationFixture(make, { configurePlan: async (plan, env) => {
        const route = { ...env.route, executionPolicy: { ...env.route.executionPolicy, computeBudget: { ...env.route.executionPolicy.computeBudget,
            maxRequests: 8, localWork: { ...env.route.executionPolicy.computeBudget.localWork, maxJobs: 96 } } } };
        await env.seeded.persistence.saveRuntimeRoute(env.h.handle, route); plan.dependencyPins[0].integrity = hash(route);
    }, configureChildRoute: route => {
        route.executionPolicy.computeBudget.maxRequests = childRequests;
        route.executionPolicy.computeBudget.localWork.maxJobs = 64;
    }, configureChildPlan: async (plan, env) => {
        const terminal = plan.definition.nodes[0], output = plan.definition.nodes[1]; terminal.label = 'Original RP child quality terminal';
        const route = await env.persistence.getRuntimeRoute(env.h.handle, plan.dependencyPins[0].resourceRef.runtimeRouteId);
        const makeNode = async (kind, label, inputs) => {
            const connection = { ...env.connection, connectionProfileId: createNativeId('connectionProfile'), displayName: label };
            await env.persistence.saveConnectionProfile(env.h.handle, connection);
            const model = { ...env.model, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'rp-child-quality-' + label,
                connectionProfileRef: { scope: 'player', connectionProfileId: connection.connectionProfileId } };
            await env.persistence.saveModelProfile(env.h.handle, model);
            const owned = { ...route, runtimeRouteId: createNativeId('runtimeRoute'), modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId },
                connectionProfileRef: model.connectionProfileRef, executionPolicy: { ...route.executionPolicy, allowedModelProfileIds: [model.modelProfileId] } };
            await env.persistence.saveRuntimeRoute(env.h.handle, owned); const pinId = 'rp.child.quality.' + label;
            plan.dependencyPins.push({ pinId, port: 'model', resourceRef: { scope: 'player', runtimeRouteId: owned.runtimeRouteId }, integrity: hash(owned) });
            return { nodeId: id('Node'), kind, label, inputs, outputs: [port('response', kind === 'agent' ? 'text' : 'json', false)],
                dependencyPinIds: [pinId], capabilities: ['generation.send'], policy: { agentPinId: pinId, ...(kind === 'review' ? { maxRounds } : {}) } };
        };
        const first = await makeNode('agent', 'a', []), second = await makeNode('agent', 'b', []);
        const review = await makeNode('review', 'review', [port('a', 'text'), port('b', 'text')]);
        const judge = await makeNode('judge', 'judge', [port('a', 'text'), port('b', 'text'), port('review', 'json')]);
        terminal.inputs = [port('a', 'text', false), port('b', 'text', false), port('choice', 'json')];
        plan.definition.nodes = [first, second, review, judge, terminal, output]; plan.definition.entryNodeIds = [first.nodeId, second.nodeId];
        plan.definition.edges = [edge(first, review, 'a', 2), edge(second, review, 'b', 2), edge(first, judge, 'a'), edge(second, judge, 'b'),
            edge(review, judge, 'review'), edge(first, terminal, 'a'), edge(second, terminal, 'b'), edge(judge, terminal, 'choice'), ...plan.definition.edges];
        plan.definition.capabilityCeiling = ['generation.send']; plan.definition.graphChangePolicy = { allowedOperations: [], allowedNodeKinds: [] };
        Object.assign(plan.definition.limits, { maxNodes: 6, maxEdges: 9, maxAttempts: 8, maxReviews: 2, maxEdgeVisits: 10 });
        const chat = await env.chats.get(env.h.handle, env.locator.charDir, env.locator.name), source = rpOperationInput(chat.body[0], 0);
        const resourceRef = { kind: 'native_rp_message', controlId: env.controlId, messageId: source.messageId, variantId: source.variantId, contentHash: source.contentHash };
        sharedPin = { pinId: 'rp.child.quality.exact-source', port: 'context', resourceRef, integrity: hash(await readDelegatedRpSource(env.h.handle, resourceRef, env.control)) };
        plan.dependencyPins.push(sharedPin); for (const node of [first, second, review, judge, terminal]) node.dependencyPinIds.push(sharedPin.pinId);
        nodes = { first, second, review, judge, terminal };
    }, configureParentPlan: plan => {
        // The parent declares its real Chat output and tree ceiling before
        // validation/publication. The child remains a task Result at 50 steps.
        plan.definition.limits.maxSteps = parentMaxSteps;
        plan.definition.limits.maxEdgeVisits = parentMaxEdgeVisits;
        plan.definition.nodes.find(node => node.kind === 'output').capabilities = ['chat.output'];
        plan.definition.capabilityCeiling = [...plan.definition.nodes[0].capabilities, 'chat.output'];
        Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 65536 } });
        // No graph.patch or Planner is needed for the original Review/Judge path.
        plan.dependencyPins.push(sharedPin); plan.definition.nodes[0].dependencyPinIds.push(sharedPin.pinId);
    }, responseStatus: body => unknownReview && body.model === 'rp-child-quality-review' ? null : 200,
    responsePayload: body => {
        const task = rpChildQualityTask(body);
        if (task.nodeId === nodes.first.nodeId) return 'RP_CHILD_QUALITY_A_' + ++a;
        if (task.nodeId === nodes.second.nodeId) return 'RP_CHILD_QUALITY_B_1';
        if (task.nodeId === nodes.review.nodeId) {
            const target = f.effects.findLast(effect => effect.proposal.inputRef.nodeId === nodes.first.nodeId)?.nodeAttemptId;
            if (!task.evidence.some(item => item.attemptId === target)) throw new Error('Missing real RP child Review target');
            const redo = ++reviewRound === 1;
            return JSON.stringify({ decision: redo ? 'rerun' : 'approve', reasonCode: redo ? 'draft_incomplete' : 'quality_ready', targetAttemptIds: [target] });
        }
        if (task.nodeId === nodes.judge.nodeId) {
            const target = task.candidates.find(item => item.attemptId === f.effects.findLast(effect => effect.proposal.inputRef.nodeId === nodes.first.nodeId)?.nodeAttemptId);
            if (!target) throw new Error('Missing real RP child Judge candidate');
            return JSON.stringify({ selectedResultRef: target.resultRef, reasonCode: 'candidate_selected' });
        }
        return task.nodeId === nodes.terminal.nodeId ? 'RP_CHILD_QUALITY_TERMINAL' : 'RP_PARENT_ACCEPTS_CHILD_QUALITY';
    } });
    return { ...f, nodes };
}
