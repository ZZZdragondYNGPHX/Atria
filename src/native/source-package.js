import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import AdmZip from 'adm-zip';
import { PACKAGE_LIMITS } from '../../public/shared/native-package-limits.js';
import { assertAtriaProjectSource, ATRIA_PROJECT_MANIFEST } from './project-source.js';
import { resolveProjectDependencyClosure } from './dependency-closure.js';
import { mapVersionedModelPromptResourceRefs } from './model-prompt-runtime/resources.js';
import { ATRIA_PACKAGE_CONTAINER_LIMITS, safeEntryData, validateEntryNames } from './package-container.js';
import { createNativeId } from './identity.js';

const MAGIC = Buffer.from('ATRIAS01');
const derive = promisify(scrypt);
const invalid = (code = 'native_source_container_invalid') => Object.assign(new TypeError(code), { code });

async function passwordKey(password, salt) {
    if (typeof password !== 'string' || !password || password.length > 1024) throw invalid('native_source_password_required');
    return derive(password, salt, 32, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
}

function bindProjectResources(source, projectId) {
    const ref = value => ({ resourceType: value.resourceType, resourceId: value.resourceId, revision: value.revision, scope: 'project', projectId });
    source.resources = source.resources.map(item => ({ resourceType: item.resourceType,
        resource: mapVersionedModelPromptResourceRefs(item.resourceType, item.resource, ref) }));
    for (const role of source.package.runtime?.modelPrompt?.roles ?? []) {
        if (role.promptProgramRef) role.promptProgramRef = ref(role.promptProgramRef);
        if (role.generationProfileRef) role.generationProfileRef = ref(role.generationProfileRef);
    }
    source.project.projectId = projectId;
    return source;
}

// Vendor dependencies into project-owned snapshots, never install them into
// the recipient's shared library or follow a mutable "latest" pointer.
export async function buildSourcePackage({ handle, projectId, projectStore, password = null, ...repositories }) {
    const original = await projectStore.get(handle, projectId);
    if (!original) throw new TypeError('Studio Project not found');
    const closure = await resolveProjectDependencyClosure({ handle, source: original, ...repositories });
    const files = await projectStore.readBuildFiles(handle, projectId);
    const source = structuredClone(original);
    const localBinding = binding => ({ ...binding, source: { ...binding.source, kind: 'project' } });
    source.worlds = closure.worlds.map(world => ({ ...world, revision: { ...world.revision,
        ...(world.revision.knowledgeBindings ? { knowledgeBindings: world.revision.knowledgeBindings.map(localBinding) } : {}) } }));
    source.knowledge = closure.knowledge;
    source.knowledgeBindings = closure.knowledgeBindings.map(localBinding);
    source.resources = closure.resources;
    source.dependencies = { worlds: [], knowledge: [], knowledgeBindings: [], assets: [], resources: [] };
    for (const { ref, bytes } of closure.assets) {
        if (source.assetFiles.some(item => item.assetId === ref.assetId)) continue;
        const path = 'vendored-assets/' + ref.assetId;
        if (files.has(path)) throw new TypeError('Project file conflicts with vendored asset: ' + path);
        files.set(path, bytes);
        source.assetFiles.push({ assetId: ref.assetId, path,
            ...(ref.mediaType ? { mediaType: ref.mediaType } : {}), ...(ref.logicalName ? { logicalName: ref.logicalName } : {}) });
    }
    const portable = assertAtriaProjectSource(bindProjectResources(source, projectId));
    const zip = new AdmZip();
    const manifestBytes = Buffer.from(JSON.stringify(portable));
    if (manifestBytes.length > ATRIA_PACKAGE_CONTAINER_LIMITS.maxBufferedFileBytes) throw new RangeError('Source manifest exceeds Studio buffer limits');
    zip.addFile(ATRIA_PROJECT_MANIFEST, manifestBytes);
    if (files.size >= PACKAGE_LIMITS.entries) throw new RangeError('Too many source files');
    let total = manifestBytes.length;
    for (const [path, bytes] of files) {
        total += bytes.length;
        if (bytes.length > ATRIA_PACKAGE_CONTAINER_LIMITS.maxBufferedFileBytes || total > PACKAGE_LIMITS.bufferedUncompressedBytes) throw new RangeError('Source package exceeds Studio buffer limits');
        zip.addFile('files/' + path, bytes);
        if (bytes.length > 1024 * 1024) zip.getEntry('files/' + path).header.method = 0;
    }
    validateEntryNames(zip.getEntries());
    let payload = zip.toBuffer();
    const encrypted = password !== null;
    const salt = encrypted ? randomBytes(16) : null, nonce = encrypted ? randomBytes(12) : null;
    const header = Buffer.from(JSON.stringify({ format: 'atria-source-package', version: 1, encrypted,
        ...(encrypted ? { protection: 'scrypt-aes-256-gcm-v1', salt: salt.toString('base64'), nonce: nonce.toString('base64') } : {}) }));
    if (encrypted) {
        const key = await passwordKey(password, salt);
        try {
            const cipher = createCipheriv('aes-256-gcm', key, nonce); cipher.setAAD(header);
            payload = Buffer.concat([cipher.update(payload), cipher.final(), cipher.getAuthTag()]);
        } finally { key.fill(0); }
    }
    const prefix = Buffer.alloc(12); MAGIC.copy(prefix); prefix.writeUInt32BE(header.length, 8);
    if (12 + header.length + payload.length > PACKAGE_LIMITS.bufferedArchiveBytes) throw new RangeError('Source package exceeds Studio buffer limits');
    return { archive: Buffer.concat([prefix, header, payload]), encrypted };
}

export async function importSourcePackage(archive, password = null) {
    if (!Buffer.isBuffer(archive) || archive.length < 12 || archive.length > PACKAGE_LIMITS.bufferedArchiveBytes) throw invalid();
    if (!archive.subarray(0, 8).equals(MAGIC)) throw invalid(archive.subarray(0, 6).toString() === 'ATRIA2' ? 'native_source_runtime_package' : undefined);
    const headerLength = archive.readUInt32BE(8);
    if (!headerLength || headerLength > 16384 || 12 + headerLength >= archive.length) throw invalid();
    const headerBytes = archive.subarray(12, 12 + headerLength);
    let header;
    try { header = JSON.parse(headerBytes.toString()); } catch { throw invalid(); }
    if (header.format !== 'atria-source-package' || header.version !== 1 || typeof header.encrypted !== 'boolean') throw invalid();
    let payload = archive.subarray(12 + headerLength);
    if (header.encrypted) {
        if (header.protection !== 'scrypt-aes-256-gcm-v1' || typeof header.salt !== 'string' || typeof header.nonce !== 'string') throw invalid();
        const salt = Buffer.from(header.salt, 'base64'), nonce = Buffer.from(header.nonce, 'base64');
        if (salt.length !== 16 || nonce.length !== 12 || payload.length < 16) throw invalid();
        const key = await passwordKey(password, salt);
        try {
            const decipher = createDecipheriv('aes-256-gcm', key, nonce); decipher.setAAD(headerBytes); decipher.setAuthTag(payload.subarray(-16));
            payload = Buffer.concat([decipher.update(payload.subarray(0, -16)), decipher.final()]);
        } catch { throw invalid('native_source_authentication_failed'); } finally { key.fill(0); }
    }
    try {
        const entries = new AdmZip(payload).getEntries();
        if (!entries.length || entries.length > PACKAGE_LIMITS.entries) throw invalid();
        validateEntryNames(entries);
        const manifest = entries.find(entry => entry.entryName === ATRIA_PROJECT_MANIFEST && !entry.isDirectory);
        if (!manifest) throw invalid();
        const original = assertAtriaProjectSource(JSON.parse(safeEntryData(manifest).toString()));
        if (Object.values(original.dependencies).some(items => items.length)) throw invalid();
        const files = new Map(); let total = manifest.header.size;
        for (const entry of entries) {
            if (entry === manifest || entry.isDirectory) continue;
            if (!entry.entryName.startsWith('files/')) throw invalid();
            total += entry.header.size;
            if (total > PACKAGE_LIMITS.bufferedUncompressedBytes) throw invalid();
            files.set(entry.entryName.slice(6), safeEntryData(entry));
        }
        for (const asset of original.assetFiles) if (!files.has(asset.path)) throw invalid();
        const source = bindProjectResources(structuredClone(original), createNativeId('project'));
        source.project.createdAt = Date.now(); source.project.updatedAt = source.project.createdAt;
        return { source: assertAtriaProjectSource(source), files };
    } catch { throw invalid(); }
}
