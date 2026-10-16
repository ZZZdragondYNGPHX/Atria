import { createHash, randomUUID } from 'node:crypto';

const MiB = 1024 * 1024;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const hashPattern = /^[a-f0-9]{64}$/;
const plain = value => {
    if (!value || typeof value !== 'object' || Object.prototype.toString.call(value) !== '[object Object]' || Reflect.ownKeys(value).length !== Object.keys(value).length) return false;
    const prototype = Object.getPrototypeOf(value);
    const constructor = prototype && Object.getOwnPropertyDescriptor(prototype, 'constructor')?.value;
    return prototype === null || Object.getPrototypeOf(prototype) === null
        && typeof constructor === 'function' && constructor.name === 'Object' && constructor.prototype === prototype;
};
const fail = message => { throw new Error('Binary Asset: ' + message); };
const text = (value, name, max = 256) => {
    if (typeof value !== 'string' || !value.length || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) fail('invalid ' + name);
    return value;
};
const integer = (value, name, min, max) => {
    if (!Number.isSafeInteger(value) || value < min || value > max) fail('invalid ' + name);
    return value;
};
const exactKeys = (value, keys, name) => {
    if (!plain(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail('invalid ' + name);
};

// This catalog is an internal adapter contract, never caller-provided tool input.
// Domain-specific limits come from Native Package, Resource Bundle and Mask APIs.
export const BINARY_ASSET_CATALOG = Object.freeze({
    'session-archive': Object.freeze({ maxBytes: 128 * MiB,
        authorities: Object.freeze(['native.session-archive']),
        operations: Object.freeze(['inspect', 'read', 'archive.preflight', 'archive.import']),
        mediaTypes: Object.freeze(['application/octet-stream', 'application/x-atria-save']) }),
    'package-archive': Object.freeze({ maxBytes: 128 * MiB,
        authorities: Object.freeze(['native.studio.package', 'native.asset', 'dev.package']),
        operations: Object.freeze(['inspect', 'read', 'package.preflight', 'package.install']),
        mediaTypes: Object.freeze(['application/octet-stream', 'application/x-atria-package']) }),
    'resource-bundle': Object.freeze({ maxBytes: 32 * MiB,
        authorities: Object.freeze(['native.resource-bundle']),
        operations: Object.freeze(['inspect', 'read', 'bundle.preflight', 'bundle.import']),
        mediaTypes: Object.freeze(['application/json']) }),
    'mask-checkpoint': Object.freeze({ maxBytes: 16 * MiB,
        authorities: Object.freeze(['native.asset', 'native.mask']),
        operations: Object.freeze(['inspect', 'read', 'mask.checkpoint']),
        mediaTypes: Object.freeze(['application/octet-stream', 'application/x-atria-mask-checkpoint', 'application/x-atria-mask-gray8']) }),
    'mask-raster': Object.freeze({ maxBytes: 16 * MiB,
        authorities: Object.freeze(['native.mask']), operations: Object.freeze(['inspect', 'read', 'mask.checkpoint']),
        mediaTypes: Object.freeze(['application/x-atria-mask-gray8']) }),
    'media-image': Object.freeze({ maxBytes: 32 * MiB,
        authorities: Object.freeze(['native.asset']), operations: Object.freeze(['inspect', 'read']),
        mediaTypes: Object.freeze(['image/png', 'image/jpeg', 'image/webp', 'image/avif']) }),
    'media-thumbnail': Object.freeze({ maxBytes: MiB,
        authorities: Object.freeze(['native.asset']), operations: Object.freeze(['inspect', 'read']), mediaTypes: Object.freeze(['image/png']) }),
    'speech-audio': Object.freeze({ maxBytes: 16 * MiB,
        authorities: Object.freeze(['native.asset']), operations: Object.freeze(['inspect', 'read']), mediaTypes: Object.freeze(['audio/wav']) }),
});

function bindingValue(value) {
    exactKeys(value, ['owner', 'clientInstanceId', 'purpose', 'sourceAuthority', 'sourceScope', 'sourceRevision', 'allowedOperations'], 'binding');
    const catalog = BINARY_ASSET_CATALOG[value.purpose];
    if (!catalog || !Object.hasOwn(BINARY_ASSET_CATALOG, value.purpose)) fail('unsupported purpose');
    if (!catalog.authorities.includes(value.sourceAuthority)) fail('untrusted source authority');
    if (!plain(value.sourceScope) || !Object.keys(value.sourceScope).length || Object.keys(value.sourceScope).length > 16) fail('invalid source scope');
    const sourceScope = Object.fromEntries(Object.keys(value.sourceScope).sort().map(key => {
        if (!/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(key) || ['constructor', 'prototype', '__proto__'].includes(key)) fail('invalid source scope key');
        return [key, text(value.sourceScope[key], 'source scope value', 512)];
    }));
    if (Buffer.byteLength(JSON.stringify(sourceScope)) > 4096) fail('source scope exceeds bound');
    if (!Array.isArray(value.allowedOperations) || !value.allowedOperations.includes('inspect')
        || new Set(value.allowedOperations).size !== value.allowedOperations.length
        || value.allowedOperations.some(operation => !catalog.operations.includes(operation))) fail('invalid allowed operations');
    return { owner: text(value.owner, 'owner'), clientInstanceId: text(value.clientInstanceId, 'client instance'),
        purpose: value.purpose, sourceAuthority: value.sourceAuthority, sourceScope,
        sourceRevision: text(value.sourceRevision, 'source revision'), allowedOperations: [...value.allowedOperations].sort() };
}

// Payloads are deliberately unsuitable for a JSON tool result, Receipt or Journal.
// A fixed transport adapter must explicitly consume bytes and forward them through
// a native binary/resource channel. This object confers no business authorization.
export class BinaryAssetPayload {
    #bytes;
    constructor(bytes) { this.#bytes = Buffer.from(bytes); Object.freeze(this); }
    get bytes() { return Buffer.from(this.#bytes); }
    get size() { return this.#bytes.length; }
    toJSON() { fail('payload bytes cannot be serialized into JSON'); }
}

/** Ephemeral bounded byte transport. No product persistence or business retries. */
export class BinaryAssets {
    #items = new Map();
    #reservedBytes = 0;
    constructor({ now = Date.now, maxEntries = 8, maxTotalBytes = 256 * MiB, maxChunkBytes = MiB, maxTtlMs = 900000, limitsByPurpose = {} } = {}) {
        if (typeof now !== 'function') fail('invalid clock');
        this.now = now;
        this.maxEntries = integer(maxEntries, 'entry capacity', 1, 1024);
        this.maxTotalBytes = integer(maxTotalBytes, 'total capacity', 1, 1024 * MiB);
        this.maxChunkBytes = integer(maxChunkBytes, 'chunk bound', 1, 4 * MiB);
        this.maxTtlMs = integer(maxTtlMs, 'TTL bound', 1, 3600000);
        if (!plain(limitsByPurpose)) fail('invalid purpose limits');
        this.limits = Object.fromEntries(Object.entries(BINARY_ASSET_CATALOG).map(([purpose, catalog]) => [purpose, catalog.maxBytes]));
        for (const [purpose, limit] of Object.entries(limitsByPurpose)) {
            if (!Object.hasOwn(this.limits, purpose)) fail('unsupported purpose limit');
            this.limits[purpose] = integer(limit, 'purpose limit', 1, this.limits[purpose]);
        }
        Object.freeze(this.limits);
        Object.freeze(this);
    }
    #metadata(item) {
        return structuredClone({ handleId: item.handleId, binding: item.binding, contentHash: item.contentHash,
            totalBytes: item.totalBytes, receivedBytes: item.receivedBytes, mediaType: item.mediaType,
            expiresAt: item.expiresAt, state: item.state,
            authorization: 'transport only; owning Native action and independent approval are still required' });
    }
    #release(item) {
        if (item.buffer) { item.buffer.fill(0); item.buffer = null; this.#reservedBytes -= item.totalBytes; }
    }
    #invalidate(item, message) { this.#release(item); item.state = 'invalid'; fail(message); }
    #item(handleId, binding, operation = 'inspect') {
        this.cleanup();
        const item = this.#items.get(handleId);
        if (!item) fail('unknown or expired handle');
        if (JSON.stringify(bindingValue(binding)) !== JSON.stringify(item.binding)) fail('binding mismatch');
        if (!item.binding.allowedOperations.includes(operation)) fail('operation not permitted');
        return item;
    }
    begin({ binding, contentHash, totalBytes, mediaType, ttlMs = this.maxTtlMs }) {
        this.cleanup();
        const normalized = bindingValue(binding), catalog = BINARY_ASSET_CATALOG[normalized.purpose];
        if (typeof contentHash !== 'string' || !hashPattern.test(contentHash)) fail('invalid content hash');
        integer(totalBytes, 'total bytes', 1, this.limits[normalized.purpose]);
        integer(ttlMs, 'TTL', 1, this.maxTtlMs);
        if (!catalog.mediaTypes.includes(mediaType)) fail('invalid media type');
        if (this.#items.size >= this.maxEntries || this.#reservedBytes + totalBytes > this.maxTotalBytes) fail('capacity exhausted');
        const createdAt = integer(this.now(), 'current time', 0, Number.MAX_SAFE_INTEGER - ttlMs);
        const item = { handleId: randomUUID(), binding: normalized, contentHash, totalBytes, receivedBytes: 0,
            mediaType, expiresAt: createdAt + ttlMs, state: 'receiving', buffer: Buffer.alloc(totalBytes) };
        this.#items.set(item.handleId, item); this.#reservedBytes += totalBytes;
        return this.#metadata(item);
    }
    writeChunk(handleId, { binding, offset, bytes, chunkHash }) {
        const item = this.#item(handleId, binding);
        if (item.state !== 'receiving') fail('handle is not receiving');
        if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > this.maxChunkBytes) this.#invalidate(item, 'invalid chunk size');
        if (!Number.isSafeInteger(offset) || offset !== item.receivedBytes || offset + bytes.length > item.totalBytes) this.#invalidate(item, 'chunk order or total length mismatch');
        if (typeof chunkHash !== 'string' || !hashPattern.test(chunkHash) || sha256(bytes) !== chunkHash) this.#invalidate(item, 'chunk hash mismatch');
        bytes.copy(item.buffer, offset); item.receivedBytes += bytes.length;
        return { ...this.#metadata(item), chunkHash, nextOffset: item.receivedBytes };
    }
    finalize(handleId, { binding }) {
        const item = this.#item(handleId, binding);
        if (item.state !== 'receiving') fail('handle is not receiving');
        if (item.receivedBytes !== item.totalBytes) this.#invalidate(item, 'incomplete transfer');
        if (sha256(item.buffer) !== item.contentHash) this.#invalidate(item, 'complete content hash mismatch');
        item.state = 'complete';
        return this.#metadata(item);
    }
    inspect(handleId, { binding }) { return this.#metadata(this.#item(handleId, binding)); }
    getBytes(handleId, { binding, operation }) {
        if (!operation || operation === 'inspect') fail('explicit binary consumer operation required');
        const item = this.#item(handleId, binding, operation);
        if (item.state !== 'complete') fail('complete handle required');
        return new BinaryAssetPayload(item.buffer);
    }
    readChunk(handleId, { binding, operation = 'read', offset, length }) {
        if (operation === 'inspect') fail('explicit binary consumer operation required');
        const item = this.#item(handleId, binding, operation);
        if (item.state !== 'complete') fail('complete handle required');
        integer(offset, 'read offset', 0, item.totalBytes - 1);
        integer(length, 'read length', 1, Math.min(this.maxChunkBytes, item.totalBytes - offset));
        const bytes = item.buffer.subarray(offset, offset + length);
        return { handleId, offset, length, chunkHash: sha256(bytes), payload: new BinaryAssetPayload(bytes) };
    }
    cancel(handleId, { binding }) {
        const item = this.#item(handleId, binding);
        this.#release(item); this.#items.delete(handleId);
        return { handleId, state: 'cancelled' };
    }
    cleanup() {
        const now = this.now();
        for (const [id, item] of this.#items) if (item.expiresAt <= now) { this.#release(item); this.#items.delete(id); }
    }
    clear() { for (const item of this.#items.values()) this.#release(item); this.#items.clear(); }
    get capacity() { this.cleanup(); return { entries: this.#items.size, reservedBytes: this.#reservedBytes, maxEntries: this.maxEntries, maxTotalBytes: this.maxTotalBytes, maxChunkBytes: this.maxChunkBytes }; }
}
