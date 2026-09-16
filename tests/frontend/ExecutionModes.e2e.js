import { test, expect } from '@playwright/test';
import { awaitMainUI, openExtensionsDrawer, openInlineDrawer, selectCharacterByName } from '../e2e/_lib/page.js';

// Run against an isolated, onboarded Luker server; no model credentials needed.
async function openModes(page) {
    await openExtensionsDrawer(page);
    await openInlineDrawer(page, 'orchestrator_settings');
    await expect(page.locator('#luker_orch_execution_mode')).toBeVisible();
}

test('legacy copy, explicit activation, simplified editing and reload preserve configuration', async ({ page, baseURL }) => {
    await awaitMainUI(page, baseURL);
    await openModes(page);
    const mode = page.locator('#luker_orch_execution_mode');
    await mode.selectOption('single');
    await page.locator('button[data-luker-tabs-target="luker_orch_tabs"][data-luker-tab-key="agents"]').click();
    await page.locator('#luker_orch_single_agent_system_prompt').fill('Keep the letter secret.');
    await page.locator('#luker_orch_single_agent_user_prompt').fill('{{last_user}}');
    await page.locator('#luker_orch_copy_single').click();
    const dialog = page.locator('dialog:visible').last();
    await expect(dialog.locator('[data-quick-preview-system]')).toHaveValue('Keep the letter secret.');
    const name = `Copy-${Date.now()}`;
    await dialog.locator('[data-quick-name]').fill(name);
    await dialog.locator('[data-quick-activate]').check();
    await dialog.locator('.popup-button-ok').click();
    await expect(mode).toHaveValue('spec');
    await expect(page.locator('#luker_orch_quick_system')).toHaveValue('Keep the letter secret.');
    await page.locator('#luker_orch_quick_system').fill('Check the letter before replying.');
    await page.locator('#luker_orch_quick_system').blur();
    await expect.poll(() => page.evaluate(() => {
        const s = Luker.getContext().extensionSettings.orchestrator;
        return s.presetLibraries.spec[s.activePresetIds.spec].presets.single_agent.systemPrompt;
    })).toBe('Check the letter before replying.');
    await page.reload();
    await awaitMainUI(page, baseURL);
    await openModes(page);
    await expect(mode).toHaveValue('spec');
    await expect(page.locator('#luker_orch_quick_system')).toHaveValue('Check the letter before replying.');
    await mode.selectOption('single');
    await expect(page.locator('#luker_orch_single_agent_system_prompt')).toHaveValue('Keep the letter secret.');
});

test('output routing and compatible modes remain usable at mobile width', async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await awaitMainUI(page, baseURL);
    await openModes(page);
    const mode = page.locator('#luker_orch_execution_mode');
    await page.locator('#luker_orch_output').selectOption('reply');
    await expect(mode).toHaveValue('director');
    await expect(page.locator('#luker_orch_mode_description')).toContainText('draft');
    await page.locator('#luker_orch_output').selectOption('guidance');
    await expect(mode).toHaveValue('loop');
    for (const value of ['spec', 'agenda', 'loop', 'single']) {
        await mode.selectOption(value);
        await expect(page.locator('#luker_orch_output')).toHaveValue('guidance');
    }
    await expect(page.locator('#luker_orch_mode_sources')).toBeVisible();
    const bounds = await mode.boundingBox();
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: testInfo.outputPath('execution-modes-mobile.png') });
});

test('character copy stays active while the user explicitly edits a global preset', async ({ page, baseURL }) => {
    await awaitMainUI(page, baseURL);
    await selectCharacterByName(page, 'Seraphina');
    await openModes(page);
    await page.locator('#luker_orch_execution_mode').selectOption('spec');
    const globalName = `Global scope fixture ${Date.now()}`;
    await page.locator('#luker_orch_quick_template').click();
    const globalDialog = page.locator('dialog:visible').last();
    await globalDialog.locator('[data-quick-name]').fill(globalName);
    await globalDialog.locator('[data-quick-scope]').selectOption('global');
    await globalDialog.locator('.popup-button-ok').click();
    await expect(globalDialog).not.toBeVisible();
    await page.locator('#luker_orch_quick_template').click();
    const dialog = page.locator('dialog:visible').last();
    await dialog.locator('[data-quick-name]').fill(`Character workflow ${Date.now()}`);
    await dialog.locator('[data-quick-scope]').selectOption('character');
    await dialog.locator('[data-quick-activate]').check();
    await dialog.locator('.popup-button-ok').click();
    await expect(page.locator('#luker_orch_mode_sources')).toContainText('Effective: Character');
    const cardPrompt = await page.locator('#luker_orch_quick_system').inputValue();
    await page.locator('button[data-luker-tabs-target="luker_orch_tabs"][data-luker-tab-key="general"]').click();
    const selector = page.locator('#orchestrator_settings [data-luker-preset-select][data-mode="spec"]');
    const globalCopy = await selector.locator('option').evaluateAll((options, name) => options.find(o => o.value.startsWith('global') && o.textContent.includes(name))?.value, globalName);
    expect(globalCopy).toBeTruthy();
    await selector.selectOption(globalCopy);
    await expect(page.locator('#luker_orch_mode_sources')).toContainText('Effective: Character');
    await expect(page.locator('#luker_orch_mode_sources')).toContainText('Editing: Global');
    await page.locator('#luker_orch_quick_system').fill('Global edit must not change the card.');
    await page.locator('#luker_orch_quick_system').blur();
    await expect.poll(() => page.evaluate(() => {
        const c = Luker.getContext();
        const ext = c.characters[c.characterId].data.extensions.orchestrator;
        return ext.presetLibraries.spec[ext.activePresetIds.spec].presets.single_agent.systemPrompt;
    })).toBe(cardPrompt);
    await expect(page.locator('#luker_orch_mode_sources')).toContainText('Editing: Global');
});
