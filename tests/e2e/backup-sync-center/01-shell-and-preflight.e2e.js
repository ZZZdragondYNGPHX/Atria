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

    test('successful preflight enables restore and streams visible phase progress', async ({ page }) => {
        await page.route('**/api/users/restore-backup/probe', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    compatible: true,
                    engineKind: 'fs',
                    destinationEngineKind: 'fs',
                    restorePlan: {
                        mode: 'full',
                        stagedEngineRestore: false,
                        crossModeRequired: false,
                        recoveryPoint: 'required',
                        verification: 'required',
                    },
                    preflight: {
                        totalEntries: 3,
                        targetableEntries: 3,
                        skippedEntries: 0,
                        rejectedEntries: 0,
                        categoryStats: {
                            settings: { targetableEntries: 1 },
                            chats: { targetableEntries: 2 },
                        },
                        warnings: [],
                    },
                }),
            });
        });
        await page.route('**/api/users/restore-backup', async route => {
            expect(route.request().headers().accept).toContain('application/x-ndjson');
            await route.fulfill({
                status: 200,
                headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
                body: [
                    JSON.stringify({ type: 'progress', phase: 'stage', current: 64, total: 128 }),
                    JSON.stringify({ type: 'progress', phase: 'snapshot', current: 0, total: 1 }),
                    JSON.stringify({
                        type: 'progress',
                        phase: 'extract',
                        current: 1,
                        total: 3,
                        entry: 'extensions/example/model.bin',
                        entryOrdinal: 2,
                        entryBytes: 1024,
                        entryTotalBytes: 4096,
                    }),
                    JSON.stringify({ type: 'progress', phase: 'extract', current: 2, total: 3 }),
                    JSON.stringify({ type: 'result', restoredCount: 3, failedCount: 0 }),
                    '',
                ].join('\n'),
            });
        });

        await awaitMainUI(page, server.baseURL);
        await page.evaluate(async () => {
            const mod = await import('/scripts/backup-sync-center.js');
            void mod.openBackupSyncCenter({ handle: 'default-user' });
        });
        const center = page.locator('.backupSyncCenter').last();
        await center.waitFor({ state: 'visible', timeout: 10_000 });
        await center.locator('.backupSyncTab[data-tab="archive"]').click();
        await center.locator('input[name="backupRestoreMode"][value="full"]').check();

        const zipPath = path.join(tempDir, 'streaming.zip');
        writeFileSync(zipPath, 'PK\u0003\u0004mock');
        await center.locator('.backupArchiveInput').setInputFiles(zipPath);

        await expect(center.locator('.backupPreflightReport')).toHaveAttribute('data-state', 'ok');
        await expect(center.locator('.backupRestoreStart')).toBeEnabled();

        await center.locator('.backupRestoreStart').click();
        const confirm = page.locator('dialog.popup[open]').last();
        await confirm.locator('.popup-button-ok').click();

        await expect(center.locator('.backupRestoreProgress')).toHaveAttribute('data-state', 'ok');
        await expect(center.locator('.backupRestoreProgress')).toContainText('恢复完成：3 项；失败 0 项。');
        await expect(center.locator('.backupRestoreStart')).toBeEnabled();
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
