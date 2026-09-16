import { test, expect } from '@jest/globals';
import { compileContext, compileContextAsync, AgentRuntime, AgentRegistry } from '../../public/scripts/lib/agent-runtime/index.js';
import { createMemoryOSPort, createHostTokenCounter } from '../../public/scripts/lib/agent-runtime/host-ports.js';
import { fakePorts, deferred } from './fakes.js';
import { runLegacySingleRequest } from '../../public/scripts/extensions/orchestrator/legacy-runtime-adapter.js';

const input = { agent: { instructions: 'agent' }, state: { task: 'task', scratch: [] }, memory: { content: 'memory' }, budget: 300 };
const measure = message => JSON.stringify(message).length;

test('async and sync compiler share budgets, tool reservation, ordering and truncation', async () => {
    const options = { ...input, tools: [{ name: 'lookup' }] };
    const result = await compileContextAsync({ ...options, countTokens: async m => measure(m) });
    expect(result).toEqual(compileContext({ ...options, countTokens: measure }));
    expect(result.tokens).toBeLessThanOrEqual(options.budget);
    expect(result.diagnostics[0].source).toBe('tools');
    expect(result.messages[0].content).toContain('[invariants]');
});

test('legacy budgets include tools and reject overflow without changing tool-call pairs', async () => {
    const legacyMessages = [{ role: 'assistant', tool_calls: [{ id: 'vendor', function: { name: 'x', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'vendor', content: 'result' }];
    const options = { ...input, legacyMessages, tools: [{ name: 'x' }], countTokens: async () => 10, budget: 30 };
    expect((await compileContextAsync(options)).messages).toEqual(legacyMessages);
    await expect(compileContextAsync({ ...options, budget: 29 })).rejects.toThrow('exceeds budget');
    await expect(compileContextAsync({ ...options, countTokens: async () => NaN })).rejects.toThrow('Invalid token count');
});

test('host tokenizer measures complete envelopes and retains its host receiver', async () => {
    const host = { marker: true, async getTokenCountAsync(text) { expect(this.marker).toBe(true); expect(text).toContain('tool_calls'); return 3.2; } };
    expect(await createHostTokenCounter(host)({ tool_calls: [{ id: 'x' }] })).toBe(4);
    expect(await createHostTokenCounter({})({ content: '汉' })).toBe(new TextEncoder().encode(JSON.stringify({ content: '汉' })).length);
});

test('Memory OS port preserves source guards and keeps only source IDs as references', async () => {
    let current = true, observed;
    const port = createMemoryOSPort(async (query, options) => {
        observed = { query, options };
        return { text: 'private-source-content', selected: ['fact-1'], tokenCount: 8, budget: 20,
            assertCurrent() { if (!current) throw new Error('source changed'); } };
    });
    const result = await port.recall({ query: 'question', at: 7, context: { scratch: 'private-agent-thought' } });
    expect(observed).toMatchObject({ query: 'question', options: { at: 7 } });
    expect(JSON.stringify(observed)).not.toContain('private-agent-thought');
    expect(result.references).toEqual([{ id: 'fact-1' }]);
    expect(result.content).toBe('private-source-content');
    current = false;
    expect(result.assertCurrent).toThrow('source changed');
    await expect(port.recall({ query: 'again' })).rejects.toThrow('source changed');
});

test.each(['cancel', 'source-change'])('async tokenizer boundary blocks dispatch after %s', async action => {
    const fake = fakePorts(), started = deferred(), pending = deferred();
    const runtime = new AgentRuntime({ registry: new AgentRegistry([{ id: 'agent' }]), ports: fake.ports,
        countTokens: async () => { started.resolve(); await pending.promise; return 1; } });
    const running = runtime.startRun({ runId: action, agentId: 'agent', task: 'task' });
    await started.promise;
    if (action === 'cancel') runtime.cancelRun(action); else fake.invalidate();
    pending.resolve();
    expect((await running).status).toBe(action === 'cancel' ? 'cancelled' : 'failed');
    expect(fake.calls.model).toHaveLength(0);
});

test('production compatibility path measures schemas and fails before send on explicit budget overflow', async () => {
    const measured = [], events = [];
    let sends = 0;
    const request = { taskMessages: [{ role: 'user', content: 'task' }], tools: [{ function: { name: 'final' } }] };
    const options = { request, contextBudget: 20, hostContext: { async getTokenCountAsync(text) { measured.push(text); return 10; } },
        onEvent: event => events.push(event), send: async () => { sends++; return 'done'; } };
    expect(await runLegacySingleRequest({ ...options, runId: 'host-count' })).toBe('done');
    expect(measured.some(text => text.includes('"tools"'))).toBe(true);
    expect(events.find(event => event.type === 'context.compiled')).toMatchObject({ tokens: 20, tokenCounting: 'host-tokenizer', budgetScope: 'task-messages-and-tools' });
    await expect(runLegacySingleRequest({ ...options, contextBudget: 19, runId: 'overflow' })).rejects.toThrow('exceeds budget');
    expect(sends).toBe(1);
});

test('Memory OS text is transient across real Runtime receipt boundaries', async () => {
    const fake = fakePorts();
    fake.ports.memory = createMemoryOSPort(async () => ({ text: 'secret-source-text', selected: ['source-1'], assertCurrent() {} }));
    const runtime = new AgentRuntime({ registry: new AgentRegistry([{ id: 'a' }]), ports: fake.ports, countTokens: measure });
    const result = await runtime.startRun({ runId: 'memory-port', agentId: 'a', task: 'question' });
    expect(result.status).toBe('completed');
    expect(JSON.stringify(fake.calls.model[0].messages)).toContain('secret-source-text');
    expect(result.memoryRefs).toEqual([{ id: 'source-1' }]);
    expect(JSON.stringify(runtime.getState('memory-port'))).not.toContain('secret-source-text');
});
