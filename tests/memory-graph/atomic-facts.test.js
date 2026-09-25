import { describe, test, expect } from '@jest/globals';
import { emptyProvenance, captureEpisodes, reconcileSources, normalizeProvenance } from '../../public/scripts/agents/memory/source-provenance.js';
import { applyFactOperations, projectFacts } from '../../public/scripts/agents/memory/atomic-facts.js';
import { factExtractionTool, factExtractionContext, readFactToolCalls, FACT_TOOL_NAME } from '../../public/scripts/agents/memory/fact-extraction.js';

function fixture() {
    const chat = [{ memory_os_source_id: 'm1', mes: 'Alice gave Roland the sword.' }, { memory_os_source_id: 'm2', mes: 'Roland keeps the sword.' }];
    let state = emptyProvenance();
    state.scopeId = 'chat:one';
    const ids = captureEpisodes(state, chat, [0, 1], state.scopeId);
    const ticket = { scopeId: state.scopeId, episodeIds: ids };
    let serial = 0;
    const create = (text, episode = 0, type = 'explicit') => ({ action: 'create', text, type,
        evidence: [{ episodeId: ids[episode], excerpt: chat[episode].mes }], confidence: 1 });
    return { chat, ticket, ids, create, get state() { return state; },
        apply(ops) { const result = applyFactOperations(state, ops, ticket, chat, () => `f${++serial}`, 100); state = result.state; return result.results; },
        read(options) { return projectFacts(state, chat, options); },
    };
}

describe('atomic facts and evidence evolution', () => {
    test('separates explicit and inferred assertions and caps confidence', () => {
        const f = fixture();
        f.apply([f.create('Roland has the sword'), f.create('Alice trusts Roland', 0, 'inferred')]);
        expect(f.read().map(item => [item.type, item.confidence])).toEqual([['explicit', 0.95], ['inferred', 0.65]]);
        expect(f.state.dependencies.some(edge => edge.child.startsWith('fact:'))).toBe(true);
    });
    test('repeated same assertion/evidence is idempotent; spelling whitespace does not append', () => {
        const f = fixture();
        f.apply([f.create('Roland has the sword')]);
        f.apply([f.create('  ROLAND   has the sword ')]);
        expect(f.read()).toHaveLength(1);
        expect(f.read()[0].supports).toHaveLength(1);
    });
    test('independent reinforcement survives loss of one supporting source', () => {
        const f = fixture();
        const [{ id }] = f.apply([f.create('Roland has the sword')]);
        f.apply([{ ...f.create('ignored', 1), action: 'reinforce', targetId: id }]);
        f.chat[0].mes = 'Revised first source';
        reconcileSources(f.state, f.chat);
        expect(f.read()[0].status).toBe('active');
        f.chat[1].mes = 'Revised second source';
        reconcileSources(f.state, f.chat);
        expect(f.read()).toHaveLength(0);
        expect(f.read({ includeInactive: true })[0].status).toBe('stale');
    });
    test('a multi-source assertion requires every source in that support group', () => {
        const f = fixture();
        const op = f.create('Alice trusts Roland', 0, 'inferred');
        op.evidence.push(f.create('', 1).evidence[0]);
        f.apply([op]);
        f.chat.pop();
        expect(f.read()).toHaveLength(0);
    });
    test('merge retains both records, original evidence and equivalence rationale', () => {
        const f = fixture();
        const [a, b] = f.apply([f.create('Roland has the sword'), f.create('The sword is kept by Roland', 1)]);
        f.apply([{ action: 'merge', targetId: a.id, sourceId: b.id, reason: 'Equivalent custody assertions' }]);
        expect(f.read()).toHaveLength(1);
        expect(f.read()[0].supports).toHaveLength(2);
        expect(f.state.facts[b.id].mergedInto).toBe(a.id);
        expect(f.read({ includeInactive: true }).find(item => item.id === b.id).status).toBe('superseded');
    });
    test('supersede preserves old fact; stale successor does not silently restore old current truth', () => {
        const f = fixture();
        const [old] = f.apply([f.create('Alice holds the sword')]);
        f.apply([{ ...f.create('Roland holds the sword', 1), action: 'supersede', targetId: old.id, reason: 'Explicit transfer' }]);
        expect(f.read().map(item => item.text)).toEqual(['Roland holds the sword']);
        f.chat[1].mes = 'Source edited';
        const history = f.read({ includeInactive: true });
        expect(history.find(item => item.id === old.id).status).toBe('disputed');
        expect(f.read()).toHaveLength(0);
    });
    test('rejects missing, invented or cross-ticket evidence without partial writes', () => {
        const f = fixture();
        expect(() => f.apply([f.create('valid'), { ...f.create('bad'), evidence: [{ episodeId: 'foreign', excerpt: 'x' }] }])).toThrow('quote');
        expect(f.state.facts).toBeUndefined();
        expect(() => f.apply([{ ...f.create('bad'), evidence: [] }])).toThrow('evidence');
        expect(() => f.apply([{ ...f.create('bad'), evidence: [{ episodeId: f.ids[0], excerpt: 'invented' }] }])).toThrow('quote');
    });
    test('rejects inference promotion, merge across types, self-supersession and unknown targets', () => {
        const f = fixture();
        const [a, b] = f.apply([f.create('Roland has sword'), f.create('Alice trusts Roland', 0, 'inferred')]);
        expect(() => f.apply([{ ...f.create('new', 1, 'inferred'), action: 'supersede', targetId: a.id, reason: 'guess' }])).toThrow('explicit');
        expect(() => f.apply([{ action: 'merge', targetId: a.id, sourceId: b.id, reason: 'same' }])).toThrow('merge');
        expect(() => f.apply([{ ...f.create('Roland has sword'), action: 'supersede', targetId: a.id, reason: 'same' }])).toThrow('itself');
        expect(() => f.apply([{ ...f.create('new'), action: 'reinforce', targetId: 'foreign' }])).toThrow('scope');
    });
    test('normalization/serialization retain fact IDs and evidence without aliasing', () => {
        const f = fixture(); f.apply([f.create('Roland has sword')]);
        const copy = normalizeProvenance(JSON.parse(JSON.stringify(f.state)));
        expect(projectFacts(copy, f.chat)).toEqual(f.read());
        Object.values(copy.facts)[0].text = 'edited copy';
        expect(f.read()[0].text).toBe('Roland has sword');
    });
    test('tool contract supports empty extraction and rejects incomplete/duplicate calls', () => {
        expect(factExtractionTool().function.name).toBe(FACT_TOOL_NAME);
        expect(readFactToolCalls([{ name: FACT_TOOL_NAME, args: { operations: [] } }])).toEqual([]);
        expect(() => readFactToolCalls([])).toThrow('exactly once');
        expect(() => readFactToolCalls([{ name: FACT_TOOL_NAME }, { name: FACT_TOOL_NAME }])).toThrow('exactly once');
        expect(factExtractionContext({ sources: [{ episodeId: 'e', content: 'source' }] }, [])).toContain('source_episodes');
    });
});
