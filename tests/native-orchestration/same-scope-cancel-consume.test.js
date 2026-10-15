import { modelPortFixture } from './helpers/model-port-fixture.js';
import { jest } from '@jest/globals';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { createNativeId } from '../../src/native/identity.js';
import { runGuard, controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { readEffect } from '../../src/native/orchestration/effect-contracts.js';
import { putMutable } from '../../src/native/repositories/common.js';
import { checkedRecord } from '../../src/native/orchestration/plan-repository.js';
import { toolCompletionFixture } from './helpers/tool-completion-fixture.js';

if (process.env.ATRIA_TEST_SAME_SCOPE_SQL === '1') jest.setTimeout(60000);

// Deliberate same-ALS fault injection, not an external concurrent request.
// The original transaction can see its own successful controller writes.
describe.each(CONTRACT_HARNESSES.filter(({ name }) => process.env.ATRIA_TEST_SAME_SCOPE_SQL === '1' || ['FsEngine', 'SqliteEngine'].includes(name)))('$name same-scope final Model consumption', ({ make }) => {
    test.each(['cancel', 'current_unknown'])('%s after the last bank await cannot return a stale body; durable facts and charges survive', async fault => {
        const f = await modelPortFixture(make), service = f.authority.execution;
        const original = service.budgetPort.assertCurrent.bind(service.budgetPort);
        let injected = false, sameTransaction = false, before, after, confirmed;
        try {
            service.budgetPort.assertCurrent = async (...args) => {
                const result = await original(...args);
                if (!f.effectRef || injected) return result;
                await f.h.engine.withTransaction(f.h.handle, async tx => {
                    const root = await service.runs.get(f.h.handle, f.effectRef.runId);
                    const record = await readEffect(tx, f.h.handle, root, f.effectRef.effectId);
                    if (record.doc.status !== 'confirmed') return;
                    injected = true; before = root; confirmed = await f.observe();
                    if (fault === 'cancel') await service.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), {
                        ...runGuard(root), reasonCode: 'same_scope_cancel_during_final_consume' });
                    else await service.runs.control(f.h.handle, createNativeId('orchestrationCommand'), { ...runGuard(root),
                        operation: 'effect.observe', detail: { fault: 'same_scope_current_unknown', effectId: f.effectRef.effectId } }, async ({ tx, root }) => {
                        const current = await readEffect(tx, f.h.handle, root, f.effectRef.effectId);
                        await putMutable(tx, controlRecordKey(f.h.handle, root.runId, 'effect', f.effectRef.effectId),
                            { ...current.doc, status: 'unknown' }, { expectedIntegrity: current.integrity });
                        root.status = 'reconciling'; root.pendingEffectRefs.push(f.effectRef.effectId);
                        return { root, eventType: 'effect_observed', reasonCode: 'same_scope_current_unknown', outcome: { effectId: f.effectRef.effectId, status: 'unknown' } };
                    });
                    await f.h.engine.withTransaction(f.h.handle, async observedTx => {
                        sameTransaction = observedTx === tx;
                        after = await service.runs.get(f.h.handle, root.runId);
                    });
                });
                return result;
            };
            const result = await f.start().then(value => ({ status: 'fulfilled', value }), error => ({ status: 'rejected', error }));
            expect(injected).toBe(true); expect(sameTransaction).toBe(true);
            expect(confirmed.outcome).toBe('confirmed'); expect(after.stateVersion).toBeGreaterThan(before.stateVersion);
            expect(after.cancelRequested).toBe(fault === 'cancel'); expect(f.requests).toHaveLength(1);
            const control = await f.core.runs.status(f.h.handle, f.base.session.sessionId);
            const charged = control.operations[before.budgetAuthorityRef.operationId].compute;
            expect(charged.attempts).toHaveLength(1); expect(charged.attempts[0].status).toBe('settled');
            await f.cold();
            expect((await f.observe()).outcome).toBe(fault === 'cancel' ? 'confirmed' : 'unknown');
            const coldReceipt = await f.authority.execution.runs.engine.withTransaction(f.h.handle, tx => checkedRecord(tx,
                controlRecordKey(f.h.handle, before.runId, 'receipt', confirmed.receiptRef.receiptId)));
            expect(coldReceipt.doc).toMatchObject({ outcome: 'confirmed', effectId: f.effectRef.effectId });
            const restored = await f.core.runs.status(f.h.handle, f.base.session.sessionId);
            expect(restored.operations[before.budgetAuthorityRef.operationId].compute).toEqual(charged);
            expect(result).toMatchObject({ status: 'rejected', error: { code: expect.stringMatching(/consume_denied|consumption_stale/) } });
            expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).timeline.some(item => item.content === 'Synthetic native narrator response.')).toBe(false);
        } finally { service.budgetPort.assertCurrent = original; await f.cleanup(); }
    });

    // This fixture uses explicit controlled grant Ports; original Skill files,
    // Run/Effect controllers, banks and storage are real. It proves consumption
    // ordering, not a production Skill authorization producer.
    test.each([
        ['skill_read', 'cancel'], ['skill_read', 'current_unknown'],
        ['skill_files', 'cancel'], ['skill_files', 'current_unknown'],
    ])('%s %s in the final bank await rejects body without losing original completion or local charges', async (kind, fault) => {
        const f = await toolCompletionFixture(make, kind), service = f.exec;
        const original = service.budgetPort.assertCurrent.bind(service.budgetPort);
        let injected = false, sameTransaction = false, before, after, confirmed;
        try {
            service.budgetPort.assertCurrent = async (...args) => {
                const result = await original(...args);
                if (injected) return result;
                await service.runs.engine.withTransaction(f.h.handle, async tx => {
                    const root = await service.runs.get(f.h.handle, f.root.runId);
                    const record = await readEffect(tx, f.h.handle, root, f.effectId);
                    if (record.doc.status !== 'confirmed') return;
                    injected = true; before = root; confirmed = await f.observe();
                    if (fault === 'cancel') await service.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), {
                        ...runGuard(root), reasonCode: 'same_scope_cancel_skill_consume' });
                    else await service.runs.control(f.h.handle, createNativeId('orchestrationCommand'), { ...runGuard(root),
                        operation: 'effect.observe', detail: { fault: 'same_scope_skill_unknown', effectId: f.effectId } }, async ({ tx, root }) => {
                        const current = await readEffect(tx, f.h.handle, root, f.effectId);
                        await putMutable(tx, controlRecordKey(f.h.handle, root.runId, 'effect', f.effectId),
                            { ...current.doc, status: 'unknown' }, { expectedIntegrity: current.integrity });
                        root.status = 'reconciling'; root.pendingEffectRefs.push(f.effectId);
                        return { root, eventType: 'effect_observed', reasonCode: 'same_scope_skill_unknown', outcome: { effectId: f.effectId, status: 'unknown' } };
                    });
                    await service.runs.engine.withTransaction(f.h.handle, async observedTx => {
                        sameTransaction = observedTx === tx;
                        after = await service.runs.get(f.h.handle, root.runId);
                    });
                });
                return result;
            };
            const result = await f.start().then(value => ({ status: 'fulfilled', value }), error => ({ status: 'rejected', error }));
            expect(injected).toBe(true); expect(sameTransaction).toBe(true);
            expect(confirmed.outcome).toBe('confirmed'); expect(after.stateVersion).toBeGreaterThan(before.stateVersion);
            expect(after.cancelRequested).toBe(fault === 'cancel'); expect(f.calls).toEqual([]);
            const control = await f.core.runs.status(f.h.handle, f.root.budgetAuthorityRef.sessionId);
            const charged = control.operations[before.budgetAuthorityRef.operationId].compute;
            expect(charged.attempts).toEqual([]); expect(charged.localWork.length).toBeGreaterThan(1);
            expect(charged.localWork.every(row => row.status === 'settled' && row.usage?.outcome === 'completed')).toBe(true);
            await f.cold();
            expect((await f.observe()).outcome).toBe(fault === 'cancel' ? 'confirmed' : 'unknown');
            const coldReceipt = await f.exec.runs.engine.withTransaction(f.h.handle, tx => checkedRecord(tx,
                controlRecordKey(f.h.handle, before.runId, 'receipt', confirmed.receiptRef.receiptId)));
            expect(coldReceipt.doc).toMatchObject({ outcome: 'confirmed', effectId: f.effectId });
            const restored = await f.core.runs.status(f.h.handle, f.root.budgetAuthorityRef.sessionId);
            expect(restored.operations[before.budgetAuthorityRef.operationId].compute).toEqual(charged);
            expect(result).toMatchObject({ status: 'rejected', error: { code: expect.stringMatching(/consume_denied|consumption_stale/) } });
        } finally { service.budgetPort.assertCurrent = original; await f.cleanup(); }
    });
});
