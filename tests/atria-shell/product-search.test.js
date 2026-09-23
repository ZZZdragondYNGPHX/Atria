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

        const index = createProductSearchIndex({ registry, host, productClient });
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

        index.dispose();
        expect(registry.search('moon')).toEqual([]);
    });
});
