import { createHash, randomUUID } from 'node:crypto';
import { serverBootId } from '../logging/startup-store.js';
import { ConflictError, NotFoundError } from '../storage/errors.js';

const MiB = 1024 * 1024;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const invalid = () => { throw Object.assign(new TypeError('Invalid Native artifact request'), { code: 'native_artifact_invalid_request' }); };
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value);
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const refKeys = ['artifactId', 'contentHash', 'totalBytes', 'sourceRevision', 'clientInstanceId', 'serverBootId'];

// Short-lived transfer staging only. PackageRepo/PackageInstaller remain the
// owning version, install and persistence authorities. No automatic retries.
export class NativeMcpArtifacts {
    #items = new Map();
    #reservedBytes = 0;
    constructor({ now = Date.now, bootId = serverBootId, ttlMs = 900000, maxEntries = 8, maxOwnerEntries = 4, maxTotalBytes = 256 * MiB, maxArtifactBytes = 128 * MiB, maxChunkBytes = MiB } = {}) {
        if (typeof now !== 'function' || !identifier(bootId) || !integer(ttlMs, 1, 900000)
            || !integer(maxEntries, 1, 64) || !integer(maxOwnerEntries, 1, maxEntries) || !integer(maxTotalBytes, 1, 256 * MiB)
            || !integer(maxArtifactBytes, 1, 128 * MiB) || !integer(maxChunkBytes, 1, MiB)) invalid();
        Object.assign(this, { now, bootId, ttlMs, maxEntries, maxOwnerEntries, maxTotalBytes, maxArtifactBytes, maxChunkBytes });
        Object.freeze(this);
    }
    #ref(item) { return Object.fromEntries(refKeys.map(key => [key, item[key]])); }
    #metadata(item) {
        return { artifactRef: this.#ref(item), owner: item.owner, source: structuredClone(item.source),
            mediaType: 'application/octet-stream', expiresAt: item.expiresAt, receivedBytes: item.receivedBytes, state: item.state, maxChunkBytes: this.maxChunkBytes };
    }
    #drop(item) {
        if (item.readers) return;
        item.bytes.fill(0); this.#reservedBytes -= item.totalBytes; this.#items.delete(item.artifactId);
    }
    cleanup() { for (const item of this.#items.values()) if (item.expiresAt <= this.now()) this.#drop(item); }
    #reserve(owner, clientInstanceId, contentHash, totalBytes, sourceRevision, source) {
        this.cleanup();
        if (!identifier(owner) || !identifier(clientInstanceId) || !identifier(sourceRevision)
            || typeof contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(contentHash) || !integer(totalBytes, 1, this.maxArtifactBytes)) invalid();
        if (this.#items.size >= this.maxEntries || [...this.#items.values()].filter(item => item.owner === owner).length >= this.maxOwnerEntries
            || this.#reservedBytes + totalBytes > this.maxTotalBytes) throw new ConflictError('native_artifact_capacity_conflict');
        const item = { artifactId: randomUUID(), owner, clientInstanceId, contentHash, totalBytes, sourceRevision,
            serverBootId: this.bootId, source, expiresAt: this.now() + this.ttlMs, state: 'receiving', receivedBytes: 0, readers: 0, bytes: Buffer.alloc(totalBytes) };
        this.#items.set(item.artifactId, item); this.#reservedBytes += totalBytes;
        return item;
    }
    #get(owner, ref, complete = false) {
        this.cleanup();
        if (!exactKeys(ref, refKeys)) invalid();
        const item = this.#items.get(ref.artifactId);
        if (!item || item.owner !== owner || item.expiresAt <= this.now()) throw new NotFoundError('Native artifact');
        if (refKeys.some(key => ref[key] !== item[key])) throw new ConflictError('native_artifact_binding_conflict');
        if (complete && item.state !== 'complete') throw new ConflictError('native_artifact_incomplete_conflict');
        return item;
    }
    begin(owner, input) {
        if (!exactKeys(input, ['clientInstanceId', 'contentHash', 'totalBytes'])) invalid();
        return this.#metadata(this.#reserve(owner, input.clientInstanceId, input.contentHash, input.totalBytes, input.contentHash, { kind: 'development-upload' }));
    }
    beginSessionArchive(owner, input) {
        if (!exactKeys(input, ['clientInstanceId', 'contentHash', 'totalBytes'])) invalid();
        return this.#metadata(this.#reserve(owner, input.clientInstanceId, input.contentHash, input.totalBytes, input.contentHash, { kind: 'session-archive-upload' }));
    }
    beginSource(owner, input, kind, bindingHash) {
        const limits = { 'skill-payload-upload': 128 * MiB, 'extension-source-upload': 4 * MiB };
        if (!Object.hasOwn(limits, kind) || !exactKeys(input, ['clientInstanceId', 'contentHash', 'totalBytes'])
            || !/^[a-f0-9]{64}$/.test(bindingHash ?? '') || !integer(input.totalBytes, 1, limits[kind])) invalid();
        return this.#metadata(this.#reserve(owner, input.clientInstanceId, input.contentHash, input.totalBytes, input.contentHash, { kind, bindingHash }));
    }
    async withSource(owner, ref, kind, bindingHash, consumer) {
        const item = this.#get(owner, ref, true);
        if (!['skill-payload-upload', 'extension-source-upload'].includes(kind) || item.source.kind !== kind || item.source.bindingHash !== bindingHash)
            throw new ConflictError('native_artifact_purpose_conflict');
        return this.withBytes(owner, ref, consumer);
    }
    captureSkillEmbed(owner, clientInstanceId, bindingHash, bytes) {
        if (!Buffer.isBuffer(bytes) || !/^[a-f0-9]{64}$/.test(bindingHash ?? '')) invalid();
        const item = this.#reserve(owner, clientInstanceId, digest(bytes), bytes.length, digest(bytes), { kind: 'skill-payload-upload', bindingHash });
        bytes.copy(item.bytes); item.receivedBytes = bytes.length; item.state = 'complete'; return this.#metadata(item);
    }
    captureSessionArchive(owner, clientInstanceId, sessionId, revisionId, saveId, bytes) {
        if (!identifier(sessionId) || !identifier(revisionId) || saveId !== null && !identifier(saveId) || !Buffer.isBuffer(bytes)) invalid();
        const item = this.#reserve(owner, clientInstanceId, digest(bytes), bytes.length, revisionId, { kind: 'session-archive', sessionId, revisionId, saveId });
        bytes.copy(item.bytes); item.receivedBytes = bytes.length; item.state = 'complete'; return this.#metadata(item);
    }
    async withSessionArchive(owner, ref, consumer) {
        const item = this.#get(owner, ref, true);
        if (!['session-archive', 'session-archive-upload'].includes(item.source.kind)) throw new ConflictError('native_artifact_purpose_conflict');
        return this.withBytes(owner, ref, consumer);
    }
    captureBuild(owner, clientInstanceId, projectId, revision, bytes) {
        if (!identifier(projectId) || !Buffer.isBuffer(bytes)) invalid();
        const item = this.#reserve(owner, clientInstanceId, digest(bytes), bytes.length, revision, { kind: 'studio-project', projectId, revision });
        bytes.copy(item.bytes); item.receivedBytes = bytes.length; item.state = 'complete';
        return this.#metadata(item);
    }
    capturePackage(owner, clientInstanceId, packageId, packageVersionId, expectedContentHash, bytes) {
        if (!identifier(packageId) || !identifier(packageVersionId) || !Buffer.isBuffer(bytes) || digest(bytes) !== expectedContentHash) invalid();
        const item = this.#reserve(owner, clientInstanceId, expectedContentHash, bytes.length, packageVersionId,
            { kind: 'installed-package', packageId, packageVersionId });
        bytes.copy(item.bytes); item.receivedBytes = bytes.length; item.state = 'complete'; return this.#metadata(item);
    }
    write(owner, ref, offset, bytes, chunkHash) {
        const item = this.#get(owner, ref);
        if (item.state !== 'receiving') throw new ConflictError('native_artifact_state_conflict');
        if (!Buffer.isBuffer(bytes) || !integer(bytes.length, 1, this.maxChunkBytes) || !integer(offset, 0, item.totalBytes - 1)
            || offset !== item.receivedBytes || offset + bytes.length > item.totalBytes || digest(bytes) !== chunkHash) {
            this.#drop(item); throw new ConflictError('native_artifact_chunk_conflict');
        }
        bytes.copy(item.bytes, offset); item.receivedBytes += bytes.length;
        return this.#metadata(item);
    }
    finalize(owner, ref) {
        const item = this.#get(owner, ref);
        if (item.state !== 'receiving') throw new ConflictError('native_artifact_state_conflict');
        if (item.receivedBytes !== item.totalBytes || digest(item.bytes) !== item.contentHash) {
            this.#drop(item); throw new ConflictError('native_artifact_integrity_conflict');
        }
        item.state = 'complete'; return this.#metadata(item);
    }
    inspect(owner, ref) { return this.#metadata(this.#get(owner, ref)); }
    readChunk(owner, ref, offset, length) {
        const item = this.#get(owner, ref, true);
        if (!integer(offset, 0, item.totalBytes - 1) || !integer(length, 1, Math.min(this.maxChunkBytes, item.totalBytes - offset))) invalid();
        const bytes = Buffer.from(item.bytes.subarray(offset, offset + length));
        return { bytes, contentHash: digest(bytes), totalBytes: item.totalBytes, offset };
    }
    async withBytes(owner, ref, consumer) {
        const item = this.#get(owner, ref, true);
        item.readers++;
        try {
            if (digest(item.bytes) !== item.contentHash) throw new ConflictError('native_artifact_integrity_conflict');
            return await consumer(item.bytes);
        } finally { item.readers--; this.cleanup(); }
    }
    cancel(owner, ref) {
        const item = this.#get(owner, ref);
        if (item.readers) throw new ConflictError('native_artifact_in_use_conflict');
        this.#drop(item); return { artifactId: item.artifactId, state: 'cancelled' };
    }
    clear() { for (const item of this.#items.values()) this.#drop(item); }
    get capacity() { this.cleanup(); return { entries: this.#items.size, reservedBytes: this.#reservedBytes }; }
}

export const nativeMcpArtifacts = new NativeMcpArtifacts();

export function artifactRefFromQuery(req) {
    return { artifactId: req.params.artifactId, contentHash: req.query.contentHash, totalBytes: Number(req.query.totalBytes),
        sourceRevision: req.query.sourceRevision, clientInstanceId: req.query.clientInstanceId, serverBootId: req.query.serverBootId };
}
