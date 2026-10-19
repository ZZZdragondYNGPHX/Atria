import { rpModelFixture } from './rp-model-fixture.js';
import { seedControlActorAudiences } from './rp-control-audience-fixture.js';
import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';

const id = kind => createNativeId('orchestration' + kind);
const text = body => body.messages.flatMap(message => typeof message.content === 'string' ? [message.content] : message.content.map(part => part.text ?? '')).join('\n');

export async function rpComposableReviewFixture(make, { rerun = false, maxJobs = 32, multiTargets = false, unreadable = false } = {}) {
    let nodes, source, reviews = 0, drafts = 0;
    const f = await rpModelFixture(make, { configurePlan: async (plan, env) => {
        const [narrator, output] = plan.definition.nodes;
        const route = { ...env.route, executionPolicy: { ...env.route.executionPolicy,
            computeBudget: { ...env.route.executionPolicy.computeBudget, maxRequests: 6, localWork: { ...env.route.executionPolicy.computeBudget.localWork, maxJobs } } } };
        await env.seeded.persistence.saveRuntimeRoute(env.h.handle, route);
        plan.dependencyPins[0].integrity = hash(await env.seeded.persistence.getRuntimeRoute(env.h.handle, route.runtimeRouteId));
        const port = (name, type) => ({ name, type, required: true });
        const node = async (kind, inputs, suffix = '') => {
            const connection = { ...env.seeded.connection, connectionProfileId: createNativeId('connectionProfile'), displayName: kind };
            await env.seeded.persistence.saveConnectionProfile(env.h.handle, connection);
            const model = { ...env.seeded.model, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'composable-' + kind + suffix,
                connectionProfileRef: { scope: 'player', connectionProfileId: connection.connectionProfileId } };
            await env.seeded.persistence.saveModelProfile(env.h.handle, model);
            const owned = { ...route, runtimeRouteId: createNativeId('runtimeRoute'), displayName: kind,
                modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId }, connectionProfileRef: model.connectionProfileRef,
                executionPolicy: { ...route.executionPolicy, allowedModelProfileIds: [model.modelProfileId] } };
            await env.seeded.persistence.saveRuntimeRoute(env.h.handle, owned);
            const pinId = 'owned.' + kind + suffix;
            plan.dependencyPins.push({ pinId, port: 'model', resourceRef: { scope: 'player', runtimeRouteId: owned.runtimeRouteId },
                integrity: hash(await env.seeded.persistence.getRuntimeRoute(env.h.handle, owned.runtimeRouteId)) });
            return { nodeId: id('Node'), kind, label: 'Owned ' + kind + suffix, inputs,
                outputs: [port('response', kind === 'agent' ? 'text' : 'json')], dependencyPinIds: [pinId],
                capabilities: ['generation.send', ...kind === 'planner' ? ['graph.patch'] : []], policy: { agentPinId: pinId, ...kind === 'review' ? { maxRounds: 2 } : {} } };
        };
        const planner = await node('planner', []), draft = await node('agent', [port('control', 'json')]);
        const extra = multiTargets ? await node('agent', [port('control', 'json')], '-second') : null;
        const review = await node('review', [port('draft', 'text'), port('control', 'json'), ...extra ? [port('second', 'text')] : []]);
        narrator.inputs = [port('draft', 'text'), port('review', 'json'), ...extra ? [port('second', 'text')] : []]; output.capabilities = ['chat.output'];
        const edge = (from, to, input, maxVisits = 1) => ({ edgeId: id('Edge'), from: { nodeId: from.nodeId, port: 'response' },
            to: { nodeId: to.nodeId, port: input }, condition: 'success', maxVisits, loopBack: false });
        plan.definition.nodes = [planner, draft, ...extra ? [extra] : [], review, narrator, output]; plan.definition.entryNodeIds = [planner.nodeId];
        plan.definition.edges = [edge(planner, draft, 'control'), edge(draft, review, 'draft', 2), edge(planner, review, 'control', 2),
            edge(draft, narrator, 'draft'), edge(review, narrator, 'review'), ...extra ? [edge(planner, extra, 'control'), edge(extra, review, 'second'), edge(extra, narrator, 'second')] : [], ...plan.definition.edges];
        plan.definition.capabilityCeiling = ['generation.send', 'graph.patch', 'chat.output'];
        plan.definition.graphChangePolicy = { allowedOperations: ['requestFinalize'], allowedNodeKinds: [] };
        plan.definition.limits.maxSteps = 100; plan.definition.limits.maxReviews = 2;
        Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 65536 } });
        source = await seedControlActorAudiences(plan, env); nodes = { planner, draft, ...extra ? { extra } : {}, review, narrator };
        if (extra && !unreadable) {
            const removed = extra.policy.audiencePinId;
            extra.dependencyPinIds = extra.dependencyPinIds.map(pin => pin === removed ? draft.policy.audiencePinId : pin);
            extra.policy.audiencePinId = draft.policy.audiencePinId; plan.dependencyPins = plan.dependencyPins.filter(pin => pin.pinId !== removed);
        }
    }, responsePayload: body => {
        const content = text(body), nodeId = content.match(/"task":\{"nodeId":"([^"]+)"/)?.[1];
        if (nodeId === nodes.planner?.nodeId) return JSON.stringify({ operations: [{ op: 'requestFinalize' }] });
        if (nodeId === nodes.draft.nodeId) return 'DRAFT_' + ++drafts;
        if (nodeId === nodes.extra?.nodeId) return 'DRAFT_SECOND';
        if (nodeId === nodes.review.nodeId) {
            const evidence = content.match(/"evidence":(\[[^\]]+\])/ )?.[1];
            if (!evidence) throw new Error('Missing original typed Review targets');
            const targets = JSON.parse(evidence).map(item => item.attemptId);
            const redo = rerun && ++reviews === 1;
            return JSON.stringify({ decision: redo ? 'rerun' : 'approve', reasonCode: redo ? 'draft_incomplete' : 'quality_ready', targetAttemptIds: targets });
        }
        if (nodeId !== nodes.narrator.nodeId) throw new Error('Missing actual current graph task');
        return 'Final reviewed RP.';
    } });
    return { ...f, nodes, source };
}


export async function rpComposableJudgeFixture(make, { candidateCount = 2, withReview = false, unreadable = false, invalidChoice = false, usage = true, withPlanner = true, withJudge = true, rerun = false, maxRequests = null } = {}) {
    let nodes, source, choice, reviews = 0; const drafts = new Map();
    const calls = candidateCount + 1 + Number(withPlanner) + Number(withJudge) + Number(withReview) + (rerun ? candidateCount + 1 : 0);
    const f = await rpModelFixture(make, { usage, configurePlan: async (plan, env) => {
        const [narrator, output] = plan.definition.nodes;
        const route = { ...env.route, executionPolicy: { ...env.route.executionPolicy,
            computeBudget: { ...env.route.executionPolicy.computeBudget, maxRequests: maxRequests ?? calls,
                localWork: { ...env.route.executionPolicy.computeBudget.localWork, maxJobs: 64 } } } };
        await env.seeded.persistence.saveRuntimeRoute(env.h.handle, route);
        plan.dependencyPins[0].integrity = hash(await env.seeded.persistence.getRuntimeRoute(env.h.handle, route.runtimeRouteId));
        const port = (name, type, required = true) => ({ name, type, required });
        const node = async (kind, label, inputs) => {
            const connection = { ...env.seeded.connection, connectionProfileId: createNativeId('connectionProfile'), displayName: label };
            await env.seeded.persistence.saveConnectionProfile(env.h.handle, connection);
            const model = { ...env.seeded.model, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'generic-' + label,
                connectionProfileRef: { scope: 'player', connectionProfileId: connection.connectionProfileId } };
            await env.seeded.persistence.saveModelProfile(env.h.handle, model);
            const owned = { ...route, runtimeRouteId: createNativeId('runtimeRoute'), displayName: label,
                modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId }, connectionProfileRef: model.connectionProfileRef,
                executionPolicy: { ...route.executionPolicy, allowedModelProfileIds: [model.modelProfileId] } };
            await env.seeded.persistence.saveRuntimeRoute(env.h.handle, owned);
            const pinId = 'generic.' + label;
            plan.dependencyPins.push({ pinId, port: 'model', resourceRef: { scope: 'player', runtimeRouteId: owned.runtimeRouteId },
                integrity: hash(await env.seeded.persistence.getRuntimeRoute(env.h.handle, owned.runtimeRouteId)) });
            return { nodeId: id('Node'), kind, label, inputs, outputs: [port('response', kind === 'agent' ? 'text' : 'json')],
                dependencyPinIds: [pinId], capabilities: ['generation.send', ...kind === 'planner' ? ['graph.patch'] : []],
                policy: { agentPinId: pinId, ...kind === 'review' ? { maxRounds: 2 } : {} } };
        };
        const planner = withPlanner ? await node('planner', 'planner', []) : null, candidates = [];
        for (let i = 0; i < candidateCount; i++) candidates.push(await node('agent', 'candidate.' + i, planner ? [port('control', 'json')] : []));
        const inputs = candidates.map((_node, i) => port('candidate.' + i, 'text')), control = planner ? [port('control', 'json')] : [];
        const review = withReview ? await node('review', 'review', [...inputs, ...control]) : null;
        const judge = withJudge ? await node('judge', 'judge', [...inputs, ...control, ...review ? [port('review', 'json')] : []]) : null;
        narrator.inputs = [...candidates.map((_node, i) => port('candidate.' + i, 'text', false)), ...judge ? [port('choice', 'json')] : review ? [port('review', 'json')] : []];
        output.capabilities = ['chat.output'];
        const edge = (from, to, input, maxVisits = 1) => ({ edgeId: id('Edge'), from: { nodeId: from.nodeId, port: 'response' },
            to: { nodeId: to.nodeId, port: input }, condition: 'success', maxVisits, loopBack: false });
        plan.definition.nodes = [...planner ? [planner] : [], ...candidates, ...review ? [review] : [], ...judge ? [judge] : [], narrator, output];
        plan.definition.entryNodeIds = planner ? [planner.nodeId] : candidates.map(node => node.nodeId);
        plan.definition.edges = [...candidates.flatMap((candidate, i) => [...planner ? [edge(planner, candidate, 'control')] : [],
            ...judge ? [edge(candidate, judge, 'candidate.' + i)] : [], edge(candidate, narrator, 'candidate.' + i),
            ...review ? [edge(candidate, review, 'candidate.' + i, rerun ? 2 : 1)] : []]),
        ...planner && judge ? [edge(planner, judge, 'control')] : [],
        ...review ? [...planner ? [edge(planner, review, 'control', rerun ? 2 : 1)] : [], edge(review, judge ?? narrator, 'review')] : [],
        ...judge ? [edge(judge, narrator, 'choice')] : [], ...plan.definition.edges];
        plan.definition.capabilityCeiling = ['generation.send', ...planner ? ['graph.patch'] : [], 'chat.output'];
        plan.definition.graphChangePolicy = { allowedOperations: planner ? ['requestFinalize'] : [], allowedNodeKinds: [] };
        plan.definition.limits.maxSteps = 100; plan.definition.limits.maxReviews = 2;
        plan.definition.limits.maxEdges = plan.definition.edges.length;
        plan.definition.limits.maxEdgeVisits = plan.definition.edges.length + (rerun ? candidateCount + Number(!!planner) : 0);
        Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 65536 } });
        source = await seedControlActorAudiences(plan, env); nodes = { planner, candidates, review, judge, narrator };
        for (const candidate of candidates.slice(1)) if (!unreadable) {
            const removed = candidate.policy.audiencePinId;
            candidate.dependencyPinIds = candidate.dependencyPinIds.map(pin => pin === removed ? candidates[0].policy.audiencePinId : pin);
            candidate.policy.audiencePinId = candidates[0].policy.audiencePinId; plan.dependencyPins = plan.dependencyPins.filter(pin => pin.pinId !== removed);
        }
    }, responsePayload: body => {
        const content = text(body), nodeId = content.match(/"task":\{"nodeId":"([^"]+)"/)?.[1];
        if (nodeId === nodes.planner?.nodeId) return JSON.stringify({ operations: [{ op: 'requestFinalize' }] });
        const candidate = nodes.candidates.findIndex(node => node.nodeId === nodeId);
        if (candidate >= 0) {
            const version = (drafts.get(nodeId) ?? 0) + 1; drafts.set(nodeId, version);
            return 'CANDIDATE_' + candidate + '_PRIVATE' + (rerun ? '_V' + version : '');
        }
        if (nodeId === nodes.review?.nodeId) {
            const evidence = content.match(/"evidence":(\[[^\]]+\])/)?.[1];
            if (!evidence) throw new Error('Missing actual Review evidence');
            const redo = rerun && ++reviews === 1;
            return JSON.stringify({ decision: redo ? 'rerun' : 'approve', reasonCode: redo ? 'draft_incomplete' : 'quality_ready', targetAttemptIds: JSON.parse(evidence).map(item => item.attemptId) });
        }
        if (nodeId === nodes.judge?.nodeId) {
            const candidates = content.match(/"candidates":(\[[^\]]+\])/)?.[1];
            if (!candidates) throw new Error('Missing actual typed Judge candidates');
            choice = JSON.parse(candidates).at(-1).resultRef;
            return JSON.stringify({ selectedResultRef: invalidChoice ? { ...choice, resultId: id('Result') } : choice, reasonCode: 'candidate_selected' });
        }
        if (nodeId !== nodes.narrator.nodeId) throw new Error('Missing current declared Judge graph task');
        return 'Final selected RP.';
    } });
    return { ...f, nodes, source, calls, selected: () => choice };
}
