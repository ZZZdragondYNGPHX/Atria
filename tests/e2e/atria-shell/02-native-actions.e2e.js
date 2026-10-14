import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { FsEngine } from '../../../src/storage/engines/fs-engine.js';
import { seedGenerationProfiles } from '../../native/helpers/generation-fixture.js';
import { CredentialTargetAuthority } from '../../../src/native/model-prompt-runtime/credential-targets.js';

import { awaitMainUI } from '../_lib/page.js';
import { startServer, tearDownServer } from '../_lib/server.js';
import { seedNativeSessionDataRoot, createAndOpenNativeSession, snapshotLegacyPersistence, disableNarrativeSkills } from '../native-session/_helpers.js';

// N10 retired editable legacy messages/swipes. Protect their Native equivalents
// through real generation and immutable Session operations, keeping the ABI unique.
let server, provider, seeded, legacy;
let reply = 0;
test.describe.configure({ mode: 'serial' });
test.use({ actionTimeout: 12000 });

test.beforeAll(async () => {
    provider = createServer(async (req, res) => {
        let body = ''; for await (const chunk of req) body += chunk;
        const input = JSON.parse(body);
        const message = input.messages?.filter(item => item.role === 'user').at(-1)?.content || '';
        const chunk = content => 'data: ' + JSON.stringify({ choices: [{ delta: { content } }] }) + '\n\n';
        res.setHeader('Content-Type', 'text/event-stream');
        if (String(message).includes('Wait at the gate')) {
            res.write(chunk('Uncommitted harbour draft'));
            const timer = setTimeout(() => res.end(chunk(' late result') + 'data: [DONE]\n\n'), 30000);
            res.on('close', () => clearTimeout(timer));
        } else res.end(chunk(`Harbour reply ${++reply}. The keeper raises the lantern.`) + 'data: [DONE]\n\n');
    });
    await new Promise(done => provider.listen(0, '127.0.0.1', done));
    seeded = await seedNativeSessionDataRoot({ suffix: 'phase8-action-continuity' });
    const root = resolve(seeded.dataRoot, seeded.handle);
    const engine = new FsEngine({ directoriesByHandle: () => ({ root, assets: resolve(root, 'assets') }) });
    const profiles = await seedGenerationProfiles({ engine, handle: seeded.handle, endpoint: `http://127.0.0.1:${provider.address().port}/v1/chat/completions`, roles: ['narrator'], streaming: true });
    // Explicitly authorize only this test-owned loopback provider. Production
    // generation continues to require the user's exact destination approval.
    const authority = new CredentialTargetAuthority({ persistence: profiles.persistence });
    const target = await authority.inspect(seeded.handle, { connectionProfileId: profiles.connection.connectionProfileId });
    await authority.authorize(seeded.handle, { connectionProfileId: profiles.connection.connectionProfileId,
        expectedFingerprint: target.connectionFingerprint, expectedTargetFingerprint: target.targetFingerprint,
        expectedPermitFingerprint: target.permitFingerprint, allowLocal: true });
    await engine.close();
    writeFileSync(resolve(root, 'secrets.json'), JSON.stringify({ api_key_custom: [{ id: 'p4-synthetic-key', value: 'phase8-test-only', active: true, label: 'Synthetic fixture' }], _migrated: true }));

    server = await startServer({ batchKey: 'generation', scenarioId: 'phase8-actions', useExistingDataRoot: seeded.dataRoot });
    legacy = snapshotLegacyPersistence(seeded.dataRoot);
});

test.afterAll(async () => {
    await tearDownServer(server, { removeData: false });
    await new Promise(done => { provider?.closeAllConnections(); provider?.close(done); });
});

async function boot(page) {
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/**', route => route.fulfill({ json: [] }));
    await awaitMainUI(page, server.baseURL);
    await disableNarrativeSkills(page);
    await createAndOpenNativeSession(page, seeded.start);
}
async function stable(page) {
    expect(await page.evaluate(() => ({
        chat: document.querySelectorAll('#chat').length,
        sendForm: document.querySelectorAll('#send_form').length,
        textarea: document.querySelectorAll('#send_textarea').length,
        parent: document.getElementById('sheld').parentElement.id,
        native: document.querySelectorAll('[data-atria-composer="native"]').length,
    }))).toEqual({ chat: 1, sendForm: 1, textarea: 1, parent: 'atria-native-play-host', native: 1 });
    expect(snapshotLegacyPersistence(seeded.dataRoot)).toEqual(legacy);
}
async function more(page, label) {
    const toolbar = page.locator('[data-atria-native-play-actions]');
    await toolbar.locator('summary').click();
    await toolbar.getByRole('button', { name: label, exact: true }).click();
}
async function send(page, text) {
    const nextReply = reply + 1;
    const composer = page.locator('[data-atria-composer="native"]');
    await composer.getByRole('textbox', { name: 'Message', exact: true }).fill(text);
    await composer.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.locator('[data-atria-conversation="native"]')).toContainText(`Harbour reply ${nextReply}`);
    await expect(composer.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
}

test('Native send, reading return, exact saves and reload preserve immutable history and one ABI', async ({ page }) => {
    await boot(page);
    await send(page, 'Read the harbour chart.');
    const original = await page.evaluate(() => structuredClone(window.Atria.nativeSessionRuntime.snapshot));
    const input = page.locator('[data-atria-composer="native"] textarea');
    await input.fill('An unsent thought');
    await page.getByRole('button', { name: 'Recent stories', exact: true }).click();
    await expect(page.locator('[data-atria-native-play-landing]')).toBeVisible();
    await page.getByRole('button', { name: 'Return to reading', exact: true }).click();
    await expect(input).toHaveValue('An unsent thought');
    await input.fill('');
    await more(page, 'Quick Save');
    await expect(page.locator('.atria-native-play-actions__status')).toContainText('Saved');
    await send(page, 'Read the northern chart instead.');
    await page.getByRole('button', { name: 'History & saves', exact: true }).click();
    const drawer = page.locator('[data-atria-native-play-drawer]');
    await expect(drawer.locator('[data-atria-save-id]')).toHaveCount(1);
    await drawer.locator('[data-atria-save-id]').getByRole('button', { name: 'Load', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.Atria.nativeSessionRuntime.snapshot.timeline.length)).toBe(original.timeline.length);
    expect(await page.evaluate(() => window.Atria.nativeSessionRuntime.snapshot.timeline)).toEqual(original.timeline);
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await page.reload();
    await expect(page.locator('[data-atria-conversation="native"]')).toContainText('Read the harbour chart.');
    await expect(input).toHaveValue('');
    const history = await page.evaluate(async original => {
        const response = await fetch('/api/native/session/load', { method: 'POST', headers: window.Atria.getContext().getRequestHeaders(), body: JSON.stringify({ sessionId: original.session.sessionId, revisionId: original.revision.revisionId }) });
        if (!response.ok) throw new Error(await response.text());
        return response.json();
    }, original);
    expect(history.timeline).toEqual(original.timeline);
    await stable(page);
});

test('Stop drops the draft and the same Native composer can send after navigation', async ({ page }) => {
    await boot(page);
    const composer = page.locator('[data-atria-composer="native"]');
    await composer.getByRole('textbox', { name: 'Message', exact: true }).fill('Wait at the gate');
    await composer.getByRole('button', { name: 'Send', exact: true }).click();
    const draft = page.locator('[data-atria-generation-projection]');
    await expect(draft).toBeVisible();
    await expect(draft).toContainText('Uncommitted harbour draft');
    await composer.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(draft).toBeHidden();
    expect(await page.evaluate(() => window.Atria.nativeSessionRuntime.snapshot.timeline.some(item => item.content.includes('Uncommitted harbour draft')))).toBe(false);
    await page.evaluate(async () => { const host = window.Atria.shell.getWorkspaceHost(); await host.openUtility('settings'); await host.openPlay(); });
    const before = reply;
    await send(page, 'The gate is open now.');
    await expect(page.locator('[data-atria-conversation="native"]')).toContainText(`Harbour reply ${before + 1}`);
    await stable(page);
});

test('Stop during preparation preserves unaccepted input and issued input commits report acceptance', async ({ page }) => {
    await boot(page);
    const composer = page.locator('[data-atria-composer="native"]');
    const input = composer.getByRole('textbox', { name: 'Message', exact: true });
    for (const phase of ['prepare', 'input']) {
        let release, reached;
        const committed = new Promise(resolve => { reached = resolve; });
        const resume = new Promise(resolve => { release = resolve; });
        await page.route('**/api/native/session/command', async route => {
            const commands = route.request().postDataJSON().command?.commands;
            if (Array.isArray(commands) && (phase === 'prepare' ? commands.length === 0 : commands.some(item => item.type === 'append'))) {
                const response = await route.fetch(); reached(); await resume; await route.fulfill({ response });
            } else await route.continue();
        });
        const before = await page.evaluate(phase => {
            const runtime = window.Atria.nativeSessionRuntime;
            if (phase === 'prepare') runtime.stageState('atri_serene_test', { boundary: 'already-issued' });
            return structuredClone(runtime.snapshot);
        }, phase);
        const text = phase === 'prepare' ? 'Unaccepted harbour thought' : 'Accepted harbour thought';
        await input.fill(text);
        await composer.getByRole('button', { name: 'Send', exact: true }).click();
        await committed;
        await composer.getByRole('button', { name: 'Stop', exact: true }).click();
        await expect(composer.getByRole('button', { name: 'Stop', exact: true })).toBeDisabled();
        await expect(composer).toContainText('Stopping…');
        release();
        await expect(composer.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
        await expect(input).toHaveValue(phase === 'prepare' ? text : '');
        const after = await page.evaluate(() => structuredClone(window.Atria.nativeSessionRuntime.snapshot));
        expect(after.revision.revisionId).not.toBe(before.revision.revisionId);
        expect(after.timeline.filter(item => item.content === text)).toHaveLength(phase === 'prepare' ? 0 : 1);
        if (phase === 'prepare') expect(after.states.atri_serene_test).toEqual({ boundary: 'already-issued' });
        await page.unroute('**/api/native/session/command');
    }
    await send(page, 'Continue after stopping.');
    await stable(page);
});

test('paper overlays remain interruptible and responsive at desktop, medium and phone widths', async ({ page }) => {
    await boot(page);
    const evidence = resolve('..', 'tests/.e2e-scratch/serene-visual'); mkdirSync(evidence, { recursive: true });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const complete = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
    await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame', transferMode: 'ReturnAsStream' });
    const settled = () => page.locator('.atria-shell-menu').evaluate(async root => {
        await Promise.all(root.getAnimations({ subtree: true }).filter(animation => Number.isFinite(animation.effect.getComputedTiming().iterations)).map(animation => animation.finished.catch(() => {})));
    });
    for (const width of [1440, 900, 390, 320]) {
        await page.setViewportSize({ width, height: width > 900 ? 900 : 844 });
        await page.getByRole('button', { name: 'Account', exact: true }).click();
        await settled();
        await expect(page.getByRole('menuitem', { name: 'Settings', exact: true })).toBeVisible();
        expect(await page.locator('#atria-app-shell > main').evaluate(root => root.inert)).toBe(true);
        await page.screenshot({ path: resolve(evidence, 'account-' + width + '.png') });
        await page.getByRole('button', { name: 'Close menu', exact: true }).click({ position: { x: 4, y: 4 } });
        await page.getByRole('button', { name: 'Account', exact: true }).click();
        await page.getByRole('button', { name: 'Close menu', exact: true }).click({ position: { x: 4, y: 4 } });
        await page.getByRole('button', { name: 'Account', exact: true }).click();
        await settled();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('menuitem', { name: 'Settings', exact: true })).toBeHidden();
        expect(await page.locator('#atria-app-shell > main').evaluate(root => root.inert)).toBe(false);
    }
    await cdp.send('Tracing.end');
    const { stream } = await complete; let raw = '';
    for (;;) { const part = await cdp.send('IO.read', { handle: stream }); raw += part.data; if (part.eof) break; }
    await cdp.send('IO.close', { handle: stream });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    writeFileSync(resolve(evidence, 'paper-trace.json'), raw);
    const events = JSON.parse(raw).traceEvents;
    const timed = events.filter(event => event.dur && ['RunTask', 'EventDispatch', 'Layout', 'Paint', 'UpdateLayoutTree'].includes(event.name));
    const report = { cpuThrottle: 4, widths: [1440, 900, 390, 320], drawFrames: events.filter(event => event.name === 'DrawFrame').length,
        droppedFrames: events.filter(event => event.name === 'DroppedFrame').length,
        longestEvents: timed.sort((a, b) => b.dur - a.dur).slice(0, 20).map(event => ({ name: event.name, durationMs: event.dur / 1000 })) };
    writeFileSync(resolve(evidence, 'paper-performance.json'), JSON.stringify(report, null, 2));
    console.log('SERENE_PAPER_PERFORMANCE', JSON.stringify(report));
    await stable(page);
});

test('phone Context Sheet has keyboard alternatives, interruptible touch release and reduced motion', async ({ page }) => {
    await boot(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'History & saves', exact: true }).click();
    const sheet = page.locator('#atria-context-sheet');
    await expect(sheet).toBeVisible();
    const grip = sheet.getByRole('button', { name: 'Resize sheet', exact: true });
    await grip.press('ArrowUp'); await expect(sheet).toHaveAttribute('data-atria-sheet-state', 'full');
    await grip.press('ArrowDown'); await expect(sheet).toHaveAttribute('data-atria-sheet-state', 'half');
    const cdp = await page.context().newCDPSession(page);
    const box = await grip.boundingBox();
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, y: point.y + 32 }] });
    expect(await sheet.locator('.atria-sheet-body').evaluate(root => root.inert)).toBe(true);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect(sheet).toBeVisible();
    expect(await sheet.locator('.atria-sheet-body').evaluate(root => root.inert)).toBe(false);
    await grip.press('Enter'); await expect(sheet).toHaveAttribute('data-atria-sheet-state', 'full');
    await page.keyboard.press('Escape'); await expect(sheet).toBeHidden();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'History & saves', exact: true }).click();
    await expect(sheet).toBeVisible();
    expect(await sheet.locator('.atria-sheet-panel').evaluate(root => root.getAnimations().every(animation => animation.effect.getKeyframes().every(frame => frame.transform === 'none' || frame.transform === undefined)))).toBe(true);
    await page.keyboard.press('Escape'); await expect(sheet).toBeHidden();
    await stable(page);
});
