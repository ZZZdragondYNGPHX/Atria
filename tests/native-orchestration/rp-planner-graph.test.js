import { jest } from '@jest/globals';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpModelFixture } from './helpers/rp-model-fixture.js';
import { configurePlannerGraph } from './helpers/rp-planner-fixture.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { controlRecordKey, runGuard } from '../../src/native/orchestration/controller-common.js';
import { putMutable } from '../../src/native/repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { createNativeId } from '../../src/native/identity.js';

jest.setTimeout(60_000);
describe.each(CONTRACT_HARNESSES)('$name original RP Planner and Agent graph', ({ make }) => {
    test.each([false, true])('Planner loop=%s completes all original control, direct Results and one Narrator/Chat cost closure', async loop => {
        const plannerCalls = loop ? 2 : 1;
        const f = await rpModelFixture(make, { configurePlan: (...args) => configurePlannerGraph(...args, { loop }),
            responsePayload: (_body, ordinal) => ordinal <= plannerCalls ? JSON.stringify({ operations: [{ op: ordinal < plannerCalls ? 'requestReplan' : 'requestFinalize' }] })
                : ordinal <= plannerCalls + 2 ? 'AFTER_PLAN_DRAFT_' + (ordinal - plannerCalls) : 'Final planned narration.' });
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(plannerCalls + 3);
            expect(root.graphRevision).toBe(plannerCalls); expect(root.progress.loopIterations).toBe(loop ? 1 : 0);
            expect(root.resultRefs).toHaveLength(3);
            expect(JSON.stringify(f.requests[plannerCalls + 1])).not.toContain('AFTER_PLAN_DRAFT_1');
            expect(JSON.stringify(f.requests[plannerCalls + 2])).toContain('AFTER_PLAN_DRAFT_1');
            expect(JSON.stringify(f.requests[plannerCalls + 2])).toContain('AFTER_PLAN_DRAFT_2');
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.published.graphResults.map(item => item.receipt.graphRevision)).toEqual([plannerCalls, plannerCalls]);
            expect(output.closure.effectIds).toHaveLength(plannerCalls + 4);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(3);
        } finally { await f.cleanup(); }
    });
    test('cold planned graph retains its publication revision and rejects coordinated receipt/producer/effect rehashes', async () => {
        const f = await rpModelFixture(make, { configurePlan: configurePlannerGraph,
            responsePayload: (_body, ordinal) => ordinal === 1 ? JSON.stringify({ operations: [{ op: 'requestFinalize' }] }) : 'Advisory ' + ordinal });
        let cold;
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            await f.chats.delete(f.h.handle, f.locator.charDir, f.locator.name); await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            expect((await cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).claim).toEqual(output.claim);
            const graph = output.published.graphResults[0];
            await cold.withTransaction(f.h.handle, async tx => {
                for (const [kind, id] of [['receipt', graph.receipt.receiptId], ['attempt', graph.producer.attemptId], ['receipt', graph.settlement.receiptId], ['effect', graph.receipt.modelEffectId]]) {
                    const key = controlRecordKey(f.h.handle, root.runId, kind, id), row = await tx.getResource(key);
                    await putMutable(tx, key, { ...row.doc, graphRevision: 0 }, { expectedIntegrity: row.integrity });
                }
            });
            await expect(cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).rejects.toThrow('Invalid Graph Result facts');
            expect(f.requests).toHaveLength(4);
        } finally { await cold?.close(); await f.cleanup(); }
    });

    test.each(['binding', 'cancel'])('%s during a post-Planner draft retains control and earlier Result fees without Narrator output', async change => {
        const f = await rpModelFixture(make, { configurePlan: configurePlannerGraph,
            responsePayload: (_body, ordinal) => ordinal === 1 ? JSON.stringify({ operations: [{ op: 'requestFinalize' }] }) : 'Advisory ' + ordinal });
        f.onResponse(async () => {
            if (f.requests.length !== 3) return;
            if (change === 'binding') {
                const binding = await f.plans.getBinding(f.h.handle, f.sourceSelector);
                await f.plans.saveBinding(f.h.handle, createNativeId('orchestrationCommand'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
            } else {
                const [row] = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
                await f.authority.execution.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), { ...runGuard(row.doc), reasonCode: 'controlled_user_cancel' });
            }
        });
        try {
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(3);
            const [row] = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            expect(row.doc.graphRevision).toBe(1); expect(row.doc.resultRefs).toHaveLength(1); expect(row.doc.outputClaims).toEqual([]);
            expect(row.doc.cancelRequested).toBe(change === 'cancel');
            const compute = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
            expect(compute.attempts).toHaveLength(3); expect(compute.attempts.every(row => row.status === 'settled')).toBe(true);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        } finally { await f.cleanup(); }
    });

    test('unknown usage preserves planned graph Results and the legal Chat output without a completed claim', async () => {
        const f = await rpModelFixture(make, { configurePlan: configurePlannerGraph, usage: false,
            responsePayload: (_body, ordinal) => ordinal === 1 ? JSON.stringify({ operations: [{ op: 'requestFinalize' }] }) : 'Advisory ' + ordinal });
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('pending_output'); expect(root.outputClaims).toEqual([]); expect(root.resultRefs).toHaveLength(3);
            expect(f.requests).toHaveLength(4); expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(3);
        } finally { await f.cleanup(); }
    });
    test('original pending priorities choose the ready Draft order and the historical proof derives the same order', async () => {
        let nodes;
        const f = await rpModelFixture(make, { configurePlan: async (...args) => { nodes = await configurePlannerGraph(...args); },
            responsePayload: (_body, ordinal) => ordinal === 1 ? JSON.stringify({ operations: [{ op: 'setPendingPriority', nodeId: nodes.drafts[1].nodeId, priority: 2 }] }) : 'Advisory ' + ordinal });
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(4);
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.published.graphResults.map(item => item.producer.nodeId)).toEqual([nodes.drafts[1].nodeId, nodes.drafts[0].nodeId]);
            expect(root.nodeControl[nodes.drafts[1].nodeId].priority).toBe(2);
        } finally { await f.cleanup(); }
    });

    test.each(['draft', 'narrator'])('a Planner-blocked required %s stops before another Model instead of paying for a known unavailable output', async target => {
        let nodes;
        const f = await rpModelFixture(make, { configurePlan: async (...args) => { nodes = await configurePlannerGraph(...args); },
            responsePayload: () => JSON.stringify({ operations: [{ op: 'markBlocked', nodeId: target === 'draft' ? nodes.drafts[0].nodeId : nodes.narrator.nodeId }] }) });
        try {
            await expect(f.run()).rejects.toThrow('native_orchestration_graph_dependency_unavailable'); expect(f.requests).toHaveLength(1);
            const [row] = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            expect(row.doc.graphRevision).toBe(1); expect(row.doc.resultRefs).toEqual([]); expect(row.doc.outputClaims).toEqual([]);
            expect(row.doc.status).toBe('blocked'); expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        } finally { await f.cleanup(); }
    });
});
