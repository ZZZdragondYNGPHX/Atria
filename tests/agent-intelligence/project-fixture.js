import { createGitClient } from '../../src/git/client.js';
import { AssetStore, KnowledgeRepo, ProjectAgentService, ProjectStore, StudioPreviewHost, StudioService, WorldRepo, createNativeId } from '../../src/native/index.js';
import { ProjectTaskRepository } from '../../src/native/agent-intelligence/project-task-repository.js';

export function projectSource() {
    return { format: 'atria-project-source', schemaVersion: 1,
        project: { projectId: createNativeId('project'), packageId: createNativeId('package'), displayName: 'Recovery fixture', createdAt: 10, updatedAt: 10 },
        package: { name: 'Recovery', version: '1.0.0', actors: [], capabilities: ['narrative'], permissions: [],
            entryPoints: [{ entryPointId: createNativeId('entryPoint'), displayName: 'Main', actorIds: [], worldIds: [], knowledgeBindingIds: [] }] },
        worlds: [], knowledge: [], knowledgeBindings: [], dependencies: { worlds: [], knowledge: [], knowledgeBindings: [], assets: [] }, assetFiles: [] };
}

export function services(h, repository = new ProjectTaskRepository({ engine: h.engine }), backend = 'builtin') {
    const studio = new StudioService({ projectStore: new ProjectStore({ directoriesByHandle: () => h.dirs }),
        worldRepo: new WorldRepo({ engine: h.engine }), knowledgeRepo: new KnowledgeRepo({ engine: h.engine }),
        assetStore: new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs }), gitClient: createGitClient({ backend }),
        previewHost: new StudioPreviewHost(), simulationRunner: async () => ({ mode: 'dry-run' }) });
    return { studio, repository, agent: new ProjectAgentService({ studio, repository, maxRepairRounds: 2 }) };
}
