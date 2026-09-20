import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const publicRoot = resolve(fileURLToPath(new URL('../../public', import.meta.url)));
const mime = {
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.html': 'text/html',
};

const server = createServer(async (req, res) => {
    try {
        if (req.url === '/') {
            res.setHeader('Content-Type', 'text/html');
            res.end('<!doctype html><html><head><link rel="stylesheet" href="/css/immersive.css"></head><body></body></html>');
            return;
        }
        const pathname = new URL(req.url, 'http://localhost').pathname;
        const target = resolve(publicRoot, `.${pathname}`);
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
            <button id="immersive_mode_toggle"><i id="immersiveModeIcon"></i><span id="immersiveModeLabel"></span></button>
            <button id="immersiveExitButton">Exit</button>
            <button id="options_button">Tools</button>
            <button id="send_but">Send</button>
            <button id="mes_stop">Stop</button>
            <button id="option_continue">Continue</button>
            <button id="option_regenerate">Regenerate</button>
            <button id="server_logs_button">Diagnostics</button>
            <div id="thirdPartyPanel">Third-party control</div>
            <main id="sheld">
                <div id="chat">
                    <div class="mes" mesid="0" ch_name="User" is_user="true" is_system="false">
                        <div class="mesAvatarWrapper"><div class="avatar"><img src="img/user-default.png"></div></div>
                        <div class="mes_block"><span class="name_text">User</span><div class="mes_text">Hello</div><div class="mes_buttons"><button class="mes_copy">Copy native</button><button class="mes_edit">Edit native</button></div><div class="swipes-counter">1 / 1</div></div>
                    </div>
                    <div class="mes last_mes" mesid="1" ch_name="Alice" is_user="false" is_system="false">
                        <div class="mesAvatarWrapper"><div class="avatar"><img src="characters/alice.png"></div></div>
                        <div class="mes_block"><span class="name_text">Alice</span><div class="mes_text">A reply</div><div class="mes_buttons"><button class="mes_copy">Copy native</button><button class="mes_edit">Edit native</button></div><div class="swipes-counter">2 / 4</div></div>
                    </div>
                </div>
                <div id="send_form"><div id="nonQRFormItems"><div id="leftSendForm"></div><textarea id="send_textarea"></textarea><div id="rightSendForm"></div></div></div>
            </main>
        `;

        const handlers = new Map();
        const bus = {
            on(type, handler) {
                if (!handlers.has(type)) handlers.set(type, new Set());
                handlers.get(type).add(handler);
            },
            off(type, handler) {
                handlers.get(type)?.delete(handler);
            },
            emit(type, ...args) {
                for (const handler of handlers.get(type) || []) handler(...args);
            },
        };
        const eventTypes = {
            GENERATION_STARTED: 'generation_started',
            GENERATION_STOPPED: 'generation_stopped',
            GENERATION_ENDED: 'generation_ended',
            MESSAGE_SENT: 'message_sent',
            MESSAGE_RECEIVED: 'message_received',
            MESSAGE_EDITED: 'message_edited',
            MESSAGE_UPDATED: 'message_updated',
            MESSAGE_DELETED: 'message_deleted',
            MESSAGE_SWIPED: 'message_swiped',
            MORE_MESSAGES_LOADED: 'more_messages_loaded',
            USER_MESSAGE_RENDERED: 'user_message_rendered',
            CHARACTER_MESSAGE_RENDERED: 'character_message_rendered',
            CHAT_CHANGED: 'chat_changed',
            CHAT_LOADED: 'chat_loaded',
        };

        window.__immersiveHost = { tools: 0, send: 0, stop: 0, continue: 0, rewrite: 0, diagnostics: 0, copy: 0, edit: 0, provider: 0 };
        document.querySelector('.last_mes .mes_copy').addEventListener('click', () => window.__immersiveHost.copy++);
        document.querySelector('.last_mes .mes_edit').addEventListener('click', () => window.__immersiveHost.edit++);

        const { createImmersiveController } = await import('/scripts/immersive/controller.js');
        const settings = {
            immersive_mode_remember_state: true,
            immersive_mode_story_focus: true,
            immersive_mode_extensions_enabled: true,
            immersive_mode_visual_mode: 'auto',
            immersive_mode_hud_mode: 'auto',
            reduced_motion: false,
        };
        const controller = createImmersiveController({
            document,
            window,
            getSettings: () => settings,
            saveSettings: () => {},
            isMobile: () => window.innerWidth <= 800,
            eventSource: bus,
            eventTypes,
            hostActions: {
                openTools: () => window.__immersiveHost.tools++,
                send: () => window.__immersiveHost.send++,
                stop: () => window.__immersiveHost.stop++,
                continue: () => window.__immersiveHost.continue++,
                rewrite: () => window.__immersiveHost.rewrite++,
                openDiagnostics: () => window.__immersiveHost.diagnostics++,
            },
        });
        window.__immersiveController = controller;
        window.__immersiveBus = bus;

        await controller.setEnabled(true, { useFullscreen: false });
        controller.registerProvider({
            id: 'smoke',
            priority: 100,
            scene: { id: 'room', background: 'scene.jpg' },
            visual: { portrait: 'portrait.png', accent: '#aabbcc' },
            hud: {
                primary: [{ label: 'Scene', value: 'Room' }, { label: 'Overflow', value: 'Hidden' }],
                secondary: ['Night', 'Quiet', 'Overflow'],
                ambient: ['Rain', 'Cold', 'Wind'],
                details: [{ label: 'Quest', value: 'Stay alert' }],
            },
            actions: [{ id: 'inspect', label: 'Inspect', run: () => window.__immersiveHost.provider++ }],
        });
        await controller.refreshProviders();
    });
}

async function runDesktop(browser) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await boot(page);

    assert.equal(await page.evaluate(() => document.body.dataset.atriaImmersiveProfile), 'desktop');
    assert.equal(await page.locator('#chat > .mes').count(), 2);
    assert.equal(await page.locator('#send_textarea').count(), 1);
    assert.equal(await page.locator('#thirdPartyPanel').count(), 1);
    assert.equal(await page.locator('#atriaImmersiveStage').getAttribute('data-has-portrait'), 'true');
    assert.equal(await page.locator('.atria-immersive-hud-primary').count(), 1);
    assert.equal(await page.locator('.atria-immersive-hud-secondary').count(), 2);
    assert.equal(await page.locator('.atria-immersive-hud-ambient').count(), 2);
    assert.equal(await page.locator('.mes[aria-hidden="true"]').count(), 0);

    await page.evaluate(() => window.__immersiveBus.emit('generation_started', 'normal', {}, false));
    await page.getByRole('status').filter({ hasText: 'responding' }).waitFor();
    await page.locator('#atriaImmersiveStop').click();
    assert.equal(await page.evaluate(() => window.__immersiveHost.stop), 1);

    await page.evaluate(() => window.__immersiveBus.emit('generation_stopped'));
    await page.locator('#atriaImmersiveContinue').click();
    assert.equal(await page.evaluate(() => window.__immersiveHost.continue), 1);

    await page.locator('.last_mes .mes_block').focus();
    await page.keyboard.press('Enter');
    await page.locator('[data-action="edit"]').click();
    assert.equal(await page.evaluate(() => window.__immersiveHost.edit), 1);

    await page.locator('.last_mes .mes_block').focus();
    await page.keyboard.press('Enter');
    await page.locator('[data-action="rewrite"]').click();
    assert.equal(await page.evaluate(() => window.__immersiveHost.rewrite), 1);

    await page.getByRole('button', { name: 'Inspect' }).click();
    assert.equal(await page.evaluate(() => window.__immersiveHost.provider), 1);

    await page.evaluate(async () => {
        window.__immersiveController.registerProvider({
            id: 'broken',
            priority: 200,
            async getState() { throw new Error('provider failure'); },
        });
        await window.__immersiveController.refreshProviders();
    });
    assert.equal(await page.locator('#thirdPartyPanel').count(), 1);

    await page.evaluate(() => window.__immersiveController.reportGenerationFailure({ message: 'technical detail' }));
    await page.getByRole('button', { name: 'View reason' }).click();
    assert.equal(await page.evaluate(() => window.__immersiveHost.diagnostics), 1);
    assert.equal((await page.locator('#atriaImmersiveFailure').textContent()).includes('technical detail'), false);

    assert.deepEqual(errors, []);
    await context.close();
}

async function runMobile(browser) {
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await boot(page);

    assert.equal(await page.evaluate(() => document.body.dataset.atriaImmersiveProfile), 'mobile');
    assert.equal(await page.evaluate(() => document.body.dataset.atriaImmersiveAdaptation), 'portrait');
    assert.equal(await page.locator('#atriaImmersiveStage').evaluate(element => element.classList.contains('atria-immersive-reduced-motion')), true);
    const sendBox = await page.locator('#atriaImmersiveSend').boundingBox();
    assert.ok(sendBox && sendBox.height >= 40);
    assert.equal(await page.locator('.atria-immersive-hud-ambient-list').evaluate(element => getComputedStyle(element).display), 'none');

    await page.evaluate(() => window.__immersiveController.setEnabled(false, { useFullscreen: false }));
    assert.equal(await page.evaluate(() => document.body.classList.contains('atria-immersive-mode')), false);
    await context.close();
}

let browser;
try {
    browser = await chromium.launch({ headless: true });
    await runDesktop(browser);
    await runMobile(browser);
    console.log('immersive experience smoke: ok');
} finally {
    await browser?.close();
    await new Promise(resolveClose => server.close(resolveClose));
}
