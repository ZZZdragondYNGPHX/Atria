import express from 'express';
import request from 'supertest';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture } from './helpers/session-fixture.js';
import { createNativeSessionRouter } from '../../src/endpoints/native-session.js';
import { createNativeId } from '../../src/native/identity.js';

describe('N4 authenticated runtime HTTP boundary', () => {
    let h, f, app, view;
    beforeEach(async () => {
        h = await makeTempFsEngineHarness(); f = await installFixture(h);
        app = express(); app.use(express.json());
        app.use((req, res, next) => { req.user = { profile: { handle: h.handle } }; next(); });
        app.use(createNativeSessionRouter(() => ({ core: f.core, assets: f.assetStore })));
        view = await f.core.create(h.handle, f.start);
    });
    afterEach(async () => { await h.cleanup(); });
    test('load ignores caller handle, commands require revision CAS, unknown dispatch fails closed', async () => {
        const loaded = await request(app).post('/load').send({ sessionId: view.session.sessionId, handle: 'other-account' });
        expect(loaded.status).toBe(200);
        const body = { sessionId: view.session.sessionId, command: { type: 'timeline', commands: [
            { type: 'append', draft: { role: 'user', content: 'HTTP intent' } },
        ] } };
        expect((await request(app).post('/command').send(body)).status).toBe(400);
        body.expectedRevisionId = view.revision.revisionId;
        expect((await request(app).post('/command').send(body)).status).toBe(200);
        expect((await request(app).post('/command').send(body)).status).toBe(409);
        expect((await request(app).post('/command').send({ ...body, command: { type: 'deleteAll' } })).status).toBe(400);
    });
    test('Native attachment upload/read, timeline retention and immutable history never write legacy files', async () => {
        const upload = await request(app).post('/attachment').send({ sessionId: view.session.sessionId,
            data: Buffer.from('Secret harbor map').toString('base64'), displayName: 'map.txt', mediaType: 'text/plain' });
        expect(upload.status).toBe(200);
        const assetId = upload.body.assetId;
        expect((await request(app).get(`/asset/${assetId}`)).text).toBe('Secret harbor map');
        const response = await request(app).post('/command').send({ sessionId: view.session.sessionId,
            expectedRevisionId: view.revision.revisionId, command: { type: 'timeline', commands: [
                { type: 'append', draft: { role: 'user', content: 'Read this', metadata: { attachments: [{ assetId, kind: 'file' }] } } },
            ] } });
        expect(response.status).toBe(200);
        await expect(f.assetStore.deleteRef(h.handle, assetId)).rejects.toMatchObject({ code: 'native_asset_ref_referenced' });
        expect(await f.assetStore.gcBlobs(h.handle)).toEqual([]);
        const missing = await request(app).post('/command').send({ sessionId: view.session.sessionId,
            expectedRevisionId: response.body.revision.revisionId, command: { type: 'timeline', commands: [
                { type: 'append', draft: { role: 'user', content: 'Missing', metadata: { attachments: [{ assetId: createNativeId('asset') }] } } },
            ] } });
        expect(missing.status).toBe(400);
    });
    test('active HTML attachments are downloads, not executable application-origin documents', async () => {
        const upload = await request(app).post('/attachment').send({ sessionId: view.session.sessionId,
            data: Buffer.from('<script>alert(1)</script>').toString('base64'), displayName: 'unsafe.html', mediaType: 'text/html' });
        const response = await request(app).get(`/asset/${upload.body.assetId}`);
        expect(response.headers['content-type']).toContain('application/octet-stream');
        expect(response.headers['content-security-policy']).toContain('sandbox');
        expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
    test('unauthenticated runtime entry is rejected before accessing stores', async () => {
        const unauthenticated = express(); unauthenticated.use(createNativeSessionRouter(() => { throw new Error('must not access stores'); }));
        expect((await request(unauthenticated).post('/load').send({})).status).toBe(401);
    });
});
