import { describe, expect, jest, test } from '@jest/globals';

import { createCommandRegistry } from '../../public/scripts/atria-shell/command-registry.js';
import { createProductSearchIndex } from '../../public/scripts/atria-shell/product-search.js';

describe('A6 Product Search', () => {
    test('indexes Native authorities as route commands instead of foreign-domain renderers', async () => {
        const registry = createCommandRegistry();
        const host = {
            openLibraryWork: jest.fn(),
            openLibraryWorld: jest.fn(),
            openLibraryKnowledge: jest.fn(),
            openBuild: jest.fn(),
            openRuntimeSection: jest.fn(),
        };
        const productClient = {
            listWorks: jest.fn(async () => [{
                package: { packageId: 'pkg_1', displayName: 'Moon Game' },
            }]),
            listWorlds: jest.fn(async () => [{
                world: { worldId: 'world_1', displayName: 'Moon World' },
            }]),
            listKnowledge: jest.fn(async () => [{
                knowledgeBase: { knowledgeBaseId: 'kb_1', displayName: 'Moon Lore' },
            }]),
            listProjects: jest.fn(async () => [{
                projectId: 'project_1',
                packageId: 'pkg_1',
                displayName: 'Moon Build',
            }]),
        };

        const index = createProductSearchIndex({ registry, host, productClient, loadResources: async () => [], loadRuntime: async () => ({ models: [{ modelProfileId: 'model_1', displayName: 'Moon Model' }] }) });
        await index.refresh();

        const results = registry.search('moon');
        expect(results.map(item => item.id)).toEqual(expect.arrayContaining([
            'resource.work.pkg_1',
            'resource.world.world_1',
            'resource.knowledge.kb_1',
            'resource.project.project_1',
        ]));

        await registry.execute('resource.project.project_1');
        expect(host.openBuild).toHaveBeenCalledWith('project_1', 'Moon Build');
        expect(host.openLibraryWork).not.toHaveBeenCalled();

        await registry.execute('resource.knowledge.kb_1');
        expect(host.openLibraryKnowledge).toHaveBeenCalledWith('kb_1', 'Moon Lore');

        await registry.execute('runtime.models.model_1');
        expect(host.openRuntimeSection).toHaveBeenCalledWith('models', 'model_1');

        index.dispose();
        expect(registry.search('moon')).toEqual([]);
    });
});


test('P7 search keeps duplicate resource names and exact owners separate, routing only to Library detail', async () => {
    const registry = createCommandRegistry(); const host = { openLibraryResource: jest.fn() };
    const refs = ['r1', 'r2'].map(revision => ({ scope: 'library', resourceType: 'core.prompt-program', resourceId: 'pprog_1', revision }));
    refs.push({ ...refs[0], scope: 'package', packageId: 'pkg_1', packageVersionId: 'pkgv_1' });
    const index = createProductSearchIndex({ registry, host, productClient: { listWorks: async () => [], listWorlds: async () => [], listKnowledge: async () => [], listProjects: async () => [] }, loadRuntime: async () => ({}), loadResources: async () => refs.map(ref => ({ ref, resource: { displayName: 'Same Prompt' } })) });
    await index.refresh(); const results = registry.search('Same Prompt'); expect(results).toHaveLength(3);
    for (const result of results) await registry.execute(result.id);
    expect(host.openLibraryResource.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining(refs)); index.dispose();
});


function completeSources() {
    return {
        productClient: {
            listWorks: async () => [], listWorlds: async () => [], listProjects: async () => [],
            listKnowledge: async () => [{ knowledgeBase: { knowledgeBaseId: 'kb', currentRevisionId: 'exact-r1' } }],
            getKnowledge: jest.fn(async () => ({ entries: [{ knowledgeEntryId: 'entry', metadata: { title: 'Moon entry' }, content: 'Secret valley' }] })),
            listSessions: async () => [{ sessionId: 'session', displayTitle: 'Moon session' }],
            getSession: async () => ({ saves: [{ saveId: 'save', revisionId: 'committed-r1', displayName: 'Moon save' }] }),
        },
        loadRuntime: async () => ({}), loadResources: async () => [],
        loadSkills: async () => [{ name: 'Moon skill', scope: { kind: 'package', packageId: 'pkg', packageVersionId: 'v1' } }],
        loadOrchestration: async () => [{ id: 'preset', name: 'Moon orchestration', mode: 'spec' }],
    };
}

test('search covers navigable entities with exact identity and SavePoint inspection without restoring', async () => {
    const registry = createCommandRegistry();
    const host = Object.fromEntries(['openLibraryKnowledge', 'openSession', 'openKnowledgeEntry', 'openSkill', 'openOrchestration'].map(name => [name, jest.fn()]));
    const sources = completeSources();
    const index = createProductSearchIndex({ registry, host, ...sources });
    await index.refresh();
    for (const result of registry.search('Moon')) await registry.execute(result.id);
    expect(host.openSession.mock.calls).toEqual(expect.arrayContaining([['session'], ['session', { revisionId: 'committed-r1' }]]));
    expect(host.openKnowledgeEntry).toHaveBeenCalledWith('kb', 'exact-r1', 'entry', 'Moon entry');
    expect(sources.productClient.getKnowledge).toHaveBeenCalledWith('kb', 'exact-r1');
    expect(host.openSkill).toHaveBeenCalledWith({ kind: 'package', packageId: 'pkg', packageVersionId: 'v1' }, 'Moon skill');
    expect(host.openOrchestration).toHaveBeenCalledWith('preset', 'Moon orchestration');
    expect(registry.search('Secret valley')).toHaveLength(1);
    expect(registry.getSearchStatus().failures).toEqual([]);
    index.dispose();
});

test('source and per-owner failures remain visible, successful results survive, retry recovers', async () => {
    const registry = createCommandRegistry(); const sources = completeSources();
    sources.loadSkills = jest.fn(() => { throw new Error('Offline'); });
    sources.productClient.getSession = jest.fn(async () => { throw new Error('Session unavailable'); });
    const index = createProductSearchIndex({ registry, host: {}, ...sources });
    await index.refresh();
    expect(registry.getSearchStatus().failures).toEqual(expect.arrayContaining([
        { domain: 'Skills', message: 'Offline' }, { domain: 'SavePoints', owner: 'session', message: 'Session unavailable' },
    ]));
    expect(registry.search('Moon entry')).toHaveLength(1);
    sources.loadSkills.mockResolvedValue([]); sources.productClient.getSession.mockResolvedValue({ saves: [] });
    await registry.getSearchStatus().retry();
    expect(registry.getSearchStatus().failures).toEqual([]);
    index.dispose(); expect(registry.getSearchStatus()).toBeNull();
});

test('overlapping refresh and disposed requests cannot replace newer results or completeness state', async () => {
    const registry = createCommandRegistry(); const sources = completeSources();
    const index = createProductSearchIndex({ registry, host: {}, ...sources });
    await index.refresh();
    let release;
    sources.productClient.listWorks = () => new Promise(resolve => { release = resolve; });
    const old = index.refresh(); await Promise.resolve();
    sources.productClient.listWorks = async () => [];
    await index.refresh();
    release([{ package: { packageId: 'stale', displayName: 'Stale result' } }]);
    expect(await old).toBe(false); expect(registry.search('Stale result')).toEqual([]);
    const pending = index.refresh(); index.dispose();
    expect(await pending).toBe(false); expect(registry.getSearchStatus()).toBeNull();
});
