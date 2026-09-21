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
        const describe = (node) => {
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
            chats: Array.from(document.querySelectorAll('#chat')).map(describe),
            composers: Array.from(document.querySelectorAll('#send_form')).map(describe),
            shell: describe(document.getElementById('atria-app-shell')),
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
            `Atria R7A shell failed to become ready: ${JSON.stringify(state)}\n${startupErrors.slice(-12).join('\n') || 'no browser errors captured'}`,
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
        throw new Error(`Atria R7A shell mounted but is not visible: ${JSON.stringify(diagnostics)}`, { cause: error });
    }
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
        if (ownership.chatCount !== 1 || ownership.composerCount !== 1) {
            const diagnostics = await collectDomDiagnostics(page);
            throw new Error(`R7A native host ownership invariant failed: ${JSON.stringify({ ownership, diagnostics })}`);
        }
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
