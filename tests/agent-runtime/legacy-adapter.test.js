import { test, expect } from '@jest/globals';
import { runLegacySingleRequest } from '../../public/scripts/extensions/orchestrator/legacy-runtime-adapter.js';
import { deferred } from './fakes.js';
import { MemoryCheckpointStore } from '../../public/scripts/lib/agent-runtime/index.js';

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

test('legacy tool content reaches the next model but never enters checkpoint receipts', async () => {
    const store = new MemoryCheckpointStore();
    const replies = [{ toolCalls: [{ id: 'vendor', name: 'memory_recall', args: { query: 'x' } }] }, { toolCalls: [{ name: 'final', args: { text: 'done' } }] }];
    let messages;
    await runLegacySingleRequest({
        runId: 'memory-tool', store, request: { tools: [{ function: { name: 'memory_recall' } }] },
        send: async request => { messages = request.taskMessages; return replies.shift(); },
        worker: {
            nodeId: 'single', outputToolName: 'final', isFinalStage: true, enableLoopTools: true, maxRounds: 2,
            prepareRequest: async (_round, history) => ({ taskMessages: history }),
            execute: async () => 'private-memory-result', serialize: JSON.stringify,
            getSource: () => 'extension', onTurn: () => {}, isStructuredToolError: () => false,
        },
    });
    expect(JSON.stringify(messages)).toContain('private-memory-result');
    expect(JSON.stringify(store.load('memory-tool'))).not.toContain('private-memory-result');
    expect(store.load('memory-tool').scratch[1].result.value).toHaveProperty('transientToolResult');
});
