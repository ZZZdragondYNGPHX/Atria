import { describe, expect, test } from '@jest/globals';

import { createPackageRuntimeContributionRegistry } from '../../public/scripts/native/experience/ui/plugin-contributions.js';

describe('A5 Play package contribution registry', () => {
    test('compiles declarative selector contributions without executable package code', () => {
        const registry = createPackageRuntimeContributionRegistry([{
            pluginId: 'plugin.runtime',
            version: '1.0.0',
            capabilities: ['runtime.selector'],
            contributions: [{
                id: 'plugin.runtime.hp',
                type: 'play.selector',
                config: { selectors: [{ id: 'plugin.hp', formula: 'world.hp + 1' }] },
            }],
        }]);
        const definitions = registry.selectorDefinitions();
        expect(definitions).toHaveLength(1);
        expect(definitions[0].id).toBe('plugin.hp');
        expect(definitions[0].select({ hp: 4 })).toBe(5);
        expect(registry.list({ type: 'play.selector' })).toHaveLength(1);
    });

    test('rejects Host execution fields and unsupported contribution types', () => {
        expect(() => createPackageRuntimeContributionRegistry([{
            pluginId: 'plugin.runtime',
            version: '1.0.0',
            entrypoint: 'host/index.js',
            contributions: [],
        }])).toThrow(/must not expose Host Plugin execution/);

        expect(() => createPackageRuntimeContributionRegistry([{
            pluginId: 'plugin.runtime',
            version: '1.0.0',
            contributions: [{ id: 'x', type: 'host.raw-code', config: {} }],
        }])).toThrow(/Unsupported package Play contribution/);
    });
});
