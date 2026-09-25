import { describe, test, expect } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { NativeProductService, WorldRepo, ProjectStore } from '../../src/native/index.js';
import { installFixture, services } from './helpers/session-fixture.js';
import { createNativeProductRouter } from '../../src/endpoints/native-product.js';
import { compileNativeKnowledgePlan } from '../../public/scripts/native/knowledge-runtime.js';

describe('editable installed Knowledge originals', () => {
    test('updates real package bytes and live Knowledge while preserving Worlds, progress and portable history', async () => {
        const h = await makeTempFsEngineHarness();
        try {
            const f = await installFixture(h);
            const product = new NativeProductService({ ...f, sessionCore: f.core, worldRepo: new WorldRepo({ engine: h.engine }), projectStore: new ProjectStore({ directoriesByHandle: () => h.dirs }) });
            const original = await f.core.create(h.handle, f.start), id = original.session.sessionId;
            const progressed = await f.core.updateState(h.handle, id, { atri_world_state: { ...original.states.atri_world_state, worlds: { [f.worldId]: { ...original.states.atri_world_state.worlds[f.worldId], state: { hp: 3, location: 'garden' } } } }, atri_knowledge_runtime: { stale: true } });
            const setup = await product.getResourceSetup(h.handle, f.start.packageId);
            await product.saveResourceSetup(h.handle, f.start.packageId, setup);
            const before = await product.getPackageKnowledge(h.handle, f.start.packageId, f.knowledge.knowledgeBase.knowledgeBaseId);
            const input = { packageVersionId: before.packageVersionId, baseRevisionId: before.snapshot.revision.knowledgeRevisionId,
                content: { entries: [{ ...before.snapshot.entries[0], content: 'Changed original' }], metadata: {} } };
            const result = await product.editPackageKnowledge(h.handle, f.start.packageId, f.knowledge.knowledgeBase.knowledgeBaseId, input);
            expect(result.packageVersionId).not.toBe(before.packageVersionId);
            const current = await f.packageInstaller.open(h.handle, f.start.packageId, result.packageVersionId);
            expect(current.manifest.knowledge[0].entries[0].content).toBe('Changed original');
            expect(current.manifest.worlds).toEqual(original.manifest.worlds);
            expect(current.manifest.entryPoints).toEqual(original.manifest.entryPoints);
            expect(current.packageVersion.packageContentHash).not.toBe(original.session.packageContentHash);
            const unchangedArchive = await f.packageInstaller.open(h.handle, f.start.packageId, before.packageVersionId);
            expect(unchangedArchive.manifest.knowledge[0].entries[0].content).toBe('Exact knowledge');
            await expect(product.editPackageKnowledge(h.handle, f.start.packageId, f.knowledge.knowledgeBase.knowledgeBaseId, input)).rejects.toThrow();
            const changed = await f.core.load(h.handle, id);
            expect(changed.manifest.knowledge[0].entries[0].content).toBe('Changed original');
            expect(changed.states.atri_world_state).toEqual(progressed.states.atri_world_state);
            expect(changed.worlds).toEqual(progressed.worlds);
            expect(changed.timeline).toEqual(progressed.timeline);
            expect(changed.knowledge.bindings[0].knowledgeBindingId).toBe(f.binding.knowledgeBindingId);
            expect(changed.states.atri_knowledge_runtime).toBeUndefined();
            expect(JSON.stringify(compileNativeKnowledgePlan(changed))).toContain('Changed original');
            const again = await f.core.load(h.handle, id);
            expect(again.revision.revisionId).toBe(changed.revision.revisionId);
            const historical = await f.core.load(h.handle, id, { revisionId: progressed.revision.revisionId });
            expect(historical.manifest.knowledge[0].entries[0].content).toBe('Exact knowledge');
            const fresh = await product.startWork(h.handle, f.start.packageId);
            expect(fresh.manifest.knowledge[0].entries[0].content).toBe('Changed original');
            const defaults = await product.getResourceSetup(h.handle, f.start.packageId);
            expect(defaults.worldRefs).toEqual(setup.worldRefs);
            expect(defaults.knowledgeRefs).toEqual(setup.knowledgeRefs);
            const sessionSetup = await product.getResourceSetup(h.handle, f.start.packageId, { sessionId: id });
            await product.saveResourceSetup(h.handle, f.start.packageId, sessionSetup, id);
            expect((await f.core.load(h.handle, id)).manifest.knowledge[0].entries[0].content).toBe('Changed original');
            const exported = await f.saveSystem.exportSession(h.handle, id);
            const target = await makeTempFsEngineHarness();
            try {
                const restoredServices = services(target);
                await restoredServices.packageInstaller.install(target.handle, await f.assetStore.readBlob(h.handle, original.session.packageContentHash));
                const imported = await restoredServices.saveSystem.importSave(target.handle, exported.archive);
                const restored = await restoredServices.core.load(target.handle, imported.session.sessionId);
                expect(restored.manifest.knowledge[0].entries[0].content).toBe('Changed original');
                expect(restored.states.atri_world_state).toEqual(changed.states.atri_world_state);
            } finally { await target.cleanup(); }
            const app = express(); app.use(express.json()); app.use((req, res, next) => { if (req.headers['x-test-user']) req.user = { profile: { handle: h.handle } }; next(); });
            app.use(createNativeProductRouter(() => ({ product })));
            const path = `/works/${f.start.packageId}/knowledge/${f.knowledge.knowledgeBase.knowledgeBaseId}`;
            await supertest(app).put(path).send(input).expect(401);
            await supertest(app).put(path).set('x-test-user', 'yes').send(input).expect(409);
            const latest = await supertest(app).get(path).set('x-test-user', 'yes').expect(200);
            const body = { packageVersionId: latest.body.packageVersionId, baseRevisionId: latest.body.snapshot.revision.knowledgeRevisionId, content: { entries: [], metadata: {} } };
            await supertest(app).put(path).set('x-test-user', 'yes').send(body).expect(200);
            expect((await f.core.load(h.handle, id)).manifest.knowledge[0].entries).toEqual([]);
        } finally { await h.cleanup(); }
    });
});
