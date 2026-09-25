import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FsEngine } from '../../../src/storage/engines/fs-engine.js';
import { seedGenerationProfiles } from '../../native/helpers/generation-fixture.js';
import { startServer, tearDownServer } from '../_lib/server.js';
import { awaitMainUI } from '../_lib/page.js';
import { seedNativeSessionDataRoot, createAndOpenNativeSession, openNativeSession } from './_helpers.js';

let server; let provider; let seeded; let profiles;
test.describe.configure({ mode: 'serial' });
if (process.env.PW_NATIVE_CHANNEL) test.use({ channel: process.env.PW_NATIVE_CHANNEL });

test.beforeAll(async () => {
    provider = createServer(async (req, res) => {
        let body = ''; for await (const bytes of req) body += bytes;
        const input = JSON.parse(body);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ choices: [{ message: { content: input.messages.map(item => item.content).join('\n') } }] }));
    });
    await new Promise(done => provider.listen(0, '127.0.0.1', done));
    seeded = await seedNativeSessionDataRoot({ suffix: 'npc-001' });
    const root = resolve(seeded.dataRoot, seeded.handle);
    const engine = new FsEngine({ directoriesByHandle: () => ({ root, assets: resolve(root, 'assets') }) });
    profiles = await seedGenerationProfiles({ engine, handle: seeded.handle, endpoint: `http://127.0.0.1:${provider.address().port}/v1/chat/completions` });
    const module = { ...profiles.module, revision: 'controls', body: 'Style={{param.mode}} Grounding={{param.grounded}}' };
    await profiles.library.commit(seeded.handle, 'core.prompt-module', module);
    const prompt = { ...profiles.prompt, revision: 'controls', parameters: {
        mode: { type: 'string', label: 'Writing style', default: 'calm', options: [{ value: 'calm', label: 'Calm prose' }, { value: 'quick', label: 'Quick prose' }] },
        grounded: { type: 'boolean', label: 'Knowledge grounding', default: true },
    }, stages: [{ stageId: 'stage.main', moduleRefs: [{ ...profiles.prompt.stages[0].moduleRefs[0], revision: 'controls' }] }] };
    await profiles.library.commit(seeded.handle, 'core.prompt-program', prompt);
    await profiles.persistence.saveRuntimeRoute(seeded.handle, { ...profiles.routes[0], promptProgramRef: { ...profiles.routes[0].promptProgramRef, revision: 'controls' } });
    await engine.close();
    writeFileSync(resolve(root, 'secrets.json'), JSON.stringify({ api_key_custom: [{ id: 'p4-synthetic-key', value: 'npc-test-only', active: true, label: 'NPC test' }], _migrated: true }));
    server = await startServer({ batchKey: 'generation', scenarioId: 'npc-001', useExistingDataRoot: seeded.dataRoot });
});

test.afterAll(async () => {
    await tearDownServer(server);
    await new Promise(done => { provider?.closeAllConnections(); provider?.close(done); });
});

for (const width of [1440, 390]) {
    const closeInspector = width < 600 ? '.atria-sheet-close' : '.atria-dock__close';

    test(`Prompt choices persist and reach preview and Play at ${width}px`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 960 });
        await page.addInitScript(() => localStorage.setItem('language', 'en'));
        await awaitMainUI(page, server.baseURL);
        const session = await createAndOpenNativeSession(page, seeded.start);
        await page.getByRole('button', { name: 'Prompt choices', exact: true }).click();
        const controls = page.locator('.atri-prompt-runtime-controls');
        await expect(controls.getByRole('button', { name: 'Restore Prompt defaults' })).toBeVisible();
        await controls.getByRole('button', { name: 'Restore Prompt defaults' }).click();
        await expect(controls).toContainText('Prompt choices saved.');
        await controls.getByRole('checkbox', { name: 'Override default', exact: true }).nth(0).check();
        await controls.getByRole('combobox', { name: 'Writing style', exact: true }).selectOption({ label: 'Quick prose' });
        await controls.getByRole('checkbox', { name: 'Override default', exact: true }).nth(1).check();
        await controls.getByRole('checkbox', { name: 'Knowledge grounding', exact: true }).uncheck();
        const saved = page.waitForResponse(response => response.url().includes('/prompt-controls/') && response.request().method() === 'PUT');
        await controls.getByRole('button', { name: 'Save Prompt choices' }).click();
        expect((await saved).status()).toBe(200);
        await page.screenshot({ path: info.outputPath(`prompt-controls-${width}.png`), fullPage: true });
        const bounds = await controls.boundingBox(); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
        await awaitMainUI(page, server.baseURL);
        await openNativeSession(page, session.sessionId);
        await page.getByRole('button', { name: 'Prompt choices', exact: true }).click();
        await expect(controls.getByRole('combobox', { name: 'Writing style', exact: true })).toHaveValue('1');
        await expect(controls.getByRole('checkbox', { name: 'Knowledge grounding', exact: true })).not.toBeChecked();
        await page.locator(closeInspector).click();
        // Navigate through the Shell's stable product route, then operate the real Diagnostics form.
        await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openRuntimeSection('diagnostics'));
        const diagnostics = page.locator('[data-atria-runtime-native="diagnostics"]');
        await diagnostics.getByRole('combobox', { name: 'Route to preview', exact: true }).selectOption(profiles.routes[0].runtimeRouteId);
        const previewResponse = page.waitForResponse(response => response.url().endsWith('/generation/preview'), { timeout: 15000 });
        await diagnostics.getByRole('button', { name: 'Compile preview', exact: true }).click({ timeout: 15000 });
        const preview = await (await previewResponse).json();
        expect(preview.snapshot.promptIr.compilation.parameters).toEqual({ mode: 'quick', grounded: false });
        await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openPlay());
        const composer = page.locator('[data-atria-composer="native"]');
        await composer.getByRole('textbox', { name: 'Message', exact: true }).fill('Check selected Prompt controls.');
        const executed = page.waitForResponse(response => response.url().endsWith('/generation/execute'));
        await composer.getByRole('button', { name: 'Send', exact: true }).click();
        const response = await executed; expect(response.status()).toBe(200);
        const evidence = await page.evaluate(async () => (await import('/scripts/native/runtime-client.js')).getRuntimeEvidence());
        expect(evidence.snapshot.promptIr.compilation.parameters).toEqual(preview.snapshot.promptIr.compilation.parameters);
    });
}
