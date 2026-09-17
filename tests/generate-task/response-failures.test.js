import { test, expect, jest, afterEach } from '@jest/globals';
import { generateTask, generateTaskStream, normalizeResponse } from '../../public/scripts/generate-task.js';
import { requestToolCallsWithRetry, requestToolCallWithRetry } from '../../public/scripts/lib/iter-tool-calling.js';
import { isAbortError } from '../../public/scripts/lib/abort-utils.js';

const tools = [{ type: 'function', function: { name: 'output', parameters: { type: 'object' } } }];
const call = args => ({ id: 'call-1', type: 'function', function: { name: 'output', arguments: args } });
const response = (content = null, calls = [call('{}')], usage = undefined) => ({
    choices: [{ message: { content, tool_calls: calls }, finish_reason: calls.length ? 'tool_calls' : 'stop' }], usage,
});
const injected = sender => ({
    profileResolver: () => ({ requestApi: 'openai', apiSettingsOverride: null }),
    builder: ({ messages }) => messages, senders: { sendOpenAIRequest: sender },
});
const normalize = (raw, extra = {}) => normalizeResponse({ requestApi: 'openai', mode: 'tool', raw, ...extra });
afterEach(() => jest.restoreAllMocks());

test.each(['', '   ', '\n'])('empty content %j without tools is rejected', content => {
    expect(() => normalize(response(content, []))).toThrow(/empty|no response/i);
});
test('explicit zero completion tokens is rejected even if content/tools exist', () => {
    expect(() => normalize(response('text', [call('{}')], { completion_tokens: 0 }))).toThrow(/completion/i);
});
test.each([undefined, null, {}, { prompt_tokens: 9 }, { completion_tokens: null }])('missing usage is not a measured zero: %j', usage => {
    expect(normalize(response(null, [call('{}')], usage)).toolCalls).toHaveLength(1);
});
test.each(['', '{bad', 'null', '[]', '1', '"text"'])('unparseable/non-object arguments %j are rejected before dispatch', args => {
    expect(() => normalize(response(null, [call(args)]))).toThrow(/argument/i);
});
test('required tool call missing fails; auto text and tool-only responses remain valid', async () => {
    await expect(generateTask({ tools, toolChoice: 'required', promptMode: 'task', stream: false },
        { _injected: injected(async () => response('prose instead', [])) })).rejects.toMatchObject({ code: 'tool_call_missing' });
    expect(normalize(response('normal prose', []), { toolChoice: 'auto' }).assistantText).toBe('normal prose');
    expect(normalize(response()).toolCalls).toHaveLength(1);
});

test.each([
    ['timeout', () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); }],
    ['network', () => { throw new TypeError('Failed to fetch'); }],
    ['429', () => { throw Object.assign(new Error('provider unavailable'), { status: 429 }); }],
    ['500', () => { throw Object.assign(new Error('provider unavailable'), { status: 500 }); }],
    ['503', () => { throw Object.assign(new Error('provider unavailable'), { status: 503 }); }],
    ['empty', () => response('  ', [])],
    ['zero tokens', () => response(null, [call('{}')], { completion_tokens: 0 })],
    ['missing tool', () => response('prose instead', [])],
    ['bad arguments', () => response(null, [call('{bad')])],
    ['non-object arguments', () => response(null, [call('null')])],
])('%s enters bounded retry and observers receive only the valid response', async (_label, fail) => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const sender = jest.fn().mockImplementationOnce(fail).mockResolvedValue(response());
    const context = { generateTask: opts => generateTask({ ...opts, stream: false }, { _injected: injected(sender) }) };
    const onToolCall = jest.fn();
    const result = await requestToolCallsWithRetry(context, { toolCallRetryMax: 1 }, { tools, onToolCall });
    expect(sender).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1); expect(onToolCall).toHaveBeenCalledTimes(1);
});

test('permissive schema never turns broken normalized arguments into an empty object', async () => {
    const context = { generateTask: async () => ({ toolCalls: [{ name: 'output', args: 'broken' }] }) };
    await expect(requestToolCallsWithRetry(context, {}, { tools })).rejects.toThrow(/argument/i);
});
test('optional tool-free whitespace is not successful content', async () => {
    const context = { generateTask: async () => ({ toolCalls: [], assistantText: '  ' }) };
    await expect(requestToolCallsWithRetry(context, {}, { tools, allowNoToolCalls: true })).rejects.toThrow();
});
test('single-tool retries missing calls and stops at the configured budget', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const sender = jest.fn(async () => response('no tool', []));
    const context = { generateTask: opts => generateTask({ ...opts, stream: false }, { _injected: injected(sender) }) };
    await expect(requestToolCallWithRetry(context, { toolCallRetryMax: 1 }, { functionName: 'output' })).rejects.toThrow();
    expect(sender).toHaveBeenCalledTimes(2);
});
test('caller cancellation never retries; timeout is distinct from caller abort', async () => {
    const controller = new AbortController(); controller.abort();
    const generate = jest.fn();
    await expect(requestToolCallsWithRetry({ generateTask: generate }, { toolCallRetryMax: 2 }, { tools, abortSignal: controller.signal })).rejects.toThrow();
    expect(generate).not.toHaveBeenCalled();
    expect(isAbortError(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))).toBe(false);
    expect(isAbortError(new DOMException('timeout', 'TimeoutError'), controller.signal)).toBe(true);
});
test.each([
    ['empty', { text: ' ', toolCalls: [] }],
    ['zero', { text: 'ok', toolCalls: [], state: { usage: { completion_tokens: 0 } } }],
    ['missing', { text: 'no tool', toolCalls: [] }],
    ['bad args', { text: '', toolCalls: [[call('null')]] }],
])('stream terminal applies the same %s validation', async (_label, frame) => {
    const sender = async () => async function* () { yield frame; };
    const { result } = generateTaskStream({ tools, toolChoice: 'required', promptMode: 'task' }, { _injected: injected(sender) });
    await expect(result).rejects.toThrow();
});
