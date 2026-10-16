import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { modelPortFixture } from './helpers/model-port-fixture.js';
import { ContextPort } from '../../src/native/orchestration/context-port.js';
import { NativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { SettingsRepo } from '../../src/storage/repositories/settings-repo.js';
import { createNativeId } from '../../src/native/identity.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const memorySettings = { enabled: true, sourceWritesEnabled: false, memoryOsTokenBudget: 2400 };
const changeContract = contract => { const view = contract.informationRuntime.views.find(item => item.id === 'pov'); view.sources.push('history'); view.memory = true; };
async function atFinalizer(f, before) {
    const revalidate = ContextPort.prototype.revalidate, submit = NativeTaskScheduler.prototype.submit;
    let port, context, hookError;
    ContextPort.prototype.revalidate = async function (handle, request) {
        const value = await revalidate.call(this, handle, request);
        if (handle === f.h.handle && request.context?.request.taskPurpose === 'original_native_narrator') { port = this; context = request.context; }
        return value;
    };
    NativeTaskScheduler.prototype.submit = function (request) {
        if (request.kind !== 'turn' || request.owner !== f.h.handle || request.anchor.sessionId !== f.base.session.sessionId) return submit.call(this, request);
        return submit.call(this, { ...request, finalize: async (prepared, receipt, finalizationBoundary) => {
            try { await before({ port, context, finalizationBoundary, prepared }); } catch (error) { hookError = error; throw error; }
            return request.finalize(prepared, receipt, finalizationBoundary);
        } });
    };
    try { return await f.start().catch(error => { throw hookError ?? error; }); }
    finally { ContextPort.prototype.revalidate = revalidate; NativeTaskScheduler.prototype.submit = submit; }
}

describe.each(harnesses)('$name Native Session finalization Context', ({ make }) => {
    test('the actual original Narrator Context is revalidated in the same finalizer before the existing Session writer', async () => {
        const f = await modelPortFixture(make, { memorySettings, changeContract }); let port, context, finalizationPermit;
        try {
            const result = await atFinalizer(f, async actual => {
                ({ port, context } = actual);
                finalizationPermit = port.captureNativeOutputFinalization(f.h.handle, { context, finalizationBoundary: actual.finalizationBoundary });
                const plan = await port.revalidateNativeOutput(f.h.handle, { context, finalizationPermit });
                expect(plan).toBe(context.plan);
                expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).revision.revisionId).toBe(f.base.revision.revisionId);
                await expect(port.revalidate(f.h.handle, { context, phase: 'send' })).rejects.toMatchObject({ code: 'operation_boundary_denied' });
            });
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
                const finalizationPermit = port.captureNativeOutputFinalization(f.h.handle, { context, finalizationBoundary });
                expect(() => port.captureNativeOutputFinalization(f.h.handle, { context, finalizationBoundary })).toThrow();
                for (const wrong of [{}, structuredClone(finalizationPermit)])
                    await expect(port.revalidateNativeOutput(f.h.handle, { context, finalizationPermit: wrong })).rejects.toThrow();
                await expect(port.revalidateNativeOutput('foreign', { context, finalizationPermit })).rejects.toThrow();
                await expect(port.revalidateNativeOutput(f.h.handle, { context, finalizationPermit, audience: { kind: 'actor', id: 'foreign' } })).rejects.toThrow();
                await expect(port.revalidateNativeOutput(f.h.handle, { context, finalizationPermit })).resolves.toBe(context.plan); checked = true;
            });
            expect(checked).toBe(true); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test.each(['memory', 'binding', 'source'])('%s withdrawn after Model consumption is re-read before Session finalization and preserves the real charge', async change => {
        const f = await modelPortFixture(make, { memorySettings, changeContract }); let changed = false, expectedVersion;
        try {
            const failure = await atFinalizer(f, async ({ port, context, finalizationBoundary }) => {
                const finalizationPermit = port.captureNativeOutputFinalization(f.h.handle, { context, finalizationBoundary });
                if (change === 'memory') await new SettingsRepo({ engine: f.h.engine }).save(f.h.handle,
                    { atri_capabilities: { memory_graph: { ...memorySettings, recallEnabled: false } } });
                else if (change === 'binding') {
                    const binding = await f.plans.getBinding(f.h.handle, f.sourceSelector); expectedVersion = binding.version + 1;
                    await f.plans.saveBinding(f.h.handle, createNativeId('orchestrationCommand'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
                } else await f.core.appendTimeline(f.h.handle, f.base.session.sessionId, { role: 'user', content: 'Lawful finalization source change' });
                changed = true;
                await port.revalidateNativeOutput(f.h.handle, { context, finalizationPermit });
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
});
