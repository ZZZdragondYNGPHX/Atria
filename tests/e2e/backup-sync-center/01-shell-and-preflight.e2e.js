import { test, expect } from '@playwright/test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { startServer, tearDownServer } from '../_lib/server.js';
import { awaitMainUI } from '../_lib/page.js';

let server;
let tempDir;

test.beforeAll(async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'atria-backup-sync-ui-'));
    server = await startServer({ batchKey: 'storage', scenarioId: 'backup-sync-shell' });
});

test.afterAll(async () => {
    await tearDownServer(server);
    rmSync(tempDir, { recursive: true, force: true });
});

async function openBackupSyncCenter(page) {
    const drawerClosed = await page.locator('#user-settings-button .drawer-icon.closedIcon').count().then(n => n > 0);
    if (drawerClosed) {
        await page.locator('#user-settings-button .drawer-toggle').click();
    }
    await page.locator('#account_button').click();
    const profile = page.locator('dialog.popup[open]').last();
    await profile.locator('.userBackupSyncButton').click();
    const center = page.locator('.backupSyncCenter').last();
    await center.waitFor({ state: 'visible', timeout: 10_000 });
    return center;
}

test.describe('Backup & Sync Center', () => {
    test('renders split automatic backup policies and future cloud providers', async ({ page }) => {
        await awaitMainUI(page, server.baseURL);
        const center = await openBackupSyncCenter(page);

        await expect(center.locator('.backupRetentionCard[data-retention-type="chat"]')).toBeVisible();
        await expect(center.locator('.backupRetentionCard[data-retention-type="settings"]')).toBeVisible();

        await center.locator('.backupSyncTab[data-tab="cloud"]').click();
        await expect(center.locator('.backupCloudProviders')).toContainText('Google Drive');
        await expect(center.locator('.backupCloudProviders')).toContainText('Microsoft OneDrive');
        await expect(center.locator('.backupCloudProviders')).toContainText('GitHub');
        await expect(center.locator('.backupCloudProviders')).toContainText('尚未连接实现');
    });

    test('invalid local artifact fails mandatory preflight and cannot start restore', async ({ page }) => {
        await awaitMainUI(page, server.baseURL);
        const center = await openBackupSyncCenter(page);
        await center.locator('.backupSyncTab[data-tab="archive"]').click();

        const invalidZip = path.join(tempDir, 'invalid.zip');
        writeFileSync(invalidZip, 'not a zip archive');
        await center.locator('.backupArchiveInput').setInputFiles(invalidZip);

        await expect(center.locator('.backupPreflightReport')).toHaveAttribute('data-state', 'error', { timeout: 15_000 });
        await expect(center.locator('.backupPreflightReport')).toContainText('预检失败');
        await expect(center.locator('.backupRestoreStart')).toHaveClass(/disabled/);
    });

    test('archive recovery history section is present and refreshable', async ({ page }) => {
        await awaitMainUI(page, server.baseURL);
        const center = await openBackupSyncCenter(page);
        await center.locator('.backupSyncTab[data-tab="archive"]').click();

        await expect(center.locator('.backupRecoveryRefresh')).toBeVisible();
        await center.locator('.backupRecoveryRefresh').click();
        await expect(center.locator('.backupRecoveryList')).toContainText(/恢复点|暂无/);
    });
});
