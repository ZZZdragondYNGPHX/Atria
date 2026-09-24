import { test, expect } from '@jest/globals';
import { normalizeKnowledgeApplicability } from '../../public/scripts/native/knowledge-contracts.js';
import { assertKnowledgeEntry } from '../../src/native/world-knowledge.js';
const condition = { providerId: 'atri_variables', path: ['hp'], operator: 'gt', value: 0 };
const entry = applicability => ({ knowledgeEntryId: 'kentry_' + 'a'.repeat(32), content: 'Alive', applicability });

test('Native persistence and client share one detached applicability contract', () => {
    const value = { stateConditions: [condition], stateConditionsLogic: 'any', stateActivation: true };
    const normalized = normalizeKnowledgeApplicability(value);
    expect(normalized).toEqual(value);
    expect(normalized.stateConditions[0].path).not.toBe(condition.path);
    expect(assertKnowledgeEntry(entry(value)).applicability).toEqual(normalized);
});

test.each([
    { stateEvents: [] }, { stateConditions: null }, { stateConditions: Array(33).fill(condition) },
    { stateActivation: true }, { stateActivation: { mode: 'all' } }, { stateConditionsLogic: 'xor' },
    ...[
        { providerId: 'legacy' }, { path: ['__proto__'] }, { path: [' hp'] }, { path: 'hp' },
        { path: [] }, { path: Array(13).fill('hp') }, { operator: 'regex' }, { value: 'zero' },
        { value: Infinity }, { value: undefined }, { value: {} }, { operator: 'contains', value: 1 },
        { operator: null }, { extra: true },
    ].map(change => ({ stateConditions: [{ ...condition, ...change }] })),
])('rejects unsupported applicability before persistence: %j', value => {
    expect(() => normalizeKnowledgeApplicability(value)).toThrow('KnowledgeEntry.applicability');
    expect(() => assertKnowledgeEntry(entry(value))).toThrow('KnowledgeEntry.applicability');
});
