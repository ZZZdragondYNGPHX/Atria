import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const root = resolve('public'); const output = resolve('.git/p2-evidence'); await mkdir(output, { recursive: true });
const fixture = JSON.parse(await readFile('tests/native/fixtures/message-projection-v2.json', 'utf8'));
const server = createServer(async (req, res) => {
    try {
        if (req.url === '/') {
            res.setHeader('Content-Type', 'text/html');
            res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/atria-tokens.css"><link rel="stylesheet" href="/css/atria-shell.css"><link rel="stylesheet" href="/css/atria-library.css"><style>body{margin:0;padding:16px;background:var(--atri-surface-0,#151922);color:var(--atri-text-primary,#edf0f5);font:16px/1.5 system-ui}.atria-app-shell{display:block;position:static;width:auto;height:auto;min-height:0;max-width:760px;margin:auto;background:transparent}h1{font-size:24px}.mes{margin:20px 0}.mes_text{min-width:0}button,select,summary{cursor:pointer}select:focus-visible{outline:2px solid var(--atri-accent)}details{max-width:100%}</style></head><body><main class="atria-app-shell"><h1>Harbor · Native Conversation</h1><div id="chat"><article class="mes" mesid="0"><div class="mes_text">The first delivery.</div></article><article class="mes" mesid="1"><div class="mes_text">I accept the courier’s reward.</div></article><article class="mes" mesid="2"><div class="mes_text">The harbor bells rang as the courier arrived.</div></article></div></main></body></html>'); return;
        }
        const file = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
        if (!file.startsWith(root + sep)) throw new Error('Invalid path');
        res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[extname(file)] || 'application/octet-stream'); res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(ready => server.listen(0, '127.0.0.1', ready));
const browser = await chromium.launch({ channel: process.env.ATRIA_BROWSER_CHANNEL || 'msedge', headless: true });
try {
    for (const width of [1440, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 1100 } });
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.evaluate(async fixture => {
            const { compileUiDocument } = await import('/scripts/native/experience/ui/v2-document.js');
            const { mountConversationPresentation } = await import('/scripts/native/message-presentation.js');
            const { createReplyVariantController } = await import('/scripts/native/reply-variants.js');
            window.claims = []; window.renderReceipts = [];
            const snapshot = { session: { sessionId: 'ses_test' }, revision: { branchId: 'child', revisionId: 'r4' },
                timeline: [{ messageId: 'opening', activeVariantId: 'v0', role: 'assistant' }, { messageId: 'user', activeVariantId: 'vu', role: 'user' }, { messageId: 'two', activeVariantId: 'v2', role: 'assistant' }],
                variants: [{ variantId: 'v0', content: 'The first delivery.' }, { variantId: 'vu', content: 'I accept the courier’s reward.' }, { variantId: 'v2', content: 'The harbor bells rang as the courier arrived.', projection: fixture.projection }] };
            const history = { sessionId: 'ses_test', activeBranchId: 'child', headRevisionId: 'r4', branches: [
                { branchId: 'main', parentBranchId: null, headRevisionId: 'r2', createdAt: 1 }, { branchId: 'child', parentBranchId: 'main', forkRevisionId: 'r1', headRevisionId: 'r4', displayName: 'Harbor delivery', createdAt: 3 }],
            revisions: [
                { revisionId: 'r1', branchId: 'main', parentRevisionId: null, timelineHead: { messageId: 'user' }, createdAt: 1 },
                { revisionId: 'r2', branchId: 'main', parentRevisionId: 'r1', timelineHead: { messageId: 'one', variantId: 'v1' }, createdAt: 2 },
                { revisionId: 'r3', branchId: 'child', parentRevisionId: 'r2', timelineHead: { messageId: 'user' }, createdAt: 3 },
                { revisionId: 'r4', branchId: 'child', parentRevisionId: 'r3', timelineHead: { messageId: 'two', variantId: 'v2' }, createdAt: 4 }],
            messages: [{ messageId: 'user', branchId: 'main', role: 'user', sequence: 1, preview: 'Accept the delivery' }, { messageId: 'one', branchId: 'main', role: 'assistant', sequence: 2, preview: 'A different courier arrives.' }, { messageId: 'two', branchId: 'child', role: 'assistant', sequence: 2, preview: 'The harbor bells rang as the courier arrived.' }] };
            window.replyController = createReplyVariantController({ document, loadHistory: async () => history,
                getContext: () => ({ sessionId: 'ses_test', revisionId: 'r4', branchId: 'child', tailMessageId: 'two', canWrite: true }), onInspect: async () => {} });
            window.presentation = mountConversationPresentation(compileUiDocument(fixture.document), { document, window,
                getSnapshot: () => snapshot, isActiveTail: anchor => anchor.variantId === 'v2',
                worldSession: { getRevisionId: () => 'r4', getActionReceipts: () => window.claims, dispatchAction: async request => { window.claims.push({ ...request, receiptId: 'receipt1' }); return window.claims.at(-1); } },
                onRenderReceipt: receipt => window.renderReceipts.push(receipt), mountReplyVariants: (element, anchor) => window.replyController.mount(element, anchor) });
        }, fixture);
        await page.getByRole('combobox', { name: 'Conversation view' }).selectOption('latest');
        assert.equal(await page.locator('.mes').first().isVisible(), false);
        await page.getByRole('combobox', { name: 'Conversation view' }).selectOption('reader');
        await page.getByRole('button', { name: 'Toggle details' }).click();
        await page.getByText('Claim details', { exact: true }).click();
        await page.getByRole('button', { name: 'Claim reward' }).click();
        await page.getByText('Action completed', { exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Claim reward' }).isDisabled(), true);
        assert.equal(await page.evaluate(() => window.claims.length), 1);
        assert.equal(await page.evaluate(() => window.renderReceipts.every(item => item.kind === 'render')), true);
        await page.locator('[data-atria-reply-variants="two"] > summary').click();
        await page.getByText('Reply 2 of 2', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Previous reply' }).click();
        await page.getByText('A different courier arrives.', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Next reply' }).click();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        const screenshot = resolve(output, `P2-${width}.png`); await page.screenshot({ path: screenshot, fullPage: true });
        assert.deepEqual(errors, []);
        await page.evaluate(() => { window.presentation.dispose(); window.replyController.dispose(); });
        assert.equal(await page.locator('.atri-message-flow').count(), 0);
        assert.equal(await page.locator('.mes_text').last().textContent(), 'The harbor bells rang as the courier arrived.');
        console.log(`P2 Edge ${width}px: flow/details/receipt-once/feed-latest-reader/reply-preview/overflow/cleanup PASS; screenshot=${screenshot}`);
        await page.close();
    }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
