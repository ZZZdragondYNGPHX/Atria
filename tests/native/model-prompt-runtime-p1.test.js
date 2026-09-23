import { describe, expect, test } from '@jest/globals';

import { createGitClient } from '../../src/git/client.js';
import {
    AssetStore,
    KnowledgeRepo,
    ProjectStore,
    StudioPreviewHost,
    StudioService,
    VersionedJsonResourceHandler,
    WorldRepo,
    createNativeId,
} from '../../src/native/index.js';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';

function promptModule(id, revision, body) {
    return {
        schemaVersion: 1,
        promptModuleId: id,
        revision,
        displayName: 'Shared Prompt Module',
        target: 'prompt.system',
        stages: ['stage.main'],
        priority: 0,
        body,
        provenance: [{ source: 'atria.test', ref: revision }],
    };
}

function generationProfile(id, revision) {
    return {
        schemaVersion: 1,
        generationProfileId: id,
        revision,
        displayName: 'Narrative Generation',
        provenance: [{ source: 'atria.test', ref: revision }],
    };
}

function promptProgram(id, revision, moduleRef) {
    return {
        schemaVersion: 1,
        promptProgramId: id,
        revision,
        displayName: 'Narrative Program',
        stages: [{
            stageId: 'stage.main',
            targets: ['prompt.system'],
            moduleRefs: [moduleRef],
        }],
        provenance: [{ source: 'atria.test', ref: revision }],
    };
}

function projectSource({ programRef, generationRef, missingRef = null } = {}) {
    return {
        format: 'atria-project-source',
        schemaVersion: 1,
        project: {
            projectId: createNativeId('project'),
            packageId: createNativeId('package'),
            displayName: 'P1 Project',
            createdAt: 1,
            updatedAt: 1,
        },
        package: {
            name: 'P1 Work',
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
            ...(programRef && generationRef ? {
                runtime: {
                    modelPrompt: {
                        schemaVersion: 1,
                        roles: [{
                            role: 'role.narrator',
                            requiredCapabilities: [],
                            optionalCapabilities: [],
                            promptProgramRef: programRef,
                            generationProfileRef: generationRef,
                        }],
                    },
                },
            } : {}),
        },
        worlds: [],
        knowledge: [],
        knowledgeBindings: [],
        resources: [],
        dependencies: {
            worlds: [],
            knowledge: [],
            knowledgeBindings: [],
            assets: [],
            resources: missingRef ? [missingRef] : [],
        },
        assetFiles: [],
    };
}

function makeService(h) {
    const projectStore = new ProjectStore({ directoriesByHandle: () => h.dirs });
    const worldRepo = new WorldRepo({ engine: h.engine });
    const knowledgeRepo = new KnowledgeRepo({ engine: h.engine });
    const assetStore = new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs });
    const versionedJsonResources = new VersionedJsonResourceHandler({ engine: h.engine });
    const service = new StudioService({
        projectStore,
        worldRepo,
        knowledgeRepo,
        assetStore,
        versionedJsonResources,
        gitClient: createGitClient({ backend: 'builtin' }),
        previewHost: new StudioPreviewHost(),
    });
    return { service, projectStore, versionedJsonResources };
}

describe('P1 A2 Library / Graph / Package integration', () => {
    test('keeps exact revisions across Library, A1 authoring, derived graph and Package closure', async () => {
        const h = await makeTempFsEngine();
        try {
            const { service, versionedJsonResources } = makeService(h);
            const moduleId = createNativeId('promptModule');
            const programId = createNativeId('promptProgram');
            const generationId = createNativeId('generationProfile');
            await versionedJsonResources.commit(
                h.handle,
                'core.prompt-module',
                promptModule(moduleId, 'module-v1', 'v1'),
            );
            await versionedJsonResources.commit(
                h.handle,
                'core.prompt-module',
                promptModule(moduleId, 'module-v2', 'v2'),
            );
            await versionedJsonResources.commit(
                h.handle,
                'core.generation-profile',
                generationProfile(generationId, 'generation-v1'),
            );
            await versionedJsonResources.commit(
                h.handle,
                'core.prompt-program',
                promptProgram(programId, 'program-v1', {
                    resourceType: 'core.prompt-module',
                    resourceId: moduleId,
                    revision: 'module-v1',
                    scope: 'library',
                }),
            );

            const programRef = {
                resourceType: 'core.prompt-program',
                resourceId: programId,
                revision: 'program-v1',
                scope: 'library',
            };
            const generationRef = {
                resourceType: 'core.generation-profile',
                resourceId: generationId,
                revision: 'generation-v1',
                scope: 'library',
            };
            const source = projectSource({ programRef, generationRef });
            const created = await service.createProject(h.handle, source);

            const listed = await service.listLibraryResources(h.handle, {
                resourceType: 'core.prompt-module',
            });
            expect(listed).toHaveLength(1);
            expect(listed[0].revisions).toEqual(['module-v1', 'module-v2']);
            const pinned = await service.getLibraryResource(h.handle, {
                resourceType: 'core.prompt-module',
                resourceId: moduleId,
                revision: 'module-v1',
            });
            expect(pinned.snapshot.body).toBe('v1');
            expect(pinned.origin).toEqual({ scope: 'library' });

            const attached = await service.attachLibraryResource(h.handle, source.project.projectId, {
                resourceType: 'core.prompt-module',
                resourceId: moduleId,
                revision: 'module-v1',
                baseRevision: created.revision.revision,
                origin: { kind: 'human', id: 'p1-author' },
            });
            const updated = await service.updateLibraryResource(h.handle, source.project.projectId, {
                resourceType: 'core.prompt-module',
                resourceId: moduleId,
                fromRevision: 'module-v1',
                toRevision: 'module-v2',
                baseRevision: attached.changeSet.resultingRevision,
                origin: { kind: 'human', id: 'p1-author' },
            });
            const forked = await service.forkLibraryResource(h.handle, source.project.projectId, {
                resourceType: 'core.generation-profile',
                resourceId: generationId,
                revision: 'generation-v1',
                displayName: 'Project Generation Fork',
                baseRevision: updated.changeSet.resultingRevision,
                origin: { kind: 'human', id: 'p1-author' },
            });

            const saved = (await service.getProject(h.handle, source.project.projectId)).source;
            expect(saved.dependencies.resources).toContainEqual({
                resourceType: 'core.prompt-module',
                resourceId: moduleId,
                revision: 'module-v2',
                scope: 'library',
            });
            expect(saved.resources).toHaveLength(1);
            expect(saved.resources[0].resource.provenance).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    source: 'atria.resource-fork',
                    ref: `library:core.generation-profile:${generationId}@generation-v1`,
                }),
            ]));

            const forward = await service.getResourceReferences(h.handle, programRef);
            expect(forward).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    edge: expect.objectContaining({ kind: 'references-exact' }),
                    node: expect.objectContaining({
                        resourceType: 'core.prompt-module',
                        resourceId: moduleId,
                        revision: 'module-v1',
                    }),
                }),
            ]));
            const reverse = await service.getResourceReferences(h.handle, {
                resourceType: 'core.prompt-module',
                resourceId: moduleId,
                revision: 'module-v2',
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
            expect(await service.inspectResourceDelete(h.handle, {
                resourceType: 'core.prompt-module',
                resourceId: moduleId,
                revision: 'module-v2',
            })).toMatchObject({ safe: false });

            const closure = await service.resolveResourceClosure(h.handle, source.project.projectId);
            const closureIdentities = closure.closure.resources.map(item => (
                item.resourceType + ':' + (
                    item.resource.promptModuleId
                    || item.resource.promptProgramId
                    || item.resource.generationProfileId
                ) + '@' + item.resource.revision
            ));
            expect(closureIdentities).toContain(`core.prompt-module:${moduleId}@module-v1`);
            expect(closureIdentities).toContain(`core.prompt-module:${moduleId}@module-v2`);
            expect(closureIdentities).toContain(`core.prompt-program:${programId}@program-v1`);

            const built = await service.buildProject(h.handle, source.project.projectId, {
                baseRevision: forked.changeSet.resultingRevision,
            });
            const packageVersionId = built.built.packageVersion.packageVersionId;
            const role = built.built.manifest.runtime.modelPrompt.roles[0];
            expect(role.promptProgramRef).toMatchObject({
                scope: 'package',
                packageId: source.project.packageId,
                packageVersionId,
                resourceId: programId,
                revision: 'program-v1',
            });
            expect(role.generationProfileRef).toMatchObject({
                scope: 'package',
                packageId: source.project.packageId,
                packageVersionId,
                resourceId: generationId,
                revision: 'generation-v1',
            });
            expect(built.built.manifest.resources.every(item => (
                item.origin.scope === 'package'
                && item.origin.packageId === source.project.packageId
                && item.origin.packageVersionId === packageVersionId
            ))).toBe(true);
            const packagedProgram = built.built.manifest.resources.find(
                item => item.resourceType === 'core.prompt-program' && item.resource.promptProgramId === programId,
            );
            expect(packagedProgram.resource.stages[0].moduleRefs[0]).toMatchObject({
                scope: 'package',
                packageId: source.project.packageId,
                packageVersionId,
                resourceId: moduleId,
                revision: 'module-v1',
            });
        } finally {
            await h.cleanup();
        }
    });

    test('fails closed when an exact Library dependency revision is missing', async () => {
        const h = await makeTempFsEngine();
        try {
            const { service } = makeService(h);
            const missingRef = {
                resourceType: 'core.prompt-module',
                resourceId: createNativeId('promptModule'),
                revision: 'missing-exact-revision',
                scope: 'library',
            };
            const source = projectSource({ missingRef });
            await service.createProject(h.handle, source);
            await expect(service.resolveResourceClosure(h.handle, source.project.projectId))
                .rejects.toMatchObject({
                    name: 'NativeDependencyError',
                    code: 'native_model_prompt_dependency_missing',
                });
        } finally {
            await h.cleanup();
        }
    });
});
