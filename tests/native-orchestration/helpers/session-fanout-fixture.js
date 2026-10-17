import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';
import { readAudienceSource } from '../../../src/native/orchestration/audience-source-contracts.js';
import { modelPortFixture } from './model-port-fixture.js';
import { configureSessionOutput } from './session-output-fixture.js';

const id = () => createNativeId('orchestrationNode');
const port = (name, type, required = true) => ({ name, type, required });
const edge = (from, to, input) => ({ edgeId: createNativeId('orchestrationEdge'), from: { nodeId: from.nodeId, port: from.outputs[0].name },
    to: { nodeId: to.nodeId, port: input }, condition: 'always', maxVisits: to.kind === 'review' ? to.policy.maxRounds : 1, loopBack: false });

export async function sessionFanoutFixture(make, { groups = 1, review = false, strategy = 'all-success', maxConcurrency = 2, usage = true, maxRequests = null, failurePolicy = 'continue', rejectFirst = false } = {}) {
    let topology;
    const f = await modelPortFixture(make, { usage, responseStatus: rejectFirst ? index => index === 1 ? 503 : 200 : null, configurePlan: async args => {
        configureSessionOutput(args);
        const { plan, h, core, base } = args, narrator = plan.definition.nodes[0], output = plan.definition.nodes[1];
        const route = await args.seeded.persistence.getRuntimeRoute(h.handle, plan.dependencyPins[0].resourceRef.runtimeRouteId);
        await args.seeded.persistence.saveRuntimeRoute(h.handle, { ...route, executionPolicy: { ...route.executionPolicy, computeBudget: {
            ...route.executionPolicy.computeBudget, maxRequests: maxRequests ?? groups * 2 + (review ? 6 : 1),
            localWork: { ...route.executionPolicy.computeBudget.localWork, maxJobs: 192, maxItems: 10000 } } } });
        plan.dependencyPins[0].integrity = hash(await args.seeded.persistence.getRuntimeRoute(h.handle, route.runtimeRouteId));
        const audiences = [...base.manifest.actors.map(actor => ({ kind: 'actor', id: actor.actorId })), { kind: 'narrator' }];
        for (const [index, audience] of audiences.entries()) {
            const ref = { kind: 'native_information_context', anchor: 'run_source', sessionId: base.session.sessionId, audience };
            const source = await readAudienceSource(h.handle, ref, core);
            plan.dependencyPins.push({ pinId: 'session.audience.' + index, port: 'context', resourceRef: ref, integrity: hash(source.descriptor) });
        }
        const agent = (label, audience, inputs) => ({ nodeId: id(), kind: 'agent', label, inputs, outputs: [port('advice', 'text', false)],
            dependencyPinIds: ['narrator.route', 'session.audience.' + audience], capabilities: ['generation.send'],
            policy: { agentPinId: 'narrator.route', audiencePinId: 'session.audience.' + audience } });
        narrator.dependencyPinIds.push('session.audience.2'); narrator.policy.audiencePinId = 'session.audience.2';
        const nodes = [], edges = [], specs = [];
        for (let group = 0; group < groups; group++) {
            const fanout = { nodeId: id(), kind: 'fanout', label: 'Original Game fanout ' + group, inputs: [], outputs: [port('task', 'task.result', false)],
                dependencyPinIds: [], capabilities: [], policy: { maxConcurrency, failurePolicy } };
            const branches = [0, 1].map(index => agent('Game branch ' + group + ':' + index, index, [port('task', 'task.result')]));
            const join = { nodeId: id(), kind: 'join', label: 'Original Game join ' + group,
                inputs: branches.map((_, index) => port('branch' + index, 'text')), outputs: [port('joined', 'text', false)],
                dependencyPinIds: [], capabilities: [], policy: { strategy, quorum: strategy === 'count-quorum' ? 1 : 2, deadlineMs: 120000 } };
            nodes.push(fanout, ...branches, join); edges.push(...branches.flatMap((branch, index) => [edge(fanout, branch, 'task'), edge(branch, join, 'branch' + index)]));
            specs.push({ fanout, branches, join });
        }
        let target = narrator;
        if (review) {
            const merge = agent('Game synthesis after original joins', 2, specs.map((_, index) => port('group' + index, 'text')));
            const draft = agent('Game draft after synthesis', 2, [port('synthesis', 'text')]);
            const reviewer = { ...agent('Game quality review after composed controls', 2, [port('draft', 'text')]), kind: 'review', outputs: [port('decision', 'json', false)], policy: { audiencePinId: 'session.audience.2', agentPinId: 'narrator.route', maxRounds: 2 } };
            narrator.inputs = [port('draft', 'text'), port('review', 'json')];
            nodes.push(merge, draft, reviewer); edges.push(edge(merge, draft, 'synthesis'), edge(draft, reviewer, 'draft'), edge(draft, narrator, 'draft'), edge(reviewer, narrator, 'review'));
            target = merge;
        } else narrator.inputs = specs.map((_, index) => port('group' + index, 'text'));
        edges.push(...specs.map((spec, index) => edge(spec.join, target, 'group' + index)), ...plan.definition.edges);
        plan.definition.nodes = [...nodes, narrator, output]; plan.definition.edges = edges; plan.definition.entryNodeIds = specs.map(spec => spec.fanout.nodeId);
        Object.assign(plan.definition.limits, { maxSteps: 240, maxConcurrency: Math.max(maxConcurrency, 2), deadlineMs: 300000,
            maxNodes: plan.definition.nodes.length, maxEdges: plan.definition.edges.length,
            maxAttempts: plan.definition.nodes.length + (review ? 2 : 0),
            maxEdgeVisits: plan.definition.edges.length + (review ? 2 : 0) });
        topology = { specs, narrator, target };
    }, responseBody: async ({ body, index }) => {
        const input = JSON.stringify(body.input), text = input.includes('Return only the JSON decision approve or rerun')
            ? JSON.stringify({ decision: 'approve', reasonCode: 'quality_ready' }) : input.includes('Game branch') ? 'GAME_ADVICE_' + index
                : input.includes('Game synthesis after') ? 'GAME_SYNTHESIS' : input.includes('Game draft after') ? 'GAME_REVIEW_DRAFT' : 'The NPC waits for the player choice.';
        return { id: 'game-fanout-' + index, status: 'completed', output: [{ id: 'message-' + index, type: 'message', status: 'completed', role: 'assistant',
            content: [{ type: 'output_text', text, annotations: [] }] }], ...(usage ? { usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } } : {}) };
    } });
    return { ...f, get effectRef() { return f.effectRef; }, get authority() { return f.authority; }, get core() { return f.core; }, topology };
}
