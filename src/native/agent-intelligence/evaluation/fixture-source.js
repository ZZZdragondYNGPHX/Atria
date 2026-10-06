import { hash } from './cases.js';
import { createNativeId } from '../../identity.js';

export function projectFixtureSource(name, seed = null) {
    const id = kind => createNativeId(kind, seed ? () => hash([seed, kind]).slice(0, 32) : undefined);
    return {
        format: 'atria-project-source', schemaVersion: 1,
        project: { projectId: id('project'), packageId: id('package'), displayName: name, createdAt: 10, updatedAt: 10 },
        package: { name: 'Synthetic S01 Work', version: '1.0.0', actors: [], entryPoints: [{ entryPointId: id('entryPoint'), displayName: 'Main', actorIds: [], worldIds: [], knowledgeBindingIds: [] }], capabilities: ['narrative'], permissions: [] },
        worlds: [], knowledge: [], knowledgeBindings: [], dependencies: { worlds: [], knowledge: [], knowledgeBindings: [], assets: [] }, assetFiles: [],
    };
}
