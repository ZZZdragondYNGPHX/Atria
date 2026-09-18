// Atria orchestration workspace: the default preset binding survives a real host reload.
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
    await page.evaluate(async () => { const panel = await import('/scripts/extensions/orchestrator/workspace/panel.js'); panel.openWorkspace('Orchestration'); });
    const root = page.locator('#agent-memory-workspace');
    await root.locator('.workspace-more-menu > summary').click();
    await root.getByRole('button',{ name:'Duplicate',exact:true }).click();
    await root.locator('.workspace-more-menu > summary').click();
    await root.getByRole('button',{ name:'Preset settings',exact:true }).click();
    const inspector = root.locator('.atria-workspace-inspector');
    await inspector.getByLabel('Name',{ exact:true }).fill('Persistent native preset');
    await inspector.getByRole('button',{ name:'Save',exact:true }).click();
    await inspector.getByRole('button',{ name:'Close inspector',exact:true }).click();
    await root.getByRole('button',{ name:'Bind as default',exact:true }).click();
    const id = await page.evaluate(async () => {
        const context = window.Atria.getContext();
        await context.saveSettings?.(0,{ directSave:true });
        return context.extensionSettings.orchestrator.agentWorkspace.bindings.defaultPresetId;
    });
    await reloadAndAwait(page,server.baseURL);
    expect(await page.evaluate(() => window.Atria.getContext().extensionSettings.orchestrator.agentWorkspace.bindings.defaultPresetId)).toBe(id);
    await page.evaluate(async () => { const panel = await import('/scripts/extensions/orchestrator/workspace/panel.js'); panel.openWorkspace('Orchestration'); });
    await expect(root.locator('.workspace-effective-preset strong')).toHaveText('Persistent native preset');
    await expect(root.locator('.workspace-effective-preset span')).toHaveText('default');
});
