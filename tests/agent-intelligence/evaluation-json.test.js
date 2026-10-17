import { expect, test } from '@jest/globals';
import { parseEvaluationJson, applyEvolutionProposal } from '../../src/native/agent-intelligence/evaluation/json.js';

test('complete plain or singly fenced JSON preserves the original values', () => {
    const value = { value: 'Keep user choices.\n```literal```', rationale: 'Public hypothesis' }, text = JSON.stringify(value);
    for (const source of [text, '\n' + text + '\n', '```json\n' + text + '\n```', '```\r\n' + text + '\r\n```']) expect(parseEvaluationJson(source)).toEqual(value);
});
test('commentary, multiple blocks, wrong language and malformed JSON stay rejected', () => {
    for (const source of ['Explanation\n```json\n{}\n```', '```json\n{}\n```\nExplanation', '```json\n{}\n```\n```json\n{}\n```', '```js\n{}\n```', '```json\n{"value":\n```', '{} {}']) expect(() => parseEvaluationJson(source)).toThrow();
    expect(() => parseEvaluationJson(null)).toThrow('evaluation_json_text_required');
});

test('exact Route proposals retain only the typed selection, while arbitrary object edits and authority fields are rejected', () => {
    const base = { scope: 'player', runtimeRouteId: 'route_' + 'a'.repeat(32) }, value = { ...base, runtimeRouteId: 'route_' + 'b'.repeat(32) };
    expect(applyEvolutionProposal({ value, rationale: 'Use another declared Route' }, base)).toEqual({ value, rationale: 'Use another declared Route' });
    for (const proposed of [{ ...value, approved: true }, { ...value, endpoint: 'http://127.0.0.1:1/forbidden' }, { ...value, scope: 'library' }, 3]) {
        expect(() => applyEvolutionProposal({ value: proposed, rationale: 'Invalid selection' }, base)).toThrow();
    }
    expect(() => applyEvolutionProposal({ value, rationale: 'No object editing' }, { arbitrary: 'object' })).toThrow();
    expect(() => applyEvolutionProposal({ value, rationale: 'Extra authority', grant: true }, base)).toThrow();
});
