import { test, expect } from '@playwright/test';

import { disableExtensions, markOnboarded } from '../_lib/fixtures.js';
import { awaitMainUI, selectCharacterByName } from '../_lib/page.js';
import { createBlankCharacter } from '../_lib/ui-character.js';
import { startServer, tearDownServer } from '../_lib/server.js';

test.describe.configure({ mode: 'serial' });

let server;
const CHARACTER_NAME = 'R7E Workspace Fixture';

test.beforeAll(async () => {
    server = await startServer({
        batchKey: 'regression',
        scenarioId: 'r7e-workspaces',
    });
    markOnboarded({ dataRoot: server.dataRoot });
    disableExtensions({
        dataRoot: server.dataRoot,
        names: ['stable-diffusion'],
    });
});

test.afterAll(async () => {
    await tearDownServer(server);
});

async function ensureCharacter(page) {
    const exists = await page.evaluate((name) => {
        const ctx = window.Atria?.getContext?.();
        return Boolean(ctx?.characters?.some?.(character => character?.name === name));
    }, CHARACTER_NAME);
    if (!exists) {
        await createBlankCharacter(page, {
            name: CHARACTER_NAME,
            firstmes: 'Workspace host fixture.',
        });
    }
    await selectCharacterByName(page, CHARACTER_NAME);
}

async function enableShellPreview(page) {
    await page.evaluate(() => {
        window.Atria.shell.setPreviewEnabled(true, { persist: false });
    });
    await page.waitForFunction(() => Boolean(window.Atria?.shell?.getWorkspaceHost?.()));
    const root = page.locator('#atria-app-shell');
    await root.waitFor({ state: 'visible', timeout: 10_000 });
    return root;
}

test.describe('R7E First-class Workspaces', () => {
    test('Expanded routes existing Agents, Studio, World Info and Diagnostics controllers through WorkspaceHost', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await awaitMainUI(page, server.baseURL);
        await ensureCharacter(page);
        const root = await enableShellPreview(page);

        await root.locator('[data-atria-primitive="NavigationRail"] [data-atria-domain="agents"]').click();
        const agents = root.locator('#agent-memory-workspace[data-atria-workspace-embedded="true"]');
        await expect(agents).toBeVisible();
        await expect(root.locator('#atria-workspace > #agent-memory-workspace')).toHaveCount(1);

        await page.evaluate(() => {
            window.__r7eAgentsRoot = document.getElementById('agent-memory-workspace');
        });
        await agents.locator('.atria-workspace-nav [data-section="memory"]').click();
        await expect(page).toHaveURL(/atriaRoute=agents/);
        await expect(page).toHaveURL(/atriaChild=memory/);
        expect(await page.evaluate(() => (
            window.__r7eAgentsRoot === document.getElementById('agent-memory-workspace')
        ))).toBe(true);

        await page.goBack();
        await expect(page).toHaveURL(/atriaRoute=agents/);
        await expect(page).not.toHaveURL(/atriaChild=memory/);
        await expect(agents).toBeVisible();

        await root.locator('[data-atria-primitive="NavigationRail"] [data-atria-domain="studio"]').click();
        const studio = root.locator('#card-app-studio-workspace[data-atria-workspace-embedded="true"]');
        await studio.waitFor({ state: 'visible', timeout: 20_000 });
        await expect(studio.locator('#card-app-studio-left')).toHaveCount(1);
        await expect(studio.locator('#card-app-studio-right')).toHaveCount(1);
        expect(await page.evaluate(async () => {
            const module = await import('/scripts/extensions/character-editor-assistant/studio/studio.js');
            return module.getCardAppStudioStateForTests();
        })).toMatchObject({
            open: true,
            embedded: true,
        });

        await page.evaluate(() => document.getElementById('WIDrawerIcon')?.click());
        const worldInfo = root.locator('#WorldInfo[data-atria-workspace-embedded="true"]');
        await worldInfo.waitFor({ state: 'visible', timeout: 10_000 });
        await expect(page).toHaveURL(/atriaRoute=library/);
        await expect(page).toHaveURL(/atriaChild=world-info/);
        await expect(worldInfo.locator('#wi_workspace_shell')).toHaveCount(1);

        await root.locator('[data-atria-utility="diagnostics"]').click();
        const diagnostics = root.locator('.atriaLogsWorkspace[data-atria-workspace-embedded="true"]');
        await diagnostics.waitFor({ state: 'visible', timeout: 10_000 });
        await expect(page).toHaveURL(/atriaChild=utility.diagnostics/);

        await page.goBack();
        await expect(worldInfo).toBeVisible();
        await expect(page).toHaveURL(/atriaChild=world-info/);

        await root.locator('[data-atria-primitive="NavigationRail"] [data-atria-domain="play"]').click();
        await expect(root.locator('#sheld')).toBeVisible();
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
        const root = await enableShellPreview(page);

        await root.locator('[data-atria-primitive="NavigationRail"] [data-atria-domain="agents"]').click();
        const agents = root.locator('#agent-memory-workspace[data-atria-workspace-embedded="true"]');
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
        await expect(agents.locator('.atria-workspace-mobile-nav')).toBeVisible();

        // Context Sheet is a real R7D transient layer and must intercept the
        // Workspace below it. Close it before interacting with the focused
        // Workspace, then verify navigation continues through the same route
        // authority rather than bypassing the overlay.
        await root.locator('#atria-context-sheet .atria-sheet-scrim').click();
        await expect(root.locator('#atria-context-sheet')).toBeHidden();

        await agents.locator('.atria-workspace-mobile-nav [data-section="memory"]').click();
        await expect(page).toHaveURL(/atriaChild=memory/);
        expect(await page.evaluate(() => ({
            agents: document.querySelectorAll('#agent-memory-workspace').length,
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
