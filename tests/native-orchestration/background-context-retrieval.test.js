import { backgroundContextRetrievalFixture } from './helpers/background-context-retrieval-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { readBackgroundTaskOutput, readBackgroundTaskResult } from '../../src/native/orchestration/background-task-output-contracts.js';
import { ContextRetrievalPort } from '../../src/native/orchestration/context-retrieval-port.js';
import { BudgetPort } from '../../src/native/orchestration/budget-port.js';
import { NativeMemoryAuthority } from '../../src/native/memory-authority.js';
import { SettingsRepo } from '../../src/storage/repositories/settings-repo.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';

const rootOf = f => f.authority.engine.withTransaction(f.h.handle, async tx => (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }))[0].doc);
const controlOf = f => f.core.runs.status(f.h.handle, f.base.session.sessionId);
const computeOf = async (f, root) => (await controlOf(f)).operations[root.budgetAuthorityRef.operationId].compute;
const noAdoption = async f => expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).states.atri_task_results?.records ?? []).toEqual([]);
const withdrawMemory = async f => {
    const settings = new SettingsRepo({ engine: f.authority.engine }), saved = await settings.get(f.h.handle);
    await settings.save(f.h.handle, { atri_capabilities: { memory_graph: { ...saved.atri_capabilities.memory_graph, recallEnabled: false } } });
};

describe.each(CONTRACT_HARNESSES)('$name original background Context retrieval', ({ make }) => {
    test('Task-owned Context retrieval closes actual fees and keeps one original background quota across adoption and cold read', async () => {
        const f = await backgroundContextRetrievalFixture(make);
        try {
            const result = await f.run(), root = await rootOf(f), bank = await computeOf(f, root);
            expect(result.results[0].payload.text).toBe('Original background artifact'); expect(root.status).toBe('completed');
            expect(f.requests).toHaveLength(1); expect(f.calls).toHaveLength(2);
            expect(f.calls.every(row => row.endpoint === '/v1/embeddings' && row.auth === 'Bearer synthetic-background-embedding-secret')).toBe(true);
            const wire = JSON.stringify({ retrieval: f.calls, model: f.requests });
            expect(wire).not.toContain('寄信者真实身份是沈墨'); expect(wire).not.toContain('沈墨怀疑有人');
            expect(bank.attempts).toHaveLength(3); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
            expect(bank.attempts.filter(row => row.generationQuotaRef)).toHaveLength(1);
            expect(bank.attempts.find(row => row.generationQuotaRef).generationQuotaRef.background).toBe(true);
            expect(Object.values((await controlOf(f)).background).reduce((sum, row) => sum + row.count, 0)).toBe(1);
            const proof = await f.authority.engine.withTransaction(f.h.handle, tx => readBackgroundTaskOutput(tx, f.h.handle, root));
            expect(proof.receipt.costs.effectIds).toHaveLength(3);
            expect(proof.published.delivery.retrievalCompletions).toHaveLength(2);
            await f.cold();
            const coldRoot = await rootOf(f);
            expect(await f.authority.engine.withTransaction(f.h.handle, tx => readBackgroundTaskOutput(tx, f.h.handle, coldRoot))).toEqual(proof);
            expect((await computeOf(f, coldRoot)).attempts).toEqual(bank.attempts);
            expect((await f.run()).results).toEqual([]); expect(f.calls).toHaveLength(2); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 180000);

    test('input-only Task ignores configured Memory without reading its descriptor or sending retrieval', async () => {
        const f = await backgroundContextRetrievalFixture(make, { inputOnly: true }), descriptor = NativeMemoryAuthority.prototype.contextDescriptor;
        let reads = 0;
        NativeMemoryAuthority.prototype.contextDescriptor = function (...args) { reads++; return descriptor.apply(this, args); };
        try {
            expect((await f.run()).results).toHaveLength(1); expect(reads).toBe(0); expect(f.calls).toHaveLength(0); expect(f.requests).toHaveLength(1);
            expect(JSON.stringify(f.requests)).not.toContain('historical_source');
        } finally { NativeMemoryAuthority.prototype.contextDescriptor = descriptor; await f.cleanup(); }
    }, 180000);

    test('input-only Task rejects unnecessary owned retrieval declarations before any Provider send', async () => {
        const f = await backgroundContextRetrievalFixture(make, { inputOnly: true, declareRetrieval: true });
        try { await expect(f.run()).rejects.toThrow(); expect(f.calls).toHaveLength(0); expect(f.requests).toHaveLength(0); await noAdoption(f); }
        finally { await f.cleanup(); }
    }, 180000);

    test('unknown retrieval usage preserves the charged request and blocks Model/adoption/replay after cold reopen', async () => {
        const f = await backgroundContextRetrievalFixture(make, { retrievalUsage: null });
        try {
            await expect(f.run()).rejects.toThrow(); const root = await rootOf(f), bank = await computeOf(f, root);
            expect(f.calls).toHaveLength(1); expect(f.requests).toHaveLength(0); expect(bank.attempts).toHaveLength(1);
            expect(bank.attempts[0].status).toBe('unknown'); expect(root.outputClaims).toEqual([]); await noAdoption(f);
            await expect(f.run()).rejects.toMatchObject({ code: 'native_orchestration_background_request_replayed' });
            await f.cold();
            expect((await computeOf(f, await rootOf(f))).attempts).toEqual(bank.attempts);
            await expect(f.run()).rejects.toMatchObject({ code: 'native_orchestration_background_request_replayed' }); expect(f.calls).toHaveLength(1); expect(f.requests).toHaveLength(0);
        } finally { await f.cleanup(); }
    }, 180000);

    test('Memory withdrawal during actual retrieval keeps the settled fee and blocks Model and Task adoption', async () => {
        const f = await backgroundContextRetrievalFixture(make);
        try {
            f.onRetrieval(() => withdrawMemory(f)); await expect(f.run()).rejects.toThrow();
            const root = await rootOf(f), bank = await computeOf(f, root);
            expect(f.calls).toHaveLength(1); expect(f.requests).toHaveLength(0); expect(bank.attempts).toHaveLength(1);
            expect(bank.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 7 } }); await noAdoption(f);
            await f.cold(); expect((await computeOf(f, await rootOf(f))).attempts).toEqual(bank.attempts);
            await expect(f.run()).rejects.toMatchObject({ code: 'native_orchestration_background_request_replayed' }); expect(f.calls).toHaveLength(1); expect(f.requests).toHaveLength(0);
        } finally { await f.cleanup(); }
    }, 180000);

    test('Memory revoked after Model sealing is re-read before Task adoption and preserves all paid fees', async () => {
        const f = await backgroundContextRetrievalFixture(make), seal = ContextRetrievalPort.prototype.sealCompilation;
        let sealed = false;
        ContextRetrievalPort.prototype.sealCompilation = async function (...args) {
            const value = await seal.apply(this, args);
            if (args[0] === f.h.handle) { sealed = true; await withdrawMemory(f); }
            return value;
        };
        try {
            await expect(f.run()).rejects.toMatchObject({ code: 'native_orchestration_memory_source_stale' });
            const root = await rootOf(f), bank = await computeOf(f, root);
            expect(sealed).toBe(true); expect(f.calls).toHaveLength(2); expect(f.requests).toHaveLength(1);
            expect(bank.attempts).toHaveLength(3); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
            expect(root.outputClaims).toEqual([]); await noAdoption(f);
            await f.cold(); expect((await computeOf(f, await rootOf(f))).attempts).toEqual(bank.attempts);
            expect((await f.run()).pending.reason).toBe('native_task_outcome_unknown'); expect(f.calls).toHaveLength(2); expect(f.requests).toHaveLength(1);
        } finally { ContextRetrievalPort.prototype.sealCompilation = seal; await f.cleanup(); }
    }, 180000);

    test('Memory withdrawn in post-adoption cost closure stays committed and prevents a terminal claim', async () => {
        const f = await backgroundContextRetrievalFixture(make), observe = BudgetPort.prototype.observeEffectClosure;
        let changed = false;
        BudgetPort.prototype.observeEffectClosure = async function (...args) {
            const value = await observe.apply(this, args);
            const snapshot = await f.core.observe(f.h.handle, f.base.session.sessionId);
            if (this === f.authority.execution.budgetPort && !changed && snapshot.states.atri_task_results?.records.length) {
                changed = true; await withdrawMemory(f);
            }
            return value;
        };
        try {
            await expect(f.run()).rejects.toMatchObject({ code: 'native_orchestration_memory_source_stale' });
            const root = await rootOf(f), bank = await computeOf(f, root), snapshot = await f.core.observe(f.h.handle, f.base.session.sessionId);
            expect(changed).toBe(true); expect(snapshot.states.atri_task_results.records).toHaveLength(1);
            expect(root.status).not.toBe('completed'); expect(root.outputClaims).toEqual([]);
            expect((await new SettingsRepo({ engine: f.authority.engine }).get(f.h.handle)).atri_capabilities.memory_graph.recallEnabled).toBe(false);
            expect(bank.attempts).toHaveLength(3); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
            await f.cold(); expect((await computeOf(f, await rootOf(f))).attempts).toEqual(bank.attempts);
            expect((await f.run()).results).toEqual([]); expect(f.calls).toHaveLength(2); expect(f.requests).toHaveLength(1);
        } finally { BudgetPort.prototype.observeEffectClosure = observe; await f.cleanup(); }
    }, 180000);

    test('unknown main Model usage retains legal Task adoption and retrieval settlements without inventing terminal costs', async () => {
        const f = await backgroundContextRetrievalFixture(make, { usage: false });
        try {
            expect((await f.run()).results).toHaveLength(1); const root = await rootOf(f), bank = await computeOf(f, root);
            expect(root.status).not.toBe('completed'); expect(root.outputClaims).toEqual([]);
            expect(bank.attempts.map(row => row.status)).toEqual(['settled', 'settled', 'unknown']);
            const published = await f.authority.engine.withTransaction(f.h.handle, tx => readBackgroundTaskResult(tx, f.h.handle, root));
            expect(published.delivery.retrievalCompletions).toHaveLength(2);
            expect(await f.authority.engine.withTransaction(f.h.handle, tx => readBackgroundTaskOutput(tx, f.h.handle, root))).toBeNull();
            await f.cold(); expect((await computeOf(f, await rootOf(f))).attempts).toEqual(bank.attempts);
            expect((await f.run()).results).toEqual([]); expect(f.calls).toHaveLength(2); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 180000);


    test('optional original Task rerank pays competing legal causal sources and closes all receipts with one background quota', async () => {
        const f = await backgroundContextRetrievalFixture(make, { reranking: true, competingSources: true });
        try {
            const result = await f.run(), root = await rootOf(f), bank = await computeOf(f, root);
            expect(result.results[0].payload.text).toBe('Original background artifact'); expect(root.status).toBe('completed');
            expect(f.requests).toHaveLength(1);
            expect(f.calls.map(row => row.endpoint)).toEqual(['/v1/embeddings', '/v1/embeddings', '/v1/rerank']);
            const rerank = f.calls.find(row => row.endpoint === '/v1/rerank');
            expect(rerank.auth).toBe('Bearer synthetic-background-embedding-secret');
            expect(rerank.body).toMatchObject({ model: 'scoped-background-rerank', query: expect.stringContaining('Why did Alice leave?') });
            expect(rerank.body.documents).toEqual(expect.arrayContaining(['Alice left because of a storm.', 'Alice left because of a promise.']));
            const wire = JSON.stringify({ retrieval: f.calls, model: f.requests });
            expect(wire).not.toContain('寄信者真实身份是沈墨'); expect(wire).not.toContain('沈墨怀疑有人');
            expect(bank.attempts).toHaveLength(4); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
            expect(bank.attempts.filter(row => row.generationQuotaRef)).toHaveLength(1);
            expect(bank.attempts.find(row => row.generationQuotaRef).generationQuotaRef.background).toBe(true);
            expect(Object.values((await controlOf(f)).background).reduce((sum, row) => sum + row.count, 0)).toBe(1);
            const proof = await f.authority.engine.withTransaction(f.h.handle, tx => readBackgroundTaskOutput(tx, f.h.handle, root));
            expect(proof.receipt.costs.effectIds).toHaveLength(4); expect(proof.published.delivery.retrievalCompletions).toHaveLength(3);
            await f.cold(); const coldRoot = await rootOf(f);
            expect(await f.authority.engine.withTransaction(f.h.handle, tx => readBackgroundTaskOutput(tx, f.h.handle, coldRoot))).toEqual(proof);
            expect((await computeOf(f, coldRoot)).attempts).toEqual(bank.attempts);
            expect((await f.run()).results).toEqual([]); expect(f.calls).toHaveLength(3); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 180000);

    test('configured optional Task rerank keeps the non-causal skip without a hidden Effect or fee', async () => {
        const f = await backgroundContextRetrievalFixture(make, { reranking: true });
        try {
            await f.run(); const root = await rootOf(f), bank = await computeOf(f, root);
            expect(root.status).toBe('completed'); expect(f.requests).toHaveLength(1);
            expect(f.calls.map(row => row.endpoint)).toEqual(['/v1/embeddings', '/v1/embeddings']);
            expect(bank.attempts).toHaveLength(3); expect(bank.attempts.filter(row => row.generationQuotaRef)).toHaveLength(1);
            const proof = await f.authority.engine.withTransaction(f.h.handle, tx => readBackgroundTaskOutput(tx, f.h.handle, root));
            expect(proof.published.delivery.retrievalCompletions).toHaveLength(2); expect(proof.receipt.costs.effectIds).toHaveLength(3);
        } finally { await f.cleanup(); }
    }, 180000);

});
