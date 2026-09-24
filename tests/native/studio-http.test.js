import express from 'express';
import request from 'supertest';
import { describe, expect, jest, test } from '@jest/globals';

import { createNativeStudioRouter } from '../../src/endpoints/native-studio.js';
import { ConflictError } from '../../src/storage/errors.js';

function makeStudio() {
    return {
        listProjects: jest.fn(async () => [{ project: { projectId: 'project_test' } }]),
        createProject: jest.fn(async (_handle, source) => ({ source, revision: { revision: 'rev_create' } })),
        getProject: jest.fn(async (_handle, projectId) => ({ source: { project: { projectId } } })),
        deleteProject: jest.fn(async () => true),
        getRevision: jest.fn(async (_handle, projectId) => ({ projectId, revision: 'rev_current' })),
        listSources: jest.fn(async () => [{ path: 'src/main.txt', size: 3 }]),
        readSource: jest.fn(async (_handle, _projectId, path) => ({
            path,
            size: 3,
            encoding: 'base64',
            content: Buffer.from('abc').toString('base64'),
        })),
        writeSource: jest.fn(async () => ({ changeSet: { resultingRevision: 'rev_write' } })),
        moveSource: jest.fn(async () => ({ changeSet: { resultingRevision: 'rev_move' } })),
        deleteSource: jest.fn(async () => ({ changeSet: { resultingRevision: 'rev_delete' } })),
        saveProjectSource: jest.fn(async () => ({ changeSet: { resultingRevision: 'rev_manifest' } })),
        createWorkspace: jest.fn(value => ({ workspaceId: value.workspaceId || 'workspace_test', ...value })),
        inspectWorkspace: jest.fn(async workspace => ({ workspace, changes: [] })),
        executeWorkspace: jest.fn(async workspace => ({
            changeSet: {
                workspaceId: workspace.workspaceId,
                resultingRevision: 'rev_batch',
            },
            changes: [],
        })),
        validateProject: jest.fn(async () => ({ status: 'passed', diagnostics: [] })),
        history: jest.fn(async () => [{ fullHash: 'rev_current', message: 'Atria Studio ChangeSet' }]),
        diff: jest.fn(async (_handle, projectId, revision) => ({ projectId, revision, diff: 'diff' })),
        preflightProject: jest.fn(async (_handle, projectId) => ({
            projectId,
            revision: { revision: 'rev_current' },
            manifest: { packageId: 'package_test' },
            packageVersion: { packageVersionId: 'package_version_test' },
            preflight: { requiredPermissions: [] },
        })),
        buildProject: jest.fn(async () => ({
            revision: { revision: 'rev_current' },
            built: {
                archive: Buffer.from('atria-package'),
                manifest: { packageId: 'package_test' },
                packageVersion: { packageVersionId: 'package_version_test' },
                preflight: { requiredPermissions: [] },
            },
        })),
        previewProject: jest.fn(async () => ({
            revision: { revision: 'rev_current' },
            preview: { previewId: 'preview_test', persisted: false },
        })),
        simulateProject: jest.fn(async () => ({
            projectId: 'project_test',
            revision: { revision: 'rev_current' },
            status: 'unavailable',
            code: 'native_studio_simulation_unavailable',
        })),
        listPreviews: jest.fn(() => [{ previewId: 'preview_test', persisted: false }]),
        closePreview: jest.fn(() => true),
    };
}

function appFor(studio, { authenticated = true } = {}) {
    const app = express();
    app.use(express.json({ limit: '4mb' }));
    app.use((req, _res, next) => {
        if (authenticated) req.user = { profile: { handle: 'u' } };
        next();
    });
    app.use(createNativeStudioRouter(() => ({ studio })));
    return app;
}

describe('A1 Native Studio HTTP boundary', () => {
    test('reference queries retain ownership scope and operation preparation cannot execute writes', async () => {
        const studio = makeStudio();
        studio.getResourceReferences = jest.fn(async () => []); studio.inspectResourceDelete = jest.fn(async () => ({ safe: false }));
        studio.prepareAuthoringOperation = jest.fn(async (_handle, _projectId, operation) => ({ ...operation, input: { ...operation.input, derivativeResourceId: 'prepared' } }));
        const app = appFor(studio);
        const ref = { resourceType: 'core.world', resourceId: 'world', revision: 'exact', scope: 'package', packageId: 'package', packageVersionId: 'version' };
        await request(app).post('/resources/references').send({ ...ref, reverse: true }).expect(200);
        expect(studio.getResourceReferences).toHaveBeenCalledWith('u', ref, { reverse: true });
        await request(app).post('/resources/delete-safety').send(ref).expect(200);
        expect(studio.inspectResourceDelete).toHaveBeenCalledWith('u', ref);
        const operation = { operationType: 'resource.fork', target: { resourceType: 'core.world', resourceId: 'world' }, input: { revision: 'exact' } };
        const response = await request(app).post('/projects/project/operations/prepare').send(operation).expect(200);
        expect(response.body.input.derivativeResourceId).toBe('prepared');
        expect(studio.prepareAuthoringOperation).toHaveBeenCalledWith('u', 'project', operation);
        expect(studio.executeWorkspace).not.toHaveBeenCalled();
    });
    test('uses authenticated handle and keeps source mutation on StudioService operations', async () => {
        const studio = makeStudio();
        const app = appFor(studio);

        expect((await request(app).get('/projects')).status).toBe(200);
        expect(studio.listProjects).toHaveBeenCalledWith('u');
        await request(app).delete('/projects/project_test').send({ baseRevision: 'reviewed_revision', handle: 'other-user' }).expect(200);
        expect(studio.deleteProject).toHaveBeenCalledWith('u', 'project_test', 'reviewed_revision');

        const write = await request(app)
            .put('/projects/project_test/source')
            .send({
                path: 'src/main.txt',
                content: 'hello',
                baseRevision: 'rev_base',
                origin: { kind: 'human', id: 'human_1' },
                handle: 'other-user',
            });
        expect(write.status).toBe(200);
        expect(studio.writeSource).toHaveBeenCalledWith('u', 'project_test', expect.objectContaining({
            path: 'src/main.txt',
            baseRevision: 'rev_base',
        }));

        const move = await request(app)
            .post('/projects/project_test/source/move')
            .send({
                path: 'src/main.txt',
                toPath: 'src/story.txt',
                baseRevision: 'rev_write',
                origin: { kind: 'agent', id: 'agent_1' },
            });
        expect(move.status).toBe(200);
        expect(studio.moveSource).toHaveBeenCalledWith('u', 'project_test', expect.objectContaining({
            toPath: 'src/story.txt',
        }));

        const read = await request(app).get('/projects/project_test/source?path=src/story.txt');
        expect(Buffer.from(read.body.content, 'base64').toString()).toBe('abc');
    });

    test('projects, batch workspace execution and change inspection share the authoring boundary', async () => {
        const studio = makeStudio();
        const app = appFor(studio);

        const create = await request(app)
            .post('/projects')
            .send({
                source: { project: { projectId: 'project_test' } },
                files: [{ path: 'src/a.txt', content: 'alpha', encoding: 'utf8' }],
            });
        expect(create.status).toBe(200);
        expect(studio.createProject).toHaveBeenCalledWith(
            'u',
            { project: { projectId: 'project_test' } },
            { files: expect.any(Map) },
        );
        const files = studio.createProject.mock.calls[0][2].files;
        expect(files.get('src/a.txt').toString()).toBe('alpha');

        const body = {
            workspaceId: 'workspace_agent',
            baseRevision: 'rev_base',
            origin: { kind: 'agent', id: 'agent_1' },
            operations: [{
                operationId: 'operation_1',
                operationType: 'source.write',
                target: { path: 'src/a.txt' },
                input: { content: 'beta' },
                origin: { kind: 'agent', id: 'agent_1' },
            }],
        };
        const inspect = await request(app)
            .post('/projects/project_test/workspaces/inspect')
            .send(body);
        expect(inspect.status).toBe(200);
        expect(studio.createWorkspace).toHaveBeenCalledWith(expect.objectContaining({
            projectId: 'project_test',
            baseRevision: 'rev_base',
            origin: body.origin,
            operations: body.operations,
        }));
        expect(studio.inspectWorkspace).toHaveBeenCalledWith(
            'u',
            expect.objectContaining({ workspaceId: 'workspace_agent' }),
        );

        const execute = await request(app)
            .post('/projects/project_test/workspaces/execute')
            .send(body);
        expect(execute.status).toBe(200);
        expect(studio.executeWorkspace).toHaveBeenCalledWith(
            'u',
            expect.objectContaining({ workspaceId: 'workspace_agent' }),
        );
    });

    test('surfaces project_revision_conflict as HTTP 409 without rewriting the request', async () => {
        const studio = makeStudio();
        studio.writeSource.mockRejectedValue(new ConflictError('project_revision_conflict', {
            code: 'project_revision_conflict',
            projectId: 'project_test',
            expectedRevision: 'rev_old',
            actualRevision: 'rev_new',
        }));
        const app = appFor(studio);

        const response = await request(app)
            .put('/projects/project_test/source')
            .send({
                path: 'src/main.txt',
                content: 'stale',
                baseRevision: 'rev_old',
                origin: { kind: 'agent', id: 'agent_1' },
            });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({
            error: 'project_revision_conflict',
            details: {
                code: 'project_revision_conflict',
                projectId: 'project_test',
                expectedRevision: 'rev_old',
                actualRevision: 'rev_new',
            },
        });
        expect(studio.writeSource).toHaveBeenCalledTimes(1);
    });

    test('exposes validation/history/build/preview/simulation seams and rejects unauthenticated access', async () => {
        const studio = makeStudio();
        const app = appFor(studio);

        expect((await request(app).post('/projects/project_test/validate').send({})).body.status).toBe('passed');
        expect((await request(app).get('/projects/project_test/history?limit=10')).status).toBe(200);
        expect(studio.history).toHaveBeenCalledWith('u', 'project_test', { limit: 10 });

        const built = await request(app)
            .post('/projects/project_test/build')
            .send({ baseRevision: 'rev_current' });
        expect(built.status).toBe(200);
        expect(Buffer.from(built.body.data, 'base64').toString()).toBe('atria-package');
        expect(built.body.fileName).toBe('project_test.atria');

        expect((await request(app).post('/projects/project_test/preview').send({})).body.preview.persisted)
            .toBe(false);
        expect((await request(app).post('/projects/project_test/simulate').send({})).body.status)
            .toBe('unavailable');
        expect((await request(appFor(makeStudio(), { authenticated: false })).get('/projects')).status)
            .toBe(401);
    });
});
