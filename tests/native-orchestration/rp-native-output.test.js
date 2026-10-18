import { RpOutputController } from '../../src/native/orchestration/rp-output-controller.js';
import fs from 'node:fs';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpModelFixture, RP_MODEL_TEXT } from './helpers/rp-model-fixture.js';
import { RpRunControl } from '../../src/native/rp-run-control.js';
import { BudgetPort } from '../../src/native/orchestration/budget-port.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { rpNativeOutputKey } from '../../src/native/rp-output-protocol.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const configurePlan = plan => { plan.definition.nodes.find(node => node.kind === 'output').capabilities = ['chat.output'];
    plan.definition.capabilityCeiling = [...plan.definition.nodes[0].capabilities, 'chat.output']; Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 65536 } }); };

const complete = RpOutputController.prototype.complete;
beforeEach(() => {
    RpOutputController.prototype.complete = async function (handle, request) {
        const { receipt } = await this.prepare(handle, request);
        return { status: receipt.status, outputKey: receipt.outputKey, operationId: receipt.operationId };
    };
});
afterEach(() => { RpOutputController.prototype.complete = complete; });

describe.each(harnesses)('$name original RP native output protocol', ({ make }) => {
    test('final Narrator prepares a stable source slot without writing Chat or completing the Run', async () => {
        const f = await rpModelFixture(make, { configurePlan });
        try {
            const result = await f.run(), control = await f.control.status(f.h.handle, f.controlId);
            const receipt = control.outputReceipts[result.output.outputKey];
            expect(receipt.status).toBe('prepared'); expect(receipt.domainReceipt).toBeNull();
            expect(receipt.outputKey).toBe(rpNativeOutputKey(f.controlId, receipt.source));
            expect(f.requests).toHaveLength(1);
            expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(2);
            expect((await f.authority.execution.runs.get(f.h.handle, result.runId)).status).toBe('running');
            await expect(f.control.beginNativeOutput(f.h.handle, { capture: {} })).rejects.toThrow();
        } finally { await f.cleanup(); }
    });

    test('one original permit writes atomic body+marker and reconciles only the actual marker', async () => {
        const f = await rpModelFixture(make, { configurePlan }), prepare = RpOutputController.prototype.prepare;
        let permit, receipt, expired, hookError, second;
        RpOutputController.prototype.prepare = async function (handle, request) {
            const prepared = await prepare.call(this, handle, request), control = this.control;
            try {
                expired = request.capture;
                const first = await control.beginNativeOutput(handle, request); permit = first.permit; receipt = first.receipt;
                second = await control.beginNativeOutput(handle, request);
                await control._chatRepo.commitNativeOutput(handle, { permit });
            } catch (error) { hookError = error; throw error; }
            return prepared;
        };
        try {
            await f.run().catch(error => { throw hookError ?? error; });
            expect(second.permit).toBeNull(); expect(second.receipt.status).toBe('writing');
            const request = { controlId: f.controlId, outputKey: receipt.outputKey, operationId: receipt.operationId };
            const chat = await f.chats.get(f.h.handle, 'Actor', 'main');
            expect(chat.body).toHaveLength(3); expect(chat.body[2].mes).toBe(RP_MODEL_TEXT);
            expect(chat.body[2].extra).toMatchObject({ gen_id: 'native-output:' + receipt.outputKey, atri_output: { operationId: receipt.operationId, payloadHash: receipt.payloadHash } });
            expect((await f.control.reconcileNativeOutput(f.h.handle, request)).status).toBe('committed');
            expect((await f.control.reconcileNativeOutput(f.h.handle, request)).receipt.domainReceipt.integrity).toBe(chat.integrity);
            await expect(f.chats.commitNativeOutput(f.h.handle, { permit })).rejects.toThrow();
            await expect(f.chats.commitNativeOutput(f.h.handle, { permit: structuredClone(permit) })).rejects.toThrow();
            await expect(f.control.beginNativeOutput(f.h.handle, { capture: expired })).rejects.toThrow();
            const body = structuredClone(chat.body); body[2].mes = 'User edited'; delete body[2].extra;
            await f.chats.save(f.h.handle, 'Actor', 'main', chat.header, body, chat.integrity);
            const edited = await f.chats.get(f.h.handle, 'Actor', 'main');
            expect(edited.body[2].extra).toEqual(chat.body[2].extra);
            expect(await f.control.reconcileNativeOutput(f.h.handle, request)).toMatchObject({ status: 'committed', current: false });
            await f.chats.delete(f.h.handle, 'Actor', 'main');
            expect(await f.control.reconcileNativeOutput(f.h.handle, request)).toMatchObject({ status: 'committed', current: false });
            expect(f.requests).toHaveLength(1);
        } finally { RpOutputController.prototype.prepare = prepare; await f.cleanup(); }
    });

    test('different Runs for the exact same slot share the original output identity', async () => {
        const f = await rpModelFixture(make, { configurePlan });
        try {
            const first = await f.run(), second = await f.run({ requestId: 'another-request' });
            expect(first.runId).not.toBe(second.runId); expect(first.output.outputKey).toBe(second.output.outputKey);
            expect(Object.keys((await f.control.status(f.h.handle, f.controlId)).outputReceipts)).toHaveLength(1);
            expect(f.requests).toHaveLength(2); expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(2);
        } finally { await f.cleanup(); }
    });

    test.each(['saved', 'no_save'])('writing CAS ACK %s never recreates a permit from a missing marker, including cold reopen', async ack => {
        const f = await rpModelFixture(make, { configurePlan }), prepare = RpOutputController.prototype.prepare;
        const transaction = f.h.engine.withTransaction.bind(f.h.engine);
        let armed = false, injected = false, receipt, expired, cold;
        f.h.engine.withTransaction = async (handle, callback, ...options) => {
            const result = await transaction(handle, async tx => {
                const value = await callback(tx);
                if (armed && !injected && value?.denied === false && value.value?.issued && ack === 'no_save') {
                    injected = true; throw new StorageCommitUnknownError(new Error('Before writing CAS'));
                }
                return value;
            }, ...options);
            if (armed && !injected && result?.denied === false && result.value?.issued && ack === 'saved') {
                injected = true; throw new StorageCommitUnknownError(new Error('After writing CAS'));
            }
            return result;
        };
        RpOutputController.prototype.prepare = async function (handle, request) {
            const prepared = await prepare.call(this, handle, request), control = this.control; receipt = prepared.receipt; expired = request.capture; armed = true;
            return control.beginNativeOutput(handle, request);
        };
        try {
            const failure = await f.run().then(() => null, error => error); armed = false;
            expect(failure).not.toBeNull(); expect(injected).toBe(true);
            const request = { controlId: f.controlId, outputKey: receipt.outputKey, operationId: receipt.operationId };
            expect((await f.control.reconcileNativeOutput(f.h.handle, request)).status).toBe(ack === 'saved' ? 'unknown' : 'prepared');
            expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(2);
            await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            const control = new RpRunControl({ engine: cold });
            expect((await control.reconcileNativeOutput(f.h.handle, request)).status).toBe(ack === 'saved' ? 'unknown' : 'prepared');
            await expect(control.beginNativeOutput(f.h.handle, { capture: expired })).rejects.toThrow();
            expect(f.requests).toHaveLength(1);
        } finally { armed = false; RpOutputController.prototype.prepare = prepare; f.h.engine.withTransaction = transaction; await cold?.close(); await f.cleanup(); }
    });

    test('Chat ACK loss is reconciled from one complete marker without a second physical commit', async () => {
        const f = await rpModelFixture(make, { configurePlan }), prepare = RpOutputController.prototype.prepare;
        const transaction = f.h.engine.withTransaction.bind(f.h.engine); let armed = false, injected = false, receipt;
        f.h.engine.withTransaction = async (handle, callback, ...options) => {
            const value = await transaction(handle, callback, ...options);
            if (armed && !injected && value?.status === 'committed' && value.receipt?.controlId === f.controlId) {
                injected = true; throw new StorageCommitUnknownError(new Error('After single chat commit'));
            }
            return value;
        };
        RpOutputController.prototype.prepare = async function (handle, request) {
            const prepared = await prepare.call(this, handle, request), control = this.control; receipt = prepared.receipt;
            const { permit } = await control.beginNativeOutput(handle, request); armed = true;
            await control._chatRepo.commitNativeOutput(handle, { permit }); return prepared;
        };
        try {
            const failure = await f.run().then(() => null, error => error); armed = false;
            expect(failure).not.toBeNull(); expect(injected).toBe(true);
            const request = { controlId: f.controlId, outputKey: receipt.outputKey, operationId: receipt.operationId };
            expect(await f.control.reconcileNativeOutput(f.h.handle, request)).toMatchObject({ status: 'committed', current: true });
            expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(3); expect(f.requests).toHaveLength(1);
        } finally { armed = false; RpOutputController.prototype.prepare = prepare; f.h.engine.withTransaction = transaction; await f.cleanup(); }
    });

    test('save/append/whole and nested patches cannot forge or clear an output marker while legitimate edits persist', async () => {
        const f = await rpModelFixture(make, { configurePlan }), prepare = RpOutputController.prototype.prepare;
        RpOutputController.prototype.prepare = async function (handle, request) {
            const prepared = await prepare.call(this, handle, request), control = this.control, { permit } = await control.beginNativeOutput(handle, request);
            await control._chatRepo.commitNativeOutput(handle, { permit }); return prepared;
        };
        try {
            await f.run(); let chat = await f.chats.get(f.h.handle, 'Actor', 'main'); const original = chat.body[2];
            await expect(f.chats.append(f.h.handle, 'Actor', 'main', [original], chat.integrity)).rejects.toMatchObject({ code: 'native_rp_output_marker_protected' });
            const forged = structuredClone(chat.body); forged[0].extra = original.extra;
            await expect(f.chats.save(f.h.handle, 'Actor', 'main', chat.header, forged, chat.integrity)).rejects.toThrow();
            await expect(f.chats.patch(f.h.handle, 'Actor', 'main', [{ op: 'replace', path: '/body/2/extra/atri_output/payloadHash', value: 'a'.repeat(64) }], chat.integrity)).rejects.toThrow();
            await f.chats.patchMessages(f.h.handle, 'Actor', 'main', [{ op: 'replace', path: '/2', value: { mes: 'Legitimate edit' } }], chat.integrity);
            chat = await f.chats.get(f.h.handle, 'Actor', 'main'); expect(chat.body[2].mes).toBe('Legitimate edit'); expect(chat.body[2].extra).toEqual(original.extra);
            await f.chats.patch(f.h.handle, 'Actor', 'main', [{ op: 'remove', path: '/body/2/extra/atri_output' }], chat.integrity);
            chat = await f.chats.get(f.h.handle, 'Actor', 'main'); expect(chat.body[2].extra).toEqual(original.extra);
            await f.chats.patchMessages(f.h.handle, 'Actor', 'main', [{ op: 'remove', path: '/2' }], chat.integrity);
            expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(2);
        } finally { RpOutputController.prototype.prepare = prepare; await f.cleanup(); }
    });

    test('a lawful edit at the final Model bank await persists before the one-use Chat permit is denied', async () => {
        const f = await rpModelFixture(make, { configurePlan }), prepare = RpOutputController.prototype.prepare;
        const assertCurrent = BudgetPort.prototype.assertCurrent; let armed = false, injected = false;
        BudgetPort.prototype.assertCurrent = async function (handle, ref, options) {
            const result = await assertCurrent.call(this, handle, ref, options);
            if (armed && !injected && options?.tx) {
                injected = true; const chat = await f.chats.get(handle, 'Actor', 'main'); chat.body[1].mes = 'Lawful last-await edit';
                await f.chats.save(handle, 'Actor', 'main', chat.header, chat.body, chat.integrity);
            }
            return result;
        };
        RpOutputController.prototype.prepare = async function (handle, request) {
            const prepared = await prepare.call(this, handle, request), control = this.control, { permit } = await control.beginNativeOutput(handle, request); armed = true;
            await control._chatRepo.commitNativeOutput(handle, { permit }); return prepared;
        };
        try {
            const failure = await f.run().then(() => null, error => error); armed = false;
            expect(injected).toBe(true); expect(failure).not.toBeNull();
            const chat = await f.chats.get(f.h.handle, 'Actor', 'main'); expect(chat.body[1].mes).toBe('Lawful last-await edit'); expect(chat.body).toHaveLength(2);
            const control = await f.control.status(f.h.handle, f.controlId); expect(Object.values(control.outputReceipts)[0].status).toBe('writing');
            expect(Object.values(control.operations)[0].compute.attempts[0].usage.totalTokens).toBe(20);
        } finally { armed = false; BudgetPort.prototype.assertCurrent = assertCurrent; RpOutputController.prototype.prepare = prepare; await f.cleanup(); }
    });


});

describe.each(harnesses.filter(({ name }) => name === 'FsEngine'))('$name output file durability', ({ make }) => {
    // Windows has no directory fsync barrier (durable-file.js), so nothing can fail there.
    (process.platform === 'win32' ? test.skip : test)('a directory durability failure after rename leaves one complete marker for observation, never an automatic replay', async () => {
        const f = await rpModelFixture(make, { configurePlan }), prepare = RpOutputController.prototype.prepare, sync = fs.fsyncSync;
        let armed = false, injected = false, receipt;
        fs.fsyncSync = fd => {
            if (armed && !injected && fs.fstatSync(fd).isDirectory()) { injected = true; throw Object.assign(new Error('Directory barrier failed after rename'), { code: 'EIO' }); }
            return sync(fd);
        };
        RpOutputController.prototype.prepare = async function (handle, request) {
            const prepared = await prepare.call(this, handle, request), control = this.control; receipt = prepared.receipt;
            const { permit } = await control.beginNativeOutput(handle, request); armed = true;
            await control._chatRepo.commitNativeOutput(handle, { permit }); return prepared;
        };
        try {
            const failure = await f.run().then(() => null, error => error); armed = false;
            expect(failure).not.toBeNull(); expect(injected).toBe(true);
            expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(3);
            expect(await f.control.reconcileNativeOutput(f.h.handle, { controlId: f.controlId, operationId: receipt.operationId, outputKey: receipt.outputKey }))
                .toMatchObject({ status: 'committed', current: true });
            expect(f.requests).toHaveLength(1);
        } finally { armed = false; fs.fsyncSync = sync; RpOutputController.prototype.prepare = prepare; await f.cleanup(); }
    });

});
