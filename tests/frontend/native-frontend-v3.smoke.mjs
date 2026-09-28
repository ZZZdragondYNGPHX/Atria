import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { presentationFixture } from '../native/helpers/frontend-presentation-fixture.js';

const root = resolve('public'), output = resolve('.git/frontend-v3-evidence');
await mkdir(output, { recursive: true });
const font = await readFile('public/webfonts/NotoSans/NotoSans-Regular.woff2');
const builds = Object.fromEntries(['component', 'hybrid', 'full'].map(mode => [mode, presentationFixture(mode, font).compile()]));
const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;background:#e3e9ed;font:16px system-ui}#host{height:60px;padding:8px;box-sizing:border-box}#surface{height:900px;max-width:900px;margin:auto}.atria-game-recovery-actions{display:flex;flex-wrap:wrap;gap:4px}#atria-game-full-recovery{background:white;color:black;max-width:90vw}</style><header id="host"><button id="host-button">Host control</button></header><div id="surface"></div>'); return; }
        if (url.pathname === '/fixture') { const build = builds[url.searchParams.get('mode')]; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ entry: build.entry, files: Object.fromEntries([...build.files].map(([path, bytes]) => [path, bytes.toString('base64')])) })); return; }
        const path = resolve(root, '.' + url.pathname); if (!path.startsWith(root + sep)) throw new Error('Path');
        res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[extname(path)] ?? 'application/octet-stream'); res.end(await readFile(path));
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(ready => server.listen(0, '127.0.0.1', ready));
const browser = await chromium.launch({ channel: process.env.ATRIA_BROWSER_CHANNEL || 'msedge', headless: true });
try {
    for (const mode of ['component', 'hybrid', 'full']) for (const width of [1440, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 1100 } });
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.evaluate(async mode => {
            const { mountNativeFrontend } = await import('/scripts/native/frontend/runtime.js');
            const { mountStudioPreviewUi } = await import('/scripts/native/studio-preview-ui.js');
            const { createFullGameHost } = await import('/scripts/native/experience/ui/full-host.js');
            const compiled = await (await fetch('/fixture?mode=' + mode)).json();
            window.compiled = compiled; window.calls = []; window.diagnostics = []; window.loads = []; window.saved = {};
            window.fontCount = document.fonts.size;
            window.full = mode === 'full' ? createFullGameHost(document, { onExit: () => calls.push('exit'), onStopGeneration: () => calls.push('stop'), onSave: () => calls.push('save'), onDiagnostics: () => calls.push('diagnostics'), onRecover: () => runtime.recover(), onBeforeEscape: () => runtime.closeOverlay() }) : null;
            window.runtime = await mountNativeFrontend({ document, window, mode, entry: compiled.entry,
                onDiagnostic: value => diagnostics.push(value),
                stateStorage: { read: (root, key) => saved[key], write: (root, key, scope, value) => { saved[key] = value; } },
                loadBytes: async path => { loads.push(path); return Uint8Array.from(atob(compiled.files[path]), char => char.charCodeAt(0)); },
                surfaceHost: { mount(surface) { const container = document.createElement('div'); container.style.height = '100%'; (full?.root ?? document.getElementById('surface')).append(container); return { container, unmount: () => container.remove() }; } },
            });
            window.preview = async () => { runtime.dispose(); full?.dispose(); window.runtime = await mountStudioPreviewUi(document, document.getElementById('surface'), JSON.parse(atob(compiled.files[compiled.entry])), mode, value => diagnostics.push(value), compiled); };
            full?.activate();
        }, mode);
        assert.equal(await page.locator('[data-node-id="device"]').textContent(), width < 600 ? 'mobile' : 'desktop');
        assert.equal(await page.evaluate(() => document.fonts.size), await page.evaluate(() => fontCount + 1));
        await page.getByRole('button', { name: 'Increment', exact: true }).click();
        await page.waitForFunction(() => runtime.getState().ui.count === 1);
        await page.getByRole('button', { name: 'Component increment', exact: true }).first().click();
        await page.waitForFunction(() => runtime.getState().ui.count === 2);
        assert.deepEqual(await page.locator('[data-node-id="localCount"]').allTextContents(), ['1', '0']);
        await page.getByRole('textbox', { name: 'Draft note' }).fill('A local draft');
        await page.getByRole('button', { name: 'Save draft locally' }).click();
        await page.waitForFunction(() => runtime.getState().view.visits === 1);
        await page.getByRole('button', { name: 'Toggle preference' }).click();
        assert.equal(await page.evaluate(() => saved.compact), true);
        await page.getByRole('button', { name: 'Open overlay' }).click();
        await page.getByRole('textbox', { name: 'Overlay input' }).waitFor();
        await page.keyboard.press('Shift+Tab');
        assert.equal(await page.getByRole('button', { name: 'Close overlay' }).evaluate(node => node.getRootNode().activeElement === node), true);
        await page.keyboard.press('Escape');
        await page.getByRole('textbox', { name: 'Overlay input' }).waitFor({ state: 'detached' });
        assert.deepEqual(await page.evaluate(() => calls), []);
        assert.equal(await page.getByRole('button', { name: 'Open overlay' }).evaluate(node => node.getRootNode().activeElement === node), true);
        const measure = await page.evaluate(() => {
            const owner = runtime.getInstances().find(item => item.componentId === 'Main'); window.handle = runtime.getNodeRef(owner.id, 'title');
            window.geometry = handle.measure(); window.observed = 0; window.stopObserver = handle.observeResize(() => { observed++; });
            return geometry;
        });
        assert.ok(measure.width > 0 && measure.width <= width);
        await page.waitForFunction(() => observed > 0);
        await page.locator('[data-node-id="increment"]').evaluate(node => {
            const owner = runtime.getInstances().find(item => item.componentId === 'Main');
            const handle = runtime.getNodeRef(owner.id, 'increment'); window.captured = false;
            node.addEventListener('pointerdown', event => { handle.capturePointer(event.pointerId); captured = node.hasPointerCapture(event.pointerId); }, { once: true });
            node.addEventListener('pointerup', event => handle.releasePointer(event.pointerId), { once: true });
        });
        await page.getByRole('button', { name: 'Increment', exact: true }).click();
        assert.equal(await page.evaluate(() => captured), true);
        assert.ok(await page.locator('[data-node-id="rowLabel"]').count() <= 10);
        await page.locator('[data-node-id="rowLabel"]').first().evaluate(node => { window.firstRow = node; });
        await page.evaluate(() => { const rows = runtime.getState().ui.rows; [rows[0], rows[1]] = [rows[1], rows[0]]; runtime.setState('ui', 'rows', rows); });
        await page.waitForFunction(() => firstRow.parentElement.previousElementSibling?.textContent === 'Item 1');
        assert.equal(await page.locator('[data-node-id="rowLabel"]').nth(1).evaluate(node => node === firstRow), true);
        await page.locator('[data-repeat="rows"]').evaluate(node => { node.scrollTop = 16000; node.dispatchEvent(new Event('scroll')); });
        await page.getByText('Item 500', { exact: true }).waitFor();
        assert.ok(await page.locator('[data-node-id="rowLabel"]').count() <= 10);
        await page.getByRole('button', { name: 'Next view' }).click();
        await page.getByRole('heading', { name: 'Other view' }).waitFor();
        assert.equal(await page.evaluate(() => { try { handle.measure(); return false; } catch { return true; } }), true);
        await page.getByRole('button', { name: 'Back', exact: true }).click();
        await page.getByRole('heading', { name: 'Harbor workshop' }).waitFor();
        assert.equal(await page.evaluate(() => runtime.getState().view.visits), 1);
        assert.equal(await page.getByRole('textbox', { name: 'Draft note' }).inputValue(), 'A local draft');
        // Attempt to visually escape using hostile :host, fixed and huge z-index.
        await page.locator('atri-component').first().evaluate(node => {
            const style = document.createElement('style'); style.textContent = ':host{position:fixed!important;inset:-10000px!important;z-index:2147483647!important;background:red!important}'; node.shadowRoot.append(style);
        });
        if (mode === 'full') {
            await page.getByText('Experience controls', { exact: true }).click();
            for (const [name, call] of [['Stop generation', 'stop'], ['Save', 'save'], ['Diagnostics', 'diagnostics'], ['Exit Experience', 'exit']]) { await page.getByRole('button', { name, exact: true }).click(); assert.equal(await page.evaluate(() => calls.at(-1)), call); }
            await page.getByRole('button', { name: 'Reload presentation', exact: true }).click();
        } else {
            assert.equal(await page.locator('#host-button').evaluate(node => document.elementFromPoint(node.getBoundingClientRect().x + 5, node.getBoundingClientRect().y + 5) === node), true);
            await page.evaluate(() => runtime.recover());
        }
        await page.getByRole('heading', { name: 'Harbor workshop' }).waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.screenshot({ path: resolve(output, `${mode}-${width}.png`), fullPage: true });
        await page.evaluate(() => preview());
        await page.getByRole('button', { name: 'Increment', exact: true }).click();
        await page.waitForFunction(() => runtime.getState().ui.count === 1);
        await page.evaluate(() => { runtime.dispose(); });
        assert.equal(await page.evaluate(() => document.fonts.size), await page.evaluate(() => fontCount));
        assert.equal(await page.locator('[data-atria-frontend-boundary]').count(), 0);
        assert.deepEqual(await page.evaluate(() => diagnostics), []);
        assert.deepEqual(errors, []);
        console.log(`PASS ${mode} ${width}: state, components, fonts, forms, overlay focus, routes, NodeRef, keyed virtualization, containment, Preview, disposal`);
        await page.close();
    }
} finally { await browser.close(); await new Promise(done => server.close(done)); }
