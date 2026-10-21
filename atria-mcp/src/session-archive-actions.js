import { z } from 'zod';
import { open } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { BinaryAssets } from './binary-assets.js';
import { artifactChunk } from './high-risk.js';
import { requestAuthority } from './read-authority.js';
import { fingerprint } from './kernel.js';
import { redact } from './policy.js';

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/), digest = z.string().regex(/^[a-f0-9]{64}$/);
const sha = bytes => createHash('sha256').update(bytes).digest('hex'), root = '/api/native/product';
const nativeRef = z.strictObject({ artifactId: z.string().uuid(), contentHash: digest, totalBytes: z.number().int().min(1).max(128 * 1024 * 1024),
    sourceRevision: id, clientInstanceId: id, serverBootId: z.string().uuid() });
const passwordSecretRef = z.strictObject({ secretId: z.string().uuid(), scope: z.literal('player') });
const stageSchema = z.strictObject({ artifactRef: nativeRef, owner: z.string().min(1).max(256),
    source: z.union([z.strictObject({ kind: z.literal('session-archive-upload') }), z.strictObject({ kind: z.literal('session-archive'), sessionId: id, revisionId: id, saveId: id.nullable() })]),
    mediaType: z.literal('application/octet-stream'), expiresAt: z.number().int(), receivedBytes: z.number().int().nonnegative(), state: z.enum(['receiving', 'complete']), maxChunkBytes: z.number().int().min(1).max(1024 * 1024) });

export function registerSessionArchiveActions(registry, browser, repository, { now = Date.now, clientInstanceId = randomUUID(), binary = new BinaryAssets({ now }), transport = artifactChunk } = {}) {
    const items = new Map();
    const call = (method, path, body = {}, guard = {}) => requestAuthority(browser, method, root + path, body, guard);
    const read = async (method, path, body = {}) => { const result = await call(method, path, body); if (!result.ok || !result.serverBootId) throw new Error('Native Session Archive authority unavailable.'); return result; };
    const metadata = item => ({ binaryHandleId: item.handleId, purpose: 'session-archive', contentHash: item.contentHash, totalBytes: item.totalBytes,
        sourceRevision: item.binding.sourceRevision, sourceScope: item.binding.sourceScope, expiresAt: item.expiresAt, nativeArtifactRef: item.nativeRef });
    const item = handleId => { binary.cleanup(); const value = items.get(handleId); if (!value || value.expiresAt <= now()) { items.delete(handleId); throw new Error('Unknown or expired Session Archive handle.'); }
        binary.inspect(handleId, { binding: value.binding }); return value; };
    const store = async (stageInput, load, expectedBoot) => {
        const stage = stageSchema.parse(stageInput), ref = stage.artifactRef;
        if (ref.clientInstanceId !== clientInstanceId || ref.serverBootId !== expectedBoot || stage.state !== 'complete' || stage.receivedBytes !== ref.totalBytes) throw new Error('Session Archive source binding mismatch.');
        const sourceScope = { serverBootId: expectedBoot, kind: stage.source.kind, ...(stage.source.kind === 'session-archive' ? { sessionId: stage.source.sessionId, ...(stage.source.saveId ? { saveId: stage.source.saveId } : {}) } : {}) };
        const binding = { owner: stage.owner, clientInstanceId, purpose: 'session-archive', sourceAuthority: 'native.session-archive', sourceScope,
            sourceRevision: ref.sourceRevision, allowedOperations: ['inspect', 'read', 'archive.preflight', 'archive.import'] };
        const handle = binary.begin({ binding, contentHash: ref.contentHash, totalBytes: ref.totalBytes, mediaType: stage.mediaType, ttlMs: Math.min(900000, stage.expiresAt - now()) });
        try {
            for (let offset = 0; offset < ref.totalBytes; offset += Math.min(stage.maxChunkBytes, binary.maxChunkBytes)) {
                const bytes = await load(offset, Math.min(stage.maxChunkBytes, binary.maxChunkBytes, ref.totalBytes - offset));
                binary.writeChunk(handle.handleId, { binding, offset, bytes, chunkHash: sha(bytes) });
            }
            const completed = { ...binary.finalize(handle.handleId, { binding }), binding, nativeRef: ref }; items.set(handle.handleId, completed); return metadata(completed);
        } catch (error) { try { binary.cancel(handle.handleId, { binding }); } catch { /* Expired staging is inaccessible. */ } throw error; }
    };
    const add = (suffix, risk, shape, guard, handler, effects = []) => registry.register({ version: 1, id: 'session.archive.' + suffix, domain: 'session', title: 'Native Session Archive ' + suffix,
        risk, authority: 'Original NativeSaveSystem / SessionRepo / RunControl / Package dependency closure', adapter: 'fixed-http', externalEffects: effects,
        guards: risk === 'READ' ? [] : ['current-server-boot', 'exact-owner-client-purpose-source', 'before-and-after-approval-authority', 'native-session-lock-cas'],
        approval: risk === 'READ' ? 'none' : 'trusted-approval-required', availability: { available: true, reason: 'Native .atriasave format and bounded binary transport; dedicated immutable password SecretRefs resolve only inside Native Archive execution' } },
    z.strictObject(shape), z.json(), handler, risk === 'READ' ? null : guard);
    add('passwords', 'READ', {}, null, async () => redact(await read('GET', '/save-archives/password-references')));
    const passwordGuard = async (ref, serverBootId) => {
        if (ref === undefined) return null;
        const inventory = await read('GET', '/save-archives/password-references');
        if (inventory.serverBootId !== serverBootId || !inventory.data.passwordSecretRefs?.some(item => item.secretId === ref.secretId && item.scope === ref.scope))
            throw new Error('Owned dedicated Archive password SecretRef unavailable.');
        return ref;
    };
    const source = { sessionId: id, expectedRevisionId: id, saveId: id.optional(), passwordSecretRef: passwordSecretRef.optional() };
    const sourceGuard = async input => {
        if ((await browser.runtimeIdentity())?.mutationGuards !== 1) throw new Error('Product mutation guards unavailable.');
        const result = await read('GET', '/sessions/' + input.sessionId + '/observe');
        if (result.data.session.headRevisionId !== input.expectedRevisionId) throw new Error('Session Archive HEAD conflict.');
        const save = input.saveId ? result.data.saves?.find(point => point.saveId === input.saveId) : null;
        if (input.saveId && !save) throw new Error('Session Archive SavePoint unavailable.');
        return { target: { sessionId: input.sessionId, ...(input.saveId ? { saveId: input.saveId } : {}) }, serverBootId: result.serverBootId,
            expectedRevisionId: input.expectedRevisionId, save: save ? { saveId: save.saveId, revisionId: save.revisionId } : null,
            passwordSecretRef: await passwordGuard(input.passwordSecretRef, result.serverBootId), encryption: input.passwordSecretRef ? 'password-scrypt-v1' : 'atria-portable-obfuscation-v1' };
    };
    add('export', 'INTERACT', source, sourceGuard, async (input, { before }) => {
        const result = await call('POST', '/save-archives/export', { ...input, clientInstanceId }, before);
        if (!result.ok) return redact(result);
        const stage = stageSchema.parse(result.data);
        if (stage.source.kind !== 'session-archive' || stage.source.sessionId !== input.sessionId || stage.source.saveId !== (input.saveId ?? null)
            || stage.source.revisionId !== (before.save?.revisionId ?? input.expectedRevisionId)) throw new Error('Exported Session Archive source mismatch.');
        const artifact = await store(stage, (offset, length) => transport(browser, stage, offset, length), before.serverBootId);
        return { ok: true, artifact, receiptEvidence: { after: artifact } };
    }, ['sensitive-owned-session-export', 'native-run-state-reconciliation', 'temporary-binary-staging']);
    const capture = async input => {
        if (!input.path.endsWith('.atriasave')) throw new Error('Development .atriasave artifact required.');
        await repository.refreshRuntimeRoots(); const file = await repository.policy.file(input.path, true), fd = await open(file, 'r');
        try { const stat = await fd.stat(); if (!stat.isFile() || !stat.size || stat.size > 128 * 1024 * 1024) throw new Error('Session Archive exceeds bound.');
            const bytes = await fd.readFile(); if (bytes.length !== stat.size) throw new Error('Session Archive changed.'); return bytes;
        } finally { await fd.close(); }
    };
    add('capture', 'INTERACT', { path: z.string().min(1).max(512) }, async input => {
        const bytes = await capture(input), identity = await browser.runtimeIdentity();
        if (identity?.mutationGuards !== 1 || !identity.serverBootId) throw new Error('Native Archive guards unavailable.');
        return { target: { path: input.path }, serverBootId: identity.serverBootId, contentHash: sha(bytes), totalBytes: bytes.length };
    }, async (input, { before }) => {
        const bytes = await capture(input); if (sha(bytes) !== before.contentHash || bytes.length !== before.totalBytes) throw new Error('Session Archive changed after approval.');
        const begun = await call('POST', '/save-archives/begin', { clientInstanceId, contentHash: before.contentHash, totalBytes: bytes.length }, before);
        if (!begun.ok) return redact(begun);
        const stage = stageSchema.parse(begun.data);
        if (stage.artifactRef.serverBootId !== before.serverBootId || stage.artifactRef.clientInstanceId !== clientInstanceId || stage.source.kind !== 'session-archive-upload') throw new Error('Archive upload scope mismatch.');
        for (let offset = 0; offset < bytes.length; offset += stage.maxChunkBytes) { const chunk = bytes.subarray(offset, offset + stage.maxChunkBytes); await transport(browser, stage, offset, chunk.length, chunk, stageSchema); }
        const completed = await call('POST', '/artifacts/' + stage.artifactRef.artifactId + '/finalize', { artifactRef: stage.artifactRef }, before);
        if (!completed.ok) return redact(completed);
        const artifact = await store(completed.data, async (offset, length) => bytes.subarray(offset, offset + length), before.serverBootId);
        return { ok: true, artifact, receiptEvidence: { after: artifact } };
    }, ['approved-development-artifact-read', 'temporary-native-binary-staging']);
    add('inspect', 'READ', { binaryHandleId: z.string().uuid() }, null, async input => metadata(item(input.binaryHandleId)));
    add('cancel', 'INTERACT', { binaryHandleId: z.string().uuid() }, async input => {
        const value = item(input.binaryHandleId);
        return { target: { artifactId: value.nativeRef.artifactId }, serverBootId: value.nativeRef.serverBootId, contentHash: value.contentHash };
    }, async (input, { before }) => {
        const value = item(input.binaryHandleId);
        const response = await call('DELETE', '/artifacts/' + value.nativeRef.artifactId, { artifactRef: value.nativeRef }, before);
        if (response.ok) { binary.cancel(value.handleId, { binding: value.binding }); items.delete(value.handleId); }
        return { ...redact(response), recovery: 'Cancels temporary archive material only; already imported Session data remains owned by its original authority.' };
    }, ['remove-only-owned-temporary-archive-staging']);
    const preflight = async input => { const value = item(input.binaryHandleId); const result = await read('POST', '/save-archives/preflight', { artifactRef: value.nativeRef });
        if (result.serverBootId !== value.nativeRef.serverBootId) throw new Error('Session Archive boot changed.'); return { result, value }; };
    add('preflight', 'READ', { binaryHandleId: z.string().uuid() }, null, async input => {
        const { result } = await preflight(input); return { ...redact(result), preflightFingerprint: fingerprint(result.data) };
    });
    add('import', 'MUTATE', { binaryHandleId: z.string().uuid(), expectedPreflightFingerprint: digest, passwordSecretRef: passwordSecretRef.optional() }, async input => {
        if ((await browser.runtimeIdentity())?.mutationGuards !== 1) throw new Error('Product mutation guards unavailable.');
        const { result, value } = await preflight(input);
        if (fingerprint(result.data) !== input.expectedPreflightFingerprint || result.data.preflight.dependency.status !== 'ready' || result.data.importability.status === 'blocked') throw new Error('Session Archive dependency or target changed.');
        if (result.data.preflight.protection.requiresPassword && !input.passwordSecretRef) throw new Error('Encrypted Session Archive requires a dedicated Native password SecretRef.');
        if (!result.data.preflight.protection.requiresPassword && input.passwordSecretRef) throw new Error('Unencrypted Session Archive does not accept a password SecretRef.');
        return { target: { sessionId: result.data.preflight.root.sessionId }, serverBootId: result.serverBootId, contentHash: value.contentHash,
            preflight: result.data, preflightFingerprint: input.expectedPreflightFingerprint,
            passwordSecretRef: await passwordGuard(input.passwordSecretRef, result.serverBootId) };
    }, async (input, { before }) => {
        const value = item(input.binaryHandleId);
        binary.readChunk(value.handleId, { binding: value.binding, operation: 'archive.import', offset: 0, length: 1 });
        const result = await call('POST', '/save-archives/import', { artifactRef: value.nativeRef, expectedPreflightFingerprint: input.expectedPreflightFingerprint,
            ...(input.passwordSecretRef ? { passwordSecretRef: input.passwordSecretRef } : {}) }, before);
        return { ...redact(result), receiptEvidence: { after: result.ok ? result.data : null, recovery: 'Observe exact Session and immutable Revision before any further import. Unknown results are never replayed.' } };
    }, ['native-session-closure-import', 'asset-dependency-adoption']);
    return registry;
}
