import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture } from '../native/helpers/session-fixture.js';
const sizes = (process.env.ATRIA_PLAY_WINDOW_SIZES ?? '100,1000,5000').split(',').map(Number);
const widths = (process.env.ATRIA_PLAY_WINDOW_WIDTHS ?? '1440,390').split(',').map(Number);
const root = resolve('public'), h = await makeTempFsEngineHarness(), f = await installFixture(h), snapshots = new Map(), samples = [];
for (const size of sizes) {
    const first = await f.core.create(h.handle, f.start);
    const additions = Array.from({ length: size - 1 }, (_, i) => f.core._newEntry(first, { role: i % 2 ? 'assistant' : 'user',
        content: `Original ${i}\n\n` + 'A changing paragraph preserves the complete original story. '.repeat(1 + i % 20) }, i + 1));
    snapshots.set(size, await f.core._publish(h.handle, first, { timeline: [...first.timeline, ...additions.map(item => item.entry)],
        entries: additions.map(item => item.entry), variants: additions.map(item => item.variant) }));
}
const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://local');
        if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<style>.atria-play-conversation{height:600px;overflow:auto}.atria-play-message{padding:16px}body{margin:0}</style><div id="host"></div><form id="abi"><textarea id="input"></textarea></form>'); return; }
        if (url.pathname === '/fixture') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(snapshots.get(Number(url.searchParams.get('size'))))); return; }
        if (url.pathname === '/timeline') {
            const parts = []; for await (const chunk of req) parts.push(chunk);
            const request = JSON.parse(Buffer.concat(parts));
            res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(await f.sessionRepo.readTimelineRange(h.handle, request.sessionId, request))); return;
        }
        const file = resolve(root, '.' + decodeURIComponent(url.pathname));
        if (!file.startsWith(root + sep)) throw new Error('Outside fixture root');
        res.setHeader('Content-Type', extname(file) === '.js' ? 'text/javascript' : 'text/plain'); res.end(await readFile(file));
    } catch (error) { res.statusCode = 500; res.end(error.message); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
    browser = await chromium.launch({ headless: true });
    for (const width of [1440, 390]) for (const size of sizes) {
        const page = await browser.newPage({ viewport: { width, height: 900 } }), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto('http://127.0.0.1:' + server.address().port);
        const result = await page.evaluate(async size => {
            const { mountAtriaPlayProduct } = await import('/scripts/native/play-product.js');
            const snapshot = await (await fetch('/fixture?size=' + size)).json(); let requests = 0;
            window.Atria = { nativeSessionRuntime: { active: true, snapshot,
                request: async (_path, input, { signal }) => { requests++; return (await fetch('/timeline', { method: 'POST', body: JSON.stringify(input), signal })).json(); } } };
            const start = performance.now();
            window.product = mountAtriaPlayProduct({ root: document.querySelector('#host'), native: { sendForm: document.querySelector('#abi'), sendTextarea: document.querySelector('#input') } });
            await new Promise(resolve => setTimeout(resolve, 80));
            return { mountMs: performance.now() - start, nodes: product.conversation.querySelectorAll('[data-atria-message-id]').length, requests };
        }, size);
        assert.equal(errors.length, 0, errors.join('\n')); assert.ok(result.nodes <= 64); assert.ok(result.requests > 0);
        await page.evaluate(() => { product.conversation.scrollTop = 0; product.conversation.dispatchEvent(new Event('scroll')); });
        await page.waitForFunction(() => product.conversation.querySelector('[data-atria-message-id]')?.dataset.sequence === '0');
        const anchor = await page.evaluate(() => {
            const node = product.conversation.querySelector('[data-atria-message-id]'), id = node.dataset.atriaMessageId;
            document.body.dataset.generating = 'true'; document.dispatchEvent(new CustomEvent('atria-native-play-draft', { detail: { text: 'Uncommitted draft' } }));
            return { id, top: product.conversation.scrollTop, same: node === product.conversation.querySelector('[data-atria-message-id]') };
        });
        assert.ok(anchor.same); assert.ok(anchor.top < 100);
        assert.ok(await page.locator('[data-atria-message-id]').count() <= 64);
        await page.evaluate(() => product.dispose()); await page.close();
        samples.push({ width, size, ...result });
    }
    console.log(JSON.stringify({ browser: browser.version(), samples, physicalDevice: false }, null, 2));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); await h.cleanup(); }
