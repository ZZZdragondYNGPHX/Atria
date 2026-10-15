import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer, tearDownServer } from '../_lib/server.js';
import { awaitMainUI } from '../_lib/page.js';

let server, dataRoot;
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
    dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-storage-center-browser-'));
    server = await startServer({ batchKey: 'storage', scenarioId: 'resource-center', useExistingDataRoot: dataRoot,
        extraConfig: { enableUserAccounts: false } });
});

test.afterAll(async () => {
    if (server) await tearDownServer(server);
    if (dataRoot && path.resolve(dataRoot).startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(dataRoot, { recursive: true, force: true });
});

async function open(page) {
    await page.evaluate(async () => { const mod = await import('/scripts/storage-management.js'); void mod.openStorageManagement(); });
    const panel = page.locator('.storage-center-dialog'); await expect(panel).toBeVisible();
    await expect(panel.locator('.storage-center-category')).toHaveCount(9, { timeout: 20000 }); return panel;
}

test('real server world moves to the recycle bin and returns to its business page with the same identity', async ({ page }, info) => {
    await awaitMainUI(page, server.baseURL);
    const world = await page.evaluate(async () => (await import('/scripts/native/product-client.js')).nativeProductClient.createWorld('Recoverable browser world'));
    const panel = await open(page);
    await panel.getByRole('button', { name: 'Worlds & knowledge', exact: true }).click();
    await panel.getByRole('checkbox', { name: 'Select Recoverable browser world', exact: true }).check();
    await panel.getByRole('button', { name: 'Preview recycle bin move', exact: true }).click();
    await expect(panel.getByRole('heading', { name: 'Review fixed operation' })).toBeVisible();
    await expect(panel).toContainText('30 days');
    await panel.getByRole('button', { name: 'Move to recycle bin', exact: true }).click();
    await expect(panel.locator('.storage-center-result')).toContainText('Succeeded', { timeout: 15000 });
    await panel.locator('.storage-center-nav').getByRole('button', { name: 'Backups & recycle bin', exact: true }).click();
    await expect(panel.locator('.storage-center-recovery')).toContainText('Recoverable browser world');
    await panel.getByRole('button', { name: 'Restore original identity', exact: true }).click();
    await panel.getByRole('button', { name: 'Restore original identity', exact: true }).click();
    await expect(panel.locator('.storage-center-result')).toContainText('Succeeded', { timeout: 15000 });
    const restored = await page.evaluate(async id => (await import('/scripts/native/product-client.js')).nativeProductClient.getWorld(id), world.worldId);
    expect(restored.world.worldId).toBe(world.worldId);
    await panel.getByRole('button', { name: 'Refresh resources', exact: true }).click();
    await expect(panel.locator('.storage-center-category')).toHaveCount(9);
    await page.screenshot({ path: info.outputPath('server-overview.png') });
    await page.keyboard.press('Escape'); await expect(panel).toHaveCount(0);
});

test('browser records are fully enumerated, primary-key edits and duplicate creates are rejected, fixed deletion completes', async ({ page }) => {
    await awaitMainUI(page, server.baseURL);
    const checked = await page.evaluate(async () => {
        const database = await new Promise((resolve, reject) => {
            const request = indexedDB.open('storage-center-250', 1); request.onupgradeneeded = () => request.result.createObjectStore('rows', { keyPath: 'id' });
            request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        });
        await new Promise((resolve, reject) => { const tx = database.transaction('rows', 'readwrite'); for (let id = 0; id < 250; id++) tx.objectStore('rows').put({ id, value: 'row-' + id }); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); database.close();
        const { BrowserProvider, BrowserMutator } = await import('/scripts/browser-storage-inspector.js');
        const provider = new BrowserProvider(), mutator = new BrowserMutator(), rows = await provider.fetch(['indexeddb', 'storage-center-250', 'rows']);
        let changedKey = false, duplicate = false;
        try { await mutator.writeAtPath(['indexeddb', 'storage-center-250', 'rows', rows.entries[0].key], {}, JSON.stringify({ id: 1000, value: 'wrong' })); } catch (error) { changedKey = error.code === 'E_CONFLICT'; }
        localStorage.setItem('storage-center-duplicate', 'original');
        try { await mutator.createAtPath(['localStorage'], 'storage-center-duplicate', 'replacement'); } catch (error) { duplicate = error.code === 'E_CONFLICT'; }
        localStorage.setItem('atri_learning_v1', '{"version":1}');
        return { count: rows.entries.length, changedKey, duplicate, original: localStorage.getItem('storage-center-duplicate') };
    });
    expect(checked).toEqual({ count: 250, changedKey: true, duplicate: true, original: 'original' });
    const panel = await open(page);
    await panel.getByRole('combobox', { name: 'Storage scope', exact: true }).selectOption('browser');
    await panel.getByRole('button', { name: 'Device preferences', exact: true }).click();
    await panel.getByRole('checkbox', { name: 'Select atri_learning_v1', exact: true }).check();
    await panel.getByRole('button', { name: 'Preview permanent deletion', exact: true }).click();
    await expect(panel).toContainText('This action cannot be undone.');
    await panel.getByRole('button', { name: 'Permanently delete', exact: true }).click();
    await expect(panel.locator('.storage-center-result')).toContainText('Succeeded');
    expect(await page.evaluate(() => localStorage.getItem('atri_learning_v1'))).toBeNull();
});

test('mobile navigation, keyboard focus, loading and failure feedback remain usable', async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 }); await awaitMainUI(page, server.baseURL);
    const panel = await open(page); await panel.getByRole('button', { name: 'Cleanup suggestions', exact: true }).click();
    await expect(panel.getByRole('heading', { name: 'Cleanup suggestions' })).toBeVisible();
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath('mobile-cleanup.png') });
    await page.keyboard.press('Tab'); expect(await panel.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await page.route('**/api/users/storage/center/snapshot', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"storage_usage_unavailable"}' }));
    await panel.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(panel.locator('[role="status"]')).toContainText('Usage could not be measured');
    await page.keyboard.press('Escape'); await expect(panel).toHaveCount(0);
});
