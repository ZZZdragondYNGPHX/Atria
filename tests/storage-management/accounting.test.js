import fs from 'node:fs';
import path from 'node:path';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { NATIVE_RESOURCE_KINDS as K, getNativeResourceKeyFields } from '../../src/native/contracts.js';
import { createNativeId } from '../../src/native/identity.js';
import { nativeRecord } from '../../src/native/repositories/common.js';
import { measureAccount } from '../../src/storage/resource-accounting.js';
import { resourceContentBytes } from '../../src/storage/resource-catalog.js';
import { installAccountQuota } from '../../src/storage/account-quota.js';
import { writeAccountFile } from '../../src/storage/account-file-write.js';
import { ChatRepo } from '../../src/storage/repositories/chat-repo.js';
import { services, sessionFixture } from '../native/helpers/session-fixture.js';
import { buildAtriaPackageContainer } from '../../src/native/package-container.js';
import { importRisuSprites } from '../../src/endpoints/sprites.js';
import { persistCharXAssets } from '../../src/charx.js';
import { writeMetadataIndex } from '../../src/endpoints/image-metadata.js';

const hash = 'a'.repeat(64);
const fields = { scopeId: hash, evidenceId: hash, sourceDigest: hash, taskId: 'task-1', goalId: 'goal-1', commitId: 'commit-1', checkpointId: hash, scope: 'probe', namespace: 'atri_probe', head: 'head-1', resourceType: 'core.prompt-module', resourceId: 'probe-resource', revision: 'v1', bindingId: hash, recordType: 'event', recordId: 'event:0' };
const families = { planId: 'orchestrationPlan', planRevisionId: 'orchestrationRevision', runId: 'orchestrationRun', commandId: 'orchestrationCommand', controlId: 'rpControl' };
function fixtureKey(kind, handle) {
    return Object.fromEntries([['kind', kind], ...getNativeResourceKeyFields(kind).map(field => [field,
        field === 'handle' ? handle : fields[field] ?? createNativeId(families[field] ?? (field === 'saveId' ? 'savePoint' : field.slice(0, -2))),
    ])]);
}

describe.each(CONTRACT_HARNESSES)('resource accounting — $name', ({ make, name }) => {
    let h;
    beforeEach(async () => { h = await make(); });
    afterEach(async () => { await h.cleanup(); });
    const measure = () => measureAccount({ engine: h.engine, handle: h.handle, directories: h.dirs });
    test('legacy auxiliary media imports and generated metadata cannot bypass quota or erase an existing replacement', async () => {
        let limit = 0;
        installAccountQuota(h.engine, { directoriesByHandle: () => h.dirs, limit: async () => limit, makeDefault: true });
        const risu = { data: { name: 'Quota sprites', extensions: { risuai: { emotions: [['happy', Buffer.from('Sprite bytes').toString('base64')]] } } } };
        await expect(importRisuSprites(h.dirs, risu, h.handle)).rejects.toMatchObject({ code: 'storage_quota_exceeded' });
        const file = path.join(h.dirs.characters, 'Quota sprites', 'happy.png'); expect(fs.existsSync(file)).toBe(false);
        limit = -1; await importRisuSprites(h.dirs, risu, h.handle);
        limit = (await measure()).totalBytes;
        const asset = { zipPath: 'assets/happy.png', name: 'happy', baseName: 'happy', ext: 'png', storageCategory: 'sprite' };
        await expect(persistCharXAssets([asset], new Map([[asset.zipPath, Buffer.alloc(200)]]), h.dirs, 'Quota sprites', h.handle)).rejects.toMatchObject({ code: 'storage_quota_exceeded' });
        expect(fs.readFileSync(file, 'utf8')).toBe('Sprite bytes');
        await expect(writeMetadataIndex(h.dirs.root, { version: 1, images: {}, folders: [] })).rejects.toMatchObject({ code: 'storage_quota_exceeded' });
        expect((await measure()).totalBytes).toBe(limit);
    });
    test('package and media quota failures roll back newly introduced blobs and all metadata', async () => {
        const svc = services(h), fixture = sessionFixture();
        const { archive } = buildAtriaPackageContainer({ manifest: fixture.manifest, sourceFiles: new Map(), assetPayloads: new Map() });
        let limit = archive.length;
        installAccountQuota(h.engine, { directoriesByHandle: () => h.dirs, limit: async () => limit });
        await expect(svc.packageInstaller.install(h.handle, archive)).rejects.toMatchObject({ code: 'storage_quota_exceeded' });
        expect(await svc.packageRepo.list(h.handle)).toEqual([]); expect((await measure()).totalBytes).toBe(0);
        const bytes = Buffer.from('Media quota fixture'), crypto = await import('node:crypto'), contentHash = crypto.createHash('sha256').update(bytes).digest('hex');
        limit = bytes.length;
        await expect(svc.assetStore.put(h.handle, { assetId: createNativeId('asset'), contentHash, size: bytes.length, mediaType: 'application/octet-stream' }, bytes)).rejects.toMatchObject({ code: 'storage_quota_exceeded' });
        expect(await svc.assetStore.hasBlob(h.handle, contentHash)).toBe(false); expect((await measure()).totalBytes).toBe(0);
        limit = -1; await svc.packageInstaller.install(h.handle, archive); expect(await svc.packageRepo.list(h.handle)).toHaveLength(1);
    });
    test('legacy chat append and structured file writes use canonical final bytes; shrinking remains possible over quota', async () => {
        let limit = 10000;
        installAccountQuota(h.engine, { directoriesByHandle: () => h.dirs, limit: async () => limit });
        const repo = new ChatRepo({ engine: h.engine });
        const saved = await repo.save(h.handle, 'Quota', 'chat', {}, [{ mes: 'x'.repeat(200) }]);
        const before = (await measure()).totalBytes; limit = before;
        await expect(repo.append(h.handle, 'Quota', 'chat', [{ mes: 'does not fit' }], saved.integrity)).rejects.toMatchObject({ code: 'storage_quota_exceeded' });
        expect((await repo.get(h.handle, 'Quota', 'chat')).body).toHaveLength(1);
        limit = 0; await repo.save(h.handle, 'Quota', 'chat', {}, []); expect((await measure()).totalBytes).toBeLessThan(before);
        limit = (await measure()).totalBytes + resourceContentBytes({ enabled: true });
        await writeAccountFile(h.handle, path.join(h.dirs.root, 'settings.json'), Buffer.from('  {\n "enabled": true\n }  '), h.engine);
        expect((await measure()).totalBytes).toBe(limit);
    });
    test('all Native kinds, project Git, deduplicated blobs, backups and unknown files reconcile', async () => {
        let expected = 0;
        await h.engine.withTransaction(h.handle, async tx => {
            for (const kind of Object.values(K)) {
                const key = fixtureKey(kind, h.handle), doc = { marker: kind, text: '中文' };
                expected += resourceContentBytes(doc);
                await tx.putResource(key, nativeRecord(doc));
            }
        });
        for (const [relative, text] of [['projects/probe/.git/objects/data', 'git history'], ['assets/atria-native/blobs/aa/' + hash, 'shared blob'], ['backups/one.zip', 'backup'], ['unknown.bin', 'unknown']]) {
            const file = path.join(h.dirs.root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text);
            expected += Buffer.byteLength(text);
        }
        const result = await measure();
        expect(result.errors).toEqual([]);
        expect(result.totalBytes).toBe(expected);
        expect(result.units.filter(unit => unit.source === 'native')).toHaveLength(Object.keys(K).length);
        expect(Object.values(result.categories).reduce((sum, category) => sum + category.bytes, 0)).toBe(expected);
        expect(result.categories.media.bytes).toBe(resourceContentBytes({ marker: K.assetRef, text: '中文' }) + 11);
        expect(result.physical.bytes).toBeGreaterThanOrEqual(35);
    });
    test('transaction net growth, replacements and concurrent writers use the same content authority', async () => {
        let limit = 1000;
        installAccountQuota(h.engine, { directoriesByHandle: () => h.dirs, limit: async () => limit });
        const one = fixtureKey(K.package, h.handle), two = fixtureKey(K.package, h.handle);
        const first = { text: 'a'.repeat(30) }, second = { text: 'b'.repeat(30) };
        limit = resourceContentBytes(first);
        const results = await Promise.allSettled([one, two].map(key => h.engine.withTransaction(h.handle, tx => tx.putResource(key, nativeRecord(first)))));
        expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1);
        expect(results.find(item => item.status === 'rejected').reason.code).toBe('storage_quota_exceeded');
        const winner = results[0].status === 'fulfilled' ? one : two;
        await h.engine.withTransaction(h.handle, tx => tx.putResource(winner, nativeRecord(second)));
        expect((await measure()).totalBytes).toBe(limit);
        await expect(h.engine.withTransaction(h.handle, tx => tx.putResource(winner, nativeRecord({ text: 'c'.repeat(50) })))).rejects.toMatchObject({ code: 'storage_quota_exceeded' });
        expect((await measure()).totalBytes).toBe(limit);
        limit = 0;
        await h.engine.withTransaction(h.handle, tx => tx.deleteResource(winner));
        expect((await measure()).totalBytes).toBe(0);
    });
    test('unknown native FS files are accounted and unreadable ranges never become complete zero', async () => {
        const outside = path.join(h.dirs.root, 'outside');
        fs.mkdirSync(h.dirs.root, { recursive: true });
        fs.symlinkSync(h.dataRoot, outside, 'junction');
        const result = await measure();
        expect(result.completeness).toBe('partial');
        expect(result.totalBytes).toBeNull();
        expect(result.unknownBytes).toBeNull();
        fs.unlinkSync(outside);
    });
    test('high precision JSON numbers preserve the canonical bytes and integrity exactly', async () => {
        const key = fixtureKey(K.packageState, h.handle), doc = { values: [1792037000000.0015, 1792037000000.0059, 0.1, Number.MIN_VALUE, 1e100] };
        const record = nativeRecord(doc);
        await h.engine.withTransaction(h.handle, tx => tx.putResource(key, record));
        const restored = await h.engine.withTransaction(h.handle, tx => tx.getResource(key));
        expect(restored.doc).toEqual(doc); expect(restored.integrity).toBe(record.integrity);
        expect((await measure()).totalBytes).toBe(resourceContentBytes(doc));
    });
    test('file publication checks actual net bytes and serializes concurrent uploads', async () => {
        let limit = 100;
        installAccountQuota(h.engine, { directoriesByHandle: () => h.dirs, limit: async () => limit });
        const files = ['one.bin', 'two.bin'].map(name => path.join(h.dirs.root, name));
        const results = await Promise.allSettled(files.map(file => writeAccountFile(h.handle, file, Buffer.alloc(100), h.engine)));
        expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
        const winner = files[results.findIndex(result => result.status === 'fulfilled')];
        await writeAccountFile(h.handle, winner, Buffer.alloc(100, 1), h.engine);
        expect((await measure()).totalBytes).toBe(100);
        limit = 0;
        await writeAccountFile(h.handle, winner, Buffer.alloc(50), h.engine);
        expect((await measure()).totalBytes).toBe(50);
    });
    test('a complete Native transaction admits its final net growth regardless of write order', async () => {
        const doc = { text: 'Retained data' }, one = fixtureKey(K.world, h.handle), two = fixtureKey(K.world, h.handle);
        installAccountQuota(h.engine, { directoriesByHandle: () => h.dirs, limit: async () => resourceContentBytes(doc) });
        await h.engine.withTransaction(h.handle, tx => tx.putResource(one, nativeRecord(doc)));
        await h.engine.withTransaction(h.handle, async tx => { await tx.putResource(two, nativeRecord(doc)); await tx.deleteResource(one); });
        expect((await measure()).totalBytes).toBe(resourceContentBytes(doc));
        expect(await h.engine.withTransaction(h.handle, tx => tx.getResource(one))).toBeNull();
    });
    if (/Mysql|Pg/.test(name)) test('a detached account-lock continuation reacquires admission after its old scope has closed', async () => {
        let wakeLate, late, enteredLate = false, enteredSecond, finishSecond;
        const lateGate = new Promise(resolve => { wakeLate = resolve; });
        const secondEntered = new Promise(resolve => { enteredSecond = resolve; });
        const secondGate = new Promise(resolve => { finishSecond = resolve; });
        await h.engine.withAccountLock(h.handle, async () => {
            late = (async () => { await lateGate; return h.engine.withAccountLock(h.handle, async () => { enteredLate = true; }); })();
        });
        const second = h.engine.withAccountLock(h.handle, async () => { enteredSecond(); await secondGate; });
        try {
            await secondEntered; wakeLate();
            await new Promise(resolve => setImmediate(resolve));
            expect(enteredLate).toBe(false);
        } finally { finishSecond(); wakeLate(); await second; await late; }
        expect(enteredLate).toBe(true);
    });
    if (/Mysql|Pg/.test(name)) test('independent shared-database engines serialize quota admission with a single-connection pool', async () => {
        const other = new h.engine.constructor({ url: h.url, poolSize: 1 });
        try {
            await other.ping(h.handle);
            const doc = { value: 'Only one writer fits' }, options = { directoriesByHandle: () => h.dirs, limit: async () => resourceContentBytes(doc) };
            installAccountQuota(h.engine, options); installAccountQuota(other, options);
            const results = await Promise.allSettled([h.engine, other].map(engine => engine.withTransaction(h.handle, tx => tx.putResource(fixtureKey(K.world, h.handle), nativeRecord(doc)))));
            expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1);
            expect(results.find(item => item.status === 'rejected').reason.code).toBe('storage_quota_exceeded');
            expect((await measure()).totalBytes).toBe(resourceContentBytes(doc));
        } finally { await other.close(); }
    });
    else test.skip('shared database advisory locks do not apply to a file-backed engine', () => {});
});
