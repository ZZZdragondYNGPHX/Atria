import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { services } from '../native/helpers/session-fixture.js';
import { WorldRepo, PersonaRepo, ProjectStore, createNativeId } from '../../src/native/index.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { nativeRecord, hashNativeDocument } from '../../src/native/repositories/common.js';
import { RuntimeCheckpointStore, runtimeCheckpointLimits } from '../../src/native/model-prompt-runtime/runtime-checkpoint-store.js';
import { AgentExperienceRepository } from '../../src/native/agent-intelligence/experience-repository.js';
import { installAccountQuota } from '../../src/storage/account-quota.js';
import { ResourceCenterService } from '../../src/storage/resource-center.js';
import { importedManagementRecord } from '../../src/storage/migration/management-state.js';
import { REDUCTION_JOURNAL_BYTES } from '../../src/storage/resource-catalog.js';

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
    afterEach(async () => h?.cleanup());
    async function world(name) {
        const id = createNativeId('world'), key = { kind: K.world, handle: h.handle, worldId: id };
        await h.engine.withTransaction(h.handle, tx => tx.putResource(key, nativeRecord({ worldId: id, displayName: name, currentRevisionId: null })));
        return { type: 'world', id };
    }
    test('safe cleanup admits only authenticated expired Runtime checkpoints and rechecks the fixed record', async () => {
        const binding = { schemaVersion: 1, ownerFingerprint: hashNativeDocument(h.handle), pathFingerprint: hashNativeDocument('path'), executionScope: { kind: 'task', projectId: 'project', taskId: 'task' }, continuity: 'task' };
        const state = { schemaVersion: 1, checkpointId: 'a'.repeat(64), bindingFingerprint: hashNativeDocument(binding), text: '', calls: [] };
        const entry = { binding, bindingFingerprint: state.bindingFingerprint, sequence: [], content: [], text: '', calls: [] };
        const expired = new RuntimeCheckpointStore({ engine: h.engine, handle: h.handle, now: () => Date.now() - runtimeCheckpointLimits.ttlMs - 1000 });
        await expired.save(state, entry);
        const live = new RuntimeCheckpointStore({ engine: h.engine, handle: h.handle });
        // save() itself prunes expired rows. Seed a second already-persisted
        // valid row without invoking that independent cleanup path.
        const source = await h.engine.withTransaction(h.handle, tx => tx.getResource(expired.key(state.checkpointId)));
        const createdAt = Date.now(), record = nativeRecord({ ...source.doc, checkpointId: 'b'.repeat(64), createdAt, expiresAt: createdAt + runtimeCheckpointLimits.ttlMs });
        expect(live.valid(record)).toBe(true);
        await h.engine.withTransaction(h.handle, tx => tx.putResource(live.key(record.doc.checkpointId), record));
        const snapshot = await center.snapshot(h.handle); expect(snapshot.suggestions).toHaveLength(1);
        installAccountQuota(h.engine, { directoriesByHandle: () => h.dirs, limit: async () => 0, makeDefault: true });
        const tooLarge = { protocol: 'atria.storage-center.v1', type: 'task', scope: 'server', handle: h.handle, id: 'oversized-preview',
            action: 'clean', status: 'preview', items: [{ status: 'pending', reason: 'x'.repeat(REDUCTION_JOURNAL_BYTES) }] };
        await expect(center.saveTask(h.handle, tooLarge)).rejects.toMatchObject({ code: 'storage_quota_exceeded' });
        const preview = await center.preview(h.handle, 'clean', snapshot.suggestions.map(item => item.target));
        expect(preview.items[0].status).toBe('pending');
        const result = await center.run(h.handle, preview.id); expect(result.items[0].status).toBe('succeeded');
        expect(await h.engine.withTransaction(h.handle, tx => tx.getResource(live.key(state.checkpointId)))).toBeNull();
        expect(await h.engine.withTransaction(h.handle, tx => tx.getResource(live.key('b'.repeat(64))))).not.toBeNull();
    });
    test('validated project-owned experience is grouped with its project and fixed selections deduplicate owned children', async () => {
        const projectId = createNativeId('project'), repo = new AgentExperienceRepository({ engine: h.engine });
        const doc = await repo.mutate(h.handle, { domain: 'project', projectId }, 'authoring', null, value => { value.retentionDays = 31; });
        const { measureAccount } = await import('../../src/storage/resource-accounting.js');
        const snapshot = await measureAccount({ engine: h.engine, handle: h.handle, directories: h.dirs });
        expect(snapshot.units.find(item => item.key?.scopeId === doc.scopeId)).toMatchObject({ category: 'projects', owner: { type: 'project', id: projectId } });
        const parent = { type: 'project', id: projectId }, child = { type: 'experience', id: doc.scopeId };
        const inspect = center.recovery.inspect.bind(center.recovery);
        center.recovery.inspect = async (handle, target) => target.type === 'project' ? { version: 'parent', bytes: 10, allowed: true, ownedTargets: [child] } : inspect(handle, target);
        const preview = await center.preview(h.handle, 'trash', [child, parent, parent]);
        expect(preview.items.map(item => item.target)).toEqual([parent]); expect(preview.deduplicatedCount).toBe(2);
    });
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
    test('a stop arriving between progress read and commit is sticky and cannot overwrite completed items', async () => {
        const task = await center.preview(h.handle, 'trash', [await world('One'), await world('Two')]);
        const save = center.saveTask.bind(center); let injected = false;
        center.saveTask = async (handle, doc) => {
            if (!injected && doc.status === 'running' && doc.items[0].status === 'succeeded') { injected = true; await center.stop(handle, doc.id); }
            return save(handle, doc);
        };
        const result = await center.run(h.handle, task.id);
        expect(result.status).toBe('stopped'); expect(result.stopRequested).toBe(true);
        expect(result.items.map(item => item.status)).toEqual(['succeeded', 'pending']);
    });
});
