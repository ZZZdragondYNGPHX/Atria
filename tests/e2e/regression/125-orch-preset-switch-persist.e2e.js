// Atria orchestration workspace: the default preset binding survives a real host reload.
import { test, expect } from '@playwright/test';
import { startServer, tearDownServer } from '../_lib/server.js';
import { seedNativeSessionDataRoot } from '../native-session/_helpers.js';
import { awaitMainUI, openExtensionsDrawer, reloadAndAwait } from '../_lib/page.js';
let server;
if (process.env.PW_NATIVE_CHANNEL) test.use({ channel: process.env.PW_NATIVE_CHANNEL });

test.beforeAll(async () => {
    const seeded = await seedNativeSessionDataRoot({ suffix: 'workspace-binding-p8' });
    server = await startServer({ batchKey:'regression',scenarioId:'125-native-preset-binding', useExistingDataRoot: seeded.dataRoot, extraConfig:{ 'storage.mode':'fs' } });
});

test.afterAll(async () => { await tearDownServer(server); });

test('plugin compatibility settings entry opens embedded Agents Workspace on mobile', async ({ page }, info) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 390, height: 844 });
    await awaitMainUI(page, server.baseURL);
    await page.waitForFunction(() => window.Atria?.getContext?.().getCapabilityApi?.('orchestrator')?.listWorkspacePresets);

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

    const ownership = await page.evaluate(() => {
        const shell = document.getElementById('atria-app-shell');
        const workspaceSlot = document.getElementById('atria-workspace');
        const workspace = document.getElementById('agent-memory-workspace');
        const legacyDrawer = document.getElementById('rm_extensions_block');
        const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
        return {
            embedded: workspace?.dataset.atriaWorkspaceEmbedded === 'true',
            inShell: Boolean(shell?.contains(workspace)),
            inWorkspaceSlot: Boolean(workspaceSlot?.contains(workspace)),
            legacyDrawerVisible: legacyDrawer ? getComputedStyle(legacyDrawer).display !== 'none' : false,
            hitInsideWorkspace: Boolean(hit?.closest?.('#agent-memory-workspace')),
        };
    });
    await expect(page.locator('#atria-workspace')).not.toContainText('Opening workspace…');
    await page.screenshot({ path: info.outputPath('workspace-mobile.png'), fullPage: true });
    expect(ownership).toEqual({
        embedded: true,
        inShell: true,
        inWorkspaceSlot: true,
        legacyDrawerVisible: false,
        hitInsideWorkspace: true,
    });
});

test('native definition and default binding survive page reload', async ({ page }, info) => {
    test.setTimeout(90000);
    await awaitMainUI(page,server.baseURL);
    await page.evaluate(async () => { const panel = await import('/scripts/agents/orchestrator/workspace/panel.js'); panel.openWorkspace('Orchestration'); });
    const root = page.locator('#agent-memory-workspace');
    const initialInspector = root.locator('.atria-workspace-inspector');
    await expect(root).toBeVisible();
    if (await initialInspector.isVisible()) await initialInspector.getByRole('button', { name: 'Close inspector', exact: true }).click();
    await root.locator('.workspace-more-menu > summary').click();
    await root.getByRole('button',{ name:'Duplicate',exact:true }).click();
    // Duplicate selects the new agent and opens its inspector. Close the
    // responsive overlay before opening the preset-level action menu.
    await expect(initialInspector).toBeVisible();
    await page.screenshot({ path: info.outputPath('workspace-duplicate-inspector.png'), fullPage: true });
    await initialInspector.getByRole('button', { name: 'Close inspector', exact: true }).click();
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
        return context.capabilitySettings.orchestrator.agentWorkspace.bindings.defaultPresetId;
    });
    await reloadAndAwait(page,server.baseURL);
    expect(await page.evaluate(() => window.Atria.getContext().capabilitySettings.orchestrator.agentWorkspace.bindings.defaultPresetId)).toBe(id);
    await page.evaluate(async () => { const panel = await import('/scripts/agents/orchestrator/workspace/panel.js'); panel.openWorkspace('Orchestration'); });
    await expect(root.locator('.workspace-effective-preset strong')).toHaveText('Persistent native preset');
    await expect(root.locator('.workspace-effective-preset span')).toHaveText('default');
    expect(await root.locator('.atria-workspace-main').evaluate(node => node.getBoundingClientRect().width)).toBeGreaterThan(500);
    await page.screenshot({ path: info.outputPath('workspace-reloaded.png'), fullPage: true });
});
