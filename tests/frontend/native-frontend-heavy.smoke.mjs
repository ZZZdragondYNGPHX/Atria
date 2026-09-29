import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import getPublicLibConfig from '../../webpack.config.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { buildHeavyFixture, heavySession } from '../native/helpers/frontend-heavy-harness.js';
import { FrontendBridgeService } from '../../src/native/frontend/host-bridge.js';

const root = resolve('public'), bundles = getPublicLibConfig({ forceDist: true }).output.path;
const output = resolve('.git/frontend-v3-heavy-evidence'); await mkdir(output, { recursive: true });
const h = await makeTempFsEngineHarness(), host = new FrontendBridgeService(), builds = {}, sessions = new Map();
for (const mode of ['component', 'hybrid', 'full']) builds[mode] = await buildHeavyFixture(h, mode);
const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/') {
            res.setHeader('Content-Type', 'text/html');
            res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:16px system-ui;background:#dfe7eb}#surface{height:85vh;max-width:900px;margin:auto}#host{min-height:44px}</style><button id="host">Host control</button><div id="surface"></div>'); return;
        }
        if (url.pathname === '/fixture') {
            const built = builds[url.searchParams.get('mode')], session = await heavySession(h, built);
            sessions.set(session.base.session.sessionId, { ...session, built });
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ sessionId: session.base.session.sessionId, entry: built.fixture.compiled.entry, files: Object.fromEntries([...built.fixture.compiled.files].map(([path, bytes]) => [path, bytes.toString('base64')])) })); return;
        }
        if (url.pathname.startsWith('/api/native/session/frontend/')) {
            let body = ''; for await (const chunk of req) body += chunk;
            const input = JSON.parse(body), method = url.pathname.split('/').at(-1);
            const sessionId = input.sessionId ?? host.experiences.get(input.epoch)?.sessionId;
            const svc = sessions.get(sessionId)?.built.svc;
            const result = method === 'open' ? await host.open(svc, h.handle, input.sessionId, input.previous)
                : method === 'close' ? (host.close(h.handle, input.epoch), {}) : await host.request(svc, h.handle, input);
            res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result)); return;
        }
        const path = url.pathname === '/atria-script.bundle.js' ? resolve(bundles, 'atria-script.bundle.js') : resolve(root, '.' + url.pathname);
        if (!path.startsWith(root + sep) && !path.startsWith(bundles + sep)) throw new Error('Path');
        res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[extname(path)] ?? 'application/octet-stream'); res.end(await readFile(path));
    } catch (error) { console.error(error); res.writeHead(500); res.end('{}'); }
});
await new Promise(ready => server.listen(0, '127.0.0.1', ready));
const browser = await chromium.launch({ channel: process.env.ATRIA_BROWSER_CHANNEL || 'msedge', headless: true });
try {
    for (const mode of ['component', 'hybrid', 'full']) for (const width of [1440, 390]) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width === 390, isMobile: width === 390 });
        const page = await context.newPage(), errors = [], remoteRequests = [];
        page.on('pageerror', error => errors.push(error.message));
        await context.route('**/*', route => {
            if (new URL(route.request().url()).hostname !== '127.0.0.1') { remoteRequests.push(route.request().url()); return route.abort(); }
            return route.continue();
        });
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.evaluate(async mode => {
            const { mountNativeFrontend } = await import('/scripts/native/frontend/runtime.js');
            const { frontendHttpTransport } = await import('/scripts/native/frontend/bridge.js');
            const { createFullGameHost } = await import('/scripts/native/experience/ui/full-host.js');
            const compiled = await (await fetch('/fixture?mode=' + mode)).json(); window.compiled = compiled;
            const index = JSON.parse(atob(compiled.files[compiled.entry]));
            const bytes = path => Uint8Array.from(atob(compiled.files[path]), char => char.charCodeAt(0));
            const image = index.resources.find(ref => ref.id === 'asset:fallback');
            const people = index.resources.find(ref => ref.id === 'component:People');
            window.diagnostics = []; window.epochs = 0; window.workers = []; window.remoteCalls = 0; window.offline = false; window.failPeople = true;
            window.mockViewport = Object.assign(new EventTarget(), { width: innerWidth, height: innerHeight, offsetTop: 0, offsetLeft: 0 });
            Object.defineProperty(window, 'visualViewport', { value: window.mockViewport });
            window.full = mode === 'full' ? createFullGameHost(document, { onExit: () => {}, onRecover: () => window.runtime.recover() }) : null;
            window.runtime = await mountNativeFrontend({ document, window, mode, entry: compiled.entry,
                onDiagnostic: value => window.diagnostics.push(value), onBridgeEpoch: () => window.epochs++,
                bridgeTransport: frontendHttpTransport({ sessionId: compiled.sessionId }),
                hostServices: { invoke: async target => target.service === 'host.conversation' && target.method === 'generation' ? { state: 'streaming', text: 'Uncommitted narration', error: '' } : {} },
                loadBytes: path => { if (path === people.path && window.failPeople) throw new Error('section offline'); return bytes(path); },
                fetchImage: async (_url, options) => {
                    window.remoteCalls++;
                    if (options.credentials !== 'omit' || options.referrerPolicy !== 'no-referrer' || options.redirect !== 'error') throw new Error('unsafe media request');
                    if (window.offline) throw new Error('offline');
                    return new Response(bytes(image.path), { headers: { 'content-type': 'image/png' } });
                },
                scriptWorkerFactory: () => { const worker = new Worker('/atria-script.bundle.js', { type: 'module' }); window.workers.push(worker); return worker; },
                surfaceHost: { mount() { const container = document.createElement('div'); container.style.height = '100%'; (window.full?.root ?? document.getElementById('surface')).append(container); return { container, unmount: () => container.remove() }; } },
            }); window.full?.activate();
        }, mode);
        const click = async name => { const button = page.getByRole('button', { name, exact: true }); if (width === 390) await button.tap(); else await button.click(); };
        const sessionId = await page.evaluate(() => window.compiled.sessionId), session = sessions.get(sessionId);
        const snapshot = () => session.built.svc.core.load(h.handle, sessionId);
        await expect(page.locator('[data-node-id="message"]')).toHaveCount(2);
        await expect(page.locator('[data-node-id="stream"]')).toHaveText('Uncommitted narration');
        await click('Next messages'); await expect(page.locator('[data-node-id="message"]')).toHaveCount(1);
        assert.equal(await page.locator('[data-node-id="prose"] img').count(), 0);
        await expect(page.locator('[data-node-id="prose"]')).toContainText('<img src=x onerror=alert(1)>');
        await click('AI summary'); await expect(page.locator('[data-node-id="result"]')).toHaveText('completed');
        await expect(page.locator('[data-node-id="summary"]')).toHaveText('District summary ready');
        assert.equal((await snapshot()).timeline.length, 3);
        await click('Save checkpoint'); await expect(page.locator('[data-node-id="saved"]')).toHaveText('completed');
        await click('Phone');
        const input = page.getByRole('textbox', { name: 'Phone message' }); await input.focus();
        await input.evaluate(node => {
            window.composingNode = node; node.dispatchEvent(new CompositionEvent('compositionstart')); node.value = '教会で会いましょう'; node.setSelectionRange(2, 2);
            node.dispatchEvent(new InputEvent('input', { isComposing: true })); window.runtime.setState('draft', 'message', 'incoming');
        });
        await page.waitForTimeout(50); assert.equal(await input.inputValue(), '教会で会いましょう'); assert.equal(await input.evaluate(node => node.selectionStart), 2);
        await input.evaluate(node => node.dispatchEvent(new CompositionEvent('compositionend')));
        await page.waitForFunction(() => window.runtime.getState().draft.message === '教会で会いましょう');
        for (const id of ['sms', 'social', 'mail']) { await click('Send ' + id); await expect(page.locator(`[data-node-id="receipt-${id}"]`)).toHaveText('completed'); await expect(page.locator(`[data-node-id="text-${id}"]`)).toHaveText('教会で会いましょう'); }
        await page.evaluate(() => { window.mockViewport.height = 450; window.mockViewport.dispatchEvent(new Event('resize')); });
        await input.focus(); await input.scrollIntoViewIfNeeded();
        assert.ok(await input.evaluate(node => node.getBoundingClientRect().bottom <= 450), 'Composer above simulated keyboard');
        assert.equal(await input.evaluate(node => node === window.composingNode), true);
        await page.evaluate(() => { window.mockViewport.height = innerHeight; window.mockViewport.dispatchEvent(new Event('resize')); });
        await click('Church'); await click('Restock to 24'); await expect(page.locator('[data-node-id="supplies"]')).toHaveText('24');
        await click('Schedule'); await click('Complete service'); await expect(page.locator('[data-node-id="done"]')).toHaveText('true');
        await click('People'); await page.getByRole('button', { name: 'Retry section' }).waitFor();
        await page.evaluate(() => { window.failPeople = false; }); await click('Retry section');
        await expect(page.locator('[data-node-id="person"]')).toHaveCount(8);
        const portrait = page.locator('[data-node-id="portrait"]').first(); await expect(portrait).toHaveAttribute('data-media-status', 'denied');
        assert.equal(await page.evaluate(() => window.remoteCalls), 0);
        await page.evaluate(() => { window.offline = true; window.runtime.setRemoteMediaEnabled(true); });
        await expect(portrait).toHaveAttribute('data-media-reason', 'media_offline_or_invalid');
        assert.equal(await portrait.evaluate(node => node.complete && node.naturalWidth > 0), true);
        await page.evaluate(() => { window.runtime.setRemoteMediaEnabled(false); window.offline = false; window.runtime.setRemoteMediaEnabled(true); });
        await expect(portrait).toHaveAttribute('data-media-status', 'available');
        await click('Next people'); await expect(page.locator('[data-node-id="name"]').first()).toHaveText('Resident 8');
        await page.screenshot({ path: resolve(output, `${mode}-${width}-people.png`), fullPage: true });
        const authority = (await snapshot()).revision.revisionId, epochs = await page.evaluate(() => window.epochs);
        await click('Relations');
        await expect(page.locator('[data-node-id="linked"]')).toHaveText('8');
        await expect.poll(() => page.locator('canvas').evaluate(node => node.getContext('2d').getImageData(180, 120, 1, 1).data[3])).toBe(255);
        await click('Animate'); await expect(page.locator('[data-node-id="count"]')).toHaveText('1');
        await click('Runaway'); await page.waitForFunction(() => window.workers.length === 2);
        // Worker construction is not recovery readiness. Revocation clears the
        // retained canvas; its fresh People-backed draw proves async init and
        // the scoped read have finished before a new user interaction.
        await expect.poll(() => page.locator('canvas').evaluate(node => node.width === 360 && node.height === 240
            && node.getContext('2d').getImageData(180, 120, 1, 1).data[3] === 255)).toBe(true);
        await expect(page.locator('[data-node-id="count"]')).toHaveText('1'); await click('Animate'); await expect(page.locator('[data-node-id="count"]')).toHaveText('2');
        await page.screenshot({ path: resolve(output, `${mode}-${width}-relations.png`), fullPage: true });
        assert.equal((await snapshot()).revision.revisionId, authority); assert.equal(await page.evaluate(() => window.epochs), epochs);
        await click('Phone'); assert.equal(await input.inputValue(), '教会で会いましょう');
        await page.screenshot({ path: resolve(output, `${mode}-${width}-phone.png`), fullPage: true });
        await page.evaluate(() => window.runtime.recover()); await expect(input).toHaveValue('');
        await expect(page.locator('[data-node-id="text-sms"]')).toHaveText('教会で会いましょう');
        assert.equal((await snapshot()).revision.revisionId, authority);
        assert.equal(session.metrics.providerCalls, 0); assert.equal(session.metrics.deterministicExecutions, 1);
        assert.deepEqual(remoteRequests, []); assert.deepEqual(errors, []);
        const diagnostics = await page.evaluate(() => window.diagnostics);
        assert.ok(diagnostics.some(item => item.reasonCode === 'script_budget_exceeded'));
        assert.ok(diagnostics.every(item => ['frontend_boundary_failed', 'script_budget_exceeded'].includes(item.reasonCode)), JSON.stringify(diagnostics));
        if (mode === 'full') {
            await page.locator('#atria-game-full-recovery summary').click();
            await expect(page.locator('[data-atria-game-recovery-action="exit"]')).toBeVisible();
        }
        await page.evaluate(() => { window.runtime.dispose(); window.full?.dispose(); });
        assert.equal(await page.locator('[data-atria-frontend-boundary]').count(), 0);
        console.log(`PASS Heavy ${mode} ${width}: installed graph, typed panels, Task, touch/IME, media, boundary, VM, recovery; providerCalls=0`);
        await context.close();
    }
} finally { await browser.close(); await new Promise(done => server.close(done)); host.dispose(); await h.cleanup(); }
