// SPDX-License-Identifier: AGPL-3.0-or-later
// Real module Worker under mobile viewport / CPU throttling; not an Android device test.
/* global window, document */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const baseURL = process.argv[2]; assert(baseURL, 'Supply isolated server URL');
const browser = await chromium.launch({ headless: true, channel: process.argv[3] || 'msedge' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const fixture = (await readFile(new URL('../memory-graph/fixtures/large-memory.js', import.meta.url), 'utf8'))
    .replace('../../../public/scripts/', '/scripts/');
await page.route('**/__memory_large_fixture.js', route => route.fulfill({ contentType: 'application/javascript', body: fixture }));
try {
    await page.goto(baseURL); await page.waitForFunction(() => !!window.Atria?.getContext && !document.getElementById('preloader'));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const result = await page.evaluate(async () => {
        const { largeMemory } = await import('/__memory_large_fixture.js');
        const { computeInspector, openMemoryDiagnostics } = await import('/scripts/extensions/memory-graph/inspector-compute.js');
        const { selectGraph } = await import('/scripts/extensions/memory-graph/graph-inspector.js');
        const snapshot = largeMemory(3000); let ticks = 0; const timer = setInterval(() => { ticks++; }, 10);
        const start = performance.now();
        const { graph } = await computeInspector(snapshot);
        const elapsedMs = performance.now() - start; clearInterval(timer);
        const visible = selectGraph(graph);
        const diagnostics = await computeInspector(snapshot, { mode: 'diagnostics', query: 'Where is Person 42?' });
        const controller = new AbortController(); const cancelled = computeInspector(snapshot, { signal: controller.signal }); controller.abort();
        let cancellation;
        try { await cancelled; cancellation = 'incorrectly completed'; } catch (error) { cancellation = error.name; }
        window.performanceDiagnosticPopup = openMemoryDiagnostics(window.Atria.getContext(), largeMemory(30));
        return { ticks, elapsedMs, entities: graph.entities.length, relations: graph.relations.length,
            drawn: [visible.entities.length, visible.relations.length], top: diagnostics.candidates[0].id, cancellation };
    });
    assert.equal(result.entities, 3001); assert.equal(result.relations, 3000); assert(result.ticks > 1);
    assert(result.drawn[0] <= 250 && result.drawn[1] <= 600); assert.equal(result.top, 'relation:r42'); assert.equal(result.cancellation, 'AbortError');
    const root = page.locator('.memory-os-diagnostics');
    await root.locator('pre').filter({ hasText: 'corpus' }).waitFor();
    await root.getByLabel('诊断查询', { exact: true }).fill('Where is Person 4?');
    await root.getByRole('button', { name: '运行诊断', exact: true }).click();
    await root.locator('pre').filter({ hasText: 'relation:r4' }).waitFor();
    assert(await root.evaluate(el => el.scrollWidth <= el.clientWidth + 2));
    if (process.argv[4]) await page.screenshot({ path: process.argv[4] });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ browser: browser.version(), cpuThrottle: 4, viewport: '390x844', ...result,
        checks: ['real module worker', '3000-edge graph', 'main-thread heartbeat', 'draw limits', 'ranking replay', 'worker cancellation', 'diagnostic query UI', 'no horizontal overflow'], pageErrors: errors }, null, 2));
} finally { await browser.close(); }
