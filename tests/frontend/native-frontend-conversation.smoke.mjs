import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { conversationFixture } from '../native/helpers/frontend-conversation-fixture.js';
import { services } from '../native/helpers/session-fixture.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { buildAtriaPackageContainer } from '../../src/native/index.js';
import { FrontendBridgeService } from '../../src/native/frontend/host-bridge.js';

const root = resolve('public'), output = resolve('.git/frontend-v3-conversation-evidence');
await mkdir(output, { recursive: true });
const h = await makeTempFsEngineHarness(), svc = services(h), host = new FrontendBridgeService();
const fixtures = Object.fromEntries(['component', 'hybrid', 'full'].map(mode => [mode, conversationFixture(mode)]));
for (const fixture of Object.values(fixtures)) {
    const { archive } = buildAtriaPackageContainer({ manifest: fixture.manifest, sourceFiles: fixture.files });
    await svc.packageInstaller.install(h.handle, archive);
}
const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px system-ui;background:#e3e9ed}#surface{height:800px}button,input{font:inherit;margin:8px}output{display:block}</style><button id="host">Host control</button><div id="surface"></div>'); return; }
        if (url.pathname === '/fixture') {
            const fixture = fixtures[url.searchParams.get('mode')], base = await svc.core.create(h.handle, { packageId: fixture.manifest.packageId, packageVersionId: fixture.manifest.packageVersionId, entryPointId: fixture.entryPointId });
            let snapshot = base;
            snapshot = await svc.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: '**Hello** <img src=x onerror=alert(1)>' }, { expectedRevisionId: snapshot.revision.revisionId });
            snapshot = await svc.core.appendTimeline(h.handle, base.session.sessionId, { role: 'assistant', content: '# Reply', projection: { schemaVersion: 1, flow: [{ kind: 'prose', text: '# Reply' }, { kind: 'block', id: 'one', type: 'card', version: 1, data: { label: 'Typed message card' } }] } }, { expectedRevisionId: snapshot.revision.revisionId });
            res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ sessionId: base.session.sessionId, entry: fixture.compiled.entry, files: Object.fromEntries([...fixture.compiled.files].map(([path, bytes]) => [path, bytes.toString('base64')])) })); return;
        }
        if (url.pathname.startsWith('/api/native/session/frontend/')) {
            let body = ''; for await (const chunk of req) body += chunk; const input = JSON.parse(body);
            const method = url.pathname.split('/').at(-1);
            const result = method === 'open' ? await host.open(svc, h.handle, input.sessionId, input.previous)
                : method === 'close' ? (host.close(h.handle, input.epoch), {}) : await host.request(svc, h.handle, input);
            res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result)); return;
        }
        const path = resolve(root, '.' + url.pathname); if (!path.startsWith(root + sep)) throw new Error('Path');
        res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[extname(path)] ?? 'application/octet-stream'); res.end(await readFile(path));
    } catch (error) { console.error(error); res.writeHead(500); res.end('{}'); }
});
await new Promise(ready => server.listen(0, '127.0.0.1', ready));
const browser = await chromium.launch({ channel: process.env.ATRIA_BROWSER_CHANNEL || 'msedge', headless: true });
try {
    for (const mode of ['component', 'hybrid', 'full']) for (const width of [1440, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 1000 } }), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.evaluate(async mode => {
            const { mountNativeFrontend } = await import('/scripts/native/frontend/runtime.js');
            const { frontendHttpTransport } = await import('/scripts/native/frontend/bridge.js');
            const { mountStudioPreviewUi } = await import('/scripts/native/studio-preview-ui.js');
            const compiled = await (await fetch('/fixture?mode=' + mode)).json(); window.compiled = compiled; window.diagnostics = []; window.failOpen = false;
            const transport = frontendHttpTransport({ sessionId: compiled.sessionId });
            window.runtime = await mountNativeFrontend({ document, window, mode, entry: compiled.entry, onDiagnostic: value => window.diagnostics.push(value),
                bridgeTransport: { ...transport, open(...args) { if (window.failOpen) throw new Error('Injected rebind failure'); return transport.open(...args); } },
                hostServices: { async invoke(target) {
                    if (target.method === 'submit') { window.submitting = true; return new Promise(resolve => window.finishSubmit = resolve); }
                    if (target.method === 'cancel') { window.cancelled = true; window.finishSubmit?.({}); return {}; }
                    return { state: 'streaming', text: '*Uncommitted*', error: '' };
                } },
                loadBytes: async path => Uint8Array.from(atob(compiled.files[path]), char => char.charCodeAt(0)),
                surfaceHost: { mount() { const container = document.createElement('div'); document.getElementById('surface').append(container); return { container, unmount: () => container.remove() }; } },
            });
            window.preview = async () => { window.runtime.dispose(); window.runtime = await mountStudioPreviewUi(document, document.getElementById('surface'), JSON.parse(atob(compiled.files[compiled.entry])), mode, value => window.diagnostics.push(value), { ...compiled, bridgeProjections: { messages: [], blocks: [], generation: { state: 'idle', text: '', error: '' } } }); };
        }, mode);
        await expect(page.locator('[data-node-id="message"]')).toHaveCount(2);
        await expect(page.locator('[data-node-id="prose"] strong')).toHaveText('Hello');
        assert.equal(await page.locator('[data-node-id="prose"] img').count(), 0);
        assert.equal(await page.locator('[data-atria-message-id]').count(), 0);
        await expect(page.locator('[data-node-id="generation"]')).toHaveText('streaming');
        await expect(page.locator('[data-node-id="provisional"] em')).toHaveText('Uncommitted');
        assert.equal(await page.locator('[data-node-id="message"]').count(), 2);
        await page.getByRole('button', { name: 'Earlier / next page', exact: true }).click();
        await expect(page.locator('[data-node-id="message"]')).toHaveCount(1);
        await expect(page.locator('[data-node-id="prose"] h1')).toHaveText('Reply');
        await page.getByRole('button', { name: 'Message Blocks', exact: true }).click();
        await expect(page.locator('[data-node-id="card"]')).toHaveText('Typed message card');
        await page.getByRole('button', { name: 'SavePoint', exact: true }).click();
        await expect(page.locator('[data-node-id="saved"]')).toHaveText('completed');
        await page.getByRole('button', { name: 'Submit', exact: true }).click();
        await expect.poll(() => page.evaluate(() => window.submitting)).toBe(true);
        await page.getByRole('button', { name: 'Cancel generation', exact: true }).click();
        await expect.poll(() => page.evaluate(() => window.cancelled)).toBe(true);
        await expect(page.locator('[data-node-id="submitted"]')).toHaveText('completed');
        await page.evaluate(() => window.runtime.recover());
        await expect(page.locator('[data-node-id="message"]')).toHaveCount(2);
        await page.screenshot({ path: resolve(output, `${mode}-${width}.png`), fullPage: true });
        await page.evaluate(async () => { window.failOpen = true; await window.runtime.recover().catch(() => {}); });
        await expect(page.getByRole('alert')).toContainText('Presentation recovery failed');
        assert.equal(await page.locator('[data-node-id="message"]').count(), 0);
        await page.evaluate(() => window.failOpen = false);
        await page.getByRole('button', { name: 'Reload presentation', exact: true }).click();
        await expect(page.locator('[data-node-id="message"]')).toHaveCount(2);
        await expect(page.getByRole('alert')).toHaveCount(0);
        await page.evaluate(() => window.preview());
        await page.getByRole('button', { name: 'SavePoint', exact: true }).click();
        await expect(page.locator('[data-node-id="saved"]')).toHaveText('failed');
        await expect(page.locator('[data-node-id="message"]')).toHaveCount(0);
        assert.deepEqual(await page.evaluate(() => window.diagnostics), []); assert.deepEqual(errors, []);
        await page.evaluate(() => window.runtime.dispose()); await page.close(); console.log(`PASS Conversation ${mode} ${width}`);
    }
} finally { await browser.close(); await new Promise(done => server.close(done)); host.dispose(); await h.cleanup(); }
