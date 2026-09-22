import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';

import AdmZip from 'adm-zip';

import {
    ATRIA_SAVE_SCHEMA_VERSION,
    NATIVE_SCHEMA_VERSION,
    assertAtriaSave,
} from './contracts.js';

export const ATRIA_SAVE_CONTAINER_FORMAT = 'atria-save-container';
export const ATRIA_SAVE_CONTAINER_VERSION = 1;
export const ATRIA_SAVE_CONTAINER_MAGIC = Buffer.from('ATRIASV1', 'ascii');

export const ATRIA_SAVE_CONTAINER_LIMITS = Object.freeze({
    maxContainerBytes: 256 * 1024 * 1024,
    maxHeaderBytes: 64 * 1024,
    maxEntries: 4096,
    maxFileBytes: 64 * 1024 * 1024,
    maxTotalUncompressedBytes: 512 * 1024 * 1024,
    maxCompressionRatio: 200,
    maxPathLength: 512,
    maxSegmentLength: 255,
});

const SAVE_PATH = 'save.json';
const INVENTORY_PATH = 'inventory.json';
const TAG_BYTES = 16;
const FIXED_PREFIX_BYTES = ATRIA_SAVE_CONTAINER_MAGIC.length + 4;
const STANDARD_KEY_LABEL = Buffer.from('Atria Save Container v1\0', 'utf8');
const PASSWORD_KDF = Object.freeze({
    name: 'scrypt',
    N: 16384,
    r: 8,
    p: 1,
    keyLength: 32,
});

function toBuffer(value, label = '.atriasave container') {
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    throw new TypeError(label + ' must be a Buffer or Uint8Array');
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

function portableKey(salt) {
    return createHash('sha256').update(STANDARD_KEY_LABEL).update(salt).digest();
}

function passwordKey(password, salt) {
    if (typeof password !== 'string' || password.length === 0 || password.length > 4096) {
        const error = new Error('.atriasave password is required');
        error.code = 'native_save_password_required';
        throw error;
    }
    return scryptSync(password, salt, PASSWORD_KDF.keyLength, {
        N: PASSWORD_KDF.N,
        r: PASSWORD_KDF.r,
        p: PASSWORD_KDF.p,
        maxmem: 64 * 1024 * 1024,
    });
}

function keyForProtection(protection, password) {
    const salt = Buffer.from(protection.salt, 'base64');
    if (protection.keyMode === 'atria-portable-obfuscation-v1') return portableKey(salt);
    if (protection.keyMode === 'password-scrypt-v1') return passwordKey(password, salt);
    throw new Error('Unsupported .atriasave protection key mode');
}

function safePath(entryPath) {
    if (typeof entryPath !== 'string' || entryPath.length === 0
        || entryPath.length > ATRIA_SAVE_CONTAINER_LIMITS.maxPathLength) {
        throw new Error('.atriasave payload path is invalid');
    }
    if (entryPath.includes('\\') || entryPath.startsWith('/') || entryPath.includes('\0')) {
        throw new Error('.atriasave payload path is unsafe');
    }
    const parts = entryPath.split('/');
    if (parts.some(part => !part || part === '.' || part === '..'
        || part.length > ATRIA_SAVE_CONTAINER_LIMITS.maxSegmentLength)) {
        throw new Error('.atriasave payload path contains an illegal segment');
    }
    return entryPath;
}

function normalizeAssetPayloads(save, input) {
    if (!(input instanceof Map)) throw new TypeError('.atriasave asset payloads must be a Map');
    const declared = new Map(save.closure.assetRefs.map(ref => [ref.assetId, ref]));
    const out = new Map();
    for (const [assetId, rawBytes] of input) {
        const ref = declared.get(assetId);
        if (!ref) throw new Error('.atriasave asset payload is undeclared: ' + assetId);
        const bytes = toBuffer(rawBytes, '.atriasave asset');
        if (bytes.length !== ref.size || sha256(bytes) !== ref.contentHash) {
            throw new Error('.atriasave asset payload integrity mismatch: ' + assetId);
        }
        out.set('assets/' + assetId, bytes);
    }
    for (const ref of save.closure.assetRefs) {
        if (!out.has('assets/' + ref.assetId)) {
            throw new Error('.atriasave asset payload is missing: ' + ref.assetId);
        }
    }
    return out;
}

function buildInnerPayload(save, assetPayloads) {
    const saveBytes = Buffer.from(JSON.stringify(save), 'utf8');
    const contents = new Map([[SAVE_PATH, saveBytes], ...normalizeAssetPayloads(save, assetPayloads)]);
    if (contents.size > ATRIA_SAVE_CONTAINER_LIMITS.maxEntries - 1) {
        throw new Error('.atriasave payload exceeds the archive entry limit');
    }
    let total = 0;
    const entries = [...contents.entries()]
        .map(([entryPath, bytes]) => {
            safePath(entryPath);
            if (bytes.length > ATRIA_SAVE_CONTAINER_LIMITS.maxFileBytes) {
                throw new Error('.atriasave payload file exceeds size limit: ' + entryPath);
            }
            total += bytes.length;
            return { path: entryPath, size: bytes.length, sha256: sha256(bytes) };
        })
        .sort((a, b) => a.path.localeCompare(b.path));
    if (total > ATRIA_SAVE_CONTAINER_LIMITS.maxTotalUncompressedBytes) {
        throw new Error('.atriasave payload exceeds total uncompressed size limit');
    }
    const inventory = {
        algorithm: 'sha256',
        entries,
        inventorySha256: sha256(Buffer.from(JSON.stringify(entries), 'utf8')),
    };
    const zip = new AdmZip();
    zip.addFile(INVENTORY_PATH, Buffer.from(JSON.stringify(inventory), 'utf8'));
    for (const [entryPath, bytes] of contents) zip.addFile(entryPath, bytes);
    return zip.toBuffer();
}

function buildProtection(password) {
    const salt = randomBytes(16);
    const nonce = randomBytes(12);
    if (password === undefined || password === null) {
        return {
            algorithm: 'aes-256-gcm',
            keyMode: 'atria-portable-obfuscation-v1',
            salt: salt.toString('base64'),
            nonce: nonce.toString('base64'),
        };
    }
    passwordKey(password, salt);
    return {
        algorithm: 'aes-256-gcm',
        keyMode: 'password-scrypt-v1',
        salt: salt.toString('base64'),
        nonce: nonce.toString('base64'),
        kdf: { ...PASSWORD_KDF },
    };
}

function buildHeader(save, payload, protection) {
    return {
        format: ATRIA_SAVE_CONTAINER_FORMAT,
        containerVersion: ATRIA_SAVE_CONTAINER_VERSION,
        saveSchemaVersion: save.schemaVersion,
        nativeSchemaVersion: save.nativeSchemaVersion,
        scope: save.scope,
        exportedAt: save.exportedAt,
        package: structuredClone(save.package),
        root: structuredClone(save.root),
        payloadBytes: payload.length,
        payloadSha256: sha256(payload),
        protection,
    };
}

function validateHeader(header) {
    if (!header || typeof header !== 'object' || Array.isArray(header)) {
        throw new Error('.atriasave preflight header must be an object');
    }
    if (
        header.format !== ATRIA_SAVE_CONTAINER_FORMAT
        || header.containerVersion !== ATRIA_SAVE_CONTAINER_VERSION
        || header.saveSchemaVersion !== ATRIA_SAVE_SCHEMA_VERSION
        || header.nativeSchemaVersion !== NATIVE_SCHEMA_VERSION
    ) {
        throw new Error('Unsupported .atriasave container version');
    }
    if (!['snapshot', 'session'].includes(header.scope)) throw new Error('.atriasave scope is unsupported');
    if (!Number.isSafeInteger(header.exportedAt) || header.exportedAt < 0) {
        throw new Error('.atriasave exportedAt is malformed');
    }
    if (!header.package || typeof header.package !== 'object' || !header.root || typeof header.root !== 'object') {
        throw new Error('.atriasave dependency/root preflight metadata is malformed');
    }
    if (
        !Number.isInteger(header.payloadBytes)
        || header.payloadBytes < 0
        || header.payloadBytes > ATRIA_SAVE_CONTAINER_LIMITS.maxContainerBytes
        || !/^[a-f0-9]{64}$/.test(String(header.payloadSha256 || ''))
    ) {
        throw new Error('.atriasave payload metadata is malformed');
    }
    if (header.protection?.algorithm !== 'aes-256-gcm'
        || !['atria-portable-obfuscation-v1', 'password-scrypt-v1'].includes(header.protection?.keyMode)) {
        throw new Error('.atriasave protection metadata is unsupported');
    }
    const salt = Buffer.from(String(header.protection.salt || ''), 'base64');
    const nonce = Buffer.from(String(header.protection.nonce || ''), 'base64');
    if (salt.length !== 16 || nonce.length !== 12) throw new Error('.atriasave protection salt/nonce is malformed');
    if (header.protection.keyMode === 'password-scrypt-v1') {
        const kdf = header.protection.kdf;
        if (!kdf || kdf.name !== PASSWORD_KDF.name || kdf.N !== PASSWORD_KDF.N
            || kdf.r !== PASSWORD_KDF.r || kdf.p !== PASSWORD_KDF.p
            || kdf.keyLength !== PASSWORD_KDF.keyLength) {
            throw new Error('.atriasave password KDF metadata is unsupported');
        }
    }
}

function encodeEnvelope(header, payload, password) {
    const headerBytes = Buffer.from(JSON.stringify(header), 'utf8');
    if (headerBytes.length > ATRIA_SAVE_CONTAINER_LIMITS.maxHeaderBytes) {
        throw new Error('.atriasave preflight header exceeds limit');
    }
    const nonce = Buffer.from(header.protection.nonce, 'base64');
    const cipher = createCipheriv('aes-256-gcm', keyForProtection(header.protection, password), nonce);
    cipher.setAAD(headerBytes);
    const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
    const tag = cipher.getAuthTag();
    const prefix = Buffer.alloc(FIXED_PREFIX_BYTES);
    ATRIA_SAVE_CONTAINER_MAGIC.copy(prefix, 0);
    prefix.writeUInt32BE(headerBytes.length, ATRIA_SAVE_CONTAINER_MAGIC.length);
    const archive = Buffer.concat([prefix, headerBytes, ciphertext, tag]);
    if (archive.length > ATRIA_SAVE_CONTAINER_LIMITS.maxContainerBytes) {
        throw new Error('.atriasave container exceeds compressed size limit');
    }
    return archive;
}

function decodeHeader(archiveInput) {
    const archive = toBuffer(archiveInput);
    if (archive.length < FIXED_PREFIX_BYTES + TAG_BYTES
        || archive.length > ATRIA_SAVE_CONTAINER_LIMITS.maxContainerBytes) {
        throw new Error('.atriasave container size is outside supported limits');
    }
    if (!archive.subarray(0, ATRIA_SAVE_CONTAINER_MAGIC.length).equals(ATRIA_SAVE_CONTAINER_MAGIC)) {
        throw new Error('Unsupported .atriasave magic/header');
    }
    const headerLength = archive.readUInt32BE(ATRIA_SAVE_CONTAINER_MAGIC.length);
    if (headerLength <= 0 || headerLength > ATRIA_SAVE_CONTAINER_LIMITS.maxHeaderBytes) {
        throw new Error('.atriasave preflight header length is invalid');
    }
    const headerStart = FIXED_PREFIX_BYTES;
    const headerEnd = headerStart + headerLength;
    if (headerEnd + TAG_BYTES > archive.length) throw new Error('.atriasave container is truncated');
    let header;
    try {
        header = JSON.parse(archive.subarray(headerStart, headerEnd).toString('utf8'));
    } catch (error) {
        throw new Error('.atriasave preflight header is malformed: ' + (error?.message || String(error)));
    }
    validateHeader(header);
    const ciphertextEnd = archive.length - TAG_BYTES;
    if (ciphertextEnd - headerEnd !== header.payloadBytes) {
        throw new Error('.atriasave payload length does not match preflight header');
    }
    return {
        archive,
        header,
        headerBytes: archive.subarray(headerStart, headerEnd),
        ciphertext: archive.subarray(headerEnd, ciphertextEnd),
        tag: archive.subarray(ciphertextEnd),
    };
}

function decryptPayload(decoded, password) {
    const nonce = Buffer.from(decoded.header.protection.nonce, 'base64');
    const decipher = createDecipheriv(
        'aes-256-gcm',
        keyForProtection(decoded.header.protection, password),
        nonce,
    );
    decipher.setAAD(decoded.headerBytes);
    decipher.setAuthTag(decoded.tag);
    let payload;
    try {
        payload = Buffer.concat([decipher.update(decoded.ciphertext), decipher.final()]);
    } catch {
        const error = new Error('.atriasave payload authentication failed');
        error.code = 'native_save_authentication_failed';
        throw error;
    }
    if (payload.length !== decoded.header.payloadBytes || sha256(payload) !== decoded.header.payloadSha256) {
        throw new Error('.atriasave payload integrity mismatch');
    }
    return payload;
}

function validateZipEntries(entries) {
    const names = new Set();
    let total = 0;
    for (const entry of entries) {
        const name = safePath(entry.entryName);
        if (names.has(name)) throw new Error('.atriasave payload contains duplicate paths');
        names.add(name);
        if (entry.isDirectory) continue;
        const size = Number(entry?.header?.size ?? entry?.header?.uncompressedSize ?? 0);
        const compressed = Number(entry?.header?.compressedSize ?? 0);
        if (!Number.isFinite(size) || size < 0 || size > ATRIA_SAVE_CONTAINER_LIMITS.maxFileBytes) {
            throw new Error('.atriasave payload file exceeds size limit');
        }
        if (compressed > 0 && size / compressed > ATRIA_SAVE_CONTAINER_LIMITS.maxCompressionRatio) {
            throw new Error('.atriasave payload compression ratio is unsafe');
        }
        total += size;
        if (total > ATRIA_SAVE_CONTAINER_LIMITS.maxTotalUncompressedBytes) {
            throw new Error('.atriasave payload exceeds total uncompressed size limit');
        }
    }
}

function inspectPayload(payload, header) {
    let entries;
    try {
        entries = new AdmZip(payload).getEntries();
    } catch (error) {
        throw new Error('Malformed .atriasave payload archive: ' + (error?.message || String(error)));
    }
    if (entries.length < 2 || entries.length > ATRIA_SAVE_CONTAINER_LIMITS.maxEntries) {
        throw new Error('.atriasave payload entry count is outside supported limits');
    }
    validateZipEntries(entries);
    const byName = new Map(entries.filter(entry => !entry.isDirectory).map(entry => [entry.entryName, entry]));
    const saveEntry = byName.get(SAVE_PATH);
    const inventoryEntry = byName.get(INVENTORY_PATH);
    if (!saveEntry || !inventoryEntry) throw new Error('.atriasave payload is missing save.json or inventory.json');

    let save;
    let inventory;
    try {
        save = assertAtriaSave(JSON.parse(saveEntry.getData().toString('utf8')));
        inventory = JSON.parse(inventoryEntry.getData().toString('utf8'));
    } catch (error) {
        throw new Error('.atriasave metadata is invalid: ' + (error?.message || String(error)));
    }
    if (
        inventory?.algorithm !== 'sha256'
        || !Array.isArray(inventory.entries)
        || inventory.inventorySha256 !== sha256(Buffer.from(JSON.stringify(inventory.entries), 'utf8'))
    ) {
        throw new Error('.atriasave inventory metadata is invalid');
    }
    const expected = new Map();
    for (const item of inventory.entries) {
        safePath(item?.path);
        if (!Number.isSafeInteger(item?.size) || item.size < 0
            || !/^[a-f0-9]{64}$/.test(String(item?.sha256 || ''))
            || expected.has(item.path)) {
            throw new Error('.atriasave inventory entry is invalid');
        }
        expected.set(item.path, item);
    }
    const contentEntries = [...byName.entries()].filter(([name]) => name !== INVENTORY_PATH);
    if (contentEntries.length !== expected.size) throw new Error('.atriasave inventory does not match payload file count');
    for (const [name, entry] of contentEntries) {
        const item = expected.get(name);
        if (!item) throw new Error('Undeclared .atriasave payload file: ' + name);
        const data = entry.getData();
        if (data.length !== item.size || sha256(data) !== item.sha256) {
            throw new Error('Integrity mismatch for .atriasave file: ' + name);
        }
    }

    if (
        save.scope !== header.scope
        || save.exportedAt !== header.exportedAt
        || JSON.stringify(save.package) !== JSON.stringify(header.package)
        || JSON.stringify(save.root) !== JSON.stringify(header.root)
    ) {
        throw new Error('.atriasave preflight metadata does not match authenticated save document');
    }

    const assets = new Map();
    const declared = new Map(save.closure.assetRefs.map(ref => [ref.assetId, ref]));
    for (const [name, entry] of contentEntries) {
        if (!name.startsWith('assets/')) continue;
        const assetId = name.slice('assets/'.length);
        const ref = declared.get(assetId);
        if (!ref) throw new Error('Undeclared .atriasave asset payload: ' + assetId);
        const bytes = entry.getData();
        if (bytes.length !== ref.size || sha256(bytes) !== ref.contentHash) {
            throw new Error('Corrupt .atriasave asset payload: ' + assetId);
        }
        assets.set(assetId, bytes);
    }
    if (assets.size !== declared.size) throw new Error('.atriasave is missing a declared asset payload');

    return Object.freeze({ save, assets });
}

export function preflightAtriaSaveContainer(archiveInput) {
    const { header } = decodeHeader(archiveInput);
    return Object.freeze({
        format: header.format,
        containerVersion: header.containerVersion,
        saveSchemaVersion: header.saveSchemaVersion,
        nativeSchemaVersion: header.nativeSchemaVersion,
        scope: header.scope,
        exportedAt: header.exportedAt,
        package: Object.freeze(structuredClone(header.package)),
        root: Object.freeze(structuredClone(header.root)),
        protection: Object.freeze({
            algorithm: header.protection.algorithm,
            keyMode: header.protection.keyMode,
            requiresPassword: header.protection.keyMode === 'password-scrypt-v1',
        }),
        payloadBytes: header.payloadBytes,
    });
}

export function buildAtriaSaveContainer({
    save: saveInput,
    assetPayloads = new Map(),
    password = undefined,
}) {
    const save = assertAtriaSave(saveInput);
    const payload = buildInnerPayload(save, assetPayloads);
    if (payload.length > ATRIA_SAVE_CONTAINER_LIMITS.maxContainerBytes) {
        throw new Error('.atriasave compressed payload exceeds size limit');
    }
    const protection = buildProtection(password);
    const header = buildHeader(save, payload, protection);
    const archive = encodeEnvelope(header, payload, password);
    inspectAtriaSaveContainer(archive, { password });
    return Object.freeze({
        archive,
        save,
        preflight: preflightAtriaSaveContainer(archive),
    });
}

export function inspectAtriaSaveContainer(archiveInput, { password = undefined } = {}) {
    const decoded = decodeHeader(archiveInput);
    const payload = decryptPayload(decoded, password);
    const inspected = inspectPayload(payload, decoded.header);
    return Object.freeze({
        ...inspected,
        preflight: preflightAtriaSaveContainer(decoded.archive),
        containerHash: sha256(decoded.archive),
    });
}

export function hashAtriaSaveContainer(archiveInput) {
    return sha256(toBuffer(archiveInput));
}
