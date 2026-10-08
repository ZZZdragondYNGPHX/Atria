import { expect, test } from '@jest/globals';
import { parseEvaluationJson } from '../../src/native/agent-intelligence/evaluation/json.js';

test('complete plain or singly fenced JSON preserves the original values', () => {
    const value = { value: 'Keep user choices.\n```literal```', rationale: 'Public hypothesis' }, text = JSON.stringify(value);
    for (const source of [text, '\n' + text + '\n', '```json\n' + text + '\n```', '```\r\n' + text + '\r\n```']) expect(parseEvaluationJson(source)).toEqual(value);
});
test('commentary, multiple blocks, wrong language and malformed JSON stay rejected', () => {
    for (const source of ['Explanation\n```json\n{}\n```', '```json\n{}\n```\nExplanation', '```json\n{}\n```\n```json\n{}\n```', '```js\n{}\n```', '```json\n{"value":\n```', '{} {}']) expect(() => parseEvaluationJson(source)).toThrow();
    expect(() => parseEvaluationJson(null)).toThrow('evaluation_json_text_required');
});
