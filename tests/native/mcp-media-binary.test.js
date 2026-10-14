import express from 'express';
import request from 'supertest';
import { createHash, randomBytes } from 'node:crypto';
import { PNG } from 'pngjs';
import { NativeMcpMediaAssets, mountMcpMediaAssets } from '../../src/native/mcp-media-assets.js';
import { MediaStudio } from '../../src/native/media-studio.js';
import { createNativeId } from '../../src/native/identity.js';
import { serverBootId } from '../../src/logging/startup-store.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { setupVisual } from './helpers/visual-fixture.js';
import { installCognitionFixture } from './helpers/cognition-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { SpeechService } from '../../src/native/speech-service.js';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
test('real Native image, thumbnail and mask HTTP binary sources pin owner, hash, revision and typed purpose', async () => {
    const h = await makeTempFsEngineHarness(), x = await setupVisual(h), media = new MediaStudio({ host: x.host, images: x.images });
    const bytes = PNG.sync.write({ width: 512, height: 512, data: randomBytes(512 * 512 * 4) });
    const assetId = createNativeId('asset'), imageVersionId = createNativeId('imageVersion'), clientInstanceId = 'fixture-client';
    const scope = { sessionId: x.view.session.sessionId, branchId: x.view.revision.branchId, imageVersionId };
    await x.f.assetStore.put(h.handle, { assetId, contentHash: digest(bytes), size: bytes.length, mediaType: 'image/png' }, bytes);
    await x.illustrations.addImageVersion(h.handle, scope.sessionId, { branchId: scope.branchId, annotationId: x.annotation.annotationId, imageVersionId, assetId, width: 512, height: 512, alt: 'Synthetic noise fixture' });
    const app = express(); app.use(express.json({ limit: '1mb' }));
    app.use((req, res, next) => { if (req.headers['x-user']) req.user = { profile: { handle: req.headers['x-user'] } }; res.set('x-atria-server-boot-id', serverBootId); next(); });
    const router = express.Router(); mountMcpMediaAssets(router, { getHost: () => x.host }); app.use('/media', router);
    app.use('/generation', createNativeGenerationRouter(() => x.host));
    const post = body => request(app).post('/media/visual/binary/describe').set('x-user', h.handle).send(body);
    const chunk = (stage, offset, length, user = h.handle) => request(app).get('/media/visual/binary/' + stage.ref.handleId + '/chunk').query({ ...stage.ref, handleId: undefined, offset, length }).set('x-user', user);
    try {
        expect(bytes.length).toBeGreaterThan(1024 * 1024);
        const described = await post({ kind: 'image', clientInstanceId, ...scope }).expect(200), stage = described.body;
        expect(stage.ref.purpose).toBe('media-image'); expect(stage.ref.contentHash).toBe(digest(bytes));
        const parts = [];
        for (let offset = 0; offset < bytes.length; offset += 1048576) {
            const length = Math.min(1048576, bytes.length - offset), part = await chunk(stage, offset, length).expect(206);
            expect(part.headers['x-atria-chunk-sha256']).toBe(digest(part.body)); parts.push(part.body);
        }
        expect(Buffer.concat(parts).equals(bytes)).toBe(true);
        await chunk(stage, 0, 1, 'foreign-owner').expect(404);
        await chunk({ ...stage, ref: { ...stage.ref, clientInstanceId: 'foreign' } }, 0, 1).expect(409);
        await chunk({ ...stage, ref: { ...stage.ref, purpose: 'speech-audio' } }, 0, 1).expect(409);
        const thumbnail = (await post({ kind: 'thumbnail', clientInstanceId, ...scope }).expect(200)).body;
        const preview = await chunk(thumbnail, 0, thumbnail.ref.totalBytes).expect(206);
        expect(PNG.sync.read(preview.body).width).toBe(320); expect(thumbnail.ref.purpose).toBe('media-thumbnail');
        const draft = await media.createDraft(h.handle, scope), maskScope = { sessionId: scope.sessionId, branchId: scope.branchId, draftId: draft.value.draftId };
        const saved = await media.saveDraft(h.handle, { ...maskScope, commands: [{ kind: 'fill', value: 255 }], cursor: 1, expectedRevision: draft.revision });
        const raster = (await post({ kind: 'mask', clientInstanceId, ...maskScope, expectedRevision: saved.revision }).expect(200)).body;
        expect(raster.ref.purpose).toBe('mask-raster'); expect(raster.ref.sourceRevision).toBe(saved.revision);
        const rasterBytes = (await chunk(raster, 0, raster.ref.totalBytes).expect(206)).body;
        expect(rasterBytes.every(value => value === 255)).toBe(true);
        const checkpointResult = await request(app).post('/generation/visual/mask/checkpoint-with-commands').set('x-user', h.handle)
            .field('metadata', JSON.stringify({ ...maskScope, expectedRevision: saved.revision, commands: [], cursor: 0 }))
            .attach('checkpoint', rasterBytes, { filename: 'checkpoint.gray8', contentType: 'application/octet-stream' }).expect(200);
        const checkpointed = checkpointResult.body;
        expect(await media.raster(h.handle, checkpointed.value)).toEqual(rasterBytes);
        await chunk(raster, 0, 1).expect(409);
        expect(JSON.stringify(stage)).not.toMatch(/"data"|Buffer|base64/);
        let secrets = 0;
        x.host.secretPort.resolveSecret = async () => { secrets++; throw new Error('Must not resolve'); };
        await expect(x.images.prepare(h.handle, { sessionId: scope.sessionId, branchId: scope.branchId,
            annotationId: x.annotation.annotationId, expectedHead: (await x.f.sessionRepo.getIllustrations(h.handle, scope.sessionId)).head,
            imageTargetId: x.target.imageTargetId, expectedTargetFingerprint: hashNativeDocument(x.target), expectedConnectionFingerprint: '0'.repeat(64) })).rejects.toThrow('target_conflict');
        expect(secrets).toBe(0);
    } finally { await h.cleanup(); }
});

test('native media metadata leases expire without retaining asset bytes or replaying source jobs', async () => {
    let now = 0, resolved = 0;
    const store = new NativeMcpMediaAssets({ getHost: () => ({}), now: () => now, ttlMs: 10, resolveSource: async () => {
        resolved++; return { bytes: Buffer.from('audio'), mediaType: 'audio/wav', sourceRevision: 'revision', sourceScope: { operationId: 'operation' } };
    } });
    const stage = await store.describe('owner', { kind: 'audio', clientInstanceId: 'client', operationId: 'operation' });
    expect((await store.chunk('owner', stage.ref, 0, 5)).bytes.toString()).toBe('audio'); expect(resolved).toBe(2);
    now = 10; await expect(store.chunk('owner', stage.ref, 0, 5)).rejects.toThrow('not found'); expect(resolved).toBe(2);
});

test('Speech binary delivery uses the real native audio artifact and refuses stale source without a second synthesis', async () => {
    const h = await makeTempFsEngineHarness();
    const f = await installCognitionFixture(h, 'limited', { intent: 'inform', sourceIds: ['speech-lines'] }, ({ contract }) => {
        contract.informationRuntime.sources.push({ id: 'speech-lines', kind: 'timeline', semantic: 'narrative', scopeId: 'session', fields: [['content'], ['actorId']] });
        for (const view of contract.informationRuntime.views.filter(view => ['pov', 'player'].includes(view.id))) view.sources.push('speech-lines');
    });
    const base = await f.core.appendTimeline(h.handle, f.snapshot.session.sessionId, { role: 'assistant', actorId: f.actorId, content: 'Public synthetic audio fixture.' }, { expectedRevisionId: f.snapshot.revision.revisionId });
    const seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:1/not-used' });
    await seeded.persistence.saveRuntimeRoute(h.handle, { ...seeded.routes[0], executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [seeded.model.modelProfileId],
        computeBudget: { maxRequests: 1, maxTokens: 4096, localWork: { maxJobs: 32, maxItems: 10000, maxInputBytes: 16777216 } } } });
    const host = { ...seeded, sessionCore: f.core, packageInstaller: f.packageInstaller }, bytes = Buffer.from('Native-owned synthetic WAV transport fixture');
    let syntheses = 0;
    const speech = new SpeechService({ host, provider: { id: 'fixture', synthesize: async input => { syntheses++; return { bytes, voiceId: input.voiceId, durationMs: 10, capabilities: {} }; } } });
    const input = { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, itemId: 'speech-lines:' + base.timeline.at(-1).messageId, voiceId: 'fixture-voice' };
    const app = express(); app.use(express.json());
    app.use((req, res, next) => { req.user = { profile: { handle: h.handle } }; res.set('x-atria-server-boot-id', serverBootId); next(); });
    app.use(createNativeGenerationRouter(() => host));
    try {
        const started = await speech.start(h.handle, input); await speech.scheduler.operations.get(started.operationId).handle.result;
        const described = await request(app).post('/visual/binary/describe').send({ kind: 'audio', clientInstanceId: 'client', operationId: started.operationId }).expect(200);
        const ref = described.body.ref;
        expect(ref.purpose).toBe('speech-audio'); expect(ref.contentHash).toBe(digest(bytes));
        const chunk = () => request(app).get('/visual/binary/' + ref.handleId + '/chunk').query({ ...ref, handleId: undefined, offset: 0, length: bytes.length });
        expect((await chunk().expect(206)).body).toEqual(bytes); expect(syntheses).toBe(1);
        await f.core.appendTimeline(h.handle, input.sessionId, { role: 'assistant', actorId: f.actorId, content: 'Changed public source.' }, { expectedRevisionId: base.revision.revisionId });
        await chunk().expect(409); expect(syntheses).toBe(1);
    } finally { await h.cleanup(); }
});
