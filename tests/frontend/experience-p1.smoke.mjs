import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const root = resolve('public');
const fixture = JSON.parse(await readFile('tests/native/fixtures/component-v2-opening.json', 'utf8'));
fixture.views.push({ id: 'help', surface: 'modal', mount: 'on-demand', root: { id: 'help_text', type: 'text', props: { text: 'Opening help' } } });
fixture.actions.help = { steps: [{ op: 'surface.open', view: 'help' }] };
const server = createServer(async (req, res) => {
    try {
        if (req.url === '/') {
            res.setHeader('Content-Type', 'text/html');
            res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/atria-tokens.css"><link rel="stylesheet" href="/css/atria-shell.css"><style>body{margin:0;padding:24px;background:#151922;color:#edf0f5;font:16px/1.5 system-ui}main{max-width:720px;margin:auto}h1{font-size:24px}</style></head><body><main><h1>Native Opening</h1><section id="root"></section><dialog id="modal"><button id="close">Close</button></dialog></main></body></html>');
            return;
        }
        const file = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
        if (!file.startsWith(root + sep)) throw new Error('Invalid path');
        res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[extname(file)] || 'application/octet-stream');
        res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(ready => server.listen(0, '127.0.0.1', ready));
const browser = await chromium.launch({ channel: process.env.ATRIA_BROWSER_CHANNEL || 'msedge', headless: true });
try {
    for (const width of [1440, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.evaluate(async raw => {
            const { compileUiDocument } = await import('/scripts/native/experience/ui/v2-document.js');
            const { mountUiDocument } = await import('/scripts/native/experience/ui/v2-runtime.js');
            const { createSurfaceHost } = await import('/scripts/native/experience/ui/surfaces.js');
            const root = document.getElementById('root'), modal = document.getElementById('modal');
            document.getElementById('close').onclick = () => modal.close();
            window.submits = 0; window.draft = '';
            window.runtime = mountUiDocument(compileUiDocument(raw, { mode: 'component' }), {
                document, window, environmentRoot: root,
                surfaceHost: createSurfaceHost({ resolveSurface: surface => surface === 'modal' ? modal : root }),
                data: { items: Array.from({ length: 200 }, (_, index) => ({ id: String(index), name: 'Catalog item ' + (index + 1) })) },
                composer: { setDraft: value => { window.draft = value; }, submit: async () => { window.submits++; } },
            });
        }, fixture);
        await page.locator('#atri-ui-setup_form button[type=submit]').click();
        assert.equal(await page.locator('#atri-ui-name').getAttribute('aria-invalid'), 'true');
        assert.equal(await page.locator('#atri-ui-name').evaluate(node => node === document.activeElement), true);
        await page.locator('#atri-ui-name').fill('Aster');
        await page.locator('#atri-ui-setup_form button[type=submit]').click();
        await page.locator('#atri-ui-review_form').waitFor({ state: 'visible' });
        assert.match(await page.locator('#atri-ui-greeting').textContent(), /Aster/);
        await page.evaluate(() => window.runtime.execute('back'));
        assert.equal(await page.locator('#atri-ui-name').inputValue(), 'Aster');
        await page.locator('#atri-ui-items button').click();
        assert.equal(await page.locator('#atri-ui-items .atri-ui-text').count(), 4);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
        await page.screenshot({ path: join(tmpdir(), `atria-p1-${width}.png`), fullPage: true });
        await page.evaluate(() => window.runtime.execute('help'));
        await page.locator('#close').click();
        await page.evaluate(() => window.runtime.execute('help'));
        assert.equal(await page.locator('#modal').evaluate(node => node.open), true);
        await page.keyboard.press('Escape');
        await page.evaluate(async () => { await window.runtime.execute('next'); await Promise.all([window.runtime.execute('begin'), window.runtime.execute('begin')]); });
        assert.equal(await page.evaluate(() => window.submits), 1);
        assert.match(await page.evaluate(() => window.draft), /Aster/);
        await page.evaluate(() => window.runtime.dispose());
        assert.equal(await page.locator('[data-atria-game-mount]').count(), 0);
        assert.deepEqual(errors, []);
        console.log(`P1 browser ${width}px passed; screenshot ${join(tmpdir(), `atria-p1-${width}.png`)}`);
        await page.close();
    }
} finally { await browser.close(); await new Promise(done => server.close(done)); }
