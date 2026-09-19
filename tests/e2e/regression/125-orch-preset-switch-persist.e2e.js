// Atria orchestration workspace: the default preset binding survives a real host reload.
import { test, expect } from '@playwright/test';
import { startServer, tearDownServer } from '../_lib/server.js';
import { markOnboarded } from '../_lib/fixtures.js';
import { awaitMainUI, openExtensionsDrawer, reloadAndAwait } from '../_lib/page.js';
let server;

test.beforeAll(async () => {
    server = await startServer({ batchKey:'regression',scenarioId:'125-native-preset-binding',extraConfig:{ 'storage.mode':'fs' } });
    markOnboarded({ dataRoot:server.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server); });

test('settings drawer entry opens Workspace above the host drawer on mobile', async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 390, height: 844 });
    await awaitMainUI(page, server.baseURL);
    await page.waitForFunction(() => window.Atria?.getContext?.().getExtensionApi?.('orchestrator')?.listWorkspacePresets);

    await openExtensionsDrawer(page);
    const block = page.locator('#orchestrator_settings');
    await block.waitFor({ state: 'attached' });
    const content = block.locator('.inline-drawer-content');
    if (!await content.isVisible()) {
        await block.locator('.inline-drawer-toggle').first().click();
        await content.waitFor({ state: 'visible' });
    }

    const openButton = block.getByRole('button', { name: /Open Atria Workspace|打开 Atria 工作台|打開 Atria 工作台/ });
    await expect(openButton).toBeVisible();
    await openButton.click();

    const root = page.locator('#agent-memory-workspace');
    await expect(root).toBeVisible();
    await expect(root.getByRole('heading', { name: /Atria Workspace|Atria 工作台/ })).toBeVisible();

    const geometry = await root.evaluate(node => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return {
            width: rect.width,
            height: rect.height,
            display: style.display,
            visibility: style.visibility,
        };
    });
    expect(geometry.width).toBeGreaterThan(0);
    expect(geometry.height).toBeGreaterThan(0);
    expect(geometry.display).toBe('grid');
    expect(geometry.visibility).toBe('visible');

    const stack = await page.evaluate(() => {
        const workspace = document.getElementById('agent-memory-workspace');
        const drawer = document.getElementById('rm_extensions_block');
        const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
        return {
            workspaceZ: Number.parseInt(getComputedStyle(workspace).zIndex, 10),
            drawerZ: Number.parseInt(getComputedStyle(drawer).zIndex, 10) || 0,
            hitInsideWorkspace: Boolean(hit?.closest?.('#agent-memory-workspace')),
        };
    });
    expect(stack.workspaceZ).toBeGreaterThan(4005);
    expect(stack.hitInsideWorkspace).toBe(true);
});

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
