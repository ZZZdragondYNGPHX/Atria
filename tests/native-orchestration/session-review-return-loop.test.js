import { expect, test } from '@jest/globals';
import { sessionReplanFixture, sessionReplanTask } from './helpers/session-replan-fixture.js';
import { makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { readSessionOutput } from '../../src/native/orchestration/session-output-contracts.js';
import { readReviewAdmission, readAttemptInvalidation, readAttempt } from '../../src/native/orchestration/controller-common.js';

const bankOf = async (f, root) => (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;

test.each([false, true])('SQLite Session return through completed Model Review has exact fresh quality rounds, withJudge=%s', async withJudge => {
    const f = await sessionReplanFixture(makeTempSqliteEngineHarness, { withReview: true, withJudge });
    try {
        const result = await f.start(), root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId), count = withJudge ? 9 : 7;
        expect(root.status).toBe('completed'); expect(root.outputClaims).toHaveLength(1); expect(f.requests).toHaveLength(count);
        expect(root.progress).toMatchObject({ replans: 1, reviews: 2, loopIterations: 1 });
        expect(root.progress.edgeVisitCounts[f.topology.back.edgeId]).toBe(1);
        const proof = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root));
        expect(proof.closure.effectIds).toHaveLength(count + 1); expect(proof.published.graphResults).toHaveLength(2);
        expect(proof.published.reviewCompletions).toHaveLength(2); expect(proof.published.judgeCompletions).toHaveLength(withJudge ? 2 : 0);
        const reviews = proof.published.reviewCompletions.toSorted((a, b) => a.producer.attemptNumber - b.producer.attemptNumber);
        expect(reviews.map(fact => fact.producer.attemptNumber)).toEqual([1, 2]);
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            const admissions = await Promise.all(reviews.map(fact => readReviewAdmission(tx, f.h.handle, root, fact.producer)));
            expect(admissions.map(fact => fact.round)).toEqual([1, 2]);
            for (const fact of reviews) { expect(fact.review.decision).toBe('approve'); expect(fact.review.invalidatedAttemptIds).toEqual([]); expect(fact.review.replacements).toEqual([]); }
            for (const fact of [...proof.published.graphResults, ...proof.published.plannerCompletions, ...reviews, ...proof.published.judgeCompletions])
                expect(await readAttemptInvalidation(tx, f.h.handle, root, fact.producer)).toBeNull();
        });
        expect(proof.published.loopHistory.replannedAttemptIds.has(reviews[0].producer.attemptId)).toBe(true);
        expect(proof.published.loopHistory.current.get(f.topology.review.nodeId).producer.attemptId).toBe(reviews[1].producer.attemptId);
        for (const node of [f.topology.review, f.topology.judge, f.topology.planner].filter(Boolean)) {
            const bodies = f.requests.filter(body => sessionReplanTask(body)?.nodeId === node.nodeId).map(body => JSON.stringify(body.input));
            expect(bodies).toHaveLength(2); expect(bodies[0]).toContain('CURRENT_ACTOR_ADVICE_1');
            expect(bodies[1]).toContain('CURRENT_ACTOR_ADVICE_2'); expect(bodies[1]).not.toContain('CURRENT_ACTOR_ADVICE_1');
        }
        for (const body of f.requests.slice(0, -1)) { expect(JSON.stringify(body.input)).toContain('阿岚听说'); expect(JSON.stringify(body.input)).not.toContain('沈墨怀疑'); }
        expect(JSON.stringify(f.requests.at(-1).input)).toContain('CURRENT_ACTOR_ADVICE_2'); expect(JSON.stringify(f.requests.at(-1).input)).not.toContain('CURRENT_ACTOR_ADVICE_1');
        const bank = await bankOf(f, root); expect(bank.attempts).toHaveLength(count); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(bank.localWork.every(row => row.status === 'settled')).toBe(true);
        expect(result.states.atri_world_state).toEqual(f.base.states.atri_world_state); expect(result.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        await f.cold();
        expect((await f.authority.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root))).receipt).toEqual(proof.receipt);
        expect(f.requests).toHaveLength(count);
    } finally { await f.cleanup(); }
}, 180000);

test('SQLite Session original Review round cap refuses another quality send after the accepted return', async () => {
    const f = await sessionReplanFixture(makeTempSqliteEngineHarness, { withReview: true, maxRounds: 1 });
    try {
        await expect(f.start()).rejects.toThrow('native_orchestration_review_limit_exhausted'); expect(f.requests).toHaveLength(4);
        const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId), bank = await bankOf(f, root);
        expect(root.status).toBe('blocked'); expect(root.outputClaims).toEqual([]); expect(root.pendingEffectRefs).toEqual([]);
        expect(root.progress).toMatchObject({ replans: 1, reviews: 1, loopIterations: 1 });
        expect(bank.attempts).toHaveLength(4); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            const reviews = (await Promise.all(root.attemptRefs.map(id => readAttempt(tx, f.h.handle, root, id)))).map(row => row.doc)
                .filter(attempt => attempt.nodeId === f.topology.review.nodeId).toSorted((a, b) => a.attemptNumber - b.attemptNumber);
            expect(reviews).toHaveLength(2); expect((await readReviewAdmission(tx, f.h.handle, root, reviews[0])).round).toBe(1);
            expect(reviews[1]).toMatchObject({ startedAt: null, effectRefs: [] }); expect(await readReviewAdmission(tx, f.h.handle, root, reviews[1])).toBeNull();
        });
        expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).timeline).toEqual(f.base.timeline);
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(4); expect(await bankOf(f, root)).toEqual(bank);
    } finally { await f.cleanup(); }
}, 120000);
