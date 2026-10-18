import { expect, test } from '@jest/globals';
import { makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { rpChildReviewPlannerRedoFixture } from './helpers/rp-child-review-planner-redo-fixture.js';
import { rpChildQualityTask } from './helpers/rp-delegated-quality-fixture.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { readTaskLocalOutput } from '../../src/native/orchestration/task-local-output-contracts.js';
import { readAttemptInvalidation, controlRecordKey, attemptInvalidationId } from '../../src/native/orchestration/controller-common.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';

const text = body => JSON.stringify(body.messages);
const rootsOf = f => f.h.engine.withTransaction(f.h.handle, async tx => (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle })).map(row => row.doc));
const bankOf = async f => Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;

test('SQLite RP child Review redoes a completed pure Planner causal descendant before TaskLocalOutput and sole parent Chat', async () => {
    const f = await rpChildReviewPlannerRedoFixture(makeTempSqliteEngineHarness);
    try {
        const result = await f.run(); expect(result.delegation.status).toBe('returned'); expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(8);
        const roots = await rootsOf(f), child = roots.find(root => root.parentRef), parent = roots.find(root => !root.parentRef);
        expect(child.status).toBe('completed'); expect(parent.status).toBe('completed'); expect(child.outputClaims).toHaveLength(1); expect(parent.outputClaims).toHaveLength(1);
        expect(child.limits.maxSteps).toBe(50); expect(f.childPlan.definition.limits.maxSteps).toBe(50);
        expect(child.limits.maxEdgeVisits).toBe(10); expect(f.childPlan.definition.limits.maxEdgeVisits).toBe(10);
        expect(parent.limits.maxSteps).toBe(59); expect(parent.limits.maxEdgeVisits).toBe(11);
        expect(child.progress.steps).toBe(46); expect(parent.progress.steps).toBe(13); expect(parent.treeProgress.steps).toBe(59);
        expect(child.progress.edgeVisits).toBe(10); expect(parent.progress.edgeVisits).toBe(1); expect(parent.treeProgress.edgeVisits).toBe(11);
        expect(child.graphRevision).toBe(2); expect(child.progress).toMatchObject({ attempts: 8, reviews: 2, patches: 2, replans: 0, loopIterations: 0 });
        expect(child.nodeControl[f.nodes.terminal.nodeId].priority).toBe(7); expect(child.pendingEffectRefs).toEqual([]); expect(parent.pendingEffectRefs).toEqual([]);
        expect(f.requests.slice(0, 7).map(body => rpChildQualityTask(body).nodeId)).toEqual([f.nodes.first.nodeId, f.nodes.planner.nodeId, f.nodes.review.nodeId,
            f.nodes.first.nodeId, f.nodes.planner.nodeId, f.nodes.review.nodeId, f.nodes.terminal.nodeId]);
        expect(new Set(f.requests.slice(0, 3).map(body => body.model)).size).toBe(3);
        for (const body of f.requests.slice(0, 7)) { expect(text(body)).toContain('Original RP input'); expect(text(body)).toContain('Authorized advisory source [rp0]'); }
        expect(text(f.requests[3])).toContain('draft_incomplete'); expect(text(f.requests[4])).toContain('RP_CHILD_REDO_A_2'); expect(text(f.requests[4])).not.toContain('RP_CHILD_REDO_A_1');
        for (const body of f.requests.slice(5, 7)) {
            expect(text(body)).toContain('RP_CHILD_REDO_A_2'); expect(text(body)).not.toContain('RP_CHILD_REDO_A_1');
            expect(text(body)).toContain('requestFinalize'); expect(text(body)).not.toContain('setPendingPriority');
        }
        expect(text(f.requests[7])).toContain('RP_CHILD_REDO_TERMINAL'); expect(text(f.requests[7])).not.toContain('RP_CHILD_REDO_A_1');
        const chat = await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name);
        expect(chat.body).toHaveLength(3); expect(chat.body[2].mes).toBe('RP_PARENT_ACCEPTS_CHILD_REDO');
        const childEffects = f.effects.filter(effect => effect.proposal.inputRef.childRunId === child.runId); expect(childEffects).toHaveLength(7);
        for (const effect of childEffects) { expect(effect.proposal.inputRef.audience).toEqual({ kind: 'task', id: child.runId }); expect(effect.proposal.inputRef.sourceRef).toEqual(child.sourceBinding.sourceRef); }
        const bank = await bankOf(f); expect(bank.attempts).toHaveLength(8); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(bank.attempts.filter(row => row.reservationId === child.runId)).toHaveLength(7);
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: 7 }) })]);
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            const output = await readTaskLocalOutput(tx, f.h.handle, child), history = output.publication.graphHistory;
            const narration = await readRpOutput(tx, f.h.handle, parent);
            expect(narration.published.record.payload).toBe('RP_PARENT_ACCEPTS_CHILD_REDO'); expect(narration.output.status).toBe('completed');
            expect(history.effects).toHaveLength(7); expect(history.results).toHaveLength(2); expect(history.settled).toBe(true);
            expect(history.planners.map(fact => fact.producer.attemptNumber)).toEqual([1, 2]); expect(history.planners.map(fact => fact.producer.graphRevision)).toEqual([0, 1]);
            expect(history.planners.map(fact => fact.patch.appliedOperations[0].op)).toEqual(['setPendingPriority', 'requestFinalize']);
            expect(history.planners.every(fact => fact.patch.accepted && fact.producer.resultRefs.length === 0)).toBe(true);
            expect(history.reviews.map(fact => fact.review.decision)).toEqual(['rerun', 'approve']);
            const oldA = history.results.find(fact => fact.record.payload === 'RP_CHILD_REDO_A_1'), oldPlanner = history.planners[0], review = history.reviews[0];
            expect(review.review.targetAttemptIds).toEqual([oldA.producer.attemptId]);
            expect(review.review.invalidatedAttemptIds).toEqual([oldA.producer.attemptId, oldPlanner.producer.attemptId].sort());
            expect((await readAttemptInvalidation(tx, f.h.handle, child, oldPlanner.producer)).reviewReceiptId).toBe(review.review.receiptId);
            const key = controlRecordKey(f.h.handle, child.runId, 'receipt', attemptInvalidationId(child.runId, oldPlanner.producer.attemptId)), saved = await tx.getResource(key);
            const changed = { ...saved.doc, reviewIntegrity: '0'.repeat(64) };
            try { await tx.putResource(key, { ...saved, doc: changed, integrity: hash(changed) }); await expect(readTaskLocalOutput(tx, f.h.handle, child)).rejects.toThrow(); await expect(readRpOutput(tx, f.h.handle, parent)).rejects.toThrow(); }
            finally { await tx.putResource(key, saved); }
            expect((await readTaskLocalOutput(tx, f.h.handle, child)).receipt).toEqual(output.receipt); expect((await readRpOutput(tx, f.h.handle, parent)).receipt).toEqual(narration.receipt);
            const transitionKey = controlRecordKey(f.h.handle, child.runId, 'receipt', 'oreceipt_' + history.planners[1].producer.attemptId.slice('oattempt_'.length));
            const stored = await tx.getResource(transitionKey); expect(stored.doc.receiptKind).toBe('graph_transition');
            const doc = { ...stored.doc, bindings: stored.doc.bindings.map(binding => ({ ...binding, producerAttemptId: oldA.producer.attemptId })) };
            try { await tx.putResource(transitionKey, { ...stored, doc, integrity: hash(doc) }); await expect(readRpOutput(tx, f.h.handle, parent)).rejects.toThrow(); }
            finally { await tx.putResource(transitionKey, stored); }
            expect((await readRpOutput(tx, f.h.handle, parent)).receipt).toEqual(narration.receipt);
        });
        await f.chats.delete(f.h.handle, f.locator.charDir, f.locator.name);
        expect((await f.h.engine.withTransaction(f.h.handle, tx => readTaskLocalOutput(tx, f.h.handle, child))).publication.graphHistory.settled).toBe(true);
        expect(f.requests).toHaveLength(8);
    } finally { await f.cleanup(); }
}, 180000);

test('RP child Review refuses the pure Planner causal redo when the original held six-request bank cannot fund four remaining Models', async () => {
    const f = await rpChildReviewPlannerRedoFixture(makeTempSqliteEngineHarness, { childRequests: 6 });
    try {
        await expect(f.run()).rejects.toMatchObject({ code: 'operation_child_failed', cause: { code: 'native_orchestration_review_rerun_budget_unavailable' } });
        expect(f.requests).toHaveLength(3);
        const roots = await rootsOf(f), child = roots.find(root => root.parentRef), parent = roots.find(root => !root.parentRef);
        expect(child.status).toBe('blocked'); expect(child.graphRevision).toBe(1); expect(child.progress).toMatchObject({ attempts: 3, patches: 1, reviews: 1 });
        expect(child.pendingEffectRefs).toEqual([]); expect(child.outputClaims).toEqual([]); expect(parent.outputClaims).toEqual([]); expect(child.resultRefs).toHaveLength(1);
        const receipts = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle, runId: child.runId, recordType: 'receipt' }));
        expect(receipts.filter(row => ['attempt_invalidation', 'graph_review'].includes(row.doc.receiptKind))).toEqual([]);
        const bank = await bankOf(f); expect(bank.attempts).toHaveLength(3); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'held', limits: expect.objectContaining({ maxRequests: 6 }) })]);
        expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(3); expect(await bankOf(f)).toEqual(bank);
    } finally { await f.cleanup(); }
}, 90000);
