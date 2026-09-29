/* global mockViewport, runtime, diagnostics, authorityReloads, failChild, remoteCalls, offline, full */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { platformFixture } from '../native/helpers/frontend-platform-fixture.js';

const root = resolve('public'), output = resolve('.git/frontend-v3-platform-evidence'), builds = {};
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:16px system-ui;background:#eef1f5}#surface{height:90vh;max-width:800px;margin:auto}button{min-height:44px}</style><div id="surface"></div>'); return; }
        if (url.pathname === '/fixture') { const build = builds[url.searchParams.get('mode')]; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ entry: build.entry, files: Object.fromEntries([...build.files].map(([path, bytes]) => [path, bytes.toString('base64')])) })); return; }
        const path = resolve(root, '.' + url.pathname); if (!path.startsWith(root + sep)) throw new Error('Path');
        res.setHeader('Content-Type', { '.js': 'text/javascript', '.json': 'application/json' }[extname(path)] ?? 'application/octet-stream'); res.end(await readFile(path));
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(ready => server.listen(0, '127.0.0.1', ready));
const browser = await chromium.launch({ channel: process.env.ATRIA_BROWSER_CHANNEL || 'msedge', headless: true });
try {
    const encoder = await browser.newPage(); await encoder.goto(`http://127.0.0.1:${server.address().port}`);
    const video = await encoder.evaluate(async () => {
        const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32; document.body.append(canvas); const context = canvas.getContext('2d'); context.fillStyle = '#426b8e'; context.fillRect(0, 0, 32, 32);
        const stream = canvas.captureStream(10), recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' }), chunks = [];
        recorder.ondataavailable = event => chunks.push(event.data); const done = new Promise(resolve => { recorder.onstop = resolve; });
        const started = new Promise(resolve => { recorder.onstart = resolve; }); recorder.start(); await started;
        // Paint attached, changing frames after recording starts. A detached
        // canvas can produce a header-only WebM on newer headless Chromium.
        for (let frame = 0; frame < 10; frame++) { context.fillStyle = frame % 2 ? '#224488' : '#aa8844'; context.fillRect(0, 0, 32, 32); stream.getVideoTracks()[0].requestFrame?.(); await new Promise(resolve => setTimeout(resolve, 100)); }
        recorder.stop(); await done; stream.getTracks().forEach(track => track.stop()); canvas.remove();
        return [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
    });
    assert.ok(video.length > 100, 'Recorded WebM must contain encoded frames');
    await encoder.close();
    for (const mode of ['component', 'hybrid', 'full']) { const fixture = platformFixture(mode); fixture.files.set('frontend/video.webm', Buffer.from(video)); builds[mode] = fixture.compile(); }
    for (const mode of ['component', 'hybrid', 'full']) for (const width of [1440, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 1000 } }), errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.evaluate(async mode => {
            const { mountNativeFrontend } = await import('/scripts/native/frontend/runtime.js');
            const { createFullGameHost } = await import('/scripts/native/experience/ui/full-host.js');
            const compiled = await (await fetch('/fixture?mode=' + mode)).json(), index = JSON.parse(atob(compiled.files[compiled.entry]));
            window.compiled = compiled;
            const bytes = path => Uint8Array.from(atob(compiled.files[path]), char => char.charCodeAt(0));
            const child = index.resources.find(ref => ref.id === 'component:Child'), image = index.resources.find(ref => ref.id === 'asset:fallback');
            window.failChild = true; window.offline = false; window.remoteCalls = []; window.diagnostics = []; window.authorityReloads = 0;
            window.mockViewport = Object.assign(new EventTarget(), { width: innerWidth, height: innerHeight, offsetTop: 0, offsetLeft: 0 }); Object.defineProperty(window, 'visualViewport', { value: mockViewport });
            window.full = mode === 'full' ? createFullGameHost(document, { onExit: () => {}, onRecover: () => runtime.recover() }) : null;
            window.runtime = await mountNativeFrontend({ document, window, mode, entry: compiled.entry,
                onDiagnostic: value => diagnostics.push(value), onBridgeEpoch: () => { window.authorityReloads++; },
                loadBytes: async path => { if (path === child.path && failChild) throw new Error('private resource error'); return bytes(path); },
                fetchImage: async (url, options) => { remoteCalls.push({ url, credentials: options.credentials, referrerPolicy: options.referrerPolicy, redirect: options.redirect }); if (offline) throw new Error('offline'); return new Response(bytes(image.path), { headers: { 'content-type': 'image/png' } }); },
                surfaceHost: { mount() { const container = document.createElement('div'); container.style.height = '100%'; (full?.root ?? document.getElementById('surface')).append(container); return { container, unmount: () => container.remove() }; } },
            }); full?.activate();
        }, mode);
        const portrait = page.locator('[data-node-id="portrait"]');
        assert.equal(await portrait.getAttribute('data-media-status'), 'denied'); await page.waitForFunction(() => remoteCalls.length === 0);
        assert.equal(await portrait.evaluate(node => node.complete && node.naturalWidth > 0), true);
        await page.waitForFunction(() => { const find = root => { for (const node of root.querySelectorAll('*')) { if (node.dataset.nodeId === 'video') return node; if (node.shadowRoot) { const found = find(node.shadowRoot); if (found) return found; } } }; return find(document)?.readyState >= 1; });
        assert.equal(await page.locator('[data-node-id="video"]').evaluate(node => node.videoWidth), 32);
        assert.equal(await page.locator('[data-node-id="audio"]').evaluate(node => node.controls && !node.autoplay), true);
        await page.getByText('Remote images', { exact: true }).click(); await page.getByRole('button', { name: 'Enable remote images' }).click();
        await page.waitForFunction(() => remoteCalls.length === 1); await portrait.waitFor();
        assert.deepEqual(await page.evaluate(() => remoteCalls[0]), { url: 'https://images.example/portrait.png', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' });
        await page.getByRole('button', { name: 'Disable remote images' }).click(); await page.evaluate(() => { window.offline = true; }); await page.getByRole('button', { name: 'Enable remote images' }).click();
        await page.waitForFunction(() => remoteCalls.length === 2); await page.waitForTimeout(50); assert.equal(await portrait.getAttribute('data-media-reason'), 'media_offline_or_invalid');
        await page.getByRole('button', { name: 'Increment', exact: true }).click();
        await page.evaluate(() => { window.failChild = false; }); await page.getByRole('button', { name: 'Retry section' }).click(); await page.getByText('Child ready', { exact: true }).waitFor();
        const input = page.getByRole('textbox', { name: 'Message' }); await input.focus();
        await input.evaluate(node => { window.inputNode = node; node.dispatchEvent(new CompositionEvent('compositionstart')); node.value = '中文入力'; node.setSelectionRange(2, 2); node.dispatchEvent(new InputEvent('input', { isComposing: true })); runtime.setState('draft', 'text', 'incoming update'); runtime.setState('ui', 'count', 7); });
        await page.waitForTimeout(50); assert.equal(await input.inputValue(), '中文入力'); assert.equal(await input.evaluate(node => node.selectionStart), 2);
        await input.evaluate(node => node.dispatchEvent(new CompositionEvent('compositionend'))); await page.waitForFunction(() => runtime.getState().draft.text === '中文入力');
        await page.getByRole('button', { name: 'Arabic', exact: true }).click(); await page.waitForFunction(() => document.querySelector('[data-atria-frontend-boundary]')?.dir === 'rtl');
        assert.equal(await input.evaluate(node => node === window.inputNode), true); assert.equal(await page.evaluate(() => authorityReloads), 0);
        await page.getByRole('button', { name: 'Announce', exact: true }).click(); assert.equal(await page.locator('[aria-live="polite"]').textContent(), 'Saved locally');
        await page.evaluate(() => { mockViewport.height = 450; mockViewport.dispatchEvent(new Event('resize')); }); await input.focus(); await input.scrollIntoViewIfNeeded();
        assert.equal(await page.locator('[data-atria-frontend-boundary]').evaluate(node => node.style.getPropertyValue('--atria-keyboard-inset')), '550px');
        assert.ok(await input.evaluate(node => node.getBoundingClientRect().bottom <= 450), 'Input stays above the simulated keyboard');
        await page.screenshot({ path: resolve(output, `${mode}-${width}.png`), fullPage: true });
        assert.equal((await page.evaluate(() => diagnostics)).every(item => item.reasonCode === 'frontend_boundary_failed'), true); assert.deepEqual(errors, []);
        await page.evaluate(async mode => {
            runtime.dispose(); full?.dispose();
            const { mountStudioPreviewUi } = await import('/scripts/native/studio-preview-ui.js');
            window.runtime = await mountStudioPreviewUi(document, document.getElementById('surface'), JSON.parse(atob(window.compiled.files[window.compiled.entry])), mode, value => diagnostics.push(value), window.compiled);
            runtime.setLocale('ar');
        }, mode);
        await page.getByText('Child ready', { exact: true }).waitFor(); assert.equal(await portrait.getAttribute('data-media-status'), 'denied');
        await page.evaluate(() => runtime.dispose()); assert.equal(await page.locator('[data-atria-frontend-boundary]').count(), 0); await page.close();
        console.log(`PASS platform ${mode} ${width}`);
    }
} finally { await browser.close(); await new Promise(done => server.close(done)); }
