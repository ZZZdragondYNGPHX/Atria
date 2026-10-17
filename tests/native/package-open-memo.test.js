import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { jest } from '@jest/globals';

// Count actual inspections; the original authenticated Container inspector is
// always called. No validator, blob read, owner or Package metadata is faked.
const container = await import('../../src/native/package-container.js');
const inspect = jest.fn(container.inspectAtriaPackageContainer);
jest.unstable_mockModule('../../src/native/package-container.js', () => ({ ...container, inspectAtriaPackageContainer: inspect }));
const { PackageInstaller } = await import('../../src/native/package-composition.js');
const { AssetStore } = await import('../../src/native/repositories/asset-store.js');
const { PackageRepo } = await import('../../src/native/repositories/package-repo.js');
const { createNativeId } = await import('../../src/native/identity.js');
const { putMutable } = await import('../../src/native/repositories/common.js');
const { makeMultiHandleFsEngine } = await import('../storage/harness/contract-harness.js');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function fixture(source = Buffer.from('original source')) {
    const asset = Buffer.from('original asset'), assetId = createNativeId('asset');
    const manifest = { format: 'atria-package', schemaVersion: 2, nativeSchemaVersion: 1,
        packageId: createNativeId('package'), packageVersionId: createNativeId('packageVersion'), name: 'Fresh package', version: '1.0.0',
        actors: [], entryPoints: [{ entryPointId: createNativeId('entryPoint'), displayName: 'Main', actorIds: [], worldIds: [], knowledgeBindingIds: [] }],
        capabilities: ['narrative'], permissions: [], worlds: [], knowledge: [], knowledgeBindings: [],
        metadata: { nested: { value: 'original' } },
        assets: [{ assetId, contentHash: digest(asset), size: asset.length, mediaType: 'text/plain' }] };
    const built = container.buildAtriaPackageContainer({ manifest, sourceFiles: new Map([['data/source.bin', source]]), assetPayloads: new Map([[assetId, asset]]) });
    return { ...built, assetId, asset, source };
}

describe('PackageInstaller pure archive memo with fresh original storage', () => {
    let root, engine, repo, store, installer;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-package-memo-'));
        const h = makeMultiHandleFsEngine({ root }); engine = h.engine;
        repo = new PackageRepo({ engine }); store = new AssetStore({ engine, directoriesByHandle: h.dirsForHandle });
        installer = new PackageInstaller({ packageRepo: repo, assetStore: store }); inspect.mockClear();
    });
    afterEach(async () => { jest.restoreAllMocks(); await engine.close(); fs.rmSync(root, { recursive: true, force: true }); });
    const install = f => installer.install('u', f.archive);
    const open = (f, handle = 'u', options = {}) => installer.open(handle, f.manifest.packageId, f.manifest.packageVersionId, options);
    async function changeVersion(f, change) {
        const key = repo._versionKey('u', f.manifest.packageId, f.manifest.packageVersionId);
        await engine.withTransaction('u', async tx => {
            const saved = await tx.getResource(key); await putMutable(tx, key, change(saved.doc), { expectedIntegrity: saved.integrity });
        });
    }

    test('identical full archives reuse parsing while every open reads metadata and blob and owns all returned data', async () => {
        const f = fixture(); await install(f); inspect.mockClear();
        const metadata = jest.spyOn(repo, 'getVersion'), blobs = jest.spyOn(store, 'readBlob');
        const first = await open(f, 'u', { includeArchive: true });
        first.manifest.metadata.nested.value = 'caller mutation';
        first.manifest.entryPoints.push({ caller: true });
        first.sourceFiles.set('caller.txt', Buffer.from('caller')); first.sourceFiles.get('data/source.bin').fill(0);
        first.assets.get(f.assetId).fill(0); first.assets.set('caller', Buffer.alloc(1));
        new Uint8Array(first.archive.buffer).fill(0);
        new Uint8Array(first.sourceFiles.get('data/source.bin').buffer).fill(0);
        new Uint8Array(first.assets.get(f.assetId).buffer).fill(0);
        expect(() => first.preflight.permissions.push({ caller: true })).toThrow(/not extensible/);
        const second = await open(f, 'u', { includeArchive: true });
        expect(inspect).toHaveBeenCalledTimes(1); expect(metadata).toHaveBeenCalledTimes(2); expect(blobs).toHaveBeenCalledTimes(2);
        expect(second.manifest.metadata.nested.value).toBe('original'); expect(second.manifest.entryPoints).toHaveLength(1);
        expect(second.sourceFiles.size).toBe(1); expect(second.sourceFiles.get('data/source.bin')).toEqual(f.source);
        expect(second.assets.size).toBe(1); expect(second.assets.get(f.assetId)).toEqual(f.asset);
        expect(second.archive).toEqual(f.archive); expect(second.preflight.permissions).toEqual([]);
        expect(second.manifest).not.toBe(first.manifest); expect(second.preflight).not.toBe(first.preflight);
    });

    test('warm parsing cannot supply a missing owner version or missing metadata', async () => {
        const f = fixture(); await install(f); await open(f);
        expect(await open(f, 'another-owner')).toBeNull();
        await repo.create('another-owner', { packageId: f.manifest.packageId, displayName: f.manifest.name,
            currentVersionId: null, createdAt: 1, updatedAt: 1 });
        await repo.commitVersion('another-owner', await repo.getVersion('u', f.manifest.packageId, f.manifest.packageVersionId));
        await expect(open(f, 'another-owner')).rejects.toMatchObject({ code: 'native_package_content_missing' });
        await engine.withTransaction('u', tx => tx.deleteResource(repo._versionKey('u', f.manifest.packageId, f.manifest.packageVersionId)));
        expect(await open(f)).toBeNull();
    });

    test.each(['missing', 'corrupt'])('warm parsing still refuses a %s actual blob', async mode => {
        const f = fixture(); await install(f); await open(f); const file = store._blobPath('u', digest(f.archive));
        if (mode === 'missing') fs.rmSync(file);
        else { const changed = Buffer.from(f.archive); changed[changed.length - 1] ^= 1; fs.writeFileSync(file, changed); }
        await expect(open(f)).rejects.toMatchObject({ code: mode === 'missing' ? 'native_package_content_missing' : 'native_asset_blob_corrupt' });
    });

    test.each(['version', 'packageId', 'packageVersionId'])('warm parsing refuses changed exact %s metadata', async field => {
        const f = fixture(); await install(f); await open(f);
        await changeVersion(f, value => ({ ...value, [field]: field === 'version' ? '2.0.0' : createNativeId(field === 'packageId' ? 'package' : 'packageVersion') }));
        await expect(open(f)).rejects.toThrow(/metadata does not match/);
    });

    test('a new actual archive hash is parsed again and the fresh installed metadata is returned', async () => {
        const f = fixture(); await install(f); await open(f); inspect.mockClear();
        const updated = container.buildAtriaPackageContainer({ manifest: { ...f.manifest, name: 'New actual bytes' },
            sourceFiles: new Map([['data/source.bin', Buffer.from('new source')]]), assetPayloads: new Map([[f.assetId, f.asset]]) });
        const contentHash = await store.putBlob('u', updated.archive);
        await changeVersion(f, value => ({ ...value, packageContentHash: contentHash }));
        const actual = await open(f); expect(inspect).toHaveBeenCalledTimes(1);
        expect(actual.manifest.name).toBe('New actual bytes'); expect(actual.packageVersion.packageContentHash).toBe(contentHash);
        expect(actual.sourceFiles.get('data/source.bin')).toEqual(Buffer.from('new source'));
    });

    test('entry count is bounded and eviction performs full parsing again', async () => {
        const fixtures = [];
        for (let index = 0; index < 9; index++) { const f = fixture(); await install(f); await open(f); fixtures.push(f); }
        inspect.mockClear(); await open(fixtures[0]); expect(inspect).toHaveBeenCalledTimes(1);
    });

    test('compressed archive size alone cannot hide retained uncompressed buffers from the byte bound', async () => {
        const chunk = randomBytes(16384), source = Buffer.concat(Array(1024).fill(chunk));
        const first = fixture(source), second = fixture(source);
        expect(first.archive.length).toBeLessThan(source.length / 2);
        await install(first); await open(first); await install(second); await open(second);
        inspect.mockClear(); expect((await open(first)).sourceFiles.get('data/source.bin').equals(source)).toBe(true);
        expect(inspect).toHaveBeenCalledTimes(1);
    }, 30000);

    test('a legal package larger than the memo budget remains supported without retention', async () => {
        const f = fixture(randomBytes(20 * 1024 * 1024)); await install(f); inspect.mockClear();
        expect((await open(f)).sourceFiles.get('data/source.bin').equals(f.source)).toBe(true);
        expect((await open(f)).sourceFiles.get('data/source.bin').equals(f.source)).toBe(true);
        expect(inspect).toHaveBeenCalledTimes(2);
    }, 30000);
});
