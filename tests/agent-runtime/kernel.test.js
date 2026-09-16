import { test, expect } from '@jest/globals';
import { AgentRuntime, AgentRegistry, MemoryCheckpointStore, initialState, transition, compileContext } from '../../public/scripts/lib/agent-runtime/index.js';
import { fakePorts, deferred } from './fakes.js';

const definitions = [{ id: 'a', instructions: 'agent-a', tools: ['lookup'], handoffs: ['b'] }, { id: 'b', instructions: 'agent-b' }];
function setup(decisions, store = new MemoryCheckpointStore()) {
    const fake = fakePorts(decisions);
    const runtime = new AgentRuntime({ registry: new AgentRegistry(definitions), ports: fake.ports, store, countTokens: message => message.content.length });
    const events = [];
    runtime.events.subscribe(event => events.push(event));
    return { runtime, fake, events, store };
}
const command = { runId: 'r', agentId: 'a', task: 'test' };
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };

test('headless start/complete and stable identities without memory-content persistence', async () => {
    const { runtime, fake, store } = setup();
    const state = await runtime.startRun(command);
    expect(state.status).toBe('completed');
    expect(fake.calls.model[0].stepId).toBe('r/step/1');
    expect(fake.calls.model[0].effectId).toBe('r/effect/2');
    expect(JSON.stringify(store.load('r'))).not.toContain('private-recall-text');
    expect(() => runtime.startRun(command)).toThrow('already exists');
});

test('single agent multiple steps and tool envelopes', async () => {
    const { runtime, fake } = setup([{ type: 'tool', toolName: 'lookup', args: { q: 1 } }, { type: 'continue', output: 'next' }, { type: 'complete', output: 'ok' }]);
    const state = await runtime.startRun(command);
    expect(state.step).toBe(3);
    expect(state.output).toBe('ok');
    expect(fake.calls.tool).toHaveLength(1);
    expect(fake.calls.tool[0].toolCallId).toBe(fake.calls.tool[0].effectId);
    expect(state.scratch[0].result.ok).toBe(true);
});

test('structured allowed handoff changes agent and enforces task-only context', async () => {
    const { runtime, fake } = setup([{ type: 'continue', output: 'scratch' }, { type: 'handoff', toAgentId: 'b', reason: 'expert', task: 'inspect', payload: { x: 1 }, contextPolicy: 'task_only' }, { type: 'complete' }]);
    const state = await runtime.startRun(command);
    expect(state.currentAgentId).toBe('b');
    expect(state.scratch).toEqual([]);
    expect(state.handoffStack[0].handoffId).toMatch(/^r\/effect\//);
    expect(fake.calls.model[2].agent.id).toBe('b');
});

test.each([
    { type: 'tool', toolName: 'write_secret' },
    { type: 'handoff', toAgentId: 'unknown', task: 'x', reason: 'x', contextPolicy: 'task_only' },
    { type: 'handoff', toAgentId: 'b', task: 'x', reason: 'x', contextPolicy: 'arbitrary' },
    { type: 'invented' },
])('invalid model decision fails without side effects: %j', async decision => {
    const { runtime, fake } = setup([decision]);
    expect((await runtime.startRun(command)).status).toBe('failed');
    expect(fake.calls.tool).toHaveLength(0);
});

test('model throw and exhausted step budget fail explicitly', async () => {
    const one = setup([() => { throw new Error('offline'); }]);
    expect((await one.runtime.startRun(command)).error).toBe('offline');
    const two = setup([{ type: 'continue' }]);
    expect((await two.runtime.startRun({ ...command, maxSteps: 1 })).error).toMatch(/budget/);
});

test('cancel is reentrant; stale model completion cannot release a tool', async () => {
    const pending = deferred();
    const { runtime, fake, events } = setup([() => pending.promise]);
    const running = runtime.startRun(command);
    await flush();
    runtime.cancelRun('r');
    runtime.cancelRun('r');
    pending.resolve({ type: 'tool', toolName: 'lookup' });
    expect((await running).status).toBe('cancelled');
    expect(fake.calls.tool).toHaveLength(0);
    expect(events.filter(e => e.type === 'run.cancelled')).toHaveLength(1);
});

test('stale tool completion cannot start a second model step', async () => {
    const pending = deferred();
    const { runtime, fake } = setup([{ type: 'tool', toolName: 'lookup' }]);
    fake.ports.tool.execute = () => pending.promise;
    const running = runtime.startRun(command);
    await flush();
    expect(runtime.getState('r').status).toBe('waiting_tool');
    runtime.cancelRun('r');
    pending.resolve({ ok: true, value: 'late' });
    expect((await running).scratch).toEqual([]);
    expect(fake.calls.model).toHaveLength(1);
});

test('waiting user resumes same run with a new stable step', async () => {
    const { runtime } = setup([{ type: 'wait' }, { type: 'complete' }]);
    expect((await runtime.startRun(command)).status).toBe('waiting_user');
    const resumed = await runtime.appendUserInput('r', 'answer');
    expect(resumed.status).toBe('completed');
    expect(resumed.stepId).toBe('r/step/2');
});

test('memory invalidation after asynchronous model response rejects its decision', async () => {
    const pending = deferred();
    const { runtime, fake } = setup([() => pending.promise]);
    const running = runtime.startRun(command);
    await flush();
    fake.invalidate();
    pending.resolve({ type: 'complete' });
    expect((await running).error).toBe('Stale memory');
});

test('pure invalid transitions and CAS protect newer checkpoints', () => {
    const idle = initialState(command);
    expect(() => transition(idle, { type: 'appendUserInput' })).toThrow('Invalid');
    expect(idle.status).toBe('idle');
    const store = new MemoryCheckpointStore();
    store.save({ ...idle, checkpointVersion: 1 }, 0);
    expect(() => store.save({ ...idle, checkpointVersion: 1 }, 0)).toThrow('conflict');
});

test('registry copies definitions and observers cannot corrupt execution', async () => {
    const registry = new AgentRegistry(definitions);
    registry.get('a').tools.push('bad');
    expect(registry.get('a').tools).toEqual(['lookup']);
    const { runtime } = setup();
    runtime.events.subscribe(() => { throw new Error('broken UI'); });
    expect((await runtime.startRun(command)).status).toBe('completed');
});

test('compiler preserves layer order, deduplicates and obeys injected budget', () => {
    const compiled = compileContext({ agent: { instructions: 'hello' }, state: { task: 'x', scratch: [] }, memory: { content: 'hello' }, countTokens: m => m.content.length, budget: 220 });
    expect(compiled.tokens).toBeLessThanOrEqual(220);
    expect(compiled.messages[0].content).toMatch(/^\[invariants\]/);
    expect(compiled.messages.filter(m => m.content.includes('hello'))).toHaveLength(1);
});

test('trace excludes prompts, results, tool arguments and configuration', async () => {
    const { runtime, events } = setup([{ type: 'complete', output: 'sensitive' }]);
    await runtime.startRun(command);
    expect(JSON.stringify(events)).not.toMatch(/sensitive|private-recall-text|agent-a/);
});

test('fresh memory is recalled on a restored model boundary', async () => {
    const { runtime, store, fake } = setup();
    let state = transition(initialState(command), { type: 'startRun' });
    state.completedEffects[state.pendingEffect.effectId] = { result: { references: ['old'] }, consumed: false };
    state = transition(state, { type: 'effect.consumed', effectId: state.pendingEffect.effectId });
    store.save({ ...state, checkpointVersion: 1 }, 0);
    expect((await runtime.resumeRun('r')).status).toBe('completed');
    expect(fake.calls.memory).toHaveLength(1);
});

test('completed tool receipt is consumed once without replay; uncertain tool fails closed', async () => {
    for (const completed of [true, false]) {
        const { runtime, store, fake } = setup();
        const state = initialState(command);
        state.status = 'waiting_tool';
        state.pendingEffect = { runId: 'r', stepId: 'r/step/1', effectId: 'r/effect/3', type: 'tool.execute', toolName: 'lookup' };
        state.step = 1; state.effectSequence = 3;
        if (completed) state.completedEffects['r/effect/3'] = { result: { ok: true, value: 'already done' }, consumed: false };
        store.save({ ...state, checkpointVersion: 1 }, 0);
        const result = await runtime.resumeRun('r');
        expect(result.status).toBe(completed ? 'completed' : 'failed');
        expect(fake.calls.tool).toHaveLength(0);
    }
});
