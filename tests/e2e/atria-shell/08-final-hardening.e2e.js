import { test, expect } from '@playwright/test';

import { markOnboarded } from '../_lib/fixtures.js';
import { awaitMainUI } from '../_lib/page.js';
import { startServer, tearDownServer } from '../_lib/server.js';

let server;

test.beforeAll(async () => {
    server = await startServer({ batchKey: 'regression', scenarioId: 'r7h-final-hardening' });
    markOnboarded({ dataRoot: server.dataRoot });

});

test.afterAll(async () => {
    await tearDownServer(server);
});

test.describe('R7H Legacy Shell Retirement & Final Hardening', () => {
    test('normal startup uses Atria Shell while legacy chrome becomes compatibility-only', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await awaitMainUI(page, server.baseURL);
        await page.waitForFunction(() => Boolean(window.Atria?.shell?.isMounted?.()));

        const root = page.locator('#atria-app-shell');
        await expect(root).toBeVisible();
        await expect(page.locator('body')).toHaveAttribute('data-atria-shell-mounted', 'true');
        await expect(page.locator('body')).not.toHaveAttribute('data-atria-shell-recovery', 'legacy');
        await expect(page.locator('#top-bar')).toBeHidden();
        await expect(page.locator('#top-settings-holder')).toBeHidden();

        for (const id of [
            'left-nav-panel',
            'right-nav-panel',
            'WorldInfo',
            'rm_api_block',
            'user-settings-block',
            'rm_extensions_block',
            'extensions_settings',
            'extensions_settings2',
        ]) {
            await expect(page.locator(`#${id}`)).toHaveCount(1);
            await expect(page.locator(`#${id}`)).toHaveAttribute('data-atria-compatibility-anchor', 'true');
        }

        expect(await page.evaluate(() => ({
            shell: document.querySelectorAll('#atria-app-shell').length,
            chat: document.querySelectorAll('#chat').length,
            sendForm: document.querySelectorAll('#send_form').length,
            textarea: document.querySelectorAll('#send_textarea').length,
        }))).toEqual({ shell: 1, chat: 1, sendForm: 1, textarea: 1 });

        await root.locator('[data-atria-utility="settings"]').click();
        await expect(root.locator('[data-atria-utility-workspace="settings"]')).toBeVisible();
        await expect(root.locator('[data-atria-settings-section="moving-ui"]')).toHaveCount(0);
        await expect(root.locator('#send_on_enter')).toBeVisible();
        await expect(root.locator('#movingUIModeCheckBlock')).toHaveCount(0);
        await expect(page.locator('#movingUIModeCheckBlock')).toHaveCount(1);
        await expect(page.locator('#movingUIModeCheckBlock')).toBeHidden();
    });

    test('MovingUI persisted geometry cannot override Shell-owned native Play layout', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await awaitMainUI(page, server.baseURL);
        await page.waitForFunction(() => Boolean(window.Atria?.shell?.isMounted?.()));

        const result = await page.evaluate(async () => {
            const module = await import('/scripts/power-user.js');
            module.power_user.movingUI = true;
            module.power_user.movingUIState = {
                ...(module.power_user.movingUIState || {}),
                sheld: { left: '333px', top: '222px', width: '321px', height: '234px' },
            };
            module.loadMovingUIState();
            const sheld = document.getElementById('sheld');
            return {
                inShell: Boolean(sheld?.closest('#atria-app-shell')),
                left: sheld?.style.left || '',
                top: sheld?.style.top || '',
                width: sheld?.style.width || '',
                height: sheld?.style.height || '',
            };
        });

        expect(result.inShell).toBe(true);
        expect(result.left).not.toBe('333px');
        expect(result.top).not.toBe('222px');
        expect(result.width).not.toBe('321px');
        expect(result.height).not.toBe('234px');
    });

    test('explicit legacy recovery query skips Shell mount without deleting compatibility DOM', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await awaitMainUI(page, `${server.baseURL}/?atriaShellRecovery=legacy`);

        await expect(page.locator('#atria-app-shell')).toHaveCount(0);
        await expect(page.locator('body')).toHaveAttribute('data-atria-shell-recovery', 'legacy');
        expect(await page.evaluate(() => Boolean(window.Atria?.shell?.isRecoveryMode?.()))).toBe(true);
        await expect(page.locator('#top-settings-holder')).toHaveCount(1);
        await expect(page.locator('#sheld')).toHaveCount(1);
        await expect(page.locator('#extensions_settings')).toHaveCount(1);
    });
});
