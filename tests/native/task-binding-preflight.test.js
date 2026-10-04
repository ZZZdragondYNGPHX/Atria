import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { services } from './helpers/session-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { authorityTurnFixture } from './helpers/authority-turn-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { taskBindingFixture } from './helpers/task-binding-fixture.js';

let h, f, svc, seeded, host, send;
beforeEach(async () => {
    h = await makeTempFsEngineHarness(); svc = services(h); f = taskBindingFixture();
    await svc.packageInstaller.install(h.handle, f.archive, { grantedPermissions: ['generation'] });
    seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:1/never-send', roles: ['narrator', 'memory'] });
    send = jest.fn(() => { throw new Error('Preflight must never send inference'); });
    host = new NativeGenerationHost({ ...seeded, sessionCore: svc.core, packageInstaller: svc.packageInstaller,
        providers: { 'provider.openai-compatible': { ...createHttpGenerationProvider(), send } } });
});
afterEach(async () => { await h.cleanup(); });
const ref = (index = 0) => ({ scope: 'player', runtimeRouteId: seeded.routes[index].runtimeRouteId });
const input = slotBindings => ({ packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId, slotBindings });
const preflight = bindings => host.preflightTaskBindings(h.handle, input(bindings));

test('first start reports two unique missing purposes for four tasks without creating a Session', async () => {
    const result = await preflight({});
    expect(send).not.toHaveBeenCalled();
    expect(result.ready).toBe(false); expect(result.slots.map(slot => slot.id)).toEqual(['narrative', 'structured']);
    expect(result.slots[1].tasks).toEqual(['case.reflection', 'claim.advisor', 'agenda.deliberation']);
    expect(result.slots.every(slot => slot.routes.every(route => route.compatible))).toBe(true);
    expect(await svc.sessionRepo.list(h.handle)).toEqual([]);
});
test.each([0, 1])('same or different player routes pass preflight AND strict lifecycle prepare (%s)', async index => {
    const bindings = { narrative: ref(), structured: ref(index) };
    expect((await preflight(bindings)).ready).toBe(true);
    const base = await svc.core.create(h.handle, { ...input(), entryPointId: f.entryPointId });
    const result = await host.prepareLifecycle(h.handle, { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, slotBindings: bindings });
    expect(result.bindings).toHaveLength(4); expect(send).not.toHaveBeenCalled();
});
test.each([{ scope: 'session', runtimeRouteId: 'route_' + 'f'.repeat(32) }, { scope: 'player', runtimeRouteId: 'invalid' }, { scope: 'player', runtimeRouteId: 'route_' + 'f'.repeat(32) }])('foreign, invalid or stale refs are missing: %j', async binding => {
    const result = await preflight({ narrative: binding, structured: ref() });
    expect(result.ready).toBe(false); expect(result.slots[0]).toMatchObject({ binding: null, error: 'native_task_binding_missing' });
});
test('lifecycle shares one exact snapshot but rejects a concurrent revision change', async () => {
    const base = await svc.core.create(h.handle, { ...input(), entryPointId: f.entryPointId });
    const load = jest.spyOn(svc.core, 'load').mockResolvedValueOnce(base).mockResolvedValueOnce({ ...base, revision: { ...base.revision, revisionId: 'changed' } });
    await expect(host.prepareLifecycle(h.handle, { sessionId: base.session.sessionId, revisionId: base.revision.revisionId,
        slotBindings: { narrative: ref(), structured: ref() } })).rejects.toThrow('native_generation_revision_conflict');
    expect(load).toHaveBeenCalledTimes(2); expect(send).not.toHaveBeenCalled();
});
test('deleted route must be reconfigured', async () => {
    await seeded.persistence.deleteProfile(h.handle, 'routes', seeded.routes[0].runtimeRouteId);
    const result = await preflight({ narrative: ref(), structured: ref(1) });
    expect(result.slots[0].error).toBe('native_task_binding_missing');
});
test.each(['unsupported', 'unknown'])('capabilities use the real resolver, including implicit structured output (%s)', async state => {
    host.providers['provider.openai-compatible'].resolveCapabilities = async () => [{ capability: 'generation.structured-output', state, provenance: [{ kind: 'adapter-metadata', source: 'fixture' }] }];
    const result = await preflight({ narrative: ref(), structured: ref() });
    expect(result.ready).toBe(false);
    expect(result.slots[0].routes[0]).toMatchObject({ compatible: false, error: 'generation_capability_' + state });
});
test('each unique slot enforces its own declared capability requirements', async () => {
    f = taskBindingFixture({ capability: 'generation.reasoning' });
    await svc.packageInstaller.install(h.handle, f.archive, { grantedPermissions: ['generation'] });
    host.providers['provider.openai-compatible'].resolveCapabilities = async () => [
        { capability: 'generation.structured-output', state: 'supported', provenance: [{ kind: 'adapter-metadata', source: 'fixture' }] },
        { capability: 'generation.reasoning', state: 'unsupported', provenance: [{ kind: 'adapter-metadata', source: 'fixture' }] },
    ];
    const result = await preflight({ narrative: ref(), structured: ref() });
    expect(result.slots[0].error).toBeNull(); expect(result.slots[1].error).toBe('generation_capability_unsupported');
    expect(result.slots[1].requiredCapabilities).toEqual(['generation.reasoning']); expect(send).not.toHaveBeenCalled();
});
test('no task runtime needs no route or Session', async () => {
    f = taskBindingFixture({ tasks: false }); await svc.packageInstaller.install(h.handle, f.archive, { grantedPermissions: ['generation'] });
    expect(await preflight({})).toMatchObject({ ready: true, slots: [] });
    expect(await svc.sessionRepo.list(h.handle)).toEqual([]);
});
test('endpoint authenticates and accepts only read-only exact Package inputs', async () => {
    const app = express(); app.use(express.json()); app.use((req, _res, next) => { if (req.headers['x-user']) req.user = { profile: { handle: h.handle } }; next(); });
    app.use(createNativeGenerationRouter(() => host));
    await request(app).post('/task-bindings/preflight').send(input({})).expect(401);
    await request(app).post('/task-bindings/preflight').set('x-user', h.handle).send({ ...input({}), save: true }).expect(400);
    const result = await request(app).post('/task-bindings/preflight').set('x-user', h.handle).send(input({})).expect(200);
    expect(result.body.slots).toHaveLength(2); expect(await svc.sessionRepo.list(h.handle)).toEqual([]);
});

test('authority-first preflight catches missing resolver even when every authored purpose is configured', async () => {
    const a = await authorityTurnFixture(h, 'http://127.0.0.1:1/never-send', f => {
        const fixture = taskBindingFixture();
        f.contract.taskRuntime = fixture.manifest.runtime.experienceContract.taskRuntime;
        f.contract.taskRuntime.tasks[0].executionClass = 'turn_blocking';
        f.contract.taskRuntime.turn = { policy: 'authority-first', stages: [], narratorTaskId: 'narrator' };
        f.base.manifest.resources = fixture.manifest.resources.map(item => ({ ...item, origin: { scope: 'package',
            packageId: f.base.manifest.packageId, packageVersionId: f.base.manifest.packageVersionId } }));
    });
    a.host.providers['provider.openai-compatible'] = { ...a.host.providers['provider.openai-compatible'], send };
    await a.seeded.persistence.deleteProfile(h.handle, 'routes', a.seeded.routes[1].runtimeRouteId);
    // Both purposes deliberately use the sole narrator route, as in the reported setup.
    const binding = { scope: 'player', runtimeRouteId: a.seeded.routes[0].runtimeRouteId };
    const query = { packageId: a.base.session.packageId, packageVersionId: a.base.session.packageVersionId,
        slotBindings: { narrative: binding, structured: binding } };
    const result = await a.host.preflightTaskBindings(h.handle, query);
    expect(result.slots.every(slot => !slot.error)).toBe(true);
    expect(result).toMatchObject({ ready: false, turnRoutes: [{ role: 'intent_resolver', error: 'native_generation_route_missing' }] });
    const revision = a.base.revision.revisionId;
    await expect(a.host.prepareLifecycle(h.handle, { sessionId: a.base.session.sessionId, revisionId: revision, slotBindings: query.slotBindings }))
        .rejects.toMatchObject({ code: 'native_generation_route_missing' });
    expect((await a.core.load(h.handle, a.base.session.sessionId)).revision.revisionId).toBe(revision);
    await a.seeded.persistence.saveRuntimeRoute(h.handle, a.seeded.routes[1]);
    expect(await a.host.preflightTaskBindings(h.handle, query)).toMatchObject({ ready: true, turnRoutes: [{ role: 'intent_resolver', error: null }] });
    const duplicate = { ...a.seeded.routes[1], runtimeRouteId: createNativeId('runtimeRoute') };
    await a.seeded.persistence.saveRuntimeRoute(h.handle, duplicate);
    expect(await a.host.preflightTaskBindings(h.handle, query)).toMatchObject({ ready: false, turnRoutes: [{ error: 'native_generation_route_ambiguous' }] });
    await a.seeded.persistence.deleteProfile(h.handle, 'routes', duplicate.runtimeRouteId);
    a.host.providers['provider.openai-compatible'] = { ...a.host.providers['provider.openai-compatible'],
        resolveCapabilities: async () => [{ capability: 'generation.tools', state: 'unsupported', provenance: [{ kind: 'adapter-metadata', source: 'fixture' }] },
            { capability: 'generation.structured-output', state: 'supported', provenance: [{ kind: 'adapter-metadata', source: 'fixture' }] }] };
    expect(await a.host.preflightTaskBindings(h.handle, query)).toMatchObject({ ready: false, turnRoutes: [{ error: 'generation_capability_unsupported' }] });
    expect(send).not.toHaveBeenCalled();
});
