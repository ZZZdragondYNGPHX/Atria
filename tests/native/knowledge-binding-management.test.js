import { test, expect } from '@jest/globals';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { NativeProductService, WorldRepo, KnowledgeRepo, createNativeId } from '../../src/native/index.js';

test.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s binding management pins revisions, protects references and rejects stale writes', async (_name, make) => {
    const h = await make();
    try {
        const projects = [];
        const knowledgeRepo = new KnowledgeRepo({ engine: h.engine });
        const product = new NativeProductService({ worldRepo: new WorldRepo({ engine: h.engine }), knowledgeRepo, packageRepo: {}, sessionRepo: {}, savePointRepo: {}, packageInstaller: {}, saveSystem: {}, sessionCore: {}, projectStore: { list: async () => projects.map(item => item.project), get: async (_handle, id) => projects.find(item => item.project.projectId === id) } });
        const base = await product.createKnowledgeBase(h.handle, { displayName: 'Canon' });
        const revision = await product.commitKnowledgeRevision(h.handle, base.knowledgeBaseId, { baseRevisionId: null, content: { entries: [] } });
        const id = createNativeId('knowledgeBinding');
        const binding = { knowledgeBindingId: id, source: { kind: 'library', knowledgeBaseId: base.knowledgeBaseId, knowledgeRevisionId: revision.knowledgeRevisionId }, enabled: true, mode: 'augment', target: { kind: 'actor', id: 'navigator' }, visibility: ['actor'], priority: -3 };
        const first = await product.saveKnowledgeBinding(h.handle, id, { binding, expectedIntegrity: null });
        expect(first.binding.source).toEqual(binding.source);
        await expect(product.saveKnowledgeBinding(h.handle, id, { binding })).rejects.toMatchObject({ code: 'native_product_invalid_request' });
        await expect(product.saveKnowledgeBinding(h.handle, id, { binding, expectedIntegrity: null })).rejects.toMatchObject({ code: 'native_write_conflict' });
        const updated = await product.saveKnowledgeBinding(h.handle, id, { binding: { ...binding, mode: 'override' }, expectedIntegrity: first.integrity });
        await expect(product.deleteKnowledgeBinding(h.handle, id, { expectedIntegrity: first.integrity })).rejects.toMatchObject({ code: 'native_write_conflict' });
        projects.push({ project: { projectId: 'project', displayName: 'Adventure' }, dependencies: { knowledgeBindings: [id] } });
        expect((await product.getKnowledgeBinding(h.handle, id)).references).toContainEqual({ kind: 'studio-project', projectId: 'project', displayName: 'Adventure' });
        await expect(product.deleteKnowledgeBinding(h.handle, id, { expectedIntegrity: updated.integrity })).rejects.toMatchObject({ code: 'native_knowledge_binding_referenced' });
        projects.length = 0;
        const world = await product.createWorld(h.handle, { displayName: 'Harbor' });
        const attached = await product.attachKnowledgeBinding(h.handle, id, world.worldId, { baseRevisionId: null, attached: true });
        expect(attached.knowledgeBindingIds).toEqual([id]);
        const detached = await product.attachKnowledgeBinding(h.handle, id, world.worldId, { baseRevisionId: attached.worldRevisionId, attached: false });
        expect(detached.knowledgeBindingIds).toEqual([]);
        expect((await product.getKnowledgeBinding(h.handle, id)).references[0]).toMatchObject({ displayName: 'Harbor', current: false, worldRevisionId: attached.worldRevisionId });
        await expect(product.deleteKnowledgeBinding(h.handle, id, { expectedIntegrity: updated.integrity })).rejects.toMatchObject({ code: 'native_knowledge_binding_referenced' });
        await expect(product.attachKnowledgeBinding(h.handle, id, world.worldId, { baseRevisionId: attached.worldRevisionId, attached: true })).rejects.toMatchObject({ code: 'native_write_conflict' });
        const disposable = { ...binding, knowledgeBindingId: createNativeId('knowledgeBinding') };
        const saved = await product.saveKnowledgeBinding(h.handle, disposable.knowledgeBindingId, { binding: disposable, expectedIntegrity: null });
        expect(await product.deleteKnowledgeBinding(h.handle, disposable.knowledgeBindingId, { expectedIntegrity: saved.integrity })).toBe(true);
        const race = { ...binding, knowledgeBindingId: createNativeId('knowledgeBinding') };
        const raced = await product.saveKnowledgeBinding(h.handle, race.knowledgeBindingId, { binding: race, expectedIntegrity: null });
        const writes = await Promise.allSettled([
            product.attachKnowledgeBinding(h.handle, race.knowledgeBindingId, world.worldId, { baseRevisionId: detached.worldRevisionId, attached: true }),
            product.deleteKnowledgeBinding(h.handle, race.knowledgeBindingId, { expectedIntegrity: raced.integrity }),
        ]);
        expect(writes.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    } finally { await h.cleanup(); }
});
