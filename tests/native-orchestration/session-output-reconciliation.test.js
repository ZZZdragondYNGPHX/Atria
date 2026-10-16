import express from 'express';
import httpRequest from 'supertest';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { sessionOutputFixture as setup } from './helpers/session-output-fixture.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash, putMutable } from '../../src/native/repositories/common.js';
import { controlRecordKey, runGuard } from '../../src/native/orchestration/controller-common.js';
import { BudgetPort, localWorkAttemptId } from '../../src/native/orchestration/budget-port.js';
import { RunObservationService } from '../../src/native/orchestration/run-observation-service.js';
import { createNativeOrchestrationRouter } from '../../src/endpoints/native-orchestration.js';
import { readEffect } from '../../src/native/orchestration/effect-contracts.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
function api(f) {
    const engine = f.authority.execution.runs.engine;
    const observations = new RunObservationService({ engine, sessionCore: f.core, pollMs: 0,
        reconcileOutput: (handle, input) => f.authority.reconcileOutput(handle, input) });
    const service = { observations, hostBootId: engine.nativeHostLifecycle.hostBootId };
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { req.user = { profile: { handle: f.h.handle, enabled: true } }; next(); });
    app.use('/api/native/orchestration', createNativeOrchestrationRouter(() => service));
    return {
        mutate: (method, body, id = createNativeId('orchestrationCommand')) => httpRequest(app)
            .post('/api/native/orchestration/runs/' + method).set('X-Atria-Host-Boot-Id', service.hostBootId)
            .send({ schemaVersion: 1, commandId: id, expectedHostBootId: service.hostBootId, body }),
        observe: runId => httpRequest(app).post('/api/native/orchestration/runs/observe')
            .send({ schemaVersion: 1, body: { runId, cursor: null, limit: 100 } }),
    };
}

async function interrupt(f, stage) {
    const effects = f.authority.execution.effects;
    let undo;
    if (stage === 'host_receipt') {
        const original = effects.observe.bind(effects);
        effects.observe = (handle, input) => input.observation.reasonCode === 'session_output_committed'
            ? Promise.reject(new StorageCommitUnknownError(new Error('Before Session Host receipt commit'))) : original(handle, input);
        undo = () => { effects.observe = original; };
    } else if (stage === 'claim_ack') {
        const original = effects.claim.bind(effects);
        effects.claim = async (handle, input) => {
            const result = await original(handle, input);
            const root = await f.authority.execution.runs.get(handle, input.runId);
            const intent = (await f.h.engine.withTransaction(handle, tx => readEffect(tx, handle, root, input.effectId))).doc;
            if (intent.actionRef.kind === 'native_session_output') throw new StorageCommitUnknownError(new Error('Session claim ACK lost'));
            return result;
        };
        undo = () => { effects.claim = original; };
    } else {
        const original = BudgetPort.prototype.settleLocalWork, prepare = effects.prepare.bind(effects);
        let outputEffectId;
        effects.prepare = (handle, input) => {
            if (input.proposal.actionRef.kind === 'native_session_output') outputEffectId = input.effectId;
            return prepare(handle, input);
        };
        BudgetPort.prototype.settleLocalWork = function (handle, ref, attemptId, usage) {
            if (outputEffectId && attemptId === localWorkAttemptId(outputEffectId, 0)) throw new Error('Before Session output usage settlement');
            return original.call(this, handle, ref, attemptId, usage);
        };
        undo = () => { BudgetPort.prototype.settleLocalWork = original; effects.prepare = prepare; };
    }
    try { return await f.start().then(result => ({ result, error: null }), error => ({ result: null, error })); } finally { undo(); }
}

describe.each(harnesses)('$name original Session output cold reconciliation', ({ make }) => {
    test('reopened Engine and protected HTTP confirm the exact original commit after a later lawful input', async () => {
        const f = await setup(make);
        try {
            const { result, error } = await interrupt(f, 'host_receipt'); expect(error).toBeNull();
            const input = { ...f.effectRef }, before = await f.authority.execution.runs.get(f.h.handle, input.runId);
            const bankBefore = hash((await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[before.budgetAuthorityRef.operationId].compute);
            await f.core.appendTimeline(f.h.handle, f.base.session.sessionId, { role: 'user', content: 'Lawful input after pending output' });
            const current = await f.core.observe(f.h.handle, f.base.session.sessionId), oldBoot = before.hostBootId;
            await f.cold();
            const runs = f.authority.execution.runs, engine = runs.engine, client = api(f);
            expect(engine.nativeHostLifecycle.hostBootId).not.toBe(oldBoot);
            await client.mutate('recover', runGuard(before)).expect(200);
            const body = runGuard(await runs.get(f.h.handle, input.runId)), id = createNativeId('orchestrationCommand');
            expect((await client.observe(input.runId).expect(200)).body.outcome.payload.controls.reconcile).toBe(true);
            const reconciled = (await client.mutate('reconcile', body, id).expect(200)).body.outcome;
            expect(reconciled).toMatchObject({ status: 'blocked', resumed: false, observation: { status: 'confirmed', budgetSettled: true } });
            expect((await client.mutate('reconcile', body, id).expect(200)).body.outcome).toEqual(reconciled);
            const root = await runs.get(f.h.handle, input.runId);
            expect(root.pendingEffectRefs).toEqual([]); expect(root.outputClaims).toEqual([]); expect(root.progress).toEqual(before.progress);
            expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).revision).toEqual(current.revision);
            expect(hash((await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute)).toBe(bankBefore);
            const receipt = (await engine.withTransaction(f.h.handle, tx => tx.getResource(controlRecordKey(f.h.handle, input.runId, 'receipt', reconciled.observation.receiptRef.receiptId)))).doc;
            expect(receipt.domainReceiptRef.revisionId).toBe(result.revision.revisionId); expect(f.requests).toHaveLength(1);
            await engine.withTransaction(f.h.handle, async tx => {
                const key = controlRecordKey(f.h.handle, input.runId, 'effect', input.effectId), saved = await tx.getResource(key);
                await putMutable(tx, key, { ...saved.doc, endpointBindingDigest: hash('foreign endpoint') }, { expectedIntegrity: saved.integrity });
            });
            await expect(f.authority.reconcileOutput(f.h.handle, input)).rejects.toMatchObject({ code: 'native_orchestration_session_reconciliation_unavailable' });
        } finally { await f.cleanup(); }
    }, 30000);

    test.each(['claim_ack', 'local_usage'])('%s keeps the original missing receipt or unsettled local cost after restart', async stage => {
        const f = await setup(make);
        try {
            const interrupted = await interrupt(f, stage); expect(interrupted.error).not.toBeNull();
            const input = { ...f.effectRef }, before = await f.authority.execution.runs.get(f.h.handle, input.runId);
            const snapshot = await f.core.observe(f.h.handle, f.base.session.sessionId);
            const bankBefore = hash((await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[before.budgetAuthorityRef.operationId].compute);
            await f.cold();
            const runs = f.authority.execution.runs, client = api(f);
            await client.mutate('recover', runGuard(before)).expect(200);
            const result = (await client.mutate('reconcile', runGuard(await runs.get(f.h.handle, input.runId))).expect(200)).body.outcome;
            expect(result).toMatchObject({ status: 'reconciling', resumed: false,
                observation: { status: stage === 'claim_ack' ? 'unknown' : 'confirmed' } });
            expect(result.observation.budgetSettled ?? false).toBe(false);
            const root = await runs.get(f.h.handle, input.runId);
            expect(root.pendingEffectRefs).toEqual([input.effectId]); expect(root.outputClaims).toEqual([]); expect(root.progress).toEqual(before.progress);
            expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).revision).toEqual(snapshot.revision);
            expect(hash((await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute)).toBe(bankBefore);
            expect((await client.observe(input.runId).expect(200)).body.outcome.payload.controls.resume).toBe(false);
            expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 30000);

    test.each(['saved', 'no_save'])('Session reconciliation receipt ACK %s only observes the exact stable fact', async ack => {
        const f = await setup(make);
        let transaction, engine;
        try {
            await interrupt(f, 'host_receipt');
            const input = { ...f.effectRef }, before = await f.authority.execution.runs.get(f.h.handle, input.runId);
            await f.cold();
            const { runs } = f.authority.execution; engine = runs.engine;
            await runs.recover(f.h.handle, createNativeId('orchestrationCommand'), runGuard(before));
            if (ack === 'saved') await runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), {
                ...runGuard(await runs.get(f.h.handle, input.runId)), reasonCode: 'cancel_before_session_reconciliation' });
            const originalRevision = (await f.core.observe(f.h.handle, f.base.session.sessionId)).revision;
            transaction = engine.withTransaction.bind(engine);
            let injected = false;
            const matches = value => value?.outcome?.effectId === input.effectId && value.outcome.status === 'confirmed';
            engine.withTransaction = async (handle, callback, ...options) => {
                const value = await transaction(handle, async tx => {
                    const applied = await callback(tx);
                    if (!injected && ack === 'no_save' && matches(applied)) { injected = true; throw new StorageCommitUnknownError(new Error('Session reconciliation rollback')); }
                    return applied;
                }, ...options);
                if (!injected && ack === 'saved' && matches(value)) { injected = true; throw new StorageCommitUnknownError(new Error('Session reconciliation ACK lost')); }
                return value;
            };
            const first = await f.authority.reconcileOutput(f.h.handle, input).then(value => ({ value, error: null }), error => ({ value: null, error }));
            expect(injected).toBe(true); expect(first.error?.code ?? null).toBe(ack === 'saved' ? null : 'storage_commit_unknown');
            engine.withTransaction = transaction;
            expect((await f.authority.reconcileOutput(f.h.handle, input)).status).toBe('confirmed');
            const root = await runs.get(f.h.handle, input.runId);
            expect(root.status).toBe(ack === 'saved' ? 'cancelled' : 'blocked'); expect(root.outputClaims).toEqual([]);
            expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).revision).toEqual(originalRevision);
            expect(f.requests).toHaveLength(1);
        } finally { if (transaction) engine.withTransaction = transaction; await f.cleanup(); }
    }, 30000);
});
