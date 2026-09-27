import { jest } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import { buildAtriaPackageContainer } from '../../src/native/index.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createNativeSessionRouter } from '../../src/endpoints/native-session.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { sessionFixture, services } from './helpers/session-fixture.js';
import { lifecycleFixture } from './helpers/lifecycle-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';

let h, f, base, seeded;
beforeEach(async () => {
    h = await makeTempFsEngineHarness(); f = { ...sessionFixture(), ...services(h) };
    const { taskRuntime, lifecycleRuntime } = lifecycleFixture();
    lifecycleRuntime.workflows = [];
    lifecycleRuntime.automations[0].action = { kind: 'task', taskId: 'summarize', variantId: 'default', input: {} };
    const variant = taskRuntime.tasks[0].variants[0];
    f.manifest.resources = [
        { resourceType: 'core.prompt-program', resource: { schemaVersion: 1, promptProgramId: variant.prompt.resourceId, revision: 'r1', displayName: 'Task', stages: [{ stageId: 'stage.main', moduleRefs: [] }] } },
        { resourceType: 'core.generation-profile', resource: { schemaVersion: 1, generationProfileId: variant.generation.resourceId, revision: 'r1', displayName: 'Task', output: { maxTokens: 128 } } },
    ].map(item => ({ ...item, origin: { scope: 'package', packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId } }));
    f.manifest.runtime = { experienceContract: { schemaVersion: 1, capabilities: [], dataResources: [], taskRuntime, lifecycleRuntime } };
    const { archive } = buildAtriaPackageContainer({ manifest: f.manifest, sourceFiles: new Map(), assetPayloads: new Map() });
    await f.packageInstaller.install(h.handle, archive);
    base = await f.core.create(h.handle, { packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId, entryPointId: f.entryPointId });
    seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:1/unused' });
});
afterEach(async () => h.cleanup());
const command = async (action, invocationId) => {
    base = await f.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId, action }, { expectedRevisionId: base.revision.revisionId });
    return base;
};
function host(core = f.core) {
    const value = new NativeGenerationHost({ ...seeded, sessionCore: core, packageInstaller: f.packageInstaller });
    value.execute = jest.fn(async () => ({ response: { jsonData: { text: 'Durable result' } }, snapshot: { contextPlan: {}, promptProgramRef: {}, generationProfileRef: {}, runtimeRouteId: seeded.routes[0].runtimeRouteId } }));
    return value;
}
const input = () => ({ sessionId: base.session.sessionId, revisionId: base.revision.revisionId,
    slotBindings: { structured: { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId } } });

test('ready intent survives Host restart, runs in existing scheduler, publishes once with separate receipt kinds', async () => {
    const first = host(); await expect(first.executeLifecycle(h.handle, input())).rejects.toThrow('not_ready');
    await command({ kind: 'experience.ready' }, 'ready');
    expect(base.states.atri_lifecycle.outbox).toHaveLength(1);
    const restarted = host(services(h).core);
    const result = await restarted.executeLifecycle(h.handle, input()); base = result.snapshot;
    expect(restarted.execute).toHaveBeenCalledTimes(1);
    expect(result.results[0].deliveryReceipt.kind).toBe('model_delivery');
    expect(base.states.atri_lifecycle.receipts[0].kind).toBe('authority');
    expect(base.timeline).toHaveLength(1);
    expect(base.timeline[0].content).toBe('Opening');
    expect(base.states.atri_lifecycle.outbox[0].status).toBe('completed');
    expect((await restarted.executeLifecycle(h.handle, input())).results).toEqual([]);
    expect(restarted.execute).toHaveBeenCalledTimes(1);
});

test('stale in-flight task never finalizes; durable intent resumes at the new revision', async () => {
    await command({ kind: 'experience.ready' }, 'ready');
    const current = host(); let release, entered;
    const started = new Promise(resolve => { entered = resolve; });
    const original = current.execute;
    current.execute = jest.fn(async (...args) => { entered(); await new Promise(resolve => { release = resolve; }); return original(...args); });
    const pending = current.executeLifecycle(h.handle, input()); await started;
    await command({ kind: 'clock.advance', commandId: 'advance', ticks: 1 }, 'advance'); release();
    await expect(pending).rejects.toThrow('stale');
    expect((await f.core.load(h.handle, base.session.sessionId)).states.atri_task_results).toBeUndefined();
    const result = await host().executeLifecycle(h.handle, input());
    expect(result.results).toHaveLength(1);
    expect(result.snapshot.states.atri_lifecycle.clocks.world).toBe(1);
});

test('scope cancellation invalidates queued authority and prevents direct use of reserved scheduled identity', async () => {
    await command({ kind: 'experience.ready' }, 'ready');
    const item = base.states.atri_lifecycle.outbox[0];
    await command({ kind: 'scope.transition', scopeId: 'session', status: 'suspended' }, 'suspend');
    expect((await host().executeLifecycle(h.handle, input())).results).toEqual([]);
    await expect(host().executeTask(h.handle, { ...input(), invocationId: item.invocationId, taskId: item.taskId, variantId: item.variantId, input: {} })).rejects.toThrow('reserved');
    await expect(f.core.recordTaskResult(h.handle, base.session.sessionId, { ...item, payload: { text: 'late' } }, { expectedRevisionId: base.revision.revisionId })).rejects.toThrow('no longer exists');
});

test('generation lifecycle HTTP binds server owner and validates anchor/request, no external model', async () => {
    await command({ kind: 'experience.ready' }, 'ready'); const runtime = host();
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { if (req.headers['x-user']) req.user = { profile: { handle: req.headers['x-user'] } }; next(); });
    app.use('/generation', createNativeGenerationRouter(() => runtime));
    await supertest(app).post('/generation/lifecycle').send(input()).expect(401);
    await supertest(app).post('/generation/lifecycle').set('x-user', h.handle).send({ ...input(), handle: 'foreign' }).expect(400);
    const response = await supertest(app).post('/generation/lifecycle').set('x-user', h.handle).send(input()).expect(200);
    expect(response.body.results).toHaveLength(1);
    await supertest(app).post('/generation/lifecycle').set('x-user', h.handle).send(input()).expect(409);
});


test('Session lifecycle HTTP uses the same authenticated command/CAS path and rejects malformed authority writes', async () => {
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { if (req.headers['x-user']) req.user = { profile: { handle: req.headers['x-user'] } }; next(); });
    app.use('/session', createNativeSessionRouter(() => ({ core: f.core, assets: f.assetStore })));
    const body = { sessionId: base.session.sessionId, expectedRevisionId: base.revision.revisionId,
        command: { type: 'lifecycle', invocationId: 'ready-http', action: { kind: 'experience.ready' } } };
    await supertest(app).post('/session/command').send(body).expect(401);
    await supertest(app).post('/session/command').set('x-user', h.handle).send({ ...body, command: { ...body.command, patch: {} } }).expect(400);
    await supertest(app).post('/session/command').set('x-user', h.handle).send({ ...body, command: { ...body.command, action: { kind: 'clock.advance', commandId: 'advance', ticks: -1 } } }).expect(400);
    const response = await supertest(app).post('/session/command').set('x-user', h.handle).send(body).expect(200);
    expect(response.body.states.atri_lifecycle.ready).toBe(true);
    await supertest(app).post('/session/command').set('x-user', h.handle).send({ ...body, command: { ...body.command, invocationId: 'stale' } }).expect(409);
    const replay = await supertest(app).post('/session/command').set('x-user', h.handle).send(body).expect(200);
    expect(replay.body.revision.revisionId).toBe(response.body.revision.revisionId);
});


test('Ready binding preflight uses exact Task resources and capability resolution without sending a model request', async () => {
    const provider = createHttpGenerationProvider(); const send = jest.fn(() => { throw new Error('preflight must not send'); });
    const runtime = new NativeGenerationHost({ ...seeded, sessionCore: f.core, packageInstaller: f.packageInstaller,
        providers: { 'provider.openai-compatible': { ...provider, send } } });
    const before = base.revision.revisionId;
    const result = await runtime.prepareLifecycle(h.handle, input());
    expect(result.bindings).toEqual([{ taskId: 'summarize', variantId: 'default', bindingSlotId: 'structured' }]);
    expect(send).not.toHaveBeenCalled();
    expect((await f.core.load(h.handle, base.session.sessionId)).revision.revisionId).toBe(before);
    await expect(runtime.prepareLifecycle(h.handle, { ...input(), slotBindings: {} })).rejects.toThrow('binding_missing');
    runtime.providers = { 'provider.openai-compatible': { ...provider, send, resolveCapabilities: async () => [{ capability: 'generation.structured-output', state: 'unsupported', provenance: [{ kind: 'adapter-metadata', source: 'fixture' }] }] } };
    await expect(runtime.prepareLifecycle(h.handle, input())).rejects.toThrow('generation_capability_unsupported');
    expect(send).not.toHaveBeenCalled();
});
