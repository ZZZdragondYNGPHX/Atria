import { evaluateNativeKnowledge, KNOWLEDGE_RUNTIME_NAMESPACE } from '../../public/scripts/native/knowledge-selection.js';
import { nativeKnowledgePromptChannels } from '../../public/scripts/native/knowledge-prompt-channels.js';
import { snapshotWorldInfoProvenance } from '../../public/scripts/atri-world-info-provenance.js';

function item(id, entry = {}, binding = 'binding') {
    return { identity: binding + ':' + id, knowledgeBindingId: binding, knowledgeEntryId: id,
        knowledgeBaseId: 'base', knowledgeRevisionId: 'revision', authorityRank: 500, priority: 100,
        entry: { content: id, ...entry } };
}
function plan(...included) {
    return { schemaVersion: 1, revisionId: 'session-revision', branchId: 'branch', target: { kind: 'narrator' }, included, rejected: [] };
}
const evaluate = (value, options = {}) => evaluateNativeKnowledge(value, { countTokens: text => text.length, ...options });

test('disabled entries cannot activate directly, recursively, from state, sticky state, related or required paths', async () => {
    const value = plan(item('root', { content: 'trigger', relations: { relatedEntryIds: ['disabled'] } }),
        { ...item('disabled', { enabled: false, content: 'FORBIDDEN', discovery: { keywords: ['trigger'] } }), stateActivated: true },
        item('dependent', { relations: { requiredEntryIds: ['disabled'] } }));
    const rendered = [];
    const result = await evaluate(value, { budget: 7, state: { effects: { 'binding:disabled': { stickyUntil: 50 } } }, render: text => { rendered.push(text); return text; } });
    expect(result.entries.map(entry => entry.knowledgeEntryId)).toEqual(['root']);
    expect(result.rejected).toContainEqual({ identity: 'binding:disabled', reason: 'entry_disabled' });
    expect(rendered).not.toContain('FORBIDDEN');
    expect(JSON.stringify(nativeKnowledgePromptChannels(result))).not.toContain('FORBIDDEN');
    expect(result.pendingState.effects).not.toHaveProperty('binding:disabled');
    value.included[1].entry.enabled = true;
    expect((await evaluate(value)).entries.map(entry => entry.knowledgeEntryId)).toContain('disabled');
});

test('Native discovery supports literal aliases, regex, recursive content, related entries and stable identity', async () => {
    const value = plan(
        item('first', { content: 'the HARBOR', discovery: { aliases: ['dock'] }, relations: { relatedEntryIds: ['related'] } }),
        item('second', { content: 'equal', discovery: { regex: ['/harbor/i'] }, delivery: { position: 'after' } }),
        item('related', { content: 'equal', discovery: { keywords: ['absent'] } }),
        item('unmatched', { discovery: { keywords: ['absent'] } }),
    );
    const result = await evaluate(value, { messages: ['dock'] });
    expect(result.entries.map(entry => entry.knowledgeEntryId)).toEqual(['first', 'related', 'second']);
    expect(result.after[0].identity).toBe('binding:second');
    expect(result.rejected).toContainEqual({ identity: 'binding:unmatched', reason: 'discovery_unmatched' });
    expect(value.included[0]).not.toHaveProperty('content');
    const channels = nativeKnowledgePromptChannels(result);
    const sources = snapshotWorldInfoProvenance(channels.worldInfoProvenance).sources;
    expect(sources).toHaveLength(3);
    expect(sources[0].knowledge.knowledgeRevisionId).toBe('revision');
    expect(new Set(sources.map(source => source.id)).size).toBe(3);
    expect(result.entries.every(entry => !('uid' in entry) && !('world' in entry) && !('key' in entry))).toBe(true);
});

test('required dependency closure is atomic, cycle safe, binding-local and compacted as one bundle', async () => {
    const value = plan(
        item('root', { content: 'very long root', metadata: { compactContent: 'R' }, relations: { requiredEntryIds: ['basis'] } }),
        item('basis', { content: 'very long basis', discovery: { keywords: ['absent'] }, metadata: { compactContent: 'B' }, relations: { requiredEntryIds: ['root'] } }),
        item('basis', { content: 'wrong binding', discovery: { keywords: ['absent'] } }, 'other'),
    );
    const exact = await evaluate(value, { budget: 3 });
    expect(exact.entries.map(entry => entry.content)).toEqual(['B', 'R']);
    expect(exact.entries.every(entry => entry.variant === 'compact')).toBe(true);
    expect((await evaluate(value, { budget: 2 })).entries).toEqual([]);
    value.included[1].entry.lifecycle = { probability: 0 };
    expect((await evaluate(value, { random: () => 0 })).entries).toEqual([]);
});

test('lifecycle state is detached, exact-revision scoped and cooldown follows sticky without renewal', async () => {
    const value = plan(item('timed', { discovery: { keywords: ['dock'] }, lifecycle: { sticky: 2, cooldown: 2, delay: 1 } }));
    expect((await evaluate(value, { messages: ['dock'], turn: 0 })).entries).toHaveLength(0);
    const initial = await evaluate(value, { messages: ['dock'], turn: 1 });
    const state = structuredClone(initial.pendingState);
    expect(state.effects['binding:timed']).toEqual({ stickyUntil: 3, cooldownUntil: 5 });
    const active = await evaluate(value, { turn: 2, state });
    expect(active.entries[0].activationReason).toBe('sticky');
    expect(active.pendingState).toEqual(state);
    expect((await evaluate(value, { messages: ['dock'], turn: 3, state })).entries).toHaveLength(0);
    expect((await evaluate(value, { messages: ['dock'], turn: 5, state })).entries).toHaveLength(1);
    expect(initial.pendingState).toEqual(state);
    value.included[0].identity = 'new-exact-revision';
    expect((await evaluate(value, { turn: 2, state })).entries).toHaveLength(0);
    expect(KNOWLEDGE_RUNTIME_NAMESPACE).toBe('atri_knowledge_runtime');
});

test('state activation bypasses discovery, while delay and probability still apply; Native priority tiers fit remaining budget', async () => {
    const value = plan(item('optional', { content: 'long optional', metadata: { budgetTier: 'optional' } }),
        { ...item('critical', { content: 'C', discovery: { keywords: ['absent'] }, metadata: { budgetTier: 'critical' } }), stateActivated: true },
        item('small', { content: 'S' }));
    expect((await evaluate(value, { budget: 3 })).entries.map(entry => entry.content)).toEqual(['C', 'S']);
    value.included[1].entry.lifecycle = { probability: 0 };
    expect((await evaluate(value, { budget: 3, random: () => 0 })).entries.map(entry => entry.content)).toEqual(['S']);
});
