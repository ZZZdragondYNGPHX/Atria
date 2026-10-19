import { jest } from '@jest/globals';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpModelFixture } from './helpers/rp-model-fixture.js';
import { configureJudge } from './helpers/rp-judge-fixture.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { readRpJudgeCompletion } from '../../src/native/orchestration/rp-judge-contracts.js';
import { controlRecordKey, runGuard } from '../../src/native/orchestration/controller-common.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash, putMutable } from '../../src/native/repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { ModelPort } from '../../src/native/orchestration/model-port.js';

jest.setTimeout(60_000);
const selection = selectedCandidate => JSON.stringify({ selectedCandidate, reasonCode: 'candidate_selected' });
const response = index => (_body, ordinal) => ['CANDIDATE_A_PRIVATE_TEXT', 'CANDIDATE_B_PRIVATE_TEXT', selection(index), 'Final selected narration.'][ordinal - 1];

describe.each(CONTRACT_HARNESSES)('$name actual RP Model Judge', ({ make }) => {
    test.each([0, 1])('selects exact candidate %s through original Result/Model/Context and closes every original cost', async index => {
        const f = await rpModelFixture(make, { configurePlan: configureJudge, responsePayload: response(index) });
        let cold;
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(4);
            expect(root).toMatchObject({ status: 'completed', progress: { attempts: 5, edgeVisits: 5, reviews: 0 } });
            expect(root.resultRefs).toHaveLength(3); expect(root.pendingApprovalRefs).toEqual([]);
            const judgeInput = JSON.stringify(f.requests[2]), narratorInput = JSON.stringify(f.requests[3]);
            expect(judgeInput).toContain('CANDIDATE_A_PRIVATE_TEXT'); expect(judgeInput).toContain('CANDIDATE_B_PRIVATE_TEXT');
            expect(narratorInput).toContain(index === 0 ? 'CANDIDATE_A_PRIVATE_TEXT' : 'CANDIDATE_B_PRIVATE_TEXT');
            expect(narratorInput).not.toContain(index === 0 ? 'CANDIDATE_B_PRIVATE_TEXT' : 'CANDIDATE_A_PRIVATE_TEXT');
            expect(JSON.stringify(f.requests[1])).not.toContain('CANDIDATE_A_PRIVATE_TEXT');
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.closure.effectIds).toHaveLength(5); expect(output.published.judgeCompletion.receipt.selectedResultRef).toEqual(root.resultRefs[index]);
            const chat = await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name);
            expect(chat.body).toHaveLength(3);
            await f.chats.delete(f.h.handle, f.locator.charDir, f.locator.name); await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            expect((await cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).claim).toEqual(output.claim);
            const receipt = output.published.judgeCompletion.receipt, key = controlRecordKey(f.h.handle, root.runId, 'receipt', receipt.receiptId);
            await cold.withTransaction(f.h.handle, async tx => {
                const row = await tx.getResource(key);
                await putMutable(tx, key, { ...row.doc, selectedResultRef: root.resultRefs[1 - index] }, { expectedIntegrity: row.integrity });
            });
            await expect(cold.withTransaction(f.h.handle, tx => readRpJudgeCompletion(tx, f.h.handle, root, receipt.producerAttemptId))).rejects.toThrow('Invalid RP Judge completion facts');
        } finally { await cold?.close(); await f.cleanup(); }
    });
    test.each(['not JSON', selection(2), JSON.stringify({ selectedCandidate: '0', reasonCode: 'candidate_selected' }),
        JSON.stringify({ selectedCandidate: 0, reasonCode: 'grant_approved' }), JSON.stringify({ selectedCandidate: 0, reasonCode: 'candidate_selected', approved: true })])('invalid selection %s never dispatches Narrator or claims output', async invalid => {
        const f = await rpModelFixture(make, { configurePlan: configureJudge, responsePayload: (_body, ordinal) => ordinal < 3 ? 'Draft ' + ordinal : invalid });
        try {
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(3);
            const [row] = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            expect(row.doc.outputClaims).toEqual([]); expect(row.doc.status).toBe('blocked');
            const compute = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
            expect(compute.attempts).toHaveLength(3); expect(compute.attempts.every(row => row.status === 'settled')).toBe(true);
        } finally { await f.cleanup(); }
    });
    test.each(['binding', 'cancel'])('%s during Judge response stops late selection adoption and Narrator send', async change => {
        const f = await rpModelFixture(make, { configurePlan: configureJudge, responsePayload: response(0) });
        f.onResponse(async () => {
            if (f.requests.length !== 3) return;
            if (change === 'binding') {
                const binding = await f.plans.getBinding(f.h.handle, f.sourceSelector);
                await f.plans.saveBinding(f.h.handle, createNativeId('orchestrationCommand'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
            } else {
                const [row] = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
                await f.authority.execution.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), { ...runGuard(row.doc), reasonCode: 'controlled_user_cancel' });
            }
        });
        try {
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(3);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        } finally { await f.cleanup(); }
    });
    test.each(['saved', 'no_save'])('Judge settlement ACK %s observes metadata without repeating paid work', async ack => {
        const f = await rpModelFixture(make, { configurePlan: configureJudge, responsePayload: response(0) });
        const transaction = f.h.engine.withTransaction.bind(f.h.engine); let injected = false;
        f.h.engine.withTransaction = async (handle, callback, ...options) => {
            const outer = !f.h.engine.hasActiveTransaction(handle);
            const value = await transaction(handle, async tx => {
                const result = await callback(tx);
                if (outer && !injected && ack === 'no_save' && result?.outcome?.judgeReceiptRef) { injected = true; throw new StorageCommitUnknownError({ operation: 'controlled-judge' }); }
                return result;
            }, ...options);
            if (outer && !injected && ack === 'saved' && value?.outcome?.judgeReceiptRef) { injected = true; throw new StorageCommitUnknownError({ operation: 'controlled-judge' }); }
            return value;
        };
        try {
            const result = await f.run().then(value => ({ value }), error => ({ error }));
            expect(injected).toBe(true); expect(result.error?.code ?? result.value.output.runStatus).toBe(ack === 'saved' ? 'completed' : 'storage_commit_unknown');
            expect(f.requests).toHaveLength(ack === 'saved' ? 4 : 3);
        } finally { f.h.engine.withTransaction = transaction; await f.cleanup(); }
    });
    test.each(['binding', 'cancel'])('same-transaction %s during final Judge proof survives denied adoption', async change => {
        const f = await rpModelFixture(make, { configurePlan: configureJudge, responsePayload: response(1) });
        const inspect = ModelPort.prototype.inspectResultCompletion; let changed = false;
        const spy = jest.spyOn(ModelPort.prototype, 'inspectResultCompletion').mockImplementation(async function (handle, request) {
            const proof = await inspect.call(this, handle, request);
            if (!changed && f.requests.length === 3 && f.h.engine.hasActiveTransaction(handle)) {
                changed = true;
                if (change === 'binding') {
                    const binding = await f.plans.getBinding(handle, f.sourceSelector);
                    await f.plans.saveBinding(handle, createNativeId('orchestrationCommand'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
                } else await f.authority.execution.runs.cancel(handle, createNativeId('orchestrationCommand'), {
                    ...runGuard(await f.authority.execution.runs.get(handle, request.runId)), reasonCode: 'controlled_user_cancel' });
            }
            return proof;
        });
        try {
            await expect(f.run()).rejects.toThrow(); expect(changed).toBe(true); expect(f.requests).toHaveLength(3);
            expect((await f.plans.getBinding(f.h.handle, f.sourceSelector)).version).toBe(change === 'binding' ? 1 : 0);
            const [row] = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            expect(row.doc.cancelRequested).toBe(change === 'cancel'); expect(row.doc.outputClaims).toEqual([]);
        } finally { spy.mockRestore(); await f.cleanup(); }
    });
    test('unknown Model usage preserves legal output and all costs with a completed output and estimated charges', async () => {
        const f = await rpModelFixture(make, { configurePlan: configureJudge, responsePayload: response(1), usage: false });
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('completed'); expect(root.outputClaims).toEqual([result.output.outputClaimRef]); expect(f.requests).toHaveLength(4);
            const selected = await f.h.engine.withTransaction(f.h.handle, tx => readRpJudgeCompletion(tx, f.h.handle, root, root.attemptRefs[2]));
            expect(hash(selected.receipt.selectedResultRef)).toBe(hash(root.resultRefs[1]));
        } finally { await f.cleanup(); }
    });
});
