import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { VisualStore, defaultVisualBudget } from '../../src/native/visual-store.js';
import { ImageJobWorker } from '../../src/native/image-worker.js';
import { createImageRegistry, resolveImageSelection } from '../../src/native/image-registry.js';
import { createNativeId } from '../../src/native/identity.js';
import { VersionedJsonResourceHandler } from '../../src/native/model-prompt-runtime/persistence.js';
import { IllustrationService } from '../../src/native/illustration-service.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { assertIllustrationState } from '../../public/shared/native-illustration-contract.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture, services } from './helpers/session-fixture.js';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function job(now, extra = {}) {
    return { jobId: createNativeId('imageJob'), fingerprint: 'f'.repeat(64), intentKey: createNativeId('visualIntent'),
        reservation: { amount: 1, currency: 'USD', released: false }, mode: 'automatic', createdAt: now, status: 'queued', fence: 0, lease: null,
        nextAttemptId: createNativeId('imageAttempt'), attempts: [], connection: { providerAdapter: 'provider.fixture' }, ...extra };
}
describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('visual Native kernel %s', (_, harness) => {
    let h, store, clock;
    beforeEach(async () => { h = await harness(); clock = Date.now(); store = new VisualStore({ engine: h.engine, now: () => clock }); });
    afterEach(async () => h.cleanup());
    test('Target/Rendering reuse immutable versioned resources; independent four-level selection', async () => {
        const handler = new VersionedJsonResourceHandler({ engine: h.engine });
        const target = { schemaVersion: 2, imageTargetId: createNativeId('imageTarget'), revision: 'r1', displayName: 'target', connectionProfileId: createNativeId('connectionProfile'),
            model: 'fixture', serviceVersion: 'fixture-v1', nativeParameters: {}, workflow: null, capabilities: null };
        await handler.commit(h.handle, 'core.image-target', target);
        expect((await handler.getCurrent(h.handle, 'core.image-target', target.imageTargetId)).snapshot).toEqual(target);
        await expect(handler.commit(h.handle, 'core.image-target', { ...target, model: 'changed' })).rejects.toThrow('immutable_conflict');
        const selection = resolveImageSelection({ task: { imageTargetId: target.imageTargetId }, work: { imageRenderingId: 'work' }, global: { imageTargetId: 'global', imageRenderingId: 'global' } });
        expect(selection.imageTargetIdOrigin).toBe('task'); expect(selection.imageRenderingIdOrigin).toBe('work');
    });
    test('concurrent CAS admission cannot overspend; planner ledger and image ledger remain separate across restart', async () => {
        await store.configureBudget(h.handle, { ...defaultVisualBudget(), moneyDay: 2, autoMoneyDay: 2, autoConcurrency: 3, plannerHour: 1 }, null);
        const outcomes = await Promise.allSettled([1, 2, 3].map(() => store.reserve(h.handle, job(clock))));
        expect(outcomes.filter(row => row.status === 'fulfilled')).toHaveLength(2);
        expect(outcomes.find(row => row.status === 'rejected').reason.message).toContain('budget_exceeded');
        await store.reservePlanner(h.handle, { reservationId: 'one', tokens: 20 });
        await expect(store.reservePlanner(h.handle, { reservationId: 'two', tokens: 20 })).rejects.toThrow('planner_budget_exceeded');
        const restarted = new VisualStore({ engine: h.engine, now: () => clock });
        expect(await restarted.list(h.handle, 'job')).toHaveLength(2);
        await expect(restarted.list('another-owner', 'job')).rejects.toThrow('unknown handle');
        await expect(restarted.configureBudget(h.handle, defaultVisualBudget(), null)).rejects.toThrow('conflict');
    });
    test('Intent replay reserves once, stale fences fail; expired submission stays uncertain and retains cost without resend', async () => {
        const input = job(clock, { mode: 'manual', reservation: { amount: 0, currency: '', released: false } });
        await store.reserve(h.handle, input); await store.reserve(h.handle, { ...input, jobId: createNativeId('imageJob') });
        expect(await store.list(h.handle, 'job')).toHaveLength(1);
        const claimed = await store.claim(h.handle, input.jobId, 'worker');
        await expect(store.claim(h.handle, input.jobId, 'other')).rejects.toThrow('lease_conflict');
        await expect(store.fenced(h.handle, input.jobId, claimed.fence + 1, j => j)).rejects.toThrow('lease_conflict');
        clock += 60001;
        const registry = { get: () => ({}) }, worker = new ImageJobWorker({ store, registry });
        await worker.recover(h.handle);
        const result = (await store.read(h.handle, 'job', input.jobId)).value;
        expect(result.status).toBe('uncertain_submission'); expect(result.reservation.released).toBe(false);
        expect(result.attempts).toHaveLength(1); await worker.recover(h.handle);
        expect((await store.read(h.handle, 'job', input.jobId)).value.attempts).toHaveLength(1);
    });
    test('Media DAG/Mask stay editable through save import; AssetStore refuses dependent Mask and orphan parents', async () => {
        const f = await installFixture(h), view = await f.core.create(h.handle, f.start), illustrations = new IllustrationService({ sessionRepo: f.sessionRepo });
        const entry = view.timeline.at(-1), marked = await illustrations.createAnnotation(h.handle, view.session.sessionId, { revisionId: view.revision.revisionId,
            messageId: entry.messageId, variantId: entry.activeVariantId, start: 0, end: entry.content.length, quote: entry.content });
        const annotation = marked.state.annotations[0], png = PNG.sync.write({ width: 1, height: 1, data: Buffer.from([1, 2, 3, 255]) });
        const base = { assetId: createNativeId('asset'), contentHash: digest(png), size: png.length, mediaType: 'image/png' };
        const maskBytes = Buffer.from([255]), mask = { assetId: createNativeId('asset'), contentHash: digest(maskBytes), size: 1, mediaType: 'application/x-atria-mask-gray8' };
        await f.assetStore.put(h.handle, base, png); await f.assetStore.put(h.handle, mask, maskBytes);
        let state = (await illustrations.addImageVersion(h.handle, view.session.sessionId, { annotationId: annotation.annotationId, assetId: base.assetId, width: 1, height: 1, alt: 'base' })).state;
        const parent = state.images[0], source = { kind: 'session', sessionId: view.session.sessionId, branchId: view.revision.branchId,
            revisionId: view.revision.revisionId, annotationId: annotation.annotationId, anchor: annotation.anchor, timeKind: 'present' };
        const operation = { schemaVersion: 2, mediaOperationId: createNativeId('mediaOperation'), kind: 'inpaint', source,
            parentImageVersionIds: [parent.imageVersionId], inputAssets: [{ assetId: base.assetId, contentHash: base.contentHash, purpose: 'base' }, { assetId: mask.assetId, contentHash: mask.contentHash, purpose: 'mask' }],
            mask: { maskArtifactId: createNativeId('maskArtifact'), assetId: mask.assetId, contentHash: mask.contentHash, baseHash: base.contentHash, width: 1, height: 1, semantic: 'gray8-0-preserve-255-edit' }, geometry: null };
        state = (await illustrations.addImageVersion(h.handle, view.session.sessionId, { annotationId: annotation.annotationId, assetId: base.assetId, width: 1, height: 1, alt: 'edited', mediaOperation: operation })).state;
        await expect(f.assetStore.deleteRef(h.handle, mask.assetId)).rejects.toThrow('referenced');
        expect(() => assertIllustrationState({ ...state, images: state.images.slice(1) })).toThrow('parent_missing');
        const cycle = structuredClone(state); cycle.images[1].mediaOperation.parentImageVersionIds = [cycle.images[1].imageVersionId]; expect(() => assertIllustrationState(cycle)).toThrow('dag_cycle');
        const exported = await f.saveSystem.exportSession(h.handle, view.session.sessionId), target = await harness();
        try {
            const other = services(target); await other.packageInstaller.install(target.handle, await f.assetStore.readBlob(h.handle, view.session.packageContentHash));
            const imported = await other.saveSystem.importSave(target.handle, exported.archive);
            expect(imported.illustrations.images[1].mediaOperation).toEqual(operation);
            expect((await other.assetStore.read(target.handle, mask.assetId)).bytes).toEqual(maskBytes);
        } finally { await target.cleanup(); }
        const draft = await store.write(h.handle, 'draft', 'fixture', { assetId: mask.assetId }, null);
        expect(draft.revision).toBe(hashNativeDocument(draft.value));
    });
});
test('registry does not infer unsupported Provider adapters', () => expect(() => createImageRegistry().get('provider.unknown')).toThrow('adapter_unsupported'));
