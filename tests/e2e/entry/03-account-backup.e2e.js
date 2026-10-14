import { test, expect } from '@playwright/test';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { awaitMainUI } from '../_lib/page.js';
import { startServer, tearDownServer } from '../_lib/server.js';
import { markOnboarded } from '../_lib/fixtures.js';

let server;
test.describe.configure({ mode: 'serial' });
test.use({ actionTimeout: 15000, locale: 'ja-JP' });

test.beforeAll(async () => {
    mkdirSync(resolve(import.meta.dirname, '../../.e2e-scratch'), { recursive: true });
    const dataRoot = mkdtempSync(resolve(import.meta.dirname, '../../.e2e-scratch/serene-account-'));
    mkdirSync(resolve(dataRoot, 'default-user'), { recursive: true });
    markOnboarded({ dataRoot });
    server = await startServer({ batchKey: 'regression', scenarioId: 'serene-account-backup', useExistingDataRoot: dataRoot });
});

test.afterAll(async () => { await tearDownServer(server); });

async function account(page, width = 1440, locale = 'en') {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(locale => localStorage.setItem('language', locale), locale);
    await page.route('**/api/horde/**', route => route.fulfill({ json: [] }));
    await awaitMainUI(page, server.baseURL);
    await page.evaluate(() => Atria.shell.getWorkspaceHost().openUtility('account'));
    const root = page.locator('[data-atria-account-embedded]'); await expect(root).toBeVisible();
    return root;
}

for (const [width, locale] of [[1440, 'en'], [900, 'zh-cn'], [320, 'zh-cn']]) test(`Account and backup are readable and keyboard-operable at ${width}px (${locale})`, async ({ page }, info) => {
    const root = await account(page, width, locale);
    await expect(root.locator('.atria-account-paper')).toHaveCount(2);
    await expect(root.locator('.userRole')).toHaveText(locale === 'en' ? 'Admin' : '管理员');
    await expect(root.locator('.userCreated')).toContainText(locale === 'en' ? '2026' : '年');
    await page.screenshot({ path: info.outputPath('account.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await root.locator('.userBackupSyncButton').click();
    const center = page.locator('.backupSyncCenter');
    const automatic = center.getByRole('tab').first(); await automatic.focus(); await automatic.press('End');
    await expect(center.getByRole('tab').last()).toBeFocused(); await page.keyboard.press('Enter');
    await expect(center.locator('[data-panel="cloud"]')).toBeVisible();
    await expect(center.locator('.backupCloudProviders')).toContainText(locale === 'en' ? 'Not available yet' : '尚未开放');
    await expect(center.locator('.backupCloudProviders button')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('backup-cloud.png'), fullPage: true });
    await center.locator('[data-tab="archive"]').click();
    await expect(center.locator('.backupRestoreStart')).toBeDisabled();
    await expect(center.locator('input[name="backupCategory"]')).toHaveCount(9);
    await page.screenshot({ path: info.outputPath('backup-archive.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Escape'); await expect(center).toBeHidden();
    await expect(root.locator('.userBackupSyncButton')).toBeFocused();
});

test('Retention rejects invalid input, guards repeated writes and preserves the receipt after a read failure', async ({ page }) => {
    const root = await account(page); await root.locator('.userBackupSyncButton').click();
    const center = page.locator('.backupSyncCenter'), save = center.locator('.backupRetentionSave');
    const count = center.locator('[data-retention-type="chat"] [data-field="maxPerEntity"]');
    await expect(count).toHaveValue('20'); await count.fill('-2'); await save.click();
    await expect(count).toBeFocused(); await expect(count).toHaveAttribute('aria-invalid', 'true');
    await expect(center.getByRole('alert')).toContainText('whole number'); await count.fill('20');
    let writes = 0, failRead = false, release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/api/backups/retention/settings', async route => {
        writes++; await gate; const response = await route.fetch(); failRead = true; await route.fulfill({ response });
    });
    await page.route('**/api/backups/retention/status', async route => {
        if (failRead) { failRead = false; await route.fulfill({ status: 503, json: { error: 'Read unavailable' } }); }
        else await route.continue();
    });
    await save.dblclick(); await expect(save).toHaveAttribute('aria-busy', 'true');
    expect(writes).toBe(1); await expect(count).toBeDisabled(); release();
    await expect(center.locator('.atri-library-feedback')).toContainText('Saved, but the backup list could not refresh');
    expect(writes).toBe(1);
    await center.locator('.backupManagedRefresh').click();
    await expect(center.locator('.atri-library-feedback')).toHaveText('Backup list refreshed.');
    expect(writes).toBe(1); await expect(count).toHaveValue('20');
});

test('Settings snapshots use native keyboard disclosure, preserve content on read failure and retry without another write', async ({ page }, info) => {
    const root = await account(page, 320); await root.locator('.userSettingsSnapshotsButton').click();
    const dialog = page.locator('dialog[open]').last();
    const saved = page.waitForResponse(response => response.url().endsWith('/api/settings/make-snapshot') && response.ok());
    await dialog.locator('.makeSnapshotButton').click(); await saved;
    await expect(dialog.locator('.snapshotList > details').first()).toBeVisible();
    const snapshot = dialog.locator('.snapshotList > details').first();
    await page.route('**/api/settings/load-snapshot', route => route.fulfill({ status: 503, json: { error: 'Read unavailable' } }), { times: 1 });
    await snapshot.locator('summary').focus(); await page.keyboard.press('Enter');
    await expect(snapshot).toHaveAttribute('open', '');
    await expect(snapshot.getByRole('alert')).toContainText('Could not load snapshot content');
    await snapshot.locator('.snapshotRetryButton').click();
    await expect(snapshot.locator('.snapshotContent')).toHaveValue(/firstRun/);
    await expect(snapshot.locator('.snapshotRetryButton')).toBeHidden();
    await page.screenshot({ path: info.outputPath('snapshot-retry-320.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
});

test('Browser storage keeps user keys and values literal in Chinese and supports keyboard drilldown', async ({ page }, info) => {
    const root = await account(page, 320, 'zh-cn');
    await page.evaluate(() => localStorage.setItem('User', 'Play'));
    await root.locator('.userStorageManagementButton').click();
    const center = page.locator('.storageManagementCenter');
    await center.locator('[data-tab="browser"]').click();
    const local = center.locator('.storageInspectorEntry[data-key="localStorage"] button.storageInspectorEntryLabel');
    await expect(local).toBeVisible(); await local.focus(); await page.keyboard.press('Enter');
    const row = center.locator('.storageInspectorEntry[data-key="User"]');
    await expect(row.locator('.storageInspectorEntryLabel')).toHaveText('User');
    await expect(row.locator('.storageInspectorEntryLabel')).toHaveAttribute('title', 'Play');
    await row.locator('.storageInspectorEntryViewButton').click();
    const valueId = await page.locator('dialog[open]').last().getAttribute('data-id');
    const value = page.locator(`dialog[data-id="${valueId}"]`); await expect(value.getByRole('textbox', { name: '存储内容', exact: true })).toHaveValue('Play');
    await page.keyboard.press('Escape'); await expect(value).toBeHidden();
    await page.screenshot({ path: info.outputPath('storage-literal-320.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('A real isolated ZIP backup passes preflight and restores with a recovery point', async ({ page }, info) => {
    test.setTimeout(150000);
    const root = await account(page, 900); const name = await root.locator('.userName').textContent();
    await root.locator('.userBackupSyncButton').click();
    const center = page.locator('.backupSyncCenter'); await center.locator('[data-tab="archive"]').click();
    const download = page.waitForEvent('download'); await center.locator('.backupArchiveDownload').click();
    const archive = await download; const file = await archive.path();
    await center.locator('.backupArchiveInput').setInputFiles({ name: archive.suggestedFilename(), mimeType: 'application/zip', buffer: readFileSync(file) });
    await expect(center.locator('.backupPreflightReport')).toHaveAttribute('data-state', 'ok', { timeout: 30000 });
    await expect(center.locator('.backupRestoreStart')).toBeEnabled();
    await page.screenshot({ path: info.outputPath('real-restore-preflight.png'), fullPage: true });
    let receipt;
    await page.route('**/api/users/restore-backup', async route => {
        // Read the real backend receipt before its successful UI reload clears
        // Chromium's response body. No restore outcome is synthesized here.
        const response = await route.fetch();
        const stream = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
        receipt = stream.find(item => item.type === 'result');
        await route.fulfill({ response });
    });
    await center.locator('.backupRestoreStart').click();
    await page.locator('dialog[open]').last().getByRole('button', { name: 'Start restore', exact: true }).click();
    await expect.poll(() => receipt).toBeDefined();
    expect(receipt).toBeDefined(); expect(receipt.failedCount).toBe(0); expect(receipt.restoredCount).toBeGreaterThan(0);
    await expect(center).toBeHidden({ timeout: 30000 });
    await page.evaluate(() => Atria.shell.getWorkspaceHost().openUtility('account'));
    await expect(root.locator('.userName')).toHaveText(name);
    await root.locator('.userBackupSyncButton').click(); await center.locator('[data-tab="archive"]').click();
    await expect(center.locator('.backupRecoveryList button')).not.toHaveCount(0);
});
