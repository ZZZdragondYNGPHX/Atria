import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpModelFixture } from './helpers/rp-model-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash, putMutable } from '../../src/native/repositories/common.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { readGraphNodeResult } from '../../src/native/orchestration/graph-result-contracts.js';
import { jest } from '@jest/globals';
import { ResultPort } from '../../src/native/orchestration/result-port.js';
import { ResultController } from '../../src/native/orchestration/result-controller.js';
import { ModelPort } from '../../src/native/orchestration/model-port.js';
import { NativeNarratorOrchestrationAuthority } from '../../src/native/orchestration/native-turn-orchestration.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { runGuard } from '../../src/native/orchestration/controller-common.js';

const id = kind => createNativeId('orchestration' + kind);
async function configureLongChain(plan, args, draftCount) {
    await configureChain(plan, args);
    const narrator = plan.definition.nodes[1]; let previous = plan.definition.nodes[0];
    for (let index = 1; index < draftCount; index++) {
        const route = { ...args.route, runtimeRouteId: createNativeId('runtimeRoute'), displayName: 'Graph step ' + index };
        await args.seeded.persistence.saveRuntimeRoute(args.h.handle, route);
        const persisted = await args.seeded.persistence.getRuntimeRoute(args.h.handle, route.runtimeRouteId), pinId = 'step' + index + '.route';
        plan.dependencyPins.push({ pinId, port: 'model', resourceRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId }, integrity: hash(persisted) });
        const node = { ...previous, nodeId: id('Node'), label: 'Graph step ' + index, inputs: [{ name: 'draft', type: 'text', required: true }],
            dependencyPinIds: [pinId], policy: { agentPinId: pinId } };
        const transfer = plan.definition.edges.find(edge => edge.from.nodeId === previous.nodeId && edge.to.nodeId === narrator.nodeId);
        transfer.to = { nodeId: node.nodeId, port: 'draft' };
        plan.definition.edges.push({ ...transfer, edgeId: id('Edge'), from: { nodeId: node.nodeId, port: 'draft' }, to: { nodeId: narrator.nodeId, port: 'draft' } });
        plan.definition.nodes.splice(plan.definition.nodes.indexOf(narrator), 0, node); previous = node;
    }
}
async function configureChain(plan, { h, seeded, route }) {
    const narrator = plan.definition.nodes[0], output = plan.definition.nodes[1], draftId = id('Node');
    const draftRoute = { ...route, runtimeRouteId: createNativeId('runtimeRoute'), displayName: 'Explicit graph draft Route' };
    await seeded.persistence.saveRuntimeRoute(h.handle, draftRoute);
    const persisted = await seeded.persistence.getRuntimeRoute(h.handle, draftRoute.runtimeRouteId);
    plan.dependencyPins.push({ pinId: 'draft.route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: persisted.runtimeRouteId }, integrity: hash(persisted) });
    const draft = { nodeId: draftId, kind: 'agent', label: 'Advisory draft', inputs: [], outputs: [{ name: 'draft', type: 'text', required: false }],
        dependencyPinIds: ['draft.route'], capabilities: ['generation.send'], policy: { agentPinId: 'draft.route' } };
    narrator.inputs = [{ name: 'draft', type: 'text', required: true }]; output.capabilities = ['chat.output'];
    plan.definition.nodes.unshift(draft); plan.definition.entryNodeIds = [draftId]; plan.definition.capabilityCeiling = ['generation.send', 'chat.output'];
    plan.definition.edges.unshift({ edgeId: id('Edge'), from: { nodeId: draftId, port: 'draft' }, to: { nodeId: narrator.nodeId, port: 'draft' }, condition: 'always', maxVisits: 1, loopBack: false });
    Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 65536 } });
}

describe.each(CONTRACT_HARNESSES)('$name real RP graph Result chain', ({ make }) => {
    test('a declared chain exceeding the original request budget is rejected before any Model admission', async () => {
        const f = await rpModelFixture(make, { configurePlan: (...args) => configureLongChain(...args, 4) });
        try {
            await expect(f.run()).rejects.toThrow('native_orchestration_graph_budget_unavailable');
            expect(f.requests).toEqual([]); expect(f.effects).toEqual([]);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        } finally { await f.cleanup(); }
    });
    test.each([2, 3])('%s Draft nodes pass only their own direct Result to the next original Model and close every paid Effect', async draftCount => {
        const f = await rpModelFixture(make, { configurePlan: (...args) => configureLongChain(...args, draftCount),
            responsePayload: (_body, ordinal) => ordinal <= draftCount ? 'STAGE_' + ordinal + '_PRIVATE' : 'Final multi-step narration.' });
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests.length).toBe(draftCount + 1);
            for (const [index, request] of f.requests.entries()) {
                const text = JSON.stringify(request);
                for (let stage = 1; stage <= draftCount; stage++) {
                    expect(text.includes('STAGE_' + stage + '_PRIVATE')).toBe(stage === index);
                }
            }
            expect(root.resultRefs).toHaveLength(draftCount + 1); expect(root.attemptRefs).toHaveLength(draftCount + 2);
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.published.graphResults).toHaveLength(draftCount); expect(output.closure.effectIds).toHaveLength(draftCount + 2);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(3);
        } finally { await f.cleanup(); }
    });
    test.each(['binding', 'cancel'])('withdrawing %s during an intermediate Model preserves earlier Result/cost facts and stops the rest of the chain', async change => {
        const f = await rpModelFixture(make, { configurePlan: (...args) => configureLongChain(...args, 2), responsePayload: (_body, ordinal) => 'STAGE_' + ordinal });
        f.onResponse(async () => {
            if (f.requests.length !== 2) return;
            if (change === 'binding') {
                const binding = await f.plans.getBinding(f.h.handle, f.sourceSelector);
                await f.plans.saveBinding(f.h.handle, id('Command'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
            } else {
                const [row] = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
                await f.authority.execution.runs.cancel(f.h.handle, id('Command'), { ...runGuard(row.doc), reasonCode: 'controlled_user_cancel' });
            }
        });
        try {
            await expect(f.run()).rejects.toThrow(); expect(f.requests.length).toBe(2);
            const [row] = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            expect(row.doc.resultRefs).toHaveLength(1); expect(row.doc.outputClaims).toEqual([]); expect(row.doc.cancelRequested).toBe(change === 'cancel');
            const compute = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
            expect(compute.attempts).toHaveLength(2); expect(compute.attempts.every(row => row.status === 'settled')).toBe(true);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        } finally { await f.cleanup(); }
    });
    test('cold history retains a completed multi-step chain after Source deletion and rejects a rehashed earlier traversal', async () => {
        const f = await rpModelFixture(make, { configurePlan: (...args) => configureLongChain(...args, 2), responsePayload: (_body, ordinal) => 'STAGE_' + ordinal });
        let cold;
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            await f.chats.delete(f.h.handle, f.locator.charDir, f.locator.name); await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            expect((await cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).claim).toEqual(output.claim);
            await cold.withTransaction(f.h.handle, async tx => {
                const rows = await tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle, runId: root.runId, recordType: 'receipt' });
                const row = rows.find(row => row.doc.receiptKind === 'graph_transition' && row.doc.nodeAttemptId === root.attemptRefs[1]);
                await putMutable(tx, row.key, { ...row.doc, inputDigest: '0'.repeat(64) }, { expectedIntegrity: row.integrity });
            });
            await expect(cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).rejects.toThrow('Invalid original output graph traversal');
            expect(f.requests.length).toBe(3);
        } finally { await cold?.close(); await f.cleanup(); }
    });
    test('unknown usage across the chain keeps the legal Chat output while provider usage remains unknown', async () => {
        const f = await rpModelFixture(make, { configurePlan: (...args) => configureLongChain(...args, 2), usage: false });
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('completed'); expect(root.outputClaims).toEqual([result.output.outputClaimRef]); expect(f.requests.length).toBe(3);
            expect(root.resultRefs).toHaveLength(3); expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(3);
        } finally { await f.cleanup(); }
    });
    test('original draft becomes an exact successor Result; Narrator consumes it as untrusted input and closes one Chat output', async () => {
        const f = await rpModelFixture(make, { configurePlan: configureChain,
            responsePayload: (_body, ordinal) => ordinal === 1 ? 'GRAPH_DRAFT_UNTRUSTED_BODY' : 'Final narrator after original Result.' });
        let cold;
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(f.requests).toHaveLength(2); expect(result.output.runStatus).toBe('completed');
            expect(JSON.stringify(f.requests[0])).not.toContain('GRAPH_DRAFT_UNTRUSTED_BODY');
            expect(JSON.stringify(f.requests[1])).toContain('GRAPH_DRAFT_UNTRUSTED_BODY');
            expect(JSON.stringify(f.requests[1])).toContain('untrusted data');
            expect(root.resultRefs).toHaveLength(2); expect(root).toMatchObject({ status: 'completed', graphRevision: 0, progress: { attempts: 3, edgeVisits: 2 } });
            const saved = await f.h.engine.withTransaction(f.h.handle, async tx => ({ result: await readGraphNodeResult(tx, f.h.handle, root, root.resultRefs[0].resultId), output: await readRpOutput(tx, f.h.handle, root) }));
            expect(saved.result.record.payload).toBe('GRAPH_DRAFT_UNTRUSTED_BODY'); expect(saved.output.closure.effectIds).toHaveLength(3);
            const chat = await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name);
            expect(chat.body).toHaveLength(3); expect(chat.body.at(-1).mes).toBe('Final narrator after original Result.');
            chat.body[1].mes = 'Later legitimate original Source edit'; await f.chats.save(f.h.handle, f.locator.charDir, f.locator.name, chat.header, chat.body, chat.integrity);
            await f.chats.delete(f.h.handle, f.locator.charDir, f.locator.name); await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            const observed = await cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(observed.claim).toEqual(saved.output.claim); expect(f.requests).toHaveLength(2);
        } finally { await cold?.close(); await f.cleanup(); }
    });
    test('plain/JSON capture and a foreign ResultRef cannot disclose the draft or cause another send', async () => {
        const f = await rpModelFixture(make, { configurePlan: configureChain });
        const original = ResultPort.prototype.readForGraphResults; let checked = false; const denials = [];
        const spy = jest.spyOn(ResultPort.prototype, 'readForGraphResults').mockImplementation(async function (handle, request) {
            if (!checked) {
                checked = true;
                for (const forged of [{ ...request, capture: {} }, { ...request, capture: JSON.parse(JSON.stringify(request.capture)) },
                    { ...request, resultRefs: [{ ...request.resultRefs[0], resultId: id('Result') }] }]) {
                    denials.push(await original.call(this, handle, forged).then(() => 'accepted', error => error.code));
                }
            }
            return original.call(this, handle, request);
        });
        try { const result = await f.run(); expect(checked).toBe(true); expect(denials).toEqual(['native_orchestration_rp_producer_denied', 'native_orchestration_rp_producer_denied', 'native_orchestration_consumption_stale']); expect(f.requests).toHaveLength(2); expect(result.output.runStatus).toBe('completed'); }
        finally { spy.mockRestore(); await f.cleanup(); }
    });
    test('copied Model completion and an invented producer capture cannot publish protected Graph Results', async () => {
        const f = await rpModelFixture(make, { configurePlan: configureChain });
        const port = new ModelPort({ host: f.host, ...f.authority.execution }), original = port.generate.bind(port); let checked = false; const observations = [];
        port.generate = async (...args) => {
            const result = await original(...args);
            if (!checked) {
                checked = true;
                const { runId, effectId } = f.effects[0], controller = new ResultController({ host: f.host, modelPort: port });
                for (const value of [JSON.parse(JSON.stringify(result)), result]) observations.push(await controller.publishGraphModelResult(f.h.handle, { capture: {}, runId, effectId, result: value }).then(() => 'accepted', error => error.code));
                observations.push((await f.authority.execution.runs.get(f.h.handle, runId)).resultRefs);
            }
            return result;
        };
        f.authority.setModelPort(port);
        try { const result = await f.run(); expect(checked).toBe(true); expect(observations).toEqual(['native_orchestration_model_result_completion_required', 'native_orchestration_rp_producer_denied', []]); expect(f.requests).toHaveLength(2); expect(result.output.runStatus).toBe('completed'); }
        finally { await f.cleanup(); }
    });
    test.each(['publish', 'consume'])('a legitimate same-transaction Binding withdrawal during %s survives denial and prevents Narrator send', async phase => {
        const f = await rpModelFixture(make, { configurePlan: configureChain });
        const original = NativeNarratorOrchestrationAuthority.prototype.authorizeGraphResult; let changed = false;
        const spy = jest.spyOn(NativeNarratorOrchestrationAuthority.prototype, 'authorizeGraphResult').mockImplementation(async function (args) {
            const result = await original.call(this, args);
            if (args.phase === phase && !changed) {
                changed = true;
                const binding = await f.plans.getBinding(f.h.handle, f.sourceSelector);
                await f.plans.saveBinding(f.h.handle, id('Command'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
            }
            return result;
        });
        try {
            await expect(f.run()).rejects.toThrow(); expect(changed).toBe(true); expect(f.requests).toHaveLength(1);
            expect((await f.plans.getBinding(f.h.handle, f.sourceSelector)).version).toBe(1);
            const roots = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            expect(roots[0].doc.resultRefs).toHaveLength(phase === 'publish' ? 0 : 1); expect(roots[0].doc.outputClaims).toEqual([]);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        } finally { spy.mockRestore(); await f.cleanup(); }
    });
    test.each(['saved', 'no_save'])('Result publication ACK %s only observes durable facts and never repeats the draft Model', async ack => {
        const f = await rpModelFixture(make, { configurePlan: configureChain }), transaction = f.h.engine.withTransaction.bind(f.h.engine); let injected = false;
        const match = result => result?.outcome?.status === 'published' && result.outcome.publicationReceiptRef;
        f.h.engine.withTransaction = async (handle, callback, ...options) => {
            const outer = !f.h.engine.hasActiveTransaction(handle);
            const value = await transaction(handle, async tx => {
                const result = await callback(tx);
                if (outer && !injected && ack === 'no_save' && match(result)) { injected = true; throw new StorageCommitUnknownError({ operation: 'controlled-graph-result' }); }
                return result;
            }, ...options);
            if (outer && !injected && ack === 'saved' && match(value)) { injected = true; throw new StorageCommitUnknownError({ operation: 'controlled-graph-result' }); }
            return value;
        };
        try {
            const result = await f.run().then(value => ({ value }), error => ({ code: error.code }));
            expect(injected).toBe(true);
            expect(result.code ?? result.value.output.runStatus).toBe(ack === 'saved' ? 'completed' : 'storage_commit_unknown');
            expect(f.requests).toHaveLength(ack === 'saved' ? 2 : 1);
            const roots = await transaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            expect(roots[0].doc.outputClaims).toHaveLength(ack === 'saved' ? 1 : 0);
            expect(roots[0].doc.resultRefs).toHaveLength(ack === 'saved' ? 2 : 0);
        } finally { f.h.engine.withTransaction = transaction; await f.cleanup(); }
    });
    test.each(['publish', 'consume'])('same-transaction Root cancellation during %s remains durable and rejects late Result advancement', async phase => {
        const f = await rpModelFixture(make, { configurePlan: configureChain });
        const original = NativeNarratorOrchestrationAuthority.prototype.authorizeGraphResult; let cancelled = false;
        const spy = jest.spyOn(NativeNarratorOrchestrationAuthority.prototype, 'authorizeGraphResult').mockImplementation(async function (args) {
            const result = await original.call(this, args);
            if (args.phase === phase && !cancelled) {
                cancelled = true;
                await f.authority.execution.runs.cancel(f.h.handle, id('Command'), { ...runGuard(args.root), reasonCode: 'controlled_user_cancel' });
            }
            return result;
        });
        try {
            await expect(f.run()).rejects.toThrow(); expect(cancelled).toBe(true); expect(f.requests).toHaveLength(1);
            const roots = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            expect(roots[0].doc).toMatchObject({ cancelRequested: true, epoch: 1, outputClaims: [] });
            expect(roots[0].doc.resultRefs).toHaveLength(phase === 'publish' ? 0 : 1);
        } finally { spy.mockRestore(); await f.cleanup(); }
    });
    test('unknown Model usage retains both actual Results and the committed domain output with a completed output and estimated charges', async () => {
        const f = await rpModelFixture(make, { configurePlan: configureChain, usage: false });
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('completed'); expect(root.resultRefs).toHaveLength(2); expect(root.outputClaims).toEqual([result.output.outputClaimRef]);
            expect(root.status).toBe('completed'); expect(f.requests).toHaveLength(2);
            const bank = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
            expect(bank.attempts.map(row => row.status)).toEqual(['unknown', 'unknown']);
        } finally { await f.cleanup(); }
    });
});
