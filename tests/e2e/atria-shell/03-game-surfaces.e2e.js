import { test, expect } from '@playwright/test';

import {
    appendConnectionProfile,
    bootstrapCustomBackend,
    disableExtensions,
    markOnboarded,
} from '../_lib/fixtures.js';
import { startMockLLM } from '../_lib/mockLLM.js';
import { awaitMainUI } from '../_lib/page.js';
import { startServer, tearDownServer } from '../_lib/server.js';

let server;
let mock;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
    mock = await startMockLLM();
    server = await startServer({
        batchKey: 'regression',
        scenarioId: 'r7c-game-surfaces',
    });
    markOnboarded({ dataRoot: server.dataRoot });
    disableExtensions({
        dataRoot: server.dataRoot,
        names: ['stable-diffusion'],
    });
    bootstrapCustomBackend({ dataRoot: server.dataRoot, baseURL: mock.baseURL });
    appendConnectionProfile({ dataRoot: server.dataRoot, baseURL: mock.baseURL });
});

test.afterAll(async () => {
    await tearDownServer(server);
    await mock?.stop();
});

async function awaitR7CMainUI(page, viewport) {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
        try {
            localStorage.setItem('atria.shell.preview', '1');
        } catch {
            // Origin may not exist yet.
        }
    });
    await awaitMainUI(page, `${server.baseURL}/?atriaShell=1`);
    await page.waitForFunction(() => (
        window.Atria?.shell?.isMounted?.()
        && document.getElementById('atria-native-play-host')?.contains(document.getElementById('sheld'))
    ), null, { timeout: 15_000 });

    await page.evaluate(async () => {
        const { activateGamePackageUi } = await import('/scripts/extensions/game-runtime/ui/live.js');
        const cardAppLoader = await import('/scripts/extensions/card-app/loader.js');
        window.__r7c = {
            activateGamePackageUi,
            createCardAppContainer: cardAppLoader.createContainer,
            destroyCardAppContainer: cardAppLoader.destroyContainer,
            refs: {
                sheld: document.getElementById('sheld'),
                chat: document.getElementById('chat'),
                formSheld: document.getElementById('form_sheld'),
                sendForm: document.getElementById('send_form'),
                textarea: document.getElementById('send_textarea'),
            },
            recovery: {
                exit: 0,
                stop: 0,
                disable: 0,
                diagnostics: 0,
            },
        };
    });
}

async function assertUniqueNative(page) {
    const state = await page.evaluate(() => {
        const playHost = window.Atria.shell.getPlayHost();
        const { refs } = window.__r7c;
        return {
            sheld: document.querySelectorAll('#sheld').length,
            chat: document.querySelectorAll('#chat').length,
            sendForm: document.querySelectorAll('#send_form').length,
            textarea: document.querySelectorAll('#send_textarea').length,
            sameSheld: document.getElementById('sheld') === refs.sheld,
            sameChat: document.getElementById('chat') === refs.chat,
            sameSendForm: document.getElementById('send_form') === refs.sendForm,
            sameTextarea: document.getElementById('send_textarea') === refs.textarea,
            integrity: playHost.assertIntegrity(),
        };
    });
    expect(state).toEqual({
        sheld: 1,
        chat: 1,
        sendForm: 1,
        textarea: 1,
        sameSheld: true,
        sameChat: true,
        sameSendForm: true,
        sameTextarea: true,
        integrity: true,
    });
}

async function activateSyntheticGameUi(page, mode, html, extra = {}) {
    await page.evaluate(async ({ mode, html, extra }) => {
        const worldSession = {
            getState: () => ({ hp: 10 }),
            dispatchCommandInternal: async () => ({ status: 'committed' }),
            simulateCommandInternal: async () => ({ status: 'simulated' }),
        };
        window.__r7c.session = await window.__r7c.activateGamePackageUi({
            charId: 'r7c-browser-fixture',
            manifest: {
                id: `r7c.${mode}`,
                ui: {
                    mode,
                    entry: `ui/${mode}.html`,
                    surface: mode === 'component' ? (extra.surface || 'chat.header') : 'app.root',
                },
            },
        }, worldSession, {
            document,
            window,
            shell: window.Atria.shell,
            fetchImpl: async () => ({
                ok: true,
                status: 200,
                async text() { return html; },
            }),
            hostActions: {
                exitGameUi: () => { window.__r7c.recovery.exit += 1; },
                stopGeneration: () => {
                    window.__r7c.recovery.stop += 1;
                    document.getElementById('mes_stop')?.click();
                },
                disablePackage: () => { window.__r7c.recovery.disable += 1; },
                openDiagnostics: () => { window.__r7c.recovery.diagnostics += 1; },
            },
        });
    }, { mode, html, extra });
}

async function disposeSyntheticGameUi(page) {
    await page.evaluate(async () => {
        await window.__r7c.session?.dispose?.();
        window.__r7c.session = null;
    });
}

test('Expanded: Component, Hybrid, Full, failure recovery, Immersive and legacy CardApp share one Host', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await awaitR7CMainUI(page, { width: 1440, height: 900 });

    await expect(page.locator('#atria-app-shell')).toHaveAttribute('data-atria-viewport', 'expanded');
    await assertUniqueNative(page);

    // Narrative-only Play remains the baseline and owns no game Stage lease.
    expect(await page.evaluate(() => window.Atria.shell.getPlayHost().getStageOwner())).toBeNull();
    expect(await page.locator('#atria-native-play-host').count()).toBe(1);

    // Component augments the native conversation through the stable R4 surface.
    await activateSyntheticGameUi(
        page,
        'component',
        '<section id="r7c-component-hud">Component HUD</section>',
        { surface: 'chat.header' },
    );
    await expect(page.locator('[data-atria-game-host-surface="chat.header"] #r7c-component-hud')).toHaveCount(1);
    expect(await page.evaluate(() => window.Atria.shell.getPlayHost().getStageOwner())).toBeNull();
    await assertUniqueNative(page);

    // Immersive remains a presentation contract while Component is active.
    await page.evaluate(() => window.Atria.immersive.setEnabled(true, {
        useFullscreen: false,
        persist: false,
        syncNative: false,
    }));
    expect(await page.evaluate(() => window.Atria.immersive.isEnabled())).toBe(true);
    await assertUniqueNative(page);
    await page.evaluate(() => window.Atria.immersive.setEnabled(false, {
        useFullscreen: false,
        persist: false,
        syncNative: false,
    }));
    await disposeSyntheticGameUi(page);

    // Hybrid owns Stage but composes the same real Conversation and Composer.
    await activateSyntheticGameUi(page, 'hybrid', `
        <section id="r7c-hybrid">
            <div data-atria-native-component="conversation" id="r7c-conversation-slot"></div>
            <aside id="r7c-hud">Hybrid HUD</aside>
            <div data-atria-native-component="composer" id="r7c-composer-slot"></div>
        </section>
    `);
    await expect(page.locator('#r7c-hybrid')).toHaveCount(1);
    expect(await page.evaluate(() => window.Atria.shell.getPlayHost().getStageOwner())).toBe('game-runtime:hybrid');
    expect(await page.locator('#atria-native-play-host').evaluate(el => el.style.display)).toBe('none');
    expect(await page.locator('#chat').evaluate(el => el.parentElement.id)).toBe('r7c-conversation-slot');
    expect(await page.locator('#send_form').evaluate(el => el.parentElement.id)).toBe('r7c-composer-slot');
    await assertUniqueNative(page);

    await page.evaluate(() => window.Atria.immersive.setEnabled(true, {
        useFullscreen: false,
        persist: false,
        syncNative: false,
    }));
    expect(await page.evaluate(() => ({
        enabled: window.Atria.immersive.isEnabled(),
        owner: window.Atria.shell.getPlayHost().getStageOwner(),
    }))).toEqual({ enabled: true, owner: 'game-runtime:hybrid' });
    await page.evaluate(() => window.Atria.immersive.setEnabled(false, {
        useFullscreen: false,
        persist: false,
        syncNative: false,
    }));
    await disposeSyntheticGameUi(page);

    expect(await page.evaluate(() => window.Atria.shell.getPlayHost().getStageOwner())).toBeNull();
    expect(await page.locator('#chat').evaluate(el => el.parentElement.id)).toBe('sheld');
    expect(await page.locator('#send_form').evaluate(el => el.parentElement.id)).toBe('form_sheld');
    await assertUniqueNative(page);

    // Full owns Stage, never the AppShell. Recovery remains Host-owned.
    await page.evaluate(() => {
        window.__r7c.nativeStopClicks = 0;
        document.getElementById('mes_stop')?.addEventListener('click', () => {
            window.__r7c.nativeStopClicks += 1;
        });
    });
    await activateSyntheticGameUi(page, 'full', `
        <section id="r7c-full">
            <h1>Full Game</h1>
            <div data-atria-native-component="conversation" id="r7c-full-conversation"></div>
            <div data-atria-native-component="composer" id="r7c-full-composer"></div>
        </section>
    `);
    await expect(page.locator('#atria-game-full-root')).toHaveCount(1);
    await expect(page.locator('.atria-global-bar')).toHaveCount(1);
    expect(await page.evaluate(() => {
        const shell = window.Atria.shell.getShell();
        const root = document.getElementById('atria-game-full-root');
        const recovery = document.getElementById('atria-game-full-recovery');
        return {
            owner: window.Atria.shell.getPlayHost().getStageOwner(),
            rootInStage: shell.slots.stage.contains(root),
            recoveryInHostLayer: shell.slots.recovery.contains(recovery),
            recoveryInsidePackage: root.contains(recovery),
        };
    })).toEqual({
        owner: 'game-runtime:full',
        rootInStage: true,
        recoveryInHostLayer: true,
        recoveryInsidePackage: false,
    });

    await page.locator('[data-atria-game-recovery-action="stop"]').click();
    expect(await page.evaluate(() => ({
        action: window.__r7c.recovery.stop,
        native: window.__r7c.nativeStopClicks,
    }))).toEqual({ action: 1, native: 1 });

    expect(await page.evaluate(() => {
        window.Atria.shell.getShell().openCommand();
        return window.Atria.shell.getShell().isCommandOpen();
    })).toBe(true);
    await expect(page.locator('.atria-command-surface')).toBeVisible();
    await page.evaluate(() => window.Atria.shell.getShell().closeCommand());

    await page.evaluate(() => window.Atria.immersive.setEnabled(true, {
        useFullscreen: false,
        persist: false,
        syncNative: false,
    }));
    expect(await page.evaluate(() => ({
        enabled: window.Atria.immersive.isEnabled(),
        owner: window.Atria.shell.getPlayHost().getStageOwner(),
    }))).toEqual({ enabled: true, owner: 'game-runtime:full' });
    await page.evaluate(() => window.Atria.immersive.setEnabled(false, {
        useFullscreen: false,
        persist: false,
        syncNative: false,
    }));

    await disposeSyntheticGameUi(page);
    expect(await page.evaluate(() => window.Atria.shell.getPlayHost().getStageOwner())).toBeNull();
    await assertUniqueNative(page);

    // A failed Full mount must not strand Stage ownership or Recovery chrome.
    const failure = await page.evaluate(async () => {
        try {
            await window.__r7c.activateGamePackageUi({
                charId: 'r7c-browser-fixture',
                manifest: {
                    id: 'r7c.broken',
                    ui: { mode: 'full', entry: 'ui/broken.html', surface: 'app.root' },
                },
            }, {
                getState: () => ({}),
                dispatchCommandInternal: async () => ({}),
                simulateCommandInternal: async () => ({}),
            }, {
                document,
                window,
                shell: window.Atria.shell,
                fetchImpl: async () => ({
                    ok: true,
                    status: 200,
                    async text() {
                        return '<div data-atria-native-component="unknown-native-component"></div>';
                    },
                }),
                hostActions: { exitGameUi: () => {} },
            });
            return 'unexpected-success';
        } catch (error) {
            return String(error?.message || error);
        }
    });
    expect(failure).toContain('Unknown native Game UI component');
    expect(await page.locator('#atria-game-full-root').count()).toBe(0);
    expect(await page.locator('#atria-game-full-recovery').count()).toBe(0);
    expect(await page.evaluate(() => window.Atria.shell.getPlayHost().getStageOwner())).toBeNull();
    await assertUniqueNative(page);

    // Legacy CardApp follows the same Stage/Recovery ownership model.
    await page.evaluate(() => {
        window.__r7c.cardApp = window.__r7c.createCardAppContainer({
            shell: window.Atria.shell,
            onExit: () => { window.__r7c.recovery.exit += 1; },
            onStopGeneration: () => {
                window.__r7c.recovery.stop += 1;
                document.getElementById('mes_stop')?.click();
            },
            onDiagnostics: () => { window.__r7c.recovery.diagnostics += 1; },
        });
    });
    expect(await page.evaluate(() => ({
        owner: window.Atria.shell.getPlayHost().getStageOwner(),
        inStage: window.Atria.shell.getShell().slots.stage.contains(document.getElementById('card-app-container')),
        recoveryInHost: window.Atria.shell.getShell().slots.recovery.contains(document.getElementById('card-app-host-recovery')),
    }))).toEqual({
        owner: 'legacy-card-app',
        inStage: true,
        recoveryInHost: true,
    });
    await page.locator('[data-atria-card-app-recovery-action="diagnostics"]').click();
    expect(await page.evaluate(() => window.__r7c.recovery.diagnostics)).toBe(1);
    await page.evaluate(() => window.__r7c.destroyCardAppContainer());
    expect(await page.evaluate(() => window.Atria.shell.getPlayHost().getStageOwner())).toBeNull();
    await assertUniqueNative(page);

    expect(errors).toEqual([]);
});

test('Compact: Hybrid and Full remain Stage-scoped with one native Conversation and Composer', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await awaitR7CMainUI(page, { width: 390, height: 844 });

    await expect(page.locator('#atria-app-shell')).toHaveAttribute('data-atria-viewport', 'compact');
    await assertUniqueNative(page);

    await activateSyntheticGameUi(page, 'hybrid', `
        <section id="r7c-compact-hybrid">
            <div data-atria-native-component="conversation" id="compact-conversation"></div>
            <div data-atria-native-component="composer" id="compact-composer"></div>
        </section>
    `);
    expect(await page.evaluate(() => window.Atria.shell.getPlayHost().getStageOwner())).toBe('game-runtime:hybrid');
    expect(await page.locator('#chat').evaluate(el => el.parentElement.id)).toBe('compact-conversation');
    expect(await page.locator('#send_form').evaluate(el => el.parentElement.id)).toBe('compact-composer');
    await assertUniqueNative(page);
    await disposeSyntheticGameUi(page);

    await activateSyntheticGameUi(page, 'full', '<section id="r7c-compact-full">Compact Full</section>');
    expect(await page.evaluate(() => window.Atria.shell.getPlayHost().getStageOwner())).toBe('game-runtime:full');
    await expect(page.locator('#atria-game-full-root')).toHaveCount(1);
    await expect(page.locator('.atria-bottom-navigation')).toBeVisible();
    expect(await page.evaluate(() => (
        window.Atria.shell.getShell().slots.recovery.contains(
            document.getElementById('atria-game-full-recovery'),
        )
    ))).toBe(true);
    await assertUniqueNative(page);
    await disposeSyntheticGameUi(page);

    expect(await page.evaluate(() => window.Atria.shell.getPlayHost().getStageOwner())).toBeNull();
    await assertUniqueNative(page);
    expect(errors).toEqual([]);
});
