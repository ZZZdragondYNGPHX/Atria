import { createHash } from 'node:crypto';
import { z } from 'zod';
import { fingerprint } from './kernel.js';
import { requestAuthority } from './read-authority.js';
import { artifactChunk } from './high-risk.js';

const hash = z.string().regex(/^[a-f0-9]{64}$/), id = z.string().min(1).max(256);
export const nativeSourceRefSchema = z.strictObject({ artifactId: z.string().uuid(), contentHash: hash,
    totalBytes: z.number().int().min(1).max(128 * 1024 * 1024), sourceRevision: id, clientInstanceId: id, serverBootId: z.string().uuid() });
export const sourceStageSchema = z.strictObject({ artifactRef: nativeSourceRefSchema, owner: id,
    source: z.strictObject({ kind: z.enum(['skill-payload-upload', 'extension-source-upload']), bindingHash: hash }),
    mediaType: z.literal('application/octet-stream'), expiresAt: z.number().int(), receivedBytes: z.number().int().nonnegative(),
    state: z.enum(['receiving', 'complete']), maxChunkBytes: z.number().int().min(1).max(1024 * 1024) });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const root = '/api/native/product/artifacts/';

export async function disposeNativeSource(browser, ref, guards = {}) {
    const exact = nativeSourceRefSchema.parse(ref);
    const response = await requestAuthority(browser, 'DELETE', root + exact.artifactId, { artifactRef: exact }, { ...guards, serverBootId: exact.serverBootId });
    if (!response.ok || response.serverBootId !== exact.serverBootId) throw new Error('Native source staging cleanup unavailable; it remains bounded by its original expiry.');
}

// Only fixed domain routes create staging; chunks reuse the shared Native pool.
// Bytes stay inside this transport and never enter receipts or tool output.
export async function uploadNativeSource(browser, { bytes, beginPath, beginInput, guards, clientInstanceId, kind, bindingHash }) {
    const maximum = kind === 'extension-source-upload' ? 4 * 1024 * 1024 : kind === 'skill-payload-upload' ? 128 * 1024 * 1024 : 0;
    const allowed = kind === 'extension-source-upload' ? '/api/native/extensions/local/staging' : '/api/native/skills/payload/staging';
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > maximum || beginPath !== allowed || !guards?.serverBootId) throw new Error('Invalid fixed Native source transfer.');
    const contentHash = sha(bytes);
    const response = await requestAuthority(browser, 'POST', beginPath, { ...beginInput, clientInstanceId, contentHash, totalBytes: bytes.length }, guards);
    if (!response.ok || response.serverBootId !== guards.serverBootId) throw new Error('Native source staging unavailable.');
    const stage = sourceStageSchema.parse(response.data), ref = stage.artifactRef;
    if (ref.serverBootId !== guards.serverBootId || ref.clientInstanceId !== clientInstanceId || ref.contentHash !== contentHash || ref.sourceRevision !== contentHash
        || ref.totalBytes !== bytes.length || stage.source.kind !== kind || stage.source.bindingHash !== bindingHash || stage.state !== 'receiving' || stage.receivedBytes !== 0)
        throw new Error('Native source staging identity mismatch.');
    try {
        for (let offset = 0; offset < bytes.length; offset += stage.maxChunkBytes) {
            const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + stage.maxChunkBytes));
            const written = await artifactChunk(browser, stage, offset, chunk.length, chunk, sourceStageSchema);
            if (written.source.kind !== kind || written.source.bindingHash !== bindingHash) throw new Error('Native source staging purpose changed.');
        }
        const complete = await requestAuthority(browser, 'POST', root + ref.artifactId + '/finalize', { artifactRef: ref }, guards);
        if (!complete.ok || complete.serverBootId !== ref.serverBootId) throw new Error('Native source finalization unavailable.');
        const ready = sourceStageSchema.parse(complete.data);
        if (fingerprint(ready.artifactRef) !== fingerprint(ref) || ready.state !== 'complete' || ready.receivedBytes !== bytes.length
            || ready.source.kind !== kind || ready.source.bindingHash !== bindingHash) throw new Error('Native source finalization identity mismatch.');
        return ref;
    } catch (error) {
        try { await disposeNativeSource(browser, ref, guards); } catch { /* Original transfer failure wins; native TTL remains authoritative. */ }
        throw error;
    }
}

// Pure, fixed byte observations: receive the entire bounded source privately so
// the existing MCP redactor can run before any character/page boundary is cut.
export async function readNativeSource(browser, { path, input, serverBootId, maxBytes, expectedHash = null }) {
    const limits = { '/api/native/skills/file/content': 4 * 1024 * 1024,
        '/api/native/skills/candidate/content': 512 * 1024, '/api/native/skills/inspect/content': 8 * 1024 * 1024 };
    if (!Object.hasOwn(limits, path) || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > limits[path]
        || typeof serverBootId !== 'string' || expectedHash !== null && !/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error('Invalid fixed Native source observation.');
    await browser.start();
    const csrf = await browser.context.request.get(browser.config.url + '/csrf-token', { maxRedirects: 0, timeout: browser.config.timeout });
    let token;
    try {
        if (!csrf.ok() || !(csrf.headers()['content-type'] ?? '').includes('json')) throw new Error('CSRF unavailable.');
        const body = await csrf.body(); if (body.length > 8192) throw new Error('CSRF response exceeds bound.');
        token = JSON.parse(body.toString()).token;
        if (typeof token !== 'string' || token.length > 4096) throw new Error('Invalid CSRF response.');
    } finally { await csrf.dispose(); }
    const response = await browser.context.request.fetch(browser.config.url + path, { method: 'POST', data: input,
        headers: { Accept: 'application/octet-stream', 'Content-Type': 'application/json', 'x-csrf-token': token, 'x-atria-expected-server-boot-id': serverBootId },
        maxRedirects: 0, timeout: browser.config.timeout });
    try {
        const headers = response.headers();
        if (!response.ok() || headers['x-atria-server-boot-id'] !== serverBootId || !(headers['content-type'] ?? '').includes('application/octet-stream')
            || !/^\d+$/.test(headers['content-length'] ?? '') || Number(headers['content-length']) > maxBytes) throw new Error('Native source observation unavailable or exceeds bound.');
        const bytes = await response.body(), actualHash = sha(bytes);
        if (bytes.length > maxBytes || bytes.length !== Number(headers['content-length']) || headers['x-atria-content-sha256'] !== actualHash
            || expectedHash !== null && actualHash !== expectedHash) throw new Error('Native source observation integrity mismatch.');
        return bytes;
    } finally { await response.dispose(); }
}
