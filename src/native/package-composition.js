import { freezePackagePromptPrograms } from './model-prompt-runtime/package-freeze.js';
import { createHash } from 'node:crypto';

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
    const source = await projectStore.get(handle, projectId);
    if (!source) throw new Error('Studio Project not found: ' + projectId);

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

    const sourceFiles = await projectStore.readBuildFiles(handle, projectId);
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

    async install(handle, archive, { grantedPermissions = [] } = {}) {
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
        const manifest = inspected.manifest;
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
        } else if (existing.displayName !== manifest.name) {
            await this._packageRepo.save(handle, assertPackageRecord({
                ...existing,
                displayName: manifest.name,
                updatedAt: Math.max(Date.now(), Number(existing.updatedAt || 0)),
            }));
        }

        await this._packageRepo.commitVersion(handle, packageVersion, { setCurrent: true });
        return Object.freeze({
            package: await this._packageRepo.get(handle, manifest.packageId),
            packageVersion,
            manifest,
            preflight,
        });
    }

    async open(handle, packageId, packageVersionId) {
        const version = await this._packageRepo.getVersion(handle, packageId, packageVersionId);
        if (!version) return null;
        const archive = await this._assetStore.readBlob(handle, version.packageContentHash);
        if (!archive) {
            const error = new Error('Installed Package content blob is missing');
            error.code = 'native_package_content_missing';
            throw error;
        }
        if (digest(archive) !== version.packageContentHash) {
            throw new Error('Installed Package content hash mismatch');
        }
        const inspected = inspectAtriaPackageContainer(archive);
        if (
            inspected.manifest.packageId !== packageId
            || inspected.manifest.packageVersionId !== packageVersionId
            || inspected.manifest.version !== version.version
        ) {
            throw new Error('Installed PackageVersion metadata does not match Package content');
        }
        return Object.freeze({
            packageVersion: version,
            manifest: inspected.manifest,
            sourceFiles: inspected.sourceFiles,
            assets: inspected.assets,
            preflight: inspected.preflight,
        });
    }
}
