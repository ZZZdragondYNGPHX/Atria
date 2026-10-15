import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { startServer, tearDownServer } from '../_lib/server.js';
import { markOnboarded } from '../_lib/fixtures.js';

let server;
test.setTimeout(45_000);

test.beforeAll(async () => {
    const dataRoot = resolve(import.meta.dirname, '../../.e2e-scratch', `edge-dock-${Date.now()}`);
    mkdirSync(dataRoot, { recursive: true });
    server = await startServer({ batchKey: 'regression', scenarioId: 'edge-dock', useExistingDataRoot: dataRoot });
    markOnboarded({ dataRoot });
});

test.afterAll(async () => { await tearDownServer(server); });

async function open(page) {
    await page.goto(server.baseURL);
    const gate = page.locator('#userList .userSelect');
    if (await gate.isVisible()) await gate.click();
    await page.locator('#atria-app-shell[data-atria-edge-dock=true]').waitFor();
    await expect(page.locator('.atria-edge-dock')).toHaveAttribute('data-state', 'hidden');
}
async function reveal(page) {
    await page.locator('.atria-edge-dock-reveal').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.atria-edge-dock')).toHaveAttribute('data-state', 'visible');
}
async function center(locator) {
    const bounds = await locator.boundingBox();
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}
async function touch(cdp, type, point) {
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: ['touchEnd', 'touchCancel'].includes(type) ? [] : [{ ...point, id: 1, radiusX: 5, radiusY: 5, force: 1 }] });
}
async function slide(page, cdp, node, end, { hold = false, cancel = false } = {}) {
    const start = await center(node);
    await touch(cdp, 'touchStart', start);
    // eslint-disable-next-line playwright/no-wait-for-timeout -- Exercise the real 450ms long-press threshold.
    if (hold) await page.waitForTimeout(500);
    for (let index = 1; index <= 12; index++) {
        await touch(cdp, 'touchMove', { x: start.x + (end.x - start.x) * index / 12, y: start.y + (end.y - start.y) * index / 12 });
        // eslint-disable-next-line playwright/no-wait-for-timeout -- Send a real touch trajectory with bounded release velocity.
        await page.waitForTimeout(16);
    }
    await touch(cdp, cancel ? 'touchCancel' : 'touchEnd', end);
}

test('desktop edges, rapid reversal, menu isolation, keyboard and real draft stay intact', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await open(page);
    await reveal(page);
    await page.locator('.atria-edge-dock [data-atria-domain=build]').click();
    await page.getByText('New Project', { exact: true }).click();
    const name = page.getByRole('textbox', { name: 'Project name', exact: true });
    await name.fill('Keep this project draft');
    const original = await name.boundingBox();
    await name.evaluate(node => { node.dataset.edgeDockIdentity = 'original'; });
    for (const [edge, key, point] of [
        ['left', 'ArrowLeft', { x: 2, y: 500 }],
        ['right', 'ArrowRight', { x: 1438, y: 500 }],
        ['bottom', 'ArrowDown', { x: 720, y: 998 }],
    ]) {
        await reveal(page);
        await page.locator('.atria-edge-dock-grip').press(key);
        await page.keyboard.press('Escape');
        await expect(page.locator('.atria-edge-dock')).toHaveAttribute('data-state', 'hidden');
        const bounds = await page.locator('.atria-edge-dock').boundingBox();
        expect(edge === 'left' ? bounds.x + bounds.width <= 0 : edge === 'right' ? bounds.x >= 1440 : bounds.y >= 1000).toBe(true);
        await page.mouse.move(point.x, point.y);
        await expect(page.locator('.atria-edge-dock')).toHaveAttribute('data-state', 'visible');
        await page.mouse.move(800, 180);
        // eslint-disable-next-line playwright/no-wait-for-timeout -- Reverse before the documented 600ms hide deadline.
        await page.waitForTimeout(250);
        await page.mouse.move(point.x, point.y);
        await expect(page.locator('.atria-edge-dock')).toHaveAttribute('data-state', 'visible');
        await page.mouse.move(800, 180);
        await expect(page.locator('.atria-edge-dock')).toHaveAttribute('data-state', 'hidden');
        await expect(name).toHaveValue('Keep this project draft');
        await expect(name).toHaveAttribute('data-edge-dock-identity', 'original');
        expect(await name.boundingBox()).toEqual(original);
    }
    await reveal(page);
    await page.locator('.atria-edge-dock .atria-toolbar__menu').click();
    // eslint-disable-next-line playwright/no-wait-for-timeout -- Prove an open menu survives past the hide deadline.
    await page.waitForTimeout(800);
    await expect(page.locator('.atria-edge-dock')).toHaveAttribute('data-state', 'visible');
    await expect(page.locator('.atria-edge-dock-viewport')).toHaveJSProperty('inert', true);
    await page.keyboard.press('End');
    await expect(page.locator('[role=menuitemradio][data-edge=bottom]')).toBeFocused();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.locator('.atria-edge-dock')).toHaveAttribute('data-state', 'hidden');
    await page.keyboard.press('Control+K');
    await page.locator('.atria-command-input').fill('Show navigation');
    await page.locator('[data-atria-command-id="navigation.reveal"]').click();
    await expect(page.locator('.atria-command-surface')).toBeHidden();
    await expect(page.locator('.atria-edge-dock')).toHaveAttribute('data-state', 'visible');
    await expect(page.locator('.atria-edge-dock [data-atria-domain=play]')).toBeFocused();
    expect(errors).toEqual([]);
});

test('mouse drag snaps and Escape cancels from the live pose', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await open(page); await reveal(page);
    let start = await center(page.locator('.atria-edge-dock-grip'));
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(880, 470, { steps: 16 });
    await expect(page.locator('.atria-edge-dock')).toHaveAttribute('data-state', 'dragging');
    await page.keyboard.press('Escape'); await page.mouse.up();
    await expect(page.locator('.atria-edge-dock')).toHaveAttribute('data-edge', 'left');
    start = await center(page.locator('.atria-edge-dock-grip'));
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(450, 870, { steps: 16 }); await page.mouse.up();
    await expect(page.locator('.atria-edge-dock')).toHaveAttribute('data-edge', 'bottom');
    await expect(page.locator('.atria-edge-dock')).toHaveAttribute('data-state', 'visible');
});

for (const width of [390, 320]) {
    test(`touch ${width}px: tap, long press, swipe, cancel, select, reduced motion and no scroll reveal`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
        const page = await context.newPage(), cdp = await context.newCDPSession(page);
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        try {
            await open(page);
            const handle = page.locator('.atria-edge-dock-handle'), dock = page.locator('.atria-edge-dock');
            await handle.tap(); await expect(dock).toHaveAttribute('data-state', 'visible');
            await page.locator('.atria-edge-dock .atria-toolbar__menu').tap();
            await page.locator('[data-atria-primary-shortcut=runtime]').tap();
            await expect(page).toHaveURL(/atriaRoute=runtime/);
            await expect(dock).toHaveAttribute('data-state', 'hidden');
            await slide(page, cdp, handle, { x: width - 12, y: 420 }, { hold: true });
            await expect(dock).toHaveAttribute('data-edge', 'right');
            await expect(dock).toHaveAttribute('data-state', 'visible');
            const grip = page.locator('.atria-edge-dock-grip');
            await grip.tap(); await expect(dock).toHaveAttribute('data-state', 'hidden');
            const start = await center(handle);
            await slide(page, cdp, handle, { x: start.x - 80, y: start.y });
            await expect(dock).toHaveAttribute('data-state', 'visible');
            await slide(page, cdp, grip, { x: 15, y: 450 }, { hold: true, cancel: true });
            await expect(dock).toHaveAttribute('data-edge', 'right');
            await expect(dock).toHaveAttribute('data-state', 'visible');
            await grip.tap(); await expect(dock).toHaveAttribute('data-state', 'hidden');
            await page.mouse.wheel(0, 350); await expect(dock).toHaveAttribute('data-state', 'hidden');
            await page.emulateMedia({ reducedMotion: 'reduce' });
            await handle.tap(); await expect(dock).toHaveAttribute('data-state', 'visible');
            await grip.tap(); await handle.tap(); await expect(dock).toHaveAttribute('data-state', 'visible');
            await page.locator('.atria-edge-dock .atria-toolbar__menu').tap();
            await page.locator('[role=menuitemradio][data-edge=bottom]').tap();
            await expect(dock).toHaveAttribute('data-edge', 'bottom');
            const bounds = await dock.boundingBox(); expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
            await dock.dispatchEvent('keydown', { key: 'Escape', isComposing: true });
            await expect(dock).toHaveAttribute('data-state', 'visible');
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            expect(errors).toEqual([]);
        } finally { await context.close(); }
    });
}
