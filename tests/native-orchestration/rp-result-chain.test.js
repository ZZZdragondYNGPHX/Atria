import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpModelFixture } from './helpers/rp-model-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
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
        const original = ResultPort.prototype.readForGraph; let checked = false; const denials = [];
        const spy = jest.spyOn(ResultPort.prototype, 'readForGraph').mockImplementation(async function (handle, request) {
            if (!checked) {
                checked = true;
                for (const forged of [{ ...request, capture: {} }, { ...request, capture: JSON.parse(JSON.stringify(request.capture)) },
                    { ...request, resultRef: { ...request.resultRef, resultId: id('Result') } }]) {
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
    test('unknown Model usage retains both actual Results and the committed domain output without a completed claim', async () => {
        const f = await rpModelFixture(make, { configurePlan: configureChain, usage: false });
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('pending_output'); expect(root.resultRefs).toHaveLength(2); expect(root.outputClaims).toEqual([]);
            expect(root.status).toBe('running'); expect(f.requests).toHaveLength(2);
            const bank = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
            expect(bank.attempts.map(row => row.status)).toEqual(['unknown', 'unknown']);
        } finally { await f.cleanup(); }
    });
});
