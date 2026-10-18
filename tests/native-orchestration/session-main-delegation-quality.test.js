import { test, expect } from '@jest/globals';
import { sessionMainDelegationQualityFixture, sessionMainDelegationTask } from './helpers/session-main-delegation-quality-fixture.js';
import { makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { readSessionOutput } from '../../src/native/orchestration/session-output-contracts.js';
import { readSessionDelegation } from '../../src/native/orchestration/session-delegation-contracts.js';
import { readSessionPlannerCompletion } from '../../src/native/orchestration/session-planner-contracts.js';
import { readSessionReviewCompletion } from '../../src/native/orchestration/session-review-contracts.js';
import { readTaskLocalOutput, childClosureReceiptId } from '../../src/native/orchestration/task-local-output-contracts.js';
import { readAttempt, readAttemptInvalidation, controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { checkedRecord } from '../../src/native/orchestration/plan-repository.js';
import { handoffReceiptId } from '../../src/native/orchestration/handoff-contracts.js';
import { handoffReturnReceiptId } from '../../src/native/orchestration/handoff-return-contracts.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';

async function facts(f) {
    return f.authority.engine.withTransaction(f.h.handle, async tx => {
        const all = (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle })).map(row => row.doc);
        return { parent: all.find(root => !root.parentRef), child: all.find(root => root.parentRef) };
    });
}
async function bank(f, parent) {
    return (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[parent.budgetAuthorityRef.operationId].compute;
}

test('SQLite Game published Planner Agent Review DAG feeds an explicit Delegate and only the original Narrator writes', async () => {
    const f = await sessionMainDelegationQualityFixture(makeTempSqliteEngineHarness);
    try {
        const result = await f.start(), { parent, child } = await facts(f);
        expect(f.requests).toHaveLength(8); expect(parent.status).toBe('completed'); expect(child.status).toBe('completed');
        expect(parent.progress).toMatchObject({ delegates: 1, handoffs: 0, patches: 1, reviews: 2, loopIterations: 0 });
        expect(parent.outputClaims).toHaveLength(1); expect(child.outputClaims).toHaveLength(1);
        expect(f.requests.slice(0, 5).map(body => sessionMainDelegationTask(body)?.nodeId))
            .toEqual([f.topology.planner.nodeId, f.topology.draft.nodeId, f.topology.review.nodeId, f.topology.draft.nodeId, f.topology.review.nodeId]);
        expect(f.requests[5].model).toBe('session-delegated-distinct-model');
        expect(sessionMainDelegationTask(f.requests[6]).nodeId).toBe(f.topology.delegator.nodeId);
        expect(sessionMainDelegationTask(f.requests[7]).nodeId).toBe(f.topology.narrator.nodeId);
        expect(JSON.stringify(f.requests[5].input)).toContain('CURRENT_PARENT_ACTOR_EVIDENCE_2');
        expect(JSON.stringify(f.requests[5].input)).not.toContain('CURRENT_PARENT_ACTOR_EVIDENCE_1');
        expect(JSON.stringify(f.requests[5].input)).toContain('quality_ready');
        expect(JSON.stringify(f.requests[5].input)).toContain('setPendingPriority');
        for (const body of f.requests.slice(0, 7)) { expect(JSON.stringify(body.input)).toContain('阿岚听说'); expect(JSON.stringify(body.input)).not.toContain('沈墨怀疑'); }
        expect(JSON.stringify(f.requests[6].input)).toContain('CHILD_USED_CURRENT_REVIEWED_ACTOR_EVIDENCE');
        expect(JSON.stringify(f.requests[7].input)).toContain('PARENT_USED_ONLY_APPROVED_CHILD_ADVICE');
        expect(result.states.atri_world_state).toEqual(f.base.states.atri_world_state);
        expect(result.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        const compute = await bank(f, parent); expect(compute.limits.maxRequests).toBe(8); expect(compute.attempts).toHaveLength(8);
        expect(compute.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(compute.attempts.filter(row => row.reservationId === child.runId)).toHaveLength(1);
        expect(compute.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: 1 }) })]);
        const proof = await f.authority.engine.withTransaction(f.h.handle, async tx => {
            const attempts = (await Promise.all(parent.attemptRefs.map(id => readAttempt(tx, f.h.handle, parent, id)))).map(row => row.doc);
            const planner = attempts.find(attempt => attempt.nodeId === f.topology.planner.nodeId);
            const reviews = attempts.filter(attempt => attempt.nodeId === f.topology.review.nodeId).sort((a, b) => a.attemptNumber - b.attemptNumber);
            const drafts = attempts.filter(attempt => attempt.nodeId === f.topology.draft.nodeId).sort((a, b) => a.attemptNumber - b.attemptNumber);
            expect(reviews).toHaveLength(2); expect(drafts).toHaveLength(2);
            expect(drafts[0].effectRefs[0]).not.toBe(drafts[1].effectRefs[0]);
            expect(await readAttemptInvalidation(tx, f.h.handle, parent, drafts[0])).toBeTruthy();
            expect(await readAttemptInvalidation(tx, f.h.handle, parent, drafts[1])).toBeNull();
            const planned = await readSessionPlannerCompletion(tx, f.h.handle, parent, planner.attemptId);
            const reviewed = await Promise.all(reviews.map(review => readSessionReviewCompletion(tx, f.h.handle, parent, review.attemptId)));
            expect(planned.patch.appliedOperations).toEqual([{ op: 'setPendingPriority', nodeId: f.topology.draft.nodeId, priority: 7 }]);
            expect(reviewed.map(fact => fact.review.decision)).toEqual(['rerun', 'approve']);
            expect(reviewed[0].review.invalidatedAttemptIds).toContain(drafts[0].attemptId);
            expect(reviewed[0].review.replacements).toEqual([expect.objectContaining({ targetAttemptId: drafts[0].attemptId, attemptId: drafts[1].attemptId })]);
            expect(reviewed[1].review.invalidatedAttemptIds).toEqual([]);
            const delegated = await readSessionDelegation(tx, f.h.handle, parent, child.runId);
            expect(delegated.mode).toBe('delegate');
            expect(delegated.parentInput.acceptedGraphResultRefs).toEqual(drafts[1].resultRefs);
            expect(delegated.parentInput.acceptedControlRefs).toHaveLength(2);
            expect(delegated.parentInput.acceptedControlRefs).toEqual(expect.arrayContaining([planned.controlRef, reviewed[1].controlRef]));
            expect(delegated.parentInput.acceptedControlRefs).not.toContainEqual(reviewed[0].controlRef);
            expect(await readTaskLocalOutput(tx, f.h.handle, child)).toBeTruthy();
            expect(await checkedRecord(tx, controlRecordKey(f.h.handle, parent.runId, 'receipt', handoffReceiptId(child.runId)))).toBeNull();
            expect(await checkedRecord(tx, controlRecordKey(f.h.handle, parent.runId, 'receipt', handoffReturnReceiptId(child.runId)))).toBeNull();
            return readSessionOutput(tx, f.h.handle, parent);
        });
        expect(proof).toBeTruthy();
        await f.cold(); const cold = await f.authority.execution.runs.get(f.h.handle, parent.runId);
        await f.authority.engine.withTransaction(f.h.handle, async tx => {
            expect((await readSessionOutput(tx, f.h.handle, cold)).receipt).toEqual(proof.receipt);
            const key = controlRecordKey(f.h.handle, child.runId, 'receipt', childClosureReceiptId(child.runId)), saved = await tx.getResource(key);
            expect(saved.doc.budgetAttemptRefs.length).toBeGreaterThan(0);
            const changed = { ...saved.doc, budgetAttemptRefs: saved.doc.budgetAttemptRefs.slice(1) };
            try { await tx.putResource(key, { ...saved, doc: changed, integrity: hash(changed) }); await expect(readSessionOutput(tx, f.h.handle, cold)).rejects.toThrow(); }
            finally { await tx.putResource(key, saved); }
            expect((await readSessionOutput(tx, f.h.handle, cold)).receipt).toEqual(proof.receipt);
        });
        expect(f.requests).toHaveLength(8);
    } finally { await f.cleanup(); }
}, 180000);
