/* eslint-disable jest/no-conditional-expect -- Assertions inspect the actual child-only callback and parameterized original control writes. */
import { jest } from '@jest/globals';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpDelegationFixture } from './helpers/rp-delegation-fixture.js';
import { RP_MODEL_TEXT } from './helpers/rp-model-fixture.js';
import { inspectNativeRpDelegationIdentity, inspectNativeRpDelegation } from '../../src/native/orchestration/native-rp-generation.js';
import { ContextPort } from '../../src/native/orchestration/context-port.js';
import { checkedRecord } from '../../src/native/orchestration/plan-repository.js';
import { readAttempt, controlRecordKey, runGuard } from '../../src/native/orchestration/controller-common.js';
import { createNativeId } from '../../src/native/identity.js';
import { nativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';

const stateOf = async f => Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0];
const sql = process.env.ATRIA_TEST_RP_DELEGATION_SQL === '1';
const harnesses = CONTRACT_HARNESSES.filter(({ name }) => sql || ['FsEngine', 'SqliteEngine'].includes(name));
if (sql) jest.setTimeout(60000);

describe.each(harnesses)('$name original RP delegated Model', ({ make }) => {
    test('durable handoff funds one isolated child Model and returns pending refs only', async () => {
        const f = await rpDelegationFixture(make), original = ContextPort.prototype.compile;
        let identity, during, childCapture, parentAuthorityArgs, compileFailure;
        const observeCompile = async function (handle, request) {
            if (this.rpDelegationCapture) {
                childCapture = this.rpDelegationCapture;
                identity = inspectNativeRpDelegationIdentity(childCapture, { host: f.host, handle });
                during = await inspectNativeRpDelegation(childCapture, { host: f.host, handle });
                expect(() => inspectNativeRpDelegationIdentity({}, { host: f.host, handle })).toThrow();
                expect(() => inspectNativeRpDelegationIdentity({ ...childCapture }, { host: f.host, handle })).toThrow();
                expect(() => inspectNativeRpDelegationIdentity(childCapture, { host: f.host, handle: 'foreign-owner' })).toThrow();
                expect(() => inspectNativeRpDelegationIdentity(childCapture, { host: Object.create(f.host), handle })).toThrow();
                await expect(inspectNativeRpDelegation(childCapture, { host: f.host, handle, tx: {} })).rejects.toThrow('native_orchestration_rp_producer_denied');
                const parent = [...nativeTaskScheduler.operations.values()].find(item => item.owner === handle
                    && item.key === 'rp:' + f.controlId + ':' + f.input.requestId);
                expect(parent.view.status).toBe('waiting_child');
                expect(parent.resources).toEqual(expect.arrayContaining([...await f.host.executionResources(handle, f.childRoute), 'rp:' + handle + ':' + f.controlId]));
                expect(during.parentAttempt).toMatchObject({ status: 'waiting_child', effectRefs: [], resultRefs: [] });
                expect(during.context.messages).toEqual([{ role: 'user', content: 'Original RP input' }]);
                expect(request.audience).toEqual({ kind: 'task', id: identity.childRunId });
                await f.h.engine.withTransaction(handle, async tx => {
                    parentAuthorityArgs = { handle, tx, parent: during.parentRoot, parentAttempt: during.parentAttempt,
                        childPlan: await f.plans.getRevision(handle, f.childPlanRef), inputRefs: during.inputRefs,
                        effectiveGrantDigest: during.grantDigest, budgetCeiling: during.root.parentRef.budgetCeiling, phase: 'confirm_budget' };
                    expect(await f.authority.execution.delegates.authorizeDelegation(parentAuthorityArgs))
                        .toMatchObject({ allowed: true, effectiveGrantDigest: during.grantDigest, parentGrantDigest: during.parentGrantDigest });
                    await expect(f.authority.execution.delegates.authorizeDelegation({ ...parentAuthorityArgs, effectiveGrantDigest: 'a'.repeat(64) }))
                        .rejects.toThrow('native_orchestration_delegation_denied');
                    await expect(f.authority.execution.delegates.authorizeDelegation({ ...parentAuthorityArgs,
                        budgetCeiling: { ...parentAuthorityArgs.budgetCeiling, maxRequests: 2 } })).rejects.toThrow('native_orchestration_delegation_denied');
                    // Fixture-only physical corruption, with an honest storage
                    // hash. It is not a second legal receipt writer or grant.
                    const key = controlRecordKey(handle, during.delegationReceiptRef.runId, 'receipt', during.delegationReceiptRef.receiptId);
                    const stored = await tx.getResource(key), changed = { ...stored.doc, createdAt: stored.doc.createdAt + 1 };
                    try {
                        await tx.putResource(key, { ...stored, doc: changed, integrity: hash(changed) });
                        await expect(inspectNativeRpDelegation(childCapture, { host: f.host, handle, tx })).rejects.toThrow('native_orchestration_handoff_unconfirmed');
                    } finally { await tx.putResource(key, stored); }
                });
            }
            return original.call(this, handle, request);
        };
        ContextPort.prototype.compile = async function (...args) {
            try { return await observeCompile.apply(this, args); } catch (error) { compileFailure = error; throw error; }
        };
        try {
            const result = await f.run().catch(error => {
                // Metered local work translates errors; retain its real hook
                // failure for diagnostics without replacing any success value.
                if (compileFailure) throw compileFailure;
                if (error.code === 'operation_child_failed' && error.cause) throw error.cause;
                throw error;
            });
            expect(result).toEqual({ status: 'pending_return',
                outputClaimRef: { runId: identity.childRunId, claimId: expect.any(String) },
                outputReceiptRef: { runId: identity.childRunId, receiptId: expect.any(String) }, parentRunId: identity.parentRunId, parentAttemptId: identity.parentAttemptId,
                childRunId: identity.childRunId, effectId: f.effects[0].effectId, receiptRef: { runId: identity.childRunId, receiptId: expect.any(String) },
                resultRef: { runId: identity.childRunId, resultId: expect.any(String) },
                publicationReceiptRef: { runId: identity.childRunId, receiptId: expect.any(String) } });
            expect(JSON.stringify(result)).not.toContain(RP_MODEL_TEXT);
            expect(f.requests).toHaveLength(1);
            expect(JSON.stringify(f.requests[0])).toContain('Original RP input');
            expect(JSON.stringify(f.requests[0])).not.toContain('Original RP context');
            expect(f.effects).toHaveLength(1); expect(f.effects[0].runId).toBe(identity.childRunId);
            const parent = await f.authority.execution.runs.get(f.h.handle, identity.parentRunId);
            const child = await f.authority.execution.runs.get(f.h.handle, identity.childRunId);
            expect(parent.status).toBe('running'); expect(child.status).toBe('completed');
            expect(parent.resultRefs).toEqual([]); expect(child.resultRefs).toEqual([result.resultRef]); expect(parent.outputClaims).toEqual([]);
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                expect((await readAttempt(tx, f.h.handle, parent, identity.parentAttemptId)).doc.status).toBe('waiting_child');
                expect((await checkedRecord(tx, controlRecordKey(f.h.handle, child.runId, 'effect', result.effectId))).doc.status).toBe('confirmed');
            });
            const operation = await stateOf(f), compute = operation.compute;
            expect(Object.keys((await f.control.status(f.h.handle, f.controlId)).operations)).toHaveLength(1);
            expect(compute.attempts).toHaveLength(1);
            expect(compute.attempts[0]).toMatchObject({ reservationId: child.runId, status: 'settled', usage: { totalTokens: 20 } });
            expect(compute.localWork.every(row => row.reservationId === child.runId && row.status === 'settled')).toBe(true);
            expect(compute.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released' })]);
            expect(compute.reservations[0].limits).toEqual(f.childRoute.executionPolicy.computeBudget);
            expect(compute.limits).toEqual(f.parentRoute.executionPolicy.computeBudget);
            expect((await f.chats.get(f.h.handle, 'Actor', 'main')).body).toHaveLength(2);
            expect(() => inspectNativeRpDelegationIdentity(childCapture, { host: f.host, handle: f.h.handle })).toThrow();
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                await expect(f.authority.execution.delegates.authorizeDelegation({ ...parentAuthorityArgs, tx })).rejects.toThrow('native_orchestration_delegation_denied');
            });
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
        } finally { ContextPort.prototype.compile = original; await f.cleanup(); }
    });

    test.each(['missing_result_policy', 'multiple_sends'])('requires the child explicit finite %s policy before scheduling', async change => {
        const f = await rpDelegationFixture(make, { configureChildPlan: plan => {
            if (change === 'missing_result_policy') delete plan.definition.outputContract.resultPolicy;
        }, configureChildRoute: route => { if (change === 'multiple_sends') route.executionPolicy.computeBudget.maxRequests = 2; } });
        try {
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toEqual([]); expect(f.effects).toEqual([]);
            expect((await f.control.status(f.h.handle, f.controlId)).operations).toEqual({});
        } finally { await f.cleanup(); }
    });

    test('a lost original reserve ACK leaves one held child and never dispatches or spends again', async () => {
        const f = await rpDelegationFixture(make), service = f.authority.execution, original = service.reserveChild;
        let reservation, childRunId;
        service.reserveChild = async (...args) => {
            reservation = await original(...args); childRunId = args[1].childRunId;
            throw Object.assign(new Error('Synthetic lost reserve ACK after actual original commit'), { code: 'storage_commit_unknown' });
        };
        try {
            await expect(f.run()).rejects.toThrow(); expect(reservation.status).toBe('held'); expect(f.requests).toEqual([]); expect(f.effects).toEqual([]);
            const before = (await stateOf(f)).compute;
            expect(before.attempts).toEqual([]); expect(before.localWork ?? []).toEqual([]);
            expect(before.reservations).toEqual([expect.objectContaining({ reservationId: childRunId, status: 'held' })]);
            const child = await service.runs.get(f.h.handle, childRunId);
            expect(child.status).toBe('admitted'); expect(child.attemptRefs).toEqual([]);
            await expect(f.run()).rejects.toThrow(); expect((await stateOf(f)).compute).toEqual(before);
            expect(f.requests).toEqual([]);
        } finally { service.reserveChild = original; await f.cleanup(); }
    });

    test.each(['binding', 'parent_cancel'])('same-Tx %s at final child budget read withholds delivery and keeps facts', async change => {
        const f = await rpDelegationFixture(make), service = f.authority.execution, original = service.budgetPort.assertCurrent;
        let armed = false, injected = false, childRunId;
        const observe = service.effects.observe.bind(service.effects);
        service.effects.observe = async (...args) => { const result = await observe(...args); childRunId = args[1].runId; armed = true; return result; };
        service.budgetPort.assertCurrent = async function (...args) {
            const value = await original.apply(this, args);
            if (armed && !injected && args[2]?.tx) {
                injected = true;
                const child = await service.runs.get(f.h.handle, childRunId);
                if (change === 'parent_cancel') {
                    const parent = await service.runs.get(f.h.handle, child.parentRef.parentRunId);
                    await service.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), { ...runGuard(parent), reasonCode: 'parent_cancel_during_child_consume' });
                } else {
                    const binding = await f.plans.getBinding(f.h.handle, f.sourceSelector);
                    await f.plans.saveBinding(f.h.handle, createNativeId('orchestrationCommand'), {
                        sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
                }
            }
            return value;
        };
        try {
            await expect(f.run()).rejects.toThrow(); expect(injected).toBe(true); expect(f.requests).toHaveLength(1);
            const child = await service.runs.get(f.h.handle, childRunId), parent = await service.runs.get(f.h.handle, child.parentRef.parentRunId);
            if (change === 'parent_cancel') expect(parent.cancelRequested).toBe(true);
            else expect((await f.plans.getBinding(f.h.handle, f.sourceSelector)).version).toBe(2);
            expect((await stateOf(f)).compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
            expect(child.resultRefs).toEqual([]);
        } finally { service.budgetPort.assertCurrent = original; await f.cleanup(); }
    });
});
