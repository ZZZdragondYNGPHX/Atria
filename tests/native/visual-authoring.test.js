import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { IllustrationImageService } from '../../src/native/illustration-image-service.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { NativeModelPromptPersistence, VersionedJsonResourceHandler } from '../../src/native/model-prompt-runtime/persistence.js';
import { NativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { defaultVisualBudget } from '../../src/native/visual-store.js';
import { createNativeId } from '../../src/native/identity.js';
import { officialNovelaiCapabilities } from '../../public/shared/novelai-illustration.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { services } from './helpers/session-fixture.js';
import { visualPng, deferredVisual } from './helpers/visual-fixture.js';

// Real original resources, ledger, Scheduler, Worker and AssetStore. No Work or
// Session is installed/created. Only the remote image transport is synthetic.
describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('independent image author %s', (_name, make) => {
    let h, images, host, targetRef, renderingRef, provider, gate, sent;
    beforeEach(async () => {
        h = await make(); const core = services(h);
        const persistence = new NativeModelPromptPersistence({ engine: h.engine }), library = new VersionedJsonResourceHandler({ engine: h.engine });
        const connection = { schemaVersion: 1, scope: 'player', connectionProfileId: createNativeId('connectionProfile'), displayName: 'Author image', providerAdapter: 'provider.novelai-image-compatible',
            transport: 'transport.http', endpoint: 'http://127.0.0.1:1/unused-synthetic-transport', secretRef: { scope: 'player', secretId: 'fixture-secret' }, networkPolicy: {}, options: { imageCapabilities: officialNovelaiCapabilities() } };
        await persistence.saveConnectionProfile(h.handle, connection);
        const target = { schemaVersion: 2, imageTargetId: createNativeId('imageTarget'), revision: 'r1', displayName: 'Author target', connectionProfileId: connection.connectionProfileId,
            model: 'nai-diffusion-5-full', serviceVersion: 'fixture', nativeParameters: {}, workflow: null, capabilities: null };
        const rendering = { schemaVersion: 2, imageRenderingId: createNativeId('imageRendering'), revision: 'r1', displayName: 'Ink', style: 'ink drawing', quality: 'fine lines', negativePrompt: 'blur', defaultTargetId: null, constraints: [] };
        await library.commit(h.handle, 'core.image-target', target); await library.commit(h.handle, 'core.image-rendering', rendering);
        targetRef = { scope: 'library', resourceType: 'core.image-target', resourceId: target.imageTargetId, revision: 'r1' };
        renderingRef = { scope: 'library', resourceType: 'core.image-rendering', resourceId: rendering.imageRenderingId, revision: 'r1' };
        host = { persistence, library, packageInstaller: core.packageInstaller, secretPort: { resolveSecret: async () => 'synthetic-author-secret' } };
        gate = deferredVisual(); sent = deferredVisual();
        provider = { generate: jest.fn(async () => { sent.resolve(); await gate.promise; return { bytes: visualPng, width: 1, height: 1 }; }) };
        images = new IllustrationImageService({ host, provider, scheduler: new NativeTaskScheduler({ timeoutMs: 10000 }) });
        await images.store.configureBudget(h.handle, { ...defaultVisualBudget(), moneyDay: 100 }, null);
    });
    afterEach(async () => { gate?.resolve(); await new Promise(resolve => setTimeout(resolve, 0)); await h.cleanup(); });
    const approval = preview => ({ targetFingerprint: preview.targetFingerprint, requestHash: preview.requestHash, maxCost: 1, currency: 'USD', allowUnknownCost: true, externalAssetIds: [], omittedPreferred: [] });
    const prepare = () => images.prepareAuthoring(h.handle, { title: 'Harbor', prompt: '完整手写正文。', imageTargetRef: targetRef, imageRenderingRef: renderingRef });
    test('exact resources preview without sending; original manual Job creates an independent durable image and replays once', async () => {
        const preview = await prepare(); expect(preview.sent).toBe(false); expect(provider.generate).not.toHaveBeenCalled();
        expect(preview.source.kind).toBe('authoring'); expect(preview.prompt).toContain('完整手写正文。'); expect(preview.prompt).toContain('ink drawing'); expect(preview.negativePrompt).toBe('blur');
        await expect(images.start(h.handle, { prepareId: preview.prepareId, approval: { ...approval(preview), allowUnknownCost: false } })).rejects.toThrow('cost_unauthorized');
        const input = { prepareId: preview.prepareId, approval: approval(preview) }, started = await images.start(h.handle, input);
        expect(await images.start(h.handle, input)).toEqual(started); gate.resolve(); await images.wait(h.handle, started.operationId);
        const restarted = new IllustrationImageService({ host, provider }), result = await restarted.observe(h.handle, { operationId: started.operationId, summary: false });
        expect(result.operation.status).toBe('completed'); expect(result.image.title).toBe('Harbor'); expect(result.image.prompt).toBe(preview.prompt);
        expect((await restarted.assets.read(h.handle, result.image.ref.assetId)).bytes).toEqual(visualPng);
        expect((await restarted.authoringImages(h.handle))[0].image).toEqual(result.image); expect(provider.generate).toHaveBeenCalledTimes(1);
        expect(await h.engine.withTransaction(h.handle, tx => tx.listResources({ kind: 'atri_session', handle: h.handle }))).toEqual([]);
        await images.archiveAuthoringImage(h.handle, { operationId: started.operationId, archived: true });
        expect(await images.authoringImages(h.handle)).toEqual([]); expect(await images.authoringImages(h.handle, { archived: true })).toHaveLength(1);
        await images.archiveAuthoringImage(h.handle, { operationId: started.operationId, archived: false });
        await images.store.updateJob(h.handle, started.operationId, job => ({ ...job, createdAt: Date.now() - 20 * 86400000, publishedAt: Date.now() - 20 * 86400000 }));
        await expect(images.assets.deleteRef(h.handle, result.image.ref.assetId)).rejects.toThrow('referenced');
    });
    test('cancellation of a sent request preserves unknown cost and does not publish a gallery image', async () => {
        const preview = await prepare(), started = await images.start(h.handle, { prepareId: preview.prepareId, approval: approval(preview) });
        await sent.promise; await images.cancel(h.handle, started); gate.resolve(); await images.wait(h.handle, started.operationId).catch(() => {});
        const result = await images.observe(h.handle, { operationId: started.operationId, summary: true });
        expect(result.operation.status).toBe('cancelled'); expect(result.operation.cost.held).toBe(true); expect(result.image).toBeNull();
        expect(provider.generate).toHaveBeenCalledTimes(1);
    });
    test('HTTP authoring prepare/list uses account ownership and never requires Session identity', async () => {
        const app = express(); app.use(express.json()); app.use((req, _res, next) => { if (req.headers['x-owner']) req.user = { profile: { handle: req.headers['x-owner'] } }; next(); });
        app.use(createNativeGenerationRouter(() => host));
        await request(app).post('/authoring/images/prepare').send({}).expect(401);
        const response = await request(app).post('/authoring/images/prepare').set('x-owner', h.handle).send({ prompt: 'From HTTP', imageTargetRef: targetRef }).expect(200);
        expect(response.body.sent).toBe(false); expect(response.body.source.kind).toBe('authoring');
        await request(app).get('/authoring/images').set('x-owner', h.handle).expect(200, []);
        await request(app).post('/authoring/images/prepare').set('x-owner', 'another-owner').send({ prompt: 'Wrong owner', imageTargetRef: targetRef }).expect(400);
        await request(app).post('/authoring/images/prepare').set('x-owner', h.handle).send({ prompt: 'Invalid', imageTargetRef: targetRef, sessionId: createNativeId('session') }).expect(400);
        expect(provider.generate).not.toHaveBeenCalled();
    });
});
