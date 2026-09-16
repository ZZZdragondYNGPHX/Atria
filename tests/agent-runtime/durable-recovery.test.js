import { test, expect } from '@jest/globals';
import { AgentRuntime, AgentRegistry, DurableCheckpointStore } from '../../public/scripts/lib/agent-runtime/index.js';
import { fakePorts, deferred } from './fakes.js';

const registry = new AgentRegistry([{ id: 'a', tools: ['lookup'], handoffs: ['b'] }, { id: 'b' }]);
const command = { runId: 'durable', agentId: 'a', task: 'recover' };
const clone = value => structuredClone(value);
function backend(seed = null) {
    let disk = seed && clone(seed);
    const snapshots = [];
    return {
        snapshots, fail: null,
        async load() { return disk && clone(disk); },
        async compareAndSet(state, expected) {
            if ((disk?.checkpointVersion ?? 0) !== expected) throw new Error('Checkpoint conflict');
            if (this.fail?.(state)) throw new Error('Simulated disk failure');
            disk = clone(state);
            snapshots.push(clone(state));
        },
    };
}
async function setup(disk, decisions) {
    const fake = fakePorts(decisions);
    const store = await DurableCheckpointStore.open({ backend: disk, runId: command.runId });
    const runtime = new AgentRuntime({ registry, ports: fake.ports, store, countTokens: m => m.content.length });
    return { fake, store, runtime };
}
async function recorded(decisions) {
    const disk = backend();
    const run = await setup(disk, decisions);
    await run.runtime.startRun(command);
    return disk.snapshots;
}

test('durable barriers precede model/tool calls and final output; Memory OS text is absent', async () => {
    const disk = backend();
    const { fake, runtime } = await setup(disk, [{ type: 'tool', toolName: 'lookup' }, { type: 'complete' }]);
    const execute = fake.ports.tool.execute;
    fake.ports.tool.execute = async request => {
        expect((await disk.load()).pendingEffect.effectId).toBe(request.effectId);
        return execute(request);
    };
    const result = await runtime.startRun(command);
    expect((await disk.load()).checkpointVersion).toBe(result.checkpointVersion);
    expect(JSON.stringify(await disk.load())).not.toContain('private-recall-text');
});

test('all persisted model and memory boundaries resume with original effect IDs', async () => {
    const snapshots = await recorded([{ type: 'complete', output: 'saved' }]);
    for (const snapshot of snapshots) {
        const { runtime, fake } = await setup(backend(snapshot), [{ type: 'complete', output: 'recovered' }]);
        const result = await runtime.resumeRun(command.runId);
        expect(result.status).toBe('completed');
        if (fake.calls.model.length) expect(fake.calls.model[0].effectId).toBe('durable/effect/2');
        if (snapshot.completedEffects['durable/effect/2']) expect(fake.calls.model).toHaveLength(0);
    }
});

test('receipt committed before crash is consumed once without repeating a write', async () => {
    const disk = backend();
    let writes = 0;
    const first = await setup(disk, [{ type: 'tool', toolName: 'lookup' }]);
    first.fake.ports.tool.execute = async () => { writes++; return { ok: true, value: 'receipt' }; };
    disk.fail = state => Object.values(state.completedEffects).some(receipt => receipt.result?.value === 'receipt' && receipt.consumed);
    await expect(first.runtime.startRun(command)).rejects.toThrow('persistence failed');
    const saved = await disk.load();
    expect(saved.completedEffects[saved.pendingEffect.effectId].consumed).toBe(false);
    disk.fail = null;
    const next = await setup(disk, [{ type: 'complete' }]);
    expect((await next.runtime.resumeRun(command.runId)).status).toBe('completed');
    expect(writes).toBe(1);
    expect(next.fake.calls.tool).toHaveLength(0);
});

test.each(['unknown', 'completed', 'retryable'])('uncertain tool requires explicit reconciliation: %s', async resolution => {
    const snapshots = await recorded([{ type: 'tool', toolName: 'lookup' }, { type: 'complete' }]);
    const snapshot = snapshots.find(state => state.pendingEffect?.type === 'tool.execute' && !state.completedEffects[state.pendingEffect.effectId]);
    const { runtime, fake } = await setup(backend(snapshot), [{ type: 'complete' }]);
    let identity;
    fake.ports.tool.reconcile = async request => {
        identity = request.toolCallId;
        return { status: resolution, result: { ok: true, value: 'existing' } };
    };
    const result = await runtime.resumeRun(command.runId);
    expect(identity).toBe(snapshot.pendingEffect.effectId);
    expect(result.status).toBe(resolution === 'unknown' ? 'failed' : 'completed');
    expect(fake.calls.tool).toHaveLength(resolution === 'retryable' ? 1 : 0);
    if (fake.calls.tool.length) expect(fake.calls.tool[0].toolCallId).toBe(identity);
});

test('handoff crash windows preserve one handoff and discard source scratch', async () => {
    const snapshots = await recorded([{ type: 'handoff', toAgentId: 'b', task: 'target', reason: 'expert', contextPolicy: 'task_only' }, { type: 'complete' }]);
    for (const snapshot of snapshots.filter(state => state.pendingEffect?.type === 'agent.handoff')) {
        const { runtime, fake } = await setup(backend(snapshot), [{ type: 'complete' }]);
        const result = await runtime.resumeRun(command.runId);
        expect(result.handoffStack).toHaveLength(1);
        expect(result.handoffStack[0].handoffId).toBe(snapshot.pendingEffect.effectId);
        expect(fake.calls.model[0].agent.id).toBe('b');
        expect(result.scratch).toEqual([]);
    }
});

test('fresh Memory OS guard is required after restoration', async () => {
    const snapshots = await recorded([{ type: 'complete' }]);
    const snapshot = snapshots.find(state => state.pendingEffect?.type === 'model.request');
    const { runtime, fake } = await setup(backend(snapshot), [{ type: 'complete' }]);
    fake.invalidate();
    expect((await runtime.resumeRun(command.runId)).status).toBe('failed');
    expect(fake.calls.model).toHaveLength(0);
});

test('CAS excludes a second independent driver before it reaches any port', async () => {
    const disk = backend();
    const one = await setup(disk), two = await setup(disk);
    const results = await Promise.allSettled([one.runtime.startRun(command), two.runtime.startRun(command)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected').reason.message).toMatch(/conflict/);
    expect(one.fake.calls.model.length + two.fake.calls.model.length).toBe(1);
});

test('disk failure at a model boundary cannot release a tool or a completed output', async () => {
    const disk = backend();
    const { runtime, fake } = await setup(disk, [{ type: 'tool', toolName: 'lookup' }]);
    disk.fail = state => state.pendingEffect?.type === 'tool.execute';
    await expect(runtime.startRun(command)).rejects.toThrow('persistence failed');
    expect(fake.calls.tool).toHaveLength(0);
});

test('cancellation during a durable barrier prevents model release and persists terminal state', async () => {
    const disk = backend(), blocked = deferred(), entered = deferred();
    const persist = disk.compareAndSet.bind(disk);
    disk.compareAndSet = async (state, version) => {
        if (version === 0) { entered.resolve(); await blocked.promise; }
        return persist(state, version);
    };
    const { runtime, fake } = await setup(disk);
    const running = runtime.startRun(command);
    await entered.promise;
    runtime.cancelRun(command.runId);
    blocked.resolve();
    expect((await running).status).toBe('cancelled');
    expect((await disk.load()).status).toBe('cancelled');
    expect(fake.calls.model).toHaveLength(0);
});

test('crash after cancelling checkpoint completes cancellation instead of resuming work', async () => {
    const snapshots = await recorded([{ type: 'complete' }]);
    const snapshot = { ...snapshots[0], status: 'cancelling', pendingEffect: null, generation: 2 };
    const { runtime, fake } = await setup(backend(snapshot));
    expect((await runtime.resumeRun(command.runId)).status).toBe('cancelled');
    expect(fake.calls.memory).toHaveLength(0);
});

test('legacy continuation loss persists a failure without invoking policy or tool', async () => {
    const snapshots = await recorded([{ type: 'complete' }]);
    const snapshot = { ...snapshots[0], legacyPolicy: true };
    const disk = backend(snapshot);
    const { runtime, fake } = await setup(disk);
    expect((await runtime.resumeRun(command.runId)).error).toMatch(/continuation unavailable/);
    expect((await disk.load()).status).toBe('failed');
    expect(fake.calls.memory).toHaveLength(0);
    expect(fake.calls.tool).toHaveLength(0);
});

test('unsupported durable schema cannot silently create a new run', async () => {
    const snapshots = await recorded([{ type: 'complete' }]);
    await expect(setup(backend({ ...snapshots[0], schemaVersion: 99 }))).rejects.toThrow('unsupported');
});

test('a restored model receipt cannot release a tool based on removed Memory OS sources', async () => {
    const snapshots = await recorded([{ type: 'tool', toolName: 'lookup' }, { type: 'complete' }]);
    const snapshot = snapshots.find(state => state.pendingEffect?.type === 'model.request' && state.completedEffects[state.pendingEffect.effectId]);
    const { runtime, fake } = await setup(backend(snapshot));
    fake.ports.memory.recall = async () => ({ references: [], assertCurrent() {} });
    expect((await runtime.resumeRun(command.runId)).error).toMatch(/references changed/);
    expect(fake.calls.tool).toHaveLength(0);
});

test('cancel during reconciliation cannot execute a retryable write', async () => {
    const snapshots = await recorded([{ type: 'tool', toolName: 'lookup' }, { type: 'complete' }]);
    const snapshot = snapshots.find(state => state.pendingEffect?.type === 'tool.execute' && !state.completedEffects[state.pendingEffect.effectId]);
    const { runtime, fake } = await setup(backend(snapshot));
    const entered = deferred(), result = deferred();
    fake.ports.tool.reconcile = async () => { entered.resolve(); return result.promise; };
    const resumed = runtime.resumeRun(command.runId);
    await entered.promise;
    runtime.cancelRun(command.runId);
    result.resolve({ status: 'retryable' });
    expect((await resumed).status).toBe('cancelled');
    expect(fake.calls.tool).toHaveLength(0);
});

test('memory invalidation at tool admission cannot release the write', async () => {
    const { runtime, fake } = await setup(backend(), [{ type: 'tool', toolName: 'lookup' }]);
    runtime.events.subscribe(event => { if (event.type === 'tool.execute.started') fake.invalidate(); });
    expect((await runtime.startRun(command)).error).toBe('Stale memory');
    expect(fake.calls.tool).toHaveLength(0);
});
