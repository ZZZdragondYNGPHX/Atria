import { jest } from '@jest/globals';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { openActivity } from './helpers/activity-fixture.js';
import { services } from './helpers/session-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';

let h, f, base, seeded;
beforeEach(async () => {
    h = await makeTempFsEngineHarness();
    ({ f, base } = await openActivity(h, declaration => {
        const task = declaration.taskRuntime.tasks[0];
        task.variants.push({ ...structuredClone(task.variants[0]), id: 'activity-narrator' });
        declaration.presentationRuntime.activities[0].narrator.variantId = 'activity-narrator';
    }));
    seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:1/unused' });
});
afterEach(async () => h.cleanup());
const input = () => ({ sessionId: base.session.sessionId, revisionId: base.revision.revisionId,
    slotBindings: { structured: { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId } } });
const command = async (action, invocationId) => {
    base = await f.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId, action }, { expectedRevisionId: base.revision.revisionId });
};
test('Ready preflight includes the exact non-default Activity Narrator without model send or revision write', async () => {
    const send = jest.fn(() => { throw new Error('preflight must not send'); });
    const host = new NativeGenerationHost({ ...seeded, sessionCore: f.core, packageInstaller: f.packageInstaller,
        providers: { 'provider.openai-compatible': { ...createHttpGenerationProvider(), send } } });
    const result = await host.prepareLifecycle(h.handle, input());
    expect(result.bindings).toEqual([
        { taskId: 'summarize', variantId: 'default', bindingSlotId: 'structured' },
        { taskId: 'summarize', variantId: 'activity-narrator', bindingSlotId: 'structured' },
    ]);
    expect(send).not.toHaveBeenCalled();
    expect((await f.core.load(h.handle, base.session.sessionId)).revision).toEqual(base.revision);
});
test('restarted Host drains settled Activity through the existing scheduler and publishes canonical narrative once', async () => {
    await command({ kind: 'experience.ready' }, 'ready');
    await command({ kind: 'activity.start', activityId: 'encounter', instanceId: 'round' }, 'start');
    await command({ kind: 'activity.settle', instanceId: 'round', runEpoch: 0, activityElapsedMs: 350, outcome: { text: 'won' } }, 'settle');
    const settled = base; const observation = base.states.atri_lifecycle.activities[0].observation;
    const host = new NativeGenerationHost({ ...seeded, sessionCore: services(h).core, packageInstaller: f.packageInstaller });
    host.execute = jest.fn(async (_handle, request, _signal, _onChunk, { taskPlan }) => {
        const committed = await host.sessionCore.load(h.handle, request.sessionId);
        expect(taskPlan.variant.id).toBe('activity-narrator');
        expect(taskPlan.payload).toEqual({ observation });
        expect(committed.revision.revisionId).toBe(observation.committedRevisionId);
        expect(committed.states.atri_lifecycle.domains.notes.records[0].value).toEqual({ text: 'won' });
        return { response: { text: JSON.stringify('The contest is over.') }, snapshot: { contextPlan: {}, promptProgramRef: {}, generationProfileRef: {}, runtimeRouteId: seeded.routes[0].runtimeRouteId } };
    });
    const result = await host.executeLifecycle(h.handle, input()); base = result.snapshot;
    expect(host.execute).toHaveBeenCalledTimes(1);
    expect(base.timeline).toHaveLength(settled.timeline.length + 1);
    expect(base.variants.find(item => item.variantId === base.timeline.at(-1).activeVariantId).content).toBe('The contest is over.');
    expect(base.states.atri_lifecycle.activities[0].status).toBe('completed');
    expect(result.results[0]).toMatchObject({ deliveryReceipt: { kind: 'model_delivery' }, authorityReceipt: { kind: 'authority', activityInstanceId: 'round' } });
    expect((await host.executeLifecycle(h.handle, input())).results).toEqual([]);
    expect(host.execute).toHaveBeenCalledTimes(1);
});
