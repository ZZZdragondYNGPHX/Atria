import { test, expect } from '@playwright/test';
import { startServer, tearDownServer } from '../_lib/server.js';
import { awaitMainUI } from '../_lib/page.js';
import { seedNativeSessionDataRoot } from './_helpers.js';
let server;

if (process.env.PW_NATIVE_CHANNEL) test.use({ channel: process.env.PW_NATIVE_CHANNEL });

test.beforeAll(async () => {
    const seed = await seedNativeSessionDataRoot({ suffix: 'knowledge-originals' });
    server = await startServer({ batchKey: 'generation', scenarioId: 'knowledge-originals', useExistingDataRoot: seed.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server); });

for (const width of [1440, 390]) test(`direct original Knowledge editing preserves World at ${width}px`, async ({ page }, info) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 960 });
    await page.addInitScript(() => { if (!localStorage.getItem('language')) localStorage.setItem('language', 'en'); });
    await awaitMainUI(page, server.baseURL);
    const source = await page.evaluate(async () => {
        const c = (await import('/scripts/native/product-client.js')).nativeProductClient;
        const work = (await c.listWorks())[0], session = await c.startWork(work.package.packageId);
        await window.Atria.openNativeSession(session.session.sessionId);
        const world = work.manifest.worlds[0], knowledge = work.manifest.knowledge[0];
        const base = { scope: 'package', packageId: work.package.packageId, packageVersionId: work.packageVersion.packageVersionId };
        const worldRef = { ...base, resourceType: 'core.world', resourceId: world.world.worldId, revision: world.revision.worldRevisionId };
        window.Atria.shell.getWorkspaceHost().openLibraryResource(worldRef);
        return { worldRef, knowledgeRef: { ...base, resourceType: 'core.knowledge', resourceId: knowledge.knowledgeBase.knowledgeBaseId, revision: knowledge.revision.knowledgeRevisionId }, states: session.states.atri_world_state, worlds: session.worlds, sessionId: session.session.sessionId };
    });
    const original = page.locator('[data-atria-package-original]');
    await expect(original).toContainText('Read-only original');
    await expect(original.getByRole('button', { name: 'Create editable copy', exact: true })).toBeVisible();
    await expect(original.getByRole('button', { name: 'Review Changes', exact: true })).toHaveCount(0);
    await page.evaluate(ref => window.Atria.shell.getWorkspaceHost().openLibraryResource(ref), source.knowledgeRef);
    await page.getByRole('button', { name: 'Add entry', exact: true }).click();
    await page.getByRole('textbox', { name: 'Entry title', exact: true }).fill('Edited original entry');
    await page.getByRole('textbox', { name: 'Entry content', exact: true }).fill('New original lore');
    await page.getByRole('button', { name: 'Review Changes', exact: true }).click();
    await page.getByRole('button', { name: 'Save Knowledge original', exact: true }).click();
    const row = page.locator('.atri-knowledge-entry-row').filter({ hasText: 'Edited original entry' });
    await expect(row).toBeVisible();
    await page.screenshot({ path: info.outputPath('editable-original.png') });
    const result = await page.evaluate(async source => {
        const c = (await import('/scripts/native/product-client.js')).nativeProductClient;
        const work = await c.getWork(source.worldRef.packageId);
        const active = (await import('/scripts/native/session-runtime.js')).nativeSessionRuntime.snapshot;
        return { work, active };
    }, source);
    expect(result.work.package.currentVersionId).not.toBe(source.worldRef.packageVersionId);
    expect(result.work.manifest.knowledge[0].entries.some(e => e.content === 'New original lore')).toBe(true);
    expect(result.active.states.atri_world_state).toEqual(source.states);
    expect(result.active.worlds).toEqual(source.worlds);
    expect(result.active.manifest.knowledge[0].entries.some(e => e.content === 'New original lore')).toBe(true);
    await row.getByRole('checkbox').uncheck();
    await page.getByRole('button', { name: 'Review Changes', exact: true }).click();
    await page.getByRole('button', { name: 'Save Knowledge original', exact: true }).click();
    await expect(row.getByRole('checkbox')).not.toBeChecked();
    await row.getByRole('button', { name: 'Delete entry', exact: true }).click();
    await page.locator('dialog[open] .popup-button-ok').click();
    await page.getByRole('button', { name: 'Review Changes', exact: true }).click();
    await page.getByRole('button', { name: 'Save Knowledge original', exact: true }).click();
    await expect(row).toHaveCount(0);
    await page.evaluate(() => localStorage.setItem('language', 'zh-cn'));
    await page.reload(); await awaitMainUI(page, server.baseURL);
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openLibrarySection('worlds'));
    await expect(page.locator('[data-atria-world-knowledge-nav]').getByRole('button', { name: '世界', exact: true })).toBeVisible();
    await expect(page.getByText('暂无世界', { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('worlds-zh-cn.png') });
});

test('preset editors never request or show another preset catalog', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await awaitMainUI(page, server.baseURL);
    const ids = await page.evaluate(async () => {
        const { runtimeRequest: request } = await import('/scripts/native/runtime-client.js');
        const { newPromptResource, resourceRef } = await import('/scripts/native/prompt-authoring.js');
        const result = [];
        for (const name of ['Preset Alpha', 'Preset Beta']) {
            const program = newPromptResource('core.prompt-program'); program.displayName = name;
            const module = newPromptResource('core.prompt-module'); module.displayName = name + ' Module';
            const generation = newPromptResource('core.generation-profile'); generation.displayName = name + ' Generation';
            program.stages[0].moduleRefs.push(resourceRef('core.prompt-module', module, { scope: 'library' }));
            result.push(await request('/presets', { method: 'POST', body: { preset: { format: 'atria.prompt-preset', schemaVersion: 1, programId: program.promptProgramId, categories: [], moduleCategories: {}, entries: [{ resourceType: 'core.prompt-program', resource: program }, { resourceType: 'core.prompt-module', resource: module }, { resourceType: 'core.generation-profile', resource: generation }] } } }));
        }
        window.Atria.shell.getWorkspaceHost().openPromptPreset(result[0].presetId);
        return result;
    });
    let catalogRequests = 0;
    page.on('request', request => { if (new URL(request.url()).pathname === '/api/native/generation/resources') catalogRequests++; });
    const preset = page.locator(`[data-atri-prompt-preset="${ids[0].presetId}"]`);
    for (const label of ['Prompt Programs', 'Prompt Modules', 'Generation Profiles']) {
        await page.getByRole('button', { name: label, exact: true }).click();
        await expect(preset).not.toContainText('Preset Beta');
        await expect(preset.getByRole('button', { name: 'Copy existing module', exact: true })).toHaveCount(0);
        await expect(preset.getByRole('button', { name: 'Export preset', exact: true })).toHaveCount(0);
        await page.getByRole('button', { name: 'Back to preset', exact: true }).click();
    }
    expect(catalogRequests).toBe(0);
});
