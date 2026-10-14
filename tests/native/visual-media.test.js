import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { MediaStudio } from '../../src/native/media-studio.js';
import { VisualGallery, VisualMediaGc } from '../../src/native/visual-gallery.js';
import { createImageRegistry } from '../../src/native/image-registry.js';
import { createNovelaiVisualAdapter } from '../../src/native/adapters/novelai-visual-adapter.js';
import { officialNovelaiCapabilities } from '../../public/shared/novelai-illustration.js';
import { createNativeId } from '../../src/native/identity.js';
import { MaskCommandModel } from '../../public/scripts/native/mask-canvas.js';
import { replayMask, maskPixelFromScreen } from '../../public/shared/native-mask.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { setupVisual, visualPng } from './helpers/visual-fixture.js';
import { services } from './helpers/session-fixture.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
test('mask pixel authority is independent of CSS scale/DPR; undo/redo/checkpoint and bounds are deterministic', () => {
    const model = new MaskCommandModel({ width: 4, height: 4, checkpoint: new Uint8Array(16) });
    model.add({ kind: 'rect', x: 1, y: 1, width: 2, height: 2, value: 255 }); const painted = model.pixels();
    model.undo(); expect(model.pixels().every(v => v === 0)).toBe(true); model.redo(); expect(model.pixels()).toEqual(painted);
    const point = maskPixelFromScreen(22, 42, { left: 10, top: 20 }, { scale: 2, offsetX: 10, offsetY: 20 }, 4, 4);
    expect(point).toEqual({ x: 1, y: 1 });
    expect(() => replayMask(new Uint8Array(16), [{ kind: 'rect', x: 4, y: 0, width: 1, height: 1, value: 255 }], 1, 4, 4)).toThrow();
});
describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('Media Studio %s', (_, harness) => {
    let h, x, media, base;
    beforeEach(async () => {
        h = await harness(); x = await setupVisual(h, { registry: createImageRegistry({ fetchImpl: async () => Response.json({ data: [{ b64_json: visualPng.toString('base64') }] }) }),
            adapter: 'provider.openai-images', model: 'gpt-image-1', endpoint: 'http://127.0.0.1:8080/v1' });
        const preview = await x.prepare(), started = await x.images.start(h.handle, { prepareId: preview.prepareId, approval: x.approval(preview) }); await x.images.wait(h.handle, started.operationId);
        base = (await x.images.status(h.handle, started)).state.images[0]; media = new MediaStudio({ host: x.host, images: x.images });
    });
    afterEach(async () => h.cleanup());
    const scope = () => ({ sessionId: x.view.session.sessionId, branchId: x.view.revision.branchId, imageVersionId: base.imageVersionId });
    test('durable draft CAS, raster checkpoints and frozen submitted masks survive later editing', async () => {
        const draft = await media.createDraft(h.handle, scope()), commands = [{ kind: 'fill', value: 255 }];
        const saved = await media.saveDraft(h.handle, { sessionId: x.view.session.sessionId, branchId: x.view.revision.branchId, draftId: draft.value.draftId, commands, cursor: 1, expectedRevision: draft.revision });
        expect(await media.raster(h.handle, saved.value)).toEqual(Buffer.from([255]));
        await expect(media.saveDraft(h.handle, { sessionId: x.view.session.sessionId, branchId: x.view.revision.branchId, draftId: draft.value.draftId, commands, cursor: 0, expectedRevision: draft.revision })).rejects.toThrow('conflict');
        const mask = await media.freezeMask(h.handle, { draftId: draft.value.draftId, expectedRevision: saved.revision });
        await media.saveDraft(h.handle, { sessionId: x.view.session.sessionId, branchId: x.view.revision.branchId, draftId: draft.value.draftId, commands, cursor: 0, expectedRevision: saved.revision });
        expect((await x.f.assetStore.read(h.handle, mask.assetId)).bytes).toEqual(Buffer.from([255]));
        const restored = await new MediaStudio({ host: x.host }).draft(h.handle, draft.value.draftId); expect(restored.value.cursor).toBe(0);
    });
    test('OpenAI image/mask transmission needs exact approval; original and composite are separate immutable DAG nodes', async () => {
        const draft = await media.createDraft(h.handle, scope());
        const saved = await media.saveDraft(h.handle, { sessionId: x.view.session.sessionId, branchId: x.view.revision.branchId, draftId: draft.value.draftId, commands: [{ kind: 'fill', value: 255 }], cursor: 1, expectedRevision: draft.revision });
        const mask = await media.freezeMask(h.handle, { draftId: draft.value.draftId, expectedRevision: saved.revision });
        const preview = await media.prepare(h.handle, { ...scope(), operation: 'inpaint', maskArtifactId: mask.maskArtifactId, prompt: 'change color', preserveOutsideMask: true, referenceIds: [] });
        await expect(x.images.start(h.handle, { prepareId: preview.prepareId, approval: x.approval(preview) })).rejects.toThrow('external_transfer_unauthorized');
        const started = await x.images.start(h.handle, { prepareId: preview.prepareId, approval: { ...x.approval(preview), externalAssetIds: preview.externalAssetIds } });
        await x.images.wait(h.handle, started.operationId); const result = await x.images.status(h.handle, started);
        expect(result.state.images.map(i => i.mediaOperation.kind)).toEqual(['txt2img', 'inpaint', 'composite']);
        expect(result.state.images[2].mediaOperation.parentImageVersionIds).toEqual([base.imageVersionId, result.state.images[1].imageVersionId]);
        expect(result.state.annotations[0].selectedImageVersionId).toBeNull();
        const manifest = await x.f.sessionRepo.getState(h.handle, x.view.session.sessionId, 'atri_illustrations', result.head);
        expect(manifest.images).toBeUndefined(); expect(manifest.imageRefs).toHaveLength(3); expect(JSON.stringify(manifest)).not.toContain('gpt-image-1');
        const exported = await x.f.saveSystem.exportSession(h.handle, x.view.session.sessionId), target = await harness();
        try {
            const other = services(target); await other.packageInstaller.install(target.handle, await x.f.assetStore.readBlob(h.handle, x.view.session.packageContentHash));
            const imported = await other.saveSystem.importSave(target.handle, exported.archive); expect(imported.illustrations.images).toEqual(result.state.images);
            expect((await other.assetStore.read(target.handle, mask.assetId)).bytes).toEqual(Buffer.from([255]));
        } finally { await target.cleanup(); }
        await expect(media.prepare(h.handle, { ...scope(), operation: 'upscale', referenceIds: [] })).rejects.toThrow('capability_unsupported');
    });
    test('Gallery pagination/select CAS, explicit reference promotion, snapshot closure and distinct hide are permission checked', async () => {
        const gallery = new VisualGallery({ host: x.host }), page = await gallery.query(h.handle, { sessionId: x.view.session.sessionId, branchId: x.view.revision.branchId, limit: 1 });
        expect(page.items).toHaveLength(1); await gallery.select(h.handle, { ...scope(), expectedHead: page.head });
        await expect(gallery.select(h.handle, { ...scope(), expectedHead: page.head })).rejects.toThrow('head_conflict');
        const marked = await gallery.mark(h.handle, { ...scope(), action: 'hide', expectedRevision: null });
        expect((await gallery.query(h.handle, { sessionId: x.view.session.sessionId, branchId: x.view.revision.branchId })).items).toHaveLength(0);
        expect(marked.value.hidden).toBe(true);
        const promoted = await gallery.promote(h.handle, { ...scope(), purpose: 'style', identity: '', standard: false, allowedBranches: [x.view.revision.branchId], externalConnectionIds: [] });
        expect(promoted.state.references).toHaveLength(1);
        const exported = await x.f.saveSystem.exportSession(h.handle, x.view.session.sessionId); expect(exported.save.closure.stateRecords.find(r => r.namespace === 'atri_illustrations').data.references).toHaveLength(1);
        await expect(gallery.query(h.handle, { sessionId: x.view.session.sessionId, branchId: createNativeId('branch') })).rejects.toThrow();
    });
    test('GC scans twice and respects newly acquired references and minimum grace; only unreachable refs are swept', async () => {
        let now = Date.now(); const gc = new VisualMediaGc({ host: x.host, now: () => now });
        const bytes = Buffer.from('temporary'), ref = { assetId: createNativeId('asset'), contentHash: sha(bytes), size: bytes.length, mediaType: 'application/octet-stream' };
        await x.f.assetStore.put(h.handle, ref, bytes); const marked = await gc.mark(h.handle, ref.assetId); expect(marked.value.phase).toBe('quarantined');
        await expect(gc.sweep(h.handle, ref.assetId)).rejects.toThrow('not_due');
        await expect(gc.mark(h.handle, ref.assetId, { graceDays: 0 })).rejects.toThrow('grace_invalid');
        await media.store.write(h.handle, 'lease', 'export-test', { assetId: ref.assetId }, null); now += 8 * 86400000;
        expect((await gc.sweep(h.handle, ref.assetId)).blocked.length).toBeGreaterThan(0);
        const other = { ...ref, assetId: createNativeId('asset') }; await x.f.assetStore.put(h.handle, other, bytes);
        await gc.mark(h.handle, other.assetId); now += 8 * 86400000; expect((await gc.sweep(h.handle, other.assetId)).value.phase).toBe('swept');
        expect(await x.f.assetStore.getRef(h.handle, other.assetId)).toBeNull(); expect(await x.f.assetStore.getRef(h.handle, ref.assetId)).not.toBeNull();
    });
});
test.each(['nai-diffusion-3', 'nai-diffusion-4-full', 'nai-diffusion-4-5-full', 'nai-diffusion-5-full'])('NovelAI %s L1 editing is model scoped and uses canonical mask descriptors', async model => {
    const h = await makeTempFsEngineHarness();
    try {
        const x = await setupVisual(h, { model, provider: { generate: async () => ({ bytes: visualPng, width: 1, height: 1 }) } }), p = await x.prepare();
        const started = await x.images.start(h.handle, { prepareId: p.prepareId, approval: x.approval(p) }); await x.images.wait(h.handle, started.operationId);
        const base = (await x.images.status(h.handle, started)).state.images[0], media = new MediaStudio({ host: x.host, images: x.images });
        const preview = await media.prepare(h.handle, { sessionId: x.view.session.sessionId, branchId: x.view.revision.branchId, imageVersionId: base.imageVersionId, operation: 'img2img', referenceIds: [] });
        expect((await media.store.read(h.handle, 'prepared', preview.prepareId)).value.compiled.body.action).toBe('img2img');
    } finally { await h.cleanup(); }
});
test.each(['nai-diffusion-3', 'nai-diffusion-4-full', 'nai-diffusion-4-5-full', 'nai-diffusion-5-full'])('NovelAI %s editing L2 sends frozen pixels with the operation-specific wire format', async model => {
    const requests = [], adapter = createNovelaiVisualAdapter({ fetchImpl: async (url, options) => {
        requests.push({ url, body: JSON.parse(options.body) }); return new Response(visualPng);
    } });
    const connection = { providerAdapter: 'provider.novelai-image-compatible', transport: 'transport.http', endpoint: 'http://127.0.0.1:8080/ai/generate-image', options: { imageCapabilities: { ...officialNovelaiCapabilities(), responseFormat: 'png' } } };
    const base = { assetId: createNativeId('asset'), contentHash: sha(visualPng), purpose: 'base' };
    const maskBytes = Buffer.from([255]), mask = { assetId: createNativeId('asset'), contentHash: sha(maskBytes), purpose: 'mask' };
    const options = { secret: 'fixture-only', signal: new AbortController().signal, readAsset: async id => ({ bytes: id === base.assetId ? visualPng : maskBytes, ref: id === base.assetId ? base : mask }) };
    for (const operation of ['img2img', 'inpaint', 'upscale']) {
        const compiled = adapter.compile({ ir: { authoring: 'raw', prompt: 'edit', negativePrompt: '', scene: '', style: '', participants: [], operation, references: [base, mask] }, target: { model, nativeParameters: {} }, connection, seed: 17 });
        await adapter.generate({ ...compiled, responseFormat: 'png', maskGeometry: { width: 1, height: 1 } }, options);
        const { url, body } = requests.at(-1);
        if (operation === 'upscale') { expect(url).toMatch(/\/ai\/upscale$/); expect(body.image).toBe(visualPng.toString('base64')); }
        else { expect(body.parameters.image).toBe(visualPng.toString('base64')); expect(body.action).toBe(operation === 'inpaint' ? 'infill' : 'img2img'); }
        if (operation === 'inpaint') { expect(body.model).toBe(model + '-inpainting'); expect(PNG.sync.read(Buffer.from(body.parameters.mask, 'base64')).data).toEqual(Buffer.from([255,255,255,255])); }
    }
    expect(() => adapter.compile({ ir: { authoring: 'raw', prompt: 'edit', negativePrompt: '', scene: '', style: '', participants: [], operation: 'img2img', references: [base, { ...base, purpose: 'identity' }, { ...base, purpose: 'vibe' }] }, target: { model, nativeParameters: {} }, connection, seed: 17 })).toThrow('reference_combination_unsupported');
});
