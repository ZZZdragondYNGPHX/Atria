import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const root = resolve(fileURLToPath(new URL('../../public', import.meta.url)));
const server = createServer(async (req, res) => {
    try {
        if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/atria-tokens.css"><link rel="stylesheet" href="/scripts/agents/orchestrator/workspace/panel.css"><style>body{margin:0;background:#171b23;color:#e5e7eb;font-family:system-ui}#agent-memory-workspace{position:static;width:100%;height:auto;min-height:100vh}*{box-sizing:border-box}</style><main id="agent-memory-workspace" data-atria-workspace-embedded="true"><div id="view"></div></main>'); return; }
        const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
        if (!path.startsWith(root + sep)) throw new Error('outside root');
        res.setHeader('Content-Type', path.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(await readFile(path));
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    // Isolate shell dependency ports while rendering the production settings template.
    await page.route('**/scripts/utils.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const escapeHtml = s => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll("\\\"", "&quot;");' }));
    await page.route('**/scripts/i18n.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const translate = s => s;' }));
    await page.route('**/scripts/atria-shell/localization.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const translateShellText = s => s; export const formatShellText = (s, ...values) => values.reduce((text, value, i) => text.replaceAll("${" + i + "}", String(value)), s);' }));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async () => {
        window.controls = { enabled: true, sourceWritesEnabled: false, recallEnabled: true };
        window.fail = false;
        const service = { getStatus: () => window.controls,
            setControl: async (name, value) => { if (window.fail) throw new Error('controlled save failure'); window.controls[name] = value; },
            load: async () => ({ state: { episodes: {}, corrections: {} } }),
            inspect: async () => ({ graph: { entities: [], relations: [] }, facts: [] }) };
        const context = { constants: {}, translate: s => s, addLocaleData() {}, getCapabilityApi: () => ({ getWorkspacePorts: () => service }) };
        window.Atria = { getContext: () => context };
        const { createMemoryWorkspace } = await import('/scripts/agents/orchestrator/workspace/memory/page.js');
        const el = (tag, text, parent) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; parent?.append(e); return e; };
        const button = (parent, text, click) => { const b = el('button', text, parent); b.type = 'button'; b.addEventListener('click', click); return b; };
        createMemoryWorkspace({ getContext: () => context })(document.querySelector('#view'), { el, button, getView: () => ({}) });
    });
    await page.getByText('Source writes', { exact: true }).waitFor();
    assert.equal(await page.getByText('Recall method', { exact: true }).count(), 0);
    const source = page.getByText('Source writes', { exact: true }).locator('..').locator('..').locator('input');
    assert.equal(await source.isChecked(), false);
    const recall = page.getByText('Recall', { exact: true }).locator('..').locator('..').locator('input');
    assert.equal(await recall.isChecked(), true);
    await source.check(); await page.waitForFunction(() => window.controls.sourceWritesEnabled === true);
    await page.evaluate(() => { window.fail = true; }); await source.click();
    await page.getByRole('alert').getByText('controlled save failure').waitFor();
    assert.equal(await page.evaluate(() => window.controls.sourceWritesEnabled), true);
    assert.equal(await source.isChecked(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    if (process.env.ATRIA_HM_UI_OUTPUT) {
        await page.screenshot({ path: process.env.ATRIA_HM_UI_OUTPUT, fullPage: true });
        await writeFile(process.env.ATRIA_HM_UI_OUTPUT + '.json', JSON.stringify({ browser: 'msedge', viewport: [390, 844], sourceReadIndependent: true, saveFailureVisible: true, noOverflow: true, errors }));
    }
    await page.evaluate(async () => {
        const { buildMemoryGraphSettingsHtml } = await import('/scripts/agents/memory/ui-templates.js');
        const escapeHtml = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
        document.querySelector('#view').innerHTML = buildMemoryGraphSettingsHtml({ escapeHtml, i18n: s => s,
            UI_BLOCK_ID: 'hm-settings', world_info_position: { before: 0, after: 1, atDepth: 4 },
            extension_prompt_roles: { SYSTEM: 0, USER: 1, ASSISTANT: 2 }, nativeRuntime: false });
    });
    for (const retired of ['recall_method', 'rag_rewrite_enabled', 'recall_api_preset', 'recall_preset']) {
        assert.equal(await page.locator(`[id*="${retired}"]`).count(), 0);
    }
    await page.getByText('Retrieval and injection', { exact: true }).click();
    await page.getByRole('combobox', { name: 'Embedding profile', exact: true }).waitFor();
    assert.equal(await page.locator('#atria_rpg_memory_rerank_block').isVisible(), false);
    await page.getByRole('checkbox', { name: 'Enable rerank', exact: true }).focus();
    assert.equal(await page.getByRole('checkbox', { name: 'Enable source writes', exact: false }).count(), 1);
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.ATRIA_HM_UI_OUTPUT) await page.screenshot({ path: process.env.ATRIA_HM_UI_OUTPUT.replace('.png', '-settings.png'), fullPage: true });
    console.log('HM1 actual Memory workspace: source/recall toggles, save error, mobile width passed');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
