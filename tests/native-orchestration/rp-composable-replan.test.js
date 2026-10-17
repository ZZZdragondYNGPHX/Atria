import { jest } from '@jest/globals';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpModelFixture } from './helpers/rp-model-fixture.js';
import { seedControlActorAudiences } from './helpers/rp-control-audience-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash, putMutable } from '../../src/native/repositories/common.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { ModelPort } from '../../src/native/orchestration/model-port.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';

jest.setTimeout(120000);
const id = kind => createNativeId('orchestration' + kind);
const text = body => body.messages.flatMap(message => typeof message.content === 'string' ? [message.content] : message.content.map(part => part.text ?? '')).join('\n');

async function setup(make, { maxRequests = 7, returnEdges = true, noProgress = false, usage = true } = {}) {
    let nodes, source, loops; const rounds = new Map();
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
            const model = { ...env.seeded.model, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'replan-' + label,
                connectionProfileRef: { scope: 'player', connectionProfileId: connection.connectionProfileId } };
            await env.seeded.persistence.saveModelProfile(env.h.handle, model);
            const owned = { ...route, runtimeRouteId: createNativeId('runtimeRoute'), displayName: label,
                modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId }, connectionProfileRef: model.connectionProfileRef,
                executionPolicy: { ...route.executionPolicy, allowedModelProfileIds: [model.modelProfileId] } };
            await env.seeded.persistence.saveRuntimeRoute(env.h.handle, owned);
            const pinId = 'replan.' + label;
            plan.dependencyPins.push({ pinId, port: 'model', resourceRef: { scope: 'player', runtimeRouteId: owned.runtimeRouteId },
                integrity: hash(await env.seeded.persistence.getRuntimeRoute(env.h.handle, owned.runtimeRouteId)) });
            return { nodeId: id('Node'), kind, label, inputs, outputs: [port('response', kind === 'planner' ? 'json' : 'text')],
                capabilities: ['generation.send', ...kind === 'planner' ? ['graph.patch'] : []], dependencyPinIds: [pinId], policy: { agentPinId: pinId } };
        };
        const seed = await node('seed', 'agent', []);
        const first = await node('first', 'planner', [port('seed', 'text'), port('feedback', 'json', false)]);
        const other = await node('other', 'agent', [port('control', 'json')]);
        const second = await node('second', 'planner', [port('other', 'text'), port('control', 'json'), port('feedback', 'json', false)]);
        narrator.inputs = [port('seed', 'text'), port('other', 'text'), port('control', 'json')]; output.capabilities = ['chat.output'];
        const edge = (from, to, input, maxVisits = 1, loopBack = false) => ({ edgeId: id('Edge'),
            from: { nodeId: from.nodeId, port: 'response' }, to: { nodeId: to.nodeId, port: input }, condition: 'success', maxVisits, loopBack });
        loops = [edge(first, first, 'feedback', 1, true), edge(second, second, 'feedback', 1, true)];
        plan.definition.nodes = [seed, first, other, second, narrator, output]; plan.definition.entryNodeIds = [seed.nodeId];
        plan.definition.edges = [edge(seed, first, 'seed', 2), edge(first, other, 'control'),
            edge(other, second, 'other', 2), edge(first, second, 'control', 2), edge(seed, narrator, 'seed'), edge(other, narrator, 'other'),
            edge(second, narrator, 'control'), ...returnEdges ? loops : [], ...plan.definition.edges];
        plan.definition.capabilityCeiling = ['generation.send', 'graph.patch', 'chat.output'];
        plan.definition.graphChangePolicy = { allowedOperations: ['requestReplan', 'requestFinalize'], allowedNodeKinds: [] };
        Object.assign(plan.definition.limits, { maxSteps: 120, maxAttempts: 8, maxPatches: 4, maxReplans: 2, maxLoopIterations: 2,
            maxEdges: plan.definition.edges.length, maxEdgeVisits: plan.definition.edges.length + 4 });
        Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 65536 } });
        source = await seedControlActorAudiences(plan, env); nodes = { seed, first, other, second, narrator };
        // The second Planner consumes Actor B's actual Result. Reuse that
        // original Actor Source, without granting it Actor A's seed evidence.
        const removed = second.policy.audiencePinId;
        second.dependencyPinIds = second.dependencyPinIds.map(pin => pin === removed ? other.policy.audiencePinId : pin);
        second.policy.audiencePinId = other.policy.audiencePinId; plan.dependencyPins = plan.dependencyPins.filter(pin => pin.pinId !== removed);
    }, responsePayload: body => {
        const nodeId = text(body).match(/"task":\{"nodeId":"([^"]+)"/)?.[1];
        const node = Object.values(nodes).find(item => item.nodeId === nodeId);
        if (!node) throw new Error('Missing actual replan task');
        if (node.kind === 'planner') {
            const round = (rounds.get(nodeId) ?? 0) + 1; rounds.set(nodeId, round);
            return JSON.stringify({ operations: [{ op: round === 1 || noProgress ? 'requestReplan' : 'requestFinalize' }] }, null, noProgress && round === 2 ? 2 : 0);
        }
        return node === nodes.seed ? 'SEED_A_PRIVATE' : node === nodes.other ? 'B_SIDE_PRIVATE' : 'Final bounded composed RP.';
    } });
    return { ...f, nodes, source, loops };
}

describe.each(CONTRACT_HARNESSES)('$name generic RP declared Planner self returns', ({ make }) => {
    test('two non-entry owned Planners repeat with all original incoming facts and cold cumulative proofs', async () => {
        const f = await setup(make); let cold;
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(7);
            expect(root.progress).toMatchObject({ attempts: 8, patches: 4, replans: 2, loopIterations: 2 }); expect(root.graphRevision).toBe(4);
            for (const loop of f.loops) expect(root.progress.edgeVisitCounts[loop.edgeId]).toBe(1);
            const requests = f.requests.map(text);
            for (const node of [f.nodes.first, f.nodes.second]) {
                const owned = requests.filter(body => body.includes('"task":{"nodeId":"' + node.nodeId + '"'));
                expect(owned).toHaveLength(2);
                for (const body of owned) {
                    expect(body).toContain(node === f.nodes.first ? 'SEED_A_PRIVATE' : 'B_SIDE_PRIVATE');
                    expect(body).toContain(node === f.nodes.first ? 'A PRIVATE RUMOR' : 'B PRIVATE RUMOR');
                    expect(body).not.toContain(node === f.nodes.first ? 'B_SIDE_PRIVATE' : 'SEED_A_PRIVATE');
                    expect(body).not.toContain(node === f.nodes.first ? 'B PRIVATE RUMOR' : 'A PRIVATE RUMOR'); expect(body).not.toContain('NARRATOR ONLY MEMORY');
                }
                expect(owned[1]).toContain('bounded_replan'); expect(owned[1]).toContain('previousControlRef');
            }
            const effects = f.effects.filter(effect => effect.proposal.inputRef.kind === 'native_rp_intent');
            expect(effects).toHaveLength(7); expect(new Set(effects.map(effect => effect.proposal.inputRef.routeRef.runtimeRouteId)).size).toBe(5);
            const bank = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
            expect(bank.limits.maxRequests).toBe(7); expect(bank.attempts).toHaveLength(7);
            expect(bank.attempts.every(attempt => attempt.status === 'settled' && attempt.usage.totalTokens === 20)).toBe(true);
            const facts = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(facts.published.plannerCompletions.map(fact => fact.producer.attemptNumber)).toEqual([1, 2, 1, 2]);
            expect(facts.closure.effectIds).toHaveLength(8); expect(root.outputClaims).toHaveLength(1);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body.at(-1).mes).toBe('Final bounded composed RP.');
            expect((await f.source.core.observe(f.h.handle, f.source.base.session.sessionId)).revision).toEqual(f.source.base.revision);
            await f.chats.delete(f.h.handle, f.locator.charDir, f.locator.name); await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            expect((await cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).closure.effectIds).toHaveLength(8);
            const invented = structuredClone(root); invented.progress.loopIterations++;
            await expect(cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, invented))).rejects.toThrow('Invalid RP control graph facts');
            const repeated = facts.published.plannerCompletions[1], input = repeated.producer.inputRefs[0];
            expect(input.controlGraph.bindings).toHaveLength(2);
            expect(input.controlGraph.evidenceRefs).toHaveLength(1); expect(input.controlGraph.controlRefs).toHaveLength(1);
            await cold.withTransaction(f.h.handle, async tx => {
                const key = controlRecordKey(f.h.handle, root.runId, 'receipt', repeated.receipt.receiptId), row = await tx.getResource(key);
                await putMutable(tx, key, { ...row.doc, patchIntegrity: '0'.repeat(64) }, { expectedIntegrity: row.integrity });
            });
            await expect(cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).rejects.toThrow();
            expect(f.requests).toHaveLength(7);
        } finally { await cold?.close(); await f.cleanup(); }
    });

    test('the original bank rejects another paid Planner round before admitting its patch', async () => {
        const f = await setup(make, { maxRequests: 6 });
        try {
            await expect(f.run()).rejects.toThrow('native_orchestration_planner_patch_rejected'); expect(f.requests).toHaveLength(5);
            const [row] = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            expect(row.doc.graphRevision).toBe(2); expect(row.doc.progress.replans).toBe(1); expect(row.doc.progress.loopIterations).toBe(1);
            expect(row.doc.outputClaims).toEqual([]);
            const patches = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle, runId: row.doc.runId, recordType: 'patch' }));
            expect(patches.find(patch => !patch.doc.accepted).doc.issues).toEqual([expect.objectContaining({ code: 'native_orchestration_graph_budget_unavailable' })]);
            const bank = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
            expect(bank.limits.maxRequests).toBe(6); expect(bank.attempts).toHaveLength(5); expect(bank.attempts.every(attempt => attempt.status === 'settled')).toBe(true);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        } finally { await f.cleanup(); }
    });

    test('a replan operation cannot invent an absent return edge', async () => {
        const f = await setup(make, { returnEdges: false });
        try {
            await expect(f.run()).rejects.toThrow('native_orchestration_planner_replan_pending'); expect(f.requests).toHaveLength(2);
            const bank = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
            expect(bank.attempts).toHaveLength(2); expect(bank.attempts.every(attempt => attempt.status === 'settled')).toBe(true);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        } finally { await f.cleanup(); }
    });

    test('identical semantic Planner operations stop after the paid repeat without erasing the first patch', async () => {
        const f = await setup(make, { noProgress: true });
        try {
            await expect(f.run()).rejects.toThrow('native_orchestration_planner_no_progress'); expect(f.requests).toHaveLength(3);
            const [row] = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            expect(row.doc.graphRevision).toBe(1); expect(row.doc.progress).toMatchObject({ patches: 1, replans: 1, loopIterations: 1 });
            expect(row.doc.outputClaims).toEqual([]); expect(row.doc.resultRefs).toHaveLength(1);
            const control = await f.control.status(f.h.handle, f.controlId), bank = Object.values(control.operations)[0].compute;
            expect(bank.attempts).toHaveLength(3); expect(bank.attempts.every(attempt => attempt.status === 'settled')).toBe(true);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(3); expect(await f.control.status(f.h.handle, f.controlId)).toEqual(control);
        } finally { await f.cleanup(); }
    });

    test('unknown costs retain every declared loop fact and legal Chat without completion, refund or resend', async () => {
        const f = await setup(make, { usage: false });
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('pending_output'); expect(f.requests).toHaveLength(7);
            expect(root.graphRevision).toBe(4); expect(root.progress).toMatchObject({ patches: 4, replans: 2, loopIterations: 2 });
            expect(root.outputClaims).toEqual([]); expect(root.resultRefs).toHaveLength(3);
            const control = await f.control.status(f.h.handle, f.controlId), bank = Object.values(control.operations)[0].compute;
            expect(bank.limits.maxRequests).toBe(7); expect(bank.attempts).toHaveLength(7); expect(bank.attempts.every(attempt => attempt.status === 'unknown')).toBe(true);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(3);
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(7); expect(await f.control.status(f.h.handle, f.controlId)).toEqual(control);
        } finally { await f.cleanup(); }
    });

    test('Source binding withdrawal after the accepted patch retains costs and prevents the repeat HTTP', async () => {
        const f = await setup(make), inspect = ModelPort.prototype.inspectResultCompletion; let changed = false;
        const spy = jest.spyOn(ModelPort.prototype, 'inspectResultCompletion').mockImplementation(async function (handle, request) {
            const proof = await inspect.call(this, handle, request);
            if (!changed && f.h.engine.hasActiveTransaction(handle)) {
                const root = await f.authority.execution.runs.get(handle, request.runId);
                if (root.graphRevision === 1) {
                    changed = true; const binding = await f.plans.getBinding(handle, f.sourceSelector);
                    await f.plans.saveBinding(handle, createNativeId('orchestrationCommand'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
                }
            }
            return proof;
        });
        try {
            await expect(f.run()).rejects.toThrow(); expect(changed).toBe(true); expect(f.requests).toHaveLength(2);
            const [row] = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            expect(row.doc.graphRevision).toBe(1); expect(row.doc.progress.replans).toBe(1); expect(row.doc.progress.loopIterations).toBe(0); expect(row.doc.outputClaims).toEqual([]);
            const bank = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
            expect(bank.attempts).toHaveLength(2); expect(bank.attempts.every(attempt => attempt.status === 'settled')).toBe(true);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        } finally { spy.mockRestore(); await f.cleanup(); }
    });
});
