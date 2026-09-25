import { describe, test, expect } from '@jest/globals';
import { selectGraph } from '../../public/scripts/agents/memory/graph-inspector.js';
import { applyManualCorrection } from '../../public/scripts/agents/memory/manual-corrections.js';
import { emptyProvenance, normalizeProvenance } from '../../public/scripts/agents/memory/source-provenance.js';
import { projectTemporalGraph, applyTemporalOperations } from '../../public/scripts/agents/memory/temporal-graph.js';
import { buildMemoryCorpus } from '../../public/scripts/agents/memory/hybrid-retrieval.js';

function fixture() {
    let state = { ...emptyProvenance(), scopeId: 'chat:a' }; let serial = 0;
    const chat = []; const newId = () => `manual-${++serial}`;
    const apply = command => { state = applyManualCorrection(state, { reason: 'User correction', ...command }, chat, newId, 123).state; };
    apply({ action: 'entity', name: 'Alice', type: 'Character' });
    apply({ action: 'entity', name: 'Castle', type: 'Location' });
    apply({ action: 'entity', name: 'Harbor', type: 'Location' });
    const [alice, castle, harbor] = Object.keys(state.entities);
    return { apply, alice, castle, harbor, chat, newId, get state() { return state; },
        graph: () => projectTemporalGraph(state, chat, { includeInactive: true }),
        relation: (targetId = castle) => apply({ action: 'relation', sourceId: alice, targetId, predicate: 'located_in', text: `Alice located in ${targetId}` }) };
}

describe('Memory OS inspector and manual corrections', () => {
    test('user-created records survive reload without fabricated messages or Episodes', () => {
        const f = fixture(); f.relation();
        expect(f.chat).toEqual([]); expect(f.state.episodes).toEqual({});
        const restored = normalizeProvenance(f.state);
        expect(projectTemporalGraph(restored, []).relations).toHaveLength(1);
        const doc = buildMemoryCorpus({ state: restored, chat: [] }).documents.find(item => item.kind === 'relation');
        expect(doc.episodeIds).toEqual([]); expect(doc.manualSources).toHaveLength(1);
        expect(restored.corrections[doc.manualSources[0]].actor).toBe('user');
    });
    test('rename and remove alias affect identity search while preserving audit', () => {
        const f = fixture(); f.apply({ action: 'alias', targetId: f.alice, name: 'Captain' });
        f.apply({ action: 'rename', targetId: f.alice, name: 'Alicia' });
        f.apply({ action: 'remove_alias', targetId: f.alice, name: 'Captain' });
        expect(f.graph().entities[0].canonicalName).toBe('Alicia');
        expect(f.graph().entities[0].aliases).toContain('Alice');
        expect(f.graph().entities[0].aliases).not.toContain('Captain');
        expect(f.state.entities[f.alice].names.find(name => name.name === 'Captain').manualDisabled).toBeTruthy();
    });
    test('relation rejection suppresses its supporting fact in every recall lane', () => {
        const f = fixture(); f.relation(); const edge = f.graph().relations[0];
        f.apply({ action: 'reject_relation', targetId: edge.id });
        expect(f.graph().relations[0].status).toBe('rejected');
        expect(buildMemoryCorpus({ state: f.state, chat: [] }).documents).toHaveLength(0);
        expect(f.state.relations[edge.id].supports).toHaveLength(1);
    });
    test('fact deletion removes dependent relation from active projection', () => {
        const f = fixture(); f.relation();
        f.apply({ action: 'reject_fact', targetId: f.graph().relations[0].supports[0].factId });
        expect(projectTemporalGraph(f.state, []).relations).toEqual([]);
        expect(buildMemoryCorpus({ state: f.state, chat: [] }).documents).toEqual([]);
    });
    test('relation replacement retains the old record and only recalls the new assertion', () => {
        const f = fixture(); f.relation(); const old = f.graph().relations[0];
        f.apply({ action: 'edit_relation', relationId: old.id, sourceId: f.alice, targetId: f.harbor, predicate: 'located_in', text: 'Alice moved to Harbor' });
        expect(f.graph().relations.find(edge => edge.id === old.id).status).toBe('rejected');
        expect(projectTemporalGraph(f.state, []).relations[0].targetEntityId).toBe(f.harbor);
        expect(buildMemoryCorpus({ state: f.state, chat: [] }).documents.filter(doc => doc.kind === 'fact').map(doc => doc.text)).toEqual(['Alice moved to Harbor']);
    });
    test('editing assertion text with unchanged endpoints does not reuse the rejected edge', () => {
        const f = fixture(); f.relation(); const old = f.graph().relations[0];
        f.apply({ action: 'edit_relation', relationId: old.id, sourceId: f.alice, targetId: f.castle, predicate: 'located_in', text: 'Corrected location statement' });
        const active = projectTemporalGraph(f.state, []).relations;
        expect(active).toHaveLength(1); expect(active[0].id).not.toBe(old.id);
    });
    test('invalid corrections are atomic and cannot mutate providers', () => {
        const f = fixture(); f.state.providerSnapshots = { external: { fields: [{ value: 7 }] } }; const before = structuredClone(f.state);
        expect(() => f.apply({ action: 'relation', sourceId: f.alice, targetId: 'foreign', predicate: 'owns', text: 'test' })).toThrow();
        expect(f.state).toEqual(before);
        expect(() => f.apply({ action: 'set_provider', targetId: 'external' })).toThrow();
        expect(() => f.apply({ action: 'entity', name: 'Missing reason', type: 'Concept', reason: '' })).toThrow();
        f.apply({ action: 'alias', targetId: f.alice, name: 'A' });
        expect(f.state.providerSnapshots).toEqual(before.providerSnapshots);
    });
    test('manual merge and split preserve identity and endpoints', () => {
        const f = fixture(); f.relation(); f.apply({ action: 'entity', name: 'Other Alice', type: 'Character' });
        const other = f.graph().entities.at(-1).id;
        f.apply({ action: 'merge_entity', sourceId: f.alice, targetId: other });
        expect(projectTemporalGraph(f.state, []).relations[0].sourceEntityId).toBe(other);
        f.apply({ action: 'split_entity', targetId: f.alice });
        expect(projectTemporalGraph(f.state, []).relations[0].sourceEntityId).toBe(f.alice);
    });
    test('pending entities can be accepted or rejected without losing their records', () => {
        const f = fixture(); const proof = structuredClone(f.state.entities[f.alice].names[0]);
        f.state.entityPending = { p: { ...proof, id: 'p', scopeId: f.state.scopeId, name: 'The Lady', type: 'Character', candidateIds: [f.alice] },
            q: { ...proof, id: 'q', scopeId: f.state.scopeId, name: 'Unknown', type: 'Character', candidateIds: [f.alice] } };
        f.apply({ action: 'resolve_pending', pendingId: 'p', targetId: f.alice });
        f.apply({ action: 'reject_pending', targetId: 'q' });
        expect(f.graph().pending.map(item => item.status)).toEqual(['resolved', 'rejected']);
        expect(() => f.apply({ action: 'resolve_pending', pendingId: 'q', targetId: f.alice })).toThrow();
    });
    test('accepting a conflicting relation leaves one current winner', () => {
        const f = fixture(); f.relation(); f.relation(f.harbor);
        const [old, winner] = f.graph().relations;
        expect(old.status).toBe('disputed');
        f.apply({ action: 'resolve_conflict', relationId: winner.id, loserIds: [old.id] });
        expect(projectTemporalGraph(f.state, []).relations.map(edge => edge.id)).toEqual([winner.id]);
    });
    test('extraction cannot supply a forged manual support or omit Episode evidence', () => {
        const f = fixture(); const manualId = Object.keys(f.state.corrections)[0];
        expect(() => applyTemporalOperations(f.state, [{ action: 'entity', name: 'Fake', type: 'Concept', manualId }],
            { scopeId: f.state.scopeId, manualId, episodeIds: [] }, [])).toThrow('evidence');
    });
    test('global filters, alias search and one to three hop locality use real relations', () => {
        const entities = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, canonicalName: id, aliases: i === 0 ? ['Ａlice'] : [], type: 'Character', status: 'active' }));
        const relations = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, sourceEntityId: id, targetEntityId: entities[i + 1].id, predicate: 'knows', status: 'active' }));
        const view = { entities, relations };
        expect(selectGraph(view, { center: 'a' }).entities.map(item => item.id)).toEqual(['a', 'b']);
        expect(selectGraph(view, { center: 'a', hops: 3 }).entities.map(item => item.id)).toEqual(['a', 'b', 'c', 'd']);
        expect(selectGraph(view, { query: 'alice' }).entities.map(item => item.id)).toEqual(['a']);
        expect(selectGraph(view, { predicate: 'owns' }).relations).toEqual([]);
        relations[0].status = 'rejected';
        expect(selectGraph(view).relations).toHaveLength(3);
        expect(selectGraph(view, { history: true }).relations).toHaveLength(4);
    });
    test('large graph rendering is bounded and never emits dangling edges', () => {
        const entities = Array.from({ length: 1000 }, (_, i) => ({ id: String(i), canonicalName: String(i), aliases: [], status: 'active' }));
        const relations = Array.from({ length: 1500 }, (_, i) => ({ id: String(i), sourceEntityId: String(i % 1000), targetEntityId: String((i + 1) % 1000), status: 'active' }));
        const graph = selectGraph({ entities, relations });
        expect(graph.entities).toHaveLength(250); expect(graph.total).toBe(1000);
        expect(graph.relations.length).toBeLessThanOrEqual(600);
        const ids = new Set(graph.entities.map(entity => entity.id));
        expect(graph.relations.every(edge => ids.has(edge.sourceEntityId) && ids.has(edge.targetEntityId))).toBe(true);
    });
});
