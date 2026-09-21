import { test, expect } from '@playwright/test';

import { disableExtensions, markOnboarded } from '../_lib/fixtures.js';
import { awaitMainUI, selectCharacterByName } from '../_lib/page.js';
import { createBlankCharacter } from '../_lib/ui-character.js';
import { startServer, tearDownServer } from '../_lib/server.js';

test.describe.configure({ mode: 'serial' });

let server;
const CHARACTER_NAME = 'R7F Library Runtime Fixture';

test.beforeAll(async () => {
    server = await startServer({
        batchKey: 'regression',
        scenarioId: 'r7f-library-runtime',
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
            firstmes: 'R7F workspace fixture.',
        });
    }
    await selectCharacterByName(page, CHARACTER_NAME);
}

async function ensureShellMounted(page) {
    await page.waitForFunction(() => (
        Boolean(window.Atria?.shell?.isMounted?.())
        && Boolean(window.Atria?.shell?.getWorkspaceHost?.())
    ));
    const root = page.locator('#atria-app-shell');
    await root.waitFor({ state: 'visible', timeout: 10_000 });
    return root;
}

test.describe('R7F Library & Runtime', () => {
    test('Expanded reuses Character, World Info, Skill and Connection controllers through WorkspaceHost', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await awaitMainUI(page, server.baseURL);
        await ensureCharacter(page);
        const root = await ensureShellMounted(page);

        await page.evaluate(() => {
            window.__r7fNative = {
                chat: document.getElementById('chat'),
                sendForm: document.getElementById('send_form'),
                textarea: document.getElementById('send_textarea'),
            };
        });

        await root.locator('[data-atria-primitive="NavigationRail"] [data-atria-domain="library"]').click();
        const characters = root.locator('#right-nav-panel[data-atria-workspace-embedded="true"]');
        await expect(characters).toBeVisible();
        await expect(page).toHaveURL(/atriaRoute=library/);
        await expect(page).not.toHaveURL(/atriaChild=/);
        await expect(root.locator('[data-atria-domain-workspace="library"]')).toHaveCount(1);

        await root.locator('[data-atria-domain-section="games"]').click();
        await expect(page).toHaveURL(/atriaChild=games/);
        await root.locator('[data-atria-library-games="true"]').waitFor({ state: 'visible', timeout: 20_000 });
        await expect(root.locator('#card-app-studio-workspace')).toHaveCount(0);

        await root.locator('[data-atria-domain-section="world-info"]').click();
        const worldInfo = root.locator('#WorldInfo[data-atria-workspace-embedded="true"]');
        await worldInfo.waitFor({ state: 'visible', timeout: 10_000 });
        await expect(page).toHaveURL(/atriaChild=world-info/);

        await root.locator('[data-atria-domain-section="skills"]').click();
        const skills = root.locator('.atria-skill-workspace-host .atria_skill_manager');
        await skills.waitFor({ state: 'visible', timeout: 10_000 });
        await expect(page).toHaveURL(/atriaChild=skills/);
        await expect(page.locator('.popup .atria_skill_manager')).toHaveCount(0);

        await root.locator('[data-atria-primitive="NavigationRail"] [data-atria-domain="runtime"]').click();
        await expect(root.locator('[data-atria-runtime-overview="true"]')).toBeVisible();
        await expect(page).toHaveURL(/atriaRoute=runtime/);
        await expect(page).not.toHaveURL(/atriaChild=/);

        await root.locator('[data-atria-domain-section="roles"]').click();
        await expect(root.locator('[data-atria-runtime-roles="true"]')).toBeVisible();
        await expect(page).toHaveURL(/atriaChild=roles/);

        await root.locator('[data-atria-domain-section="connections"]').click();
        const apiBlock = root.locator('#rm_api_block[data-atria-workspace-embedded="true"]');
        const connectionRoot = apiBlock.locator('#atria-connection-manager-root[data-atria-workspace-embedded="true"]');
        await apiBlock.waitFor({ state: 'visible', timeout: 10_000 });
        await expect(connectionRoot).toBeVisible();
        await expect(apiBlock.locator('#main_api')).toBeVisible();
        await expect(root.locator('[data-atria-domain-section="retrieval"]')).toHaveCount(0);
        await page.evaluate(() => {
            window.__r7fApiBlock = document.getElementById('rm_api_block');
        });
        await expect(page).toHaveURL(/atriaChild=connections/);

        // Retrieval is now a native mode inside the single Connections surface.
        await connectionRoot.locator('.connection_profile_mode_tab[data-mode="embed"]').click();
        await expect(connectionRoot.locator('.connection_profile_mode_tab[data-mode="embed"]')).toHaveClass(/active/);
        await expect(page).toHaveURL(/atriaChild=connections/);
        expect(await page.evaluate(() => (
            window.__r7fApiBlock === document.getElementById('rm_api_block')
        ))).toBe(true);

        await root.locator('[data-atria-domain-section="presets"]').click();
        const presets = root.locator('[data-atria-runtime-presets="true"]');
        await expect(presets).toBeVisible();
        await expect(page).toHaveURL(/atriaChild=presets/);
        await expect(presets.locator('.atria-runtime-preset-row')).toHaveCount(6);

        // Prompt presets stay compact until the user asks to edit; editing
        // reparents the existing Advanced Formatting authority.
        await presets.locator('[data-atria-preset-api="context"] .atria-runtime-preset-row__edit').click();
        await expect(presets.locator('#AdvancedFormatting[data-atria-runtime-preset-editor-source="context"]')).toBeVisible();
        await expect(presets.locator('#context_presets')).toBeVisible();
        await presets.locator('.atria-runtime-preset-editor__back').click();
        await expect(presets.locator('[data-atria-preset-summary="true"]')).toBeVisible();

        // Model presets likewise open the native AI response editor instead of
        // a read-only duplicate form.
        await presets.locator('[data-atria-preset-api="openai"] .atria-runtime-preset-row__edit').click();
        await expect(presets.locator('#left-nav-panel[data-atria-runtime-preset-editor-source="openai"]')).toBeVisible();
        await expect(presets.locator('#settings_preset_openai')).toBeVisible();
        await presets.locator('.atria-runtime-preset-editor__back').click();

        await page.goBack();
        await expect(page).toHaveURL(/atriaChild=connections/);
        await apiBlock.waitFor({ state: 'visible', timeout: 10_000 });

        const commandState = await page.evaluate(() => {
            const registry = window.Atria.shell.getShell()?.registry;
            return {
                characters: Boolean(registry?.get?.('workspace.characters')),
                games: Boolean(registry?.get?.('workspace.games')),
                skills: Boolean(registry?.get?.('workspace.skills')),
                roles: Boolean(registry?.get?.('workspace.runtime-roles')),
                connections: Boolean(registry?.get?.('workspace.connections')),
                retrieval: Boolean(registry?.get?.('workspace.retrieval')),
            };
        });
        expect(commandState).toEqual({
            characters: true,
            games: true,
            skills: true,
            roles: true,
            connections: true,
            retrieval: false,
        });

        await root.locator('[data-atria-primitive="NavigationRail"] [data-atria-domain="play"]').click();
        await expect(root.locator('#sheld')).toBeVisible();
        expect(await page.evaluate(() => ({
            chatCount: document.querySelectorAll('#chat').length,
            formCount: document.querySelectorAll('#send_form').length,
            textareaCount: document.querySelectorAll('#send_textarea').length,
            chatSame: window.__r7fNative.chat === document.getElementById('chat'),
            formSame: window.__r7fNative.sendForm === document.getElementById('send_form'),
            textareaSame: window.__r7fNative.textarea === document.getElementById('send_textarea'),
            orphanCharacter: document.querySelectorAll('#atria-workspace #right-nav-panel').length,
            orphanWorld: document.querySelectorAll('#atria-workspace #WorldInfo').length,
            orphanConnection: document.querySelectorAll('#atria-workspace #rm_api_block').length,
        }))).toEqual({
            chatCount: 1,
            formCount: 1,
            textareaCount: 1,
            chatSame: true,
            formSame: true,
            textareaSame: true,
            orphanCharacter: 0,
            orphanWorld: 0,
            orphanConnection: 0,
        });
    });

    test('Compact keeps Bottom Navigation authoritative and uses focused Library / Runtime drill-down', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await awaitMainUI(page, server.baseURL);
        const root = await ensureShellMounted(page);

        await root.locator('[data-atria-primitive="BottomNavigation"] [data-atria-domain="library"]').click();
        await expect(root).toHaveAttribute('data-atria-viewport', 'compact');
        await expect(root.locator('#right-nav-panel[data-atria-workspace-embedded="true"]')).toBeVisible();
        await expect(root.locator('[data-atria-domain-section="skills"]')).toBeVisible();

        await root.locator('[data-atria-domain-section="skills"]').click();
        await expect(root.locator('.atria-skill-workspace-host .atria_skill_manager')).toBeVisible();
        await expect(page).toHaveURL(/atriaChild=skills/);

        await page.goBack();
        await expect(page).not.toHaveURL(/atriaChild=skills/);
        await expect(root.locator('#right-nav-panel[data-atria-workspace-embedded="true"]')).toBeVisible();

        await root.locator('[data-atria-primitive="BottomNavigation"] [data-atria-domain="runtime"]').click();
        await expect(root.locator('[data-atria-runtime-overview="true"]')).toBeVisible();

        await root.locator('[data-atria-domain-section="connections"]').click();
        await expect(root.locator('#rm_api_block[data-atria-workspace-embedded="true"]')).toBeVisible();
        await expect(root.locator('[data-atria-domain-section="retrieval"]')).toHaveCount(0);
        await expect(page).toHaveURL(/atriaChild=connections/);

        await root.locator('[data-atria-domain-section="presets"]').click();
        const compactPresets = root.locator('[data-atria-runtime-presets="true"]');
        await expect(compactPresets).toBeVisible();
        const compactRows = compactPresets.locator('.atria-runtime-preset-row');
        await expect(compactRows).toHaveCount(6);
        const maxRowHeight = await compactRows.evaluateAll(rows => Math.max(...rows.map(row => row.getBoundingClientRect().height)));
        expect(maxRowHeight).toBeLessThan(90);

        expect(await page.evaluate(() => ({
            chat: document.querySelectorAll('#chat').length,
            sendForm: document.querySelectorAll('#send_form').length,
            textarea: document.querySelectorAll('#send_textarea').length,
        }))).toEqual({
            chat: 1,
            sendForm: 1,
            textarea: 1,
        });
    });

    test('legacy Character, World Info and API entries forward into authoritative Library / Runtime navigation', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await awaitMainUI(page, server.baseURL);
        await ensureShellMounted(page);

        await page.evaluate(() => document.getElementById('rightNavDrawerIcon')?.click());
        await expect(page).toHaveURL(/atriaRoute=library/);

        await page.evaluate(() => document.getElementById('WIDrawerIcon')?.click());
        await expect(page).toHaveURL(/atriaChild=world-info/);

        await page.evaluate(() => document.getElementById('API-status-top')?.click());
        await expect(page).toHaveURL(/atriaRoute=runtime/);
        await expect(page).toHaveURL(/atriaChild=connections/);

        await page.evaluate(() => document.getElementById('leftNavDrawerIcon')?.click());
        await expect(page).toHaveURL(/atriaChild=presets/);
    });
});
