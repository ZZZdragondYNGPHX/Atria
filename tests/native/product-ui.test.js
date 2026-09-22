import express from 'express';
import request from 'supertest';
import { describe, expect, test } from '@jest/globals';

import { createNativeSessionRouter } from '../../src/endpoints/native-session.js';
import {
    NativeProductUiService,
    ProjectStore,
    WorldRepo,
    createNativeId,
} from '../../src/native/index.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture } from './helpers/session-fixture.js';

function baseProject(packageId) {
    return {
        format: 'atria-project-source',
        schemaVersion: 1,
        project: {
            projectId: createNativeId('project'),
            packageId,
            displayName: 'N9 Studio Project',
            createdAt: 10,
            updatedAt: 10,
        },
        package: {
            name: 'N9 Work',
            version: '1.0.0',
            actors: [],
            entryPoints: [{
                entryPointId: createNativeId('entryPoint'),
                displayName: 'Main',
                actorIds: [],
                worldIds: [],
                knowledgeBindingIds: [],
            }],
            capabilities: ['narrative'],
            permissions: [],
        },
        worlds: [],
        knowledge: [],
        knowledgeBindings: [],
        dependencies: { worlds: [], knowledge: [], knowledgeBindings: [] },
        assetFiles: [],
    };
}

function makeProduct(h, f) {
    const worldRepo = new WorldRepo({ engine: h.engine });
    const projectStore = new ProjectStore({ directoriesByHandle: () => h.dirs });
    return {
        product: new NativeProductUiService({
            packageRepo: f.packageRepo,
            worldRepo,
            knowledgeRepo: f.knowledgeRepo,
            sessionRepo: f.sessionRepo,
            savePointRepo: f.savePointRepo,
            packageInstaller: f.packageInstaller,
            saveSystem: f.saveSystem,
            sessionCore: f.core,
            projectStore,
        }),
        worldRepo,
        projectStore,
    };
}

describe('N9 Native Product UI service', () => {
    test('Library/Studio/Session surfaces read and mutate only Native authorities', async () => {
        const h = await makeTempFsEngineHarness();
        try {
            const f = await installFixture(h);
            const { product, worldRepo, projectStore } = makeProduct(h, f);

            const initial = await product.librarySnapshot(h.handle);
            expect(initial.works).toHaveLength(1);
            expect(initial.works[0].package.packageId).toBe(f.manifest.packageId);
            expect(initial.works[0].manifest.entryPoints[0].entryPointId).toBe(f.entryPointId);
            expect(initial.worlds).toEqual([]);
            expect(initial.knowledgeBases).toEqual([]);

            const world = await product.createWorld(h.handle, { displayName: 'Library World' });
            const worldRevisionId = createNativeId('worldRevision');
            await worldRepo.commitRevision(h.handle, {
                worldId: world.worldId,
                worldRevisionId,
                baseline: { region: 'harbor' },
                knowledgeBindingIds: [],
                assetIds: [],
                metadata: {},
                createdAt: 20,
            });
            const worldDetail = await product.getWorld(h.handle, world.worldId);
            expect(worldDetail.currentRevision.worldRevisionId).toBe(worldRevisionId);
            expect(worldDetail.revisions).toHaveLength(1);

            const knowledgeBase = await product.createKnowledgeBase(h.handle, { displayName: 'Library Knowledge' });
            const knowledgeRevisionId = createNativeId('knowledgeRevision');
            const knowledgeEntryId = createNativeId('knowledgeEntry');
            await f.knowledgeRepo.commitRevision(h.handle, {
                knowledgeBaseId: knowledgeBase.knowledgeBaseId,
                knowledgeRevisionId,
                entryIds: [knowledgeEntryId],
                metadata: {},
                createdAt: 21,
            }, [{
                knowledgeEntryId,
                content: 'Pinned N9 knowledge',
                metadata: {},
            }]);
            const knowledgeDetail = await product.getKnowledgeBase(h.handle, knowledgeBase.knowledgeBaseId);
            expect(knowledgeDetail.currentRevision.entries[0].content).toBe('Pinned N9 knowledge');

            const project = baseProject(f.manifest.packageId);
            await projectStore.create(h.handle, project);
            const updated = await product.updateProjectDependencies(h.handle, project.project.projectId, {
                worlds: [{ worldId: world.worldId, worldRevisionId }],
                knowledge: [{
                    knowledgeBaseId: knowledgeBase.knowledgeBaseId,
                    knowledgeRevisionId,
                }],
                knowledgeBindings: [],
            });
            expect(updated.dependencies.worlds[0].revision.worldRevisionId).toBe(worldRevisionId);
            expect(updated.dependencies.knowledge[0].revision.knowledgeRevisionId).toBe(knowledgeRevisionId);
            await expect(product.deleteWorld(h.handle, world.worldId))
                .rejects.toMatchObject({ code: 'native_world_project_referenced' });
            await expect(product.deleteKnowledgeBase(h.handle, knowledgeBase.knowledgeBaseId))
                .rejects.toMatchObject({ code: 'native_knowledge_project_referenced' });

            const session = await product.startSession(h.handle, f.start);
            const quick = await product.saveSession(h.handle, session.session.sessionId, { kind: 'quick' });
            const advanced = await f.core.applyTimelineCommands(
                h.handle,
                session.session.sessionId,
                [{ type: 'append', draft: { role: 'user', content: 'Advance after save' } }],
                { expectedRevisionId: session.revision.revisionId },
            );
            const restored = await product.loadSave(
                h.handle,
                session.session.sessionId,
                quick.saveId,
                advanced.revision.revisionId,
            );
            expect(restored.revision.branchId).not.toBe(advanced.revision.branchId);
            expect(restored.timeline.some(item => item.content === 'Advance after save')).toBe(false);

            const sessionDetail = await product.getSession(h.handle, session.session.sessionId);
            expect(sessionDetail.dependency.status).toBe('ready');
            expect(sessionDetail.savePoints.map(item => item.saveId)).toContain(quick.saveId);
            expect(sessionDetail.snapshot.session.sessionId).toBe(session.session.sessionId);

            await expect(product.deletePackage(h.handle, f.manifest.packageId))
                .rejects.toMatchObject({ code: 'native_package_referenced' });
        } finally {
            await h.cleanup();
        }
    });

    test('My Games reports missing Package dependency without falling back to legacy files', async () => {
        const h = await makeTempFsEngineHarness();
        try {
            const f = await installFixture(h);
            const { product } = makeProduct(h, f);
            const sessionId = createNativeId('session');
            await f.sessionRepo.create(h.handle, {
                sessionId,
                packageId: createNativeId('package'),
                packageVersionId: createNativeId('packageVersion'),
                packageVersion: '9.9.9',
                packageContentHash: 'a'.repeat(64),
                entryPointId: createNativeId('entryPoint'),
                activeBranchId: createNativeId('branch'),
                headRevisionId: null,
                createdAt: 30,
                updatedAt: 30,
            });

            const detail = await product.getSession(h.handle, sessionId);
            expect(detail.dependency.status).toBe('missing');
            expect(detail.snapshot).toBeNull();
        } finally {
            await h.cleanup();
        }
    });
});

describe('N9 authenticated Product UI HTTP boundary', () => {
    test('Library, start, Save and detail routes compose the same Native authorities', async () => {
        const h = await makeTempFsEngineHarness();
        try {
            const f = await installFixture(h);
            const { product } = makeProduct(h, f);
            const app = express();
            app.use(express.json({ limit: '32mb' }));
            app.use((req, res, next) => {
                req.user = { profile: { handle: h.handle } };
                next();
            });
            app.use(createNativeSessionRouter(() => ({
                core: f.core,
                assets: f.assetStore,
                sessionRepo: f.sessionRepo,
                product,
            })));

            const library = await request(app).get('/product/library');
            expect(library.status).toBe(200);
            expect(library.body.works[0].package.packageId).toBe(f.manifest.packageId);

            const start = await request(app).post('/product/session/start').send(f.start);
            expect(start.status).toBe(200);
            const sessionId = start.body.session.sessionId;

            const saved = await request(app).post('/product/save').send({
                sessionId,
                kind: 'manual',
                displayName: 'N9 slot',
            });
            expect(saved.status).toBe(200);
            expect(saved.body.kind).toBe('manual');

            const detail = await request(app).post('/product/session/detail').send({ sessionId });
            expect(detail.status).toBe(200);
            expect(detail.body.dependency.status).toBe('ready');
            expect(detail.body.savePoints[0].displayName).toBe('N9 slot');
        } finally {
            await h.cleanup();
        }
    });
});
