import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import git from 'isomorphic-git';
import { Readable } from 'node:stream';
import { createExtensionGitHttp, readExternalExtension, readExtensionCommitFiles, ExtensionPreparationCache } from '../../src/native/extension-install.js';
import { ExtensionsStore, extensionSourceHash } from '../../src/native/extensions-store.js';
import { createNativeExtensionsRouter } from '../../src/endpoints/native-extensions.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';

const sourceUrl = 'https://example.org/extension.git', targets = { global: false, presets: [], works: [] }, clientInstanceId = 'fixture-client';
function candidate(sourceCommit = 'a'.repeat(40), text = 'throw new Error("must remain inert");') {
    const value = { name: 'Inert fixture', kind: 'external', sourceUrl, sourceCommit, enabled: false, targets, entrypoint: 'index.js',
        files: { 'atria.extension.json': JSON.stringify({ schemaVersion: 1, apiVersion: 1, name: 'Inert fixture', entrypoint: 'index.js' }), 'index.js': text } };
    return { ...value, contentHash: extensionSourceHash(value) };
}
const exact = row => ({ expectedRevision: row.revision, expectedContentHash: row.contentHash, expectedSourceCommit: row.sourceCommit, expectedTargetsHash: row.targetsHash });
const reviewed = row => ({ clientInstanceId, contentHash: row.contentHash, sourceCommit: row.sourceCommit, targetsHash: row.targetsHash, expectedRevision: row.previous?.revision ?? null });

describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('MCP Extension Native %s', (_kind, harness) => {
    test('reviewed Git snapshot installs disabled without refetch; enabling, updating, scopes and deletion pin exact identity', async () => {
        const h = await harness(), store = new ExtensionsStore({ engine: h.engine });
        let current = candidate(), downloads = 0;
        const app = express(); app.use(express.json()); app.use((req, _res, next) => { if (req.headers['x-user']) req.user = { profile: { handle: req.headers['x-user'] } }; next(); });
        app.use(createNativeExtensionsRouter({ store: () => store, install: async () => { downloads++; return structuredClone(current); } }));
        const post = (url, body) => request(app).post(url).set('x-user', h.handle).send(body);
        const get = url => request(app).get(url).set('x-user', h.handle);
        try {
            const prepared = (await post('/prepare', { url: sourceUrl, targets, clientInstanceId, expectedRevision: null }).expect(200)).body;
            expect(downloads).toBe(1); expect(prepared.state).toBe('prepared'); expect(prepared).not.toHaveProperty('files.index.js');
            const source = await get('/preparations/' + prepared.preparationId + '/source').query({ clientInstanceId, contentHash: prepared.contentHash,
                sourceCommit: prepared.sourceCommit, targetsHash: prepared.targetsHash, path: 'index.js', offset: 0, limit: 8 }).expect(200);
            expect(source.body.text).toHaveLength(8); expect(source.body.trust).toContain('untrusted');
            await request(app).get('/preparations/' + prepared.preparationId).query({ clientInstanceId }).set('x-user', 'foreign').expect(404);
            await get('/preparations/' + prepared.preparationId).query({ clientInstanceId: 'foreign' }).expect(409);
            current = candidate('b'.repeat(40), 'globalThis.unreviewed = true;');
            await post('/preparations/' + prepared.preparationId + '/install', { ...reviewed(prepared), contentHash: current.contentHash }).expect(409);
            const installed = (await post('/preparations/' + prepared.preparationId + '/install', reviewed(prepared)).expect(200)).body;
            expect(installed.enabled).toBe(false); expect(installed.sourceCommit).toBe('a'.repeat(40)); expect(downloads).toBe(1);
            const again = (await post('/preparations/' + prepared.preparationId + '/install', reviewed(prepared)).expect(200)).body;
            expect(again.id).toBe(installed.id); expect(again.alreadyInstalled).toBe(true); expect((await store.list(h.handle))).toHaveLength(1);
            await get(`/files/${installed.id}/${installed.revision}/index.js`).expect(409);
            let row = (await get('/plugins/' + installed.id + '/inspect').expect(200)).body;
            await post('/plugins/' + installed.id + '/actions/enable', { ...exact(row), expectedSourceCommit: 'b'.repeat(40) }).expect(409);
            row = (await post('/plugins/' + installed.id + '/actions/enable', exact(row)).expect(200)).body;
            expect(row.enabled).toBe(true); expect(globalThis.unreviewed).toBeUndefined();
            await get(`/files/${row.id}/${row.revision}/index.js`).expect(200).expect(/must remain inert/);
            row = (await post('/plugins/' + row.id + '/actions/targets', { ...exact(row), targets: { global: false, presets: ['preset_one'], works: [] } }).expect(200)).body;
            const update = (await post('/prepare', { id: row.id, expectedRevision: row.revision, clientInstanceId }).expect(200)).body;
            const updated = (await post('/preparations/' + update.preparationId + '/install', reviewed(update)).expect(200)).body;
            expect(updated.enabled).toBe(false); expect(updated.targets.presets).toEqual(['preset_one']); expect(updated.sourceCommit).toBe('b'.repeat(40)); expect(downloads).toBe(2);
            await post('/plugins/' + row.id + '/actions/disable', exact(row)).expect(409);
            row = (await get('/plugins/' + installed.id + '/inspect').expect(200)).body;
            row = (await post('/plugins/' + row.id + '/actions/disable', exact(row)).expect(200)).body;
            await post('/plugins/' + row.id + '/actions/delete', exact(row)).expect(200);
            expect((await store.list(h.handle))).toEqual([]);
        } finally { await h.cleanup(); }
    });
});

test('smart Git HTTP transport rejects cross origin/path, authentication, redirects and streamed overrun', async () => {
    let requests = 0;
    const http = createExtensionGitHttp(sourceUrl, { maxBytes: 8, fetchImpl: async () => {
        requests++; return { status: 200, statusText: 'OK', url: sourceUrl + '/git-upload-pack', headers: new Headers({ 'content-type': 'application/x-git-upload-pack-result' }), body: Readable.from([Buffer.from('1234'), Buffer.from('56789')]) };
    } });
    for (const input of [{ url: 'https://evil.example/extension.git/git-upload-pack', method: 'POST' },
        { url: sourceUrl + '/not-upload-pack', method: 'POST' }, { url: sourceUrl + '/git-upload-pack', method: 'POST', headers: { Authorization: 'secret' } }]) await expect(http.request(input)).rejects.toThrow();
    expect(requests).toBe(0);
    const response = await http.request({ url: sourceUrl + '/git-upload-pack', method: 'POST' });
    await expect((async () => { for await (const _part of response.body) { /* Drain bounded response. */ } })()).rejects.toThrow('exceeds bound');
    const redirected = createExtensionGitHttp(sourceUrl, { fetchImpl: async () => new Response('', { status: 302, headers: { location: 'https://evil.example' } }) });
    await expect(redirected.request({ url: sourceUrl + '/info/refs?service=git-upload-pack' })).rejects.toThrow('Invalid');
    for (const bad of ['http://example.org/repo', 'https://127.0.0.1/repo', 'https://169.254.169.254/repo', 'https://[::1]/repo', 'https://user:secret@example.org/repo']) await expect(readExternalExtension(bad)).rejects.toThrow();
});

test('local script authoring uses the same inert Review snapshot with nullable Git provenance and disabled install', async () => {
    const h = await makeTempFsEngineHarness(), store = new ExtensionsStore({ engine: h.engine });
    const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { profile: { handle: h.handle } }; next(); });
    app.use(createNativeExtensionsRouter({ store: () => store }));
    try {
        const body = { name: 'Local fixture', source: 'globalThis.mustNotExecute = true;', targets, clientInstanceId, expectedRevision: null };
        const stage = (await request(app).post('/local/prepare').send(body).expect(200)).body;
        expect(stage.kind).toBe('local'); expect(stage.sourceCommit).toBeNull();
        const source = await request(app).get('/preparations/' + stage.preparationId + '/source').query({ clientInstanceId, contentHash: stage.contentHash,
            sourceCommit: 'null', targetsHash: stage.targetsHash, path: 'index.js' }).expect(200);
        expect(source.body.text).toBe(body.source);
        const installed = (await request(app).post('/preparations/' + stage.preparationId + '/install').send(reviewed(stage)).expect(200)).body;
        expect(installed.enabled).toBe(false); expect(globalThis.mustNotExecute).toBeUndefined();
        await expect(store.save(h.handle, { ...(await store.get(h.handle, installed.id)), revision: undefined })).rejects.toThrow();
    } finally { await h.cleanup(); }
});

test('Git provenance is resolved from an actual inert repository commit and preparation expires without side effects', async () => {
    let expectedCommit;
    const value = await readExternalExtension(sourceUrl, { clone: async (_url, root) => {
        const fixture = candidate();
        await git.init({ fs, dir: root });
        for (const [file, content] of Object.entries(fixture.files)) { await fs.promises.writeFile(path.join(root, file), content); await git.add({ fs, dir: root, filepath: file }); }
        expectedCommit = await git.commit({ fs, dir: root, message: 'inert fixture', author: { name: 'Fixture', email: 'fixture@example.invalid' } });
        expect(await readExtensionCommitFiles(root, expectedCommit)).toEqual(fixture.files);
        const link = await git.writeBlob({ fs, dir: root, blob: Buffer.from('/private/secret') });
        const tree = await git.writeTree({ fs, dir: root, tree: [{ path: 'link', mode: '120000', type: 'blob', oid: link }] });
        const author = { name: 'Fixture', email: 'fixture@example.invalid', timestamp: 1, timezoneOffset: 0 };
        const malicious = await git.writeCommit({ fs, dir: root, commit: { tree, parent: [], author, committer: author, message: 'symlink fixture' } });
        await expect(readExtensionCommitFiles(root, malicious)).rejects.toThrow('symlinks');
    } });
    expect(value.sourceCommit).toBe(expectedCommit); expect(value.contentHash).toBe(extensionSourceHash(value)); expect(value.enabled).toBe(false);
    let now = 0; const cache = new ExtensionPreparationCache({ now: () => now, ttlMs: 1 });
    const stage = cache.put('owner', clientInstanceId, value); now = 1;
    expect(() => cache.inspect('owner', stage.preparationId, clientInstanceId)).toThrow('not found');
});
