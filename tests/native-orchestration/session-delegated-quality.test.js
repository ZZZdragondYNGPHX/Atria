import { expect, test } from '@jest/globals';
import { sessionDelegatedQualityFixture, sessionChildQualityTask } from './helpers/session-delegated-quality-fixture.js';
import { makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { readSessionOutput } from '../../src/native/orchestration/session-output-contracts.js';
import { readTaskLocalOutput } from '../../src/native/orchestration/task-local-output-contracts.js';
import { controlRecordKey, readAttemptInvalidation } from '../../src/native/orchestration/controller-common.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';

const rootsOf = f => f.h.engine.withTransaction(f.h.handle, async tx => (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle })).map(row => row.doc));
const bankOf = async (f, root) => (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;

test('SQLite Game child original Review redoes only its pure draft before TaskLocalOutput and sole parent Narrator', async () => {
    const f = await sessionDelegatedQualityFixture(makeTempSqliteEngineHarness);
    try {
        const result = await f.start(), roots = await rootsOf(f), child = roots.find(root => root.parentRef), parent = roots.find(root => !root.parentRef);
        expect(child.status).toBe('completed'); expect(parent.status).toBe('completed'); expect(f.requests).toHaveLength(7);
        expect(f.requests.slice(0, 5).map(body => sessionChildQualityTask(body).nodeId)).toEqual([f.draft.nodeId, f.quality.nodeId, f.draft.nodeId, f.quality.nodeId, f.final.nodeId]);
        expect(JSON.stringify(f.requests[2].input)).toContain('draft_incomplete');
        expect(JSON.stringify(f.requests[3].input)).toContain('CHILD_REVIEW_DRAFT_2'); expect(JSON.stringify(f.requests[3].input)).not.toContain('CHILD_REVIEW_DRAFT_1');
        expect(JSON.stringify(f.requests[4].input)).toContain('CHILD_REVIEW_DRAFT_2'); expect(JSON.stringify(f.requests[4].input)).not.toContain('CHILD_REVIEW_DRAFT_1');
        expect(JSON.stringify(f.requests[5].input)).toContain('CHILD_QUALITY_TERMINAL'); expect(JSON.stringify(f.requests[6].input)).toContain('PARENT_ACCEPTED_CHILD_QUALITY');
        for (const body of f.requests.slice(0, 6)) { expect(JSON.stringify(body.input)).toContain('阿岚听说'); expect(JSON.stringify(body.input)).not.toContain('沈墨怀疑'); }
        expect(child.progress).toMatchObject({ attempts: 6, reviews: 2, patches: 0, loopIterations: 0, edgeVisits: 5 });
        expect(child.graphRevision).toBe(0); expect(child.outputClaims).toHaveLength(1); expect(parent.outputClaims).toHaveLength(1);
        const local = await f.h.engine.withTransaction(f.h.handle, tx => readTaskLocalOutput(tx, f.h.handle, child)), history = local.publication.graphHistory;
        expect(history.reviews.map(fact => fact.review.decision)).toEqual(['rerun', 'approve']); expect(history.effects).toHaveLength(5); expect(history.results).toHaveLength(2);
        expect(history.reviews.every(fact => fact.producer.resultRefs.length === 0)).toBe(true);
        const [first, second] = history.results;
        expect(first.record.payload).toBe('CHILD_REVIEW_DRAFT_1'); expect(second.record.payload).toBe('CHILD_REVIEW_DRAFT_2');
        const invalidation = await f.h.engine.withTransaction(f.h.handle, tx => readAttemptInvalidation(tx, f.h.handle, child, first.producer));
        expect(invalidation.reviewReceiptId).toBe(history.reviews[0].review.receiptId);
        expect(history.reviews[0].review.replacements).toEqual([{ targetAttemptId: first.producer.attemptId, attemptId: second.producer.attemptId }]);
        const bank = await bankOf(f, parent); expect(bank.attempts).toHaveLength(7); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(bank.attempts.filter(row => row.reservationId === child.runId)).toHaveLength(5);
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: 5 }) })]);
        expect(result.states.atri_world_state).toEqual(f.base.states.atri_world_state); expect(result.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        const original = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, parent));
        await f.cold(); const cold = await f.authority.execution.runs.get(f.h.handle, parent.runId);
        await f.authority.engine.withTransaction(f.h.handle, async tx => {
            expect((await readSessionOutput(tx, f.h.handle, cold)).receipt).toEqual(original.receipt);
            const key = controlRecordKey(f.h.handle, child.runId, 'receipt', history.reviews[0].review.receiptId), stored = await tx.getResource(key);
            const changed = { ...stored.doc, replacements: [] };
            try { await tx.putResource(key, { ...stored, doc: changed, integrity: hash(changed) }); await expect(readSessionOutput(tx, f.h.handle, cold)).rejects.toThrow(); }
            finally { await tx.putResource(key, stored); }
            expect((await readSessionOutput(tx, f.h.handle, cold)).receipt).toEqual(original.receipt);
        });
        expect(f.requests).toHaveLength(7);
    } finally { await f.cleanup(); }
}, 180000);

test.each([
    ['published one-round limit', { maxRounds: 1 }, 'native_orchestration_review_limit_exhausted'],
    ['original held child bank', { childRequests: 4 }, 'native_orchestration_review_rerun_budget_unavailable'],
])('Game child Review preserves paid history at its %s', async (_name, options, reasonCode) => {
    const f = await sessionDelegatedQualityFixture(makeTempSqliteEngineHarness, options);
    try {
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(2);
        const roots = await rootsOf(f), child = roots.find(root => root.parentRef), parent = roots.find(root => !root.parentRef);
        expect(child.status).toBe('blocked'); expect(parent.status).toBe('blocked'); expect(child.graphRevision).toBe(0);
        expect(child.progress.reviews).toBe(1); expect(child.resultRefs).toHaveLength(1); expect(child.outputClaims).toEqual([]); expect(parent.outputClaims).toEqual([]);
        expect(child.pendingEffectRefs).toEqual([]);
        const records = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle, runId: child.runId, recordType: 'receipt' }));
        expect(records.filter(row => row.doc.receiptKind === 'native_session_failure').map(row => row.doc)).toEqual([
            expect.objectContaining({ reasonCode, status: 'blocked', costs: expect.objectContaining({ closed: true }) })]);
        expect(records.filter(row => row.doc.receiptKind === 'graph_review')).toEqual([]);
        const bank = await bankOf(f, parent); expect(bank.attempts).toHaveLength(2); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released',
            limits: expect.objectContaining({ maxRequests: options.childRequests ?? 5 }) })]);
        expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).timeline).toEqual(f.base.timeline);
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(2);
    } finally { await f.cleanup(); }
}, 90000);

test('SQLite Game child Judge passes only its selected optional candidate to original TaskLocalOutput', async () => {
    const f = await sessionDelegatedQualityFixture(makeTempSqliteEngineHarness, { judge: true });
    try {
        await f.start(); const roots = await rootsOf(f), child = roots.find(root => root.parentRef), parent = roots.find(root => !root.parentRef);
        expect(child.status).toBe('completed'); expect(parent.status).toBe('completed'); expect(f.requests).toHaveLength(6);
        const local = await f.h.engine.withTransaction(f.h.handle, tx => readTaskLocalOutput(tx, f.h.handle, child)), history = local.publication.graphHistory;
        expect(history.judges).toHaveLength(1); expect(history.effects).toHaveLength(4); expect(history.results).toHaveLength(2);
        const judge = history.judges[0], selected = history.results.find(fact => hash(fact.receipt.resultRef) === hash(judge.selectedResultRef));
        const excluded = history.results.find(fact => fact !== selected);
        expect(judge.producer.resultRefs).toEqual([]); expect(judge.receipt.candidateRefs).toHaveLength(2);
        expect(history.finalProducer.inputRefs[0].acceptedGraphResultRefs).toEqual([judge.selectedResultRef]);
        expect(history.finalProducer.inputRefs[0].acceptedControlRefs).toEqual([judge.controlRef]);
        for (const body of f.requests.slice(0, 5)) { expect(JSON.stringify(body.input)).toContain('阿岚听说'); expect(JSON.stringify(body.input)).not.toContain('沈墨怀疑'); }
        const terminal = f.requests.find(body => sessionChildQualityTask(body).nodeId === f.final.nodeId), text = JSON.stringify(terminal.input);
        expect(text).toContain(selected.record.payload); expect(text).not.toContain(excluded.record.payload);
        expect(child.outputClaims).toHaveLength(1); expect(parent.outputClaims).toHaveLength(1);
        const bank = await bankOf(f, parent); expect(bank.attempts).toHaveLength(6); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(bank.attempts.filter(row => row.reservationId === child.runId)).toHaveLength(4);
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: 4 }) })]);
        const original = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, parent));
        await f.cold(); const cold = await f.authority.execution.runs.get(f.h.handle, parent.runId);
        expect((await f.authority.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, cold))).receipt).toEqual(original.receipt);
        expect(f.requests).toHaveLength(6);
    } finally { await f.cleanup(); }
}, 180000);
