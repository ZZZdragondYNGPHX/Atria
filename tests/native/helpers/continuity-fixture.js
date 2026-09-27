import { lifecycleFixture } from './lifecycle-fixture.js';

export function continuityFixture() {
    const { lifecycleRuntime } = lifecycleFixture();
    lifecycleRuntime.automations = []; lifecycleRuntime.workflows = [];
    const inventory = lifecycleRuntime.domains[0]; inventory.id = 'inventory'; inventory.commands = inventory.commands.slice(0, 1);
    delete inventory.retention.terminalTtl;
    const { scopeId: _scopeId, ...domain } = structuredClone(inventory);
    return { schemaVersion: 1, capabilities: [{ id: 'player-continuity', version: 1, required: true }], dataResources: [], lifecycleRuntime,
        continuityRuntime: { schemaVersion: 1, domains: [{ ...domain, id: 'vault', commands: [] }, { ...structuredClone(domain), id: 'unlocks' }],
            transfers: [{ id: 'vault', sessionDomainId: 'inventory', continuityDomainId: 'vault' }],
            views: [{ id: 'vault', domainId: 'vault', fields: ['text'], maxItems: 32 }, { id: 'unlocks', domainId: 'unlocks', fields: ['text'], maxItems: 32 }] } };
}

export function contentFixture() {
    return { schemaVersion: 1, capabilities: [{ id: 'addon', version: 1, required: true }], dataResources: [],
        contentRuntime: { schemaVersion: 1, extensionPoints: [{ id: 'catalog', resourceId: 'extensions.catalog', kinds: ['skill', 'data', 'template'],
            schema: { type: 'object', properties: { label: { type: 'string', maxLength: 128 }, power: { type: 'integer', minimum: 0, maximum: 10 } },
                required: ['label', 'power'], additionalProperties: false }, maxItems: 32 }] } };
}
