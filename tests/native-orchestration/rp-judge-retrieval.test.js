import { jest } from '@jest/globals';
import { contextRetrievalFixture } from './helpers/context-retrieval-fixture.js';
import { configureJudge } from './helpers/rp-judge-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { hashNativeDocument as hash, putMutable } from '../../src/native/repositories/common.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { readRpJudgeCompletion } from '../../src/native/orchestration/rp-judge-contracts.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { createNativeId } from '../../src/native/identity.js';
import { ModelPort } from '../../src/native/orchestration/model-port.js';
import { SettingsRepo } from '../../src/storage/repositories/settings-repo.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';

const responsePayload = (_body, ordinal) => ['CANDIDATE_A_PRIVATE_TEXT', 'CANDIDATE_B_PRIVATE_TEXT',
    JSON.stringify({ selectedCandidate: 1, reasonCode: 'candidate_selected' }), 'Final selected narration.'][ordinal - 1];
const setup = (make, options = {}) => contextRetrievalFixture(make, { embedding: true, responsePayload, ...options,
    afterPlan: async (plan, args) => {
        await configureJudge(plan, args);
        const pins = plan.dependencyPins.filter(pin => pin.port === 'context').map(pin => pin.pinId);
        for (const node of plan.definition.nodes.filter(node => node.kind !== 'output')) {
            node.capabilities = ['generation.send', 'memory.retrieve'];
            node.dependencyPinIds = [...new Set([...node.dependencyPinIds, ...pins])];
        }
        plan.definition.capabilityCeiling.push('memory.retrieve');
        for (const pin of plan.dependencyPins.filter(pin => pin.port === 'model')) {
            const route = await args.host.persistence.getRuntimeRoute(args.h.handle, pin.resourceRef.runtimeRouteId);
            await args.host.persistence.saveRuntimeRoute(args.h.handle, { ...route, executionPolicy: { ...route.executionPolicy,
                computeBudget: { ...route.executionPolicy.computeBudget, maxRequests: 16,
                    localWork: { ...route.executionPolicy.computeBudget.localWork, maxJobs: 48 } } } });
            pin.integrity = hash(await args.host.persistence.getRuntimeRoute(args.h.handle, route.runtimeRouteId));
        }
    } });
const rootOf = f => f.h.engine.withTransaction(f.h.handle, async tx => (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }))[0].doc);
const bankOf = async f => Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;

describe.each(CONTRACT_HARNESSES)('$name original RP Judge retrieval', ({ make }) => {
    test.each([false, true])('candidate, Judge and Narrator own exact retrieval Effects and one output closure, reranking=%s', async reranking => {
        const f = await setup(make, { reranking }); let cold;
        try {
            const result = await f.run({ floor: 2 }), root = await rootOf(f), bank = await bankOf(f);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(4);
            expect(f.calls.filter(row => row.endpoint === '/v1/embeddings')).toHaveLength(5);
            expect(f.calls.filter(row => row.endpoint === '/v1/rerank')).toHaveLength(reranking ? 4 : 0);
            expect(JSON.stringify(f.calls)).not.toContain('FUTURE FORBIDDEN MEMORY');
            expect(JSON.stringify(f.requests[2])).toContain('CANDIDATE_A_PRIVATE_TEXT');
            expect(JSON.stringify(f.requests[2])).toContain('CANDIDATE_B_PRIVATE_TEXT');
            expect(JSON.stringify(f.requests[3])).toContain('CANDIDATE_B_PRIVATE_TEXT');
            expect(JSON.stringify(f.requests[3])).not.toContain('CANDIDATE_A_PRIVATE_TEXT');
            expect(bank.attempts).toHaveLength(reranking ? 13 : 9);
            expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.published.judgeCompletion.retrievalCompletions).toHaveLength(reranking ? 2 : 1);
            expect(output.published.retrievalCompletions).toHaveLength(reranking ? 9 : 5);
            expect(output.closure.effectIds).toHaveLength(reranking ? 14 : 10);
            await f.chats.delete(f.h.handle, 'Actor', 'main'); await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            expect((await cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).claim).toEqual(output.claim);
            const completion = output.published.judgeCompletion, child = completion.retrievalCompletions[0];
            await cold.withTransaction(f.h.handle, async tx => {
                const key = controlRecordKey(f.h.handle, root.runId, 'effect', child.effectId), record = await tx.getResource(key), doc = structuredClone(record.doc);
                doc.inputRef.contextForEffectId = createNativeId('orchestrationEffect'); doc.inputHash = hash(doc.inputRef);
                await putMutable(tx, key, doc, { expectedIntegrity: record.integrity });
            });
            await expect(cold.withTransaction(f.h.handle, tx => readRpJudgeCompletion(tx, f.h.handle, root, completion.producer.attemptId))).rejects.toThrow();
            expect(f.requests).toHaveLength(4);
        } finally { await cold?.close(); await f.cleanup(); }
    }, 180000);

    test.each(['saved', 'no_save'])('Judge selection ACK %s never repeats retrieval or Model fees', async ack => {
        const f = await setup(make), transaction = f.h.engine.withTransaction.bind(f.h.engine); let injected = false;
        f.h.engine.withTransaction = async (handle, callback, ...options) => {
            const outer = !f.h.engine.hasActiveTransaction(handle);
            const value = await transaction(handle, async tx => {
                const result = await callback(tx);
                if (outer && !injected && ack === 'no_save' && result?.outcome?.judgeReceiptRef) {
                    injected = true; throw new StorageCommitUnknownError({ operation: 'controlled-judge-retrieval' });
                }
                return result;
            }, ...options);
            if (outer && !injected && ack === 'saved' && value?.outcome?.judgeReceiptRef) {
                injected = true; throw new StorageCommitUnknownError({ operation: 'controlled-judge-retrieval' });
            }
            return value;
        };
        try {
            const result = await f.run({ floor: 2 }).then(value => ({ value }), error => ({ error }));
            expect(injected).toBe(true); expect(result.error?.code ?? result.value.output.runStatus).toBe(ack === 'saved' ? 'completed' : 'storage_commit_unknown');
            expect(f.requests).toHaveLength(ack === 'saved' ? 4 : 3); expect(f.calls).toHaveLength(ack === 'saved' ? 5 : 4);
            const bank = await bankOf(f); expect(bank.attempts).toHaveLength(ack === 'saved' ? 9 : 7);
            await expect(f.run({ floor: 2 })).rejects.toThrow(); expect(await bankOf(f)).toEqual(bank);
        } finally { f.h.engine.withTransaction = transaction; await f.cleanup(); }
    }, 180000);

    test('unknown Judge embedding usage preserves both candidates and fees without selection or Narrator resend', async () => {
        const f = await setup(make, { providerUsage: (_body, ordinal) => ordinal === 4 ? null : { total_tokens: 7 } });
        try {
            await expect(f.run({ floor: 2 })).rejects.toThrow(); const bank = await bankOf(f), root = await rootOf(f);
            expect(f.calls).toHaveLength(4); expect(f.requests).toHaveLength(2);
            expect(bank.attempts).toHaveLength(6); expect(bank.attempts.at(-1).status).toBe('unknown');
            expect(root.resultRefs).toHaveLength(2); expect(root.outputClaims).toEqual([]);
            await expect(f.run({ floor: 2 })).rejects.toThrow(); expect(await bankOf(f)).toEqual(bank); expect(f.calls).toHaveLength(4);
        } finally { await f.cleanup(); }
    }, 120000);

    test('Memory withdrawal during final Judge proof survives the transaction and denies selection and Narrator', async () => {
        const f = await setup(make), original = ModelPort.prototype.inspectResultCompletion; let changed = false;
        const spy = jest.spyOn(ModelPort.prototype, 'inspectResultCompletion').mockImplementation(async function (handle, request) {
            const proof = await original.call(this, handle, request);
            if (!changed && f.requests.length === 3 && f.h.engine.hasActiveTransaction(handle)) {
                changed = true; const repo = new SettingsRepo({ engine: f.h.engine }), settings = await repo.get(handle);
                settings.atri_capabilities.memory_graph.recallEnabled = false; await repo.save(handle, settings);
            }
            return proof;
        });
        try {
            await expect(f.run({ floor: 2 })).rejects.toThrow(); expect(changed).toBe(true);
            expect(f.requests).toHaveLength(3); expect(f.calls).toHaveLength(4);
            expect((await new SettingsRepo({ engine: f.h.engine }).get(f.h.handle)).atri_capabilities.memory_graph.recallEnabled).toBe(false);
            const root = await rootOf(f); expect(root.outputClaims).toEqual([]); expect(root.resultRefs).toHaveLength(2);
            expect(await f.h.engine.withTransaction(f.h.handle, tx => readRpJudgeCompletion(tx, f.h.handle, root, root.attemptRefs[2]))).toBeNull();
        } finally { spy.mockRestore(); await f.cleanup(); }
    }, 120000);
});
