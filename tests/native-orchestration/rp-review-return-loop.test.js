import { jest } from '@jest/globals';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpReviewReturnLoopFixture, text } from './helpers/rp-review-return-loop-fixture.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { readRpNarrationResult } from '../../src/native/orchestration/rp-narration-result-contracts.js';
import { readGraphReviewCompletion } from '../../src/native/orchestration/graph-review-completion.js';
import { rpReviewReaderOptions } from '../../src/native/orchestration/rp-control-input-contracts.js';
import { RpControlGraphWork } from '../../src/native/orchestration/rp-control-graph-work.js';
import { readAttempt, readReviewAdmission, readAttemptInvalidation } from '../../src/native/orchestration/controller-common.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';

jest.setTimeout(120000);
const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const rootOf = f => f.h.engine.withTransaction(f.h.handle, async tx => (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }))[0].doc);
const bankOf = async f => Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;

describe.each(harnesses)('$name RP published return through completed quality control', ({ make }) => {
    test.each([false, true])('fresh pure Model quality region repeats only through its published Planner return, withJudge=%s', async withJudge => {
        const f = await rpReviewReturnLoopFixture(make, { withJudge, maxJobs: withJudge ? 65 : 64 }); let cold;
        try {
            const result = await f.run(), root = await rootOf(f);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(f.calls);
            expect(root.progress).toMatchObject({ attempts: f.calls + 1, patches: 3, replans: 1, reviews: 2, loopIterations: 1 });
            expect(root.progress.edgeVisitCounts[f.loop.edgeId]).toBe(1); expect(root.outputClaims).toHaveLength(1);
            const requests = f.requests.map(text);
            const agent = requests.filter(body => body.includes('"task":{"nodeId":"' + f.nodes.target.nodeId + '"'));
            expect(agent).toHaveLength(2); expect(agent[1]).toContain('bounded_replan');
            for (const body of agent) { expect(body).toContain('A PRIVATE RUMOR'); expect(body).not.toContain('B PRIVATE RUMOR'); expect(body).not.toContain('NARRATOR ONLY MEMORY'); }
            for (const node of [f.nodes.review, f.nodes.judge, f.nodes.late].filter(Boolean)) {
                const current = requests.filter(body => body.includes('"task":{"nodeId":"' + node.nodeId + '"'));
                expect(current).toHaveLength(2); expect(current[0]).toContain('ROUND_1_A_PRIVATE');
                expect(current[1]).toContain('ROUND_2_A_PRIVATE'); expect(current[1]).not.toContain('ROUND_1_A_PRIVATE');
                for (const body of current) { expect(body).toContain('A PRIVATE RUMOR'); expect(body).not.toContain('B PRIVATE RUMOR'); expect(body).not.toContain('NARRATOR ONLY MEMORY'); }
            }
            expect(requests.at(-1)).toContain('ROUND_2_A_PRIVATE'); expect(requests.at(-1)).not.toContain('ROUND_1_A_PRIVATE');
            const bank = await bankOf(f); expect(bank.limits.maxRequests).toBe(f.calls); expect(bank.attempts).toHaveLength(f.calls);
            expect(bank.limits.localWork.maxJobs).toBe(withJudge ? 65 : 64); expect(bank.localWork).toHaveLength(withJudge ? 65 : 51);
            expect(bank.attempts.every(row => row.status === 'settled' && row.usage.totalTokens === 20)).toBe(true);
            expect(bank.localWork.every(row => row.status === 'settled')).toBe(true);
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.published.reviewCompletions).toHaveLength(2); expect(output.published.judgeCompletions).toHaveLength(withJudge ? 2 : 0);
            expect(output.closure.effectIds).toHaveLength(f.calls + 1); expect(root.resultRefs).toHaveLength(3);
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const reviews = output.published.reviewCompletions.toSorted((a, b) => a.producer.attemptNumber - b.producer.attemptNumber);
                expect(reviews.map(fact => fact.producer.attemptNumber)).toEqual([1, 2]);
                const admissions = await Promise.all(reviews.map(fact => readReviewAdmission(tx, f.h.handle, root, fact.producer)));
                expect(admissions.map(fact => fact.round)).toEqual([1, 2]);
                for (const fact of reviews) { expect(fact.review.decision).toBe('approve'); expect(fact.review.invalidatedAttemptIds).toEqual([]); expect(fact.review.replacements).toEqual([]); }
                for (const id of root.attemptRefs) expect(await readAttemptInvalidation(tx, f.h.handle, root, (await readAttempt(tx, f.h.handle, root, id)).doc)).toBeNull();
            });
            expect((await f.source.core.observe(f.h.handle, f.source.base.session.sessionId)).revision).toEqual(f.source.base.revision);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body.at(-1).mes).toBe('Final bounded Review return.');
            await f.chats.delete(f.h.handle, f.locator.charDir, f.locator.name); await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            expect((await cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).claim).toEqual(output.claim);
            expect(f.requests).toHaveLength(f.calls);
        } finally { await cold?.close(); await f.cleanup(); }
    });

    test('the declared 64 local jobs retain all ten paid quality sends while refusing the original Output job', async () => {
        const f = await rpReviewReturnLoopFixture(make, { withJudge: true, maxJobs: 64 });
        try {
            await expect(f.run()).rejects.toThrow('native_generation_budget_exhausted'); expect(f.requests).toHaveLength(10);
            const root = await rootOf(f), bank = await bankOf(f);
            expect(bank.limits.maxRequests).toBe(10); expect(bank.limits.localWork.maxJobs).toBe(64);
            expect(bank.attempts).toHaveLength(10); expect(bank.attempts.every(row => row.status === 'settled' && row.usage.totalTokens === 20)).toBe(true);
            expect(bank.localWork).toHaveLength(64); expect(bank.localWork.every(row => row.status === 'settled')).toBe(true);
            const kinds = {};
            for (const row of bank.localWork) kinds[row.kind] = (kinds[row.kind] ?? 0) + 1;
            expect(kinds).toEqual({ context_build: 10, route_resolve: 10, prompt_compile: 10, generation_count: 10, generation_render: 10,
                graph_control_parse: 7, graph_control_adopt: 7 });
            expect(root.outputClaims).toEqual([]); expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(10); expect(await bankOf(f)).toEqual(bank);
        } finally { await f.cleanup(); }
    });

    test('the original Review round admission refuses a second quality Model without resetting paid loop work', async () => {
        const f = await rpReviewReturnLoopFixture(make, { maxRounds: 1 });
        try {
            await expect(f.run()).rejects.toThrow('native_orchestration_review_limit_exhausted');
            expect(f.requests).toHaveLength(5);
            const root = await rootOf(f), bank = await bankOf(f);
            expect(root.progress).toMatchObject({ patches: 2, replans: 1, reviews: 1, loopIterations: 1 });
            expect(root.outputClaims).toEqual([]); expect(root.status).toBe('blocked'); expect(root.pendingEffectRefs).toEqual([]);
            expect(bank.attempts).toHaveLength(5); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const attempts = (await Promise.all(root.attemptRefs.map(id => readAttempt(tx, f.h.handle, root, id)))).map(row => row.doc);
                const review = attempts.filter(attempt => attempt.nodeId === f.nodes.review.nodeId).toSorted((a, b) => a.attemptNumber - b.attemptNumber);
                expect(review).toHaveLength(2); expect((await readReviewAdmission(tx, f.h.handle, root, review[0])).round).toBe(1);
                expect(review[1]).toMatchObject({ startedAt: null, effectRefs: [] }); expect(await readReviewAdmission(tx, f.h.handle, root, review[1])).toBeNull();
            });
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(5); expect(await bankOf(f)).toEqual(bank);
        } finally { await f.cleanup(); }
    });

    test('a valid old-round Review control cannot authorize final output after a published return', async () => {
        const f = await rpReviewReturnLoopFixture(make), bundle = RpControlGraphWork.prototype.bundle;
        let previous = null, injected = null;
        const spy = jest.spyOn(RpControlGraphWork.prototype, 'bundle').mockImplementation(function (edges, graph) {
            const result = bundle.call(this, edges, graph);
            if (edges.some(edge => edge.from.nodeId === f.nodes.review.nodeId && edge.to.nodeId === f.nodes.late.nodeId)) {
                const fresh = result.controlRefs.find(ref => ref.kind === 'graph_review_control');
                if (!previous) previous = fresh;
                else if (!injected && previous.attemptId !== fresh.attemptId) {
                    injected = { previous, fresh };
                    return { ...result, controlRefs: result.controlRefs.map(ref => ref === fresh ? previous : ref),
                        bindings: result.bindings.map(binding => binding.producerAttemptId === fresh.attemptId ? { ...binding, producerAttemptId: previous.attemptId } : binding) };
                }
            }
            return result;
        });
        try {
            await expect(f.run()).rejects.toThrow('Invalid RP control graph facts');
            expect(injected).not.toBeNull(); expect(injected.previous.attemptId).not.toBe(injected.fresh.attemptId);
            expect(f.requests).toHaveLength(8); const root = await rootOf(f), bank = await bankOf(f);
            expect(root.outputClaims).toEqual([]); expect(root.resultRefs).toHaveLength(3); expect(root.progress.reviews).toBe(2);
            expect(bank.attempts).toHaveLength(8); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const old = await readGraphReviewCompletion(tx, f.h.handle, root, injected.previous.attemptId, rpReviewReaderOptions);
                const current = await readGraphReviewCompletion(tx, f.h.handle, root, injected.fresh.attemptId, rpReviewReaderOptions);
                expect(old.controlRef).toEqual(injected.previous); expect(current.controlRef).toEqual(injected.fresh);
                expect(old.review.decision).toBe('approve'); expect(current.review.decision).toBe('approve');
                await expect(readRpNarrationResult(tx, f.h.handle, root)).rejects.toThrow('Invalid RP control graph facts');
            });
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(8); expect(await bankOf(f)).toEqual(bank);
        } finally { spy.mockRestore(); await f.cleanup(); }
    });
});
