import { createHash } from 'node:crypto';

import { describe, expect, test } from '@jest/globals';

import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import {
    AssetStore,
    KnowledgeRepo,
    PackageInstaller,
    PackageRepo,
    ProjectStore,
    StudioPreviewHost,
    StudioProjectRouter,
    WorldRepo,
    buildProjectPackage,
    assertAtriaProjectSource,
    createNativeId,
    resolveNativeRuntimePackage,
} from '../../src/native/index.js';

const digest = value => createHash('sha256').update(value).digest('hex');

async function seedAuthoringLibrary(h) {
    const knowledgeRepo = new KnowledgeRepo({ engine: h.engine });
    const worldRepo = new WorldRepo({ engine: h.engine });
    const assetStore = new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs });

    const knowledgeBaseId = createNativeId('knowledgeBase');
    const knowledgeRevisionId = createNativeId('knowledgeRevision');
    const knowledgeEntryId = createNativeId('knowledgeEntry');
    const knowledgeBindingId = createNativeId('knowledgeBinding');

    await knowledgeRepo.create(h.handle, {
        knowledgeBaseId,
        displayName: 'Author Library KB',
        currentRevisionId: null,
    });
    await knowledgeRepo.commitRevision(h.handle, {
        knowledgeBaseId,
        knowledgeRevisionId,
        entryIds: [knowledgeEntryId],
        metadata: {},
    }, [{
        knowledgeEntryId,
        content: 'Exact authoring-time lore',
        metadata: {},
    }]);
    await knowledgeRepo.saveBinding(h.handle, {
        knowledgeBindingId,
        source: {
            kind: 'library',
            knowledgeBaseId,
            knowledgeRevisionId,
        },
        enabled: true,
        mode: 'augment',
        metadata: {},
    });

    const bytes = Buffer.from('authoring-time world asset');
    const assetId = createNativeId('asset');
    await assetStore.put(h.handle, {
        assetId,
        contentHash: digest(bytes),
        size: bytes.length,
        mediaType: 'text/plain',
        logicalName: 'world-asset.txt',
    }, bytes);

    const worldId = createNativeId('world');
    const worldRevisionId = createNativeId('worldRevision');
    await worldRepo.create(h.handle, {
        worldId,
        displayName: 'Author Library World',
        currentRevisionId: null,
    });
    await worldRepo.commitRevision(h.handle, {
        worldId,
        worldRevisionId,
        schema: {
            type: 'object',
            properties: { hp: { type: 'integer' } },
        },
        baseline: { hp: 10 },
        knowledgeBindingIds: [knowledgeBindingId],
        assetIds: [assetId],
        metadata: {},
    });

    return {
        worldRepo,
        knowledgeRepo,
        assetStore,
        worldId,
        worldRevisionId,
        knowledgeBaseId,
        knowledgeRevisionId,
        knowledgeBindingId,
        assetId,
        assetBytes: bytes,
    };
}

function projectSource(deps) {
    const projectId = createNativeId('project');
    const packageId = createNativeId('package');
    return {
        format: 'atria-project-source',
        schemaVersion: 1,
        project: {
            projectId,
            packageId,
            displayName: 'Self-contained Build',
        },
        package: {
            name: 'Self-contained Work',
            version: '2.0.0',
            actors: [],
            entryPoints: [{
                entryPointId: createNativeId('entryPoint'),
                displayName: 'Main',
                actorIds: [],
                worldIds: [deps.worldId],
                primaryWorldId: deps.worldId,
                knowledgeBindingIds: [deps.knowledgeBindingId],
            }],
            capabilities: ['narrative', 'world-simulation', 'knowledge'],
            permissions: [{
                permission: 'generation',
                required: true,
                reason: 'Narrative generation',
            }],
            runtime: {
                gameManifest: 'runtime/game.json',
            },
        },
        worlds: [],
        knowledge: [],
        knowledgeBindings: [],
        dependencies: {
            worlds: [{
                worldId: deps.worldId,
                worldRevisionId: deps.worldRevisionId,
            }],
            knowledge: [],
            knowledgeBindings: [deps.knowledgeBindingId],
        },
        assetFiles: [],
    };
}

describe('N2 Source Project -> build -> install -> reopen', () => {
    test('P0 preserves the strict Experience seam and exact JSON data through existing build/install storage', async () => {
        const author = await makeTempFsEngine();
        const target = await makeTempFsEngine();
        try {
            const deps = await seedAuthoringLibrary(author);
            const projectStore = new ProjectStore({ directoriesByHandle: () => author.dirs });
            const source = projectSource(deps);
            const bytes = Buffer.from('{"items":[{"id":"potion","price":10}]}');
            const assetId = createNativeId('asset');
            const experienceContract = {
                schemaVersion: 1,
                capabilities: [{ id: 'package-data', version: 1, required: false }],
                dataResources: [{ resourceId: 'items', assetId, contentHash: digest(bytes) }],
            };
            source.package.runtime = { experience: { mode: 'text' }, experienceContract };
            source.assetFiles = [{ assetId, path: 'data/items.json', mediaType: 'application/json' }];
            expect(assertAtriaProjectSource(source).package.runtime.experienceContract).toEqual(experienceContract);
            const invalid = structuredClone(source);
            invalid.package.runtime.experienceContract.persistence = {};
            expect(() => assertAtriaProjectSource(invalid)).toThrow(/unsupported field/);
            await projectStore.create(author.handle, source, { files: new Map([['data/items.json', bytes]]) });
            const built = await buildProjectPackage({
                handle: author.handle, projectId: source.project.projectId, projectStore,
                worldRepo: deps.worldRepo, knowledgeRepo: deps.knowledgeRepo, assetStore: deps.assetStore,
            });
            const installer = new PackageInstaller({
                packageRepo: new PackageRepo({ engine: target.engine }),
                assetStore: new AssetStore({ engine: target.engine, directoriesByHandle: () => target.dirs }),
            });
            await installer.install(target.handle, built.archive, { grantedPermissions: ['generation'] });
            const reopened = await installer.open(target.handle, built.manifest.packageId, built.manifest.packageVersionId);
            expect(reopened.assets.get(assetId)).toEqual(bytes);
            expect(reopened.manifest.runtime.experienceContract).toEqual(experienceContract);
            const resolved = resolveNativeRuntimePackage(reopened, source.package.entryPoints[0].entryPointId);
            expect(resolved.descriptor.experienceContract).toEqual(experienceContract);
            expect(resolved.descriptor.resources).toContainEqual({ resourceType: 'core.asset', resourceId: assetId, revision: digest(bytes) });
        } finally {
            await author.cleanup();
            await target.cleanup();
        }
    });

    test('installed PackageVersion remains self-contained with no target Library dependencies', async () => {
        const author = await makeTempFsEngine();
        const target = await makeTempFsEngine();
        try {
            const deps = await seedAuthoringLibrary(author);
            const projectStore = new ProjectStore({ directoriesByHandle: () => author.dirs });
            const source = projectSource(deps);
            await projectStore.create(author.handle, source, {
                files: new Map([
                    ['runtime/game.json', Buffer.from('{"runtime":"native"}\n')],
                ]),
            });

            const built = await buildProjectPackage({
                handle: author.handle,
                projectId: source.project.projectId,
                projectStore,
                worldRepo: deps.worldRepo,
                knowledgeRepo: deps.knowledgeRepo,
                assetStore: deps.assetStore,
            });

            expect(built.manifest.worlds[0].revision.worldRevisionId)
                .toBe(deps.worldRevisionId);
            expect(built.manifest.knowledge[0].revision.knowledgeRevisionId)
                .toBe(deps.knowledgeRevisionId);
            expect(built.manifest.knowledge[0].entries[0].content)
                .toBe('Exact authoring-time lore');
            expect(built.manifest.knowledgeBindings[0].source.kind).toBe('package');
            expect(built.packageVersion.packageContentHash).toMatch(/^[a-f0-9]{64}$/);

            const targetPackageRepo = new PackageRepo({ engine: target.engine });
            const targetAssetStore = new AssetStore({
                engine: target.engine,
                directoriesByHandle: () => target.dirs,
            });
            const installer = new PackageInstaller({
                packageRepo: targetPackageRepo,
                assetStore: targetAssetStore,
            });

            await expect(installer.install(target.handle, built.archive))
                .rejects.toMatchObject({
                    code: 'native_package_permission_required',
                    permissions: ['generation'],
                });

            const installed = await installer.install(target.handle, built.archive, {
                grantedPermissions: ['generation'],
            });
            expect(installed.package.currentVersionId)
                .toBe(built.manifest.packageVersionId);
            expect(installed.packageVersion.packageContentHash)
                .toBe(built.packageVersion.packageContentHash);

            // Target deliberately has no WorldRepo/KnowledgeRepo content. Reopen
            // is resolved only through PackageRepo metadata + AssetStore blob.
            expect(await new WorldRepo({ engine: target.engine }).get(target.handle, deps.worldId))
                .toBeNull();
            expect(await new KnowledgeRepo({ engine: target.engine }).get(
                target.handle,
                deps.knowledgeBaseId,
            )).toBeNull();

            const reopened = await installer.open(
                target.handle,
                built.manifest.packageId,
                built.manifest.packageVersionId,
            );
            expect(reopened.manifest.worlds[0].revision.worldRevisionId)
                .toBe(deps.worldRevisionId);
            expect(reopened.manifest.knowledge[0].entries[0].content)
                .toBe('Exact authoring-time lore');
            expect(reopened.sourceFiles.get('runtime/game.json').toString('utf8'))
                .toBe('{"runtime":"native"}\n');
            expect(reopened.assets.get(deps.assetId)).toEqual(deps.assetBytes);
        } finally {
            await author.cleanup();
            await target.cleanup();
        }
    });

    test('PackageVersion content blob stays GC-reachable through PackageRepo metadata', async () => {
        const author = await makeTempFsEngine();
        const target = await makeTempFsEngine();
        try {
            const deps = await seedAuthoringLibrary(author);
            const projectStore = new ProjectStore({ directoriesByHandle: () => author.dirs });
            const source = projectSource(deps);
            await projectStore.create(author.handle, source);
            const built = await buildProjectPackage({
                handle: author.handle,
                projectId: source.project.projectId,
                projectStore,
                worldRepo: deps.worldRepo,
                knowledgeRepo: deps.knowledgeRepo,
                assetStore: deps.assetStore,
            });

            const packageRepo = new PackageRepo({ engine: target.engine });
            const assetStore = new AssetStore({
                engine: target.engine,
                directoriesByHandle: () => target.dirs,
            });
            const installer = new PackageInstaller({ packageRepo, assetStore });
            await installer.install(target.handle, built.archive, {
                grantedPermissions: ['generation'],
            });

            expect(await assetStore.hasBlob(target.handle, built.packageVersion.packageContentHash))
                .toBe(true);
            expect(await assetStore.gcBlobs(target.handle)).not
                .toContain(built.packageVersion.packageContentHash);
            expect(await assetStore.hasBlob(target.handle, built.packageVersion.packageContentHash))
                .toBe(true);
        } finally {
            await author.cleanup();
            await target.cleanup();
        }
    });
});


describe('N2 Project-owned World/Knowledge composition', () => {
    test('builds Project source directly into immutable Package-owned snapshots', async () => {
        const h = await makeTempFsEngine();
        try {
            const projectStore = new ProjectStore({ directoriesByHandle: () => h.dirs });
            const worldId = createNativeId('world');
            const worldRevisionId = createNativeId('worldRevision');
            const knowledgeBaseId = createNativeId('knowledgeBase');
            const knowledgeRevisionId = createNativeId('knowledgeRevision');
            const knowledgeEntryId = createNativeId('knowledgeEntry');
            const knowledgeBindingId = createNativeId('knowledgeBinding');
            const assetId = createNativeId('asset');
            const projectId = createNativeId('project');
            const packageId = createNativeId('package');
            const entryPointId = createNativeId('entryPoint');

            const source = {
                format: 'atria-project-source',
                schemaVersion: 1,
                project: { projectId, packageId, displayName: 'Project-owned content' },
                package: {
                    name: 'Project-only Work',
                    version: '1.0.0',
                    actors: [],
                    entryPoints: [{
                        entryPointId,
                        displayName: 'Main',
                        actorIds: [],
                        worldIds: [worldId],
                        primaryWorldId: worldId,
                        knowledgeBindingIds: [knowledgeBindingId],
                    }],
                    capabilities: ['narrative', 'knowledge'],
                    permissions: [],
                },
                worlds: [{
                    world: {
                        worldId,
                        displayName: 'Project World',
                        currentRevisionId: worldRevisionId,
                    },
                    revision: {
                        worldId,
                        worldRevisionId,
                        baseline: { location: 'project' },
                        knowledgeBindingIds: [knowledgeBindingId],
                        assetIds: [assetId],
                        metadata: {},
                    },
                }],
                knowledge: [{
                    knowledgeBase: {
                        knowledgeBaseId,
                        displayName: 'Project Knowledge',
                        currentRevisionId: knowledgeRevisionId,
                    },
                    revision: {
                        knowledgeBaseId,
                        knowledgeRevisionId,
                        entryIds: [knowledgeEntryId],
                        metadata: {},
                    },
                    entries: [{
                        knowledgeEntryId,
                        content: 'Project-owned exact knowledge.',
                        metadata: {},
                    }],
                }],
                knowledgeBindings: [{
                    knowledgeBindingId,
                    source: {
                        kind: 'project',
                        knowledgeBaseId,
                        knowledgeRevisionId,
                    },
                    enabled: true,
                    mode: 'augment',
                    metadata: {},
                }],
                dependencies: {
                    worlds: [],
                    knowledge: [],
                    knowledgeBindings: [],
                },
                assetFiles: [{
                    assetId,
                    path: 'assets/project.txt',
                    mediaType: 'text/plain',
                    logicalName: 'project.txt',
                }],
            };
            const assetBytes = Buffer.from('project asset bytes');
            await projectStore.create(h.handle, source, {
                files: new Map([['assets/project.txt', assetBytes]]),
            });

            const built = await buildProjectPackage({
                handle: h.handle,
                projectId,
                projectStore,
                worldRepo: new WorldRepo({ engine: h.engine }),
                knowledgeRepo: new KnowledgeRepo({ engine: h.engine }),
                assetStore: new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs }),
            });

            expect(built.manifest.worlds[0].revision.baseline)
                .toEqual({ location: 'project' });
            expect(built.manifest.knowledge[0].entries[0].content)
                .toBe('Project-owned exact knowledge.');
            expect(built.manifest.knowledgeBindings[0].source.kind)
                .toBe('package');
            expect(built.manifest.assets[0]).toMatchObject({
                assetId,
                contentHash: digest(assetBytes),
                size: assetBytes.length,
            });
        } finally {
            await h.cleanup();
        }
    });
});

describe('N2 Native Studio project/preview seams', () => {
    test('routes Studio by projectId and keeps previews outside SessionRepo authority', async () => {
        const h = await makeTempFsEngine();
        try {
            const deps = await seedAuthoringLibrary(h);
            const projectStore = new ProjectStore({ directoriesByHandle: () => h.dirs });
            const source = projectSource(deps);
            await projectStore.create(h.handle, source);
            const built = await buildProjectPackage({
                handle: h.handle,
                projectId: source.project.projectId,
                projectStore,
                worldRepo: deps.worldRepo,
                knowledgeRepo: deps.knowledgeRepo,
                assetStore: deps.assetStore,
            });

            const router = new StudioProjectRouter({ projectStore });
            const route = await router.open(h.handle, source.project.projectId);
            expect(route).toEqual(expect.objectContaining({
                surface: 'studio',
                projectId: source.project.projectId,
                packageId: source.project.packageId,
            }));
            expect(route).not.toHaveProperty('characterId');

            const preview = new StudioPreviewHost({
                previewIdFactory: () => '11111111-2222-4333-8444-555555555555',
            }).create({
                projectId: source.project.projectId,
                archive: built.archive,
            });
            expect(preview).toEqual(expect.objectContaining({
                kind: 'studio-preview',
                projectId: source.project.projectId,
                packageId: source.project.packageId,
                persisted: false,
            }));
            expect(preview.previewId).toMatch(/^preview_/);
            expect(preview.previewId).not.toMatch(/^ses_/);

            // Creating a preview does not create a Native Session resource.
            const sessions = await h.engine.withTransaction(h.handle, tx => tx.listResources({
                kind: 'atri_session',
                handle: h.handle,
            }));
            expect(sessions).toEqual([]);
        } finally {
            await h.cleanup();
        }
    });
});
