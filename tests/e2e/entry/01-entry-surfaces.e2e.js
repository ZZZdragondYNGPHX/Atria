import { test, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { startServer, tearDownServer } from '../_lib/server.js';

test.use({ actionTimeout: 15000, video: 'off', trace: 'off' });
let server;

test.beforeAll(async () => {
    if (process.env.ATRIA_ENTRY_URL) { server = { baseURL: process.env.ATRIA_ENTRY_URL }; return; }
    mkdirSync(resolve(import.meta.dirname, '../../.e2e-scratch'), { recursive: true });
    const dataRoot = mkdtempSync(resolve(import.meta.dirname, '../../.e2e-scratch/entry-'));
    server = await startServer({ batchKey: 'regression', scenarioId: 'entry', useExistingDataRoot: dataRoot });
});

test.afterAll(async () => { if (!process.env.ATRIA_ENTRY_URL) await tearDownServer(server); });

async function login(page, { discreet = false, empty = false } = {}) {
    await page.route('**/api/users/list', route => discreet ? route.fulfill({ status: 204 }) : route.fulfill({ json: empty ? [] : [{ handle: 'reader', name: 'Alex Morgan', password: true, avatar: '/img/ai4.png' }] }));
    await page.route('**/api/users/oauth/providers', route => route.fulfill({ json: { providers: { github: true, discord: true } } }));
    await page.route('**/api/users/registration/info', route => route.fulfill({ json: { enabled: true } }));
    await page.goto(`${server.baseURL}/login.html?noauto=1`);
    await expect(page.locator('#userSelectBlock')).toBeVisible();
}
async function shell(page, firstRun = false) {
    await page.route('**/api/bootstrap', async route => {
        const response = await route.fetch();
        const data = await response.json();
        const settings = JSON.parse(data.settings.settings);
        settings.firstRun = firstRun;
        settings.atri_capabilities ||= {};
        settings.atri_capabilities.disabledPlugins = ['stable-diffusion'];
        data.settings.settings = JSON.stringify(settings);
        await route.fulfill({ response, json: data });
    });
    await page.goto(server.baseURL);
    await expect(page.locator('#atria-app-shell')).toBeVisible({ timeout: 45000 });
    await expect(page.locator('#preloader')).toHaveCount(0);
    await page.waitForFunction(() => performance.getEntriesByName('[init] complete').length > 0);
}
async function shot(page, testInfo, name) {
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`), animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('login keyboard selection, failed request, recovery and registration', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await login(page);
    await page.locator('.userSelect').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#userPassword')).toBeFocused();
    await page.route('**/api/users/login', route => route.fulfill({ status: 403, json: { error: 'Incorrect password. Try again.' } }));
    await page.locator('#userPassword').fill('incorrect');
    await page.locator('#userPassword').press('Enter');
    await expect(page.getByRole('alert')).toContainText('Incorrect password');
    await expect(page.getByRole('alert')).toBeFocused();
    await shot(page, testInfo, 'login-error-desktop');
    await page.route('**/api/users/recover-step1', route => route.fulfill({ json: {} }));
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await expect(page.getByLabel('Recovery code')).toBeFocused();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.locator('#userPassword')).toBeFocused();
    await page.getByRole('button', { name: 'Create an account', exact: true }).click();
    await page.getByLabel('Display name').fill('Reader');
    await page.locator('#registerHandle').fill('reader');
    await page.locator('#registerPassword').fill('password');
    await page.getByLabel('Confirm password').fill('different');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Passwords do not match.');
    await page.setViewportSize({ width: 320, height: 640 });
    await shot(page, testInfo, 'register-320');
});

test('login startup failure retries, empty accounts, OAuth and light appearance', async ({ page }, testInfo) => {
    await page.route('**/csrf-token', route => route.abort());
    await page.goto(`${server.baseURL}/login.html`);
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await page.unroute('**/csrf-token');
    await page.route('**/api/users/list', route => route.fulfill({ json: [] }));
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.locator('#emptyAccounts')).toBeVisible();
    await login(page, { empty: true });
    await expect(page.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', '/api/users/oauth/start/github');
    await page.evaluate(() => document.documentElement.style.setProperty('--SmartThemeBlurTintColor', 'rgb(255,255,255)'));
    await expect(page.locator('html')).toHaveAttribute('data-atria-appearance', 'light');
    await page.setViewportSize({ width: 900, height: 800 });
    await shot(page, testInfo, 'login-empty-light-medium');
});

test('discreet login prevents duplicate requests', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, { discreet: true });
    let requests = 0;
    let finish;
    const pending = new Promise(resolve => { finish = resolve; });
    await page.route('**/api/users/login', async route => {
        requests++;
        await pending;
        await route.fulfill({ status: 403, json: { error: 'Sign in failed. Try again.' } });
    });
    await page.locator('#userHandle').fill('reader');
    await page.locator('#userPassword').fill('secret');
    await page.locator('#userPassword').press('Enter');
    await expect(page.locator('#loginButton')).toBeDisabled();
    await page.locator('#userPassword').press('Enter');
    await shot(page, testInfo, 'login-pending-compact');
    finish();
    await expect(page.locator('#loginButton')).toBeEnabled();
    expect(requests).toBe(1);
});

test('first run preserves persona authority and adapts at desktop, medium and narrow widths', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await shell(page, true);
    const dialog = page.locator('.atri-onboarding-dialog[open]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.popup-input')).toHaveAccessibleName(/Persona|角色|用户/);
    await expect(dialog.getByText('Migrate from SillyTavern')).toHaveCount(0);
    await shot(page, testInfo, 'onboarding-desktop');
    await page.setViewportSize({ width: 900, height: 800 });
    await dialog.locator('summary').click();
    await shot(page, testInfo, 'onboarding-medium-expanded');
    await page.evaluate(() => document.documentElement.style.setProperty('--SmartThemeBlurTintColor', 'rgb(255,255,255)'));
    await page.setViewportSize({ width: 320, height: 568 });
    await shot(page, testInfo, 'onboarding-light-320');
    await dialog.locator('.popup-input').fill('   ');
    await dialog.locator('.popup-button-ok').click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.popup-input')).toBeFocused();
    await dialog.locator('.popup-input').fill('Phase Two Reader');
    await dialog.locator('.popup-button-ok').click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => page.evaluate(async () => (await import('/script.js')).name1)).toBe('Phase Two Reader');
});

test('global dialogs preserve custom actions, nesting, Escape and focus restoration', async ({ page }, testInfo) => {
    await shell(page);
    await page.evaluate(async () => {
        const { Popup, POPUP_TYPE } = await import('/scripts/popup.js');
        window.entryActions = 0;
        window.entryOuter = new Popup('<h2>Review changes</h2><p>Keep your current work or apply the update.</p>', POPUP_TYPE.CONFIRM, '', {
            customButtons: [{ text: 'Inspect details', action: () => { window.entryActions++; } }],
        });
        void window.entryOuter.show();
    });
    const custom = page.getByRole('button', { name: 'Inspect details' });
    await custom.focus();
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => window.entryActions)).toBe(1);
    await expect(page.locator('dialog[open]')).toHaveCount(1);
    await page.evaluate(async () => {
        const { Popup, POPUP_TYPE } = await import('/scripts/popup.js');
        void new Popup('<h2>Details</h2><p>This is a nested extension dialog.</p>', POPUP_TYPE.TEXT).show();
    });
    await expect(page.locator('dialog[open]')).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(1);
    await expect(custom).toBeFocused();
    await page.setViewportSize({ width: 320, height: 568 });
    await shot(page, testInfo, 'dialog-320');
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
});

test('blocking handles stack and toast stop remains keyboard operable', async ({ page }, testInfo) => {
    await shell(page);
    await page.evaluate(async () => {
        const { loader } = await import('/scripts/action-loader.js');
        window.entryStops = 0;
        window.entryLoaders = [loader.show({ message: 'Preparing your workspace', onStop: () => window.entryStops++ }), loader.show({ message: 'Loading resources', toastMode: loader.ToastMode.NONE })];
    });
    await expect(page.locator('.atri-blocking-loader[open]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('.atri-blocking-loader[open]')).toHaveCount(1);
    await shot(page, testInfo, 'blocking-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    expect((await page.locator('.atri-blocking-loader').boundingBox()).height).toBeLessThan(360);
    await expect(page.locator('#load-spinner')).toBeVisible();
    await shot(page, testInfo, 'blocking-compact');
    await page.locator('.action-loader-stop').focus();
    await page.keyboard.press('Space');
    expect(await page.evaluate(() => window.entryStops)).toBe(1);
    await expect(page.locator('.atri-blocking-loader[open]')).toHaveCount(1);
    await page.evaluate(() => window.entryLoaders[1].hide({ immediate: true }));
    await expect(page.locator('.atri-blocking-loader[open]')).toHaveCount(0);
    await page.evaluate(async () => {
        const { loader } = await import('/scripts/action-loader.js');
        const old = loader.show({ toastMode: loader.ToastMode.NONE });
        const closing = old.hide();
        window.entryReplacement = loader.show({ message: 'Still working', toastMode: loader.ToastMode.NONE });
        await closing;
    });
    await expect(page.locator('.atri-blocking-loader[open]')).toHaveCount(1);
    await expect(page.locator('#load-spinner')).toBeVisible();
    await page.evaluate(() => window.entryReplacement.hide({ immediate: true }));
    await expect(page.locator('.atri-blocking-loader[open]')).toHaveCount(0);
});

test('preloader first paint and stalled startup recovery', async ({ page }, testInfo) => {
    await page.clock.install();
    await page.route('**/script.js', route => route.abort());
    await page.goto(server.baseURL, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#preloader')).toBeVisible();
    await page.setViewportSize({ width: 900, height: 800 });
    await shot(page, testInfo, 'startup-medium');
    await page.clock.fastForward(21000);
    await expect(page.getByRole('button', { name: 'Reload Atria' })).toBeVisible();
    await page.setViewportSize({ width: 320, height: 568 });
    await shot(page, testInfo, 'startup-stalled-320');
});

test('compact dialog respects keyboard height, safe areas, reduced motion and toast layer', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await shell(page);
    await page.evaluate(async () => {
        document.documentElement.style.setProperty('--SmartThemeBlurTintColor', 'rgb(255,255,255)');
        document.documentElement.style.setProperty('--atri-safe-area-top', '24px');
        document.documentElement.style.setProperty('--atri-safe-area-bottom', '20px');
        const { Popup, POPUP_TYPE } = await import('/scripts/popup.js');
        window.entryInput = new Popup('<h2>Name this copy</h2><p>Choose a name to keep your work easy to find.</p>', POPUP_TYPE.INPUT, 'My work');
        void window.entryInput.show();
    });
    const dialog = page.locator('dialog[open]');
    await dialog.locator('.popup-input').focus();
    await page.evaluate(() => {
        Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 420 });
        window.visualViewport.dispatchEvent(new Event('resize'));
    });
    await expect(dialog).toHaveAttribute('data-atria-keyboard', 'open');
    const rect = await dialog.boundingBox();
    expect(rect.y + rect.height).toBeLessThanOrEqual(420);
    await page.evaluate(async () => {
        window.toastr.error('The connection was interrupted. Try again.', 'Could not save', { timeOut: 0, extendedTimeOut: 0 });
    });
    await expect(dialog.locator('.toast-error')).toBeVisible();
    await shot(page, testInfo, 'keyboard-light-toast-compact');
    await dialog.locator('.toast-close-button').click();
    await expect(dialog.locator('.toast-error')).toHaveCount(0);
    await page.evaluate(() => {
        window.toastr.error('Dismissal must survive pointer re-entry.', '', { timeOut: 0 });
        const toast = document.querySelector('dialog[open] .toast-error');
        toast.querySelector('.toast-close-button').click();
        window.jQuery(toast).trigger('mouseenter');
    });
    await expect(dialog.locator('.toast-error')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
});

test('successful login preserves the destination and recovery failure remains actionable', async ({ page }) => {
    await login(page, { discreet: true });
    await page.locator('#userHandle').fill('reader');
    await page.route('**/api/users/recover-step1', route => route.abort());
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await expect(page.getByRole('alert')).not.toBeEmpty();
    await expect(page.locator('#loginButton')).toBeEnabled();
    await page.route('**/api/users/login', route => route.fulfill({ json: { handle: 'reader' } }));
    await page.evaluate(() => history.replaceState(null, '', '/login.html?noauto=1&error=test&keep=yes#atria/play'));
    await page.locator('#userPassword').fill('valid');
    await page.locator('#loginButton').click();
    await page.waitForURL(url => url.pathname === '/' && url.search === '?keep=yes' && url.hash === '#atria/play');
});
