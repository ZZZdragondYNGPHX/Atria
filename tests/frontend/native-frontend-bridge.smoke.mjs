import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { bridgeFixture } from '../native/helpers/frontend-bridge-fixture.js';
import { services } from '../native/helpers/session-fixture.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { buildAtriaPackageContainer } from '../../src/native/index.js';
import { FrontendBridgeService } from '../../src/native/frontend/host-bridge.js';

const root = resolve('public'), output = resolve('.git/frontend-v3-bridge-evidence');
await mkdir(output, { recursive: true });
const h = await makeTempFsEngineHarness(), svc = services(h), host = new FrontendBridgeService();
const fixtures = Object.fromEntries(['component', 'hybrid', 'full'].map(mode => [mode, bridgeFixture(mode)]));
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
            for (const id of ['a', 'b', 'c']) snapshot = await svc.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId: id, action: { kind: 'app.command', domainId: 'notes', recordId: id, commandId: 'save', args: { text: id } } }, { expectedRevisionId: snapshot.revision.revisionId });
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
            const compiled = await (await fetch('/fixture?mode=' + mode)).json(); window.compiled = compiled; window.diagnostics = [];
            window.runtime = await mountNativeFrontend({ document, window, mode, entry: compiled.entry, onDiagnostic: value => window.diagnostics.push(value),
                bridgeTransport: frontendHttpTransport({ sessionId: compiled.sessionId }),
                loadBytes: async path => Uint8Array.from(atob(compiled.files[path]), char => char.charCodeAt(0)),
                surfaceHost: { mount() { const container = document.createElement('div'); document.getElementById('surface').append(container); return { container, unmount: () => container.remove() }; } },
            });
            window.preview = async () => { window.runtime.dispose(); window.runtime = await mountStudioPreviewUi(document, document.getElementById('surface'), JSON.parse(atob(compiled.files[compiled.entry])), mode, value => window.diagnostics.push(value), { ...compiled, bridgeProjections: { notes: [], page: [] } }); };
        }, mode);
        await expect(page.locator('[data-node-id="notes"]')).toHaveAttribute('data-bridge-status', 'completed');
        await page.getByRole('textbox', { name: 'Note' }).fill('Browser typed action');
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(page.locator('[data-node-id="receipt"]')).toHaveText('completed');
        assert.match(await page.locator('[data-node-id="notes"]').textContent(), /Browser typed action/);
        await page.getByRole('button', { name: 'Read page', exact: true }).click();
        await expect(page.locator('[data-node-id="row"]')).toHaveCount(2);
        assert.deepEqual(await page.locator('[data-node-id="row"]').allTextContents(), ['a', 'b']);
        await page.getByRole('button', { name: 'Next page', exact: true }).click();
        await expect(page.locator('[data-node-id="row"]').first()).toHaveText('c');
        assert.deepEqual(await page.locator('[data-node-id="row"]').allTextContents(), ['c', 'main']);
        await page.evaluate(() => window.runtime.recover());
        await expect(page.locator('[data-node-id="notes"]')).toHaveAttribute('data-bridge-status', 'completed');
        assert.equal(await page.getByRole('textbox', { name: 'Note' }).inputValue(), 'from UI');
        await page.screenshot({ path: resolve(output, `${mode}-${width}.png`), fullPage: true });
        await page.evaluate(() => window.preview());
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(page.locator('[data-node-id="receipt"]')).toHaveText('failed');
        assert.equal(await page.locator('[data-node-id="notes"]').textContent(), '[]');
        assert.deepEqual(await page.evaluate(() => window.diagnostics), []); assert.deepEqual(errors, []);
        await page.evaluate(() => window.runtime.dispose()); await page.close(); console.log(`PASS Bridge ${mode} ${width}`);
    }
} finally { await browser.close(); await new Promise(done => server.close(done)); host.dispose(); await h.cleanup(); }
