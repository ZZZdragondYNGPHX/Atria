import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import AdmZip from 'adm-zip';

import {
    ATRIA_PACKAGE_CAPABILITIES,
    ATRIA_PACKAGE_PERMISSIONS,
    assertAtriaPackageManifest,
} from './contracts.js';

export const ATRIA_PACKAGE_CONTAINER_FORMAT = 'atria-package-container';
export const ATRIA_PACKAGE_CONTAINER_VERSION = 2;
export const ATRIA_PACKAGE_CONTAINER_MAGIC = Buffer.from('ATRIA2\0\0', 'binary');

export const ATRIA_PACKAGE_CONTAINER_LIMITS = Object.freeze({
    maxContainerBytes: 128 * 1024 * 1024,
    maxHeaderBytes: 64 * 1024,
    maxEntries: 4096,
    maxFileBytes: 32 * 1024 * 1024,
    maxTotalUncompressedBytes: 256 * 1024 * 1024,
    maxCompressionRatio: 200,
    maxPathLength: 512,
    maxSegmentLength: 255,
});

const MANIFEST_PATH = 'manifest.json';
const INVENTORY_PATH = 'inventory.json';
const TAG_BYTES = 16;
const FIXED_PREFIX_BYTES = ATRIA_PACKAGE_CONTAINER_MAGIC.length + 4;
const KEY_LABEL = Buffer.from('Atria Package Container v2\0', 'utf8');

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

function deriveKey(salt) {
    return createHash('sha256').update(KEY_LABEL).update(salt).digest();
}

function canonicalInventoryHash(inventory) {
    const canonical = [...inventory]
        .sort((left, right) => left.path.localeCompare(right.path))
        .map(item => item.path + '\0' + item.size + '\0' + item.sha256 + '\0')
        .join('');
    return sha256(Buffer.from(canonical, 'utf8'));
}

function normalizeArchivePath(input, { directory = false } = {}) {
    if (typeof input !== 'string') throw new Error('.atria entry path must be a string');
    if (!input || input.includes('\0') || input.includes('\\')) {
        throw new Error('.atria entry has an illegal or ambiguous path');
    }
    if (input.startsWith('/') || /^[A-Za-z]:/.test(input) || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(input)) {
        throw new Error('.atria entry path must be package-relative');
    }
    let value = input;
    if (directory && value.endsWith('/')) value = value.slice(0, -1);
    if (!value || value.length > ATRIA_PACKAGE_CONTAINER_LIMITS.maxPathLength) {
        throw new Error('.atria entry path exceeds limits');
    }
    const segments = value.split('/');
    if (segments.some(segment => (
        !segment
        || segment === '.'
        || segment === '..'
        || segment.length > ATRIA_PACKAGE_CONTAINER_LIMITS.maxSegmentLength
    ))) {
        throw new Error('.atria entry contains path traversal or an illegal segment');
    }
    return segments.join('/');
}

function toBuffer(value, label) {
    if (Buffer.isBuffer(value)) return Buffer.from(value);
    if (value instanceof Uint8Array) return Buffer.from(value);
    if (typeof value === 'string') return Buffer.from(value, 'utf8');
    throw new TypeError(label + ' must be string, Buffer, or Uint8Array');
}

function normalizeFileMap(input, prefix) {
    if (!(input instanceof Map)) throw new TypeError(prefix + ' files must be a Map');
    const out = new Map();
    for (const [rawPath, rawBytes] of input) {
        const relative = normalizeArchivePath(String(rawPath || ''));
        const archivePath = prefix + '/' + relative;
        const bytes = toBuffer(rawBytes, prefix + ' file');
        if (bytes.length > ATRIA_PACKAGE_CONTAINER_LIMITS.maxFileBytes) {
            throw new Error(`.atria file '${archivePath}' exceeds the per-file limit`);
        }
        if (out.has(archivePath)) throw new Error(`Duplicate .atria file '${archivePath}'`);
        out.set(archivePath, bytes);
    }
    return out;
}

function normalizeAssetPayloads(manifest, input) {
    if (!(input instanceof Map)) throw new TypeError('Package asset payloads must be a Map');
    const out = new Map();
    const declared = new Map(manifest.assets.map(ref => [ref.assetId, ref]));
    for (const [assetId, rawBytes] of input) {
        const ref = declared.get(assetId);
        if (!ref) throw new Error('Package asset payload is undeclared: ' + assetId);
        const bytes = toBuffer(rawBytes, 'Package asset');
        if (bytes.length !== ref.size || sha256(bytes) !== ref.contentHash) {
            throw new Error('Package asset payload integrity mismatch: ' + assetId);
        }
        out.set('assets/' + assetId, bytes);
    }
    for (const ref of manifest.assets) {
        if (!out.has('assets/' + ref.assetId)) {
            throw new Error('Package asset payload is missing: ' + ref.assetId);
        }
    }
    return out;
}

function buildInnerPayload(manifest, sourceFiles, assetPayloads) {
    const contents = new Map([
        ...normalizeFileMap(sourceFiles, 'source'),
        ...normalizeAssetPayloads(manifest, assetPayloads),
    ]);
    if (contents.size > ATRIA_PACKAGE_CONTAINER_LIMITS.maxEntries - 2) {
        throw new Error('.atria package exceeds the archive entry limit');
    }

    let total = 0;
    const inventory = [...contents.entries()]
        .map(([entryPath, bytes]) => {
            total += bytes.length;
            if (total > ATRIA_PACKAGE_CONTAINER_LIMITS.maxTotalUncompressedBytes) {
                throw new Error('.atria package exceeds total uncompressed-size limit');
            }
            return Object.freeze({
                path: entryPath,
                size: bytes.length,
                sha256: sha256(bytes),
            });
        })
        .sort((left, right) => left.path.localeCompare(right.path));

    const inventoryDoc = Object.freeze({
        algorithm: 'sha256',
        inventorySha256: canonicalInventoryHash(inventory),
        entries: inventory,
    });

    const zip = new AdmZip();
    zip.addFile(MANIFEST_PATH, Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8'));
    zip.addFile(INVENTORY_PATH, Buffer.from(JSON.stringify(inventoryDoc, null, 2) + '\n', 'utf8'));
    for (const item of inventory) zip.addFile(item.path, contents.get(item.path));
    return zip.toBuffer();
}

function buildHeader(manifest, payload, salt, nonce) {
    return {
        format: ATRIA_PACKAGE_CONTAINER_FORMAT,
        containerVersion: ATRIA_PACKAGE_CONTAINER_VERSION,
        packageSchemaVersion: manifest.schemaVersion,
        nativeSchemaVersion: manifest.nativeSchemaVersion,
        packageId: manifest.packageId,
        packageVersionId: manifest.packageVersionId,
        name: manifest.name,
        version: manifest.version,
        capabilities: manifest.capabilities,
        permissions: manifest.permissions,
        payloadBytes: payload.length,
        payloadSha256: sha256(payload),
        protection: {
            algorithm: 'aes-256-gcm',
            keyMode: 'atria-portable-obfuscation-v1',
            salt: salt.toString('base64'),
            nonce: nonce.toString('base64'),
        },
    };
}

function encodeEnvelope(header, payload) {
    const salt = Buffer.from(header.protection.salt, 'base64');
    const nonce = Buffer.from(header.protection.nonce, 'base64');
    const key = deriveKey(salt);
    const headerBytes = Buffer.from(JSON.stringify(header), 'utf8');
    if (headerBytes.length > ATRIA_PACKAGE_CONTAINER_LIMITS.maxHeaderBytes) {
        throw new Error('.atria preflight header exceeds limit');
    }

    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(headerBytes);
    const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
    const tag = cipher.getAuthTag();

    const prefix = Buffer.alloc(FIXED_PREFIX_BYTES);
    ATRIA_PACKAGE_CONTAINER_MAGIC.copy(prefix, 0);
    prefix.writeUInt32BE(headerBytes.length, ATRIA_PACKAGE_CONTAINER_MAGIC.length);
    const archive = Buffer.concat([prefix, headerBytes, ciphertext, tag]);
    if (archive.length > ATRIA_PACKAGE_CONTAINER_LIMITS.maxContainerBytes) {
        throw new Error('.atria container exceeds compressed size limit');
    }
    return archive;
}

function decodeHeader(archiveInput) {
    const archive = toBuffer(archiveInput, '.atria container');
    if (
        archive.length < FIXED_PREFIX_BYTES + TAG_BYTES
        || archive.length > ATRIA_PACKAGE_CONTAINER_LIMITS.maxContainerBytes
    ) {
        throw new Error('.atria container size is outside supported limits');
    }
    if (!archive.subarray(0, ATRIA_PACKAGE_CONTAINER_MAGIC.length).equals(ATRIA_PACKAGE_CONTAINER_MAGIC)) {
        throw new Error('Unsupported .atria magic/header');
    }

    const headerLength = archive.readUInt32BE(ATRIA_PACKAGE_CONTAINER_MAGIC.length);
    if (headerLength <= 0 || headerLength > ATRIA_PACKAGE_CONTAINER_LIMITS.maxHeaderBytes) {
        throw new Error('.atria preflight header length is invalid');
    }
    const headerStart = FIXED_PREFIX_BYTES;
    const headerEnd = headerStart + headerLength;
    if (headerEnd + TAG_BYTES > archive.length) throw new Error('.atria container is truncated');

    let header;
    try {
        header = JSON.parse(archive.subarray(headerStart, headerEnd).toString('utf8'));
    } catch (error) {
        throw new Error('.atria preflight header is malformed: ' + (error?.message || String(error)));
    }
    validateHeader(header);

    const ciphertextEnd = archive.length - TAG_BYTES;
    if (ciphertextEnd - headerEnd !== header.payloadBytes) {
        throw new Error('.atria payload length does not match preflight header');
    }
    return {
        archive,
        header,
        headerBytes: archive.subarray(headerStart, headerEnd),
        ciphertext: archive.subarray(headerEnd, ciphertextEnd),
        tag: archive.subarray(ciphertextEnd),
    };
}

function validateHeader(header) {
    if (!header || typeof header !== 'object' || Array.isArray(header)) {
        throw new Error('.atria preflight header must be an object');
    }
    if (
        header.format !== ATRIA_PACKAGE_CONTAINER_FORMAT
        || header.containerVersion !== ATRIA_PACKAGE_CONTAINER_VERSION
        || header.packageSchemaVersion !== 2
        || header.nativeSchemaVersion !== 1
    ) {
        throw new Error('Unsupported .atria Package Container version');
    }
    if (!/^pkg_[a-f0-9]{32}$/.test(String(header.packageId || ''))) {
        throw new Error('.atria preflight packageId is malformed');
    }
    if (!/^pkgv_[a-f0-9]{32}$/.test(String(header.packageVersionId || ''))) {
        throw new Error('.atria preflight packageVersionId is malformed');
    }
    if (
        !Number.isInteger(header.payloadBytes)
        || header.payloadBytes < 0
        || header.payloadBytes > ATRIA_PACKAGE_CONTAINER_LIMITS.maxContainerBytes
        || !/^[a-f0-9]{64}$/.test(String(header.payloadSha256 || ''))
    ) {
        throw new Error('.atria preflight payload metadata is malformed');
    }
    if (
        header.protection?.algorithm !== 'aes-256-gcm'
        || header.protection?.keyMode !== 'atria-portable-obfuscation-v1'
    ) {
        throw new Error('.atria protection metadata is unsupported');
    }
    const salt = Buffer.from(String(header.protection.salt || ''), 'base64');
    const nonce = Buffer.from(String(header.protection.nonce || ''), 'base64');
    if (salt.length !== 16 || nonce.length !== 12) {
        throw new Error('.atria protection salt/nonce is malformed');
    }
    if (!Array.isArray(header.capabilities) || !Array.isArray(header.permissions)) {
        throw new Error('.atria preflight capability/permission metadata is malformed');
    }
    if (
        new Set(header.capabilities).size !== header.capabilities.length
        || header.capabilities.some(capability => !ATRIA_PACKAGE_CAPABILITIES.includes(capability))
    ) {
        throw new Error('.atria preflight contains unsupported capabilities');
    }
    const seenPermissions = new Set();
    for (const item of header.permissions) {
        if (
            !item
            || typeof item !== 'object'
            || Array.isArray(item)
            || !ATRIA_PACKAGE_PERMISSIONS.includes(item.permission)
            || typeof item.required !== 'boolean'
            || seenPermissions.has(item.permission)
        ) {
            throw new Error('.atria preflight contains unsupported or duplicate permissions');
        }
        seenPermissions.add(item.permission);
        if (item.reason != null && (typeof item.reason !== 'string' || item.reason.length > 1024)) {
            throw new Error('.atria preflight permission reason is malformed');
        }
    }
    if (
        typeof header.name !== 'string'
        || !header.name
        || header.name.length > 256
        || typeof header.version !== 'string'
        || !header.version
        || header.version.length > 128
    ) {
        throw new Error('.atria preflight package presentation metadata is malformed');
    }
}

function decryptPayload(decoded) {
    const salt = Buffer.from(decoded.header.protection.salt, 'base64');
    const nonce = Buffer.from(decoded.header.protection.nonce, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(salt), nonce);
    decipher.setAAD(decoded.headerBytes);
    decipher.setAuthTag(decoded.tag);
    let payload;
    try {
        payload = Buffer.concat([decipher.update(decoded.ciphertext), decipher.final()]);
    } catch {
        throw new Error('.atria payload authentication failed');
    }
    if (payload.length !== decoded.header.payloadBytes || sha256(payload) !== decoded.header.payloadSha256) {
        throw new Error('.atria payload integrity mismatch');
    }
    return payload;
}

function entryCompressedSize(entry) {
    return Number(entry?.header?.compressedSize ?? 0);
}

function entryUncompressedSize(entry) {
    return Number(entry?.header?.size ?? entry?.header?.uncompressedSize ?? 0);
}

function validateEntryNames(entries) {
    const seen = new Set();
    const folded = new Set();
    const files = new Set();

    for (const entry of entries) {
        const safePath = normalizeArchivePath(entry.entryName, { directory: entry.isDirectory });
        const lower = safePath.toLocaleLowerCase('en-US');
        if (seen.has(safePath) || folded.has(lower)) {
            throw new Error(`Duplicate or case-conflicting .atria entry '${safePath}'`);
        }
        seen.add(safePath);
        folded.add(lower);
        if (!entry.isDirectory) files.add(safePath);
    }

    for (const filePath of files) {
        const segments = filePath.split('/');
        for (let index = 1; index < segments.length; index += 1) {
            const parent = segments.slice(0, index).join('/');
            if (files.has(parent)) {
                throw new Error(`Conflicting .atria file paths '${parent}' and '${filePath}'`);
            }
        }
    }
}

function safeEntryData(entry) {
    const size = entryUncompressedSize(entry);
    const compressed = entryCompressedSize(entry);
    if (
        !Number.isFinite(size)
        || size < 0
        || size > ATRIA_PACKAGE_CONTAINER_LIMITS.maxFileBytes
        || !Number.isFinite(compressed)
        || compressed < 0
    ) {
        throw new Error(`Archive entry '${entry.entryName}' exceeds limits`);
    }
    if (size > 1024 * 1024 && size / Math.max(1, compressed) > ATRIA_PACKAGE_CONTAINER_LIMITS.maxCompressionRatio) {
        throw new Error(`Archive entry '${entry.entryName}' exceeds the decompression-ratio limit`);
    }
    let data;
    try {
        data = entry.getData();
    } catch (error) {
        throw new Error(`Archive entry '${entry.entryName}' is corrupt: ${error?.message || String(error)}`);
    }
    if (!Buffer.isBuffer(data) || data.length !== size) {
        throw new Error(`Archive entry '${entry.entryName}' is corrupt or size-mismatched`);
    }
    return data;
}

function inspectPayload(payload, header) {
    let entries;
    try {
        entries = new AdmZip(payload).getEntries();
    } catch (error) {
        throw new Error('Malformed .atria payload archive: ' + (error?.message || String(error)));
    }
    if (entries.length < 2 || entries.length > ATRIA_PACKAGE_CONTAINER_LIMITS.maxEntries) {
        throw new Error('.atria payload entry count is outside supported limits');
    }
    validateEntryNames(entries);

    const byName = new Map(entries.filter(entry => !entry.isDirectory).map(entry => [entry.entryName, entry]));
    const manifestEntry = byName.get(MANIFEST_PATH);
    const inventoryEntry = byName.get(INVENTORY_PATH);
    if (!manifestEntry || !inventoryEntry) {
        throw new Error('.atria payload is missing manifest.json or inventory.json');
    }

    let manifest;
    let inventoryDoc;
    try {
        manifest = assertAtriaPackageManifest(JSON.parse(safeEntryData(manifestEntry).toString('utf8')));
        inventoryDoc = JSON.parse(safeEntryData(inventoryEntry).toString('utf8'));
    } catch (error) {
        throw new Error('.atria package metadata is invalid: ' + (error?.message || String(error)));
    }

    if (
        manifest.packageId !== header.packageId
        || manifest.packageVersionId !== header.packageVersionId
        || manifest.name !== header.name
        || manifest.version !== header.version
        || JSON.stringify(manifest.capabilities) !== JSON.stringify(header.capabilities)
        || JSON.stringify(manifest.permissions) !== JSON.stringify(header.permissions)
    ) {
        throw new Error('.atria preflight metadata does not match Package manifest');
    }

    if (
        inventoryDoc?.algorithm !== 'sha256'
        || !Array.isArray(inventoryDoc.entries)
        || !/^[a-f0-9]{64}$/.test(String(inventoryDoc.inventorySha256 || ''))
        || canonicalInventoryHash(inventoryDoc.entries) !== inventoryDoc.inventorySha256
    ) {
        throw new Error('.atria inventory metadata is malformed');
    }

    const expected = new Map();
    let declaredTotal = 0;
    for (const item of inventoryDoc.entries) {
        const itemPath = normalizeArchivePath(String(item?.path || ''));
        const size = Number(item?.size);
        const digest = String(item?.sha256 || '');
        if (
            !Number.isInteger(size)
            || size < 0
            || size > ATRIA_PACKAGE_CONTAINER_LIMITS.maxFileBytes
            || !/^[a-f0-9]{64}$/.test(digest)
            || expected.has(itemPath)
        ) {
            throw new Error(`Malformed .atria inventory entry '${itemPath}'`);
        }
        declaredTotal += size;
        if (declaredTotal > ATRIA_PACKAGE_CONTAINER_LIMITS.maxTotalUncompressedBytes) {
            throw new Error('.atria inventory exceeds total uncompressed-size limit');
        }
        expected.set(itemPath, { size, sha256: digest });
    }

    const contentEntries = [...byName.entries()].filter(([name]) => (
        name !== MANIFEST_PATH && name !== INVENTORY_PATH
    ));
    if (contentEntries.length !== expected.size) {
        throw new Error('.atria inventory does not match payload file count');
    }

    const sourceFiles = new Map();
    const assets = new Map();
    let actualTotal = 0;
    for (const [name, entry] of contentEntries) {
        const item = expected.get(name);
        if (!item) throw new Error(`Undeclared .atria payload file '${name}'`);
        const data = safeEntryData(entry);
        actualTotal += data.length;
        if (
            actualTotal > ATRIA_PACKAGE_CONTAINER_LIMITS.maxTotalUncompressedBytes
            || data.length !== item.size
            || sha256(data) !== item.sha256
        ) {
            throw new Error(`Integrity mismatch for .atria file '${name}'`);
        }
        if (name.startsWith('source/')) {
            sourceFiles.set(name.slice('source/'.length), data);
        } else if (name.startsWith('assets/')) {
            assets.set(name.slice('assets/'.length), data);
        } else {
            throw new Error(`Unexpected .atria content root '${name}'`);
        }
    }

    for (const ref of manifest.assets) {
        const data = assets.get(ref.assetId);
        if (!data || data.length !== ref.size || sha256(data) !== ref.contentHash) {
            throw new Error('Packaged asset is missing or corrupt: ' + ref.assetId);
        }
    }
    if (assets.size !== manifest.assets.length) {
        throw new Error('.atria payload contains undeclared Package assets');
    }

    return Object.freeze({
        manifest,
        sourceFiles,
        assets,
    });
}

export function preflightAtriaPackageContainer(archiveInput) {
    const { header } = decodeHeader(archiveInput);
    return Object.freeze({
        format: header.format,
        containerVersion: header.containerVersion,
        packageId: header.packageId,
        packageVersionId: header.packageVersionId,
        name: header.name,
        version: header.version,
        capabilities: Object.freeze(structuredClone(header.capabilities)),
        permissions: Object.freeze(structuredClone(header.permissions)),
        requiredPermissions: Object.freeze(
            header.permissions.filter(item => item.required).map(item => item.permission),
        ),
        payloadBytes: header.payloadBytes,
    });
}

export function buildAtriaPackageContainer({
    manifest: manifestInput,
    sourceFiles = new Map(),
    assetPayloads = new Map(),
}) {
    const manifest = assertAtriaPackageManifest(manifestInput);
    const payload = buildInnerPayload(manifest, sourceFiles, assetPayloads);
    if (payload.length > ATRIA_PACKAGE_CONTAINER_LIMITS.maxContainerBytes) {
        throw new Error('.atria compressed payload exceeds size limit');
    }
    const salt = randomBytes(16);
    const nonce = randomBytes(12);
    const header = buildHeader(manifest, payload, salt, nonce);
    const archive = encodeEnvelope(header, payload);

    // Builder invariant: never emit something the matching reader rejects.
    inspectAtriaPackageContainer(archive);
    return Object.freeze({
        archive,
        manifest,
        preflight: preflightAtriaPackageContainer(archive),
    });
}

export function inspectAtriaPackageContainer(archiveInput) {
    const decoded = decodeHeader(archiveInput);
    const payload = decryptPayload(decoded);
    const inspected = inspectPayload(payload, decoded.header);
    return Object.freeze({
        ...inspected,
        preflight: preflightAtriaPackageContainer(decoded.archive),
        containerHash: sha256(decoded.archive),
    });
}

export function hashAtriaPackageContainer(archiveInput) {
    const archive = toBuffer(archiveInput, '.atria container');
    return sha256(archive);
}
