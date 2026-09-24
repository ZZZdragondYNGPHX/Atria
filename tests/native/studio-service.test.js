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

function projectSource(overrides = {}) {
    const projectId = overrides.projectId || createNativeId('project');
    const packageId = overrides.packageId || createNativeId('package');
    return {
        format: 'atria-project-source',
        schemaVersion: 1,
        project: {
            projectId,
            packageId,
            displayName: 'A1 Project',
            createdAt: 10,
            updatedAt: 10,
        },
        package: {
            name: 'A1 Work',
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

function makeService(h, options = {}) {
    const projectStore = new ProjectStore({ directoriesByHandle: () => h.dirs });
    const worldRepo = new WorldRepo({ engine: h.engine });
    const knowledgeRepo = new KnowledgeRepo({ engine: h.engine });
    const assetStore = new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs });
    return {
        projectStore,
        service: new StudioService({
            projectStore,
            worldRepo,
            knowledgeRepo,
            assetStore,
            gitClient: createGitClient({ backend: 'builtin' }),
            previewHost: new StudioPreviewHost(),
            ...options,
        }),
    };
}

describe('A1 Native StudioService authoring boundary', () => {
    test('project deletion rejects stale revision and removes only the chosen project source', async () => {
        const h = await makeTempFsEngine();
        try {
            const { service } = makeService(h);
            const source = projectSource(); const other = projectSource();
            const created = await service.createProject(h.handle, source);
            await service.createProject(h.handle, other);
            const changed = await service.writeSource(h.handle, source.project.projectId, {
                path: 'notes.txt', content: 'new work', baseRevision: created.revision.revision,
                origin: { kind: 'human', id: 'test' },
            });
            await expect(service.deleteProject(h.handle, source.project.projectId, created.revision.revision)).rejects.toThrow('project_revision_conflict');
            expect((await service.getProject(h.handle, source.project.projectId)).source.project.projectId).toBe(source.project.projectId);
            await expect(service.deleteProject(h.handle, source.project.projectId, changed.changeSet.resultingRevision)).resolves.toBe(true);
            await expect(service.getProject(h.handle, source.project.projectId)).rejects.toThrow();
            expect((await service.getProject(h.handle, other.project.projectId)).source.project.projectId).toBe(other.project.projectId);
        } finally { await h.cleanup(); }
    });

    test('routes human and agent source CRUD through Authoring Workspace/ChangeSet and rejects stale revisions', async () => {
        const h = await makeTempFsEngine();
        try {
            const { service } = makeService(h);
            const source = projectSource();
            const created = await service.createProject(h.handle, source);
            const baseRevision = created.revision.revision;

            const written = await service.writeSource(h.handle, source.project.projectId, {
                path: 'runtime/main.txt',
                content: 'alpha',
                baseRevision,
                origin: { kind: 'human', id: 'human_1' },
            });
            expect(written.changeSet.validation.status).toBe('passed');
            expect(written.changeSet.operations[0].origin.kind).toBe('human');
            expect(written.changeSet.resultingRevision).not.toBe(baseRevision);
            expect(written.changes[0]).toMatchObject({
                kind: 'write',
                path: 'runtime/main.txt',
                before: { exists: false },
                after: { exists: true, size: 5 },
            });

            const moved = await service.moveSource(h.handle, source.project.projectId, {
                path: 'runtime/main.txt',
                toPath: 'runtime/story.txt',
                baseRevision: written.changeSet.resultingRevision,
                origin: { kind: 'agent', id: 'project_agent' },
            });
            expect(moved.changeSet.operations[0].origin.kind).toBe('agent');
            expect((await service.readSource(
                h.handle,
                source.project.projectId,
                'runtime/story.txt',
            )).content).toBe(Buffer.from('alpha').toString('base64'));

            await expect(service.writeSource(h.handle, source.project.projectId, {
                path: 'runtime/stale.txt',
                content: 'must not land',
                baseRevision,
                origin: { kind: 'agent', id: 'project_agent' },
            })).rejects.toMatchObject({
                name: 'ConflictError',
                code: 'project_revision_conflict',
                details: {
                    code: 'project_revision_conflict',
                    projectId: source.project.projectId,
                    expectedRevision: baseRevision,
                    actualRevision: moved.changeSet.resultingRevision,
                },
            });
            expect(await service.listSources(h.handle, source.project.projectId))
                .not.toEqual(expect.arrayContaining([expect.objectContaining({ path: 'runtime/stale.txt' })]));

            const removed = await service.deleteSource(h.handle, source.project.projectId, {
                path: 'runtime/story.txt',
                baseRevision: moved.changeSet.resultingRevision,
                origin: { kind: 'human', id: 'human_1' },
            });
            expect(removed.changeSet.validation.status).toBe('passed');
            expect(await service.listSources(h.handle, source.project.projectId)).toEqual([]);

            const history = await service.history(h.handle, source.project.projectId);
            expect(history.length).toBeGreaterThanOrEqual(4);
            expect(history[0].message).toMatch(/Atria Studio ChangeSet/);
            const inspected = await service.diff(
                h.handle,
                source.project.projectId,
                moved.changeSet.resultingRevision,
            );
            expect(inspected.revision).toBe(moved.changeSet.resultingRevision);
            expect(inspected.diff).toContain('runtime/');
        } finally {
            h.cleanup();
        }
    });

    test('batch execution rolls back all ProjectStore source changes when validation fails', async () => {
        const h = await makeTempFsEngine();
        try {
            const { service } = makeService(h, {
                validators: [async ({ files }) => (
                    files.some(item => item.path === 'invalid.txt')
                        ? [{
                            severity: 'error',
                            code: 'studio.invalid.fixture',
                            message: 'Fixture validator rejected invalid.txt',
                            path: 'invalid.txt',
                        }]
                        : []
                )],
            });
            const source = projectSource();
            const created = await service.createProject(h.handle, source);
            const origin = { kind: 'agent', id: 'agent_1' };
            const workspace = service.createWorkspace({
                projectId: source.project.projectId,
                baseRevision: created.revision.revision,
                origin,
                operations: [
                    {
                        operationId: 'operation_batch_1',
                        operationType: 'source.write',
                        target: { path: 'ok.txt' },
                        input: { content: 'first' },
                        origin,
                    },
                    {
                        operationId: 'operation_batch_2',
                        operationType: 'source.write',
                        target: { path: 'invalid.txt' },
                        input: { content: 'second' },
                        origin,
                    },
                ],
            });

            const inspected = await service.inspectWorkspace(h.handle, workspace);
            expect(inspected.changes).toHaveLength(2);
            expect(inspected.changes.every(change => change.before.exists === false)).toBe(true);

            const result = await service.executeWorkspace(h.handle, workspace);
            expect(result.changeSet.validation).toMatchObject({
                status: 'failed',
                diagnostics: [expect.objectContaining({ code: 'studio.invalid.fixture' })],
            });
            expect(result.changeSet.resultingRevision).toBeNull();
            expect(await service.listSources(h.handle, source.project.projectId)).toEqual([]);
            expect((await service.getRevision(h.handle, source.project.projectId)).revision)
                .toBe(created.revision.revision);
        } finally {
            h.cleanup();
        }
    });

    test('operation errors roll back earlier operations in the same batch', async () => {
        const h = await makeTempFsEngine();
        try {
            const { service } = makeService(h);
            const source = projectSource();
            const created = await service.createProject(h.handle, source);
            const origin = { kind: 'human', id: 'human_1' };
            const workspace = service.createWorkspace({
                projectId: source.project.projectId,
                baseRevision: created.revision.revision,
                origin,
                operations: [
                    {
                        operationId: 'operation_rollback_1',
                        operationType: 'source.write',
                        target: { path: 'temporary.txt' },
                        input: { content: 'temporary' },
                        origin,
                    },
                    {
                        operationId: 'operation_rollback_2',
                        operationType: 'source.move',
                        target: { path: 'missing.txt' },
                        input: { toPath: 'other.txt' },
                        origin,
                    },
                ],
            });

            await expect(service.executeWorkspace(h.handle, workspace))
                .rejects.toMatchObject({ name: 'NotFoundError' });
            expect(await service.listSources(h.handle, source.project.projectId)).toEqual([]);
            expect((await service.getRevision(h.handle, source.project.projectId)).revision)
                .toBe(created.revision.revision);
        } finally {
            h.cleanup();
        }
    });

    test('exposes build, preflight, preview and simulation seams without creating Session authority', async () => {
        const h = await makeTempFsEngine();
        try {
            const simulationRunner = async ({ projectId, revision }) => ({
                projectId,
                revision: revision.revision,
                trace: ['validated'],
            });
            const { service } = makeService(h, { simulationRunner });
            const source = projectSource();
            const created = await service.createProject(h.handle, source);

            const preflight = await service.preflightProject(h.handle, source.project.projectId, {
                baseRevision: created.revision.revision,
            });
            expect(preflight.projectId).toBe(source.project.projectId);
            expect(preflight.manifest.packageId).toBe(source.project.packageId);

            const built = await service.buildProject(h.handle, source.project.projectId, {
                baseRevision: created.revision.revision,
            });
            expect(Buffer.isBuffer(built.built.archive)).toBe(true);
            expect(built.built.packageVersion.packageId).toBe(source.project.packageId);

            const previewed = await service.previewProject(h.handle, source.project.projectId, {
                baseRevision: created.revision.revision,
            });
            expect(previewed.preview).toMatchObject({
                projectId: source.project.projectId,
                packageId: source.project.packageId,
                persisted: false,
            });
            expect(service.listPreviews(h.handle, source.project.projectId)).toHaveLength(1);
            expect(service.closePreview(h.handle, previewed.preview.previewId)).toBe(true);

            const simulated = await service.simulateProject(h.handle, source.project.projectId, {
                baseRevision: created.revision.revision,
                scenario: 'smoke',
            });
            expect(simulated).toMatchObject({
                projectId: source.project.projectId,
                status: 'completed',
                result: { trace: ['validated'] },
            });

            const sessions = await h.engine.withTransaction(h.handle, tx => tx.listResources({
                kind: 'atri_session',
                handle: h.handle,
            }));
            expect(sessions).toEqual([]);
        } finally {
            h.cleanup();
        }
    });
});
