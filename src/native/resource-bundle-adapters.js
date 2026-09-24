import { createHash } from 'node:crypto';
import { NotFoundError, ConflictError } from '../storage/errors.js';
import { PackageInstaller } from './package-composition.js';
import { assertAssetRef } from './contracts.js';
import { assertKnowledgeBinding, assertPackagedKnowledgeSnapshot, assertPackagedWorldSnapshot } from './world-knowledge.js';
import { assertVersionedModelPromptResource, getVersionedModelPromptResourceDefinition, collectVersionedModelPromptResourceRefs, mapVersionedModelPromptResourceRefs, VERSIONED_MODEL_PROMPT_RESOURCE_TYPES } from './model-prompt-runtime/resources.js';
import { validateRequiredEntryGraph } from './dependency-closure.js';
import { hashNativeDocument } from './repositories/common.js';
import { bundleRef, bundleRefKey, bundleLogicalKey } from './resource-bundle.js';
const digest = value => createHash('sha256').update(value).digest('hex');
const bindingRevision = value => digest(JSON.stringify(value));
const clone = value => structuredClone(value);
const isPrompt = type => VERSIONED_MODEL_PROMPT_RESOURCE_TYPES.includes(type);
const missing = ref => new NotFoundError('Resource Bundle exact resource', ref);

export function createCoreBundleAdapters({ library, worldRepo: worlds, knowledgeRepo: knowledge, assetStore: assets, packageRepo: packages, projectStore: projects, versionedJsonResources: versioned }) {
    const installer = packages ? new PackageInstaller({ packageRepo: packages, assetStore: assets }) : null;
    async function owner(handle, ref) {
        if (ref.scope === 'package') { const opened = await installer?.open(handle, ref.packageId, ref.packageVersionId); if (!opened) throw missing(ref); return { source: opened.manifest, opened }; }
        if (ref.scope === 'project') { const source = await projects.get(handle, ref.projectId); if (!source) throw missing(ref); return { source }; }
        return null;
    }
    async function read(handle, ref) {
        if (ref.scope === 'library') {
            const exact = await library.getExact(handle, ref);
            return ref.resourceType === 'core.asset' ? { ref: exact.snapshot.ref, data: exact.snapshot.bytes.toString('base64') } : exact.snapshot;
        }
        const { source, opened } = await owner(handle, ref); let value;
        if (isPrompt(ref.resourceType)) value = source.resources?.find(item => item.resourceType === ref.resourceType && item.resource[getVersionedModelPromptResourceDefinition(ref.resourceType).idField] === ref.resourceId && item.resource.revision === ref.revision)?.resource;
        else if (ref.resourceType === 'core.world') value = source.worlds?.find(item => item.world.worldId === ref.resourceId && item.revision.worldRevisionId === ref.revision);
        else if (ref.resourceType === 'core.knowledge') value = source.knowledge?.find(item => item.knowledgeBase.knowledgeBaseId === ref.resourceId && item.revision.knowledgeRevisionId === ref.revision);
        else if (ref.resourceType === 'core.knowledge-binding') { const binding = source.knowledgeBindings?.find(item => item.knowledgeBindingId === ref.resourceId); if (binding && bindingRevision(binding) === ref.revision) value = binding; } else if (ref.resourceType === 'core.asset') {
            if (opened) { const asset = source.assets?.find(item => item.assetId === ref.resourceId && item.contentHash === ref.revision), bytes = opened.assets.get(ref.resourceId); if (asset && bytes) value = { ref: asset, data: bytes.toString('base64') }; } else { const asset = source.assetFiles?.find(item => item.assetId === ref.resourceId); const bytes = asset && await projects.readFile(handle, ref.projectId, asset.path); if (bytes && digest(bytes) === ref.revision) value = { ref: { assetId: asset.assetId, contentHash: ref.revision, size: bytes.length, ...(asset.mediaType ? { mediaType: asset.mediaType } : {}), ...(asset.logicalName ? { logicalName: asset.logicalName } : {}) }, data: bytes.toString('base64') }; }
        }
        if (!value) throw missing(ref); return clone(value);
    }
    async function resolve(handle, ref, type, id, revision = null) {
        if (ref.scope === 'library') {
            if (!revision && type === 'core.knowledge-binding') { const value = await knowledge.getBinding(handle, id); if (!value) throw missing({ resourceType: type, resourceId: id }); revision = bindingRevision(value); }
            if (!revision && type === 'core.asset') { const value = await assets.getRef(handle, id); if (!value) throw missing({ resourceType: type, resourceId: id }); revision = value.contentHash; }
            return bundleRef({ scope: 'library', resourceType: type, resourceId: id, revision });
        }
        const { source, opened } = await owner(handle, ref);
        if (type === 'core.knowledge-binding') {
            const value = source.knowledgeBindings?.find(item => item.knowledgeBindingId === id);
            if (value) return bundleRef({ ...ref, resourceType: type, resourceId: id, revision: bindingRevision(value) });
            if (!opened && source.dependencies?.knowledgeBindings?.includes(id)) return resolve(handle, { scope: 'library' }, type, id);
        } else if (type === 'core.asset') {
            const value = opened ? source.assets?.find(item => item.assetId === id) : source.assetFiles?.find(item => item.assetId === id);
            if (value) { const bytes = opened ? opened.assets.get(id) : await projects.readFile(handle, ref.projectId, value.path); if (!bytes) throw missing(ref); return bundleRef({ ...ref, resourceType: type, resourceId: id, revision: digest(bytes) }); }
            const dependency = !opened && source.dependencies?.assets?.find(item => item.assetId === id);
            if (dependency) return bundleRef({ scope: 'library', resourceType: type, resourceId: id, revision: dependency.contentHash });
        } else if (type === 'core.knowledge') {
            if (source.knowledge?.some(item => item.knowledgeBase.knowledgeBaseId === id && item.revision.knowledgeRevisionId === revision)) return bundleRef({ ...ref, resourceType: type, resourceId: id, revision });
            if (!opened && source.dependencies?.knowledge?.some(item => item.knowledgeBaseId === id && item.knowledgeRevisionId === revision)) return bundleRef({ scope: 'library', resourceType: type, resourceId: id, revision });
        }
        throw missing({ resourceType: type, resourceId: id, revision });
    }
    async function dependencies(handle, ref, data, resolveBundle = null) {
        if (isPrompt(ref.resourceType)) return collectVersionedModelPromptResourceRefs(ref.resourceType, data);
        const find = (type, id, revision) => resolveBundle ? resolveBundle(type, id, revision) : resolve(handle, ref, type, id, revision);
        if (ref.resourceType === 'core.world') return Promise.all([
            ...data.revision.knowledgeBindingIds.map(id => find('core.knowledge-binding', id)),
            ...data.revision.assetIds.map(id => find('core.asset', id)),
        ]);
        if (ref.resourceType === 'core.knowledge-binding') {
            const source = data.source;
            if (!resolveBundle && source.kind === 'library') return [bundleRef({ scope: 'library', resourceType: 'core.knowledge', resourceId: source.knowledgeBaseId, revision: source.knowledgeRevisionId })];
            return [await find('core.knowledge', source.knowledgeBaseId, source.knowledgeRevisionId)];
        }
        return [];
    }
    function validate(ref, data) {
        let identity;
        if (isPrompt(ref.resourceType)) { const resource = assertVersionedModelPromptResource(ref.resourceType, data); identity = [resource[getVersionedModelPromptResourceDefinition(ref.resourceType).idField], resource.revision]; } else if (ref.resourceType === 'core.world') { const value = assertPackagedWorldSnapshot(data); identity = [value.world.worldId, value.revision.worldRevisionId]; } else if (ref.resourceType === 'core.knowledge') { const value = assertPackagedKnowledgeSnapshot(data); validateRequiredEntryGraph(value); identity = [value.knowledgeBase.knowledgeBaseId, value.revision.knowledgeRevisionId]; } else if (ref.resourceType === 'core.knowledge-binding') { const value = assertKnowledgeBinding(data); identity = [value.knowledgeBindingId, bindingRevision(value)]; } else {
            const value = assertAssetRef(data.ref); if (typeof data.data !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data.data)) throw new TypeError('Resource Bundle asset must contain canonical base64');
            const bytes = Buffer.from(data.data, 'base64'); if (bytes.length !== value.size || digest(bytes) !== value.contentHash) throw new TypeError('Resource Bundle asset integrity mismatch'); identity = [value.assetId, value.contentHash];
        }
        if (identity[0] !== ref.resourceId || identity[1] !== ref.revision) throw new TypeError('Resource Bundle resource identity mismatch');
    }
    function rewrite(item, context) {
        const { ref } = item; let data = clone(item.data); const logical = bundleLogicalKey(ref), exact = bundleRefKey(ref);
        const origin = { operation: 'import', bundleHash: context.bundleHash, source: ref };
        const mapped = dependency => context.ref(dependency);
        const dependency = (type, id) => mapped(item.dependencies.find(value => value.resourceType === type && value.resourceId === id));
        let resourceId, revision;
        if (isPrompt(ref.resourceType)) {
            const definition = getVersionedModelPromptResourceDefinition(ref.resourceType); resourceId = context.id(definition.idKind, logical); revision = context.id('revision', exact);
            data = clone(mapVersionedModelPromptResourceRefs(ref.resourceType, data, mapped));
            data[definition.idField] = resourceId; data.revision = revision;
            for (const operation of data.derive || []) operation.moduleId = context.logicalId('core.prompt-module', operation.moduleId, ref);
            data.provenance = [...(data.provenance || []), { source: 'atria.resource-bundle', ref: JSON.stringify(origin) }];
        } else if (ref.resourceType === 'core.world') {
            resourceId = context.id('world', logical); revision = context.id('worldRevision', exact);
            data.world = { ...data.world, worldId: resourceId, currentRevisionId: revision };
            data.revision = { ...data.revision, worldId: resourceId, worldRevisionId: revision, knowledgeBindingIds: data.revision.knowledgeBindingIds.map(id => dependency('core.knowledge-binding', id).resourceId), assetIds: data.revision.assetIds.map(id => dependency('core.asset', id).resourceId), metadata: { ...data.revision.metadata, atriaResourceBundle: origin } };
        } else if (ref.resourceType === 'core.knowledge') {
            resourceId = context.id('knowledgeBase', logical); revision = context.id('knowledgeRevision', exact);
            const entryIds = new Map(data.entries.map(entry => [entry.knowledgeEntryId, context.id('knowledgeEntry', logical + entry.knowledgeEntryId)]));
            for (const entry of data.entries) { entry.knowledgeEntryId = entryIds.get(entry.knowledgeEntryId); for (const field of ['requiredEntryIds', 'relatedEntryIds']) if (entry.relations?.[field]) entry.relations[field] = entry.relations[field].map(id => entryIds.get(id)); }
            data.knowledgeBase = { ...data.knowledgeBase, knowledgeBaseId: resourceId, currentRevisionId: revision };
            data.revision = { ...data.revision, knowledgeBaseId: resourceId, knowledgeRevisionId: revision, entryIds: data.entries.map(entry => entry.knowledgeEntryId), metadata: { ...data.revision.metadata, atriaResourceBundle: origin } };
        } else if (ref.resourceType === 'core.knowledge-binding') {
            resourceId = context.id('knowledgeBinding', exact); const knowledgeRef = mapped(item.dependencies[0]);
            data = { ...data, knowledgeBindingId: resourceId, source: { kind: 'library', knowledgeBaseId: knowledgeRef.resourceId, knowledgeRevisionId: knowledgeRef.revision }, metadata: { ...data.metadata, atriaResourceBundle: origin } }; revision = bindingRevision(data);
        } else { resourceId = context.id('asset', exact); revision = data.ref.contentHash; data.ref.assetId = resourceId; }
        return { ref: { scope: 'library', resourceType: ref.resourceType, resourceId, revision }, data };
    }
    const content = (ref, data) => ref.resourceType === 'core.world' ? data.revision : ref.resourceType === 'core.knowledge' ? { revision: data.revision, entries: data.entries } : data;
    async function inspect(handle, ref, data, context) {
        try { const existing = await read(handle, ref); return hashNativeDocument(content(ref, existing)) === hashNativeDocument(content(ref, data)) ? 'same' : 'conflict'; } catch (error) { if (error.name !== 'NotFoundError') throw error; }
        if (isPrompt(ref.resourceType)) {
            const current = await versioned.getCurrent(handle, ref.resourceType, ref.resourceId);
            return !current || current.snapshot.provenance?.some(item => item.source === 'atria.resource-bundle' && (() => { try { return JSON.parse(item.ref).bundleHash === context.bundleHash; } catch { return false; } })()) ? 'new' : 'conflict';
        }
        if (['core.world', 'core.knowledge'].includes(ref.resourceType)) {
            const repo = ref.resourceType === 'core.world' ? worlds : knowledge, current = await repo.get(handle, ref.resourceId);
            if (!current) return 'new'; const revision = current.currentRevisionId && await repo.getRevision(handle, ref.resourceId, current.currentRevisionId);
            return revision?.metadata?.atriaResourceBundle?.bundleHash === context.bundleHash ? 'new' : 'conflict';
        }
        if (ref.resourceType === 'core.knowledge-binding') return await knowledge.getBinding(handle, ref.resourceId) ? 'conflict' : 'new';
        return await assets.getRef(handle, ref.resourceId) ? 'conflict' : 'new';
    }
    async function write(handle, ref, data, context) {
        if (await inspect(handle, ref, data, context) === 'conflict') throw new ConflictError('native_resource_bundle_conflict');
        if (isPrompt(ref.resourceType)) return versioned.commit(handle, ref.resourceType, data);
        if (ref.resourceType === 'core.world' || ref.resourceType === 'core.knowledge') {
            const world = ref.resourceType === 'core.world', repo = world ? worlds : knowledge, root = world ? data.world : data.knowledgeBase, current = await repo.get(handle, ref.resourceId);
            const options = current ? { expectedCurrentRevisionId: current.currentRevisionId } : { createRoot: { ...root, currentRevisionId: null }, expectedCurrentRevisionId: null };
            return world ? repo.commitRevision(handle, data.revision, options) : repo.commitRevision(handle, data.revision, data.entries, options);
        }
        if (ref.resourceType === 'core.knowledge-binding') return knowledge.saveBinding(handle, data, { expectedIntegrity: null });
        return assets.put(handle, data.ref, Buffer.from(data.data, 'base64'));
    }
    return new Map(['core.world', 'core.knowledge', 'core.knowledge-binding', 'core.asset', ...VERSIONED_MODEL_PROMPT_RESOURCE_TYPES].map(type => [type, { read, dependencies, validate, rewrite, inspect, write }]));
}
