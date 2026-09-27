import { lifecycleFixture } from './lifecycle-fixture.js';
import { assertNativeExperienceContract } from '../../../public/shared/native-experience-contract.js';
import { initialLifecycle } from '../../../src/native/lifecycle-authority.js';

export const informationActor = 'actor_' + 'a'.repeat(32);
export const informationOtherActor = 'actor_' + 'b'.repeat(32);
export const informationWorld = 'world_' + 'c'.repeat(32);
export function informationFixture(actorId = informationActor, worldId = informationWorld) {
    const { lifecycleRuntime } = lifecycleFixture();
    lifecycleRuntime.automations = []; lifecycleRuntime.workflows = [];
    const string = { type: 'string', maxLength: 256 };
    const properties = { text: string, actor: string, status: string, channel: string, from: string, to: string,
        participants: { type: 'array', items: string, maxItems: 8 }, available: { type: 'boolean' } };
    const initial = { text: '', actor: actorId, status: 'known', channel: 'witnessed', from: '', to: '', participants: [actorId], available: true };
    const schema = { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
    lifecycleRuntime.domains = ['beliefs', 'threads', 'loops', 'memories', 'nodes', 'edges', 'availability'].map(id => ({ id, scopeId: 'session', schemaVersion: 1,
        recordSchema: schema, initial, commands: [{ id: 'save', argsSchema: schema, event: 'information.saved',
            assign: Object.fromEntries(Object.keys(properties).map(key => [key, { formula: 'args.' + key }])) }],
        retention: { maxItems: 128, maxLogicalBytes: 131072, keepPinned: true, keepReferenced: true } }));
    const source = (id, semantic, extra = {}) => ({ id, kind: 'application', semantic, scopeId: 'session', domainId: id, fields: [['text']], ...extra });
    const sources = [source('beliefs', 'belief', { actorField: 'actor', statusField: 'status', channelField: 'channel' }),
        source('threads', 'thread', { participantsField: 'participants' }), source('loops', 'open_loop', { statusField: 'status', actorField: 'actor' }),
        source('memories', 'memory', { actorField: 'actor' }), source('nodes', 'truth'), source('edges', 'truth', { fields: [['from'], ['to']] }),
        { id: 'world', kind: 'world', semantic: 'truth', scopeId: 'session', worldId, fields: [['hp']] },
        { id: 'history', kind: 'timeline', semantic: 'narrative', scopeId: 'session', fields: [['content'], ['role']] }];
    const views = [{ id: 'pov', audience: 'narrator', actorId, sources: ['beliefs', 'threads', 'loops', 'memories'], exposure: ['display', 'context'], knowledge: false, maxItems: 128, maxCharacters: 32768 },
        { id: 'actor', audience: 'actor', actorId, sources: ['beliefs', 'threads'], exposure: ['context'], knowledge: false, maxItems: 128, maxCharacters: 32768 },
        { id: 'player', audience: 'player', sources: ['world', 'history', 'nodes', 'edges'], exposure: ['display'], knowledge: false, maxItems: 128, maxCharacters: 32768 }];
    return { schemaVersion: 1, capabilities: [{ id: 'data-projection', version: 1, required: true }, { id: 'perspective', version: 1, required: true }], dataResources: [], lifecycleRuntime,
        informationRuntime: { schemaVersion: 1, sources, views, actors: [{ id: actorId, scopeId: 'session', availability: { domainId: 'availability', recordId: 'main', field: 'available' } }],
            graphs: [{ id: 'relations', viewId: 'player', nodeSource: 'nodes', edgeSource: 'edges', fromField: 'from', toField: 'to', maxDepth: 4, maxEdges: 256 }] } };
}

export function informationSnapshot() {
    const contract = assertNativeExperienceContract(informationFixture());
    const snapshot = { session: { sessionId: 'session-test', packageVersionId: 'package-version' }, revision: { revisionId: 'revision-one', branchId: 'branch-one' },
        manifest: { runtime: { experienceContract: contract } }, graph: [], knowledge: { bindings: [], snapshots: [] },
        timeline: [{ messageId: 'message-one', activeVariantId: 'variant-one', sequence: 0, role: 'assistant', content: 'PRIVATE RAW HISTORY' }],
        states: { atri_lifecycle: initialLifecycle(contract.lifecycleRuntime), atri_world_state: { worlds: { [informationWorld]: { state: { hp: 8, secret: 'WORLD SECRET' } } } } } };
    for (const [domain, id, value] of [
        ['availability', 'main', { available: true }], ['beliefs', 'rumor', { text: 'The king escaped', status: 'believed', channel: 'rumor' }],
        ['beliefs', 'private', { actor: informationOtherActor, text: 'OTHER BELIEF' }], ['threads', 'mine', { text: 'A private greeting' }],
        ['threads', 'other', { participants: [informationOtherActor], text: 'OTHER THREAD' }], ['loops', 'promise', { status: 'open', text: 'Return tomorrow' }],
        ['memories', 'past', { text: 'Visited yesterday' }], ['nodes', 'a', { text: 'A' }], ['nodes', 'b', { text: 'B' }],
        ['edges', 'ab', { from: 'a', to: 'b' }], ['edges', 'ba', { from: 'b', to: 'a' }], ['edges', 'hidden', { from: 'a', to: 'missing' }],
    ]) addInformationRecord(snapshot, domain, id, value);
    return snapshot;
}
export function addInformationRecord(snapshot, domain, id, value) {
    const def = snapshot.manifest.runtime.experienceContract.lifecycleRuntime.domains.find(item => item.id === domain);
    snapshot.states.atri_lifecycle.domains[domain].records.push({ id, scopeId: 'session', status: 'active', pinned: false,
        value: { ...structuredClone(def.initial), ...value } });
}
