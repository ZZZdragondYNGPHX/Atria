// Real browser + production modules; no user data or model/network service calls.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const root = resolve(fileURLToPath(new URL('../../public', import.meta.url)));
const server = createServer(async (req, res) => {
    try {
        if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Runtime projection smoke</title>'); return; }
        const path = resolve(root, `.${new URL(req.url, 'http://localhost').pathname}`);
        if (!path.startsWith(root + sep) || !/\.(js|css)$/.test(path)) throw new Error('Not an asset');
        res.setHeader('Content-Type', path.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(await readFile(path));
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
    const channel = process.env.ENGINE_BROWSER || 'msedge';
    browser = await chromium.launch({ ...(channel === 'chromium' ? {} : { channel }), headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const setup = async (page, recovering) => page.evaluate(async recovering => {
        const { AgentRuntime, AgentRegistry } = await import('/scripts/lib/agent-runtime/index.js');
        const { DurableCheckpointStore } = await import('/scripts/lib/agent-runtime/durable-checkpoint-store.js');
        const { openIndexedDBCheckpoints } = await import('/scripts/lib/agent-runtime/indexeddb-checkpoints.js');
        const { runEnginePlan } = await import('/scripts/extensions/orchestrator/engine-v2/runtime-bridge.js');
        const { CAPABILITIES } = await import('/scripts/lib/orchestration-engine/index.js');
        const { assertOutputAuthorized } = await import('/scripts/extensions/orchestrator/engine-v2/output-adapter.js');
        const { replayRuntimeEvents } = await import('/scripts/lib/agent-runtime/projection.js');
        const panelStore = await import('/scripts/extensions/orchestrator/run-state/store.js');
        const panel = await import('/scripts/extensions/orchestrator/workspace/panel.js');
        const caps = Object.fromEntries(CAPABILITIES.map(key => [key, !key.startsWith('reply.')]));
        const plan = { schemaVersion: 1, planId: 'browser-plan', source: { mode: 'spec' }, entryNodeId: 'entry',
            agents: [{ id: 'worker', tools: [], capabilities: caps }],
            nodes: ['entry', 'one', 'two', 'out'].map(nodeId => ({ nodeId, agentId: 'worker', capabilities: caps,
                kind: nodeId === 'entry' ? 'router' : nodeId === 'out' ? 'join' : 'agent',
                ...(nodeId === 'entry' ? { metadata: { entry: true } } : nodeId === 'out' ? { inputs: ['one', 'two'] } : {}) })),
            edges: [['entry', 'one'], ['entry', 'two'], ['one', 'out'], ['two', 'out']].map(([from, to]) => ({ edgeId: `${from}-${to}`, from, to })),
            capabilities: caps, scheduler: {}, arbitration: { kind: 'merge' },
            output: { kind: 'guidance', ownerNodeId: 'out', submitCapability: 'result.submit' },
            budgets: { maxSteps: 10, maxTasks: 10, maxConcurrency: 2 } };
        const scope = 'engine-browser';
        const backend = await openIndexedDBCheckpoints({ scope });
        const store = await DurableCheckpointStore.open({ backend, runId: 'engine-browser' });
        const panelId = panelStore.startRun({ mode: 'spec', chatKey: 'offline' });
        panel.initWorkspace(); panel.openWorkspace();
        const running = runEnginePlan({ plan, runId: 'engine-browser', store, resume: recovering, panelRunId: panelId,
            createChildRuntime: async request => {
                const backend = await openIndexedDBCheckpoints({ scope });
                const childStore = await DurableCheckpointStore.open({ backend, runId: request.runId });
                const runtime = new AgentRuntime({ store: childStore, registry: new AgentRegistry([{ id: 'worker' }]), countTokens: () => 1,
                    ports: { memory: { recall: async () => ({ references: [], messages: [], assertCurrent() {} }) },
                        tool: { execute() { throw new Error('Unexpected tool'); } }, model: { async request() {
                            const id = request.payload.nodeId;
                            localStorage.setItem(id, String(Number(localStorage.getItem(id) || 0) + 1));
                            if (!recovering && id === 'two') await new Promise(() => {});
                            return { type: 'complete', output: `value-${id}` };
                        } } } });
                return { runtime, close: () => backend.close() };
            } });
        if (!recovering) {
            window.engineRunning = running;
            for (let i = 0; i < 500; i++) {
                const states = await backend.list();
                if (states.some(state => state.runId.includes('/branch/one') && state.status === 'completed') && localStorage.getItem('two') === '1') return { interrupted: true };
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            throw new Error('Interrupted boundary not reached');
        }
        const result = await running;
        const output = assertOutputAuthorized({ plan, state: result.state, generation: result.state.generation });
        panelStore.finishRun({ runId: panelId, status: 'committed' }); panel.openWorkspace('Diagnostics');
        const details = document.querySelector('#agent-memory-workspace main');
        await new Promise(resolve => setTimeout(resolve, 30));
        const snapshot = panelStore.getCurrentRun().runtime;
        const evidence = { status: output.status, values: output.value.map(item => item.value),
            counts: ['one', 'two'].map(id => Number(localStorage.getItem(id))),
            engineEvent: snapshot.events.some(event => event.type === 'output.ready'),
            replayEqual: JSON.stringify(snapshot) === JSON.stringify(replayRuntimeEvents(snapshot.events)),
            traceVisible: details.textContent.includes('output.ready'),
            noPrivateValues: !JSON.stringify(snapshot).includes('value-one'),
            overflow: document.documentElement.scrollWidth > window.innerWidth };
        backend.close(); return evidence;
    }, recovering);
    assert.deepEqual(await setup(page, false), { interrupted: true });
    await page.reload();
    const evidence = await setup(page, true);
    assert.deepEqual(evidence, { status: 'completed', values: ['value-one', 'value-two'], counts: [1, 2],
        engineEvent: true, replayEqual: true, traceVisible: true, noPrivateValues: true, overflow: false });
    await page.screenshot({ path: resolve(root, `../.git/workspace-${channel}-mobile.png`) });
    const workspace = page.locator('#agent-memory-workspace');
    await workspace.locator('.atria-workspace-mobile-nav').getByRole('button', { name: 'Run', exact: true }).click();
    assert.equal(await workspace.locator('.atria-workspace-mobile-nav').getByRole('button').count(), 4);
    await workspace.locator('.workspace-node-chip').filter({ hasText: 'agent' }).first().click();
    const inspector = workspace.locator('.atria-workspace-inspector');
    assert.equal(await inspector.getByText('reply.submit', {exact:true}).count(), 1);
    assert.match(await inspector.innerText(), /Memory evidence\s*0/);
    await page.keyboard.press('Escape');
    assert.equal(await inspector.isHidden(), true);
    assert.equal(await workspace.isVisible(), true);
    await workspace.getByRole('button', { name: 'Close', exact: true }).click();
    await page.evaluate(async () => { const panel = await import('/scripts/extensions/orchestrator/workspace/panel.js'); panel.openWorkspace('Run'); panel.destroyWorkspace(); panel.openWorkspace('Run'); });
    assert.equal(await page.locator('#agent-memory-workspace').count(), 1);
    await page.setViewportSize({ width: 1440, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ browser: channel, evidence, pageErrors: errors }));
} finally {
    await browser?.close(); await new Promise(resolve => server.close(resolve));
}
