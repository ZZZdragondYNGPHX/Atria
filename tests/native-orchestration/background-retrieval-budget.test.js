import { backgroundContextRetrievalFixture } from './helpers/background-context-retrieval-fixture.js';
import { modelPortFixture } from './helpers/model-port-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { readEffect } from '../../src/native/orchestration/effect-contracts.js';
import { createNativeId } from '../../src/native/identity.js';
import { assertNativeTurnQuota } from '../../src/native/orchestration/native-turn-quota.js';

const controlOf = f => f.core.runs.status(f.h.handle, f.base.session.sessionId);

describe.each(CONTRACT_HARNESSES)('$name background Task retrieval bank', ({ make }) => {
    test('an actual Narrator quota cannot authorize a Task SourceRequest or spend its bank through that proof check', async () => {
        const f = await modelPortFixture(make), port = f.authority.execution.budgetPort, sendBank = port.sendBank.bind(port);
        let checked = false;
        const verifyProducer = async (handle, args) => {
            const before = await controlOf(f), expected = { host: f.host, sessionCore: f.core, handle,
                sessionId: f.base.session.sessionId, requestId: f.input.invocationId, role: 'narrator' };
            expect(assertNativeTurnQuota(args.quotaProof, expected).role).toBe('narrator');
            const taskSource = { domain: 'native_session', sessionId: f.base.session.sessionId,
                branchId: f.base.revision.branchId, revisionId: f.base.revision.revisionId, taskRef: { taskId: 'summarize', variantId: 'default' } };
            for (const sourceRequest of [taskSource, null]) {
                expect(() => assertNativeTurnQuota(args.quotaProof, { ...expected, sourceRequest })).toThrow('Trusted original Turn producer is required');
                expect(await controlOf(f)).toEqual(before);
            }
        };
        port.sendBank = (handle, args) => {
            const bank = sendBank(handle, args), admit = bank.admit.bind(bank);
            bank.admit = async input => { checked = true; await verifyProducer(handle, args); return admit(input); };
            return bank;
        };
        try {
            await f.start(); expect(checked).toBe(true); expect(f.requests).toHaveLength(1);
            expect((await f.observe()).outcome).toBe('confirmed');
        } finally { await f.cleanup(); }
    }, 180000);

    test('pending Task identity cannot mint a Model lane, and caller Task metadata cannot redirect the protected producer or its quota', async () => {
        const f = await backgroundContextRetrievalFixture(make);
        const { budgetPort: port, runs } = f.authority.execution, createBank = port.contextRetrievalBank.bind(port);
        const sendBank = port.sendBank.bind(port), adopt = f.core.recordTaskResult.bind(f.core);
        let checked = false, rootId, originalTask, producerQuota, atAdoption;
        port.sendBank = (handle, args) => { producerQuota ??= args.quotaProof; return sendBank(handle, args); };
        f.core.recordTaskResult = async (...args) => { atAdoption = await controlOf(f); return adopt(...args); };
        const verifyBoundaries = async (handle, args, input) => {
            const before = await controlOf(f);
            const child = await f.authority.engine.withTransaction(handle, tx => readEffect(tx, handle, args.root, args.effectId));
            const parentId = child.doc.inputRef.contextForEffectId;
            const parent = await f.authority.engine.withTransaction(handle, tx => readEffect(tx, handle, args.root, parentId));
            expect(parent.doc.inputRef).toMatchObject({ kind: 'native_background_intent', taskId: originalTask.taskId, variantId: originalTask.variantId });
            const sourceRequest = args.root.sourceBinding.sourceRequest;
            const expectedProducer = { host: f.host, sessionCore: f.core, handle, sessionId: f.base.session.sessionId,
                requestId: parent.doc.inputRef.requestId, role: parent.doc.inputRef.role, sourceRequest };
            expect(assertNativeTurnQuota(producerQuota, expectedProducer).backgroundCapture).toBeDefined();
            for (const changed of [{ ...sourceRequest, taskRef: { ...sourceRequest.taskRef, taskId: 'caller-other-task' } },
                { ...sourceRequest, taskRef: { ...sourceRequest.taskRef, variantId: 'caller-other-variant' } },
                { ...sourceRequest, taskRef: null }, null]) {
                expect(() => assertNativeTurnQuota(producerQuota, { ...expectedProducer, sourceRequest: changed })).toThrow('Trusted original Turn producer is required');
                expect(await controlOf(f)).toEqual(before);
            }
            const ordinaryModelBank = port.sendBank(handle, { authorityRef: args.root.budgetAuthorityRef,
                effectId: args.effectId, firstOrdinal: 0, limits: args.limits });
            const attempts = [ordinaryModelBank, createBank(handle, { ...args, effectId: parentId }),
                createBank(handle, { ...args, root: { ...args.root, runId: createNativeId('orchestrationRun') } })];
            for (const candidate of attempts) {
                await expect(candidate.admit(input)).rejects.toMatchObject({ code: 'native_generation_budget_lane_denied' });
                expect(await controlOf(f)).toEqual(before);
            }
        };
        port.contextRetrievalBank = (handle, args) => {
            originalTask ??= args.root.sourceBinding.sourceRequest.taskRef;
            rootId ??= args.root.runId;
            // This caller copy is not authority: admission must re-read the
            // actual Root/Task/variant and preserve the actual background lane.
            const root = { ...args.root, sourceBinding: { ...args.root.sourceBinding,
                sourceRequest: { ...args.root.sourceBinding.sourceRequest, taskRef: { taskId: 'caller-other-task', variantId: 'caller-other-variant' } } } };
            const bank = createBank(handle, { ...args, root }), admit = bank.admit.bind(bank);
            bank.admit = async input => {
                if (!checked) { checked = true; await verifyBoundaries(handle, args, input); }
                return admit(input);
            };
            return bank;
        };
        try {
            const before = await controlOf(f);
            await expect(f.host.execute(f.h.handle, { sessionId: f.base.session.sessionId, revisionId: f.base.revision.revisionId,
                requestId: f.intent.invocationId, role: 'narrator', routeRef: f.backgroundInput.slotBindings.structured }))
                .rejects.toMatchObject({ code: 'native_generation_budget_lane_denied' });
            for (const changed of [{ taskId: 'caller-other-task' }, { variantId: 'caller-other-variant' }]) {
                await expect(f.host.executeTask(f.h.handle, { sessionId: f.base.session.sessionId, revisionId: f.base.revision.revisionId,
                    taskId: f.intent.taskId, variantId: f.intent.variantId, invocationId: f.intent.invocationId,
                    input: f.intent.input, slotBindings: f.backgroundInput.slotBindings, ...changed }, undefined, undefined, { lifecycleInvocation: true }))
                    .rejects.toMatchObject({ code: 'native_task_variant_missing' });
            }
            await expect(f.host.executeTask(f.h.handle, { sessionId: f.base.session.sessionId, revisionId: f.base.revision.revisionId,
                taskId: f.intent.taskId, variantId: f.intent.variantId, invocationId: f.input.invocationId,
                input: f.intent.input, slotBindings: f.backgroundInput.slotBindings }, undefined, undefined, { lifecycleInvocation: true }))
                .rejects.toMatchObject({ code: 'native_generation_budget_lane_denied' });
            expect(await controlOf(f)).toEqual(before); expect(f.calls).toHaveLength(0); expect(f.requests).toHaveLength(0);
            const result = await f.run();
            expect(result.results).toHaveLength(1); expect(checked).toBe(true);
            const root = await runs.get(f.h.handle, rootId), control = await controlOf(f);
            expect(root.sourceBinding.sourceRequest.taskRef).toEqual({ taskId: f.intent.taskId, variantId: f.intent.variantId });
            expect(root.status).toBe('completed'); expect(f.calls).toHaveLength(2); expect(f.requests).toHaveLength(1);
            const computeOperation = control.operations[root.budgetAuthorityRef.operationId];
            expect(computeOperation.total).toBe(0); expect(computeOperation.attempts).toEqual({});
            expect(computeOperation.compute.attempts).toHaveLength(3);
            expect(computeOperation.compute.attempts.map(row => row.generationQuotaRef?.background ?? null)).toEqual([null, null, true]);
            expect(Object.values(atAdoption.operations).filter(row => row.lane === 'background')).toEqual([
                expect.objectContaining({ total: 1, attempts: { background: 1 } }),
            ]);
            expect(Object.values(control.operations).filter(row => row.lane === 'background')).toEqual([]);
            expect(Object.values(control.background).reduce((sum, row) => sum + row.count, 0)).toBe(1);
            expect(Object.values(control.background)[0].operation).toBe(computeOperation.compute.attempts[2].generationQuotaRef.operationId);
            await f.cold(); expect(await controlOf(f)).toEqual(control);
            expect((await f.run()).results).toEqual([]); expect(f.calls).toHaveLength(2); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 180000);

    test('suspending the real Task scope before child admission spends no Provider or background quota and persists across cold reopen', async () => {
        const f = await backgroundContextRetrievalFixture(make);
        const { budgetPort: port, runs } = f.authority.execution, createBank = port.contextRetrievalBank.bind(port);
        let changed = false, before, after, errorCode, rootId;
        port.contextRetrievalBank = (handle, args) => {
            const bank = createBank(handle, args), admit = bank.admit.bind(bank);
            bank.admit = async input => {
                if (!changed) {
                    changed = true; rootId = args.root.runId; before = await controlOf(f);
                    await f.command({ kind: 'scope.transition', scopeId: 'session', status: 'suspended' });
                    try { return await admit(input); }
                    catch (error) { errorCode = error.code; throw error; }
                    finally { after = await controlOf(f); }
                }
                return admit(input);
            };
            return bank;
        };
        try {
            await expect(f.run()).rejects.toMatchObject({ code: 'native_generation_revision_conflict' });
            expect(changed).toBe(true); expect(errorCode).toBe('native_generation_revision_conflict');
            expect(after.operations).toEqual(before.operations); expect(after.background).toEqual(before.background);
            expect(f.calls).toHaveLength(0); expect(f.requests).toHaveLength(0);
            const root = await runs.get(f.h.handle, rootId), control = await controlOf(f), snapshot = await f.core.observe(f.h.handle, f.base.session.sessionId);
            expect(root.outputClaims).toEqual([]); expect(snapshot.states.atri_task_results?.records ?? []).toEqual([]);
            expect(snapshot.states.atri_lifecycle.scopes.session.status).toBe('suspended');
            expect(control.operations[root.budgetAuthorityRef.operationId].compute.attempts).toEqual([]);
            expect(Object.values(control.operations).filter(row => row.lane === 'background')).toEqual([]);
            expect(Object.values(control.background).reduce((sum, row) => sum + row.count, 0)).toBe(0);
            await f.cold(); expect(await controlOf(f)).toEqual(control);
            expect((await f.run()).results).toEqual([]); expect(f.calls).toHaveLength(0); expect(f.requests).toHaveLength(0);
        } finally { await f.cleanup(); }
    }, 180000);
});
