import { test, expect } from '@playwright/test';

import { markOnboarded } from '../_lib/fixtures.js';
import { awaitMainUI } from '../_lib/page.js';
import { startServer, tearDownServer } from '../_lib/server.js';

test.describe.configure({ mode: 'serial' });

let server;

test.beforeAll(async () => {
    server = await startServer({
        batchKey: 'regression',
        scenarioId: 'r7e-workspaces',
    });
    markOnboarded({ dataRoot: server.dataRoot });

});

test.afterAll(async () => {
    await tearDownServer(server);
});

async function ensureShellMounted(page) {
    await page.waitForFunction(() => (
        Boolean(window.Atria?.shell?.isMounted?.())
        && Boolean(window.Atria?.shell?.getWorkspaceHost?.())
    ));
    const root = page.locator('#atria-app-shell');
    await root.waitFor({ state: 'visible', timeout: 10_000 });
    return root;
}

// Navigation starts hidden behind the edge dock; reveal it before using it.
async function revealNavigation(page) {
    if (await page.locator('.atria-edge-dock').getAttribute('data-state') === 'visible') return;
    await page.locator('.atria-edge-dock-reveal').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.atria-edge-dock')).toHaveAttribute('data-state', 'visible');
}

async function navigate(page, root, selector) {
    await revealNavigation(page);
    await root.locator(selector).click();
}

test.describe('R7E First-class Workspaces', () => {
    test('Expanded routes Agents, Native Build, Worlds and Diagnostics through WorkspaceHost', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await awaitMainUI(page, server.baseURL);
        const root = await ensureShellMounted(page);

        // Agents opens the V3 Plans workspace; Memory is a sibling section.
        await navigate(page, root, '[data-atria-primitive="NavigationRail"] [data-atria-domain="agents"]');
        const agents = root.locator('[data-atria-domain-workspace="agents"]');
        await expect(agents).toBeVisible();
        await expect(page).toHaveURL(/atriaRoute=agents/);
        await agents.locator('[data-atria-domain-section="memory"]').click();
        await expect(page).toHaveURL(/atriaChild=memory/);
        await expect(root.locator('.atria-memory-workspace')).toHaveCount(1);

        await page.goBack();
        await expect(page).toHaveURL(/atriaRoute=agents/);
        await expect(page).not.toHaveURL(/atriaChild=memory/);
        await expect(agents).toBeVisible();

        await navigate(page, root, '[data-atria-primitive="NavigationRail"] [data-atria-domain="build"]');
        await expect(root.locator('[data-atria-build-projects]')).toBeVisible();
        await expect(root.locator('#card-app-studio-workspace')).toHaveCount(0);
        await page.evaluate(() => document.getElementById('WIDrawerIcon')?.click());
        const worldInfo = root.locator('[data-atria-native-library="worlds-knowledge"]');
        await expect(worldInfo).toBeVisible();
        await expect(page).toHaveURL(/atriaRoute=library/);
        await expect(page).toHaveURL(/atriaChild=worlds/);
        await navigate(page, root, '.atria-toolbar__menu');
        await root.locator('[data-atria-utility-shortcut="diagnostics"]').click();
        const diagnostics = root.locator('.atriaLogsWorkspace[data-atria-workspace-embedded="true"]');
        await diagnostics.waitFor({ state: 'visible', timeout: 10_000 });
        await expect(page).toHaveURL(/atriaChild=utility.diagnostics/);

        await page.goBack();
        await expect(worldInfo).toBeVisible();
        await expect(page).toHaveURL(/atriaChild=worlds/);

        await navigate(page, root, '[data-atria-primitive="NavigationRail"] [data-atria-domain="play"]');
        await expect(root.locator('[data-atria-native-play-landing]')).toBeVisible();
        expect(await page.evaluate(() => ({
            chat: document.querySelectorAll('#chat').length,
            sendForm: document.querySelectorAll('#send_form').length,
            textarea: document.querySelectorAll('#send_textarea').length,
            orphanAgents: document.querySelectorAll('#atria-workspace > #agent-memory-workspace').length,
            orphanStudio: document.querySelectorAll('#atria-workspace > #card-app-studio-workspace').length,
            orphanWorldInfo: document.querySelectorAll('#atria-workspace #WorldInfo').length,
            orphanDiagnostics: document.querySelectorAll('#atria-workspace > .atriaLogsWorkspace').length,
        }))).toEqual({
            chat: 1,
            sendForm: 1,
            textarea: 1,
            orphanAgents: 0,
            orphanStudio: 0,
            orphanWorldInfo: 0,
            orphanDiagnostics: 0,
        });
    });

    test('Medium and Compact reuse one Workspace and one Context node without squeezing desktop chrome', async ({ page }) => {
        await page.setViewportSize({ width: 900, height: 1000 });
        await awaitMainUI(page, server.baseURL);
        const root = await ensureShellMounted(page);

        await navigate(page, root, '[data-atria-primitive="NavigationRail"] [data-atria-domain="agents"]');
        const agents = root.locator('[data-atria-domain-workspace="agents"]');
        await expect(agents).toBeVisible();
        await expect(root).toHaveAttribute('data-atria-viewport', 'medium');

        await page.evaluate(() => window.Atria.shell.getShell().setDockOpen(true));
        const contextNode = root.locator('[data-atria-workspace-context="true"]');
        await expect(contextNode).toBeVisible();
        await expect(root.locator('[data-atria-primitive="Dock"]')).toBeVisible();

        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForFunction(() => (
            document.getElementById('atria-app-shell')?.dataset.atriaViewport === 'compact'
        ));

        await expect(root.locator('[data-atria-primitive="NavigationRail"]')).toBeHidden();
        await expect(root.locator('[data-atria-primitive="BottomNavigation"]')).toBeVisible();
        await expect(root.locator('#atria-context-sheet')).toBeVisible();
        await expect(contextNode).toBeVisible();
        await expect(agents.locator('[data-atria-domain-section="memory"]')).toBeVisible();

        // Context Sheet is a real R7D transient layer and must intercept the
        // Workspace below it. Close it before interacting with the focused
        // Workspace, then verify navigation continues through the same route
        // authority rather than bypassing the overlay.
        await page.keyboard.press('Escape');
        await expect(root.locator('#atria-context-sheet')).toBeHidden();

        await agents.locator('[data-atria-domain-section="memory"]').click();
        await expect(page).toHaveURL(/atriaChild=memory/);
        expect(await page.evaluate(() => ({
            agents: document.querySelectorAll('.atria-memory-workspace').length,
            chat: document.querySelectorAll('#chat').length,
            sendForm: document.querySelectorAll('#send_form').length,
            textarea: document.querySelectorAll('#send_textarea').length,
        }))).toEqual({
            agents: 1,
            chat: 1,
            sendForm: 1,
            textarea: 1,
        });

        await page.goBack();
        await expect(page).not.toHaveURL(/atriaChild=memory/);
        await expect(agents).toBeVisible();
    });
});
