import { test, expect } from '@jest/globals';
import { AgentRuntime, AgentRegistry, MemoryCheckpointStore } from '../../public/scripts/lib/agent-runtime/index.js';
import { fakePorts, deferred } from './fakes.js';

const registry = new AgentRegistry([{ id: 'a', tools: ['lookup'] }]);
const command = { runId: 'race', agentId: 'a', task: 'x' };
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function create(fake, store = new MemoryCheckpointStore()) {
    return new AgentRuntime({ registry, ports: fake.ports, store, countTokens: m => m.content.length });
}

test('cancellation settles without waiting for an uncooperative model', async () => {
    const pending = deferred();
    const runtime = create(fakePorts([() => pending.promise]));
    const running = runtime.startRun(command);
    await flush();
    runtime.cancelRun('race');
    expect((await running).status).toBe('cancelled');
    pending.resolve({ type: 'complete' });
});

test('observer cancellation at effect start prevents the port call', async () => {
    const fake = fakePorts();
    const runtime = create(fake);
    runtime.events.subscribe(event => {
        if (event.type === 'model.request.started') runtime.cancelRun('race');
    });
    expect((await runtime.startRun(command)).status).toBe('cancelled');
    expect(fake.calls.model).toHaveLength(0);
});

test('another driver resume supersedes the old model result', async () => {
    const pending = deferred();
    const store = new MemoryCheckpointStore();
    const fake = fakePorts([() => pending.promise, { type: 'complete', output: 'new' }]);
    const older = create(fake, store), newer = create(fake, store);
    const running = older.startRun(command);
    await flush();
    expect((await newer.resumeRun('race')).output).toBe('new');
    pending.resolve({ type: 'tool', toolName: 'lookup' });
    expect((await running).output).toBe('new');
    expect(fake.calls.tool).toHaveLength(0);
});

test('rejected tool and stale memory do not revive cancelled state', async () => {
    const pending = deferred();
    const fake = fakePorts([{ type: 'tool', toolName: 'lookup' }]);
    fake.ports.tool.execute = () => pending.promise;
    const runtime = create(fake);
    const running = runtime.startRun(command);
    await flush();
    runtime.cancelRun('race');
    pending.reject(new Error('late failure'));
    expect((await running).status).toBe('cancelled');
});
