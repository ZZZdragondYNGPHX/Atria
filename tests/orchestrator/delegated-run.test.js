import { expect, test, jest } from '@jest/globals';
import { createDelegatedRunApi } from '../../public/scripts/agents/orchestrator/delegated-run.js';
import { CAPABILITIES } from '../../public/scripts/lib/orchestration-engine/capabilities.js';

const caps = Object.fromEntries(CAPABILITIES.map(key => [key, true]));
const preset = () => ({ schemaVersion: 1, id: 'a', name: 'A', mode: 'loop', planTemplate: {
    schemaVersion: 1, planId: 'p', source: { mode: 'loop' }, agents: [{ id: 'owner', tools: ['memory_node_edit', 'memory_node_delete', 'search_visit'], capabilities: caps }],
    nodes: [{ nodeId: 'owner', agentId: 'owner', kind: 'agent', capabilities: caps }], edges: [], entryNodeId: 'owner', capabilities: caps,
    budgets: { maxSteps: 20, maxTasks: 10, maxConcurrency: 2 }, arbitration: { kind: 'pass-through' },
    output: { kind: 'guidance', ownerNodeId: 'owner', submitCapability: 'result.submit' },
} });
function fixture(generate) {
    let scope = { sessionId: 's', revisionId: 'r' };
    const p = preset(), api = createDelegatedRunApi({ getPreset: () => p, getScope: () => scope, getContext: () => ({}), generate });
    const input = { presetId: 'a', nodeId: 'owner', runId: 'r', task: 'Test', maxSteps: 3, contextBudget: 12000, timeoutMs: 2000,
        expected: api.inspectDelegatedRun({ presetId: 'a', nodeId: 'owner' }),
        operations: [{ toolName: 'memory_node_edit', action: 'memory.node.edit', input: { exact: true } }] };
    return { api, input, p, set scope(v) { scope = v; } };
}
test('preset delete/web permissions cannot escape an exact edit-only delegation', async () => {
    for (const decision of [{ type: 'tool', toolName: 'memory_node_delete' }, { type: 'tool', toolName: 'search_visit' },
        { type: 'handoff', toAgentId: 'owner' }, { type: 'tool', toolName: 'operation_0', args: { injected: true } }]) {
        const f = fixture(async () => ({ decision })), execute = jest.fn();
        const result = await f.api.runDelegated(f.input, execute);
        expect(result.status).toBe('failed'); expect(result.denied.length).toBeGreaterThan(0); expect(execute).not.toHaveBeenCalled();
    }
});
test('selected Runtime executes once, records model/tool/Memory evidence and rejects replay', async () => {
    let calls = 0;
    const f = fixture(async () => ({ decision: ++calls < 3 ? { type: 'tool', toolName: 'operation_0', args: {} } : { type: 'complete', output: 'done' }, usage: { totalTokens: 12 } }));
    const execute = jest.fn(async () => ({ status: 'succeeded', receiptId: 'child' }));
    const result = await f.api.runDelegated(f.input, execute);
    expect(result.status).toBe('failed'); expect(execute).toHaveBeenCalledTimes(1); expect(result.toolCalls[0].receiptId).toBe('child');
    expect(result.memory).toHaveLength(1); expect(result.modelCalls).toHaveLength(2); expect(result.cost).toBeNull();
});
test('scope drift, product capability denial, cancellation and context budget fail closed', async () => {
    const f = fixture(async () => { f.scope = { sessionId: 'changed' }; return { decision: { type: 'tool', toolName: 'operation_0' } }; });
    const execute = jest.fn(); expect((await f.api.runDelegated(f.input, execute)).status).toBe('failed'); expect(execute).not.toHaveBeenCalled();
    const denied = fixture(async () => ({})); denied.p.planTemplate.nodes[0].capabilities = { ...caps, 'tool.call': false };
    denied.input.expected = denied.api.inspectDelegatedRun(denied.input);
    await expect(denied.api.runDelegated(denied.input, execute)).rejects.toThrow('denied');
    const bounded = fixture(async () => ({})); bounded.input.contextBudget = 256;
    expect((await bounded.api.runDelegated(bounded.input, execute)).status).toBe('failed');
    const cancelled = fixture(() => new Promise(() => {})); const pending = cancelled.api.runDelegated(cancelled.input, execute);
    await new Promise(resolve => setTimeout(resolve, 20)); cancelled.api.stopDelegatedRun('r');
    expect((await pending).status).toBe('cancelled');
});
test('completed delegated run reports output and no implicit tools or recall', async () => {
    const f = fixture(async () => ({ decision: { type: 'complete', output: 'done' } })); f.input.operations = [];
    const result = await f.api.runDelegated(f.input, jest.fn());
    expect(result.status).toBe('completed'); expect(result.output).toBe('done'); expect(result.memory).toEqual([]);
});
