import { sessionContextRetrievalFixture } from './helpers/session-context-retrieval-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { BudgetPort } from '../../src/native/orchestration/budget-port.js';
import { readEffect } from '../../src/native/orchestration/effect-contracts.js';
import { runGuard } from '../../src/native/orchestration/controller-common.js';
import { createNativeId } from '../../src/native/identity.js';

const statusOf = f => f.core.runs.status(f.h.handle, f.base.session.sessionId);

describe.each(CONTRACT_HARNESSES)('$name Context retrieval original bank authority', ({ make }) => {
    test('only the actual prepared child can use its producer quota, and embeddings spend compute without spending Model quota', async () => {
        const f = await sessionContextRetrievalFixture(make, { quota: true });
        const port = f.authority.execution.budgetPort, createBank = port.contextRetrievalBank.bind(port);
        let checked = false, admittedRoot;
        const verifyBoundaries = async (handle, args, input) => {
            const before = await statusOf(f);
            const rejectAdmission = async (candidate, request = input) => {
                await expect(candidate.admit(request)).rejects.toMatchObject({ code: 'native_generation_budget_lane_denied' });
                expect(await statusOf(f)).toEqual(before);
            };
            const child = await f.h.engine.withTransaction(handle, tx => readEffect(tx, handle, args.root, args.effectId));
            for (const parentBank of [{ ...args.parentBank }, JSON.parse(JSON.stringify(args.parentBank))]) {
                expect(() => createBank(handle, { ...args, parentBank })).toThrow('native_orchestration_budget_bank_invalid');
            }
            const otherPort = new BudgetPort({ sessionCore: f.core });
            expect(() => otherPort.contextRetrievalBank(handle, args)).toThrow('native_orchestration_budget_bank_invalid');
            expect(() => createBank(handle + '-foreign', args)).toThrow('native_orchestration_budget_bank_invalid');
            // Real original adapters remain insufficient without the Host's opaque producer proof.
            const parentWithoutProof = port.sendBank(handle, { authorityRef: args.root.budgetAuthorityRef,
                effectId: child.doc.inputRef.contextForEffectId, firstOrdinal: 0, limits: args.limits });
            expect(() => createBank(handle, { ...args, parentBank: parentWithoutProof })).toThrow('native_generation_budget_lane_denied');
            const parentWithJsonProof = port.sendBank(handle, { authorityRef: args.root.budgetAuthorityRef,
                effectId: child.doc.inputRef.contextForEffectId, firstOrdinal: 0, limits: args.limits, quotaProof: {} });
            await rejectAdmission(createBank(handle, { ...args, parentBank: parentWithJsonProof }));
            await rejectAdmission(createBank(handle, { ...args, root: { ...args.root, runId: createNativeId('orchestrationRun') } }));
            await rejectAdmission(createBank(handle, { ...args, effectId: child.doc.inputRef.contextForEffectId }));
            for (const changed of [{ requestId: input.requestId + '-foreign' }, { targetFingerprint: 'a'.repeat(64) }, { inputFingerprint: 'b'.repeat(64) }]) {
                await rejectAdmission(createBank(handle, args), { ...input, ...changed });
            }
            const exhaustedOrdinal = createBank(handle, args);
            await rejectAdmission(exhaustedOrdinal, { ...input, requestId: input.requestId + '-foreign' });
            await rejectAdmission(exhaustedOrdinal);
            // A JSON-shaped private option on the public Model adapter cannot mint a Data grant.
            await rejectAdmission(port.sendBank(handle, { authorityRef: args.root.budgetAuthorityRef, effectId: args.effectId,
                firstOrdinal: 0, limits: args.limits, retrievalGrant: {} }));
            expect(await statusOf(f)).toEqual(before);
        };
        port.contextRetrievalBank = (handle, args) => {
            const bank = createBank(handle, args), admit = bank.admit.bind(bank);
            bank.admit = async input => {
                if (!checked) {
                    checked = true; admittedRoot = args.root;
                    await verifyBoundaries(handle, args, input);
                }
                return admit(input);
            };
            return bank;
        };
        try {
            await f.start();
            expect(checked).toBe(true); expect(f.calls).toHaveLength(2); expect(f.requests).toHaveLength(2);
            const operation = (await statusOf(f)).operations[admittedRoot.budgetAuthorityRef.operationId];
            expect(operation).toMatchObject({ total: 2, attempts: { intent_resolver: 1, narrator: 1 } });
            expect(operation.compute.attempts).toHaveLength(4);
            expect(operation.compute.attempts.map(row => row.generationQuotaRef?.role ?? null)).toEqual(['intent_resolver', null, null, 'narrator']);
            expect(operation.compute.attempts.every(row => row.status === 'settled')).toBe(true);
            await f.cold();
            expect((await statusOf(f)).operations[admittedRoot.budgetAuthorityRef.operationId]).toEqual(operation);
        } finally { await f.cleanup(); }
    }, 180000);

    test.each(['cancel', 'source-revision'])('a real %s change before retrieval admission withholds HTTP and leaves the paid Resolver alone', async change => {
        const f = await sessionContextRetrievalFixture(make, { quota: true });
        const { runs, budgetPort: port } = f.authority.execution, createBank = port.contextRetrievalBank.bind(port);
        let checked = false, before, after, errorCode, runId;
        port.contextRetrievalBank = (handle, args) => {
            const bank = createBank(handle, args), admit = bank.admit.bind(bank);
            bank.admit = async input => {
                if (!checked) {
                    checked = true; runId = args.root.runId; before = await statusOf(f);
                    if (change === 'cancel') await runs.cancel(handle, createNativeId('orchestrationCommand'), {
                        ...runGuard(await runs.get(handle, runId)), reasonCode: 'retrieval_budget_test_cancel',
                    });
                    else await f.core.appendTimeline(handle, f.base.session.sessionId, { role: 'user', content: 'Change the actual Session source before retrieval admission.' });
                    try { return await admit(input); }
                    catch (error) { errorCode = error.code; throw error; }
                    finally { after = await statusOf(f); }
                }
                return admit(input);
            };
            return bank;
        };
        try {
            await expect(f.start()).rejects.toMatchObject({ code: change === 'cancel' ? 'native_generation_budget_lane_denied' : 'native_generation_revision_conflict' });
            expect(checked).toBe(true);
            expect(errorCode).toBe(change === 'cancel' ? 'native_generation_budget_lane_denied' : 'native_generation_revision_conflict');
            expect(after.operations).toEqual(before.operations);
            expect(f.calls).toHaveLength(0); expect(f.requests).toHaveLength(1);
            const root = await runs.get(f.h.handle, runId), finalStatus = await statusOf(f), operation = finalStatus.operations[root.budgetAuthorityRef.operationId];
            expect(operation).toMatchObject({ total: 1, attempts: { intent_resolver: 1 } });
            expect(operation.compute.attempts).toHaveLength(1); expect(operation.compute.attempts[0].status).toBe('settled');
            expect(operation.compute.attempts).toEqual(before.operations[root.budgetAuthorityRef.operationId].compute.attempts);
            expect(operation.compute.localWork.map(row => row.attemptId)).toEqual(before.operations[root.budgetAuthorityRef.operationId].compute.localWork.map(row => row.attemptId));
            expect(operation.compute.localWork.every(row => row.status === 'settled')).toBe(true);
            expect(operation.compute.localWork.some(row => row.usage.outcome === 'failed')).toBe(true);
            expect(root.outputClaims).toEqual([]);
            expect(root.cancelRequested).toBe(change === 'cancel');
            expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).revision.revisionId !== f.base.revision.revisionId).toBe(change === 'source-revision');
            await f.cold();
            expect(await statusOf(f)).toEqual(finalStatus); expect(f.calls).toHaveLength(0); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 180000);
});
