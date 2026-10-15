import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startServer, tearDownServer } from '../_lib/server.js';
import { seedNativeSessionDataRoot, createAndOpenNativeSession } from '../native-session/_helpers.js';

test.describe.configure({ mode: 'serial' });
test.use({ actionTimeout: 12000 });
let server, seeded;
const scratch = resolve(import.meta.dirname, '../../.e2e-screenshots/settings-themes');

test.beforeAll(async () => {
    seeded = await seedNativeSessionDataRoot({ suffix: 'settings-themes' });
    server = await startServer({ batchKey: 'regression', scenarioId: 'settings-themes', useExistingDataRoot: seeded.dataRoot });
    mkdirSync(scratch, { recursive: true });
});

test.afterAll(async () => { await tearDownServer(server); });

async function open(page, target = server, locale = 'en') {
    await page.addInitScript(value => localStorage.setItem('language', value), locale);
    await page.route('**/api/horde/**', route => route.fulfill({ json: [] }));
    await page.goto(target.baseURL + '/?atriaRoute=play&atriaChild=utility.settings');
    await page.waitForFunction(() => !document.getElementById('preloader') && Boolean(Atria?.getContext?.()?.atriaThemes));
    await expect(page.locator('.atria-settings-paper')).toBeVisible();
}
async function appearance(page) {
    await page.evaluate(() => Atria.shell.getWorkspaceHost().openUtility('settings'));
    await expect(page.locator('.atria-settings-paper')).toBeVisible();
    const category = page.locator('[data-settings-category="appearance"]');
    if (await category.isVisible()) await category.click();
}
const themeState = page => page.evaluate(() => Atria.getContext().atriaThemes.getState());
const persisted = page => page.evaluate(async () => {
    const response = await fetch('/api/themes/list', { method: 'POST', headers: Atria.getContext().getRequestHeaders(), body: '{}' });
    return response.json();
});
const canvas = page => page.locator('#atria-app-shell').evaluate(node => getComputedStyle(node).backgroundColor);
async function confirm(page) {
    await page.getByRole('button', { name: 'Use theme', exact: true }).click();
    await expect(page.locator('.atria-theme-preview-bar')).toBeHidden();
}
async function setMode(page, mode) {
    await page.locator('.atria-theme-mode select').selectOption(mode); await confirm(page);
}

test('new-account system mode, all palettes, slots and real Native surfaces share persisted tokens', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await open(page);
    expect((await themeState(page)).selection).toMatchObject({ mode: 'system', day: 'builtin:serene', night: 'builtin:dark-lite' });
    expect((await themeState(page)).selection.migration).toBeUndefined();
    await expect.poll(() => canvas(page)).toBe('rgb(23, 23, 23)');
    await setMode(page, 'light');
    await page.locator('[data-settings-category="reading"]').click();
    const size = page.locator('[data-atria-preference="font_scale"]');
    await size.fill('1.25'); await size.dispatchEvent('change');
    await expect(size.locator('xpath=ancestor::*[@data-setting-id]')).toHaveAttribute('data-save-state', 'saved');
    await page.locator('[data-settings-category="appearance"]').click();
    await page.getByRole('button', { name: 'View night themes', exact: true }).click();
    const colors = new Set();
    for (const id of ['azure', 'cappuccino', 'celestial', 'dark-lite', 'dark-v']) {
        await page.locator(`[data-theme-id="builtin:${id}"]`).click();
        await expect(page.locator('html')).toHaveAttribute('data-atria-appearance', 'dark');
        const actual = await page.evaluate(() => {
            const root = document.documentElement, style = getComputedStyle(root);
            return { color: getComputedStyle(document.querySelector('#atria-app-shell')).backgroundColor, expected: style.getPropertyValue('--atri-canvas').trim(), scheme: style.colorScheme, font: Atria.getContext().powerUserSettings.font_scale,
                sample: getComputedStyle(document.querySelector('.atria-theme-sample')).backgroundColor, surface: style.getPropertyValue('--atri-surface-1').trim() };
        });
        colors.add(actual.color); expect(actual.scheme).toBe('dark'); expect(actual.font).toBe(1.25);
        expect(actual.sample).not.toBe('rgb(255, 255, 255)');
    }
    expect(colors.size).toBe(5);
    await page.locator('[data-theme-id="builtin:azure"]').click(); await confirm(page);
    // Slot browsing did not turn the saved light mode into dark.
    await expect.poll(() => canvas(page)).toBe('rgb(249, 248, 246)');
    expect((await persisted(page)).selection).toMatchObject({ mode: 'light', night: 'builtin:azure' });
    await setMode(page, 'system');
    await expect.poll(() => canvas(page)).toBe('rgb(17, 25, 30)');
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await expect.poll(() => canvas(page)).toBe('rgb(249, 248, 246)');
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await expect.poll(() => canvas(page)).toBe('rgb(17, 25, 30)');
    await page.reload(); await page.locator('.atria-theme-mode select').waitFor();
    await expect.poll(() => canvas(page)).toBe('rgb(17, 25, 30)');
    expect(await page.evaluate(() => Atria.getContext().powerUserSettings.font_scale)).toBe(1.25);
    await page.screenshot({ path: resolve(scratch, 'desktop-azure.png') });
    for (const [method, argument] of [['openLibrarySection', 'works'], ['openRuntimeSection', 'routes'], ['openBuild', null], ['openAgentSection', 'run']]) {
        await page.evaluate(([method, argument]) => Atria.shell.getWorkspaceHost()[method](argument), [method, argument]);
        await expect.poll(() => canvas(page)).toBe('rgb(17, 25, 30)');
    }
    const session = await createAndOpenNativeSession(page, seeded.start);
    await page.evaluate(() => Atria.shell.getWorkspaceHost().openPlay());
    await expect(page.locator('.atria-play-message__body').first()).toContainText('Opening');
    const reader = await page.locator('.atria-play-message__body').first().evaluate(node => ({ color: getComputedStyle(node).color, size: getComputedStyle(node).fontSize }));
    expect(reader.color).toBe('rgb(171, 198, 223)'); expect(parseFloat(reader.size)).toBeGreaterThan(20);
    expect(session.sessionId).toBeTruthy();
    await page.evaluate(async () => {
        const { Popup } = await import('/scripts/popup.js'); void Popup.show.confirm('Theme test', 'A themed confirmation');
    });
    await expect(page.locator('dialog.popup[open]')).toBeVisible();
    expect(await page.locator('dialog.popup[open]').evaluate(node => getComputedStyle(node).backgroundColor)).not.toBe('rgb(255, 255, 255)');
    await page.screenshot({ path: resolve(scratch, 'popup-azure.png') });
    await page.locator('dialog.popup[open] .popup-button-cancel').click();
    await page.evaluate(() => window.toastr.error('Theme error state'));
    await expect(page.locator('.toast-error')).toBeVisible();
});

test('real preference failures and partial theme writes retain inputs and retry only missing work', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 }); await open(page);
    await page.locator('[data-settings-category="reading"]').click();
    const failedSettings = '**/api/settings/{patch,save}';
    await page.route(failedSettings, route => route.fulfill({ status: 503, body: 'offline' }));
    const size = page.locator('[data-atria-preference="font_scale"]'); await size.fill('1.3'); await size.dispatchEvent('change');
    const row = page.locator('[data-setting-id="font_scale"]');
    await expect(row).toHaveAttribute('data-save-state', 'error'); await expect(size).toHaveValue('1.3');
    await page.locator('[data-settings-category="general"]').click(); await page.locator('[data-settings-category="reading"]').click();
    await expect(row.getByRole('button', { name: 'Retry save' })).toBeVisible();
    await page.unroute(failedSettings); await row.getByRole('button', { name: 'Retry save' }).click(); await expect(row).toHaveAttribute('data-save-state', 'saved');
    await page.locator('[data-settings-category="appearance"]').click();
    await page.getByRole('button', { name: 'View night themes' }).click(); await page.locator('[data-theme-id="builtin:azure"]').click();
    await page.locator('[data-setting-id="theme-css"] summary').click();
    await page.locator('.atria-theme-css-editor').fill(':root:root { --atria-test-css: 42; }');
    await page.locator('.atria-theme-css-toggle input').check();
    let themeWrites = 0;
    page.on('request', request => { if (request.url().endsWith('/api/themes/save')) themeWrites++; });
    await page.route(failedSettings, route => route.fulfill({ status: 503, body: 'offline' }));
    await page.getByRole('button', { name: 'Use theme', exact: true }).click();
    await expect(page.locator('.atria-theme-status')).toContainText('Theme asset saved; appearance selection was not saved');
    expect(themeWrites).toBe(1); expect((await themeState(page)).preview.assetSaved).toBe(true);
    await page.screenshot({ path: resolve(scratch, 'partial-save.png') });
    await page.unroute(failedSettings); await confirm(page); expect(themeWrites).toBe(1);
    const stored = await persisted(page), custom = stored.themes.find(theme => theme.id === stored.selection.night);
    expect(custom.css).toEqual({ enabled: true, text: ':root:root { --atria-test-css: 42; }' });
    await page.reload(); await page.locator('.atria-theme-mode select').waitFor();
    expect(await page.evaluate(() => Atria.getContext().powerUserSettings.font_scale)).toBe(1.3);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--atria-test-css').trim())).toBe('42');
    await expect(page.locator('#custom-style')).toHaveText('');
    await page.keyboard.press('Control+Alt+Shift+R');
    await expect(page.locator('#atria-theme-css')).toHaveText('');
    await page.getByRole('button', { name: 'View night themes' }).click(); await page.locator('[data-theme-id="builtin:celestial"]').click();
    await page.evaluate(() => Atria.getContext().updateAtriaPreference('font_scale', 1.25));
    await page.getByRole('button', { name: 'Cancel preview' }).click();
    expect(await page.evaluate(() => Atria.getContext().powerUserSettings.font_scale)).toBe(1.25);
    const identity = (await persisted(page)).selection.night;
    await page.locator('[data-setting-id="theme-colors"] summary').click();
    await page.getByRole('textbox', { name: 'Theme name', exact: true }).fill('Atria renamed theme');
    await confirm(page);
    const renamed = await persisted(page);
    expect(renamed.selection.night).toBe(identity);
    expect(renamed.themes.filter(theme => theme.id === identity)).toHaveLength(1);
    expect(renamed.themes.find(theme => theme.id === identity).name).toBe('Atria renamed theme');
    await page.getByRole('button', { name: 'Delete custom theme' }).click();
    await page.locator('dialog.popup[open] .popup-button-ok').click();
    await expect.poll(async () => (await persisted(page)).selection.night).toBe('builtin:dark-lite');
    expect((await persisted(page)).themes.some(theme => theme.id === identity)).toBe(false);
});

test('search, leave guard, responsive layout and Chinese controls stay reachable', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 1000 }); await open(page);
    await page.getByRole('searchbox', { name: 'Search settings' }).fill('CSS');
    await page.locator('.atria-settings-search-result').click();
    await expect(page.locator('[data-setting-id="theme-css"]')).toHaveAttribute('open', '');
    await expect(page.locator('[data-setting-id="theme-css"] summary')).toBeFocused();
    await page.goBack(); await expect(page.getByRole('searchbox', { name: 'Search settings' })).toHaveValue('CSS');
    await page.getByRole('searchbox', { name: 'Search settings' }).fill('');
    for (const width of [1440, 900, 390, 320]) {
        await page.setViewportSize({ width, height: 900 }); await appearance(page);
        await page.getByRole('button', { name: 'View night themes' }).click(); await page.locator('[data-theme-id="builtin:celestial"]').click();
        await expect(page.getByRole('button', { name: 'Cancel preview' })).toBeVisible();
        const overflow = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth, settings: document.querySelector('.atria-utility-workspace--settings').scrollWidth, client: document.querySelector('.atria-utility-workspace--settings').clientWidth }));
        expect(overflow.document).toBe(overflow.viewport); expect(overflow.settings).toBe(overflow.client);
        await page.screenshot({ path: resolve(scratch, `preview-${width}.png`) });
        await page.getByRole('button', { name: 'Cancel preview' }).click();
    }
    await page.locator('[data-setting-id="theme-css"]').evaluate(node => { node.open = true; });
    await page.locator('.atria-theme-css-editor').fill(':root { --draft: 1; }');
    page.once('dialog', dialog => dialog.dismiss());
    await page.evaluate(() => Atria.shell.getWorkspaceHost().openLibrarySection('works'));
    await expect(page.locator('.atria-settings-paper')).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await page.evaluate(() => Atria.shell.getWorkspaceHost().openLibrarySection('works'));
    await expect(page.locator('.atria-settings-paper')).toHaveCount(0);
    expect((await themeState(page)).preview).toBeNull();
    await open(page, server, 'zh-cn');
    await expect(page.locator('[data-settings-category="appearance"]')).toContainText('外观与主题');
    await page.locator('[data-settings-category="appearance"]').click();
    await expect(page.locator('.atria-theme-mode')).toContainText('显示模式');
    await page.screenshot({ path: resolve(scratch, 'chinese-320.png') });
});

test('existing account upgrade recovers partial writes, preserves current CSS and originals, and validates imports', async ({ page }) => {
    const legacySeed = await seedNativeSessionDataRoot({ suffix: 'settings-upgrade' });
    const path = resolve(legacySeed.dataRoot, 'default-user/settings.json'), settings = JSON.parse(readFileSync(path, 'utf8'));
    delete settings.power_user.atria_theme;
    Object.assign(settings.power_user, { theme: 'Azure', font_scale: 1.25, main_text_color: '#123456', custom_css: ':root:root { --atri-canvas: #f4ece2; --upgraded-css: 1; }' });
    // An unfinished historical onboarding flag is not evidence of a new account.
    settings.firstRun = false; writeFileSync(path, JSON.stringify(settings));
    const legacyServer = await startServer({ batchKey: 'regression', scenarioId: 'settings-upgrade', useExistingDataRoot: legacySeed.dataRoot });
    try {
        const themePath = resolve(legacySeed.dataRoot, 'default-user/themes/Azure.json');
        const original = JSON.parse(readFileSync(themePath, 'utf8')); original.mystery = { preserved: [1, 2, 3] }; writeFileSync(themePath, JSON.stringify(original));
        await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
        await page.route('**/api/settings/{patch,save}', route => route.fulfill({ status: 503, body: 'offline' }));
        await open(page, legacyServer);
        await expect(page.locator('html')).toHaveAttribute('data-atria-appearance', 'light');
        await expect.poll(() => canvas(page)).toBe('rgb(244, 236, 226)');
        expect((await themeState(page)).migrationPending).toBe(true);
        const partial = await persisted(page), ids = partial.themes.filter(theme => theme.format === 'atria-theme').map(theme => theme.id);
        expect(ids.sort()).toEqual(['migration:day', 'migration:night']);
        await page.unroute('**/api/settings/{patch,save}');
        await page.getByRole('button', { name: 'Retry appearance upgrade' }).click();
        await expect.poll(async () => (await themeState(page)).migrationPending).toBe(false);
        const recovered = await persisted(page);
        expect(recovered.selection).toMatchObject({ mode: 'light', day: 'migration:day', night: 'migration:night' });
        expect(recovered.selection.migration.legacy.main_text_color).toBe('#123456');
        expect(recovered.themes.find(theme => theme.id === 'migration:night').compatibility.raw).toEqual(original);
        expect(recovered.themes.find(theme => theme.name === 'Azure')).toEqual(original);
        await page.reload(); await page.locator('.atria-theme-mode select').waitFor();
        expect((await persisted(page)).themes.filter(theme => theme.format === 'atria-theme')).toHaveLength(2);
        await expect(page.locator('#custom-style')).toHaveText('');
        const file = page.locator('.atria-theme-asset-actions input[type="file"]');
        await file.setInputFiles({ name: 'old-theme.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...original, name: 'Azure', custom_css: 'body { display: none; }' })) });
        await expect(page.locator('.atria-theme-import')).toContainText('Imported CSS starts disabled');
        await page.getByRole('button', { name: 'Save imported theme' }).click();
        const imported = (await persisted(page)).themes.find(theme => theme.name === 'Azure (2)');
        expect(imported.css.enabled).toBe(false); expect(imported.compatibility.raw.mystery).toEqual(original.mystery);
        const count = (await persisted(page)).themes.length;
        await file.setInputFiles({ name: 'future.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'atria-theme', version: 99 })) });
        await expect(page.locator('.atria-theme-import')).toContainText('unsupported');
        await expect(page.getByRole('button', { name: 'Save imported theme' })).toBeDisabled();
        expect((await persisted(page)).themes).toHaveLength(count);
        const rejected = await page.evaluate(async theme => (await fetch('/api/themes/save', { method: 'POST', headers: Atria.getContext().getRequestHeaders(), body: JSON.stringify({ ...theme, version: 99 }) })).status, imported);
        expect(rejected).toBe(400);
        await file.setInputFiles({ name: 'native-roundtrip.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
        await page.getByRole('button', { name: 'Save imported theme' }).click();
        const roundtrip = (await persisted(page)).themes.find(theme => theme.name === 'Azure (2) (2)');
        expect(roundtrip.colors).toEqual(imported.colors); expect(roundtrip.css).toEqual(imported.css);
        expect(roundtrip.compatibility).toEqual(imported.compatibility); expect(roundtrip.id).not.toBe(imported.id);
        await page.screenshot({ path: resolve(scratch, 'upgrade-import-validation.png') });
    } finally { await tearDownServer(legacyServer); }
});
