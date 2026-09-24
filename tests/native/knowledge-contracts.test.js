import { test, expect } from '@jest/globals';
import { normalizeKnowledgeApplicability, normalizeKnowledgeDelivery, normalizeKnowledgeSelector } from '../../public/scripts/native/knowledge-contracts.js';
import { bindingFor, knowledgeSnapshot } from './helpers/session-fixture.js';
import { assertKnowledgeEntry, assertKnowledgeBinding } from '../../src/native/world-knowledge.js';
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


test.each(['narrator', 'actor', 'agent', 'user'])('target kind %s has one exact shape', kind => {
    expect(normalizeKnowledgeSelector(kind)).toBe(kind);
    expect(normalizeKnowledgeSelector({ kind, id: 'exact-id' })).toEqual({ kind, id: 'exact-id' });
    expect(normalizeKnowledgeDelivery({ position: 'after', target: [kind, { kind, id: 'exact-id' }] }).target).toHaveLength(2);
});
test.each([null, '', 'context', [], ['actor', undefined], { id: 'actor-a' }, { type: 'actor' }, { kind: 'actor', actorId: 'a' }, { kind: 'agent', id: '' }, { kind: 'user', id: ' name ' }, { kind: 'narrator', secret: true }])('unsupported selectors fail before execution: %j', target => {
    expect(() => normalizeKnowledgeSelector(target)).toThrow('target');
    expect(() => normalizeKnowledgeDelivery({ target })).toThrow('delivery.target');
});
test.each(['before-chat', 'AFTER', '', null, 1])('unsupported delivery position %j cannot silently become before', position => {
    expect(() => normalizeKnowledgeDelivery({ position })).toThrow('delivery.position');
    expect(() => assertKnowledgeEntry({ ...entry(undefined), delivery: { position } })).toThrow('delivery.position');
});

test('Binding persistence uses the same target schema as entry delivery and runtime', () => {
    const binding = bindingFor(knowledgeSnapshot('Bound knowledge'), 'library');
    expect(assertKnowledgeBinding({ ...binding, target: { kind: 'actor', id: 'actor-a' } }).target).toEqual({ kind: 'actor', id: 'actor-a' });
    expect(() => assertKnowledgeBinding({ ...binding, target: { kind: 'actor', actorId: 'actor-a' } })).toThrow('KnowledgeBinding.target.actorId');
});
