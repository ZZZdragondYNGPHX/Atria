import { test, expect } from '@jest/globals';
import { runLegacyWorkflow, modelIntent, toolIntent, createLegacyWorkflowRunId } from '../../public/scripts/extensions/orchestrator/legacy-workflow-adapter.js';
import { AgentRuntime, AgentRegistry, MemoryCheckpointStore } from '../../public/scripts/lib/agent-runtime/index.js';
import { deferred, fakePorts } from './fakes.js';

const request = { taskMessages: [{ role: 'user', content: 'task' }] };

test('HTTP/LAN hosts without crypto.randomUUID still receive distinct run IDs', () => {
    const first = createLegacyWorkflowRunId({});
    expect(first).toMatch(/^legacy-/);
    expect(createLegacyWorkflowRunId({})).not.toBe(first);
});

test('legacy policy uses one state machine for ordered effects and retains only transient receipts', async () => {
    const store = new MemoryCheckpointStore(), events = [], contexts = [], host = { privateHost: true };
    const output = await runLegacyWorkflow(async function* () {
        const first = yield modelIntent(async () => 'first', request);
        const tool = yield toolIntent('read', {}, host, async (_name, _args, context) => { contexts.push(context.effectId); return 'private-memory-content'; });
        expect(first).toBe('first'); expect(tool).toBe('private-memory-content');
        yield toolIntent('write', {}, host, async (_name, _args, context) => { contexts.push(context.effectId); return 'done'; });
        return yield modelIntent(async () => 'final', request);
    }, { runId: 'ordered', store, onEvent: e => events.push(e) });
    expect(output).toBe('final');
    expect(contexts).toEqual(['ordered/effect/5', 'ordered/effect/7']);
    expect(events.filter(e => ['model.request.started', 'tool.execute.started'].includes(e.type)).map(e => e.type))
        .toEqual(['model.request.started', 'tool.execute.started', 'tool.execute.started', 'model.request.started']);
    expect(JSON.stringify(store.load('ordered'))).not.toMatch(/private-memory-content|privateHost/);
    expect(store.load('ordered').status).toBe('completed');
});

test('transport errors reenter legacy retry policy with original identity', async () => {
    const original = new Error('retry me'); let calls = 0;
    const result = await runLegacyWorkflow(async function* () {
        try { yield modelIntent(async () => { calls++; throw original; }, request); }
        catch (error) { expect(error).toBe(original); }
        return yield modelIntent(async () => { calls++; return 'retried'; }, request);
    });
    expect(result).toBe('retried'); expect(calls).toBe(2);
});

test('cancel at a tool boundary prevents the write and runs policy cleanup', async () => {
    const controller = new AbortController(); let writes = 0, cleaned = false;
    await expect(runLegacyWorkflow(async function* () {
        try { yield toolIntent('write', {}, {}, async () => { writes++; }); }
        finally { cleaned = true; }
    }, { signal: controller.signal, onEvent: event => { if (event.type === 'tool.execute.started') controller.abort(); } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(writes).toBe(0); expect(cleaned).toBe(true);
});

test('Memory OS tool guard survives into the next model boundary', async () => {
    let fresh = true, models = 0;
    await expect(runLegacyWorkflow(async function* () {
        yield toolIntent('memory_recall', {}, {}, async (_name, _args, context) => {
            context.__agentRuntimeMemoryGuard(() => { if (!fresh) throw new Error('Source changed'); });
            return 'source text';
        });
        fresh = false;
        yield modelIntent(async () => { models++; }, request);
    })).rejects.toThrow('Source changed');
    expect(models).toBe(0);
});

test('lost legacy continuation cannot resume or replay an uncertain effect', async () => {
    const store = new MemoryCheckpointStore(), started = deferred(), pending = deferred();
    const running = runLegacyWorkflow(async function* () { return yield modelIntent(() => { started.resolve(); return pending.promise; }, request); }, { store, runId: 'restart' });
    await started.promise;
    const restored = new AgentRuntime({ store, registry: new AgentRegistry([{ id: 'legacy-policy' }]), ports: fakePorts().ports, countTokens: () => 1 });
    expect((await restored.resumeRun('restart')).error).toMatch(/continuation unavailable/);
    pending.resolve('late');
    await expect(running).rejects.toThrow('continuation unavailable');
});

test('late streaming callbacks cannot publish after cancellation', async () => {
    const controller = new AbortController(), started = deferred(), pending = deferred(), chunks = [];
    let sent;
    const run = runLegacyWorkflow(async function* () {
        return yield modelIntent(options => { sent = options; started.resolve(); return pending.promise; },
            { ...request, onChunk: chunk => chunks.push(chunk) });
    }, { signal: controller.signal });
    await started.promise; controller.abort();
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    sent.onChunk('late'); pending.resolve('late');
    expect(chunks).toEqual([]);
});
