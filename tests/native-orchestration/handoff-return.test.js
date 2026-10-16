import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpDelegationFixture, runDelegationMetadata } from './helpers/rp-delegation-fixture.js';
import { HandoffReturnController } from '../../src/native/orchestration/handoff-return-controller.js';
import { readHandoffReturn, handoffReturnReceiptId } from '../../src/native/orchestration/handoff-return-contracts.js';
import { inspectNativeRpReturn, inspectNativeRpReturnIdentity } from '../../src/native/orchestration/native-rp-generation.js';
import { BudgetPort } from '../../src/native/orchestration/budget-port.js';
import { NativeNarratorOrchestrationAuthority } from '../../src/native/orchestration/native-turn-orchestration.js';
import { readAttempt, runGuard, controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { createNativeId } from '../../src/native/identity.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { nativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { RP_MODEL_TEXT } from './helpers/rp-model-fixture.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { validationDigest } from '../../src/native/orchestration/plan-repository.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const returnChild = HandoffReturnController.prototype.returnChild;
const bankOf = async f => Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
async function withReturn(f, before, after = async () => {}) {
    let hookError;
    HandoffReturnController.prototype.returnChild = async function (handle, request) {
        try {
            await before(this, handle, request);
            const result = await returnChild.call(this, handle, request); await after(this, handle, request, result); return result;
        } catch (error) { hookError = error; throw error; }
    };
    try { return await runDelegationMetadata(f); } catch (error) { throw hookError ?? error; }
    finally { HandoffReturnController.prototype.returnChild = returnChild; }
}

describe.each(harnesses)('$name real RP durable parent return', ({ make }) => {
    test('actual parent permit is reacquired before one durable return; original input/grant stays intact and no body is disclosed', async () => {
        const f = await rpDelegationFixture(make); let original, capture, controller;
        try {
            const result = await withReturn(f, async (port, handle, request) => {
                controller = port; capture = request.capture;
                const current = await inspectNativeRpReturn(capture, { host: f.host, handle }); original = current.attempt;
                expect(current.attempt.status).toBe('waiting_child'); expect(current.child.status).toBe('completed');
                const operation = [...nativeTaskScheduler.operations.values()].find(item => item.key === 'rp:' + f.controlId + ':' + f.input.requestId);
                expect(operation.view.status).toBe('running'); expect(nativeTaskScheduler.running.has(operation)).toBe(true);
                expect(current.output.closure.reservationRefs[0].status).toBe('released');
            }, async (port, handle, request, returned) => {
                const identity = inspectNativeRpReturnIdentity(request.capture, { host: f.host, handle });
                const root = await f.authority.execution.runs.get(handle, identity.parentRunId), version = root.stateVersion;
                await expect(returnChild.call(port, handle, request)).rejects.toThrow('native_orchestration_return_stale');
                expect((await f.authority.execution.runs.get(handle, root.runId)).stateVersion).toBe(version);
                expect(returned.status).toBe('returned');
            });
            expect(result.status).toBe('returned'); expect(JSON.stringify(result)).not.toContain(RP_MODEL_TEXT);
            const parent = await f.authority.execution.runs.get(f.h.handle, result.parentRunId);
            const after = await f.h.engine.withTransaction(f.h.handle, tx => readAttempt(tx, f.h.handle, parent, result.parentAttemptId));
            expect(after.doc).toEqual({ ...original, status: 'running', effectRefs: [f.effects[1].effectId], reasonCode: 'generation_response_validated' });
            const receipt = await f.h.engine.withTransaction(f.h.handle, tx => readHandoffReturn(tx, f.h.handle, parent, result.childRunId));
            expect(receipt).toMatchObject({ receiptKind: 'handoff_return', parentInputDigest: original.inputDigest,
                parentGrantDigest: original.effectiveGrantDigest, resultRef: result.resultRef });
            expect(result.returnReceiptRef).toEqual({ runId: parent.runId, receiptId: receipt.receiptId });
            expect(parent.resultRefs).toEqual([]); expect(parent.outputClaims).toEqual([]);
            expect((await bankOf(f)).attempts).toHaveLength(2); expect(f.requests).toHaveLength(2);
            expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(2);
            expect(() => inspectNativeRpReturnIdentity(capture, { host: f.host, handle: f.h.handle })).toThrow();
            await expect(returnChild.call(controller, f.h.handle, { capture })).rejects.toThrow();
            await f.authority.execution.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), { ...runGuard(parent), reasonCode: 'cancel_after_return' });
            expect((await controller.observe(f.h.handle, { parentRunId: parent.runId, childRunId: result.childRunId })).status).toBe('returned');
        } finally { await f.cleanup(); }
    });

    test('unknown child usage never issues a parent return scope or consumes its Result', async () => {
        const f = await rpDelegationFixture(make, { usage: false }); let called = false;
        try {
            const result = await withReturn(f, async () => { called = true; });
            expect(result.status).toBe('pending_output'); expect(called).toBe(false);
            const parent = await f.authority.execution.runs.get(f.h.handle, result.parentRunId);
            expect((await f.h.engine.withTransaction(f.h.handle, tx => readAttempt(tx, f.h.handle, parent, result.parentAttemptId))).doc.status).toBe('waiting_child');
            expect(await f.h.engine.withTransaction(f.h.handle, tx => readHandoffReturn(tx, f.h.handle, parent, result.childRunId))).toBeNull();
            expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test('a different published parent Plan with identical graph bytes cannot borrow the live return capture', async () => {
        const f = await rpDelegationFixture(make);
        try {
            await withReturn(f, async (port, handle, request) => {
                const identity = inspectNativeRpReturnIdentity(request.capture, { host: f.host, handle });
                const draft = await f.plans.create(handle, createNativeId('orchestrationCommand'), f.parentPlan);
                const expected = { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash };
                const report = await f.plans.validate(handle, expected);
                const other = await f.plans.publish(handle, createNativeId('orchestrationCommand'), { ...expected, validationDigest: validationDigest(report) });
                await f.h.engine.withTransaction(handle, async tx => {
                    const key = { kind: K.orchestrationRun, handle, runId: identity.parentRunId }, original = await tx.getResource(key);
                    const doc = { ...original.doc, planRef: other.planRef };
                    try {
                        await tx.putResource(key, { ...original, doc, integrity: hash(doc) });
                        await expect(returnChild.call(port, handle, request)).rejects.toMatchObject({ code: 'native_orchestration_return_transaction_required' });
                        await expect(inspectNativeRpReturn(request.capture, { host: f.host, handle, tx })).rejects.toMatchObject({ code: 'native_orchestration_return_stale' });
                    } finally { await tx.putResource(key, original); }
                });
            });
            expect(f.requests).toHaveLength(2);
        } finally { await f.cleanup(); }
    });

    test('fake/foreign/serialized scopes and ambient transactions cannot authorize a return', async () => {
        const f = await rpDelegationFixture(make);
        try {
            await withReturn(f, async (port, handle, request) => {
                for (const capture of [{}, { ...request.capture }, structuredClone(request.capture)])
                    await expect(returnChild.call(port, handle, { capture })).rejects.toThrow();
                await expect(returnChild.call(port, 'foreign-owner', request)).rejects.toThrow();
                expect(() => inspectNativeRpReturnIdentity(request.capture, { host: Object.create(f.host), handle })).toThrow();
                await expect(returnChild.call(port, handle, { ...request, resultRef: {} })).rejects.toThrow();
                await f.h.engine.withTransaction(handle, async () => {
                    await expect(returnChild.call(port, handle, request)).rejects.toMatchObject({ code: 'native_orchestration_return_transaction_required' });
                });
                const authorize = NativeNarratorOrchestrationAuthority.prototype.authorizeRpReturn;
                NativeNarratorOrchestrationAuthority.prototype.authorizeRpReturn = async function (...args) { return { ...await authorize.apply(this, args), allowed: false }; };
                try { await expect(returnChild.call(port, handle, request)).rejects.toThrow('native_orchestration_return_denied'); }
                finally { NativeNarratorOrchestrationAuthority.prototype.authorizeRpReturn = authorize; }
            });
            expect(f.requests).toHaveLength(2);
        } finally { await f.cleanup(); }
    });

    test.each(['parent_cancel', 'binding', 'user_edit', 'chat_delete', 'relocated'])('%s in the final return bank await commits lawful withdrawal and preserves child output/cost', async change => {
        const f = await rpDelegationFixture(make), observe = BudgetPort.prototype.observeChildClosure;
        let armed = false, injected = false, reads = 0, identity, expectedVersion;
        BudgetPort.prototype.observeChildClosure = async function (...args) {
            const facts = await observe.apply(this, args);
            if (armed) reads++;
            if (armed && reads === 2 && !injected) {
                injected = true;
                if (change === 'parent_cancel') await f.authority.execution.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), {
                    ...runGuard(await f.authority.execution.runs.get(f.h.handle, identity.parentRunId)), reasonCode: 'cancel_during_return' });
                else if (change === 'binding') {
                    const binding = await f.plans.getBinding(f.h.handle, f.sourceSelector); expectedVersion = binding.version + 1;
                    await f.plans.saveBinding(f.h.handle, createNativeId('orchestrationCommand'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
                } else if (change === 'chat_delete') await f.chats.delete(f.h.handle, 'Actor', 'main');
                else {
                    const chat = await f.chats.get(f.h.handle, 'Actor', 'main');
                    if (change === 'relocated') chat.header.chat_metadata.nativeControlId = '';
                    else chat.body[1].mes = 'Lawful edit during parent return';
                    await f.chats.save(f.h.handle, 'Actor', 'main', chat.header, chat.body, chat.integrity);
                }
            }
            return facts;
        };
        try {
            const failure = await withReturn(f, async (_port, handle, request) => { identity = inspectNativeRpReturnIdentity(request.capture, { host: f.host, handle }); armed = true; })
                .then(() => null, error => error);
            armed = false; expect(failure).not.toBeNull(); expect(injected).toBe(true);
            const parent = await f.authority.execution.runs.get(f.h.handle, identity.parentRunId), child = await f.authority.execution.runs.get(f.h.handle, identity.childRunId);
            const observed = change === 'parent_cancel' ? parent.cancelRequested : change === 'binding' ? (await f.plans.getBinding(f.h.handle, f.sourceSelector)).version
                : change === 'chat_delete' ? await f.chats.get(f.h.handle, 'Actor', 'main')
                    : change === 'relocated' ? (await f.chats.get(f.h.handle, 'Actor', 'main')).header.chat_metadata.nativeControlId
                        : (await f.chats.get(f.h.handle, 'Actor', 'main')).body[1].mes;
            expect(observed).toEqual({ parent_cancel: true, binding: expectedVersion, chat_delete: null, relocated: '', user_edit: 'Lawful edit during parent return' }[change]);
            expect(failure.code).toBe('native_orchestration_return_stale');
            expect(await f.h.engine.withTransaction(f.h.handle, tx => readHandoffReturn(tx, f.h.handle, parent, child.runId))).toBeNull();
            expect(child.status).toBe('completed'); expect(child.outputClaims).toHaveLength(1);
            expect((await bankOf(f)).reservations[0].status).toBe('released'); expect(f.requests).toHaveLength(1);
        } finally { armed = false; BudgetPort.prototype.observeChildClosure = observe; await f.cleanup(); }
    });

    test('return receipt corruption with honest hashes cannot become historical evidence', async () => {
        const f = await rpDelegationFixture(make);
        try {
            const result = await runDelegationMetadata(f), parent = await f.authority.execution.runs.get(f.h.handle, result.parentRunId);
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const key = controlRecordKey(f.h.handle, parent.runId, 'receipt', handoffReturnReceiptId(result.childRunId)), saved = await tx.getResource(key);
                for (const field of ['parentInputDigest', 'parentGrantDigest', 'controlToken', 'resultIntegrity', 'audienceDigest']) {
                    const doc = { ...saved.doc, [field]: 'a'.repeat(64) };
                    try { await tx.putResource(key, { ...saved, doc, integrity: hash(doc) }); await expect(readHandoffReturn(tx, f.h.handle, parent, result.childRunId)).rejects.toThrow(); }
                    finally { await tx.putResource(key, saved); }
                }
            });
            expect(f.requests).toHaveLength(2);
        } finally { await f.cleanup(); }
    });

    test.each(['saved', 'no_save'])('return CAS ACK %s only observes one receipt and cold reading never resumes authority', async ack => {
        const f = await rpDelegationFixture(make), transaction = f.h.engine.withTransaction.bind(f.h.engine);
        let armed = false, injected = false, identity, cold;
        f.h.engine.withTransaction = async (handle, callback, ...options) => {
            const value = await transaction(handle, async tx => {
                const result = await callback(tx);
                if (armed && !injected && result?.denied === false && result.returnReceiptRef && ack === 'no_save') {
                    injected = true; throw new StorageCommitUnknownError(new Error('Before return commit'));
                }
                return result;
            }, ...options);
            if (armed && !injected && value?.denied === false && value.returnReceiptRef && ack === 'saved') {
                injected = true; throw new StorageCommitUnknownError(new Error('After return commit'));
            }
            return value;
        };
        try {
            const outcome = await withReturn(f, async (_port, handle, request) => { identity = inspectNativeRpReturnIdentity(request.capture, { host: f.host, handle }); armed = true; })
                .then(value => ({ value }), error => ({ error }));
            armed = false; expect(injected).toBe(true); expect(outcome.error === undefined).toBe(ack === 'saved');
            const parent = await f.authority.execution.runs.get(f.h.handle, identity.parentRunId);
            expect((await f.h.engine.withTransaction(f.h.handle, tx => readAttempt(tx, f.h.handle, parent, identity.parentAttemptId))).doc.status)
                .toBe(ack === 'saved' ? 'running' : 'waiting_child');
            await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            const facts = await cold.withTransaction(f.h.handle, async tx => {
                const stored = (await tx.getResource({ kind: K.orchestrationRun, handle: f.h.handle, runId: parent.runId })).doc;
                return readHandoffReturn(tx, f.h.handle, stored, identity.childRunId);
            });
            expect(facts !== null).toBe(ack === 'saved'); expect(f.requests).toHaveLength(ack === 'saved' ? 2 : 1);
        } finally { armed = false; f.h.engine.withTransaction = transaction; await cold?.close(); await f.cleanup(); }
    });

    test('a post-write failure rolls back parent receipt, status and counters while keeping the already completed child', async () => {
        const f = await rpDelegationFixture(make), runs = f.authority.execution.runs, control = runs.control.bind(runs); let before, injected = false;
        runs.control = (handle, id, body, reduce, ...options) => control(handle, id, body, async args => {
            const value = await reduce(args);
            if (body.operation === 'run.returnHandoff') { injected = true; throw new Error('After parent return writes'); }
            return value;
        }, ...options);
        try {
            await expect(withReturn(f, async (_port, handle, request) => { before = await inspectNativeRpReturn(request.capture, { host: f.host, handle }); })).rejects.toThrow('After parent return writes');
            expect(injected).toBe(true); expect(await runs.get(f.h.handle, before.parentRunId)).toEqual(before.parent);
            expect(await f.h.engine.withTransaction(f.h.handle, tx => readHandoffReturn(tx, f.h.handle, before.parent, before.childRunId))).toBeNull();
            expect((await runs.get(f.h.handle, before.childRunId)).status).toBe('completed'); expect(f.requests).toHaveLength(1);
        } finally { runs.control = control; await f.cleanup(); }
    });

    test('the original Run CAS refuses a resumed Attempt if its return receipt was not persisted', async () => {
        const f = await rpDelegationFixture(make), runs = f.authority.execution.runs, control = runs.control.bind(runs); let identity;
        runs.control = (handle, id, body, reduce, ...options) => control(handle, id, body, async args => {
            const value = await reduce(args);
            if (body.operation === 'run.returnHandoff') await args.tx.deleteResource(controlRecordKey(handle, args.root.runId, 'receipt', handoffReturnReceiptId(body.detail.childRunId)));
            return value;
        }, ...options);
        try {
            await expect(withReturn(f, async (_port, handle, request) => { identity = inspectNativeRpReturnIdentity(request.capture, { host: f.host, handle }); }))
                .rejects.toThrow('Handoff return requires complete facts');
            const parent = await runs.get(f.h.handle, identity.parentRunId);
            expect((await f.h.engine.withTransaction(f.h.handle, tx => readAttempt(tx, f.h.handle, parent, identity.parentAttemptId))).doc.status).toBe('waiting_child');
            expect(await f.h.engine.withTransaction(f.h.handle, tx => readHandoffReturn(tx, f.h.handle, parent, identity.childRunId))).toBeNull();
            expect(f.requests).toHaveLength(1);
        } finally { runs.control = control; await f.cleanup(); }
    });
});
