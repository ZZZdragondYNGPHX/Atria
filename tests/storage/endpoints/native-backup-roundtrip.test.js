import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import AdmZip from 'adm-zip';
import { USER_DIRECTORY_TEMPLATE } from '../../../src/constants.js';
import request from 'supertest';
import { makeEndpointHarness } from '../harness/endpoint-harness.js';
import { router } from '../../../src/endpoints/users-private.js';
import { getUserDirectories, USER_BACKUP_SELECTION_DEFAULTS } from '../../../src/users.js';
import { getStorageEngine } from '../../../src/storage/index.js';
import { NATIVE_RESOURCE_KINDS, getNativeResourceKeyFields } from '../../../src/native/contracts.js';
import { AssetStore, ProjectStore, createNativeId } from '../../../src/native/index.js';

const nativeOnly = Object.fromEntries(Object.keys(USER_BACKUP_SELECTION_DEFAULTS).map(key => [key, key === 'native']));
const otherValues = { namespace: 'atri_backup', head: 'head-1', resourceType: 'core.prompt-module', resourceId: 'pmod-test', revision: 'rev-1' };

async function harness(mode) {
    const h = await makeEndpointHarness({ mode, mount(app, { dirs }) {
        const uploads = path.join(dirs.root, 'uploads');
        fs.mkdirSync(uploads, { recursive: true });
        app.use('/api/users/restore-backup', multer({ dest: uploads }).single('avatar'));
        app.use('/api/users', router);
    } });
    globalThis.DATA_ROOT = h.dataRoot;
    Object.assign(h.dirs, Object.fromEntries(Object.entries(USER_DIRECTORY_TEMPLATE).map(([key, rel]) => [key, path.join(h.dirs.root, rel)])));
    Object.assign(getUserDirectories(h.handle), h.dirs);
    return h;
}

async function download(h, selection = nativeOnly) {
    const result = await request(h.app).post('/api/users/backup').send({ handle: h.handle, selection })
        .buffer(true).parse((res, cb) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => cb(null, Buffer.concat(chunks)));
            res.on('error', cb);
        });
    expect(result.status).toBe(200);
    return result.body;
}

async function seed(h) {
    const engine = getStorageEngine();
    const assets = new AssetStore({ engine, directoriesByHandle: () => h.dirs });
    const bytes = Buffer.from('Native package and asset bytes 中文');
    const hash = await assets.putBlob(h.handle, bytes);
    const records = [];
    for (const kind of Object.values(NATIVE_RESOURCE_KINDS)) {
        const key = { kind, handle: h.handle };
        for (const field of getNativeResourceKeyFields(kind)) {
            if (field === 'handle') continue;
            key[field] = otherValues[field] || createNativeId(field === 'saveId' ? 'savePoint' : field.slice(0, -2));
        }
        const doc = { marker: kind, exact: key, value: 'unchanged 中文' };
        if (kind === NATIVE_RESOURCE_KINDS.assetRef) Object.assign(doc, { contentHash: hash, size: bytes.length });
        if (kind === NATIVE_RESOURCE_KINDS.packageVersion) doc.packageContentHash = hash;
        const record = { key, doc, integrity: 'exact-integrity', createdAt: 1000, updatedAt: 2000 };
        await engine.withTransaction(h.handle, tx => tx.putResource(key, record));
        records.push(record);
    }
    const projectId = createNativeId('project');
    const project = {
        format: 'atria-project-source', schemaVersion: 1,
        project: { projectId, packageId: createNativeId('package'), displayName: 'Backup project', createdAt: 1, updatedAt: 1 },
        package: { name: 'Backup Work', version: '1.0.0', actors: [], entryPoints: [{ entryPointId: createNativeId('entryPoint'), displayName: 'Start', actorIds: [], worldIds: [], knowledgeBindingIds: [] }], capabilities: ['narrative'], permissions: [] },
        worlds: [], knowledge: [], knowledgeBindings: [], dependencies: { worlds: [], knowledge: [], knowledgeBindings: [] }, assetFiles: [],
    };
    await new ProjectStore({ directoriesByHandle: () => h.dirs }).create(h.handle, project, { files: new Map([['source.txt', 'Source 中文']]) });
    return { records, hash, bytes, projectId };
}

describe.each([['fs', 'fs'], ['fs', 'sqlite'], ['sqlite', 'fs'], ['sqlite', 'sqlite']])('Native backup %s → %s', (sourceMode, targetMode) => {
    let current;
    const originalRoot = globalThis.DATA_ROOT;
    afterEach(async () => { if (current) await current.cleanup(); globalThis.DATA_ROOT = originalRoot; });

    test('backup survives loss of source and restores every Native kind, exact metadata, projects and blobs', async () => {
        current = await harness(sourceMode);
        const data = await seed(current);
        const archive = await download(current);
        await current.cleanup();
        current = await harness(targetMode);
        const response = await request(current.app).post('/api/users/restore-backup')
            .field('handle', current.handle).field('mode', 'merge').field('selection', JSON.stringify(nativeOnly))
            .attach('avatar', archive, 'native.zip');
        expect(response.status).toBe(200);
        expect(response.body.verification?.ok).toBe(true);
        const engine = getStorageEngine();
        for (const record of data.records) {
            expect(await engine.withTransaction(current.handle, tx => tx.getResource(record.key))).toEqual(record);
        }
        const assets = new AssetStore({ engine, directoriesByHandle: () => current.dirs });
        expect(await assets.readBlob(current.handle, data.hash)).toEqual(data.bytes);
        const projects = new ProjectStore({ directoriesByHandle: () => current.dirs });
        expect((await projects.list(current.handle)).map(project => project.projectId)).toContain(data.projectId);
        expect(fs.readFileSync(path.join(projects._root(current.handle), data.projectId, 'source.txt'), 'utf8')).toBe('Source 中文');
    });
});

describe.each(['fs', 'sqlite'])('Native backup safety on %s', mode => {
    let current;
    const originalRoot = globalThis.DATA_ROOT;
    beforeEach(async () => { current = await harness(mode); });
    afterEach(async () => { await current.cleanup(); globalThis.DATA_ROOT = originalRoot; });

    test('a missing required blob fails without losing existing resources or project sources', async () => {
        const data = await seed(current);
        const zip = new AdmZip(await download(current));
        zip.deleteFile(`assets/atria-native/blobs/${data.hash.slice(0, 2)}/${data.hash}`);
        const response = await request(current.app).post('/api/users/restore-backup')
            .field('handle', current.handle).field('mode', 'overwrite').field('selection', JSON.stringify(nativeOnly))
            .attach('avatar', zip.toBuffer(), 'broken.zip');
        expect(response.status).toBeGreaterThanOrEqual(400);
        const engine = getStorageEngine();
        for (const record of data.records) expect(await engine.withTransaction(current.handle, tx => tx.getResource(record.key))).toEqual(record);
        expect(await new AssetStore({ engine, directoriesByHandle: () => current.dirs }).readBlob(current.handle, data.hash)).toEqual(data.bytes);
    });

    test('assets-only export excludes Native blobs and overwrite preserves Native closure', async () => {
        const data = await seed(current);
        const file = path.join(current.dirs.assets, 'standalone.txt');
        fs.writeFileSync(file, 'standalone');
        const selection = { ...nativeOnly, native: false, assets: true };
        const archive = await download(current, selection);
        const zip = new AdmZip(archive);
        expect(zip.getEntries().some(entry => entry.entryName.startsWith('assets/atria-native/'))).toBe(false);
        fs.writeFileSync(file, 'changed');
        const response = await request(current.app).post('/api/users/restore-backup')
            .field('handle', current.handle).field('mode', 'overwrite').field('selection', JSON.stringify(selection))
            .attach('avatar', archive, 'assets.zip');
        expect(response.status).toBe(200);
        expect(fs.readFileSync(file, 'utf8')).toBe('standalone');
        const engine = getStorageEngine();
        for (const record of data.records) expect(await engine.withTransaction(current.handle, tx => tx.getResource(record.key))).toEqual(record);
        expect(await new AssetStore({ engine, directoriesByHandle: () => current.dirs }).readBlob(current.handle, data.hash)).toEqual(data.bytes);
    });
});
