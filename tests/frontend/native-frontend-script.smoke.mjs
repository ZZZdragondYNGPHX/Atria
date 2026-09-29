/* global diagnostics, epochChanges:writable, workers, terminated:writable, runtime */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import getPublicLibConfig from '../../webpack.config.js';
import { scriptFixture } from '../native/helpers/frontend-script-fixture.js';
import { fixedHostTarget } from '../../public/shared/native-frontend-host.js';

const root = resolve('public'), bundles = getPublicLibConfig({ forceDist: true }).output.path;
const output = resolve('.git/frontend-v3-script-evidence'); await mkdir(output, { recursive: true });
const builds = Object.fromEntries(['component', 'hybrid', 'full'].map(mode => [mode, scriptFixture(mode).compile()]));
builds.exception = scriptFixture('full', 'export default {\n init() {\n throw new Error("mapped failure");\n }\n};').compile();
const vendorError = scriptFixture('full', 'import { fail } from "./vendor/layout.js";\nexport default {init(){fail();}};');
vendorError.files.set('frontend/vendor/layout.js', Buffer.from('export function fail() {\n throw new Error("vendor failure");\n}'));
builds.vendor = vendorError.compile();
builds.scope = scriptFixture('full', `export default { async init(ctx) {
 const geometry = await ctx.node('map');
 let denied=0;
 for(const id of ['root','document','missing']) {try {await ctx.node(id);} catch {denied++;}}
 try {await ctx.media('missing',{kind:'exact',id:'portrait'});} catch {denied++;}
 ctx.set('component.count', geometry.width>0 ? denied : -1);
}};`).compile();
const optional = scriptFixture('full', 'export default { init() { while(true) {} } };');
optional.files.set('frontend/Main.aui', Buffer.from(optional.files.get('frontend/Main.aui').toString().replace('"required":true', '"required":false')));
builds.optional = optional.compile();
builds.unavailable = builds.optional;
const mediaFixture = scriptFixture('full', `export default { async init(ctx) {
 const handle = await ctx.media('images',{kind:'exact',id:'portrait'});
 ctx.canvas('map',{width:100,height:100,commands:[['image',handle,0,0,100,100]]});
 ctx.set('component.count',1);
}};`);
const mediaIndex = JSON.parse(mediaFixture.files.get('frontend/index.json'));
mediaIndex.bridge = 'bridge.json'; mediaIndex.assets = [{ id: 'portrait', source: 'portrait.png', mediaType: 'image/png' }];
mediaFixture.files.set('frontend/index.json', Buffer.from(JSON.stringify(mediaIndex)));
mediaFixture.files.set('frontend/Main.aui', Buffer.from(mediaFixture.files.get('frontend/Main.aui').toString().replace('<contract>{', '<contract>{"uses":["images"],')));
const mediaTarget = { service: 'host.media', method: 'resolve' }, mediaContract = fixedHostTarget(mediaTarget);
mediaFixture.files.set('frontend/bridge.json', Buffer.from(JSON.stringify({ version: 1, bindings: [{ id: 'images', kind: 'read', target: mediaTarget, inputSchema: mediaContract.inputSchema, outputSchema: mediaContract.outputSchema }] })));
mediaFixture.files.set('frontend/portrait.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aA1sAAAAASUVORK5CYII=', 'base64'));
builds.media = mediaFixture.compile();
const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:16px system-ui;background:#edf1f3}#surface{height:90vh;max-width:800px;margin:auto}</style><div id="surface"></div>'); return; }
        if (url.pathname === '/fixture') { const build = builds[url.searchParams.get('mode')]; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ entry: build.entry, files: Object.fromEntries([...build.files].map(([path, bytes]) => [path, bytes.toString('base64')])) })); return; }
        const path = url.pathname === '/atria-script.bundle.js' ? resolve(bundles, 'atria-script.bundle.js') : resolve(root, '.' + url.pathname);
        if (!path.startsWith(root + sep) && !path.startsWith(bundles + sep)) throw new Error('Path');
        res.setHeader('Content-Type', { '.js': 'text/javascript', '.json': 'application/json' }[extname(path)] ?? 'application/octet-stream'); res.end(await readFile(path));
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(ready => server.listen(0, '127.0.0.1', ready));
const browser = await chromium.launch({ channel: process.env.ATRIA_BROWSER_CHANNEL || 'msedge', headless: true });
try {
    for (const mode of ['component', 'hybrid', 'full']) for (const width of [1440, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 850 } }), errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.evaluate(async mode => {
            const { mountNativeFrontend } = await import('/scripts/native/frontend/runtime.js');
            const compiled = await (await fetch('/fixture?mode=' + mode)).json();
            window.diagnostics = []; window.workers = []; window.terminated = 0; window.epochChanges = 0;
            window.runtime = await mountNativeFrontend({ mode, entry: compiled.entry, onDiagnostic: value => diagnostics.push(value), onBridgeEpoch: () => { epochChanges++; },
                scriptWorkerFactory: () => { const worker = new Worker('/atria-script.bundle.js', { type: 'module' }); workers.push(worker); const terminate = worker.terminate.bind(worker); worker.terminate = () => { terminated++; terminate(); }; return worker; },
                loadBytes: path => Uint8Array.from(atob(compiled.files[path]), char => char.charCodeAt(0)),
                surfaceHost: { mount() { const container = document.createElement('div'); document.getElementById('surface').append(container); return { container, unmount: () => container.remove() }; } },
            });
        }, mode);
        const canvas = page.locator('[data-node-id="map"]');
        await canvas.waitFor();
        await page.waitForFunction(() => { const find = root => { for (const node of root.querySelectorAll('*')) { if (node.localName === 'canvas') return node; if (node.shadowRoot) { const value = find(node.shadowRoot); if (value) return value; } } }; return find(document)?.getContext('2d').getImageData(280, 120, 1, 1).data[3] > 0; });
        assert.equal(await page.evaluate(() => diagnostics.length), 0, JSON.stringify(await page.evaluate(() => diagnostics)));
        await page.getByRole('button', { name: 'Animate', exact: true }).click();
        await page.locator('[data-node-id="count"]').filter({ hasText: '1' }).waitFor();
        await page.waitForTimeout(350);
        await page.getByRole('button', { name: 'Runaway' }).click();
        await page.waitForFunction(() => workers.length === 2 && terminated === 1);
        assert.equal(await page.locator('[data-node-id="count"]').textContent(), '1');
        assert.equal(await page.evaluate(() => epochChanges), 0);
        assert.equal(await page.evaluate(() => diagnostics[0].reasonCode), 'script_budget_exceeded');
        assert.equal(await page.evaluate(() => diagnostics[0].source.file), 'frontend/controller.ts');
        await page.getByRole('button', { name: 'Animate', exact: true }).click();
        await page.locator('[data-node-id="count"]').filter({ hasText: '2' }).waitFor();
        await page.screenshot({ path: resolve(output, `${mode}-${width}.png`), fullPage: true });
        await page.evaluate(() => runtime.dispose());
        assert.equal(await page.evaluate(() => terminated), 2); assert.deepEqual(errors, []);
        console.log(`PASS Script/Canvas ${mode} ${width}`); await page.close();
    }
    for (const variant of ['exception', 'vendor', 'scope', 'optional', 'unavailable', 'media']) {
        const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.evaluate(async variant => {
            const { mountNativeFrontend } = await import('/scripts/native/frontend/runtime.js');
            const { previewBridgeTransport } = await import('/scripts/native/frontend/preview-bridge.js');
            const build = await (await fetch('/fixture?mode=' + variant)).json(); window.diagnostics = [];
            const index = JSON.parse(atob(build.files[build.entry])), bridgeRef = index.resources.find(ref => ref.id === 'bridge');
            const descriptor = JSON.parse(atob(build.files[bridgeRef.path]));
            window.runtime = await mountNativeFrontend({ mode: 'full', entry: build.entry, onDiagnostic: value => diagnostics.push(value),
                bridgeTransport: variant === 'media' ? previewBridgeTransport({ descriptor, scopes: { Main: ['images'] } }) : undefined,
                loadBytes: path => { if (variant === 'unavailable' && index.resources.find(ref => ref.path === path)?.kind === 'script') throw new Error('resource offline'); return Uint8Array.from(atob(build.files[path]), char => char.charCodeAt(0)); },
                surfaceHost: { mount() { const container = document.createElement('div'); document.body.append(container); return { container, unmount: () => container.remove() }; } },
            });
        }, variant);
        if (variant === 'exception' || variant === 'vendor') {
            assert.equal(await page.evaluate(() => diagnostics[0].source.line), variant === 'exception' ? 3 : 2);
            assert.equal(await page.evaluate(() => diagnostics[0].source.file), variant === 'exception' ? 'frontend/controller.ts' : 'frontend/vendor/layout.js');
            await page.getByText('Required Controller unavailable.', { exact: false }).waitFor();
        } else if (variant === 'scope') {
            await page.locator('[data-node-id="count"]').filter({ hasText: '4' }).waitFor();
            assert.equal(await page.evaluate(() => diagnostics.length), 0);
        } else if (variant === 'media') {
            await page.locator('[data-node-id="count"]').filter({ hasText: '1' }).waitFor();
            await page.waitForTimeout(50);
            assert.equal(await page.locator('canvas').evaluate(node => node.getContext('2d').getImageData(50, 50, 1, 1).data[3]), 255);
            await page.evaluate(() => runtime.setRemoteMediaEnabled(true));
            assert.equal(await page.locator('canvas').evaluate(node => node.width), 0);
            assert.equal(await page.evaluate(() => diagnostics.length), 0);
        } else {
            assert.equal(await page.evaluate(() => runtime.getInstances()[0].script), 'unavailable');
            assert.equal(await page.evaluate(() => diagnostics.length), variant === 'unavailable' ? 1 : 3);
            await page.getByRole('button', { name: 'Animate', exact: true }).waitFor();
        }
        await page.evaluate(() => runtime.dispose()); console.log('PASS Script ' + variant); await page.close();
    }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
