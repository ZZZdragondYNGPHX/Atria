import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startServer, tearDownServer } from '../_lib/server.js';
import { awaitMainUI } from '../_lib/page.js';
import { seedNativeSessionDataRoot } from './_helpers.js';

let server;
test.describe.configure({ mode: 'default' });
test.use({ actionTimeout: 15000 });
if (process.env.PW_NATIVE_CHANNEL) test.use({ channel: process.env.PW_NATIVE_CHANNEL });

test.beforeAll(async () => {
    const seed = await seedNativeSessionDataRoot({ suffix: 'npc-remaining' });
    server = await startServer({ batchKey: 'generation', scenarioId: 'npc-remaining', useExistingDataRoot: seed.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server); });

test('fresh identity and live language lead into the permanent guide; progress resumes after reload', async ({ page }) => {
    const seed = await seedNativeSessionDataRoot({ suffix: 'npc-learning' });
    const path = resolve(seed.dataRoot, seed.handle, 'settings.json');
    const settings = JSON.parse(readFileSync(path, 'utf8')); settings.firstRun = true; writeFileSync(path, JSON.stringify(settings));
    const fresh = await startServer({ batchKey: 'generation', scenarioId: 'npc-learning', useExistingDataRoot: seed.dataRoot });
    try {
        await page.setViewportSize({ width: 390, height: 900 });
        await page.addInitScript(() => localStorage.setItem('language', 'en'));
        await page.goto(fresh.baseURL);
        const dialog = page.locator('.atri-onboarding-dialog[open]');
        await expect(dialog).toBeVisible({ timeout: 60000 });
        await dialog.locator('.popup-input').fill('Learning Reader');
        await dialog.locator('select').selectOption('zh-cn');
        await expect(dialog.getByRole('button', { name: '下一课', exact: true })).toBeVisible();
        await expect(dialog.locator('.popup-input')).toHaveValue('Learning Reader');
        await dialog.locator('select').selectOption('en');
        await dialog.getByRole('button', { name: 'Next lesson', exact: true }).click();
        const guide = page.locator('.atri-learning-center');
        await expect(guide.getByRole('heading', { name: 'Find your way around' })).toBeVisible();
        await guide.getByRole('button', { name: 'Next lesson', exact: true }).click();
        await expect(page.locator('[data-atria-runtime-native="connections"]')).toBeVisible();
        await page.evaluate(async () => (await import('/script.js')).saveSettings(0, { directSave: true }));
        await awaitMainUI(page, fresh.baseURL);
        await expect(guide.getByRole('heading', { name: 'Connect a provider' })).toBeVisible();
        await page.keyboard.press('Escape'); await expect(guide).toBeHidden();
    } finally { await tearDownServer(fresh); }
});

for (const width of [1440, 390]) test(`Knowledge drafts, Prompt deletion, Regex account rules and guide at ${width}px`, async ({ page }, info) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 960 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await awaitMainUI(page, server.baseURL);
    const seeded = await page.evaluate(async width => {
        const { nativeProductClient: client } = await import('/scripts/native/product-client.js');
        const { createStudioNativeId: id } = await import('/scripts/native/studio-authoring.js');
        const base = await client.createKnowledge('NPC entries ' + width);
        const entries = Array.from({ length: 80 }, (_, index) => ({ knowledgeEntryId: id('kentry'), content: 'Detailed content ' + index, metadata: { title: 'Entry ' + index }, discovery: { keywords: ['keyword-' + index] } }));
        await client.commitKnowledgeRevision(base.knowledgeBaseId, { baseRevisionId: null, content: { entries, metadata: {} } });
        window.Atria.shell.getWorkspaceHost().openLibraryKnowledge(base.knowledgeBaseId);
        return { id: base.knowledgeBaseId, entryId: entries[42].knowledgeEntryId };
    }, width);
    await expect(page.locator('.atri-knowledge-entry-row')).toHaveCount(25);
    await expect(page.locator('.atri-knowledge-entry-details[open]')).toHaveCount(0);
    await page.getByRole('searchbox', { name: 'Search Knowledge entries' }).fill('keyword-42');
    await page.getByRole('checkbox', { name: 'Enable entry: Entry 42' }).uncheck();
    await expect(page.locator('.atri-library-revision-editor')).toBeVisible();
    await page.getByRole('button', { name: 'Review Changes', exact: true }).click();
    await page.getByRole('button', { name: 'Save immutable revision', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Enable entry: Entry 42' })).not.toBeChecked();
    await expect(page.getByRole('searchbox', { name: 'Search Knowledge entries' })).toHaveValue('keyword-42');
    await page.getByRole('button', { name: 'Edit entry', exact: true }).click();
    await page.getByRole('textbox', { name: 'Entry title', exact: true }).fill('Renamed entry 42');
    await page.getByRole('button', { name: 'Back to entries', exact: true }).click();
    await page.getByRole('button', { name: 'Review Changes', exact: true }).click();
    await page.getByRole('button', { name: 'Save immutable revision', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Enable entry: Renamed entry 42' })).not.toBeChecked();
    await page.getByRole('searchbox', { name: 'Search Knowledge entries' }).fill('');
    await page.screenshot({ path: info.outputPath(`knowledge-${width}.png`) });
    await awaitMainUI(page, server.baseURL);
    await page.evaluate(id => window.Atria.shell.getWorkspaceHost().openLibraryKnowledge(id), seeded.id);
    await page.getByRole('searchbox', { name: 'Search Knowledge entries' }).fill('Renamed entry 42');
    await expect(page.getByRole('checkbox', { name: 'Enable entry: Renamed entry 42' })).not.toBeChecked();

    await page.evaluate(async width => {
        const { runtimeRequest } = await import('/scripts/native/runtime-client.js');
        const { newPromptResource } = await import('/scripts/native/prompt-authoring.js');
        const module = { ...newPromptResource('core.prompt-module'), displayName: 'NPC module ' + width };
        const program = { ...newPromptResource('core.prompt-program'), displayName: 'NPC program ' + width, stages: [{ stageId: 'stage.main', moduleRefs: [{ scope: 'library', resourceType: 'core.prompt-module', resourceId: module.promptModuleId, revision: module.revision }] }] };
        await runtimeRequest('/resources', { method: 'POST', body: { resourceType: 'core.prompt-module', resource: module } });
        await runtimeRequest('/resources', { method: 'POST', body: { resourceType: 'core.prompt-program', resource: program } });
        window.Atria.shell.getWorkspaceHost().openLibrarySection('prompt-modules');
    }, width);
    const module = page.locator('.atri-prompt-resource').filter({ has: page.getByRole('heading', { name: 'NPC module ' + width, exact: true }) });
    await module.getByRole('button', { name: 'Delete resource' }).click();
    await page.locator('dialog[open] .popup-button-ok').click();
    await expect(module.locator('[data-atria-used-by]')).toContainText('NPC program ' + width);
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openLibrarySection('prompt-programs'));
    const program = page.locator('.atri-prompt-resource').filter({ has: page.getByRole('heading', { name: 'NPC program ' + width, exact: true }) });
    await program.getByRole('button', { name: 'Delete resource' }).click();
    await page.locator('dialog[open] .popup-button-ok').click(); await expect(program).toHaveCount(0);
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openLibrarySection('prompt-modules'));
    await module.getByRole('button', { name: 'Delete resource' }).click();
    await page.locator('dialog[open] .popup-button-ok').click(); await expect(module).toHaveCount(0);

    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openUtility('plugins'));
    await page.locator('[data-atria-global-plugin-settings="regex"] > summary').click();
    const regex = page.locator('#regex_container');
    await regex.locator('.regex_settings > .inline-drawer > .inline-drawer-header').click();
    await regex.locator('#open_regex_editor').click();
    const editor = page.locator('dialog[open]');
    await editor.locator('.regex_script_name').fill('NPC account ' + width);
    await editor.locator('.find_regex').fill('/hello/g');
    await editor.locator('.regex_replace_string').fill('world');
    await editor.locator('input[name="replace_position"]').first().check();
    await editor.locator('.popup-button-ok').click();
    await expect(regex.locator('#saved_regex_scripts')).toContainText('NPC account ' + width);
    await expect(regex.locator('#preset_scripts_block,#scoped_scripts_block')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`regex-${width}.png`) });
    expect(await page.evaluate(async () => {
        const { getRegexedString, regex_placement } = await import('/scripts/extensions/regex/engine.js');
        return getRegexedString('hello', regex_placement.USER_INPUT, { isMarkdown: true });
    })).toBe('world');
    await page.evaluate(async () => (await import('/script.js')).saveSettings(0, { directSave: true }));
    await awaitMainUI(page, server.baseURL);
    expect(await page.evaluate(async width => (await import('/scripts/capability-host.js')).capabilitySettings.regex.some(rule => rule.scriptName === 'NPC account ' + width), width)).toBe(true);

    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openUtility('settings'));
    await page.locator('[data-atria-utility-workspace="settings"]').getByRole('button', { name: 'Learning center', exact: true }).click();
    const guide = page.locator('.atri-learning-center');
    await guide.getByRole('button', { name: 'Manage Worlds and Knowledge', exact: true }).click();
    await page.getByRole('textbox', { name: 'New Knowledge Base name' }).fill('Real underlying input');
    await guide.getByRole('button', { name: 'Previous lesson' }).click();
    await expect(guide.getByRole('heading', { name: 'Play your story' })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`learning-${width}.png`) });
    const bounds = await guide.boundingBox(); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
    await guide.getByRole('button', { name: 'Close guide' }).click();
});

test('Regex imports refresh execution; bulk controls and groups remain account-owned', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await awaitMainUI(page, server.baseURL);
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openUtility('plugins'));
    await page.locator('[data-atria-global-plugin-settings="regex"] > summary').click();
    const regex = page.locator('#regex_container');
    await regex.locator('.regex_settings > .inline-drawer > .inline-drawer-header').click();
    const execute = () => page.evaluate(async () => {
        const engine = await import('/scripts/extensions/regex/engine.js');
        return engine.getRegexedString('npc-token', engine.regex_placement.USER_INPUT, { isMarkdown: true });
    });
    expect(await execute()).toBe('npc-token');
    await regex.locator('#import_regex_file').setInputFiles({ name: 'rule.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ scriptName: 'Imported account rule', findRegex: '/npc-token/g', replaceString: 'changed', placement: [1], markdownOnly: true, trimStrings: [] })) });
    await expect(regex.locator('#saved_regex_scripts')).toContainText('Imported account rule');
    expect(await execute()).toBe('changed');
    await regex.locator('#regex_preset_create').click();
    await page.locator('dialog[open] .popup-input').fill('Account group');
    await page.locator('dialog[open] .popup-button-ok').click();
    await expect(regex.locator('#regex_presets option:checked')).toHaveText('Account group');
    await regex.locator('label[for="regex_bulk_edit"]').click();
    await regex.locator('.regex_bulk_checkbox').check();
    await regex.locator('#bulk_disable_regex').click();
    expect(await execute()).toBe('npc-token');
    await regex.locator('label[for="regex_bulk_edit"]').click();
    await regex.locator('#regex_preset_apply').click();
    await expect.poll(execute).toBe('changed');
    await regex.locator('label[for="regex_bulk_edit"]').click();
    await regex.locator('.regex_bulk_checkbox').check();
    const download = page.waitForEvent('download');
    await regex.locator('#bulk_export_regex').click();
    expect((await download).suggestedFilename()).toMatch(/^regex-.*\.json$/);
    await regex.locator('.regex_bulk_checkbox').check();
    await regex.locator('#bulk_delete_regex').click();
    await page.locator('dialog[open] .popup-button-ok').click();
    await expect(regex.locator('#saved_regex_scripts .regex-script-label')).toHaveCount(0);
    expect(await execute()).toBe('npc-token');
    expect(await page.evaluate(async () => (await import('/scripts/capability-host.js')).capabilitySettings.regex_presets[0].global)).toEqual([]);
});
