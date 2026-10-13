import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { resolve, sep, extname, join } from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { a2uiFixture } from '../native/helpers/a2ui-s32-fixture.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { services } from '../native/helpers/session-fixture.js';
import { buildAtriaPackageContainer } from '../../src/native/index.js';
import { FrontendBridgeService } from '../../src/native/frontend/host-bridge.js';
import { setConfigFilePath } from '../../src/util.js';

setConfigFilePath(resolve('default/config.yaml'));
const root = resolve('public'), output = await mkdtemp(join(os.tmpdir(), 'atria-s32-evidence-'));
const h = await makeTempFsEngineHarness(), svc = services(h), host = new FrontendBridgeService(), fixtures = new Map();
const browser = await chromium.launch({ channel: process.env.ATRIA_BROWSER_CHANNEL || 'msedge', headless: true });
const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        const json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
        if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:16px system-ui;background:#fafafa;color:#171717}</style><div id="surface"></div></html>'); return; }
        if (url.pathname === '/fixture') {
            const f = a2uiFixture({ interactive: !url.searchParams.has('text'), deleted: url.searchParams.has('deleted') });
            await svc.packageInstaller.install(h.handle, buildAtriaPackageContainer({ manifest: f.manifest, sourceFiles: f.files }).archive);
            const base = await svc.core.create(h.handle, { packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId, entryPointId: f.entryPointId });
            fixtures.set(base.session.sessionId, { f, base, requests: [] });
            json({ sessionId: base.session.sessionId, revision: base.revision.revisionId, entry: f.compiled.entry,
                files: Object.fromEntries([...f.compiled.files].map(([path, bytes]) => [path, bytes.toString('base64')])) }); return;
        }
        if (url.pathname === '/audit') {
            const record = fixtures.get(url.searchParams.get('sessionId'));
            const current = await svc.core.load(h.handle, record.base.session.sessionId);
            json({ revision: current.revision.revisionId, originalRevision: record.base.revision.revisionId,
                notes: current.states.atri_lifecycle.domains.notes.records, writes: record.requests.filter(item => item.method === 'action.invoke') }); return;
        }
        if (url.pathname.startsWith('/api/native/session/frontend/')) {
            let body = ''; for await (const chunk of req) body += chunk;
            const input = JSON.parse(body), method = url.pathname.split('/').at(-1);
            const record = fixtures.get(input.sessionId ?? host.experiences.get(input.epoch)?.sessionId);
            if (method === 'request' && input.method === 'action.invoke') {
                record.requests.push(input);
                // A held local response lets the browser observe real busy UI.
                await new Promise(done => setTimeout(done, 250));
            }
            json(method === 'open' ? await host.open(svc, h.handle, input.sessionId, input.previous)
                : method === 'close' ? (host.close(h.handle, input.epoch), {}) : await host.request(svc, h.handle, input)); return;
        }
        const file = resolve(root, '.' + url.pathname); if (!file.startsWith(root + sep)) throw new Error('fixture_path_denied');
        res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[extname(file)] ?? 'application/octet-stream'); res.end(await readFile(file));
    } catch (error) { console.error(error); res.writeHead(500); res.end('{}'); }
});
await new Promise(ready => server.listen(0, '127.0.0.1', ready));
const origin = `http://127.0.0.1:${server.address().port}`, summaries = [];
try {
    for (const width of [1280, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 850 }, reducedMotion: 'reduce' }), errors = [], external = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => {
            if (route.request().url().startsWith(origin + '/')) return route.continue();
            external.push(route.request().url()); return route.abort();
        });
        await page.goto(origin);
        async function mount(query = '') {
            await page.evaluate(async query => {
                window.runtime?.dispose();
                const { mountNativeFrontend } = await import('/scripts/native/frontend/runtime.js');
                const { frontendHttpTransport } = await import('/scripts/native/frontend/bridge.js');
                const f = await (await fetch('/fixture' + query)).json(); window.fixture = f; window.diagnostics = [];
                const transport = frontendHttpTransport({ sessionId: f.sessionId }); window.failNextAction = null;
                window.runtime = await mountNativeFrontend({ document, window, mode: 'full', entry: f.entry, onDiagnostic: value => window.diagnostics.push(value),
                    bridgeTransport: { ...transport, async request(input, signal) {
                        if (window.failNextAction && input.method === 'action.invoke') { input = { ...input, revision: window.failNextAction }; window.failNextAction = null; }
                        const result = await transport.request(input, signal);
                        if (input.method === 'action.invoke') window.actionReceipt = result;
                        return result;
                    } }, loadBytes: async path => Uint8Array.from(atob(f.files[path]), char => char.charCodeAt(0)),
                    surfaceHost: { mount() { const container = document.createElement('div'); document.getElementById('surface').append(container); return { container, unmount: () => container.remove() }; } } });
            }, query);
            await expect(page.locator('[data-node-id="notes"]')).toHaveAttribute('data-bridge-status', 'completed');
        }
        const audit = () => page.evaluate(async () => (await (await fetch('/audit?sessionId=' + window.fixture.sessionId)).json()));
        await mount();
        const button = page.getByRole('button', { name: '确认公开备注' });
        await expect(button).toBeVisible();
        assert.ok((await button.boundingBox()).height >= 44);
        await page.keyboard.press('Tab'); await expect(button).toBeFocused();
        assert.equal(await button.evaluate(node => getComputedStyle(node).outlineStyle !== 'none'), true);
        await page.keyboard.press('Enter'); await expect(button).toBeDisabled();
        await expect(page.getByRole('status').filter({ hasText: '正在确认…' })).toBeVisible();
        await expect(page.locator('[data-node-id="notesList"]')).toContainText('已由界面确认'); await expect(button).toBeEnabled();
        const after = await audit();
        assert.notEqual(after.revision, after.originalRevision); assert.equal(after.writes.length, 1);
        assert.equal(after.writes[0].componentId, 'External'); assert.equal(after.writes[0].bindingId, 'save');
        assert.deepEqual(after.writes[0].input, { label: '已由界面确认' });
        assert.equal(after.notes[0].value.text, '已由界面确认');
        await page.evaluate(() => { window.failNextAction = window.fixture.revision; });
        await button.click(); await expect(page.getByRole('status').filter({ hasText: '确认未完成，请刷新后重试。' })).toBeVisible();
        const stale = await page.evaluate(() => window.actionReceipt);
        assert.equal(stale.error.code, 'bridge_revision_stale'); assert.equal((await audit()).revision, after.revision);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.screenshot({ path: join(output, `interactive-${width}.png`), fullPage: true });
        await mount('?text=1');
        await expect(page.getByRole('button', { name: '确认公开备注' })).toHaveCount(0);
        await expect(page.getByText('确认公开备注', { exact: true })).toBeVisible();
        assert.equal((await audit()).writes.length, 0);
        await page.screenshot({ path: join(output, `text-${width}.png`), fullPage: true });
        await mount('?deleted=1'); await expect(page.getByText('这张任务卡已关闭，请继续使用原文字界面。')).toBeVisible();
        assert.equal((await audit()).writes.length, 0);
        assert.deepEqual(external, []); assert.deepEqual(errors, []); assert.deepEqual(await page.evaluate(() => window.diagnostics), []);
        await page.evaluate(() => window.runtime.dispose()); await page.close(); summaries.push({ width, interaction: true, revision: true, staleRejected: true, textFallback: true, deletedFallback: true });
    }
    console.log(JSON.stringify({ stage: 'S32', status: 'browser_passed', externalRequests: 0, checks: summaries, screenshots: output }));
} finally { await browser.close(); server.closeAllConnections(); await new Promise(done => server.close(done)); host.dispose(); await h.cleanup(); }
