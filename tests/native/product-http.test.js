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
        preflightPackage: jest.fn(() => ({ packageId: 'pkg_preflight' })),
        installPackage: jest.fn(async () => ({ package: { packageId: 'pkg_installed' } })),
        listWorlds: jest.fn(async () => []),
        getWorld: jest.fn(async (_handle, worldId) => ({ world: { worldId } })),
        deleteWorld: jest.fn(async () => true),
        listKnowledgeBases: jest.fn(async () => []),
        getKnowledgeBase: jest.fn(async (_handle, knowledgeBaseId) => ({ knowledgeBase: { knowledgeBaseId } })),
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

describe('N9 Native Product HTTP boundary', () => {
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

    test('decodes Package/Save archives and returns portable exports as base64', async () => {
        const product = makeProduct();
        const app = appFor(product);
        const data = Buffer.from('portable-binary').toString('base64');

        expect((await request(app).post('/packages/preflight').send({ data })).status).toBe(200);
        expect(Buffer.isBuffer(product.preflightPackage.mock.calls[0][0])).toBe(true);
        expect(product.preflightPackage.mock.calls[0][0].toString()).toBe('portable-binary');

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
