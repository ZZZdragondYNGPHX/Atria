import express from 'express';
import request from 'supertest';
import { describe, expect, jest, test } from '@jest/globals';

import { createNativeProductRouter } from '../../src/endpoints/native-product.js';
import { ConflictError } from '../../src/storage/errors.js';

function makeProduct() {
    return {
        listWorks: jest.fn(async () => [{ package: { packageId: 'pkg_test' } }]),
        getWork: jest.fn(async (_handle, packageId) => ({ package: { packageId } })),
        startWork: jest.fn(async (_handle, packageId) => ({ session: { packageId, sessionId: 'session_test' } })),
        deleteWork: jest.fn(async () => true),
        preflightPackageUpdate: jest.fn(async () => ({ packageId: 'pkg_preflight' })),
        installPackage: jest.fn(async () => ({ package: { packageId: 'pkg_installed' } })),
        listWorlds: jest.fn(async () => []),
        getWorld: jest.fn(async (_handle, worldId) => ({ world: { worldId } })),
        updateWorld: jest.fn(async (_handle, worldId, body) => ({ worldId, displayName: body.displayName })),
        deleteWorld: jest.fn(async () => true),
        listKnowledgeBases: jest.fn(async () => []),
        getKnowledgeBase: jest.fn(async (_handle, knowledgeBaseId) => ({ knowledgeBase: { knowledgeBaseId } })),
        updateKnowledgeBase: jest.fn(async (_handle, knowledgeBaseId, body) => ({
            knowledgeBaseId,
            displayName: body.displayName,
        })),
        deleteKnowledgeBase: jest.fn(async () => true),
        listSessions: jest.fn(async () => []),
        getSession: jest.fn(async (_handle, sessionId) => ({ snapshot: { session: { sessionId } } })),
        createSave: jest.fn(async () => ({ saveId: 'save_test' })),
        restoreSave: jest.fn(async () => ({ revision: { revisionId: 'rev_restored' } })),
        deleteSession: jest.fn(async () => true),
        promoteEmbeddedKnowledge: jest.fn(async () => ({ knowledgeBaseId: 'kb_promoted' })),
        exportSession: jest.fn(async () => Buffer.from('session-save')),
        exportSnapshot: jest.fn(async () => Buffer.from('snapshot-save')),
        preflightSaveImport: jest.fn(async () => ({ dependency: { status: 'ready' } })),
        importSave: jest.fn(async () => ({ session: { sessionId: 'session_imported' } })),
        listProjects: jest.fn(async () => []),
        getProject: jest.fn(async (_handle, projectId) => ({ source: { project: { projectId } }, files: [] })),
        createProject: jest.fn(async (_handle, source) => source),
        updateProjectDependencies: jest.fn(async (_handle, projectId, dependencies) => ({
            project: { projectId },
            dependencies,
        })),
        deleteProject: jest.fn(async () => true),
    };
}

function appFor(product, { authenticated = true } = {}) {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use((req, _res, next) => {
        if (authenticated) req.user = { profile: { handle: 'u' } };
        next();
    });
    app.use(createNativeProductRouter(() => ({ product })));
    return app;
}

test('binding management HTTP preserves exact identities and concurrency tokens', async () => {
    const product = {
        getKnowledgeBinding: jest.fn(async () => ({ binding: {} })),
        saveKnowledgeBinding: jest.fn(async () => ({ integrity: 'saved' })),
        deleteKnowledgeBinding: jest.fn(async () => true),
        attachKnowledgeBinding: jest.fn(async () => ({ worldRevisionId: 'next' })),
    };
    const app = appFor(product);
    await request(app).get('/knowledge-bindings/binding').expect(200);
    const input = { binding: { knowledgeBindingId: 'binding' }, expectedIntegrity: 'exact' };
    await request(app).put('/knowledge-bindings/binding').send(input).expect(200);
    expect(product.saveKnowledgeBinding).toHaveBeenCalledWith('u', 'binding', input);
    await request(app).delete('/knowledge-bindings/binding').send({ expectedIntegrity: 'exact' }).expect(200);
    expect(product.deleteKnowledgeBinding).toHaveBeenCalledWith('u', 'binding', { expectedIntegrity: 'exact' });
    await request(app).post('/knowledge-bindings/binding/worlds/world').send({ baseRevisionId: 'old', attached: false }).expect(200);
    expect(product.attachKnowledgeBinding).toHaveBeenCalledWith('u', 'binding', 'world', { baseRevisionId: 'old', attached: false });
});

test.each(['worlds', 'knowledge'])('%s historical revision actions use the authenticated owner', async path => {
    const product = { promoteLibraryRevision: jest.fn(async () => ({})), forkLibraryRevision: jest.fn(async () => ({})) };
    const app = appFor(product); const kind = path === 'worlds' ? 'world' : 'knowledge';
    const promote = { revisionId: 'selected', baseRevisionId: 'current' };
    await request(app).post(`/${path}/id/revision-actions/promote`).send(promote).expect(200);
    expect(product.promoteLibraryRevision).toHaveBeenCalledWith('u', kind, 'id', promote);
    const fork = { revisionId: 'selected', displayName: 'Fork', forkResourceId: 'new' };
    await request(app).post(`/${path}/id/revision-actions/fork`).send(fork).expect(201);
    expect(product.forkLibraryRevision).toHaveBeenCalledWith('u', kind, 'id', fork);
});

describe('N9 Native Product HTTP boundary', () => {
    test('sanitizes exception details while retaining exact blockers and invalid field context', async () => {
        const product = makeProduct();
        product.deleteWork.mockRejectedValue(new ConflictError('native_package_referenced', {
            packageId: 'pkg_test', password: 'hidden', stack: 'private trace',
            references: [{ sessionId: 'session_test', secret: 'hidden' }],
        }));
        const result = await request(appFor(product)).delete('/works/pkg_test');
        expect(result.body.details).toEqual({ packageId: 'pkg_test', references: [{ sessionId: 'session_test' }] });
        const invalid = await request(appFor(product)).post('/packages/preflight').send({ data: '%' });
        expect(invalid.status).toBe(400);
        expect(invalid.body.details).toEqual({ field: 'data' });
    });
    test('uses authenticated server handle and exposes Works / Sessions / Projects without repo dispatch', async () => {
        const product = makeProduct();
        const app = appFor(product);

        expect((await request(app).get('/works')).body[0].package.packageId).toBe('pkg_test');
        expect(product.listWorks).toHaveBeenCalledWith('u');

        const started = await request(app)
            .post('/works/pkg_test/start')
            .send({ entryPointId: 'entry_test', handle: 'other-user' });
        expect(started.status).toBe(200);
        expect(product.startWork).toHaveBeenCalledWith('u', 'pkg_test', expect.objectContaining({
            entryPointId: 'entry_test',
        }));

        const dependencies = { worlds: [], knowledge: [], knowledgeBindings: [] };
        const updated = await request(app)
            .put('/projects/project_test/dependencies')
            .send({ dependencies });
        expect(updated.status).toBe(200);
        expect(product.updateProjectDependencies).toHaveBeenCalledWith('u', 'project_test', dependencies);
    });

    test('updates mutable World/Knowledge metadata without exposing revision mutation routes', async () => {
        const product = makeProduct();
        const app = appFor(product);

        const world = await request(app)
            .put('/worlds/world_test')
            .send({ displayName: 'Renamed World' });
        expect(world.status).toBe(200);
        expect(product.updateWorld).toHaveBeenCalledWith('u', 'world_test', {
            displayName: 'Renamed World',
        });

        const knowledge = await request(app)
            .put('/knowledge/kb_test')
            .send({ displayName: 'Renamed Knowledge' });
        expect(knowledge.status).toBe(200);
        expect(product.updateKnowledgeBase).toHaveBeenCalledWith('u', 'kb_test', {
            displayName: 'Renamed Knowledge',
        });

        expect((await request(app).put('/worlds/world_test/revisions/rev_test').send({})).status).toBe(404);
        expect((await request(app).put('/knowledge/kb_test/revisions/rev_test').send({})).status).toBe(404);
    });

    test('decodes Package/Save archives and returns portable exports as base64', async () => {
        const product = makeProduct();
        const app = appFor(product);
        const data = Buffer.from('portable-binary').toString('base64');

        expect((await request(app).post('/packages/preflight').send({ data })).status).toBe(200);
        expect(Buffer.isBuffer(product.preflightPackageUpdate.mock.calls[0][1])).toBe(true);
        expect(product.preflightPackageUpdate.mock.calls[0][1].toString()).toBe('portable-binary');

        expect((await request(app).post('/saves/preflight').send({ data })).body.dependency.status).toBe('ready');
        expect(product.preflightSaveImport).toHaveBeenCalledWith('u', expect.any(Buffer));

        const exported = await request(app).post('/sessions/session_test/export').send({});
        expect(exported.status).toBe(200);
        expect(Buffer.from(exported.body.data, 'base64').toString()).toBe('session-save');

        const snapshot = await request(app).post('/sessions/session_test/saves/save_test/export').send({});
        expect(Buffer.from(snapshot.body.data, 'base64').toString()).toBe('snapshot-save');
    });

    test('surfaces referenced deletion conflicts and rejects unauthenticated product access', async () => {
        const product = makeProduct();
        product.deleteWork.mockRejectedValue(new ConflictError('native_package_referenced', {
            packageId: 'pkg_test',
            references: [{ kind: 'session', sessionId: 'session_test' }],
        }));
        const app = appFor(product);

        const conflict = await request(app).delete('/works/pkg_test');
        expect(conflict.status).toBe(409);
        expect(conflict.body).toMatchObject({
            error: 'native_package_referenced',
            details: {
                references: [{ kind: 'session', sessionId: 'session_test' }],
            },
        });

        const unauthorized = await request(appFor(makeProduct(), { authenticated: false })).get('/works');
        expect(unauthorized.status).toBe(401);
    });
});


test.each([['worlds', 'commitWorldRevision'], ['knowledge', 'commitKnowledgeRevision']])('Library %s revision HTTP delegates the exact base to its Native owner', async (path, method) => {
    const product = makeProduct(); product[method] = jest.fn(async () => ({ revision: 'saved' }));
    const body = { baseRevisionId: null, content: {} };
    const response = await request(appFor(product)).post('/' + path + '/resource/revisions').send(body);
    expect(response.status).toBe(201);
    expect(product[method]).toHaveBeenCalledWith(expect.any(String), 'resource', body);
});

test('installed version resolution keeps both exact IDs and the authenticated owner', async () => {
    const product = { getWorkVersion: jest.fn(async () => ({ current: false })) };
    expect((await request(appFor(product)).get('/works/pkg_a/versions/pkgv_b?handle=other')).status).toBe(200);
    expect(product.getWorkVersion).toHaveBeenCalledWith('u', 'pkg_a', 'pkgv_b');
});

test('Session naming uses the authenticated owner and carries the previous name for conflict checks', async () => {
    const product = { renameSession: jest.fn(async () => ({ displayTitle: 'Voyage' })) }, body = { displayTitle: 'Voyage', expectedDisplayTitle: null };
    expect((await request(appFor(product)).patch('/sessions/session_a').send(body)).status).toBe(200);
    expect(product.renameSession).toHaveBeenCalledWith('u', 'session_a', body);
    expect((await request(appFor(product, { authenticated: false })).patch('/sessions/session_a').send(body)).status).toBe(401);
});

test('read-only history uses the authenticated Session owner', async () => {
    const product = { getSessionHistory: jest.fn(async () => ({ branches: [], revisions: [] })) };
    expect((await request(appFor(product)).get('/sessions/session_a/history')).status).toBe(200);
    expect(product.getSessionHistory).toHaveBeenCalledWith('u', 'session_a');
});
