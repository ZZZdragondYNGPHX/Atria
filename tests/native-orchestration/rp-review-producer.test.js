import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpModelFixture } from './helpers/rp-model-fixture.js';
import { configureReview } from './helpers/rp-review-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash, putMutable } from '../../src/native/repositories/common.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { readRpReviewCompletion } from '../../src/native/orchestration/rp-review-contracts.js';
import { readAttempt, readAttemptInvalidation, runGuard, controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { jest } from '@jest/globals';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { ModelPort } from '../../src/native/orchestration/model-port.js';
import { reviewReceiptId } from '../../src/native/orchestration/review-controller.js';
import { BudgetPort } from '../../src/native/orchestration/budget-port.js';
import { NativeRpOrchestrationAuthority } from '../../src/native/orchestration/native-rp-generation.js';

jest.setTimeout(60_000);

const id = kind => createNativeId('orchestration' + kind);
const approve = JSON.stringify({ decision: 'approve', reasonCode: 'quality_ready' });
const rerun = JSON.stringify({ decision: 'rerun', reasonCode: 'unclear_motivation' });

describe.each(CONTRACT_HARNESSES)('$name actual RP Model Review', ({ make }) => {
    test('one exact Model review approves quality, then original Narrator and Chat close all original costs', async () => {
        const f = await rpModelFixture(make, { configurePlan: configureReview, responsePayload: (_body, ordinal) => ['DRAFT_A', approve, 'Final narration after quality Review.'][ordinal - 1] });
        let cold;
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(3);
            expect(root).toMatchObject({ status: 'completed', progress: { reviews: 1, attempts: 4, edgeVisits: 4 }, treeProgress: { reviews: 1 } });
            expect(root.pendingApprovalRefs).toEqual([]);
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.closure.effectIds).toHaveLength(4); expect(output.published.reviewCompletions).toHaveLength(1);
            expect(output.published.reviewCompletions[0].review.decision).toBe('approve');
            expect(JSON.stringify(f.requests[1])).toContain('DRAFT_A'); expect(JSON.stringify(f.requests[1])).toContain('native_rp_graph_review');
            const chat = await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name); chat.body[1].mes = 'Later authorized edit';
            await f.chats.save(f.h.handle, f.locator.charDir, f.locator.name, chat.header, chat.body, chat.integrity);
            await f.chats.delete(f.h.handle, f.locator.charDir, f.locator.name); await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            expect((await cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).claim).toEqual(output.claim);
            const link = output.published.reviewCompletions[0].receipt;
            await cold.withTransaction(f.h.handle, async tx => {
                const key = controlRecordKey(f.h.handle, root.runId, 'receipt', link.receiptId), row = await tx.getResource(key);
                await putMutable(tx, key, { ...row.doc, responseText: rerun }, { expectedIntegrity: row.integrity });
            });
            await expect(cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).rejects.toThrow('Invalid RP Review completion facts');
            expect(f.requests).toHaveLength(3);
        } finally { await cold?.close(); await f.cleanup(); }
    });
    test('rerun creates a fresh charged Draft/Review, invalidates old output and shares only bounded feedback with the new Draft', async () => {
        const f = await rpModelFixture(make, { configurePlan: configureReview, responsePayload: (_body, ordinal) => ['DRAFT_A', rerun, 'DRAFT_B', approve, 'Final narration from DRAFT_B.'][ordinal - 1] });
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(5);
            expect(root).toMatchObject({ status: 'completed', progress: { reviews: 2, attempts: 6, edgeVisits: 5 }, treeProgress: { reviews: 2 } });
            expect(root.resultRefs).toHaveLength(3);
            expect(JSON.stringify(f.requests[2])).toContain('unclear_motivation'); expect(JSON.stringify(f.requests[2])).not.toContain('DRAFT_A');
            expect(JSON.stringify(f.requests[4])).toContain('DRAFT_B'); expect(JSON.stringify(f.requests[4])).not.toContain('DRAFT_A');
            const facts = await f.h.engine.withTransaction(f.h.handle, async tx => {
                const output = await readRpOutput(tx, f.h.handle, root), old = (await readAttempt(tx, f.h.handle, root, root.attemptRefs[0])).doc;
                return { output, invalidated: await readAttemptInvalidation(tx, f.h.handle, root, old), review: await readRpReviewCompletion(tx, f.h.handle, root, root.attemptRefs[3]) };
            });
            expect(facts.output.closure.effectIds).toHaveLength(6); expect(facts.output.published.reviewCompletions).toHaveLength(2);
            expect(facts.invalidated).toBeTruthy(); expect(facts.review.review.decision).toBe('approve');
        } finally { await f.cleanup(); }
    });
    test.each(['malformed', 'extra-approval', 'arbitrary-feedback', 'contradictory-label', 'round-limit', 'request-headroom', 'no-progress', 'repeated-rerun'])('%s blocks without laundering feedback, resetting counters or claiming output', async problem => {
        const f = await rpModelFixture(make, { configurePlan: async (plan, args) => {
            await configureReview(plan, args);
            if (problem === 'round-limit') plan.definition.nodes.find(node => node.kind === 'review').policy.maxRounds = 1;
            if (problem === 'request-headroom') for (const pin of plan.dependencyPins) {
                const route = await args.seeded.persistence.getRuntimeRoute(args.h.handle, pin.resourceRef.runtimeRouteId);
                await args.seeded.persistence.saveRuntimeRoute(args.h.handle, { ...route, executionPolicy: { ...route.executionPolicy, computeBudget: { ...route.executionPolicy.computeBudget, maxRequests: 4 } } });
                pin.integrity = hash(await args.seeded.persistence.getRuntimeRoute(args.h.handle, route.runtimeRouteId));
            }
        }, responsePayload: (_body, ordinal) => {
            if (ordinal === 1) return 'DRAFT_A';
            if (ordinal === 3) return problem === 'no-progress' ? 'DRAFT_A' : 'DRAFT_B';
            if (problem === 'malformed') return 'not JSON';
            if (problem === 'extra-approval') return JSON.stringify({ decision: 'approve', reasonCode: 'quality_ready', approved: true });
            if (problem === 'arbitrary-feedback') return JSON.stringify({ decision: 'rerun', reasonCode: 'PRIVATE_BODY_MARKER' });
            if (problem === 'contradictory-label') return JSON.stringify({ decision: 'approve', reasonCode: 'unclear_motivation' });
            return rerun;
        } });
        try {
            await expect(f.run()).rejects.toThrow();
            const count = problem === 'no-progress' ? 3 : problem === 'repeated-rerun' ? 4 : 2;
            expect(f.requests).toHaveLength(count);
            const [stored] = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            expect(stored.doc.status).toBe('blocked'); expect(stored.doc.outputClaims).toEqual([]);
            expect(stored.doc.progress.reviews).toBe(problem === 'repeated-rerun' ? 2 : 1);
            const bank = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
            expect(bank.attempts).toHaveLength(count); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        } finally { await f.cleanup(); }
    });
    test.each(['binding', 'cancel'])('%s while the real Review response is pending prevents late quality adoption and Narrator dispatch', async change => {
        const f = await rpModelFixture(make, { configurePlan: configureReview, responsePayload: (_body, ordinal) => ordinal === 1 ? 'DRAFT_A' : approve });
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
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(2);
            const [row] = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            expect(row.doc.outputClaims).toEqual([]); expect(row.doc.progress.reviews).toBe(1);
            expect(row.doc.cancelRequested).toBe(change === 'cancel');
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        } finally { await f.cleanup(); }
    });
    test('unknown actual Model usage preserves legal quality/domain facts but completes delivered output with estimated charges', async () => {
        const f = await rpModelFixture(make, { configurePlan: configureReview, usage: false, responsePayload: (_body, ordinal) => ['DRAFT_A', approve, 'Final narration.'][ordinal - 1] });
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('completed'); expect(root.outputClaims).toEqual([result.output.outputClaimRef]); expect(root.status).toBe('completed');
            expect(root.progress.reviews).toBe(1); expect(f.requests).toHaveLength(3);
        } finally { await f.cleanup(); }
    });
    test.each(['decision', 'settlement'].flatMap(phase => ['binding', 'cancel'].map(change => [phase, change])))('same-transaction %s %s survives rejection of the late Review proof', async (phase, change) => {
        const f = await rpModelFixture(make, { configurePlan: configureReview, responsePayload: (_body, ordinal) => ordinal === 1 ? 'DRAFT_A' : approve });
        const inspect = ModelPort.prototype.inspectResultCompletion; let changed = false;
        const spy = jest.spyOn(ModelPort.prototype, 'inspectResultCompletion').mockImplementation(async function (handle, request) {
            const proof = await inspect.call(this, handle, request);
            if (!changed && f.requests.length === 2 && f.h.engine.hasActiveTransaction(handle)) {
                const decided = await f.h.engine.withTransaction(handle, tx => tx.getResource(controlRecordKey(handle, request.runId, 'receipt', reviewReceiptId(request.runId, proof.producerAttemptId))));
                if ((phase === 'settlement') === !!decided) {
                    changed = true;
                    if (change === 'binding') {
                        const binding = await f.plans.getBinding(handle, f.sourceSelector);
                        await f.plans.saveBinding(handle, id('Command'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
                    } else await f.authority.execution.runs.cancel(handle, id('Command'), {
                        ...runGuard(await f.authority.execution.runs.get(handle, request.runId)), reasonCode: 'controlled_user_cancel' });
                }
            }
            return proof;
        });
        try {
            await expect(f.run()).rejects.toThrow(); expect(changed).toBe(true); expect(f.requests.length).toBe(2);
            expect((await f.plans.getBinding(f.h.handle, f.sourceSelector)).version).toBe(change === 'binding' ? 1 : 0);
            const [row] = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            expect(row.doc.cancelRequested).toBe(change === 'cancel'); expect(row.doc.outputClaims).toEqual([]);
        } finally { spy.mockRestore(); await f.cleanup(); }
    });
    test.each(['binding', 'cancel'])('same-transaction rerun admission %s preserves withdrawal without writing new Attempts', async change => {
        const f = await rpModelFixture(make, { configurePlan: configureReview, responsePayload: (_body, ordinal) => ordinal === 1 ? 'DRAFT_A' : rerun });
        const capacity = BudgetPort.prototype.observeCapacity; let changed = false;
        const spy = jest.spyOn(BudgetPort.prototype, 'observeCapacity').mockImplementation(async function (handle, request, options) {
            const result = await capacity.call(this, handle, request, options);
            if (!changed && f.requests.length === 2 && f.h.engine.hasActiveTransaction(handle)) {
                changed = true;
                if (change === 'binding') {
                    const binding = await f.plans.getBinding(handle, f.sourceSelector);
                    await f.plans.saveBinding(handle, id('Command'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
                } else {
                    const [row] = await f.h.engine.withTransaction(handle, tx => tx.listResources({ kind: K.orchestrationRun, handle }));
                    await f.authority.execution.runs.cancel(handle, id('Command'), { ...runGuard(row.doc), reasonCode: 'controlled_user_cancel' });
                }
            }
            return result;
        });
        try {
            await expect(f.run()).rejects.toThrow(); expect(changed).toBe(true); expect(f.requests.length).toBe(2);
            const [row] = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            expect(row.doc.attemptRefs).toHaveLength(2); expect(row.doc.cancelRequested).toBe(change === 'cancel');
            expect((await f.plans.getBinding(f.h.handle, f.sourceSelector)).version).toBe(change === 'binding' ? 1 : 0);
            const invalidated = await f.h.engine.withTransaction(f.h.handle, async tx => {
                const draft = (await readAttempt(tx, f.h.handle, row.doc, row.doc.attemptRefs[0])).doc;
                return readAttemptInvalidation(tx, f.h.handle, row.doc, draft);
            });
            expect(invalidated).toBeNull();
        } finally { spy.mockRestore(); await f.cleanup(); }
    });
    test.each(['binding', 'cancel'])('same-transaction Review activation %s preserves withdrawal before admission consumes a round', async change => {
        const f = await rpModelFixture(make, { configurePlan: configureReview, responsePayload: () => 'DRAFT_A' });
        const authorize = NativeRpOrchestrationAuthority.prototype.authorize; let changed = false;
        const spy = jest.spyOn(NativeRpOrchestrationAuthority.prototype, 'authorize').mockImplementation(async function (args) {
            const result = await authorize.call(this, args);
            if (!changed && args.attempt?.status === 'pending' && args.root.graph.nodes.find(node => node.nodeId === args.attempt.nodeId)?.kind === 'review') {
                changed = true;
                if (change === 'binding') {
                    const binding = await f.plans.getBinding(args.handle, f.sourceSelector);
                    await f.plans.saveBinding(args.handle, id('Command'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
                } else await f.authority.execution.runs.cancel(args.handle, id('Command'), { ...runGuard(args.root), reasonCode: 'controlled_user_cancel' });
            }
            return result;
        });
        try {
            await expect(f.run()).rejects.toThrow(); expect(changed).toBe(true); expect(f.requests.length).toBe(1);
            expect((await f.plans.getBinding(f.h.handle, f.sourceSelector)).version).toBe(change === 'binding' ? 1 : 0);
            const [row] = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            expect(row.doc.cancelRequested).toBe(change === 'cancel'); expect(row.doc.progress.reviews).toBe(0);
        } finally { spy.mockRestore(); await f.cleanup(); }
    });
    test.each(['admission', 'decision', 'settlement'].flatMap(phase => ['saved', 'no_save'].map(ack => [phase, ack])))('%s ACK %s retains exact facts and never repeats Review or dispatches Narrator', async (phase, ack) => {
        let reviewNodeId;
        const f = await rpModelFixture(make, { configurePlan: async (...args) => { await configureReview(...args); reviewNodeId = args[0].definition.nodes.find(node => node.kind === 'review').nodeId; },
            responsePayload: (_body, ordinal) => ordinal === 1 ? 'DRAFT_A' : approve });
        const transaction = f.h.engine.withTransaction.bind(f.h.engine); let injected = false;
        f.h.engine.withTransaction = async (handle, callback, ...options) => {
            const outer = !f.h.engine.hasActiveTransaction(handle); let matched = false;
            const value = await transaction(handle, async tx => {
                const result = await callback(tx);
                if (outer && !injected) {
                    if (phase === 'admission' && result?.outcome?.status === 'running' && result.outcome.attemptId) {
                        const row = await tx.getResource(controlRecordKey(handle, result.outcome.runId, 'attempt', result.outcome.attemptId));
                        matched = row?.doc.nodeId === reviewNodeId;
                    } else matched = phase === 'decision' ? !!result?.outcome?.reviewReceipt : phase === 'settlement' && !!result?.outcome?.reviewReceiptRef;
                    if (matched && ack === 'no_save') { injected = true; throw new StorageCommitUnknownError({ operation: 'controlled-review-' + phase }); }
                }
                return result;
            }, ...options);
            if (outer && !injected && matched && ack === 'saved') { injected = true; throw new StorageCommitUnknownError({ operation: 'controlled-review-' + phase }); }
            return value;
        };
        try {
            await expect(f.run()).rejects.toThrow(); expect(injected).toBe(true);
            const sends = phase === 'admission' ? 1 : 2;
            expect(f.requests).toHaveLength(sends);
            const [row] = await transaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            expect(row.doc.outputClaims).toEqual([]); expect(row.doc.progress.reviews).toBe(phase === 'admission' && ack === 'no_save' ? 0 : 1);
            const retry = await f.start(); await expect(retry.result).rejects.toThrow(); expect(f.requests).toHaveLength(sends);
        } finally { f.h.engine.withTransaction = transaction; await f.cleanup(); }
    });
});
