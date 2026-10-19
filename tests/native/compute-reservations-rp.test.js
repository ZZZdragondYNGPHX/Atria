import { ChatRepo } from '../../src/storage/repositories/chat-repo.js';
import { RpRunControl, rpOperationInput } from '../../src/native/rp-run-control.js';
import { pauseRecoveredRecord } from '../../src/native/recovery-effects.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { createNativeId } from '../../src/native/identity.js';
import { putMutable } from '../../src/native/repositories/common.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';

// Real ChatRepo and original RunControl RP extension on real Engines. Usage is
// synthetic; no Provider endpoint, V3 dispatcher or real bill is exercised.
const locator = name => ({ charDir: 'Actor', name, isGroup: false, groupId: null });
const message = (id, mes, swipe = 0) => ({ name: 'User', is_user: true, is_system: false, mes, swipe_id: swipe, memory_os_source_id: id });
const localWork = { maxJobs: 1, maxItems: 2, maxInputBytes: 100 }, limits = { maxRequests: 2, maxTokens: 200, localWork };
const child = id => ({ reservationId: id, parentReservationId: null, consumerId: 'test-' + id, limits: { maxRequests: 1, maxTokens: 150, localWork } });
const attempt = (overrides = {}) => ({ attemptId: 'c'.repeat(64), requestId: 'controlled-request', targetFingerprint: 'a'.repeat(64), inputFingerprint: 'b'.repeat(64), estimatedTokens: 100, ...overrides });

async function fixture(make) {
    const h = await make(), chats = new ChatRepo({ engine: h.engine }), bank = new RpRunControl({ engine: h.engine });
    const at = locator('main');
    await chats.save(h.handle, at.charDir, at.name, { chat_metadata: { note: 'kept' } }, [message('m1', 'Open the gate.')], null);
    const read = async (l = at) => chats.get(h.handle, l.charDir, l.name);
    const source = async (l = at) => ({ input: rpOperationInput((await read(l)).body[0], 0), purpose: 'narration', outputSlot: 'assistant' });
    return { h, chats, bank, at, read, source };
}

describe.each([['FsEngine', makeTempFsEngineHarness], ['SqliteEngine', makeTempSqliteEngineHarness]])('%s ordinary RP original bank', (_name, make) => {
    test('header binding, sibling CAS, stable admission, stale input refusal and late settlement keep one cost', async () => {
        const { h, chats, bank, at, read, source } = await fixture(make);
        try {
            const bound = await bank.bind(h.handle, at), controlId = bound.controlId;
            expect(bound).toEqual({ controlId, restoreState: 'ready' });
            expect((await read()).header.chat_metadata).toMatchObject({ note: 'kept', nativeControlId: controlId });
            expect(await bank.bind(h.handle, at)).toEqual(bound);

            const src = await source();
            const decisions = await Promise.allSettled(['A', 'B'].map(id => bank.reserveComputeChild(h.handle, controlId, src, limits, child(id))));
            expect(decisions.filter(row => row.status === 'fulfilled')).toHaveLength(1);
            expect(decisions.find(row => row.status === 'rejected').reason.code).toBe('native_generation_budget_exhausted');
            const { reservation, operation } = decisions.find(row => row.status === 'fulfilled').value, options = { reservationId: reservation.reservationId };
            expect((await bank.admitCompute(h.handle, controlId, src, limits, attempt(), options)).replayed).toBe(false);
            expect((await bank.admitCompute(h.handle, controlId, src, limits, attempt(), options)).replayed).toBe(true);
            await expect(bank.admitCompute(h.handle, controlId, src, limits, attempt({ inputFingerprint: 'e'.repeat(64) }), options)).rejects.toMatchObject({ code: 'native_generation_attempt_conflict' });
            await bank.settleCompute(h.handle, controlId, operation, attempt().attemptId, null);
            await expect(bank.releaseComputeChild(h.handle, controlId, operation, reservation.reservationId)).rejects.toMatchObject({ code: 'native_generation_reservation_unsettled' });

            // The input message changes: no new spend for the old operation, but the unknown attempt stays observable.
            const chat = await read();
            await chats.save(h.handle, at.charDir, at.name, chat.header, [message('m1', 'Open the gate.', 1)], chat.integrity);
            await expect(bank.admitCompute(h.handle, controlId, src, limits, attempt({ attemptId: 'd'.repeat(64) }), options)).rejects.toMatchObject({ code: 'native_generation_revision_conflict' });
            const observed = await bank.observeCompute(h.handle, controlId, operation, attempt().attemptId);
            expect(observed.compute).toMatchObject({ status: 'unknown', estimatedTokens: 100, reservationId: reservation.reservationId });

            await bank.settleCompute(h.handle, controlId, operation, attempt().attemptId, { totalTokens: 80 });
            expect((await bank.releaseComputeChild(h.handle, controlId, operation, reservation.reservationId)).replayed).toBe(false);
            const status = await bank.status(h.handle, controlId);
            expect(status.operations[operation].compute.attempts).toEqual([expect.objectContaining({ status: 'settled', usage: expect.objectContaining({ totalTokens: 80 }) })]);
            expect(status.operations[operation].compute.reservations).toEqual([expect.objectContaining({ status: 'released' })]);
        } finally { await h.cleanup(); }
    });

    test('rename keeps the bank, a copied header is paused until it is explicitly made independent', async () => {
        const { h, chats, bank, at, read, source } = await fixture(make);
        try {
            const { controlId } = await bank.bind(h.handle, at), src = await source();
            const first = await bank.admitCompute(h.handle, controlId, src, limits, attempt());
            await chats.rename(h.handle, at.charDir, at.name, 'renamed');
            await expect(bank.admitCompute(h.handle, controlId, src, limits, attempt())).rejects.toMatchObject({ code: 'native_rp_source_missing' });
            expect(await bank.bind(h.handle, locator('renamed'))).toEqual({ controlId, restoreState: 'ready' });
            expect((await bank.admitCompute(h.handle, controlId, await source(locator('renamed')), limits, attempt())).replayed).toBe(true);
            expect((await bank.status(h.handle, controlId)).operations[first.operation].compute.attempts).toHaveLength(1);

            const original = await read(locator('renamed'));
            await chats.save(h.handle, 'Actor', 'copy', original.header, original.body, null);
            await expect(bank.bind(h.handle, locator('copy'))).rejects.toMatchObject({ code: 'native_rp_control_duplicate' });
            await expect(bank.assignIndependent(h.handle, locator('renamed'))).rejects.toMatchObject({ code: 'native_rp_control_not_duplicate' });
            const copy = await bank.assignIndependent(h.handle, locator('copy'));
            expect(copy.controlId).not.toBe(controlId);
            expect((await bank.status(h.handle, copy.controlId)).operations).toEqual({});
            expect((await read(locator('copy'))).header.chat_metadata.nativeControlId).toBe(copy.controlId);
            expect((await bank.status(h.handle, controlId)).operations[first.operation].compute.attempts).toHaveLength(1);
        } finally { await h.cleanup(); }
    });

    test('unregistered header, partial init, restore review and missing control never become an unmetered send', async () => {
        const { h, chats, bank, at, source } = await fixture(make);
        try {
            await chats.save(h.handle, 'Actor', 'imported', { chat_metadata: { nativeControlId: createNativeId('rpControl') } }, [message('i1', 'Hi')], null);
            await expect(bank.bind(h.handle, locator('imported'))).rejects.toMatchObject({ code: 'native_rp_control_unregistered' });
            await expect(bank.admitCompute(h.handle, createNativeId('rpControl'), await source(), limits, attempt())).rejects.toMatchObject({ code: 'native_orchestration_budget_unavailable' });

            // Crash after the control record but before the header publication.
            const pending = createNativeId('rpControl');
            await h.engine.withTransaction(h.handle, tx => putMutable(tx, { kind: K.rpRunControl, handle: h.handle, controlId: pending }, { schemaVersion: 1, controlId: pending,
                sourceIdentity: { domain: 'rp_chat', isGroup: false, groupId: null }, locator: at, sequence: 0, generation: 0, operations: {}, outputReceipts: {}, restoreState: 'ready' }, { expectedIntegrity: null }));
            expect(await bank.bind(h.handle, at)).toEqual({ controlId: pending, restoreState: 'ready' });

            await bank.admitCompute(h.handle, pending, await source(), limits, attempt());
            const key = { kind: K.rpRunControl, handle: h.handle, controlId: pending };
            const record = await h.engine.withTransaction(h.handle, tx => tx.getResource(key));
            const older = { ...record, doc: { ...record.doc, operations: {} } };
            await h.engine.withTransaction(h.handle, async tx => tx.putResource(key, pauseRecoveredRecord(older, await tx.getResource(key))));
            const restored = await bank.status(h.handle, pending);
            expect(restored.restoreState).toBe('review_required');
            expect(Object.values(restored.operations)[0].compute.attempts).toHaveLength(1);
            await expect(bank.admitCompute(h.handle, pending, await source(), limits, attempt({ attemptId: 'f'.repeat(64) }))).rejects.toMatchObject({ code: 'native_rp_control_review_required' });
        } finally { await h.cleanup(); }
    });

    test('actual usage above the admitted upper bound is kept as overrun and blocks further admission', async () => {
        const { h, bank, at, source } = await fixture(make);
        try {
            const { controlId } = await bank.bind(h.handle, at), src = await source();
            const first = await bank.admitCompute(h.handle, controlId, src, limits, attempt({ estimatedTokens: 50 }));
            await bank.settleCompute(h.handle, controlId, first.operation, attempt().attemptId, { totalTokens: 400 });
            const ledger = (await bank.status(h.handle, controlId)).operations[first.operation].compute;
            expect(ledger.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 400 } });
            await expect(bank.admitCompute(h.handle, controlId, src, limits, attempt({ attemptId: 'f'.repeat(64), estimatedTokens: 1 }))).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
        } finally { await h.cleanup(); }
    });
});
