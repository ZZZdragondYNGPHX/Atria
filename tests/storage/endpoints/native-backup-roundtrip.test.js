import { PERSONA_BACKUP_KINDS } from '../../../src/native/persona-backup.js';
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
import { NativeRecoveryService } from '../../../src/native/recovery-service.js';
import { nativeRecord } from '../../../src/native/repositories/common.js';
import { STORAGE_CENTER_PROTOCOL } from '../../../src/storage/resource-catalog.js';
import { makeTempMysqlEngineHarness } from '../harness/mysql-harness.js';
import { makeTempPgEngineHarness } from '../harness/pg-harness.js';
import { runFixture } from '../../native/helpers/run-fixture.js';
import { installAccountQuota } from '../../../src/storage/account-quota.js';
import { measureAccount } from '../../../src/storage/resource-accounting.js';

const nativeOnly = Object.fromEntries(Object.keys(USER_BACKUP_SELECTION_DEFAULTS).map(key => [key, key === 'native']));
const otherValues = { scopeId: 'a'.repeat(64), evidenceId: 'b'.repeat(64), sourceDigest: 'c'.repeat(64), checkpointId: 'd'.repeat(64), scope: 'backup-probe', taskId: 'task-1', goalId: 'goal-1', commitId: 'commit-1', namespace: 'atri_backup', head: 'head-1', resourceType: 'core.prompt-module', resourceId: 'pmod-test', revision: 'rev-1' };

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
        if (PERSONA_BACKUP_KINDS.includes(kind)) continue;
        const key = { kind, handle: h.handle };
        for (const field of getNativeResourceKeyFields(kind)) {
            if (field === 'handle') continue;
            key[field] = otherValues[field] || createNativeId(field === 'saveId' ? 'savePoint' : field.slice(0, -2));
        }
        const doc = { marker: kind, exact: key, value: 'unchanged 中文' };
        if (kind === NATIVE_RESOURCE_KINDS.assetRef) Object.assign(doc, { contentHash: hash, size: bytes.length });
        if (kind === NATIVE_RESOURCE_KINDS.packageVersion) doc.packageContentHash = hash;
        const record = { key, ...nativeRecord(doc, { createdAt: 1000, updatedAt: 2000 }) };
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
    const recovery = new NativeRecoveryService({ engine, directoriesByHandle: () => h.dirs, assets });
    const retainedBytes = Buffer.from('Retained only by recovery 中文'), retainedAssetId = createNativeId('asset');
    const retainedHash = await assets.putBlob(h.handle, retainedBytes);
    await assets.put(h.handle, { assetId: retainedAssetId, contentHash: retainedHash, size: retainedBytes.length, mediaType: 'application/octet-stream' }, retainedBytes);
    const assetTarget = { type: 'asset', id: retainedAssetId }, assetReview = await recovery.inspect(h.handle, assetTarget);
    const retained = await recovery.trash(h.handle, assetTarget, assetReview.version, 'backup-retained-asset');
    fs.mkdirSync(h.dirs.backups, { recursive: true }); fs.writeFileSync(path.join(h.dirs.backups, 'retained.zip'), 'Recoverable backup file');
    const backupTarget = { type: 'backup', id: 'retained.zip' }, backupReview = await recovery.inspect(h.handle, backupTarget);
    await recovery.trash(h.handle, backupTarget, backupReview.version, 'backup-retained-file');
    await engine.withTransaction(h.handle, tx => tx.putResource({ kind: NATIVE_RESOURCE_KINDS.maintenance, handle: h.handle, scope: 'storage-center:task:imported' }, nativeRecord({ protocol: STORAGE_CENTER_PROTOCOL, type: 'task', id: 'imported', handle: h.handle, status: 'running', items: [] })));
    return { records, hash, bytes, projectId, retained, retainedHash, retainedBytes, retainedAssetId };
}

const backupPairs = [['fs', 'fs'], ['fs', 'sqlite'], ['sqlite', 'fs'], ['sqlite', 'sqlite'], ['fs', 'mysql'], ['mysql', 'fs'], ['mysql', 'mysql'], ['sqlite', 'postgres'], ['postgres', 'sqlite'], ['postgres', 'postgres']]
    .filter(pair => !(!process.env.ATRIA_TEST_MYSQL_ROOT_URL && pair.includes('mysql') || !process.env.ATRIA_TEST_POSTGRES_URL && pair.includes('postgres')));
describe.each(backupPairs)('Native backup %s → %s', (sourceMode, targetMode) => {
    let current, scratch;
    const originalRoot = globalThis.DATA_ROOT;
    afterEach(async () => { if (current) await current.cleanup(); if (scratch) await scratch.cleanup(); globalThis.DATA_ROOT = originalRoot; });

    test('backup survives loss of source and restores non-Persona Native kinds, exact metadata, projects and blobs', async () => {
        current = await harness(sourceMode);
        const data = await seed(current);
        const archive = await download(current);
        await current.cleanup();
        current = await harness(targetMode);
        let restore = request(current.app).post('/api/users/restore-backup').field('handle', current.handle).field('mode', 'merge').field('selection', JSON.stringify(nativeOnly));
        if (sourceMode !== targetMode && ['mysql', 'postgres'].includes(sourceMode)) {
            scratch = await (sourceMode === 'mysql' ? makeTempMysqlEngineHarness() : makeTempPgEngineHarness());
            restore = restore.field(sourceMode === 'mysql' ? 'scratchMysqlUrl' : 'scratchPostgresUrl', scratch.url);
        }
        const response = await restore.attach('avatar', archive, 'native.zip');
        expect({ status: response.status, body: response.body }).toMatchObject({ status: 200 });
        expect(response.body.verification?.ok).toBe(true);
        const engine = getStorageEngine();
        for (const record of data.records) {
            expect(await engine.withTransaction(current.handle, tx => tx.getResource(record.key))).toEqual(record);
        }
        const assets = new AssetStore({ engine, directoriesByHandle: () => current.dirs });
        expect(await assets.readBlob(current.handle, data.hash)).toEqual(data.bytes);
        expect(await assets.readBlob(current.handle, data.retainedHash)).toEqual(data.retainedBytes);
        const recovery = new NativeRecoveryService({ engine, directoriesByHandle: () => current.dirs, assets });
        const retained = (await recovery.list(current.handle)).find(item => item.id === data.retained.id);
        expect(retained.expiresAt).toBe(data.retained.expiresAt);
        for (const item of await recovery.list(current.handle)) {
            const review = await recovery.preflightRestore(current.handle, item.id);
            expect(review.allowed).toBe(true); await recovery.restore(current.handle, item.id, review.version);
        }
        expect(await assets.read(current.handle, data.retainedAssetId)).toMatchObject({ bytes: data.retainedBytes });
        expect(fs.readFileSync(path.join(current.dirs.backups, 'retained.zip'), 'utf8')).toBe('Recoverable backup file');
        expect((await engine.withTransaction(current.handle, tx => tx.getResource({ kind: NATIVE_RESOURCE_KINDS.maintenance, handle: current.handle, scope: 'storage-center:task:imported' }))).doc.status).toBe('paused-review');
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

    test('an older account archive cannot replace a permanent Ironman terminal authority', async () => {
        const engine = getStorageEngine(), f = await runFixture({ ...current, engine }, 'http://127.0.0.1:1/unused');
        const started = await f.begin('ironman'), sessionId = started.session.sessionId;
        const archive = await download(current);
        await f.sessionRepo.delete(current.handle, sessionId);
        expect(await f.core.runStatus(current.handle, sessionId)).toMatchObject({ mode: 'ironman', status: 'terminal' });
        const response = await request(current.app).post('/api/users/restore-backup')
            .field('handle', current.handle).field('mode', 'overwrite').field('selection', JSON.stringify(nativeOnly)).attach('avatar', archive, 'older.zip');
        expect({ status: response.status, body: response.body }).toMatchObject({ status: 200 });
        expect(await f.core.runStatus(current.handle, sessionId)).toMatchObject({ mode: 'ironman', status: 'terminal' });
        await expect(f.core.beginStory(current.handle, sessionId, { input: { mode: 'ironman', name: 'Ada' }, invocationId: 'revive', expectedRevisionId: started.revision.revisionId })).rejects.toMatchObject({ code: 'native_run_terminal' });
    });

    test('account file restore quota failure rolls back the live files', async () => {
        const file = path.join(current.dirs.assets, 'quota.txt'); fs.mkdirSync(current.dirs.assets, { recursive: true }); fs.writeFileSync(file, 'x'.repeat(2000));
        const selection = { ...nativeOnly, native: false, assets: true }, archive = await download(current, selection);
        fs.writeFileSync(file, 'kept');
        const engine = getStorageEngine(), used = await measureAccount({ engine, handle: current.handle, directories: current.dirs });
        installAccountQuota(engine, { directoriesByHandle: () => current.dirs, limit: async () => used.totalBytes + 100 });
        const response = await request(current.app).post('/api/users/restore-backup')
            .field('handle', current.handle).field('mode', 'overwrite').field('selection', JSON.stringify(selection)).attach('avatar', archive, 'quota.zip');
        expect(response.status).toBeGreaterThanOrEqual(400); expect(fs.readFileSync(file, 'utf8')).toBe('kept');
    });

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
