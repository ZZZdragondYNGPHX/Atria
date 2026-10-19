import { contextRetrievalFixture } from './helpers/context-retrieval-fixture.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { controlRecordKey, runGuard } from '../../src/native/orchestration/controller-common.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { SettingsRepo } from '../../src/storage/repositories/settings-repo.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { createNativeId } from '../../src/native/identity.js';
import { ContextRetrievalPort } from '../../src/native/orchestration/context-retrieval-port.js';
import { jest } from '@jest/globals';
import fs from 'node:fs/promises';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { hashNativeDocument as hash, putMutable } from '../../src/native/repositories/common.js';
import { PROVENANCE_NAMESPACE } from '../../public/scripts/agents/memory/source-lifecycle.js';

const setup = (make, options) => contextRetrievalFixture(make, { embedding: true, ...options });
const currentRoot = f => f.h.engine.withTransaction(f.h.handle, async tx => (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }))[0].doc);
const compute = async f => Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0]?.compute;

describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s original RP Context embedding', (_name, make) => {
    test.each([false, true])('original index insert/query, reranking=%s, reaches the original Model/Result/Chat and closes every fee', async reranking => {
        const f = await setup(make, { reranking });
        try {
            const sourceMemory = await f.chats.getState(f.h.handle, 'Actor', 'main', PROVENANCE_NAMESPACE);
            const result = await f.run({ floor: 2 }), root = await currentRoot(f), bank = await compute(f);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(1);
            expect(f.calls.map(row => row.endpoint)).toEqual(['/v1/embeddings', '/v1/embeddings', ...reranking ? ['/v1/rerank'] : []]);
            expect(f.calls.every(row => row.auth === 'Bearer synthetic-rerank-secret')).toBe(true);
            expect(JSON.stringify(f.calls)).not.toContain('FUTURE FORBIDDEN MEMORY');
            expect(bank.attempts).toHaveLength(reranking ? 4 : 3);
            expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
            expect(bank.localWork.map(row => row.kind)).toEqual(['context_build', 'index_list', 'index_insert', 'index_query',
                'route_resolve', 'prompt_compile', 'generation_count', 'generation_render', 'rp_output']);
            expect(bank.localWork.every(row => row.status === 'settled' && row.usage.outcome === 'completed')).toBe(true);
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.published.retrievalCompletions).toHaveLength(reranking ? 3 : 2);
            expect(output.closure.effectIds).toHaveLength(reranking ? 5 : 4);
            expect(JSON.stringify({ root, output })).not.toContain('synthetic-rerank-secret');
            expect(await f.chats.getState(f.h.handle, 'Actor', 'main', PROVENANCE_NAMESPACE)).toEqual(sourceMemory);
        } finally { await f.cleanup(); }
    }, 60000);

    test('pronoun query uses the original legal scene seed rather than a new query projection', async () => {
        const f = await setup(make, { query: 'Why did she leave?' });
        try {
            expect((await f.run({ floor: 2 })).output.runStatus).toBe('completed');
            expect(f.calls).toHaveLength(2); expect(f.calls[1].body.input[0]).toContain('Why did she leave?');
            expect(f.calls[1].body.input[0]).toContain('Alice left because of a promise.');
            expect(JSON.stringify(f.calls)).not.toContain('FUTURE FORBIDDEN MEMORY');
        } finally { await f.cleanup(); }
    }, 60000);

    test.each(['unknown-usage', 'malformed-vector'])('%s preserves the original send and cost without publishing Model/Chat', async mode => {
        const f = await setup(make, { usage: mode !== 'unknown-usage', malformed: mode === 'malformed-vector' });
        try {
            await expect(f.run({ floor: 2 })).rejects.toThrow();
            expect(f.calls).toHaveLength(1); expect(f.requests).toHaveLength(0);
            const bank = await compute(f); expect(bank.attempts).toHaveLength(1);
            expect(bank.attempts[0].status).toBe(mode === 'unknown-usage' ? 'unknown' : 'settled');
            expect(bank.localWork.find(row => row.kind === 'index_insert').usage.outcome).toBe('failed');
            expect((await currentRoot(f)).outputClaims).toEqual([]);
            await expect(f.run({ floor: 2 })).rejects.toThrow(); expect(f.calls).toHaveLength(1); expect(await compute(f)).toEqual(bank);
        } finally { await f.cleanup(); }
    }, 60000);

    test.each(['settings', 'cancel'])('%s changed during embedding settles the real request and prevents Model/Chat', async change => {
        const f = await setup(make);
        try {
            f.onRerank(async () => {
                if (change === 'cancel') {
                    const root = await currentRoot(f);
                    await f.authority.execution.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), { ...runGuard(root), reasonCode: 'test_cancel' });
                } else {
                    const repo = new SettingsRepo({ engine: f.h.engine }), settings = await repo.get(f.h.handle);
                    settings.atri_capabilities.memory_graph.recallEnabled = false; await repo.save(f.h.handle, settings);
                }
            });
            await expect(f.run({ floor: 2 })).rejects.toThrow(); expect(f.calls).toHaveLength(1); expect(f.requests).toHaveLength(0);
            expect((await compute(f)).attempts).toMatchObject([{ status: 'settled', usage: { totalTokens: 7 } }]);
            expect((await currentRoot(f)).outputClaims).toEqual([]);
        } finally { await f.cleanup(); }
    }, 60000);

    test.each(['admit', 'settle'])('index %s ACK loss cannot turn lexical fallback into Model permission', async phase => {
        const f = await setup(make), budget = f.authority.execution.budgetPort;
        const method = phase === 'admit' ? 'chargeLocalWork' : 'settleLocalWork', original = budget[method].bind(budget); let lost = false;
        budget[method] = async (...args) => {
            const isIndex = phase === 'admit' ? args[1].attempt.kind === 'index_insert'
                : (await compute(f)).localWork.some(row => row.attemptId === args[2] && row.kind === 'index_insert');
            if (!lost && isIndex) { lost = true; await original(...args); throw new StorageCommitUnknownError(new Error('Synthetic index ACK loss')); }
            return original(...args);
        };
        try {
            await expect(f.run({ floor: 2 })).rejects.toThrow(); expect(lost).toBe(true); expect(f.requests).toHaveLength(0);
            expect(f.calls).toHaveLength(phase === 'admit' ? 0 : 1); const bank = await compute(f);
            expect(bank.localWork.find(row => row.kind === 'index_insert').status).toBe(phase === 'admit' ? 'charged' : 'settled');
            expect((await currentRoot(f)).outputClaims).toEqual([]);
            await expect(f.run({ floor: 2 })).rejects.toThrow(); expect(await compute(f)).toEqual(bank);
        } finally { await f.cleanup(); }
    }, 60000);

    test('ambient Engine transaction cannot contain an actual embedding send', async () => {
        const original = ContextRetrievalPort.prototype.openRecall;
        const spy = jest.spyOn(ContextRetrievalPort.prototype, 'openRecall').mockImplementation(async function (...args) {
            const recall = await original.apply(this, args), insert = recall.service.insert;
            recall.service.insert = input => this.runs.engine.withTransaction(args[0], () => insert(input));
            return recall;
        });
        const f = await setup(make);
        try {
            await expect(f.run({ floor: 2 })).rejects.toThrow();
            expect(f.calls).toHaveLength(0); expect(f.requests).toHaveLength(0); expect((await compute(f)).attempts).toEqual([]);
        } finally { spy.mockRestore(); await f.cleanup(); }
    }, 60000);

    test.each(['index_insert', 'index_query'])('withdrawal during final %s settlement keeps real fees and withholds Model/Chat', async kind => {
        const f = await setup(make), budget = f.authority.execution.budgetPort;
        const original = budget.settleLocalWork.bind(budget); let changed = false;
        budget.settleLocalWork = async (...args) => {
            const value = await original(...args);
            if (!changed && (await compute(f)).localWork.some(row => row.attemptId === args[2] && row.kind === kind)) {
                changed = true;
                const repo = new SettingsRepo({ engine: f.h.engine }), settings = await repo.get(f.h.handle);
                settings.atri_capabilities.memory_graph.recallEnabled = false; await repo.save(f.h.handle, settings);
            }
            return value;
        };
        try {
            await expect(f.run({ floor: 2 })).rejects.toThrow(); expect(changed).toBe(true); expect(f.requests).toHaveLength(0);
            expect(f.calls).toHaveLength(kind === 'index_insert' ? 1 : 2);
            expect((await compute(f)).attempts.every(row => row.status === 'settled')).toBe(true);
            expect((await currentRoot(f)).outputClaims).toEqual([]);
            const files = await fs.readdir(f.h.dirs.vectors, { recursive: true });
            expect(files.some(file => file.includes('.atri-index-work-'))).toBe(false);
        } finally { await f.cleanup(); }
    }, 60000);

    test.each(['mode', 'profile'])('cold embedding history rejects rehashed %s changes without restoring a grant', async field => {
        const f = await setup(make); let cold;
        try {
            await f.run({ floor: 2 }); const root = await currentRoot(f);
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            await f.chats.delete(f.h.handle, 'Actor', 'main'); await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            expect((await cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).claim).toEqual(output.claim);
            const effectId = output.published.retrievalCompletions[0].effectId;
            await cold.withTransaction(f.h.handle, async tx => {
                const key = controlRecordKey(f.h.handle, root.runId, 'effect', effectId), record = await tx.getResource(key), doc = structuredClone(record.doc);
                if (field === 'mode') doc.actionRef.mode = 'rerank';
                else doc.targetRef.nativeRetrievalRef.revision = createNativeId('revision');
                doc.inputHash = hash(doc.inputRef); await putMutable(tx, key, doc, { expectedIntegrity: record.integrity });
            });
            await expect(cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).rejects.toThrow();
            expect(f.calls).toHaveLength(2); expect(f.requests).toHaveLength(1);
        } finally { await cold?.close(); await f.cleanup(); }
    }, 60000);
});
