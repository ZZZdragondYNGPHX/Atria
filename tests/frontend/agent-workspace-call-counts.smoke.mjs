import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const root = resolve(fileURLToPath(new URL('../../public', import.meta.url)));
const server = createServer(async (req, res) => {
    try {
        if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta name="viewport" content="width=device-width"><title>Call counters</title>'); return; }
        const path = resolve(root, `.${new URL(req.url, 'http://localhost').pathname}`);
        if (!path.startsWith(root + sep) || !/\.(js|css)$/.test(path)) throw new Error('Not an asset');
        res.setHeader('Content-Type', path.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(await readFile(path));
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
    browser = await chromium.launch({ channel: process.env.ENGINE_BROWSER || 'msedge', headless: true });
    for (const width of [390, 1280]) {
        const page = await browser.newPage({ viewport: { width, height: 844 } });
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.evaluate(async () => {
            const table = {};
            window.Atria = { getContext: () => ({ addLocaleData: (locale, values) => { if (locale === 'zh-cn') Object.assign(table, values); }, translate: value => table[value] || value }) };
            const locale = await import('/scripts/extensions/orchestrator/i18n.js'); locale.registerLocaleData();
            window.store = await import('/scripts/extensions/orchestrator/run-state/store.js');
            window.panel = await import('/scripts/extensions/orchestrator/workspace/panel.js');
            window.runId = window.store.startRun({ mode: 'agenda', quiet: true });
            let version = 0;
            window.add = (type, effectId) => window.store.recordRuntimeEvent({ runId: window.runId, event: {
                eventId: `event-${++version}`, runId: 'worker', agentId: 'agent', version, generation: 1, status: 'running', type, effectId,
            } });
            window.add('memory.recall.completed', 'memory'); window.add('model.request.started', 'model');
            window.add('tool.execute.started', 'tool'); window.panel.openWorkspace('Run');
        });
        await page.waitForSelector('.workspace-metrics');
        const metrics = page.locator('.workspace-metrics .workspace-metric');
        const metricValue = async label => {
            const card = metrics.filter({ has: page.locator('.workspace-metric-label', { hasText: label }) });
            return card.locator('.workspace-metric-value').innerText();
        };
        assert.equal(await metricValue('内部调用'), '2');
        assert.equal(await metricValue('工具调用'), '1');
        await page.evaluate(() => { window.add('model.request.completed', 'model'); window.add('tool.execute.completed', 'tool'); window.panel.openWorkspace('Run'); });
        assert.equal(await metricValue('内部调用'), '2');
        assert.equal(await metricValue('工具调用'), '1');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: resolve(process.env.SCREENSHOT_DIR, `calls-${width}.png`) });
        await page.evaluate(() => { window.store.finishRun({ runId: window.runId, status: 'committed' }); window.store.clearCurrentRun(); window.panel.openWorkspace('Run'); });
        assert.equal(await page.locator('.workspace-metrics').count(), 0);
        assert.deepEqual(errors, []);
        await page.close();
    }
    console.log('PASS call counters: zh-CN, 390px/1280px, live completion dedup, run reset, no overflow/errors');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
