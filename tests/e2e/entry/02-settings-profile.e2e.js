import { test, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { startServer, tearDownServer } from '../_lib/server.js';

let server;
test.use({ channel: 'msedge', actionTimeout: 15000, video: 'off', trace: 'off' });

test.beforeAll(async () => {
    mkdirSync(resolve(import.meta.dirname, '../../.e2e-scratch'), { recursive: true });
    server = await startServer({ batchKey: 'regression', scenarioId: 'settings-profile', useExistingDataRoot: mkdtempSync(resolve(import.meta.dirname, '../../.e2e-scratch/settings-profile-')) });
});

test.afterAll(async () => { await tearDownServer(server); });

test('onboarding account name, theme CRUD and two-language preferences persist', async ({ page }, testInfo) => {
    await page.goto(server.baseURL);
    const dialog = page.locator('.atri-onboarding-dialog[open]');
    await expect(dialog).toBeVisible({ timeout: 60000 });
    await dialog.locator('.popup-input').fill('Atria Reader');
    await page.route('**/api/users/change-name', route => route.fulfill({ status: 500 }), { times: 1 });
    await dialog.getByRole('button', { name: 'Get started', exact: true }).click();
    await expect(page.locator('.toast-message').filter({ hasText: 'Failed to change name' })).toBeVisible();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Get started', exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.evaluate(() => globalThis.Atria.shell.getWorkspaceHost().openUtility('account'));
    await expect(page.locator('[data-atria-account-primary] .userName')).toHaveText('Atria Reader');
    await page.evaluate(() => globalThis.Atria.shell.getWorkspaceHost().openUtility('settings'));
    const settings = page.locator('[data-atria-settings-primary]');
    await expect(settings.locator('#ui_language_select option')).toHaveCount(2);
    await expect(settings.locator('#ui_language_select')).toHaveValue('en');
    await settings.getByText('Custom CSS', { exact: true }).click();
    await settings.locator('#customCSS').fill(':root:root { --atri-accent: #aabbcc; }');
    await settings.locator('#ui-preset-save-button').click();
    const popup = page.locator('dialog[open]');
    await popup.locator('.popup-input').fill('Reader Theme');
    await popup.locator('.popup-button-ok').click();
    await expect(settings.locator('#themes')).toHaveValue('Reader Theme');
    const download = page.waitForEvent('download');
    await settings.locator('#ui_preset_export_button').click();
    expect((await download).suggestedFilename()).toBe('Reader Theme.json');
    await page.route('**/api/themes/save', route => route.fulfill({ status: 500 }), { times: 1 });
    await settings.locator('#ui_preset_import_file').setInputFiles({ name: 'failed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ name: 'Failed Theme' })) });
    await expect(page.locator('.toast-title').filter({ hasText: 'Failed to import UI theme' })).toBeVisible();
    await expect(settings.locator('#themes option[value="Failed Theme"]')).toHaveCount(0);
    await settings.locator('#ui_preset_import_file').setInputFiles({ name: 'import.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ name: 'Imported Theme', custom_css: ':root:root { --atri-accent: #bbccdd; }' })) });
    await expect(settings.locator('#themes')).toHaveValue('Imported Theme');
    await expect(settings.locator('#themes option[value="Imported Theme"]')).toHaveCount(1);
    await settings.locator('#customCSS').fill(':root:root { --atri-accent: #ccddee; }');
    const saved = page.waitForResponse(response => response.url().endsWith('/api/themes/save') && response.ok());
    await settings.locator('#ui-preset-update-button').click();
    await saved;
    await expect(page.locator('.toast-message').filter({ hasText: 'Theme saved.' })).toBeVisible();
    await page.reload();
    await expect(page.locator('#atria-app-shell')).toBeVisible({ timeout: 60000 });
    await page.evaluate(() => globalThis.Atria.shell.getWorkspaceHost().openUtility('settings'));
    await expect(settings.locator('#themes')).toHaveValue('Imported Theme');
    await expect(settings.locator('#customCSS')).toHaveValue(':root:root { --atri-accent: #ccddee; }');
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--atri-accent').trim())).toBe('#ccddee');
    await page.screenshot({ path: testInfo.outputPath('settings-desktop.png') });
    await settings.getByText('Custom CSS', { exact: true }).click();
    await page.setViewportSize({ width: 320, height: 850 });
    await page.screenshot({ path: testInfo.outputPath('settings-320.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await settings.locator('#ui-preset-delete-button').click();
    await page.locator('dialog[open] .popup-button-ok').click();
    await expect(settings.locator('#themes option[value="Imported Theme"]')).toHaveCount(0);
    await settings.locator('#ui_language_select').selectOption('zh-cn');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-cn');
    await page.evaluate(() => globalThis.Atria.shell.getWorkspaceHost().openUtility('account'));
    await expect(page.locator('[data-atria-account-primary] .userName')).toHaveText('Atria Reader');
    await page.evaluate(() => localStorage.setItem('language', 'de-de'));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

