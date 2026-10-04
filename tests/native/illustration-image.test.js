import { jest } from '@jest/globals';
import { createServer } from 'node:http';
import express from 'express';
import request from 'supertest';
import AdmZip from 'adm-zip';
import { PNG } from 'pngjs';
import { IllustrationImageService } from '../../src/native/illustration-image-service.js';
import { IllustrationPromptService } from '../../src/native/illustration-prompt-service.js';
import { IllustrationService } from '../../src/native/illustration-service.js';
import { createNovelaiImageProvider } from '../../src/native/adapters/novelai-image-provider.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { NativeTaskScheduler, nativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { NativeModelPromptPersistence } from '../../src/native/model-prompt-runtime/persistence.js';
import { ExtensionsStore } from '../../src/native/extensions-store.js';
import { createNativeId } from '../../src/native/identity.js';
import { assertIllustrationState } from '../../public/shared/native-illustration-contract.js';
import { assertAtriaSave } from '../../src/native/contracts.js';
import { defaultIllustrationSettings, createIllustrationDraft, composeIllustrationPrompt } from '../../public/shared/illustration-plugin-contract.js';
import { officialNovelaiCapabilities, novelaiConnectionCapabilities, renderNovelaiIllustration, NOVELAI_IMAGE_ENDPOINT } from '../../public/shared/novelai-illustration.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture, services } from './helpers/session-fixture.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { runFixture } from './helpers/run-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';

const png = PNG.sync.write({ width: 1, height: 1, data: Buffer.from([30, 90, 150, 255]) });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const connection = () => ({ schemaVersion: 1, scope: 'player', connectionProfileId: createNativeId('connectionProfile'), displayName: 'Image fixture',
    providerAdapter: 'provider.novelai-image-compatible', transport: 'transport.http', endpoint: 'http://127.0.0.1:1/generate',
    secretRef: { scope: 'player', secretId: 'secret-exact-fixture' }, networkPolicy: {}, options: { imageCapabilities: officialNovelaiCapabilities() } });

describe('NovelAI explicit protocol', () => {
    test('official and compatible configurations are independent; unknown gateway capabilities never inferred', () => {
        const value = connection();
        expect(novelaiConnectionCapabilities(value).models).toHaveLength(5);
        expect(novelaiConnectionCapabilities({ ...value, providerAdapter: 'provider.novelai-image', endpoint: NOVELAI_IMAGE_ENDPOINT, options: {} }).responseFormat).toBe('zip');
        for (const invalid of [ { ...value, options: {} }, { ...value, endpoint: value.endpoint + '?token=private' },
            { ...value, providerAdapter: 'provider.novelai-image' }, { ...value, options: { imageCapabilities: { responseFormat: 'auto', models: [] } } } ]) {
            expect(() => novelaiConnectionCapabilities(invalid)).toThrow();
        }
    });
    test('V4 splits program-composed characters; hand edits and V3 retain the full confirmed input', () => {
        const settings = defaultIllustrationSettings();
        settings.characters = ['alice', 'bob'].map(id => ({ id, name: id, fixedPrompt: id + ' fixed', aliases: [], defaultClothing: 'coat', enabled: true, storyActorId: '' }));
        settings.works.book = { characterIds: ['alice', 'bob'] };
        const { draft } = createIllustrationDraft('alice bob', settings, 'book');
        draft.scene = 'harbor'; draft.preset.parameters.model = 'nai-diffusion-4-5-full'; draft.prompt = composeIllustrationPrompt(draft);
        const rendered = renderNovelaiIllustration(draft, officialNovelaiCapabilities(), 123);
        expect(rendered.body.input).toBe('harbor'); expect(rendered.body.parameters.seed).toBe(123);
        expect(rendered.body.parameters.v4_prompt.caption.char_captions.map(item => item.char_caption)).toEqual(['alice fixed, coat', 'bob fixed, coat']);
        expect(rendered.body.parameters.v4_prompt.use_coords).toBe(false);
        draft.prompt = 'my complete hand-written input';
        expect(renderNovelaiIllustration(draft, officialNovelaiCapabilities(), 1).body.parameters.v4_prompt.caption.char_captions).toEqual([]);
        expect(renderNovelaiIllustration(draft, officialNovelaiCapabilities(), 1).body.input).toBe(draft.prompt);
        draft.prompt = composeIllustrationPrompt(draft); draft.preset.parameters.model = 'nai-diffusion-3';
        expect(renderNovelaiIllustration(draft, officialNovelaiCapabilities(), 1).body.input).toBe(draft.prompt);
        expect(renderNovelaiIllustration(draft, officialNovelaiCapabilities(), 1).body.parameters.v4_prompt).toBeUndefined();
        for (const parameters of [{ model: 'unknown' }, { width: 831 }, { steps: 51 }, { sampler: 'invented' }, { model: 'nai-diffusion-4-full', sm: true }]) {
            expect(() => renderNovelaiIllustration({ ...draft, preset: { ...draft.preset, parameters } }, officialNovelaiCapabilities(), 1)).toThrow();
        }
    });
    test.each(['zip', 'json', 'png'])('bounded %s transport uses exact Secret, no redirects or implicit retry, and validates PNG pixels', async format => {
        const zip = new AdmZip(); zip.addFile('image_0.png', png);
        const bytes = format === 'zip' ? zip.toBuffer() : format === 'json' ? Buffer.from(JSON.stringify({ images: [{ image: png.toString('base64'), seed: 4 }] })) : png;
        const fetchImpl = jest.fn(async () => new Response(bytes, { status: 201 }));
        const provider = createNovelaiImageProvider({ fetchImpl });
        const result = await provider.generate({ endpoint: 'http://127.0.0.1/generate', body: { parameters: { seed: 4 } }, responseFormat: format }, { secret: 'exact-synthetic', signal: new AbortController().signal });
        expect(result).toEqual({ bytes: png, width: 1, height: 1 });
        expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: 'error', headers: { Authorization: 'Bearer exact-synthetic' } });
        const invalid = createNovelaiImageProvider({ fetchImpl: async () => new Response(format === 'json' ? JSON.stringify({ images: [{ image: 'invalid-base64' }] }) : 'not an image') });
        await expect(invalid.generate({ responseFormat: format, body: { parameters: { seed: 4 } } }, { signal: new AbortController().signal })).rejects.toThrow('response_invalid');
    });
    test('malformed/oversize responses and service failures cannot leak body or credentials or create retry traffic', async () => {
        const signal = new AbortController().signal;
        const fetchImpl = jest.fn(async () => new Response('private-token provider error', { status: 429 }));
        await expect(createNovelaiImageProvider({ fetchImpl }).generate({}, { secret: 'private-token', signal })).rejects.toThrow('rate_limited');
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const corrupt = Buffer.from(png); corrupt[45] ^= 1;
        await expect(createNovelaiImageProvider({ fetchImpl: async () => new Response(corrupt) }).generate({ responseFormat: 'png' }, { signal })).rejects.toThrow('response_invalid');
        const oversize = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(32 * 1024 * 1024 + 1)); controller.close(); } });
        await expect(createNovelaiImageProvider({ fetchImpl: async () => new Response(oversize) }).generate({ responseFormat: 'png' }, { signal })).rejects.toThrow('response_invalid');
        const zip = new AdmZip(); zip.addFile('one.png', png); zip.addFile('two.png', png);
        await expect(createNovelaiImageProvider({ fetchImpl: async () => new Response(zip.toBuffer()) }).generate({ responseFormat: 'zip' }, { signal })).rejects.toThrow('response_invalid');
    });
});

describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('Illustration image tasks — %s', (_name, harness) => {
    let h, f, view, host, images, illustrations, settings, profile, gate, sent, provider;
    beforeEach(async () => {
        h = await harness(); f = await installFixture(h); view = await f.core.create(h.handle, f.start);
        const persistence = new NativeModelPromptPersistence({ engine: h.engine }), extensions = new ExtensionsStore({ engine: h.engine });
        profile = connection(); await persistence.saveConnectionProfile(h.handle, profile);
        settings = defaultIllustrationSettings(); settings.imageConnectionId = profile.connectionProfileId;
        await extensions.saveIllustrationSettings(h.handle, settings, (await extensions.illustrationSettings(h.handle)).revision);
        gate = deferred(); sent = deferred();
        provider = { generate: jest.fn(async (rendered, options) => { sent.resolve({ rendered, options }); await gate.promise; return { bytes: png, width: 1, height: 1 }; }) };
        host = { sessionCore: f.core, packageInstaller: f.packageInstaller, persistence, extensions, execute: jest.fn(),
            secretPort: { resolveSecret: jest.fn(async () => 'synthetic-secret') } };
        illustrations = new IllustrationService({ sessionRepo: f.sessionRepo });
        images = new IllustrationImageService({ host, scheduler: new NativeTaskScheduler({ timeoutMs: 10000 }), provider });
    });
    afterEach(async () => { setReadOnly(false); gate.resolve(); await tick(); await h.cleanup(); });
    async function mark() {
        const { draft } = createIllustrationDraft('Opening', settings, view.session.packageId); draft.prompt = 'confirmed prompt';
        const entry = view.timeline.at(-1);
        return (await illustrations.createAnnotation(h.handle, view.session.sessionId, { revisionId: view.revision.revisionId, messageId: entry.messageId,
            variantId: entry.activeVariantId, start: 0, end: entry.content.length, quote: entry.content, draft })).state.annotations.at(-1);
    }
    async function start(annotation, service = images) {
        const presentation = await f.sessionRepo.getIllustrations(h.handle, view.session.sessionId, { branchId: view.revision.branchId });
        return service.start(h.handle, { sessionId: view.session.sessionId, branchId: view.revision.branchId, annotationId: annotation.annotationId, expectedHead: presentation.head });
    }
    async function finish(operationId) { gate.resolve(); await images.scheduler.operations.get(operationId).handle.result; return images.status(h.handle, { operationId }); }
    test('only a submitted mark starts; frozen confirmed input survives edits, chat and branch changes with image history in the original branch', async () => {
        const annotation = await mark(), originalBranch = view.revision.branchId;
        expect(provider.generate).not.toHaveBeenCalled();
        const started = await start(annotation), captured = await sent.promise;
        expect((await start(annotation)).operationId).toBe(started.operationId);
        expect(captured.rendered.body.input).toBe('confirmed prompt');
        expect(host.secretPort.resolveSecret).toHaveBeenCalledWith(profile.secretRef, { handle: h.handle });
        expect(new IllustrationPromptService({ host, scheduler: images.scheduler }).list(h.handle, { sessionId: view.session.sessionId, branchId: originalBranch })).toEqual([]);
        view = await f.core.appendTimeline(h.handle, view.session.sessionId, { role: 'user', content: 'continued plot' });
        view = await f.core.forkBranch(h.handle, view.session.sessionId, { revisionId: view.revision.revisionId, expectedRevisionId: view.revision.revisionId });
        const changed = structuredClone(annotation.draft); changed.prompt = 'later user edit';
        await illustrations.updateAnnotation(h.handle, view.session.sessionId, { annotationId: annotation.annotationId, draft: changed, branchId: originalBranch });
        await host.persistence.saveConnectionProfile(h.handle, { ...profile, displayName: 'changed config', endpoint: 'http://127.0.0.1:2/changed' });
        const result = await finish(started.operationId), image = result.state.images[0];
        expect(result.operation.anchor.branchId).toBe(originalBranch); expect(result.state.annotations[0].draft.prompt).toBe('later user edit');
        expect(image.prompt).toBe('confirmed prompt'); expect(image.requestSnapshot.connection.fingerprint).toBe(hashNativeDocument(profile));
        expect(image.parameters.seed).toBe(captured.rendered.body.parameters.seed); expect(image.width).toBe(1);
        expect(host.execute).not.toHaveBeenCalled(); expect(provider.generate).toHaveBeenCalledTimes(1);
        expect((await f.core.load(h.handle, view.session.sessionId)).illustrations.images).toEqual([]);
        await expect(f.assetStore.deleteRef(h.handle, image.assetId)).rejects.toThrow('referenced');
        view = await f.core.switchBranch(h.handle, view.session.sessionId, originalBranch, { expectedRevisionId: view.revision.revisionId });
        const next = await start(annotation); const second = await finish(next.operationId);
        expect(second.state.images).toHaveLength(2); expect(second.state.images[1].prompt).toBe('later user edit');
        await illustrations.selectImageVersion(h.handle, view.session.sessionId, { annotationId: annotation.annotationId, imageVersionId: image.imageVersionId });
        expect((await f.core.load(h.handle, view.session.sessionId)).illustrations.annotations[0].selectedImageVersionId).toBe(image.imageVersionId);
    });
    test('queued tasks freeze connection/parameters/Secret; cancelling an abort-ignoring worker prevents all late assets and allows an explicit retry', async () => {
        const annotation = await mark(); const hold = deferred();
        images.scheduler = new NativeTaskScheduler({ concurrency: 1, timeoutMs: 10000 });
        const blocker = images.scheduler.submit({ owner: h.handle, anchor: {}, executionClass: 'interactive', resources: [], key: 'fixture-blocker', fingerprint: '1', fresh: async () => true, run: () => hold.promise, finalize: async () => ({}) });
        const started = await start(annotation);
        expect(images.scheduler.project(h.handle, started.operationId).status).toBe('queued');
        await host.persistence.saveConnectionProfile(h.handle, { ...profile, endpoint: 'http://127.0.0.1:2/changed' });
        host.secretPort.resolveSecret.mockImplementation(async () => 'changed-secret');
        hold.resolve(); await blocker.result;
        const captured = await sent.promise;
        expect(captured.rendered.endpoint).toBe(profile.endpoint); expect(captured.options.secret).toBe('synthetic-secret');
        expect(images.scheduler.cancel(h.handle, started.operationId)).toBe(true);
        await expect(images.scheduler.operations.get(started.operationId).handle.result).rejects.toThrow('cancelled');
        gate.resolve(); await tick();
        expect((await f.core.load(h.handle, view.session.sessionId)).illustrations.images).toHaveLength(0);
        expect(await f.assetStore.listRefs(h.handle)).toHaveLength(0);
        const retry = await start(annotation); expect(retry.operationId).not.toBe(started.operationId);
        await finish(retry.operationId); expect(provider.generate).toHaveBeenCalledTimes(2);
    });
    test('deleted annotation retains late history without resurrection; failed generation only retries the image step', async () => {
        const annotation = await mark(), started = await start(annotation); await sent.promise;
        await illustrations.deleteAnnotation(h.handle, view.session.sessionId, { annotationId: annotation.annotationId });
        const result = await finish(started.operationId);
        expect(result.state.images).toHaveLength(1); expect(result.state.annotations[0].selectedImageVersionId).toBeNull();
        await expect(start(result.state.annotations[0])).rejects.toThrow('deleted');
        const other = await mark(); provider.generate.mockRejectedValueOnce(Object.assign(new Error('failure'), { code: 'native_illustration_image_request_failed' }));
        const failure = await start(other);
        await expect(images.scheduler.operations.get(failure.operationId).handle.result).rejects.toThrow('failure');
        expect((await images.status(h.handle, failure)).operation).toMatchObject({ status: 'failed', errorCode: 'native_illustration_image_request_failed' });
        const retry = await start(other); await finish(retry.operationId);
        expect(host.execute).not.toHaveBeenCalled(); expect(provider.generate).toHaveBeenCalledTimes(3);
    });
    test('backup write gate refuses spending an image request; failed finalization removes only the new asset reference', async () => {
        const annotation = await mark();
        setReadOnly(true);
        try { await expect(start(annotation)).rejects.toThrow(); expect(provider.generate).not.toHaveBeenCalled(); } finally { setReadOnly(false); }
        const original = await start(annotation); const result = await finish(original.operationId), assetId = result.state.images[0].assetId;
        jest.spyOn(images.illustrations, 'addImageVersion').mockRejectedValueOnce(new Error('commit failure'));
        const failure = await start(annotation);
        await expect(images.scheduler.operations.get(failure.operationId).handle.result).rejects.toThrow('commit failure');
        expect((await f.assetStore.listRefs(h.handle)).map(item => item.assetId)).toEqual([assetId]);
        expect((await f.assetStore.read(h.handle, assetId)).bytes).toEqual(png);
    });
    test('save-time images/evidence/import and reference protection share the existing presentation closure', async () => {
        const annotation = await mark(), started = await start(annotation); await sent.promise;
        const before = await f.saveSystem.manualSave(h.handle, view.session.sessionId);
        const result = await finish(started.operationId), image = result.state.images[0];
        const old = await f.saveSystem.exportSnapshot(h.handle, view.session.sessionId, before.saveId);
        expect(old.save.closure.stateRecords.find(item => item.namespace === 'atri_illustrations').data.images).toHaveLength(0);
        {
            const exported = await f.saveSystem.exportSession(h.handle, view.session.sessionId);
            expect(JSON.stringify(exported.save)).not.toContain('synthetic-secret'); expect(JSON.stringify(exported.save)).not.toContain(profile.secretRef.secretId);
            const target = await harness();
            try {
                const other = services(target); await other.packageInstaller.install(target.handle, await f.assetStore.readBlob(h.handle, view.session.packageContentHash));
                const imported = await other.saveSystem.importSave(target.handle, exported.archive);
                expect(imported.illustrations.images[0]).toEqual(image);
                expect((await other.assetStore.read(target.handle, image.assetId)).bytes).toEqual(png);
                await expect(other.assetStore.deleteRef(target.handle, image.assetId)).rejects.toThrow('referenced');
            } finally { await target.cleanup(); }
            const bad = structuredClone(exported.save), record = bad.closure.stateRecords.find(item => item.namespace === 'atri_illustrations' && item.head === bad.closure.session.illustrationHead);
            record.data.images[0].requestSnapshot.source.sessionId = createNativeId('session');
            const prior = record.head; record.head = hashNativeDocument(record.data);
            bad.closure.session.illustrationHead = record.head;
            for (const [branch, head] of Object.entries(bad.closure.session.illustrationHeads)) if (head === prior) bad.closure.session.illustrationHeads[branch] = record.head;
            expect(() => assertAtriaSave(bad)).toThrow();
        }
        const tampered = structuredClone(result.state); tampered.images[0].requestSnapshot.request.input = 'tampered input';
        expect(() => assertIllustrationState(tampered)).toThrow('mismatch');
        const secret = structuredClone(result.state); secret.images[0].requestSnapshot.connection.authorization = 'forbidden';
        expect(() => assertIllustrationState(secret)).toThrow();
    });
    test('ironman resume keeps generated assets and request evidence, can generate again after import without consuming narrative attempts', async () => {
        f = await runFixture(h, 'http://127.0.0.1:1/unused'); view = await f.begin('ironman');
        host.sessionCore = f.core; host.packageInstaller = f.packageInstaller;
        images = new IllustrationImageService({ host, scheduler: images.scheduler, provider });
        illustrations = new IllustrationService({ sessionRepo: f.sessionRepo });
        const annotation = await mark(), before = await f.core.runs.status(h.handle, view.session.sessionId);
        const started = await start(annotation); const result = await finish(started.operationId);
        expect((await f.core.runs.status(h.handle, view.session.sessionId)).operations).toEqual(before.operations);
        const exported = await f.saveSystem.exportSession(h.handle, view.session.sessionId); expect(exported.save.scope).toBe('resume');
        const target = await harness();
        try {
            const other = services(target); await other.packageInstaller.install(target.handle, f.archive);
            const imported = await other.saveSystem.importSave(target.handle, exported.archive);
            expect(imported.illustrations.images).toEqual(result.state.images);
            const persistence = new NativeModelPromptPersistence({ engine: target.engine }), extensions = new ExtensionsStore({ engine: target.engine });
            await persistence.saveConnectionProfile(target.handle, profile);
            await extensions.saveIllustrationSettings(target.handle, settings, (await extensions.illustrationSettings(target.handle)).revision);
            const restored = new IllustrationImageService({ host: { ...host, persistence, extensions, sessionCore: other.core, packageInstaller: other.packageInstaller }, scheduler: new NativeTaskScheduler({ timeoutMs: 10000 }), provider });
            const next = await restored.start(target.handle, { sessionId: imported.session.sessionId, branchId: imported.revision.branchId, annotationId: annotation.annotationId, expectedHead: imported.session.illustrationHead });
            await restored.scheduler.operations.get(next.operationId).handle.result;
            expect((await restored.status(target.handle, next)).state.images).toHaveLength(2);
        } finally { await target.cleanup(); }
    });
    test('four-stage closure creates a mark, generates a prompt, requires a separate image click and preserves both histories after import', async () => {
        const generation = await seedGenerationProfiles({ engine: h.engine, handle: h.handle, endpoint: 'http://127.0.0.1:1/unused', roles: ['illustration_prompt'] });
        settings.promptRouteId = generation.routes[0].runtimeRouteId;
        await host.extensions.saveIllustrationSettings(h.handle, settings, (await host.extensions.illustrationSettings(h.handle)).revision);
        const llm = { resolveCapabilities: async () => [], countTokens: async ({ promptIr }) => Math.ceil(JSON.stringify(promptIr).length / 4),
            renderRequest: async value => value, send: jest.fn(async () => ({ text: '{"scene":"harbor, sunset","characters":[]}' })), parseStream: async value => value, normalizeResponse: async value => value };
        const integratedHost = new NativeGenerationHost({ ...generation, sessionCore: f.core, packageInstaller: f.packageInstaller, extensions: host.extensions,
            providers: { 'provider.openai-compatible': llm }, secretPort: host.secretPort });
        illustrations = new IllustrationService({ sessionRepo: f.sessionRepo, sessionCore: f.core });
        const annotation = await mark();
        const prompts = new IllustrationPromptService({ host: integratedHost, scheduler: images.scheduler });
        const prompt = await prompts.start(h.handle, { sessionId: view.session.sessionId, branchId: view.revision.branchId, annotationId: annotation.annotationId });
        await prompts.scheduler.operations.get(prompt.operationId).handle.result;
        expect(llm.send).toHaveBeenCalledTimes(1); expect(provider.generate).not.toHaveBeenCalled();
        const drafted = (await prompts.status(h.handle, prompt)).state.annotations[0]; expect(drafted.draft.prompt).toBe('harbor, sunset');
        images = new IllustrationImageService({ host: integratedHost, scheduler: images.scheduler, provider });
        const picture = await start(drafted), capture = await sent.promise;
        expect(capture.rendered.body.input).toBe('harbor, sunset');
        await finish(picture.operationId); expect(llm.send).toHaveBeenCalledTimes(1);
        const target = await harness();
        try {
            const other = services(target); await other.packageInstaller.install(target.handle, await f.assetStore.readBlob(h.handle, view.session.packageContentHash));
            const exported = await f.saveSystem.exportSession(h.handle, view.session.sessionId), imported = await other.saveSystem.importSave(target.handle, exported.archive);
            expect(imported.illustrations.annotations[0].promptVersions).toHaveLength(1); expect(imported.illustrations.images).toHaveLength(1);
            expect(imported.illustrations.annotations[0].selectedImageVersionId).toBe(imported.illustrations.images[0].imageVersionId);
            expect(imported.timeline).toEqual(view.timeline); expect(imported.revision).toEqual(view.revision);
        } finally { await target.cleanup(); }
    });
    test('authentication HTTP detaches accepted tasks, isolates users/status steps and checks the confirmed head; local compatible transport stores a real PNG', async () => {
        const received = deferred(), release = deferred();
        const server = createServer(async (req, res) => {
            let body = ''; for await (const chunk of req) body += chunk;
            received.resolve({ body: JSON.parse(body), authorization: req.headers.authorization }); await release.promise;
            const zip = new AdmZip(); zip.addFile('image.png', png); res.writeHead(201, { 'Content-Type': 'application/zip' }); res.end(zip.toBuffer());
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        try {
            profile.endpoint = 'http://127.0.0.1:' + server.address().port + '/generate'; await host.persistence.saveConnectionProfile(h.handle, profile);
            const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { profile: { handle: req.headers['x-user'] || h.handle } }; next(); }); app.use(createNativeGenerationRouter(() => host));
            const annotation = await mark(), presentation = await f.sessionRepo.getIllustrations(h.handle, view.session.sessionId, { branchId: view.revision.branchId });
            const input = { sessionId: view.session.sessionId, branchId: view.revision.branchId, annotationId: annotation.annotationId, expectedHead: presentation.head };
            await request(app).post('/illustration-images').send({ ...input, expectedHead: null }).expect(409);
            const accepted = await request(app).post('/illustration-images').send(input).expect(202);
            const captured = await received.promise; expect(captured.authorization).toBe('Bearer synthetic-secret'); expect(captured.body.input).toBe('confirmed prompt');
            await request(app).get('/illustration-images/' + accepted.body.operationId).set('x-user', 'other').expect(404);
            await request(app).get('/illustration-prompts/' + accepted.body.operationId).expect(404);
            const promptList = await request(app).get('/illustration-prompts').query({ sessionId: view.session.sessionId, branchId: view.revision.branchId }).expect(200); expect(promptList.body).toEqual([]);
            release.resolve(); await nativeTaskScheduler.operations.get(accepted.body.operationId).handle.result;
            const result = await request(app).get('/illustration-images/' + accepted.body.operationId).expect(200);
            expect(result.body.operation.status).toBe('completed'); expect(result.body.state.images[0].parameters.seed).toBe(captured.body.parameters.seed);
            expect((await f.assetStore.read(h.handle, result.body.state.images[0].assetId)).bytes).toEqual(png);
            const listed = await request(app).get('/illustration-images').query({ sessionId: view.session.sessionId, branchId: view.revision.branchId }).expect(200);
            expect(listed.body.some(item => item.operationId === accepted.body.operationId)).toBe(true);
            await request(app).post('/illustration-images').send({ ...input, prompt: 'unchecked' }).expect(400);
        } finally { release.resolve(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    });
});
