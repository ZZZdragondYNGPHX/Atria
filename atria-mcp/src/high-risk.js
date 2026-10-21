import { randomUUID, createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { z } from 'zod';
import { fingerprint } from './kernel.js';
import { requestAuthority } from './read-authority.js';
import { redact } from './policy.js';
import { BinaryAssets } from './binary-assets.js';

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const studio = '/api/native/studio', product = '/api/native/product';
const ref = z.strictObject({ scope: z.literal('library'), resourceType: z.enum(['core.world', 'core.knowledge']), resourceId: id, revision: id });
const owned = { creatingReceiptId: z.string().uuid() };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

// Bytes never enter model output or receipts. Handles expire with this server instance.
export class PackageArtifacts {
    #items = new Map();
    constructor({ now = Date.now, clientInstanceId = randomUUID() } = {}) {
        this.now = now; this.clientInstanceId = clientInstanceId;
        this.binary = new BinaryAssets({ now, maxEntries: 4 });
    }
    #begin(stage, source) {
        const parsed = stageSchema.parse(stage), ref = parsed.artifactRef;
        if (ref.clientInstanceId !== this.clientInstanceId || parsed.state !== 'complete' || parsed.receivedBytes !== ref.totalBytes
            || parsed.source.kind === 'studio-project' && parsed.source.revision !== ref.sourceRevision
            || parsed.source.kind === 'installed-package' && parsed.source.packageVersionId !== ref.sourceRevision) throw new Error('Native artifact client, source or completion mismatch.');
        const binding = { owner: parsed.owner, clientInstanceId: this.clientInstanceId, purpose: 'package-archive',
            sourceAuthority: parsed.source.kind === 'studio-project' ? 'native.studio.package' : parsed.source.kind === 'installed-package' ? 'native.asset' : 'dev.package',
            sourceScope: parsed.source.kind === 'studio-project' ? { projectId: parsed.source.projectId } : parsed.source.kind === 'installed-package'
                ? { packageId: parsed.source.packageId, packageVersionId: parsed.source.packageVersionId } : { contentHash: ref.contentHash },
            sourceRevision: ref.sourceRevision, allowedOperations: ['inspect', 'read', 'package.preflight', 'package.install'] };
        for (const [key, item] of this.#items) if (item.expiresAt <= this.now()) this.#items.delete(key);
        const handle = this.binary.begin({ binding, contentHash: ref.contentHash, totalBytes: ref.totalBytes,
            mediaType: 'application/octet-stream', ttlMs: Math.min(900000, parsed.expiresAt - this.now()) });
        return { handle, binding, source, nativeRef: ref };
    }
    #complete(item) {
        const complete = this.binary.finalize(item.handle.handleId, { binding: item.binding });
        const metadata = { artifactId: complete.handleId, contentHash: complete.contentHash, size: complete.totalBytes,
            source: item.source, expiresAt: complete.expiresAt };
        this.#items.set(metadata.artifactId, { ...metadata, binding: item.binding, nativeRef: item.nativeRef });
        return metadata;
    }
    put(bytes, source, stage) {
        const item = this.#begin(stage, source);
        try {
            for (let offset = 0; offset < bytes.length; offset += this.binary.maxChunkBytes) {
                const chunk = bytes.subarray(offset, offset + this.binary.maxChunkBytes);
                this.binary.writeChunk(item.handle.handleId, { binding: item.binding, offset, bytes: chunk, chunkHash: sha(chunk) });
            }
            return this.#complete(item);
        } catch (error) { this.binary.cancel(item.handle.handleId, { binding: item.binding }); throw error; }
    }
    async fromNative(stage, source, loadChunk) {
        const item = this.#begin(stage, source);
        try {
            const chunkSize = Math.min(this.binary.maxChunkBytes, stage.maxChunkBytes);
            for (let offset = 0; offset < stage.artifactRef.totalBytes; offset += chunkSize) {
                const length = Math.min(chunkSize, stage.artifactRef.totalBytes - offset);
                const bytes = await loadChunk(offset, length);
                if (!Buffer.isBuffer(bytes) || bytes.length !== length) throw new Error('Native artifact chunk length mismatch.');
                this.binary.writeChunk(item.handle.handleId, { binding: item.binding, offset, bytes, chunkHash: sha(bytes) });
            }
            return this.#complete(item);
        } catch (error) { this.binary.cancel(item.handle.handleId, { binding: item.binding }); throw error; }
    }
    get(artifactId) {
        const value = this.#items.get(artifactId);
        if (!value || value.expiresAt <= this.now()) throw new Error('Unknown or expired Package artifact handle.');
        this.binary.inspect(artifactId, { binding: value.binding });
        return structuredClone(value);
    }
    clear() { this.binary.clear(); this.#items.clear(); }
}

const nativeRefSchema = z.strictObject({ artifactId: z.string().uuid(), contentHash: digest, totalBytes: z.number().int().min(1).max(128 * 1024 * 1024),
    sourceRevision: id, clientInstanceId: id, serverBootId: z.string().uuid() });
const stageSchema = z.strictObject({ artifactRef: nativeRefSchema, owner: z.string().min(1).max(256),
    source: z.union([z.strictObject({ kind: z.literal('studio-project'), projectId: id, revision: id }), z.strictObject({ kind: z.literal('development-upload') }),
        z.strictObject({ kind: z.literal('installed-package'), packageId: id, packageVersionId: id })]),
    mediaType: z.literal('application/octet-stream'), expiresAt: z.number().int(), receivedBytes: z.number().int().min(0),
    state: z.enum(['receiving', 'complete']), maxChunkBytes: z.number().int().min(1).max(1024 * 1024) });

// Private fixed transport. Never accepts a caller-controlled URL or emits bytes.
export async function artifactChunk(browser, stage, offset, length, bytes = null, metadataSchema = stageSchema) {
    const ref = nativeRefSchema.parse(stage.artifactRef);
    const url = new URL(`${product}/artifacts/${ref.artifactId}/chunk`, browser.config.url);
    for (const [key, value] of Object.entries(ref)) if (key !== 'artifactId') url.searchParams.set(key, String(value));
    url.searchParams.set('offset', String(offset));
    if (!bytes) url.searchParams.set('length', String(length));
    const headers = { 'x-atria-expected-server-boot-id': ref.serverBootId, Accept: bytes ? 'application/json' : 'application/octet-stream' };
    await browser.start();
    if (bytes) {
        headers['Content-Type'] = 'application/octet-stream'; headers['x-atria-chunk-sha256'] = sha(bytes);
        const csrf = await browser.context.request.get(browser.config.url + '/csrf-token', { maxRedirects: 0, timeout: browser.config.timeout });
        try {
            if (!csrf.ok() || !(csrf.headers()['content-type'] ?? '').includes('json')) throw new Error('CSRF unavailable.');
            const data = await csrf.body(); if (data.length > 8192) throw new Error('Invalid CSRF response.');
            const token = JSON.parse(data.toString()).token;
            if (typeof token !== 'string' || token.length > 4096) throw new Error('Invalid CSRF response.');
            headers['x-csrf-token'] = token;
        } finally { await csrf.dispose(); }
    }
    const response = await browser.context.request.fetch(url.href, { method: bytes ? 'PUT' : 'GET', headers, ...(bytes ? { data: bytes } : {}), maxRedirects: 0, timeout: browser.config.timeout });
    try {
        const responseHeaders = response.headers(), bound = bytes ? 16000 : length;
        if (!response.ok() || responseHeaders['x-atria-server-boot-id'] !== ref.serverBootId || Number(responseHeaders['content-length']) > bound) throw new Error('Native artifact transport unavailable or changed.');
        const payload = await response.body(); if (payload.length > bound) throw new Error('Native artifact chunk exceeds bound.');
        if (bytes) {
            if (!(responseHeaders['content-type'] ?? '').includes('json')) throw new Error('Native staging response must be JSON metadata.');
            const metadata = metadataSchema.parse(JSON.parse(payload.toString()));
            if (fingerprint(metadata.artifactRef) !== fingerprint(ref) || metadata.receivedBytes !== offset + bytes.length) throw new Error('Native staging binding mismatch.');
            return metadata;
        }
        if (response.status() !== 206 || !/application\/octet-stream/.test(responseHeaders['content-type'] ?? '') || payload.length !== length
            || responseHeaders['x-atria-chunk-sha256'] !== sha(payload) || responseHeaders['etag'] !== '"' + ref.contentHash + '"'
            || responseHeaders['content-range'] !== `bytes ${offset}-${offset + length - 1}/${ref.totalBytes}`) throw new Error('Native artifact chunk integrity mismatch.');
        return payload;
    } finally { await response.dispose(); }
}

export function registerHighRiskActions(registry, browser, repository, artifacts = new PackageArtifacts()) {
    const call = (method, path, input = {}, guards = {}) => requestAuthority(browser, method, path, input, guards);
    const read = async (method, path, input = {}) => {
        const r = await call(method, path, input);
        if (!r.ok || !r.serverBootId) throw new Error('High-risk authority unavailable: ' + r.status);
        return r;
    };
    const add = (action, risk, shape, guard, handler, effects = []) => registry.register({ version: 1, id: action, domain: action.split('.')[0], title: action,
        risk, authority: 'Native Studio / Product owning authority', adapter: 'fixed-http', externalEffects: effects,
        guards: risk === 'READ' ? [] : ['exact-target', 'current-server-boot', 'double-check', 'reference-safety'],
        approval: risk === 'READ' ? 'none' : 'trusted-approval-required', availability: { available: true, reason: 'Exact authority, policy and trusted approval required for effects' } },
    z.strictObject(shape), z.json(), handler, risk === 'READ' ? null : async (i, c) => {
        if ((await browser.runtimeIdentity())?.highRiskGuards !== 1) throw new Error('Product high-risk guards unavailable.');
        return guard(i, c);
    });
    const result = (r, evidence = {}) => ({ ok: r.ok && r.data?.deleted !== false, status: r.status, data: redact(r.data), receiptEvidence: r.ok ? evidence : {} });
    const ownership = (i, c, kind, objectId, boot, revision) => {
        const receipt = c.receipts.get(i.creatingReceiptId);
        if (!receipt || receipt.status !== 'succeeded' || receipt.provenance?.serverBootId !== boot
            || !receipt.created?.some(o => o.kind === kind && o.id === objectId && o.mcpInstanceId === c.receipts.instanceId && o.creatingReceiptId === receipt.receiptId && o.initialRevision === revision)) {
            throw new Error('Cleanup requires a current successful creating receipt from this MCP instance.');
        }
        return { creatingReceiptId: receipt.receiptId, mcpInstanceId: c.receipts.instanceId };
    };
    const projectGuard = async i => {
        const r = await read('GET', `${studio}/projects/${i.projectId}/revision`);
        if (r.data.revision !== i.baseRevision) throw new Error('Project baseRevision conflict.');
        return { target: { projectId: i.projectId }, serverBootId: r.serverBootId, baseRevision: i.baseRevision };
    };
    const sessionGuard = async i => {
        const r = await read('GET', `${product}/sessions/${i.sessionId}/observe`);
        if (r.data.session.headRevisionId !== i.expectedRevisionId) throw new Error('Session revision conflict.');
        return { target: { sessionId: i.sessionId }, serverBootId: r.serverBootId, expectedRevisionId: i.expectedRevisionId, contentHash: fingerprint(r.data) };
    };
    for (const [action, kind, key, shape, guard, path, body] of [
        ['session.delete', 'session', 'sessionId', { sessionId: id, expectedRevisionId: id }, sessionGuard, i => `${product}/sessions/${i.sessionId}`, i => ({ expectedRevisionId: i.expectedRevisionId })],
        ['build.project.delete', 'project', 'projectId', { projectId: id, baseRevision: id }, projectGuard, i => `${studio}/projects/${i.projectId}`, i => ({ baseRevision: i.baseRevision })],
    ]) for (const cleanup of [false, true]) add(cleanup ? action + '.owned' : action, 'DESTRUCTIVE', { ...shape, ...(cleanup ? owned : {}) }, async (i, c) => {
        const before = await guard(i);
        return { ...before, ...(cleanup ? { ownership: ownership(i, c, kind, i[key], before.serverBootId, before.baseRevision ?? before.expectedRevisionId) } : {}) };
    }, async (i, { before }) => result(await call('DELETE', path(i), body(i), before), {
        changed: [{ kind, id: i[key], lifecycle: 'trashed' }], recovery: 'Inspect the original Storage Center recovery/task receipt. Eligible content is retained for 30 days; restore uses the original identity and dependency checks. Never automatically retry unknown deletion.' }));

    add('work.delete', 'DESTRUCTIVE', { packageId: id, baseVersionId: id }, async i => {
        const r = await read('GET', `${product}/works/${i.packageId}`);
        const sessions = await read('GET', `${product}/sessions`, { packageId: i.packageId });
        if (r.serverBootId !== sessions.serverBootId) throw new Error('Server changed during delete safety.');
        if (r.data.package.currentVersionId !== i.baseVersionId) throw new Error('Work version conflict.');
        if (!Array.isArray(sessions.data) || sessions.data.length) throw new Error('Work has dependent Sessions; resolve each through explicit Session authority.');
        return { target: { packageId: i.packageId }, serverBootId: r.serverBootId, baseVersionId: i.baseVersionId, dependentSessions: [] };
    }, async (i, { before }) => result(await call('DELETE', `${product}/works/${i.packageId}`, { baseVersionId: i.baseVersionId }, before), {
        changed: [{ kind: 'work', id: i.packageId, lifecycle: 'trashed' }],
        recovery: 'Original Storage Center recovery retains eligible Work content for 30 days. Inspect dependencies and recovery identity before restore or separate permanent purge.' }));

    add('library.revision.delete', 'DESTRUCTIVE', { ref }, async i => {
        const r = await read('POST', `${studio}/resources/delete-safety`, i.ref);
        if (r.data.safe !== true) throw new Error('Library revision referenced; force deletion is unavailable.');
        return { target: i.ref, serverBootId: r.serverBootId, safety: r.data };
    }, async (i, { before }) => result(await call('DELETE', `${studio}/library/resources/revisions`, i, before), { deleted: [{ kind: 'library-revision', ...i.ref }] }));

    const capture = async i => {
        if (!i.path.endsWith('.atria')) throw new Error('Expected .atria development artifact.');
        await repository.refreshRuntimeRoots();
        const file = await repository.policy.file(i.path, true), handle = await open(file, 'r');
        try {
            const stat = await handle.stat();
            if (!stat.isFile() || !stat.size || stat.size > 128 * 1024 * 1024) throw new Error('Artifact exceeds bound.');
            const bytes = await handle.readFile();
            if (bytes.length !== stat.size) throw new Error('Development artifact changed during capture.');
            return bytes;
        } finally { await handle.close(); }
    };
    add('package.artifact.capture', 'INTERACT', { path: z.string().min(1).max(512) }, async i => {
        const bytes = await capture(i), runtime = await browser.runtimeIdentity();
        if (!runtime?.serverBootId) throw new Error('Native artifact authority unavailable.');
        return { target: { path: i.path }, contentHash: sha(bytes), size: bytes.length, serverBootId: runtime.serverBootId };
    }, async (i, { before }) => {
        const bytes = await capture(i);
        if (sha(bytes) !== before.contentHash || bytes.length !== before.size) throw new Error('Development artifact changed.');
        const started = await read('POST', `${product}/artifacts/staging`, { clientInstanceId: artifacts.clientInstanceId, contentHash: before.contentHash, totalBytes: bytes.length });
        const stage = stageSchema.parse(started.data);
        if (started.serverBootId !== before.serverBootId || stage.artifactRef.serverBootId !== before.serverBootId) throw new Error('Native staging boot changed.');
        for (let offset = 0; offset < bytes.length; offset += stage.maxChunkBytes) {
            const chunk = bytes.subarray(offset, offset + stage.maxChunkBytes);
            await artifactChunk(browser, stage, offset, chunk.length, chunk);
        }
        const finalized = await read('POST', `${product}/artifacts/${stage.artifactRef.artifactId}/finalize`, { artifactRef: stage.artifactRef });
        const artifact = artifacts.put(bytes, { path: i.path, serverBootId: before.serverBootId }, finalized.data);
        return { ok: true, artifact, receiptEvidence: { after: artifact } };
    }, ['native-temporary-staging', 'same-origin-binary-transfer']);
    add('build.package.create', 'INTERACT', { projectId: id, baseRevision: id }, projectGuard, async (i, { before }) => {
        const r = await call('POST', `${studio}/projects/${i.projectId}/build-artifact`, { baseRevision: i.baseRevision, clientInstanceId: artifacts.clientInstanceId }, before);
        if (!r.ok) return result(r);
        const stage = stageSchema.parse(r.data.artifact);
        if (r.serverBootId !== before.serverBootId || stage.artifactRef.serverBootId !== before.serverBootId || stage.artifactRef.sourceRevision !== i.baseRevision
            || stage.source.kind !== 'studio-project' || stage.source.projectId !== i.projectId || stage.source.revision !== i.baseRevision) throw new Error('Native build artifact source mismatch.');
        const artifact = await artifacts.fromNative(stage, { projectId: i.projectId, baseRevision: i.baseRevision, serverBootId: before.serverBootId },
            (offset, length) => artifactChunk(browser, stage, offset, length));
        return { ok: true, artifact, manifest: redact(r.data.manifest), receiptEvidence: { after: artifact } };
    });
    add('package.artifact.inspect', 'READ', { artifactId: z.string().uuid() }, null, async i => { const { binding: _, nativeRef: __, ...metadata } = artifacts.get(i.artifactId); return metadata; });
    add('package.version.export', 'INTERACT', { packageId: id, packageVersionId: id, expectedContentHash: digest }, async i => {
        const response = await read('GET', `${product}/works/${i.packageId}/versions/${i.packageVersionId}/identity`), version = response.data.packageVersion;
        if (!version || version.packageId !== i.packageId || version.packageVersionId !== i.packageVersionId || version.packageContentHash !== i.expectedContentHash) throw new Error('Exact installed PackageVersion hash required.');
        return { target: { packageId: i.packageId, packageVersionId: i.packageVersionId }, serverBootId: response.serverBootId, contentHash: version.packageContentHash };
    }, async (i, { before }) => {
        const response = await call('POST', `${product}/packages/export-artifact`, { ...i, clientInstanceId: artifacts.clientInstanceId }, before), stage = stageSchema.parse(response.data);
        if (!response.ok || response.serverBootId !== before.serverBootId || stage.artifactRef.serverBootId !== before.serverBootId
            || stage.artifactRef.contentHash !== i.expectedContentHash || stage.source.kind !== 'installed-package' || stage.source.packageId !== i.packageId
            || stage.source.packageVersionId !== i.packageVersionId) throw new Error('Native installed Package export binding changed.');
        const artifact = await artifacts.fromNative(stage, { packageId: i.packageId, packageVersionId: i.packageVersionId, serverBootId: before.serverBootId },
            (offset, length) => artifactChunk(browser, stage, offset, length));
        return { ok: true, artifact, receiptEvidence: { after: artifact } };
    }, ['native-exact-package-blob-lease', 'bounded-temporary-export', 'owned-binary-transfer']);
    const preflight = async i => {
        const artifact = artifacts.get(i.artifactId);
        const r = await read('POST', `${product}/packages/preflight`, { artifactRef: artifact.nativeRef });
        if (r.serverBootId !== artifact.nativeRef.serverBootId) throw new Error('Native artifact boot changed.');
        if (r.data.packageContentHash !== artifact.contentHash) throw new Error('Package hash mismatch.');
        if (JSON.stringify(r.data).length > 9000) throw new Error('Package review too large; narrow product state.');
        return { target: { artifactId: i.artifactId, packageId: r.data.packageId, packageVersionId: r.data.packageVersionId },
            serverBootId: r.serverBootId, artifactHash: artifact.contentHash, preflight: r.data, preflightHash: fingerprint(r.data), baseVersionId: r.data.update.previous?.packageVersionId ?? null };
    };
    add('package.install.preflight', 'READ', { artifactId: z.string().uuid() }, null, preflight);
    const grants = z.array(z.string().min(1).max(128)).max(64).refine(v => new Set(v).size === v.length, 'Duplicate permission grants');
    const reviewGuard = async i => {
        const before = await preflight(i);
        if (before.preflightHash !== i.preflightHash) throw new Error('Preflight changed; inspect again.');
        const known = new Set(before.preflight.permissions.map(p => p.permission));
        if (i.grantedPermissions.some(p => !known.has(p)) || before.preflight.requiredPermissions.some(p => !i.grantedPermissions.includes(p))) throw new Error('Permission grants do not match reviewed Package.');
        return { ...before, grantedPermissions: i.grantedPermissions };
    };
    add('package.install.review', 'INTERACT', { artifactId: z.string().uuid(), preflightHash: digest, grantedPermissions: grants }, reviewGuard,
        async (_i, { before }) => ({ ok: true, receiptEvidence: { packageReview: before, after: { reviewed: true } } }));
    add('package.install', 'MUTATE', { artifactId: z.string().uuid(), reviewReceiptId: z.string().uuid() }, async (i, c) => {
        const receipt = c.receipts.get(i.reviewReceiptId), reviewed = receipt?.packageReview;
        if (receipt?.action !== 'package.install.review' || receipt.status !== 'succeeded' || reviewed?.target.artifactId !== i.artifactId) throw new Error('Successful instance-owned Package review required.');
        const before = await reviewGuard({ ...i, preflightHash: reviewed.preflightHash, grantedPermissions: reviewed.grantedPermissions });
        if (fingerprint(before) !== fingerprint(reviewed)) throw new Error('Package review drift.');
        return before;
    }, async (i, { before }) => {
        const artifact = artifacts.get(i.artifactId);
        const r = await call('POST', `${product}/packages/install`, { artifactRef: artifact.nativeRef, baseVersionId: before.baseVersionId,
            grantedPermissions: before.grantedPermissions }, before);
        return result(r, { after: { packageId: before.target.packageId, packageVersionId: before.target.packageVersionId, artifactHash: before.artifactHash }, packageReview: before });
    }, ['package-installation', 'reviewed-permission-grants']);
    return registry;
}
