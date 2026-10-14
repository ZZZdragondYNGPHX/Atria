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
        expect(novelaiConnectionCapabilities(value).models).toHaveLength(6);
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
