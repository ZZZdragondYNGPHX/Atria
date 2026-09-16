import { test, expect } from '@jest/globals';
import { AgentRuntime, AgentRegistry, MemoryCheckpointStore } from '../../public/scripts/lib/agent-runtime/index.js';
import { fakePorts, deferred } from './fakes.js';

const command = { runId: 'batch', agentId: 'a', task: 'x' };
const batch = { type: 'tools', turn: { role: 'assistant', content: 'use two' }, calls: [
    { toolName: 'lookup', args: { n: 1 }, providerCallId: 'vendor-1' },
    { toolName: 'lookup', args: { n: 2 }, providerCallId: 'vendor-2' },
] };
function setup(store = new MemoryCheckpointStore()) {
    const fake = fakePorts([batch, { type: 'complete', output: 'done' }]);
    const runtime = new AgentRuntime({ registry: new AgentRegistry([{ id: 'a', tools: ['lookup'] }]), ports: fake.ports, store, countTokens: m => m.content.length });
    return { fake, runtime, store };
}

test('serial batch awaits each effect, uses one model step and retains vendor IDs separately', async () => {
    const { fake, runtime } = setup();
    const started = deferred(), first = deferred();
    const calls = [];
    fake.ports.tool.execute = async effect => {
        calls.push(effect);
        if (calls.length === 1) { started.resolve(); await first.promise; }
        return { ok: true, value: effect.args.n };
    };
    const running = runtime.startRun(command);
    await started.promise;
    expect(calls).toHaveLength(1);
    first.resolve();
    const state = await running;
    expect(state.status).toBe('completed');
    expect(state.step).toBe(2);
    expect(calls.map(c => c.effectId)).toEqual(['batch/effect/3', 'batch/effect/4']);
    expect(calls.map(c => c.stepId)).toEqual(['batch/step/1', 'batch/step/1']);
    expect(state.scratch.filter(s => s.toolCallId).map(s => s.providerCallId)).toEqual(['vendor-1', 'vendor-2']);
});

test('cancel between tools clears pending queue and prevents the next model', async () => {
    const { fake, runtime } = setup();
    runtime.events.subscribe(e => { if (e.type === 'tool.execute.completed') runtime.cancelRun('batch'); });
    const state = await runtime.startRun(command);
    expect(state.status).toBe('cancelled');
    expect(state.pendingTools).toEqual([]);
    expect(fake.calls.tool).toHaveLength(1);
    expect(fake.calls.model).toHaveLength(1);
});

test('invalid batch is rejected before any member executes', async () => {
    const { fake, runtime } = setup();
    fake.ports.model.request = async () => ({ type: 'tools', calls: [batch.calls[0], { toolName: 'forbidden' }] });
    expect((await runtime.startRun(command)).status).toBe('failed');
    expect(fake.calls.tool).toHaveLength(0);
});

test('resume consumes completed first-tool receipt without replaying it', async () => {
    class InterruptedStore extends MemoryCheckpointStore {
        save(state, version) {
            super.save(state, version);
            if (state.completedEffects['batch/effect/3']?.consumed === false && !this.interrupted) {
                this.interrupted = true;
                throw new Error('Simulated crash after receipt');
            }
        }
    }
    const store = new InterruptedStore();
    const first = setup(store);
    await first.runtime.startRun(command);
    expect(first.fake.calls.tool).toHaveLength(1);
    const second = setup(store);
    second.fake.ports.model.request = async () => ({ type: 'complete' });
    const resumed = await second.runtime.resumeRun('batch');
    expect(resumed.status).toBe('completed');
    expect(second.fake.calls.tool.map(call => call.args.n)).toEqual([2]);
    expect(resumed.completedEffects['batch/effect/3'].consumed).toBe(true);
});

test('cancel during asynchronous context preparation cannot send a model request', async () => {
    const { fake, runtime } = setup();
    const started = deferred(), pending = deferred();
    runtime.contextInput = async () => { started.resolve(); await pending.promise; return {}; };
    const running = runtime.startRun(command);
    await started.promise;
    runtime.cancelRun('batch');
    pending.resolve();
    expect((await running).status).toBe('cancelled');
    expect(fake.calls.model).toHaveLength(0);
});

test('observer cancellation after compilation prevents dispatch', async () => {
    const { fake, runtime } = setup();
    runtime.events.subscribe(e => { if (e.type === 'context.compiled') runtime.cancelRun('batch'); });
    expect((await runtime.startRun(command)).status).toBe('cancelled');
    expect(fake.calls.model).toHaveLength(0);
});
