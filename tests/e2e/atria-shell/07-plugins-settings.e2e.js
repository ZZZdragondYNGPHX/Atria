import { test, expect } from '@playwright/test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { markOnboarded } from '../_lib/fixtures.js';
import { awaitMainUI } from '../_lib/page.js';
import { startServer, tearDownServer } from '../_lib/server.js';

test.describe.configure({ mode: 'serial' });

let server;
const PLUGIN_DIR = 'r7g-plugin-fixture';
const PLUGIN_ID = `third-party/${PLUGIN_DIR}`;
const REPO_ROOT = resolve(new URL('../../..', import.meta.url).pathname);
const GLOBAL_PLUGIN_ROOT = resolve(REPO_ROOT, 'public/scripts/extensions/third-party', PLUGIN_DIR);

test.beforeAll(async () => {
    // Global extensions are discovered during server startup, so create the
    // fixture before boot rather than mutating the per-user directory after
    // discovery has already been cached.
    mkdirSync(GLOBAL_PLUGIN_ROOT, { recursive: true });
    writeFileSync(resolve(GLOBAL_PLUGIN_ROOT, 'manifest.json'), JSON.stringify({
        display_name: 'R7G Fixture Plugin',
        loading_order: 999,
        version: '1.0.0',
        author: 'Atria Tests',
        description: 'Third-party fixture for R7G product classification.',
    }, null, 2));

    server = await startServer({
        batchKey: 'regression',
        scenarioId: 'r7g-plugins-settings',
    });
    markOnboarded({ dataRoot: server.dataRoot });
});

test.afterAll(async () => {
    await tearDownServer(server);
    rmSync(GLOBAL_PLUGIN_ROOT, { recursive: true, force: true });
});

async function ensureShellMounted(page) {
    await page.waitForFunction(() => (
        Boolean(window.Atria?.shell?.isMounted?.())
        && Boolean(window.Atria?.shell?.getWorkspaceHost?.())
    ));
    const root = page.locator('#atria-app-shell');
    await root.waitFor({ state: 'visible', timeout: 10_000 });
    return root;
}

async function nativeCounts(page) {
    return await page.evaluate(() => ({
        chat: document.querySelectorAll('#chat').length,
        sendForm: document.querySelectorAll('#send_form').length,
        textarea: document.querySelectorAll('#send_textarea').length,
    }));
}

test.describe('R7G Plugins & Settings Reclassification', () => {
    test('Expanded routes Plugins, Settings and Account through existing authorities', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await awaitMainUI(page, server.baseURL);

        await page.waitForFunction(async id => {
            const extensionModule = await import('/scripts/extensions.js');
            return extensionModule.extensionNames.includes(id);
        }, PLUGIN_ID, { timeout: 15_000 });

        await page.evaluate(() => {
            window.__r7gSettingsRoot = document.getElementById('user-settings-block');
            window.__r7gLanguage = document.getElementById('ui_language_select');
        });

        const root = await ensureShellMounted(page);

        await root.locator('[data-atria-utility="plugins"]').click();
        await expect(page).toHaveURL(/atriaChild=utility.plugins/);
        await expect(root.locator('[data-atria-utility-workspace="plugins"]')).toBeVisible();
        await expect(root.locator(`[data-atria-plugin="${PLUGIN_ID}"]`)).toHaveCount(1);
        await expect(root.locator('[data-atria-plugin="orchestrator"]')).toHaveCount(0);
        await expect(root.locator('[data-atria-plugin="memory-graph"]')).toHaveCount(0);

        const pluginCard = root.locator(`[data-atria-plugin="${PLUGIN_ID}"]`);
        const toggle = pluginCard.locator('input[type="checkbox"]');
        await expect(toggle).toBeChecked();
        await toggle.click();
        await expect(pluginCard).toHaveAttribute('data-save-state', 'saved');
        await expect.poll(async () => await page.evaluate(async id => {
            const extensionModule = await import('/scripts/extensions.js');
            return extensionModule.extension_settings.disabledExtensions.includes(id);
        }, PLUGIN_ID)).toBe(true);

        await toggle.click();
        await expect.poll(async () => await page.evaluate(async id => {
            const extensionModule = await import('/scripts/extensions.js');
            return extensionModule.extension_settings.disabledExtensions.includes(id);
        }, PLUGIN_ID)).toBe(false);

        await pluginCard.getByRole('button', { name: 'Compatibility settings' }).click();
        await expect(root.locator('[data-atria-plugin-compatibility="true"]')).toHaveAttribute('open', '');
        await expect(root.locator('#extensions_settings')).toHaveCount(1);
        await expect(root.locator('#extensions_settings2')).toHaveCount(1);

        await root.locator('[data-atria-utility="settings"]').click();
        await expect(page).toHaveURL(/atriaChild=utility.settings/);
        await expect(root.locator('[data-atria-utility-workspace="settings"]')).toBeVisible();
        await expect(root.locator('[data-atria-settings-compatibility="true"]')).not.toHaveAttribute('open', '');
        await root.locator('[data-atria-settings-section="language"]').click();
        await expect(root.locator('[data-atria-settings-compatibility="true"]')).toHaveAttribute('open', '');
        await expect(root.locator('#user-settings-block[data-atria-workspace-embedded="true"]')).toBeVisible();
        expect(await page.evaluate(() => ({
            sameRoot: window.__r7gSettingsRoot === document.getElementById('user-settings-block'),
            sameLanguage: window.__r7gLanguage === document.getElementById('ui_language_select'),
            languageCount: document.querySelectorAll('#ui_language_select').length,
            accountControlsHidden: document.getElementById('account_controls')?.hidden,
            connectionInSettings: Boolean(document.querySelector('#atria-workspace #atria-connection-manager-root')),
        }))).toEqual({
            sameRoot: true,
            sameLanguage: true,
            languageCount: 1,
            accountControlsHidden: true,
            connectionInSettings: false,
        });

        await root.locator('[data-atria-utility="account"]').click();
        await expect(page).toHaveURL(/atriaChild=utility.account/);
        await expect(root.locator('[data-atria-utility-workspace="account"]')).toBeVisible();
        await expect(root.locator('[data-atria-account-embedded="true"]')).toHaveCount(1);

        await page.goBack();
        await expect(page).toHaveURL(/atriaChild=utility.settings/);
        await expect(root.locator('[data-atria-utility-workspace="settings"]')).toBeVisible();

        const commands = await page.evaluate(() => {
            const registry = window.Atria.shell.getShell()?.registry;
            return {
                plugins: Boolean(registry?.get?.('workspace.plugins')),
                settings: Boolean(registry?.get?.('workspace.settings')),
                account: Boolean(registry?.get?.('workspace.account')),
                diagnostics: Boolean(registry?.get?.('workspace.diagnostics')),
            };
        });
        expect(commands).toEqual({
            plugins: true,
            settings: true,
            account: true,
            diagnostics: true,
        });

        expect(await nativeCounts(page)).toEqual({ chat: 1, sendForm: 1, textarea: 1 });
    });

    test('legacy entries forward through the authoritative Shell and API remains owned by Runtime', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await awaitMainUI(page, server.baseURL);
        const root = await ensureShellMounted(page);

        await page.evaluate(() => document.querySelector('#extensions-settings-button .drawer-toggle')?.click());
        await expect(page).toHaveURL(/atriaChild=utility.plugins/);
        await expect(root.locator('[data-atria-utility-workspace="plugins"]')).toBeVisible();

        await page.evaluate(() => document.querySelector('#user-settings-button .drawer-toggle')?.click());
        await expect(page).toHaveURL(/atriaChild=utility.settings/);
        await expect(root.locator('[data-atria-utility-workspace="settings"]')).toBeVisible();

        await page.evaluate(() => document.getElementById('account_button')?.click());
        await expect(page).toHaveURL(/atriaChild=utility.account/);

        await page.evaluate(() => document.getElementById('API-status-top')?.click());
        await expect(page).toHaveURL(/atriaRoute=runtime/);
        await expect(page).toHaveURL(/atriaChild=connections/);
        await expect(root.locator('[data-atria-utility-workspace="settings"]')).toHaveCount(0);

        expect(await nativeCounts(page)).toEqual({ chat: 1, sendForm: 1, textarea: 1 });
    });

    test('Compact opens focused utilities through Command and restores Play without orphan DOM', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await awaitMainUI(page, server.baseURL);

        await page.evaluate(() => {
            window.__r7gLegacyParents = {
                settings: document.getElementById('user-settings-block')?.parentElement,
                extensionsOne: document.getElementById('extensions_settings')?.parentElement,
                extensionsTwo: document.getElementById('extensions_settings2')?.parentElement,
            };
        });
        const root = await ensureShellMounted(page);
        await expect(root).toHaveAttribute('data-atria-viewport', 'compact');

        await page.evaluate(async () => {
            await window.Atria.shell.getShell().registry.execute('workspace.plugins');
        });
        await expect(root.locator('[data-atria-utility-workspace="plugins"]')).toBeVisible();
        await expect(page).toHaveURL(/atriaChild=utility.plugins/);

        await page.evaluate(async () => {
            await window.Atria.shell.getShell().registry.execute('workspace.settings');
        });
        await expect(root.locator('[data-atria-utility-workspace="settings"]')).toBeVisible();

        await page.evaluate(async () => {
            await window.Atria.shell.getShell().registry.execute('workspace.account');
        });
        await expect(root.locator('[data-atria-utility-workspace="account"]')).toBeVisible();

        await root.locator('[data-atria-primitive="BottomNavigation"] [data-atria-domain="play"]').click();
        await expect(root.locator('#sheld')).toBeVisible();

        expect(await page.evaluate(() => ({
            chat: document.querySelectorAll('#chat').length,
            sendForm: document.querySelectorAll('#send_form').length,
            textarea: document.querySelectorAll('#send_textarea').length,
            utilityRoots: document.querySelectorAll('#atria-workspace [data-atria-utility-workspace]').length,
            settingsRestored: document.getElementById('user-settings-block')?.parentElement === window.__r7gLegacyParents.settings,
            extensionsOneRestored: document.getElementById('extensions_settings')?.parentElement === window.__r7gLegacyParents.extensionsOne,
            extensionsTwoRestored: document.getElementById('extensions_settings2')?.parentElement === window.__r7gLegacyParents.extensionsTwo,
        }))).toEqual({
            chat: 1,
            sendForm: 1,
            textarea: 1,
            utilityRoots: 0,
            settingsRestored: true,
            extensionsOneRestored: true,
            extensionsTwoRestored: true,
        });
    });
});
