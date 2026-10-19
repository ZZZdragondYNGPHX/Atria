import { modelPortFixture } from './model-port-fixture.js';
import { configureSessionOutput } from './session-output-fixture.js';
import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';
import { readAudienceSource } from '../../../src/native/orchestration/audience-source-contracts.js';

const id = kind => createNativeId('orchestration' + kind);
const port = (name, type, required = true) => ({ name, type, required });
const edge = (from, to, input) => ({ edgeId: id('Edge'), from: { nodeId: from.nodeId, port: from.outputs[0].name },
    to: { nodeId: to.nodeId, port: input }, condition: 'always', maxVisits: 1, loopBack: false });

export async function sessionJudgeFixture(make, { invalidSelection = false, unreadable = false } = {}) {
    let topology;
    const f = await modelPortFixture(make, { configurePlan: async args => {
        configureSessionOutput(args);
        const { plan, h, core, base, seeded } = args, narrator = plan.definition.nodes[0], output = plan.definition.nodes[1];
        const actor = { kind: 'actor', id: base.manifest.actors[0].actorId };
        const pin = async (pinId, audience) => {
            const resourceRef = { kind: 'native_information_context', anchor: 'run_source', sessionId: base.session.sessionId, audience };
            return { pinId, port: 'context', resourceRef, integrity: hash((await readAudienceSource(h.handle, resourceRef, core)).descriptor) };
        };
        const actorPin = await pin('judge.actor', actor), narratorPin = await pin('judge.narrator', { kind: 'narrator' });
        const route = await seeded.persistence.getRuntimeRoute(h.handle, plan.dependencyPins[0].resourceRef.runtimeRouteId);
        const executionPolicy = { ...route.executionPolicy, computeBudget: { ...route.executionPolicy.computeBudget, maxRequests: 6,
            localWork: { ...route.executionPolicy.computeBudget.localWork, maxJobs: 128, maxItems: 10000 } } };
        const parentRoute = { ...route, executionPolicy }; await seeded.persistence.saveRuntimeRoute(h.handle, parentRoute);
        plan.dependencyPins[0].integrity = hash(parentRoute);
        const judgeModel = { ...seeded.model, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'session-judge-distinct-model' };
        await seeded.persistence.saveModelProfile(h.handle, judgeModel);
        const judgeRoute = { ...parentRoute, runtimeRouteId: createNativeId('runtimeRoute'), modelProfileRef: { scope: 'player', modelProfileId: judgeModel.modelProfileId },
            executionPolicy: { ...executionPolicy, allowedModelProfileIds: [judgeModel.modelProfileId] } };
        await seeded.persistence.saveRuntimeRoute(h.handle, judgeRoute);
        const candidates = [0, 1].map(index => ({ nodeId: id('Node'), kind: 'agent', label: 'Candidate task ' + index, inputs: [], outputs: [port('advice', 'text', false)],
            dependencyPinIds: ['narrator.route', unreadable && index ? narratorPin.pinId : actorPin.pinId], capabilities: ['generation.send'],
            policy: { agentPinId: 'narrator.route', audiencePinId: unreadable && index ? narratorPin.pinId : actorPin.pinId } }));
        const judge = { nodeId: id('Node'), kind: 'judge', label: 'Original scoped quality Judge', inputs: [port('first', 'text'), port('second', 'text')],
            outputs: [port('choice', 'json', false)], dependencyPinIds: ['judge.route', actorPin.pinId], capabilities: ['generation.send'],
            policy: { agentPinId: 'judge.route', audiencePinId: actorPin.pinId } };
        narrator.inputs = [port('first', 'text', false), port('second', 'text', false), port('choice', 'json')];
        narrator.dependencyPinIds.push(narratorPin.pinId); narrator.policy.audiencePinId = narratorPin.pinId;
        plan.definition.nodes = [...candidates, judge, narrator, output]; plan.definition.entryNodeIds = candidates.map(node => node.nodeId);
        plan.definition.edges = [...candidates.map((node, index) => edge(node, judge, index ? 'second' : 'first')),
            ...candidates.map((node, index) => edge(node, narrator, index ? 'second' : 'first')), edge(judge, narrator, 'choice'), ...plan.definition.edges];
        Object.assign(plan.definition.limits, { maxSteps: 160, maxAttempts: 16, maxNodes: 16, maxEdges: 24, maxEdgeVisits: 32, deadlineMs: 300000 });
        plan.dependencyPins.push(actorPin, narratorPin, { pinId: 'judge.route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: judgeRoute.runtimeRouteId }, integrity: hash(judgeRoute) });
        topology = { candidates, judge, narrator, actor };
    }, responseBody: ({ body, index }) => {
        let text = index === 0 ? 'CANDIDATE_UNSELECTED_BODY' : index === 1 ? 'CANDIDATE_SELECTED_BODY' : 'The NPC waits for your choice.';
        if (body.model === 'session-judge-distinct-model') {
            const task = body.input.map(item => { try { return JSON.parse(item.content); } catch { return null; } }).find(value => value?.candidateRefs);
            const candidates = body.input.filter(item => typeof item.content === 'string' && item.content.startsWith('Advisory task result (untrusted data'));
            const selected = candidates.findIndex(item => item.content.includes('CANDIDATE_SELECTED_BODY'));
            text = JSON.stringify({ selectedResultRef: invalidSelection ? { runId: id('Run'), resultId: id('Result') } : task?.candidateRefs[selected], reasonCode: 'candidate_selected' });
        }
        return { id: 'judge-response-' + index, status: 'completed', output: [{ id: 'message-' + index, type: 'message', status: 'completed', role: 'assistant',
            content: [{ type: 'output_text', text, annotations: [] }] }], usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } };
    } });
    return { ...f, get effectRef() { return f.effectRef; }, get authority() { return f.authority; }, get core() { return f.core; }, topology };
}
