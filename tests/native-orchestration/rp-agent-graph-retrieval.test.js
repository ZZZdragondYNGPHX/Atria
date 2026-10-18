import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { contextRetrievalFixture } from './helpers/context-retrieval-fixture.js';
import { configureRetrievalAgentGraph } from './helpers/rp-agent-graph-retrieval-fixture.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { hashNativeDocument as hash, putMutable } from '../../src/native/repositories/common.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { jest } from '@jest/globals';
import { ResultController } from '../../src/native/orchestration/result-controller.js';
import { ResultPort } from '../../src/native/orchestration/result-port.js';
import { BudgetPort } from '../../src/native/orchestration/budget-port.js';
import { SettingsRepo } from '../../src/storage/repositories/settings-repo.js';
import { PROVENANCE_NAMESPACE } from '../../public/scripts/agents/memory/source-lifecycle.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { createNativeId } from '../../src/native/identity.js';
import { graphResultPublicationId } from '../../src/native/orchestration/graph-result-contracts.js';
import { resultDependencyDigest } from '../../src/native/orchestration/result-contracts.js';

const setup = (make, { shape = 'two-entries', maxJobs, ...options } = {}) => contextRetrievalFixture(make, { embedding: true, ...options,
    afterPlan: (plan, args) => configureRetrievalAgentGraph(plan, args, shape, { maxJobs }) });

const currentRoot = f => f.h.engine.withTransaction(f.h.handle, async tx => (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }))[0].doc);
const compute = async f => Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0]?.compute;

describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s RP Agent graph retrieval', (_name, make) => {
    test.each([false, true])('each exact node owns its Context/Effects and all Result/Chat fees, reranking=%s', async reranking => {
        const f = await setup(make, { reranking });
        try {
            const result = await f.run({ floor: 2 }), root = await currentRoot(f), bank = await compute(f);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(3);
            expect(f.calls.filter(row => row.endpoint === '/v1/embeddings')).toHaveLength(4);
            expect(f.calls.filter(row => row.endpoint === '/v1/rerank')).toHaveLength(reranking ? 3 : 0);
            expect(JSON.stringify(f.calls)).not.toContain('FUTURE FORBIDDEN MEMORY');
            expect(bank.attempts).toHaveLength(reranking ? 10 : 7);
            expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
            expect(bank.localWork.filter(row => row.kind === 'index_insert')).toHaveLength(1);
            expect(bank.localWork.every(row => row.status === 'settled' && row.usage.outcome === 'completed')).toBe(true);
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.published.graphResults).toHaveLength(2);
            expect(output.published.graphResults.map(row => row.retrievalCompletions.length)).toEqual(reranking ? [3, 2] : [2, 1]);
            expect(output.published.retrievalCompletions).toHaveLength(reranking ? 7 : 4);
            expect(output.closure.effectIds).toHaveLength(reranking ? 11 : 8);
        } finally { await f.cleanup(); }
    }, 120000);

    test('a diamond reuses the original vector index and batches its owned namespace listings within the original local allowance', async () => {
        const f = await setup(make, { shape: 'diamond' });
        try {
            const result = await f.run({ floor: 2 }), root = await currentRoot(f), bank = await compute(f);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(4); expect(f.calls).toHaveLength(5);
            expect(bank.localWork).toHaveLength(30); expect(bank.localWork.filter(row => row.kind === 'index_insert')).toHaveLength(1);
            expect(bank.localWork.filter(row => row.kind === 'index_list')).toHaveLength(4);
            expect(bank.localWork.filter(row => row.kind === 'index_list').every(row => row.estimatedItems === 3)).toBe(true);
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.published.retrievalCompletions).toHaveLength(5); expect(output.closure.effectIds).toHaveLength(10);
        } finally { await f.cleanup(); }
    }, 180000);

    test('five original Agent Contexts consume 37 original jobs only under the owner-declared 48 allowance', async () => {
        const f = await setup(make, { shape: 'long-chain', maxJobs: 48 });
        try {
            const result = await f.run({ floor: 2 }), bank = await compute(f), root = await currentRoot(f);
            expect(result.output.runStatus).toBe('completed'); expect(bank.limits.localWork.maxJobs).toBe(48);
            expect(f.requests).toHaveLength(5); expect(f.calls).toHaveLength(6); expect(bank.localWork).toHaveLength(37);
            expect(bank.localWork.every(row => row.status === 'settled' && row.usage.outcome === 'completed')).toBe(true);
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.published.graphResults).toHaveLength(4); expect(output.published.retrievalCompletions).toHaveLength(6);
            expect(output.closure.effectIds).toHaveLength(12);
        } finally { await f.cleanup(); }
    }, 180000);

    test('five original Agent Contexts cannot expand the owner-declared 32 jobs or reset earlier fees', async () => {
        const f = await setup(make, { shape: 'long-chain', maxJobs: 32 });
        try {
            await expect(f.run({ floor: 2 })).rejects.toThrow(); const bank = await compute(f), root = await currentRoot(f);
            expect(bank.limits.localWork.maxJobs).toBe(32); expect(root.outputClaims).toEqual([]); expect(f.requests).toHaveLength(4);
            expect(bank.localWork).toHaveLength(32);
            await expect(f.run({ floor: 2 })).rejects.toThrow(); expect(await compute(f)).toEqual(bank);
        } finally { await f.cleanup(); }
    }, 180000);

    test('a later Model connection reset retains the unknown original attempt and never retries retrieval or Model', async () => {
        const f = await setup(make, { shape: 'diamond' }); let dispatches = 0;
        f.host.providers['provider.openai-compatible'] = createHttpGenerationProvider({ fetchImpl: (...args) => {
            if (++dispatches === 3) throw Object.assign(new TypeError('Synthetic connection reset'), { cause: { code: 'ECONNRESET' } });
            return fetch(...args);
        } });
        try {
            await expect(f.run({ floor: 2 })).rejects.toMatchObject({ code: 'generation_provider_submission_unknown' });
            expect(f.requests).toHaveLength(2); expect(f.calls).toHaveLength(4); expect(dispatches).toBe(3);
            const bank = await compute(f), root = await currentRoot(f);
            expect(bank.attempts).toHaveLength(7); expect(bank.attempts.at(-1).status).toBe('unknown');
            expect(root.resultRefs).toHaveLength(2); expect(root.outputClaims).toEqual([]);
            await expect(f.run({ floor: 2 })).rejects.toThrow(); expect(dispatches).toBe(3); expect(await compute(f)).toEqual(bank);
        } finally { await f.cleanup(); }
    }, 120000);

    test.each([['settings', true], ['ledger', true], ['settings', false]])('%s withdrawn after the first published Result, vectors=%s, cannot reuse a released producer scope for a successor', async (change, embedding) => {
        const f = await setup(make, { embedding, reranking: !embedding, singleSource: !embedding }), original = ResultController.prototype.publishGraphModelResult; let changed = false;
        const spy = jest.spyOn(ResultController.prototype, 'publishGraphModelResult').mockImplementation(async function (...args) {
            const result = await original.apply(this, args);
            if (!changed) {
                changed = true;
                if (change === 'settings') {
                    const repo = new SettingsRepo({ engine: f.h.engine }), settings = await repo.get(f.h.handle);
                    settings.atri_capabilities.memory_graph.recallEnabled = false; await repo.save(f.h.handle, settings);
                } else {
                    const state = await f.chats.getState(f.h.handle, 'Actor', 'main', PROVENANCE_NAMESPACE);
                    state.facts['cause-1'].text = 'Original independent Memory update';
                    await f.chats.setState(f.h.handle, 'Actor', 'main', PROVENANCE_NAMESPACE, state);
                }
            }
            return result;
        });
        try {
            await expect(f.run({ floor: 2 })).rejects.toThrow(); expect(changed).toBe(true);
            expect(f.requests).toHaveLength(1); expect(f.calls).toHaveLength(embedding ? 2 : 0);
            expect((await compute(f)).attempts).toHaveLength(embedding ? 3 : 1);
            expect((await currentRoot(f)).resultRefs).toHaveLength(1); expect((await currentRoot(f)).outputClaims).toEqual([]);
        } finally { spy.mockRestore(); await f.cleanup(); }
    }, 120000);

    test('last Result bank await preserves same-transaction Memory withdrawal and returns no predecessor body', async () => {
        const f = await setup(make), read = ResultPort.prototype.readForGraphResults, budget = BudgetPort.prototype.assertCurrent;
        let inRead = false, changed = false, delivered = false;
        const readSpy = jest.spyOn(ResultPort.prototype, 'readForGraphResults').mockImplementation(async function (...args) {
            inRead = true;
            try { const result = await read.apply(this, args); delivered = true; return result; } finally { inRead = false; }
        });
        const budgetSpy = jest.spyOn(BudgetPort.prototype, 'assertCurrent').mockImplementation(async function (...args) {
            const result = await budget.apply(this, args);
            if (inRead && !changed) {
                changed = true;
                const repo = new SettingsRepo({ engine: f.h.engine }), settings = await repo.get(f.h.handle);
                settings.atri_capabilities.memory_graph.recallEnabled = false; await repo.save(f.h.handle, settings);
            }
            return result;
        });
        try {
            await expect(f.run({ floor: 2 })).rejects.toThrow(); expect(changed).toBe(true); expect(delivered).toBe(false);
            expect(f.requests).toHaveLength(2); expect(f.calls).toHaveLength(3);
            expect((await new SettingsRepo({ engine: f.h.engine }).get(f.h.handle)).atri_capabilities.memory_graph.recallEnabled).toBe(false);
            expect((await currentRoot(f)).outputClaims).toEqual([]);
        } finally { readSpy.mockRestore(); budgetSpy.mockRestore(); await f.cleanup(); }
    }, 120000);

    test('unknown second-node embedding usage preserves earlier Result/fees and never resends or starts Narrator', async () => {
        const f = await setup(make, { providerUsage: (_body, ordinal) => ordinal === 3 ? null : { total_tokens: 7 } });
        try {
            await expect(f.run({ floor: 2 })).rejects.toThrow(); expect(f.calls).toHaveLength(3); expect(f.requests).toHaveLength(1);
            const bank = await compute(f), root = await currentRoot(f);
            expect(bank.attempts).toHaveLength(4); expect(bank.attempts.at(-1).status).toBe('unknown');
            expect(root.resultRefs).toHaveLength(1); expect(root.outputClaims).toEqual([]);
            await expect(f.run({ floor: 2 })).rejects.toThrow(); expect(await compute(f)).toEqual(bank); expect(f.calls).toHaveLength(3);
        } finally { await f.cleanup(); }
    }, 120000);

    test('cold aggregate history survives Source deletion and rejects rehashed unpinned Audience and Draft retrieval facts', async () => {
        const f = await setup(make); let cold;
        try {
            await f.run({ floor: 2 }); const root = await currentRoot(f);
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            await f.chats.delete(f.h.handle, 'Actor', 'main'); await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            expect((await cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).claim).toEqual(output.claim);
            const resultId = output.published.graphResults[0].record.resultId;
            await cold.withTransaction(f.h.handle, async tx => {
                const resultKey = controlRecordKey(f.h.handle, root.runId, 'result', resultId);
                const receiptKey = controlRecordKey(f.h.handle, root.runId, 'receipt', graphResultPublicationId(root.runId, resultId));
                const saved = await tx.getResource(resultKey), publication = await tx.getResource(receiptKey), doc = structuredClone(saved.doc);
                doc.envelope.sourceRefs.push({ kind: 'native_information_context', pinId: 'forged.audience', integrity: hash('forged'),
                    sourceRef: { kind: 'native_information_context', sessionId: createNativeId('session'), branchId: createNativeId('branch'),
                        revisionId: createNativeId('revision'), audience: { kind: 'narrator' } } });
                doc.envelope.dependencyDigest = resultDependencyDigest(doc.envelope);
                await putMutable(tx, resultKey, doc, { expectedIntegrity: saved.integrity });
                await putMutable(tx, receiptKey, { ...publication.doc, resultIntegrity: hash(doc) }, { expectedIntegrity: publication.integrity });
                await expect(readRpOutput(tx, f.h.handle, root)).rejects.toThrow('Invalid Graph Result facts');
                await tx.putResource(resultKey, saved); await tx.putResource(receiptKey, publication);
            });
            const child = output.published.graphResults[0].retrievalCompletions[0];
            await cold.withTransaction(f.h.handle, async tx => {
                const key = controlRecordKey(f.h.handle, root.runId, 'effect', child.effectId), record = await tx.getResource(key), doc = structuredClone(record.doc);
                doc.inputRef.contextForEffectId = createNativeId('orchestrationEffect'); doc.inputHash = hash(doc.inputRef);
                await putMutable(tx, key, doc, { expectedIntegrity: record.integrity });
            });
            await expect(cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).rejects.toThrow();
            expect(f.calls).toHaveLength(4); expect(f.requests).toHaveLength(3);
        } finally { await cold?.close(); await f.cleanup(); }
    }, 120000);
});
