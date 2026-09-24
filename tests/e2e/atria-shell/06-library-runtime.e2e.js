import { test, expect } from '@playwright/test';
import { disableExtensions } from '../_lib/fixtures.js';
import { startServer, tearDownServer } from '../_lib/server.js';
import { seedNativeSessionDataRoot } from '../native-session/_helpers.js';

test.describe.configure({ mode: 'serial' });
let server;

test.beforeAll(async () => {
    const seeded = await seedNativeSessionDataRoot({ suffix: 'library-runtime-navigation' });
    disableExtensions({ dataRoot: seeded.dataRoot, names: ['stable-diffusion'] });
    server = await startServer({ batchKey: 'regression', scenarioId: 'library-runtime-navigation', useExistingDataRoot: seeded.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server); });

async function boot(page, width) {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await page.goto(server.baseURL);
    await page.waitForFunction(() => performance.getEntriesByName('[init] complete').length > 0, null, { timeout: 45000 });
    await page.evaluate(() => { window.libraryRuntimeAbi = ['chat', 'send_form', 'send_textarea'].map(id => document.getElementById(id)); });
}
async function abiUnchanged(page) {
    expect(await page.evaluate(() => ['chat', 'send_form', 'send_textarea'].every((id, index) => document.querySelectorAll('#' + id).length === 1 && window.libraryRuntimeAbi[index] === document.getElementById(id)))).toBe(true);
    await expect(page.locator('#atria-workspace #right-nav-panel, #atria-workspace #WorldInfo, #atria-workspace #rm_api_block')).toHaveCount(0);
}

test('Expanded Library and Runtime navigation reuse Native authority and preserve generation ABI', async ({ page }) => {
    await boot(page, 1440);
    const root = page.locator('#atria-app-shell');
    const rail = root.locator('[data-atria-primitive="NavigationRail"]');
    await rail.locator('[data-atria-domain="library"]').click();
    await expect(root.locator('[data-atria-native-works]')).toBeVisible();
    await root.locator('[data-atria-domain-section="worlds-knowledge"]').click();
    await expect(root.locator('[data-atria-world-library]')).toBeVisible();
    await root.locator('[data-atria-domain-section="skills"]').click();
    await expect(root.locator('.atria_skill_manager')).toBeVisible();
    await expect(page.locator('.popup .atria_skill_manager')).toHaveCount(0);
    await rail.locator('[data-atria-domain="runtime"]').click();
    await expect(root.locator('[data-atria-runtime-native="routes"]')).toBeVisible();
    await root.locator('[data-atria-domain-section="connections"]').click();
    await expect(root.locator('[data-atria-runtime-native="connections"]')).toBeVisible();
    await expect(page).toHaveURL(/atriaChild=connections/);
    await root.locator('[data-atria-domain-section="profiles"]').click();
    await expect(root.locator('[data-atria-runtime-native="profiles"]')).toBeVisible();
    await page.goBack();
    await expect(root.locator('[data-atria-runtime-native="connections"]')).toBeVisible();
    await abiUnchanged(page);
});

test('Compact section picker and browser Back use the single WorkspaceHost route', async ({ page }) => {
    await boot(page, 390);
    const bottom = page.locator('[data-atria-primitive="BottomNavigation"]');
    await bottom.locator('[data-atria-domain="library"]').click();
    await expect(page.locator('[data-atria-native-works]')).toBeVisible();
    await page.getByLabel('Library section', { exact: true }).selectOption('skills');
    await expect(page.locator('.atria_skill_manager')).toBeVisible();
    await expect(page).toHaveURL(/atriaChild=skills/);
    await page.goBack();
    await expect(page.locator('[data-atria-native-works]')).toBeVisible();
    await page.goForward();
    await expect(page.getByLabel('Library section', { exact: true })).toHaveValue('skills');
    await bottom.locator('[data-atria-domain="runtime"]').click();
    await expect(page.locator('[data-atria-runtime-native="routes"]')).toBeVisible();
    await abiUnchanged(page);
});

test('Work drill-down restores its exact identity after Back and Forward', async ({ page }) => {
    await boot(page, 900);
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openLibrarySection('works'));
    const card = page.locator('[data-atria-work-id]').first();
    const id = await card.getAttribute('data-atria-work-id');
    await card.getByRole('button').click();
    await expect(page.locator('[data-atria-work-detail]')).toHaveAttribute('data-atria-work-detail', id);
    const exactURL = page.url();
    await page.goBack();
    await expect(page.locator('[data-atria-native-works]')).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(exactURL);
    await expect(page.locator('[data-atria-work-detail]')).toHaveAttribute('data-atria-work-detail', id);
    await abiUnchanged(page);
});
