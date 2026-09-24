import { disableExtensions } from '../_lib/fixtures.js';
import { test, expect } from '@playwright/test';

import { startServer, tearDownServer } from '../_lib/server.js';
import { awaitMainUI } from '../_lib/page.js';
import {
    seedNativeSessionDataRoot,
    snapshotLegacyPersistence,
} from './_helpers.js';

let server;
let seeded;
let legacyBaseline;

test.describe.serial('N10 Native Product UI hard-cutover acceptance', () => {
    test.beforeAll(async () => {
        seeded = await seedNativeSessionDataRoot({ suffix: 'n9-product-ui' });
        disableExtensions({ dataRoot: seeded.dataRoot, names: ['stable-diffusion'] });
        server = await startServer({
            batchKey: 'chat',
            scenarioId: 'native-session-n10-product-ui',
            useExistingDataRoot: seeded.dataRoot,
        });
        legacyBaseline = snapshotLegacyPersistence(server.dataRoot);
    });

    test.afterAll(async () => {
        await tearDownServer(server);
    });

    test('R7 Library exposes Native Works and Play exposes only Native mutation actions', async ({ page }) => {
        test.setTimeout(120_000);
        await page.addInitScript(() => localStorage.setItem('language', 'en'));
        await awaitMainUI(page, server.baseURL);

        await page.evaluate(() => {
            window.Atria.shell.getWorkspaceHost().openLibrarySection('works');
        });
        await expect(page.locator('[data-atria-native-library="works"]')).toBeVisible();
        const workCard = page.locator('[data-atria-work-id]').first();
        await expect(workCard).toBeVisible();
        await expect(page.locator('#right-nav-panel[data-atria-workspace-embedded="true"]')).toHaveCount(0);

        // Product flow, not a test-only runtime shortcut: open the Native Work,
        // choose its EntryPoint, create the Session, and transition to Play.
        await workCard.getByRole('button', { name: /^Open / }).click();
        const detail = page.locator('[data-atria-work-detail]').first();
        await expect(detail).toBeVisible();
        await detail.getByRole('button', { name: 'Start New', exact: true }).click();
        await expect(page.locator('body')).toHaveAttribute('data-atria-native-session-active', 'true');
        await expect(page).toHaveURL(/atriaRoute=play/);

        const toolbar = page.locator('[data-atria-native-play-actions="true"]');
        await expect(toolbar).toBeVisible();
        await toolbar.locator('summary').click();
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
            '#chat .mes_create_bookmark',
            '#chat .mes_bookmark',
            '#option_regenerate',
            '#option_select_chat',
            '#option_new_bookmark',
            '#option_back_to_main',
            '#character_import_button',
            '#export_button',
            '#export_format_popup',
            '#delete_button',
            '#dupe_button',
            '#char_connections_button',
        ]) {
            await expect(page.locator(selector).first()).toBeHidden();
        }

        await toolbar.locator('summary').click();
        await toolbar.getByRole('button', { name: 'Timeline', exact: true }).click();
        await expect(page.locator('[data-atria-native-play-drawer="true"]')).toBeVisible();
        await expect(page.locator('[data-atria-timeline-message-id]').first()).toBeVisible();

        await toolbar.getByRole('button', { name: 'Context', exact: true }).click();
        await page.locator('[data-atria-native-play-drawer]').getByText('Details', { exact:true }).click();
        await expect(page.locator('[data-atria-context-plan="true"]')).toBeVisible();

        // N10 revalidates the still-current R7 Shell contract instead of the
        // retired pre-N9 Character/Game Library product semantics.
        expect(await page.evaluate(() => ({
            shell: document.querySelectorAll('#atria-app-shell').length,
            sheld: document.querySelectorAll('#sheld').length,
            chat: document.querySelectorAll('#chat').length,
            sendForm: document.querySelectorAll('#send_form').length,
            textarea: document.querySelectorAll('#send_textarea').length,
            shellOwnsSheld: Boolean(document.querySelector('#atria-app-shell #sheld')),
            nativeHostOwnsSheld: Boolean(document.querySelector('#atria-native-play-host > #sheld')),
        }))).toEqual({
            shell: 1,
            sheld: 1,
            chat: 1,
            sendForm: 1,
            textarea: 1,
            shellOwnsSheld: true,
            nativeHostOwnsSheld: true,
        });

        const navigate = async (method, ...args) => {
            await page.evaluate(({ method, args }) => {
                const host = window.Atria.shell.getWorkspaceHost();
                host[method](...args);
            }, { method, args });
        };

        await navigate('openLibrarySection', 'worlds');
        await expect(page.locator('[data-atria-native-library="worlds-knowledge"]')).toBeVisible();

        await navigate('openBuild');
        await expect(page.locator('[data-atria-build-projects="true"]')).toBeVisible();

        await navigate('openRuntimeSection', 'overview');
        await expect(page.locator('[data-atria-domain-workspace="runtime"]')).toBeVisible();

        await navigate('openUtility', 'plugins');
        await expect(page.locator('[data-atria-utility-workspace="plugins"]')).toBeVisible();

        await navigate('openUtility', 'settings');
        await expect(page.locator('[data-atria-utility-workspace="settings"]')).toBeVisible();

        await navigate('openPlay');
        await expect(toolbar).toBeVisible();
        await expect(page.locator('#atria-native-play-host > #sheld')).toBeVisible();

        await page.setViewportSize({ width: 390, height: 844 });
        await expect(toolbar).toBeVisible();
        await expect(page.locator('#atria-native-play-host')).toBeVisible();
        await expect(page.locator('#atria-app-shell')).toHaveAttribute('data-atria-viewport', 'compact');
        await expect(page.locator('[data-atria-primitive="BottomNavigation"]')).toBeVisible();
        await expect(page.locator('#atria-native-play-host > #sheld')).toBeVisible();

        expect(await page.evaluate(() => ({
            sheld: document.querySelectorAll('#sheld').length,
            chat: document.querySelectorAll('#chat').length,
            sendForm: document.querySelectorAll('#send_form').length,
            textarea: document.querySelectorAll('#send_textarea').length,
        }))).toEqual({ sheld: 1, chat: 1, sendForm: 1, textarea: 1 });

        expect(snapshotLegacyPersistence(server.dataRoot)).toEqual(legacyBaseline);
    });
});
