import { expect, test } from '@jest/globals';
import { sessionChildReviewPlannerRedoFixture, sessionChildPlannerRedoTask } from './helpers/session-child-review-planner-redo-fixture.js';
import { makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { readSessionOutput } from '../../src/native/orchestration/session-output-contracts.js';
import { readTaskLocalOutput } from '../../src/native/orchestration/task-local-output-contracts.js';
import { controlRecordKey, readAttemptInvalidation, attemptInvalidationId } from '../../src/native/orchestration/controller-common.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';

const rootsOf = f => f.h.engine.withTransaction(f.h.handle, async tx => (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle })).map(row => row.doc));
const bankOf = async (f, root) => (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
const text = body => JSON.stringify(body.input);

test('SQLite Game child Review redoes a completed pure Planner causal descendant before TaskLocalOutput and sole parent Narrator', async () => {
    const f = await sessionChildReviewPlannerRedoFixture(makeTempSqliteEngineHarness);
    try {
        const result = await f.start(), roots = await rootsOf(f), child = roots.find(root => root.parentRef), parent = roots.find(root => !root.parentRef);
        expect(child.status).toBe('completed'); expect(parent.status).toBe('completed'); expect(f.requests).toHaveLength(9);
        expect(f.requests.slice(0, 7).map(body => sessionChildPlannerRedoTask(body).nodeId)).toEqual([f.redo.first.nodeId, f.redo.planner.nodeId,
            f.redo.review.nodeId, f.redo.first.nodeId, f.redo.planner.nodeId, f.redo.review.nodeId, f.redo.final.nodeId]);
        for (const body of f.requests.slice(0, 8)) { expect(text(body)).toContain('阿岚听说'); expect(text(body)).not.toContain('沈墨怀疑'); }
        expect(text(f.requests[3])).toContain('draft_incomplete'); expect(text(f.requests[4])).toContain('CHILD_PLANNER_REDO_A_2'); expect(text(f.requests[4])).not.toContain('CHILD_PLANNER_REDO_A_1');
        for (const body of f.requests.slice(5, 7)) {
            expect(text(body)).toContain('CHILD_PLANNER_REDO_A_2'); expect(text(body)).not.toContain('CHILD_PLANNER_REDO_A_1');
            expect(text(body)).toContain('requestFinalize'); expect(text(body)).not.toContain('setPendingPriority');
        }
        expect(text(f.requests[7])).toContain('CHILD_REDO_TERMINAL'); expect(text(f.requests[8])).toContain('PARENT_ACCEPTED_CHILD_REDO');
        expect(child.limits.maxSteps).toBe(64);
        expect(child.progress).toMatchObject({ attempts: 8, reviews: 2, patches: 2, replans: 0, loopIterations: 0, edgeVisits: 10 });
        expect(child.graphRevision).toBe(2); expect(child.nodeControl[f.redo.final.nodeId].priority).toBe(7);
        expect(child.outputClaims).toHaveLength(1); expect(parent.outputClaims).toHaveLength(1); expect(child.pendingEffectRefs).toEqual([]); expect(parent.pendingEffectRefs).toEqual([]);
        const local = await f.h.engine.withTransaction(f.h.handle, tx => readTaskLocalOutput(tx, f.h.handle, child)), history = local.publication.graphHistory;
        expect(history.planners).toHaveLength(2); expect(history.reviews).toHaveLength(2); expect(history.effects).toHaveLength(7); expect(history.results).toHaveLength(2);
        expect(history.planners.map(fact => fact.producer.attemptNumber)).toEqual([1, 2]);
        expect(history.planners.map(fact => fact.producer.graphRevision)).toEqual([0, 1]);
        expect(history.planners.map(fact => fact.patch.appliedOperations[0].op)).toEqual(['setPendingPriority', 'requestFinalize']);
        expect(history.planners.every(fact => fact.patch.accepted && fact.producer.resultRefs.length === 0)).toBe(true);
        const firstReview = history.reviews[0], oldPlanner = history.planners[0];
        const oldA = history.results.find(fact => fact.producer.nodeId === f.redo.first.nodeId && fact.producer.attemptNumber === 1);
        expect(firstReview.review.targetAttemptIds).toEqual([oldA.producer.attemptId]);
        expect(firstReview.review.invalidatedAttemptIds).toEqual([oldA.producer.attemptId, oldPlanner.producer.attemptId].sort());
        expect((await f.h.engine.withTransaction(f.h.handle, tx => readAttemptInvalidation(tx, f.h.handle, child, oldPlanner.producer))).reviewReceiptId).toBe(firstReview.review.receiptId);
        const bank = await bankOf(f, parent); expect(bank.limits.maxRequests).toBe(9); expect(bank.attempts).toHaveLength(9);
        expect(bank.attempts.every(row => row.status === 'settled' && row.usage.totalTokens === 20)).toBe(true);
        expect(bank.attempts.filter(row => row.reservationId === child.runId)).toHaveLength(7);
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: 7 }) })]);
        expect(result.states.atri_world_state).toEqual(f.base.states.atri_world_state); expect(result.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        expect(result.timeline.at(-1).content).toBe('The NPC waits for the player choice.');
        const original = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, parent));
        await f.cold(); const cold = await f.authority.execution.runs.get(f.h.handle, parent.runId);
        await f.authority.engine.withTransaction(f.h.handle, async tx => {
            expect((await readSessionOutput(tx, f.h.handle, cold)).receipt).toEqual(original.receipt);
            const key = controlRecordKey(f.h.handle, child.runId, 'receipt', attemptInvalidationId(child.runId, oldPlanner.producer.attemptId)), saved = await tx.getResource(key);
            const changed = { ...saved.doc, reviewIntegrity: '0'.repeat(64) };
            try { await tx.putResource(key, { ...saved, doc: changed, integrity: hash(changed) }); await expect(readSessionOutput(tx, f.h.handle, cold)).rejects.toThrow(); }
            finally { await tx.putResource(key, saved); }
            expect((await readSessionOutput(tx, f.h.handle, cold)).receipt).toEqual(original.receipt);
            const secondPlanner = history.planners[1];
            const transitionKey = controlRecordKey(f.h.handle, child.runId, 'receipt', 'oreceipt_' + secondPlanner.producer.attemptId.slice('oattempt_'.length));
            const transition = await tx.getResource(transitionKey); expect(transition.doc.receiptKind).toBe('graph_transition');
            const bindings = transition.doc.bindings.map(binding => ({ ...binding, producerAttemptId: oldA.producer.attemptId })), doc = { ...transition.doc, bindings };
            try { await tx.putResource(transitionKey, { ...transition, doc, integrity: hash(doc) }); await expect(readSessionOutput(tx, f.h.handle, cold)).rejects.toThrow(); }
            finally { await tx.putResource(transitionKey, transition); }
            expect((await readSessionOutput(tx, f.h.handle, cold)).receipt).toEqual(original.receipt);
        });
        expect(f.requests).toHaveLength(9);
    } finally { await f.cleanup(); }
}, 180000);

test('Game child Review refuses the pure Planner causal redo when its original held bank cannot fund the four remaining Models', async () => {
    const f = await sessionChildReviewPlannerRedoFixture(makeTempSqliteEngineHarness, { childRequests: 6 });
    try {
        let error; try { await f.start(); } catch (caught) { error = caught; }
        expect(error).toBeDefined();
        const codes = []; for (let cause = error; cause; cause = cause.cause) codes.push(cause.code);
        expect(codes).toContain('native_orchestration_review_rerun_budget_unavailable'); expect(f.requests).toHaveLength(3);
        const roots = await rootsOf(f), child = roots.find(root => root.parentRef), parent = roots.find(root => !root.parentRef);
        expect(child.status).toBe('blocked'); expect(parent.status).toBe('blocked'); expect(child.graphRevision).toBe(1);
        expect(child.progress).toMatchObject({ attempts: 3, patches: 1, reviews: 1, replans: 0, loopIterations: 0 });
        expect(child.outputClaims).toEqual([]); expect(parent.outputClaims).toEqual([]); expect(child.pendingEffectRefs).toEqual([]); expect(parent.pendingEffectRefs).toEqual([]);
        const receipts = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle, runId: child.runId, recordType: 'receipt' }));
        expect(receipts.filter(row => row.doc.receiptKind === 'attempt_invalidation' || row.doc.receiptKind === 'graph_review')).toEqual([]);
        expect(receipts.filter(row => row.doc.receiptKind === 'native_session_failure').map(row => row.doc)).toEqual([
            expect.objectContaining({ reasonCode: 'native_orchestration_review_rerun_budget_unavailable', status: 'blocked', costs: expect.objectContaining({ closed: true }) })]);
        const bank = await bankOf(f, parent); expect(bank.limits.maxRequests).toBe(9); expect(bank.attempts).toHaveLength(3);
        expect(bank.attempts.every(row => row.status === 'settled' && row.usage.totalTokens === 20)).toBe(true);
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: 6 }) })]);
        expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).timeline).toEqual(f.base.timeline);
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(3);
    } finally { await f.cleanup(); }
}, 90000);
