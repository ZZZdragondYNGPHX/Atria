import { jest } from '@jest/globals';
import { contextRetrievalFixture } from './helpers/context-retrieval-fixture.js';
import { configureReview } from './helpers/rp-review-fixture.js';
import { configureControlRetrieval } from './helpers/rp-control-retrieval-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { readRpReviewCompletion } from '../../src/native/orchestration/rp-review-contracts.js';
import { readAttempt, readAttemptInvalidation, readGraphReviewReceipt, controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { hashNativeDocument as hash, putMutable } from '../../src/native/repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { createNativeId } from '../../src/native/identity.js';
import { SettingsRepo } from '../../src/storage/repositories/settings-repo.js';
import { ModelPort } from '../../src/native/orchestration/model-port.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';

const approve = JSON.stringify({ decision: 'approve', reasonCode: 'quality_ready' });
const rerun = JSON.stringify({ decision: 'rerun', reasonCode: 'unclear_motivation' });
const setup = (make, { redo = false, ...options } = {}) => contextRetrievalFixture(make, { embedding: true, ...options,
    responsePayload: (_body, ordinal) => (redo ? ['DRAFT_A', rerun, 'DRAFT_B', approve, 'Final narration from DRAFT_B.']
        : ['DRAFT_A', approve, 'Final narration after quality Review.'])[ordinal - 1],
    afterPlan: async (plan, args) => {
        await configureReview(plan, args); await configureControlRetrieval(plan, args); plan.definition.limits.maxSteps = 160;
    } });
const rootOf = f => f.h.engine.withTransaction(f.h.handle, async tx => (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }))[0].doc);
const bankOf = async f => Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;

describe.each(CONTRACT_HARNESSES)('$name original RP Review retrieval', ({ make }) => {
    test.each([false, true])('owned Draft/Review/Narrator retrieval closes exact original fees, reranking=%s', async reranking => {
        const f = await setup(make, { reranking });
        try {
            const result = await f.run({ floor: 2 }), root = await rootOf(f), bank = await bankOf(f);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(3);
            expect(f.calls.filter(row => row.endpoint === '/v1/embeddings')).toHaveLength(4);
            expect(f.calls.filter(row => row.endpoint === '/v1/rerank')).toHaveLength(reranking ? 3 : 0);
            expect(JSON.stringify(f.calls)).not.toContain('FUTURE FORBIDDEN MEMORY');
            expect(bank.attempts).toHaveLength(reranking ? 10 : 7);
            expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.published.reviewCompletions).toHaveLength(1);
            expect(output.published.reviewCompletions[0].retrievalCompletions).toHaveLength(reranking ? 2 : 1);
            expect(output.published.retrievalCompletions).toHaveLength(reranking ? 7 : 4);
            expect(output.closure.effectIds).toHaveLength(reranking ? 11 : 8);
        } finally { await f.cleanup(); }
    }, 180000);

    test('local redo keeps old retrieval fees and invalidation while new Draft/Review receive fresh original Contexts', async () => {
        const f = await setup(make, { redo: true }); let cold;
        try {
            const result = await f.run({ floor: 2 }), root = await rootOf(f), bank = await bankOf(f);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(5); expect(f.calls).toHaveLength(6);
            expect(bank.attempts).toHaveLength(11); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
            expect(root.progress.reviews).toBe(2); expect(root.resultRefs).toHaveLength(3);
            expect(JSON.stringify(f.requests[2])).toContain('unclear_motivation'); expect(JSON.stringify(f.requests[2])).not.toContain('DRAFT_A');
            expect(JSON.stringify(f.requests[4])).toContain('DRAFT_B'); expect(JSON.stringify(f.requests[4])).not.toContain('DRAFT_A');
            const output = await f.h.engine.withTransaction(f.h.handle, async tx => {
                const old = (await readAttempt(tx, f.h.handle, root, root.attemptRefs[0])).doc;
                expect(await readAttemptInvalidation(tx, f.h.handle, root, old)).toBeTruthy();
                return readRpOutput(tx, f.h.handle, root);
            });
            expect(output.published.reviewCompletions).toHaveLength(2); expect(output.published.retrievalCompletions).toHaveLength(6);
            expect(output.closure.effectIds).toHaveLength(12);
            await f.chats.delete(f.h.handle, 'Actor', 'main'); await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            expect((await cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).claim).toEqual(output.claim);
            const reviewed = output.published.reviewCompletions[0], child = reviewed.retrievalCompletions[0];
            await cold.withTransaction(f.h.handle, async tx => {
                const key = controlRecordKey(f.h.handle, root.runId, 'effect', child.effectId), row = await tx.getResource(key), doc = structuredClone(row.doc);
                doc.inputRef.contextForEffectId = createNativeId('orchestrationEffect'); doc.inputHash = hash(doc.inputRef);
                await putMutable(tx, key, doc, { expectedIntegrity: row.integrity });
            });
            await expect(cold.withTransaction(f.h.handle, tx => readRpReviewCompletion(tx, f.h.handle, root, reviewed.producer.attemptId))).rejects.toThrow();
            expect(f.requests).toHaveLength(5); expect(f.calls).toHaveLength(6);
        } finally { await cold?.close(); await f.cleanup(); }
    }, 180000);

    test.each([3, 5])('unknown Review embedding usage ordinal=%s cannot authorize redo or Narrator and never resets charged work', async unknownOrdinal => {
        const f = await setup(make, { redo: true, providerUsage: (_body, ordinal) => ordinal === unknownOrdinal ? null : { total_tokens: 7 } });
        try {
            await expect(f.run({ floor: 2 })).rejects.toThrow(); const root = await rootOf(f), bank = await bankOf(f);
            expect(f.requests).toHaveLength(unknownOrdinal - 2); expect(f.calls).toHaveLength(unknownOrdinal); expect(bank.attempts).toHaveLength(unknownOrdinal * 2 - 2);
            expect(bank.attempts.at(-1).status).toBe('unknown'); expect(root.progress.reviews).toBe(unknownOrdinal === 3 ? 1 : 2); expect(root.outputClaims).toEqual([]);
            expect(await f.h.engine.withTransaction(f.h.handle, async tx => readGraphReviewReceipt(tx, f.h.handle, root, (await readAttempt(tx, f.h.handle, root, root.attemptRefs.at(-1))).doc))).toBeNull();
            await expect(f.run({ floor: 2 })).rejects.toThrow(); expect(await bankOf(f)).toEqual(bank); expect(f.calls).toHaveLength(unknownOrdinal);
        } finally { await f.cleanup(); }
    }, 120000);

    test('Memory withdrawn during final Review proof is preserved and cannot authorize redo or Narrator', async () => {
        const f = await setup(make, { redo: true }), original = ModelPort.prototype.inspectResultCompletion; let changed = false;
        const spy = jest.spyOn(ModelPort.prototype, 'inspectResultCompletion').mockImplementation(async function (handle, request) {
            const proof = await original.call(this, handle, request);
            if (!changed && f.requests.length === 2 && f.h.engine.hasActiveTransaction(handle)) {
                changed = true; const repo = new SettingsRepo({ engine: f.h.engine }), settings = await repo.get(handle);
                settings.atri_capabilities.memory_graph.recallEnabled = false; await repo.save(handle, settings);
            }
            return proof;
        });
        try {
            await expect(f.run({ floor: 2 })).rejects.toThrow(); expect(changed).toBe(true); expect(f.requests).toHaveLength(2); expect(f.calls).toHaveLength(3);
            expect((await new SettingsRepo({ engine: f.h.engine }).get(f.h.handle)).atri_capabilities.memory_graph.recallEnabled).toBe(false);
            const root = await rootOf(f); expect(root.progress.reviews).toBe(1); expect(root.outputClaims).toEqual([]);
            expect(await f.h.engine.withTransaction(f.h.handle, async tx => readGraphReviewReceipt(tx, f.h.handle, root, (await readAttempt(tx, f.h.handle, root, root.attemptRefs.at(-1))).doc))).toBeNull();
        } finally { spy.mockRestore(); await f.cleanup(); }
    }, 120000);
});
