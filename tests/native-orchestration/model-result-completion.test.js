import { modelPortFixture } from './helpers/model-port-fixture.js';
import { resolverTurnFixture } from './helpers/resolver-turn-fixture.js';
import { jest } from '@jest/globals';
import { ModelPort } from '../../src/native/orchestration/model-port.js';
import { BudgetPort } from '../../src/native/orchestration/budget-port.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { runGuard } from '../../src/native/orchestration/controller-common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { SourcePort } from '../../src/native/orchestration/source-port.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';

if (process.env.ATRIA_TEST_MODEL_RESULT_SQL === '1') jest.setTimeout(60_000);

const originalText = 'Synthetic native narrator response.';
const stopBeforeFinalize = new Error('Fixture stops after completion inspection, before original Native finalize.');

// The hook observes the real ModelPort return. It never issues a scope, sends
// a callback-produced model response, publishes a Result or grants a recipient.
function onCompletion(f, callback) {
    const generate = ModelPort.prototype.generate.bind(f.port);
    f.port.generate = async (...args) => { const result = await generate(...args); await callback(result); return result; };
}

const inspect = (f, result, overrides = {}) => ModelPort.prototype.inspectResultCompletion.call(f.port, f.h.handle,
    { result, ...f.effectRef, ...overrides });

describe.each(CONTRACT_HARNESSES.filter(({ name }) => process.env.ATRIA_TEST_MODEL_RESULT_SQL === '1' || ['FsEngine', 'SqliteEngine'].includes(name)))('$name original Model Result completion', ({ make }) => {
    test.each([true, false])('real usage=%s response gets an immutable completion descriptor without persisting its body or changing billing facts', async usage => {
        const f = await modelPortFixture(make, { usage }); let actual, descriptor, before;
        try {
            onCompletion(f, async result => {
                actual = result; descriptor = await inspect(f, result);
                const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId); before = root;
                expect(descriptor).toEqual({ ...f.effectRef, producerAttemptId: root.attemptRefs[0], epoch: root.epoch,
                    sourceBinding: root.sourceBinding, receiptRef: result.receiptRef, payloadHash: hash(originalText), outputType: 'text' });
                expect(Object.isFrozen(descriptor.sourceBinding)).toBe(true);
                expect(root.resultRefs).toEqual([]); expect(root.status).toBe('running');
                expect(JSON.stringify(descriptor)).not.toContain(originalText);
            });
            await f.start(); expect(actual.generated.response.text).toBe(originalText); expect(f.requests).toHaveLength(1);
            const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[before.budgetAuthorityRef.operationId].compute;
            expect(bank.attempts).toHaveLength(1); expect(bank.attempts[0].status).toBe(usage ? 'settled' : 'unknown');
            const receipt = await f.observe(); expect(receipt.outcome).toBe('confirmed');
            expect(JSON.stringify(receipt)).not.toContain(originalText);
            await f.cold();
            await expect(inspect(f, actual)).rejects.toMatchObject({ code: 'native_orchestration_model_result_completion_required' });
            await expect(inspect(f, await f.observe())).rejects.toMatchObject({ code: 'native_orchestration_model_result_completion_required' });
            expect(await f.observe()).toEqual(receipt); expect(f.requests).toHaveLength(1);
            expect((await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[before.budgetAuthorityRef.operationId].compute).toEqual(bank);
        } finally { await f.cleanup(); }
    });

    test('copied wrappers, another Port/owner/run/effect, replaced payload and wrong receipt cannot borrow the actual completion', async () => {
        const f = await modelPortFixture(make); let checked = false;
        try {
            onCompletion(f, async result => {
                const otherPort = new ModelPort({ host: f.host, ...f.authority.execution });
                for (const copy of [{ ...result }, structuredClone(result), JSON.parse(JSON.stringify(result)), {}])
                    await expect(inspect(f, copy)).rejects.toMatchObject({ code: 'native_orchestration_model_result_completion_required' });
                await expect(ModelPort.prototype.inspectResultCompletion.call(otherPort, f.h.handle, { result, ...f.effectRef }))
                    .rejects.toMatchObject({ code: 'native_orchestration_model_result_completion_required' });
                await expect(ModelPort.prototype.inspectResultCompletion.call(f.port, 'another-owner', { result, ...f.effectRef }))
                    .rejects.toMatchObject({ code: 'native_orchestration_model_result_completion_required' });
                for (const overrides of [{ runId: createNativeId('orchestrationRun') }, { effectId: createNativeId('orchestrationEffect') }])
                    await expect(inspect(f, result, overrides)).rejects.toMatchObject({ code: 'native_orchestration_model_result_completion_required' });
                const original = result.generated, receipt = result.receiptRef;
                expect(() => { result.generated = { ...original, response: { ...original.response, text: 'Replacement body.' } }; }).toThrow(TypeError);
                expect(() => { result.receiptRef = { ...receipt, receiptId: createNativeId('orchestrationReceipt') }; }).toThrow(TypeError);
                expect((await inspect(f, result)).payloadHash).toBe(hash(originalText)); checked = true;
            });
            await f.start(); expect(checked).toBe(true); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test.each(['cancel', 'source'])('a real original %s change after successful completion invalidates inspection and retains its observed bill', async change => {
        const f = await modelPortFixture(make); let checked = false, before, changed;
        try {
            onCompletion(f, async result => {
                const service = f.authority.execution;
                expect((await inspect(f, result)).payloadHash).toBe(hash(originalText));
                before = await service.runs.get(f.h.handle, f.effectRef.runId);
                if (change === 'cancel') changed = await service.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'),
                    { ...runGuard(before), reasonCode: 'original_cancel_after_model_completion' });
                else changed = await f.core.appendTimeline(f.h.handle, f.base.session.sessionId, { role: 'user', content: 'Original Source changed before Result production.' });
                await expect(inspect(f, result)).rejects.toThrow(); checked = true;
                throw stopBeforeFinalize;
            });
            await expect(f.start()).rejects.toBe(stopBeforeFinalize); expect(checked).toBe(true); expect(changed).toBeDefined();
            expect(f.requests).toHaveLength(1); expect((await f.observe()).outcome).toBe('confirmed');
            const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[before.budgetAuthorityRef.operationId].compute;
            expect(bank.attempts[0].status).toBe('settled');
            const persisted = change === 'cancel' ? (await f.authority.execution.runs.get(f.h.handle, before.runId)).epoch
                : (await f.core.observe(f.h.handle, f.base.session.sessionId)).timeline.at(-1).content;
            expect(persisted).toBe(change === 'cancel' ? before.epoch + 1 : 'Original Source changed before Result production.');
            await f.cold(); expect((await f.observe()).outcome).toBe('confirmed');
            expect((await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[before.budgetAuthorityRef.operationId].compute).toEqual(bank);
        } finally { await f.cleanup(); }
    });

    test('a reentrant cancellation survives a control reducer and prevents its stale write', async () => {
        const f = await modelPortFixture(make), service = f.authority.execution; let cancelled;
        try {
            onCompletion(f, async () => {
                const before = await service.runs.get(f.h.handle, f.effectRef.runId);
                await expect(service.runs.control(f.h.handle, createNativeId('orchestrationCommand'), {
                    ...runGuard(before), operation: 'attempt.settle', detail: { reason: 'cancel_during_control' } }, async ({ root }) => {
                    await service.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), { ...runGuard(root), reasonCode: 'user_cancel' });
                    root.progress.steps++;
                    return { root, eventType: 'attempt_settled', reasonCode: null, outcome: {} };
                })).rejects.toMatchObject({ code: 'native_orchestration_run_conflict' });
                cancelled = await service.runs.get(f.h.handle, before.runId);
                expect(cancelled.cancelRequested).toBe(true); expect(cancelled.epoch).toBe(before.epoch + 1);
                throw stopBeforeFinalize;
            });
            await expect(f.start()).rejects.toBe(stopBeforeFinalize);
            expect(cancelled.cancelRequested).toBe(true); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test('a real same-transaction cancel after the consumption callback returns does not brand its rejected wrapper', async () => {
        const f = await modelPortFixture(make), service = f.authority.execution;
        const consume = service.runs.withConsumption.bind(service.runs); let candidate, before;
        try {
            service.runs.withConsumption = (handle, runId, callback, options) => consume(handle, runId, async args => {
                candidate = await callback(args); before = await service.runs.get(handle, runId);
                await service.runs.cancel(handle, createNativeId('orchestrationCommand'), { ...runGuard(before), reasonCode: 'cancel_returned_consume_candidate' });
                return candidate;
            }, options);
            await expect(f.start()).rejects.toMatchObject({ code: 'native_orchestration_consumption_stale' });
            expect(candidate.generated.response.text).toBe(originalText);
            await expect(inspect(f, candidate)).rejects.toMatchObject({ code: 'native_orchestration_model_result_completion_required' });
            expect((await f.authority.execution.runs.get(f.h.handle, before.runId)).cancelRequested).toBe(true);
            expect((await f.observe()).outcome).toBe('confirmed'); expect(f.requests).toHaveLength(1);
            expect((await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[before.budgetAuthorityRef.operationId].compute.attempts[0].status).toBe('settled');
        } finally { service.runs.withConsumption = consume; await f.cleanup(); }
    });

    test('fresh original bank corruption cannot be hidden by the earlier completion receipt and does not erase the actual charge', async () => {
        const f = await modelPortFixture(make); let checked = false, originalBill;
        try {
            onCompletion(f, async result => {
                const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
                const key = { kind: K.runControl, handle: f.h.handle, sessionId: f.base.session.sessionId };
                let originalInput;
                await f.h.engine.withTransaction(f.h.handle, async tx => {
                    const stored = await tx.getResource(key), changed = structuredClone(stored.doc);
                    const row = changed.operations[root.budgetAuthorityRef.operationId].compute.attempts[0];
                    originalInput = row.inputFingerprint; originalBill = structuredClone(row.usage);
                    row.inputFingerprint = hash({ fault: 'different actual provider input' });
                    // Explicit storage fault injection with an honest physical
                    // integrity hash, not an original legal billing command.
                    await tx.putResource(key, { ...stored, doc: changed, integrity: hash(changed) });
                });
                try {
                    await expect(inspect(f, result)).rejects.toMatchObject({ code: 'native_orchestration_budget_send_mismatch' });
                    const control = await f.core.runs.status(f.h.handle, f.base.session.sessionId);
                    const row = control.operations[root.budgetAuthorityRef.operationId].compute.attempts[0];
                    expect(row.inputFingerprint).not.toBe(originalInput);
                    expect(row.status).toBe('settled'); expect(row.usage).toEqual(originalBill); expect(f.requests).toHaveLength(1);
                    checked = true;
                } finally {
                    await f.h.engine.withTransaction(f.h.handle, async tx => {
                        const stored = await tx.getResource(key), restored = structuredClone(stored.doc);
                        restored.operations[root.budgetAuthorityRef.operationId].compute.attempts[0].inputFingerprint = originalInput;
                        await tx.putResource(key, { ...stored, doc: restored, integrity: hash(restored) });
                    });
                }
            });
            const completed = await f.start(); expect(checked).toBe(true); expect(completed.timeline.at(-1).content).toBe(originalText);
            const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
            const rows = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute.attempts;
            expect(rows).toHaveLength(1); expect(rows[0].usage).toEqual(originalBill); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test('a legitimate same-transaction Root cancel during the final bank read invalidates inspection while an outer denial envelope preserves cancellation and fees', async () => {
        const f = await modelPortFixture(make), service = f.authority.execution;
        const verify = BudgetPort.prototype.verifyBudgetAttempt;
        let armed = false, injected = false, sameTx = false, outerTx, before, after, outcome, bank;
        try {
            BudgetPort.prototype.verifyBudgetAttempt = async function (args) {
                const result = await verify.call(this, args);
                if (armed && !injected) {
                    injected = true; sameTx = outerTx === args.tx;
                    await service.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'),
                        { ...runGuard(await service.runs.get(f.h.handle, args.root.runId)), reasonCode: 'cancel_during_result_completion_inspection' });
                }
                return result;
            };
            onCompletion(f, async result => {
                before = await service.runs.get(f.h.handle, f.effectRef.runId);
                bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[before.budgetAuthorityRef.operationId].compute;
                const boundary = SourcePort.prototype.consumptionBoundary.call(service.sourcePort, f.h.handle, before.sourceBinding, { engine: f.h.engine });
                try {
                    armed = true;
                    outcome = await boundary(() => f.h.engine.withTransaction(f.h.handle, async tx => {
                        outerTx = tx;
                        // A future consumer must catch denial inside its real
                        // transaction, commit legitimate controller writes,
                        // then deny outside. A thrown transaction would roll
                        // back that same-ALS cancel and is not tested as safe.
                        try { return { value: await inspect(f, result) }; } catch (error) { return { error }; }
                    }));
                } finally { armed = false; }
                after = await service.runs.get(f.h.handle, before.runId);
                throw stopBeforeFinalize;
            });
            await expect(f.start()).rejects.toBe(stopBeforeFinalize);
            expect(injected).toBe(true); expect(sameTx).toBe(true);
            expect(after.cancelRequested).toBe(true); expect(after.epoch).toBe(before.epoch + 1);
            expect(hash(after.sourceBinding)).toBe(hash(before.sourceBinding));
            expect((await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[before.budgetAuthorityRef.operationId].compute).toEqual(bank);
            expect(f.requests).toHaveLength(1); expect((await f.observe()).outcome).toBe('confirmed');
            await f.cold();
            expect((await f.authority.execution.runs.get(f.h.handle, before.runId)).cancelRequested).toBe(true);
            expect((await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[before.budgetAuthorityRef.operationId].compute).toEqual(bank);
            expect(outcome).toMatchObject({ error: { code: 'native_orchestration_model_result_completion_stale' } });
        } finally { armed = false; BudgetPort.prototype.verifyBudgetAttempt = verify; await f.cleanup(); }
    });

    test('a real tool-call response keeps its existing delivery behavior but cannot mint a text Result proof', async () => {
        const f = await resolverTurnFixture(make);
        let actual;
        try {
            onCompletion(f, async result => {
                actual = result; expect(result.generated.response.toolCalls).toHaveLength(1);
                await expect(inspect(f, result)).rejects.toMatchObject({ code: 'native_orchestration_model_result_completion_required' });
                throw stopBeforeFinalize;
            });
            await expect(f.start()).rejects.toBe(stopBeforeFinalize); expect(actual).toBeDefined();
            expect(f.requests).toHaveLength(1); expect((await f.observe()).outcome).toBe('confirmed');
        } finally { await f.cleanup(); }
    });
});
