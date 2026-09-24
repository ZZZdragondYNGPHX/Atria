import { createHash } from 'node:crypto';

import { PackageInstaller } from '../package-composition.js';
import { resolveProjectDependencyClosure } from '../dependency-closure.js';
import {
    VERSIONED_MODEL_PROMPT_RESOURCE_TYPES,
    collectVersionedModelPromptResourceRefs,
    getVersionedModelPromptResourceIdentity,
} from '../model-prompt-runtime/resources.js';

function hash(value) {
    return createHash('sha256').update(
        Buffer.isBuffer(value) ? value : JSON.stringify(value),
    ).digest('hex');
}

function nodeKey(scope, resourceType, resourceId, revision = null) {
    return [
        scope,
        resourceType,
        resourceId,
        revision == null ? '' : revision,
    ].join(':');
}

function edgeKey(from, to, kind) {
    return kind + ':' + from + '>' + to;
}

function freezeNode(value) {
    return Object.freeze({
        ...value,
        metadata: Object.freeze({ ...(value.metadata || {}) }),
    });
}

function freezeEdge(value) {
    return Object.freeze({ ...value });
}

function stable(values, key) {
    return [...values].sort((left, right) => String(left[key]).localeCompare(String(right[key])));
}

function matchesText(node, search) {
    if (!search) return true;
    const value = search.toLowerCase();
    return [
        node.resourceType,
        node.resourceId,
        node.revision,
        node.displayName,
        node.projectId,
    ].some(item => String(item || '').toLowerCase().includes(value));
}

export class ResourceGraph {
    constructor({
        registry,
        libraryService,
        projectStore,
        worldRepo,
        knowledgeRepo,
        assetStore,
        packageRepo = null,
        versionedJsonResources = null,
    }) {
        for (const [name, value] of Object.entries({
            registry,
            libraryService,
            projectStore,
            worldRepo,
            knowledgeRepo,
            assetStore,
        })) {
            if (!value) throw new TypeError('ResourceGraph requires ' + name);
        }
        this._registry = registry;
        this._library = libraryService;
        this._projects = projectStore;
        this._worlds = worldRepo;
        this._knowledge = knowledgeRepo;
        this._assets = assetStore;
        this._packages = packageRepo;
        this._versionedJsonResources = versionedJsonResources;
        this._cache = new Map();
    }

    invalidate(handle) {
        this._cache.delete(handle);
    }

    _addNode(nodes, value) {
        if (!this._registry.has(value.resourceType)) {
            throw new TypeError('ResourceGraph encountered unregistered resourceType ' + value.resourceType);
        }
        const node = freezeNode(value);
        const existing = nodes.get(node.key);
        if (existing && JSON.stringify(existing) !== JSON.stringify(node)) {
            throw new Error('ResourceGraph node collision: ' + node.key);
        }
        nodes.set(node.key, node);
        return node;
    }

    _addEdge(edges, from, to, kind, metadata = {}) {
        const edge = freezeEdge({
            key: edgeKey(from, to, kind),
            from,
            to,
            kind,
            metadata: Object.freeze({ ...metadata }),
        });
        edges.set(edge.key, edge);
        return edge;
    }

    async _addKnowledgeSnapshot(nodes, edges, scope, ownership, snapshot, metadata = {}) {
        const revision = snapshot.revision.knowledgeRevisionId;
        const parent = this._addNode(nodes, {
            key: nodeKey(scope, 'core.knowledge', snapshot.knowledgeBase.knowledgeBaseId, revision),
            scope,
            resourceType: 'core.knowledge',
            resourceId: snapshot.knowledgeBase.knowledgeBaseId,
            revision,
            contentIdentity: hash(snapshot),
            displayName: snapshot.knowledgeBase.displayName,
            authority: ownership === 'project' ? 'project-source' : 'native-library',
            ownership,
            immutable: true,
            metadata,
        });
        const entryKeys = new Map();
        for (const entry of snapshot.entries) {
            const child = this._addNode(nodes, {
                key: nodeKey(scope, 'core.knowledge-entry', entry.knowledgeEntryId, revision),
                scope,
                resourceType: 'core.knowledge-entry',
                resourceId: entry.knowledgeEntryId,
                revision,
                contentIdentity: hash(entry),
                displayName: entry.metadata?.displayName || entry.knowledgeEntryId,
                authority: ownership === 'project' ? 'project-source' : 'native-library',
                ownership,
                immutable: true,
                metadata: {
                    knowledgeBaseId: snapshot.knowledgeBase.knowledgeBaseId,
                    ...metadata,
                },
            });
            entryKeys.set(entry.knowledgeEntryId, child.key);
            this._addEdge(edges, parent.key, child.key, 'contains');
        }
        for (const entry of snapshot.entries) {
            const from = entryKeys.get(entry.knowledgeEntryId);
            for (const requiredId of entry.relations?.requiredEntryIds || []) {
                const to = entryKeys.get(requiredId);
                if (to) this._addEdge(edges, from, to, 'requires');
            }
            for (const relatedId of entry.relations?.relatedEntryIds || []) {
                const to = entryKeys.get(relatedId);
                if (to) this._addEdge(edges, from, to, 'related');
            }
        }
        return parent;
    }

    async _addExactLibraryResource(handle, nodes, edges, ref) {
        const key = nodeKey('library', ref.resourceType, ref.resourceId, ref.revision);
        if (nodes.has(key)) return nodes.get(key);
        const exact = await this._library.getExact(handle, ref);

        if (ref.resourceType === 'core.knowledge') {
            return this._addKnowledgeSnapshot(
                nodes,
                edges,
                'library',
                'library',
                exact.snapshot,
                { current: false },
            );
        }

        if (ref.resourceType === 'core.world') {
            const node = this._addNode(nodes, {
                key,
                scope: 'library',
                resourceType: ref.resourceType,
                resourceId: ref.resourceId,
                revision: ref.revision,
                contentIdentity: exact.ref.contentIdentity,
                displayName: exact.snapshot.world.displayName,
                authority: 'native-library',
                ownership: 'library',
                immutable: true,
                metadata: {},
            });
            for (const bindingId of exact.snapshot.revision.knowledgeBindingIds) {
                const binding = await this._knowledge.getBinding(handle, bindingId);
                if (!binding) continue;
                const bindingRevision = hash(binding);
                const bindingNode = await this._addExactLibraryResource(handle, nodes, edges, {
                    resourceType: 'core.knowledge-binding', resourceId: bindingId, revision: bindingRevision,
                });
                this._addEdge(edges, node.key, bindingNode.key, 'references');
            }
            for (const assetId of exact.snapshot.revision.assetIds) {
                const current = await this._assets.getRef(handle, assetId);
                if (!current) continue;
                const assetNode = await this._addExactLibraryResource(handle, nodes, edges, {
                    resourceType: 'core.asset',
                    resourceId: assetId,
                    revision: current.contentHash,
                });
                this._addEdge(edges, node.key, assetNode.key, 'references');
            }
            return node;
        }

        if (ref.resourceType === 'core.asset') {
            return this._addNode(nodes, {
                key,
                scope: 'library',
                resourceType: ref.resourceType,
                resourceId: ref.resourceId,
                revision: ref.revision,
                contentIdentity: exact.ref.contentIdentity,
                displayName: exact.snapshot.ref.logicalName || ref.resourceId,
                authority: 'native-library',
                ownership: 'library',
                immutable: true,
                metadata: {
                    size: exact.snapshot.ref.size,
                    ...(exact.snapshot.ref.mediaType ? { mediaType: exact.snapshot.ref.mediaType } : {}),
                },
            });
        }

        if (VERSIONED_MODEL_PROMPT_RESOURCE_TYPES.includes(ref.resourceType)) {
            const identity = getVersionedModelPromptResourceIdentity(ref.resourceType, exact.snapshot);
            const node = this._addNode(nodes, {
                key,
                scope: 'library',
                resourceType: ref.resourceType,
                resourceId: identity.resourceId,
                revision: identity.revision,
                contentIdentity: exact.ref.contentIdentity,
                displayName: identity.displayName,
                authority: 'native-library',
                ownership: 'library',
                immutable: true,
                metadata: {
                    origin: 'library',
                    provenance: exact.snapshot.provenance || [],
                },
            });
            for (const dependency of collectVersionedModelPromptResourceRefs(ref.resourceType, exact.snapshot)) {
                if (dependency.scope !== 'library') {
                    throw new TypeError('Library model/prompt graph resource contains non-Library exact ref');
                }
                const target = await this._addExactLibraryResource(handle, nodes, edges, dependency);
                this._addEdge(edges, node.key, target.key, 'references-exact');
            }
            return node;
        }

        if (ref.resourceType === 'core.package') {
            const packageNode = this._addNode(nodes, {
                key,
                scope: 'library',
                resourceType: ref.resourceType,
                resourceId: ref.resourceId,
                revision: ref.revision,
                contentIdentity: exact.ref.contentIdentity,
                displayName: exact.snapshot.package.displayName || ref.resourceId,
                authority: 'native-library',
                ownership: 'library',
                immutable: true,
                metadata: {},
            });
            // Read the installed content authority, not same-ID Library resources.
            const installer = new PackageInstaller({ packageRepo: this._packages, assetStore: this._assets });
            const { manifest } = await installer.open(handle, ref.resourceId, ref.revision);
            const scope = 'package/' + ref.resourceId + '/' + ref.revision;
            const resourceKey = value => nodeKey(scope, value.resourceType, value.resourceId, value.revision);
            for (const item of manifest.resources || []) {
                const identity = getVersionedModelPromptResourceIdentity(item.resourceType, item.resource);
                const resourceNode = this._addNode(nodes, {
                    key: resourceKey(identity), scope, ...identity, contentIdentity: hash(item.resource),
                    authority: 'installed-package', ownership: 'package', immutable: true,
                    metadata: { origin: 'package', packageId: ref.resourceId, packageVersionId: ref.revision, provenance: item.resource.provenance || [] },
                });
                this._addEdge(edges, packageNode.key, resourceNode.key, 'contains');
            }
            for (const item of manifest.resources || []) {
                const from = resourceKey(getVersionedModelPromptResourceIdentity(item.resourceType, item.resource));
                for (const dependency of collectVersionedModelPromptResourceRefs(item.resourceType, item.resource)) {
                    this._addEdge(edges, from, resourceKey(dependency), 'references-exact');
                }
            }
            for (const role of manifest.runtime?.modelPrompt?.roles || []) {
                for (const dependency of [role.promptProgramRef, role.generationProfileRef].filter(Boolean)) this._addEdge(edges, packageNode.key, resourceKey(dependency), 'recommends-exact');
            }
            return packageNode;
        }

        const binding = exact.snapshot;
        const bindingNode = this._addNode(nodes, {
            key,
            scope: 'library',
            resourceType: ref.resourceType,
            resourceId: ref.resourceId,
            revision: ref.revision,
            contentIdentity: exact.ref.contentIdentity,
            displayName: ref.resourceId,
            authority: 'native-library',
            ownership: 'library',
            immutable: false,
            metadata: {
                mutableRoot: true,
                knowledgeBaseId: binding.source.knowledgeBaseId,
                knowledgeRevisionId: binding.source.knowledgeRevisionId,
            },
        });
        const knowledgeNode = await this._addExactLibraryResource(handle, nodes, edges, {
            resourceType: 'core.knowledge',
            resourceId: binding.source.knowledgeBaseId,
            revision: binding.source.knowledgeRevisionId,
        });
        this._addEdge(edges, bindingNode.key, knowledgeNode.key, 'references-exact');
        return bindingNode;
    }

    async _derive(handle) {
        const nodes = new Map();
        const edges = new Map();

        for (const item of await this._library.list(handle)) {
            for (const revision of item.revisions || []) {
                await this._addExactLibraryResource(handle, nodes, edges, {
                    resourceType: item.resourceType,
                    resourceId: item.resourceId,
                    revision,
                });
            }
        }

        for (const root of await this._projects.list(handle)) {
            const source = await this._projects.get(handle, root.projectId);
            if (!source) continue;
            const projectScope = 'project/' + root.projectId;
            const project = this._addNode(nodes, {
                key: nodeKey(projectScope, 'core.project', root.projectId),
                scope: projectScope,
                projectId: root.projectId,
                resourceType: 'core.project',
                resourceId: root.projectId,
                revision: null,
                contentIdentity: hash(source),
                displayName: root.displayName,
                authority: 'project-source',
                ownership: 'project',
                immutable: false,
                metadata: { packageId: root.packageId },
            });

            for (const actor of source.package.actors || []) {
                const actorNode = this._addNode(nodes, {
                    key: nodeKey(projectScope, 'core.actor', actor.actorId),
                    scope: projectScope,
                    projectId: root.projectId,
                    resourceType: 'core.actor',
                    resourceId: actor.actorId,
                    revision: null,
                    contentIdentity: hash(actor),
                    displayName: actor.displayName,
                    authority: 'project-source',
                    ownership: 'project',
                    immutable: false,
                    metadata: {},
                });
                this._addEdge(edges, project.key, actorNode.key, 'contains');
            }

            const projectResourceNodes = new Map();
            for (const item of source.resources || []) {
                const identity = getVersionedModelPromptResourceIdentity(item.resourceType, item.resource);
                const resourceNode = this._addNode(nodes, {
                    key: nodeKey(projectScope, identity.resourceType, identity.resourceId, identity.revision),
                    scope: projectScope,
                    projectId: root.projectId,
                    resourceType: identity.resourceType,
                    resourceId: identity.resourceId,
                    revision: identity.revision,
                    contentIdentity: hash(item.resource),
                    displayName: identity.displayName,
                    authority: 'project-source',
                    ownership: 'project',
                    immutable: false,
                    metadata: {
                        origin: 'project',
                        provenance: item.resource.provenance || [],
                    },
                });
                projectResourceNodes.set(
                    identity.resourceType + ':' + identity.resourceId + '@' + identity.revision,
                    resourceNode,
                );
                this._addEdge(edges, project.key, resourceNode.key, 'contains');
            }
            for (const item of source.resources || []) {
                const identity = getVersionedModelPromptResourceIdentity(item.resourceType, item.resource);
                const from = projectResourceNodes.get(
                    identity.resourceType + ':' + identity.resourceId + '@' + identity.revision,
                );
                for (const ref of collectVersionedModelPromptResourceRefs(item.resourceType, item.resource)) {
                    let target = null;
                    if (ref.scope === 'project') {
                        target = projectResourceNodes.get(
                            ref.resourceType + ':' + ref.resourceId + '@' + ref.revision,
                        ) || null;
                    } else if (ref.scope === 'library') {
                        target = await this._addExactLibraryResource(handle, nodes, edges, ref);
                    }
                    if (target) this._addEdge(edges, from.key, target.key, 'references-exact');
                }
            }

            const projectKnowledge = new Map();
            for (const snapshot of source.knowledge || []) {
                const node = await this._addKnowledgeSnapshot(
                    nodes,
                    edges,
                    projectScope,
                    'project',
                    snapshot,
                    { projectId: root.projectId },
                );
                projectKnowledge.set(
                    snapshot.knowledgeBase.knowledgeBaseId + '@' + snapshot.revision.knowledgeRevisionId,
                    node,
                );
                this._addEdge(edges, project.key, node.key, 'contains');
            }

            const projectAssets = new Map();
            for (const item of source.assetFiles || []) {
                const bytes = await this._projects.readFile(handle, root.projectId, item.path);
                const revision = bytes ? hash(bytes) : null;
                const assetNode = this._addNode(nodes, {
                    key: nodeKey(projectScope, 'core.asset', item.assetId, revision),
                    scope: projectScope,
                    projectId: root.projectId,
                    resourceType: 'core.asset',
                    resourceId: item.assetId,
                    revision,
                    contentIdentity: revision,
                    displayName: item.logicalName || item.path,
                    authority: 'project-source',
                    ownership: 'project',
                    immutable: false,
                    metadata: {
                        path: item.path,
                        missing: !bytes,
                        ...(item.mediaType ? { mediaType: item.mediaType } : {}),
                    },
                });
                projectAssets.set(item.assetId, assetNode);
                this._addEdge(edges, project.key, assetNode.key, 'contains');
            }

            const bindingNodes = new Map();
            for (const binding of source.knowledgeBindings || []) {
                const revision = hash(binding);
                const bindingNode = this._addNode(nodes, {
                    key: nodeKey(projectScope, 'core.knowledge-binding', binding.knowledgeBindingId, revision),
                    scope: projectScope,
                    projectId: root.projectId,
                    resourceType: 'core.knowledge-binding',
                    resourceId: binding.knowledgeBindingId,
                    revision,
                    contentIdentity: revision,
                    displayName: binding.knowledgeBindingId,
                    authority: 'project-source',
                    ownership: 'project',
                    immutable: false,
                    metadata: {},
                });
                bindingNodes.set(binding.knowledgeBindingId, bindingNode);
                this._addEdge(edges, project.key, bindingNode.key, 'contains');
                const knowledgeKey = binding.source.knowledgeBaseId + '@' + binding.source.knowledgeRevisionId;
                let target = projectKnowledge.get(knowledgeKey);
                if (!target && binding.source.kind === 'library') {
                    target = await this._addExactLibraryResource(handle, nodes, edges, {
                        resourceType: 'core.knowledge',
                        resourceId: binding.source.knowledgeBaseId,
                        revision: binding.source.knowledgeRevisionId,
                    });
                }
                if (target) this._addEdge(edges, bindingNode.key, target.key, 'references-exact');
            }

            for (const snapshot of source.worlds || []) {
                const revision = snapshot.revision.worldRevisionId;
                const worldNode = this._addNode(nodes, {
                    key: nodeKey(projectScope, 'core.world', snapshot.world.worldId, revision),
                    scope: projectScope,
                    projectId: root.projectId,
                    resourceType: 'core.world',
                    resourceId: snapshot.world.worldId,
                    revision,
                    contentIdentity: hash(snapshot),
                    displayName: snapshot.world.displayName,
                    authority: 'project-source',
                    ownership: 'project',
                    immutable: false,
                    metadata: snapshot.revision.metadata || {},
                });
                this._addEdge(edges, project.key, worldNode.key, 'contains');
                for (const bindingId of snapshot.revision.knowledgeBindingIds) {
                    let target = bindingNodes.get(bindingId);
                    if (!target) {
                        const binding = await this._knowledge.getBinding(handle, bindingId);
                        if (binding) {
                            target = await this._addExactLibraryResource(handle, nodes, edges, {
                                resourceType: 'core.knowledge-binding',
                                resourceId: bindingId,
                                revision: hash(binding),
                            });
                        }
                    }
                    if (target) this._addEdge(edges, worldNode.key, target.key, 'references');
                }
                for (const assetId of snapshot.revision.assetIds) {
                    let target = projectAssets.get(assetId);
                    if (!target) {
                        const dependency = (source.dependencies?.assets || [])
                            .find(item => item.assetId === assetId);
                        if (dependency) {
                            target = await this._addExactLibraryResource(handle, nodes, edges, {
                                resourceType: 'core.asset',
                                resourceId: assetId,
                                revision: dependency.contentHash,
                            });
                        }
                    }
                    if (target) this._addEdge(edges, worldNode.key, target.key, 'references');
                }
            }

            for (const dependency of source.dependencies?.worlds || []) {
                const target = await this._addExactLibraryResource(handle, nodes, edges, {
                    resourceType: 'core.world',
                    resourceId: dependency.worldId,
                    revision: dependency.worldRevisionId,
                });
                this._addEdge(edges, project.key, target.key, 'attaches-exact');
            }
            for (const dependency of source.dependencies?.knowledge || []) {
                const target = await this._addExactLibraryResource(handle, nodes, edges, {
                    resourceType: 'core.knowledge',
                    resourceId: dependency.knowledgeBaseId,
                    revision: dependency.knowledgeRevisionId,
                });
                this._addEdge(edges, project.key, target.key, 'attaches-exact');
            }
            for (const dependency of source.dependencies?.assets || []) {
                const target = await this._addExactLibraryResource(handle, nodes, edges, {
                    resourceType: 'core.asset',
                    resourceId: dependency.assetId,
                    revision: dependency.contentHash,
                });
                this._addEdge(edges, project.key, target.key, 'attaches-exact');
            }
            for (const dependency of source.dependencies?.resources || []) {
                const target = await this._addExactLibraryResource(handle, nodes, edges, dependency);
                this._addEdge(edges, project.key, target.key, 'attaches-exact');
            }
            for (const bindingId of source.dependencies?.knowledgeBindings || []) {
                const binding = await this._knowledge.getBinding(handle, bindingId);
                if (!binding) continue;
                const revision = hash(binding);
                const target = await this._addExactLibraryResource(handle, nodes, edges, {
                    resourceType: 'core.knowledge-binding',
                    resourceId: bindingId,
                    revision,
                });
                this._addEdge(edges, project.key, target.key, 'attaches-current');
            }
        }

        return {
            nodes: stable(nodes.values(), 'key'),
            edges: stable(edges.values(), 'key'),
        };
    }

    async refresh(handle) {
        const derived = await this._derive(handle);
        const signature = hash(derived);
        const previous = this._cache.get(handle) || null;
        if (previous?.signature === signature) return previous.snapshot;

        const beforeNodes = new Map((previous?.snapshot.nodes || []).map(node => [node.key, hash(node)]));
        const beforeEdges = new Map((previous?.snapshot.edges || []).map(edge => [edge.key, hash(edge)]));
        const afterNodes = new Map(derived.nodes.map(node => [node.key, hash(node)]));
        const afterEdges = new Map(derived.edges.map(edge => [edge.key, hash(edge)]));
        const changedNodeKeys = new Set([...beforeNodes.keys(), ...afterNodes.keys()]);
        const changedEdgeKeys = new Set([...beforeEdges.keys(), ...afterEdges.keys()]);
        for (const key of [...changedNodeKeys]) {
            if (beforeNodes.get(key) === afterNodes.get(key)) changedNodeKeys.delete(key);
        }
        for (const key of [...changedEdgeKeys]) {
            if (beforeEdges.get(key) === afterEdges.get(key)) changedEdgeKeys.delete(key);
        }

        const snapshot = Object.freeze({
            mode: 'derived-readonly',
            generation: (previous?.snapshot.generation || 0) + 1,
            signature,
            nodes: Object.freeze(derived.nodes),
            edges: Object.freeze(derived.edges),
            changedNodeKeys: Object.freeze([...changedNodeKeys].sort()),
            changedEdgeKeys: Object.freeze([...changedEdgeKeys].sort()),
        });
        this._cache.set(handle, { signature, snapshot });
        return snapshot;
    }

    async query(handle, {
        resourceType = null,
        projectId = null,
        ownership = null,
        search = '',
    } = {}) {
        const graph = await this.refresh(handle);
        return Object.freeze(graph.nodes.filter(node => (
            (resourceType == null || node.resourceType === resourceType)
            && (projectId == null || node.projectId === projectId)
            && (ownership == null || node.ownership === ownership)
            && matchesText(node, search)
        )));
    }

    async references(handle, value, { reverse = false } = {}) {
        const graph = await this.refresh(handle);
        const scope = value.scope === 'project' ? 'project/' + value.projectId
            : value.scope === 'package' ? 'package/' + value.packageId + '/' + value.packageVersionId : value.scope;
        const keys = new Set(graph.nodes
            .filter(node => (
                node.resourceType === value.resourceType
                && (!scope || node.scope === scope)
                && node.resourceId === value.resourceId
                && (value.revision == null || node.revision === value.revision)
            ))
            .map(node => node.key));
        const edges = graph.edges.filter(edge => (
            reverse ? keys.has(edge.to) : keys.has(edge.from)
        ));
        return Object.freeze(edges.map(edge => Object.freeze({
            edge,
            node: graph.nodes.find(node => node.key === (reverse ? edge.from : edge.to)) || null,
        })));
    }

    async inspectDelete(handle, value) {
        const graphReferences = await this.references(handle, value, { reverse: true });
        const repositoryReferences = [];
        if (value.resourceType === 'core.world' && value.revision) {
            repositoryReferences.push(...await this._worlds.getRevisionReferences(
                handle,
                value.resourceId,
                value.revision,
            ));
        } else if (value.resourceType === 'core.knowledge' && value.revision) {
            repositoryReferences.push(...await this._knowledge.getRevisionReferences(
                handle,
                value.resourceId,
                value.revision,
            ));
        } else if (value.resourceType === 'core.knowledge-binding') {
            repositoryReferences.push(...await this._knowledge.getBindingReferences(handle, value.resourceId));
        } else if (value.resourceType === 'core.asset') {
            repositoryReferences.push(...await this._assets.getReferences(handle, value.resourceId));
        } else if (value.resourceType === 'core.package' && value.revision && this._packages) {
            repositoryReferences.push(...await this._packages.getVersionReferences(
                handle,
                value.resourceId,
                value.revision,
            ));
        }
        const blockers = [
            ...graphReferences.map(item => ({
                kind: 'resource-graph',
                edge: item.edge.kind,
                from: item.node?.key || item.edge.from,
            })),
            ...repositoryReferences.map(item => ({ kind: 'repository', reference: item })),
        ];
        return Object.freeze({
            resource: Object.freeze({ ...value }),
            safe: blockers.length === 0,
            blockers: Object.freeze(blockers.map(item => Object.freeze(item))),
        });
    }

    async resolveBuildClosure(handle, projectId) {
        const source = await this._projects.get(handle, projectId);
        if (!source) throw new Error('Project not found: ' + projectId);
        const closure = await resolveProjectDependencyClosure({
            handle,
            source,
            worldRepo: this._worlds,
            knowledgeRepo: this._knowledge,
            assetStore: this._assets,
            versionedJsonResources: this._versionedJsonResources,
        });
        const resources = [];
        for (const item of closure.worlds) {
            resources.push(Object.freeze({
                resourceType: 'core.world',
                resourceId: item.world.worldId,
                revision: item.revision.worldRevisionId,
            }));
        }
        for (const item of closure.knowledge) {
            resources.push(Object.freeze({
                resourceType: 'core.knowledge',
                resourceId: item.knowledgeBase.knowledgeBaseId,
                revision: item.revision.knowledgeRevisionId,
            }));
        }
        for (const item of closure.knowledgeBindings) {
            resources.push(Object.freeze({
                resourceType: 'core.knowledge-binding',
                resourceId: item.knowledgeBindingId,
                revision: hash(item),
            }));
        }
        for (const item of closure.assets) {
            resources.push(Object.freeze({
                resourceType: 'core.asset',
                resourceId: item.ref.assetId,
                revision: item.ref.contentHash,
            }));
        }
        for (const item of closure.resources) {
            const identity = getVersionedModelPromptResourceIdentity(item.resourceType, item.resource);
            resources.push(Object.freeze({
                resourceType: identity.resourceType,
                resourceId: identity.resourceId,
                revision: identity.revision,
            }));
        }
        return Object.freeze({
            projectId,
            resources: Object.freeze(resources.sort((left, right) => (
                left.resourceType.localeCompare(right.resourceType)
                || left.resourceId.localeCompare(right.resourceId)
            ))),
            closure,
        });
    }
}
