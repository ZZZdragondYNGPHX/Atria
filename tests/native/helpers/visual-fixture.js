import { PNG } from 'pngjs';
import { createNativeId } from '../../../src/native/identity.js';
import { NativeModelPromptPersistence, VersionedJsonResourceHandler } from '../../../src/native/model-prompt-runtime/persistence.js';
import { ExtensionsStore } from '../../../src/native/extensions-store.js';
import { IllustrationService } from '../../../src/native/illustration-service.js';
import { IllustrationImageService } from '../../../src/native/illustration-image-service.js';
import { NativeTaskScheduler } from '../../../src/native/task-scheduler.js';
import { defaultIllustrationSettings, createIllustrationDraft } from '../../../public/shared/illustration-plugin-contract.js';
import { officialNovelaiCapabilities } from '../../../public/shared/novelai-illustration.js';
import { defaultVisualBudget } from '../../../src/native/visual-store.js';
import { installFixture } from './session-fixture.js';

export const visualPng = PNG.sync.write({ width: 1, height: 1, data: Buffer.from([30, 90, 150, 255]) });
export const deferredVisual = () => { let resolve; const promise = new Promise(yes => resolve = yes); return { promise, resolve }; };
export async function setupVisual(h, { registry, provider, initial, model = 'nai-diffusion-5-full', endpoint = 'http://127.0.0.1:1/generate', adapter = 'provider.novelai-image-compatible', parameters = {}, workflow = null } = {}) {
    const f = initial?.f ?? await installFixture(h), view = initial?.view ?? await f.core.create(h.handle, f.start);
    const persistence = new NativeModelPromptPersistence({ engine: h.engine }), library = new VersionedJsonResourceHandler({ engine: h.engine }), extensions = new ExtensionsStore({ engine: h.engine });
    const connection = { schemaVersion: 1, scope: 'player', connectionProfileId: createNativeId('connectionProfile'), displayName: 'image fixture', providerAdapter: adapter,
        transport: 'transport.http', endpoint, secretRef: { scope: 'player', secretId: 'fixture-secret-ref' }, networkPolicy: {}, options: adapter === 'provider.novelai-image-compatible' ? { imageCapabilities: officialNovelaiCapabilities() } : {} };
    await persistence.saveConnectionProfile(h.handle, connection);
    const target = { schemaVersion: 2, imageTargetId: createNativeId('imageTarget'), revision: 'r1', displayName: 'fixture target', connectionProfileId: connection.connectionProfileId,
        model, serviceVersion: 'fixture', nativeParameters: parameters, workflow, capabilities: null };
    await library.commit(h.handle, 'core.image-target', target);
    const settings = defaultIllustrationSettings(); settings.imageTargetId = target.imageTargetId;
    await extensions.saveIllustrationSettings(h.handle, settings, (await extensions.illustrationSettings(h.handle)).revision);
    const host = { sessionCore: f.core, packageInstaller: f.packageInstaller, persistence, library, extensions, secretPort: { resolveSecret: async () => 'synthetic-secret' } };
    const images = new IllustrationImageService({ host, registry, provider, scheduler: new NativeTaskScheduler({ timeoutMs: 10000 }) });
    await images.store.configureBudget(h.handle, { ...defaultVisualBudget(), moneyDay: 100, autoMoneyDay: 100 }, null);
    const illustrations = new IllustrationService({ sessionRepo: f.sessionRepo });
    const draft = createIllustrationDraft('Opening', settings, view.session.packageId).draft; draft.prompt = 'confirmed prompt';
    const entry = view.timeline.at(-1), marked = await illustrations.createAnnotation(h.handle, view.session.sessionId, { revisionId: view.revision.revisionId, messageId: entry.messageId,
        variantId: entry.activeVariantId, start: 0, end: entry.content.length, quote: entry.content, draft });
    const annotation = marked.state.annotations[0];
    const prepare = async () => images.prepare(h.handle, { sessionId: view.session.sessionId, branchId: view.revision.branchId,
        annotationId: annotation.annotationId, expectedHead: (await f.sessionRepo.getIllustrations(h.handle, view.session.sessionId)).head });
    const approval = preview => ({ targetFingerprint: preview.targetFingerprint, requestHash: preview.requestHash, maxCost: 1,
        currency: 'USD', allowUnknownCost: true, externalAssetIds: [], omittedPreferred: [] });
    return { f, view, host, images, illustrations, connection, target, settings, annotation, prepare, approval };
}
