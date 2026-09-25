import { test, expect } from '@playwright/test';
import { startServer, tearDownServer } from '../_lib/server.js';
import { awaitMainUI } from '../_lib/page.js';
/* eslint-disable playwright/no-conditional-in-test, playwright/no-conditional-expect -- Each named viewport case exercises its own responsive composition and existing controller states. */

import { seedNativeSessionDataRoot } from './_helpers.js';

let server;
test.describe.configure({ mode: 'default' });
test.use({ actionTimeout: 12000 });

test.beforeAll(async () => {
    const seeded = await seedNativeSessionDataRoot({ suffix: 'redesign-utilities' });

    server = await startServer({ batchKey: 'generation', scenarioId: 'redesign-utilities', useExistingDataRoot: seeded.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server, { removeData: false }); });

for (const width of [1440, 900, 320]) test(`Utilities and Agents at ${width}px`, async ({ page }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/text-workers', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await awaitMainUI(page, server.baseURL);
    const shot = async name => {
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const surface = page.locator('[data-atria-utility-workspace], #agent-memory-workspace, .atriaLogsWorkspace');
        expect(await surface.evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth + 1))).toBe(true);
        await page.screenshot({ path: info.outputPath(`${name}-${width}.png`), fullPage: true, animations: 'disabled' });
    };
    for (const utility of ['settings', 'plugins', 'account', 'diagnostics']) {
        await page.evaluate(id => window.Atria.shell.getWorkspaceHost().openUtility(id), utility);
        await expect(page.locator(utility === 'diagnostics' ? '.atriaLogsWorkspace' : `[data-atria-utility-workspace="${utility}"]`)).toBeVisible();
        if (utility === 'settings') {
            const settings = page.locator('[data-atria-utility-workspace=settings]');
            const reduced = settings.locator('#reduced_motion');
            const original = await reduced.isChecked();
            await reduced.setChecked(!original);
            await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openUtility('plugins'));
            await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openUtility('settings'));
            await expect(reduced).toBeChecked({ checked: !original });
            await reduced.setChecked(original);
            await settings.evaluate(node => { node.scrollTop = 0; });
            await expect(settings.locator('#themes')).toBeVisible();
            await expect(settings.locator('#font_scale')).toBeVisible();
        }
        if (utility === 'plugins') {
            const plugins = page.locator('[data-atria-utility-workspace=plugins]');
            await expect(plugins.locator('.atria-domain-workspace__actions button').first()).toBeEnabled();
            await plugins.locator('[data-atria-legacy-plugins] > summary').click();
            await shot('plugins-legacy');
            await plugins.locator('[data-atria-plugin-compatibility] > summary').click();
            await plugins.locator('.atria-plugin-compatibility__body').scrollIntoViewIfNeeded();
            await shot('plugins-compatibility');
            const drawer = plugins.locator('.inline-drawer-header[role=button]').first();
            await drawer.focus();
            await page.keyboard.press('Enter');
            await expect(drawer).toHaveAttribute('aria-expanded', 'true');
            await page.keyboard.press('Enter');
            await expect(drawer).toHaveAttribute('aria-expanded', 'false');
            await plugins.locator('[data-atria-legacy-plugins] > summary').click();
            await plugins.evaluate(node => { node.scrollTop = 0; });
        }
        if (utility === 'account') {
            const account = page.locator('[data-atria-utility-workspace=account]');
            await expect(account.locator('.userName')).not.toBeEmpty();
            await account.getByRole('button', { name: 'Settings Snapshots', exact: true }).click();
            await expect(page.locator('dialog[open]')).toBeVisible();
            await shot('snapshots-dialog');
            await page.keyboard.press('Escape');
            await expect(page.locator('dialog[open]')).toHaveCount(0);
            await account.locator('.atria-account-advanced > summary').click();
            await account.getByRole('button', { name: 'Reset Settings', exact: true }).click();
            await expect(page.locator('dialog[open]')).toBeVisible();
            await shot('reset-confirmation');
            await page.keyboard.press('Escape');
            await expect(page.locator('dialog[open]')).toHaveCount(0);
            await expect(account).toBeVisible();
            await account.evaluate(node => { node.scrollTop = 0; });
        }
        if (utility === 'diagnostics') {
            const diagnostics = page.locator('.atriaLogsWorkspace');
            await expect(diagnostics).toHaveAttribute('aria-busy', 'false');
            await shot('diagnostics-guided');
            await diagnostics.getByRole('button', { name: 'My problem just happened' }).click();
            await expect(diagnostics).toHaveClass(/is-detailing/);
            await shot('diagnostics-incident');
            await page.keyboard.press('Escape');
            await expect(diagnostics).not.toHaveClass(/is-detailing/);
            await diagnostics.getByRole('button', { name: 'Startup', exact: true }).click();
            await expect(diagnostics.locator('.atriaStartupAnalysis')).toBeVisible();
            await expect(diagnostics).toHaveAttribute('aria-busy', 'false');
            await shot('diagnostics-startup');
            await diagnostics.getByRole('button', { name: 'Expert', exact: true }).click();
            await expect(diagnostics.getByRole('button', { name: 'Expert', exact: true })).toHaveAttribute('aria-pressed', 'true');
            await diagnostics.locator('.atriaLogsSource').selectOption('frontend');
            await expect(diagnostics).toHaveAttribute('aria-busy', 'false');
            await shot('diagnostics-expert');
            await diagnostics.locator('.atriaLogsSearch').fill('not-present-utilities-fixture');
            await expect(diagnostics.locator('.atriaLogsVirtualRows')).toContainText('No log entries match');
            await diagnostics.locator('.atriaLogsSearch').fill('');
            await page.locator('.toast-close-button').evaluateAll(nodes => nodes.forEach(node => node.click()));
        }
        await shot(utility);
    }
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openAgents('home'));
    await expect(page.locator('[data-atria-agents-hub]')).toBeVisible();
    await page.screenshot({ path: info.outputPath(`agents-${width}.png`), fullPage: true, animations: 'disabled' });
    for (const section of ['orchestration', 'run', 'memory', 'diagnostics']) {
        await page.evaluate(section => window.Atria.shell.getWorkspaceHost().openAgentSection(section), section);
        await expect(page.locator('#agent-memory-workspace')).toBeVisible();
        const agents = page.locator('#agent-memory-workspace');
        await expect(agents.locator(`.atria-workspace-nav [data-section="${section}"]`)).toHaveAttribute('aria-current', 'page');
        if (section === 'orchestration') {
            await shot('orchestration');
            const library = agents.locator('.workspace-authoring-library');
            if (width === 320) await library.locator('summary').first().click();
            await library.getByRole('button', { name: 'New', exact: true }).click();
            await expect(page.locator('dialog[open]')).toBeVisible();
            await shot('agent-new-preset');
            await page.keyboard.press('Escape');
            await expect(page.locator('dialog[open]')).toHaveCount(0);
            await library.getByRole('button', { name: 'New', exact: true }).click();
            await page.locator('dialog[open] textarea').fill(`Phase 7 workflow ${width}`);
            await page.locator('dialog[open]').getByRole('button', { name: 'Save', exact: true }).click();
            await expect(page.locator('dialog[open]')).toHaveCount(0);
            await expect(agents.locator('.workspace-authoring-topbar')).toContainText(`Phase 7 workflow ${width}`);
            const menu = agents.locator('.workspace-more-menu');
            await menu.locator('summary').click();
            await menu.getByRole('button', { name: 'Duplicate', exact: true }).click();
            await expect(agents.locator('.workspace-authoring-topbar')).toContainText('copy');
            await menu.locator('summary').click();
            await menu.getByRole('button', { name: 'Preset settings', exact: true }).click();
            const inspector = agents.locator('.atria-workspace-inspector');
            await expect(inspector).toBeVisible();
            await expect(inspector.getByRole('button', { name: 'Close inspector' })).toBeFocused();
            await shot('agent-inspector');
            await page.keyboard.press('Escape');
            await expect(inspector).toBeHidden();
            await expect(agents).toBeVisible();
            await agents.locator('.atria-workspace-nav [data-section=orchestration]').focus();
            await page.keyboard.press('ArrowRight');
            await expect(page).toHaveURL(/atriaChild=run/);
        }
        if (section === 'memory') {
            await expect(agents.locator('.workspace-memory-page')).toBeVisible();
            await shot('memory');
            for (const name of ['Knowledge', 'Sources', 'Maintenance']) {
                await agents.locator('.workspace-subnav').getByRole('button', { name, exact: true }).click();
                await shot(`memory-${name.toLowerCase()}`);
            }
        }
        await shot(`agent-${section}`);
    }
});


test('Utilities loading, service failures and recovery on a narrow screen', async ({ page }, info) => {
    test.setTimeout(150000);
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/**', route => route.fulfill({ json: [] }));
    await awaitMainUI(page, server.baseURL);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/api/users/me', async route => { await gate; await route.fulfill({ status: 503, json: { error: 'Profile unavailable' } }); });
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openUtility('account'));
    await expect(page.locator('[data-atria-utility-workspace=account]')).toContainText('Loading your profile');
    await page.screenshot({ path: info.outputPath('account-loading-320.png') });
    release();
    await page.getByRole('button', { name: 'Try again', exact: true }).waitFor();
    await page.screenshot({ path: info.outputPath('account-error-320.png') });
    await page.unroute('**/api/users/me');
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.locator('.userName')).not.toBeEmpty();
    await page.locator('.userBackupSyncButton').click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await page.locator('.backupSyncTab[data-tab="archive"]').click();
    const nativeBackup = page.getByRole('checkbox', { name: 'Native data and projects' });
    await expect(nativeBackup).toBeChecked();
    await nativeBackup.focus();
    await page.keyboard.press('Space');
    await expect(nativeBackup).not.toBeChecked();
    await page.locator('.backupSelectRecommended').click();
    await expect(nativeBackup).toBeChecked();
    expect(await page.locator('.backupSyncCenter').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath('backup-320.png'), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await page.locator('.userStorageManagementButton').click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await page.screenshot({ path: info.outputPath('storage-320.png'), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await page.route('**/api/diagnostics/incidents/list', route => route.fulfill({ status: 503, json: { error: 'Diagnostics temporarily unavailable. Refresh to retry.' } }));
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openUtility('diagnostics'));
    await expect(page.locator('.atriaLogsFeedback')).toContainText('temporarily unavailable');
    await page.screenshot({ path: info.outputPath('diagnostics-error-320.png') });
    await page.unroute('**/api/diagnostics/incidents/list');
    await page.locator('.atriaLogsRefresh').click();
    await expect(page.locator('.atriaLogsFeedback')).toBeHidden();
    await page.route('**/api/native/product/works', route => route.fulfill({ status: 503, json: { error: 'Plugin list unavailable' } }));
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openUtility('plugins'));
    await expect(page.locator('[data-atria-plugin-surface=native]')).toContainText('503');
    await page.screenshot({ path: info.outputPath('plugins-error-320.png') });
    await page.unroute('**/api/native/product/works');
    await page.locator('[data-atria-utility-workspace=plugins]').getByRole('button', { name: 'Refresh' }).click();
    await expect(page.locator('[data-atria-plugin-surface=native]')).not.toContainText('503');
});

test('Chinese utilities, light appearance, large text and keyboard', async ({ page }, info) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addInitScript(() => localStorage.setItem('language', 'zh-cn'));
    await page.route('**/api/horde/**', route => route.fulfill({ json: [] }));
    await awaitMainUI(page, server.baseURL);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => {
        document.documentElement.style.setProperty('--SmartThemeBlurTintColor', '#ffffff');
        document.documentElement.style.setProperty('--mainFontSize', '20px');
        document.documentElement.style.setProperty('--atri-safe-area-bottom', '24px');
    });
    await page.evaluate(() => document.getElementById('blur-tint-color-picker').setAttribute('color', '#ffffff'));
    await expect(page.locator('html')).toHaveAttribute('data-atria-appearance', 'light');
    for (const id of ['settings', 'account', 'plugins', 'diagnostics']) {
        await page.evaluate(id => window.Atria.shell.getWorkspaceHost().openUtility(id), id);
        await expect(page.locator(id === 'diagnostics' ? '.atriaLogsWorkspace' : `[data-atria-utility-workspace="${id}"]`)).toBeVisible();
        if (id === 'account') await expect(page.locator('.userName')).not.toBeEmpty();
        if (id === 'diagnostics') await expect(page.locator('.atriaLogsWorkspace')).toHaveAttribute('aria-busy', 'false');
        if (id === 'plugins') await expect(page.locator('[data-atria-plugin-surface=native]')).toContainText('暂无 Native 插件');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await expect(page.locator('html')).toHaveAttribute('data-atria-appearance', 'light');
        await page.screenshot({ path: info.outputPath(`zh-light-${id}-320.png`), animations: 'disabled' });
    }
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openAgentSection('orchestration'));
    const agents = page.locator('#agent-memory-workspace');
    await expect(agents).toBeVisible();
    await agents.locator('.workspace-authoring-library > summary').click();
    const search = agents.locator('input[type=search]').first();
    await search.fill('no matching preset');
    await page.evaluate(() => {
        Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => 420 });
        window.visualViewport.dispatchEvent(new Event('resize'));
    });
    await expect(agents).toHaveAttribute('data-atria-keyboard', 'open');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('zh-agents-keyboard-320.png') });
    await page.evaluate(() => { delete window.visualViewport.height; window.visualViewport.dispatchEvent(new Event('resize')); });
    await page.setViewportSize({ width: 720, height: 844 });
    await expect(agents).toHaveAttribute('data-atria-viewport', 'medium');
    await page.screenshot({ path: info.outputPath('zh-agents-medium-720.png') });
});
