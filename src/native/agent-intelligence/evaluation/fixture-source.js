import { hash } from './cases.js';
import { createNativeId } from '../../identity.js';
import { WorldRepo } from '../../repositories/world-repo.js';
import { KnowledgeRepo } from '../../repositories/knowledge-repo.js';

export function projectFixtureSource(name, seed = null) {
    const id = kind => createNativeId(kind, seed ? () => hash([seed, kind]).slice(0, 32) : undefined);
    return {
        format: 'atria-project-source', schemaVersion: 1,
        project: { projectId: id('project'), packageId: id('package'), displayName: name, createdAt: 10, updatedAt: 10 },
        package: { name: 'Synthetic S01 Work', version: '1.0.0', actors: [], entryPoints: [{ entryPointId: id('entryPoint'), displayName: 'Main', actorIds: [], worldIds: [], knowledgeBindingIds: [] }], capabilities: ['narrative'], permissions: [] },
        worlds: [], knowledge: [], knowledgeBindings: [], dependencies: { worlds: [], knowledge: [], knowledgeBindings: [], assets: [] }, assetFiles: [],
    };
}

/** Private evaluation resources, created through their original repositories. */
export async function seedProjectPilot({ engine, handle, fixture, fixtureHash, source }) {
    const id = (kind, label) => createNativeId(kind, () => hash([fixtureHash, kind, label]).slice(0, 32));
    const worlds = new WorldRepo({ engine }), knowledge = new KnowledgeRepo({ engine }), worldRefs = [], bindingIds = [];
    for (const [index, definition] of fixture.projectSetup.worlds.entries()) {
        const worldId = id('world', index), worldRevisionId = id('worldRevision', index);
        await worlds.create(handle, { worldId, currentRevisionId: null, displayName: definition.label });
        await worlds.commitRevision(handle, { worldId, worldRevisionId, knowledgeBindingIds: [], assetIds: [], baseline: definition.baseline });
        worldRefs.push({ worldId, worldRevisionId });
    }
    for (const [index, label] of fixture.projectSetup.bindings.entries()) {
        const knowledgeBaseId = id('knowledgeBase', index), knowledgeRevisionId = id('knowledgeRevision', index), knowledgeBindingId = id('knowledgeBinding', index);
        await knowledge.create(handle, { knowledgeBaseId, currentRevisionId: null, displayName: label });
        await knowledge.commitRevision(handle, { knowledgeBaseId, knowledgeRevisionId, entryIds: [] }, []);
        await knowledge.saveBinding(handle, { knowledgeBindingId, source: { kind: 'library', knowledgeBaseId, knowledgeRevisionId }, enabled: true, mode: 'augment' });
        bindingIds.push(knowledgeBindingId);
    }
    source.dependencies.worlds = worldRefs; source.dependencies.knowledgeBindings = bindingIds;
    source.package.entryPoints = fixture.projectSetup.entries.map((item, index) => ({ entryPointId: id('entryPoint', index), displayName: item.label, actorIds: [],
        worldIds: [worldRefs[item.worldIndex].worldId], primaryWorldId: worldRefs[item.worldIndex].worldId, knowledgeBindingIds: item.bindingIndices.map(i => bindingIds[i]) }));
    return { worldRefs, bindingIds };
}
