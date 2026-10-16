import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { BinaryAssets } from './binary-assets.js';
import { redact } from './policy.js';

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/), digest = z.string().regex(/^[a-f0-9]{64}$/);
const hash = bytes => createHash('sha256').update(bytes).digest('hex'), root = '/api/native/generation';
const refSchema = z.strictObject({ handleId: z.string().uuid(), clientInstanceId: id, serverBootId: z.string().uuid(),
    purpose: z.enum(['media-image', 'media-thumbnail', 'mask-raster', 'speech-audio']), contentHash: digest,
    totalBytes: z.number().int().min(1).max(32 * 1024 * 1024), sourceRevision: id });
const descriptor = z.strictObject({ ref: refSchema, owner: z.string().min(1).max(256), sourceScope: z.record(z.string(), z.string().min(1).max(512)),
    mediaType: z.string().min(1).max(256), expiresAt: z.number().int(), maxChunkBytes: z.number().int().min(1).max(1024 * 1024) });

async function binaryRequest(browser, stage, offset, length) {
    const ref = stage.ref, url = new URL(root + `/visual/binary/${ref.handleId}/chunk`, browser.config.url);
    for (const [key, value] of Object.entries(ref)) if (key !== 'handleId') url.searchParams.set(key, String(value));
    url.searchParams.set('offset', String(offset)); url.searchParams.set('length', String(length));
    await browser.start();
    const response = await browser.context.request.fetch(url.href, { method: 'GET', maxRedirects: 0, timeout: browser.config.timeout,
        headers: { Accept: 'application/octet-stream', 'x-atria-expected-server-boot-id': ref.serverBootId } });
    try {
        const headers = response.headers();
        if (response.status() !== 206 || headers['x-atria-server-boot-id'] !== ref.serverBootId || Number(headers['content-length']) !== length
            || headers['etag'] !== '"' + ref.contentHash + '"' || headers['content-range'] !== `bytes ${offset}-${offset + length - 1}/${ref.totalBytes}`
            || !(headers['content-type'] ?? '').startsWith('application/octet-stream')) throw new Error('Native media binary identity or bounds mismatch.');
        const bytes = await response.body();
        if (bytes.length !== length || headers['x-atria-chunk-sha256'] !== hash(bytes)) throw new Error('Native media chunk integrity mismatch.');
        return bytes;
    } finally { await response.dispose(); }
}

async function checkpointRequest(browser, input, bytes, boot) {
    await browser.start();
    const csrf = await browser.context.request.get(browser.config.url + '/csrf-token', { maxRedirects: 0, timeout: browser.config.timeout });
    let token;
    try {
        if (!csrf.ok() || !(csrf.headers()['content-type'] ?? '').includes('json')) throw new Error('CSRF unavailable.');
        const payload = await csrf.body(); if (payload.length > 8192) throw new Error('Invalid CSRF response.');
        token = JSON.parse(payload.toString()).token;
        if (typeof token !== 'string' || !token.length || token.length > 4096) throw new Error('Invalid CSRF token.');
    } finally { await csrf.dispose(); }
    const response = await browser.context.request.fetch(browser.config.url + root + '/visual/mask/checkpoint-with-commands', {
        method: 'POST', maxRedirects: 0, timeout: browser.config.timeout,
        headers: { Accept: 'application/json', 'x-csrf-token': token, 'x-atria-expected-server-boot-id': boot },
        multipart: { metadata: JSON.stringify({ sessionId: input.sessionId, branchId: input.branchId, draftId: input.draftId,
            expectedRevision: input.expectedRevision, commands: [], cursor: 0 }), checkpoint: { name: 'checkpoint.gray8', mimeType: 'application/octet-stream', buffer: bytes } },
    });
    try {
        const headers = response.headers();
        if (!response.ok() || headers['x-atria-server-boot-id'] !== boot || !(headers['content-type'] ?? '').includes('json')
            || Number(headers['content-length']) > browser.config.maxResponseBytes) throw new Error('Native mask checkpoint rejected or unknown.');
        const payload = await response.body(); if (payload.length > browser.config.maxResponseBytes) throw new Error('Native checkpoint response exceeds bound.');
        return JSON.parse(payload.toString());
    } finally { await response.dispose(); }
}

export function registerMediaBinaryActions(registry, browser, { call, sessionIdentity, now = Date.now, clientInstanceId = randomUUID(), binary = new BinaryAssets({ now }), fetchChunk = binaryRequest, checkpoint = checkpointRequest } = {}) {
    const handles = new Map();
    const cleanup = () => { binary.cleanup(); for (const [key, item] of handles) if (item.expiresAt <= now()) handles.delete(key); };
    const metadata = item => ({ binaryHandleId: item.handleId, purpose: item.binding.purpose, contentHash: item.contentHash, totalBytes: item.totalBytes,
        mediaType: item.mediaType, sourceScope: item.binding.sourceScope, sourceRevision: item.binding.sourceRevision, expiresAt: item.expiresAt,
        authorization: 'byte transport only; no Provider send or cross-purpose use' });
    const find = handleId => { cleanup(); const item = handles.get(handleId); if (!item) throw new Error('Unknown or expired media binary handle.'); binary.inspect(handleId, { binding: item.binding }); return item; };
    const add = (action, risk, shape, guard, handler) => registry.register({ version: 1, id: action, domain: action.split('.')[0], title: action, risk,
        authority: 'Native MediaStudio / SpeechService / AssetStore verified delivery', adapter: 'fixed-http', externalEffects: risk === 'READ' ? [] : ['native-source-validation-may-reconcile', 'owned-binary-transfer'],
        guards: risk === 'READ' ? [] : ['exact-owner-client-purpose-source', 'current-server-boot', 'double-check', 'native-revision-hash'],
        approval: risk === 'READ' ? 'none' : 'trusted-approval-required', availability: { available: true, reason: 'Fixed Native source descriptors and binary delivery only; payload never enters tool JSON' } },
    z.strictObject(shape), z.json(), handler, risk === 'READ' ? null : guard);
    const source = { sessionId: id, branchId: id, expectedRevisionId: id }, image = { ...source, imageVersionId: id };
    const capture = (action, kind, shape, guard = sessionIdentity) => add(action, 'MUTATE', shape, guard, async (input, context) => {
        const request = { kind, clientInstanceId, ...Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'expectedRevisionId')) };
        const response = await call('POST', root + '/visual/binary/describe', request, context.before ?? {}), stage = descriptor.parse(response.data);
        const expectedPurpose = { image: 'media-image', thumbnail: 'media-thumbnail', mask: 'mask-raster', audio: 'speech-audio' }[kind];
        if (stage.ref.clientInstanceId !== clientInstanceId || stage.ref.serverBootId !== context.before.serverBootId || stage.ref.purpose !== expectedPurpose
            || Object.entries(input).some(([key, value]) => ['sessionId', 'branchId', 'imageVersionId', 'draftId', 'operationId'].includes(key) && stage.sourceScope[key] !== value)
            || kind === 'mask' && stage.ref.sourceRevision !== input.expectedRevision) throw new Error('Native media descriptor scope mismatch.');
        const binding = { owner: stage.owner, clientInstanceId, purpose: stage.ref.purpose,
            sourceAuthority: kind === 'mask' ? 'native.mask' : 'native.asset', sourceScope: { ...stage.sourceScope, serverBootId: stage.ref.serverBootId },
            sourceRevision: stage.ref.sourceRevision, allowedOperations: kind === 'mask' ? ['inspect', 'read', 'mask.checkpoint'] : ['inspect', 'read'] };
        const handle = binary.begin({ binding, contentHash: stage.ref.contentHash, totalBytes: stage.ref.totalBytes, mediaType: stage.mediaType, ttlMs: Math.min(900000, stage.expiresAt - now()) });
        try {
            const chunkSize = Math.min(stage.maxChunkBytes, binary.maxChunkBytes);
            for (let offset = 0; offset < stage.ref.totalBytes; offset += chunkSize) {
                const length = Math.min(chunkSize, stage.ref.totalBytes - offset), bytes = await fetchChunk(browser, stage, offset, length);
                if (!Buffer.isBuffer(bytes) || bytes.length !== length) throw new Error('Native media binary length mismatch.');
                binary.writeChunk(handle.handleId, { binding, offset, bytes, chunkHash: hash(bytes) });
            }
            const complete = binary.finalize(handle.handleId, { binding }); handles.set(handle.handleId, complete);
            return { ok: true, artifact: metadata(complete), receiptEvidence: { after: metadata(complete) } };
        } catch (error) { try { binary.cancel(handle.handleId, { binding }); } catch { /* Expired or invalid staging is already inaccessible. */ } throw error; }
    });
    capture('media.image.capture', 'image', image);
    capture('media.thumbnail.capture', 'thumbnail', image);
    capture('media.mask.raster.capture', 'mask', { ...source, draftId: id, expectedRevision: digest });
    capture('speech.audio.capture', 'audio', { operationId: id, expectedRevisionId: id }, async input => {
        const response = await call('POST', root + '/speech/observe', { operationId: input.operationId });
        if (!response.data.current || response.data.status !== 'completed' || !response.data.artifact?.asset) throw new Error('Speech audio is unavailable or stale.');
        const scope = await sessionIdentity({ ...response.data.anchor, expectedRevisionId: input.expectedRevisionId });
        if (scope.serverBootId !== response.serverBootId) throw new Error('Speech boot changed.');
        return { ...scope, target: { ...scope.target, operationId: input.operationId }, assetHash: response.data.artifact.asset.contentHash };
    });
    add('media.binary.inspect', 'READ', { binaryHandleId: z.string().uuid() }, null, async input => metadata(find(input.binaryHandleId)));
    add('media.mask.checkpoint', 'MUTATE', { ...source, draftId: id, expectedRevision: digest, binaryHandleId: z.string().uuid() }, async input => {
        const scope = await sessionIdentity(input), item = find(input.binaryHandleId), binding = item.binding;
        if (binding.purpose !== 'mask-raster' || binding.sourceRevision !== input.expectedRevision || binding.sourceScope.sessionId !== input.sessionId
            || binding.sourceScope.branchId !== input.branchId || binding.sourceScope.draftId !== input.draftId || binding.sourceScope.serverBootId !== scope.serverBootId) throw new Error('Mask checkpoint binary purpose or source mismatch.');
        return { ...scope, target: { ...scope.target, draftId: input.draftId }, sourceRevision: binding.sourceRevision, contentHash: item.contentHash, binaryHandleId: input.binaryHandleId };
    }, async (input, context) => {
        const item = find(input.binaryHandleId), payload = binary.getBytes(item.handleId, { binding: item.binding, operation: 'mask.checkpoint' });
        const result = redact(await checkpoint(browser, input, payload.bytes, context.before.serverBootId));
        return { ok: true, data: result, receiptEvidence: { after: { revision: result.revision, checkpointHash: item.contentHash }, recovery: 'Native draft CAS only; no blind retry' } };
    });
    return registry;
}
