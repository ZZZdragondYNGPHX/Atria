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
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const evidence = await page.evaluate(async () => {
        const store = await import('/scripts/agents/orchestrator/run-state/store.js');
        const panel = await import('/scripts/agents/orchestrator/workspace/panel.js');
        const { replayRuntimeEvents } = await import('/scripts/lib/agent-runtime/projection.js');
        const { runRoutedLegacyWorkflow, createLegacyAgentGraph } = await import('/scripts/agents/orchestrator/legacy-agent-routing.js');
        const { modelIntent, toolIntent } = await import('/scripts/agents/orchestrator/legacy-workflow-adapter.js');
        panel.initWorkspace();
        const controller = new AbortController(); let release, ready, models = 0, writes = 0;
        const pending = new Promise(resolve => { release = resolve; });
        const started = new Promise(resolve => { ready = resolve; });
        const id = store.startRun({ mode: 'spec', chatKey: 'offline', abortFn: () => controller.abort() });
        const running = runRoutedLegacyWorkflow(async function* () {
            yield modelIntent(() => { models++; ready(); return pending; }, { taskMessages: [], apiPresetName: 'offline-profile' });
            yield toolIntent('write', {}, {}, async () => { writes++; });
        }, { graph: createLegacyAgentGraph('spec', [{ id: '<script>worker</script>' }]),
            toAgentId: 'spec/agent/%3Cscript%3Eworker%3C%2Fscript%3E', parentRunId: id,
            task: 'PRIVATE TASK', reason: 'stage_dispatch', signal: controller.signal }).catch(error => error.name);
        await started;
        const before = JSON.stringify(store.getCurrentRun().runtime);
        store.appendRound({ runId: id, round: { id: 'round' } });
        store.ensureSection({ runId: id, roundId: 'round', section: { id: 'text', kind: 'text' } });
        store.appendToSection({ runId: id, roundId: 'round', sectionId: 'text', delta: 'once' });
        panel.openWorkspace('Diagnostics'); panel.openWorkspace('Diagnostics');
        await new Promise(resolve => requestAnimationFrame(resolve));
        const singleText = store.getCurrentRun().rounds[0].sections[0].body;
        const unchanged = before === JSON.stringify(store.getCurrentRun().runtime);
        const details = document.querySelector('#agent-memory-workspace main'); for (const item of details.querySelectorAll('details')) item.open = true;
        await new Promise(resolve => setTimeout(resolve, 0));
        const traceVisible = details.textContent.includes('offline-profile');
        [...document.querySelectorAll('#agent-memory-workspace header button')].find(button => /Stop|Stopping/.test(button.textContent)).click(); panel.openWorkspace('Diagnostics');
        const requestSurvivedRefresh = [...document.querySelectorAll('#agent-memory-workspace header button')].find(button => /Stop|Stopping/.test(button.textContent)).disabled && store.getCurrentRun().stopRequested;
        const ended = await running;
        release('late'); await new Promise(resolve => setTimeout(resolve, 0));
        store.finishRun({ runId: id, status: 'aborted' });
        panel.openWorkspace('Diagnostics'); for (const item of document.querySelectorAll('#agent-memory-workspace details')) item.open = true;
        const snapshot = store.getCurrentRun().runtime;
        const replayEqual = JSON.stringify(replayRuntimeEvents(snapshot.events)) === JSON.stringify(snapshot);
        return { singleText, unchanged, traceVisible, requestSurvivedRefresh, ended, models, writes, replayEqual,
            stale: snapshot.events.some(e => e.type === 'effect.stale'), status: snapshot.runs[0].status,
            noPrivateTask: !JSON.stringify(snapshot).includes('PRIVATE TASK'),
            noScriptNodes: document.querySelector('#agent-memory-workspace main').querySelectorAll('script').length === 0 };
    });
    assert.deepEqual(evidence, { singleText: 'once', unchanged: true, traceVisible: true, requestSurvivedRefresh: true,
        ended: 'AbortError', models: 1, writes: 0, replayEqual: true, stale: true, status: 'cancelled', noPrivateTask: true, noScriptNodes: true });
    await page.screenshot({ path: resolve(root, '../.git/phase5-panel.png') });
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export Trace', exact: true }).click();
    const download = await downloadPromise;
    const path = resolve(root, '../.git/phase5-panel-export.json'); await download.saveAs(path);
    const exported = (await readFile(path, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    assert.ok(exported.some(e => e.type === 'run.cancelled'));
    assert.ok(exported.some(e => e.type === 'agent.handoff.completed'));
    assert.equal(exported.abortFn, undefined); assert.equal(exported.stopFn, undefined);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ browser: 'Edge headless mobile viewport', evidence, exported: true, pageErrors: errors }));
} finally {
    await browser?.close(); await new Promise(resolve => server.close(resolve));
}
