// Offline browser smoke: real ES modules, no user data, no server/model credentials.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const root = resolve(fileURLToPath(new URL('../../public', import.meta.url)));
const server = createServer(async (req, res) => {
    try {
        if (req.url === '/') {
            res.setHeader('Content-Type', 'text/html');
            res.end('<!doctype html><title>Runtime offline smoke</title>');
            return;
        }
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
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const evidence = await page.evaluate(async () => {
        const { AgentRuntime, AgentRegistry } = await import('/scripts/lib/agent-runtime/index.js');
        const { runLegacySingleRequest } = await import('/scripts/extensions/orchestrator/legacy-runtime-adapter.js');
        const { createMemoryOSPort } = await import('/scripts/lib/agent-runtime/host-ports.js');
        let requests = 0, tools = 0;
        const runtime = new AgentRuntime({
            registry: new AgentRegistry([{ id: 'a', tools: ['lookup'] }]), countTokens: async m => m.content.length,
            ports: {
                model: { async request() { return ++requests === 1 ? { type: 'tool', toolName: 'lookup' } : { type: 'complete', output: 'done' }; } },
                tool: { async execute() { tools++; return { ok: true, value: 1 }; } },
                memory: createMemoryOSPort(async () => ({ text: 'shared memory', selected: ['fact-1'], tokenCount: 2, assertCurrent() {} })),
            },
        });
        const state = await runtime.startRun({ runId: 'browser', agentId: 'a', task: 'test' });
        const controller = new AbortController();
        const cancelled = runLegacySingleRequest({ runId: 'cancel', request: { taskMessages: [], abortSignal: controller.signal }, send: () => new Promise(() => {}) }).catch(e => e.name);
        controller.abort();
        const legacy = await runLegacySingleRequest({ runId: 'legacy', request: { taskMessages: [{ role: 'user', content: 'unchanged' }] }, send: async r => ({ text: r.taskMessages[0].content }) });
        let workerRequests = 0;
        const workerTools = [], turns = [];
        const workerOutput = await runLegacySingleRequest({
            hostContext: { async getTokenCountAsync(text) { return text.length; } },
            runId: 'single-tools', request: { tools: [{ function: { name: 'lookup' } }] },
            send: async request => {
                if (++workerRequests === 1) return { toolCalls: [1, 2].map(n => ({ id: `vendor-${n}`, name: 'lookup', args: { n } })) };
                if (request.taskMessages.filter(m => m.role === 'tool').length !== 2) throw new Error('Lost tool history');
                return { toolCalls: [{ name: 'final', args: { text: 'worker done' } }] };
            },
            worker: {
                nodeId: 'single', outputToolName: 'final', isFinalStage: true, enableLoopTools: true, maxRounds: 3,
                prepareRequest: async (_round, history) => ({ taskMessages: [{ role: 'system', content: 'same' }, ...history, { role: 'user', content: 'task' }] }),
                getSource: () => 'builtin', onTurn: turn => turns.push(turn), serialize: JSON.stringify,
                isStructuredToolError: () => false,
                execute: async effect => { workerTools.push(effect.args.n); return effect.args.n; },
            },
        });
        return { status: state.status, requests, tools, cancellation: await cancelled, legacy,
            worker: { workerOutput, workerRequests, workerTools, toolIds: turns.filter(t => t.role === 'tool').map(t => t.tool_call_id) } };
    });
    assert.deepEqual(evidence, { status: 'completed', requests: 2, tools: 1, cancellation: 'AbortError', legacy: { text: 'unchanged' },
        worker: { workerOutput: 'worker done', workerRequests: 2, workerTools: [1, 2], toolIds: ['vendor-1', 'vendor-2'] } });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ browser: 'Edge headless', evidence, pageErrors: errors }));
} finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
}
