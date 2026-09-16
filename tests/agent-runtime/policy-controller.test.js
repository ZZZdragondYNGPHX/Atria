import { test, expect } from '@jest/globals';
import { AgentRuntime, AgentRegistry, DurableCheckpointStore, ParallelExecutor } from '../../public/scripts/lib/agent-runtime/index.js';
import { fakePorts } from './fakes.js';

const registry = new AgentRegistry([{ id: 'owner', tools: ['lookup'], handoffs: ['worker'] }, { id: 'worker', tools: ['lookup'] }]);
const command = { runId: 'policy', agentId: 'owner', controlMode: 'policy', policyState: { cursor: 0 } };
function backend(seed = null) {
    let disk = seed;
    const snapshots = [];
    return { snapshots, async load() { return structuredClone(disk); }, async compareAndSet(state, version) {
        if ((disk?.checkpointVersion ?? 0) !== version) throw Error('Conflict');
        disk = structuredClone(state); snapshots.push(disk);
    } };
}
async function setup(disk, advance) {
    const fake = fakePorts([{ proposal: 'model-result' }]);
    fake.ports.policy = { advance };
    fake.ports.parallel = new ParallelExecutor({ execute: async () => 'child-result', resume: async () => 'child-result' });
    const store = await DurableCheckpointStore.open({ backend: disk, runId: 'policy' });
    return { fake, runtime: new AgentRuntime({ registry, store, ports: fake.ports, countTokens: m => m.content.length }) };
}
const intents = [
    { type: 'model' },
    { type: 'tool', toolName: 'lookup', args: { query: 'retained' } },
    { type: 'fanout', concurrency: 1, failurePolicy: 'settled', branches: [
        { id: 'one', toAgentId: 'worker', task: 'work', reason: 'delegate', contextPolicy: 'task_only' },
    ] },
    { type: 'handoff', toAgentId: 'worker', task: 'transfer', reason: 'handoff', contextPolicy: 'task_only' },
    { type: 'wait' },
    { type: 'complete', output: 'done' },
];
function advance({ policyState, runSnapshot, receipt }) {
    expect(Object.isFrozen(runSnapshot)).toBe(true);
    expect(Object.isFrozen(policyState)).toBe(true);
    const cursor = policyState.cursor;
    if (cursor === 1) expect(receipt.proposal).toBe('model-result');
    if (cursor === 2) expect(receipt.ok).toBe(true);
    if (cursor === 3) expect(receipt.branches[0].value).toBe('child-result');
    if (cursor === 4) expect(runSnapshot.currentAgentId).toBe('worker');
    return { intent: intents[cursor], policyState: { cursor: cursor + 1 } };
}

test('policy state persists before effect admission; model/tool/join/handoff and wait return to policy', async () => {
    const disk = backend();
    const { runtime, fake } = await setup(disk, advance);
    const execute = fake.ports.tool.execute;
    fake.ports.tool.execute = async request => {
        expect((await disk.load()).policyState.cursor).toBe(2);
        expect(request.args).toEqual({ query: 'retained' });
        return execute(request);
    };
    expect((await runtime.startRun(command)).status).toBe('waiting_user');
    expect((await runtime.appendUserInput('policy', 'continue')).output).toBe('done');
    expect(fake.calls.model).toHaveLength(1);
});

test('every saved policy/model/join/handoff boundary recovers without a generator', async () => {
    const disk = backend();
    const first = await setup(disk, advance);
    await first.runtime.startRun(command);
    for (const snapshot of disk.snapshots) {
        // Unconfirmed side effects retain the existing explicit reconciliation contract.
        if (snapshot.pendingEffect?.type === 'tool.execute' && !snapshot.completedEffects[snapshot.pendingEffect.effectId]) continue;
        const next = await setup(backend(snapshot), advance);
        const result = await next.runtime.resumeRun('policy');
        expect(result.status).toBe('waiting_user');
        expect((await next.runtime.appendUserInput('policy', 'resume')).output).toBe('done');
    }
});

test.each([
    { intent: { type: 'tool', toolName: 'forbidden' }, policyState: {} },
    { intent: { type: 'fanout', concurrency: 8, failurePolicy: 'settled', branches: [] }, policyState: {} },
    { intent: { type: 'model' }, policyState: { callback() {} } },
])('invalid intent/state cannot admit an effect: %j', async decision => {
    const { runtime, fake } = await setup(backend(), () => decision);
    expect((await runtime.startRun(command)).status).toBe('failed');
    expect(fake.calls.tool).toHaveLength(0);
    expect(fake.calls.model).toHaveLength(0);
});

test('cancel at policy persistence blocks the next effect', async () => {
    const { runtime, fake } = await setup(backend(), () => ({ intent: { type: 'model' }, policyState: {} }));
    runtime.events.subscribe(event => { if (event.type === 'policy.advance.completed') runtime.cancelRun('policy'); });
    expect((await runtime.startRun(command)).status).toBe('cancelled');
    expect(fake.calls.model).toHaveLength(0);
});
