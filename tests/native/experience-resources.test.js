import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { beforeEach, afterEach, test, expect } from '@jest/globals';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { sessionFixture, services } from './helpers/session-fixture.js';
import { buildAtriaPackageContainer, createNativeId, resolveNativeRuntimePackage } from '../../src/native/index.js';
import { createNativeSessionRouter } from '../../src/endpoints/native-session.js';
import { validateExperienceResources } from '../../src/native/experience-validation.js';
import { compileDeclarativeLogic } from '../../public/scripts/native/experience/logic/declarative.js';
import { loadExperienceData } from '../../public/scripts/native/experience/package-loader.js';

let h, svc, manifest, files, assets, fixture;
beforeEach(async () => {
    h = await makeTempFsEngineHarness(); svc = services(h); fixture = sessionFixture(); manifest = fixture.manifest;
    const assetId = createNativeId('asset'); const bytes = Buffer.from('{"price":3}');
    const contentHash = createHash('sha256').update(bytes).digest('hex');
    manifest.assets = [{ assetId, contentHash, size: bytes.length, mediaType: 'application/json' }];
    manifest.runtime = { experience: { mode: 'component', componentModelVersion: 2, component: 'ui/main.json' },
        game: { logic: 'logic/main.json' },
        experienceContract: { schemaVersion: 1, capabilities: [{ id: 'component-model', version: 2, required: true }, { id: 'package-data', version: 1, required: true }], dataResources: [{ resourceId: 'catalog.item', assetId, contentHash }] } };
    files = new Map([['ui/main.json', readFileSync(new URL('./fixtures/component-v2-opening.json', import.meta.url))], ['logic/main.json', Buffer.from(JSON.stringify({ schemaVersion: 2, mutations: [{ id: 'buy', event: 'item.bought', argsSchema: { type: 'object', additionalProperties: false, properties: {} }, assign: { hp: { formula: 'world.hp - data.catalog.item.price' } } }] }))]]);
    assets = new Map([[assetId, bytes]]);
});
afterEach(async () => { await h.cleanup(); });
const archive = () => buildAtriaPackageContainer({ manifest, sourceFiles: files, assetPayloads: assets }).archive;

test('install/reopen preserves v2 identity and exact Data HTTP transport fails closed', async () => {
    await svc.packageInstaller.install(h.handle, archive());
    const opened = await svc.packageInstaller.open(h.handle, manifest.packageId, manifest.packageVersionId);
    const resolved = resolveNativeRuntimePackage(opened, fixture.entryPointId);
    expect(resolved.runtime.experience).not.toHaveProperty('surface');
    expect(resolved.descriptor.experience.componentModelVersion).toBe(2);
    const view = await svc.core.create(h.handle, { packageId: manifest.packageId, packageVersionId: manifest.packageVersionId, entryPointId: fixture.entryPointId });
    const app = express(); app.use(express.json()); app.use((req, res, next) => { req.user = { profile: { handle: h.handle } }; next(); });
    app.use(createNativeSessionRouter(() => svc));
    const body = { sessionId: view.session.sessionId, resourceId: 'catalog.item' };
    const response = await request(app).post('/runtime/resource').send(body);
    expect(response.status).toBe(200); expect(response.body).toEqual({ price: 3 });
    expect((await request(app).post('/runtime/resource').send({ ...body, path: 'ui/main.json' })).status).toBe(400);
    expect((await request(app).post('/runtime/resource').send({ ...body, resourceId: 'unknown' })).status).toBe(400);
    const data = await loadExperienceData({ sessionId: view.session.sessionId, descriptor: resolved.descriptor }, { fetchImpl: async (url, init) => {
        const result = await request(app).post('/runtime/resource').send(JSON.parse(init.body));
        return { ok: result.status === 200, json: async () => result.body };
    } });
    expect(data).toEqual({ catalog: { item: { price: 3 } } });
    const logic = compileDeclarativeLogic(JSON.parse(files.get('logic/main.json')), { data });
    expect(logic.reducers[0].reduce({ hp: 8 }, { payload: {} })).toEqual({ hp: 5 });
});

test('build validation lowers mutations into existing IR and imported malformed UI cannot install', async () => {
    validateExperienceResources(manifest, files, assets, { lower: true });
    const lowered = JSON.parse(files.get('logic/main.json'));
    expect(lowered).not.toHaveProperty('mutations'); expect(lowered.commands[0].id).toBe('buy');
    const ui = JSON.parse(files.get('ui/main.json')); ui.script = 'fetch()'; files.set('ui/main.json', Buffer.from(JSON.stringify(ui)));
    await expect(svc.packageInstaller.install(h.handle, archive())).rejects.toThrow(/unknown field/);
    expect(await svc.packageRepo.get(h.handle, manifest.packageId)).toBeNull();
});

test('v2 rejects duplicate surface authority and malformed immutable Data before installation', async () => {
    manifest.runtime.experience.surface = 'chat.header';
    await expect(svc.packageInstaller.install(h.handle, archive())).rejects.toThrow(/surfaces/);
    delete manifest.runtime.experience.surface;
    const assetId = manifest.assets[0].assetId; const bytes = Buffer.from('{"constructor":{}}');
    const digest = createHash('sha256').update(bytes).digest('hex'); assets.set(assetId, bytes);
    Object.assign(manifest.assets[0], { size: bytes.length, contentHash: digest }); manifest.runtime.experienceContract.dataResources[0].contentHash = digest;
    await expect(svc.packageInstaller.install(h.handle, archive())).rejects.toThrow(/Blocked JSON key/);
});
