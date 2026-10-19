import { expect, test } from '@jest/globals';
import { sessionReviewPlannerRedoFixture, sessionPlannerRedoTask } from './helpers/session-review-planner-redo-fixture.js';
import { makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { readSessionOutput } from '../../src/native/orchestration/session-output-contracts.js';
import { controlRecordKey, readAttemptInvalidation, attemptInvalidationId } from '../../src/native/orchestration/controller-common.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';

const text = body => JSON.stringify(body.input);

test('SQLite Game Review recomputes a completed pure Planner causal descendant while retaining its original accepted Patch', async () => {
    const f = await sessionReviewPlannerRedoFixture(makeTempSqliteEngineHarness);
    try {
        const result = await f.start(), root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(root.status).toBe('completed'); expect(root.outputClaims).toHaveLength(1); expect(root.graphRevision).toBe(2);
        expect(root.nodeControl[f.topology.second.nodeId].priority).toBe(7);
        expect(root.progress).toMatchObject({ attempts: 10, patches: 2, reviews: 2, replans: 0, loopIterations: 0, edgeVisits: 14 });
        expect(f.requests.map(body => body.model)).toEqual(['session-redo-a', 'session-redo-planner', 'session-redo-b', 'session-redo-review',
            'session-redo-a', 'session-redo-planner', 'session-redo-b', 'session-redo-review', 'p4-fixture']);
        // A and B are separate advisory nodes with the same authored Actor
        // scope. The real second Actor's private Source remains a canary.
        for (const body of f.requests.slice(0, 8)) { expect(text(body)).toContain('阿岚听说'); expect(text(body)).not.toContain('沈墨怀疑'); }
        expect(text(f.requests[5])).toContain('SESSION_A_2'); expect(text(f.requests[5])).not.toContain('SESSION_A_1');
        expect(text(f.requests[6])).toContain('requestFinalize'); expect(text(f.requests[6])).not.toContain('setPendingPriority');
        for (const body of f.requests.slice(7)) {
            expect(text(body)).toContain('SESSION_A_2'); expect(text(body)).toContain('SESSION_B_2');
            expect(text(body)).not.toContain('SESSION_A_1'); expect(text(body)).not.toContain('SESSION_B_1');
        }
        const proof = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root));
        expect(proof.published.plannerCompletions).toHaveLength(2); expect(proof.published.reviewCompletions).toHaveLength(2); expect(proof.published.graphResults).toHaveLength(4);
        expect(proof.published.plannerCompletions.map(fact => fact.producer.attemptNumber)).toEqual([1, 2]);
        expect(proof.published.plannerCompletions.map(fact => fact.patch.appliedOperations[0].op)).toEqual(['setPendingPriority', 'requestFinalize']);
        expect(proof.published.plannerCompletions.every(fact => fact.patch.accepted)).toBe(true);
        const firstReview = proof.published.reviewCompletions[0], oldPlanner = proof.published.plannerCompletions[0];
        const oldA = proof.published.graphResults.find(fact => fact.producer.nodeId === f.topology.first.nodeId && fact.producer.attemptNumber === 1);
        const oldB = proof.published.graphResults.find(fact => fact.producer.nodeId === f.topology.second.nodeId && fact.producer.attemptNumber === 1);
        expect(firstReview.review.targetAttemptIds).toEqual([oldA.producer.attemptId]);
        expect(firstReview.review.invalidatedAttemptIds).toEqual([oldA.producer.attemptId, oldPlanner.producer.attemptId, oldB.producer.attemptId].sort());
        expect(proof.published.loopHistory.current.get(f.topology.planner.nodeId).producer.attemptNumber).toBe(2);
        expect(proof.published.loopHistory.replannedAttemptIds.size).toBe(0); expect(proof.closure.effectIds).toHaveLength(10);
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            expect((await readAttemptInvalidation(tx, f.h.handle, root, oldPlanner.producer)).reviewReceiptId).toBe(firstReview.review.receiptId);
        });
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
        expect(bank.limits.maxRequests).toBe(9); expect(bank.attempts).toHaveLength(9);
        expect(bank.attempts.every(row => row.status === 'settled' && row.usage.totalTokens === 20)).toBe(true);
        expect(result.states.atri_world_state).toEqual(f.base.states.atri_world_state); expect(result.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        expect(result.timeline.at(-1).content).toBe('The NPC awaits your choice after fresh reviewed advice.');
        await f.cold(); const cold = await f.authority.execution.runs.get(f.h.handle, root.runId);
        expect((await f.authority.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, cold))).receipt).toEqual(proof.receipt);
        await f.authority.engine.withTransaction(f.h.handle, async tx => {
            const key = controlRecordKey(f.h.handle, cold.runId, 'receipt', attemptInvalidationId(cold.runId, oldPlanner.producer.attemptId)), saved = await tx.getResource(key);
            const doc = { ...saved.doc, reviewIntegrity: '0'.repeat(64) };
            try { await tx.putResource(key, { ...saved, doc, integrity: hash(doc) }); await expect(readSessionOutput(tx, f.h.handle, cold)).rejects.toThrow(); }
            finally { await tx.putResource(key, saved); }
            expect((await readSessionOutput(tx, f.h.handle, cold)).receipt).toEqual(proof.receipt);
        });
        await f.authority.engine.withTransaction(f.h.handle, async tx => {
            const secondPlanner = proof.published.plannerCompletions[1];
            const key = controlRecordKey(f.h.handle, cold.runId, 'receipt', 'oreceipt_' + secondPlanner.producer.attemptId.slice('oattempt_'.length)), saved = await tx.getResource(key);
            expect(saved.doc.receiptKind).toBe('graph_transition');
            const bindings = saved.doc.bindings.map(binding => ({ ...binding, producerAttemptId: oldA.producer.attemptId }));
            const doc = { ...saved.doc, bindings };
            try { await tx.putResource(key, { ...saved, doc, integrity: hash(doc) }); await expect(readSessionOutput(tx, f.h.handle, cold)).rejects.toThrow(); }
            finally { await tx.putResource(key, saved); }
            expect((await readSessionOutput(tx, f.h.handle, cold)).receipt).toEqual(proof.receipt);
        });
        expect(f.requests).toHaveLength(9);
    } finally { await f.cleanup(); }
}, 180000);

test('Game Review refuses the pure Planner causal redo when the original bank cannot fund all five remaining Models', async () => {
    const f = await sessionReviewPlannerRedoFixture(makeTempSqliteEngineHarness, { maxRequests: 8 });
    try {
        let error;
        try { await f.start(); } catch (caught) { error = caught; }
        expect(error).toBeDefined();
        const causes = []; for (let cause = error; cause; cause = cause.cause) causes.push(cause.code ?? cause.message);
        expect(causes.join(' ')).toContain('native_orchestration_review_rerun_budget_unavailable');
        expect(f.requests).toHaveLength(4);
        const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(root.status).toBe('blocked'); expect(root.graphRevision).toBe(1); expect(root.progress.attempts).toBe(4); expect(root.resultRefs).toHaveLength(2);
        expect(root.outputClaims).toEqual([]); expect(root.pendingEffectRefs).toEqual([]);
        expect(f.requests.filter(body => sessionPlannerRedoTask(body)?.nodeId === f.topology.planner.nodeId)).toHaveLength(1);
        const invalidations = await f.h.engine.withTransaction(f.h.handle, async tx => {
            const rows = await tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle, runId: root.runId, recordType: 'receipt' });
            return rows.filter(row => row.doc.receiptKind === 'attempt_invalidation');
        });
        expect(invalidations).toEqual([]);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
        expect(bank.limits.maxRequests).toBe(8); expect(bank.attempts).toHaveLength(4);
        expect(bank.attempts.every(row => row.status === 'settled' && row.usage.totalTokens === 20)).toBe(true);
        const current = await f.core.observe(f.h.handle, f.base.session.sessionId);
        expect(current.timeline).toEqual(f.base.timeline); expect(current.states.atri_world_state).toEqual(f.base.states.atri_world_state);
        expect(current.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        expect(await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root))).toBeNull();
    } finally { await f.cleanup(); }
}, 90000);

test('SQLite Game Review recomputes an accepted pure Model topology Planner without replaying its original addNode and addEdge', async () => {
    const f = await sessionReviewPlannerRedoFixture(makeTempSqliteEngineHarness, { structural: true });
    try {
        const result = await f.start(), root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(root.status).toBe('completed'); expect(root.outputClaims).toHaveLength(1); expect(root.graphRevision).toBe(2);
        expect(root.nodeControl[f.topology.second.nodeId].priority).toBe(0);
        expect(root.graph.nodes.filter(node => node.nodeId === f.topology.second.nodeId)).toEqual([f.topology.second]);
        expect(f.plan.definition.nodes.some(node => node.nodeId === f.topology.second.nodeId)).toBe(false);
        expect(root.graph.edges).toHaveLength(9);
        expect(root.progress).toMatchObject({ attempts: 10, patches: 2, reviews: 2, replans: 0, loopIterations: 0, edgeVisits: 14 });
        expect(f.requests.map(body => body.model)).toEqual(['session-redo-a', 'session-redo-planner', 'session-redo-planner', 'session-redo-review',
            'session-redo-a', 'session-redo-planner', 'session-redo-planner', 'session-redo-review', 'p4-fixture']);
        // A and B are separate advisory nodes with the same authored Actor
        // scope. The real second Actor's private Source remains a canary.
        for (const body of f.requests.slice(0, 8)) { expect(text(body)).toContain('阿岚听说'); expect(text(body)).not.toContain('沈墨怀疑'); }
        expect(text(f.requests[5])).toContain('SESSION_A_2'); expect(text(f.requests[5])).not.toContain('SESSION_A_1');
        expect(text(f.requests[5])).toContain(f.topology.second.nodeId);
        expect(text(f.requests[6])).toContain('requestFinalize'); expect(text(f.requests[6])).not.toContain('addNode');
        for (const body of f.requests.slice(7)) {
            expect(text(body)).toContain('SESSION_A_2'); expect(text(body)).toContain('SESSION_B_2');
            expect(text(body)).not.toContain('SESSION_A_1'); expect(text(body)).not.toContain('SESSION_B_1');
        }
        const proof = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root));
        expect(proof.published.plannerCompletions).toHaveLength(2); expect(proof.published.reviewCompletions).toHaveLength(2); expect(proof.published.graphResults).toHaveLength(4);
        expect(proof.published.plannerCompletions.map(fact => fact.producer.attemptNumber)).toEqual([1, 2]);
        expect(proof.published.plannerCompletions.map(fact => fact.patch.appliedOperations[0].op)).toEqual(['addNode', 'requestFinalize']);
        expect(proof.published.plannerCompletions[0].patch.appliedOperations).toEqual(f.structuralOperations);
        expect(proof.published.plannerCompletions[1].producer.graphRevision).toBe(1);
        expect(proof.published.plannerCompletions.every(fact => fact.patch.accepted)).toBe(true);
        const firstReview = proof.published.reviewCompletions[0], oldPlanner = proof.published.plannerCompletions[0];
        const oldA = proof.published.graphResults.find(fact => fact.producer.nodeId === f.topology.first.nodeId && fact.producer.attemptNumber === 1);
        const oldB = proof.published.graphResults.find(fact => fact.producer.nodeId === f.topology.second.nodeId && fact.producer.attemptNumber === 1);
        expect(firstReview.review.targetAttemptIds).toEqual([oldA.producer.attemptId]);
        expect(firstReview.review.invalidatedAttemptIds).toEqual([oldA.producer.attemptId, oldPlanner.producer.attemptId, oldB.producer.attemptId].sort());
        expect(proof.published.loopHistory.current.get(f.topology.planner.nodeId).producer.attemptNumber).toBe(2);
        expect(proof.published.loopHistory.replannedAttemptIds.size).toBe(0); expect(proof.closure.effectIds).toHaveLength(10);
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            expect((await readAttemptInvalidation(tx, f.h.handle, root, oldPlanner.producer)).reviewReceiptId).toBe(firstReview.review.receiptId);
        });
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
        expect(bank.limits.maxRequests).toBe(9); expect(bank.attempts).toHaveLength(9);
        expect(bank.attempts.every(row => row.status === 'settled' && row.usage.totalTokens === 20)).toBe(true);
        expect(result.states.atri_world_state).toEqual(f.base.states.atri_world_state); expect(result.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        expect(result.timeline.at(-1).content).toBe('The NPC awaits your choice after fresh reviewed advice.');
        await f.cold(); const cold = await f.authority.execution.runs.get(f.h.handle, root.runId);
        expect((await f.authority.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, cold))).receipt).toEqual(proof.receipt);
        await f.authority.engine.withTransaction(f.h.handle, async tx => {
            const key = controlRecordKey(f.h.handle, cold.runId, 'receipt', attemptInvalidationId(cold.runId, oldPlanner.producer.attemptId)), saved = await tx.getResource(key);
            const doc = { ...saved.doc, reviewIntegrity: '0'.repeat(64) };
            try { await tx.putResource(key, { ...saved, doc, integrity: hash(doc) }); await expect(readSessionOutput(tx, f.h.handle, cold)).rejects.toThrow(); }
            finally { await tx.putResource(key, saved); }
            expect((await readSessionOutput(tx, f.h.handle, cold)).receipt).toEqual(proof.receipt);
        });
        await f.authority.engine.withTransaction(f.h.handle, async tx => {
            const secondPlanner = proof.published.plannerCompletions[1];
            const key = controlRecordKey(f.h.handle, cold.runId, 'receipt', 'oreceipt_' + secondPlanner.producer.attemptId.slice('oattempt_'.length)), saved = await tx.getResource(key);
            expect(saved.doc.receiptKind).toBe('graph_transition');
            const bindings = saved.doc.bindings.map(binding => ({ ...binding, producerAttemptId: oldA.producer.attemptId }));
            const doc = { ...saved.doc, bindings };
            try { await tx.putResource(key, { ...saved, doc, integrity: hash(doc) }); await expect(readSessionOutput(tx, f.h.handle, cold)).rejects.toThrow(); }
            finally { await tx.putResource(key, saved); }
            expect((await readSessionOutput(tx, f.h.handle, cold)).receipt).toEqual(proof.receipt);
        });
        expect(f.requests).toHaveLength(9);
    } finally { await f.cleanup(); }
}, 180000);
