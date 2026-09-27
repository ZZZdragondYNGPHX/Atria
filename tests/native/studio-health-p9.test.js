import { describe, test, expect, jest } from '@jest/globals';
import { buildAtriaPackageContainer } from '../../src/native/package-container.js';
import { runStudioArchiveScenario, assertStudioScenario } from '../../src/native/studio-scenario.js';
import { inspectExperienceHealth, previewExperienceRepair, applyExperienceRepair } from '../../src/native/experience-health.js';
import { sessionFixture, services } from './helpers/session-fixture.js';
import { lifecycleFixture } from './helpers/lifecycle-fixture.js';
import { sharedFixture } from './helpers/shared-fixture.js';
import { continuityFixture } from './helpers/continuity-fixture.js';
import { activityFixture } from './helpers/activity-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { createNativeSessionRouter } from '../../src/endpoints/native-session.js';
import express from 'express';
import request from 'supertest';

function archive() {
    const f = sessionFixture(); const { lifecycleRuntime } = lifecycleFixture();
    lifecycleRuntime.workflows = []; lifecycleRuntime.automations = [];
    f.manifest.runtime = { experience: { mode: 'text' }, experienceContract: { schemaVersion: 1, capabilities: [], dataResources: [], lifecycleRuntime } };
    return { ...f, archive: buildAtriaPackageContainer({ manifest: f.manifest, sourceFiles: new Map(), assetPayloads: new Map() }).archive };
}
const appCommand = text => ({ kind: 'app.command', domainId: 'notes', recordId: 'main', commandId: 'save', args: { text } });

describe('P9 production scenario runner', () => {
    test('P5 settlement commits facts before recorded Narrator and preserves World clock', async () => {
        const f = sessionFixture(); const contract = activityFixture(); const variant = contract.taskRuntime.tasks[0].variants[0];
        f.manifest.resources = [
            { resourceType: 'core.prompt-program', resource: { schemaVersion: 1, promptProgramId: variant.prompt.resourceId, revision: 'r1', displayName: 'Narrator', stages: [{ stageId: 'stage.main', moduleRefs: [] }] } },
            { resourceType: 'core.generation-profile', resource: { schemaVersion: 1, generationProfileId: variant.generation.resourceId, revision: 'r1', displayName: 'Narrator', output: { maxTokens: 128 } } },
        ].map(item => ({ ...item, origin: { scope: 'package', packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId } }));
        f.manifest.runtime = { experienceContract: { schemaVersion: 1, capabilities: [], dataResources: [], ...contract } };
        const built = buildAtriaPackageContainer({ manifest: f.manifest, sourceFiles: new Map(), assetPayloads: new Map() });
        const result = await runStudioArchiveScenario(built.archive, { schemaVersion: 1, steps: [
            { kind: 'lifecycle', input: { kind: 'experience.ready' } },
            { kind: 'lifecycle', input: { kind: 'activity.start', activityId: 'encounter', instanceId: 'play-1' } },
            { kind: 'lifecycle', input: { kind: 'activity.settle', instanceId: 'play-1', runEpoch: 0, activityElapsedMs: 1200, outcome: { text: 'won' } } },
            { kind: 'assert', input: { path: 'states.atri_lifecycle.domains.notes.records.0.value.text', equals: 'won' } },
            { kind: 'task', input: { taskId: 'summarize', variantId: 'default', invocationId: '$pending', payload: 'The contest is over.' } },
            { kind: 'assert', input: { path: 'states.atri_lifecycle.activities.0.status', equals: 'completed' } },
            { kind: 'assert', input: { path: 'states.atri_lifecycle.clocks.world', equals: 0 } },
        ] });
        expect(result.status).toBe('passed'); expect(result.evidence.timelineEntries).toBe(2);
    });
    test('P8 fixed seats and atomic Shared Turn run through the same scenario authority', async () => {
        const f = sessionFixture(); sharedFixture(f);
        const built = buildAtriaPackageContainer({ manifest: f.manifest, sourceFiles: new Map(), assetPayloads: new Map() });
        const result = await runStudioArchiveScenario(built.archive, { schemaVersion: 1, steps: [
            { kind: 'shared.enable' },
            { kind: 'shared.membership', input: { handle: 'guest', role: 'participant', seatId: 'seat1' } },
            { kind: 'shared.command', input: { kind: 'turn.open', scopeId: 'session', scopeEpoch: 0 } },
            { kind: 'shared.command', principal: 'guest', input: { kind: 'turn.submit', turnId: '$current', ruleId: 'save', args: { text: 'guest' } } },
            { kind: 'shared.command', input: { kind: 'turn.submit', turnId: '$current', ruleId: 'save', args: { text: 'host' } } },
            { kind: 'shared.command', input: { kind: 'turn.commit', turnId: '$current' } },
            { kind: 'assert', input: { path: 'states.atri_lifecycle.domains.realm_inventory.records.0.value.text', equals: 'host' } },
        ] });
        expect(result).toMatchObject({ status: 'passed', steps: expect.arrayContaining([expect.objectContaining({ index: 6, passed: true })]) });
    });
    test('runs typed lifecycle, deterministic clock, save restore and assertions in isolated production storage', async () => {
        const result = await runStudioArchiveScenario(archive().archive, { schemaVersion: 1, steps: [
            { kind: 'lifecycle', input: appCommand('first') },
            { kind: 'checkpoint', input: 'before' },
            { kind: 'lifecycle', input: appCommand('second') },
            { kind: 'restore', input: 'before' },
            { kind: 'assert', input: { path: 'states.atri_lifecycle.domains.notes.records.0.value.text', equals: 'first' } },
        ] });
        expect(result).toMatchObject({ status: 'passed', persisted: false, providerCalls: 0 });
        expect(result.steps).toHaveLength(5);
    });
    test('expected command rejection leaves facts unchanged; failed assertion stops later work', async () => {
        const result = await runStudioArchiveScenario(archive().archive, { schemaVersion: 1, steps: [
            { kind: 'lifecycle', input: { kind: 'world.patch', hp: 900 }, expectError: 'Undeclared' },
            { kind: 'assert', input: { path: 'states.atri_lifecycle.ready', equals: true } },
            { kind: 'lifecycle', input: appCommand('unreachable') },
        ] });
        expect(result.status).toBe('failed'); expect(result.steps.map(item => item.passed)).toEqual([true, false]);
    });
    test.each([
        { schemaVersion: 2, steps: [] }, { schemaVersion: 1, steps: [], network: 'https://example.com' },
        { schemaVersion: 1, steps: [{ kind: 'script', input: 'process.exit()' }] },
        { schemaVersion: 1, steps: [{ kind: 'assert', input: { path: 'states.__proto__', equals: {} } }] },
        { schemaVersion: 1, steps: Array(65).fill({ kind: 'checkpoint', input: 'x' }) },
    ])('rejects invalid or executable scenario %j', raw => { expect(() => assertStudioScenario(raw)).toThrow(); });
});

describe.each(CONTRACT_HARNESSES)('P9 Health / typed repair — $name', ({ make }) => {
    let h, f, svc, base;
    beforeEach(async () => {
        h = await make(); f = archive(); svc = services(h);
        await svc.packageInstaller.install(h.handle, f.archive);
        base = await svc.core.create(h.handle, { packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId, entryPointId: f.entryPointId });
    });
    afterEach(async () => { jest.restoreAllMocks(); await h?.cleanup(); });
    test('inspection and repair preview are read only; confirmation publishes one typed revision', async () => {
        const report = await inspectExperienceHealth(svc.core, h.handle, base.session.sessionId);
        expect(report.anchor.revisionId).toBe(base.revision.revisionId);
        expect(report.migration).toMatchObject({ status: 'exact-version-pinned', automatic: false });
        expect(JSON.stringify(report)).not.toContain('harbor');
        const plan = await previewExperienceRepair(svc.core, h.handle, base.session.sessionId, { kind: 'retention.compact', expectedRevisionId: base.revision.revisionId });
        expect((await svc.core.load(h.handle, base.session.sessionId)).revision.revisionId).toBe(base.revision.revisionId);
        const repair = { request: plan.request, token: plan.token, confirmed: true, invocationId: 'health-confirm' };
        await expect(applyExperienceRepair(svc.core, h.handle, base.session.sessionId, { ...repair, confirmed: false })).rejects.toThrow(/confirmation/);
        const after = await applyExperienceRepair(svc.core, h.handle, base.session.sessionId, repair);
        expect(after.revision.revisionId).not.toBe(base.revision.revisionId);
        expect(after.states.atri_lifecycle.receipts.at(-1).invocationId).toBe('health-confirm');
    });
    test('stale, tampered and arbitrary repairs fail closed', async () => {
        const plan = await previewExperienceRepair(svc.core, h.handle, base.session.sessionId, { kind: 'retention.compact', expectedRevisionId: base.revision.revisionId });
        await expect(applyExperienceRepair(svc.core, h.handle, base.session.sessionId, { request: plan.request, token: 'forged', confirmed: true, invocationId: 'forged' })).rejects.toMatchObject({ code: 'native_health_stale' });
        await expect(previewExperienceRepair(svc.core, h.handle, base.session.sessionId, { kind: 'world.patch', expectedRevisionId: base.revision.revisionId })).rejects.toThrow(/Unsupported/);
        await svc.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId: 'other', action: appCommand('other') }, { expectedRevisionId: base.revision.revisionId });
        await expect(applyExperienceRepair(svc.core, h.handle, base.session.sessionId, { request: plan.request, token: plan.token, confirmed: true, invocationId: 'stale' })).rejects.toMatchObject({ code: 'native_health_stale' });
    });
    test('authenticated HTTP ignores body account impersonation and requires explicit confirmation', async () => {
        const app = express(); app.use(express.json());
        app.use((req, _res, next) => { if (req.headers['x-auth']) req.user = { profile: { handle: h.handle } }; next(); });
        app.use(createNativeSessionRouter(() => svc));
        const body = { sessionId: base.session.sessionId, handle: 'attacker' };
        await request(app).post('/health').send(body).expect(401);
        const report = await request(app).post('/health').set('x-auth', 'yes').send(body).expect(200);
        expect(report.body.anchor.sessionId).toBe(body.sessionId);
        await request(app).post('/health/apply').set('x-auth', 'yes').send({ ...body, repair: {} }).expect(400);
    });
    test.each(['transfer.resume', 'transfer.cancel'])('P7 pending Saga %s uses existing ledger reservations and receipts', async kind => {
        const fixture = sessionFixture(); fixture.manifest.runtime = { experienceContract: continuityFixture() };
        const built = buildAtriaPackageContainer({ manifest: fixture.manifest, sourceFiles: new Map(), assetPayloads: new Map() });
        await svc.packageInstaller.install(h.handle, built.archive);
        let before = await svc.core.create(h.handle, { packageId: fixture.manifest.packageId, packageVersionId: fixture.manifest.packageVersionId, entryPointId: fixture.entryPointId });
        const sessionId = before.session.sessionId;
        before = await svc.core.applyLifecycleCommand(h.handle, sessionId, { type: 'lifecycle', invocationId: 'inventory', action: { ...appCommand('sword'), domainId: 'inventory', recordId: 'sword' } }, { expectedRevisionId: before.revision.revisionId });
        jest.spyOn(svc.sessionRepo, 'commitSnapshot').mockRejectedValueOnce(new Error('IO failure'));
        await expect(svc.core.applyContinuityCommand(h.handle, sessionId, { type: 'continuity', invocationId: 'deposit', action: {
            kind: 'transfer', transferId: 'vault', direction: 'deposit', recordId: 'sword', scopeEpoch: 0, expectedContinuityRevisionId: null,
        } }, { expectedRevisionId: before.revision.revisionId })).rejects.toThrow('IO failure');
        const health = await inspectExperienceHealth(svc.core, h.handle, sessionId);
        expect(health.status).toBe('blocked');
        const plan = await previewExperienceRepair(svc.core, h.handle, sessionId, { kind, authority: 'player', intentId: health.diagnostics.find(item => item.code === 'transfer.prepared').intentId, expectedRevisionId: before.revision.revisionId });
        await applyExperienceRepair(svc.core, h.handle, sessionId, { request: plan.request, token: plan.token, confirmed: true, invocationId: 'repair' });
        const after = await svc.core.load(h.handle, sessionId);
        expect(after.externalEffects[0].status).toBe(kind === 'transfer.resume' ? 'committed' : 'compensated');
        expect(after.states.atri_lifecycle.domains.inventory.records).toHaveLength(kind === 'transfer.resume' ? 0 : 1);
    });
});
