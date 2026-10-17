import { CONTRACT_HARNESSES } from '../harness/contract-harness.js';
import { SettingsRepo } from '../../../src/storage/repositories/settings-repo.js';
import { NotFoundError } from '../../../src/storage/errors.js';

describe.each(CONTRACT_HARNESSES)('SettingsRepo on $name', ({ make }) => {
    let h, repo;
    beforeEach(async () => {
        h = await make();
        repo = new SettingsRepo({ engine: h.engine });
    });
    afterEach(() => h.cleanup());

    test('get returns null when no settings file', async () => {
        expect(await repo.get(h.handle)).toBeNull();
    });

    test('save writes whole doc; get reads it back', async () => {
        await repo.save(h.handle, { user_avatar: 'a.png', power_user: { x: 1 } });
        expect(await repo.get(h.handle)).toEqual({ user_avatar: 'a.png', power_user: { x: 1 } });
    });

    test('save overwrites existing doc', async () => {
        await repo.save(h.handle, { a: 1 });
        await repo.save(h.handle, { b: 2 });
        expect(await repo.get(h.handle)).toEqual({ b: 2 });
    });

    test('patch applies json-patch ops and returns new doc', async () => {
        await repo.save(h.handle, { a: 1, b: { c: 2 } });
        const next = await repo.patch(h.handle, [
            { op: 'replace', path: '/a', value: 9 },
            { op: 'add', path: '/b/d', value: 3 },
        ]);
        expect(next).toEqual({ a: 9, b: { c: 2, d: 3 } });
        expect(await repo.get(h.handle)).toEqual({ a: 9, b: { c: 2, d: 3 } });
    });

    test('retired settings are neither reactivated nor allowed to overwrite current settings', async () => {
        const current = { power_user: { font: 'user choice' }, atri_capabilities: { memory_graph: { enabled: true } } };
        await repo.save(h.handle, current);
        await expect(repo.save(h.handle, { ...current, atri_capabilities: { ...current.atri_capabilities, orchestrator: { mode: 'director' } } }))
            .rejects.toMatchObject({ code: 'native_orchestration_legacy_unsupported' });
        await expect(repo.patch(h.handle, [{ op: 'add', path: '/atri_capabilities/orchestrator', value: { mode: 'loop' } }]))
            .rejects.toMatchObject({ code: 'native_orchestration_legacy_unsupported' });
        expect(await repo.get(h.handle)).toEqual(current);
    });
    test('an inert retired subtree is hidden without deleting stored history or other settings', async () => {
        const stored = { user_avatar: 'keep.png', atri_capabilities: { orchestrator: { mode: 'director', agentWorkspace: { private: 'old' } }, memory_graph: { enabled: true } } };
        await h.engine.withTransaction(h.handle, tx => tx.putResource({ kind: 'settings', handle: h.handle }, { doc: stored }));
        expect(await repo.get(h.handle)).toEqual({ user_avatar: 'keep.png', atri_capabilities: { memory_graph: { enabled: true } } });
        expect(await h.engine.withTransaction(h.handle, tx => tx.getResource({ kind: 'settings', handle: h.handle }))).toEqual(stored);
        await repo.patch(h.handle, [{ op: 'replace', path: '/user_avatar', value: 'new.png' }]);
        expect(await repo.get(h.handle)).toEqual({ user_avatar: 'new.png', atri_capabilities: { memory_graph: { enabled: true } } });
    });
    test('patch throws when test op fails (signals 409 at endpoint)', async () => {
        await repo.save(h.handle, { a: 1 });
        await expect(repo.patch(h.handle, [{ op: 'test', path: '/a', value: 99 }]))
            .rejects.toThrow(/json patch test failed/);
    });

    test('patch on missing settings throws NotFoundError', async () => {
        await expect(repo.patch(h.handle, [{ op: 'replace', path: '/a', value: 1 }]))
            .rejects.toBeInstanceOf(NotFoundError);
    });
});
