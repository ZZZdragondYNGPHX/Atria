import { createHash, randomUUID } from 'node:crypto';
import { PNG } from 'pngjs';
import { MediaStudio } from './media-studio.js';
import { SpeechService } from './speech-service.js';
import { serverBootId } from '../logging/startup-store.js';
import { ConflictError, NotFoundError } from '../storage/errors.js';
import { imageSize } from 'image-size';
import { IllustrationImageService } from './illustration-image-service.js';

const MiB = 1024 * 1024, digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fields = value => value && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value);
const fail = () => { throw new TypeError('Invalid Native media binary request'); };
const limits = Object.freeze({ image: 32 * MiB, thumbnail: MiB, 'authoring-image': 32 * MiB, 'authoring-thumbnail': MiB, mask: 16 * MiB, audio: 16 * MiB });
const purposes = Object.freeze({ image: 'media-image', thumbnail: 'media-thumbnail', 'authoring-image': 'media-image', 'authoring-thumbnail': 'media-thumbnail', mask: 'mask-raster', audio: 'speech-audio' });
const refKeys = ['handleId', 'clientInstanceId', 'serverBootId', 'purpose', 'contentHash', 'totalBytes', 'sourceRevision'];
const same = (a, b) => refKeys.every(key => a[key] === b[key]);

export function visualThumbnail(bytes) {
    const dimensions = imageSize(bytes);
    if (bytes.length > 32 * MiB || dimensions.type !== 'png' || !dimensions.width || !dimensions.height
        || dimensions.width > 32768 || dimensions.height > 32768 || dimensions.width * dimensions.height > 16777216) fail();
    const input = PNG.sync.read(bytes, { checkCRC: true }), scale = Math.min(1, 320 / input.width, 320 / input.height);
    const width = Math.max(1, Math.round(input.width * scale)), height = Math.max(1, Math.round(input.height * scale)), data = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const source = (Math.min(input.height - 1, Math.floor(y / scale)) * input.width + Math.min(input.width - 1, Math.floor(x / scale))) * 4;
        input.data.copy(data, (y * width + x) * 4, source, source + 4);
    }
    return PNG.sync.write({ width, height, data });
}

/** Metadata leases on existing Native assets, never a second MediaStore. */
export class NativeMcpMediaAssets {
    #handles = new Map();
    constructor({ getHost, now = Date.now, bootId = serverBootId, ttlMs = 300000, maxEntries = 32, resolveSource } = {}) {
        if (typeof getHost !== 'function' || typeof now !== 'function' || !text(bootId) || !Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 300000 || !Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 128) fail();
        Object.assign(this, { getHost, now, bootId, ttlMs, maxEntries, resolveSource }); Object.freeze(this);
    }
    cleanup() { for (const [key, item] of this.#handles) if (item.expiresAt <= this.now()) this.#handles.delete(key); }
    async #resolve(owner, input) {
        if (this.resolveSource) return this.resolveSource(owner, input);
        const host = this.getHost(), media = new MediaStudio({ host });
        if (input.kind.startsWith('authoring-')) {
            const images = new IllustrationImageService({ host }), row = await images.store.read(owner, 'job', input.operationId), job = row.value;
            if (job?.source.kind !== 'authoring' || job.status !== 'published' || job.imageVersionId !== input.imageVersionId
                || job.result?.ref.contentHash !== input.contentHash) throw new ConflictError('native_media_binary_source_conflict');
            const sourceScope = { kind: 'authoring', operationId: input.operationId, imageVersionId: input.imageVersionId, contentHash: input.contentHash };
            if (input.kind === 'authoring-thumbnail') {
                const asset = await images.assets.read(owner, job.result.ref.assetId), bytes = visualThumbnail(asset.bytes);
                return { bytes, sourceRevision: row.revision, sourceScope, mediaType: 'image/png' };
            }
            return { ref: job.result.ref, sourceRevision: row.revision, sourceScope, assets: images.assets };
        }
        if (input.kind === 'audio') {
            const observation = await new SpeechService({ host }).observe(owner, { operationId: input.operationId });
            if (!observation.current || observation.status !== 'completed' || !observation.artifact?.asset) throw new ConflictError('native_speech_source_conflict');
            return { ref: observation.artifact.asset, sourceRevision: observation.anchor.revisionId,
                sourceScope: { sessionId: observation.anchor.sessionId, branchId: observation.anchor.branchId, operationId: input.operationId }, assets: media.assets };
        }
        if (input.kind === 'mask') {
            const row = await media.draft(owner, input.draftId, input);
            if (row.revision !== input.expectedRevision) throw new ConflictError('native_visual_draft_conflict');
            const bytes = await media.raster(owner, row.value);
            return { bytes, sourceRevision: row.revision, sourceScope: { sessionId: input.sessionId, branchId: input.branchId, draftId: input.draftId }, mediaType: 'application/x-atria-mask-gray8' };
        }
        const base = await media.image(owner, input);
        const sourceScope = { sessionId: input.sessionId, branchId: input.branchId, imageVersionId: input.imageVersionId };
        if (input.kind === 'thumbnail') {
            const asset = await media.assets.read(owner, base.asset.assetId), bytes = visualThumbnail(asset.bytes);
            return { bytes, sourceRevision: base.source.revisionId, sourceScope, mediaType: 'image/png' };
        }
        return { ref: base.asset, sourceRevision: base.source.revisionId, sourceScope, assets: media.assets };
    }
    #validate(input) {
        if (!fields(input) || !Object.hasOwn(limits, input.kind) || !text(input.clientInstanceId)) fail();
        const allowed = input.kind.startsWith('authoring-') ? ['kind', 'clientInstanceId', 'operationId', 'imageVersionId', 'contentHash']
            : input.kind === 'audio' ? ['kind', 'clientInstanceId', 'operationId']
                : input.kind === 'mask' ? ['kind', 'clientInstanceId', 'sessionId', 'branchId', 'draftId', 'expectedRevision']
                    : ['kind', 'clientInstanceId', 'sessionId', 'branchId', 'imageVersionId'];
        if (Object.keys(input).sort().join(',') !== allowed.sort().join(',') || Object.values(input).some(value => !text(value))) fail();
    }
    async describe(owner, input) {
        this.cleanup(); this.#validate(input); if (!text(owner)) fail();
        if (this.#handles.size >= this.maxEntries || [...this.#handles.values()].filter(item => item.owner === owner).length >= 8) throw new ConflictError('native_media_binary_capacity_conflict');
        const source = await this.#resolve(owner, input);
        const totalBytes = source.bytes?.length ?? source.ref?.size, contentHash = source.bytes ? digest(source.bytes) : source.ref?.contentHash;
        if (!Number.isSafeInteger(totalBytes) || totalBytes < 1 || totalBytes > limits[input.kind] || !/^[a-f0-9]{64}$/.test(contentHash ?? '') || !text(source.sourceRevision)) fail();
        const ref = { handleId: randomUUID(), clientInstanceId: input.clientInstanceId, serverBootId: this.bootId, purpose: purposes[input.kind], contentHash, totalBytes, sourceRevision: source.sourceRevision };
        const metadata = { ref, owner, sourceScope: source.sourceScope, mediaType: source.mediaType ?? source.ref.mediaType, expiresAt: this.now() + this.ttlMs, maxChunkBytes: MiB };
        this.#handles.set(ref.handleId, { ...metadata, input: structuredClone(input) }); return structuredClone(metadata);
    }
    async chunk(owner, ref, offset, length) {
        this.cleanup();
        if (!fields(ref) || Object.keys(ref).sort().join(',') !== [...refKeys].sort().join(',')) fail();
        const item = this.#handles.get(ref.handleId);
        if (!item || item.owner !== owner) throw new NotFoundError('Native media binary handle');
        if (!same(ref, item.ref)) throw new ConflictError('native_media_binary_binding_conflict');
        if (!Number.isSafeInteger(offset) || offset < 0 || offset >= ref.totalBytes || !Number.isSafeInteger(length) || length < 1 || length > Math.min(MiB, ref.totalBytes - offset)) fail();
        const source = await this.#resolve(owner, item.input);
        if (source.sourceRevision !== ref.sourceRevision || JSON.stringify(source.sourceScope) !== JSON.stringify(item.sourceScope)) throw new ConflictError('native_media_binary_source_conflict');
        let bytes;
        if (source.bytes) {
            if (source.bytes.length !== ref.totalBytes || digest(source.bytes) !== ref.contentHash) throw new ConflictError('native_media_binary_integrity_conflict');
            bytes = Buffer.from(source.bytes.subarray(offset, offset + length));
        } else {
            if (source.ref.contentHash !== ref.contentHash || source.ref.size !== ref.totalBytes) throw new ConflictError('native_media_binary_integrity_conflict');
            const delivery = await source.assets.openDelivery(owner, source.ref.assetId);
            if (!delivery) throw new NotFoundError('Native media asset');
            try {
                const parts = []; let total = 0;
                for await (const part of delivery.stream(offset, offset + length - 1)) { total += part.length; if (total > length) throw new ConflictError('native_media_binary_integrity_conflict'); parts.push(part); }
                bytes = Buffer.concat(parts);
            } finally { await delivery.close(); }
        }
        if (bytes.length !== length) throw new ConflictError('native_media_binary_integrity_conflict');
        return { bytes, contentHash: digest(bytes), ref: structuredClone(ref), offset };
    }
}

export function mountMcpMediaAssets(router, { getHost }) {
    const authority = new NativeMcpMediaAssets({ getHost });
    const route = operation => async (req, res) => {
        const owner = req.user?.profile?.handle;
        if (!owner) return res.sendStatus(401);
        res.set('Cache-Control', 'private, no-store');
        try { await operation(req, res, owner); } catch (error) { res.status(error.name === 'NotFoundError' ? 404 : error.name === 'ConflictError' ? 409 : 400).json({ error: error.code ?? 'native_media_binary_invalid' }); }
    };
    router.post('/visual/binary/describe', route(async (req, res, owner) => res.json(await authority.describe(owner, req.body))));
    router.get('/visual/binary/:handleId/chunk', route(async (req, res, owner) => {
        const ref = { handleId: req.params.handleId, clientInstanceId: req.query.clientInstanceId, serverBootId: req.query.serverBootId,
            purpose: req.query.purpose, contentHash: req.query.contentHash, totalBytes: Number(req.query.totalBytes), sourceRevision: req.query.sourceRevision };
        const result = await authority.chunk(owner, ref, Number(req.query.offset), Number(req.query.length));
        res.status(206).set({ 'Content-Type': 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Content-Length': String(result.bytes.length),
            'X-Atria-Chunk-Sha256': result.contentHash, ETag: '"' + ref.contentHash + '"',
            'Content-Range': `bytes ${result.offset}-${result.offset + result.bytes.length - 1}/${ref.totalBytes}` }).send(result.bytes);
    }));
}
