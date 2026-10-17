import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpModelFixture } from './helpers/rp-model-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash, putMutable } from '../../src/native/repositories/common.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { readRpReviewCompletion } from '../../src/native/orchestration/rp-review-contracts.js';
import { readAttempt, readAttemptInvalidation, runGuard, controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { jest } from '@jest/globals';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';

jest.setTimeout(60_000);

const id = kind => createNativeId('orchestration' + kind);
async function configureReview(plan, { h, seeded, route }) {
    const configured = { ...route, executionPolicy: { ...route.executionPolicy, computeBudget: { ...route.executionPolicy.computeBudget, maxRequests: 6 } } };
    await seeded.persistence.saveRuntimeRoute(h.handle, configured);
    const current = await seeded.persistence.getRuntimeRoute(h.handle, route.runtimeRouteId); plan.dependencyPins[0].integrity = hash(current);
    const pin = async (name, nodeId, kind, inputs, outputs, policy = {}) => {
        const next = { ...current, runtimeRouteId: createNativeId('runtimeRoute'), displayName: name };
        await seeded.persistence.saveRuntimeRoute(h.handle, next);
        const persisted = await seeded.persistence.getRuntimeRoute(h.handle, next.runtimeRouteId), pinId = name + '.route';
        plan.dependencyPins.push({ pinId, port: 'model', resourceRef: { scope: 'player', runtimeRouteId: next.runtimeRouteId }, integrity: hash(persisted) });
        return { nodeId, kind, label: name, inputs, outputs, dependencyPinIds: [pinId], capabilities: ['generation.send'], policy: { agentPinId: pinId, ...policy } };
    };
    const port = (name, type, required = false) => ({ name, type, required });
    const narrator = plan.definition.nodes[0], output = plan.definition.nodes[1];
    const draft = await pin('draft', id('Node'), 'agent', [], [port('draft', 'text')]);
    const review = await pin('review', id('Node'), 'review', [port('draft', 'text', true)], [port('review', 'json')], { maxRounds: 2 });
    narrator.inputs = [port('draft', 'text', true), port('review', 'json', true)]; output.capabilities = ['chat.output'];
    const edge = (from, fromPort, to, toPort, maxVisits = 1) => ({ edgeId: id('Edge'), from: { nodeId: from.nodeId, port: fromPort }, to: { nodeId: to.nodeId, port: toPort }, condition: 'always', maxVisits, loopBack: false });
    plan.definition.nodes = [draft, review, narrator, output]; plan.definition.entryNodeIds = [draft.nodeId];
    plan.definition.edges = [edge(draft, 'draft', review, 'draft', 2), edge(draft, 'draft', narrator, 'draft'), edge(review, 'review', narrator, 'review'), ...plan.definition.edges];
    plan.definition.capabilityCeiling = ['generation.send', 'chat.output']; plan.definition.limits.maxReviews = 2; plan.definition.limits.maxSteps = 80;
    Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 65536 } });
}
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
    test('unknown actual Model usage preserves legal quality/domain facts but cannot claim completed output', async () => {
        const f = await rpModelFixture(make, { configurePlan: configureReview, usage: false, responsePayload: (_body, ordinal) => ['DRAFT_A', approve, 'Final narration.'][ordinal - 1] });
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('pending_output'); expect(root.outputClaims).toEqual([]); expect(root.status).toBe('running');
            expect(root.progress.reviews).toBe(1); expect(f.requests).toHaveLength(3);
        } finally { await f.cleanup(); }
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
