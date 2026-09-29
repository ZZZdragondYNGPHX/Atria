import { randomUUID, createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { z } from 'zod';
import { fingerprint } from './kernel.js';
import { requestAuthority } from './read-authority.js';
import { redact } from './policy.js';

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const studio = '/api/native/studio', product = '/api/native/product';
const ref = z.strictObject({ scope: z.literal('library'), resourceType: z.enum(['core.world', 'core.knowledge']), resourceId: id, revision: id });
const owned = { creatingReceiptId: z.string().uuid() };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

// Bytes never enter model output or receipts. Handles expire with this server instance.
export class PackageArtifacts {
    #items = new Map();
    constructor({ now = Date.now } = {}) { this.now = now; }
    put(bytes, source) {
        if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 16 * 1024 * 1024) throw new Error('Package artifact exceeds 16 MiB bound.');
        for (const [key, item] of this.#items) if (item.expiresAt <= this.now()) this.#items.delete(key);
        if (this.#items.size >= 4) throw new Error('Package artifact capacity reached.');
        const artifactId = randomUUID(), contentHash = sha(bytes), expiresAt = this.now() + 900000;
        const metadata = { artifactId, contentHash, size: bytes.length, source, expiresAt };
        this.#items.set(artifactId, { ...metadata, bytes: Buffer.from(bytes) });
        return metadata;
    }
    get(artifactId) {
        const value = this.#items.get(artifactId);
        if (!value || value.expiresAt <= this.now()) throw new Error('Unknown or expired Package artifact handle.');
        return { ...value, bytes: Buffer.from(value.bytes) };
    }
    clear() { this.#items.clear(); }
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
        const r = await read('GET', `${product}/sessions/${i.sessionId}`);
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
        deleted: [{ kind, id: i[key] }], recovery: 'Physical deletion; no automatic undo or retry.' }));

    add('work.delete', 'DESTRUCTIVE', { packageId: id, baseVersionId: id }, async i => {
        const r = await read('GET', `${product}/works/${i.packageId}`);
        const sessions = await read('GET', `${product}/sessions`, { packageId: i.packageId });
        if (r.serverBootId !== sessions.serverBootId) throw new Error('Server changed during delete safety.');
        if (r.data.package.currentVersionId !== i.baseVersionId) throw new Error('Work version conflict.');
        if (!Array.isArray(sessions.data) || sessions.data.length) throw new Error('Work has dependent Sessions; resolve each through explicit Session authority.');
        return { target: { packageId: i.packageId }, serverBootId: r.serverBootId, baseVersionId: i.baseVersionId, dependentSessions: [] };
    }, async (i, { before }) => result(await call('DELETE', `${product}/works/${i.packageId}`, { baseVersionId: i.baseVersionId }, before), { deleted: [{ kind: 'work', id: i.packageId }] }));

    add('library.revision.delete', 'DESTRUCTIVE', { ref }, async i => {
        const r = await read('POST', `${studio}/resources/delete-safety`, { ref: i.ref });
        if (r.data.safe !== true) throw new Error('Library revision referenced; force deletion is unavailable.');
        return { target: i.ref, serverBootId: r.serverBootId, safety: r.data };
    }, async (i, { before }) => result(await call('DELETE', `${studio}/library/resources/revisions`, i, before), { deleted: [{ kind: 'library-revision', ...i.ref }] }));

    add('package.artifact.capture', 'READ', { path: z.string().min(1).max(512) }, null, async i => {
        if (!i.path.endsWith('.atria')) throw new Error('Expected .atria development artifact.');
        await repository.refreshRuntimeRoots();
        const file = await repository.policy.file(i.path, true), handle = await open(file, 'r');
        try {
            const stat = await handle.stat();
            if (!stat.isFile() || stat.size > 16 * 1024 * 1024) throw new Error('Artifact exceeds bound.');
            return artifacts.put(await handle.readFile(), { path: i.path });
        } finally { await handle.close(); }
    });
    add('build.package.create', 'INTERACT', { projectId: id, baseRevision: id }, projectGuard, async (i, { before }) => {
        const r = await call('POST', `${studio}/projects/${i.projectId}/build`, { baseRevision: i.baseRevision }, before);
        if (!r.ok) return result(r);
        const artifact = artifacts.put(Buffer.from(r.data.data, 'base64'), { projectId: i.projectId, baseRevision: i.baseRevision, serverBootId: before.serverBootId });
        return { ok: true, artifact, manifest: redact(r.data.manifest), receiptEvidence: { after: artifact } };
    });
    add('package.artifact.inspect', 'READ', { artifactId: z.string().uuid() }, null, async i => { const { bytes: _, ...metadata } = artifacts.get(i.artifactId); return metadata; });
    const preflight = async i => {
        const artifact = artifacts.get(i.artifactId);
        const r = await read('POST', `${product}/packages/preflight`, { data: artifact.bytes.toString('base64') });
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
        const r = await call('POST', `${product}/packages/install`, { data: artifact.bytes.toString('base64'), baseVersionId: before.baseVersionId,
            grantedPermissions: before.grantedPermissions }, before);
        return result(r, { after: { packageId: before.target.packageId, packageVersionId: before.target.packageVersionId, artifactHash: before.artifactHash }, packageReview: before });
    }, ['package-installation', 'reviewed-permission-grants']);
    return registry;
}
