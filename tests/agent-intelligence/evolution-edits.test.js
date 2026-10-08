import { expect, test } from '@jest/globals';
import { applyEvolutionProposal } from '../../src/native/agent-intelligence/evaluation/json.js';

test('local corrections preserve every untouched instruction and apply against original positions', () => {
    const base = 'Original style.\nUse the old promise.\nKeep authority.\n';
    const parsed = { edits: [{ before: '', after: 'Explain actual review state.' }, { before: 'old promise', after: 'latest visible promise' }], rationale: 'Specific failure.' };
    expect(applyEvolutionProposal(parsed, base)).toEqual({ value: 'Original style.\nUse the latest visible promise.\nKeep authority.\nExplain actual review state.', rationale: parsed.rationale });
    expect(parsed.edits[0].before).toBe('');
});

test('ambiguous, missing, overlapping and multiple append anchors fail closed', () => {
    for (const edits of [[{ before: 'a', after: 'x' }], [{ before: 'missing', after: 'x' }], [{ before: 'aba', after: 'x' }, { before: 'ba', after: 'y' }], [{ before: '', after: 'x' }, { before: '', after: 'y' }]]) {
        expect(() => applyEvolutionProposal({ edits, rationale: 'failure' }, 'aba')).toThrow();
    }
});

test('full model text replacement and undeclared edit fields are rejected before target preparation', () => {
    expect(() => applyEvolutionProposal({ value: 'Dropped original style.', rationale: 'failure' }, 'Original style.')).toThrow('evolution_text_edits_required');
    expect(() => applyEvolutionProposal({ edits: [{ before: 'Original style.', after: 'replacement' }], rationale: 'failure' }, 'Original style.')).toThrow('evolution_edit_invalid');
    expect(() => applyEvolutionProposal({ edits: [{ before: '', after: 'new', scope: 'global' }], rationale: 'failure' }, 'base')).toThrow('evolution_edit_invalid');
    expect(() => applyEvolutionProposal({ edits: Array.from({ length: 5 }, () => ({ before: '', after: 'new' })), rationale: 'failure' }, 'base')).toThrow();
});

test('integer target proposals retain their contract and reject text or unknown fields', () => {
    expect(applyEvolutionProposal({ value: 3, rationale: 'bounded repair' }, 2)).toEqual({ value: 3, rationale: 'bounded repair' });
    expect(() => applyEvolutionProposal({ value: '3', rationale: 'invalid' }, 2)).toThrow();
    expect(() => applyEvolutionProposal({ value: 3, edits: [], rationale: 'invalid' }, 2)).toThrow();
});
