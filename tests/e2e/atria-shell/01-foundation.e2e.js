import { test, expect } from '@playwright/test';

import { disableExtensions, markOnboarded } from '../_lib/fixtures.js';
import { startServer, tearDownServer } from '../_lib/server.js';

let server;

test.beforeAll(async () => {
    server = await startServer({
        batchKey: 'regression',
        scenarioId: 'r7a-foundation',
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

async function collectDomDiagnostics(page) {
    return page.evaluate(() => {
        const describeNode = (node) => {
            if (!(node instanceof HTMLElement)) return null;
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            const parents = [];
            let current = node.parentElement;
            while (current && parents.length < 6) {
                parents.push({
                    tag: current.tagName,
                    id: current.id,
                    className: current.className,
                    hidden: current.hidden,
                    display: getComputedStyle(current).display,
                    visibility: getComputedStyle(current).visibility,
                });
                current = current.parentElement;
            }
            return {
                tag: node.tagName,
                id: node.id,
                className: node.className,
                hidden: node.hidden,
                connected: node.isConnected,
                display: style.display,
                visibility: style.visibility,
                opacity: style.opacity,
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                parents,
                html: node.outerHTML.slice(0, 500),
            };
        };

        return {
            shelds: Array.from(document.querySelectorAll('#sheld')).map(describeNode),
            chats: Array.from(document.querySelectorAll('#chat')).map(describeNode),
            composers: Array.from(document.querySelectorAll('#send_form')).map(describeNode),
            textareas: Array.from(document.querySelectorAll('#send_textarea')).map(describeNode),
            playHost: describeNode(document.getElementById('atria-native-play-host')),
            shell: describeNode(document.getElementById('atria-app-shell')),
        };
    });
}

async function openShellPreview(page, viewport) {
    const startupErrors = [];
    page.on('pageerror', error => startupErrors.push(`pageerror: ${error?.stack || error?.message || error}`));
    page.on('console', message => {
        if (message.type() === 'error') startupErrors.push(`console: ${message.text()}`);
    });

    await page.addInitScript(() => {
        try {
            localStorage.setItem('atria.shell.preview', '1');
        } catch {
            // Storage can be unavailable on transient documents before origin assignment.
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

    try {
        await page.waitForFunction(
            () => document.getElementById('preloader') === null
                && Boolean(window.Atria?.getContext)
                && Boolean(window.Atria?.shell?.isMounted?.()),
            null,
            { timeout: 30_000 },
        );
    } catch (error) {
        const state = await page.evaluate(() => ({
            href: location.href,
            previewStorage: localStorage.getItem('atria.shell.preview'),
            preloaderPresent: document.getElementById('preloader') !== null,
            atriaPresent: Boolean(window.Atria),
            hasGetContext: Boolean(window.Atria?.getContext),
            shellPublished: Boolean(window.Atria?.shell),
            shellMounted: Boolean(window.Atria?.shell?.isMounted?.()),
            shellRootPresent: Boolean(document.getElementById('atria-app-shell')),
            startupTiming: globalThis.__atriaStartupTiming
                ? JSON.parse(JSON.stringify(globalThis.__atriaStartupTiming))
                : null,
        })).catch(() => ({ href: page.url() }));
        throw new Error(
            `Atria R7B shell failed to become ready: ${JSON.stringify(state)}\n${startupErrors.slice(-12).join('\n') || 'no browser errors captured'}`,
            { cause: error },
        );
    }

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
    try {
        await root.waitFor({ state: 'visible', timeout: 10_000 });
    } catch (error) {
        const diagnostics = await collectDomDiagnostics(page);
        throw new Error(`Atria R7B shell mounted but is not visible: ${JSON.stringify(diagnostics)}`, { cause: error });
    }
    return root;
}

test.describe('R7B Native Play Host', () => {
    test('Expanded shell exposes rail, dock and command palette without cloning native chat', async ({ page }) => {
        const root = await openShellPreview(page, { width: 1440, height: 900 });

        await expect(root).toHaveAttribute('data-atria-viewport', 'expanded');
        await expect(root.locator('[data-atria-primitive="NavigationRail"]')).toBeVisible();
        await expect(root.locator('[data-atria-primitive="BottomNavigation"]')).toBeHidden();
        await expect(root.locator('[data-atria-primitive="Dock"]')).toBeVisible();

        const ownership = await page.evaluate(() => {
            const shell = document.getElementById('atria-app-shell');
            const stage = document.getElementById('atria-stage');
            const playHost = document.getElementById('atria-native-play-host');
            const sheld = document.getElementById('sheld');
            const chat = document.getElementById('chat');
            const composer = document.getElementById('send_form');
            const textarea = document.getElementById('send_textarea');
            return {
                sheldCount: document.querySelectorAll('#sheld').length,
                chatCount: document.querySelectorAll('#chat').length,
                composerCount: document.querySelectorAll('#send_form').length,
                textareaCount: document.querySelectorAll('#send_textarea').length,
                sheldInsideStage: Boolean(stage?.contains(sheld)),
                chatInsideShell: Boolean(shell?.contains(chat)),
                composerInsideShell: Boolean(shell?.contains(composer)),
                sheldParentId: sheld?.parentElement?.id || '',
                nativeHierarchy: Boolean(
                    sheld
                    && chat?.parentElement === sheld
                    && document.getElementById('form_sheld')?.parentElement === sheld
                    && composer?.parentElement?.id === 'form_sheld'
                    && composer?.contains(textarea)
                    && playHost?.contains(sheld),
                ),
            };
        });
        const diagnostics = await collectDomDiagnostics(page);
        expect(ownership, `R7B native host ownership diagnostics: ${JSON.stringify(diagnostics)}`).toEqual({
            sheldCount: 1,
            chatCount: 1,
            composerCount: 1,
            textareaCount: 1,
            sheldInsideStage: true,
            chatInsideShell: true,
            composerInsideShell: true,
            sheldParentId: 'atria-native-play-host',
            nativeHierarchy: true,
        });
        const sheldBox = await root.locator('#sheld').boundingBox();
        expect(sheldBox?.width || 0).toBeGreaterThan(100);
        expect(sheldBox?.height || 0).toBeGreaterThan(100);

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
        await expect(root.locator('#atria-native-play-host > #sheld')).toHaveCount(1);
        await expect(root.locator('#send_form')).toBeVisible();

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

    test('preview unmount restores and remount reuses the exact native nodes', async ({ page }) => {
        await openShellPreview(page, { width: 1280, height: 800 });

        await page.evaluate(() => {
            window.__r7bNativeRefs = {
                sheld: document.getElementById('sheld'),
                chat: document.getElementById('chat'),
                composer: document.getElementById('send_form'),
                textarea: document.getElementById('send_textarea'),
            };
        });

        const disabled = await page.evaluate(() => {
            const refs = window.__r7bNativeRefs;
            window.Atria.shell.setPreviewEnabled(false, { persist: false });
            return {
                shellPresent: Boolean(document.getElementById('atria-app-shell')),
                parentTag: refs.sheld?.parentElement?.tagName || '',
                sameChat: document.getElementById('chat') === refs.chat,
                sameComposer: document.getElementById('send_form') === refs.composer,
                sameTextarea: document.getElementById('send_textarea') === refs.textarea,
                chatCount: document.querySelectorAll('#chat').length,
                composerCount: document.querySelectorAll('#send_form').length,
            };
        });
        expect(disabled).toEqual({
            shellPresent: false,
            parentTag: 'BODY',
            sameChat: true,
            sameComposer: true,
            sameTextarea: true,
            chatCount: 1,
            composerCount: 1,
        });

        const remounted = await page.evaluate(() => {
            const refs = window.__r7bNativeRefs;
            window.Atria.shell.setPreviewEnabled(true, { persist: false });
            const stage = document.getElementById('atria-stage');
            return {
                shellPresent: Boolean(document.getElementById('atria-app-shell')),
                sameSheld: document.getElementById('sheld') === refs.sheld,
                sameChat: document.getElementById('chat') === refs.chat,
                sameComposer: document.getElementById('send_form') === refs.composer,
                sameTextarea: document.getElementById('send_textarea') === refs.textarea,
                inStage: Boolean(stage?.contains(refs.sheld)),
            };
        });
        expect(remounted).toEqual({
            shellPresent: true,
            sameSheld: true,
            sameChat: true,
            sameComposer: true,
            sameTextarea: true,
            inStage: true,
        });
    });

    test('Immersive presentation and Full Host Recovery keep the reparented native host coherent', async ({ page }) => {
        const root = await openShellPreview(page, { width: 1280, height: 800 });

        const before = await page.evaluate(() => ({
            sheld: document.getElementById('sheld'),
            chat: document.getElementById('chat'),
            composer: document.getElementById('send_form'),
        }));
        expect(before).toBeTruthy();

        await page.evaluate(async () => {
            await window.Atria.immersive.setEnabled(true, {
                useFullscreen: false,
                syncNative: false,
            });
        });
        await expect(page.locator('body')).toHaveClass(/atria-immersive-mode/);

        const immersiveState = await page.evaluate(() => {
            const stage = document.getElementById('atria-stage');
            const sheld = document.getElementById('sheld');
            const chat = document.getElementById('chat');
            const composer = document.getElementById('send_form');
            const stageRect = stage.getBoundingClientRect();
            const sheldRect = sheld.getBoundingClientRect();
            return {
                sheldCount: document.querySelectorAll('#sheld').length,
                chatCount: document.querySelectorAll('#chat').length,
                composerCount: document.querySelectorAll('#send_form').length,
                inStage: stage.contains(sheld),
                sheldHeight: sheldRect.height,
                stageHeight: stageRect.height,
                chatConnected: chat.isConnected,
                composerConnected: composer.isConnected,
            };
        });
        expect(immersiveState.sheldCount).toBe(1);
        expect(immersiveState.chatCount).toBe(1);
        expect(immersiveState.composerCount).toBe(1);
        expect(immersiveState.inStage).toBe(true);
        expect(immersiveState.sheldHeight).toBeGreaterThan(100);
        expect(immersiveState.sheldHeight).toBeLessThanOrEqual(immersiveState.stageHeight + 1);
        expect(immersiveState.chatConnected).toBe(true);
        expect(immersiveState.composerConnected).toBe(true);

        await page.evaluate(async () => {
            await window.Atria.immersive.setEnabled(false, {
                useFullscreen: false,
                syncNative: false,
            });
        });
        await expect(page.locator('body')).not.toHaveClass(/atria-immersive-mode/);

        const fullState = await page.evaluate(async () => {
            const module = await import('/scripts/extensions/game-runtime/ui/full-host.js');
            const sheld = document.getElementById('sheld');
            const playHost = document.getElementById('atria-native-play-host');
            sheld.style.display = 'flex';
            const host = module.createFullGameHost(document, {
                onExit() {},
                onStopGeneration() {},
                onDisablePackage() {},
                onDiagnostics() {},
            });
            const activated = host.activate();
            const hiddenDuringFull = getComputedStyle(sheld).display === 'none';
            const recoveryOutsidePackage = !host.root.contains(host.recovery)
                && host.recovery.parentElement === document.body;
            host.dispose();
            return {
                activated,
                hiddenDuringFull,
                recoveryOutsidePackage,
                restoredDisplay: sheld.style.display,
                restoredToPlayHost: sheld.parentElement === playHost,
                chatCount: document.querySelectorAll('#chat').length,
                composerCount: document.querySelectorAll('#send_form').length,
            };
        });

        expect(fullState).toEqual({
            activated: true,
            hiddenDuringFull: true,
            recoveryOutsidePackage: true,
            restoredDisplay: 'flex',
            restoredToPlayHost: true,
            chatCount: 1,
            composerCount: 1,
        });
        await expect(root.locator('#sheld')).toBeVisible();
    });

    test('Ctrl+K opens the command surface and Escape closes it', async ({ page }) => {
        const root = await openShellPreview(page, { width: 1280, height: 800 });

        await page.keyboard.press('Control+K');
        await expect(root.locator('.atria-command-surface')).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(root.locator('.atria-command-surface')).toBeHidden();
    });
});
