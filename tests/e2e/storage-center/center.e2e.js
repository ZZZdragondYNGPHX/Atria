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
    await expect(panel.getByRole('heading', { name: 'Review fixed operation' })).toBeVisible({ timeout: 20000 });
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

test('browser fixed membership, safe stopping, interrupted history and storage failures preserve truthful results', async ({ page }) => {
    await awaitMainUI(page, server.baseURL);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const result = await page.evaluate(async () => {
        const { BrowserResourceCenter } = await import('/scripts/browser-resource-center.js');
        const { BrowserMutator } = await import('/scripts/browser-storage-inspector.js');
        const center = new BrowserResourceCenter(), cache = await caches.open('resource-center-fixed');
        await cache.put('/fixed-before', new Response('before'));
        const fixed = await center.preview('purge', [{ path: ['cachestorage', 'resource-center-fixed'] }]);
        await cache.put('/fixed-after', new Response('after'));
        const conflict = await center.execute(fixed.id);
        const retained = (await cache.keys()).length;
        localStorage.setItem('stop-one', 'one'); localStorage.setItem('stop-two', 'two');
        const stop = await center.preview('purge', [{ path: ['localStorage', 'stop-one'] }, { path: ['localStorage', 'stop-two'] }]);
        const stopped = await center.execute(stop.id, task => { if (task.items.some(item => item.status === 'succeeded')) center.stop(task.id); });
        const interrupted = { ...stopped, id: crypto.randomUUID(), status: 'running' }; center.save(interrupted);
        const historical = new BrowserResourceCenter().tasks().find(task => task.id === interrupted.id).status;
        const fetch = center.provider.fetch; center.provider.fetch = async path => { if (path[0] === 'localStorage') throw new DOMException('Denied', 'SecurityError'); return fetch.call(center.provider, path); };
        const partial = await center.snapshot(); center.provider.fetch = fetch;
        const setItem = Storage.prototype.setItem; let quotaRejected = false;
        try {
            Storage.prototype.setItem = function () { throw new DOMException('Full', 'QuotaExceededError'); };
            try { await new BrowserMutator().createAtPath(['localStorage'], 'quota-reject', 'value'); } catch (error) { quotaRejected = error.code === 'E_QUOTA' || /Full|quota/i.test(error.message); }
        } finally { Storage.prototype.setItem = setItem; }
        await caches.delete('resource-center-fixed');
        return { conflict: conflict.items[0].status, retained, stopped: stopped.status, statuses: stopped.items.map(item => item.status), historical,
            partial: partial.completeness, readFailed: partial.errors.some(error => error.source === 'localStorage'), quotaRejected };
    });
    expect(result).toEqual({ conflict: 'failed', retained: 2, stopped: 'stopped', statuses: ['succeeded', 'pending'], historical: 'interrupted', partial: 'partial', readFailed: true, quotaRejected: true });
    expect(errors).toEqual([]);
});

test('large real resource lists paginate and keep all filtered selections fixed after later writes', async ({ page }) => {
    test.setTimeout(90000);
    await awaitMainUI(page, server.baseURL);
    await page.evaluate(async () => {
        const client = (await import('/scripts/native/product-client.js')).nativeProductClient;
        for (let index = 0; index < 53; index++) await client.createWorld('Paged center ' + String(index).padStart(2, '0'));
    });
    const panel = await open(page);
    await panel.getByRole('button', { name: 'Worlds & knowledge', exact: true }).click();
    await panel.getByRole('searchbox', { name: 'Search resources' }).fill('Paged center');
    await panel.getByRole('combobox', { name: 'Sort resources' }).selectOption('name');
    await expect(panel).toContainText('Showing 1–50 of 53');
    await panel.getByRole('button', { name: 'Select current page', exact: true }).click();
    await expect(panel.locator('[role="status"]')).toContainText('50 selected');
    await panel.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(panel).toContainText('Showing 51–53 of 53');
    await panel.getByRole('button', { name: 'Select all filtered results', exact: true }).click();
    await expect(panel.locator('[role="status"]')).toContainText('53 selected');
    await panel.getByRole('button', { name: 'Preview recycle bin move', exact: true }).click();
    await expect(panel.getByRole('heading', { name: 'Review fixed operation' })).toBeVisible({ timeout: 20000 });
    await page.evaluate(async () => (await import('/scripts/native/product-client.js')).nativeProductClient.createWorld('Paged center later'));
    await expect(panel.locator('.storage-center-result')).toHaveCount(53);
    await expect(panel).not.toContainText('Paged center later');
    await panel.getByRole('button', { name: 'Move to recycle bin', exact: true }).click();
    await panel.getByRole('button', { name: 'Stop after current object', exact: true }).click();
    await panel.getByRole('button', { name: 'Overview', exact: true }).click();
    await expect.poll(async () => page.evaluate(async () => {
        const { getRequestHeaders } = await import('/script.js');
        const response = await fetch('/api/users/storage/center/tasks', { method: 'POST', headers: getRequestHeaders(), body: '{}' });
        return (await response.json())[0]?.status;
    }), { timeout: 20000 }).toBe('stopped');
    await expect(panel.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
    await panel.getByRole('button', { name: 'Operation history', exact: true }).click();
    await panel.getByRole('button', { name: /Move to recycle bin · Stopped/ }).click();
    await expect(panel).toContainText('Not started');
    await panel.getByRole('button', { name: 'Review remaining items again', exact: true }).click();
    await expect(panel.getByRole('heading', { name: 'Review fixed operation' })).toBeVisible({ timeout: 20000 });
    await expect(panel).not.toContainText('Paged center later');
});

test('another tab updates the open account panel through the shared lifecycle notification', async ({ page, context }) => {
    await awaitMainUI(page, server.baseURL); const panel = await open(page);
    await panel.getByRole('button', { name: 'Worlds & knowledge', exact: true }).click();
    await panel.getByRole('searchbox', { name: 'Search resources' }).fill('Cross tab center');
    const other = await context.newPage();
    try {
        await awaitMainUI(other, server.baseURL);
        const created = await other.evaluate(async () => (await import('/scripts/native/product-client.js')).nativeProductClient.createWorld('Cross tab center'));
        await expect(panel.getByRole('checkbox', { name: 'Select Cross tab center', exact: true })).toBeVisible();
        await other.evaluate(async id => (await import('/scripts/native/product-client.js')).nativeProductClient.deleteWorld(id), created.worldId);
        await expect(panel.getByRole('checkbox', { name: 'Select Cross tab center', exact: true })).toHaveCount(0);
    } finally { await other.close(); }
});

test('Chinese settings entry and mobile panel preserve focus and fit the viewport', async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 }); await awaitMainUI(page, server.baseURL);
    const onboarding = page.getByRole('dialog', { name: 'Learning center', exact: true });
    const firstRun = await onboarding.isVisible();
    if (firstRun) {
        await onboarding.getByRole('combobox', { name: 'UI Language', exact: true }).selectOption('zh-cn');
        await Promise.all([page.waitForEvent('load'), page.locator('dialog.popup[open] .popup-button-ok').click()]);
        await awaitMainUI(page, server.baseURL);
    } else await page.evaluate(async () => (await import('/scripts/i18n.js')).setUiLanguage('zh-cn', { reload: false }));
    const guide = page.getByRole('button', { name: /Close guide|关闭引导/ });
    if (await guide.isVisible()) await guide.click();
    await page.evaluate(async () => {
        globalThis.Atria.shell.getWorkspaceHost().openUtility('settings');
    });
    await page.getByRole('button', { name: '资源占用与安全清理', exact: true }).click();
    const panel = page.locator('.storage-center-dialog'); await expect(panel).toBeVisible();
    await expect(panel.locator('.storage-center-category')).toHaveCount(9);
    await expect(panel).toContainText('个存储单元');
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath('mobile-chinese-overview.png') });
    await page.keyboard.press('Escape'); await expect(panel).toHaveCount(0);
});
