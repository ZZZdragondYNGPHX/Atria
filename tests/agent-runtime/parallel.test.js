import { test, expect } from '@jest/globals';
import { AgentRuntime, AgentRegistry, ParallelExecutor, createRuntimeBranchPort, MemoryCheckpointStore } from '../../public/scripts/lib/agent-runtime/index.js';
import { RuntimeProjection } from '../../public/scripts/lib/agent-runtime/projection.js';
import { deferred, fakePorts } from './fakes.js';

const branch = id => ({ id, toAgentId: 'b', reason: 'expert', task: id, contextPolicy: 'task_only' });
const plan = { type: 'fanout', branches: ['one', 'two', 'three'].map(branch), concurrency: 2, failurePolicy: 'settled' };
const until = async condition => { for (let n = 0; n < 100; n++) { if (condition()) return; await Promise.resolve(); } throw new Error('Expected boundary not reached'); };
function setup(executor, store) {
    const fake = fakePorts([plan, { type: 'complete', output: 'joined' }]);
    fake.ports.parallel = executor;
    const runtime = new AgentRuntime({ registry: new AgentRegistry([{ id: 'a', handoffs: ['b'] }, { id: 'b' }]),
        ports: fake.ports, store, countTokens: m => m.content.length });
    return { runtime, fake };
}
const start = runtime => runtime.startRun({ runId: 'parent', agentId: 'a', task: 'fork' });

test('dynamic groups share executor concurrency and cancelled queued groups never start', async () => {
    const gate = deferred(), entered = [];
    const executor = new ParallelExecutor({ async execute(request) { entered.push(request.id); await gate.promise; return request.id; } }, { maxConcurrency: 1 });
    const first = executor.run({ ...plan, effectId: 'one', branches: [branch('one')], signal: new AbortController().signal });
    await until(() => entered.length === 1);
    const abort = new AbortController();
    const second = executor.run({ ...plan, effectId: 'two', branches: [branch('two')], signal: abort.signal });
    const rejected = second.catch(error => error);
    abort.abort(); gate.resolve();
    await first;
    await expect(rejected).resolves.toMatchObject({ name: 'AbortError' });
    await executor.run({ ...plan, effectId: 'three', branches: [branch('three')], signal: new AbortController().signal });
    expect(entered).toEqual(['one', 'three']);
});

test('bounded fanout preserves input order despite out-of-order completion and records explicit join', async () => {
    const gates = new Map(), entered = [];
    let active = 0, peak = 0;
    const executor = new ParallelExecutor({ async execute(request) {
        entered.push(request.id); active++; peak = Math.max(active, peak);
        const gate = deferred(); gates.set(request.id, gate);
        await gate.promise; active--; return request.id;
    } });
    const { runtime } = setup(executor);
    const projection = new RuntimeProjection();
    runtime.events.subscribe(event => projection.append(event));
    const running = start(runtime);
    await until(() => entered.length === 2);
    expect(entered).toEqual(['one', 'two']);
    gates.get('two').resolve();
    await until(() => entered.length === 3);
    gates.get('three').resolve(); gates.get('one').resolve();
    const state = await running;
    expect(peak).toBe(2);
    expect(state.scratch[0].parallel.branches.map(item => item.value)).toEqual(['one', 'two', 'three']);
    expect(projection.snapshot().events.some(e => e.type === 'parallel.join.completed')).toBe(true);
    expect(state.status).toBe('completed');
});

test('cancel one queued branch under settled policy keeps siblings and releases no cancelled work', async () => {
    const entered = [], gate = deferred();
    const executor = new ParallelExecutor({ async execute(request) { entered.push(request.id); await gate.promise; return 'ok'; } });
    const { runtime, fake } = setup(executor);
    fake.ports.model.request = async request => request.step === 1 ? { ...plan, concurrency: 1 } : { type: 'complete' };
    const running = start(runtime);
    await until(() => entered.length === 1);
    expect(runtime.cancelBranch('parent', 'two')).toBe(true);
    gate.resolve();
    const state = await running;
    expect(entered).toEqual(['one', 'three']);
    expect(state.scratch[0].parallel.branches[1].status).toBe('cancelled');
    expect(runtime.cancelBranch('parent', 'one')).toBe(false);
});

test('fail-fast aborts stalled siblings, stops queued work, and prevents the post-join model', async () => {
    const failure = deferred(), entered = [];
    const executor = new ParallelExecutor({ async execute(request) {
        entered.push(request.id);
        if (request.id === 'one') { await failure.promise; throw new Error('branch failed'); }
        return new Promise(() => {});
    } });
    const { runtime, fake } = setup(executor);
    fake.ports.model.request = async () => ({ ...plan, failurePolicy: 'fail_fast' });
    const running = start(runtime);
    await until(() => entered.length === 2);
    failure.resolve();
    expect((await running).error).toBe('branch failed');
    expect(entered).toEqual(['one', 'two']);
});

test('parent cancellation settles uncooperative branches without subsequent model or join', async () => {
    const entered = [], gate = deferred();
    const executor = new ParallelExecutor({ execute: request => { entered.push(request.id); return gate.promise; } });
    const { runtime, fake } = setup(executor);
    const running = start(runtime);
    await until(() => entered.length === 2);
    runtime.cancelRun('parent');
    expect((await running).status).toBe('cancelled');
    gate.resolve('late');
    expect(fake.calls.model).toHaveLength(1);
    expect(entered).toHaveLength(2);
});

test.each([
    { concurrency: 0 }, { concurrency: 5 }, { failurePolicy: 'ignore' }, { branches: [branch('x'), branch('x')] },
    { branches: [{ ...branch('x'), toAgentId: 'unknown' }] }, { branches: [{ ...branch('x'), contextPolicy: 'all' }] },
])('invalid parallel topology fails before child execution: %j', async invalid => {
    let called = false;
    const { runtime, fake } = setup(new ParallelExecutor({ execute: () => { called = true; } }));
    fake.ports.model.request = async () => ({ ...plan, ...invalid });
    expect((await start(runtime)).status).toBe('failed');
    expect(called).toBe(false);
});

test('confirmed fanout/join receipts recover without invoking children again', async () => {
    const snapshots = [];
    class RecordingStore extends MemoryCheckpointStore {
        save(state, version) { super.save(state, version); snapshots.push(structuredClone(state)); }
    }
    const { runtime } = setup(new ParallelExecutor({ execute: async request => request.id }), new RecordingStore());
    await start(runtime);
    for (const snapshot of snapshots.filter(state => state.pendingEffect?.type === 'parallel.join'
        || (state.pendingEffect?.type === 'parallel.fanout' && state.completedEffects[state.pendingEffect.effectId]))) {
        let current = snapshot, children = 0;
        const store = { load: () => structuredClone(current), save: (state, expected) => {
            expect(current.checkpointVersion).toBe(expected); current = structuredClone(state);
        } };
        const restored = setup(new ParallelExecutor({ execute: () => { children++; } }), store);
        restored.fake.ports.model.request = async () => ({ type: 'complete' });
        expect((await restored.runtime.resumeRun('parent')).status).toBe('completed');
        expect(children).toBe(0);
    }
});

test('unconfirmed fanout calls only explicit resume and preserves branch identities', async () => {
    let current, saved;
    const gate = deferred();
    const store = { load: () => current && structuredClone(current), save: state => { current = structuredClone(state); } };
    const original = setup(new ParallelExecutor({ execute: () => gate.promise }), store);
    const running = start(original.runtime);
    await until(() => current?.pendingEffect?.type === 'parallel.fanout');
    saved = structuredClone(current);
    original.runtime.cancelRun('parent');
    await running;
    current = saved;
    const ids = [];
    const executor = new ParallelExecutor({
        execute() { throw new Error('Resume incorrectly executed a fresh branch'); },
        async resume(request) { ids.push(request.runId); return request.id; },
    });
    const restored = setup(executor, store);
    restored.fake.ports.model.request = async () => ({ type: 'complete' });
    expect((await restored.runtime.resumeRun('parent')).status).toBe('completed');
    expect(ids).toEqual(plan.branches.map(branch => `${saved.pendingEffect.effectId}/branch/${branch.id}`));
    gate.resolve();
});

test('forked scratch snapshots are isolated and task-only branches inherit nothing', async () => {
    const received = [];
    const executor = new ParallelExecutor({ async execute(request) {
        received.push(structuredClone(request.scratch)); request.scratch.push({ injected: true }); return 'ok';
    } });
    const scratch = [{ assistant: 'source' }];
    await executor.run({ effectId: 'fork', ...plan, scratch,
        branches: [branch('a'), { ...branch('b'), contextPolicy: 'include_scratch' }, { ...branch('c'), contextPolicy: 'include_scratch' }] });
    expect(received).toEqual([[], scratch, scratch]);
    expect(scratch).toHaveLength(1);
});

test('observers cannot fail or stall branch scheduling, and an empty join is valid', async () => {
    const executor = new ParallelExecutor({ execute: async () => 'ok' });
    const result = await executor.run({ ...plan, effectId: 'observer', onEvent: () => { throw new Error('observer'); } });
    expect(result.ok).toBe(true);
    expect((await executor.run({ ...plan, effectId: 'empty', branches: [] })).branches).toEqual([]);
});

test('native branch port uses an existing terminal checkpoint and refuses non-durable recovery', async () => {
    const fake = fakePorts();
    const runtime = new AgentRuntime({ registry: new AgentRegistry([{ id: 'b' }]), ports: fake.ports, countTokens: m => m.content.length });
    const port = createRuntimeBranchPort(async () => ({ runtime }));
    const request = { ...branch('one'), contextPolicy: 'include_scratch', runId: 'child', payload: { selected: 'fact' }, scratch: [{ assistant: 'source' }], signal: new AbortController().signal };
    expect(await port.execute(request)).toBe('done');
    expect(await port.execute(request)).toBe('done');
    expect(fake.calls.model).toHaveLength(1);
    expect(fake.calls.model[0].messages.some(message => message.content.includes('selected'))).toBe(true);
    expect(runtime.getState('child').scratch).toEqual(request.scratch);
    await expect(port.resume(request)).rejects.toThrow('Durable child checkpoint required');
});

test('settled policy preserves successful branches around a failure and continues after join', async () => {
    const { runtime, fake } = setup(new ParallelExecutor({ async execute(request) {
        if (request.id === 'two') throw new Error('partial failure');
        return request.id;
    } }));
    const result = await start(runtime);
    expect(result.status).toBe('completed');
    expect(result.scratch[0].parallel.branches.map(branch => branch.status)).toEqual(['completed', 'failed', 'completed']);
    expect(fake.calls.model).toHaveLength(2);
});

test('a cancelled running branch cannot mutate its settled result or revive the projection', async () => {
    const gate = deferred(), entered = [];
    const executor = new ParallelExecutor({ async execute(request) {
        entered.push(request.id);
        return request.id === 'one' ? gate.promise : 'ok';
    } });
    const { runtime } = setup(executor);
    const projection = new RuntimeProjection();
    runtime.events.subscribe(event => projection.append(event));
    const running = start(runtime);
    await until(() => entered.includes('one'));
    runtime.cancelBranch('parent', 'one');
    const result = await running;
    gate.resolve('late');
    await until(() => projection.snapshot().events.some(event => event.type === 'parallel.branch.stale'));
    expect(result.scratch[0].parallel.branches[0].status).toBe('cancelled');
    expect(projection.snapshot().runs[0].status).toBe('completed');
});

test('source invalidation stops queued branch admission', async () => {
    const entered = [];
    const { runtime, fake } = setup(new ParallelExecutor({ execute(request) {
        entered.push(request.id); fake.invalidate(); return 'done';
    } }));
    fake.ports.model.request = async () => ({ ...plan, concurrency: 1 });
    expect((await start(runtime)).error).toBe('Stale memory');
    expect(entered).toEqual(['one']);
});
