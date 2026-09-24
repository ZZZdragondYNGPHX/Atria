import { test, expect } from '@playwright/test';
import { startServer, tearDownServer } from '../_lib/server.js';
import { seedNativeSessionDataRoot, createAndOpenNativeSession } from './_helpers.js';

let server;
let seeded;
test.describe.configure({ mode: 'serial' });
test.use({ actionTimeout: 12000 });

test.beforeAll(async () => {
    seeded = await seedNativeSessionDataRoot({ suffix: 'play-redesign' });
    server = await startServer({ batchKey: 'regression', scenarioId: 'play-redesign', useExistingDataRoot: seeded.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server); });

async function boot(page, width = 1440, height = 900, locale = 'en') {
    await page.setViewportSize({ width, height });
    await page.addInitScript(locale => localStorage.setItem('language', locale), locale);
    // Legacy provider discovery is unrelated to the Native Play workflow under test.
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await page.route('**/api/bootstrap', async route => {
        const response = await route.fetch(); const data = await response.json();
        const settings = JSON.parse(data.settings.settings);
        settings.firstRun = false;
        settings.extension_settings ||= {};
        settings.extension_settings.disabledExtensions = ['stable-diffusion'];
        data.settings.settings = JSON.stringify(settings);
        await route.fulfill({ response, json: data });
    });
    await page.goto(server.baseURL);
    await page.waitForFunction(() => performance.getEntriesByName('[init] complete').length > 0, null, { timeout: 45000 });
}
async function shot(page, info, name) {
    await page.screenshot({ path: info.outputPath(`${name}.png`), animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function story(page) {
    await createAndOpenNativeSession(page, { ...seeded.start, displayTitle: 'The quiet harbour' });
    // Prepare committed narrative through the exact-revision API, not a second UI store.
    await page.evaluate(async () => {
        const runtime = window.Atria.nativeSessionRuntime;
        const response = await fetch('/api/native/session/command', {
            method: 'POST', headers: window.Atria.getContext().getRequestHeaders(),
            body: JSON.stringify({ sessionId: runtime.snapshot.session.sessionId,
                expectedRevisionId: runtime.snapshot.revision.revisionId,
                command: { type: 'timeline', commands: Array.from({ length: 14 }, (_, index) => ({
                    type: 'append', draft: { role: index % 2 ? 'user' : 'assistant',
                        content: index % 2 ? 'I follow the light along the water.' : 'Beyond the harbour, the last ferry waits in the mist. A small light moves between the empty windows.\n\n“You have time,” the keeper says. “But only until the tide turns.”',
                    },
                })) },
            }),
        });
        if (!response.ok) throw new Error(await response.text());
        await runtime.reload();
    });
    await expect(page.locator('[data-atria-message-id]')).toHaveCount(15);
}

test('landing has retry, empty states, works and a real resume action', async ({ page }, info) => {
    await page.route('**/api/native/product/sessions', route => route.fulfill({ status: 503, json: {} }));
    await boot(page);
    const landing = page.locator('[data-atria-native-play-landing]');
    await expect(landing.getByRole('alert')).toContainText('could not be loaded');
    await shot(page, info, 'landing-error');
    await page.unroute('**/api/native/product/sessions');
    await landing.getByRole('button', { name: 'Try again' }).click();
    await expect(landing).toContainText('Your next story is waiting');
    await shot(page, info, 'landing-empty-desktop');
    await landing.getByRole('button', { name: /Open N4/ }).click();
    await page.getByRole('button', { name: 'Start New', exact: true }).click();
    await expect(page.locator('#atria-play-product')).toBeVisible();
    await page.evaluate(async () => { await window.Atria.nativeSessionRuntime.close(); });
    await expect(landing.locator('[data-atria-landing-session]').first()).toBeVisible();
    await page.setViewportSize({ width: 900, height: 900 });
    await shot(page, info, 'landing-medium');
    await landing.getByRole('button', { name: 'Continue', exact: true }).first().click();
    await expect(page.locator('#atria-play-product')).toBeVisible();
});

test('reading preserves position and nodes while draft streams; composer grows and handles IME', async ({ page }, info) => {
    await boot(page);
    await story(page);
    const conversation = page.locator('[data-atria-conversation]');
    await conversation.evaluate(node => { window.playFirst = node.firstElementChild; node.scrollTop = 0; node.dispatchEvent(new Event('scroll')); });
    await page.evaluate(() => {
        document.body.dataset.generating = 'true';
        document.dispatchEvent(new CustomEvent('atria-native-play-draft', { detail: { text: 'The keeper opens the gate.' } }));
    });
    await expect(page.getByRole('button', { name: 'Jump to latest' })).toBeVisible();
    expect(await conversation.evaluate(node => node.scrollTop)).toBe(0);
    expect(await conversation.evaluate(node => node.firstElementChild === window.playFirst)).toBe(true);
    await page.getByRole('button', { name: 'Jump to latest' }).click();
    await expect(page.locator('[data-atria-draft]')).toBeVisible();
    await shot(page, info, 'reading-desktop');
    await page.evaluate(() => { document.body.dataset.generating = 'false'; });
    const input = page.locator('.atria-play-composer__input');
    await input.fill('One line\nAnother line\nA third line\nA final line');
    expect((await input.boundingBox()).height).toBeGreaterThan(80);
    await input.dispatchEvent('keydown', { key: 'Enter', ctrlKey: true, isComposing: true });
    await expect(input).toHaveValue(/A final line/);
    await input.press('Enter');
    await expect(input).toHaveValue(/\n/);
});

test('save, inspector, error and Context share the Shell without stale async panels', async ({ page }, info) => {
    await boot(page);
    await story(page);
    const actions = page.locator('[data-atria-native-play-actions]');
    await actions.getByRole('button', { name: 'Save', exact: true }).click();
    const popup = page.locator('dialog.popup[open]');
    await popup.locator('.popup-input').fill('At the harbour gate');
    await popup.locator('.popup-button-ok').click();
    await expect(actions.getByRole('status')).toHaveText('Saved');
    await actions.getByRole('button', { name: 'Timeline', exact: true }).click();
    const drawer = page.locator('[data-atria-native-play-drawer]');
    await expect(drawer).toContainText('At the harbour gate');
    await expect(page.locator('.atria-dock__body [data-atria-native-play-drawer]')).toBeVisible();
    await shot(page, info, 'timeline-desktop');
    await page.getByRole('button', { name: 'Close inspector', exact: true }).click();
    await expect(actions.getByRole('button', { name: 'Timeline', exact: true })).toBeFocused();
    let staleRequestDone = false;
    await page.route('**/api/native/product/sessions/*', async route => {
        await new Promise(resolve => setTimeout(resolve, 300));
        await route.fulfill({ status: 503, json: {} });
        staleRequestDone = true;
    });
    await actions.getByRole('button', { name: 'Timeline', exact: true }).click();
    await actions.getByRole('button', { name: 'Context', exact: true }).click();
    await expect(drawer).toContainText('Send a message');
    await expect.poll(() => staleRequestDone).toBe(true);
    await expect(drawer).not.toContainText('503');
    await page.getByRole('button', { name: 'Close inspector', exact: true }).click();
    await actions.getByRole('button', { name: 'Timeline', exact: true }).click();
    await expect(drawer.getByRole('button', { name: 'Try again' })).toBeVisible();
    await shot(page, info, 'inspector-error');
});

test('320px light, keyboard, safe areas, focus, More and compact inspector', async ({ page }, info) => {
    await boot(page, 320, 740);
    await story(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => {
        document.documentElement.style.setProperty('--SmartThemeBlurTintColor', 'rgb(255,255,255)');
        document.documentElement.style.setProperty('--atri-safe-area-bottom', '20px');
    });
    await expect(page.locator('html')).toHaveAttribute('data-atria-appearance', 'light');
    await shot(page, info, 'play-light-320');
    await page.locator('.atria-play-more summary').click();
    await expect(page.getByRole('button', { name: 'Quick Save', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.atria-play-more summary')).toBeFocused();
    await expect(page.locator('.atria-play-more')).not.toHaveAttribute('open', '');
    await page.getByRole('button', { name: 'Timeline', exact: true }).click();
    await expect(page.locator('#atria-context-sheet [data-atria-native-play-drawer]')).toBeVisible();
    await shot(page, info, 'timeline-light-320');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Timeline', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Show inspector', exact: true }).click();
    await expect(page.locator('#atria-context-sheet [data-atria-native-play-drawer]')).toBeVisible();
    await page.locator('.atria-sheet-close').focus();
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => document.getElementById('atria-context-sheet').contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await page.locator('.atria-play-composer__input').fill('The tide is turning.');
    await page.evaluate(() => {
        Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 420 });
        window.visualViewport.dispatchEvent(new Event('resize'));
    });
    await expect(page.locator('#atria-app-shell')).toHaveAttribute('data-atria-keyboard', 'open');
    const rect = await page.locator('#atria-play-composer').boundingBox();
    expect(rect.y + rect.height).toBeLessThanOrEqual(420);
    await shot(page, info, 'keyboard-light-320');
});

test('Game sidebars and native modal frames preserve ownership, focus and Escape', async ({ page }, info) => {
    await boot(page, 390, 844);
    await story(page);
    await page.locator('.atria-play-composer__input').focus();
    await page.evaluate(async () => {
        const { createAtriaSurfaceAdapter } = await import('/scripts/extensions/game-runtime/ui/host-surfaces.js');
        const { createSurfaceHost } = await import('/scripts/extensions/game-runtime/ui/surfaces.js');
        window.gameAdapter = createAtriaSurfaceAdapter(document, { shell: window.Atria.shell, nativePlayHost: window.Atria.shell.getPlayHost() });
        window.gameSurfaces = createSurfaceHost({ resolveSurface: window.gameAdapter.resolveSurface });
        const sidebar = window.gameSurfaces.mount('sidebar.left', 'inventory');
        sidebar.container.textContent = 'Inventory · Brass key · Ferry ticket';
        const mount = window.gameSurfaces.mount('modal', 'choice');
        const title = document.createElement('h2'); title.textContent = 'The last crossing';
        const text = document.createElement('p'); text.textContent = 'The ferry keeper is waiting. Take a moment before you continue.';
        const label = document.createElement('label'); label.textContent = 'Your reply';
        const input = document.createElement('input'); input.name = 'reply'; label.append(input);
        mount.container.append(title, text, label);
    });
    const modal = page.getByRole('dialog', { name: 'Game dialog', exact: true });
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Close' })).toBeFocused();
    await shot(page, info, 'game-modal-compact');
    await modal.getByLabel('Your reply').fill('I am ready.');
    await page.evaluate(() => {
        Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 420 });
        window.visualViewport.dispatchEvent(new Event('resize'));
    });
    await expect(page.locator('#atria-app-shell')).toHaveAttribute('data-atria-keyboard', 'open');
    const modalRect = await modal.boundingBox();
    expect(modalRect.y + modalRect.height).toBeLessThanOrEqual(420);
    await shot(page, info, 'game-modal-keyboard');
    await page.evaluate(() => { delete window.visualViewport.height; window.visualViewport.dispatchEvent(new Event('resize')); });
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
    await expect(page.locator('[data-atria-game-host-surface="sidebar.left"]')).toBeVisible();
    await page.evaluate(() => { window.gameSurfaces.unmountAll(); window.gameAdapter.destroy(); });
    expect(await page.evaluate(() => window.Atria.shell.getPlayHost().assertIntegrity())).toBe(true);
});

test('Full Game recovery stays outside package content and restores the exact host', async ({ page }, info) => {
    await boot(page, 900, 800);
    await story(page);
    await page.evaluate(async () => {
        const { createFullGameHost } = await import('/scripts/extensions/game-runtime/ui/full-host.js');
        window.gameStopped = 0;
        window.gameHost = createFullGameHost(document, { shell: window.Atria.shell,
            onExit: () => window.gameHost.dispose(), onStopGeneration: () => { window.gameStopped++; },
            onSave: () => { throw new Error('Save unavailable. Try again.'); },
        });
        const title = document.createElement('h1'); title.textContent = 'The quiet harbour';
        const paragraph = document.createElement('p'); paragraph.textContent = 'The full experience owns this stage. Atria keeps your controls within reach.';
        window.gameHost.root.append(title, paragraph);
        window.gameHost.root.style.padding = '32px';
        window.gameHost.activate();
    });
    await page.locator('.atria-game-recovery-panel summary').click();
    await page.getByRole('button', { name: 'Stop generation', exact: true }).click();
    expect(await page.evaluate(() => window.gameStopped)).toBe(1);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.atria-game-recovery-panel [role="status"]')).toContainText('Try again');
    await shot(page, info, 'game-recovery-medium');
    await page.setViewportSize({ width: 320, height: 740 });
    await shot(page, info, 'game-recovery-320');
    await page.keyboard.press('Escape');
    await expect(page.locator('#atria-game-full-root')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#atria-game-full-root')).toHaveCount(0);
    await expect(page.locator('#atria-play-product')).toBeVisible();
    expect(await page.evaluate(() => window.Atria.shell.getPlayHost().assertIntegrity())).toBe(true);
});

test('portable saves keep preflight and history is read-only; generation errors offer Runtime', async ({ page }, info) => {
    await boot(page, 900, 800);
    await story(page);
    const saved = await page.evaluate(async () => {
        const { nativeProductClient } = await import('/scripts/native/product-client.js');
        const runtime = window.Atria.nativeSessionRuntime;
        return { sessionId: runtime.snapshot.session.sessionId, revisionId: runtime.snapshot.revision.revisionId,
            payload: await nativeProductClient.exportSession(runtime.snapshot.session.sessionId) };
    });
    await page.evaluate(async ({ sessionId, revisionId }) => {
        await window.Atria.openNativeSession(sessionId, { revisionId });
    }, saved);
    await expect(page.locator('.atria-play-composer__input')).toBeDisabled();
    await expect(page.locator('#atria-play-composer')).toContainText('Historical revisions are read-only');
    await shot(page, info, 'history-medium');
    await page.evaluate(async ({ sessionId }) => { await window.Atria.openNativeSession(sessionId); }, saved);
    await page.locator('.atria-play-composer__input').fill('Look for the keeper.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.locator('.atri-runtime-notice')).toBeVisible();
    await expect(page.locator('.atri-runtime-notice button')).toContainText('Open Runtime');
    await shot(page, info, 'generation-error-medium');
    await page.getByRole('button', { name: 'Timeline', exact: true }).click();
    const portable = page.locator('[data-atria-native-play-drawer] .atria-native-portable-save');
    await portable.locator('summary').first().click();
    await portable.locator('input').setInputFiles({ name: 'invalid.atriasave', mimeType: 'application/octet-stream', buffer: Buffer.from('invalid') });
    await expect(portable).toContainText('request failed');
    await portable.locator('input').setInputFiles({ name: 'harbour.atriasave', mimeType: 'application/octet-stream', buffer: Buffer.from(saved.payload.data, 'base64') });
    await expect(portable.locator('[data-atria-save-preflight="ready"]')).toBeVisible();
    await portable.getByRole('button', { name: 'Import & Open' }).click();
    await page.locator('dialog.popup[open] .popup-button-ok').click();
    await expect(portable.getByRole('alert')).toContainText('conflicts with existing session data');
    expect(await page.evaluate(() => window.Atria.nativeSessionRuntime.snapshot.timeline.at(-1).content)).toBe('Look for the keeper.');
    // Remove only this isolated test Session to exercise import into an empty target.
    await page.evaluate(async ({ sessionId }) => {
        const { nativeProductClient } = await import('/scripts/native/product-client.js');
        await window.Atria.nativeSessionRuntime.close();
        await nativeProductClient.deleteSession(sessionId);
    }, saved);
    const landingImport = page.locator('[data-atria-native-play-landing] .atria-native-portable-save');
    await landingImport.locator('summary').click();
    await landingImport.locator('input').setInputFiles({ name: 'harbour.atriasave', mimeType: 'application/octet-stream', buffer: Buffer.from(saved.payload.data, 'base64') });
    await landingImport.getByRole('button', { name: 'Import & Open' }).click();
    await page.locator('dialog.popup[open] .popup-button-ok').click();
    await expect.poll(() => page.evaluate(() => window.Atria.nativeSessionRuntime.snapshot?.session.sessionId)).toBe(saved.sessionId);
    await expect(page.locator('[data-atria-message-id]')).toHaveCount(15);
    await expect(page.locator('#atria-play-product')).toBeVisible();
});

test('Chinese landing, large text and landscape remain usable', async ({ page }, info) => {
    await boot(page, 375, 812, 'zh-cn');
    await expect(page.locator('.atria-play-landing-header h1')).toHaveText('回到故事之中');
    await page.evaluate(() => document.documentElement.style.setProperty('--mainFontSize', '20px'));
    await shot(page, info, 'landing-chinese-375-large-text');
    await page.setViewportSize({ width: 900, height: 720 });
    await page.evaluate(() => document.documentElement.style.setProperty('--SmartThemeBlurTintColor', 'rgb(255,255,255)'));
    await expect(page.locator('html')).toHaveAttribute('data-atria-appearance', 'light');
    await shot(page, info, 'landing-chinese-light-medium');
    await story(page);
    await page.setViewportSize({ width: 740, height: 375 });
    await shot(page, info, 'play-light-landscape');
    const composer = await page.locator('#atria-play-composer').boundingBox();
    expect(composer.y + composer.height).toBeLessThanOrEqual(375);
});
