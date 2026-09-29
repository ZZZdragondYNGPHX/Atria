import { describe, expect, test } from '@jest/globals';

import { createPackageRuntimeContributionRegistry } from '../../public/scripts/native/experience/ui/plugin-contributions.js';

describe('A5 Play package contribution registry', () => {
    test('retains inert plugin contribution metadata without a legacy selector runtime', () => {
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
        expect(registry).not.toHaveProperty('selectorDefinitions');
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
