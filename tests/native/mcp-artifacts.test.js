import express from 'express';
import request from 'supertest';
import { createHash, randomBytes } from 'node:crypto';
import { NativeMcpArtifacts } from '../../src/native/mcp-artifacts.js';
import { createNativeProductRouter } from '../../src/endpoints/native-product.js';
import { createNativeStudioRouter } from '../../src/endpoints/native-studio.js';
import { NativeProductService } from '../../src/native/product-service.js';
import { buildAtriaPackageContainer } from '../../src/native/package-container.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { services, sessionFixture } from './helpers/session-fixture.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const clientInstanceId = 'fixture-client', owner = 'fixture-owner';
const begin = (store, bytes = Buffer.from('abcdefgh')) => store.begin(owner, { clientInstanceId, contentHash: hash(bytes), totalBytes: bytes.length });
const query = (ref, extra = {}) => ({ ...ref, artifactId: undefined, ...extra });

test('temporary staging binds exact owner, client, boot, revision, size and hash', () => {
    const store = new NativeMcpArtifacts(), bytes = Buffer.from('abcdefgh'), stage = begin(store, bytes), ref = stage.artifactRef;
    expect(stage.state).toBe('receiving'); expect(ref.sourceRevision).toBe(hash(bytes));
    expect(() => store.inspect('foreign-owner', ref)).toThrow('not found');
    for (const change of [{ clientInstanceId: 'foreign' }, { serverBootId: 'foreign-boot' }, { sourceRevision: 'foreign' }, { contentHash: '0'.repeat(64) }, { totalBytes: 7 }]) {
        expect(() => store.inspect(owner, { ...ref, ...change })).toThrow();
    }
    expect(() => store.readChunk(owner, ref, 0, 4)).toThrow();
    store.write(owner, ref, 0, bytes.subarray(0, 4), hash(bytes.subarray(0, 4)));
    store.write(owner, ref, 4, bytes.subarray(4), hash(bytes.subarray(4)));
    expect(store.finalize(owner, ref).state).toBe('complete');
    expect(store.readChunk(owner, ref, 2, 4).bytes.toString()).toBe('cdef');
    expect(() => store.readChunk(owner, ref, 0, 1048577)).toThrow();
    expect(() => store.finalize(owner, ref)).toThrow();
    expect(JSON.stringify(stage)).not.toMatch(/abcdefgh|YWJjZGVmZ2g|"data"/);
    store.clear(); expect(store.capacity).toEqual({ entries: 0, reservedBytes: 0 });
});

test('wrong chunks and incomplete transfers erase staging without publishing a handle', () => {
    for (const action of [
        (store, ref) => store.write(owner, ref, 4, Buffer.from('abcd'), hash(Buffer.from('abcd'))),
        (store, ref) => store.write(owner, ref, 0, Buffer.from('abcd'), '0'.repeat(64)),
        (store, ref) => { store.write(owner, ref, 0, Buffer.from('abcd'), hash(Buffer.from('abcd'))); store.write(owner, ref, 0, Buffer.from('abcd'), hash(Buffer.from('abcd'))); },
        (store, ref) => store.finalize(owner, ref),
    ]) {
        const store = new NativeMcpArtifacts(), stage = begin(store);
        expect(() => action(store, stage.artifactRef)).toThrow();
        expect(store.capacity).toEqual({ entries: 0, reservedBytes: 0 });
        expect(() => store.inspect(owner, stage.artifactRef)).toThrow();
    }
    const store = new NativeMcpArtifacts(), stage = store.begin(owner, { clientInstanceId, contentHash: '0'.repeat(64), totalBytes: 4 });
    store.write(owner, stage.artifactRef, 0, Buffer.from('abcd'), hash(Buffer.from('abcd')));
    expect(() => store.finalize(owner, stage.artifactRef)).toThrow();
    expect(store.capacity.reservedBytes).toBe(0);
});

test('capacity and TTL cleanup retain active native consumers until they release their lease', async () => {
    let now = 0;
    const store = new NativeMcpArtifacts({ now: () => now, ttlMs: 10, maxEntries: 1, maxOwnerEntries: 1, maxTotalBytes: 8 }), bytes = Buffer.from('abcdefgh');
    const stage = store.captureBuild(owner, clientInstanceId, 'project', 'revision', bytes);
    expect(() => begin(store)).toThrow();
    let release;
    const consumer = store.withBytes(owner, stage.artifactRef, async pinned => {
        await new Promise(resolve => { release = resolve; });
        expect(pinned.equals(bytes)).toBe(true);
    });
    now = 10; store.cleanup(); expect(store.capacity.reservedBytes).toBe(8);
    expect(() => store.inspect(owner, stage.artifactRef)).toThrow();
    release(); await consumer;
    expect(store.capacity).toEqual({ entries: 0, reservedBytes: 0 });
    expect(() => store.begin(owner, { clientInstanceId, contentHash: hash(bytes), totalBytes: 128 * 1024 * 1024 + 1 })).toThrow();
});

test('real HTTP metadata, bounded binary download/upload and exact-reference install cross 1 MiB without base64 JSON', async () => {
    const harness = await makeTempFsEngineHarness();
    const svc = services(harness), fixture = sessionFixture();
    const built = buildAtriaPackageContainer({ manifest: fixture.manifest,
        sourceFiles: new Map([['source/payload.bin', randomBytes(2 * 1024 * 1024 + 17)]]), assetPayloads: new Map() });
    const store = new NativeMcpArtifacts();
    const product = new NativeProductService({ packageRepo: svc.packageRepo, worldRepo: {}, knowledgeRepo: svc.knowledgeRepo,
        sessionRepo: svc.sessionRepo, savePointRepo: svc.savePointRepo, packageInstaller: svc.packageInstaller,
        saveSystem: svc.saveSystem, sessionCore: svc.core, projectStore: {} });
    const studio = { async buildProject(handle, projectId, options) {
        expect(handle).toBe(harness.handle); expect(projectId).toBe('project-1'); expect(options.baseRevision).toBe('revision-1');
        return { revision: options.baseRevision, built: { ...built, preflight: svc.packageInstaller.preflight(built.archive) } };
    } };
    const app = express(); app.use(express.json({ limit: '1mb' }));
    app.use((req, res, next) => { if (req.headers['x-user']) req.user = { profile: { handle: req.headers['x-user'] } }; res.set('x-atria-server-boot-id', store.bootId); next(); });
    app.use('/studio', createNativeStudioRouter(() => ({ studio }), store));
    app.use('/product', createNativeProductRouter(() => ({ product }), store));
    const post = (path, body) => request(app).post(path).set('x-user', harness.handle).send(body);
    try {
        expect(built.archive.length).toBeGreaterThan(1024 * 1024);
        const result = await post('/studio/projects/project-1/build-artifact', { baseRevision: 'revision-1', clientInstanceId }).expect(200);
        expect(JSON.stringify(result.body).length).toBeLessThan(12000); expect(result.body.data).toBeUndefined();
        const stage = result.body.artifact, ref = stage.artifactRef;
        const chunks = [];
        for (let offset = 0; offset < ref.totalBytes; offset += store.maxChunkBytes) {
            const length = Math.min(store.maxChunkBytes, ref.totalBytes - offset);
            const chunk = await request(app).get('/product/artifacts/' + ref.artifactId + '/chunk').query(query(ref, { offset, length })).set('x-user', harness.handle).expect(206);
            expect(chunk.body.length).toBe(length); expect(chunk.headers['x-atria-chunk-sha256']).toBe(hash(chunk.body));
            expect(chunk.headers['content-range']).toBe(`bytes ${offset}-${offset + length - 1}/${ref.totalBytes}`); chunks.push(chunk.body);
        }
        expect(Buffer.concat(chunks).equals(built.archive)).toBe(true);
        await request(app).get('/product/artifacts/' + ref.artifactId + '/chunk').query(query(ref, { offset: 0, length: 1 })).expect(401);
        await request(app).get('/product/artifacts/' + ref.artifactId + '/chunk').query(query(ref, { offset: 0, length: 1 })).set('x-user', 'foreign').expect(404);
        await post('/product/packages/preflight', { artifactRef: { ...ref, clientInstanceId: 'foreign' } }).expect(409);
        const preflight = await post('/product/packages/preflight', { artifactRef: ref }).expect(200);
        expect(preflight.body.packageContentHash).toBe(hash(built.archive));
        await post('/product/packages/install', { artifactRef: ref, baseVersionId: null, grantedPermissions: [] }).expect(200);
        expect((await svc.packageRepo.get(harness.handle, fixture.manifest.packageId)).currentVersionId).toBe(fixture.manifest.packageVersionId);
        const exactPackage = { packageId: fixture.manifest.packageId, packageVersionId: fixture.manifest.packageVersionId, expectedContentHash: hash(built.archive), clientInstanceId };
        await post('/product/packages/export-artifact', { ...exactPackage, expectedContentHash: '0'.repeat(64) }).expect(400);
        const identity = await request(app).get('/product/works/' + exactPackage.packageId + '/versions/' + exactPackage.packageVersionId + '/identity').set('x-user', harness.handle).expect(200);
        expect(identity.body.packageVersion.packageContentHash).toBe(exactPackage.expectedContentHash); expect(identity.body.manifest).toBeUndefined();
        const exported = (await post('/product/packages/export-artifact', exactPackage).expect(200)).body;
        expect(exported.source).toEqual({ kind: 'installed-package', packageId: exactPackage.packageId, packageVersionId: exactPackage.packageVersionId });
        expect(exported.artifactRef.contentHash).toBe(hash(built.archive)); expect(exported.artifactRef.sourceRevision).toBe(exactPackage.packageVersionId);
        const exportedParts = [];
        for (let offset = 0; offset < exported.artifactRef.totalBytes; offset += store.maxChunkBytes) {
            const length = Math.min(store.maxChunkBytes, exported.artifactRef.totalBytes - offset);
            const part = await request(app).get('/product/artifacts/' + exported.artifactRef.artifactId + '/chunk').query(query(exported.artifactRef, { offset, length })).set('x-user', harness.handle).expect(206);
            exportedParts.push(part.body);
        }
        expect(Buffer.concat(exportedParts).equals(built.archive)).toBe(true);
        await post('/product/packages/preflight', { artifactRef: exported.artifactRef }).expect(200);
        await post('/product/packages/install', { artifactRef: exported.artifactRef, baseVersionId: fixture.manifest.packageVersionId, grantedPermissions: [] }).expect(200);
        await post('/product/packages/install', { artifactRef: ref, baseVersionId: null, grantedPermissions: [] }).expect(409);
        const upload = await post('/product/artifacts/staging', { clientInstanceId, contentHash: hash(built.archive), totalBytes: built.archive.length }).expect(200);
        for (let offset = 0; offset < built.archive.length; offset += store.maxChunkBytes) {
            const bytes = built.archive.subarray(offset, offset + store.maxChunkBytes);
            await request(app).put('/product/artifacts/' + upload.body.artifactRef.artifactId + '/chunk')
                .query(query(upload.body.artifactRef, { offset })).set('x-user', harness.handle).set('Content-Type', 'application/octet-stream')
                .set('x-atria-chunk-sha256', hash(bytes)).send(bytes).expect(200);
        }
        const finalized = await post('/product/artifacts/' + upload.body.artifactRef.artifactId + '/finalize', { artifactRef: upload.body.artifactRef }).expect(200);
        expect(finalized.body.state).toBe('complete');
        await post('/product/packages/preflight', { artifactRef: upload.body.artifactRef }).expect(200);
    } finally { store.clear(); await harness.cleanup(); }
});
