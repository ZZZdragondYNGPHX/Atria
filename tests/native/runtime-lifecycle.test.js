import { afterEach, expect, test } from '@jest/globals';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { NativeModelPromptPersistence } from '../../src/native/model-prompt-runtime/persistence.js';
import { createNativeId } from '../../src/native/identity.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';

const cleanups = [];
afterEach(async () => { setReadOnly(false); for (const cleanup of cleanups.splice(0)) await cleanup(); });
async function fixture() {
    const h = await makeTempFsEngine(); cleanups.push(h.cleanup);
    return { ...h, ...await seedGenerationProfiles({ ...h, endpoint: 'https://example.invalid/v1/chat/completions', roles: ['narrator', 'narrator'] }) };
}
test('Runtime deletion identifies references and deletes only after the referring resources are removed', async () => {
    const f = await fixture(); const p = f.persistence;
    await p.saveRuntimeRoute(f.handle, { ...f.routes[0], fallbackRouteRefs: [{ scope: 'player', runtimeRouteId: f.routes[1].runtimeRouteId }] });
    await expect(p.deleteProfile(f.handle, 'connections', f.connection.connectionProfileId)).rejects.toMatchObject({ code: 'native_runtime_referenced', details: { usedBy: expect.arrayContaining([{ section: 'models', id: f.model.modelProfileId, displayName: f.model.displayName }]) } });
    await expect(p.deleteProfile(f.handle, 'models', f.model.modelProfileId)).rejects.toMatchObject({ code: 'native_runtime_referenced' });
    await expect(p.deleteProfile(f.handle, 'routes', f.routes[1].runtimeRouteId)).rejects.toMatchObject({ code: 'native_runtime_referenced' });
    await p.deleteProfile(f.handle, 'routes', f.routes[0].runtimeRouteId);
    await p.deleteProfile(f.handle, 'routes', f.routes[1].runtimeRouteId);
    await p.deleteProfile(f.handle, 'models', f.model.modelProfileId);
    await p.deleteProfile(f.handle, 'connections', f.connection.connectionProfileId);
    expect(await p.listConnectionProfiles(f.handle)).toEqual([]);
    expect(await f.library.getExact(f.handle, f.routes[0].generationProfileRef)).toBeDefined();
});
test('concurrent delete and referencing save across instances cannot leave a dangling model', async () => {
    const f = await fixture(); const p = new NativeModelPromptPersistence({ engine: f.engine });
    const connection = { ...f.connection, connectionProfileId: createNativeId('connectionProfile') };
    await p.saveConnectionProfile(f.handle, connection);
    const model = { ...f.model, modelProfileId: createNativeId('modelProfile'), connectionProfileRef: { scope: 'player', connectionProfileId: connection.connectionProfileId } };
    const results = await Promise.allSettled([p.deleteProfile(f.handle, 'connections', connection.connectionProfileId), f.persistence.saveModelProfile(f.handle, model)]);
    expect(results.map(item => item.status)).toEqual(['fulfilled', 'rejected']);
    expect(await p.getModelProfile(f.handle, model.modelProfileId)).toBeNull();
});
test('archive and restore retain immutable exact revisions, including after a new revision', async () => {
    const f = await fixture(); const ref = f.routes[0].generationProfileRef;
    const before = await f.library.getExact(f.handle, ref);
    await f.library.setArchived(f.handle, ref.resourceType, ref.resourceId, true);
    await f.library.commit(f.handle, ref.resourceType, { ...f.generation, revision: 'r2' });
    expect((await f.library.list(f.handle)).find(item => item.resourceId === ref.resourceId).archived).toBe(true);
    expect(await f.library.getExact(f.handle, ref)).toEqual(before);
    expect((await f.persistence.listRuntimeRoutes(f.handle))[0].generationProfileRef).toEqual(ref);
    await f.library.setArchived(f.handle, ref.resourceType, ref.resourceId, false);
    expect((await f.library.list(f.handle)).find(item => item.resourceId === ref.resourceId).archived).toBe(false);
    expect(await f.library.listRevisions(f.handle, ref.resourceType, ref.resourceId)).toEqual(['r1', 'r2']);
});
test('cleanup obeys the backup gate and rejects unknown Runtime kinds', async () => {
    const f = await fixture(); setReadOnly(true);
    await expect(f.persistence.deleteProfile(f.handle, 'routes', f.routes[0].runtimeRouteId)).rejects.toMatchObject({ code: 'storage_read_only' });
    await expect(f.library.setArchived(f.handle, 'core.generation-profile', f.generation.generationProfileId, true)).rejects.toMatchObject({ code: 'storage_read_only' });
    await expect(f.persistence.deleteProfile(f.handle, 'arbitrary', 'id')).rejects.toThrow();
});

test('role changes cannot invalidate outgoing or incoming fallback references', async () => {
    const f = await fixture();
    const primary = { ...f.routes[0], fallbackRouteRefs: [{ scope: 'player', runtimeRouteId: f.routes[1].runtimeRouteId }] };
    await f.persistence.saveRuntimeRoute(f.handle, primary);
    await expect(f.persistence.saveRuntimeRoute(f.handle, { ...primary, role: 'role.memory' })).rejects.toMatchObject({ code: 'native_runtime_fallback_role' });
    await expect(f.persistence.saveRuntimeRoute(f.handle, { ...f.routes[1], role: 'role.memory' })).rejects.toMatchObject({ code: 'native_runtime_fallback_role' });
    expect((await f.persistence.getRuntimeRoute(f.handle, f.routes[1].runtimeRouteId)).role).toBe('role.narrator');
});
