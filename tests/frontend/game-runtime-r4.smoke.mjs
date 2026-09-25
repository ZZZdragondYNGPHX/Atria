import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const publicRoot = resolve(fileURLToPath(new URL('../../public', import.meta.url)));
const mime = {
    '.js': 'text/javascript',
    '.html': 'text/html',
    '.css': 'text/css',
    '.json': 'application/json',
};

const server = createServer(async (req, res) => {
    try {
        if (req.url === '/') {
            res.setHeader('Content-Type', 'text/html');
            res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>');
            return;
        }
        const pathname = new URL(req.url, 'http://localhost').pathname;
        const target = resolve(publicRoot, '.' + pathname);
        if (!target.startsWith(publicRoot + sep)) throw new Error('outside public root');
        res.setHeader('Content-Type', mime[extname(target)] || 'application/octet-stream');
        res.end(await readFile(target));
    } catch {
        res.writeHead(404);
        res.end();
    }
});

await new Promise(resolveReady => server.listen(0, '127.0.0.1', resolveReady));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

async function boot(page) {
    await page.goto(baseUrl);
    await page.evaluate(async () => {
        document.body.innerHTML = `
            <div id="top-bar"></div>
            <div id="top-settings-holder"></div>
            <button id="server_logs_button">Diagnostics</button>
            <main id="sheld">
                <div id="chat"><div class="mes">Native conversation</div></div>
                <div id="form_sheld">
                    <div id="send_form">
                        <textarea id="send_textarea"></textarea>
                        <button id="mes_stop">Stop</button>
                    </div>
                </div>
            </main>
        `;

        const runtime = await import('/scripts/native/experience/ui/live.js');
        window.__activateGamePackageUi = runtime.activateGamePackageUi;
        window.__recovery = { exit: 0, stop: 0, disable: 0, diagnostics: 0 };
    });
}

async function runDesktopFull(browser) {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await boot(page);

    await page.evaluate(async () => {
        const html = `
            <section id="desktop-full-shell">
                <h1>Full Game</h1>
                <div data-atria-native-component="conversation"></div>
                <div data-atria-native-component="composer"></div>
            </section>
        `;
        const worldSession = {
            getState: () => ({}),
            dispatchCommandInternal: async () => ({ status: 'committed' }),
            simulateCommandInternal: async () => ({ status: 'simulated' }),
        };
        window.__gameSession = await window.__activateGamePackageUi({
            charId: 'hero',
            manifest: {
                id: 'r4.desktop.full',
                ui: {
                    mode: 'full',
                    entry: 'ui/game.html',
                    surface: 'app.root',
                },
            },
        }, worldSession, {
            document,
            window,
            fetchImpl: async () => ({
                ok: true,
                status: 200,
                async text() { return html; },
            }),
            hostActions: {
                exitGameUi: () => { window.__recovery.exit += 1; },
                stopGeneration: () => { window.__recovery.stop += 1; },
                disablePackage: () => { window.__recovery.disable += 1; },
                openDiagnostics: () => { window.__recovery.diagnostics += 1; },
            },
        });
    });

    assert.equal(await page.locator('#atria-game-full-root').count(), 1);
    assert.equal(await page.locator('#atria-game-full-recovery').count(), 1);
    assert.equal(await page.locator('#sheld').evaluate(el => getComputedStyle(el).display), 'none');
    assert.equal(await page.locator('#chat').evaluate(el => el.parentElement.hasAttribute('data-atria-native-component')), true);
    assert.equal(await page.locator('#send_form').evaluate(el => el.parentElement.hasAttribute('data-atria-native-component')), true);
    assert.equal(await page.locator('.atria-game-package-full').getAttribute('data-atria-game-device'), 'desktop');
    assert.equal(await page.locator('.atria-game-package-full').getAttribute('data-atria-game-orientation'), 'landscape');

    await page.locator('[data-atria-game-recovery-action="stop"]').click();
    assert.equal(await page.evaluate(() => window.__recovery.stop), 1);

    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.__recovery.exit), 1);

    await page.evaluate(() => window.__gameSession.dispose());
    assert.notEqual(await page.locator('#sheld').evaluate(el => getComputedStyle(el).display), 'none');
    assert.equal(await page.locator('#chat').evaluate(el => el.parentElement.id), 'sheld');
    assert.equal(await page.locator('#send_form').evaluate(el => el.parentElement.id), 'form_sheld');
    assert.equal(await page.locator('#atria-game-full-root').count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
}

async function runMobileHybrid(browser) {
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await boot(page);

    await page.evaluate(async () => {
        const html = `
            <section id="mobile-hybrid-shell">
                <div class="hud">Mobile HUD</div>
                <div data-atria-native-component="conversation"></div>
                <div data-atria-native-component="composer"></div>
            </section>
        `;
        const worldSession = {
            getState: () => ({}),
            dispatchCommandInternal: async () => ({ status: 'committed' }),
            simulateCommandInternal: async () => ({ status: 'simulated' }),
        };
        window.__gameSession = await window.__activateGamePackageUi({
            charId: 'hero',
            manifest: {
                id: 'r4.mobile.hybrid',
                ui: {
                    mode: 'hybrid',
                    entry: 'ui/game.html',
                    surface: 'app.root',
                },
            },
        }, worldSession, {
            document,
            window,
            fetchImpl: async () => ({
                ok: true,
                status: 200,
                async text() { return html; },
            }),
        });
    });

    assert.equal(await page.locator('#mobile-hybrid-shell').count(), 1);
    assert.notEqual(await page.locator('#sheld').evaluate(el => getComputedStyle(el).display), 'none');
    assert.equal(await page.locator('#chat').evaluate(el => el.parentElement.hasAttribute('data-atria-native-component')), true);
    assert.equal(await page.locator('#send_form').evaluate(el => el.parentElement.hasAttribute('data-atria-native-component')), true);
    assert.equal(await page.locator('.atria-game-package-hybrid').getAttribute('data-atria-game-device'), 'mobile');
    assert.equal(await page.locator('.atria-game-package-hybrid').getAttribute('data-atria-game-orientation'), 'portrait');
    assert.equal(await page.locator('.atria-game-package-hybrid').getAttribute('data-atria-game-touch'), 'true');
    assert.equal(await page.locator('#atria-game-full-recovery').count(), 0);

    await page.evaluate(() => window.__gameSession.dispose());
    assert.equal(await page.locator('#chat').evaluate(el => el.parentElement.id), 'sheld');
    assert.equal(await page.locator('#send_form').evaluate(el => el.parentElement.id), 'form_sheld');
    assert.deepEqual(errors, []);
    await context.close();
}

let browser;
try {
    browser = await chromium.launch({ headless: true });
    await runDesktopFull(browser);
    await runMobileHybrid(browser);
    console.log('game runtime R4 desktop/mobile smoke: ok');
} finally {
    await browser?.close();
    await new Promise(resolveClose => server.close(resolveClose));
}
