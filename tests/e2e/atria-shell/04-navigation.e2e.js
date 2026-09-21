import { test, expect } from '@playwright/test';

import { disableExtensions, markOnboarded } from '../_lib/fixtures.js';
import { startServer, tearDownServer } from '../_lib/server.js';

let server;

test.beforeAll(async () => {
    server = await startServer({
        batchKey: 'regression',
        scenarioId: 'r7d-navigation',
    });
    markOnboarded({ dataRoot: server.dataRoot });
    disableExtensions({
        dataRoot: server.dataRoot,
        names: ['stable-diffusion'],
    });
});

test.afterAll(async () => {
    await tearDownServer(server);
});

async function openShellPreview(page, viewport) {
    await page.addInitScript(() => {
        try {
            localStorage.setItem('atria.shell.preview', '1');
        } catch {
            // Storage can be unavailable before origin assignment.
        }
    });
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
        // Already configured.
    }

    const root = page.locator('#atria-app-shell');
    await root.waitFor({ state: 'visible', timeout: 10_000 });
    return root;
}

test.describe('R7D Desktop / Mobile Navigation', () => {
    test('Expanded Rail, Command navigation and browser Back/Forward share one authority', async ({ page }) => {
        let root = await openShellPreview(page, { width: 1440, height: 900 });

        await expect(root).toHaveAttribute('data-atria-viewport', 'expanded');
        await root
            .locator('[data-atria-primitive="NavigationRail"] [data-atria-domain="library"]')
            .click();
        await expect(root.locator('[data-atria-domain="library"].is-selected')).toHaveCount(2);
        await expect(root.locator('.atria-global-bar__breadcrumb')).toContainText('Library');
        await expect(page).toHaveURL(/atriaRoute=library/);

        await root.locator('[data-atria-utility="command"]').click();
        await root.locator('[data-atria-command-id="navigate.runtime"]').click();
        await expect(root.locator('[data-atria-domain="runtime"].is-selected')).toHaveCount(2);
        await expect(page).toHaveURL(/atriaRoute=runtime/);

        await page.goBack();
        await expect(root.locator('[data-atria-domain="library"].is-selected')).toHaveCount(2);
        await expect(root.locator('.atria-global-bar__breadcrumb')).toContainText('Library');

        await page.goForward();
        await expect(root.locator('[data-atria-domain="runtime"].is-selected')).toHaveCount(2);

        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => Boolean(window.Atria?.shell?.isMounted?.()));
        root = page.locator('#atria-app-shell');
        await expect(root.locator('[data-atria-domain="runtime"].is-selected')).toHaveCount(2);
        await expect(root.locator('.atria-global-bar__breadcrumb')).toContainText('Runtime');
    });

    test('Medium keeps Rail authority and presents current Context as Dock', async ({ page }) => {
        const root = await openShellPreview(page, { width: 900, height: 1000 });

        await expect(root).toHaveAttribute('data-atria-viewport', 'medium');
        await expect(root.locator('[data-atria-primitive="NavigationRail"]')).toBeVisible();
        await expect(root.locator('[data-atria-primitive="BottomNavigation"]')).toBeHidden();

        await page.evaluate(() => {
            const panel = document.createElement('div');
            panel.id = 'r7d-medium-context';
            panel.textContent = 'Runtime context';
            window.Atria.shell.getShell().setDockContent(panel, {
                title: 'Runtime Context',
                open: true,
            });
        });

        await expect(root.locator('[data-atria-primitive="Dock"]')).toBeVisible();
        await expect(root.locator('#atria-context-sheet')).toBeHidden();
        await expect(root.locator('#r7d-medium-context')).toBeVisible();
    });

    test('Compact Bottom Navigation reuses one Context node as a Sheet and resolves Escape order', async ({ page }) => {
        const root = await openShellPreview(page, { width: 390, height: 844 });

        await expect(root).toHaveAttribute('data-atria-viewport', 'compact');
        await expect(root.locator('[data-atria-primitive="NavigationRail"]')).toBeHidden();
        await expect(root.locator('[data-atria-primitive="BottomNavigation"]')).toBeVisible();

        await root
            .locator('[data-atria-primitive="BottomNavigation"] [data-atria-domain="studio"]')
            .click();
        await expect(root.locator('[data-atria-domain="studio"].is-selected')).toHaveCount(2);
        await expect(page).toHaveURL(/atriaRoute=studio/);

        await page.evaluate(() => {
            const shell = window.Atria.shell.getShell();
            const panel = document.createElement('div');
            panel.id = 'r7d-compact-context';
            panel.textContent = 'Inspector';
            shell.setDockContent(panel, {
                title: 'Inspector',
                open: true,
                state: 'half',
            });
            shell.openCommand();
        });

        await expect(root.locator('#atria-context-sheet')).toBeVisible();
        await expect(root.locator('#atria-context-sheet')).toHaveAttribute('data-atria-sheet-state', 'half');
        await expect(root.locator('#r7d-compact-context')).toBeVisible();
        await expect(root.locator('.atria-command-surface')).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(root.locator('#atria-context-sheet')).toBeHidden();
        await expect(root.locator('.atria-command-surface')).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(root.locator('.atria-command-surface')).toBeHidden();

        const uniqueness = await page.evaluate(() => ({
            chat: document.querySelectorAll('#chat').length,
            composer: document.querySelectorAll('#send_form').length,
            textarea: document.querySelectorAll('#send_textarea').length,
        }));
        expect(uniqueness).toEqual({ chat: 1, composer: 1, textarea: 1 });
    });

    test('Compact keyboard shrink hides Bottom Navigation and uses visual viewport height', async ({ page }) => {
        const root = await openShellPreview(page, { width: 390, height: 844 });

        const patched = await page.evaluate(() => {
            const textarea = document.getElementById('send_textarea');
            textarea.focus();
            try {
                Object.defineProperty(window, 'visualViewport', {
                    configurable: true,
                    value: {
                        width: 390,
                        height: 540,
                        addEventListener() {},
                        removeEventListener() {},
                    },
                });
            } catch {
                return false;
            }
            window.Atria.shell.getShell().environment.refresh();
            return true;
        });

        if (!patched) test.skip(true, 'Browser does not allow visualViewport patching in this runtime');

        await expect(root).toHaveAttribute('data-atria-keyboard', 'open');
        await expect(root.locator('[data-atria-primitive="BottomNavigation"]')).toBeHidden();
        const height = await root.evaluate(element => Math.round(element.getBoundingClientRect().height));
        expect(height).toBeLessThanOrEqual(542);
    });

    test('Web Back exits Full before Immersive/history without breaking Native Play ownership', async ({ page }) => {
        const root = await openShellPreview(page, { width: 1280, height: 800 });

        await root
            .locator('[data-atria-primitive="NavigationRail"] [data-atria-domain="library"]')
            .click();
        await root
            .locator('[data-atria-primitive="NavigationRail"] [data-atria-domain="play"]')
            .click();

        const state = await page.evaluate(async () => {
            await window.Atria.immersive.setEnabled(true, {
                useFullscreen: false,
                syncNative: false,
            });

            const module = await import('/scripts/extensions/game-runtime/ui/full-host.js');
            let fullHost;
            window.__r7dFullExitCount = 0;
            fullHost = module.createFullGameHost(document, {
                shell: window.Atria.shell,
                onExit() {
                    window.__r7dFullExitCount += 1;
                    fullHost.dispose();
                },
                onStopGeneration() {},
                onDisablePackage() {},
                onDiagnostics() {},
            });
            fullHost.activate();

            const first = window.__atriaHandleBack();
            await Promise.resolve();
            const afterFull = {
                first,
                fullExitCount: window.__r7dFullExitCount,
                immersive: window.Atria.immersive.isEnabled(),
                route: window.Atria.shell.getNavigation().getRoute().domain,
            };

            const second = window.__atriaHandleBack();
            await Promise.resolve();

            return {
                ...afterFull,
                second,
                immersiveAfterSecond: window.Atria.immersive.isEnabled(),
                chatCount: document.querySelectorAll('#chat').length,
                composerCount: document.querySelectorAll('#send_form').length,
                textareaCount: document.querySelectorAll('#send_textarea').length,
            };
        });

        expect(state).toMatchObject({
            first: 'consumed',
            fullExitCount: 1,
            immersive: true,
            route: 'play',
            second: 'consumed',
            immersiveAfterSecond: false,
            chatCount: 1,
            composerCount: 1,
            textareaCount: 1,
        });
    });

    test('legacy Character Library trigger adapts into the Atria Library route under preview', async ({ page }) => {
        const root = await openShellPreview(page, { width: 1280, height: 800 });

        await page.evaluate(() => {
            const trigger = document.createElement('button');
            trigger.className = 'open_characters_library';
            document.body.append(trigger);
            trigger.click();
        });

        await expect(root.locator('[data-atria-domain="library"].is-selected')).toHaveCount(2);
        await expect(page).toHaveURL(/atriaRoute=library/);
    });
});
