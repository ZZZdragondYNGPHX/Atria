import { describe, test, expect } from '@jest/globals';
import { emptyProvenance, captureEpisodes, createMemorySupportChecker, normalizeProvenance } from '../../public/scripts/extensions/memory-graph/source-provenance.js';
import { applyFactOperations, projectFacts } from '../../public/scripts/extensions/memory-graph/atomic-facts.js';
import { applyTemporalOperations, projectTemporalGraph, resolveEntity } from '../../public/scripts/extensions/memory-graph/temporal-graph.js';

function fixture() {
    const chat = [{ memory_os_source_id: 'm1', mes: 'Alice, Roland, Castle, Harbor, Sword.' }, { memory_os_source_id: 'm2', mes: 'Alice moved from Castle to Harbor.' }];
    let state = emptyProvenance(); state.scopeId = 'scope';
    const ids = captureEpisodes(state, chat, [0, 1], state.scopeId);
    const ticket = { scopeId: state.scopeId, episodeIds: ids };
    let serial = 0; const newId = () => `id${++serial}`;
    const evidence = index => [{ episodeId: ids[index], excerpt: chat[index].mes }];
    const initial = applyFactOperations(state, [
        { action: 'create', text: 'Alice is at Castle', type: 'explicit', evidence: evidence(0) },
        { action: 'create', text: 'Alice moved to Harbor', type: 'explicit', evidence: evidence(1) },
        { action: 'create', text: 'Alice may be at Harbor', type: 'inferred', evidence: evidence(1) },
    ], ticket, chat, newId);
    state = initial.state;
    const apply = ops => { const result = applyTemporalOperations(state, ops, ticket, chat, initial.results, newId, 10); state = result.state; return result.results; };
    const created = apply([
        { action: 'entity', name: 'Alice', type: 'Character', evidence: evidence(0) },
        { action: 'entity', name: 'Roland', type: 'Character', evidence: evidence(0) },
        { action: 'entity', name: 'Castle', type: 'Location', evidence: evidence(0) },
        { action: 'entity', name: 'Harbor', type: 'Location', evidence: evidence(0) },
        { action: 'entity', name: 'Sword', type: 'Item', evidence: evidence(0) },
    ]).map(result => result.id);
    const [alice, roland, castle, harbor, sword] = created;
    const relation = (targetId = castle, extra = {}) => ({ action: 'relation', sourceId: alice, targetId, predicate: 'located_in', factIndex: 0, evidence: evidence(0), ...extra });
    return { chat, ticket, evidence, apply, alice, roland, castle, harbor, sword, relation,
        get state() { return state; }, read: (includeInactive = false) => projectTemporalGraph(state, chat, { includeInactive }) };
}

describe('P-05 projection reuse', () => {
    test('preprojected facts and support checker preserve temporal graph output', () => {
        const f = fixture();
        const expected = projectTemporalGraph(f.state, f.chat, { includeInactive: true });
        const check = createMemorySupportChecker(f.state, f.chat);
        const facts = projectFacts(f.state, f.chat, {
            includeInactive: true,
            checkSupport: check,
        });
        const reused = projectTemporalGraph(f.state, f.chat, {
            includeInactive: true,
            checkSupport: check,
            projectedFacts: facts,
        });
        expect(reused).toEqual(expected);
    });
});

describe('Temporal Graph identity and lifecycle', () => {
    test('exact/alias/normalized resolution reuses stable IDs and separates types', () => {
        const f = fixture();
        f.apply([{ action: 'alias', targetId: f.alice, name: '银翼之花', evidence: f.evidence(0) }]);
        expect(resolveEntity(f.state, f.chat, '银翼之花', 'Character').ids).toEqual([f.alice]);
        expect(resolveEntity(f.state, f.chat, ' ＡＬＩＣＥ ', 'Character').ids).toEqual([f.alice]);
        expect(resolveEntity(f.state, f.chat, 'Alice', 'Location').status).toBe('missing');
        const [again] = f.apply([{ action: 'entity', name: 'Alice', type: 'Character', evidence: f.evidence(1) }]);
        expect(again.id).toBe(f.alice);
    });
    test('ambiguous aliases remain pending and can be explicitly resolved', () => {
        const f = fixture();
        f.apply([f.alice, f.roland].map(targetId => ({ action: 'alias', targetId, name: 'Captain', evidence: f.evidence(0) })));
        const [result] = f.apply([{ action: 'entity', name: 'Captain', type: 'Character', evidence: f.evidence(1) }]);
        expect(result.status).toBe('pending');
        expect(f.read().entities).toHaveLength(5);
        expect(f.read().pending[0].id).toBe(result.pendingId);
        f.apply([{ action: 'resolve_pending', pendingId: result.pendingId, targetId: f.alice, reason: 'This scene identifies Alice', evidence: f.evidence(1) }]);
        expect(f.read().pending[0].status).toBe('resolved');
    });
    test('context candidate requires confidence and reason; unknown candidate is rejected', () => {
        const f = fixture();
        expect(f.apply([{ action: 'entity', name: 'Lady A', type: 'Character', candidateIds: [f.alice], resolutionConfidence: 0.8, evidence: f.evidence(0) }])[0].status).toBe('pending');
        expect(f.apply([{ action: 'entity', name: 'Lady Alice', type: 'Character', candidateIds: [f.alice], resolutionConfidence: 0.95, reason: 'Named in context', evidence: f.evidence(0) }])[0].id).toBe(f.alice);
        expect(() => f.apply([{ action: 'entity', name: 'Lady X', type: 'Character', candidateIds: ['foreign'], evidence: f.evidence(0) }])).toThrow('candidates');
    });
    test('merge and split remap existing relations reversibly without rewriting original endpoints', () => {
        const f = fixture(); const [edge] = f.apply([f.relation()]);
        f.apply([{ action: 'merge_entity', sourceId: f.alice, targetId: f.roland, reason: 'Identity correction', evidence: f.evidence(0) }]);
        expect(f.read().relations[0].sourceEntityId).toBe(f.roland);
        expect(f.state.relations[edge.id].sourceEntityId).toBe(f.alice);
        const [duringMerge] = f.apply([f.relation(f.harbor, { predicate: 'visited' })]);
        expect(f.state.relations[duringMerge.id].sourceEntityId).toBe(f.alice);
        f.apply([{ action: 'split_entity', targetId: f.alice, reason: 'Undo incorrect identity', evidence: f.evidence(0) }]);
        expect(f.read().relations[0].sourceEntityId).toBe(f.alice);
        expect(f.read().relations.find(relation => relation.id === duringMerge.id).sourceEntityId).toBe(f.alice);
        expect(resolveEntity(f.state, f.chat, 'Alice', 'Character').ids).toEqual([f.alice]);
    });
    test('rename retains old name as searchable alias', () => {
        const f = fixture();
        f.apply([{ action: 'rename', targetId: f.alice, name: 'Alice of Silverwing', evidence: f.evidence(0) }]);
        expect(f.read().entities.find(entity => entity.id === f.alice).canonicalName).toBe('Alice of Silverwing');
        expect(resolveEntity(f.state, f.chat, 'Alice', 'Character').ids).toEqual([f.alice]);
    });
    test('replace_current keeps old relation history and explicit story boundary', () => {
        const f = fixture(); const [old] = f.apply([f.relation(f.castle, { timeOrder: 1, validFrom: 'Ch1' })]);
        const [next] = f.apply([f.relation(f.harbor, { factIndex: 1, evidence: f.evidence(1), timeOrder: 3, validFrom: 'Ch3' })]);
        expect(f.read().relations.map(edge => edge.id)).toEqual([next.id]);
        const history = f.read(true).relations.find(edge => edge.id === old.id);
        expect(history.status).toBe('superseded'); expect(history.validUntil).toBe('Ch3');
        expect(projectTemporalGraph(f.state, f.chat, { at: 2 }).relations.map(edge => edge.id)).toEqual([old.id]);
        expect(projectTemporalGraph(f.state, f.chat, { at: 3 }).relations.map(edge => edge.id)).toEqual([next.id]);
        f.chat[1].mes = 'Edited';
        expect(f.read().relations).toHaveLength(0);
        expect(f.read(true).relations.find(edge => edge.id === old.id).status).toBe('disputed');
    });
    test('unknown/equal chronology disputes both; explicit resolution preserves losing edge', () => {
        const f = fixture(); const [old] = f.apply([f.relation()]);
        const [next] = f.apply([f.relation(f.harbor, { factIndex: 1, evidence: f.evidence(1) })]);
        expect(f.read().relations).toHaveLength(0);
        expect(f.read(true).relations.map(edge => edge.status)).toEqual(['disputed', 'disputed']);
        f.apply([{ action: 'resolve_conflict', relationId: next.id, loserIds: [old.id], reason: 'Explicit correction', evidence: f.evidence(1) }]);
        expect(f.read().relations.map(edge => edge.id)).toEqual([next.id]);
        expect(f.read(true).relations.find(edge => edge.id === old.id).status).toBe('superseded');
    });
    test('ownership exclusivity groups by object, not owner', () => {
        const f = fixture();
        f.apply([f.relation(f.sword, { predicate: 'owns', timeOrder: 1 })]);
        f.apply([f.relation(f.sword, { sourceId: f.roland, predicate: 'owns', timeOrder: 2 })]);
        expect(f.read().relations.map(edge => edge.sourceEntityId)).toEqual([f.roland]);
    });
    test('out-of-order arrival does not replace later story state; closed intervals remain historical', () => {
        const f = fixture();
        const [later] = f.apply([f.relation(f.harbor, { timeOrder: 3, factIndex: 1, evidence: f.evidence(1) })]);
        const [earlier] = f.apply([f.relation(f.castle, { timeOrder: 1 })]);
        expect(f.read().relations.map(edge => edge.id)).toEqual([later.id]);
        expect(projectTemporalGraph(f.state, f.chat, { at: 2 }).relations.map(edge => edge.id)).toEqual([earlier.id]);
        const [closed] = f.apply([f.relation(f.castle, { predicate: 'visited', timeOrder: 1, untilOrder: 2 })]);
        expect(f.read().relations.some(edge => edge.id === closed.id)).toBe(false);
        expect(projectTemporalGraph(f.state, f.chat, { at: 1 }).relations.some(edge => edge.id === closed.id)).toBe(true);
    });
    test('entity merging exposes exclusivity conflicts and rejects merge cycles', () => {
        const f = fixture();
        f.apply([f.relation(), f.relation(f.harbor, { sourceId: f.roland })]);
        f.apply([{ action: 'merge_entity', sourceId: f.alice, targetId: f.roland, reason: 'test merge', evidence: f.evidence(0) }]);
        expect(f.read().relations).toHaveLength(0);
        expect(() => f.apply([{ action: 'merge_entity', sourceId: f.roland, targetId: f.alice, reason: 'cycle', evidence: f.evidence(0) }])).toThrow('merge');
    });
    test('persistent/multi-active predicates preserve multiple destinations and deduplicate exact edges', () => {
        const f = fixture();
        f.apply([f.relation(f.castle, { predicate: 'visited' }), f.relation(f.harbor, { predicate: 'visited' }), f.relation(f.castle, { predicate: 'visited' })]);
        expect(f.read().relations).toHaveLength(2);
        expect(() => f.apply([f.relation(f.castle, { predicate: 'visited', policy: 'replace_current' })])).toThrow('policy');
    });
    test('inference cannot displace or manually overrule explicit relation', () => {
        const f = fixture(); const [old] = f.apply([f.relation(f.castle, { timeOrder: 1 })]);
        const [guess] = f.apply([f.relation(f.harbor, { timeOrder: 2, factIndex: 2, evidence: f.evidence(1) })]);
        expect(f.read().relations.map(edge => edge.id)).toEqual([old.id]);
        expect(() => f.apply([{ action: 'resolve_conflict', relationId: guess.id, loserIds: [old.id], reason: 'guess', evidence: f.evidence(1) }])).toThrow('Inference');
    });
    test('invalid endpoints/facts/evidence/predicates reject whole batch', () => {
        const f = fixture(); const before = structuredClone(f.state);
        expect(() => f.apply([f.relation(), f.relation('foreign')])).toThrow('endpoints');
        expect(f.state).toEqual(before);
        expect(() => f.apply([f.relation(f.castle, { factIndex: 99 })])).toThrow('Fact');
        expect(() => f.apply([f.relation(f.castle, { predicate: 'cosine_similarity' })])).toThrow('semantic');
        expect(() => f.apply([f.relation(f.castle, { evidence: [] })])).toThrow('evidence');
    });
    test('source deletion, graph serialization and clone isolation preserve safe projection', () => {
        const f = fixture(); f.apply([f.relation()]);
        const copy = normalizeProvenance(JSON.parse(JSON.stringify(f.state)));
        expect(projectTemporalGraph(copy, f.chat)).toEqual(f.read());
        copy.entities[f.alice].names[0].name = 'copy only';
        expect(f.state.entities[f.alice].names[0].name).toBe('Alice');
        f.chat.splice(0, 1);
        expect(f.read().relations).toHaveLength(0);
        expect(f.read().entities).toHaveLength(0);
    });
});
