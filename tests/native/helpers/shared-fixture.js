import { informationFixture } from './information-fixture.js';
import { continuityFixture } from './continuity-fixture.js';

export function sharedFixture(fixture) {
    const first = fixture.manifest.actors[0].actorId;
    const second = 'actor_' + 'b'.repeat(32);
    fixture.manifest.actors.push({ actorId: second, displayName: 'Second' });
    fixture.manifest.entryPoints[0].actorIds.push(second);
    const contract = informationFixture(first, fixture.worldId);
    contract.informationRuntime.graphs = [];
    contract.informationRuntime.actors = [{ id: first, scopeId: 'session' }, { id: second, scopeId: 'session' }];
    contract.informationRuntime.views = [first, second].map((actorId, i) => ({ id: 'pov' + i, audience: 'actor', actorId,
        sources: ['beliefs', 'threads'], exposure: ['display', 'context'], knowledge: false, maxItems: 32, maxCharacters: 4096 }));
    const basic = continuityFixture();
    contract.lifecycleRuntime.domains.push(...basic.lifecycleRuntime.domains.map(d => ({ ...d, id: 'inventory' })));
    const realmInventory = structuredClone(basic.lifecycleRuntime.domains[0]); realmInventory.id = 'realm_inventory';
    contract.lifecycleRuntime.domains.push(realmInventory);
    contract.continuityRuntime = basic.continuityRuntime;
    contract.sharedRuntime = { schemaVersion: 1,
        seats: [first, second].map((actorId, i) => ({ id: 'seat' + i, actorId, scopeId: 'session', viewIds: ['pov' + i], ruleIds: ['save'] })),
        rules: [{ id: 'save', domainId: 'realm_inventory', commandId: 'save' }],
        realm: { ...structuredClone(basic.continuityRuntime), transfers: [{ id: 'vault', sessionDomainId: 'realm_inventory', continuityDomainId: 'vault' }] } };
    contract.capabilities.push({ id: 'shared-realm', version: 1, required: true });
    fixture.manifest.runtime = { experience: { mode: 'text' }, experienceContract: contract };
    return contract;
}
