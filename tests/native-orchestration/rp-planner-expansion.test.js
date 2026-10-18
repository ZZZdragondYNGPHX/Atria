import { jest } from '@jest/globals';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpModelFixture } from './helpers/rp-model-fixture.js';
import { configurePlannerExpansion, plannerTaskFromRequest } from './helpers/rp-planner-fixture.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { createNativeId } from '../../src/native/identity.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { runGuard } from '../../src/native/orchestration/controller-common.js';
import { hashNativeDocument as hash, putMutable } from '../../src/native/repositories/common.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';

jest.setTimeout(60_000);
describe.each(CONTRACT_HARNESSES)('$name original RP controlled graph additions', ({ make }) => {
    test.each([false, true])('Host-provided Draft chosen=%s preserves sparse original execution and closes all actual paid Effects', async chosen => {
        let template;
        const f = await rpModelFixture(make, { configurePlan: configurePlannerExpansion, responsePayload: (body, ordinal) => {
            if (ordinal !== 1) return chosen && ordinal === 2 ? 'DYNAMIC_ADVISORY_PRIVATE' : 'Final optional narration.';
            const task = plannerTaskFromRequest(body); template = task.nodeTemplates[0];
            return JSON.stringify({ operations: [...(chosen ? [{ op: 'addNode', node: template.node }, ...template.edges.map(edge => ({ op: 'addEdge', edge }))] : []), { op: 'requestFinalize' }] });
        } });
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(chosen ? 3 : 2);
            expect(root.graph.nodes).toHaveLength(chosen ? 4 : 3); expect(root.graphRevision).toBe(1);
            expect(root.graph.nodes.some(node => node.nodeId === template.node.nodeId)).toBe(chosen);
            expect(root.resultRefs).toHaveLength(chosen ? 2 : 1); expect(root.progress.edgeVisits).toBe(chosen ? 4 : 2);
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.closure.effectIds).toHaveLength(chosen ? 4 : 3);
            expect(JSON.stringify(f.requests.at(-1)).includes('DYNAMIC_ADVISORY_PRIVATE')).toBe(chosen);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(3);
        } finally { await f.cleanup(); }
    });

    test.each(['node-id', 'model-pin', 'capabilities', 'edge-target', 'extra-field', 'incomplete-template'])('%s cannot turn advisory Model JSON into another grant or a partial graph', async problem => {
        const f = await rpModelFixture(make, { configurePlan: configurePlannerExpansion, responsePayload: body => {
            const task = plannerTaskFromRequest(body), template = structuredClone(task.nodeTemplates[0]);
            if (problem === 'node-id') template.node.nodeId = createNativeId('orchestrationNode');
            if (problem === 'model-pin') { template.node.dependencyPinIds = ['planner.route']; template.node.policy.agentPinId = 'planner.route'; }
            if (problem === 'capabilities') template.node.capabilities.push('graph.patch');
            if (problem === 'edge-target') template.edges[1].to = { nodeId: task.outputOwnerNodeId, port: 'response' };
            if (problem === 'extra-field') template.node.policy.approved = true;
            return JSON.stringify({ operations: [{ op: 'addNode', node: template.node },
                ...template.edges.slice(0, problem === 'incomplete-template' ? 1 : 2).map(edge => ({ op: 'addEdge', edge }))] });
        } });
        try {
            await expect(f.run()).rejects.toThrow('native_orchestration_planner_patch_rejected'); expect(f.requests).toHaveLength(1);
            const [row] = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            expect(row.doc.graphRevision).toBe(0); expect(row.doc.graph.nodes).toHaveLength(3); expect(row.doc.outputClaims).toEqual([]);
            const compute = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
            expect(compute.attempts).toHaveLength(1); expect(compute.attempts[0].status).toBe('settled');
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        } finally { await f.cleanup(); }
    });

    test.each([2, 3])('%s requested additions use only the remaining original Model capacity', async count => {
        const f = await rpModelFixture(make, { configurePlan: (...args) => configurePlannerExpansion(...args, { slots: count }), responsePayload: (body, ordinal) => {
            if (ordinal !== 1) return 'Dynamic advisory ' + ordinal;
            const task = plannerTaskFromRequest(body);
            return JSON.stringify({ operations: task.nodeTemplates.flatMap(template => [{ op: 'addNode', node: template.node }, ...template.edges.map(edge => ({ op: 'addEdge', edge }))]) });
        } });
        try {
            const result = await f.run().then(value => ({ value }), error => ({ error }));
            expect(result.error?.code ?? result.value.output.runStatus).toBe(count === 2 ? 'completed' : 'native_orchestration_planner_patch_rejected');
            expect(f.requests).toHaveLength(count === 2 ? 4 : 1);
            const [row] = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            expect(row.doc.graph.nodes).toHaveLength(count === 2 ? 5 : 3); expect(row.doc.outputClaims).toHaveLength(count === 2 ? 1 : 0);
        } finally { await f.cleanup(); }
    });

    test('a declared replan can select a fresh template in its second original Planner without granting an extra Route', async () => {
        const f = await rpModelFixture(make, { configurePlan: (...args) => configurePlannerExpansion(...args, { loop: true }), responsePayload: (body, ordinal) => {
            if (ordinal === 1) return JSON.stringify({ operations: [{ op: 'requestReplan' }] });
            if (ordinal !== 2) return 'Advisory ' + ordinal;
            const template = plannerTaskFromRequest(body).nodeTemplates[0];
            return JSON.stringify({ operations: [{ op: 'addNode', node: template.node }, ...template.edges.map(edge => ({ op: 'addEdge', edge })), { op: 'requestFinalize' }] });
        } });
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(4);
            expect(root.graph.nodes).toHaveLength(4); expect(root.graphRevision).toBe(2); expect(root.progress.loopIterations).toBe(1);
            expect((await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).closure.effectIds).toHaveLength(5);
        } finally { await f.cleanup(); }
    });

    test('cold expansion history survives Source deletion and rejects a rehashed allowed-template scope', async () => {
        const f = await rpModelFixture(make, { configurePlan: configurePlannerExpansion, responsePayload: (body, ordinal) => {
            if (ordinal !== 1) return 'Advisory ' + ordinal;
            const template = plannerTaskFromRequest(body).nodeTemplates[0];
            return JSON.stringify({ operations: [{ op: 'addNode', node: template.node }, ...template.edges.map(edge => ({ op: 'addEdge', edge }))] });
        } });
        let cold;
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            await f.chats.delete(f.h.handle, f.locator.charDir, f.locator.name); await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            expect((await cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).claim).toEqual(output.claim);
            await cold.withTransaction(f.h.handle, async tx => {
                const rows = await tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle, runId: root.runId, recordType: 'effect' });
                const row = rows.find(row => row.doc.inputRef.graphTemplates);
                const copy = structuredClone(row.doc); copy.inputRef.graphTemplates[0].node.policy.agentPinId = 'planner.route';
                copy.inputHash = hash(copy.inputRef);
                await putMutable(tx, row.key, copy, { expectedIntegrity: row.integrity });
            });
            await expect(cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).rejects.toThrow();
            expect(f.requests).toHaveLength(3);
        } finally { await cold?.close(); await f.cleanup(); }
    });

    test.each(['binding', 'cancel'])('%s during a dynamically admitted Draft preserves paid control and stops Narrator dispatch', async change => {
        const f = await rpModelFixture(make, { configurePlan: configurePlannerExpansion, responsePayload: (body, ordinal) => {
            if (ordinal !== 1) return 'Advisory ' + ordinal;
            const template = plannerTaskFromRequest(body).nodeTemplates[0];
            return JSON.stringify({ operations: [{ op: 'addNode', node: template.node }, ...template.edges.map(edge => ({ op: 'addEdge', edge }))] });
        } });
        f.onResponse(async () => {
            if (f.requests.length !== 2) return;
            if (change === 'binding') {
                const binding = await f.plans.getBinding(f.h.handle, f.sourceSelector);
                await f.plans.saveBinding(f.h.handle, createNativeId('orchestrationCommand'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
            } else {
                const [row] = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
                await f.authority.execution.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), { ...runGuard(row.doc), reasonCode: 'controlled_user_cancel' });
            }
        });
        try {
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(2);
            const [row] = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            expect(row.doc.graphRevision).toBe(1); expect(row.doc.graph.nodes).toHaveLength(4); expect(row.doc.resultRefs).toEqual([]);
            expect(row.doc.outputClaims).toEqual([]); expect(row.doc.cancelRequested).toBe(change === 'cancel');
            const compute = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
            expect(compute.attempts).toHaveLength(2); expect(compute.attempts.every(row => row.status === 'settled')).toBe(true);
        } finally { await f.cleanup(); }
    });

    test.each(['saved', 'no_save'])('dynamic graph Patch ACK %s never resends Planner or starts an uncertain Draft', async ack => {
        const f = await rpModelFixture(make, { configurePlan: configurePlannerExpansion, responsePayload: body => {
            const template = plannerTaskFromRequest(body).nodeTemplates[0];
            return JSON.stringify({ operations: [{ op: 'addNode', node: template.node }, ...template.edges.map(edge => ({ op: 'addEdge', edge }))] });
        } });
        const transaction = f.h.engine.withTransaction.bind(f.h.engine); let injected = false;
        f.h.engine.withTransaction = async (handle, callback, ...options) => {
            const outer = !f.h.engine.hasActiveTransaction(handle);
            const value = await transaction(handle, async tx => {
                const result = await callback(tx);
                if (outer && !injected && ack === 'no_save' && result?.outcome?.patchReceipt) { injected = true; throw new StorageCommitUnknownError({ operation: 'controlled-expansion-patch' }); }
                return result;
            }, ...options);
            if (outer && !injected && ack === 'saved' && value?.outcome?.patchReceipt) { injected = true; throw new StorageCommitUnknownError({ operation: 'controlled-expansion-patch' }); }
            return value;
        };
        try {
            await expect(f.run()).rejects.toThrow(); expect(injected).toBe(true); expect(f.requests).toHaveLength(1);
            const [row] = await transaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            expect(row.doc.graph.nodes).toHaveLength(ack === 'saved' ? 4 : 3); expect(row.doc.outputClaims).toEqual([]);
        } finally { f.h.engine.withTransaction = transaction; await f.cleanup(); }
    });
    test('unknown usage retains the actual added graph and legal Chat output with a completed output and estimated charges', async () => {
        const f = await rpModelFixture(make, { configurePlan: configurePlannerExpansion, usage: false, responsePayload: (body, ordinal) => {
            if (ordinal !== 1) return 'Advisory ' + ordinal;
            const template = plannerTaskFromRequest(body).nodeTemplates[0];
            return JSON.stringify({ operations: [{ op: 'addNode', node: template.node }, ...template.edges.map(edge => ({ op: 'addEdge', edge }))] });
        } });
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('completed'); expect(root.outputClaims).toEqual([result.output.outputClaimRef]); expect(root.graph.nodes).toHaveLength(4);
            expect(root.resultRefs).toHaveLength(2); expect(f.requests).toHaveLength(3);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(3);
        } finally { await f.cleanup(); }
    });
});
