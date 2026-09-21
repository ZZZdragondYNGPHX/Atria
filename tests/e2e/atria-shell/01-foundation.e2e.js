import { test, expect } from '@playwright/test';

import { startServer, tearDownServer } from '../_lib/server.js';

let server;

test.beforeAll(async () => {
    server = await startServer({
        batchKey: 'regression',
        scenarioId: 'r7a-foundation',
    });
});

test.afterAll(async () => {
    await tearDownServer(server);
});

async function openShellPreview(page, viewport) {
    await page.setViewportSize(viewport);
    await page.goto(`${server.baseURL}/?atriaShell=1`, { waitUntil: 'domcontentloaded' });

    const gate = page.locator('#userList .userSelect:last-child');
    try {
        await gate.waitFor({ state: 'visible', timeout: 2000 });
        await gate.click();
    } catch {
        // Auto-login path.
    }

    await page.waitForFunction(
        () => document.getElementById('preloader') === null
            && Boolean(window.Atria?.getContext)
            && Boolean(window.Atria?.shell?.isMounted?.()),
        null,
        { timeout: 30_000 },
    );

    const onboarding = page.locator('dialog.popup[open]').filter({
        has: page.locator('#onboarding_ui_language_select'),
    }).first();
    try {
        await onboarding.waitFor({ state: 'visible', timeout: 1000 });
        await onboarding.locator('.popup-button-ok').first().click();
    } catch {
        // Already configured / no onboarding.
    }

    const root = page.locator('#atria-app-shell');
    await root.waitFor({ state: 'visible', timeout: 10_000 });
    return root;
}

test.describe('R7A AppShell foundation', () => {
    test('Expanded shell exposes rail, dock and command palette without cloning native chat', async ({ page }) => {
        const root = await openShellPreview(page, { width: 1440, height: 900 });

        await expect(root).toHaveAttribute('data-atria-viewport', 'expanded');
        await expect(root.locator('[data-atria-primitive="NavigationRail"]')).toBeVisible();
        await expect(root.locator('[data-atria-primitive="BottomNavigation"]')).toBeHidden();
        await expect(root.locator('[data-atria-primitive="Dock"]')).toBeVisible();

        const ownership = await page.evaluate(() => {
            const shell = document.getElementById('atria-app-shell');
            const chat = document.getElementById('chat');
            const composer = document.getElementById('send_form');
            return {
                chatCount: document.querySelectorAll('#chat').length,
                composerCount: document.querySelectorAll('#send_form').length,
                chatInsideShell: Boolean(shell?.contains(chat)),
                composerInsideShell: Boolean(shell?.contains(composer)),
            };
        });
        expect(ownership).toEqual({
            chatCount: 1,
            composerCount: 1,
            chatInsideShell: false,
            composerInsideShell: false,
        });

        await root.locator('[data-atria-utility="command"]').click();
        const command = root.locator('.atria-command-surface');
        await expect(command).toBeVisible();
        await expect(command).toHaveAttribute('data-atria-command-presentation', 'palette');

        await command.locator('[data-atria-command-id="navigate.library"]').click();
        await expect(root.locator('[data-atria-primitive="Stage"]')).toBeHidden();
        await expect(root.locator('[data-atria-primitive="Workspace"]')).toBeVisible();
        await expect(root.locator('.atria-global-bar__breadcrumb')).toContainText('Library');
    });

    test('Compact shell uses bottom navigation and the same registry through Command Sheet', async ({ page }) => {
        const root = await openShellPreview(page, { width: 390, height: 844 });

        await expect(root).toHaveAttribute('data-atria-viewport', 'compact');
        await expect(root.locator('[data-atria-primitive="NavigationRail"]')).toBeHidden();
        await expect(root.locator('[data-atria-primitive="BottomNavigation"]')).toBeVisible();
        await expect(root.locator('[data-atria-primitive="Dock"]')).toBeHidden();

        await root.locator('[data-atria-utility="command"]').click();
        const command = root.locator('.atria-command-surface');
        await expect(command).toBeVisible();
        await expect(command).toHaveAttribute('data-atria-command-presentation', 'sheet');

        const input = command.locator('.atria-command-input');
        await input.fill('runtime');
        await expect(command.locator('[data-atria-command-id="navigate.runtime"]')).toBeVisible();
        await command.locator('[data-atria-command-id="navigate.runtime"]').click();

        await expect(root.locator('[data-atria-domain="runtime"].is-selected')).toHaveCount(2);
        await expect(root.locator('.atria-global-bar__breadcrumb')).toContainText('Runtime');
    });

    test('Ctrl+K opens the command surface and Escape closes it', async ({ page }) => {
        const root = await openShellPreview(page, { width: 1280, height: 800 });

        await page.keyboard.press('Control+K');
        await expect(root.locator('.atria-command-surface')).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(root.locator('.atria-command-surface')).toBeHidden();
    });
});
