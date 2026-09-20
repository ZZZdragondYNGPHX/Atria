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
    const errors = [];
    const url = `http://127.0.0.1:${server.address().port}/`;
    const boot = async restore => {
        const { AgentRuntime, AgentRegistry, DurableCheckpointStore, openIndexedDBCheckpoints,
            ParallelExecutor, createRuntimeBranchPort } = await import('/scripts/lib/agent-runtime/index.js');
        const memory = { async recall() { return { references: [], assertCurrent() {} }; } };
        const executor = new ParallelExecutor(createRuntimeBranchPort(async request => {
            const backend = await openIndexedDBCheckpoints({ scope: 'parallel-smoke' });
            const store = await DurableCheckpointStore.open({ backend, runId: request.runId });
            const runtime = new AgentRuntime({ store, countTokens: m => String(m.content || '').length,
                registry: new AgentRegistry([{ id: 'leaf', tools: ['write'] }]),
                eventSink: event => { if (event.type === 'run.completed' && request.id === 'a') window.aCompleted = true; },
                ports: { memory,
                    model: { async request(effect) {
                        if (request.id === 'b' && !restore) { window.bReady = true; return new Promise(() => {}); }
                        const key = `calls-${request.id}`;
                        localStorage.setItem(key, String(Number(localStorage.getItem(key) || 0) + 1));
                        return request.id === 'a' && effect.step === 1 ? { type: 'tool', toolName: 'write' }
                            : { type: 'complete', output: request.id };
                    } },
                    tool: { async execute() {
                        localStorage.setItem('writes', String(Number(localStorage.getItem('writes') || 0) + 1));
                        return { ok: true, value: 'saved' };
                    } },
                },
            });
            return { runtime, close: backend.close };
        }));
        const backend = await openIndexedDBCheckpoints({ scope: 'parallel-smoke' });
        const store = await DurableCheckpointStore.open({ backend, runId: 'parent' });
        window.prune = () => backend.prune(Date.now() + 1000);
        const events = [];
        const runtime = new AgentRuntime({ store, countTokens: m => String(m.content || '').length,
            registry: new AgentRegistry([{ id: 'root', handoffs: ['leaf'] }, { id: 'leaf' }]),
            eventSink: event => events.push(event),
            ports: { memory, parallel: executor, tool: { async execute() { throw new Error('Unexpected root tool'); } },
                model: { async request(effect) {
                    return effect.step === 1 ? { type: 'fanout', concurrency: 2, failurePolicy: 'fail_fast',
                        branches: ['a', 'b'].map(id => ({ id, toAgentId: 'leaf', task: id, reason: 'expert', contextPolicy: 'task_only' })) }
                        : { type: 'complete', output: 'joined' };
                } },
            },
        });
        if (!restore) {
            window.running = runtime.startRun({ runId: 'parent', agentId: 'root' }).catch(error => { window.failure = error.message; });
            return;
        }
        const state = await runtime.resumeRun('parent');
        backend.close();
        return { status: state.status, output: state.output, writes: Number(localStorage.getItem('writes')),
            callsA: Number(localStorage.getItem('calls-a')), results: state.scratch[0].parallel.branches.map(branch => branch.value),
            joins: events.filter(event => event.type === 'parallel.join.completed').length };
    };
    const first = await context.newPage();
    first.on('pageerror', error => errors.push(error.message));
    await first.goto(url);
    await first.evaluate(boot, false);
    await first.waitForFunction(() => window.aCompleted && window.bReady || window.failure);
    assert.equal(await first.evaluate(() => window.failure), undefined);
    await first.evaluate(() => window.prune()); // Finished children of an active parent must survive retention cleanup.
    await first.close();
    const second = await context.newPage();
    second.on('pageerror', error => errors.push(error.message));
    await second.goto(url);
    const evidence = await second.evaluate(boot, true);
    assert.deepEqual(evidence, { status: 'completed', output: 'joined', writes: 1, callsA: 2, results: ['a', 'b'], joins: 1 });
    const legacy = await second.evaluate(async () => {
        const { configureRuntimeCheckpoints } = await import('/scripts/extensions/orchestrator/runtime-checkpoints.js');
        const { runLegacyParallel } = await import('/scripts/extensions/orchestrator/legacy-parallel-adapter.js');
        const { runLegacySingleRequest } = await import('/scripts/extensions/orchestrator/legacy-runtime-adapter.js');
        configureRuntimeCheckpoints({ getScope: () => 'legacy-parallel' });
        const ids = [];
        const outputs = await runLegacyParallel(['one', 'two'], async (item, index, request) => {
            ids.push(request.runId);
            return runLegacySingleRequest({ runId: request.runId, request: { abortSignal: request.signal, taskMessages: [] }, send: async () => ({ text: item }) });
        }, { runId: 'batch', concurrency: 1 });
        return { outputs: outputs.map(output => output.text), ids };
    });
    assert.deepEqual(legacy, { outputs: ['one', 'two'], ids: ['batch/effect/2/branch/0', 'batch/effect/2/branch/1'] });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ browser: 'Edge headless', evidence, legacy, pageErrors: errors }));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
