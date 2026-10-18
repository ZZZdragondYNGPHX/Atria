import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpDelegationFixture, runDelegationMetadata } from './helpers/rp-delegation-fixture.js';
import { TaskLocalOutputController } from '../../src/native/orchestration/task-local-output-controller.js';
import { readTaskLocalOutput } from '../../src/native/orchestration/task-local-output-contracts.js';
import { readAttempt } from '../../src/native/orchestration/controller-common.js';
import { RP_MODEL_TEXT } from './helpers/rp-model-fixture.js';
import { BudgetPort } from '../../src/native/orchestration/budget-port.js';
import { inspectNativeRpDelegation, inspectNativeRpDelegationOutput } from '../../src/native/orchestration/native-rp-generation.js';
import { controlRecordKey, runGuard } from '../../src/native/orchestration/controller-common.js';
import { childClosureReceiptId, taskLocalReceiptId } from '../../src/native/orchestration/task-local-output-contracts.js';
import { taskLocalClaimId } from '../../src/native/orchestration/task-local-output-contracts.js';

import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { createNativeId } from '../../src/native/identity.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';

const complete = TaskLocalOutputController.prototype.complete;
async function atOutput(f, callback) {
    let hookError;
    TaskLocalOutputController.prototype.complete = async function (handle, request) {
        try { await callback(this, handle, request); } catch (error) { hookError = error; throw error; }
        return complete.call(this, handle, request);
    };
    try { return await runDelegationMetadata(f); } catch (error) { throw hookError ?? error; }
    finally { TaskLocalOutputController.prototype.complete = complete; }
}
const bankOf = async f => Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
describe.each(harnesses)('$name real RP task-local output', ({ make }) => {
    test.each([true, false])('usage=%s closes Graph output only when the original child bank is closed', async usage => {
        const f = await rpDelegationFixture(make, { usage });
        try {
            const result = await runDelegationMetadata(f), service = f.authority.execution;
            expect(result.status).toBe(usage ? 'returned' : 'pending_output');
            expect(JSON.stringify(result)).not.toContain(RP_MODEL_TEXT);
            const child = await service.runs.get(f.h.handle, result.childRunId), parent = await service.runs.get(f.h.handle, result.parentRunId);
            const facts = await f.h.engine.withTransaction(f.h.handle, tx => readTaskLocalOutput(tx, f.h.handle, child));
            expect(facts !== null).toBe(usage);
            expect(child.status).toBe(usage ? 'completed' : 'running');
            expect(child.progress.edgeVisits).toBe(1); expect(child.attemptRefs).toHaveLength(2);
            expect((await f.h.engine.withTransaction(f.h.handle, tx => readAttempt(tx, f.h.handle, parent, result.parentAttemptId))).doc.status).toBe(usage ? 'running' : 'waiting_child');
            const bank = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
            expect(bank.reservations[0].status).toBe(usage ? 'released' : 'held');
            expect(bank.attempts[0].status).toBe(usage ? 'settled' : 'unknown');
            expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(2);
            expect(f.requests).toHaveLength(usage ? 2 : 1);
            expect((await new TaskLocalOutputController({ host: f.host }).observe(f.h.handle, { runId: child.runId })).status).toBe(usage ? 'completed' : 'unknown');
        } finally { await f.cleanup(); }
    });

    test('only live original child authority can prepare output; an ambient Engine transaction cannot merge the bank saga', async () => {
        const f = await rpDelegationFixture(make); let controller, actual;
        try {
            const result = await atOutput(f, async (port, handle, request) => {
                controller = port; actual = request;
                await expect(complete.call(port, handle, { ...request, capture: {} })).rejects.toThrow();
                await expect(complete.call(port, handle, { ...request, payload: RP_MODEL_TEXT })).rejects.toThrow();
                await f.h.engine.withTransaction(handle, async () => {
                    await expect(complete.call(port, handle, request)).rejects.toMatchObject({ code: 'native_orchestration_output_transaction_required' });
                });
                expect((await bankOf(f)).reservations[0].status).toBe('held');
                await expect(inspectNativeRpDelegationOutput(request.capture, { host: f.host, handle })).rejects.toMatchObject({ code: 'native_orchestration_child_budget_unclosed' });
            });
            expect(result.status).toBe('returned');
            await expect(complete.call(controller, f.h.handle, actual)).rejects.toThrow();
            expect(f.requests).toHaveLength(2);
        } finally { await f.cleanup(); }
    });

    test('actual Provider overrun remains paid and released but cannot complete output', async () => {
        const f = await rpDelegationFixture(make, { totalTokens: 50001 });
        try {
            const result = await runDelegationMetadata(f), bank = await bankOf(f);
            expect(result.status).toBe('pending_output'); expect(bank.reservations[0].status).toBe('released');
            expect(bank.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 50001 } });
            const root = await f.authority.execution.runs.get(f.h.handle, result.childRunId);
            expect(root.status).toBe('running'); expect(root.outputClaims).toEqual([]); expect(root.resultRefs).toEqual([result.resultRef]);
            expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test.each(['saved', 'no_save'])('original bank release ACK %s is observed without a second release/send', async ack => {
        const f = await rpDelegationFixture(make), release = BudgetPort.prototype.releaseUnused;
        let calls = 0, capture;
        BudgetPort.prototype.releaseUnused = async function (...args) {
            calls++;
            if (ack === 'saved') await release.apply(this, args);
            throw new StorageCommitUnknownError(new Error('Synthetic release ACK loss'));
        };
        try {
            const result = await atOutput(f, async (_port, _handle, request) => { capture = request.capture; });
            expect(result.status).toBe(ack === 'saved' ? 'returned' : 'pending_output');
            expect(calls).toBe(1); expect(f.requests).toHaveLength(ack === 'saved' ? 2 : 1);
            expect((await bankOf(f)).reservations[0].status).toBe(ack === 'saved' ? 'released' : 'held');
            await expect(inspectNativeRpDelegation(capture, { host: f.host, handle: f.h.handle })).rejects.toThrow();
        } finally { BudgetPort.prototype.releaseUnused = release; await f.cleanup(); }
    });

    test.each(['parent_cancel', 'binding', 'user_edit', 'chat_delete', 'relocated'])('%s in the final closed-bank read commits source withdrawal and refuses terminal metadata', async change => {
        const f = await rpDelegationFixture(make), observe = BudgetPort.prototype.observeChildClosure;
        let changed = false, parentRunId, expectedVersion, closedReads = 0;
        BudgetPort.prototype.observeChildClosure = async function (handle, input, options) {
            const facts = await observe.call(this, handle, input, options);
            if (facts.closed) closedReads++;
            if (closedReads === 4 && !changed) {
                changed = true;
                const child = await f.authority.execution.runs.get(handle, input.reservationId); parentRunId = child.parentRef.parentRunId;
                if (change === 'parent_cancel') {
                    await f.authority.execution.runs.cancel(handle, createNativeId('orchestrationCommand'), {
                        ...runGuard(await f.authority.execution.runs.get(handle, parentRunId)), reasonCode: 'cancel_during_output' });
                } else if (change === 'binding') {
                    const binding = await f.plans.getBinding(handle, f.sourceSelector); expectedVersion = binding.version + 1;
                    await f.plans.saveBinding(handle, createNativeId('orchestrationCommand'), { sourceSelector: f.sourceSelector,
                        planRef: f.planRef, expectedVersion: binding.version });
                } else if (change === 'chat_delete') await f.chats.delete(handle, 'Actor', 'main');
                else {
                    const chat = await f.chats.get(handle, 'Actor', 'main');
                    if (change === 'relocated') chat.header.chat_metadata.nativeControlId = '';
                    else chat.body[1].mes = 'Lawful user edit during output';
                    await f.chats.save(handle, 'Actor', 'main', chat.header, chat.body, chat.integrity);
                }
            }
            return facts;
        };
        try {
            const failure = await runDelegationMetadata(f).then(() => null, error => error);
            expect(failure).not.toBeNull(); expect(changed).toBe(true);
            const observed = change === 'parent_cancel' ? (await f.authority.execution.runs.get(f.h.handle, parentRunId)).cancelRequested
                : change === 'binding' ? (await f.plans.getBinding(f.h.handle, f.sourceSelector)).version
                    : change === 'chat_delete' ? await f.chats.get(f.h.handle, 'Actor', 'main')
                        : change === 'relocated' ? (await f.chats.get(f.h.handle, 'Actor', 'main')).header.chat_metadata.nativeControlId
                            : (await f.chats.get(f.h.handle, 'Actor', 'main')).body[1].mes;
            const expected = { parent_cancel: true, binding: expectedVersion, chat_delete: null, relocated: '', user_edit: 'Lawful user edit during output' };
            expect({ observed, code: failure.cause?.code ?? failure.code })
                .toEqual({ observed: expected[change], code: 'native_orchestration_task_output_stale' });
            const child = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(child.status).toBe('running'); expect(child.outputClaims).toEqual([]);
            expect(await f.h.engine.withTransaction(f.h.handle, tx => readTaskLocalOutput(tx, f.h.handle, child))).toBeNull();
            expect(f.requests).toHaveLength(1);
        } finally { BudgetPort.prototype.observeChildClosure = observe; await f.cleanup(); }
    });

    test('generic control cannot invent terminal success or smuggle a claim into a running Root', async () => {
        const f = await rpDelegationFixture(make);
        try {
            const result = await atOutput(f, async (_controller, handle, request) => {
                const runs = f.authority.execution.runs, root = await runs.get(handle, request.publication.resultRef.runId);
                for (const [operation, status] of [['join.settle', 'running'], ['output.publish', 'completed']]) {
                    await expect(runs.control(handle, createNativeId('orchestrationCommand'), {
                        ...runGuard(root), operation, detail: {} }, async ({ root }) => {
                        root.outputClaims = [{ runId: root.runId, claimId: taskLocalClaimId(root) }]; root.status = status;
                        return { root, eventType: 'forged_output', reasonCode: null, outcome: {} };
                    })).rejects.toThrow();
                }
                expect((await runs.get(handle, root.runId)).outputClaims).toEqual([]);
            });
            expect(result.status).toBe('returned');
        } finally { await f.cleanup(); }
    });

    test('a write failure rolls back the output group while the separate original bank release remains durable', async () => {
        const f = await rpDelegationFixture(make), runs = f.authority.execution.runs, control = runs.control.bind(runs);
        let injected = false;
        runs.control = (handle, id, body, reduce, ...rest) => control(handle, id, body, async args => {
            const result = await reduce(args);
            if (body.operation === 'output.publish') { injected = true; throw new Error('After output writes'); }
            return result;
        }, ...rest);
        try {
            await expect(runDelegationMetadata(f)).rejects.toThrow(); expect(injected).toBe(true);
            const root = await runs.get(f.h.handle, f.effects[0].runId);
            expect(root.status).toBe('running'); expect(root.outputClaims).toEqual([]);
            expect((await bankOf(f)).reservations[0].status).toBe('released');
            expect(await f.h.engine.withTransaction(f.h.handle, tx => readTaskLocalOutput(tx, f.h.handle, root))).toBeNull();
            expect(f.requests).toHaveLength(1);
        } finally { runs.control = control; await f.cleanup(); }
    });

    test.each(['saved', 'no_save'])('output CAS ACK %s is metadata-only observed and cold reads cannot resume a lost scope', async ack => {
        const f = await rpDelegationFixture(make), transaction = f.h.engine.withTransaction.bind(f.h.engine);
        let armed = false, injected = false, actual, controller, cold;
        f.h.engine.withTransaction = async (handle, callback, ...options) => {
            const value = await transaction(handle, async tx => {
                const result = await callback(tx);
                if (armed && !injected && result?.denied === false && result.status === 'completed' && ack === 'no_save') {
                    injected = true; throw new StorageCommitUnknownError(new Error('Before output commit'));
                }
                return result;
            }, ...options);
            if (armed && !injected && value?.denied === false && value.status === 'completed' && ack === 'saved') {
                injected = true; throw new StorageCommitUnknownError(new Error('After output commit'));
            }
            return value;
        };
        try {
            const outcome = await atOutput(f, async (port, _handle, request) => { controller = port; actual = request; armed = true; })
                .then(value => ({ value }), error => ({ error }));
            armed = false;
            expect(injected).toBe(true); expect(outcome.error === undefined).toBe(ack === 'saved');
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId), bank = await bankOf(f);
            expect(root.status).toBe(ack === 'saved' ? 'completed' : 'running');
            expect(bank.reservations[0].status).toBe('released');
            await expect(complete.call(controller, f.h.handle, actual)).rejects.toThrow();
            await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            const facts = await cold.withTransaction(f.h.handle, async tx => {
                const stored = (await tx.getResource({ kind: K.orchestrationRun, handle: f.h.handle, runId: root.runId })).doc;
                return readTaskLocalOutput(tx, f.h.handle, stored);
            });
            expect(facts !== null).toBe(ack === 'saved'); expect(f.requests).toHaveLength(ack === 'saved' ? 2 : 1);
        } finally { armed = false; f.h.engine.withTransaction = transaction; await cold?.close(); await f.cleanup(); }
    });

    test('historical claims/closure/traversal facts reject honest-hash corruption and never grant a cold recipient', async () => {
        const f = await rpDelegationFixture(make);
        try {
            const result = await runDelegationMetadata(f), runs = f.authority.execution.runs, root = await runs.get(f.h.handle, result.childRunId);
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const output = await tx.getResource(controlRecordKey(f.h.handle, root.runId, 'receipt', taskLocalReceiptId(root.runId)));
                const cases = [[controlRecordKey(f.h.handle, root.runId, 'output', result.outputClaimRef.claimId), 'outputKey', 'b'.repeat(64)],
                    [controlRecordKey(f.h.handle, root.runId, 'receipt', childClosureReceiptId(root.runId)), 'reservationId', root.parentRef.parentRunId],
                    [controlRecordKey(f.h.handle, root.runId, 'receipt', output.doc.traversalReceiptRef.receiptId), 'inputDigest', 'c'.repeat(64)],
                    [controlRecordKey(f.h.handle, root.runId, 'receipt', taskLocalReceiptId(root.runId)), 'claimIntegrity', 'a'.repeat(64)]];
                for (const [key, field, value] of cases) {
                    const original = await tx.getResource(key), doc = { ...original.doc, [field]: value };
                    try {
                        await tx.putResource(key, { ...original, doc, integrity: hash(doc) });
                        await expect(readTaskLocalOutput(tx, f.h.handle, root)).rejects.toThrow();
                    } finally { await tx.putResource(key, original); }
                }
            });
            await runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), { ...runGuard(await runs.get(f.h.handle, result.parentRunId)), reasonCode: 'after_child_completed' });
            expect((await new TaskLocalOutputController({ host: f.host }).observe(f.h.handle, { runId: root.runId })).status).toBe('completed');
            expect(f.requests).toHaveLength(2);
        } finally { await f.cleanup(); }
    });
});
