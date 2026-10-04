import { createIllustrationDraft, defaultIllustrationSettings } from '../../public/shared/illustration-plugin-contract.js';
import { createHash } from 'node:crypto';
import { createNativeId, IllustrationService, assertAtriaSave } from '../../src/native/index.js';
import { ILLUSTRATION_NAMESPACE } from '../../public/shared/native-illustration-contract.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture, services } from './helpers/session-fixture.js';
import { runFixture } from './helpers/run-fixture.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7N0AAAAASUVORK5CYII=', 'base64');

function selection(view, start = 0, end = view.timeline.at(-1).content.length) {
    const entry = view.timeline.at(-1);
    return { revisionId: view.revision.revisionId, messageId: entry.messageId, variantId: entry.activeVariantId,
        start, end, quote: entry.content.slice(start, end) };
}
async function image(f, h, annotationId, options = {}) {
    const ref = { assetId: createNativeId('asset'), contentHash: createHash('sha256').update(PNG).digest('hex'), size: PNG.length, mediaType: 'image/png' };
    await f.assetStore.put(h.handle, ref, PNG);
    const result = await f.illustrations.addImageVersion(h.handle, f.sessionId, { annotationId, assetId: ref.assetId,
        width: 1, height: 1, alt: 'Alice at the window', prompt: 'Alice, window', parameters: { seed: 1 }, ...options });
    return { ...result, ref };
}

describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('Illustration presentation — %s', (_name, makeHarness) => {
    let h, f, view;
    beforeEach(async () => {
        h = await makeHarness(); f = await installFixture(h);
        view = await f.core.create(h.handle, f.start); f.sessionId = view.session.sessionId;
        f.illustrations = new IllustrationService({ sessionRepo: f.sessionRepo });
    });
    afterEach(async () => h.cleanup());

    test('anchors validate exact committed source without advancing narrative or allowing runtime state bypass', async () => {
        const original = structuredClone(view);
        const result = await f.illustrations.createAnnotation(h.handle, f.sessionId, { ...selection(view), expectedHead: null });
        const loaded = await f.core.load(h.handle, f.sessionId);
        expect(loaded.revision).toEqual(original.revision);
        expect(loaded.variants).toEqual(original.variants);
        expect(loaded.states).toEqual(original.states);
        expect(loaded.illustrations.annotations).toEqual(result.state.annotations);
        await expect(f.illustrations.createAnnotation(h.handle, f.sessionId, { ...selection(view), quote: 'wrong' })).rejects.toThrow();
        await expect(f.illustrations.createAnnotation(h.handle, f.sessionId, { ...selection(view), variantId: createNativeId('variant') })).rejects.toThrow();
        await expect(f.core.applyRuntimeCommit(h.handle, f.sessionId, { statePatch: { [ILLUSTRATION_NAMESPACE]: result.state } }, { expectedRevisionId: view.revision.revisionId })).rejects.toThrow();
        view = await f.core.appendTimeline(h.handle, f.sessionId, { role: 'user', content: 'A😀B' });
        await expect(f.illustrations.createAnnotation(h.handle, f.sessionId, selection(view, 1, 2))).rejects.toThrow();
        const unicode = await f.illustrations.createAnnotation(h.handle, f.sessionId, selection(view, 1, 3));
        expect(unicode.state.annotations.at(-1).anchor.quote).toBe('😀');
    });

    test('presentation CAS and concurrent writes preserve marks through a stale narrative publication', async () => {
        const attempts = await Promise.allSettled([1, 2].map(() => f.illustrations.createAnnotation(h.handle, f.sessionId, { ...selection(view), expectedHead: null })));
        expect(attempts.filter(item => item.status === 'fulfilled')).toHaveLength(1);
        expect(attempts.find(item => item.status === 'rejected').reason.code).toBe('native_illustration_head_conflict');
        await Promise.all([1, 2].map(() => f.illustrations.createAnnotation(h.handle, f.sessionId, selection(view))));
        const head = (await f.sessionRepo.get(h.handle, f.sessionId)).illustrationHead;
        const published = await f.core._publish(h.handle, view);
        expect(published.session.illustrationHead).toBe(head);
        expect(published.illustrations.annotations).toHaveLength(3);
    });

    test('card edits are presentation-only, CAS protected, saved and branch isolated', async () => {
        const { draft } = createIllustrationDraft('Opening', defaultIllustrationSettings(), view.session.packageId);
        const initial = await f.illustrations.createAnnotation(h.handle, f.sessionId, { ...selection(view), draft, expectedHead: null });
        const annotationId = initial.state.annotations[0].annotationId;
        const branchId = view.revision.branchId;
        draft.prompt = 'hand edited'; draft.scene = 'at the window';
        const edited = await f.illustrations.updateAnnotation(h.handle, f.sessionId, { annotationId, draft, expectedHead: initial.head, branchId });
        await expect(f.illustrations.updateAnnotation(h.handle, f.sessionId, { annotationId, draft, expectedHead: initial.head, branchId })).rejects.toThrow('head_conflict');
        const loaded = await f.core.load(h.handle, f.sessionId);
        expect(loaded.revision).toEqual(view.revision); expect(loaded.variants).toEqual(view.variants);
        const saved = await f.saveSystem.manualSave(h.handle, f.sessionId);
        draft.prompt = 'newer edit';
        await f.illustrations.updateAnnotation(h.handle, f.sessionId, { annotationId, draft, expectedHead: edited.head, branchId });
        const exported = await f.saveSystem.exportSnapshot(h.handle, f.sessionId, saved.saveId);
        expect(exported.save.closure.stateRecords.find(item => item.namespace === ILLUSTRATION_NAMESPACE).data.annotations[0].draft.prompt).toBe('hand edited');
        const target = await makeHarness();
        try {
            const other = services(target); await other.packageInstaller.install(target.handle, await f.assetStore.readBlob(h.handle, view.session.packageContentHash));
            const imported = await other.saveSystem.importSave(target.handle, exported.archive);
            expect(imported.illustrations.annotations[0].draft.prompt).toBe('hand edited');
        } finally { await target.cleanup(); }
        const restored = await f.core.restoreSavePoint(h.handle, f.sessionId, saved.saveId, { expectedRevisionId: view.revision.revisionId });
        expect(restored.illustrations.annotations[0].draft.prompt).toBe('hand edited');
        draft.prompt = 'late original branch edit';
        await f.illustrations.updateAnnotation(h.handle, f.sessionId, { annotationId, draft, branchId });
        expect((await f.core.load(h.handle, f.sessionId)).illustrations.annotations[0].draft.prompt).toBe('hand edited');
        await f.illustrations.deleteAnnotation(h.handle, f.sessionId, { annotationId, branchId: restored.revision.branchId });
        await expect(f.illustrations.updateAnnotation(h.handle, f.sessionId, { annotationId, draft, branchId: restored.revision.branchId })).rejects.toThrow('deleted');
    });

    test('images stay with their annotation; deleting a mark preserves history and rejects cross-mark selection', async () => {
        const one = await f.illustrations.createAnnotation(h.handle, f.sessionId, selection(view));
        const two = await f.illustrations.createAnnotation(h.handle, f.sessionId, selection(view));
        const annotationId = one.state.annotations[0].annotationId;
        const generated = await image(f, h, annotationId);
        const imageVersionId = generated.state.images[0].imageVersionId;
        await expect(f.illustrations.selectImageVersion(h.handle, f.sessionId, { annotationId: two.state.annotations[1].annotationId, imageVersionId })).rejects.toThrow();
        await expect(f.illustrations.addImageVersion(h.handle, f.sessionId, { annotationId, assetId: createNativeId('asset'), width: 1, height: 1, alt: '' })).rejects.toThrow();
        const head = (await f.sessionRepo.get(h.handle, f.sessionId)).illustrationHead;
        await expect(image(f, h, annotationId, { parameters: { api_key: 'must-not-persist' } })).rejects.toThrow();
        expect((await f.sessionRepo.get(h.handle, f.sessionId)).illustrationHead).toBe(head);
        const deleted = await f.illustrations.deleteAnnotation(h.handle, f.sessionId, { annotationId });
        expect(deleted.state.images).toHaveLength(1);
        expect(deleted.state.annotations[0].selectedImageVersionId).toBeNull();
        const late = await image(f, h, annotationId);
        expect(late.state.images).toHaveLength(2);
        expect(late.state.annotations[0].selectedImageVersionId).toBeNull();
        await expect(f.assetStore.deleteRef(h.handle, generated.ref.assetId)).rejects.toMatchObject({ code: 'native_asset_ref_referenced' });
    });

    test('save captures its image versions; restore retains original branch and clean import preserves snapshot', async () => {
        const marked = await f.illustrations.createAnnotation(h.handle, f.sessionId, selection(view));
        const annotationId = marked.state.annotations[0].annotationId;
        const first = await image(f, h, annotationId);
        const saved = await f.saveSystem.manualSave(h.handle, f.sessionId);
        const second = await image(f, h, annotationId);
        const exported = await f.saveSystem.exportSnapshot(h.handle, f.sessionId, saved.saveId);
        expect(exported.save.closure.stateRecords.find(item => item.namespace === ILLUSTRATION_NAMESPACE).data.images).toHaveLength(1);
        expect(exported.save.closure.assetRefs.map(item => item.assetId)).toContain(first.ref.assetId);
        expect(exported.save.closure.assetRefs.map(item => item.assetId)).not.toContain(second.ref.assetId);
        const originalBranch = view.revision.branchId;
        const restored = await f.core.restoreSavePoint(h.handle, f.sessionId, saved.saveId, { expectedRevisionId: view.revision.revisionId });
        expect(restored.revision.branchId).not.toBe(originalBranch);
        expect(restored.illustrations.images).toHaveLength(1);
        const original = await f.core.switchBranch(h.handle, f.sessionId, originalBranch, { expectedRevisionId: restored.revision.revisionId });
        expect(original.illustrations.images).toHaveLength(2);
        const archive = await f.saveSystem.exportSession(h.handle, f.sessionId);
        expect(archive.save.closure.assetRefs.map(item => item.assetId)).toEqual(expect.arrayContaining([first.ref.assetId, second.ref.assetId]));
        const target = await makeHarness();
        try {
            const other = services(target);
            await other.packageInstaller.install(target.handle, await f.assetStore.readBlob(h.handle, view.session.packageContentHash));
            const imported = await other.saveSystem.importSave(target.handle, exported.archive);
            expect(imported.illustrations.images).toHaveLength(1);
            expect((await other.assetStore.read(target.handle, first.ref.assetId)).bytes).toEqual(PNG);
            const broken = structuredClone(exported.save);
            const state = broken.closure.stateRecords.find(item => item.namespace === ILLUSTRATION_NAMESPACE);
            state.data.annotations[0].anchor.contentHash = '0'.repeat(64);
            state.head = hashNativeDocument(state.data);
            broken.closure.session.illustrationHead = state.head;
            broken.closure.session.illustrationHeads = { [saved.branchId]: state.head };
            broken.closure.savePoints[0].illustrationHead = state.head;
            expect(() => assertAtriaSave(broken)).toThrow('Invalid illustration source');
        } finally { await target.cleanup(); }
    });

    test('late image can finalize on its original branch after the reader switches branches', async () => {
        const marked = await f.illustrations.createAnnotation(h.handle, f.sessionId, selection(view));
        const branchId = view.revision.branchId;
        view = await f.core.forkBranch(h.handle, f.sessionId, { revisionId: view.revision.revisionId, expectedRevisionId: view.revision.revisionId });
        await image(f, h, marked.state.annotations[0].annotationId, { branchId });
        const current = await f.core.load(h.handle, f.sessionId);
        expect(current.illustrations.images).toHaveLength(0);
        const previous = await f.core.switchBranch(h.handle, f.sessionId, branchId, { expectedRevisionId: current.revision.revisionId });
        expect(previous.illustrations.images).toHaveLength(1);
    });

    test('saving a historical branch captures its pictures rather than the currently active branch', async () => {
        const marked = await f.illustrations.createAnnotation(h.handle, f.sessionId, selection(view));
        const annotationId = marked.state.annotations[0].annotationId;
        const original = await image(f, h, annotationId);
        await f.core.forkBranch(h.handle, f.sessionId, { revisionId: view.revision.revisionId, expectedRevisionId: view.revision.revisionId });
        await image(f, h, annotationId);
        const saved = await f.saveSystem.manualSave(h.handle, f.sessionId, { revisionId: view.revision.revisionId });
        expect(saved.illustrationHead).toBe(original.head);
        const exported = await f.saveSystem.exportSnapshot(h.handle, f.sessionId, saved.saveId);
        expect(exported.save.closure.stateRecords.find(item => item.namespace === ILLUSTRATION_NAMESPACE).data.images).toHaveLength(1);
    });

    test('an old save retains image references after current history is explicitly cleared', async () => {
        const marked = await f.illustrations.createAnnotation(h.handle, f.sessionId, selection(view));
        const generated = await image(f, h, marked.state.annotations[0].annotationId);
        const saved = await f.saveSystem.manualSave(h.handle, f.sessionId);
        await f.sessionRepo.updateIllustrations(h.handle, f.sessionId, state => ({ ...state, images: [], annotations: state.annotations.map(item => ({ ...item, selectedImageVersionId: null })) }));
        expect(await f.assetStore.getReferences(h.handle, generated.ref.assetId)).toEqual(expect.arrayContaining([expect.objectContaining({ saveId: saved.saveId })]));
        await expect(f.assetStore.deleteRef(h.handle, generated.ref.assetId)).rejects.toMatchObject({ code: 'native_asset_ref_referenced' });
        await f.savePointRepo.delete(h.handle, f.sessionId, saved.saveId);
        expect(await f.assetStore.deleteRef(h.handle, generated.ref.assetId)).toBe(true);
    });

    test('concurrent asset deletion and illustration registration cannot leave a dangling version', async () => {
        const marked = await f.illustrations.createAnnotation(h.handle, f.sessionId, selection(view));
        const ref = { assetId: createNativeId('asset'), contentHash: createHash('sha256').update(PNG).digest('hex'), size: PNG.length, mediaType: 'image/png' };
        await f.assetStore.put(h.handle, ref, PNG);
        const results = await Promise.allSettled([
            f.illustrations.addImageVersion(h.handle, f.sessionId, { annotationId: marked.state.annotations[0].annotationId, assetId: ref.assetId, width: 1, height: 1, alt: 'A scene' }),
            f.assetStore.deleteRef(h.handle, ref.assetId),
        ]);
        expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1);
        const state = (await f.sessionRepo.getIllustrations(h.handle, f.sessionId)).state;
        const registered = results[0].status === 'fulfilled';
        expect(state.images).toHaveLength(registered ? 1 : 0);
        expect(Boolean(await f.assetStore.getRef(h.handle, ref.assetId))).toBe(registered);
    });
});

test('ironman resume preserves pictures with only the current reachable narrative and imports to a clean store', async () => {
    const h = await makeTempFsEngineHarness(), target = await makeTempFsEngineHarness();
    try {
        const f = await runFixture(h, 'http://127.0.0.1:1/unused');
        let view = await f.begin('ironman'); f.sessionId = view.session.sessionId;
        f.illustrations = new IllustrationService({ sessionRepo: f.sessionRepo });
        const marked = await f.illustrations.createAnnotation(h.handle, f.sessionId, selection(view));
        const generated = await image(f, h, marked.state.annotations[0].annotationId);
        view = await f.core._publish(h.handle, view);
        const exported = await f.saveSystem.exportSession(h.handle, f.sessionId);
        expect(exported.save.scope).toBe('resume'); expect(exported.save.closure.revisions).toHaveLength(1);
        const presentation = exported.save.closure.stateRecords.find(item => item.namespace === ILLUSTRATION_NAMESPACE);
        expect(presentation.data.annotations[0].anchor.revisionId).toBe(view.revision.revisionId);
        const other = services(target); await other.packageInstaller.install(target.handle, f.archive);
        const imported = await other.saveSystem.importSave(target.handle, exported.archive);
        expect(imported.illustrations.images).toHaveLength(1);
        expect((await other.assetStore.read(target.handle, generated.ref.assetId)).bytes).toEqual(PNG);
    } finally { await h.cleanup(); await target.cleanup(); }
});
