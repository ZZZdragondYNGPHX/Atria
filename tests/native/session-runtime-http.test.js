import express from 'express';
import request from 'supertest';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture } from './helpers/session-fixture.js';
import { createNativeSessionRouter } from '../../src/endpoints/native-session.js';
import { createNativeId } from '../../src/native/identity.js';

describe('N4 authenticated immutable runtime HTTP boundary', () => {
    let h, f, app, view;

    beforeEach(async () => {
        h = await makeTempFsEngineHarness();
        f = await installFixture(h);
        app = express();
        app.use(express.json());
        app.use((req, res, next) => {
            req.user = { profile: { handle: h.handle } };
            next();
        });
        app.use(createNativeSessionRouter(() => ({ core: f.core, assets: f.assetStore })));
        view = await f.core.create(h.handle, f.start);
    });

    afterEach(async () => { await h.cleanup(); });

    test('load ignores caller handle, append requires revision CAS, unknown dispatch fails closed', async () => {
        const loaded = await request(app).post('/load').send({
            sessionId: view.session.sessionId,
            handle: 'other-account',
        });
        expect(loaded.status).toBe(200);

        const body = {
            sessionId: view.session.sessionId,
            command: {
                type: 'timeline',
                commands: [{ type: 'append', draft: { role: 'user', content: 'HTTP intent' } }],
            },
        };
        expect((await request(app).post('/command').send(body)).status).toBe(400);

        body.expectedRevisionId = view.revision.revisionId;
        const appended = await request(app).post('/command').send(body);
        expect(appended.status).toBe(200);
        expect(appended.body.timeline.at(-1).content).toBe('HTTP intent');

        expect((await request(app).post('/command').send(body)).status).toBe(409);
        expect((await request(app).post('/command').send({
            ...body,
            expectedRevisionId: appended.body.revision.revisionId,
            command: { type: 'deleteAll' },
        })).status).toBe(400);
    });

    test('committed timeline mutation commands are rejected before publication', async () => {
        const before = view.revision.revisionId;
        const target = view.timeline[0];
        const commands = [
            { type: 'remove', messageId: target.messageId },
            { type: 'select', messageId: target.messageId, variantId: target.activeVariantId },
            { type: 'revise', messageId: target.messageId, draft: { content: 'rewrite' } },
            { type: 'removeVariant', messageId: target.messageId, variantId: target.activeVariantId },
            { type: 'append', beforeMessageId: target.messageId, draft: { role: 'user', content: 'insert' } },
        ];

        for (const command of commands) {
            const response = await request(app).post('/command').send({
                sessionId: view.session.sessionId,
                expectedRevisionId: before,
                command: { type: 'timeline', commands: [command] },
            });
            expect(response.status).toBe(400);
            const stored = await f.core.load(h.handle, view.session.sessionId);
            expect(stored.revision.revisionId).toBe(before);
            expect(stored.timeline[0].content).toBe('Opening');
        }
    });

    test('Retry Reply forks from exact post-user revision rather than adding a Variant', async () => {
        const user = await request(app).post('/command').send({
            sessionId: view.session.sessionId,
            expectedRevisionId: view.revision.revisionId,
            command: {
                type: 'timeline',
                commands: [{ type: 'append', draft: { role: 'user', content: 'Question' } }],
            },
        });
        expect(user.status).toBe(200);
        const userRevisionId = user.body.revision.revisionId;
        const userMessageId = user.body.timeline.at(-1).messageId;

        const assistant = await request(app).post('/command').send({
            sessionId: view.session.sessionId,
            expectedRevisionId: userRevisionId,
            command: {
                type: 'timeline',
                commands: [{
                    type: 'append',
                    draft: {
                        role: 'assistant',
                        actorId: view.entryPoint.primaryActorId ?? view.entryPoint.actorIds[0],
                        content: 'First reply',
                    },
                }],
            },
        });
        expect(assistant.status).toBe(200);
        const assistantMessage = assistant.body.timeline.at(-1);
        const oldBranchId = assistant.body.revision.branchId;

        const retry = await request(app).post('/command').send({
            sessionId: view.session.sessionId,
            expectedRevisionId: assistant.body.revision.revisionId,
            command: { type: 'retry', messageId: assistantMessage.messageId },
        });
        expect(retry.status).toBe(200);
        expect(retry.body.revision.branchId).not.toBe(oldBranchId);
        expect(retry.body.timeline.at(-1).messageId).toBe(userMessageId);
        expect(retry.body.timeline.some(item => item.messageId === assistantMessage.messageId)).toBe(false);

        const postUser = await f.core.load(h.handle, view.session.sessionId, { revisionId: userRevisionId });
        expect(postUser.timeline.at(-1).messageId).toBe(userMessageId);
        const oldHead = await f.core.load(h.handle, view.session.sessionId, {
            revisionId: assistant.body.revision.revisionId,
        });
        expect(oldHead.revision.branchId).toBe(oldBranchId);
        expect(oldHead.timeline.at(-1)).toMatchObject({
            messageId: assistantMessage.messageId,
            content: 'First reply',
        });
    });

    test('Native attachment upload/read and append retention never require legacy files', async () => {
        const upload = await request(app).post('/attachment').send({
            sessionId: view.session.sessionId,
            data: Buffer.from('Secret harbor map').toString('base64'),
            displayName: 'map.txt',
            mediaType: 'text/plain',
        });
        expect(upload.status).toBe(200);
        const assetId = upload.body.assetId;
        expect((await request(app).get(`/asset/${assetId}`)).text).toBe('Secret harbor map');

        const response = await request(app).post('/command').send({
            sessionId: view.session.sessionId,
            expectedRevisionId: view.revision.revisionId,
            command: {
                type: 'timeline',
                commands: [{
                    type: 'append',
                    draft: {
                        role: 'user',
                        content: 'Read this',
                        metadata: { attachments: [{ assetId, kind: 'file' }] },
                    },
                }],
            },
        });
        expect(response.status).toBe(200);
        await expect(f.assetStore.deleteRef(h.handle, assetId)).rejects.toMatchObject({
            code: 'native_asset_ref_referenced',
        });
        expect(await f.assetStore.gcBlobs(h.handle)).toEqual([]);

        const missing = await request(app).post('/command').send({
            sessionId: view.session.sessionId,
            expectedRevisionId: response.body.revision.revisionId,
            command: {
                type: 'timeline',
                commands: [{
                    type: 'append',
                    draft: {
                        role: 'user',
                        content: 'Missing',
                        metadata: { attachments: [{ assetId: createNativeId('asset') }] },
                    },
                }],
            },
        });
        expect(missing.status).toBe(400);
    });

    test('active HTML attachments are downloads, not executable application-origin documents', async () => {
        const upload = await request(app).post('/attachment').send({
            sessionId: view.session.sessionId,
            data: Buffer.from('<script>alert(1)</script>').toString('base64'),
            displayName: 'unsafe.html',
            mediaType: 'text/html',
        });
        const response = await request(app).get(`/asset/${upload.body.assetId}`);
        expect(response.headers['content-type']).toContain('application/octet-stream');
        expect(response.headers['content-security-policy']).toContain('sandbox');
        expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    test('N5 runtime command atomically commits state with Timeline and restores exact Revision state', async () => {
        const save = await f.core.createSavePoint(h.handle, view.session.sessionId, {
            revisionId: view.revision.revisionId,
            kind: 'quick',
        });
        const committed = await request(app).post('/command').send({
            sessionId: view.session.sessionId,
            expectedRevisionId: view.revision.revisionId,
            command: {
                type: 'runtime',
                commands: [{ type: 'append', draft: { role: 'user', content: 'Stateful turn' } }],
                statePatch: {
                    atri_variables: { schemaVersion: 1, values: { hp: 7 } },
                    atri_search_tools_anchors: { anchor: { query: 'dock' } },
                },
            },
        });
        expect(committed.status).toBe(200);
        expect(committed.body.timeline.at(-1).content).toBe('Stateful turn');
        expect(committed.body.states.atri_variables.values.hp).toBe(7);
        expect(committed.body.revision.stateHeads.atri_variables).toBeTruthy();

        const deleted = await request(app).post('/command').send({
            sessionId: view.session.sessionId,
            expectedRevisionId: committed.body.revision.revisionId,
            command: {
                type: 'runtime',
                deleteNamespaces: ['atri_search_tools_anchors'],
            },
        });
        expect(deleted.status).toBe(200);
        expect(deleted.body.states.atri_search_tools_anchors).toBeUndefined();

        const restored = await request(app).post('/command').send({
            sessionId: view.session.sessionId,
            expectedRevisionId: deleted.body.revision.revisionId,
            command: { type: 'restore', saveId: save.saveId },
        });
        expect(restored.status).toBe(200);
        expect(restored.body.timeline).toHaveLength(view.timeline.length);
        expect(restored.body.states.atri_variables).toBeUndefined();
        expect(restored.body.revision.revisionId).not.toBe(save.revisionId);
    });


    test('unauthenticated runtime entry is rejected before accessing stores', async () => {
        const unauthenticated = express();
        unauthenticated.use(createNativeSessionRouter(() => {
            throw new Error('must not access stores');
        }));
        expect((await request(unauthenticated).post('/load').send({})).status).toBe(401);
    });
});
