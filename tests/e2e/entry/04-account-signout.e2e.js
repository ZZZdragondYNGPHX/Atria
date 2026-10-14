import { test, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { markOnboarded } from '../_lib/fixtures.js';
import { startServer, tearDownServer } from '../_lib/server.js';

let server;
test.use({ actionTimeout: 15000 });

test.beforeAll(async () => {
    const dataRoot = mkdtempSync(resolve(import.meta.dirname, '../../.e2e-scratch/serene-auth-'));
    mkdirSync(resolve(dataRoot, 'default-user'), { recursive: true }); markOnboarded({ dataRoot });
    server = await startServer({ batchKey: 'regression', scenarioId: 'serene-auth', useExistingDataRoot: dataRoot, extraConfig: { enableUserAccounts: true } });
});

test.afterAll(async () => { await tearDownServer(server); });

test('The native Account sign-out guards repeated requests, recovers from failure and returns to account selection', async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => localStorage.setItem('language', 'zh-cn'));
    await page.route('**/api/horde/**', route => route.fulfill({ json: [] }));
    await page.goto(server.baseURL + '/login.html?noauto=true');
    await page.locator('.userSelect').click();
    await page.waitForFunction(() => performance.getEntriesByName('[init] complete').length > 0, null, { timeout: 60000 });
    await page.evaluate(() => Atria.shell.getWorkspaceHost().openUtility('account'));
    const root = page.locator('[data-atria-account-embedded]'), out = root.getByRole('button', { name: '退出登录', exact: true });
    await expect(out).toBeVisible();
    await root.locator('.userChangeNameButton').click();
    const nameDialog = page.locator('dialog[open]').last(), nameInput = nameDialog.locator('.popup-input');
    await nameInput.fill('中文输入草稿');
    let nameWrites = 0;
    page.on('request', request => { if (request.url().endsWith('/api/users/change-name')) nameWrites++; });
    await nameInput.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, isComposing: true });
    await expect(nameDialog).toBeVisible(); await expect(nameInput).toHaveValue('中文输入草稿'); expect(nameWrites).toBe(0);
    await page.keyboard.press('Escape'); await expect(nameDialog).toBeHidden();
    let requests = 0, release; const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/api/users/logout', async route => { requests++; await gate; await route.fulfill({ status: 503 }); });
    await out.dblclick(); await expect(out).toHaveAttribute('aria-busy', 'true'); expect(requests).toBe(1); release();
    await expect(page.locator('.toast-message')).toContainText('退出登录失败'); await expect(out).toBeEnabled();
    await page.screenshot({ path: info.outputPath('signout-failure-390.png'), fullPage: true });
    await page.unroute('**/api/users/logout'); await out.click();
    await expect(page).toHaveURL(/\/login(?:\.html)?(?:\?|$)/); await expect(page.locator('.userSelect')).toBeVisible();
});
