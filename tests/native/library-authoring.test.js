import { createHash } from 'node:crypto';

import { describe, expect, test } from '@jest/globals';

import { createGitClient } from '../../src/git/client.js';
import {
    AssetStore,
    KnowledgeRepo,
    ProjectStore,
    StudioPreviewHost,
    StudioService,
    WorldRepo,
    createNativeId,
} from '../../src/native/index.js';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';

const digest = value => createHash('sha256').update(value).digest('hex');

function projectSource() {
    return {
        format: 'atria-project-source',
        schemaVersion: 1,
        project: {
            projectId: createNativeId('project'),
            packageId: createNativeId('package'),
            displayName: 'A2 Project',
            createdAt: 1,
            updatedAt: 1,
        },
        package: {
            name: 'A2 Work',
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
        dependencies: {
            worlds: [],
            knowledge: [],
            knowledgeBindings: [],
            assets: [],
        },
        assetFiles: [],
    };
}

function makeService(h) {
    const projectStore = new ProjectStore({ directoriesByHandle: () => h.dirs });
    const worldRepo = new WorldRepo({ engine: h.engine });
    const knowledgeRepo = new KnowledgeRepo({ engine: h.engine });
    const assetStore = new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs });
    const service = new StudioService({
        projectStore,
        worldRepo,
        knowledgeRepo,
        assetStore,
        gitClient: createGitClient({ backend: 'builtin' }),
        previewHost: new StudioPreviewHost(),
    });
    return { service, projectStore, worldRepo, knowledgeRepo, assetStore };
}

describe('A2 Library authoring through StudioService', () => {
    test('Attach pins an exact World revision and only explicit Update moves the pin', async () => {
        const h = await makeTempFsEngine();
        try {
            const { service, worldRepo } = makeService(h);
            const worldId = createNativeId('world');
            const worldV1 = createNativeId('worldRevision');
            const worldV2 = createNativeId('worldRevision');
            await worldRepo.create(h.handle, {
                worldId,
                displayName: 'Library World',
                currentRevisionId: null,
            });
            await worldRepo.commitRevision(h.handle, {
                worldId,
                worldRevisionId: worldV1,
                baseline: { era: 1 },
                knowledgeBindingIds: [],
                assetIds: [],
                metadata: {},
            });
            await worldRepo.commitRevision(h.handle, {
                worldId,
                worldRevisionId: worldV2,
                baseline: { era: 2 },
                knowledgeBindingIds: [],
                assetIds: [],
                metadata: {},
            });

            const source = projectSource();
            const created = await service.createProject(h.handle, source);
            const attached = await service.attachLibraryResource(h.handle, source.project.projectId, {
                resourceType: 'core.world',
                resourceId: worldId,
                revision: worldV1,
                baseRevision: created.revision.revision,
                origin: { kind: 'human', id: 'author_1' },
            });
            expect(attached.changeSet.operations[0].operationType).toBe('resource.attach');
            let saved = (await service.getProject(h.handle, source.project.projectId)).source;
            expect(saved.dependencies.worlds).toEqual([{ worldId, worldRevisionId: worldV1 }]);

            const closureBefore = await service.resolveResourceClosure(h.handle, source.project.projectId);
            expect(closureBefore.closure.worlds[0].revision.worldRevisionId).toBe(worldV1);
            expect(closureBefore.closure.worlds[0].revision.baseline).toEqual({ era: 1 });

            const updated = await service.updateLibraryResource(h.handle, source.project.projectId, {
                resourceType: 'core.world',
                resourceId: worldId,
                fromRevision: worldV1,
                toRevision: worldV2,
                baseRevision: attached.changeSet.resultingRevision,
                origin: { kind: 'agent', id: 'project_agent' },
            });
            saved = (await service.getProject(h.handle, source.project.projectId)).source;
            expect(saved.dependencies.worlds).toEqual([{ worldId, worldRevisionId: worldV2 }]);

            await expect(service.updateLibraryResource(h.handle, source.project.projectId, {
                resourceType: 'core.world',
                resourceId: worldId,
                fromRevision: worldV1,
                toRevision: worldV2,
                baseRevision: updated.changeSet.resultingRevision,
                origin: { kind: 'agent', id: 'project_agent' },
            })).rejects.toMatchObject({
                name: 'ConflictError',
                code: 'library_resource_revision_conflict',
            });
        } finally {
            await h.cleanup();
        }
    });

    test('Fork creates an independent project-owned Knowledge derivative with exact origin provenance', async () => {
        const h = await makeTempFsEngine();
        try {
            const { service, knowledgeRepo } = makeService(h);
            const knowledgeBaseId = createNativeId('knowledgeBase');
            const knowledgeV1 = createNativeId('knowledgeRevision');
            const knowledgeV2 = createNativeId('knowledgeRevision');
            const entryA = createNativeId('knowledgeEntry');
            const entryB = createNativeId('knowledgeEntry');
            const entryV2 = createNativeId('knowledgeEntry');

            await knowledgeRepo.create(h.handle, {
                knowledgeBaseId,
                displayName: 'Library Canon',
                currentRevisionId: null,
            });
            await knowledgeRepo.commitRevision(h.handle, {
                knowledgeBaseId,
                knowledgeRevisionId: knowledgeV1,
                entryIds: [entryA, entryB],
                metadata: {},
            }, [
                {
                    knowledgeEntryId: entryA,
                    content: 'A',
                    relations: { relatedEntryIds: [entryB] },
                    metadata: {},
                },
                {
                    knowledgeEntryId: entryB,
                    content: 'B',
                    relations: { requiredEntryIds: [entryA] },
                    metadata: {},
                },
            ]);
            await knowledgeRepo.commitRevision(h.handle, {
                knowledgeBaseId,
                knowledgeRevisionId: knowledgeV2,
                entryIds: [entryV2],
                metadata: {},
            }, [{ knowledgeEntryId: entryV2, content: 'new latest', metadata: {} }]);

            const source = projectSource();
            const created = await service.createProject(h.handle, source);
            const forked = await service.forkLibraryResource(h.handle, source.project.projectId, {
                resourceType: 'core.knowledge',
                resourceId: knowledgeBaseId,
                revision: knowledgeV1,
                displayName: 'Project Canon',
                baseRevision: created.revision.revision,
                origin: { kind: 'human', id: 'author_1' },
            });

            const saved = (await service.getProject(h.handle, source.project.projectId)).source;
            expect(saved.knowledge).toHaveLength(1);
            const local = saved.knowledge[0];
            expect(local.knowledgeBase.knowledgeBaseId).not.toBe(knowledgeBaseId);
            expect(local.revision.knowledgeRevisionId).not.toBe(knowledgeV1);
            expect(local.knowledgeBase.displayName).toBe('Project Canon');
            expect(local.revision.metadata.atriaLibraryOrigin).toMatchObject({
                resourceType: 'core.knowledge',
                resourceId: knowledgeBaseId,
                revision: knowledgeV1,
                relationship: 'fork',
            });
            expect(local.entries.map(item => item.knowledgeEntryId))
                .not.toEqual([entryA, entryB]);
            expect(local.entries[0].relations.relatedEntryIds)
                .toEqual([local.entries[1].knowledgeEntryId]);
            expect(local.entries[1].relations.requiredEntryIds)
                .toEqual([local.entries[0].knowledgeEntryId]);
            expect(forked.changes[0].kind).toBe('resource-fork');
        } finally {
            await h.cleanup();
        }
    });

    test('Asset Attach records exact content identity while Asset Fork creates a project-owned file', async () => {
        const h = await makeTempFsEngine();
        try {
            const { service, assetStore } = makeService(h);
            const bytes = Buffer.from('immutable library asset');
            const assetId = createNativeId('asset');
            const contentHash = digest(bytes);
            await assetStore.put(h.handle, {
                assetId,
                contentHash,
                size: bytes.length,
                mediaType: 'text/plain',
                logicalName: 'lore.txt',
            }, bytes);

            const source = projectSource();
            const created = await service.createProject(h.handle, source);
            const attached = await service.attachLibraryResource(h.handle, source.project.projectId, {
                resourceType: 'core.asset',
                resourceId: assetId,
                revision: contentHash,
                baseRevision: created.revision.revision,
                origin: { kind: 'plugin', id: 'plugin.example' },
            });
            let saved = (await service.getProject(h.handle, source.project.projectId)).source;
            expect(saved.dependencies.assets).toEqual([{ assetId, contentHash }]);
            expect(saved.assetFiles).toEqual([]);

            const forked = await service.forkLibraryResource(h.handle, source.project.projectId, {
                resourceType: 'core.asset',
                resourceId: assetId,
                revision: contentHash,
                path: 'assets/forked/lore.txt',
                baseRevision: attached.changeSet.resultingRevision,
                origin: { kind: 'human', id: 'author_1' },
            });
            saved = (await service.getProject(h.handle, source.project.projectId)).source;
            expect(saved.assetFiles).toHaveLength(1);
            const local = saved.assetFiles[0];
            expect(local.assetId).not.toBe(assetId);
            expect(local.metadata.atriaLibraryOrigin).toMatchObject({
                resourceType: 'core.asset',
                resourceId: assetId,
                revision: contentHash,
                relationship: 'fork',
            });
            expect((await service.readSource(
                h.handle,
                source.project.projectId,
                'assets/forked/lore.txt',
            )).content).toBe(bytes.toString('base64'));
            expect(forked.changeSet.validation.status).toBe('passed');
        } finally {
            await h.cleanup();
        }
    });
});
