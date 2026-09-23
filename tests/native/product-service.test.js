import { describe, expect, test } from '@jest/globals';

import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import {
    NativeProductService,
    ProjectStore,
    WorldRepo,
    buildAtriaPackageContainer,
    createNativeId,
} from '../../src/native/index.js';
import { installFixture } from './helpers/session-fixture.js';

function projectSource({ packageId, worldId, worldRevisionId, knowledgeBaseId, knowledgeRevisionId }) {
    return {
        format: 'atria-project-source',
        schemaVersion: 1,
        project: {
            projectId: createNativeId('project'),
            packageId,
            displayName: 'N9 Project',
            createdAt: 1,
            updatedAt: 1,
        },
        package: {
            name: 'N9 Project Work',
            version: '1.0.0',
            actors: [],
            entryPoints: [{
                entryPointId: createNativeId('entryPoint'),
                displayName: 'Start',
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
        dependencies: {
            worlds: [{ worldId, worldRevisionId }],
            knowledge: [{ knowledgeBaseId, knowledgeRevisionId }],
            knowledgeBindings: [],
        },
        assetFiles: [],
    };
}

describe('N9 Native Product UI service', () => {
    test('drives Works, Sessions, Saves and deletion through Native authorities', async () => {
        const h = await makeTempFsEngineHarness();
        try {
            const f = await installFixture(h);
            const worldRepo = new WorldRepo({ engine: h.engine });
            const projectStore = new ProjectStore({ directoriesByHandle: () => h.dirs });
            const product = new NativeProductService({
                packageRepo: f.packageRepo,
                worldRepo,
                knowledgeRepo: f.knowledgeRepo,
                sessionRepo: f.sessionRepo,
                savePointRepo: f.savePointRepo,
                packageInstaller: f.packageInstaller,
                saveSystem: f.saveSystem,
                sessionCore: f.core,
                projectStore,
            });

            const works = await product.listWorks(h.handle);
            expect(works).toHaveLength(1);
            expect(works[0]).toMatchObject({
                status: 'ready',
                sessionCount: 0,
                package: { packageId: f.manifest.packageId },
                packageVersion: { packageVersionId: f.manifest.packageVersionId },
            });
            expect(works[0].manifest.entryPoints[0].entryPointId).toBe(f.entryPointId);

            const { archive } = buildAtriaPackageContainer({
                manifest: f.manifest,
                sourceFiles: new Map(),
                assetPayloads: new Map(),
            });
            expect(product.preflightPackage(archive)).toMatchObject({
                packageId: f.manifest.packageId,
                packageVersionId: f.manifest.packageVersionId,
            });

            const started = await product.startWork(h.handle, f.manifest.packageId, {
                entryPointId: f.entryPointId,
                displayTitle: 'N9 Run',
            });
            expect(started.session.displayTitle).toBe('N9 Run');
            const listedSession = (await product.listSessions(h.handle))[0];
            expect(listedSession.sessionId).toBe(started.session.sessionId);
            expect(listedSession.dependency.status).toBe('ready');

            const quick = await product.createSave(h.handle, started.session.sessionId, { kind: 'quick' });
            expect(quick).toMatchObject({
                sessionId: started.session.sessionId,
                revisionId: started.revision.revisionId,
                kind: 'quick',
            });

            const advanced = await f.core.appendTimeline(
                h.handle,
                started.session.sessionId,
                { role: 'user', content: 'Advance once' },
                { expectedRevisionId: started.revision.revisionId },
            );
            const restored = await product.restoreSave(
                h.handle,
                started.session.sessionId,
                quick.saveId,
                advanced.revision.revisionId,
            );
            expect(restored.revision.revisionId).not.toBe(advanced.revision.revisionId);
            expect(restored.revision.branchId).not.toBe(advanced.revision.branchId);
            expect(restored.timeline).toHaveLength(started.timeline.length);

            const detail = await product.getSession(h.handle, started.session.sessionId);
            expect(detail.dependency.status).toBe('ready');
            expect(detail.snapshot.session.sessionId).toBe(started.session.sessionId);
            expect(detail.saves.map(item => item.saveId)).toContain(quick.saveId);
            expect(detail.branches.length).toBeGreaterThanOrEqual(2);
            expect(detail.revisions.length).toBeGreaterThanOrEqual(3);

            await expect(product.deleteWork(h.handle, f.manifest.packageId))
                .rejects.toMatchObject({ code: 'native_package_referenced' });

            expect(await product.deleteSession(h.handle, started.session.sessionId)).toBe(true);
            expect(await product.deleteWork(h.handle, f.manifest.packageId)).toBe(true);
            expect(await product.listWorks(h.handle)).toEqual([]);
        } finally {
            await h.cleanup();
        }
    });

    test('exposes World/Knowledge revision detail and protects Studio exact dependencies', async () => {
        const h = await makeTempFsEngineHarness();
        try {
            const f = await installFixture(h);
            const worldRepo = new WorldRepo({ engine: h.engine });
            const projectStore = new ProjectStore({ directoriesByHandle: () => h.dirs });
            const product = new NativeProductService({
                packageRepo: f.packageRepo,
                worldRepo,
                knowledgeRepo: f.knowledgeRepo,
                sessionRepo: f.sessionRepo,
                savePointRepo: f.savePointRepo,
                packageInstaller: f.packageInstaller,
                saveSystem: f.saveSystem,
                sessionCore: f.core,
                projectStore,
            });

            const worldId = createNativeId('world');
            const worldRevisionId = createNativeId('worldRevision');
            await worldRepo.create(h.handle, {
                worldId,
                displayName: 'Library World',
                currentRevisionId: null,
                createdAt: 10,
                updatedAt: 10,
            });
            await worldRepo.commitRevision(h.handle, {
                worldId,
                worldRevisionId,
                baseline: { location: 'harbor' },
                knowledgeBindingIds: [],
                assetIds: [],
                metadata: { note: 'immutable' },
                createdAt: 11,
            });

            const knowledgeBaseId = createNativeId('knowledgeBase');
            const knowledgeRevisionId = createNativeId('knowledgeRevision');
            const knowledgeEntryId = createNativeId('knowledgeEntry');
            await f.knowledgeRepo.create(h.handle, {
                knowledgeBaseId,
                displayName: 'Library Knowledge',
                currentRevisionId: null,
                createdAt: 12,
                updatedAt: 12,
            });
            await f.knowledgeRepo.commitRevision(h.handle, {
                knowledgeBaseId,
                knowledgeRevisionId,
                entryIds: [knowledgeEntryId],
                metadata: { label: 'v1' },
                createdAt: 13,
            }, [{
                knowledgeEntryId,
                content: 'Exact N9 entry',
                relations: { requiredEntryIds: [], relatedEntryIds: [] },
                metadata: { source: 'native' },
            }]);

            expect((await product.listWorlds(h.handle))[0].currentRevision.worldRevisionId)
                .toBe(worldRevisionId);
            const worldDetail = await product.getWorld(h.handle, worldId);
            expect(worldDetail.revisions).toHaveLength(1);
            expect(worldDetail.currentRevision.baseline.location).toBe('harbor');

            expect((await product.listKnowledgeBases(h.handle))[0].currentRevision.knowledgeRevisionId)
                .toBe(knowledgeRevisionId);
            const knowledgeDetail = await product.getKnowledgeBase(h.handle, knowledgeBaseId);
            expect(knowledgeDetail.selectedRevision.knowledgeRevisionId).toBe(knowledgeRevisionId);
            expect(knowledgeDetail.entries).toEqual([
                expect.objectContaining({
                    knowledgeEntryId,
                    content: 'Exact N9 entry',
                }),
            ]);

            const source = projectSource({
                packageId: f.manifest.packageId,
                worldId,
                worldRevisionId,
                knowledgeBaseId,
                knowledgeRevisionId,
            });
            await product.createProject(h.handle, source);
            expect((await product.listProjects(h.handle))[0].projectId).toBe(source.project.projectId);
            const project = await product.getProject(h.handle, source.project.projectId);
            expect(project.source.dependencies.worlds).toEqual([{ worldId, worldRevisionId }]);
            expect(project.source.dependencies.knowledge).toEqual([{ knowledgeBaseId, knowledgeRevisionId }]);

            await expect(product.deleteWorld(h.handle, worldId))
                .rejects.toMatchObject({ code: 'native_world_project_referenced' });
            await expect(product.deleteKnowledgeBase(h.handle, knowledgeBaseId))
                .rejects.toMatchObject({ code: 'native_knowledge_project_referenced' });

            const updated = await product.updateProjectDependencies(h.handle, source.project.projectId, {
                worlds: [],
                knowledge: [],
                knowledgeBindings: [],
            });
            expect(updated.dependencies).toEqual({
                worlds: [],
                knowledge: [],
                knowledgeBindings: [],
                assets: [],
            });

            expect(await product.deleteWorld(h.handle, worldId)).toBe(true);
            expect(await product.deleteKnowledgeBase(h.handle, knowledgeBaseId)).toBe(true);
            expect(await product.deleteProject(h.handle, source.project.projectId)).toBe(true);
        } finally {
            await h.cleanup();
        }
    });

    test('surfaces missing Package dependencies and delegates save import/export to N8', async () => {
        const h = await makeTempFsEngineHarness();
        try {
            const f = await installFixture(h);
            const worldRepo = new WorldRepo({ engine: h.engine });
            const projectStore = new ProjectStore({ directoriesByHandle: () => h.dirs });
            const product = new NativeProductService({
                packageRepo: f.packageRepo,
                worldRepo,
                knowledgeRepo: f.knowledgeRepo,
                sessionRepo: f.sessionRepo,
                savePointRepo: f.savePointRepo,
                packageInstaller: f.packageInstaller,
                saveSystem: f.saveSystem,
                sessionCore: f.core,
                projectStore,
            });

            const started = await product.startWork(h.handle, f.manifest.packageId, {
                entryPointId: f.entryPointId,
            });
            const save = await product.createSave(h.handle, started.session.sessionId, { kind: 'manual' });
            const archive = await product.exportSnapshot(h.handle, started.session.sessionId, save.saveId);
            expect(Buffer.isBuffer(archive)).toBe(true);
            expect((await product.preflightSaveImport(h.handle, archive)).dependency.status).toBe('ready');

            const missingSessionId = createNativeId('session');
            await f.sessionRepo.create(h.handle, {
                sessionId: missingSessionId,
                packageId: createNativeId('package'),
                packageVersionId: createNativeId('packageVersion'),
                packageVersion: '9.9.9',
                packageContentHash: 'f'.repeat(64),
                entryPointId: createNativeId('entryPoint'),
                activeBranchId: createNativeId('branch'),
                headRevisionId: null,
                createdAt: 100,
                updatedAt: 100,
            });
            const missing = await product.getSession(h.handle, missingSessionId);
            expect(missing.dependency).toMatchObject({
                status: 'missing',
                code: 'native_session_package_missing',
            });
            expect(missing.snapshot).toBeNull();
            expect((await product.listSessions(h.handle)).find(item => item.sessionId === missingSessionId))
                .toMatchObject({ dependency: { status: 'missing' } });

            const createdWorld = await product.createWorld(h.handle, { displayName: 'Created in N9' });
            const createdKnowledge = await product.createKnowledgeBase(h.handle, { displayName: 'Created KB in N9' });
            expect(createdWorld).toMatchObject({ displayName: 'Created in N9', currentRevisionId: null });
            expect(createdKnowledge).toMatchObject({ displayName: 'Created KB in N9', currentRevisionId: null });
        } finally {
            await h.cleanup();
        }
    });

});
