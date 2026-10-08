import { expect, test } from '@jest/globals';
import { completeM1Response } from './m1-response.js';

const response = message => ({ choices: [{ message }] });
test('empty tools and truncated JSON are incomplete without changing the raw output', () => {
    const tools = { arm: 'candidate', rendered: { body: { tools: [{}] } } };
    expect(completeM1Response(response({ content: '' }), tools)).toBe(false);
    expect(completeM1Response(response({ tool_calls: [{ function: { name: 'write_message', arguments: '{"text":' } }] }), tools)).toBe(false);
    const raw = response({ content: '```json\n{"value":"unfinished' }), before = JSON.stringify(raw);
    expect(completeM1Response(raw, { arm: 'extraction' })).toBe(false); expect(JSON.stringify(raw)).toBe(before);
});
test('complete tools and unfavorable or uncertain JSON grades are passed through once', () => {
    const raw = response({ tool_calls: [{ function: { name: 'finalize', arguments: '{}' } }] });
    expect(completeM1Response(raw, { arm: 'candidate', rendered: { body: { tools: [{}] } } })).toBe(true);
    for (const preference of ['left', 'right', 'tie', 'uncertain']) expect(completeM1Response(response({ content: JSON.stringify({ preference }) }), { arm: 'judge' })).toBe(true);
});
