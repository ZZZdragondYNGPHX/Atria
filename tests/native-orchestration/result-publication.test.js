/* eslint-disable jest/no-conditional-expect -- Parameterized real authority changes and ACK boundaries have distinct persisted outcomes. */
import { jest } from '@jest/globals';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpDelegationFixture, runDelegationMetadata } from './helpers/rp-delegation-fixture.js';
import { RP_MODEL_TEXT } from './helpers/rp-model-fixture.js';
import { ResultController } from '../../src/native/orchestration/result-controller.js';
import { ModelPort } from '../../src/native/orchestration/model-port.js';
import { BudgetPort } from '../../src/native/orchestration/budget-port.js';
import { readResultPublication, modelResultId } from '../../src/native/orchestration/result-publication-contracts.js';
import { readAttempt, controlRecordKey, runGuard } from '../../src/native/orchestration/controller-common.js';
import { attemptReceiptId } from '../../src/native/orchestration/attempt-settlement.js';
import { checkedRecord } from '../../src/native/orchestration/plan-repository.js';
import { createNativeId } from '../../src/native/identity.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';

const sql = process.env.ATRIA_TEST_RESULT_PUBLICATION_SQL === '1';
if (sql) jest.setTimeout(60000);
const harnesses = CONTRACT_HARNESSES.filter(({ name }) => sql || ['FsEngine', 'SqliteEngine'].includes(name));
const operation = async f => Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0];
const originalPublish = ResultController.prototype.publishModelResult;
async function withPublication(f, before) {
    let hookError;
    ResultController.prototype.publishModelResult = async function (handle, request) {
        try { await before(this, handle, request); } catch (error) { hookError = error; throw error; }
        return originalPublish.call(this, handle, request);
    };
    try { return await runDelegationMetadata(f); } catch (error) { throw hookError ?? error; }
    finally { ResultController.prototype.publishModelResult = originalPublish; }
}
async function unpublished(f) {
    const service = f.authority.execution, effect = f.effects[0], root = await service.runs.get(f.h.handle, effect.runId);
    await f.h.engine.withTransaction(f.h.handle, async tx => {
        expect(await readResultPublication(tx, f.h.handle, root, modelResultId(root.runId, effect.effectId))).toBeNull();
        expect((await readAttempt(tx, f.h.handle, root, root.attemptRefs[0])).doc.status).toBe('running');
        expect(await checkedRecord(tx, controlRecordKey(f.h.handle, root.runId, 'receipt', attemptReceiptId(root.runId, root.attemptRefs[0])))).toBeNull();
    });
    expect(root.resultRefs).toEqual([]); expect(root.outputClaims).toEqual([]);
    expect((await operation(f)).compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
    expect(f.requests).toHaveLength(1);
    return root;
}

describe.each(harnesses)('$name original RP child Result publication', ({ make }) => {
    test.each([true, false])('actual Model usage=%s publishes protected text with exact recipient metadata and no disclosure', async usage => {
        const f = await rpDelegationFixture(make, { usage }); let controller, actual, result;
        try {
            result = await withPublication(f, async (port, _handle, request) => { controller = port; actual = request; });
            expect(result.status).toBe(usage ? 'returned' : 'pending_output'); expect(JSON.stringify(result)).not.toContain(RP_MODEL_TEXT);
            const root = await f.authority.execution.runs.get(f.h.handle, result.childRunId), parent = await f.authority.execution.runs.get(f.h.handle, result.parentRunId);
            const facts = await f.h.engine.withTransaction(f.h.handle, tx => readResultPublication(tx, f.h.handle, root, result.resultRef.resultId));
            expect(facts.record.payload).toBe(RP_MODEL_TEXT);
            expect(facts.record.envelope).toMatchObject({ status: 'complete', outputType: 'text', audienceConstraint: { kind: 'parent_attempt',
                parentRunId: result.parentRunId, parentAttemptId: result.parentAttemptId, parentEpoch: parent.epoch, taskPurpose: 'original_rp_delegation' },
            disclosureConstraint: { kind: 'same_source_parent_only' } });
            expect(facts.attemptReceipt).toMatchObject({ outcome: 'completed', resultRefs: [result.resultRef], effectReceiptRefs: [result.receiptRef.receiptId] });
            expect(root.status).toBe(usage ? 'completed' : 'running'); expect(root.resultRefs).toEqual([result.resultRef]); expect(root.outputClaims).toHaveLength(usage ? 1 : 0);
            expect((await f.h.engine.withTransaction(f.h.handle, tx => readAttempt(tx, f.h.handle, parent, result.parentAttemptId))).doc.status).toBe(usage ? 'running' : 'waiting_child');
            const bank = (await operation(f)).compute;
            expect(bank.attempts[0].status).toBe(usage ? 'settled' : 'unknown');
            expect(bank.reservations[0].status).toBe(usage ? 'released' : 'held'); expect(bank.limits).toEqual(f.parentRoute.executionPolicy.computeBudget);
            expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(2);
            const observed = await controller.observe(f.h.handle, result.resultRef);
            expect(observed).toEqual({ status: 'published', resultRef: result.resultRef, publicationReceiptRef: result.publicationReceiptRef });
            expect(JSON.stringify(observed)).not.toContain(RP_MODEL_TEXT);
            await expect(originalPublish.call(controller, f.h.handle, actual)).rejects.toThrow();
            await expect(runDelegationMetadata(f)).rejects.toThrow(); expect((await operation(f)).compute).toEqual(bank); expect(f.requests).toHaveLength(usage ? 2 : 1);
        } finally { await f.cleanup(); }
    });

    test('JSON wrappers, another Port, payload/Audience arguments and physical receipt corruption cannot become publication authority', async () => {
        const f = await rpDelegationFixture(make); let checked = false;
        try {
            const published = await withPublication(f, async (controller, handle, request) => {
                await expect(originalPublish.call(controller, handle, { ...request, result: structuredClone(request.result) }))
                    .rejects.toMatchObject({ code: 'native_orchestration_model_result_completion_required' });
                await expect(originalPublish.call(controller, handle, { ...request, audienceConstraint: { kind: 'all' } })).rejects.toThrow();
                await expect(originalPublish.call(controller, handle, { ...request, payload: 'caller body' })).rejects.toThrow();
                const other = new ResultController({ host: f.host, modelPort: new ModelPort({ host: f.host, ...f.authority.execution }) });
                await expect(originalPublish.call(other, handle, request)).rejects.toMatchObject({ code: 'native_orchestration_model_result_completion_required' });
                const delegates = f.authority.execution.delegates, authorize = delegates.authorizeDelegation;
                for (const field of ['allowed', 'effectiveGrantDigest', 'parentGrantDigest', 'budgetCeilingDigest', 'sourceBindingDigest']) {
                    delegates.authorizeDelegation = async (...args) => ({ ...await authorize(...args), [field]: field === 'allowed' ? false : 'c'.repeat(64) });
                    try { await expect(originalPublish.call(controller, handle, request)).rejects.toMatchObject({ code: 'native_orchestration_delegation_denied' }); }
                    finally { delegates.authorizeDelegation = authorize; }
                }
                checked = true;
            });
            expect(checked).toBe(true);
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const root = await f.authority.execution.runs.get(f.h.handle, published.childRunId);
                const key = controlRecordKey(f.h.handle, root.runId, 'receipt', published.publicationReceiptRef.receiptId), original = await tx.getResource(key);
                const changed = { ...original.doc, audienceDigest: 'a'.repeat(64) };
                try {
                    await tx.putResource(key, { ...original, doc: changed, integrity: hash(changed) });
                    await expect(readResultPublication(tx, f.h.handle, root, published.resultRef.resultId)).rejects.toThrow('Invalid Result publication facts');
                } finally { await tx.putResource(key, original); }
                const effectKey = controlRecordKey(f.h.handle, root.runId, 'receipt', published.receiptRef.receiptId), effect = await tx.getResource(effectKey);
                // Honest storage hashes do not make mismatched original Model
                // completion identities valid. Restore exact fixture bytes.
                for (const field of ['completionBindingDigest', 'observationId', 'receiptId']) {
                    const corrupt = structuredClone(effect.doc);
                    if (field === 'observationId') corrupt.observationId = 'wrong-original-observation';
                    else if (field === 'receiptId') corrupt.receiptId = createNativeId('orchestrationReceipt');
                    else corrupt.dispatchEvidence.reference.completionBindingDigest = 'b'.repeat(64);
                    try {
                        await tx.putResource(effectKey, { ...effect, doc: corrupt, integrity: hash(corrupt) });
                        await expect(readResultPublication(tx, f.h.handle, root, published.resultRef.resultId)).rejects.toThrow('Invalid Result publication facts');
                    } finally { await tx.putResource(effectKey, effect); }
                }
            });
            expect(f.requests).toHaveLength(2);
        } finally { await f.cleanup(); }
    });

    test('an already published Result remains a historical protected fact after a lawful parent cancel without restoring body or publication permission', async () => {
        const f = await rpDelegationFixture(make); let controller, actual;
        try {
            const published = await withPublication(f, async (port, _handle, request) => { controller = port; actual = request; });
            const service = f.authority.execution, parent = await service.runs.get(f.h.handle, published.parentRunId), before = (await operation(f)).compute;
            await service.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), { ...runGuard(parent), reasonCode: 'parent_cancel_after_result_publication' });
            expect((await service.runs.get(f.h.handle, parent.runId)).cancelRequested).toBe(true);
            const child = await service.runs.get(f.h.handle, published.childRunId);
            expect((await f.h.engine.withTransaction(f.h.handle, tx => readResultPublication(tx, f.h.handle, child, published.resultRef.resultId))).record.payload).toBe(RP_MODEL_TEXT);
            expect(await controller.observe(f.h.handle, published.resultRef)).toEqual({ status: 'published', resultRef: published.resultRef,
                publicationReceiptRef: published.publicationReceiptRef });
            await expect(originalPublish.call(controller, f.h.handle, actual)).rejects.toThrow();
            expect((await operation(f)).compute).toEqual(before); expect(f.requests).toHaveLength(2); expect(child.outputClaims).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test('an explicit byte bound rejects the actual oversized Model text without any Result or settlement fragment', async () => {
        const f = await rpDelegationFixture(make, { configureChildPlan: plan => { plan.definition.outputContract.resultPolicy.maxBytes = 1; } });
        try { await expect(runDelegationMetadata(f)).rejects.toThrow(); await unpublished(f); }
        finally { await f.cleanup(); }
    });

    test.each(['parent_cancel', 'binding', 'user_edit', 'user_delete', 'history', 'chat_delete', 'relocated'])('%s at the final actual completion bank read commits the lawful change before refusing all publication writes', async change => {
        const f = await rpDelegationFixture(make), verify = BudgetPort.prototype.verifyBudgetAttempt;
        let armed = false, injected = false, changedRoot, expectedBody, expectedBinding;
        BudgetPort.prototype.verifyBudgetAttempt = async function (args) {
            const observed = await verify.call(this, args);
            if (armed && !injected) {
                injected = true;
                if (change === 'parent_cancel') {
                    const child = await f.authority.execution.runs.get(f.h.handle, args.root.runId);
                    const parent = await f.authority.execution.runs.get(f.h.handle, child.parentRef.parentRunId);
                    changedRoot = await f.authority.execution.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), {
                        ...runGuard(parent), reasonCode: 'parent_cancel_during_result_preflight' });
                } else if (change === 'binding') {
                    const binding = await f.plans.getBinding(f.h.handle, f.sourceSelector); expectedBinding = binding.version + 1;
                    await f.plans.saveBinding(f.h.handle, createNativeId('orchestrationCommand'), {
                        sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
                } else if (change === 'chat_delete') {
                    expectedBody = null; await f.chats.delete(f.h.handle, 'Actor', 'main');
                } else {
                    const chat = await f.chats.get(f.h.handle, 'Actor', 'main');
                    if (change === 'relocated') chat.header.chat_metadata.nativeControlId = '';
                    else if (change === 'user_delete') chat.body.pop();
                    else chat.body[change === 'user_edit' ? 1 : 0].mes = 'Lawful original source write during Result preflight';
                    expectedBody = structuredClone(chat.body);
                    await f.chats.save(f.h.handle, 'Actor', 'main', chat.header, chat.body, chat.integrity);
                }
            }
            return observed;
        };
        try {
            const outcome = await withPublication(f, async () => { armed = true; }).then(value => ({ value }), error => ({ error }));
            expect(outcome.error).toBeDefined();
            expect(injected).toBe(true);
            if (change === 'parent_cancel') expect((await f.authority.execution.runs.get(f.h.handle, changedRoot.runId)).cancelRequested).toBe(true);
            else if (change === 'binding') expect((await f.plans.getBinding(f.h.handle, f.sourceSelector)).version).toBe(expectedBinding);
            else if (change === 'relocated') expect({ header: (await f.chats.get(f.h.handle, 'Actor', 'main')).header.chat_metadata.nativeControlId,
                code: outcome.error.cause?.code ?? outcome.error.code }).toEqual({ header: '', code: 'native_orchestration_result_publication_stale' });
            else expect({ body: (await f.chats.get(f.h.handle, 'Actor', 'main'))?.body ?? null, code: outcome.error.cause?.code ?? outcome.error.code })
                .toEqual({ body: expectedBody, code: 'native_orchestration_result_publication_stale' });
            await unpublished(f);
        } finally { armed = false; BudgetPort.prototype.verifyBudgetAttempt = verify; await f.cleanup(); }
    });

    test.each(['saved', 'no_save'])('%s outer Engine ACK loss only observes complete durable facts and cold reads never resend or mint completion', async boundary => {
        const f = await rpDelegationFixture(make), transaction = f.h.engine.withTransaction.bind(f.h.engine);
        let armed = false, injected = false, controller, actual, cold;
        f.h.engine.withTransaction = async (handle, callback, ...options) => {
            const value = await transaction(handle, async tx => {
                const candidate = await callback(tx);
                if (armed && !injected && candidate?.denied === false && candidate.resultRef && boundary === 'no_save') {
                    injected = true; throw new StorageCommitUnknownError(new Error('Synthetic ACK uncertainty before the outer Engine commit'));
                }
                return candidate;
            }, ...options);
            if (armed && !injected && value?.denied === false && value.resultRef && boundary === 'saved') {
                injected = true; throw new StorageCommitUnknownError(new Error('Synthetic ACK loss after the actual outer Engine commit'));
            }
            return value;
        };
        try {
            const completion = await withPublication(f, async (port, _handle, request) => { controller = port; actual = request; armed = true; })
                .then(value => ({ value }), error => ({ error }));
            expect(injected).toBe(true); armed = false;
            const effect = f.effects[0], resultRef = { runId: effect.runId, resultId: modelResultId(effect.runId, effect.effectId) };
            expect(completion.error === undefined).toBe(boundary === 'saved');
            if (boundary === 'saved') expect(completion.value.status).toBe('returned');
            else await unpublished(f);
            const bank = (await operation(f)).compute;
            await expect(originalPublish.call(controller, f.h.handle, actual)).rejects.toThrow();
            await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            const facts = await cold.withTransaction(f.h.handle, async tx => {
                const root = (await checkedRecord(tx, { kind: K.orchestrationRun, handle: f.h.handle, runId: effect.runId })).doc;
                return readResultPublication(tx, f.h.handle, root, resultRef.resultId);
            });
            expect(facts !== null).toBe(boundary === 'saved');
            if (facts) expect(facts.record.payload).toBe(RP_MODEL_TEXT);
            const oldPortClone = new ModelPort({ host: f.host, ...f.authority.execution });
            await expect(ModelPort.prototype.inspectResultCompletion.call(oldPortClone, f.h.handle, { result: facts, runId: effect.runId, effectId: effect.effectId }))
                .rejects.toMatchObject({ code: 'native_orchestration_model_result_completion_required' });
            const storedControl = await cold.withTransaction(f.h.handle, tx => tx.getResource({ kind: K.rpRunControl, handle: f.h.handle, controlId: f.controlId }));
            expect(Object.values(storedControl.doc.operations)[0].compute).toEqual(bank);
            expect(f.requests).toHaveLength(boundary === 'saved' ? 2 : 1);
        } finally { armed = false; f.h.engine.withTransaction = transaction; await cold?.close(); await f.cleanup(); }
    });

    test('a failure after all reducer writes rolls the whole original Engine transaction back instead of committing partial Result metadata', async () => {
        const f = await rpDelegationFixture(make), service = f.authority.execution, control = service.runs.control.bind(service.runs);
        let injected = false;
        service.runs.control = (handle, commandId, body, reduce, ...options) => control(handle, commandId, body, async args => {
            const result = await reduce(args);
            if (body.operation === 'result.publish') { injected = true; throw new Error('Synthetic writer failure after Result/receipt/settlement writes'); }
            return result;
        }, ...options);
        try { await expect(runDelegationMetadata(f)).rejects.toThrow(); expect(injected).toBe(true); await unpublished(f); }
        finally { service.runs.control = control; await f.cleanup(); }
    });
});
