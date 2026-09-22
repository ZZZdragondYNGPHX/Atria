import { createHash } from 'node:crypto';

import { describe, expect, test } from '@jest/globals';

import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import {
    AssetStore,
    KnowledgeRepo,
    NativeDependencyError,
    ProjectStore,
    WorldRepo,
    assertAtriaProjectSource,
    createNativeId,
    resolveProjectDependencyClosure,
} from '../../src/native/index.js';

const hash = value => createHash('sha256').update(value).digest('hex');

function baseProject(overrides = {}) {
    const projectId = overrides.projectId || createNativeId('project');
    const packageId = overrides.packageId || createNativeId('package');
    return {
        format: 'atria-project-source',
        schemaVersion: 1,
        project: {
            projectId,
            packageId,
            displayName: 'N2 Source Project',
            createdAt: 10,
            updatedAt: 10,
        },
        package: {
            name: 'N2 Work',
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
        },
        assetFiles: [],
        ...overrides,
    };
}

describe('N2 ProjectStore', () => {
    test('keys authoring trees only by opaque projectId and never characterId', async () => {
        const h = await makeTempFsEngine();
        try {
            const store = new ProjectStore({
                directoriesByHandle: handle => {
                    if (handle !== h.handle) throw new Error('unknown handle');
                    return h.dirs;
                },
            });
            const source = assertAtriaProjectSource(baseProject());
            await store.create(h.handle, source, {
                files: new Map([
                    ['game.json', Buffer.from('{"format":"atria-game"}')],
                    ['world/schema.json', Buffer.from('{"type":"object"}')],
                ]),
            });

            expect((await store.get(h.handle, source.project.projectId)).project)
                .toEqual(source.project);
            expect((await store.list(h.handle)).map(item => item.projectId))
                .toEqual([source.project.projectId]);
            expect((await store.readFile(h.handle, source.project.projectId, 'game.json')).toString())
                .toContain('atria-game');
            expect((await store.listFiles(h.handle, source.project.projectId)).map(item => item.path))
                .toEqual(['game.json', 'world/schema.json']);

            await expect(store.writeFile(
                h.handle,
                source.project.projectId,
                '../escape.json',
                '{}',
            )).rejects.toThrow(/illegal segment|project-relative/);
            await expect(store.writeFile(
                h.handle,
                source.project.projectId,
                'atria.project.json',
                '{}',
            )).rejects.toThrow(/ProjectStore.save/);

            expect(() => assertAtriaProjectSource({
                ...source,
                project: {
                    ...source.project,
                    characterId: 123,
                },
            })).toThrow(/legacy identity field/);
        } finally {
            await h.cleanup();
        }
    });

    test('build file enumeration excludes progress/save/checkpoint and git authority', async () => {
        const h = await makeTempFsEngine();
        try {
            const store = new ProjectStore({ directoriesByHandle: () => h.dirs });
            const source = baseProject();
            await store.create(h.handle, source);
            await store.writeFile(h.handle, source.project.projectId, 'runtime/main.json', '{}');
            await store.writeFile(h.handle, source.project.projectId, 'saves/slot.json', '{}');
            await store.writeFile(h.handle, source.project.projectId, 'progress/live.json', '{}');
            await store.writeFile(h.handle, source.project.projectId, 'checkpoints/cp.json', '{}');

            expect([...await store.readBuildFiles(h.handle, source.project.projectId).keys()])
                .toEqual(['runtime/main.json']);
        } finally {
            await h.cleanup();
        }
    });
});

describe('N2 exact World/Knowledge dependency closure', () => {
    test('vendors the exact referenced Library revisions even after Library current moves on', async () => {
        const h = await makeTempFsEngine();
        try {
            const worldRepo = new WorldRepo({ engine: h.engine });
            const knowledgeRepo = new KnowledgeRepo({ engine: h.engine });
            const assetStore = new AssetStore({
                engine: h.engine,
                directoriesByHandle: () => h.dirs,
            });

            const knowledgeBaseId = createNativeId('knowledgeBase');
            const knowledgeV1 = createNativeId('knowledgeRevision');
            const knowledgeV2 = createNativeId('knowledgeRevision');
            const entryV1 = createNativeId('knowledgeEntry');
            const entryV2 = createNativeId('knowledgeEntry');
            const bindingId = createNativeId('knowledgeBinding');

            await knowledgeRepo.create(h.handle, {
                knowledgeBaseId,
                displayName: 'Library KB',
                currentRevisionId: null,
            });
            await knowledgeRepo.commitRevision(h.handle, {
                knowledgeBaseId,
                knowledgeRevisionId: knowledgeV1,
                entryIds: [entryV1],
                metadata: {},
                createdAt: 20,
            }, [{
                knowledgeEntryId: entryV1,
                content: 'Pinned lore v1',
                metadata: {},
            }]);
            await knowledgeRepo.saveBinding(h.handle, {
                knowledgeBindingId: bindingId,
                source: {
                    kind: 'library',
                    knowledgeBaseId,
                    knowledgeRevisionId: knowledgeV1,
                },
                enabled: true,
                mode: 'augment',
                metadata: {},
            });
            await knowledgeRepo.commitRevision(h.handle, {
                knowledgeBaseId,
                knowledgeRevisionId: knowledgeV2,
                entryIds: [entryV2],
                metadata: {},
                createdAt: 21,
            }, [{
                knowledgeEntryId: entryV2,
                content: 'Newer Library lore v2',
                metadata: {},
            }]);

            const assetBytes = Buffer.from('world asset v1');
            const assetId = createNativeId('asset');
            await assetStore.put(h.handle, {
                assetId,
                contentHash: hash(assetBytes),
                size: assetBytes.length,
                mediaType: 'text/plain',
                logicalName: 'world.txt',
            }, assetBytes);

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
                knowledgeBindingIds: [bindingId],
                assetIds: [assetId],
                metadata: {},
                createdAt: 30,
            });
            await worldRepo.commitRevision(h.handle, {
                worldId,
                worldRevisionId: worldV2,
                baseline: { era: 2 },
                knowledgeBindingIds: [],
                assetIds: [],
                metadata: {},
                createdAt: 31,
            });

            const source = baseProject();
            source.package.entryPoints[0] = {
                ...source.package.entryPoints[0],
                worldIds: [worldId],
                primaryWorldId: worldId,
                knowledgeBindingIds: [bindingId],
            };
            source.dependencies.worlds = [{ worldId, worldRevisionId: worldV1 }];
            source.dependencies.knowledgeBindings = [bindingId];
            const parsed = assertAtriaProjectSource(source);

            const closure = await resolveProjectDependencyClosure({
                handle: h.handle,
                source: parsed,
                worldRepo,
                knowledgeRepo,
                assetStore,
            });

            expect(closure.worlds).toHaveLength(1);
            expect(closure.worlds[0].revision.worldRevisionId).toBe(worldV1);
            expect(closure.worlds[0].revision.baseline).toEqual({ era: 1 });
            expect(closure.knowledge).toHaveLength(1);
            expect(closure.knowledge[0].revision.knowledgeRevisionId).toBe(knowledgeV1);
            expect(closure.knowledge[0].entries[0].content).toBe('Pinned lore v1');
            expect(closure.knowledgeBindings[0].source.kind).toBe('package');
            expect(closure.assets[0].ref.assetId).toBe(assetId);
            expect(closure.assets[0].bytes.equals(assetBytes)).toBe(true);
        } finally {
            await h.cleanup();
        }
    });

    test('fails closed on missing exact revisions instead of following latest or display names', async () => {
        const h = await makeTempFsEngine();
        try {
            const source = baseProject();
            source.dependencies.worlds = [{
                worldId: createNativeId('world'),
                worldRevisionId: createNativeId('worldRevision'),
            }];
            await expect(resolveProjectDependencyClosure({
                handle: h.handle,
                source: assertAtriaProjectSource(source),
                worldRepo: new WorldRepo({ engine: h.engine }),
                knowledgeRepo: new KnowledgeRepo({ engine: h.engine }),
                assetStore: new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs }),
            })).rejects.toMatchObject({
                code: 'native_world_dependency_missing',
            });
        } finally {
            await h.cleanup();
        }
    });

    test('rejects cyclic required Knowledge dependencies at composition time', async () => {
        const h = await makeTempFsEngine();
        try {
            const a = createNativeId('knowledgeEntry');
            const b = createNativeId('knowledgeEntry');
            const knowledgeBaseId = createNativeId('knowledgeBase');
            const knowledgeRevisionId = createNativeId('knowledgeRevision');
            const source = baseProject({
                knowledge: [{
                    knowledgeBase: {
                        knowledgeBaseId,
                        displayName: 'Project KB',
                        currentRevisionId: knowledgeRevisionId,
                    },
                    revision: {
                        knowledgeBaseId,
                        knowledgeRevisionId,
                        entryIds: [a, b],
                        metadata: {},
                    },
                    entries: [
                        {
                            knowledgeEntryId: a,
                            content: 'A',
                            relations: { requiredEntryIds: [b] },
                            metadata: {},
                        },
                        {
                            knowledgeEntryId: b,
                            content: 'B',
                            relations: { requiredEntryIds: [a] },
                            metadata: {},
                        },
                    ],
                }],
            });

            await expect(resolveProjectDependencyClosure({
                handle: h.handle,
                source: assertAtriaProjectSource(source),
                worldRepo: new WorldRepo({ engine: h.engine }),
                knowledgeRepo: new KnowledgeRepo({ engine: h.engine }),
                assetStore: new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs }),
            })).rejects.toBeInstanceOf(NativeDependencyError);
            await expect(resolveProjectDependencyClosure({
                handle: h.handle,
                source: assertAtriaProjectSource(source),
                worldRepo: new WorldRepo({ engine: h.engine }),
                knowledgeRepo: new KnowledgeRepo({ engine: h.engine }),
                assetStore: new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs }),
            })).rejects.toMatchObject({
                code: 'native_knowledge_dependency_cycle',
            });
        } finally {
            await h.cleanup();
        }
    });
});
