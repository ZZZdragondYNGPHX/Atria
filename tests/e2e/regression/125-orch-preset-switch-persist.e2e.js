// Unified Preset Library: the default ID binding survives a real host reload.
import { test, expect } from '@playwright/test';
import { startServer, tearDownServer } from '../_lib/server.js';
import { markOnboarded } from '../_lib/fixtures.js';
import { awaitMainUI, reloadAndAwait } from '../_lib/page.js';
let server;

test.beforeAll(async () => {
    server = await startServer({ batchKey:'regression',scenarioId:'125-native-preset-binding',extraConfig:{ 'storage.mode':'fs' } });
    markOnboarded({ dataRoot:server.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server); });

test('native definition and default binding survive page reload', async ({ page }) => {
    test.setTimeout(90000);
    await awaitMainUI(page,server.baseURL);
    await page.evaluate(async () => { const panel = await import('/scripts/extensions/orchestrator/workspace/panel.js'); panel.openWorkspace('Presets'); });
    const root = page.locator('#agent-memory-workspace');
    await root.getByRole('button',{ name:'Duplicate',exact:true }).click();
    await root.getByLabel('Name',{ exact:true }).fill('Persistent native preset');
    await root.getByRole('button',{ name:'Save definition for future runs' }).click();
    await root.getByRole('button',{ name:'Bind as default',exact:true }).click();
    const id = await page.evaluate(async () => {
        const context = window.Luker.getContext();
        await context.saveSettings?.(0,{ directSave:true });
        return context.extensionSettings.orchestrator.agentWorkspace.bindings.defaultPresetId;
    });
    await reloadAndAwait(page,server.baseURL);
    expect(await page.evaluate(() => window.Luker.getContext().extensionSettings.orchestrator.agentWorkspace.bindings.defaultPresetId)).toBe(id);
    await page.evaluate(async () => { const panel = await import('/scripts/extensions/orchestrator/workspace/panel.js'); panel.openWorkspace('Presets'); });
    await expect(root.getByText('Effective: Persistent native preset · Selected by: default',{ exact:true })).toBeVisible();
});
