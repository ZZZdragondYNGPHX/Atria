import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { services } from './helpers/session-fixture.js';
import { simulationTaskFixture } from './helpers/simulation-task-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { buildAtriaPackageContainer } from '../../src/native/index.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';

// Actual install/Session/Task/CAS/save paths; provider execution is an explicit
// deterministic double. HTTP/hosted-model behavior is not claimed by this suite.
describe.each(CONTRACT_HARNESSES)('World Simulation Session integration - $name', ({ make }) => {
    let h, target, f, svc, base, seeded, archive, serial;
    beforeEach(async () => {
        h = await make(); svc = services(h); serial = 0; f = simulationTaskFixture();
        const variant = f.contract.taskRuntime.tasks[0].variants[0];
        f.base.manifest.resources = [
            { resourceType: 'core.prompt-program', resource: { schemaVersion: 1, promptProgramId: variant.prompt.resourceId, revision: 'r1', displayName: 'Agenda', stages: [{ stageId: 'stage.main', moduleRefs: [] }] } },
            { resourceType: 'core.generation-profile', resource: { schemaVersion: 1, generationProfileId: variant.generation.resourceId, revision: 'r1', displayName: 'Agenda', output: { maxTokens: 128 } } },
        ].map(item => ({ ...item, origin: { scope: 'package', packageId: f.base.session.packageId, packageVersionId: f.base.session.packageVersionId } }));
        ({ archive } = buildAtriaPackageContainer({ manifest: f.base.manifest, sourceFiles: f.installed.sourceFiles, assetPayloads: new Map() }));
        await svc.packageInstaller.install(h.handle, archive);
        base = await svc.core.create(h.handle, { packageId: f.base.session.packageId, packageVersionId: f.base.session.packageVersionId, entryPointId: f.base.session.entryPointId });
        await command({ kind: 'experience.ready' });
        for (const domainId of ['notes', 'other']) await command({ kind: 'app.command', domainId, commandId: 'save', recordId: 'main', args: { text: 'seed' } });
        seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:1/unused' });
    });
    afterEach(async () => { jest.restoreAllMocks(); await target?.cleanup(); target = null; await h?.cleanup(); });
    async function command(action, invocationId = 'simulation-' + ++serial) {
        base = await svc.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId, action }, { expectedRevisionId: base.revision.revisionId });
        return base;
    }
    const input = () => ({ sessionId: base.session.sessionId, revisionId: base.revision.revisionId, slotBindings: { structured: { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId } } });
    function host(payload = { text: 'filed' }) {
        const host = new NativeGenerationHost({ ...seeded, sessionCore: svc.core, packageInstaller: svc.packageInstaller });
        host.execute = jest.fn(async () => ({ response: { jsonData: payload }, snapshot: { contextPlan: {}, promptProgramRef: {}, generationProfileRef: {}, runtimeRouteId: seeded.routes[0].runtimeRouteId } }));
        return host;
    }
    test('three-day advance publishes once; background intent uses a separate anchored CAS without a user turn', async () => {
        const spy = jest.spyOn(svc.core._sessions, 'commitSnapshot');
        const timeline = base.timeline;
        await command({ kind: 'clock.advance', commandId: 'advance', ticks: 4320 }, 'three-days');
        expect(spy).toHaveBeenCalledTimes(1);
        expect(base.timeline).toEqual(timeline);
        expect(base.states.atri_lifecycle.domains.notes.records[0].value.visits).toBe(3);
        expect(base.states.atri_lifecycle.outbox[0].input).toEqual({ known: 'advanced', tick: 4320 });
        const runtime = host(); const result = await runtime.executeLifecycle(h.handle, input()); base = result.snapshot;
        expect(runtime.execute).toHaveBeenCalledTimes(1); expect(spy).toHaveBeenCalledTimes(2);
        expect(base.states.atri_lifecycle.domains.notes.records[0].value.text).toBe('resolved');
        expect(base.states.atri_lifecycle.domains.public_notes.records[0].value.text).toBe('resolved');
        expect(base.states.atri_lifecycle.domains.other.records[0].value.text).toBe('accepted');
        expect(base.states.atri_game_runtime.events).toHaveLength(4);
        expect(base.timeline).toEqual(timeline);
        const prior = base.revision;
        await command({ kind: 'clock.advance', commandId: 'advance', ticks: 4320 }, 'three-days');
        expect(base.revision).toEqual(prior); expect(spy).toHaveBeenCalledTimes(2);
        expect((await runtime.executeLifecycle(h.handle, input())).results).toEqual([]);
    });
    test.each(['provider', 'schema'])('%s failure publishes no Task result or world effect', async mode => {
        await command({ kind: 'clock.advance', commandId: 'advance', ticks: 4320 }); const before = base;
        const runtime = host({ text: 'arbitrary new fact' });
        if (mode === 'provider') runtime.execute.mockRejectedValue(new Error('synthetic provider failure'));
        await expect(runtime.executeLifecycle(h.handle, input())).rejects.toThrow();
        expect(await svc.core.load(h.handle, base.session.sessionId)).toEqual(before);
    });
    test('changed institutional input cancels stale queued work before calling a model', async () => {
        await command({ kind: 'clock.advance', commandId: 'advance', ticks: 4320 });
        await command({ kind: 'app.command', domainId: 'notes', commandId: 'save', recordId: 'main', args: { text: 'changed' } });
        const runtime = host(); const result = await runtime.executeLifecycle(h.handle, input()); base = result.snapshot;
        expect(runtime.execute).not.toHaveBeenCalled(); expect(result.results).toEqual([]);
        expect(base.states.atri_lifecycle.outbox.some(item => item.status === 'pending')).toBe(false);
        expect(base.states.atri_lifecycle.domains.notes.records[0].value.text).toBe('changed');
    });
    test('actual save export/import to a fresh store preserves accepted results', async () => {
        await command({ kind: 'clock.advance', commandId: 'advance', ticks: 4320 });
        base = (await host().executeLifecycle(h.handle, input())).snapshot;
        const save = await svc.saveSystem.manualSave(h.handle, base.session.sessionId);
        const exported = await svc.saveSystem.exportSnapshot(h.handle, base.session.sessionId, save.saveId);
        target = await make(); const restoredServices = services(target);
        await restoredServices.packageInstaller.install(target.handle, archive);
        const restored = await restoredServices.saveSystem.importSave(target.handle, exported.archive);
        expect(restored.states.atri_lifecycle.clocks.world).toBe(4320);
        expect(restored.states.atri_lifecycle.domains).toEqual(base.states.atri_lifecycle.domains);
        expect(restored.states.atri_task_results.records.map(record => record.payload)).toEqual(base.states.atri_task_results.records.map(record => record.payload));
        expect(restored.states.atri_lifecycle.outbox.some(item => item.status === 'pending')).toBe(false);
    });
});
