import fs from 'node:fs';
import { Readable } from 'node:stream';
import { freezePackagePromptPrograms } from './model-prompt-runtime/package-freeze.js';
import { registerPackageDeclarations } from './package-declarations.js';
import { validateExperienceResources } from './experience-validation.js';
import { compileProjectFrontends } from './frontend/compiler.js';
import { createHash } from 'node:crypto';
import { copyPackagePayload } from './package-payload-cache.js';
import { composeContent, contentDigest, readCommunity, validateContentComposition } from './content-composition.js';

import {
    assertAssetRef,
    assertAtriaPackageManifest,
    assertPackageRecord,
    assertPackageVersion,
} from './contracts.js';
import { createNativeId } from './identity.js';
import { resolveProjectDependencyClosure } from './dependency-closure.js';
import {
    getVersionedModelPromptResourceIdentity,
    mapVersionedModelPromptResourceRefs,
} from './model-prompt-runtime/resources.js';
import { compilePackageRuntimePlugins } from './plugin-platform.js';
import {
    buildAtriaPackageContainer,
    inspectAtriaPackageContainerAsync,
    packagePayloadView,
    preflightAtriaPackageContainer,
} from './package-container.js';

function digest(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

// A full-resolution Work can exceed the former 32 MiB memoization budget.
// Bound the server-side parsed cache independently from browser media, while
// retaining owner/file identity checks and caller copy isolation on every open.
const PARSED_ARCHIVE_BYTES = 256 * 1024 * 1024;
const PARSED_ARCHIVE_ENTRIES = 8;
const RESIDENT_PACKAGE_PAYLOAD_BYTES = 32 * 1024 * 1024;

// A returned Buffer's whole backing store belongs to that caller. Small
// pooled Buffers could otherwise expose a cached neighbour through .buffer.
function copyPackageBytes(bytes) {
    const copy = Buffer.allocUnsafeSlow(bytes.length);
    bytes.copy(copy);
    return copy;
}

const unreadBytes = Symbol('unread Package bytes');
class PackageByteMap extends Map {
    #source;
    #pristine = true;
    get pristine() { return this.#pristine; }
    constructor(source) {
        super(); this.#source = source;
        for (const key of source.keys()) super.set(key, unreadBytes);
    }
    get(key) {
        const value = super.get(key);
        if (value !== undefined) this.#pristine = false;
        if (value !== unreadBytes) return value;
        const bytes = copyPackagePayload(this.#source.get(key));
        super.set(key, bytes); return bytes;
    }
    set(key, value) { this.#pristine = false; return super.set(key, value); }
    delete(key) { this.#pristine = false; return super.delete(key); }
    clear() { this.#pristine = false; return super.clear(); }
    stream(key, start, end) {
        const value = this.#source.get(key);
        if (!value) throw new TypeError('Missing Package payload');
        // Keep the backing owner reachable until the stream closes.
        const stream = Buffer.isBuffer(value) ? Readable.from([value.subarray(start, end + 1)])
            : fs.createReadStream(value.backing.path, { start: value.offset + start, end: value.offset + end });
        stream.once('close', () => { void value.backing; });
        return stream;
    }
    * entries() { for (const key of super.keys()) yield [key, this.get(key)]; }
    * values() { for (const key of super.keys()) yield this.get(key); }
    [Symbol.iterator]() { return this.entries(); }
    forEach(callback, thisArg) { for (const [key, value] of this) callback.call(thisArg, value, key, this); }
}

function freezeParsedJson(value) {
    if (value === null || typeof value !== 'object') return value;
    for (const item of Object.values(value)) freezeParsedJson(item);
    return Object.freeze(value);
}

function parsedJsonBytes(value) {
    if (typeof value === 'string') return 24 + value.length * 2;
    if (value === null || typeof value !== 'object') return 8;
    return Array.isArray(value) ? 32 + value.reduce((bytes, item) => bytes + 8 + parsedJsonBytes(item), 0)
        : 64 + Object.entries(value).reduce((bytes, [key, item]) => bytes + 32 + key.length * 2 + parsedJsonBytes(item), 0);
}

function copyParsedArchive(inspected) {
    // Runtime rules never read scene media. Copy bytes on first access while
    // keeping every returned Buffer and its backing store caller-owned.
    const copyMap = map => new PackageByteMap(map);
    const sourceFiles = copyMap(inspected.sourceFiles), assets = copyMap(inspected.assets);
    return registerPackageDeclarations(Object.freeze({ manifest: inspected.manifest, preflight: inspected.preflight,
        sourceFiles, assets }), inspected, () => sourceFiles.pristine && assets.pristine);
}

function parsedArchiveBytes(inspected) {
    let bytes = parsedJsonBytes(inspected.manifest) + parsedJsonBytes(inspected.preflight);
    const payloads = new Set();
    for (const map of [inspected.sourceFiles, inspected.assets]) for (const [key, buffer] of map) {
        bytes += key.length * 2 + 96;
        if (!payloads.has(buffer)) { payloads.add(buffer); bytes += Buffer.isBuffer(buffer) ? buffer.length : 96; }
    }
    return bytes;
}

function mergeAssetPayload(map, ref, bytes) {
    const existing = map.get(ref.assetId);
    if (existing) {
        if (
            existing.ref.contentHash !== ref.contentHash
            || existing.ref.size !== ref.size
            || !existing.bytes.equals(bytes)
        ) {
            throw new Error('Conflicting Package assetId: ' + ref.assetId);
        }
        return;
    }
    map.set(ref.assetId, { ref, bytes: Buffer.from(bytes) });
}

async function collectProjectAssets({ handle, source, projectStore }) {
    const assets = new Map();
    for (const item of source.assetFiles || []) {
        const bytes = await projectStore.readFile(handle, source.project.projectId, item.path);
        if (!bytes) throw new Error('Project asset source file is missing: ' + item.path);
        const ref = assertAssetRef({
            assetId: item.assetId,
            contentHash: digest(bytes),
            size: bytes.length,
            ...(item.mediaType == null ? {} : { mediaType: item.mediaType }),
            ...(item.logicalName == null ? {} : { logicalName: item.logicalName }),
        });
        mergeAssetPayload(assets, ref, bytes);
    }
    return assets;
}

export async function buildProjectPackage({
    handle,
    projectId,
    projectStore,
    worldRepo,
    knowledgeRepo,
    assetStore,
    versionedJsonResources = null,
    idFactory = createNativeId,
}) {
    if (!projectStore) throw new TypeError('buildProjectPackage requires ProjectStore');
    const authorSource = await projectStore.get(handle, projectId);
    if (!authorSource) throw new Error('Studio Project not found: ' + projectId);
    const frontendBuild = compileProjectFrontends(authorSource.package, await projectStore.readBuildFiles(handle, projectId));
    const source = { ...authorSource, package: frontendBuild.packageSource };

    const closure = await resolveProjectDependencyClosure({
        handle,
        source,
        worldRepo,
        knowledgeRepo,
        assetStore,
        versionedJsonResources,
    });
    const assetPayloads = await collectProjectAssets({ handle, source, projectStore });
    for (const payload of closure.assets) {
        mergeAssetPayload(assetPayloads, payload.ref, payload.bytes);
    }

    const packageVersionId = idFactory('packageVersion');
    const packageRef = ref => ({
        resourceType: ref.resourceType,
        resourceId: ref.resourceId,
        revision: ref.revision,
        scope: 'package',
        packageId: source.project.packageId,
        packageVersionId,
    });
    const mappedModelPromptResources = closure.resources.map(item => {
        const resource = mapVersionedModelPromptResourceRefs(
            item.resourceType,
            item.resource,
            ref => packageRef(ref),
        );
        return Object.freeze({
            resourceType: item.resourceType,
            resource,
            origin: Object.freeze({
                scope: 'package',
                packageId: source.project.packageId,
                packageVersionId,
            }),
        });
    });
    const packagedModelPromptResources = freezePackagePromptPrograms(mappedModelPromptResources, { scope: 'package', packageId: source.project.packageId, packageVersionId });
    const packagedResourceKeys = new Set(packagedModelPromptResources.map(item => {
        const identity = getVersionedModelPromptResourceIdentity(item.resourceType, item.resource);
        return identity.resourceType + ':' + identity.resourceId + '@' + identity.revision;
    }));
    const runtimePlugins = source.package.runtime?.plugins;
    const compiledPlugins = runtimePlugins === undefined
        ? null
        : compilePackageRuntimePlugins(runtimePlugins, {
            declaredPermissions: source.package.permissions,
        });
    const packageRuntime = source.package.runtime === undefined
        ? undefined
        : {
            ...source.package.runtime,
            ...(source.package.runtime.modelPrompt === undefined ? {} : {
                modelPrompt: {
                    ...source.package.runtime.modelPrompt,
                    roles: (source.package.runtime.modelPrompt.roles || []).map(role => ({
                        ...role,
                        ...(role.promptProgramRef ? { promptProgramRef: packageRef(role.promptProgramRef) } : {}),
                        ...(role.generationProfileRef ? { generationProfileRef: packageRef(role.generationProfileRef) } : {}),
                    })),
                },
            }),
            ...(compiledPlugins ? { plugins: compiledPlugins.manifests } : {}),
        };
    for (const role of packageRuntime?.modelPrompt?.roles || []) {
        for (const ref of [role.promptProgramRef, role.generationProfileRef].filter(Boolean)) {
            const key = ref.resourceType + ':' + ref.resourceId + '@' + ref.revision;
            if (!packagedResourceKeys.has(key)) {
                throw new Error('Package model/prompt closure is missing exact resource ' + key);
            }
        }
    }
    const manifest = assertAtriaPackageManifest({
        format: 'atria-package',
        schemaVersion: 2,
        nativeSchemaVersion: 1,
        packageId: source.project.packageId,
        packageVersionId,
        ...source.package,
        ...(packageRuntime === undefined ? {} : { runtime: packageRuntime }),
        worlds: closure.worlds,
        knowledge: closure.knowledge,
        knowledgeBindings: closure.knowledgeBindings,
        resources: packagedModelPromptResources,
        assets: [...assetPayloads.values()].map(item => item.ref),
    });

    const sourceFiles = frontendBuild.files;
    validateExperienceResources(manifest, sourceFiles, new Map([...assetPayloads].map(([key, item]) => [key, item.bytes])), { lower: true });
    const container = buildAtriaPackageContainer({
        manifest,
        sourceFiles,
        assetPayloads: new Map(
            [...assetPayloads.entries()].map(([assetId, item]) => [assetId, item.bytes]),
        ),
    });
    const packageContentHash = digest(container.archive);
    const packageVersion = assertPackageVersion({
        packageVersionId,
        packageId: manifest.packageId,
        version: manifest.version,
        packageContentHash,
    });

    return Object.freeze({
        archive: container.archive,
        manifest,
        packageVersion,
        preflight: container.preflight,
    });
}

const archiveCaches = new WeakMap();
export class PackageInstaller {
    #cache;

    constructor({ packageRepo, assetStore }) {
        if (!packageRepo || !assetStore) {
            throw new TypeError('PackageInstaller requires PackageRepo and AssetStore');
        }
        this._packageRepo = packageRepo;
        this._assetStore = assetStore;
        if (!archiveCaches.has(assetStore)) archiveCaches.set(assetStore, { archives: new Map(), bytes: 0, inspections: new Map() });
        this.#cache = archiveCaches.get(assetStore);
    }

    preflight(archive) {
        return preflightAtriaPackageContainer(archive);
    }

    async #inspect(key, archive) {
        let pending = this.#cache.inspections.get(key);
        if (!pending) {
            pending = inspectAtriaPackageContainerAsync(archive, { residentBytes: RESIDENT_PACKAGE_PAYLOAD_BYTES }).then(inspected => {
                validateContentComposition(packagePayloadView(inspected));
                freezeParsedJson(inspected.manifest); freezeParsedJson(inspected.preflight);
                return inspected;
            });
            this.#cache.inspections.set(key, pending);
        }
        try { return await pending; } finally {
            if (this.#cache.inspections.get(key) === pending) this.#cache.inspections.delete(key);
        }
    }

    async install(handle, archive, { grantedPermissions = [], setCurrent = true } = {}) {
        const inspected = packagePayloadView(await inspectAtriaPackageContainerAsync(archive));
        function* payloads() { yield archive; yield* inspected.assets.values(); }
        return this._assetStore.withBlobPublication(handle, payloads(), () => this._installPinned(handle, archive, inspected, { grantedPermissions, setCurrent }));
    }

    async _installPinned(handle, archive, inspected, { grantedPermissions, setCurrent }) {
        const preflight = inspected.preflight;
        const granted = new Set(grantedPermissions);
        const missing = preflight.requiredPermissions.filter(permission => !granted.has(permission));
        if (missing.length) {
            const error = new Error('Package installation requires explicit permission grant: ' + missing.join(', '));
            error.code = 'native_package_permission_required';
            error.permissions = missing;
            throw error;
        }

        validateContentComposition(inspected);
        const manifest = inspected.manifest;
        validateExperienceResources(manifest, inspected.sourceFiles, inspected.assets);
        const packageContentHash = digest(archive);
        const packageVersion = assertPackageVersion({
            packageVersionId: manifest.packageVersionId,
            packageId: manifest.packageId,
            version: manifest.version,
            packageContentHash,
        });

        // Blob/content first. If any later metadata operation fails on FS, the
        // only residue is an unreferenced content-addressed blob that GC can
        // remove. Package current pointer is always published last by PackageRepo.
        const storedHash = await this._assetStore.putBlob(handle, archive);
        if (storedHash !== packageContentHash) {
            throw new Error('Stored Package container hash mismatch');
        }
        for (const ref of manifest.assets) {
            const bytes = inspected.assets.get(ref.assetId);
            await this._assetStore.put(handle, ref, bytes);
        }

        const existing = await this._packageRepo.get(handle, manifest.packageId);
        if (!existing) {
            await this._packageRepo.create(handle, assertPackageRecord({
                packageId: manifest.packageId,
                displayName: manifest.name,
                currentVersionId: null,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            }));
        } else if (setCurrent && existing.displayName !== manifest.name) {
            await this._packageRepo.save(handle, assertPackageRecord({
                ...existing,
                displayName: manifest.name,
                updatedAt: Math.max(Date.now(), Number(existing.updatedAt || 0)),
            }));
        }

        await this._packageRepo.commitVersion(handle, packageVersion, { setCurrent });
        return Object.freeze({
            package: await this._packageRepo.get(handle, manifest.packageId),
            packageVersion,
            manifest,
            preflight,
        });
    }

    async exportArchive(handle, packageId, packageVersionId, expectedContentHash) {
        if (typeof expectedContentHash !== 'string' || !/^[a-f0-9]{64}$/.test(expectedContentHash)) throw new TypeError('Exact Package content hash required');
        return this._assetStore.withBlobLease(handle, expectedContentHash, async () => {
            const opened = await this.open(handle, packageId, packageVersionId, { includeArchive: true });
            if (!opened || opened.packageVersion.packageContentHash !== expectedContentHash) throw new TypeError('Exact installed PackageVersion required');
            return { archive: Buffer.from(opened.archive), packageVersion: opened.packageVersion };
        });
    }

    async open(handle, packageId, packageVersionId, { includeArchive = false } = {}) {
        const version = await this._packageRepo.getVersion(handle, packageId, packageVersionId);
        if (!version) return null;
        assertPackageVersion(version);
        if (version.packageId !== packageId || version.packageVersionId !== packageVersionId) {
            throw new Error('Installed PackageVersion metadata does not match exact Package reference');
        }
        const cacheKey = JSON.stringify([handle, version.packageContentHash]);
        let cached = this.#cache.archives.get(cacheKey);
        const stamp = await this._assetStore.blobStamp(handle, version.packageContentHash);
        const reusable = !!stamp && cached?.blobStamp === stamp;
        const archive = stamp !== null && (!reusable || includeArchive) ? await this._assetStore.readBlob(handle, version.packageContentHash) : null;
        if (stamp === null || (!reusable || includeArchive) && !archive) {
            const error = new Error('Installed Package content blob is missing');
            error.code = 'native_package_content_missing';
            throw error;
        }
        if (archive && stamp !== await this._assetStore.blobStamp(handle, version.packageContentHash)) {
            throw new Error('Installed Package content changed during read');
        }
        // AssetStore verifies cold/export reads. A warm open only needs the
        // owner-scoped immutable blob identity, not another archive or digest.
        if (!reusable && cached) {
            if (this.#cache.archives.get(cacheKey) === cached) {
                this.#cache.archives.delete(cacheKey);
                this.#cache.bytes -= cached.bytes;
            }
            cached = null;
        }
        const inspected = cached?.inspected ?? await this.#inspect(JSON.stringify([cacheKey, stamp]), archive);
        if (
            inspected.manifest.packageId !== packageId
            || inspected.manifest.packageVersionId !== packageVersionId
            || inspected.manifest.version !== version.version
        ) {
            throw new Error('Installed PackageVersion metadata does not match Package content');
        }
        if (cached) {
            this.#cache.archives.delete(cacheKey);
            this.#cache.archives.set(cacheKey, cached);
        } else {
            const bytes = parsedArchiveBytes(inspected);
            // A legal large package remains usable; memoization is optional.
            if (bytes <= PARSED_ARCHIVE_BYTES) {
                // Concurrent cold opens share admission and may finish together.
                const previous = this.#cache.archives.get(cacheKey);
                if (previous) { this.#cache.archives.delete(cacheKey); this.#cache.bytes -= previous.bytes; }
                while (this.#cache.archives.size >= PARSED_ARCHIVE_ENTRIES || this.#cache.bytes + bytes > PARSED_ARCHIVE_BYTES) {
                    const oldest = this.#cache.archives.keys().next().value;
                    this.#cache.bytes -= this.#cache.archives.get(oldest).bytes;
                    this.#cache.archives.delete(oldest);
                }
                this.#cache.archives.set(cacheKey, { bytes, inspected, blobStamp: stamp });
                this.#cache.bytes += bytes;
            }
        }
        const opened = copyParsedArchive(inspected);
        return Object.freeze({
            packageVersion: version,
            ...opened,
            ...(includeArchive ? { archive: copyPackageBytes(archive) } : {}),
        });
    }

    async installCommunity(handle, base, bytes) {
        const opened = await this.open(handle, base.packageId, base.packageVersionId);
        if (!opened || opened.packageVersion.packageContentHash !== base.packageContentHash) throw new TypeError('Exact installed Base required');
        const runtime = opened.manifest.runtime?.experienceContract?.contentRuntime;
        if (!runtime || runtime.composition) throw new TypeError('Uncomposed Base extension contract required');
        readCommunity(bytes, base, runtime);
        const ref = { assetId: 'asset_' + contentDigest(bytes).slice(0, 32), contentHash: contentDigest(bytes), size: bytes.length, mediaType: 'application/json' };
        await this._assetStore.put(handle, ref, bytes);
        return { assetId: ref.assetId, contentHash: ref.contentHash };
    }

    async compose(handle, base, resources, options = {}) {
        if (!Array.isArray(resources) || resources.length > 32) throw new TypeError('Composition resource limit');
        const opened = await this.open(handle, base.packageId, base.packageVersionId);
        if (!opened || opened.packageVersion.packageContentHash !== base.packageContentHash) throw new TypeError('Exact installed Base required');
        const baseBytes = await this._assetStore.readBlob(handle, base.packageContentHash);
        const payloads = [];
        for (const ref of resources) {
            const installed = await this._assetStore.getRef(handle, ref.assetId);
            if (!installed || installed.contentHash !== ref.contentHash) throw new TypeError('Missing installed exact Community resource');
            payloads.push({ ref, bytes: await this._assetStore.readBlob(handle, ref.contentHash) });
        }
        const resolved = composeContent(baseBytes, payloads, createNativeId('packageVersion'));
        validateExperienceResources(resolved.manifest, resolved.sourceFiles, resolved.assets);
        const { archive } = buildAtriaPackageContainer({ manifest: resolved.manifest, sourceFiles: resolved.sourceFiles, assetPayloads: resolved.assets });
        return this.install(handle, archive, { ...options, setCurrent: false });
    }

    async currentRegexEdit(handle, packageId, packageVersionId) {
        const record = await this._packageRepo.get(handle, packageId);
        if (!record?.currentVersionId || record.currentVersionId === packageVersionId) return null;
        const opened = await this.open(handle, packageId, record.currentVersionId);
        if (!opened.manifest.metadata?.atri_regex_edits?.ancestorVersions?.includes(packageVersionId)) return null;
        return { schemaVersion: 1, regexScripts: opened.manifest.processors?.regex || [] };
    }

    async currentKnowledgeEdits(handle, packageId, bindings, packageVersionId) {
        const record = await this._packageRepo.get(handle, packageId);
        if (!record?.currentVersionId || record.currentVersionId === packageVersionId || !bindings.some(item => item.source.kind === 'package')) return [];
        const opened = await this.open(handle, packageId, record.currentVersionId);
        const edits = opened.manifest.metadata?.atri_knowledge_edits;
        if (!Array.isArray(edits)) return [];
        return opened.manifest.knowledge.filter(snapshot => bindings.some(binding => binding.source.kind === 'package'
            && binding.source.knowledgeBaseId === snapshot.knowledgeBase.knowledgeBaseId
            && binding.source.knowledgeRevisionId !== snapshot.revision.knowledgeRevisionId
            && edits.some(edit => edit.knowledgeBaseId === binding.source.knowledgeBaseId && edit.ancestorRevisions?.includes(binding.source.knowledgeRevisionId))));
    }
}
