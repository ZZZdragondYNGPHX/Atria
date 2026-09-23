import { describe, expect, test } from '@jest/globals';

import {
    ResourceRegistry,
    createCoreResourceRegistry,
} from '../../src/native/index.js';

describe('A2 Resource Registry', () => {
    test('registers and queries descriptor-driven core resource types', () => {
        const registry = createCoreResourceRegistry();
        const contract = registry.contract();

        expect(contract.graphMode).toBe('derived-readonly');
        expect(registry.get('core.world')).toMatchObject({
            resourceType: 'core.world',
            authority: 'native-library',
            capabilities: expect.arrayContaining(['attach', 'fork']),
        });
        expect(registry.list({ capability: 'attach' }).map(item => item.resourceType))
            .toEqual(expect.arrayContaining(['core.world', 'core.knowledge', 'core.asset']));
    });

    test('accepts plugin-defined descriptors without creating a plugin authority runtime', () => {
        const registry = new ResourceRegistry({ descriptors: [] });
        registry.register({
            resourceType: 'rpg.quest',
            displayName: 'Quest',
            provider: { kind: 'plugin', pluginId: 'plugin.rpg' },
            authority: 'plugin-source',
            capabilities: ['create', 'read', 'update', 'delete'],
            schema: { type: 'object' },
            metadata: { category: 'quest' },
        });

        expect(registry.list({ providerKind: 'plugin' })).toHaveLength(1);
        expect(registry.get('rpg.quest').provider.pluginId).toBe('plugin.rpg');
        expect(() => registry.register(registry.get('rpg.quest'))).toThrow(/already registered/);
        expect(registry.unregister('rpg.quest')).toBe(true);
        expect(registry.has('rpg.quest')).toBe(false);
    });
});
