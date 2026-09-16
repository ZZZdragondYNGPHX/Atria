import { test, expect } from '@jest/globals';
import { generateTask, generateTaskStream } from '../../public/scripts/generate-task.js';
import { resolvePreparedBudget } from '../../public/scripts/lib/agent-runtime/prepared-context.js';
import { deferred } from './fakes.js';

function setup(limit = 40, count = async () => 10) {
    const calls = [], counted = [];
    const senders = { getOpenAiRuntime: () => ({ oai_settings: { openai_max_context: 999, openai_max_tokens: 1 },
        openai_setting_names: { Private: 0 }, openai_settings: [{ openai_max_context: limit, openai_max_tokens: 10 }] }),
    sendOpenAIRequest: async (...args) => { calls.push(args); return { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }; } };
    return { calls, counted, senders, injected: {
        profileResolver: () => ({ requestApi: 'openai' }), senders,
        builder: ({ messages }) => [{ role: 'system', content: 'card + Memory OS + preset' }, ...messages],
        worldInfoResolver: async () => ({}),
        runtimeContext: { async getTokenCountAsync(text) { counted.push(text); return count(text); } },
    } };
}
const request = { runtimeContext: true, llmPresetName: 'Private', taskMessages: [{ role: 'user', content: 'task' }], tools: [{ type: 'function', function: { name: 'lookup' } }] };

test('final budget counts host-assembled context and tool schemas using the named preset', async () => {
    const fake = setup();
    const result = await generateTask(request, { _injected: fake.injected });
    expect(result.runtimeContext).toMatchObject({ budget: 30, tokens: 30, enforced: true, budgetScope: 'assembled-messages-and-tools' });
    expect(fake.counted.join()).toContain('card + Memory OS + preset');
    expect(fake.counted.join()).toContain('lookup');
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0][1]).toHaveLength(2);
    expect(fake.calls[0][3]).not.toHaveProperty('runtimeContext');
});

test.each([false, true])('over-budget assembled request never reaches sender (stream=%s)', async streaming => {
    const fake = setup(39);
    const run = streaming ? generateTaskStream(request, { _injected: fake.injected }).result : generateTask(request, { _injected: fake.injected });
    await expect(run).rejects.toMatchObject({ code: 'context_budget' });
    expect(fake.calls).toHaveLength(0);
});

test('ordinary editor/plugin requests retain existing assembly and budget behavior', async () => {
    const fake = setup(1);
    const result = await generateTask({ ...request, runtimeContext: false }, { _injected: fake.injected });
    expect(result).not.toHaveProperty('runtimeContext');
    expect(fake.counted).toHaveLength(0); expect(fake.calls).toHaveLength(1);
});

test('cancellation during final-context counting prevents actual sender dispatch', async () => {
    const started = deferred(), pending = deferred(), controller = new AbortController();
    const fake = setup(40, async () => { started.resolve(); await pending.promise; return 10; });
    const run = generateTask({ ...request, abortSignal: controller.signal }, { _injected: fake.injected });
    await started.promise; controller.abort(); pending.resolve();
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(fake.calls).toHaveLength(0);
});

test('unknown sender budget is explicit, and Kobold retains its native reservation', () => {
    expect(resolvePreparedBudget('novel', {}, '')).toBeNull();
    expect(resolvePreparedBudget('kobold', { getKoboldRuntime: () => ({ max_context: 1000, amount_gen: 200 }) }, '')).toBe(800);
});

test('Memory OS source change during final assembly counting rejects before sending', async () => {
    let fresh = true;
    const fake = setup(40, async () => { fresh = false; return 10; });
    await expect(generateTask({ ...request, runtimeContext: { assertMemoryCurrent() { if (!fresh) throw new Error('Memory source changed'); } } },
        { _injected: fake.injected })).rejects.toThrow('Memory source changed');
    expect(fake.calls).toHaveLength(0);
});
