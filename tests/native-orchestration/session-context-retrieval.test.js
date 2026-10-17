import { sessionContextRetrievalFixture } from './helpers/session-context-retrieval-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { readSessionOutput } from '../../src/native/orchestration/session-output-contracts.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { SettingsRepo } from '../../src/storage/repositories/settings-repo.js';

const rootOf = f => f.authority.execution.runs.engine.withTransaction(f.h.handle, async tx => (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }))[0].doc);
const withdrawMemory = async f => {
    const settings = new SettingsRepo({ engine: f.authority.execution.runs.engine }), saved = await settings.get(f.h.handle);
    await settings.save(f.h.handle, { atri_capabilities: { memory_graph: { ...saved.atri_capabilities.memory_graph, recallEnabled: false } } });
};
const noDomainOutput = async f => {
    const snapshot = await f.core.observe(f.h.handle, f.base.session.sessionId);
    expect(snapshot.timeline.some(row => row.content === 'Synthetic native narrator response.')).toBe(false);
};
const computeOf = async (f, root) => (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;

describe.each(CONTRACT_HARNESSES)('$name original Session Context retrieval', ({ make }) => {
    test.each([false, true])('original typed Context/Effects/output close retrieval fees and preserve Model quota, policy=%s', async quota => {
        const f = await sessionContextRetrievalFixture(make, { quota });
        try {
            const result = await f.start(), root = await rootOf(f), bank = await computeOf(f, root);
            expect(root.status).toBe('completed'); expect(f.requests).toHaveLength(quota ? 2 : 1); expect(f.calls).toHaveLength(2);
            expect(f.calls.every(row => row.auth === 'Bearer synthetic-session-embedding-secret')).toBe(true);
            expect(JSON.stringify(f.calls)).not.toContain('沈墨怀疑有人跟踪自己。');
            expect(bank.attempts).toHaveLength(quota ? 4 : 3); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
            const output = await f.authority.execution.runs.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root));
            expect(output.published.retrievalCompletions).toHaveLength(2); expect(output.closure.effectIds).toHaveLength(quota ? 5 : 4);
            expect(result.timeline.at(-1).content).toBe('Synthetic native narrator response.');
            expect(bank.attempts.filter(row => row.generationQuotaRef).map(row => row.generationQuotaRef.role)).toEqual(quota ? ['intent_resolver', 'narrator'] : []);
            await f.cold();
            expect((await f.authority.execution.runs.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root))).claim).toEqual(output.claim);
            expect(f.calls).toHaveLength(2);
        } finally { await f.cleanup(); }
    }, 180000);

    test('unknown retrieval usage stops before Model and preserves the same paid request across retry and cold reopen', async () => {
        const f = await sessionContextRetrievalFixture(make, { retrievalUsage: null });
        try {
            await expect(f.start()).rejects.toMatchObject({ code: 'generation_execution_failed' });
            const root = await rootOf(f), bank = await computeOf(f, root);
            expect(f.calls).toHaveLength(1); expect(f.requests).toHaveLength(0);
            expect(bank.attempts).toHaveLength(1); expect(bank.attempts[0].status).toBe('unknown');
            expect(root.outputClaims).toEqual([]); await noDomainOutput(f);
            await expect(f.start()).rejects.toThrow();
            expect(f.calls).toHaveLength(1); expect(f.requests).toHaveLength(0);
            await f.cold();
            expect((await computeOf(f, await rootOf(f))).attempts).toEqual(bank.attempts);
            await expect(f.start()).rejects.toThrow();
            expect(f.calls).toHaveLength(1); expect(f.requests).toHaveLength(0); await noDomainOutput(f);
        } finally { await f.cleanup(); }
    }, 180000);

    test('Memory withdrawal during retrieval HTTP preserves the actual fee and withholds Model and domain output', async () => {
        const f = await sessionContextRetrievalFixture(make);
        try {
            f.onRetrieval(() => withdrawMemory(f));
            await expect(f.start()).rejects.toMatchObject({ code: 'generation_execution_failed' });
            const root = await rootOf(f), bank = await computeOf(f, root);
            expect(f.calls).toHaveLength(1); expect(f.requests).toHaveLength(0);
            expect(bank.attempts).toHaveLength(1);
            expect(bank.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 7 } });
            expect(root.outputClaims).toEqual([]); await noDomainOutput(f);
            await f.cold();
            expect((await computeOf(f, await rootOf(f))).attempts).toEqual(bank.attempts);
            expect((await new SettingsRepo({ engine: f.authority.execution.runs.engine }).get(f.h.handle)).atri_capabilities.memory_graph.recallEnabled).toBe(false);
            expect(f.calls).toHaveLength(1); expect(f.requests).toHaveLength(0);
        } finally { await f.cleanup(); }
    }, 180000);

    test('Memory withdrawal after sealed Model completion is re-read before the original Session finalizer', async () => {
        const f = await sessionContextRetrievalFixture(make), finalize = f.authority.finalizeNarrator.bind(f.authority);
        let reachedFinalizer = false;
        f.authority.finalizeNarrator = async args => {
            reachedFinalizer = true;
            expect((await f.observe()).outcome).toBe('confirmed');
            await withdrawMemory(f);
            return finalize(args);
        };
        try {
            await expect(f.start()).rejects.toMatchObject({ code: 'native_orchestration_memory_source_stale' });
            const root = await rootOf(f), bank = await computeOf(f, root);
            expect(reachedFinalizer).toBe(true); expect(f.calls).toHaveLength(2); expect(f.requests).toHaveLength(1);
            expect(bank.attempts).toHaveLength(3); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
            expect(root.outputClaims).toEqual([]); await noDomainOutput(f);
            await f.cold();
            expect((await computeOf(f, await rootOf(f))).attempts).toEqual(bank.attempts);
            expect((await f.observe()).outcome).toBe('confirmed');
            expect(f.calls).toHaveLength(2); expect(f.requests).toHaveLength(1); await noDomainOutput(f);
        } finally { await f.cleanup(); }
    }, 180000);

    test('unknown main Model usage preserves its legal domain output and all retrieval fees without a terminal claim', async () => {
        const f = await sessionContextRetrievalFixture(make, { usage: false });
        try {
            const result = await f.start(), root = await rootOf(f), bank = await computeOf(f, root);
            expect(root.status).toBe('running'); expect(root.outputClaims).toEqual([]);
            expect(result.timeline.at(-1).content).toBe('Synthetic native narrator response.');
            expect(bank.attempts.map(row => row.status)).toEqual(['settled', 'settled', 'unknown']);
            expect(bank.localWork.find(row => row.kind === 'session_output').status).toBe('settled');
            expect(await f.authority.execution.runs.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root))).toBeNull();
            expect((await f.start()).revision).toEqual(result.revision);
            await f.cold();
            expect((await computeOf(f, await rootOf(f))).attempts).toEqual(bank.attempts);
            expect((await f.start()).revision).toEqual(result.revision);
            expect(f.calls).toHaveLength(2); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 180000);


    test('optional original rerank pays only competing legal causal candidates and closes with original Model quota', async () => {
        const f = await sessionContextRetrievalFixture(make, { quota: true, reranking: true, competingSources: true,
            changeRoute: route => ({ ...route, executionPolicy: { ...route.executionPolicy, computeBudget: { ...route.executionPolicy.computeBudget, maxRequests: 5 } } }) });
        try {
            const result = await f.start(), root = await rootOf(f), bank = await computeOf(f, root);
            expect(root.status).toBe('completed'); expect(f.requests).toHaveLength(2);
            expect(f.calls.map(row => row.endpoint)).toEqual(['/v1/embeddings', '/v1/embeddings', '/v1/rerank']);
            const rerank = f.calls.find(row => row.endpoint === '/v1/rerank');
            expect(rerank.auth).toBe('Bearer synthetic-session-embedding-secret');
            expect(rerank.body).toMatchObject({ model: 'scoped-session-rerank', query: expect.stringContaining('Why did Alice leave?') });
            expect(rerank.body.documents).toEqual(expect.arrayContaining(['Alice left because of a storm.', 'Alice left because of a promise.']));
            expect(bank.attempts).toHaveLength(5); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
            expect(bank.attempts.filter(row => row.generationQuotaRef).map(row => row.generationQuotaRef.role)).toEqual(['intent_resolver', 'narrator']);
            const proof = await f.authority.execution.runs.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root));
            expect(proof.published.retrievalCompletions).toHaveLength(3); expect(proof.closure.effectIds).toHaveLength(6);
            expect(result.timeline.at(-1).content).toBe('Synthetic native narrator response.');
            await f.cold();
            const coldRoot = await rootOf(f), coldProof = await f.authority.execution.runs.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, coldRoot));
            expect(coldProof).toEqual(proof); expect((await computeOf(f, coldRoot)).attempts).toEqual(bank.attempts);
            expect(f.calls).toHaveLength(3); expect(f.requests).toHaveLength(2);
        } finally { await f.cleanup(); }
    }, 180000);

    test('configured optional rerank preserves the original non-causal skip without a provider Effect or fee', async () => {
        const f = await sessionContextRetrievalFixture(make, { quota: true, reranking: true });
        try {
            await f.start(); const root = await rootOf(f), bank = await computeOf(f, root);
            expect(root.status).toBe('completed'); expect(f.calls.map(row => row.endpoint)).toEqual(['/v1/embeddings', '/v1/embeddings']);
            expect(bank.attempts).toHaveLength(4); expect(f.requests).toHaveLength(2);
            const proof = await f.authority.execution.runs.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root));
            expect(proof.published.retrievalCompletions).toHaveLength(2); expect(proof.closure.effectIds).toHaveLength(5);
        } finally { await f.cleanup(); }
    }, 180000);

    test.each([['missing', 1], ['resolver', 0]])('configured retrieval with %s Narrator-owned Profile pins rejects before retrieval or Narrator dispatch', async (ownership, resolverCalls) => {
        const f = await sessionContextRetrievalFixture(make, { quota: true, reranking: true, declareRetrieval: ownership !== 'missing', retrievalOwner: ownership === 'resolver' ? 'resolver' : 'narrator' });
        try {
            await expect(f.start()).rejects.toThrow();
            expect(f.calls).toHaveLength(0); expect(f.requests).toHaveLength(resolverCalls);
            expect(f.requests.every(body => body.tools?.length > 0)).toBe(true); await noDomainOutput(f);
        } finally { await f.cleanup(); }
    }, 180000);

});
