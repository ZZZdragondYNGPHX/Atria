import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { resolve, sep, extname, join } from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { expressionFrontendFixture, expressionPortraits } from '../native/helpers/expression-frontend-fixture.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { FrontendBridgeService } from '../../src/native/frontend/host-bridge.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { setConfigFilePath } from '../../src/util.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';

setConfigFilePath(resolve('default/config.yaml'));
const root = resolve('public'), output = await mkdtemp(join(os.tmpdir(), 'atria-s29-evidence-'));
const h = await makeTempFsEngineHarness(), host = new FrontendBridgeService(), fixtures = new Map();
const browser = await chromium.launch({ channel: process.env.ATRIA_BROWSER_CHANNEL || 'msedge', headless: true });
const portraits = {};
const raster = await browser.newPage({ viewport: { width: 240, height: 240 }, deviceScaleFactor: 1 });
for (const [intent, svg] of Object.entries(expressionPortraits)) {
    await raster.setContent('<style>body{margin:0}</style>' + svg);
    portraits[intent] = await raster.locator('svg').screenshot();
}
await raster.close();
const hashState = base => hashNativeDocument({ revision: base.revision, states: base.states, timeline: base.timeline });
const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:16px system-ui;background:#e3e9ed}#surface{min-height:800px}</style><div id="surface"></div></html>'); return; }
        if (url.pathname === '/fixture') {
            setReadOnly(false);
            const f = await expressionFrontendFixture(h, portraits, { mode: url.searchParams.get('mode'), intent: url.searchParams.get('intent') ?? 'inform', broken: url.searchParams.has('broken'), configured: !url.searchParams.has('fallback'), otherActor: url.searchParams.has('other') });
            assert(f.undefinedAssetRejected());
            const id = f.base.session.sessionId; f.expectedHash = hashState(f.current()); f.expectedCosts = await f.core.runs.status(h.handle, id); fixtures.set(id, f);
            setReadOnly(true);
            res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ sessionId: id, actorId: f.actorId, entry: f.compiled.entry,
                files: Object.fromEntries([...f.compiled.files].map(([path, bytes]) => [path, bytes.toString('base64')])) })); return;
        }
        if (url.pathname === '/mutate') {
            const f = fixtures.get(url.searchParams.get('sessionId')); setReadOnly(false);
            const action = url.searchParams.get('kind') === 'revoke' ? { kind: 'app.command', domainId: 'beliefs', recordId: 'public', commandId: 'revoke', args: {} }
                : { kind: 'scope.transition', scopeId: 'session', status: 'suspended' };
            await f.command(action); f.expectedHash = hashState(f.current()); setReadOnly(true);
            res.setHeader('Content-Type', 'application/json'); res.end('{}'); return;
        }
        if (url.pathname === '/audit') {
            const f = fixtures.get(url.searchParams.get('sessionId'));
            const state = [...host.experiences.values()].find(value => value.sessionId === f.base.session.sessionId && !value.revoked);
            const denied = await host.request(f, h.handle, { epoch: state.epoch, componentId: 'Main', bindingId: 'undeclaredExpression',
                method: 'read.snapshot', input: {}, revision: f.current().revision.revisionId });
            assert.equal(denied.error.code, 'bridge_binding_denied');
            assert.equal(hashState(await f.core.load(h.handle, f.base.session.sessionId)), f.expectedHash);
            assert.deepEqual(await f.core.runs.status(h.handle, f.base.session.sessionId), f.expectedCosts);
            res.setHeader('Content-Type', 'application/json'); res.end('{"readonlyStateAndCosts":true}'); return;
        }
        if (url.pathname.startsWith('/api/native/session/frontend/')) {
            let body = ''; for await (const chunk of req) body += chunk;
            const input = JSON.parse(body), f = fixtures.get(input.sessionId) ?? [...fixtures.values()].find(value => host.experiences.get(input.epoch)?.sessionId === value.base.session.sessionId);
            const method = url.pathname.split('/').at(-1);
            const result = method === 'open' ? await host.open(f, h.handle, input.sessionId, input.previous)
                : method === 'close' ? (host.close(h.handle, input.epoch), {}) : await host.request(f, h.handle, input);
            res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result)); return;
        }
        const file = resolve(root, '.' + url.pathname); if (!file.startsWith(root + sep)) throw new Error('fixture_path_denied');
        res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[extname(file)] ?? 'application/octet-stream'); res.end(await readFile(file));
    } catch (error) { console.error(error); res.writeHead(500); res.end('{}'); }
});
await new Promise(ready => server.listen(0, '127.0.0.1', ready));
const origin = `http://127.0.0.1:${server.address().port}`, summaries = [];
try {
    const targeted = process.argv.includes('--targeted');
    for (const mode of targeted ? ['full'] : ['component', 'hybrid', 'full']) for (const width of targeted ? [390] : [1440, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' }), errors = [], external = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => {
            if (route.request().url().startsWith(origin + '/')) return route.continue();
            external.push(route.request().url()); return route.abort();
        });
        await page.goto(origin);
        async function mount(query = '') {
            await page.evaluate(async ({ mode, query }) => {
                window.runtime?.dispose();
                const { mountNativeFrontend } = await import('/scripts/native/frontend/runtime.js');
                const { frontendHttpTransport } = await import('/scripts/native/frontend/bridge.js');
                const f = await (await fetch('/fixture?mode=' + mode + query)).json(); window.fixture = f; window.diagnostics = [];
                window.runtime = await mountNativeFrontend({ document, window, mode, entry: f.entry, onDiagnostic: value => window.diagnostics.push(value),
                    bridgeTransport: frontendHttpTransport({ sessionId: f.sessionId }), loadBytes: async path => Uint8Array.from(atob(f.files[path]), char => char.charCodeAt(0)),
                    surfaceHost: { mount() { const container = document.createElement('div'); document.getElementById('surface').append(container); return { container, unmount: () => container.remove() }; } } });
            }, { mode, query });
            await expect(page.locator('[data-node-id="status"]')).toHaveAttribute('data-bridge-status', 'completed');
        }
        const image = id => page.locator(`[data-node-id="${id}"]`);
        async function audit() {
            assert.equal(await page.evaluate(async () => (await (await fetch('/audit?sessionId=' + window.fixture.sessionId)).json()).readonlyStateAndCosts), true);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            await expect(page.locator('[data-node-id="fallback"]')).toBeVisible();
        }
        async function exactHash(id) {
            assert.equal(await image(id).evaluate(async (img, assetId) => {
                const graph = JSON.parse(atob(window.fixture.files[window.fixture.entry]));
                const expected = graph.resources.find(ref => ref.id === 'asset:' + assetId).contentHash;
                const bytes = await (await fetch(img.src)).arrayBuffer();
                const actual = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
                return actual === expected;
            }, id), true);
        }
        await mount(); await expect(image('inform')).toBeVisible(); await expect(image('reassure')).toBeHidden();
        await expect.poll(() => image('inform').evaluate(img => img.complete && img.naturalWidth === 240)).toBe(true);
        await exactHash('inform');
        await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: '继续阅读文字' })).toBeFocused(); await page.keyboard.press('Enter');
        await expect(page.locator('[data-node-id="reading"]')).toHaveText('文字回应始终可用。');
        await audit(); await page.screenshot({ path: join(output, `${mode}-${width}-inform.png`), fullPage: true });
        await page.evaluate(async () => { await fetch('/mutate?kind=revoke&sessionId=' + window.fixture.sessionId); });
        await expect(page.locator('[data-node-id="status"]')).toHaveText('fallback'); await expect(image('inform')).toBeHidden(); await audit();
        await mount('&intent=reassure'); await expect(image('reassure')).toBeVisible();
        await expect.poll(() => image('reassure').evaluate(img => img.complete && img.naturalWidth === 240)).toBe(true);
        await exactHash('reassure');
        await page.screenshot({ path: join(output, `${mode}-${width}-reassure.png`), fullPage: true });
        await page.evaluate(async () => { await fetch('/mutate?kind=scope&sessionId=' + window.fixture.sessionId); });
        await expect(page.locator('[data-node-id="status"]')).toHaveText('fallback'); await expect(image('reassure')).toBeHidden(); await audit();
        await mount('&intent=ask'); await expect(image('inform')).toBeHidden(); await expect(image('reassure')).toBeHidden(); await audit();
        await mount('&other=1'); await expect(page.locator('[data-node-id="status"]')).toHaveText('ready');
        await expect(image('inform')).toBeHidden(); await expect(image('reassure')).toBeHidden(); await audit();
        await mount('&fallback=1'); await expect(page.locator('[data-node-id="status"]')).toHaveText('fallback'); await audit();
        await mount('&broken=1'); await expect.poll(() => image('inform').evaluate(img => img.complete && img.naturalWidth === 0)).toBe(true); await audit();
        await expect(image('inform')).toHaveAttribute('data-media-status', 'unavailable');
        await expect(image('inform')).toHaveAttribute('data-media-reason', 'media_decode_failed');
        await page.screenshot({ path: join(output, `${mode}-${width}-broken-fallback.png`), fullPage: true });
        await image('inform').evaluate(img => { window.oldImage = img; });
        await mount(); await expect.poll(() => image('inform').evaluate(img => img.complete && img.naturalWidth === 240)).toBe(true);
        await expect(image('inform')).toHaveAttribute('data-media-status', 'available');
        await page.evaluate(() => { window.oldImage.dispatchEvent(new Event('error')); window.oldImage.dispatchEvent(new Event('load')); });
        await image('inform').evaluate(img => img.dispatchEvent(new Event('error')));
        await expect(image('inform')).toHaveAttribute('data-media-status', 'available'); await exactHash('inform'); await audit();
        await page.screenshot({ path: join(output, `${mode}-${width}-decode-restored.png`), fullPage: true });
        assert.deepEqual(external, []); assert.deepEqual(errors, []);
        await page.evaluate(() => window.runtime.dispose()); await page.close(); summaries.push({ mode, width, passed: true });
    }
    console.log(JSON.stringify({ stage: 'S29', status: 'browser_passed', externalRequests: 0, checks: summaries, screenshots: output }));
} finally { setReadOnly(false); await browser.close(); server.closeAllConnections(); await new Promise(done => server.close(done)); host.dispose(); await h.cleanup(); }
