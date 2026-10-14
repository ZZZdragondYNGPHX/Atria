import express from 'express';
import request from 'supertest';
import { describe, expect, jest, test } from '@jest/globals';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { services, sessionFixture } from './helpers/session-fixture.js';
import { buildAtriaPackageContainer } from '../../src/native/package-container.js';
import { NativeSessionArchiveAuthority } from '../../src/native/session-archive-authority.js';
import { NativeMcpArtifacts } from '../../src/native/mcp-artifacts.js';
import { createNativeProductRouter } from '../../src/endpoints/native-product.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { SecretManager, SECRET_KEYS, SECRETS_FILE } from '../../src/endpoints/secrets.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const productFor = f => ({ _saveSystem: f.saveSystem, preflightSaveImport: (...args) => f.saveSystem.preflightImport(...args),
    exportSession: async (...args) => (await f.saveSystem.exportSession(...args)).archive,
    exportSnapshot: async (...args) => (await f.saveSystem.exportSnapshot(...args)).archive,
    importSave: (...args) => f.saveSystem.importSave(...args),
    observeSession: async (handle, sessionId) => ({ session: await f.sessionRepo.get(handle, sessionId), saves: await f.savePointRepo.list(handle, sessionId), snapshot: await f.core.observe(handle, sessionId) }) });
async function setup(make, large = false) {
    const source = await make(), target = await make(), spec = sessionFixture();
    const f = services(source), next = services(target);
    const { archive } = buildAtriaPackageContainer({ manifest: spec.manifest, sourceFiles: new Map(), assetPayloads: new Map() });
    await f.packageInstaller.install(source.handle, archive); await next.packageInstaller.install(target.handle, archive);
    let snapshot = await f.core.create(source.handle, { packageId: spec.manifest.packageId, packageVersionId: spec.manifest.packageVersionId, entryPointId: spec.entryPointId });
    if (large) {
        const bytes = randomBytes(2 * 1024 * 1024 + 7), assetId = createNativeId('asset');
        await f.assetStore.put(source.handle, { assetId, contentHash: sha(bytes), size: bytes.length, mediaType: 'application/octet-stream', logicalName: 'fixture.bin' }, bytes);
        snapshot = await f.core.appendTimeline(source.handle, snapshot.session.sessionId, { role: 'user', content: 'Fixture attachment', metadata: { attachments: [{ assetId }] } });
    }
    const artifacts = new NativeMcpArtifacts(), product = productFor(f), targetProduct = productFor(next);
    return { source, target, f, next, snapshot, artifacts, product, targetProduct,
        async cleanup() { artifacts.clear(); await source.cleanup(); await target.cleanup(); } };
}
for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    test(`${kind}: exact Native Archive export, multi-chunk import, target CAS and purpose isolation preserve original closure`, async () => {
        const h = await setup(make, true);
        try {
            const authority = new NativeSessionArchiveAuthority({ product: h.product, artifacts: h.artifacts });
            const stage = await authority.export(h.source.handle, { sessionId: h.snapshot.session.sessionId, expectedRevisionId: h.snapshot.revision.revisionId, clientInstanceId: 'archive-fixture' });
            expect(stage.artifactRef.totalBytes).toBeGreaterThan(1024 * 1024); expect(JSON.stringify(stage).length).toBeLessThan(2000);
            const chunks = [];
            for (let offset = 0; offset < stage.artifactRef.totalBytes; offset += h.artifacts.maxChunkBytes) chunks.push(h.artifacts.readChunk(h.source.handle, stage.artifactRef, offset, Math.min(h.artifacts.maxChunkBytes, stage.artifactRef.totalBytes - offset)).bytes);
            const bytes = Buffer.concat(chunks); expect(sha(bytes)).toBe(stage.artifactRef.contentHash);
            const upload = h.artifacts.beginSessionArchive(h.target.handle, { clientInstanceId: 'target-fixture', contentHash: sha(bytes), totalBytes: bytes.length });
            for (let offset = 0; offset < bytes.length; offset += h.artifacts.maxChunkBytes) { const chunk = bytes.subarray(offset, offset + h.artifacts.maxChunkBytes); h.artifacts.write(h.target.handle, upload.artifactRef, offset, chunk, sha(chunk)); }
            h.artifacts.finalize(h.target.handle, upload.artifactRef);
            const importing = new NativeSessionArchiveAuthority({ product: h.targetProduct, artifacts: h.artifacts });
            const view = await importing.preflight(h.target.handle, upload.artifactRef);
            expect(view.preflight.dependency.status).toBe('ready'); expect(view.target).toBeNull();
            const restored = await importing.import(h.target.handle, { artifactRef: upload.artifactRef, expectedPreflightFingerprint: hashNativeDocument(view) });
            expect(restored.revision.revisionId).toBe(h.snapshot.revision.revisionId); expect(restored.timeline).toEqual(h.snapshot.timeline);
            await expect(importing.import(h.target.handle, { artifactRef: upload.artifactRef, expectedPreflightFingerprint: hashNativeDocument(view) })).rejects.toThrow('native_save_preflight_conflict');
            const packageStage = h.artifacts.captureBuild(h.target.handle, 'package-client', 'project', 'revision', bytes);
            await expect(importing.preflight(h.target.handle, packageStage.artifactRef)).rejects.toThrow('native_artifact_purpose_conflict');
            const encrypted = await h.f.saveSystem.exportSession(h.source.handle, h.snapshot.session.sessionId, { password: 'synthetic-only-password' });
            const locked = h.artifacts.captureSessionArchive(h.source.handle, 'locked', h.snapshot.session.sessionId, h.snapshot.revision.revisionId, null, encrypted.archive);
            const lockedView = await authority.preflight(h.source.handle, locked.artifactRef);
            expect(lockedView.preflight.protection.requiresPassword).toBe(true);
            await expect(authority.import(h.source.handle, { artifactRef: locked.artifactRef, expectedPreflightFingerprint: hashNativeDocument(lockedView) })).rejects.toThrow('native_save_trusted_password_required');
        } finally { await h.cleanup(); }
    }, 60000);

    test(`${kind}: encrypted Native Archive uses immutable dedicated SecretRefs only at effect boundaries`, async () => {
        const h = await setup(make), password = 'synthetic-save-password-never-in-transport'; let reads;
        try {
            const appFor = (product, directories) => {
                const app = express(); app.use(express.json());
                app.use((req, res, next) => { req.user = { profile: { handle: req.headers['x-owner'] || h.source.handle }, directories };
                    res.set('x-atria-server-boot-id', h.artifacts.bootId); next(); });
                app.use('/product', createNativeProductRouter(() => ({ product }), h.artifacts)); return app;
            };
            const sourceApp = appFor(h.product, h.source.dirs), targetApp = appFor(h.targetProduct, h.target.dirs);
            expect(existsSync(join(h.source.dirs.root, SECRETS_FILE))).toBe(false);
            const empty = await request(sourceApp).get('/product/save-archives/password-references').expect(200);
            expect(empty.body.passwordSecretRefs).toEqual([]); expect(existsSync(join(h.source.dirs.root, SECRETS_FILE))).toBe(false);
            const sourceSecrets = new SecretManager(h.source.dirs), targetSecrets = new SecretManager(h.target.dirs);
            const secretId = sourceSecrets.writeSecret(SECRET_KEYS.ATRIA_SAVE_PASSWORD, password, 'Dedicated Archive fixture');
            const targetSecretId = targetSecrets.writeSecret(SECRET_KEYS.ATRIA_SAVE_PASSWORD, password, 'Target Archive fixture');
            const providerId = sourceSecrets.writeSecret(SECRET_KEYS.ATRIA_RUNTIME, 'synthetic-provider-credential', 'Provider fixture');
            expect(sourceSecrets.listReferences().map(ref => ref.secretId)).toEqual([providerId]);
            const passwordSecretRef = { secretId, scope: 'player' }, targetRef = { secretId: targetSecretId, scope: 'player' };
            const inventory = await request(sourceApp).get('/product/save-archives/password-references').expect(200);
            expect(inventory.body.passwordSecretRefs).toEqual([passwordSecretRef]);
            reads = jest.spyOn(SecretManager.prototype, 'readSecret');
            const input = { sessionId: h.snapshot.session.sessionId, expectedRevisionId: h.snapshot.revision.revisionId, clientInstanceId: 'encrypted-fixture' };
            await request(sourceApp).post('/product/save-archives/export').send({ ...input, password: password }).expect(400);
            await request(sourceApp).post('/product/save-archives/export').send({ ...input, passwordSecretRef: { secretId: providerId, scope: 'player' } }).expect(409);
            expect(reads.mock.calls.every(call => call[0] === SECRET_KEYS.ATRIA_SAVE_PASSWORD)).toBe(true); reads.mockClear();
            const exported = await request(sourceApp).post('/product/save-archives/export').send({ ...input, passwordSecretRef }).expect(200);
            expect(reads).toHaveBeenCalledTimes(1); reads.mockClear();
            const stage = exported.body;
            const bytes = await h.artifacts.withSessionArchive(h.source.handle, stage.artifactRef, archive => Buffer.from(archive));
            expect(bytes.includes(Buffer.from(password))).toBe(false);
            const upload = h.artifacts.beginSessionArchive(h.target.handle, { clientInstanceId: 'encrypted-target', contentHash: sha(bytes), totalBytes: bytes.length });
            for (let offset = 0; offset < bytes.length; offset += h.artifacts.maxChunkBytes) { const chunk = bytes.subarray(offset, offset + h.artifacts.maxChunkBytes); h.artifacts.write(h.target.handle, upload.artifactRef, offset, chunk, sha(chunk)); }
            h.artifacts.finalize(h.target.handle, upload.artifactRef);
            const inspected = await request(targetApp).post('/product/save-archives/preflight').send({ artifactRef: upload.artifactRef }).expect(200);
            expect(inspected.body.preflight.protection.requiresPassword).toBe(true); expect(reads).not.toHaveBeenCalled();
            const importInput = { artifactRef: upload.artifactRef, expectedPreflightFingerprint: hashNativeDocument(inspected.body) };
            await request(targetApp).post('/product/save-archives/import').send({ ...importInput, passwordSecretRef }).expect(409);
            await request(targetApp).post('/product/save-archives/import').set('x-owner', 'foreign-owner').send({ ...importInput, passwordSecretRef: targetRef }).expect(404);
            const restored = await request(targetApp).post('/product/save-archives/import').send({ ...importInput, passwordSecretRef: targetRef }).expect(200);
            expect(restored.body.revisionId).toBe(h.snapshot.revision.revisionId);
            const publicEvidence = JSON.stringify([empty.body, inventory.body, stage, inspected.body, restored.body]);
            expect(publicEvidence).not.toContain(password); expect(publicEvidence).not.toContain(sha(Buffer.from(password)));
            reads.mockRestore(); reads = null;
            sourceSecrets.renameSecret(SECRET_KEYS.ATRIA_SAVE_PASSWORD, secretId, 'Changed label'); sourceSecrets.rotateSecret(SECRET_KEYS.ATRIA_SAVE_PASSWORD, secretId);
            const changedId = sourceSecrets.writeSecret(SECRET_KEYS.ATRIA_SAVE_PASSWORD, 'replacement-value', 'Replacement');
            expect(changedId).not.toBe(secretId); expect(sourceSecrets.readSecret(SECRET_KEYS.ATRIA_SAVE_PASSWORD, secretId)).toBe(password);
        } finally { reads?.mockRestore(); await h.cleanup(); }
    }, 60000);
}

const integration = process.env.ATRIA_MCP_SOURCE ? describe : describe.skip;
integration('optional cross-workspace Session Archive adapter', () => {
    test('real MCP development Archive capture → bounded Native chunks → separate import approval; lost ACK does not resend', async () => {
        const h = await setup(makeTempFsEngineHarness, true); let operations;
        try {
            const root = process.env.ATRIA_MCP_SOURCE;
            const { registerSessionArchiveActions } = await import(pathToFileURL(join(root, 'src/session-archive-actions.js')).href);
            const { RepositoryAccessPolicy } = await import(pathToFileURL(join(root, 'src/repository.js')).href);
            const { ActionRegistry, PolicyCeiling, RiskExecutor } = await import(pathToFileURL(join(root, 'src/kernel.js')).href);
            const { OperationJournal, Operations } = await import(pathToFileURL(join(root, 'src/operations.js')).href);
            const journal = await new OperationJournal({ directory: join(h.source.dataRoot, 'archive-operation-journal-fixture'), owner: h.target.handle })
                .init({ forbiddenRoots: [h.source.dirs.root, h.target.dirs.root, root] });
            operations = new Operations({ journal });
            const password = 'synthetic-cross-workspace-archive-password';
            const secretId = new SecretManager(h.target.dirs).writeSecret(SECRET_KEYS.ATRIA_SAVE_PASSWORD, password, 'MCP Archive fixture');
            const passwordSecretRef = { secretId, scope: 'player' };
            const exported = await h.f.saveSystem.exportSession(h.source.handle, h.snapshot.session.sessionId, { password });
            await mkdir(join(h.target.dirs.root, '.artifacts'), { recursive: true }); await writeFile(join(h.target.dirs.root, '.artifacts/fixture.atriasave'), exported.archive);
            const app = express(); app.use(express.json({ limit: '1mb' })); app.use((req, res, next) => { req.user = { profile: { handle: h.target.handle }, directories: h.target.dirs }; res.set('x-atria-server-boot-id', h.artifacts.bootId); next(); });
            app.use('/api/native/product', createNativeProductRouter(() => ({ product: h.targetProduct }), h.artifacts));
            let imports = 0; const approvals = [], transportRecords = [];
            const browser = { config: { url: 'http://localhost', timeout: 1000, maxResponseBytes: 1048576 }, start: async () => {}, runtimeIdentity: async () => ({ mutationGuards: 1, serverBootId: h.artifacts.bootId }),
                context: { request: { get: async () => ({ ok: () => true, status: () => 200, headers: () => ({ 'content-type': 'application/json' }), body: async () => Buffer.from('{"token":"fixture"}'), dispose: async () => {} }),
                    fetch: async (url, options) => {
                        transportRecords.push({ url, options });
                        const parsed = new URL(url), path = parsed.pathname + parsed.search, method = options.method.toLowerCase();
                        const call = request(app)[method](path).set(options.headers), result = await (method === 'get' ? call : call.send(options.data));
                        if (parsed.pathname.endsWith('/save-archives/import') && result.status === 200) { imports++; throw new Error('Accepted import; acknowledgement lost'); }
                        return { ok: () => result.status < 400, status: () => result.status, headers: () => result.headers,
                            body: async () => Buffer.isBuffer(result.body) ? result.body : Buffer.from(result.text), dispose: async () => {} };
                    } } } };
            const repository = { refreshRuntimeRoots: async () => {}, policy: new RepositoryAccessPolicy(h.target.dirs.root) };
            const registry = registerSessionArchiveActions(new ActionRegistry(), browser, repository);
            const executor = new RiskExecutor(registry, new PolicyCeiling(registry, registry.ids()), { operations, approve: async value => { approvals.push(value); return { action: 'accept', content: { authorize: true, uses: 1 } }; } });
            const inventory = await executor.execute('READ', { action: 'session.archive.passwords', input: {} });
            expect(inventory.data.passwordSecretRefs).toEqual([passwordSecretRef]);
            await expect(executor.execute('INTERACT', { action: 'session.archive.export', input: { sessionId: h.snapshot.session.sessionId,
                expectedRevisionId: h.snapshot.revision.revisionId, password } })).rejects.toThrow();
            const capture = await executor.execute('INTERACT', { action: 'session.archive.capture', input: { path: '.artifacts/fixture.atriasave' } });
            expect(capture.receipt.status).toBe('succeeded'); expect(capture.result.artifact.purpose).toBe('session-archive');
            expect(JSON.stringify(capture)).not.toContain(exported.archive.toString('base64'));
            const binaryHandleId = capture.result.artifact.binaryHandleId;
            const preflight = await executor.execute('READ', { action: 'session.archive.preflight', input: { binaryHandleId } });
            expect(approvals).toHaveLength(1); expect(preflight.data.preflight.protection.keyMode).toBe('password-scrypt-v1');
            const importInput = { binaryHandleId, expectedPreflightFingerprint: preflight.preflightFingerprint, passwordSecretRef };
            const result = await executor.execute('MUTATE', { action: 'session.archive.import', input: importInput });
            expect(result.receipt.status).toBe('indeterminate'); expect(imports).toBe(1); expect(approvals).toHaveLength(2);
            expect((await h.next.core.observe(h.target.handle, h.snapshot.session.sessionId)).revision.revisionId).toBe(h.snapshot.revision.revisionId);
            await expect(executor.execute('MUTATE', { action: 'session.archive.import', input: importInput })).rejects.toThrow('dependency or target changed');
            expect(imports).toBe(1);
            const capturedExport = await executor.execute('INTERACT', { action: 'session.archive.export', input: { sessionId: h.snapshot.session.sessionId, expectedRevisionId: h.snapshot.revision.revisionId, passwordSecretRef } });
            expect(capturedExport.receipt.status).toBe('succeeded'); expect(capturedExport.result.artifact.sourceScope.sessionId).toBe(h.snapshot.session.sessionId);
            expect(capturedExport.result.artifact.sourceRevision).toBe(h.snapshot.revision.revisionId); expect(approvals).toHaveLength(3);
            const exportedView = await executor.execute('READ', { action: 'session.archive.preflight', input: { binaryHandleId: capturedExport.result.artifact.binaryHandleId } });
            expect(exportedView.data.preflight.protection.keyMode).toBe('password-scrypt-v1');
            await journal.flush(); const journalText = await readFile(join(journal.directory, 'operations.json'), 'utf8');
            const publicEvidence = JSON.stringify([inventory, capture, preflight, result, capturedExport, exportedView, approvals, transportRecords, operations.list(), journalText]);
            expect(publicEvidence).not.toContain(password); expect(publicEvidence).not.toContain(sha(Buffer.from(password)));
            expect(journalText).not.toContain(secretId);
            expect(transportRecords.filter(row => row.url.endsWith('/save-archives/preflight')).every(row => !JSON.stringify(row.options.data).includes(secretId))).toBe(true);
        } finally { await operations?.close(); await h.cleanup(); }
    }, 60000);
});
