import { backgroundModelFixture } from './helpers/background-model-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { inspectNativeBackgroundGenerationIdentity } from '../../src/native/orchestration/native-background-generation.js';
import { mintNativeBackgroundQuota } from '../../src/native/orchestration/native-turn-quota.js';
import { createNativeId } from '../../src/native/identity.js';
import { readEffect } from '../../src/native/orchestration/effect-contracts.js';

const computeOperation = async f => Object.values((await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations).find(item => item.compute);

describe.each(CONTRACT_HARNESSES)('$name original background producer', ({ make }) => {
    test('pending outbox uses original Scheduler/Run/Effect/Task Context and shared bank with separate window quota', async () => {
        const f = await backgroundModelFixture(make);
        try {
            let operation;
            const adopt = f.core.recordTaskResult.bind(f.core);
            f.core.recordTaskResult = async (...args) => { operation = await computeOperation(f); return adopt(...args); };
            const result = await f.run();
            expect(f.requests).toHaveLength(1);
            expect(result.results[0].payload.text).toBe('Original background artifact');
            const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
            expect(root.sourceBinding.sourceRef.sessionId).toBe(f.base.session.sessionId);
            expect(root.status).not.toBe('completed');
            const control = await f.core.runs.status(f.h.handle, f.base.session.sessionId);
            expect(operation.lane).toBe('turn');
            expect(operation.compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 }, generationQuotaRef: { background: true } });
            expect(operation.compute.localWork.filter(row => row.kind === 'context_build')).toHaveLength(1);
            expect(Object.values(control.background).reduce((sum, row) => sum + row.count, 0)).toBe(1);
            expect((await computeOperation(f)).compute.attempts[0].usage.totalTokens).toBe(20);
            const wire = JSON.stringify(f.requests[0]);
            expect(wire).toContain('阿岚听说');
            expect(wire).not.toContain('寄信者真实身份是沈墨');
            expect(wire).not.toContain('沈墨怀疑有人');
            expect((await f.run()).results).toEqual([]);
            expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);
    test('not-due work sends nothing and retains its pending original intent', async () => {
        const f = await backgroundModelFixture(make, { effectiveTurns: 3 });
        try {
            const result = await f.run();
            expect(result.pending.reason).toBe('native_generation_background_not_due');
            expect(f.requests).toHaveLength(0);
            expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).states.atri_lifecycle.outbox[0].status).toBe('pending');
            expect(f.effectRef).toBeUndefined();
            await f.command({ kind: 'app.command', domainId: 'progress', recordId: 'main', commandId: 'advance', args: { effectiveTurns: 4 } });
            expect((await f.run()).results).toHaveLength(1);
            expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);
    test('the same original window and period caps survive successful Tasks and resume pending work when due', async () => {
        const f = await backgroundModelFixture(make, { recurring: true });
        try {
            await f.run();
            await f.command({ kind: 'clock.advance', commandId: 'advance', ticks: 1 });
            await f.command({ kind: 'pump' });
            expect((await f.run()).pending.reason).toBe('native_generation_budget_exhausted');
            expect(f.requests).toHaveLength(1);
            await f.command({ kind: 'app.command', domainId: 'progress', recordId: 'main', commandId: 'advance', args: { effectiveTurns: 8 } });
            expect((await f.run()).results).toHaveLength(1);
            await f.command({ kind: 'clock.advance', commandId: 'advance', ticks: 1 });
            await f.command({ kind: 'pump' });
            await f.command({ kind: 'app.command', domainId: 'progress', recordId: 'main', commandId: 'advance', args: { effectiveTurns: 12 } });
            expect((await f.run()).pending.reason).toBe('native_generation_budget_exhausted');
            expect(f.requests).toHaveLength(2);
            await f.command({ kind: 'app.command', domainId: 'progress', recordId: 'main', commandId: 'advance', args: { effectiveTurns: 20 } });
            expect((await f.run()).results).toHaveLength(1);
            expect(f.requests).toHaveLength(3);
            const control = await f.core.runs.status(f.h.handle, f.base.session.sessionId);
            expect(control.highWaterTurn).toBe(20);
            expect(Object.values(control.background)).toEqual([expect.objectContaining({ period: 1, count: 1 })]);
        } finally { await f.cleanup(); }
    }, 60000);
    test.each(['scope', 'binding'])('%s withdrawal while HTTP is pending rejects the response and preserves its actual fee', async change => {
        const f = await backgroundModelFixture(make);
        try {
            f.onResponse(async () => {
                if (change === 'scope') return f.command({ kind: 'scope.transition', scopeId: 'session', status: 'suspended' });
                const binding = await f.plans.getBinding(f.h.handle, f.sourceSelector);
                await f.plans.saveBinding(f.h.handle, createNativeId('orchestrationCommand'), {
                    sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
            });
            await expect(f.run()).rejects.toMatchObject({ code: 'native_orchestration_background_source_stale' });
            expect(f.requests).toHaveLength(1);
            const control = await f.core.runs.status(f.h.handle, f.base.session.sessionId);
            const operation = Object.values(control.operations).find(item => item.compute);
            expect(operation?.compute.attempts[0]?.usage.totalTokens ?? control.retiredCompute.tokens).toBe(20);
            const snapshot = await f.core.observe(f.h.handle, f.base.session.sessionId);
            expect(snapshot.states.atri_task_results?.records ?? []).toEqual([]);
        } finally { await f.cleanup(); }
    }, 60000);
    test('failed adoption cannot dispatch the same durable outbox again after a cold reopen', async () => {
        const f = await backgroundModelFixture(make);
        try {
            f.core.recordTaskResult = async () => { throw Object.assign(new Error('synthetic-adopt-failure'), { code: 'synthetic-adopt-failure' }); };
            await expect(f.run()).rejects.toMatchObject({ code: 'synthetic-adopt-failure' });
            expect(f.requests).toHaveLength(1);
            await f.cold();
            const result = await f.run();
            expect(result.pending.reason).toBe('native_task_outcome_unknown');
            expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);
    test('same-transaction Binding withdrawal commits before the paid response is refused', async () => {
        const f = await backgroundModelFixture(make);
        try {
            const budget = f.authority.execution.budgetPort, original = budget.assertCurrent.bind(budget);
            let injected = false;
            budget.assertCurrent = async (...args) => {
                const result = await original(...args);
                if (!injected && f.effectRef) await f.h.engine.withTransaction(f.h.handle, async tx => {
                    const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
                    if ((await readEffect(tx, f.h.handle, root, f.effectRef.effectId)).doc.status !== 'confirmed') return;
                    injected = true;
                    const binding = await f.plans.getBinding(f.h.handle, f.sourceSelector);
                    await f.plans.saveBinding(f.h.handle, createNativeId('orchestrationCommand'), {
                        sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
                });
                return result;
            };
            await expect(f.run()).rejects.toMatchObject({ code: 'native_orchestration_consumption_stale' });
            expect(injected).toBe(true);
            expect((await f.plans.getBinding(f.h.handle, f.sourceSelector)).version).toBe(1);
            expect((await computeOperation(f)).compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
        } finally { await f.cleanup(); }
    }, 60000);
    test('caller-created capture or quota cannot borrow a pending outbox identity', async () => {
        const f = await backgroundModelFixture(make);
        try {
            expect(() => inspectNativeBackgroundGenerationIdentity({}, { host: f.host, handle: f.h.handle })).toThrow();
            expect(() => mintNativeBackgroundQuota({}, { host: f.host, handle: f.h.handle })).toThrow();
            await expect(f.direct({ input: { forged: true } })).rejects.toThrow();
            expect(f.requests).toHaveLength(0);
        } finally { await f.cleanup(); }
    }, 60000);
});
