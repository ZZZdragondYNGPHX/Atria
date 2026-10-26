import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import AdmZip from 'adm-zip';
import archiver from 'archiver';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { crc32 } from 'node:zlib';
import yauzl from 'yauzl';
import { createTemporaryPayload } from './temporary-payload.js';
import { copyPackagePayload, admitPackagePayload, packagePayloadHash, registerPackagePayloadView } from './package-payload-cache.js';
import { isFilePayload, payloadHash, stageFilePayload } from './file-payload.js';
import { PACKAGE_LIMITS } from '../../public/shared/native-package-limits.js';
import { validateFrontendResources } from './experience-validation.js';

import {
    ATRIA_PACKAGE_CAPABILITIES,
    ATRIA_PACKAGE_PERMISSIONS,
    assertAtriaPackageManifest,
} from './contracts.js';

export const ATRIA_PACKAGE_CONTAINER_FORMAT = 'atria-package-container';
export const ATRIA_PACKAGE_CONTAINER_VERSION = 2;
export const ATRIA_PACKAGE_CONTAINER_MAGIC = Buffer.from('ATRIA2\0\0', 'binary');

export const ATRIA_PACKAGE_CONTAINER_LIMITS = Object.freeze({
    maxContainerBytes: PACKAGE_LIMITS.archiveBytes,
    maxHeaderBytes: 64 * 1024,
    maxEntries: PACKAGE_LIMITS.entries,
    maxFileBytes: 2 * 1024 * 1024 * 1024,
    maxBufferedFileBytes: 32 * 1024 * 1024,
    maxTotalUncompressedBytes: PACKAGE_LIMITS.uncompressedBytes,
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
    // All container operations are synchronous, read-only consumers of input.
    // Reading a small header must not copy an entire media archive.
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    if (typeof value === 'string') return Buffer.from(value, 'utf8');
    throw new TypeError(label + ' must be string, Buffer, or Uint8Array');
}

function normalizeFileMap(input, prefix, streamed = false) {
    if (!(input instanceof Map)) throw new TypeError(prefix + ' files must be a Map');
    const out = new Map();
    for (const [rawPath, rawBytes] of input) {
        const relative = normalizeArchivePath(String(rawPath || ''));
        const archivePath = prefix + '/' + relative;
        const bytes = streamed && isFilePayload(rawBytes) ? rawBytes : toBuffer(rawBytes, prefix + ' file');
        if (bytes.length > (streamed ? ATRIA_PACKAGE_CONTAINER_LIMITS.maxFileBytes : ATRIA_PACKAGE_CONTAINER_LIMITS.maxBufferedFileBytes)) {
            throw new Error(`.atria file '${archivePath}' exceeds the per-file limit`);
        }
        if (out.has(archivePath)) throw new Error(`Duplicate .atria file '${archivePath}'`);
        out.set(archivePath, bytes);
    }
    return out;
}

function normalizeAssetPayloads(manifest, input, streamed = false) {
    if (!(input instanceof Map)) throw new TypeError('Package asset payloads must be a Map');
    const out = new Map();
    const declared = new Map(manifest.assets.map(ref => [ref.assetId, ref]));
    for (const [assetId, rawBytes] of input) {
        const ref = declared.get(assetId);
        if (!ref) throw new Error('Package asset payload is undeclared: ' + assetId);
        const bytes = streamed && isFilePayload(rawBytes) ? rawBytes : toBuffer(rawBytes, 'Package asset');
        if (bytes.length > (streamed ? ATRIA_PACKAGE_CONTAINER_LIMITS.maxFileBytes : ATRIA_PACKAGE_CONTAINER_LIMITS.maxBufferedFileBytes) || bytes.length !== ref.size || payloadHash(bytes) !== ref.contentHash) {
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

function containerContents(manifest, sourceFiles, assetPayloads, streamed = false) {
    const contents = new Map([
        ...normalizeFileMap(sourceFiles, 'source', streamed),
        ...normalizeAssetPayloads(manifest, assetPayloads, streamed),
    ]);
    if (contents.size > ATRIA_PACKAGE_CONTAINER_LIMITS.maxEntries - 2) {
        throw new Error('.atria package exceeds the archive entry limit');
    }

    let total = 0;
    const inventory = [...contents.entries()]
        .map(([entryPath, bytes]) => {
            total += bytes.length;
            if (total > (streamed ? ATRIA_PACKAGE_CONTAINER_LIMITS.maxTotalUncompressedBytes : PACKAGE_LIMITS.bufferedUncompressedBytes)) {
                throw new Error('.atria package exceeds total uncompressed-size limit');
            }
            return Object.freeze({
                path: entryPath,
                size: bytes.length,
                sha256: payloadHash(bytes),
            });
        })
        .sort((left, right) => left.path.localeCompare(right.path));

    const inventoryDoc = Object.freeze({
        algorithm: 'sha256',
        inventorySha256: canonicalInventoryHash(inventory),
        entries: inventory,
    });

    return { contents, inventory, inventoryDoc };
}

function buildInnerPayload(manifest, sourceFiles, assetPayloads) {
    const { contents, inventory, inventoryDoc } = containerContents(manifest, sourceFiles, assetPayloads);
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
        payloadSha256: payloadHash(payload),
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
    if (FIXED_PREFIX_BYTES + headerBytes.length + payload.length + TAG_BYTES > PACKAGE_LIMITS.bufferedArchiveBytes) throw new Error('Large Package containers require the file builder');

    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(headerBytes);
    const body = cipher.update(payload), tail = cipher.final();
    const ciphertext = tail.length ? Buffer.concat([body, tail]) : body;
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
    const file = isFilePayload(archiveInput);
    const archive = file ? archiveInput : toBuffer(archiveInput, '.atria container');
    if (
        archive.length < FIXED_PREFIX_BYTES + TAG_BYTES
        || archive.length > (file ? ATRIA_PACKAGE_CONTAINER_LIMITS.maxContainerBytes : PACKAGE_LIMITS.bufferedArchiveBytes)
    ) {
        throw new Error('.atria container size is outside supported limits');
    }
    const prefix = file ? archive.readRange(0, FIXED_PREFIX_BYTES) : archive;
    if (!prefix.subarray(0, ATRIA_PACKAGE_CONTAINER_MAGIC.length).equals(ATRIA_PACKAGE_CONTAINER_MAGIC)) {
        throw new Error('Unsupported .atria magic/header');
    }

    const headerLength = prefix.readUInt32BE(ATRIA_PACKAGE_CONTAINER_MAGIC.length);
    if (headerLength <= 0 || headerLength > ATRIA_PACKAGE_CONTAINER_LIMITS.maxHeaderBytes) {
        throw new Error('.atria preflight header length is invalid');
    }
    const headerStart = FIXED_PREFIX_BYTES;
    const headerEnd = headerStart + headerLength;
    if (headerEnd + TAG_BYTES > archive.length) throw new Error('.atria container is truncated');

    let header;
    const headerBytes = file ? archive.readRange(headerStart, headerLength) : archive.subarray(headerStart, headerEnd);
    try {
        header = JSON.parse(headerBytes.toString('utf8'));
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
        headerBytes,
        ciphertext: file ? null : archive.subarray(headerEnd, ciphertextEnd),
        ciphertextStream: file ? () => archive.stream(headerEnd, ciphertextEnd - 1) : null,
        tag: file ? archive.readRange(ciphertextEnd, TAG_BYTES) : archive.subarray(ciphertextEnd),
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
        const body = decipher.update(decoded.ciphertext), tail = decipher.final();
        payload = tail.length ? Buffer.concat([body, tail]) : body;
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

function validateEntrySize(entry) {
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
    return size;
}

function safeEntryData(entry) {
    const size = validateEntrySize(entry);
    if (size > ATRIA_PACKAGE_CONTAINER_LIMITS.maxBufferedFileBytes) throw new Error('Large Package entries require the streaming reader');
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
    const admission = admitPayloadEntries(entries, header);
    let step = admission.next();
    while (!step.done) step = admission.next(safeEntryData(step.value));
    return step.value;
}

// One admission authority for both synchronous authoring and streamed runtime reads.
function* admitPayloadEntries(entries, header, store = bytes => bytes, view = map => map) {
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
        manifest = assertAtriaPackageManifest(JSON.parse((yield manifestEntry).toString('utf8')));
        inventoryDoc = JSON.parse((yield inventoryEntry).toString('utf8'));
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
    const content = new Map();
    const assetDigests = new Map();
    let actualTotal = 0;
    for (const [name, entry] of contentEntries) {
        const item = expected.get(name);
        if (!item) throw new Error(`Undeclared .atria payload file '${name}'`);
        const data = yield entry;
        actualTotal += data.length;
        if (
            actualTotal > ATRIA_PACKAGE_CONTAINER_LIMITS.maxTotalUncompressedBytes
            || data.length !== item.size
            || (packagePayloadHash(data) ?? sha256(data)) !== item.sha256
        ) {
            throw new Error(`Integrity mismatch for .atria file '${name}'`);
        }
        // Inventory admission has already verified these exact bytes. Runtime
        // aliases (author media, compiled media and Assets) share one payload.
        const admitted = content.get(item.sha256) ?? store(data);
        admitPackagePayload(admitted, item.sha256);
        content.set(item.sha256, admitted);
        if (name.startsWith('source/')) {
            sourceFiles.set(name.slice('source/'.length), admitted);
        } else if (name.startsWith('assets/')) {
            const id = name.slice('assets/'.length);
            assets.set(id, admitted);
            assetDigests.set(id, item.sha256);
        } else {
            throw new Error(`Unexpected .atria content root '${name}'`);
        }
    }

    for (const ref of manifest.assets) {
        const data = assets.get(ref.assetId);
        if (!data || data.length !== ref.size || assetDigests.get(ref.assetId) !== ref.contentHash) {
            throw new Error('Packaged asset is missing or corrupt: ' + ref.assetId);
        }
    }
    if (assets.size !== manifest.assets.length) {
        throw new Error('.atria payload contains undeclared Package assets');
    }
    validateFrontendResources(manifest, view(sourceFiles), view(assets));

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
    validateFrontendResources(manifest, sourceFiles, assetPayloads);
    const payload = buildInnerPayload(manifest, sourceFiles, assetPayloads);
    if (payload.length > PACKAGE_LIMITS.bufferedArchiveBytes) {
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

// The caller owns the returned file payload and must close it after publication.
// The format and inventory authority are identical to the buffered builder.
export async function buildAtriaPackageContainerFile({ manifest: manifestInput, sourceFiles = new Map(), assetPayloads = new Map() }) {
    const manifest = assertAtriaPackageManifest(manifestInput);
    const { contents, inventory, inventoryDoc } = containerContents(manifest, sourceFiles, assetPayloads, true);
    for (const item of inventory) admitPackagePayload(contents.get(item.path), item.sha256);
    validateFrontendResources(manifest, new PayloadView(sourceFiles), new PayloadView(assetPayloads));
    const zip = archiver('zip', { zlib: { level: 6 } });
    const staging = stageFilePayload(zip, PACKAGE_LIMITS.archiveBytes);
    let plaintext;
    try {
        zip.append(Buffer.from(JSON.stringify(manifest)), { name: MANIFEST_PATH });
        zip.append(Buffer.from(JSON.stringify(inventoryDoc)), { name: INVENTORY_PATH });
        for (const item of inventory) {
            const payload = contents.get(item.path);
            async function* chunks() { yield* payload.stream(); }
            zip.append(isFilePayload(payload) ? Readable.from(chunks()) : payload, { name: item.path, store: item.size > 1024 * 1024 });
        }
        await Promise.all([zip.finalize(), staging.then(value => { plaintext = value; })]);
        const salt = randomBytes(16), nonce = randomBytes(12);
        const header = buildHeader(manifest, plaintext, salt, nonce), headerBytes = Buffer.from(JSON.stringify(header));
        if (headerBytes.length > ATRIA_PACKAGE_CONTAINER_LIMITS.maxHeaderBytes) throw new Error('Package header exceeds limit');
        const cipher = createCipheriv('aes-256-gcm', deriveKey(salt), nonce); cipher.setAAD(headerBytes);
        const prefix = Buffer.alloc(FIXED_PREFIX_BYTES); ATRIA_PACKAGE_CONTAINER_MAGIC.copy(prefix);
        prefix.writeUInt32BE(headerBytes.length, ATRIA_PACKAGE_CONTAINER_MAGIC.length);
        async function* envelope() {
            yield prefix; yield headerBytes;
            const input = plaintext.stream();
            const encrypted = input.pipe(cipher);
            const failed = error => encrypted.destroy(error); input.on('error', failed);
            try { for await (const chunk of encrypted) yield chunk; yield cipher.getAuthTag(); } finally { input.off('error', failed); input.destroy(); encrypted.destroy(); }
        }
        const archive = await stageFilePayload(Readable.from(envelope()), PACKAGE_LIMITS.archiveBytes);
        return Object.freeze({ archive, manifest, preflight: preflightAtriaPackageContainer(archive) });
    } catch (error) {
        zip.abort(); zip.destroy(error);
        await (await staging.catch(() => null))?.close();
        throw error;
    } finally { zip.abort(); await plaintext?.close(); }
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
    return payloadHash(archiveInput);
}

// This view deliberately does not retain materialized media. Admission only
// needs a few graph/data resources; the runtime cache owns the backing records.
class PayloadView extends Map {
    #exposed = new Set();
    #cleared = false;
    constructor(source) {
        super();
        for (const [key, value] of source) super.set(key, value);
        registerPackagePayloadView(this, source, key => !this.#cleared && !this.#exposed.has(key));
    }
    get(key) {
        this.#exposed.add(key);
        const value = super.get(key);
        return value === undefined || Buffer.isBuffer(value) ? value : copyPackagePayload(value);
    }
    set(key, value) { this.#exposed.add(key); return super.set(key, value); }
    delete(key) { this.#exposed.add(key); return super.delete(key); }
    clear() { this.#cleared = true; return super.clear(); }
    * entries() { for (const key of super.keys()) yield [key, this.get(key)]; }
    * values() { for (const key of super.keys()) yield this.get(key); }
    [Symbol.iterator]() { return this.entries(); }
    forEach(callback, thisArg) { for (const [key, value] of this) callback.call(thisArg, value, key, this); }
}

export function packagePayloadView(inspected) {
    return { ...inspected, sourceFiles: new PayloadView(inspected.sourceFiles), assets: new PayloadView(inspected.assets) };
}

async function readZipEntries(zip) {
    return new Promise((resolve, reject) => {
        const entries = [];
        const fail = error => { cleanup(); reject(error); };
        const entry = raw => {
            if (entries.length >= ATRIA_PACKAGE_CONTAINER_LIMITS.maxEntries) return fail(new Error('.atria payload entry count exceeds limit'));
            entries.push({ entryName: raw.fileName, isDirectory: raw.fileName.endsWith('/'),
                header: { size: raw.uncompressedSize, compressedSize: raw.compressedSize }, raw });
            zip.readEntry();
        };
        const end = () => { cleanup(); resolve(entries); };
        const cleanup = () => { zip.off('error', fail); zip.off('entry', entry); zip.off('end', end); };
        zip.on('error', fail); zip.on('entry', entry); zip.on('end', end); zip.readEntry();
    });
}

async function readZipEntry(zip, entry, storage) {
    const size = validateEntrySize(entry);
    const metadata = entry.entryName === MANIFEST_PATH || entry.entryName === INVENTORY_PATH;
    if (metadata && size > ATRIA_PACKAGE_CONTAINER_LIMITS.maxBufferedFileBytes) throw new Error('Package metadata exceeds limits');
    const resident = metadata || size <= storage.remaining;
    const bytes = resident ? Buffer.allocUnsafeSlow(size) : null;
    const start = storage.offset, hash = createHash('sha256');
    const stream = await new Promise((resolve, reject) => zip.openReadStream(entry.raw, (error, value) => error ? reject(error) : resolve(value)));
    let offset = 0, crc = 0;
    for await (const chunk of stream) {
        if (offset + chunk.length > size) throw new Error('Archive entry exceeds declared size');
        if (bytes) chunk.copy(bytes, offset);
        else {
            let written = 0;
            while (written < chunk.length) {
                const result = await storage.file.write(chunk, written, chunk.length - written, start + offset + written);
                if (!result.bytesWritten) throw new Error('Package backing write failed');
                written += result.bytesWritten;
            }
        }
        offset += chunk.length; crc = crc32(chunk, crc); hash.update(chunk);
    }
    if (offset !== size || crc !== entry.raw.crc32) throw new Error('Archive entry is corrupt or size-mismatched: ' + entry.entryName);
    if (bytes && !metadata) storage.remaining -= size;
    if (!bytes) storage.offset += size;
    return admitPackagePayload(bytes ?? Object.freeze({ backing: storage.backing, offset: start, length: size }), hash.digest('hex'));
}

// The encrypted input remains caller-owned. Plaintext and admitted large media
// are disk-backed, so cold reads never retain a second complete decompressed
// archive. Crypto/decompression yield through streams instead of blocking UI/API.
export async function inspectAtriaPackageContainerAsync(archiveInput, { residentBytes = 32 * 1024 * 1024 } = {}) {
    const decoded = decodeHeader(archiveInput);
    const plaintext = createTemporaryPayload('atria-package-zip-');
    const backing = createTemporaryPayload('atria-package-payloads-');
    let zip, descriptor;
    try {
        const decipher = createDecipheriv('aes-256-gcm', deriveKey(Buffer.from(decoded.header.protection.salt, 'base64')), Buffer.from(decoded.header.protection.nonce, 'base64'));
        decipher.setAAD(decoded.headerBytes); decipher.setAuthTag(decoded.tag);
        const digest = createHash('sha256');
        let length = 0;
        const verify = new Transform({ transform(chunk, encoding, next) { length += chunk.length; digest.update(chunk); next(null, chunk); } });
        function* chunks() {
            for (let offset = 0; offset < decoded.ciphertext.length; offset += 1024 * 1024) yield decoded.ciphertext.subarray(offset, offset + 1024 * 1024);
        }
        await pipeline(decoded.ciphertextStream ? decoded.ciphertextStream() : Readable.from(chunks()), decipher, verify, fs.createWriteStream(plaintext.path));
        if (length !== decoded.header.payloadBytes || digest.digest('hex') !== decoded.header.payloadSha256) throw new Error('.atria payload integrity mismatch');
        // No ZIP entry is inspected or exposed before GCM authentication succeeds.
        zip = await new Promise((resolve, reject) => yauzl.open(plaintext.path, { lazyEntries: true, autoClose: false, strictFileNames: true }, (error, value) => error ? reject(error) : resolve(value)));
        const entries = await readZipEntries(zip);
        descriptor = await fs.promises.open(backing.path, 'w');
        const storage = { file: descriptor, backing, remaining: residentBytes, offset: 0 };
        const admission = admitPayloadEntries(entries, decoded.header, value => value, map => new PayloadView(map));
        let step = admission.next();
        while (!step.done) step = admission.next(await readZipEntry(zip, step.value, storage));
        await descriptor.close(); descriptor = undefined;
        if (!storage.offset) backing.dispose();
        return Object.freeze({ ...step.value, preflight: preflightAtriaPackageContainer(decoded.archive) });
    } catch (error) {
        if (descriptor !== undefined) { await descriptor.close(); descriptor = undefined; }
        backing.dispose(); throw error;
    } finally {
        if (descriptor !== undefined) await descriptor.close();
        if (zip) await new Promise(resolve => { zip.once('close', resolve); zip.close(); });
        plaintext.dispose();
    }
}
