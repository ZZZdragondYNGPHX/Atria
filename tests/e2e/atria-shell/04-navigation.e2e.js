import { test, expect } from '@playwright/test';

import { markOnboarded } from '../_lib/fixtures.js';
import { startServer, tearDownServer } from '../_lib/server.js';

let server;

test.beforeAll(async () => {
    server = await startServer({
        batchKey: 'regression',
        scenarioId: 'r7d-navigation',
    });
    markOnboarded({ dataRoot: server.dataRoot });

});

test.afterAll(async () => {
    await tearDownServer(server);
});

async function openShell(page, viewport) {
    await page.setViewportSize(viewport);
    await page.goto(server.baseURL, { waitUntil: 'domcontentloaded' });

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
    test('320px search and utility-menu focus preserve viewport alignment across theme changes', async ({ page }) => {
        const root = await openShell(page, { width: 320, height: 844 });
        await root.locator('[data-atria-primitive="BottomNavigation"] [data-atria-domain="library"]').click();
        await root.locator('[data-atria-utility="command"]').click();
        await root.locator('.atria-command-input').fill('runtime');
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(/atriaRoute=runtime/);
        await root.locator('.atria-toolbar__menu').click();
        await page.keyboard.press('Escape');
        await expect(root.locator('.atria-toolbar__menu')).toBeFocused();

        for (const [tint, appearance] of [['rgb(255,255,255)', 'light'], ['rgb(20,20,20)', 'dark']]) {
            await page.evaluate(value => document.documentElement.style.setProperty('--SmartThemeBlurTintColor', value), tint);
            await expect(page.locator('html')).toHaveAttribute('data-atria-appearance', appearance);
            await expect.poll(() => page.evaluate(() => ({
                documentWidth: document.documentElement.scrollWidth,
                offset: window.scrollX,
                shellLeft: document.getElementById('atria-app-shell').getBoundingClientRect().left,
            }))).toEqual({ documentWidth: 320, offset: 0, shellLeft: 0 });
        }
    });

    test('Expanded Rail, Command navigation and browser Back/Forward share one authority', async ({ page }) => {
        let root = await openShell(page, { width: 1440, height: 900 });

        await expect(root).toHaveAttribute('data-atria-viewport', 'expanded');
        await root
            .locator('[data-atria-primitive="NavigationRail"] [data-atria-domain="library"]')
            .click();
        await expect(root.locator('[data-atria-domain="library"].is-selected')).toHaveCount(2);
        await expect(root.locator('#atria-shell-title')).toContainText('Library');
        await expect(page).toHaveURL(/atriaRoute=library/);

        await root.locator('[data-atria-utility="command"]').click();
        await root.locator('[data-atria-command-id="navigate.runtime"]').click();
        await expect(root.locator('[data-atria-domain="runtime"].is-selected')).toHaveCount(2);
        await expect(page).toHaveURL(/atriaRoute=runtime/);

        await page.goBack();
        await expect(root.locator('[data-atria-domain="library"].is-selected')).toHaveCount(2);
        await expect(root.locator('#atria-shell-title')).toContainText('Library');

        await page.goForward();
        await expect(root.locator('[data-atria-domain="runtime"].is-selected')).toHaveCount(2);

        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => Boolean(window.Atria?.shell?.isMounted?.()));
        root = page.locator('#atria-app-shell');
        await expect(root.locator('[data-atria-domain="runtime"].is-selected')).toHaveCount(2);
        await expect(root.locator('#atria-shell-title')).toContainText('Runtime');
    });

    test('Medium keeps Rail authority and presents current Context as Dock', async ({ page }) => {
        const root = await openShell(page, { width: 900, height: 1000 });

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

        const dock = root.locator('[data-atria-primitive="Dock"]');
        await expect(dock).toBeVisible();
        await expect(root.locator('#atria-context-sheet')).toBeHidden();
        await expect(root.locator('#r7d-medium-context')).toBeVisible();

        await page.evaluate(() => window.Atria.shell.getShell().setDockOpen(false));
        await expect(dock).toBeHidden();
        await page.evaluate(() => window.Atria.shell.getShell().setDockOpen(true));
        await expect(dock).toBeVisible();
    });

    test('Compact Bottom Navigation reuses one Context node as a Sheet and resolves Escape order', async ({ page }) => {
        const root = await openShell(page, { width: 390, height: 844 });

        await expect(root).toHaveAttribute('data-atria-viewport', 'compact');
        await expect(root.locator('[data-atria-primitive="NavigationRail"]')).toBeHidden();
        await expect(root.locator('[data-atria-primitive="BottomNavigation"]')).toBeVisible();

        await root
            .locator('[data-atria-primitive="BottomNavigation"] [data-atria-domain="build"]')
            .click();
        await expect(root.locator('[data-atria-domain="build"].is-selected')).toHaveCount(2);
        await expect(page).toHaveURL(/atriaRoute=build/);

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
        const root = await openShell(page, { width: 390, height: 844 });
        await root.locator('[data-atria-utility="command"]').click();

        const patched = await page.evaluate(() => {
            document.querySelector('.atria-command-input').focus();
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

        expect(patched).toBe(true);
        await expect(root).toHaveAttribute('data-atria-keyboard', 'open');
        await expect(root.locator('[data-atria-primitive="BottomNavigation"]')).toBeHidden();
        const height = await root.evaluate(element => Math.round(element.getBoundingClientRect().height));
        expect(height).toBeLessThanOrEqual(542);
    });

    test('Web Back exits Full before Immersive/history without breaking Native Play ownership', async ({ page }) => {
        const root = await openShell(page, { width: 1280, height: 800 });

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

            const module = await import('/scripts/native/experience/ui/full-host.js');
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

    test('Hybrid and Full keep Stage ownership coherent across primary route transitions', async ({ page }) => {
        const root = await openShell(page, { width: 1280, height: 800 });

        const state = await page.evaluate(async () => {
            const foundation = window.Atria.shell;
            const shell = foundation.getShell();
            const playHost = foundation.getPlayHost();
            const surfaces = await import('/scripts/native/experience/ui/host-surfaces.js');
            const fullModule = await import('/scripts/native/experience/ui/full-host.js');

            const hybrid = surfaces.createAtriaSurfaceAdapter(document, {
                mode: 'hybrid',
                shell: foundation,
                nativePlayHost: playHost,
            });
            hybrid.resolveSurface('app.root');
            const hybridOwnerBefore = playHost.getStageOwner();

            shell.navigate('library', { reason: 'r7d-hybrid-route-test' });
            const hybridOwnerAway = playHost.getStageOwner();
            shell.navigate('play', { reason: 'r7d-hybrid-route-return' });
            const hybridOwnerReturn = playHost.getStageOwner();
            hybrid.destroy();
            const afterHybridDispose = playHost.getStageOwner();

            let fullHost;
            fullHost = fullModule.createFullGameHost(document, {
                shell: foundation,
                onExit() {
                    fullHost.dispose();
                },
                onStopGeneration() {},
                onDisablePackage() {},
                onDiagnostics() {},
            });
            fullHost.activate();
            const fullOwnerBefore = playHost.getStageOwner();
            shell.navigate('runtime', { reason: 'r7d-full-route-test' });
            const fullOwnerAway = playHost.getStageOwner();
            shell.navigate('play', { reason: 'r7d-full-route-return' });
            const fullOwnerReturn = playHost.getStageOwner();
            fullHost.dispose();

            return {
                hybridOwnerBefore,
                hybridOwnerAway,
                hybridOwnerReturn,
                afterHybridDispose,
                fullOwnerBefore,
                fullOwnerAway,
                fullOwnerReturn,
                finalOwner: playHost.getStageOwner(),
                chatCount: document.querySelectorAll('#chat').length,
                composerCount: document.querySelectorAll('#send_form').length,
                textareaCount: document.querySelectorAll('#send_textarea').length,
                nativeVisible: getComputedStyle(document.getElementById('sheld')).display !== 'none',
            };
        });

        expect(state).toEqual({
            hybridOwnerBefore: 'game-runtime:hybrid',
            hybridOwnerAway: 'game-runtime:hybrid',
            hybridOwnerReturn: 'game-runtime:hybrid',
            afterHybridDispose: null,
            fullOwnerBefore: 'game-runtime:full',
            fullOwnerAway: 'game-runtime:full',
            fullOwnerReturn: 'game-runtime:full',
            finalOwner: null,
            chatCount: 1,
            composerCount: 1,
            textareaCount: 1,
            nativeVisible: true,
        });
        await expect(root.locator('#sheld')).toBeVisible();
    });

    test('legacy Character Library trigger forwards into the authoritative Atria Library route', async ({ page }) => {
        const root = await openShell(page, { width: 1280, height: 800 });

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
