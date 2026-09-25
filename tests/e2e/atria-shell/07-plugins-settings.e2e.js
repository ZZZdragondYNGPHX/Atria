import { sessionFixture } from '../../native/helpers/session-fixture.js';
import { buildAtriaPackageContainer, createNativeId } from '../../../src/native/index.js';
import { test, expect } from '@playwright/test';

import { markOnboarded } from '../_lib/fixtures.js';
import { awaitMainUI } from '../_lib/page.js';
import { startServer, tearDownServer } from '../_lib/server.js';

test.describe.configure({ mode: 'serial' });

let server;
test.beforeAll(async () => {
    server = await startServer({
        batchKey: 'regression',
        scenarioId: 'r7g-plugins-settings',
    });
    markOnboarded({ dataRoot: server.dataRoot });
});

test.afterAll(async () => {
    await tearDownServer(server);
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
        await page.addInitScript(() => localStorage.setItem('language', 'en'));
        await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
        await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
        await awaitMainUI(page, server.baseURL);

        await page.evaluate(() => {
            window.__r7gSettingsRoot = document.getElementById('user-settings-block');
            window.__r7gLanguage = document.getElementById('ui_language_select');
        });

        const root = await ensureShellMounted(page);

        await root.locator('[data-atria-utility="plugins"]').click();
        await expect(page).toHaveURL(/atriaChild=utility.plugins/);
        await expect(root.locator('[data-atria-utility-workspace="plugins"]')).toBeVisible();
        await expect(root.locator('[data-atria-plugin]')).toHaveCount(2);
        await expect(root.locator('[data-atria-plugin="orchestrator"], [data-atria-plugin="memory-graph"], [data-atria-legacy-plugins]')).toHaveCount(0);
        await expect(root.getByRole('heading', { name: 'Work Plugins', exact: true })).toBeVisible();
        await expect(root.getByRole('heading', { name: 'Global Plugins', exact: true })).toBeVisible();
        const pluginCard = root.locator('[data-atria-plugin="regex"]'), toggle = pluginCard.getByRole('switch');
        await expect(toggle).toBeChecked(); await toggle.click();
        await expect(pluginCard).toHaveAttribute('data-save-state', 'saved');
        await expect.poll(async () => page.evaluate(async () => (await import('/scripts/extensions.js')).extension_settings.disabledExtensions.includes('regex'))).toBe(true);
        await toggle.click();
        await expect.poll(async () => page.evaluate(async () => (await import('/scripts/extensions.js')).extension_settings.disabledExtensions.includes('regex'))).toBe(false);
        await pluginCard.getByText('Plugin settings', { exact: true }).click();
        await expect(pluginCard.locator('#regex_container')).toHaveCount(1);
        await expect(root.locator('#extensions_settings, #extensions_settings2')).toHaveCount(0);

        await root.locator('[data-atria-utility="settings"]').click();
        await expect(page).toHaveURL(/atriaChild=utility.settings/);
        await expect(root.locator('[data-atria-utility-workspace="settings"]')).toBeVisible();
        await expect(root.locator('#ui_language_select')).toBeVisible();
        await expect(root.locator('#themes')).toBeVisible();
        await expect(root.locator('#user-settings-block[data-atria-workspace-embedded="true"]')).toHaveCount(0);
        expect(await page.evaluate(() => ({
            sameRoot: window.__r7gSettingsRoot === document.getElementById('user-settings-block'),
            sameLanguage: window.__r7gLanguage === document.getElementById('ui_language_select'),
            languageCount: document.querySelectorAll('#ui_language_select').length,
            connectionInSettings: Boolean(document.querySelector('#atria-workspace #atria-connection-manager-root')),
        }))).toEqual({
            sameRoot: true,
            sameLanguage: true,
            languageCount: 1,
            connectionInSettings: false,
        });
        await expect(page.locator('#account_controls')).toBeHidden();

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
        await page.addInitScript(() => localStorage.setItem('language', 'en'));
        await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
        await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
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

    test('Compact opens focused utilities through Command and restores Play without orphan DOM', async ({ page }, info) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.addInitScript(() => localStorage.setItem('language', 'en'));
        await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
        await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
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
        await page.screenshot({ path: info.outputPath('plugins-390.png') });

        await page.evaluate(async () => {
            await window.Atria.shell.getShell().registry.execute('workspace.settings');
        });
        await expect(root.locator('[data-atria-utility-workspace="settings"]')).toBeVisible();

        await page.evaluate(async () => {
            await window.Atria.shell.getShell().registry.execute('workspace.account');
        });
        await expect(root.locator('[data-atria-utility-workspace="account"]')).toBeVisible();

        await root.locator('[data-atria-primitive="BottomNavigation"] [data-atria-domain="play"]').click();
        await expect(root.locator('[data-atria-native-play-landing]')).toBeVisible();

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


test('Work Plugins preserve old installed versions and route permission management to their Work', async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await awaitMainUI(page, server.baseURL);
    const { manifest } = sessionFixture(); manifest.name = 'Plugin voyage';
    manifest.runtime = { plugins: [{ format: 'atria-plugin', schemaVersion: 1, apiVersion: 1, pluginId: 'plugin.runtime', displayName: 'Story compass', version: '1.0.0', permissions: [], dependencies: [], contributions: [], packageRuntime: { format: 'atria-package-runtime', version: 1, execution: 'declarative', capabilities: ['runtime.selector'], contributions: [{ id: 'plugin.runtime.hp', type: 'play.selector', config: { selectors: [{ id: 'plugin.hp', formula: 'world.hp' }] } }], config: {} } }] };
    const data = [];
    for (const version of ['1.0.0', '2.0.0']) {
        manifest.version = version; manifest.packageVersionId = createNativeId('packageVersion');
        data.push(buildAtriaPackageContainer({ manifest, sourceFiles: new Map(), assetPayloads: new Map() }).archive.toString('base64'));
    }
    await page.evaluate(async archives => {
        const { nativeProductClient: client } = await import('/scripts/native/product-client.js');
        for (const bytes of archives) await client.installPackage(bytes);
        window.Atria.shell.getWorkspaceHost().openUtility('plugins');
    }, data);
    const cards = page.locator('[data-atria-native-plugin="plugin.runtime"]'); await expect(cards).toHaveCount(2);
    await expect(cards.first().getByRole('heading', { name: 'Story compass', exact: true })).toBeVisible();
    await expect(cards.first()).toContainText('Plugin voyage'); await expect(cards.nth(1)).toContainText('Plugin voyage');
    await page.screenshot({ path: info.outputPath('work-plugins-390.png') });
    await cards.first().getByRole('button', { name: 'Manage owning Work', exact: true }).click();
    await expect(page.locator('[data-atria-work-detail]')).toContainText('Plugin voyage');
});
