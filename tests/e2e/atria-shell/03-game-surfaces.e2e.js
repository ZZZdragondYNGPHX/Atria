
import { test, expect } from '@playwright/test';
import { startServer, tearDownServer } from '../_lib/server.js';
import { seedNativeSessionDataRoot, createAndOpenNativeSession } from '../native-session/_helpers.js';

let server; let seeded;
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
    seeded = await seedNativeSessionDataRoot({ suffix: 'game-host-redesign' });

    server = await startServer({ batchKey: 'regression', scenarioId: 'game-host-redesign', useExistingDataRoot: seeded.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server); });

async function open(page, width) {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.goto(server.baseURL);
    await page.waitForFunction(() => performance.getEntriesByName('[init] complete').length > 0);
    await createAndOpenNativeSession(page, seeded.start);
    await page.evaluate(() => {
        const host = window.Atria.shell.getPlayHost();
        window.gameRefs = { ...host.native, conversation: host.product.getComponent('conversation'), composer: host.product.getComponent('composer') };
        window.gameCalls = { stop: 0, exit: 0 };
    });
}
async function integrity(page) {
    expect(await page.evaluate(() => {
        const host = window.Atria.shell.getPlayHost();
        return host.assertIntegrity() && Object.entries(host.native).every(([key, value]) => value === window.gameRefs[key])
            && host.product.getComponent('conversation') === window.gameRefs.conversation
            && host.product.getComponent('composer') === window.gameRefs.composer
            && document.querySelectorAll('#sheld').length === 1
            && document.querySelectorAll('#chat').length === 1
            && document.querySelectorAll('#send_form').length === 1
            && document.querySelectorAll('#send_textarea').length === 1;
    })).toBe(true);
}
async function activate(page, mode, broken = false) {
    return page.evaluate(async ({ mode, broken }) => {
        const { activateNativeExperienceRuntime } = await import('/scripts/native/experience/ui/live.js');
        const native = window.Atria.nativeSessionRuntime.snapshot;
        const component = mode === 'component'
            ? { id: 'hud', type: 'text', props: { text: 'Harbour · Tide rising' } }
            : { id: 'game-root', type: 'container', children: [
                { id: 'title', type: 'text', props: { text: 'The harbour crossing' } },
                { id: 'conversation-slot', type: 'native-slot', props: { component: broken ? 'unknown' : 'conversation' } },
                { id: 'composer-slot', type: 'native-slot', props: { component: 'composer' } },
            ] };
        const state = { sessionId: native.session.sessionId,
            descriptor: { packageId: native.session.packageId, packageVersionId: native.session.packageVersionId,
                entryPointId: native.session.entryPointId, experience: { mode, componentModelVersion: 1 } },
            runtime: { experience: { mode, componentModelVersion: 1, component: 'ui/main.json', surface: mode === 'component' ? 'chat.header' : 'app.root' } },
        };
        try {
            window.gameExperience = await activateNativeExperienceRuntime(state, {
                getState: () => ({ tide: 'rising' }),
                dispatchCommandInternal: async () => ({ status: 'committed' }),
                simulateCommandInternal: async () => ({ status: 'simulated' }),
            }, { document, window, shell: window.Atria.shell,
                fetchImpl: async () => ({ ok: true, status: 200, json: async () => component }),
                hostActions: { exitExperience: () => { window.gameCalls.exit++; }, stopGeneration: () => { window.gameCalls.stop++; } },
            });
            return '';
        } catch (error) { return error.message; }
    }, { mode, broken });
}
async function dispose(page) {
    await page.evaluate(async () => { await window.gameExperience?.dispose(); window.gameExperience = null; });
}
for (const width of [1440, 390]) {
    test(`Native Component, Hybrid, Full and failure recovery at ${width}px`, async ({ page }, info) => {
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await open(page, width);
        await integrity(page);
        expect(await activate(page, 'component')).toBe('');
        await expect(page.locator('[data-atria-product-surface="chat.header"]')).toContainText('Tide rising');
        await integrity(page);
        await dispose(page);
        expect(await activate(page, 'hybrid')).toBe('');
        await expect(page.locator('[data-atria-component-id="conversation-slot"] [data-atria-conversation]')).toBeVisible();
        await expect(page.locator('[data-atria-component-id="composer-slot"] [data-atria-composer]')).toBeVisible();
        expect(await page.evaluate(() => window.Atria.shell.getPlayHost().getStageOwner())).toBe('game-runtime:hybrid');
        await integrity(page);
        await page.evaluate(() => window.Atria.immersive.setEnabled(true, { useFullscreen: false, persist: false, syncNative: false }));
        await integrity(page);
        await page.evaluate(() => window.Atria.immersive.setEnabled(false, { useFullscreen: false, persist: false, syncNative: false }));
        await page.screenshot({ path: info.outputPath(`hybrid-${width}.png`) });
        await dispose(page);
        await integrity(page);
        expect(await activate(page, 'full')).toBe('');
        expect(await page.evaluate(() => {
            const shell = window.Atria.shell.getShell();
            const root = document.getElementById('atria-game-full-root');
            const recovery = document.getElementById('atria-game-full-recovery');
            return shell.slots.stage.contains(root) && shell.slots.recovery.contains(recovery) && !root.contains(recovery);
        })).toBe(true);
        await page.locator('.atria-game-recovery-panel summary').click();
        await page.getByRole('button', { name: 'Stop generation', exact: true }).click();
        expect(await page.evaluate(() => window.gameCalls.stop)).toBe(1);
        await page.keyboard.press('Escape');
        expect(await page.evaluate(() => window.gameCalls.exit)).toBe(0);
        await page.evaluate(() => window.Atria.shell.getShell().openCommand());
        await expect(page.locator('.atria-command-surface')).toBeVisible();
        await page.keyboard.press('Escape');
        expect(await page.evaluate(() => window.gameCalls.exit)).toBe(0);
        await page.screenshot({ path: info.outputPath(`full-${width}.png`) });
        await integrity(page);
        await dispose(page);
        expect(await activate(page, 'full', true)).toMatch(/native|component/i);
        expect(await page.evaluate(() => window.Atria.shell.getPlayHost().getStageOwner())).toBeNull();
        await expect(page.locator('#atria-game-full-root')).toHaveCount(0);
        await expect(page.locator('#atria-game-full-recovery')).toHaveCount(0);
        await integrity(page);
        expect(errors).toEqual([]);
    });
}
