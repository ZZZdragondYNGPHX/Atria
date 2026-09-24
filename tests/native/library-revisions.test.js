import { test, expect } from '@jest/globals';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { NativeProductService, WorldRepo, KnowledgeRepo, createNativeId } from '../../src/native/index.js';

test.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s Library revisions are immutable and compare the editing base inside the transaction', async (_name, make) => {
    const h = await make();
    try {
        const worldRepo = new WorldRepo({ engine: h.engine }); const knowledgeRepo = new KnowledgeRepo({ engine: h.engine });
        const options = { worldRepo, knowledgeRepo, packageRepo: {}, sessionRepo: {}, savePointRepo: {}, packageInstaller: {}, saveSystem: {}, sessionCore: {}, projectStore: {} };
        const product = new NativeProductService(options);
        const other = new NativeProductService({ ...options, worldRepo: new WorldRepo({ engine: h.engine }), knowledgeRepo: new KnowledgeRepo({ engine: h.engine }) });
        const world = await product.createWorld(h.handle, { displayName: 'Harbor' });
        const first = await product.commitWorldRevision(h.handle, world.worldId, { baseRevisionId: null, content: { baseline: { weather: 'rain' } } });
        const second = await product.commitWorldRevision(h.handle, world.worldId, { baseRevisionId: first.worldRevisionId, content: { baseline: { weather: 'sun' } } });
        expect(await worldRepo.getRevision(h.handle, world.worldId, first.worldRevisionId)).toEqual(first);
        await expect(product.commitWorldRevision(h.handle, world.worldId, { baseRevisionId: first.worldRevisionId, content: {} })).rejects.toMatchObject({ code: 'native_write_conflict' });
        const concurrent = await Promise.allSettled([1, 2].map(i => (i === 1 ? product : other).commitWorldRevision(h.handle, world.worldId, { baseRevisionId: second.worldRevisionId, content: { baseline: { i } } })));
        expect(concurrent.filter(item => item.status === 'fulfilled')).toHaveLength(1);
        expect((await product.getWorld(h.handle, world.worldId)).revisions).toHaveLength(3);
        const base = await product.createKnowledgeBase(h.handle, { displayName: 'Canon' });
        const entry = { knowledgeEntryId: createNativeId('knowledgeEntry'), content: 'Old exact content' };
        const k1 = await product.commitKnowledgeRevision(h.handle, base.knowledgeBaseId, { baseRevisionId: null, content: { entries: [entry] } });
        const binding = await knowledgeRepo.saveBinding(h.handle, { knowledgeBindingId: createNativeId('knowledgeBinding'), source: { kind: 'library', knowledgeBaseId: base.knowledgeBaseId, knowledgeRevisionId: k1.knowledgeRevisionId }, enabled: true, mode: 'augment' });
        const k2 = await product.commitKnowledgeRevision(h.handle, base.knowledgeBaseId, { baseRevisionId: k1.knowledgeRevisionId, content: { entries: [{ ...entry, content: 'New content' }] } });
        expect(k2.knowledgeRevisionId).not.toBe(k1.knowledgeRevisionId);
        expect((await product.getKnowledgeBase(h.handle, base.knowledgeBaseId, { revisionId: k1.knowledgeRevisionId })).entries[0].content).toBe(entry.content);
        expect((await knowledgeRepo.getBinding(h.handle, binding.knowledgeBindingId)).source.knowledgeRevisionId).toBe(k1.knowledgeRevisionId);
        await expect(product.commitKnowledgeRevision(h.handle, base.knowledgeBaseId, { baseRevisionId: k2.knowledgeRevisionId, content: { entries: [{ ...entry, delivery: { position: 'unsupported' } }] } })).rejects.toThrow('delivery.position');
        expect((await product.getKnowledgeBase(h.handle, base.knowledgeBaseId)).revisions).toHaveLength(2);
        const writes = await Promise.allSettled([product, other].map(service => service.commitKnowledgeRevision(h.handle, base.knowledgeBaseId, { baseRevisionId: k2.knowledgeRevisionId, content: { entries: [entry] } })));
        expect(writes.filter(item => item.status === 'fulfilled')).toHaveLength(1);
        expect((await product.getKnowledgeBase(h.handle, base.knowledgeBaseId)).revisions).toHaveLength(3);
        await expect(product.commitWorldRevision(h.handle, world.worldId, { content: {} })).rejects.toThrow('baseRevisionId');
        await expect(product.commitWorldRevision(h.handle, world.worldId, { baseRevisionId: null, content: { worldRevisionId: first.worldRevisionId } })).rejects.toMatchObject({ code: 'native_product_invalid_request' });
        await expect(product.commitWorldRevision(h.handle, createNativeId('world'), { baseRevisionId: null, content: {} })).rejects.toMatchObject({ name: 'NotFoundError' });
    } finally { await h.cleanup(); }
});
