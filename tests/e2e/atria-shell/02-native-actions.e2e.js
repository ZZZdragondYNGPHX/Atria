import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FsEngine } from '../../../src/storage/engines/fs-engine.js';
import { seedGenerationProfiles } from '../../native/helpers/generation-fixture.js';
import { disableExtensions } from '../_lib/fixtures.js';
import { awaitMainUI } from '../_lib/page.js';
import { startServer, tearDownServer } from '../_lib/server.js';
import { seedNativeSessionDataRoot, createAndOpenNativeSession, snapshotLegacyPersistence } from '../native-session/_helpers.js';

// N10 retired editable legacy messages/swipes. Protect their Native equivalents
// through real generation and immutable Session operations, keeping the ABI unique.
let server, provider, seeded, legacy;
let reply = 0;
test.describe.configure({ mode: 'serial' });
test.use({ actionTimeout: 12000 });

test.beforeAll(async () => {
    provider = createServer(async (req, res) => {
        let body = ''; for await (const chunk of req) body += chunk;
        const input = JSON.parse(body);
        const message = input.messages?.filter(item => item.role === 'user').at(-1)?.content || '';
        const chunk = content => 'data: ' + JSON.stringify({ choices: [{ delta: { content } }] }) + '\n\n';
        res.setHeader('Content-Type', 'text/event-stream');
        if (String(message).includes('Wait at the gate')) {
            res.write(chunk('Uncommitted harbour draft'));
            const timer = setTimeout(() => res.end(chunk(' late result') + 'data: [DONE]\n\n'), 30000);
            res.on('close', () => clearTimeout(timer));
        } else res.end(chunk(`Harbour reply ${++reply}. The keeper raises the lantern.`) + 'data: [DONE]\n\n');
    });
    await new Promise(done => provider.listen(0, '127.0.0.1', done));
    seeded = await seedNativeSessionDataRoot({ suffix: 'phase8-action-continuity' });
    const root = resolve(seeded.dataRoot, seeded.handle);
    const engine = new FsEngine({ directoriesByHandle: () => ({ root, assets: resolve(root, 'assets') }) });
    await seedGenerationProfiles({ engine, handle: seeded.handle, endpoint: `http://127.0.0.1:${provider.address().port}/v1/chat/completions`, roles: ['narrator'], streaming: true });
    await engine.close();
    writeFileSync(resolve(root, 'secrets.json'), JSON.stringify({ api_key_custom: [{ id: 'p4-synthetic-key', value: 'phase8-test-only', active: true, label: 'Synthetic fixture' }], _migrated: true }));
    disableExtensions({ dataRoot: seeded.dataRoot, names: ['stable-diffusion'] });
    server = await startServer({ batchKey: 'generation', scenarioId: 'phase8-actions', useExistingDataRoot: seeded.dataRoot });
    legacy = snapshotLegacyPersistence(seeded.dataRoot);
});

test.afterAll(async () => {
    await tearDownServer(server, { removeData: false });
    await new Promise(done => { provider?.closeAllConnections(); provider?.close(done); });
});

async function boot(page) {
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/**', route => route.fulfill({ json: [] }));
    await awaitMainUI(page, server.baseURL);
    await createAndOpenNativeSession(page, seeded.start);
}
async function stable(page) {
    expect(await page.evaluate(() => ({
        chat: document.querySelectorAll('#chat').length,
        sendForm: document.querySelectorAll('#send_form').length,
        textarea: document.querySelectorAll('#send_textarea').length,
        parent: document.getElementById('sheld').parentElement.id,
        native: document.querySelectorAll('[data-atria-composer="native"]').length,
    }))).toEqual({ chat: 1, sendForm: 1, textarea: 1, parent: 'atria-native-play-host', native: 1 });
    expect(snapshotLegacyPersistence(seeded.dataRoot)).toEqual(legacy);
}
async function more(page, label) {
    const toolbar = page.locator('[data-atria-native-play-actions]');
    await toolbar.locator('summary').click();
    await toolbar.getByRole('button', { name: label, exact: true }).click();
}
async function send(page, text) {
    const nextReply = reply + 1;
    const composer = page.locator('[data-atria-composer="native"]');
    await composer.getByRole('textbox', { name: 'Message', exact: true }).fill(text);
    await composer.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.locator('[data-atria-conversation="native"]')).toContainText(`Harbour reply ${nextReply}`);
    await expect(composer.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
}

test('Native send, retry, re-enter, saves and restart preserve immutable history and one ABI', async ({ page }) => {
    await boot(page);
    await send(page, 'Read the harbour chart.');
    const original = await page.evaluate(() => structuredClone(window.Atria.nativeSessionRuntime.snapshot));
    const previousReply = reply;
    await more(page, 'Retry Reply');
    await expect(page.locator('[data-atria-conversation="native"]')).toContainText(`Harbour reply ${previousReply + 1}`);
    await expect.poll(() => page.evaluate(() => window.Atria.nativeSessionRuntime.snapshot.timeline.length)).toBe(original.timeline.length);
    await more(page, 'Re-enter Turn');
    await expect(page.locator('[data-atria-composer="native"] textarea')).toHaveValue('Read the harbour chart.');
    await expect(page.locator('[data-atria-composer="native"] textarea')).toBeFocused();
    await send(page, 'Read the northern chart instead.');
    await more(page, 'Quick Save');
    await expect(page.locator('.atria-native-play-actions__status')).toContainText('Saved');
    await page.getByRole('button', { name: 'Timeline', exact: true }).click();
    const drawer = page.locator('[data-atria-native-play-drawer]');
    await expect(drawer.locator('[data-atria-save-id]')).toHaveCount(1);
    await drawer.locator('[data-atria-timeline-message-id]').first().getByRole('button', { name: 'Restart From Here' }).click();
    await expect(drawer).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.Atria.nativeSessionRuntime.snapshot.timeline.length)).toBe(1);
    const history = await page.evaluate(async original => {
        const response = await fetch('/api/native/session/load', { method: 'POST', headers: window.Atria.getContext().getRequestHeaders(), body: JSON.stringify({ sessionId: original.session.sessionId, revisionId: original.revision.revisionId }) });
        if (!response.ok) throw new Error(await response.text());
        return response.json();
    }, original);
    expect(history.timeline).toEqual(original.timeline);
    await stable(page);
});

test('Stop drops the draft and the same Native composer can send after navigation', async ({ page }) => {
    await boot(page);
    const composer = page.locator('[data-atria-composer="native"]');
    await composer.getByRole('textbox', { name: 'Message', exact: true }).fill('Wait at the gate');
    await composer.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.locator('[data-atria-draft]')).toContainText('Uncommitted harbour draft');
    await composer.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(page.locator('[data-atria-draft]')).toHaveCount(0);
    expect(await page.evaluate(() => window.Atria.nativeSessionRuntime.snapshot.timeline.some(item => item.content.includes('Uncommitted harbour draft')))).toBe(false);
    await page.evaluate(async () => { const host = window.Atria.shell.getWorkspaceHost(); await host.openUtility('settings'); await host.openPlay(); });
    const before = reply;
    await send(page, 'The gate is open now.');
    await expect(page.locator('[data-atria-conversation="native"]')).toContainText(`Harbour reply ${before + 1}`);
    await stable(page);
});
