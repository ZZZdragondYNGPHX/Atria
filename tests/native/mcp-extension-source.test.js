import express from 'express';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { NativeMcpArtifacts } from '../../src/native/mcp-artifacts.js';
import { ExtensionsStore } from '../../src/native/extensions-store.js';
import { createNativeExtensionsRouter } from '../../src/endpoints/native-extensions.js';
import { createNativeProductRouter } from '../../src/endpoints/native-product.js';
import { hashNativeDocument, withNativeResourceWrite } from '../../src/native/repositories/common.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';

const MiB = 1024 * 1024, boot = '12345678-1234-4123-8123-123456789012';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const targets = { global: false, presets: [], works: [] };
const metadata = (overrides = {}) => ({ name: 'Large inert source', id: null, expectedRevision: null, targets, clientInstanceId: 'extension-fixture', ...overrides });
function application(h, artifacts, store = new ExtensionsStore({ engine: h.engine })) {
    const app = express(); app.use(express.json({ limit: '1mb' }));
    app.use((req, res, next) => { req.user = { profile: { handle: req.headers['x-user'] ?? h.handle } }; res.set('x-atria-server-boot-id', boot); next(); });
    app.use('/api/native/extensions', createNativeExtensionsRouter({ store: () => store, artifacts }));
    app.use('/api/native/product', createNativeProductRouter(() => ({}), artifacts));
    app.use((error, _req, res, _next) => res.status(error.status ?? 500).json({ error: error.type ?? 'request-failed' }));
    return { app, store };
}
async function upload(app, bytes, input = metadata()) {
    const stage = (await request(app).post('/api/native/extensions/local/staging').send({ ...input, contentHash: sha(bytes), totalBytes: bytes.length }).expect(200)).body;
    const ref = stage.artifactRef;
    expect(stage.source).toEqual({ kind: 'extension-source-upload', bindingHash: hashNativeDocument(input) });
    for (let offset = 0; offset < bytes.length; offset += stage.maxChunkBytes) {
        const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + stage.maxChunkBytes));
        await request(app).put(`/api/native/product/artifacts/${ref.artifactId}/chunk`).query({ ...ref, offset })
            .set('Content-Type', 'application/octet-stream').set('x-atria-chunk-sha256', sha(chunk)).send(chunk).expect(200);
    }
    await request(app).post(`/api/native/product/artifacts/${ref.artifactId}/finalize`).send({ artifactRef: ref }).expect(200);
    return ref;
}
const prepare = (app, input, artifactRef) => request(app).post('/api/native/extensions/local/prepare-from-ref').send({ ...input, artifactRef });
const dispose = (app, ref) => request(app).delete('/api/native/product/artifacts/' + ref.artifactId).send({ artifactRef: ref }).expect(200);

describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('Extension source transport %s', (_kind, harness) => {
    test('exact 4 MiB inert UTF-8 crosses the shared raw lane, stays bounded and only installs disabled after independent review', async () => {
        const h = await harness(), artifacts = new NativeMcpArtifacts({ bootId: boot }), { app, store } = application(h, artifacts);
        try {
            const bytes = Buffer.from('/*' + '界'.repeat(Math.floor((4 * MiB - 4) / 3)) + ' '.repeat((4 * MiB - 4) % 3) + '*/');
            expect(bytes.length).toBe(4 * MiB);
            await request(app).post('/api/native/extensions/local/prepare').send({ ...metadata(), source: bytes.toString('utf8') }).expect(413);
            const ref = await upload(app, bytes), staged = await prepare(app, metadata(), ref).expect(200), row = staged.body;
            expect(Buffer.byteLength(staged.text)).toBeLessThan(3000); expect(row.files[0].bytes).toBe(bytes.length); expect(row.kind).toBe('local');
            expect(await store.list(h.handle)).toEqual([]);
            await dispose(app, ref); expect(artifacts.capacity.entries).toBe(0);
            const source = await request(app).get(`/api/native/extensions/preparations/${row.preparationId}/source`).query({ clientInstanceId: row.clientInstanceId,
                contentHash: row.contentHash, sourceCommit: 'null', targetsHash: row.targetsHash, path: 'index.js', offset: bytes.toString('utf8').length - 200, limit: 200 }).expect(200);
            expect(source.body.text).toBe(bytes.toString('utf8').slice(-200));
            const installed = (await request(app).post(`/api/native/extensions/preparations/${row.preparationId}/install`).send({ clientInstanceId: row.clientInstanceId,
                contentHash: row.contentHash, sourceCommit: null, targetsHash: row.targetsHash, expectedRevision: null }).expect(200)).body;
            expect(installed.enabled).toBe(false); expect((await store.get(h.handle, installed.id)).files['index.js']).toBe(bytes.toString('utf8'));
        } finally { artifacts.clear(); await h.cleanup(); }
    });

    test('owner, client, purpose, exact metadata, size, UTF-8 and final lock CAS are enforced before preparation', async () => {
        const h = await harness(), artifacts = new NativeMcpArtifacts({ bootId: boot }), { app, store } = application(h, artifacts);
        try {
            const bytes = Buffer.from('throw new Error("inert fixture");'), ref = await upload(app, bytes);
            await prepare(app, metadata(), ref).set('x-user', 'foreign').expect(404);
            await prepare(app, metadata({ clientInstanceId: 'foreign' }), ref).expect(400);
            for (const change of [{ name: 'Different approval' }, { targets: { ...targets, global: true } }]) await prepare(app, metadata(change), ref).expect(409);
            await prepare(app, { ...metadata(), extra: true }, ref).expect(400);
            const generic = artifacts.begin(h.handle, { clientInstanceId: 'extension-fixture', contentHash: sha(bytes), totalBytes: bytes.length }).artifactRef;
            artifacts.write(h.handle, generic, 0, bytes, sha(bytes)); artifacts.finalize(h.handle, generic);
            await prepare(app, metadata(), generic).expect(409);
            const badUtf8 = await upload(app, Buffer.from([0xc3, 0x28])); await prepare(app, metadata(), badUtf8).expect(400);
            await dispose(app, badUtf8);
            await request(app).post('/api/native/extensions/local/staging').send({ ...metadata(), contentHash: sha(bytes), totalBytes: 4 * MiB + 1 }).expect(400);
            await dispose(app, ref); await dispose(app, generic);
            const initial = await store.save(h.handle, { name: 'Base', kind: 'local', enabled: false, targets, entrypoint: 'index.js', files: { 'index.js': 'initial' } });
            const input = metadata({ id: initial.id, expectedRevision: initial.revision }), current = await upload(app, bytes, input);
            let release, entered;
            const started = new Promise(resolve => { entered = resolve; }), wait = new Promise(resolve => { release = resolve; });
            const held = withNativeResourceWrite(h.handle, 'extensions', async () => { entered(); await wait; }); await started;
            const { revision: _revision, ...replacement } = initial;
            const changed = store.save(h.handle, { ...replacement, files: { 'index.js': 'concurrent' }, contentHash: undefined }, initial.revision);
            const preparedPromise = prepare(app, input, current).then(response => response);
            release(); await held;
            await changed;
            expect((await preparedPromise).status).toBe(409);
            expect((await store.get(h.handle, initial.id)).files['index.js']).toBe('concurrent');
            await dispose(app, current);
        } finally { artifacts.clear(); await h.cleanup(); }
    });
});

describe.each(process.env.ATRIA_MCP_SOURCE ? [[process.env.ATRIA_MCP_SOURCE]] : [])('Real MCP large Extension adapter', plugin => {
    test('over 2 MiB uses the real helper without JSON source, keeps three approvals, and never retries a lost prepare receipt', async () => {
        const h = await makeTempFsEngineHarness(), artifacts = new NativeMcpArtifacts({ bootId: boot }), { app, store } = application(h, artifacts);
        try {
            const { registerExtensionActions } = await import(pathToFileURL(join(plugin, 'src/extension-actions.js')).href);
            const { ActionRegistry, PolicyCeiling, RiskExecutor } = await import(pathToFileURL(join(plugin, 'src/kernel.js')).href);
            const seen = []; let loseReceipt = false;
            const browser = { config: { url: 'http://localhost', timeout: 1000, maxResponseBytes: MiB }, start: async () => {}, runtimeIdentity: async () => ({ serverBootId: boot }),
                context: { request: { get: async () => ({ ok: () => true, headers: () => ({ 'content-type': 'application/json' }), body: async () => Buffer.from('{"token":"fixture"}'), dispose: async () => {} }),
                    fetch: async (url, options) => {
                        const parsed = new URL(url); seen.push({ path: parsed.pathname, data: options.data });
                        const call = request(app)[options.method.toLowerCase()](parsed.pathname + parsed.search).set(options.headers);
                        const result = await (options.data === undefined ? call : call.send(options.data));
                        if (loseReceipt && parsed.pathname.endsWith('/prepare-from-ref')) throw new Error('Simulated lost Native receipt');
                        return { ok: () => result.status < 400, status: () => result.status, headers: () => result.headers, body: async () => Buffer.from(result.text), dispose: async () => {} };
                    } } } };
            const registry = registerExtensionActions(new ActionRegistry(), browser), approvals = [];
            const executor = new RiskExecutor(registry, new PolicyCeiling(registry, registry.ids()), { approve: async evidence => { approvals.push(evidence); return { action: 'accept', content: { authorize: true } }; } });
            const source = '/*' + 'x'.repeat(2 * MiB + 7) + '*/', input = { name: 'Large real adapter', source, expectedRevision: null, targets };
            const result = await executor.execute('INTERACT', { action: 'extension.local.prepare', input }), row = result.result.data;
            expect(result.receipt.status).toBe('succeeded'); expect(approvals).toHaveLength(1); expect(artifacts.capacity.entries).toBe(0); expect(await store.list(h.handle)).toEqual([]);
            expect(seen.filter(item => !Buffer.isBuffer(item.data)).every(item => !JSON.stringify(item.data).includes('x'.repeat(100)))).toBe(true);
            expect(seen.filter(item => Buffer.isBuffer(item.data)).length).toBe(3);
            const review = await executor.execute('INTERACT', { action: 'extension.install.review', input: { preparationId: row.preparationId, expectedContentHash: row.contentHash, expectedSourceCommit: null, expectedTargetsHash: row.targetsHash } });
            const installed = await executor.execute('MUTATE', { action: 'extension.install', input: { preparationId: row.preparationId, reviewReceiptId: review.receipt.receiptId } });
            expect(installed.result.data.enabled).toBe(false); expect(approvals).toHaveLength(3);
            loseReceipt = true;
            const lost = await executor.execute('INTERACT', { action: 'extension.local.prepare', input: { ...input, name: 'Lost acknowledgement' } });
            expect(lost.receipt.status).toBe('indeterminate'); expect(lost.error).toContain('lost Native receipt');
            expect(seen.filter(item => item.path.endsWith('/prepare-from-ref'))).toHaveLength(2); expect(artifacts.capacity.entries).toBe(0); expect(await store.list(h.handle)).toHaveLength(1);
            expect(JSON.stringify(approvals)).not.toContain('x'.repeat(100));
        } finally { artifacts.clear(); await h.cleanup(); }
    });
});
