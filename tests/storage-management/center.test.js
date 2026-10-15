import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { services } from '../native/helpers/session-fixture.js';
import { WorldRepo, PersonaRepo, ProjectStore, createNativeId } from '../../src/native/index.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { nativeRecord } from '../../src/native/repositories/common.js';
import { installAccountQuota } from '../../src/storage/account-quota.js';
import { ResourceCenterService } from '../../src/storage/resource-center.js';
import { importedManagementRecord } from '../../src/storage/migration/management-state.js';

describe.each(CONTRACT_HARNESSES)('persistent resource operations — $name', ({ make }) => {
    let h, center;
    beforeEach(async () => {
        h = await make(); installAccountQuota(h.engine, { directoriesByHandle: () => h.dirs, limit: async () => -1, makeDefault: true });
        const svc = services(h);
        center = new ResourceCenterService({ engine: h.engine, directoriesByHandle: () => h.dirs, quotaLimit: async () => -1,
            sessions: svc.sessionRepo, packages: svc.packageRepo, knowledge: svc.knowledgeRepo, assets: svc.assetStore,
            worlds: new WorldRepo({ engine: h.engine }), personas: new PersonaRepo({ engine: h.engine, assetStore: svc.assetStore }),
            projects: new ProjectStore({ directoriesByHandle: () => h.dirs }), graph: null });
    });
    afterEach(async () => h.cleanup());
    async function world(name) {
        const id = createNativeId('world'), key = { kind: K.world, handle: h.handle, worldId: id };
        await h.engine.withTransaction(h.handle, tx => tx.putResource(key, nativeRecord({ worldId: id, displayName: name, currentRevisionId: null })));
        return { type: 'world', id };
    }
    test('fixed preview survives filter changes, continues independent conflicts, and never repeats success', async () => {
        const one = await world('One'), two = await world('Two');
        const task = await center.preview(h.handle, 'trash', [one, two, two]);
        await world('Added after preview');
        await h.engine.withTransaction(h.handle, tx => tx.putResource({ kind: K.world, handle: h.handle, worldId: one.id }, nativeRecord({ worldId: one.id, displayName: 'Changed', currentRevisionId: null })));
        await center.execute(h.handle, task.id); await center.running.get(h.handle + ':' + task.id);
        const result = await center.task(h.handle, task.id);
        expect(result.status).toBe('partial'); expect(result.items.map(item => item.status)).toEqual(['repreview', 'succeeded']);
        expect(await center.recovery.list(h.handle)).toHaveLength(1);
        await center.execute(h.handle, task.id); expect(await center.recovery.list(h.handle)).toHaveLength(1);
        expect((await center.snapshot(h.handle)).resources.filter(item => item.target?.type === 'world')).toHaveLength(2);
    });
    test('stop takes effect at a complete object boundary and preserves unstarted work', async () => {
        const one = await world('One'), two = await world('Two'), task = await center.preview(h.handle, 'trash', [one, two]);
        let entered, release; const barrier = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
        const trash = center.recovery.trash.bind(center.recovery);
        center.recovery.trash = async (...args) => { entered(); await gate; return trash(...args); };
        await center.execute(h.handle, task.id); await barrier; await center.stop(h.handle, task.id); release(); await center.running.get(h.handle + ':' + task.id);
        const result = await center.task(h.handle, task.id);
        expect(result.status).toBe('stopped'); expect(result.items.map(item => item.status)).toEqual(['succeeded', 'pending']);
        expect(await center.recovery.worlds.get(h.handle, two.id)).not.toBeNull();
    });
    test('storage-wide failure stops later objects and imported historical intent stays paused', async () => {
        const task = await center.preview(h.handle, 'trash', [await world('One'), await world('Two')]);
        center.recovery.trash = async () => { throw new Error('Injected storage unavailable'); };
        await center.execute(h.handle, task.id); await center.running.get(h.handle + ':' + task.id);
        const result = await center.task(h.handle, task.id);
        expect(result.status).toBe('failed'); expect(result.items.map(item => item.status)).toEqual(['failed', 'pending']);
        const imported = importedManagementRecord({ doc: { ...result, status: 'running' } }, h.handle);
        expect(imported.doc.status).toBe('paused-review'); await center.saveTask(h.handle, imported.doc);
        await expect(center.execute(h.handle, task.id)).rejects.toMatchObject({ code: 'storage_task_requires_new_preview' });
    });
});
