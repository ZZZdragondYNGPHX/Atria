import { test, expect } from '@playwright/test';

import { startServer, tearDownServer } from '../_lib/server.js';
import { awaitMainUI } from '../_lib/page.js';
import {
    createAndOpenNativeSession,
    seedNativeSessionDataRoot,
    snapshotLegacyPersistence,
} from './_helpers.js';

let server;
let seeded;
let legacyBaseline;

test.describe.serial('N9 Native Product UI real-host acceptance', () => {
    test.beforeAll(async () => {
        seeded = await seedNativeSessionDataRoot({ suffix: 'n9-product-ui' });
        server = await startServer({
            batchKey: 'chat',
            scenarioId: 'native-session-n9-product-ui',
            useExistingDataRoot: seeded.dataRoot,
        });
        legacyBaseline = snapshotLegacyPersistence(server.dataRoot);
    });

    test.afterAll(async () => {
        await tearDownServer(server);
    });

    test('R7 Library exposes Native Works and Play exposes only Native mutation actions', async ({ page }) => {
        test.setTimeout(120_000);
        await awaitMainUI(page, server.baseURL);

        await page.evaluate(() => {
            window.Atria.shell.getWorkspaceHost().openLibrarySection('works');
        });
        await expect(page.locator('[data-atria-native-library="works"]')).toBeVisible();
        await expect(page.locator('[data-atria-work-id]').first()).toBeVisible();
        await expect(page.locator('#right-nav-panel[data-atria-workspace-embedded="true"]')).toHaveCount(0);

        await createAndOpenNativeSession(page, seeded.start);
        await expect(page.locator('body')).toHaveAttribute('data-atria-native-session-active', 'true');

        const toolbar = page.locator('[data-atria-native-play-actions="true"]');
        await expect(toolbar).toBeVisible();
        for (const label of [
            'Retry Reply',
            'Re-enter Turn',
            'Restart From Here',
            'Save',
            'Quick Save',
            'Load',
            'Timeline',
            'Context',
        ]) {
            await expect(toolbar.getByRole('button', { name: label, exact: true })).toBeVisible();
        }

        for (const selector of [
            '#chat .swipe_left',
            '#chat .swipe_right',
            '#chat .swipes-counter',
            '#chat .swipe_picker_block',
            '#chat .mes_edit',
            '#chat .mes_edit_delete',
            '#option_regenerate',
        ]) {
            await expect(page.locator(selector).first()).toBeHidden();
        }

        await toolbar.getByRole('button', { name: 'Timeline', exact: true }).click();
        await expect(page.locator('[data-atria-native-play-drawer="true"]')).toBeVisible();
        await expect(page.locator('[data-atria-timeline-message-id]').first()).toBeVisible();

        await toolbar.getByRole('button', { name: 'Context', exact: true }).click();
        await expect(page.locator('[data-atria-context-plan="true"]')).toBeVisible();

        await page.setViewportSize({ width: 390, height: 844 });
        await expect(toolbar).toBeVisible();
        await expect(page.locator('#atria-native-play-host')).toBeVisible();

        expect(snapshotLegacyPersistence(server.dataRoot)).toEqual(legacyBaseline);
    });
});
