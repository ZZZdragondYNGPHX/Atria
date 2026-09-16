import { test, expect } from '@jest/globals';
import { runLegacySingleRequest } from '../../public/scripts/extensions/orchestrator/legacy-runtime-adapter.js';
import { deferred } from './fakes.js';

test('Single adapter preserves legacy input, output, schema and routing fields', async () => {
    const messages = [{ role: 'system', content: 'user custom system' }, { role: 'user', content: 'notes + skill + task' }];
    const request = { taskMessages: messages, apiPresetName: 'private-api', llmPresetName: 'card-first', tools: [{ function: { name: 'luker_orch_final_guidance' } }], runtimeWorldInfo: { before: 'memory' } };
    const response = { toolCalls: [{ name: 'luker_orch_final_guidance', args: { text: 'guidance' } }], assistantText: 'text', reasoning: 'reason' };
    let observed;
    const result = await runLegacySingleRequest({ runId: 'single-1', request, send: async input => { observed = input; return response; } });
    expect(result).toEqual(response);
    expect({ ...observed, abortSignal: undefined }).toEqual(request);
    expect(messages).toEqual(request.taskMessages);
});

test('Single adapter preserves errors and cancellation unwinds uncooperative sender', async () => {
    const request = { taskMessages: [{ role: 'user', content: 'test' }] };
    await expect(runLegacySingleRequest({ runId: 'failure', request, send: async () => { throw new Error('old failure'); } })).rejects.toThrow('old failure');
    const pending = deferred(), controller = new AbortController();
    const running = runLegacySingleRequest({ runId: 'cancel', request: { ...request, abortSignal: controller.signal }, send: () => pending.promise });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    controller.abort();
    await expect(running).rejects.toMatchObject({ name: 'AbortError' });
    pending.resolve({ toolCalls: [] });
});
