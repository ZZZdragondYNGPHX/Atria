import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { IllustrationImageService } from '../../src/native/illustration-image-service.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { services } from './helpers/session-fixture.js';
import { setupVisual, visualPng, deferredVisual } from './helpers/visual-fixture.js';

describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('NovelAI Native vertical slice %s', (_, harness) => {
    let h, fixture, sent, gate, provider;
    beforeEach(async () => {
        h = await harness(); gate = deferredVisual(); sent = deferredVisual();
        provider = { generate: jest.fn(async (compiled, options) => { sent.resolve({ compiled, options }); await gate.promise; return { bytes: visualPng, width: 1, height: 1 }; }) };
        fixture = await setupVisual(h, { provider });
    });
    afterEach(async () => { setReadOnly(false); gate.resolve(); await new Promise(resolve => setTimeout(resolve, 0)); await h.cleanup(); });
    test('Source -> IR -> persistent Job -> provider -> AssetStore -> ImageVersion -> explicit display; preview never spends', async () => {
        const x = fixture, preview = await x.prepare(); expect(provider.generate).not.toHaveBeenCalled();
        const started = await x.images.start(h.handle, { prepareId: preview.prepareId, approval: x.approval(preview) });
        expect((await x.images.start(h.handle, { prepareId: preview.prepareId, approval: x.approval(preview) })).operationId).toBe(started.operationId);
        const capture = await sent.promise; expect(capture.compiled.body.model).toBe('nai-diffusion-5-full');
        expect(capture.compiled.body.parameters).toMatchObject({ params_version: 4, steps: 23, tag_hint_qt: 0 });
        expect(capture.options.secret).toBe('synthetic-secret'); gate.resolve(); await x.images.wait(h.handle, started.operationId);
        const result = await x.images.status(h.handle, started), image = result.state.images[0];
        expect(result.operation.status).toBe('completed'); expect(result.state.annotations[0].selectedImageVersionId).toBeNull();
        expect(image.prompt).toBe('confirmed prompt'); expect(image.mediaOperation.kind).toBe('txt2img'); expect(provider.generate).toHaveBeenCalledTimes(1);
        await x.illustrations.selectImageVersion(h.handle, x.view.session.sessionId, { annotationId: x.annotation.annotationId, imageVersionId: image.imageVersionId, expectedHead: result.head });
        const restarted = new IllustrationImageService({ host: x.host, provider });
        expect((await restarted.status(h.handle, started)).state.annotations[0].selectedImageVersionId).toBe(image.imageVersionId);
        expect((await restarted.list(h.handle, { sessionId: x.view.session.sessionId, branchId: x.view.revision.branchId }))[0].status).toBe('completed');
        await expect(x.f.assetStore.deleteRef(h.handle, image.assetId)).rejects.toThrow('referenced');
    });
    test('late output stays in source branch, uses frozen endpoint/request and never revives a deleted card', async () => {
        const x = fixture, preview = await x.prepare(), started = await x.images.start(h.handle, { prepareId: preview.prepareId, approval: x.approval(preview) });
        await sent.promise;
        const save = await x.f.core.createSavePoint(h.handle, x.view.session.sessionId, { kind: 'manual' });
        const fork = await x.f.core.restoreSavePoint(h.handle, x.view.session.sessionId, save.saveId, { expectedRevisionId: x.view.revision.revisionId });
        await x.illustrations.deleteAnnotation(h.handle, x.view.session.sessionId, { annotationId: x.annotation.annotationId, branchId: x.view.revision.branchId });
        await x.host.persistence.saveConnectionProfile(h.handle, { ...x.connection, endpoint: 'http://127.0.0.1:2/changed' });
        gate.resolve(); await x.images.wait(h.handle, started.operationId);
        const result = await x.images.status(h.handle, started); expect(result.state.images).toHaveLength(1);
        expect(result.state.annotations[0].selectedImageVersionId).toBeNull();
        expect((await x.f.core.load(h.handle, fork.session.sessionId)).illustrations.images).toHaveLength(0);
        expect(provider.generate.mock.calls[0][0].endpoint).toBe(x.connection.endpoint);
    });
    test('approval/source/head/read-only failures reject before transmission; cancellation retains unknown charge', async () => {
        const x = fixture, preview = await x.prepare(), approved = x.approval(preview);
        await expect(x.images.start(h.handle, { prepareId: preview.prepareId, approval: { ...approved, allowUnknownCost: false } })).rejects.toThrow('cost_unauthorized');
        await expect(x.images.start(h.handle, { prepareId: preview.prepareId, approval: { ...approved, requestHash: 'f'.repeat(64) } })).rejects.toThrow('approval_conflict');
        setReadOnly(true); await expect(x.images.start(h.handle, { prepareId: preview.prepareId, approval: approved })).rejects.toThrow(); setReadOnly(false);
        expect(provider.generate).not.toHaveBeenCalled();
        const started = await x.images.start(h.handle, { prepareId: preview.prepareId, approval: approved }); await sent.promise;
        await x.images.cancel(h.handle, started); gate.resolve(); await new Promise(resolve => setTimeout(resolve, 10));
        const result = await x.images.status(h.handle, started); expect(result.operation.status).toBe('cancelled');
        expect(result.operation.cost.held).toBe(true); expect(result.operation.cancelReceipt.refund).toBe('unknown'); expect(result.state.images).toHaveLength(0);
    });
    test('SavePoint/session import preserve evidence and bytes without Secret or autonomous payment', async () => {
        const x = fixture, preview = await x.prepare(), started = await x.images.start(h.handle, { prepareId: preview.prepareId, approval: x.approval(preview) });
        gate.resolve(); await x.images.wait(h.handle, started.operationId);
        const exported = await x.f.saveSystem.exportSession(h.handle, x.view.session.sessionId);
        expect(JSON.stringify(exported.save)).not.toContain('synthetic-secret'); expect(JSON.stringify(exported.save)).not.toContain('fixture-secret-ref');
        const target = await harness();
        try {
            const other = services(target); await other.packageInstaller.install(target.handle, await x.f.assetStore.readBlob(h.handle, x.view.session.packageContentHash));
            const imported = await other.saveSystem.importSave(target.handle, exported.archive);
            expect(imported.illustrations.images).toEqual((await x.images.status(h.handle, started)).state.images);
            expect((await other.assetStore.read(target.handle, imported.illustrations.images[0].assetId)).bytes).toEqual(visualPng);
        } finally { await target.cleanup(); }
        expect(provider.generate).toHaveBeenCalledTimes(1);
    });
    test('authenticated HTTP control plane prepares without Secret and isolates durable status/cancel', async () => {
        const x = fixture, app = express(); app.use(express.json()); app.use((req, _res, next) => { if (req.headers['x-owner']) req.user = { profile: { handle: req.headers['x-owner'] } }; next(); });
        app.use(createNativeGenerationRouter(() => x.host));
        await request(app).post('/illustration-images/prepare').send({}).expect(401);
        const response = await request(app).post('/illustration-images/prepare').set('x-owner', h.handle).send({ sessionId: x.view.session.sessionId, branchId: x.view.revision.branchId, annotationId: x.annotation.annotationId,
            expectedHead: (await x.f.sessionRepo.getIllustrations(h.handle, x.view.session.sessionId)).head }).expect(200);
        expect(JSON.stringify(response.body)).not.toContain('fixture-secret-ref');
        expect(provider.generate).not.toHaveBeenCalled();
        await request(app).put('/visual/resources').set('x-owner', h.handle).send({ resourceType: 'core.image-target', value: x.target, expectedRevision: null }).expect(409);
    });
});
