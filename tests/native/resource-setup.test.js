import { createHash } from 'node:crypto';
import { describe, expect, test } from '@jest/globals';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { NativeProductService, ProjectStore, WorldRepo, createNativeId } from '../../src/native/index.js';
import { installFixture, services, knowledgeSnapshot, publishKnowledge } from './helpers/session-fixture.js';

describe('player World and Knowledge choices', () => {
    test('changes defaults and existing sessions with exact snapshots, concurrency and portable history', async () => {
        const h = await makeTempFsEngineHarness();
        try {
            const f = await installFixture(h);
            const worldRepo = new WorldRepo({ engine: h.engine });
            const product = new NativeProductService({ packageRepo: f.packageRepo, worldRepo, knowledgeRepo: f.knowledgeRepo, sessionRepo: f.sessionRepo, savePointRepo: f.savePointRepo, packageInstaller: f.packageInstaller, saveSystem: f.saveSystem, sessionCore: f.core, projectStore: new ProjectStore({ directoriesByHandle: () => h.dirs }) });
            const original = await product.startWork(h.handle, f.start.packageId);
            const world = await product.createWorld(h.handle, { displayName: 'Personal World' });
            const assetId = createNativeId('asset'), bytes = Buffer.from('World attachment');
            await f.assetStore.put(h.handle, { assetId, contentHash: createHash('sha256').update(bytes).digest('hex'), size: bytes.length, mediaType: 'text/plain' }, bytes);
            const revision = await product.commitWorldRevision(h.handle, world.worldId, { baseRevisionId: null, content: { schema: {}, baseline: { location: 'garden' }, knowledgeBindingIds: [], assetIds: [assetId], metadata: {} } });
            const knowledge = knowledgeSnapshot('Personal lore');
            await publishKnowledge(h, f.knowledgeRepo, knowledge);
            const setup = await product.getResourceSetup(h.handle, f.start.packageId);
            const input = { ...setup, worldRefs: [{ scope: 'library', resourceId: world.worldId, revision: revision.worldRevisionId }], primaryWorldId: world.worldId, knowledgeRefs: [{ scope: 'library', resourceId: knowledge.knowledgeBase.knowledgeBaseId, revision: knowledge.revision.knowledgeRevisionId }] };
            await product.saveResourceSetup(h.handle, f.start.packageId, input);
            await expect(product.saveResourceSetup(h.handle, f.start.packageId, input)).rejects.toThrow();
            const created = await product.startWork(h.handle, f.start.packageId);
            expect(created.worlds[0].world.worldId).toBe(world.worldId);
            expect(created.knowledge.bindings).toHaveLength(1);
            await expect(f.core.updateState(h.handle, created.session.sessionId, { atri_world_selection: { schemaVersion: 1, worlds: [], primaryWorldId: null } })).rejects.toThrow('Reserved');
            expect(created.knowledge.bindings[0].source.kind).toBe('session');
            expect((await f.core.load(h.handle, original.session.sessionId)).worlds).toEqual(original.worlds);
            const current = await product.getResourceSetup(h.handle, f.start.packageId, { sessionId: original.session.sessionId });
            const changed = await product.saveResourceSetup(h.handle, f.start.packageId, { ...input, expectedRevisionId: current.expectedRevisionId }, original.session.sessionId);
            expect(changed.states.atri_world_state.worlds[world.worldId].state).toEqual({ location: 'garden' });
            expect(changed.timeline).toEqual(original.timeline);
            await expect(product.saveResourceSetup(h.handle, f.start.packageId, { ...input, expectedRevisionId: current.expectedRevisionId }, original.session.sessionId)).rejects.toThrow();
            expect((await f.core.load(h.handle, original.session.sessionId, { revisionId: original.revision.revisionId })).worlds).toEqual(original.worlds);
            const progressed = await f.core.updateState(h.handle, changed.session.sessionId, { atri_world_state: { ...changed.states.atri_world_state, worlds: { [world.worldId]: { worldRevisionId: revision.worldRevisionId, state: { location: 'mountain' } } } }, atri_knowledge_runtime: { effects: { old: true } } });
            const unchanged = await product.getResourceSetup(h.handle, f.start.packageId, { sessionId: changed.session.sessionId });
            const retained = await product.saveResourceSetup(h.handle, f.start.packageId, { ...unchanged, expectedRevisionId: progressed.revision.revisionId }, changed.session.sessionId);
            expect(retained.states.atri_world_state.worlds[world.worldId].state.location).toBe('mountain');
            expect(retained.states.atri_knowledge_runtime).toBeUndefined();
            const exported = await f.saveSystem.exportSession(h.handle, original.session.sessionId);
            const fresh = await makeTempFsEngineHarness();
            try {
                const target = services(fresh);
                const packageBytes = await f.assetStore.readBlob(h.handle, original.session.packageContentHash);
                await target.packageInstaller.install(fresh.handle, packageBytes);
                const imported = await target.saveSystem.importSave(fresh.handle, exported.archive);
                const restored = await target.core.load(fresh.handle, imported.session.sessionId);
                expect(restored.worlds[0].world.worldId).toBe(world.worldId);
                expect((await target.assetStore.read(fresh.handle, assetId)).bytes).toEqual(bytes);
                await expect(target.assetStore.deleteRef(fresh.handle, assetId)).rejects.toMatchObject({ code: 'native_asset_ref_referenced' });
                expect(restored.knowledge.snapshots[0].snapshot.entries[0].content).toBe('Personal lore');
            } finally { await fresh.cleanup(); }
        } finally { await h.cleanup(); }
    });
});
