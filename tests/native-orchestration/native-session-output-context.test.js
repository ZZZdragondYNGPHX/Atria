import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { modelPortFixture } from './helpers/model-port-fixture.js';
import { ContextPort } from '../../src/native/orchestration/context-port.js';
import { NativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { SettingsRepo } from '../../src/storage/repositories/settings-repo.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { BudgetPort } from '../../src/native/orchestration/budget-port.js';
import { runGuard } from '../../src/native/orchestration/controller-common.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const memorySettings = { enabled: true, sourceWritesEnabled: false, memoryOsTokenBudget: 2400 };
const changeContract = contract => { const view = contract.informationRuntime.views.find(item => item.id === 'pov'); view.sources.push('history'); view.memory = true; };
async function atFinalizer(f, before, checkOutput = async () => {}) {
    const revalidate = ContextPort.prototype.revalidate, output = ContextPort.prototype.revalidateNativeOutput, submit = NativeTaskScheduler.prototype.submit;
    let port, context, hookError;
    ContextPort.prototype.revalidate = async function (handle, request) {
        const value = await revalidate.call(this, handle, request);
        if (handle === f.h.handle && request.context?.request.taskPurpose === 'original_native_narrator') { port = this; context = request.context; }
        return value;
    };
    ContextPort.prototype.revalidateNativeOutput = async function (handle, request) {
        const value = await output.call(this, handle, request);
        await checkOutput({ port: this, handle, request, value, revalidateOutput: output });
        return value;
    };
    NativeTaskScheduler.prototype.submit = function (request) {
        if (request.kind !== 'turn' || request.owner !== f.h.handle || request.anchor.sessionId !== f.base.session.sessionId) return submit.call(this, request);
        return submit.call(this, { ...request, finalize: async (prepared, receipt, finalizationBoundary) => {
            let replacement;
            try { replacement = await before({ port, context, finalizationBoundary, prepared, finalize: request.finalize }); } catch (error) { hookError = error; throw error; }
            return request.finalize(replacement ?? prepared, receipt, finalizationBoundary);
        } });
    };
    try { return await f.start().catch(error => { throw hookError ?? error; }); }
    finally { ContextPort.prototype.revalidate = revalidate; ContextPort.prototype.revalidateNativeOutput = output; NativeTaskScheduler.prototype.submit = submit; }
}

describe.each(harnesses)('$name Native Session finalization Context', ({ make }) => {
    test('the actual original Narrator Context is revalidated in the same finalizer before the existing Session writer', async () => {
        const f = await modelPortFixture(make, { memorySettings, changeContract }); let port, context, finalizationPermit;
        try {
            let checked = 0;
            const result = await atFinalizer(f, async actual => {
                ({ port, context } = actual);
                expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).revision.revisionId).toBe(f.base.revision.revisionId);
                await expect(port.revalidate(f.h.handle, { context, phase: 'send' })).rejects.toMatchObject({ code: 'operation_boundary_denied' });
            }, async ({ request, value }) => {
                finalizationPermit = request.finalizationPermit; checked++;
                expect(value).toBe(context.plan);
            });
            expect(checked).toBe(2);
            expect(result.timeline.at(-1).content).toBe('Synthetic native narrator response.'); expect(f.requests).toHaveLength(1);
            await expect(port.revalidateNativeOutput(f.h.handle, { context, finalizationPermit })).rejects.toMatchObject({ code: 'operation_finalization_boundary_denied' });
        } finally { await f.cleanup(); }
    });

    test('copied Contexts, fake scopes, foreign owner and generic output phase cannot substitute for the exact native finalizer', async () => {
        const f = await modelPortFixture(make); let checked = false;
        try {
            await atFinalizer(f, async ({ port, context, finalizationBoundary }) => {
                for (const clone of [{}, structuredClone(context)])
                    expect(() => port.captureNativeOutputFinalization(f.h.handle, { context: clone, finalizationBoundary })).toThrow();
                expect(() => port.captureNativeOutputFinalization(f.h.handle, { context, finalizationBoundary: {} })).toThrow();
                await expect(port.revalidate(f.h.handle, { context, phase: 'output' })).rejects.toThrow('native_orchestration_context_proof_invalid');
            }, async ({ port, request: { context, finalizationPermit }, revalidateOutput: original }) => {
                // Use the original method directly so negative probes do not
                // recursively enter this product-call observer.
                for (const wrong of [{}, structuredClone(finalizationPermit)])
                    await expect(original.call(port, f.h.handle, { context, finalizationPermit: wrong })).rejects.toThrow();
                await expect(original.call(port, 'foreign', { context, finalizationPermit })).rejects.toThrow();
                await expect(original.call(port, f.h.handle, { context, finalizationPermit, audience: { kind: 'actor', id: 'foreign' } })).rejects.toThrow();
                checked = true;
            });
            expect(checked).toBe(true); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test.each(['memory', 'binding', 'source'])('%s withdrawn after Model consumption is re-read before Session finalization and preserves the real charge', async change => {
        const f = await modelPortFixture(make, { memorySettings, changeContract }); let changed = false, expectedVersion;
        try {
            const failure = await atFinalizer(f, async () => {
                if (change === 'memory') await new SettingsRepo({ engine: f.h.engine }).save(f.h.handle,
                    { atri_capabilities: { memory_graph: { ...memorySettings, recallEnabled: false } } });
                else if (change === 'binding') {
                    const binding = await f.plans.getBinding(f.h.handle, f.sourceSelector); expectedVersion = binding.version + 1;
                    await f.plans.saveBinding(f.h.handle, createNativeId('orchestrationCommand'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
                } else await f.core.appendTimeline(f.h.handle, f.base.session.sessionId, { role: 'user', content: 'Lawful finalization source change' });
                changed = true;
            }).then(() => null, error => error);
            expect(failure).not.toBeNull(); expect(changed).toBe(true);
            const snapshot = await f.core.observe(f.h.handle, f.base.session.sessionId);
            expect(snapshot.timeline.some(entry => entry.content === 'Synthetic native narrator response.')).toBe(false);
            const observed = change === 'memory' ? (await new SettingsRepo({ engine: f.h.engine }).get(f.h.handle)).atri_capabilities.memory_graph.recallEnabled
                : change === 'binding' ? (await f.plans.getBinding(f.h.handle, f.sourceSelector)).version : snapshot.timeline.at(-1).content;
            expect(observed).toEqual({ memory: false, binding: expectedVersion, source: 'Lawful finalization source change' }[change]);
            const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
            const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
            expect(bank.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } }); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test('the product finalizer rejects copied, changed and foreign prepared output and consumes the original only once', async () => {
        const f = await modelPortFixture(make); let actual;
        try {
            const result = await atFinalizer(f, async value => {
                actual = value;
                const args = { host: f.host, handle: f.h.handle, prepared: value.prepared, requestHash: hash(f.input),
                    expectedRevisionId: f.base.revision.revisionId, finalizationBoundary: value.finalizationBoundary };
                for (const changed of [{ prepared: structuredClone(value.prepared) }, { handle: 'foreign' }, { host: {} },
                    { requestHash: 'a'.repeat(64) }, { expectedRevisionId: createNativeId('revision') }])
                    await expect(f.authority.finalizeNarrator({ ...args, ...changed })).rejects.toThrow('native_orchestration_output_scope_invalid');
                const narrative = value.prepared.envelope.narrative;
                value.prepared.envelope.narrative = 'Changed after original producer';
                await expect(f.authority.finalizeNarrator(args)).rejects.toThrow('native_orchestration_output_scope_invalid');
                value.prepared.envelope.narrative = narrative;
            });
            await expect(actual.finalize(actual.prepared, null, actual.finalizationBoundary)).rejects.toThrow('native_orchestration_output_scope_invalid');
            expect(result.timeline.filter(item => item.content === 'Synthetic native narrator response.')).toHaveLength(1);
            expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test.each(['memory', 'binding', 'cancel'])('%s withdrawal in the final completion bank await commits its fact and refuses the product writer', async change => {
        const f = await modelPortFixture(make, { memorySettings, changeContract }), original = BudgetPort.prototype.assertCurrent;
        let finalizing = false, changed = false, expectedVersion;
        BudgetPort.prototype.assertCurrent = async function (...args) {
            const value = await original.apply(this, args);
            if (finalizing && !changed && this === f.authority.execution.budgetPort) {
                changed = true;
                if (change === 'memory') await new SettingsRepo({ engine: f.h.engine }).save(f.h.handle,
                    { atri_capabilities: { memory_graph: { ...memorySettings, recallEnabled: false } } });
                else if (change === 'binding') {
                    const binding = await f.plans.getBinding(f.h.handle, f.sourceSelector); expectedVersion = binding.version + 1;
                    await f.plans.saveBinding(f.h.handle, createNativeId('orchestrationCommand'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
                } else {
                    const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
                    await f.authority.execution.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), { ...runGuard(root), reasonCode: 'final_output_withdrawn' });
                }
            }
            return value;
        };
        try {
            await expect(atFinalizer(f, async () => { finalizing = true; })).rejects.toThrow();
            expect(changed).toBe(true);
            const snapshot = await f.core.observe(f.h.handle, f.base.session.sessionId), root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
            expect(snapshot.timeline.some(item => item.content === 'Synthetic native narrator response.')).toBe(false);
            const observed = change === 'memory' ? (await new SettingsRepo({ engine: f.h.engine }).get(f.h.handle)).atri_capabilities.memory_graph.recallEnabled
                : change === 'binding' ? (await f.plans.getBinding(f.h.handle, f.sourceSelector)).version : root.cancelRequested;
            expect(observed).toEqual({ memory: false, binding: expectedVersion, cancel: true }[change]);
            const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
            expect(bank.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } }); expect(f.requests).toHaveLength(1);
        } finally { BudgetPort.prototype.assertCurrent = original; await f.cleanup(); }
    });
});
