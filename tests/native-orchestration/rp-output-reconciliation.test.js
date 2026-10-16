import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { NativeNarratorOrchestrationAuthority } from '../../src/native/orchestration/native-turn-orchestration.js';
import { RpRunControl } from '../../src/native/rp-run-control.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash, putMutable } from '../../src/native/repositories/common.js';
import { controlRecordKey, runGuard } from '../../src/native/orchestration/controller-common.js';
import { readEffect } from '../../src/native/orchestration/effect-contracts.js';
import { BudgetPort, localWorkAttemptId } from '../../src/native/orchestration/budget-port.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpModelFixture } from './helpers/rp-model-fixture.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const configurePlan = plan => {
    plan.definition.nodes.find(node => node.kind === 'output').capabilities = ['chat.output'];
    plan.definition.capabilityCeiling = [...plan.definition.nodes[0].capabilities, 'chat.output'];
    Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 65536 } });
};
const coldAuthority = f => {
    const host = new NativeGenerationHost({ persistence: f.persistence, library: f.library, sessionCore: f.host.sessionCore,
        providers: f.host.providers, secretPort: f.host.secretPort });
    host.turnOrchestration = new NativeNarratorOrchestrationAuthority({ engine: f.h.engine, sessionCore: host.sessionCore,
        rpControl: new RpRunControl({ engine: f.h.engine, chatRepo: f.chats }) });
    return host.turnOrchestration;
};

async function interruptOutput(f, stage) {
    let undo;
    if (stage === 'domain_ack') {
        const original = RpRunControl.prototype.reconcileNativeOutput;
        RpRunControl.prototype.reconcileNativeOutput = function () { throw new StorageCommitUnknownError(new Error('Before original output receipt commit')); };
        undo = () => { RpRunControl.prototype.reconcileNativeOutput = original; };
    } else if (stage === 'local_usage') {
        const original = BudgetPort.prototype.settleLocalWork;
        BudgetPort.prototype.settleLocalWork = function (handle, ref, attemptId, usage) {
            if (f.effects[1] && attemptId === localWorkAttemptId(f.effects[1].effectId, 0)) throw new Error('Before original output work settlement');
            return original.call(this, handle, ref, attemptId, usage);
        };
        undo = () => { BudgetPort.prototype.settleLocalWork = original; };
    } else {
        const effects = f.authority.execution.effects, original = effects.claim.bind(effects);
        effects.claim = async (handle, input) => {
            const result = await original(handle, input);
            if (f.effects[1]?.effectId === input.effectId) throw new StorageCommitUnknownError(new Error('Output claim ACK lost'));
            return result;
        };
        undo = () => { effects.claim = original; };
    }
    try { return await f.run().then(result => ({ result, error: null }), error => ({ result: null, error })); } finally { undo(); }
}

describe.each(harnesses)('$name original RP output receipt cold reconciliation', ({ make }) => {
    test('a committed original Chat receipt confirms its pending Effect without restoring output or model authority', async () => {
        const f = await rpModelFixture(make, { configurePlan }), effects = f.authority.execution.effects, observe = effects.observe.bind(effects);
        effects.observe = (handle, input) => input.observation.reasonCode === 'rp_output_committed'
            ? Promise.reject(new StorageCommitUnknownError(new Error('Before Host output receipt commit'))) : observe(handle, input);
        try {
            const result = await f.run(), before = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.effectReceiptRef).toBeNull(); expect(before.pendingEffectRefs).toEqual([result.output.outputEffectId]);
            const domainBefore = hash((await f.control.status(f.h.handle, f.controlId)).outputReceipts);
            effects.observe = observe;
            await f.h.engine.nativeHostLifecycle.afterRestore(f.h.handle);
            const cold = coldAuthority(f), runs = cold.execution.runs;
            await runs.recover(f.h.handle, createNativeId('orchestrationCommand'), runGuard(before));
            const input = { runId: result.runId, effectId: result.output.outputEffectId };
            const chat = await f.chats.get(f.h.handle, 'Actor', 'main');
            chat.body[1].mes = 'Later lawful input edit'; chat.body[2].mes = 'Later lawful output edit';
            await f.chats.save(f.h.handle, 'Actor', 'main', chat.header, chat.body, chat.integrity);
            await expect(cold.reconcileRpOutput(f.h.handle, { ...input, payload: 'forged' })).rejects.toThrow();
            await expect(cold.reconcileRpOutput(f.h.handle, { ...input, effectId: result.effectId })).rejects.toThrow();
            const reconciled = await cold.reconcileRpOutput(f.h.handle, input);
            expect(reconciled).toMatchObject({ status: 'confirmed', budgetSettled: true, resumed: false });
            const after = await runs.get(f.h.handle, result.runId);
            expect(after.status).toBe('blocked'); expect(after.outputClaims).toEqual([]); expect(after.pendingEffectRefs).toEqual([]);
            expect(after.progress).toEqual(before.progress);
            expect((await f.h.engine.withTransaction(f.h.handle, tx => readEffect(tx, f.h.handle, after, input.effectId))).doc.status).toBe('confirmed');
            expect(await cold.reconcileRpOutput(f.h.handle, input)).toEqual(reconciled);
            expect((await runs.get(f.h.handle, result.runId)).stateVersion).toBe(after.stateVersion);
            expect(hash((await f.control.status(f.h.handle, f.controlId)).outputReceipts)).toBe(domainBefore);
            expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(3); expect(f.requests).toHaveLength(1);
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const key = controlRecordKey(f.h.handle, input.runId, 'effect', input.effectId), saved = await tx.getResource(key);
                const forged = { ...saved.doc, inputRef: { ...saved.doc.inputRef, payloadHash: hash('forged output') } };
                forged.inputHash = hash(forged.inputRef);
                await putMutable(tx, key, forged, { expectedIntegrity: saved.integrity });
            });
            await expect(cold.reconcileRpOutput(f.h.handle, input)).rejects.toMatchObject({ code: 'native_rp_output_reconciliation_unavailable' });
        } finally { effects.observe = observe; await f.cleanup(); }
    }, 30000);

    test.each(['saved', 'no_save'])('cold reconciliation receipt ACK %s never repeats an external operation', async ack => {
        const f = await rpModelFixture(make, { configurePlan }), effects = f.authority.execution.effects, observe = effects.observe.bind(effects);
        effects.observe = (handle, input) => input.observation.reasonCode === 'rp_output_committed'
            ? Promise.reject(new StorageCommitUnknownError(new Error('Before Host output receipt commit'))) : observe(handle, input);
        let transaction;
        try {
            const result = await f.run(), input = { runId: result.runId, effectId: result.output.outputEffectId };
            effects.observe = observe;
            await f.h.engine.nativeHostLifecycle.afterRestore(f.h.handle);
            const cold = coldAuthority(f), runs = cold.execution.runs;
            await runs.recover(f.h.handle, createNativeId('orchestrationCommand'), runGuard(await runs.get(f.h.handle, input.runId)));
            transaction = f.h.engine.withTransaction.bind(f.h.engine);
            let injected = false;
            const matches = value => value?.outcome?.effectId === input.effectId && value.outcome.status === 'confirmed';
            f.h.engine.withTransaction = async (handle, callback, ...options) => {
                const result = await transaction(handle, async tx => {
                    const value = await callback(tx);
                    if (!injected && ack === 'no_save' && matches(value)) { injected = true; throw new StorageCommitUnknownError(new Error('Reconcile rollback')); }
                    return value;
                }, ...options);
                if (!injected && ack === 'saved' && matches(result)) { injected = true; throw new StorageCommitUnknownError(new Error('Reconcile ACK lost')); }
                return result;
            };
            const first = await cold.reconcileRpOutput(f.h.handle, input).then(value => ({ value, error: null }), error => ({ value: null, error }));
            expect(injected).toBe(true); expect(first.error?.code ?? null).toBe(ack === 'saved' ? null : 'storage_commit_unknown');
            f.h.engine.withTransaction = transaction;
            const observed = await cold.reconcileRpOutput(f.h.handle, input);
            expect(observed.status).toBe('confirmed'); expect(f.requests).toHaveLength(1);
            expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(3);
            const receipts = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRecord,
                handle: f.h.handle, runId: input.runId, recordType: 'receipt' }));
            expect(receipts.filter(row => row.doc.reasonCode === 'rp_output_reconciled')).toHaveLength(1);
        } finally { if (transaction) f.h.engine.withTransaction = transaction; effects.observe = observe; await f.cleanup(); }
    }, 30000);

    test.each(['domain_ack', 'local_usage', 'claim_ack'])('%s retains original uncertain facts and never sends or appends again', async stage => {
        const f = await rpModelFixture(make, { configurePlan });
        try {
            const interrupted = await interruptOutput(f, stage);
            expect(interrupted.result?.output.status ?? 'interrupted').toBe(stage === 'domain_ack' ? 'unknown' : 'interrupted');
            const input = { runId: f.effects[1].runId, effectId: f.effects[1].effectId };
            const before = await f.authority.execution.runs.get(f.h.handle, input.runId);
            const bankBefore = hash(Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute);
            await f.h.engine.nativeHostLifecycle.afterRestore(f.h.handle);
            const cold = coldAuthority(f), runs = cold.execution.runs;
            await runs.recover(f.h.handle, createNativeId('orchestrationCommand'), runGuard(before));
            if (stage === 'domain_ack') await runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), {
                ...runGuard(await runs.get(f.h.handle, input.runId)), reasonCode: 'cancel_before_receipt_reconciliation' });
            const reconciled = await cold.reconcileRpOutput(f.h.handle, input), after = await runs.get(f.h.handle, input.runId);
            expect(reconciled.status).toBe(stage === 'claim_ack' ? 'unknown' : 'confirmed');
            expect(reconciled.budgetSettled ?? false).toBe(stage === 'domain_ack');
            expect(after.status).toBe(stage === 'domain_ack' ? 'cancelled' : 'reconciling');
            expect(after.pendingEffectRefs).toEqual(stage === 'domain_ack' ? [] : [input.effectId]);
            expect(after.outputClaims).toEqual([]); expect(after.progress).toEqual(before.progress);
            expect(hash(Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute)).toBe(bankBefore);
            expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(stage === 'claim_ack' ? 2 : 3);
            expect(f.requests).toHaveLength(1);
            const receipts = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRecord,
                handle: f.h.handle, runId: input.runId, recordType: 'receipt' }));
            expect(receipts.filter(row => row.doc.effectId === input.effectId && row.doc.outcome === 'unknown')).toHaveLength(stage === 'domain_ack' ? 1 : 0);
        } finally { await f.cleanup(); }
    }, 30000);
});
