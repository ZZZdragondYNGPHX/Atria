import { test, expect } from '@jest/globals';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { NativeProductService, WorldRepo, KnowledgeRepo, createNativeId } from '../../src/native/index.js';

test.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s historical forks and head selection preserve exact originals and remap Knowledge relations', async (_name, make) => {
    const h = await make();
    try {
        const worldRepo = new WorldRepo({ engine: h.engine }); const knowledgeRepo = new KnowledgeRepo({ engine: h.engine });
        const product = new NativeProductService({ worldRepo, knowledgeRepo, packageRepo: {}, sessionRepo: {}, savePointRepo: {}, packageInstaller: {}, saveSystem: {}, sessionCore: {}, projectStore: {} });
        const world = await product.createWorld(h.handle, { displayName: 'Harbor' });
        const first = await product.commitWorldRevision(h.handle, world.worldId, { baseRevisionId: null, content: { baseline: { weather: 'rain' } } });
        const second = await product.commitWorldRevision(h.handle, world.worldId, { baseRevisionId: first.worldRevisionId, content: { baseline: { weather: 'sun' } } });
        const input = { revisionId: first.worldRevisionId, displayName: 'Independent harbor', forkResourceId: createNativeId('world') };
        const fork = await product.forkLibraryRevision(h.handle, 'world', world.worldId, input);
        expect(fork.baseline).toEqual({ weather: 'rain' }); expect(fork.worldId).not.toBe(world.worldId);
        expect(await product.forkLibraryRevision(h.handle, 'world', world.worldId, input)).toEqual(fork);
        expect(await worldRepo.list(h.handle)).toHaveLength(2);
        await product.promoteLibraryRevision(h.handle, 'world', world.worldId, { revisionId: first.worldRevisionId, baseRevisionId: second.worldRevisionId });
        await expect(product.promoteLibraryRevision(h.handle, 'world', world.worldId, { revisionId: second.worldRevisionId, baseRevisionId: second.worldRevisionId })).rejects.toMatchObject({ code: 'native_write_conflict' });
        expect(await worldRepo.getRevision(h.handle, world.worldId, second.worldRevisionId)).toEqual(second);
        await expect(worldRepo.deleteRevision(h.handle, world.worldId, first.worldRevisionId)).rejects.toMatchObject({ code: 'native_world_revision_referenced' });
        const base = await product.createKnowledgeBase(h.handle, { displayName: 'Canon' });
        await expect(product.getKnowledgeBase(h.handle, base.knowledgeBaseId, { revisionId: createNativeId('knowledgeRevision') })).rejects.toMatchObject({ name: 'NotFoundError' });
        const a = createNativeId('knowledgeEntry'), b = createNativeId('knowledgeEntry');
        const revision = await product.commitKnowledgeRevision(h.handle, base.knowledgeBaseId, { baseRevisionId: null, content: { entries: [{ knowledgeEntryId: a, content: 'First' }, { knowledgeEntryId: b, content: 'Second', relations: { requiredEntryIds: [a], relatedEntryIds: [a] } }] } });
        const newer = await product.commitKnowledgeRevision(h.handle, base.knowledgeBaseId, { baseRevisionId: revision.knowledgeRevisionId, content: { entries: [] } });
        const binding = await knowledgeRepo.saveBinding(h.handle, { knowledgeBindingId: createNativeId('knowledgeBinding'), source: { kind: 'library', knowledgeBaseId: base.knowledgeBaseId, knowledgeRevisionId: newer.knowledgeRevisionId }, mode: 'augment', enabled: true });
        const derived = await product.forkLibraryRevision(h.handle, 'knowledge', base.knowledgeBaseId, { revisionId: revision.knowledgeRevisionId, displayName: 'Forked canon', forkResourceId: createNativeId('knowledgeBase') });
        const entries = await knowledgeRepo.listEntries(h.handle, derived.knowledgeBaseId, derived.knowledgeRevisionId);
        expect(entries.map(item => item.content)).toEqual(['First', 'Second']); expect(entries[0].knowledgeEntryId).not.toBe(a);
        expect(entries[1].relations).toEqual({ requiredEntryIds: [entries[0].knowledgeEntryId], relatedEntryIds: [entries[0].knowledgeEntryId] });
        await product.promoteLibraryRevision(h.handle, 'knowledge', base.knowledgeBaseId, { revisionId: revision.knowledgeRevisionId, baseRevisionId: newer.knowledgeRevisionId });
        expect((await knowledgeRepo.getBinding(h.handle, binding.knowledgeBindingId)).source.knowledgeRevisionId).toBe(newer.knowledgeRevisionId);
        expect((await knowledgeRepo.listEntries(h.handle, base.knowledgeBaseId, revision.knowledgeRevisionId))[0].knowledgeEntryId).toBe(a);
        await expect(product.forkLibraryRevision(h.handle, 'world', world.worldId, { ...input, revisionId: createNativeId('worldRevision'), forkResourceId: createNativeId('world') })).rejects.toMatchObject({ name: 'NotFoundError' });
        expect(await worldRepo.list(h.handle)).toHaveLength(2);
        await expect(worldRepo.commitRevision(h.handle, { ...first, worldId: createNativeId('world'), worldRevisionId: createNativeId('worldRevision') }, { createRoot: { ...world, currentRevisionId: null } })).rejects.toThrow('Fork root');
        expect(await worldRepo.list(h.handle)).toHaveLength(2);
    } finally { await h.cleanup(); }
});
