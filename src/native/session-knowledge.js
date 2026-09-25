import { assertKnowledgeBinding, assertPackagedKnowledgeSnapshot } from './world-knowledge.js';
import { validateRequiredEntryGraph, NativeDependencyError } from './dependency-closure.js';
import { hashNativeDocument } from './repositories/common.js';

const sourceKey = source => `${source.kind}:${source.knowledgeBaseId}@${source.knowledgeRevisionId}`;
const snapshotKey = snapshot => `${snapshot.knowledgeBase.knowledgeBaseId}@${snapshot.revision.knowledgeRevisionId}`;

// A package edit is captured in the existing Session knowledge snapshot, so
// historical revisions and portable saves do not need the newer installation.
export function packageKnowledgeManifest(manifest, value) {
    const replacements = new Map((value?.snapshots || []).filter(item => item.kind === 'package').map(item => {
        const snapshot = assertPackagedKnowledgeSnapshot(item.snapshot);
        const id = snapshot.knowledgeBase.knowledgeBaseId;
        if (!manifest.knowledge.some(original => original.knowledgeBase.knowledgeBaseId === id)) throw new TypeError('Package Knowledge identity cannot change');
        return [id, snapshot];
    }));
    if (!replacements.size) return manifest;
    return { ...manifest,
        knowledge: manifest.knowledge.map(item => replacements.get(item.knowledgeBase.knowledgeBaseId) || item),
        knowledgeBindings: manifest.knowledgeBindings.map(binding => {
            const snapshot = replacements.get(binding.source.knowledgeBaseId);
            return snapshot ? { ...binding, source: { ...binding.source, knowledgeRevisionId: snapshot.revision.knowledgeRevisionId } } : binding;
        }),
    };
}

// Package-wide defaults are bindings not scoped to any EntryPoint/World. Scoped
// bindings join only when that EntryPoint/World is selected; target/visibility
// and augment/override remain data for N6, never prompt compilation here.
export function packageSessionBindings(manifest, entryPoint) {
    const scoped = new Set([
        ...manifest.entryPoints.flatMap(entry => entry.knowledgeBindingIds),
        ...manifest.worlds.flatMap(world => world.revision.knowledgeBindingIds),
    ]);
    const selected = new Set([
        ...entryPoint.knowledgeBindingIds,
        ...manifest.worlds.filter(world => entryPoint.worldIds.includes(world.world.worldId))
            .flatMap(world => world.revision.knowledgeBindingIds),
    ]);
    return manifest.knowledgeBindings.filter(binding => !scoped.has(binding.knowledgeBindingId)
        || selected.has(binding.knowledgeBindingId));
}

export function validateKnowledgeBindingSet(value, manifest, entryPoint) {
    if (value?.schemaVersion !== 1 || !Array.isArray(value.bindings) || !Array.isArray(value.snapshots)) {
        throw new TypeError('Invalid resolved KnowledgeBindingSet');
    }
    manifest = packageKnowledgeManifest(manifest, value);
    const bindings = value.bindings.map(assertKnowledgeBinding);
    if (new Set(bindings.map(binding => binding.knowledgeBindingId)).size !== bindings.length) {
        throw new TypeError('Duplicate KnowledgeBinding identity');
    }
    const snapshots = value.snapshots.map(item => {
        if (!['library', 'session', 'package'].includes(item.kind)) throw new TypeError('Invalid Session Knowledge source');
        const snapshot = assertPackagedKnowledgeSnapshot(item.snapshot);
        validateRequiredEntryGraph(snapshot);
        return { kind: item.kind, snapshot };
    });
    const bySource = new Map(snapshots.map(item => [
        `${item.kind}:${snapshotKey(item.snapshot)}`, item.snapshot,
    ]));
    if (bySource.size !== snapshots.length) throw new TypeError('Duplicate Knowledge snapshot');
    const packageSources = new Map(manifest.knowledge.map(snapshot => [`package:${snapshotKey(snapshot)}`, snapshot]));
    const selected = value.packageBindingIds;
    if (selected !== undefined && (!Array.isArray(selected) || new Set(selected).size !== selected.length || selected.some(id => !manifest.knowledgeBindings.some(binding => binding.knowledgeBindingId === id)))) throw new TypeError('Invalid Package binding selection');
    const required = selected === undefined ? packageSessionBindings(manifest, entryPoint) : manifest.knowledgeBindings.filter(binding => selected.includes(binding.knowledgeBindingId));
    const actualPackage = bindings.filter(binding => binding.source.kind === 'package');
    if (hashNativeDocument(required) !== hashNativeDocument(actualPackage)) {
        throw new TypeError('Session must preserve exact Package Knowledge bindings');
    }
    for (const binding of bindings) {
        const key = sourceKey(binding.source);
        if (!(binding.source.kind === 'package' ? packageSources : bySource).has(key)) {
            throw new NativeDependencyError('native_session_knowledge_missing', { source: binding.source });
        }
    }
    const used = new Set(bindings.map(binding => sourceKey(binding.source)));
    if ([...bySource.keys()].some(key => !used.has(key))) throw new TypeError('Unbound Session Knowledge snapshot');
    return { schemaVersion: 1, bindings, snapshots, ...(selected === undefined ? {} : { packageBindingIds: [...selected] }) };
}

// Copies of exact Library revisions belong to this immutable Session binding-set
// snapshot. Reload never consults mutable Library policy/latest pointers.
export async function resolveSessionKnowledge({
    handle, manifest, entryPoint, knowledgeRepo, libraryBindingIds = [],
    sessionBindings = [], sessionKnowledge = [], packageBindingIds,
}) {
    const bindings = packageBindingIds === undefined ? [...packageSessionBindings(manifest, entryPoint)] : manifest.knowledgeBindings.filter(binding => packageBindingIds.includes(binding.knowledgeBindingId));
    const snapshots = new Map();
    for (const bindingId of libraryBindingIds) {
        const value = await knowledgeRepo?.getBinding(handle, bindingId);
        if (!value) throw new NativeDependencyError('native_session_binding_missing', { bindingId });
        const binding = assertKnowledgeBinding(value);
        if (binding.source.kind !== 'library') throw new TypeError('Library policy must use Library Knowledge');
        bindings.push(binding);
        const { knowledgeBaseId, knowledgeRevisionId } = binding.source;
        const key = sourceKey(binding.source);
        if (snapshots.has(key)) continue;
        const knowledgeBase = await knowledgeRepo.get(handle, knowledgeBaseId);
        const revision = await knowledgeRepo.getRevision(handle, knowledgeBaseId, knowledgeRevisionId);
        if (!knowledgeBase || !revision) {
            throw new NativeDependencyError('native_session_knowledge_missing', { source: binding.source });
        }
        snapshots.set(key, { kind: 'library', snapshot: {
            knowledgeBase: { ...knowledgeBase, currentRevisionId: knowledgeRevisionId },
            revision,
            entries: await knowledgeRepo.listEntries(handle, knowledgeBaseId, knowledgeRevisionId),
        } });
    }
    for (const value of sessionBindings) {
        const binding = assertKnowledgeBinding(value);
        if (binding.source.kind !== 'session') throw new TypeError('Session-local binding must use Session Knowledge');
        bindings.push(binding);
    }
    for (const snapshot of sessionKnowledge) {
        const key = `session:${snapshotKey(snapshot)}`;
        if (snapshots.has(key)) throw new TypeError('Duplicate Session Knowledge snapshot');
        snapshots.set(key, { kind: 'session', snapshot });
    }
    return validateKnowledgeBindingSet({ schemaVersion: 1, bindings, snapshots: [...snapshots.values()], ...(packageBindingIds === undefined ? {} : { packageBindingIds }) }, manifest, entryPoint);
}
