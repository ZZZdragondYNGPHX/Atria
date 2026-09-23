import {
    ATRIA_RUNTIME_DESCRIPTOR_FORMAT,
    ATRIA_RUNTIME_DESCRIPTOR_SCHEMA_VERSION,
    assertNativeRuntimeDescriptor,
} from './authoring-contracts.js';

function plain(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
    return value == null ? value : structuredClone(value);
}

function runtimeJsonPath(value, field) {
    const path = String(value || '').trim();
    if (
        !path
        || path.length > 512
        || path.includes('\\')
        || path.includes('\0')
        || path.startsWith('/')
        || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(path)
        || path.split('/').some(segment => !segment || segment === '.' || segment === '..')
        || !path.toLowerCase().endsWith('.json')
    ) {
        throw new TypeError(field + ' must be a safe declarative .json package path');
    }
    return path;
}

function gameRuntimeSource(value) {
    if (value === undefined) return Object.freeze({});
    if (!plain(value)) throw new TypeError('Native Runtime game config must be an object');
    const allowed = new Set(['logic', 'observations']);
    for (const key of Object.keys(value)) {
        if (!allowed.has(key)) throw new TypeError(`Native Runtime game config contains unsupported field '${key}'`);
    }
    return Object.freeze({
        ...(value.logic === undefined ? {} : { logic: runtimeJsonPath(value.logic, 'Native Runtime game.logic') }),
        ...(value.observations === undefined ? {} : {
            observations: runtimeJsonPath(value.observations, 'Native Runtime game.observations'),
        }),
    });
}

function runtimeSource(manifest, entryPoint) {
    const packageRuntime = plain(manifest?.runtime) ? manifest.runtime : {};
    const entryRuntime = plain(entryPoint?.runtime) ? entryPoint.runtime : {};
    const experience = entryRuntime.experience ?? packageRuntime.experience;
    if (!plain(experience)) {
        throw new TypeError('Native Runtime requires an explicit experience contract');
    }

    const packageGame = gameRuntimeSource(packageRuntime.game);
    const entryGame = gameRuntimeSource(entryRuntime.game);
    const game = gameRuntimeSource({ ...packageGame, ...entryGame });

    return Object.freeze({
        experience: clone(experience),
        game,
        primaryWorldId: entryPoint.primaryWorldId
            ?? (entryPoint.worldIds.length === 1 ? entryPoint.worldIds[0] : null),
    });
}

function packageSkillIds(manifest) {
    if (manifest?.skills === undefined) return [];
    if (!Array.isArray(manifest.skills)) {
        throw new TypeError('AtriaPackage.skills must be an array for Native Runtime');
    }
    return manifest.skills.map((item, index) => {
        if (typeof item === 'string' && item.trim()) return item.trim();
        if (plain(item)) {
            const value = String(item.skillId ?? item.id ?? '').trim();
            if (value) return value;
        }
        throw new TypeError('AtriaPackage.skills[' + index + '] must identify a skill');
    });
}

function pushUnique(resources, seen, item) {
    const key = item.resourceType + '\0' + item.resourceId + '\0' + String(item.revision ?? '');
    if (seen.has(key)) return;
    seen.add(key);
    resources.push(item);
}

function compileResources(manifest, entryPoint) {
    const resources = [];
    const seen = new Set();

    for (const actorId of entryPoint.actorIds) {
        pushUnique(resources, seen, { resourceType: 'core.actor', resourceId: actorId });
    }

    const selectedWorlds = manifest.worlds.filter(item => entryPoint.worldIds.includes(item.world.worldId));
    for (const item of selectedWorlds) {
        pushUnique(resources, seen, {
            resourceType: 'core.world',
            resourceId: item.world.worldId,
            revision: item.revision.worldRevisionId,
        });
    }

    const selectedBindingIds = new Set(entryPoint.knowledgeBindingIds);
    for (const item of selectedWorlds) {
        for (const bindingId of item.revision.knowledgeBindingIds) selectedBindingIds.add(bindingId);
    }

    const selectedBindings = manifest.knowledgeBindings.filter(item => selectedBindingIds.has(item.knowledgeBindingId));
    for (const binding of selectedBindings) {
        pushUnique(resources, seen, {
            resourceType: 'core.knowledge-binding',
            resourceId: binding.knowledgeBindingId,
        });
        pushUnique(resources, seen, {
            resourceType: 'core.knowledge',
            resourceId: binding.source.knowledgeBaseId,
            revision: binding.source.knowledgeRevisionId,
        });
    }

    const selectedAssetIds = new Set();
    for (const item of selectedWorlds) {
        for (const assetId of item.revision.assetIds) selectedAssetIds.add(assetId);
    }
    // PackageVersion is immutable and self-contained. Assets that are not tied
    // to a WorldRevision may still be referenced by Text runtime definitions,
    // so expose every exact immutable AssetRef carried by the PackageVersion.
    for (const asset of manifest.assets) selectedAssetIds.add(asset.assetId);
    for (const asset of manifest.assets) {
        if (!selectedAssetIds.has(asset.assetId)) continue;
        pushUnique(resources, seen, {
            resourceType: 'core.asset',
            resourceId: asset.assetId,
            revision: asset.contentHash,
        });
    }

    return resources;
}

export function compileNativeRuntimeDescriptor({ packageVersion, manifest, entryPointId }) {
    if (!packageVersion || !manifest) {
        throw new TypeError('Runtime Descriptor compiler requires an installed PackageVersion');
    }
    if (
        manifest.packageId !== packageVersion.packageId
        || manifest.packageVersionId !== packageVersion.packageVersionId
        || manifest.version !== packageVersion.version
    ) {
        throw new TypeError('Runtime Descriptor PackageVersion identity mismatch');
    }

    const entryPoint = manifest.entryPoints.find(item => item.entryPointId === entryPointId);
    if (!entryPoint) throw new TypeError('Runtime Descriptor EntryPoint is not part of this PackageVersion');

    const runtime = runtimeSource(manifest, entryPoint);
    const descriptor = assertNativeRuntimeDescriptor({
        format: ATRIA_RUNTIME_DESCRIPTOR_FORMAT,
        schemaVersion: ATRIA_RUNTIME_DESCRIPTOR_SCHEMA_VERSION,
        packageId: packageVersion.packageId,
        packageVersionId: packageVersion.packageVersionId,
        packageContentHash: packageVersion.packageContentHash,
        entryPointId: entryPoint.entryPointId,
        experience: runtime.experience,
        capabilities: manifest.capabilities,
        resources: compileResources(manifest, entryPoint),
        plugins: [],
        skills: packageSkillIds(manifest),
    });

    return Object.freeze({
        descriptor,
        runtime,
        entryPoint,
    });
}

export function resolveNativeRuntimePackage(opened, entryPointId) {
    if (!opened?.packageVersion || !opened?.manifest || !(opened.sourceFiles instanceof Map)) {
        throw new TypeError('Native Runtime resolver requires an opened installed PackageVersion');
    }
    const compiled = compileNativeRuntimeDescriptor({
        packageVersion: opened.packageVersion,
        manifest: opened.manifest,
        entryPointId,
    });
    return Object.freeze({
        ...compiled,
        manifest: opened.manifest,
        packageVersion: opened.packageVersion,
    });
}
