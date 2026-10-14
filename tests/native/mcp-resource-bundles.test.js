import express from 'express';
import request from 'supertest';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NativeMcpResourceBundles, mountMcpResourceBundles } from '../../src/native/mcp-resource-bundles.js';
import { StudioService } from '../../src/native/authoring/studio-service.js';
import { WorldRepo, KnowledgeRepo, AssetStore, ProjectStore, PackageRepo, VersionedJsonResourceHandler, createNativeId } from '../../src/native/index.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex'), clientInstanceId = 'bundle-client';
describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('Resource Bundle Native binary %s', (_name, harness) => {
    test('greater than 1 MiB uses bounded HTTP chunks and exact review; partial import resumes through the real resource authority', async () => {
        const h = await harness(), options = { worldRepo: new WorldRepo({ engine: h.engine }), knowledgeRepo: new KnowledgeRepo({ engine: h.engine }),
            assetStore: new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs }), projectStore: new ProjectStore({ directoriesByHandle: () => h.dirs }),
            packageRepo: new PackageRepo({ engine: h.engine }), versionedJsonResources: new VersionedJsonResourceHandler({ engine: h.engine }) };
        const studio = new StudioService(options), store = new NativeMcpResourceBundles(), app = express();
        app.use(express.json({ limit: '1mb' })); app.use((req, _res, next) => { if (req.get('x-user')) req.user = { profile: { handle: req.get('x-user') } }; next(); });
        mountMcpResourceBundles(app, { getServices: () => ({ studio }), store });
        const root = '/resources/bundle-staging', post = (action, body) => request(app).post(root + action).set('x-user', h.handle).send(body);
        try {
            const assetId = createNativeId('asset'), bytes = randomBytes(1024 * 1024 + 31);
            await options.assetStore.put(h.handle, { assetId, contentHash: hash(bytes), size: bytes.length, mediaType: 'application/octet-stream' }, bytes);
            const worldId = createNativeId('world'), revision = createNativeId('worldRevision');
            await options.worldRepo.commitRevision(h.handle, { worldId, worldRevisionId: revision, knowledgeBindingIds: [], assetIds: [assetId], baseline: {}, metadata: {} },
                { createRoot: { worldId, displayName: 'Bundle fixture', currentRevisionId: null } });
            const original = { resourceType: 'core.world', resourceId: worldId, revision, scope: 'library' };
            const stage = (await post('/export', { ref: original, clientInstanceId }).expect(200)).body, ref = stage.bundleRef;
            expect(ref.totalBytes).toBeGreaterThan(1024 * 1024); expect(JSON.stringify(stage).length).toBeLessThan(2000); expect(stage.resourceCount).toBe(2);
            const query = { ...ref }; delete query.artifactId;
            const chunks = [];
            for (let offset = 0; offset < ref.totalBytes; offset += stage.maxChunkBytes) {
                const length = Math.min(stage.maxChunkBytes, ref.totalBytes - offset), result = await request(app).get(root + '/' + ref.artifactId + '/chunk')
                    .query({ ...query, offset, length }).set('x-user', h.handle).expect(206);
                expect(result.headers['x-atria-chunk-sha256']).toBe(hash(result.body)); chunks.push(result.body);
            }
            const bundleBytes = Buffer.concat(chunks), bundle = JSON.parse(bundleBytes.toString());
            expect(hash(bundleBytes)).toBe(ref.contentHash); expect(hashNativeDocument(bundle)).toBe(ref.bundleHash);
            await post('/inspect', { bundleRef: { ...ref, purpose: 'package-archive' } }).expect(400);
            await post('/inspect', { bundleRef: { ...ref, clientInstanceId: 'foreign-client' } }).expect(409);
            await request(app).post(root + '/inspect').set('x-user', 'foreign').send({ bundleRef: ref }).expect(404);
            await post('/content', { bundleRef: ref, offset: 0, limit: 12000 }).expect(200).expect(result => expect(result.body.text.length).toBe(12000));
            const plan = (await post('/preflight', { bundleRef: ref, token: null }).expect(200)).body;
            expect(plan.canImport).toBe(true); expect(JSON.stringify(plan).length).toBeLessThan(8000); expect(plan.resources.every(item => !('data' in item))).toBe(true);
            const secondPage = (await post('/preflight', { bundleRef: ref, token: plan.token, offset: 1, limit: 1 }).expect(200)).body;
            expect(secondPage.resourceCount).toBe(2); expect(secondPage.resources).toHaveLength(1); expect(secondPage.resources[0]).toEqual(plan.resources[1]);
            expect(secondPage.mappingHash).toBe(plan.mappingHash); expect(secondPage.reviewHash).toBe(plan.reviewHash);
            const intent = { bundleRef: ref, token: plan.token, expectedReviewHash: plan.reviewHash };
            await post('/import', { ...intent, expectedReviewHash: '0'.repeat(64) }).expect(409);
            await post('/import', { ...intent, token: { ...plan.token, seed: '0'.repeat(32) } }).expect(409);
            const adapter = studio._resourceBundles.adapters.get('core.world'), write = adapter.write; let interrupt = true;
            adapter.write = async (...args) => { if (interrupt) { interrupt = false; throw new Error('fixture interrupted disk write'); } return write(...args); };
            await post('/import', intent).expect(500).expect(result => expect(result.body.details.retryable).toBe(true));
            const afterPartial = (await post('/preflight', { bundleRef: ref, token: plan.token }).expect(200)).body;
            expect(afterPartial.reviewHash).toBe(plan.reviewHash); expect(afterPartial.resources.some(item => item.status === 'same')).toBe(true);
            const result = (await post('/import', intent).expect(200)).body;
            expect(result.root).toEqual(plan.root); expect(result.resources).toHaveLength(2);
            await post('/import', intent).expect(200).expect(result => expect(result.body.root).toEqual(plan.root));
            expect(await options.worldRepo.list(h.handle)).toHaveLength(2);

            // External bytes enter only the dedicated raw upload and are validated
            // by the same adapters before a complete handle is published.
            const uploaded = (await post('/begin', { clientInstanceId, contentHash: ref.contentHash, totalBytes: ref.totalBytes, bundleHash: ref.bundleHash }).expect(200)).body;
            const uploadRef = uploaded.bundleRef, uploadQuery = { ...uploadRef }; delete uploadQuery.artifactId;
            for (let offset = 0; offset < bundleBytes.length; offset += uploaded.maxChunkBytes) {
                const chunk = bundleBytes.subarray(offset, offset + uploaded.maxChunkBytes);
                await request(app).put(root + '/' + uploadRef.artifactId + '/chunk').query({ ...uploadQuery, offset }).set('x-user', h.handle)
                    .set('Content-Type', 'application/octet-stream').set('x-atria-chunk-sha256', hash(chunk)).send(chunk).expect(200);
            }
            await post('/finalize', { bundleRef: uploadRef }).expect(200);
            await post('/preflight', { bundleRef: uploadRef, token: null }).expect(200);
            await post('/cancel', { bundleRef: uploadRef }).expect(200);
            await post('/inspect', { bundleRef: uploadRef }).expect(404);
        } finally { store.clear(); await h.cleanup(); }
    });
});

test('512 maximum-size references and conflicts remain paged below 1 MiB with a complete mapping hash', async () => {
    const longRef = (index, suffix) => ({ resourceType: 'core.world', resourceId: `r${index}${suffix}`.padEnd(256, 'a'), revision: 'v'.repeat(256), scope: 'package',
        packageId: 'p'.repeat(256), packageVersionId: 'q'.repeat(256) });
    const resources = Array.from({ length: 512 }, (_, index) => ({ source: longRef(index, 'source'), ref: longRef(index, 'target'), data: { inert: index }, status: 'conflict' }));
    const value = { root: resources[0].source, resources: [] }, token = { seed: 'a'.repeat(32), bundleHash: hashNativeDocument(value) };
    const plan = { format: 'atria-resource-bundle', root: resources[0].ref, resources, conflicts: resources.map(({ source, ref }) => ({ source, target: ref })),
            existingOrigins: resources.map(item => item.source), token, canImport: false }, studio = { preflightResourceBundle: async () => plan };
    expect(Buffer.byteLength(JSON.stringify(plan))).toBeGreaterThan(1048576);
    const store = new NativeMcpResourceBundles(), stage = await store.capture('owner', clientInstanceId, value), seen = [], conflicts = [], origins = [];
    try {
        let mappingHash;
        for (let offset = 0; offset < 512; offset += 64) {
            const page = await store.preflight('owner', stage.bundleRef, studio, null, { offset, limit: 64 });
            expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(1048576); expect(page.resourceCount).toBe(512); expect(page.conflictCount).toBe(512);
            mappingHash ??= page.mappingHash; expect(page.mappingHash).toBe(mappingHash);
            seen.push(...page.resources); conflicts.push(...page.conflicts); origins.push(...page.existingOrigins);
        }
        expect(seen).toHaveLength(512); expect(conflicts).toEqual(plan.conflicts); expect(origins).toEqual(plan.existingOrigins);
        expect(mappingHash).toBe(hashNativeDocument(resources.map(({ source, ref, data }) => ({ source, ref, contentHash: hashNativeDocument(data) }))));
        expect(() => store.preflight('owner', stage.bundleRef, studio, null, { offset: 0, limit: 65 })).toThrow();
    } finally { store.clear(); }
});

test('bundle staging fails closed on incomplete/bad hashes, oversized payload, TTL and package-purpose confusion', async () => {
    let now = 0;
    const store = new NativeMcpResourceBundles({ now: () => now, ttlMs: 10 }), owner = 'fixture', bytes = Buffer.from('{}');
    const begin = () => store.begin(owner, { clientInstanceId, contentHash: hash(bytes), totalBytes: bytes.length, bundleHash: 'a'.repeat(64) });
    const one = begin();
    expect(() => store.write(owner, one.bundleRef, 1, bytes, hash(bytes))).toThrow();
    expect(() => store.inspect(owner, one.bundleRef)).toThrow();
    const two = begin(); now = 10;
    expect(() => store.inspect(owner, two.bundleRef)).toThrow();
    expect(() => store.begin(owner, { clientInstanceId, contentHash: hash(bytes), totalBytes: 32 * 1024 * 1024 + 1, bundleHash: 'a'.repeat(64) })).toThrow();
    const three = begin(); store.write(owner, three.bundleRef, 0, bytes, hash(bytes));
    await expect(store.finalize(owner, three.bundleRef, {})).rejects.toThrow();
    expect(() => store.inspect(owner, three.bundleRef)).toThrow(); store.clear();
});

(process.env.ATRIA_MCP_SOURCE ? describe : describe.skip)('MCP Resource Bundle adapter integration', () => {
    test('real MCP development Bundle capture and Native binary export preserve large resources through separate Review/Import approval', async () => {
        const h = await makeTempFsEngineHarness(), options = { worldRepo: new WorldRepo({ engine: h.engine }), knowledgeRepo: new KnowledgeRepo({ engine: h.engine }),
            assetStore: new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs }), projectStore: new ProjectStore({ directoriesByHandle: () => h.dirs }),
            packageRepo: new PackageRepo({ engine: h.engine }), versionedJsonResources: new VersionedJsonResourceHandler({ engine: h.engine }) };
        const store = new NativeMcpResourceBundles(), studio = new StudioService(options);
        try {
            const plugin = process.env.ATRIA_MCP_SOURCE;
            const { registerResourceActions } = await import(pathToFileURL(join(plugin, 'src/resource-actions.js')).href);
            const { RepositoryAccessPolicy } = await import(pathToFileURL(join(plugin, 'src/repository.js')).href);
            const { ActionRegistry, PolicyCeiling, RiskExecutor } = await import(pathToFileURL(join(plugin, 'src/kernel.js')).href);
            const worldId = createNativeId('world'), revision = createNativeId('worldRevision'), ref = { scope: 'library', resourceType: 'core.world', resourceId: worldId, revision };
            await options.worldRepo.commitRevision(h.handle, { worldId, worldRevisionId: revision, knowledgeBindingIds: [], assetIds: [], baseline: { text: 'inert large fixture '.repeat(70000) }, metadata: {} },
                { createRoot: { worldId, displayName: 'MCP Bundle', currentRevisionId: null } });
            const bundle = await studio.exportResourceBundle(h.handle, ref); await mkdir(join(h.dirs.root, '.artifacts'), { recursive: true }); await writeFile(join(h.dirs.root, '.artifacts/fixture.bundle.json'), JSON.stringify(bundle));
            const app = express(); app.use(express.json({ limit: '1mb' })); app.use((req, _res, next) => { req.user = { profile: { handle: h.handle } }; next(); });
            const router = express.Router(); mountMcpResourceBundles(router, { getServices: () => ({ studio }), store }); app.use('/api/native/studio', router);
            const browser = { config: { url: 'http://localhost', timeout: 1000, maxResponseBytes: 1048576 }, start: async () => {}, runtimeIdentity: async () => ({ serverBootId: store.bootId }),
                context: { request: { get: async () => ({ ok: () => true, headers: () => ({ 'content-type': 'application/json' }), body: async () => Buffer.from('{"token":"fixture"}'), dispose: async () => {} }),
                    fetch: async (url, options) => {
                        const parsed = new URL(url), method = options.method.toLowerCase(), call = request(app)[method](parsed.pathname + parsed.search).set(options.headers);
                        const result = await (method === 'get' ? call : call.send(options.data));
                        return { ok: () => result.status < 400, status: () => result.status, headers: () => result.headers,
                            body: async () => Buffer.isBuffer(result.body) ? result.body : Buffer.from(result.text), dispose: async () => {} };
                    } } } };
            const repository = { refreshRuntimeRoots: async () => {}, policy: new RepositoryAccessPolicy(h.dirs.root) }, approvals = [];
            const registry = registerResourceActions(new ActionRegistry(), browser, repository), executor = new RiskExecutor(registry, new PolicyCeiling(registry, registry.ids()),
                { approve: async evidence => { approvals.push(evidence); return { action: 'accept', content: { authorize: true } }; } });
            const captured = await executor.execute('INTERACT', { action: 'library.bundle.capture', input: { path: '.artifacts/fixture.bundle.json' } });
            expect(captured.receipt.status).toBe('succeeded'); expect(captured.result.artifact.totalBytes).toBeGreaterThan(1048576);
            const input = { binaryHandleId: captured.result.artifact.binaryHandleId }, plan = await executor.execute('READ', { action: 'library.bundle.preflight', input });
            const review = await executor.execute('INTERACT', { action: 'library.bundle.review', input: { ...input, expectedReviewHash: plan.reviewHash, expectedBundleHash: plan.bundleHash } });
            expect(review.receipt.status).toBe('succeeded');
            const imported = await executor.execute('MUTATE', { action: 'library.bundle.import', input: { ...input, reviewReceiptId: review.receipt.receiptId } });
            expect(imported.receipt.status).toBe('succeeded'); expect(imported.result.root).toEqual(plan.root); expect(await options.worldRepo.list(h.handle)).toHaveLength(2);
            const exported = await executor.execute('INTERACT', { action: 'library.bundle.export', input: { ref } });
            expect(exported.receipt.status).toBe('succeeded'); expect(exported.result.artifact.totalBytes).toBeGreaterThan(1048576); expect(approvals).toHaveLength(4);
            expect(JSON.stringify(imported)).not.toContain('inert large fixture'); expect(JSON.stringify(captured)).not.toContain('inert large fixture');
        } finally { store.clear(); await h.cleanup(); }
    }, 60000);
});
