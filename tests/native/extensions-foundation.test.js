import { test, expect, describe } from '@jest/globals';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { listAuthoringReferences, readAuthoringReference } from '../../src/native/authoring-reference.js';
import { buildProjectAgentTools } from '../../src/native/project-agent.js';
import { compileUiDocument } from '../../public/scripts/native/experience/ui/v2-document.js';
import { assertStudioScenario } from '../../src/native/studio-scenario.js';
import { ExtensionsStore } from '../../src/native/extensions-store.js';
import { readExternalExtension } from '../../src/native/extension-install.js';
import { createNativeExtensionsRouter } from '../../src/endpoints/native-extensions.js';
import { skillEntryKey, skillInvocationMode, scriptMatches } from '../../public/shared/extension-contract.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';

test('AI catalog resolves all shipped references, paginates and rejects arbitrary files', async () => {
    const catalog = listAuthoringReferences();
    for (const entry of catalog.references) {
        const first = await readAuthoringReference({ id: entry.id, limit: 16 });
        expect(first.content).toHaveLength(16); expect(first.sha256).toMatch(/^[a-f0-9]{64}$/);
        const second = await readAuthoringReference({ id: entry.id, offset: first.nextOffset, limit: 16 });
        expect(second.sha256).toBe(first.sha256);
    }
    expect(listAuthoringReferences('Shared').references.map(x => x.id)).toContain('shared');
    await expect(readAuthoringReference({ id: '../../config.yaml' })).rejects.toThrow('Unknown');
    await expect(readAuthoringReference({ id: 'shared', limit: 1000000 })).rejects.toThrow('Invalid');
    expect(buildProjectAgentTools({ descriptors: [] }).map(x => x.function.name)).toEqual(expect.arrayContaining(['atri_agent_api_catalog', 'atri_agent_api_read']));
});
test('shipped examples compile through production contracts', async () => {
    const ui = JSON.parse((await readAuthoringReference({ id: 'example-ui-v2' })).content);
    expect(() => compileUiDocument(ui, { mode: 'component' })).not.toThrow();
    const scenario = JSON.parse((await readAuthoringReference({ id: 'example-scenario' })).content);
    expect(assertStudioScenario(scenario).steps).toHaveLength(2);
});
const script = () => ({ name: 'Test script', kind: 'local', enabled: false, targets: { global: true, presets: [], works: [] }, entrypoint: 'index.js', files: { 'index.js': 'export function activate(api) { return () => {}; }' } });
describe.each(CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name)))('Extensions foundation — $name', ({ make: makeHarness }) => {
    test('extension settings preserve independent folder/routing state and reject stale writes', async () => {
        const h = await makeHarness();
        try {
            const store = new ExtensionsStore({ engine: h.engine }); const initial = await store.settings(h.handle);
            const entry = { scope: { kind: 'global' }, name: 'writing' }; const id = skillEntryKey(entry);
            const value = { schemaVersion: 1, folders: [{ id: 'authoring', name: 'Authoring' }], skills: { [id]: { folderId: 'authoring', paths: { studio: 'always', narrative: 'on-demand' } } } };
            const saved = await store.saveSettings(h.handle, value, initial.revision);
            expect(skillInvocationMode(entry, saved.value, 'agents')).toBe('off'); expect(skillInvocationMode(entry, saved.value, 'studio')).toBe('always');
            await expect(store.saveSettings(h.handle, value, initial.revision)).rejects.toThrow();
            expect((await new ExtensionsStore({ engine: h.engine }).settings(h.handle)).revision).toBe(saved.revision);
            await expect(store.saveSettings(h.handle, { ...value, folders: [] }, saved.revision)).rejects.toThrow('Unknown Skill folder');
        } finally { await h.cleanup(); }
    });
    test('script CRUD, revision-bound authenticated delivery and owner isolation', async () => {
        const h = await makeHarness();
        try {
            const store = new ExtensionsStore({ engine: h.engine }); const saved = await store.save(h.handle, script());
            expect((await store.list(h.handle))[0]).not.toHaveProperty('files');
            await expect(store.save(h.handle, { ...script(), id: saved.id }, 'stale')).rejects.toThrow();
            const app = express(); app.use(express.json()); app.use((req, _res, next) => { if (req.headers['x-user']) req.user = { profile: { handle: req.headers['x-user'] } }; next(); });
            app.use(createNativeExtensionsRouter({ store: () => store }));
            await request(app).get('/plugins').expect(401);
            const denied = await request(app).get('/plugins/' + saved.id).set('x-user', 'other');
            expect([400, 404]).toContain(denied.status); expect(denied.body).not.toHaveProperty('files');
            await request(app).get(`/files/${saved.id}/${saved.revision}/index.js`).set('x-user', h.handle).expect(409);
            const enabled = await store.save(h.handle, { ...script(), id: saved.id, enabled: true }, saved.revision);
            await request(app).get(`/files/${enabled.id}/${enabled.revision}/index.js`).set('x-user', h.handle).expect(200).expect('Content-Type', /javascript/);
            expect(scriptMatches(enabled, {})).toBe(true);
            await store.remove(h.handle, enabled.id, enabled.revision); expect(await store.list(h.handle)).toEqual([]);
        } finally { await h.cleanup(); }
    });
    test('rejected URL updates retain enabled exact files; accepted updates require enabling again', async () => {
        const h = await makeHarness();
        try {
            const store = new ExtensionsStore({ engine: h.engine });
            const external = { ...script(), kind: 'external', sourceUrl: 'https://example.com/plugin.git', enabled: true,
                files: { 'index.js': 'export function activate() {}', 'parts/helper.js': 'export const value = 1;', 'style.css': 'p { color: red; }' } };
            const saved = await store.save(h.handle, external);
            let candidate = { ...external, files: { '../bad.js': 'bad' } };
            const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { profile: { handle: h.handle } }; next(); });
            app.use(createNativeExtensionsRouter({ store: () => store, install: async () => candidate }));
            await request(app).post('/install').send({ id: saved.id, expectedRevision: saved.revision }).expect(400);
            expect(await store.get(h.handle, saved.id)).toEqual(saved);
            candidate = { ...external, files: { ...external.files, 'parts/helper.js': 'export const value = 2;' } };
            await request(app).post('/install').send({ id: saved.id, expectedRevision: 'stale' }).expect(409);
            expect((await store.get(h.handle, saved.id)).revision).toBe(saved.revision);
            await request(app).get(`/files/${saved.id}/${saved.revision}/parts/helper.js`).expect(200).expect('Content-Type', /javascript/);
            await request(app).get(`/files/${saved.id}/${saved.revision}/style.css`).expect(200).expect('Content-Type', /css/);
            const update = await request(app).post('/install').send({ id: saved.id, expectedRevision: saved.revision }).expect(200);
            expect(update.body.enabled).toBe(false);
            await request(app).get(`/files/${saved.id}/${saved.revision}/index.js`).expect(409);
            await expect(store.save(h.handle, { ...script(), files: { 'index.js': 'bad\0binary' } })).rejects.toThrow('Invalid');
            await expect(store.save(h.handle, { ...external, sourceUrl: 'https://user:secret@example.com/plugin' })).rejects.toThrow('credentials');
        } finally { await h.cleanup(); }
    });
});
test('repository install imports inert files, defaults disabled and cleans its temporary root', async () => {
    let root;
    const result = await readExternalExtension('https://example.com/plugin.git', { clone: async (_url, dir) => {
        root = dir;
        await fs.writeFile(path.join(dir, 'atria.extension.json'), JSON.stringify({ schemaVersion: 1, apiVersion: 1, name: 'Demo', entrypoint: 'index.js' }));
        await fs.writeFile(path.join(dir, 'index.js'), 'throw new Error("must never execute on server")');
    } });
    expect(result.enabled).toBe(false); expect(result.files['index.js']).toContain('never execute');
    await expect(fs.stat(root)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readExternalExtension('file:///local')).rejects.toThrow('HTTPS');
});

test('invalid manifest/encoding never publishes a candidate and always removes cloned files', async () => {
    for (const invalid of ['manifest', 'encoding']) {
        let root;
        await expect(readExternalExtension('https://example.com/plugin.git', { clone: async (_url, dir) => {
            root = dir;
            await fs.writeFile(path.join(dir, 'atria.extension.json'), JSON.stringify({ schemaVersion: 1, apiVersion: invalid === 'manifest' ? 99 : 1, name: 'Demo', entrypoint: 'index.js' }));
            await fs.writeFile(path.join(dir, 'index.js'), Buffer.from([0xff, 0xfe]));
        } })).rejects.toThrow();
        await expect(fs.stat(root)).rejects.toMatchObject({ code: 'ENOENT' });
    }
});
