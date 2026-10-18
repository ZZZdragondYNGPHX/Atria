import { jest } from '@jest/globals';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpModelFixture } from './helpers/rp-model-fixture.js';
import { seedControlActorAudiences } from './helpers/rp-control-audience-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash, putMutable } from '../../src/native/repositories/common.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { controlRecordKey, readAttempt } from '../../src/native/orchestration/controller-common.js';
import { ModelPort } from '../../src/native/orchestration/model-port.js';
import { ResultPort } from '../../src/native/orchestration/result-port.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';

jest.setTimeout(120000);
const id = kind => createNativeId('orchestration' + kind);
const text = body => body.messages.flatMap(message => typeof message.content === 'string' ? [message.content] : message.content.map(part => part.text ?? '')).join('\n');
const rootOf = f => f.h.engine.withTransaction(f.h.handle, async tx => (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }))[0].doc);
const bankOf = async f => Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;

async function setup(make, { targetPlanner = false, usage = true, maxRequests = targetPlanner ? 8 : 6, ambiguous = false } = {}) {
    let nodes, source, loop; const rounds = new Map();
    const f = await rpModelFixture(make, { usage, configurePlan: async (plan, env) => {
        const [narrator, output] = plan.definition.nodes;
        const route = { ...env.route, executionPolicy: { ...env.route.executionPolicy, computeBudget: {
            ...env.route.executionPolicy.computeBudget, maxRequests, localWork: { ...env.route.executionPolicy.computeBudget.localWork, maxJobs: 64 } } } };
        await env.seeded.persistence.saveRuntimeRoute(env.h.handle, route);
        plan.dependencyPins[0].integrity = hash(await env.seeded.persistence.getRuntimeRoute(env.h.handle, route.runtimeRouteId));
        const port = (name, type, required = true) => ({ name, type, required });
        const node = async (label, kind, inputs) => {
            const connection = { ...env.seeded.connection, connectionProfileId: createNativeId('connectionProfile'), displayName: label };
            await env.seeded.persistence.saveConnectionProfile(env.h.handle, connection);
            const model = { ...env.seeded.model, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'return-' + label,
                connectionProfileRef: { scope: 'player', connectionProfileId: connection.connectionProfileId } };
            await env.seeded.persistence.saveModelProfile(env.h.handle, model);
            const owned = { ...route, runtimeRouteId: createNativeId('runtimeRoute'), displayName: label,
                modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId }, connectionProfileRef: model.connectionProfileRef,
                executionPolicy: { ...route.executionPolicy, allowedModelProfileIds: [model.modelProfileId] } };
            await env.seeded.persistence.saveRuntimeRoute(env.h.handle, owned);
            const pinId = 'return.' + label;
            plan.dependencyPins.push({ pinId, port: 'model', resourceRef: { scope: 'player', runtimeRouteId: owned.runtimeRouteId },
                integrity: hash(await env.seeded.persistence.getRuntimeRoute(env.h.handle, owned.runtimeRouteId)) });
            return { nodeId: id('Node'), kind, label, inputs, outputs: [port('response', kind === 'planner' ? 'json' : 'text')],
                capabilities: ['generation.send', ...kind === 'planner' ? ['graph.patch'] : []], dependencyPinIds: [pinId], policy: { agentPinId: pinId } };
        };
        const seed = await node('seed', 'agent', ambiguous ? [port('feedback', 'json', false)] : []);
        const target = await node('target', targetPlanner ? 'planner' : 'agent', [port('seed', 'text'), port('feedback', 'json', false)]);
        const middle = targetPlanner ? await node('middle', 'agent', [port('control', 'json')]) : null;
        const late = await node('late', 'planner', [port('work', 'text')]);
        narrator.inputs = [port('seed', 'text'), port('work', 'text'), port('control', 'json')]; output.capabilities = ['chat.output'];
        const edge = (from, to, input, maxVisits = 1, loopBack = false) => ({ edgeId: id('Edge'),
            from: { nodeId: from.nodeId, port: 'response' }, to: { nodeId: to.nodeId, port: input }, condition: 'success', maxVisits, loopBack });
        loop = edge(late, target, 'feedback', 1, true);
        plan.definition.nodes = [seed, target, ...middle ? [middle] : [], late, narrator, output]; plan.definition.entryNodeIds = [seed.nodeId];
        plan.definition.edges = [edge(seed, target, 'seed', 2), ...middle ? [edge(target, middle, 'control', 2)] : [],
            edge(middle ?? target, late, 'work', 2), edge(seed, narrator, 'seed'), edge(middle ?? target, narrator, 'work'), edge(late, narrator, 'control'),
            loop, ...ambiguous ? [edge(late, seed, 'feedback', 1, true)] : [], ...plan.definition.edges];
        plan.definition.capabilityCeiling = ['generation.send', 'graph.patch', 'chat.output'];
        plan.definition.graphChangePolicy = { allowedOperations: ['requestReplan', 'requestFinalize'], allowedNodeKinds: [] };
        Object.assign(plan.definition.limits, { maxSteps: 120, maxAttempts: maxRequests + 1, maxPatches: targetPlanner ? 4 : 2,
            maxReplans: 1, maxLoopIterations: 1, maxEdges: plan.definition.edges.length, maxEdgeVisits: plan.definition.edges.length + 3 });
        Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 65536 } });
        source = await seedControlActorAudiences(plan, env); nodes = { seed, target, middle, late, narrator };
        // These direct Result dependencies use the actual original Actor A
        // Source. Actor B's independently seeded facts remain inaccessible.
        for (const work of [target, middle].filter(node => node?.kind === 'agent')) {
            const removed = work.policy.audiencePinId;
            work.dependencyPinIds = work.dependencyPinIds.map(pin => pin === removed ? seed.policy.audiencePinId : pin);
            work.policy.audiencePinId = seed.policy.audiencePinId; plan.dependencyPins = plan.dependencyPins.filter(pin => pin.pinId !== removed);
        }
    }, responsePayload: body => {
        const nodeId = text(body).match(/"task":\{"nodeId":"([^"]+)"/)?.[1], node = Object.values(nodes).find(item => item?.nodeId === nodeId);
        if (!node) throw new Error('Missing actual bounded return task');
        const round = (rounds.get(nodeId) ?? 0) + 1; rounds.set(nodeId, round);
        if (node.kind === 'planner') return JSON.stringify({ operations: [{ op: node === nodes.late && round === 1 ? 'requestReplan' : 'requestFinalize' }] });
        return node === nodes.seed ? 'OUTSIDE_SEED_A_PRIVATE' : node === nodes.narrator ? 'Final returned RP.' : 'ROUND_' + round + '_A_PRIVATE';
    } });
    return { ...f, nodes, source, loop, calls: targetPlanner ? 8 : 6 };
}

describe.each(CONTRACT_HARNESSES)('$name RP explicit published return loops', ({ make }) => {
    test.each([false, true])('a Planner returns to an earlier owned task with exact fresh Attempts and cold history, targetPlanner=%s', async targetPlanner => {
        const f = await setup(make, { targetPlanner }); let cold, checkedOld = false, oldRead;
        const read = ResultPort.prototype.readForGraphResults;
        const spy = jest.spyOn(ResultPort.prototype, 'readForGraphResults').mockImplementation(async function (handle, request) {
            if (!checkedOld) {
                const root = await rootOf(f), attempts = await f.h.engine.withTransaction(handle, async tx =>
                    Promise.all(root.attemptRefs.map(ref => readAttempt(tx, handle, root, ref))));
                if (attempts.some(row => row.doc.nodeId === f.nodes.narrator.nodeId && ['pending', 'running', 'waiting_effect'].includes(row.doc.status))) {
                    const work = f.nodes.middle ?? f.nodes.target, versions = attempts.map(row => row.doc).filter(attempt => attempt.nodeId === work.nodeId)
                        .sort((a, b) => a.attemptNumber - b.attemptNumber);
                    const old = versions[0]?.resultRefs[0], current = versions[1]?.resultRefs[0];
                    if (!old || !current) throw new Error('Missing actual old and current loop Result versions');
                    checkedOld = true;
                    const decision = await read.call(this, handle, { ...request, resultRefs: request.resultRefs.map(ref => hash(ref) === hash(current) ? old : ref) })
                        .then(() => 'accepted', error => error.code);
                    oldRead = { versions: versions.length, currentIncluded: request.resultRefs.some(ref => hash(ref) === hash(current)), decision };
                }
            }
            return read.call(this, handle, request);
        });
        try {
            const result = await f.run(), root = await rootOf(f);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(f.calls); expect(checkedOld).toBe(true);
            expect(oldRead).toEqual({ versions: 2, currentIncluded: true, decision: 'native_orchestration_consumption_stale' });
            expect(root.progress).toMatchObject({ attempts: f.calls + 1, replans: 1, loopIterations: 1, patches: targetPlanner ? 4 : 2 });
            expect(root.progress.edgeVisitCounts[f.loop.edgeId]).toBe(1);
            const requests = f.requests.map(text), target = requests.filter(body => body.includes('"task":{"nodeId":"' + f.nodes.target.nodeId + '"'));
            expect(target).toHaveLength(2);
            for (const body of target) { expect(body).toContain('OUTSIDE_SEED_A_PRIVATE'); expect(body).toContain('A PRIVATE RUMOR'); expect(body).not.toContain('B PRIVATE RUMOR'); expect(body).not.toContain('NARRATOR ONLY MEMORY'); }
            expect(target[1]).toContain('bounded_replan'); expect(target[1]).toContain('previousControlRef');
            const late = requests.filter(body => body.includes('"task":{"nodeId":"' + f.nodes.late.nodeId + '"'));
            expect(late).toHaveLength(2); expect(late[0]).toContain('ROUND_1_A_PRIVATE'); expect(late[1]).toContain('ROUND_2_A_PRIVATE'); expect(late[1]).not.toContain('ROUND_1_A_PRIVATE');
            const final = requests.at(-1); expect(final).toContain('ROUND_2_A_PRIVATE'); expect(final).not.toContain('ROUND_1_A_PRIVATE');
            const bank = await bankOf(f); expect(bank.limits.maxRequests).toBe(f.calls); expect(bank.attempts).toHaveLength(f.calls);
            expect(bank.attempts.every(attempt => attempt.status === 'settled' && attempt.usage.totalTokens === 20)).toBe(true);
            const facts = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(facts.closure.effectIds).toHaveLength(f.calls + 1); expect(root.outputClaims).toHaveLength(1);
            const repeated = [...facts.published.graphResults, ...facts.published.plannerCompletions].filter(fact => fact.producer.nodeId === f.nodes.target.nodeId);
            expect(repeated.map(fact => fact.producer.attemptNumber)).toEqual([1, 2]); expect(new Set(repeated.map(fact => fact.receipt.modelEffectId)).size).toBe(2);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body.at(-1).mes).toBe('Final returned RP.');
            expect((await f.source.core.observe(f.h.handle, f.source.base.session.sessionId)).revision).toEqual(f.source.base.revision);
            await f.chats.delete(f.h.handle, f.locator.charDir, f.locator.name); await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            expect((await cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).closure.effectIds).toHaveLength(f.calls + 1);
            const invented = structuredClone(root); invented.progress.edgeVisitCounts[f.loop.edgeId]++;
            await expect(cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, invented))).rejects.toThrow();
            await cold.withTransaction(f.h.handle, async tx => {
                const key = controlRecordKey(f.h.handle, root.runId, 'attempt', repeated[1].producer.attemptId), row = await tx.getResource(key);
                const changed = structuredClone(row.doc); changed.inputRefs[0].controlGraph.bindings = changed.inputRefs[0].controlGraph.bindings.filter(binding => binding.edgeId !== f.loop.edgeId);
                changed.inputDigest = hash(changed.inputRefs); await putMutable(tx, key, changed, { expectedIntegrity: row.integrity });
            });
            await expect(cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).rejects.toThrow(); expect(f.requests).toHaveLength(f.calls);
        } finally { spy.mockRestore(); await cold?.close(); await f.cleanup(); }
    });

    test.each([false, true])('original budget or ambiguous published returns refuse another paid task, ambiguous=%s', async ambiguous => {
        const f = await setup(make, { maxRequests: ambiguous ? 6 : 5, ambiguous });
        try {
            await expect(f.run()).rejects.toThrow('native_orchestration_planner_patch_rejected'); expect(f.requests).toHaveLength(3);
            const root = await rootOf(f); expect(root.graphRevision).toBe(0); expect(root.progress.loopIterations).toBe(0); expect(root.progress.replans).toBe(0); expect(root.outputClaims).toEqual([]);
            const patches = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle, runId: root.runId, recordType: 'patch' }));
            expect(patches).toHaveLength(1); expect(patches[0].doc.accepted).toBe(false);
            expect(patches[0].doc.issues).toEqual([expect.objectContaining({ code: ambiguous ? 'native_orchestration_planner_replan_pending' : 'native_orchestration_graph_budget_unavailable' })]);
            const control = await f.control.status(f.h.handle, f.controlId), bank = Object.values(control.operations)[0].compute;
            expect(bank.attempts).toHaveLength(3); expect(bank.attempts.every(attempt => attempt.status === 'settled')).toBe(true);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(3); expect(await f.control.status(f.h.handle, f.controlId)).toEqual(control);
        } finally { await f.cleanup(); }
    });

    test('unknown return-loop work retains every version and charge without completion or resend', async () => {
        const f = await setup(make, { usage: false });
        try {
            const result = await f.run(), root = await rootOf(f);
            expect(result.output.runStatus).toBe('pending_output'); expect(f.requests).toHaveLength(6);
            expect(root.graphRevision).toBe(2); expect(root.progress.loopIterations).toBe(1); expect(root.outputClaims).toEqual([]); expect(root.resultRefs).toHaveLength(4);
            const control = await f.control.status(f.h.handle, f.controlId), bank = Object.values(control.operations)[0].compute;
            expect(bank.attempts).toHaveLength(6); expect(bank.attempts.every(attempt => attempt.status === 'unknown')).toBe(true);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(3);
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(6); expect(await f.control.status(f.h.handle, f.controlId)).toEqual(control);
        } finally { await f.cleanup(); }
    });

    test('Source withdrawal after the accepted return patch blocks the repeated task and preserves original costs', async () => {
        const f = await setup(make), inspect = ModelPort.prototype.inspectResultCompletion; let changed = false;
        const spy = jest.spyOn(ModelPort.prototype, 'inspectResultCompletion').mockImplementation(async function (handle, request) {
            const proof = await inspect.call(this, handle, request);
            if (!changed && f.h.engine.hasActiveTransaction(handle)) {
                const root = await f.authority.execution.runs.get(handle, request.runId);
                if (root.graphRevision === 1) {
                    changed = true; const binding = await f.plans.getBinding(handle, f.sourceSelector);
                    await f.plans.saveBinding(handle, id('Command'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
                }
            }
            return proof;
        });
        try {
            await expect(f.run()).rejects.toThrow(); expect(changed).toBe(true); expect(f.requests).toHaveLength(3);
            const root = await rootOf(f); expect(root.graphRevision).toBe(1); expect(root.progress.replans).toBe(1); expect(root.progress.loopIterations).toBe(0); expect(root.outputClaims).toEqual([]);
            const bank = await bankOf(f); expect(bank.attempts).toHaveLength(3); expect(bank.attempts.every(attempt => attempt.status === 'settled')).toBe(true);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        } finally { spy.mockRestore(); await f.cleanup(); }
    });
});
