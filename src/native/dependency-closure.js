import {
    assertKnowledgeBinding,
    assertPackagedKnowledgeSnapshot,
    assertPackagedWorldSnapshot,
} from './world-knowledge.js';
import { assertExactResourceRef } from './model-prompt-runtime/contracts.js';
import {
    collectVersionedModelPromptResourceRefs,
    getVersionedModelPromptResourceIdentity,
} from './model-prompt-runtime/resources.js';
import { hashNativeDocument } from './repositories/common.js';

export class NativeDependencyError extends Error {
    constructor(code, details = {}) {
        super(code);
        this.name = 'NativeDependencyError';
        this.code = code;
        this.details = details;
    }
}

function keyKnowledge(knowledgeBaseId, knowledgeRevisionId) {
    return knowledgeBaseId + '@' + knowledgeRevisionId;
}

export function validateRequiredEntryGraph(snapshot) {
    const entries = new Map(snapshot.entries.map(entry => [entry.knowledgeEntryId, entry]));
    for (const entry of snapshot.entries) {
        for (const field of ['requiredEntryIds', 'relatedEntryIds']) {
            for (const relatedId of entry.relations?.[field] || []) {
                if (!entries.has(relatedId)) {
                    throw new NativeDependencyError('native_knowledge_relation_missing', {
                        knowledgeBaseId: snapshot.knowledgeBase.knowledgeBaseId,
                        knowledgeRevisionId: snapshot.revision.knowledgeRevisionId,
                        knowledgeEntryId: entry.knowledgeEntryId,
                        relatedEntryId: relatedId,
                        relation: field,
                    });
                }
            }
        }
    }

    const visiting = new Set();
    const visited = new Set();
    const stack = [];

    const visit = (entryId) => {
        if (visited.has(entryId)) return;
        if (visiting.has(entryId)) {
            const start = stack.indexOf(entryId);
            throw new NativeDependencyError('native_knowledge_dependency_cycle', {
                knowledgeBaseId: snapshot.knowledgeBase.knowledgeBaseId,
                knowledgeRevisionId: snapshot.revision.knowledgeRevisionId,
                cycle: [...stack.slice(start), entryId],
            });
        }
        visiting.add(entryId);
        stack.push(entryId);
        const entry = entries.get(entryId);
        for (const requiredId of entry?.relations?.requiredEntryIds || []) visit(requiredId);
        stack.pop();
        visiting.delete(entryId);
        visited.add(entryId);
    };

    for (const entryId of entries.keys()) visit(entryId);
}

function packageBinding(binding) {
    return assertKnowledgeBinding({
        ...binding,
        source: {
            ...binding.source,
            kind: 'package',
        },
    });
}

export async function resolveProjectDependencyClosure({
    handle,
    source,
    worldRepo,
    knowledgeRepo,
    assetStore,
    versionedJsonResources = null,
}) {
    if (!source) throw new TypeError('Dependency closure requires a Project source');
    if (!worldRepo || !knowledgeRepo || !assetStore) {
        throw new TypeError('Dependency closure requires WorldRepo, KnowledgeRepo and AssetStore');
    }

    const worlds = new Map();
    const knowledge = new Map();
    const bindings = new Map();
    const assets = new Map();
    const modelPromptResources = new Map();
    const projectModelPromptResources = new Map();
    const resolvingModelPromptResources = new Set();
    const projectAssetIds = new Set((source.assetFiles || []).map(item => item.assetId));
    const exactAssetDependencies = new Map(
        (source.dependencies?.assets || []).map(item => [item.assetId, item.contentHash]),
    );

    const modelPromptKey = (resourceType, resourceId, revision) => (
        resourceType + ':' + resourceId + '@' + revision
    );

    for (const item of source.resources || []) {
        const identity = getVersionedModelPromptResourceIdentity(item.resourceType, item.resource);
        projectModelPromptResources.set(
            modelPromptKey(identity.resourceType, identity.resourceId, identity.revision),
            item.resource,
        );
    }

    const addModelPromptResource = async (resourceType, resource, origin) => {
        const identity = getVersionedModelPromptResourceIdentity(resourceType, resource);
        const key = modelPromptKey(resourceType, identity.resourceId, identity.revision);
        const existing = modelPromptResources.get(key);
        if (existing) {
            if (hashNativeDocument(existing.resource) !== hashNativeDocument(resource)) {
                throw new NativeDependencyError('native_model_prompt_dependency_conflict', { key });
            }
            return existing;
        }
        const entry = Object.freeze({
            resourceType,
            resource,
            origin: Object.freeze({ ...origin }),
        });
        modelPromptResources.set(key, entry);
        if (resolvingModelPromptResources.has(key)) return entry;
        resolvingModelPromptResources.add(key);
        try {
            for (const ref of collectVersionedModelPromptResourceRefs(resourceType, resource)) {
                await resolveModelPromptRef(ref);
            }
        } finally {
            resolvingModelPromptResources.delete(key);
        }
        return entry;
    };

    const resolveModelPromptRef = async (value) => {
        const ref = assertExactResourceRef(value, null, 'Model/prompt dependency ref');
        const key = modelPromptKey(ref.resourceType, ref.resourceId, ref.revision);
        if (modelPromptResources.has(key)) return modelPromptResources.get(key);
        if (ref.scope === 'project') {
            if (ref.projectId !== source.project.projectId) {
                throw new NativeDependencyError('native_model_prompt_dependency_project_mismatch', {
                    projectId: source.project.projectId,
                    ref,
                });
            }
            const resource = projectModelPromptResources.get(key);
            if (!resource) {
                throw new NativeDependencyError('native_model_prompt_dependency_missing', { ref });
            }
            return addModelPromptResource(ref.resourceType, resource, {
                scope: 'project',
                projectId: source.project.projectId,
            });
        }
        if (ref.scope === 'library') {
            if (!versionedJsonResources) {
                throw new NativeDependencyError('native_model_prompt_resource_handler_missing', { ref });
            }
            let exact;
            try {
                exact = await versionedJsonResources.getExact(handle, ref);
            } catch (error) {
                if (error?.name === 'NotFoundError') {
                    throw new NativeDependencyError('native_model_prompt_dependency_missing', { ref });
                }
                throw error;
            }
            return addModelPromptResource(ref.resourceType, exact.snapshot, { scope: 'library' });
        }
        throw new NativeDependencyError('native_model_prompt_dependency_scope_unsupported', { ref });
    };

    const addKnowledgeSnapshot = (snapshot) => {
        const parsed = assertPackagedKnowledgeSnapshot(snapshot);
        validateRequiredEntryGraph(parsed);
        const key = keyKnowledge(
            parsed.knowledgeBase.knowledgeBaseId,
            parsed.revision.knowledgeRevisionId,
        );
        const existing = knowledge.get(key);
        if (existing && JSON.stringify(existing) !== JSON.stringify(parsed)) {
            throw new NativeDependencyError('native_knowledge_dependency_conflict', { key });
        }
        knowledge.set(key, parsed);
        return parsed;
    };

    const loadLibraryKnowledge = async (knowledgeBaseId, knowledgeRevisionId) => {
        const key = keyKnowledge(knowledgeBaseId, knowledgeRevisionId);
        if (knowledge.has(key)) return knowledge.get(key);

        const base = await knowledgeRepo.get(handle, knowledgeBaseId);
        const revision = await knowledgeRepo.getRevision(handle, knowledgeBaseId, knowledgeRevisionId);
        if (!base || !revision || revision.knowledgeBaseId !== knowledgeBaseId) {
            throw new NativeDependencyError('native_knowledge_dependency_missing', {
                knowledgeBaseId,
                knowledgeRevisionId,
            });
        }
        const entries = await knowledgeRepo.listEntries(handle, knowledgeBaseId, knowledgeRevisionId);
        if (
            entries.length !== revision.entryIds.length
            || revision.entryIds.some((entryId, index) => entries[index]?.knowledgeEntryId !== entryId)
        ) {
            throw new NativeDependencyError('native_knowledge_dependency_incomplete', {
                knowledgeBaseId,
                knowledgeRevisionId,
            });
        }
        return addKnowledgeSnapshot({
            knowledgeBase: {
                ...base,
                currentRevisionId: knowledgeRevisionId,
            },
            revision,
            entries,
        });
    };

    const loadBinding = async (knowledgeBindingId) => {
        if (bindings.has(knowledgeBindingId)) return bindings.get(knowledgeBindingId);
        const binding = await knowledgeRepo.getBinding(handle, knowledgeBindingId);
        if (!binding) {
            throw new NativeDependencyError('native_knowledge_binding_missing', { knowledgeBindingId });
        }
        await loadLibraryKnowledge(
            binding.source.knowledgeBaseId,
            binding.source.knowledgeRevisionId,
        );
        const vendored = packageBinding(binding);
        bindings.set(knowledgeBindingId, vendored);
        return vendored;
    };

    const loadAsset = async (assetId, expectedContentHash = null) => {
        if (assets.has(assetId)) {
            const existing = assets.get(assetId);
            if (expectedContentHash && existing.ref.contentHash !== expectedContentHash) {
                throw new NativeDependencyError('native_asset_dependency_revision_mismatch', {
                    assetId,
                    expectedContentHash,
                    actualContentHash: existing.ref.contentHash,
                });
            }
            return existing;
        }
        const payload = await assetStore.read(handle, assetId);
        if (!payload) throw new NativeDependencyError('native_asset_dependency_missing', { assetId });
        if (expectedContentHash && payload.ref.contentHash !== expectedContentHash) {
            throw new NativeDependencyError('native_asset_dependency_revision_mismatch', {
                assetId,
                expectedContentHash,
                actualContentHash: payload.ref.contentHash,
            });
        }
        assets.set(assetId, payload);
        return payload;
    };

    const addWorldSnapshot = async (snapshot) => {
        const parsed = assertPackagedWorldSnapshot(snapshot);
        const existing = worlds.get(parsed.world.worldId);
        if (
            existing
            && existing.revision.worldRevisionId !== parsed.revision.worldRevisionId
        ) {
            throw new NativeDependencyError('native_world_dependency_conflict', {
                worldId: parsed.world.worldId,
                revisions: [
                    existing.revision.worldRevisionId,
                    parsed.revision.worldRevisionId,
                ],
            });
        }
        worlds.set(parsed.world.worldId, parsed);
        for (const bindingId of parsed.revision.knowledgeBindingIds) await loadBinding(bindingId);
        for (const assetId of parsed.revision.assetIds) await loadAsset(assetId);
        return parsed;
    };

    for (const snapshot of source.knowledge || []) addKnowledgeSnapshot(snapshot);
    for (const binding of source.knowledgeBindings || []) {
        const vendored = packageBinding(binding);
        const key = keyKnowledge(
            vendored.source.knowledgeBaseId,
            vendored.source.knowledgeRevisionId,
        );
        if (!knowledge.has(key)) {
            throw new NativeDependencyError('native_project_binding_source_missing', {
                knowledgeBindingId: vendored.knowledgeBindingId,
                knowledgeBaseId: vendored.source.knowledgeBaseId,
                knowledgeRevisionId: vendored.source.knowledgeRevisionId,
            });
        }
        bindings.set(vendored.knowledgeBindingId, vendored);
    }

    // Project-owned Worlds are already immutable snapshot-shaped source. Their
    // binding IDs may refer either to Project bindings above or exact Library
    // bindings declared below, so defer closure checks until all declarations
    // have been loaded.
    for (const snapshot of source.worlds || []) {
        const parsed = assertPackagedWorldSnapshot(snapshot);
        const existing = worlds.get(parsed.world.worldId);
        if (existing && existing.revision.worldRevisionId !== parsed.revision.worldRevisionId) {
            throw new NativeDependencyError('native_world_dependency_conflict', {
                worldId: parsed.world.worldId,
            });
        }
        worlds.set(parsed.world.worldId, parsed);
    }

    for (const dependency of source.dependencies?.knowledge || []) {
        await loadLibraryKnowledge(
            dependency.knowledgeBaseId,
            dependency.knowledgeRevisionId,
        );
    }
    for (const bindingId of source.dependencies?.knowledgeBindings || []) {
        await loadBinding(bindingId);
    }
    for (const dependency of source.dependencies?.assets || []) {
        await loadAsset(dependency.assetId, dependency.contentHash);
    }
    for (const dependency of source.dependencies?.worlds || []) {
        const world = await worldRepo.get(handle, dependency.worldId);
        const revision = await worldRepo.getRevision(
            handle,
            dependency.worldId,
            dependency.worldRevisionId,
        );
        if (!world || !revision || revision.worldId !== dependency.worldId) {
            throw new NativeDependencyError('native_world_dependency_missing', dependency);
        }
        await addWorldSnapshot({
            world: {
                ...world,
                currentRevisionId: dependency.worldRevisionId,
            },
            revision,
        });
    }

    for (const snapshot of worlds.values()) {
        for (const bindingId of snapshot.revision.knowledgeBindingIds) {
            if (!bindings.has(bindingId)) await loadBinding(bindingId);
        }
        for (const assetId of snapshot.revision.assetIds) {
            if (!assets.has(assetId) && !projectAssetIds.has(assetId)) {
                await loadAsset(assetId, exactAssetDependencies.get(assetId) || null);
            }
        }
    }

    for (const item of source.resources || []) {
        const identity = getVersionedModelPromptResourceIdentity(item.resourceType, item.resource);
        await resolveModelPromptRef({
            resourceType: identity.resourceType,
            resourceId: identity.resourceId,
            revision: identity.revision,
            scope: 'project',
            projectId: source.project.projectId,
        });
    }
    for (const ref of source.dependencies?.resources || []) await resolveModelPromptRef(ref);
    for (const role of source.package.runtime?.modelPrompt?.roles || []) {
        if (role.promptProgramRef) await resolveModelPromptRef(role.promptProgramRef);
        if (role.generationProfileRef) await resolveModelPromptRef(role.generationProfileRef);
    }

    // Final entry-point closure validation happens here instead of following
    // Library "latest" pointers or display names.
    const worldIds = new Set(worlds.keys());
    const bindingIds = new Set(bindings.keys());
    for (const entryPoint of source.package.entryPoints) {
        for (const worldId of entryPoint.worldIds) {
            if (!worldIds.has(worldId)) {
                throw new NativeDependencyError('native_entry_point_world_missing', {
                    entryPointId: entryPoint.entryPointId,
                    worldId,
                });
            }
        }
        for (const bindingId of entryPoint.knowledgeBindingIds) {
            if (!bindingIds.has(bindingId)) {
                throw new NativeDependencyError('native_entry_point_binding_missing', {
                    entryPointId: entryPoint.entryPointId,
                    knowledgeBindingId: bindingId,
                });
            }
        }
    }

    return Object.freeze({
        worlds: Object.freeze([...worlds.values()]),
        knowledge: Object.freeze([...knowledge.values()]),
        knowledgeBindings: Object.freeze([...bindings.values()]),
        assets: Object.freeze([...assets.values()].map(item => Object.freeze({
            ref: item.ref,
            bytes: Buffer.from(item.bytes),
        }))),
        resources: Object.freeze([...modelPromptResources.values()]),
    });
}
