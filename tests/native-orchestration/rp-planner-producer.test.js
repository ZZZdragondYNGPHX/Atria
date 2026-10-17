import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpModelFixture, RP_MODEL_TEXT } from './helpers/rp-model-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash, putMutable } from '../../src/native/repositories/common.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { readRpPlannerCompletion } from '../../src/native/orchestration/rp-planner-contracts.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { NativeNarratorOrchestrationAuthority } from '../../src/native/orchestration/native-turn-orchestration.js';
import { ModelPort } from '../../src/native/orchestration/model-port.js';
import { runGuard } from '../../src/native/orchestration/controller-common.js';
import { jest } from '@jest/globals';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const id = kind => createNativeId('orchestration' + kind);
async function configurePlanner(plan, { h, seeded, route }) {
    const narrator = plan.definition.nodes[0], output = plan.definition.nodes[1], plannerId = id('Node');
    const plannerRoute = { ...route, runtimeRouteId: createNativeId('runtimeRoute'), displayName: 'Explicit Planner Route' };
    await seeded.persistence.saveRuntimeRoute(h.handle, plannerRoute);
    const persisted = await seeded.persistence.getRuntimeRoute(h.handle, plannerRoute.runtimeRouteId);
    plan.dependencyPins.push({ pinId: 'planner.route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: persisted.runtimeRouteId }, integrity: hash(persisted) });
    const planner = { nodeId: plannerId, kind: 'planner', label: 'Bounded Planner', inputs: [], outputs: [{ name: 'patch', type: 'json', required: false }],
        dependencyPinIds: ['planner.route'], capabilities: ['generation.send', 'graph.patch'], policy: { agentPinId: 'planner.route' } };
    narrator.inputs = [{ name: 'plan', type: 'json', required: true }]; output.capabilities = ['chat.output'];
    plan.definition.nodes.unshift(planner); plan.definition.entryNodeIds = [plannerId]; plan.definition.capabilityCeiling = ['generation.send', 'graph.patch', 'chat.output'];
    plan.definition.edges.unshift({ edgeId: id('Edge'), from: { nodeId: plannerId, port: 'patch' }, to: { nodeId: narrator.nodeId, port: 'plan' }, condition: 'always', maxVisits: 1, loopBack: false });
    plan.definition.graphChangePolicy = { allowedOperations: ['setPendingPriority', 'markBlocked', 'requestFinalize'], allowedNodeKinds: [] };
    Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 65536 } });
    return narrator;
}

describe.each(harnesses)('$name real RP Planner producer', ({ make }) => {
    test.each(['binding', 'cancel'])('same-transaction %s during real Planner adoption preserves withdrawal and refuses a late Patch', async change => {
        let narrator;
        const f = await rpModelFixture(make, { configurePlan: async (...args) => { narrator = await configurePlanner(...args); },
            responsePayload: () => JSON.stringify({ operations: [{ op: 'setPendingPriority', nodeId: narrator.nodeId, priority: 1 }] }) });
        const inspect = ModelPort.prototype.inspectResultCompletion; let changed = false;
        const spy = jest.spyOn(ModelPort.prototype, 'inspectResultCompletion').mockImplementation(async function (handle, request) {
            const proof = await inspect.call(this, handle, request);
            if (!changed && f.requests.length === 1 && f.h.engine.hasActiveTransaction(handle)) {
                changed = true;
                if (change === 'binding') {
                    const binding = await f.plans.getBinding(handle, f.sourceSelector);
                    await f.plans.saveBinding(handle, id('Command'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
                } else await f.authority.execution.runs.cancel(handle, id('Command'), {
                    ...runGuard(await f.authority.execution.runs.get(handle, request.runId)), reasonCode: 'controlled_user_cancel' });
            }
            return proof;
        });
        try {
            await expect(f.run()).rejects.toThrow(); expect(changed).toBe(true); expect(f.requests.length).toBe(1);
            expect((await f.plans.getBinding(f.h.handle, f.sourceSelector)).version).toBe(change === 'binding' ? 1 : 0);
            const [row] = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            expect(row.doc.cancelRequested).toBe(change === 'cancel'); expect(row.doc.graphRevision).toBe(0); expect(row.doc.outputClaims).toEqual([]);
        } finally { spy.mockRestore(); await f.cleanup(); }
    });
    test('actual Scheduler Model produces one Host patch, then the original Narrator and one Chat output close all costs', async () => {
        let narrator;
        const f = await rpModelFixture(make, { configurePlan: async (...args) => { narrator = await configurePlanner(...args); },
            responsePayload: (_body, ordinal) => ordinal === 1 ? JSON.stringify({ operations: [{ op: 'setPendingPriority', nodeId: narrator.nodeId, priority: 2 }] }) : RP_MODEL_TEXT });
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(f.requests).toHaveLength(2); expect(result.output.runStatus).toBe('completed');
            expect(f.requests[0].response_format).toBeDefined();
            expect(JSON.stringify(f.requests[0])).toContain('native_rp_graph_planner');
            expect(root).toMatchObject({ status: 'completed', graphRevision: 1, progress: { patches: 1, attempts: 3, edgeVisits: 2 } });
            expect(root.nodeControl[narrator.nodeId].priority).toBe(2);
            const facts = await f.h.engine.withTransaction(f.h.handle, async tx => ({ planner: await readRpPlannerCompletion(tx, f.h.handle, root), output: await readRpOutput(tx, f.h.handle, root) }));
            expect(facts.planner.receipt.localWork.map(row => row.kind)).toEqual(['graph_control_parse', 'graph_control_adopt']);
            expect(facts.output.closure.effectIds).toHaveLength(3);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(3);
            f.host.turnOrchestration = new NativeNarratorOrchestrationAuthority({ engine: f.h.engine, sessionCore: f.host.sessionCore, rpControl: f.control });
            expect(await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).toBeTruthy();
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const key = controlRecordKey(f.h.handle, root.runId, 'receipt', facts.planner.receipt.receiptId), row = await tx.getResource(key);
                await putMutable(tx, key, { ...row.doc, payloadHash: hash('invented-response') }, { expectedIntegrity: row.integrity });
            });
            await expect(f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).rejects.toThrow('Invalid RP Planner completion facts');
        } finally { await f.cleanup(); }
    });
    test.each(['malformed', 'forbidden-op', 'blocked', 'binding-revoked'])('%s stops before Narrator and retains the first real Model costs', async problem => {
        let narrator;
        const f = await rpModelFixture(make, { configurePlan: async (...args) => { narrator = await configurePlanner(...args); }, responsePayload: () => {
            if (problem === 'malformed') return JSON.stringify({ operations: [], approved: true });
            return JSON.stringify({ operations: [problem === 'forbidden-op' ? { op: 'cancelPending', nodeId: narrator.nodeId }
                : problem === 'blocked' ? { op: 'markBlocked', nodeId: narrator.nodeId, reasonCode: 'missing_evidence' }
                    : { op: 'setPendingPriority', nodeId: narrator.nodeId, priority: 2 }] });
        } });
        try {
            if (problem === 'binding-revoked') f.onResponse(async () => {
                const binding = await f.plans.getBinding(f.h.handle, f.sourceSelector);
                await f.plans.saveBinding(f.h.handle, id('Command'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
            });
            await expect(f.run()).rejects.toThrow();
            expect(f.requests).toHaveLength(1);
            const roots = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            expect(roots).toHaveLength(1); expect(roots[0].doc.status).toBe(problem === 'binding-revoked' ? 'reconciling' : 'blocked'); expect(roots[0].doc.outputClaims).toEqual([]);
            const bank = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
            expect(bank.attempts).toHaveLength(1); expect(bank.attempts[0].status).toBe('settled');
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        } finally { await f.cleanup(); }
    });
    test('missing reported usage cannot become a completed Graph or authorize another output claim', async () => {
        let narrator;
        const f = await rpModelFixture(make, { usage: false, configurePlan: async (...args) => { narrator = await configurePlanner(...args); },
            responsePayload: (_body, ordinal) => ordinal === 1 ? JSON.stringify({ operations: [{ op: 'setPendingPriority', nodeId: narrator.nodeId, priority: 2 }] }) : RP_MODEL_TEXT });
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('pending_output'); expect(root.outputClaims).toEqual([]); expect(root.status).toBe('running');
            expect(f.requests).toHaveLength(2);
        } finally { await f.cleanup(); }
    });
    test.each(['graph.patch', 'attempt.settle'])('lost %s committed ACK preserves the applied patch and cannot dispatch Narrator or resend Planner', async operation => {
        let narrator;
        const f = await rpModelFixture(make, { configurePlan: async (...args) => { narrator = await configurePlanner(...args); },
            responsePayload: () => JSON.stringify({ operations: [{ op: 'setPendingPriority', nodeId: narrator.nodeId, priority: 2 }] }) });
        try {
            const runs = f.authority.execution.runs, original = runs.control.bind(runs); let hide = true;
            runs.control = async (...args) => {
                const result = await original(...args);
                if (hide && args[2].operation === operation) { hide = false; throw Object.assign(new Error('controlled committed Planner ACK loss'), { code: 'storage_commit_unknown' }); }
                return result;
            };
            const started = await f.start();
            await expect(started.result).rejects.toThrow();
            const rows = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            expect(rows[0].doc).toMatchObject({ status: 'blocked', graphRevision: 1, progress: { patches: 1 }, outputClaims: [] });
            expect(f.requests).toHaveLength(1);
            const replay = await f.start();
            await expect(replay.result).rejects.toThrow(); expect(f.requests).toHaveLength(1);
            expect(await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }))).toHaveLength(1);
        } finally { await f.cleanup(); }
    });
});
