import { jest } from '@jest/globals';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpModelFixture } from './helpers/rp-model-fixture.js';
import { configurePlanner, configurePlannerLoop } from './helpers/rp-planner-fixture.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { readRpPlannerCompletion } from '../../src/native/orchestration/rp-planner-contracts.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { ModelPort } from '../../src/native/orchestration/model-port.js';
import { createNativeId } from '../../src/native/identity.js';
import { controlRecordKey, runGuard } from '../../src/native/orchestration/controller-common.js';
import { putMutable } from '../../src/native/repositories/common.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';

jest.setTimeout(60_000);
describe.each(CONTRACT_HARNESSES)('$name original RP bounded Planner replan', ({ make }) => {
    test.each([1, 2])('%s explicit replan traversals retain every charged Planner and finish one original Narrator output', async loops => {
        let narrator;
        const f = await rpModelFixture(make, { configurePlan: async (...args) => { narrator = await configurePlannerLoop(...args); },
            responsePayload: (_body, ordinal) => ordinal <= loops + 1 ? JSON.stringify({ operations: [{ op: 'setPendingPriority', nodeId: narrator.nodeId, priority: ordinal },
                { op: ordinal <= loops ? 'requestReplan' : 'requestFinalize' }] }) : 'Final bounded narration.' });
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(loops + 2);
            expect(root.progress).toMatchObject({ replans: loops, loopIterations: loops, patches: loops + 1, attempts: loops + 3 });
            const facts = await f.h.engine.withTransaction(f.h.handle, async tx => ({ planner: await readRpPlannerCompletion(tx, f.h.handle, root),
                output: await readRpOutput(tx, f.h.handle, root) }));
            expect(facts.planner.history).toHaveLength(loops + 1); expect(facts.output.closure.effectIds).toHaveLength(loops + 3);
            expect(facts.planner.history.map(item => item.producer.attemptNumber)).toEqual(Array.from({ length: loops + 1 }, (_, i) => i + 1));
            expect(JSON.stringify(f.requests[1])).toContain('bounded_replan'); expect(JSON.stringify(f.requests[1])).toContain('previousReceiptRef');
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(3);
        } finally { await f.cleanup(); }
    });

    test.each(['no-progress', 'loop-limit'])('%s preserves original Model costs and stops without dispatching Narrator', async problem => {
        let narrator;
        const f = await rpModelFixture(make, { configurePlan: async (...args) => { narrator = await configurePlannerLoop(...args, 1); },
            responsePayload: (_body, ordinal) => JSON.stringify({ operations: [{ op: 'setPendingPriority', nodeId: narrator.nodeId, priority: problem === 'no-progress' ? 1 : ordinal }, { op: 'requestReplan' }] }, null, ordinal === 2 ? 2 : 0) });
        try {
            await expect(f.run()).rejects.toThrow(problem === 'no-progress' ? 'native_orchestration_planner_no_progress' : 'native_orchestration_planner_patch_rejected');
            expect(f.requests).toHaveLength(2);
            const [row] = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            expect(row.doc.outputClaims).toEqual([]); expect(row.doc.progress.replans).toBe(1);
            const compute = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
            expect(compute.attempts).toHaveLength(2); expect(compute.attempts.every(row => row.status === 'settled')).toBe(true);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        } finally { await f.cleanup(); }
    });

    test('replan policy without an explicit graph return edge never implicitly repeats the Planner', async () => {
        const f = await rpModelFixture(make, { configurePlan: async (...args) => {
            await configurePlanner(...args); args[0].definition.graphChangePolicy.allowedOperations.push('requestReplan');
        }, responsePayload: () => JSON.stringify({ operations: [{ op: 'requestReplan' }] }) });
        try {
            await expect(f.run()).rejects.toThrow('native_orchestration_planner_replan_pending'); expect(f.requests).toHaveLength(1);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        } finally { await f.cleanup(); }
    });

    test('cold loop proofs retain all earlier Planner costs after Source deletion and reject rehashed first-round facts', async () => {
        const f = await rpModelFixture(make, { configurePlan: configurePlannerLoop,
            responsePayload: (_body, ordinal) => ordinal <= 2 ? JSON.stringify({ operations: [{ op: ordinal === 1 ? 'requestReplan' : 'requestFinalize' }] }) : 'Final narration.' });
        let cold;
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            const original = await f.h.engine.withTransaction(f.h.handle, tx => readRpPlannerCompletion(tx, f.h.handle, root));
            await f.chats.delete(f.h.handle, f.locator.charDir, f.locator.name); await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            expect((await cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).closure.effectIds).toHaveLength(4);
            const inventedCounter = structuredClone(root); inventedCounter.progress.loopIterations++;
            await expect(cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, inventedCounter))).rejects.toThrow('Invalid RP Planner completion facts');
            await cold.withTransaction(f.h.handle, async tx => {
                const receipt = original.history[0].receipt, key = controlRecordKey(f.h.handle, root.runId, 'receipt', receipt.receiptId), row = await tx.getResource(key);
                await putMutable(tx, key, { ...row.doc, payloadHash: '0'.repeat(64) }, { expectedIntegrity: row.integrity });
            });
            await expect(cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).rejects.toThrow('Invalid RP Planner completion facts');
            expect(f.requests).toHaveLength(3);
        } finally { await cold?.close(); await f.cleanup(); }
    });

    test.each(['binding', 'cancel'])('same-transaction %s during Planner settlement preserves the applied Patch and the withdrawal', async change => {
        const f = await rpModelFixture(make, { configurePlan: configurePlannerLoop, responsePayload: () => JSON.stringify({ operations: [{ op: 'requestReplan' }] }) });
        const inspect = ModelPort.prototype.inspectResultCompletion; let changed = false;
        const spy = jest.spyOn(ModelPort.prototype, 'inspectResultCompletion').mockImplementation(async function (handle, request) {
            const proof = await inspect.call(this, handle, request);
            if (!changed && f.h.engine.hasActiveTransaction(handle)) {
                const root = await f.authority.execution.runs.get(handle, request.runId);
                if (root.graphRevision === 1) {
                    changed = true;
                    if (change === 'binding') {
                        const binding = await f.plans.getBinding(handle, f.sourceSelector);
                        await f.plans.saveBinding(handle, createNativeId('orchestrationCommand'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
                    } else await f.authority.execution.runs.cancel(handle, createNativeId('orchestrationCommand'), { ...runGuard(root), reasonCode: 'controlled_user_cancel' });
                }
            }
            return proof;
        });
        try {
            await expect(f.run()).rejects.toThrow(); expect(changed).toBe(true); expect(f.requests).toHaveLength(1);
            expect((await f.plans.getBinding(f.h.handle, f.sourceSelector)).version).toBe(change === 'binding' ? 1 : 0);
            const [row] = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            expect(row.doc.cancelRequested).toBe(change === 'cancel'); expect(row.doc.graphRevision).toBe(1); expect(row.doc.outputClaims).toEqual([]);
            expect(row.doc.attemptRefs).toHaveLength(1);
        } finally { spy.mockRestore(); await f.cleanup(); }
    });

    test.each(['saved', 'no_save'])('second-round Patch ACK %s never repeats paid control work or dispatches Narrator', async ack => {
        const f = await rpModelFixture(make, { configurePlan: configurePlannerLoop, responsePayload: (_body, ordinal) => JSON.stringify({ operations: [{ op: ordinal === 1 ? 'requestReplan' : 'requestFinalize' }] }) });
        const transaction = f.h.engine.withTransaction.bind(f.h.engine); let injected = false;
        const match = value => f.requests.length === 2 && value?.outcome?.patchReceipt;
        f.h.engine.withTransaction = async (handle, callback, ...options) => {
            const outer = !f.h.engine.hasActiveTransaction(handle);
            const value = await transaction(handle, async tx => {
                const result = await callback(tx);
                if (outer && !injected && ack === 'no_save' && match(result)) { injected = true; throw new StorageCommitUnknownError({ operation: 'controlled-replan-patch' }); }
                return result;
            }, ...options);
            if (outer && !injected && ack === 'saved' && match(value)) { injected = true; throw new StorageCommitUnknownError({ operation: 'controlled-replan-patch' }); }
            return value;
        };
        try {
            await expect(f.run()).rejects.toThrow(); expect(injected).toBe(true); expect(f.requests).toHaveLength(2);
            const [row] = await transaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            expect(row.doc.graphRevision).toBe(ack === 'saved' ? 2 : 1); expect(row.doc.outputClaims).toEqual([]);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        } finally { f.h.engine.withTransaction = transaction; await f.cleanup(); }
    });

    test('unknown usage keeps all loop/domain facts without a completed output claim', async () => {
        const f = await rpModelFixture(make, { configurePlan: configurePlannerLoop, usage: false,
            responsePayload: (_body, ordinal) => ordinal <= 2 ? JSON.stringify({ operations: [{ op: ordinal === 1 ? 'requestReplan' : 'requestFinalize' }] }) : 'Final narration.' });
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('pending_output'); expect(root.outputClaims).toEqual([]); expect(root.progress.loopIterations).toBe(1);
            expect(f.requests).toHaveLength(3); expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(3);
        } finally { await f.cleanup(); }
    });

    test.each(['request-headroom', 'attempt-headroom'])('%s is checked in the original bank/Plan before another paid Planner', async problem => {
        let narrator;
        const f = await rpModelFixture(make, { configurePlan: async (...args) => {
            narrator = await configurePlannerLoop(...args, 3);
            if (problem === 'attempt-headroom') args[0].definition.limits.maxAttempts = 3;
        }, responsePayload: (_body, ordinal) => JSON.stringify({ operations: [{ op: 'setPendingPriority', nodeId: narrator.nodeId, priority: ordinal }, { op: 'requestReplan' }] }) });
        try {
            await expect(f.run()).rejects.toThrow(problem === 'request-headroom' ? 'native_orchestration_planner_replan_budget_unavailable' : 'native_orchestration_planner_replan_limit_exhausted');
            expect(f.requests).toHaveLength(problem === 'request-headroom' ? 3 : 1);
            const compute = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
            expect(compute.attempts).toHaveLength(f.requests.length); expect(compute.attempts.every(row => row.status === 'settled')).toBe(true);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        } finally { await f.cleanup(); }
    });
});
