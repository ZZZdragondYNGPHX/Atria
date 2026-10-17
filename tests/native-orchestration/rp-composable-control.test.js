import { jest } from '@jest/globals';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpModelFixture } from './helpers/rp-model-fixture.js';
import { seedControlActorAudiences } from './helpers/rp-control-audience-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash, putMutable } from '../../src/native/repositories/common.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { graphPlannerReceiptId } from '../../src/native/orchestration/graph-planner-completion.js';
import { controlRecordKey, runGuard } from '../../src/native/orchestration/controller-common.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { ModelPort } from '../../src/native/orchestration/model-port.js';

jest.setTimeout(120000);
const id = kind => createNativeId('orchestration' + kind);
const text = body => body.messages.flatMap(message => typeof message.content === 'string' ? [message.content] : message.content.map(part => part.text ?? '')).join('\n');

async function setup(make, { dynamic = false, maxRequests = 5, usage = true, addedLabel = 'Added owned advisory', foreignAdded = false, foreignPlanner = false } = {}) {
    let nodes, source, addition, pinnedRoutes;
    const f = await rpModelFixture(make, { usage, memorySettings: { enabled: true, recallEnabled: true },
        configurePlan: async (plan, env) => {
            const [narrator, output] = plan.definition.nodes;
            const route = { ...env.route, executionPolicy: { ...env.route.executionPolicy,
                computeBudget: { ...env.route.executionPolicy.computeBudget, maxRequests,
                    ...foreignPlanner ? { localWork: { ...env.route.executionPolicy.computeBudget.localWork, maxJobs: 64 } } : {} } } };
            await env.seeded.persistence.saveRuntimeRoute(env.h.handle, route);
            plan.dependencyPins[0].integrity = hash(await env.seeded.persistence.getRuntimeRoute(env.h.handle, route.runtimeRouteId));
            const port = (name, type) => ({ name, type, required: true });
            const node = async (label, kind, inputs) => {
                const owned = { ...route, runtimeRouteId: createNativeId('runtimeRoute'), displayName: label };
                await env.seeded.persistence.saveRuntimeRoute(env.h.handle, owned);
                const pinId = label.toLowerCase().replaceAll(' ', '.') + '.route';
                plan.dependencyPins.push({ pinId, port: 'model', resourceRef: { scope: 'player', runtimeRouteId: owned.runtimeRouteId },
                    integrity: hash(await env.seeded.persistence.getRuntimeRoute(env.h.handle, owned.runtimeRouteId)) });
                return { nodeId: id('Node'), kind, label, inputs, outputs: [{ name: 'response', type: kind === 'planner' ? 'json' : 'text', required: false }],
                    dependencyPinIds: [pinId], capabilities: ['generation.send', ...kind === 'planner' ? ['graph.patch'] : []], policy: { agentPinId: pinId } };
            };
            const seed = await node('Seed A', 'agent', []), first = await node('Planner One', 'planner', [port('seed', 'text')]);
            const other = await node('Actor B Task', 'agent', [port('control', 'json')]);
            const second = await node('Planner Two', 'planner', [port('seed', 'text'), port('sameSeed', 'text'), port('control', 'json')]);
            narrator.inputs = [port('seed', 'text'), port('other', 'text'), port('control', 'json')]; output.capabilities = ['chat.output'];
            if (dynamic) narrator.inputs.push({ name: 'added', type: 'text', required: false });
            const edge = (from, to, input) => ({ edgeId: id('Edge'), from: { nodeId: from.nodeId, port: 'response' },
                to: { nodeId: to.nodeId, port: input }, condition: 'success', maxVisits: 1, loopBack: false });
            plan.definition.nodes = [seed, first, other, ...dynamic ? [] : [second], narrator, output];
            if (dynamic) plan.dependencyPins = plan.dependencyPins.filter(pin => pin.pinId !== second.policy.agentPinId);
            plan.definition.edges = [edge(seed, first, 'seed'), edge(first, other, 'control'), ...dynamic ? [] : [edge(seed, second, 'seed'), edge(seed, second, 'sameSeed'),
                edge(first, second, 'control')], edge(seed, narrator, 'seed'), edge(other, narrator, 'other'), edge(dynamic ? first : second, narrator, 'control'), ...plan.definition.edges];
            plan.definition.entryNodeIds = [seed.nodeId]; plan.definition.capabilityCeiling = ['generation.send', 'graph.patch', 'chat.output'];
            plan.definition.graphChangePolicy = { allowedOperations: ['requestFinalize', 'setPendingPriority', 'markBlocked', ...dynamic ? ['addNode', 'addEdge'] : []],
                allowedNodeKinds: dynamic ? ['agent'] : [] };
            plan.definition.limits.maxSteps = 100;
            // The published owner allows the two proposed edges before execution.
            plan.definition.limits.maxEdges = plan.definition.edges.length + (dynamic ? 2 : 0);
            Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 65536 } });
            source = await seedControlActorAudiences(plan, env); nodes = { seed, first, other, second, narrator };
            // Keep the original Actor B Source, changing only its actual role.
            if (foreignPlanner) { other.kind = 'planner'; other.capabilities.push('graph.patch'); other.outputs[0].type = 'json'; narrator.inputs.find(input => input.name === 'other').type = 'json'; }
            if (dynamic) {
                const added = { ...structuredClone(seed), nodeId: id('Node'), label: addedLabel, inputs: [port('control', 'json')] };
                if (foreignAdded) { added.dependencyPinIds = structuredClone(other.dependencyPinIds); added.policy = structuredClone(other.policy); }
                addition = [{ op: 'addNode', node: added }, { op: 'addEdge', edge: edge(first, added, 'control') },
                    { op: 'addEdge', edge: edge(added, narrator, 'added') }]; nodes.added = added;
            }
            pinnedRoutes = Object.fromEntries(plan.dependencyPins.filter(pin => pin.port === 'model').map(pin => [pin.pinId, pin.resourceRef]));
        }, responsePayload: body => {
            const taskNodeId = text(body).match(/"task":\{"nodeId":"([^"]+)"/)?.[1];
            const node = Object.values(nodes).find(node => node.nodeId === taskNodeId);
            if (!node) throw new Error('Actual scoped graph task missing from HTTP');
            if (node.kind === 'planner') return JSON.stringify({ operations: [...node === nodes.first && addition ? addition : [], { op: 'requestFinalize' }] });
            if (node === nodes.added) return 'DYNAMIC_A_PRIVATE';
            return node === nodes.seed ? 'SEED_A_PRIVATE' : node === nodes.other ? 'B_SIDE_PRIVATE' : 'Final composed RP.';
        } });
    return { ...f, nodes, source, pinnedRoutes };
}

describe.each(CONTRACT_HARNESSES)('$name published RP composable model and Planner DAG', ({ make }) => {
    test.each([false, true])('non-entry multiple owned Planners consume exact dependencies and preserve cold proofs, dynamic=%s', async dynamic => {
        const f = await setup(make, { dynamic }), calls = 5, planners = dynamic ? [f.nodes.first] : [f.nodes.first, f.nodes.second]; let cold;
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('completed'); expect(root.graphRevision).toBe(planners.length); expect(f.requests).toHaveLength(calls);
            const byNode = new Map(f.requests.map(body => [text(body).match(/"task":\{"nodeId":"([^"]+)"/)?.[1], text(body)]));
            for (const node of planners) {
                expect(byNode.get(node.nodeId)).toContain('SEED_A_PRIVATE'); expect(byNode.get(node.nodeId)).toContain('A PRIVATE RUMOR');
                expect(byNode.get(node.nodeId)).not.toContain('B PRIVATE RUMOR'); expect(byNode.get(node.nodeId)).not.toContain('NARRATOR ONLY MEMORY');
                expect(byNode.get(node.nodeId)).not.toContain('B_SIDE_PRIVATE');
            }
            expect(byNode.get(dynamic ? f.nodes.added.nodeId : f.nodes.second.nodeId)).toContain('graph_planner_control');
            expect(byNode.get(f.nodes.other.nodeId)).toContain('B PRIVATE RUMOR'); expect(byNode.get(f.nodes.other.nodeId)).not.toContain('SEED_A_PRIVATE');
            expect(byNode.get(f.nodes.narrator.nodeId)).toContain('SEED_A_PRIVATE');
            expect(byNode.get(f.nodes.narrator.nodeId)).not.toContain('B_SIDE_PRIVATE'); expect(byNode.get(f.nodes.narrator.nodeId)).toContain('reference-only');
            const dynamicRequest = dynamic ? byNode.get(f.nodes.added.nodeId) : '';
            expect(root.graph.nodes.filter(node => node.label === 'Added owned advisory').map(node => node.nodeId)).toEqual(dynamic ? [f.nodes.added.nodeId] : []);
            expect(dynamicRequest.includes('A PRIVATE RUMOR')).toBe(dynamic); expect(dynamicRequest).not.toContain('B PRIVATE RUMOR');
            expect(byNode.get(f.nodes.narrator.nodeId).includes('DYNAMIC_A_PRIVATE')).toBe(dynamic);
            expect(new Set(root.graph.nodes.filter(node => node.kind !== 'output').map(node => node.policy.agentPinId)).size).toBe(dynamic ? 4 : 5);
            expect(f.effects.filter(effect => effect.proposal.inputRef.kind === 'native_rp_intent').map(effect => ({ nodeId: effect.proposal.inputRef.nodeId, routeRef: effect.proposal.inputRef.routeRef }))).toEqual(
                [...byNode.keys()].map(nodeId => ({ nodeId, routeRef: f.pinnedRoutes[root.graph.nodes.find(node => node.nodeId === nodeId).policy.agentPinId] })));
            const bank = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
            expect(bank.limits.maxRequests).toBe(calls); expect(bank.attempts).toHaveLength(calls);
            expect(bank.attempts.every(attempt => attempt.status === 'settled' && attempt.usage.totalTokens === 20)).toBe(true);
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.published.plannerCompletions).toHaveLength(planners.length); expect(output.published.graphResults).toHaveLength(dynamic ? 3 : 2);
            expect(output.closure.effectIds).toHaveLength(calls + 1); expect(root.outputClaims).toHaveLength(1);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body.at(-1).mes).toBe('Final composed RP.');
            expect((await f.source.core.observe(f.h.handle, f.source.base.session.sessionId)).revision).toEqual(f.source.base.revision);
            await f.chats.delete(f.h.handle, f.locator.charDir, f.locator.name); await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            expect((await cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).claim).toEqual(output.claim);
            const planner = output.published.plannerCompletions.at(-1);
            await cold.withTransaction(f.h.handle, async tx => {
                const key = controlRecordKey(f.h.handle, root.runId, 'receipt', graphPlannerReceiptId(root.runId, planner.producer.attemptId));
                const row = await tx.getResource(key);
                await putMutable(tx, key, { ...row.doc, responseText: JSON.stringify({ operations: [{ op: 'markBlocked', nodeId: f.nodes.narrator.nodeId }] }) }, { expectedIntegrity: row.integrity });
            });
            await expect(cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).rejects.toThrow('Invalid Graph Planner completion facts');
            expect(f.requests).toHaveLength(calls);
        } finally { await cold?.close(); await f.cleanup(); }
    });

    test.each([false, true])('Model-authored private task labels remain scoped while cross-Audience Planner control stays usable, recipientPlanner=%s', async foreignPlanner => {
        const f = await setup(make, { dynamic: true, addedLabel: 'A PRIVATE RUMOR', foreignPlanner });
        try {
            const result = await f.run();
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(5);
            const root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(root.graph.nodes.find(node => node.nodeId === f.nodes.added.nodeId).label).toBe('A PRIVATE RUMOR');
            expect((await f.source.core.observe(f.h.handle, f.source.base.session.sessionId)).revision).toEqual(f.source.base.revision);
            const byNode = new Map(f.requests.map(body => [text(body).match(/"task":\{"nodeId":"([^"]+)"/)?.[1], text(body)]));
            expect(byNode.get(f.nodes.other.nodeId)).toContain('B PRIVATE RUMOR');
            expect(byNode.get(f.nodes.other.nodeId)).toContain('graph_planner_control');
            expect(byNode.get(f.nodes.other.nodeId)).not.toContain('A PRIVATE RUMOR');
            expect(byNode.get(f.nodes.other.nodeId).includes(f.nodes.added.nodeId)).toBe(foreignPlanner);
            expect(byNode.get(f.nodes.other.nodeId)).toContain('reference-only');
            expect(byNode.get(f.nodes.added.nodeId)).toContain('A PRIVATE RUMOR');
        } finally { await f.cleanup(); }
    });

    test('a Model-authored dynamic task cannot disclose its creator Source to a different Actor Audience', async () => {
        const f = await setup(make, { dynamic: true, addedLabel: 'A PRIVATE RUMOR', foreignAdded: true });
        try {
            await expect(f.run()).rejects.toMatchObject({ code: 'native_orchestration_planner_patch_rejected' }); expect(f.requests).toHaveLength(2);
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.graphRevision).toBe(0); expect(root.resultRefs).toHaveLength(1); expect(root.outputClaims).toEqual([]);
            const patches = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle, runId: root.runId, recordType: 'patch' }));
            expect(patches).toHaveLength(1); expect(patches[0].doc.accepted).toBe(false);
            expect(patches[0].doc.issues).toEqual([{ code: 'native_orchestration_result_consume_denied' }]);
            expect((await f.source.core.observe(f.h.handle, f.source.base.session.sessionId)).revision).toEqual(f.source.base.revision);
            const status = await f.control.status(f.h.handle, f.controlId), bank = Object.values(status.operations)[0].compute;
            expect(bank.limits.maxRequests).toBe(5); expect(bank.attempts).toHaveLength(2);
            expect(bank.attempts.every(attempt => attempt.status === 'settled' && attempt.usage.totalTokens === 20)).toBe(true);
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(2);
            expect(await f.control.status(f.h.handle, f.controlId)).toEqual(status);
        } finally { await f.cleanup(); }
    });

    test('the original four-send bank refuses composition headroom without changing the declared budget or replaying paid work', async () => {
        const f = await setup(make, { maxRequests: 4 });
        try {
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(2);
            const control = await f.control.status(f.h.handle, f.controlId), bank = Object.values(control.operations)[0].compute;
            expect(bank.limits.maxRequests).toBe(4); expect(bank.attempts).toHaveLength(2);
            expect(bank.attempts.every(attempt => attempt.status === 'settled')).toBe(true);
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.graphRevision).toBe(0); expect(root.resultRefs).toHaveLength(1); expect(root.outputClaims).toEqual([]);
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(2);
            expect(await f.control.status(f.h.handle, f.controlId)).toEqual(control);
        } finally { await f.cleanup(); }
    });

    test('unknown usage keeps every composed Result and paid attempt without a completed claim, refund or resend', async () => {
        const f = await setup(make, { usage: false });
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('pending_output'); expect(f.requests).toHaveLength(5);
            expect(root.graphRevision).toBe(2); expect(root.resultRefs).toHaveLength(3); expect(root.outputClaims).toEqual([]);
            const control = await f.control.status(f.h.handle, f.controlId), bank = Object.values(control.operations)[0].compute;
            expect(bank.attempts).toHaveLength(5); expect(bank.attempts.every(attempt => attempt.status === 'unknown')).toBe(true);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(3);
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(5);
            expect(await f.control.status(f.h.handle, f.controlId)).toEqual(control);
        } finally { await f.cleanup(); }
    });

    test.each(['binding', 'cancel'])('same-transaction %s during the non-entry Planner proof preserves withdrawal and both paid attempts', async change => {
        const f = await setup(make), inspect = ModelPort.prototype.inspectResultCompletion;
        let changed = false, runId;
        const spy = jest.spyOn(ModelPort.prototype, 'inspectResultCompletion').mockImplementation(async function (handle, request) {
            const proof = await inspect.call(this, handle, request);
            if (!changed && f.requests.length === 2 && f.h.engine.hasActiveTransaction(handle)) {
                changed = true; runId = request.runId;
                if (change === 'binding') {
                    const binding = await f.plans.getBinding(handle, f.sourceSelector);
                    await f.plans.saveBinding(handle, id('Command'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
                } else await f.authority.execution.runs.cancel(handle, id('Command'), {
                    ...runGuard(await f.authority.execution.runs.get(handle, runId)), reasonCode: 'controlled_user_cancel' });
            }
            return proof;
        });
        try {
            await expect(f.run()).rejects.toThrow(); expect(changed).toBe(true); expect(f.requests).toHaveLength(2);
            const root = await f.authority.execution.runs.get(f.h.handle, runId);
            expect(root.cancelRequested).toBe(change === 'cancel'); expect(root.resultRefs).toHaveLength(1); expect(root.outputClaims).toEqual([]);
            expect((await f.plans.getBinding(f.h.handle, f.sourceSelector)).version).toBe(change === 'binding' ? 1 : 0);
            const bank = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
            expect(bank.attempts).toHaveLength(2); expect(bank.attempts.every(attempt => attempt.status === 'settled')).toBe(true);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        } finally { spy.mockRestore(); await f.cleanup(); }
    });
});
