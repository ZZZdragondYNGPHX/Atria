import express from 'express';
import request from 'supertest';
import { describe, expect, jest, test } from '@jest/globals';

import { createNativeStudioRouter } from '../../src/endpoints/native-studio.js';

function appFor(studio) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.user = { profile: { handle: 'resource-user' } };
        next();
    });
    app.use(createNativeStudioRouter(() => ({ studio })));
    return app;
}

describe('A2 Native Studio resource HTTP surface', () => {
    test('exposes read-only Registry/Library/Graph discovery for Studio and Project Agent', async () => {
        const studio = {
            getResourceRegistry: jest.fn(() => ({ graphMode: 'derived-readonly', descriptors: [] })),
            listLibraryResources: jest.fn(async () => [{ resourceType: 'core.world', resourceId: 'world_x' }]),
            getResourceGraph: jest.fn(async () => ({ mode: 'derived-readonly', generation: 1, nodes: [], edges: [] })),
            queryResources: jest.fn(async () => []),
            getResourceReferences: jest.fn(async () => []),
            inspectResourceDelete: jest.fn(async () => ({ safe: false, blockers: [{ kind: 'resource-graph' }] })),
        };
        const app = appFor(studio);

        expect((await request(app).get('/resources/registry')).body.graphMode).toBe('derived-readonly');
        expect((await request(app).get('/library/resources?resourceType=core.world&search=world')).status).toBe(200);
        expect(studio.listLibraryResources).toHaveBeenCalledWith('resource-user', {
            resourceType: 'core.world',
            search: 'world',
        });

        expect((await request(app).get('/resources/graph')).body.mode).toBe('derived-readonly');
        expect((await request(app).get('/resources?ownership=project&search=quest')).status).toBe(200);
        expect(studio.queryResources).toHaveBeenCalledWith('resource-user', {
            ownership: 'project',
            search: 'quest',
        });

        const refs = await request(app).post('/resources/references').send({
            resourceType: 'core.world',
            resourceId: 'world_x',
            revision: 'worldv_x',
            reverse: true,
        });
        expect(refs.status).toBe(200);
        expect(studio.getResourceReferences).toHaveBeenCalledWith(
            'resource-user',
            { resourceType: 'core.world', resourceId: 'world_x', revision: 'worldv_x' },
            { reverse: true },
        );

        const safety = await request(app).post('/resources/delete-safety').send({
            resourceType: 'core.world',
            resourceId: 'world_x',
            revision: 'worldv_x',
        });
        expect(safety.status).toBe(200);
        expect(safety.body.safe).toBe(false);
    });

    test('routes Attach/Fork/Update through StudioService authoring operations and exposes build closure', async () => {
        const studio = {
            attachLibraryResource: jest.fn(async () => ({ changeSet: { resultingRevision: 'rev_attach' } })),
            forkLibraryResource: jest.fn(async () => ({ changeSet: { resultingRevision: 'rev_fork' } })),
            updateLibraryResource: jest.fn(async () => ({ changeSet: { resultingRevision: 'rev_update' } })),
            resolveResourceClosure: jest.fn(async () => ({ projectId: 'project_x', resources: [] })),
        };
        const app = appFor(studio);

        const attachBody = {
            resourceType: 'core.world',
            resourceId: 'world_x',
            revision: 'worldv_1',
            baseRevision: 'rev_base',
            origin: { kind: 'human', id: 'human_1' },
        };
        expect((await request(app).post('/projects/project_x/resources/attach').send(attachBody)).status).toBe(200);
        expect(studio.attachLibraryResource).toHaveBeenCalledWith('resource-user', 'project_x', attachBody);

        const forkBody = {
            resourceType: 'core.knowledge',
            resourceId: 'kb_x',
            revision: 'kbv_1',
            baseRevision: 'rev_attach',
            origin: { kind: 'agent', id: 'agent_1' },
        };
        expect((await request(app).post('/projects/project_x/resources/fork').send(forkBody)).status).toBe(200);
        expect(studio.forkLibraryResource).toHaveBeenCalledWith('resource-user', 'project_x', forkBody);

        const updateBody = {
            resourceType: 'core.world',
            resourceId: 'world_x',
            fromRevision: 'worldv_1',
            toRevision: 'worldv_2',
            baseRevision: 'rev_fork',
            origin: { kind: 'plugin', id: 'plugin.example' },
        };
        expect((await request(app).post('/projects/project_x/resources/update').send(updateBody)).status).toBe(200);
        expect(studio.updateLibraryResource).toHaveBeenCalledWith('resource-user', 'project_x', updateBody);

        expect((await request(app).get('/projects/project_x/resources/closure')).status).toBe(200);
        expect(studio.resolveResourceClosure).toHaveBeenCalledWith('resource-user', 'project_x');
    });
});

 test('Resource Bundle routes use the authenticated owner and preserve the reviewed token', async () => {
    const studio = { exportResourceBundle: jest.fn(async () => ({ format: 'atria-resource-bundle' })), preflightResourceBundle: jest.fn(async () => ({ canImport: true })), importResourceBundle: jest.fn(async () => ({ resources: [] })) };
    const app = appFor(studio), ref = { scope: 'library', resourceType: 'core.world', resourceId: 'world_a', revision: 'worldv_a' }, bundle = { root: ref }, token = { seed: 'reviewed' };
    expect((await request(app).post('/resources/bundle/export').send({ ref, handle: 'other' })).status).toBe(200);
    expect(studio.exportResourceBundle).toHaveBeenCalledWith('resource-user', ref);
    for (const operation of ['preflight', 'import']) {
        expect((await request(app).post('/resources/bundle/' + operation).send({ bundle, token, handle: 'other' })).status).toBe(200);
        expect(studio[operation + 'ResourceBundle']).toHaveBeenCalledWith('resource-user', bundle, token);
    }
    const unauthenticated = express(); unauthenticated.use(createNativeStudioRouter(() => ({ studio })));
    expect((await request(unauthenticated).post('/resources/bundle/import').send({ bundle, token })).status).toBe(401);
 });

test('Package original reads delegate exact identities under the authenticated owner', async () => {
    const studio = { getPackageLibraryResource: jest.fn(async (_handle, ref) => ({ ref, snapshot: {} })) };
    const ref = { scope: 'package', resourceType: 'core.world', resourceId: 'world_a', revision: 'worldv_a', packageId: 'pkg_a', packageVersionId: 'pkgv_a' };
    expect((await request(appFor(studio)).post('/resources/package-original').send({ ref, handle: 'other' })).body.ref).toEqual(ref);
    expect(studio.getPackageLibraryResource).toHaveBeenCalledWith('resource-user', ref);
});
