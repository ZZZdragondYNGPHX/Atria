// Real IndexedDB transactions and destroyed page contexts; entirely offline.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const root = resolve(fileURLToPath(new URL('../../public', import.meta.url)));
const server = createServer(async (req, res) => {
    try {
        if (req.url === '/') { res.end('<!doctype html><title>Recovery smoke</title>'); return; }
        const path = resolve(root, `.${new URL(req.url, 'http://localhost').pathname}`);
        if (!path.startsWith(root + sep) || !path.endsWith('.js')) throw new Error('Not a module');
        res.setHeader('Content-Type', 'text/javascript');
        res.end(await readFile(path));
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext();
    const errors = [], evidence = [];
    const url = `http://127.0.0.1:${server.address().port}/`;
    for (const boundary of ['model', 'tool-unack', 'tool-receipt', 'handoff']) {
        const first = await context.newPage();
        first.on('pageerror', error => errors.push(error.message));
        await first.goto(url);
        await first.evaluate(async boundary => {
            const { AgentRuntime, AgentRegistry, DurableCheckpointStore, openIndexedDBCheckpoints } = await import('/scripts/lib/agent-runtime/index.js');
            const backend = await openIndexedDBCheckpoints({ scope: 'offline' });
            const store = await DurableCheckpointStore.open({ backend, runId: boundary });
            const persist = backend.compareAndSet;
            backend.compareAndSet = async (state, version) => {
                if (boundary === 'tool-unack' && Object.values(state.completedEffects).some(r => r.result?.value === 'written')) {
                    window.atBoundary = true;
                    return new Promise(() => {});
                }
                await persist(state, version);
            };
            let calls = 0;
            const runtime = new AgentRuntime({ store, countTokens: m => m.content.length,
                registry: new AgentRegistry([{ id: 'a', tools: ['write'], handoffs: ['b'] }, { id: 'b' }]),
                ports: {
                    memory: { async recall() { return { content: 'fresh', references: [], assertCurrent() {} }; } },
                    model: { async request() {
                        if (boundary === 'model' || calls++) { window.atBoundary = true; return new Promise(() => {}); }
                        return boundary === 'handoff'
                            ? { type: 'handoff', toAgentId: 'b', task: 'next', reason: 'expert', contextPolicy: 'task_only' }
                            : { type: 'tool', toolName: 'write' };
                    } },
                    tool: { async execute(request) {
                        localStorage.setItem(boundary, JSON.stringify({ writes: 1, id: request.effectId }));
                        return { ok: true, value: 'written' };
                    } },
                },
            });
            window.running = runtime.startRun({ runId: boundary, agentId: 'a', task: 'test' }).then(state => { window.finished = state; }).catch(error => { window.failure = error.message; });
        }, boundary);
        await first.waitForFunction(() => window.atBoundary || window.finished || window.failure);
        assert.deepEqual(await first.evaluate(() => ({ finished: window.finished, failure: window.failure })), { finished: undefined, failure: undefined }, boundary);
        await first.close(); // Discard Runtime, ports, promises and all in-memory receipts.
        const second = await context.newPage();
        second.on('pageerror', error => errors.push(error.message));
        await second.goto(url);
        const result = await second.evaluate(async boundary => {
            const { AgentRuntime, AgentRegistry, DurableCheckpointStore, openIndexedDBCheckpoints } = await import('/scripts/lib/agent-runtime/index.js');
            const backend = await openIndexedDBCheckpoints({ scope: 'offline' });
            const store = await DurableCheckpointStore.open({ backend, runId: boundary });
            const before = store.load(boundary);
            let toolCalls = 0, reconciled = 0;
            const runtime = new AgentRuntime({ store, countTokens: m => m.content.length,
                registry: new AgentRegistry([{ id: 'a', tools: ['write'], handoffs: ['b'] }, { id: 'b' }]),
                ports: {
                    memory: { async recall() { return { content: 'fresh', references: [], assertCurrent() {} }; } },
                    model: { async request() { return { type: 'complete', output: 'restored' }; } },
                    tool: {
                        async execute() { toolCalls++; throw new Error('Duplicate write'); },
                        async reconcile(request) {
                            reconciled++;
                            if (JSON.parse(localStorage.getItem(boundary)).id !== request.effectId) throw new Error('Identity changed');
                            return { status: 'completed', result: { ok: true, value: 'written' } };
                        },
                    },
                },
            });
            const state = await runtime.resumeRun(boundary);
            const otherAccount = await openIndexedDBCheckpoints({ scope: 'other-account' });
            const isolated = await otherAccount.load(boundary) === null;
            otherAccount.close(); backend.close();
            return { boundary, status: state.status, generationAdvanced: state.generation > before.generation,
                handoffs: state.handoffStack.length, toolCalls, reconciled, isolated };
        }, boundary);
        assert.equal(result.status, 'completed');
        assert.equal(result.generationAdvanced, true);
        assert.equal(result.toolCalls, 0);
        assert.equal(result.reconciled, boundary === 'tool-unack' ? 1 : 0);
        assert.equal(result.handoffs, boundary === 'handoff' ? 1 : 0);
        assert.equal(result.isolated, true);
        evidence.push(result);
        await second.close();
    }
    const host = await context.newPage();
    host.on('pageerror', error => errors.push(error.message));
    await host.goto(url);
    const hostEvidence = await host.evaluate(async () => {
        const { AgentRuntime, AgentRegistry, DurableCheckpointStore, openIndexedDBCheckpoints } = await import('/scripts/lib/agent-runtime/index.js');
        const { configureRuntimeCheckpoints, listRuntimeCheckpoints, cancelRuntimeCheckpoint } = await import('/scripts/extensions/orchestrator/runtime-checkpoints.js');
        const { runLegacySingleRequest } = await import('/scripts/extensions/orchestrator/legacy-runtime-adapter.js');
        const { runLegacyWorkflow, modelIntent } = await import('/scripts/extensions/orchestrator/legacy-workflow-adapter.js');
        configureRuntimeCheckpoints({ getScope: () => 'host-test' });
        let sends = 0;
        const options = { runId: 'single', request: { taskMessages: [] }, send: async () => { sends++; return { text: 'saved' }; } };
        await runLegacySingleRequest(options);
        const restored = await runLegacySingleRequest({ ...options, resume: true });
        const controller = new AbortController();
        const workflow = runLegacyWorkflow(async function* () {
            yield modelIntent(async () => new Promise(() => {}), { taskMessages: [] });
        }, { runId: 'stopped', signal: controller.signal }).catch(error => error.name);
        controller.abort();
        const stopped = await workflow;
        let entered;
        const modelStarted = new Promise(resolve => { entered = resolve; });
        const active = runLegacyWorkflow(async function* () {
            yield modelIntent(async () => { entered(); return new Promise(() => {}); }, { taskMessages: [] });
            throw new Error('Cancelled policy continued');
        }, { runId: 'active-stop' }).catch(error => error.name);
        await modelStarted;
        const activeState = await cancelRuntimeCheckpoint('active-stop');
        const activeStopped = await active;
        const backends = await Promise.all([0, 1].map(() => openIndexedDBCheckpoints({ scope: 'host-test' })));
        const stores = await Promise.all(backends.map(backend => DurableCheckpointStore.open({ backend, runId: 'race' })));
        let models = 0;
        const runtimes = stores.map(store => new AgentRuntime({ store, countTokens: m => m.content.length,
            registry: new AgentRegistry([{ id: 'a' }]), ports: {
                model: { async request() { models++; return { type: 'complete' }; } },
                memory: { async recall() { return { references: [], assertCurrent() {} }; } },
                tool: { async execute() { throw new Error('Unexpected tool'); } },
            },
        }));
        const raced = await Promise.allSettled(runtimes.map(runtime => runtime.startRun({ runId: 'race', agentId: 'a' })));
        const list = await listRuntimeCheckpoints();
        await cancelRuntimeCheckpoint('single'); // Terminal cancellation is a no-op.
        for (const backend of backends) backend.close();
        return { sends, restored: restored.text, stopped, activeStatus: activeState.status, activeStopped, models, winners: raced.filter(r => r.status === 'fulfilled').length,
            persisted: list.some(run => run.runId === 'single' && run.status === 'completed') };
    });
    assert.deepEqual(hostEvidence, { sends: 1, restored: 'saved', stopped: 'AbortError', activeStatus: 'cancelled', activeStopped: 'AbortError', models: 1, winners: 1, persisted: true });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ browser: 'Edge headless', evidence, hostEvidence, pageErrors: errors }));
} finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
}
