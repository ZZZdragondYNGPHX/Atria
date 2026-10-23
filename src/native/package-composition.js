import { freezePackagePromptPrograms } from './model-prompt-runtime/package-freeze.js';
import { validateExperienceResources } from './experience-validation.js';
import { compileProjectFrontends } from './frontend/compiler.js';
import { createHash } from 'node:crypto';
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
    inspectAtriaPackageContainer,
    preflightAtriaPackageContainer,
} from './package-container.js';

function digest(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

// A full-resolution Work can exceed the former 32 MiB memoization budget.
// Bound the server-side parsed cache independently from browser media, while
// retaining owner-blob verification and copy isolation on every open.
const PARSED_ARCHIVE_BYTES = 256 * 1024 * 1024;
const PARSED_ARCHIVE_ENTRIES = 8;

// A returned Buffer's whole backing store belongs to that caller. Small
// pooled Buffers could otherwise expose a cached neighbour through .buffer.
function copyPackageBytes(bytes) {
    const copy = Buffer.allocUnsafeSlow(bytes.length);
    bytes.copy(copy);
    return copy;
}

function copyParsedJson(value) {
    if (value === null || typeof value !== 'object') return value;
    const copy = Array.isArray(value) ? value.map(copyParsedJson)
        : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyParsedJson(item)]));
    return Object.isFrozen(value) ? Object.freeze(copy) : copy;
}

function parsedJsonBytes(value) {
    if (typeof value === 'string') return 24 + value.length * 2;
    if (value === null || typeof value !== 'object') return 8;
    return Array.isArray(value) ? 32 + value.reduce((bytes, item) => bytes + 8 + parsedJsonBytes(item), 0)
        : 64 + Object.entries(value).reduce((bytes, [key, item]) => bytes + 32 + key.length * 2 + parsedJsonBytes(item), 0);
}

function copyParsedArchive(inspected) {
    return Object.freeze({ manifest: copyParsedJson(inspected.manifest), preflight: copyParsedJson(inspected.preflight),
        sourceFiles: new Map([...inspected.sourceFiles].map(([key, bytes]) => [key, copyPackageBytes(bytes)])),
        assets: new Map([...inspected.assets].map(([key, bytes]) => [key, copyPackageBytes(bytes)])) });
}

function parsedArchiveBytes(archive, inspected) {
    let bytes = archive.length + parsedJsonBytes(inspected.manifest) + parsedJsonBytes(inspected.preflight);
    for (const map of [inspected.sourceFiles, inspected.assets]) for (const [key, buffer] of map) bytes += buffer.length + key.length * 2 + 96;
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

export class PackageInstaller {
    #parsedArchives = new Map();
    #parsedArchiveBytes = 0;

    constructor({ packageRepo, assetStore }) {
        if (!packageRepo || !assetStore) {
            throw new TypeError('PackageInstaller requires PackageRepo and AssetStore');
        }
        this._packageRepo = packageRepo;
        this._assetStore = assetStore;
    }

    preflight(archive) {
        return preflightAtriaPackageContainer(archive);
    }

    async install(handle, archive, { grantedPermissions = [], setCurrent = true } = {}) {
        const inspected = inspectAtriaPackageContainer(archive);
        return this._assetStore.withBlobPublication(handle, [archive, ...inspected.assets.values()], () => this._installPinned(handle, archive, { grantedPermissions, setCurrent }));
    }

    async _installPinned(handle, archive, { grantedPermissions, setCurrent }) {
        const preflight = this.preflight(archive);
        const granted = new Set(grantedPermissions);
        const missing = preflight.requiredPermissions.filter(permission => !granted.has(permission));
        if (missing.length) {
            const error = new Error('Package installation requires explicit permission grant: ' + missing.join(', '));
            error.code = 'native_package_permission_required';
            error.permissions = missing;
            throw error;
        }

        const inspected = inspectAtriaPackageContainer(archive);
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
        const archive = await this._assetStore.readBlob(handle, version.packageContentHash);
        if (!archive) {
            const error = new Error('Installed Package content blob is missing');
            error.code = 'native_package_content_missing';
            throw error;
        }
        if (digest(archive) !== version.packageContentHash) {
            throw new Error('Installed Package content hash mismatch');
        }
        let cached = this.#parsedArchives.get(version.packageContentHash);
        // The key is an acceleration hint only. Each open has read the
        // owner's actual blob and checked its complete digest above.
        if (cached && !cached.archive.equals(archive)) {
            this.#parsedArchives.delete(version.packageContentHash);
            this.#parsedArchiveBytes -= cached.bytes;
            cached = null;
        }
        const inspected = cached?.inspected ?? inspectAtriaPackageContainer(archive);
        if (!cached) validateContentComposition(inspected);
        if (
            inspected.manifest.packageId !== packageId
            || inspected.manifest.packageVersionId !== packageVersionId
            || inspected.manifest.version !== version.version
        ) {
            throw new Error('Installed PackageVersion metadata does not match Package content');
        }
        if (cached) {
            this.#parsedArchives.delete(version.packageContentHash);
            this.#parsedArchives.set(version.packageContentHash, cached);
        } else {
            const bytes = parsedArchiveBytes(archive, inspected);
            // A legal large package remains usable; memoization is optional.
            if (bytes <= PARSED_ARCHIVE_BYTES) {
                while (this.#parsedArchives.size >= PARSED_ARCHIVE_ENTRIES || this.#parsedArchiveBytes + bytes > PARSED_ARCHIVE_BYTES) {
                    const oldest = this.#parsedArchives.keys().next().value;
                    this.#parsedArchiveBytes -= this.#parsedArchives.get(oldest).bytes;
                    this.#parsedArchives.delete(oldest);
                }
                this.#parsedArchives.set(version.packageContentHash, { bytes, archive: copyPackageBytes(archive), inspected: copyParsedArchive(inspected) });
                this.#parsedArchiveBytes += bytes;
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
