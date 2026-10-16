import { RpOutputController } from '../../src/native/orchestration/rp-output-controller.js';
import { ChatRepo } from '../../src/storage/repositories/chat-repo.js';
import { BudgetPort } from '../../src/native/orchestration/budget-port.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { createNativeId } from '../../src/native/identity.js';
import { runGuard } from '../../src/native/orchestration/controller-common.js';
import { rpDelegationFixture } from './helpers/rp-delegation-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpModelFixture, RP_MODEL_TEXT } from './helpers/rp-model-fixture.js';
import { readEffect } from '../../src/native/orchestration/effect-contracts.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const configurePlan = plan => {
    plan.definition.nodes[0].capabilities.push('chat.output'); plan.definition.capabilityCeiling = plan.definition.nodes[0].capabilities;
    Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 65536 } });
};
describe.each(harnesses)('$name real RP output Host Effect', ({ make }) => {
    test('one original Narrator append follows durable Effect dispatch, original work charge and original domain commit', async () => {
        const f = await rpModelFixture(make, { configurePlan });
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            const chat = await f.chats.get(f.h.handle, 'Actor', 'main');
            expect(result.output.status).toBe('committed'); expect(chat.body).toHaveLength(3); expect(chat.body[2].mes).toBe(RP_MODEL_TEXT);
            const intent = await f.h.engine.withTransaction(f.h.handle, tx => readEffect(tx, f.h.handle, root, result.output.outputEffectId));
            expect(intent.doc).toMatchObject({ status: 'confirmed', capability: 'chat.output', risk: 'R2', requiresApproval: false,
                dispatchPolicy: { idempotency: 'domain_key', reconcile: 'domain_status' } });
            expect(result.output.effectReceiptRef).not.toBeNull(); expect(root.pendingEffectRefs).toEqual([]);
            const control = await f.control.status(f.h.handle, f.controlId), bank = Object.values(control.operations)[0].compute;
            expect(control.outputReceipts[result.output.outputKey].status).toBe('committed');
            expect(bank.localWork.filter(row => row.kind === 'rp_output')).toEqual([expect.objectContaining({ status: 'settled', usage: expect.objectContaining({ outcome: 'completed' }) })]);
            expect(bank.attempts).toHaveLength(1); expect(f.requests).toHaveLength(1);
            expect(root.status).toBe('running'); expect(root.outputClaims).toEqual([]);
        } finally { await f.cleanup(); }
    });

    test('actual physical writer sees the durable output intent and admitted original work before any Chat bytes change', async () => {
        const f = await rpModelFixture(make, { configurePlan }), write = ChatRepo.prototype.commitNativeOutput;
        let observed;
        ChatRepo.prototype.commitNativeOutput = async function (handle, request) {
            const effect = f.effects[1], root = await f.authority.execution.runs.get(handle, effect.runId);
            const intent = (await f.h.engine.withTransaction(handle, tx => readEffect(tx, handle, root, effect.effectId))).doc;
            const control = await f.control.status(handle, f.controlId);
            observed = { effect: intent.status, capability: intent.capability, slot: Object.values(control.outputReceipts)[0].status,
                work: Object.values(control.operations)[0].compute.localWork.find(row => row.kind === 'rp_output').status,
                messages: (await this.get(handle, 'Actor', 'main')).body.length };
            return write.call(this, handle, request);
        };
        try {
            await f.run(); expect(observed).toEqual({ effect: 'dispatching', capability: 'chat.output', slot: 'writing', work: 'charged', messages: 2 });
            expect(f.requests).toHaveLength(1);
        } finally { ChatRepo.prototype.commitNativeOutput = write; await f.cleanup(); }
    });

    test('the real delegated parent writes only its final Narrator response after the child has returned', async () => {
        const f = await rpDelegationFixture(make, { configureParentPlan: configurePlan });
        try {
            const result = await f.run(), chat = await f.chats.get(f.h.handle, 'Actor', 'main');
            expect(result.delegation.status).toBe('returned'); expect(result.output.status).toBe('committed'); expect(f.requests).toHaveLength(2);
            expect(chat.body).toHaveLength(3); expect(chat.body[2].mes).toBe(RP_MODEL_TEXT);
            expect((await f.authority.execution.runs.get(f.h.handle, result.delegation.childRunId)).status).toBe('completed');
            expect(Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute.attempts).toHaveLength(2);
        } finally { await f.cleanup(); }
    });

    test('an uncertain output Effect claim never reaches the original physical writer', async () => {
        const f = await rpModelFixture(make, { configurePlan }), effects = f.authority.execution.effects, claim = effects.claim.bind(effects);
        effects.claim = async (handle, request) => {
            const result = await claim(handle, request);
            const root = await f.authority.execution.runs.get(handle, request.runId), intent = (await f.h.engine.withTransaction(handle, tx => readEffect(tx, handle, root, request.effectId))).doc;
            if (intent.capability === 'chat.output') throw new StorageCommitUnknownError(new Error('Output claim ACK lost'));
            return result;
        };
        try {
            const failure = await f.run().then(() => null, error => error); expect(failure).not.toBeNull();
            const chat = await f.chats.get(f.h.handle, 'Actor', 'main'), control = await f.control.status(f.h.handle, f.controlId);
            expect(chat.body).toHaveLength(2); expect(Object.values(control.outputReceipts)[0].status).toBe('prepared'); expect(f.requests).toHaveLength(1);
            expect(Object.values(control.operations)[0].compute.localWork.find(row => row.kind === 'rp_output').status).toBe('charged');
        } finally { effects.claim = claim; await f.cleanup(); }
    });

    test('a lost actual Chat ACK observes and confirms one original commit without calling the writer twice', async () => {
        const f = await rpModelFixture(make, { configurePlan }), write = ChatRepo.prototype.commitNativeOutput; let calls = 0;
        ChatRepo.prototype.commitNativeOutput = async function (...args) {
            calls++; await write.apply(this, args); throw new StorageCommitUnknownError(new Error('Single Chat ACK lost'));
        };
        try {
            const result = await f.run(); expect(result.output.status).toBe('committed'); expect(result.output.effectReceiptRef).not.toBeNull();
            expect(calls).toBe(1); expect(f.requests).toHaveLength(1); expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(3);
        } finally { ChatRepo.prototype.commitNativeOutput = write; await f.cleanup(); }
    });

    test.each(['saved', 'no_save'])('domain reconcile ACK %s preserves Chat and distinguishes confirmed output from unknown metadata', async ack => {
        const f = await rpModelFixture(make, { configurePlan }), transaction = f.h.engine.withTransaction.bind(f.h.engine); let injected = false;
        const match = value => value?.status === 'committed' && value.receipt?.status === 'committed' && value.receipt?.domainReceipt?.controlId === f.controlId;
        f.h.engine.withTransaction = async (handle, callback, ...options) => {
            const result = await transaction(handle, async tx => {
                const value = await callback(tx);
                if (!injected && match(value) && ack === 'no_save') { injected = true; throw new StorageCommitUnknownError(new Error('Before domain reconcile commit')); }
                return value;
            }, ...options);
            if (!injected && match(result) && ack === 'saved') { injected = true; throw new StorageCommitUnknownError(new Error('After domain reconcile commit')); }
            return result;
        };
        try {
            const result = await f.run(); expect(injected).toBe(true);
            expect(result.output.status).toBe(ack === 'saved' ? 'committed' : 'unknown');
            const root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(root.status).toBe(ack === 'saved' ? 'running' : 'reconciling');
            expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(3); expect(f.requests).toHaveLength(1);
        } finally { f.h.engine.withTransaction = transaction; await f.cleanup(); }
    });

    test.each(['saved', 'no_save'])('Host output receipt ACK %s only observes that receipt and never repeats the Chat operation', async ack => {
        const f = await rpModelFixture(make, { configurePlan }), transaction = f.h.engine.withTransaction.bind(f.h.engine); let injected = false;
        const match = value => f.effects[1] && value?.outcome?.effectId === f.effects[1].effectId && value.outcome.status === 'confirmed';
        f.h.engine.withTransaction = async (handle, callback, ...options) => {
            const result = await transaction(handle, async tx => {
                const value = await callback(tx);
                if (!injected && match(value) && ack === 'no_save') { injected = true; throw new StorageCommitUnknownError(new Error('Before output receipt commit')); }
                return value;
            }, ...options);
            if (!injected && match(result) && ack === 'saved') { injected = true; throw new StorageCommitUnknownError(new Error('After output receipt commit')); }
            return result;
        };
        try {
            const result = await f.run(); expect(injected).toBe(true); expect(result.output.status).toBe('committed');
            expect(result.output.effectReceiptRef !== null).toBe(ack === 'saved');
            expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(3); expect(f.requests).toHaveLength(1);
            expect((await f.authority.execution.runs.get(f.h.handle, result.runId)).pendingEffectRefs).toHaveLength(ack === 'saved' ? 0 : 1);
        } finally { f.h.engine.withTransaction = transaction; await f.cleanup(); }
    });

    test('a lawful Run cancellation at the physical writer bank await persists and refuses the assistant append', async () => {
        const f = await rpModelFixture(make, { configurePlan }), write = ChatRepo.prototype.commitNativeOutput, current = BudgetPort.prototype.assertCurrent;
        let armed = false, injected = false;
        ChatRepo.prototype.commitNativeOutput = async function (...args) { armed = true; try { return await write.apply(this, args); } finally { armed = false; } };
        BudgetPort.prototype.assertCurrent = async function (handle, ref, options) {
            const value = await current.call(this, handle, ref, options);
            if (armed && !injected && options?.tx) {
                injected = true; const root = await f.authority.execution.runs.get(handle, f.effects[1].runId);
                await f.authority.execution.runs.cancel(handle, createNativeId('orchestrationCommand'), { ...runGuard(root), reasonCode: 'cancel_before_rp_output' });
            }
            return value;
        };
        try {
            const failure = await f.run().then(() => null, error => error); expect(failure).not.toBeNull(); expect(injected).toBe(true);
            expect((await f.authority.execution.runs.get(f.h.handle, f.effects[1].runId)).cancelRequested).toBe(true);
            expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(2); expect(f.requests).toHaveLength(1);
        } finally { ChatRepo.prototype.commitNativeOutput = write; BudgetPort.prototype.assertCurrent = current; await f.cleanup(); }
    });


    test('fake, cloned, foreign owner/Host and expired output scopes never obtain a write permit', async () => {
        const f = await rpModelFixture(make, { configurePlan }), prepare = RpOutputController.prototype.prepare;
        let capture, hookError;
        const verify = async (port, handle, request) => {
            for (const changed of [{ capture: {} }, { capture: structuredClone(request.capture) }, { ...request, payload: 'forged' }])
                await expect(prepare.call(port, handle, changed)).rejects.toThrow();
            await expect(prepare.call(port, 'foreign', request)).rejects.toThrow();
            await expect(prepare.call(new RpOutputController({ host: Object.create(f.host) }), handle, request)).rejects.toThrow();
        };
        RpOutputController.prototype.prepare = async function (handle, request) {
            capture = request.capture;
            try { await verify(this, handle, request); } catch (error) { hookError = error; throw error; }
            return prepare.call(this, handle, request);
        };
        try {
            await f.run().catch(error => { throw hookError ?? error; });
            await expect(prepare.call(new RpOutputController({ host: f.host }), f.h.handle, { capture })).rejects.toThrow();
            expect(f.requests).toHaveLength(1); expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(3);
        } finally { RpOutputController.prototype.prepare = prepare; await f.cleanup(); }
    });

    test.each(['missing_policy', 'foreign_slot'])('original Plan publication refuses %s output authority before any Model or Chat operation', async change => {
        await expect(rpModelFixture(make, { configurePlan: plan => {
            configurePlan(plan);
            if (change === 'missing_policy') delete plan.definition.outputContract.resultPolicy;
            else plan.definition.outputContract.slot = 'another_slot';
        } })).rejects.toThrow('native_orchestration_rp_output_policy_invalid');
    });

});
