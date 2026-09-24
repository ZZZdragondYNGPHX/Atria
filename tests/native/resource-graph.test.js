import { createHash } from 'node:crypto';

import { describe, expect, test } from '@jest/globals';

import {
    AssetStore,
    KnowledgeRepo,
    NativeLibraryService,
    ProjectStore,
    ResourceGraph,
    WorldRepo,
    createCoreResourceRegistry,
    createNativeId,
} from '../../src/native/index.js';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';

function projectSource(worldId, worldRevisionId) {
    const projectId = createNativeId('project');
    return {
        format: 'atria-project-source',
        schemaVersion: 1,
        project: {
            projectId,
            packageId: createNativeId('package'),
            displayName: 'Graph Project',
            createdAt: 1,
            updatedAt: 1,
        },
        package: {
            name: 'Graph Work',
            version: '1.0.0',
            actors: [],
            entryPoints: [{
                entryPointId: createNativeId('entryPoint'),
                displayName: 'Main',
                actorIds: [],
                worldIds: [worldId],
                primaryWorldId: worldId,
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
            knowledge: [],
            knowledgeBindings: [],
        },
        assetFiles: [],
    };
}

describe('A2 derived Resource Graph', () => {
    test('composed Worlds reuse the canonical binding node across immutable revisions', async () => {
        const h = await makeTempFsEngine();
        try {
            const projects = new ProjectStore({ directoriesByHandle: () => h.dirs });
            const worlds = new WorldRepo({ engine: h.engine });
            const knowledge = new KnowledgeRepo({ engine: h.engine });
            const assets = new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs });
            const library = new NativeLibraryService({ worldRepo: worlds, knowledgeRepo: knowledge, assetStore: assets });
            const graph = new ResourceGraph({ projectStore: projects, worldRepo: worlds, knowledgeRepo: knowledge, assetStore: assets, libraryService: library, registry: createCoreResourceRegistry() });
            const knowledgeBaseId = createNativeId('knowledgeBase'), knowledgeRevisionId = createNativeId('knowledgeRevision'), knowledgeBindingId = createNativeId('knowledgeBinding'), worldId = createNativeId('world');
            await knowledge.create(h.handle, { knowledgeBaseId, currentRevisionId: null, displayName: 'Canon' });
            await knowledge.commitRevision(h.handle, { knowledgeBaseId, knowledgeRevisionId, entryIds: [] }, []);
            await knowledge.saveBinding(h.handle, { knowledgeBindingId, source: { kind: 'library', knowledgeBaseId, knowledgeRevisionId }, enabled: true, mode: 'augment' });
            await worlds.create(h.handle, { worldId, currentRevisionId: null, displayName: 'Harbor' });
            for (let index = 0; index < 2; index++) await worlds.commitRevision(h.handle, { worldId, worldRevisionId: createNativeId('worldRevision'), knowledgeBindingIds: [knowledgeBindingId], assetIds: [], baseline: { index } });
            const result = await graph.refresh(h.handle);
            expect(result.nodes.filter(item => item.resourceType === 'core.knowledge-binding')).toHaveLength(1);
            const binding = result.nodes.find(item => item.resourceId === knowledgeBindingId);
            expect(result.edges.filter(item => item.to === binding.key && item.kind === 'references')).toHaveLength(2);
        } finally { await h.cleanup(); }
    });
    test('derives exact project -> Library references, reverse references, delete safety and stable refresh generations', async () => {
        const h = await makeTempFsEngine();
        try {
            const projects = new ProjectStore({ directoriesByHandle: () => h.dirs });
            const worlds = new WorldRepo({ engine: h.engine });
            const knowledge = new KnowledgeRepo({ engine: h.engine });
            const assets = new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs });
            const registry = createCoreResourceRegistry();
            const library = new NativeLibraryService({
                worldRepo: worlds,
                knowledgeRepo: knowledge,
                assetStore: assets,
            });
            const graph = new ResourceGraph({
                registry,
                libraryService: library,
                projectStore: projects,
                worldRepo: worlds,
                knowledgeRepo: knowledge,
                assetStore: assets,
            });

            const worldId = createNativeId('world');
            const worldV1 = createNativeId('worldRevision');
            const worldV2 = createNativeId('worldRevision');
            await worlds.create(h.handle, {
                worldId,
                displayName: 'Library World',
                currentRevisionId: null,
            });
            await worlds.commitRevision(h.handle, {
                worldId,
                worldRevisionId: worldV1,
                baseline: { era: 1 },
                knowledgeBindingIds: [],
                assetIds: [],
                metadata: {},
            });

            const source = projectSource(worldId, worldV1);
            await projects.create(h.handle, source);

            const first = await graph.refresh(h.handle);
            const second = await graph.refresh(h.handle);
            expect(first.mode).toBe('derived-readonly');
            expect(second.generation).toBe(first.generation);

            const attached = await graph.query(h.handle, {
                resourceType: 'core.world',
                ownership: 'library',
            });
            expect(attached.some(node => (
                node.resourceId === worldId && node.revision === worldV1
            ))).toBe(true);

            const reverse = await graph.references(h.handle, {
                resourceType: 'core.world',
                resourceId: worldId,
                revision: worldV1,
            }, { reverse: true });
            expect(reverse).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    edge: expect.objectContaining({ kind: 'attaches-exact' }),
                    node: expect.objectContaining({
                        resourceType: 'core.project',
                        resourceId: source.project.projectId,
                    }),
                }),
            ]));

            const safety = await graph.inspectDelete(h.handle, {
                resourceType: 'core.world',
                resourceId: worldId,
                revision: worldV1,
            });
            expect(safety.safe).toBe(false);
            expect(safety.blockers).toEqual(expect.arrayContaining([
                expect.objectContaining({ kind: 'resource-graph', edge: 'attaches-exact' }),
            ]));

            await worlds.commitRevision(h.handle, {
                worldId,
                worldRevisionId: worldV2,
                baseline: { era: 2 },
                knowledgeBindingIds: [],
                assetIds: [],
                metadata: {},
            });
            const third = await graph.refresh(h.handle);
            expect(third.generation).toBe(first.generation + 1);

            const closure = await graph.resolveBuildClosure(h.handle, source.project.projectId);
            expect(closure.resources).toEqual(expect.arrayContaining([
                {
                    resourceType: 'core.world',
                    resourceId: worldId,
                    revision: worldV1,
                },
            ]));
            expect(closure.closure.worlds[0].revision.worldRevisionId).toBe(worldV1);
        } finally {
            await h.cleanup();
        }
    });    test('connects project-owned World nodes directly to exact Library asset dependencies', async () => {
        const h = await makeTempFsEngine();
        try {
            const projects = new ProjectStore({ directoriesByHandle: () => h.dirs });
            const worlds = new WorldRepo({ engine: h.engine });
            const knowledge = new KnowledgeRepo({ engine: h.engine });
            const assets = new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs });
            const registry = createCoreResourceRegistry();
            const library = new NativeLibraryService({
                worldRepo: worlds,
                knowledgeRepo: knowledge,
                assetStore: assets,
            });
            const graph = new ResourceGraph({
                registry,
                libraryService: library,
                projectStore: projects,
                worldRepo: worlds,
                knowledgeRepo: knowledge,
                assetStore: assets,
            });

            const bytes = Buffer.from('library map');
            const contentHash = createHash('sha256').update(bytes).digest('hex');
            const assetId = createNativeId('asset');
            await assets.put(h.handle, {
                assetId,
                contentHash,
                size: bytes.length,
                mediaType: 'text/plain',
            }, bytes);

            const worldId = createNativeId('world');
            const worldRevisionId = createNativeId('worldRevision');
            const source = projectSource(worldId, worldRevisionId);
            source.worlds = [{
                world: {
                    worldId,
                    displayName: 'Forked Project World',
                    currentRevisionId: worldRevisionId,
                    createdAt: 1,
                    updatedAt: 1,
                },
                revision: {
                    worldId,
                    worldRevisionId,
                    baseline: {},
                    knowledgeBindingIds: [],
                    assetIds: [assetId],
                    metadata: {},
                    createdAt: 1,
                },
            }];
            source.dependencies.worlds = [];
            source.dependencies.assets = [{ assetId, contentHash }];
            await projects.create(h.handle, source);

            const reverse = await graph.references(h.handle, {
                resourceType: 'core.asset',
                resourceId: assetId,
                revision: contentHash,
            }, { reverse: true });

            expect(reverse).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    edge: expect.objectContaining({ kind: 'attaches-exact' }),
                    node: expect.objectContaining({
                        resourceType: 'core.project',
                        resourceId: source.project.projectId,
                    }),
                }),
                expect.objectContaining({
                    edge: expect.objectContaining({ kind: 'references' }),
                    node: expect.objectContaining({
                        resourceType: 'core.world',
                        resourceId: worldId,
                        ownership: 'project',
                    }),
                }),
            ]));
        } finally {
            await h.cleanup();
        }
    });

});
