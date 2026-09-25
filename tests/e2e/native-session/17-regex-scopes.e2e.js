import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { FsEngine } from '../../../src/storage/engines/fs-engine.js';
import { PromptPresetStore } from '../../../src/native/model-prompt-runtime/presets.js';
import { seedGenerationProfiles } from '../../native/helpers/generation-fixture.js';
import { startServer, tearDownServer } from '../_lib/server.js';
import { awaitMainUI } from '../_lib/page.js';
import { seedNativeSessionDataRoot, createAndOpenNativeSession } from './_helpers.js';

let server, seed, presetId;
if (process.env.PW_NATIVE_CHANNEL) test.use({ channel: process.env.PW_NATIVE_CHANNEL });

test.beforeAll(async () => {
    seed = await seedNativeSessionDataRoot({ suffix: 'regex-scopes' });
    const root = resolve(seed.dataRoot, seed.handle);
    const engine = new FsEngine({ directoriesByHandle: () => ({ root, assets: resolve(root, 'assets') }) });
    try {
        const profiles = await seedGenerationProfiles({ engine, handle: seed.handle, endpoint: 'http://127.0.0.1:1/v1' });
        const store = new PromptPresetStore({ engine });
        const saved = await store.save(seed.handle, { format: 'atria.prompt-preset', schemaVersion: 1,
            programId: profiles.prompt.promptProgramId, categories: [], moduleCategories: {},
            entries: [{ resourceType: 'core.prompt-program', resource: profiles.prompt }, { resourceType: 'core.prompt-module', resource: profiles.module }, { resourceType: 'core.generation-profile', resource: profiles.generation }],
            regexScripts: [{ id: 'shared-rule', scriptName: 'Preset chain', findRegex: '/scope-middle/g', replaceString: 'scope-preset', placement: [1] }] });
        presetId = saved.presetId;
        const preset = await store.get(seed.handle, presetId);
        await profiles.persistence.saveRuntimeRoute(seed.handle, { ...profiles.routes[0],
            promptProgramRef: preset.refs.find(ref => ref.resourceType === 'core.prompt-program'),
            generationProfileRef: preset.refs.find(ref => ref.resourceType === 'core.generation-profile') });
    } finally { await engine.close(); }
    server = await startServer({ batchKey: 'generation', scenarioId: 'regex-scopes', useExistingDataRoot: seed.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server); });

test('Global → Preset → Game execution, editable owners, duplicate import and reload', async ({ page }, info) => {
    test.setTimeout(120000);
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await awaitMainUI(page, server.baseURL);
    const session = await createAndOpenNativeSession(page, seed.start);
    const execute = () => page.evaluate(async () => {
        const engine = await import('/scripts/extensions/regex/engine.js');
        return engine.getRegexedString('scope-start', engine.regex_placement.USER_INPUT);
    });
    const openRegex = async () => {
        await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openUtility('plugins'));
        await page.locator('[data-atria-global-plugin-settings="regex"] > summary').click();
        await page.locator('#regex_container .regex_settings > .inline-drawer > .inline-drawer-header').click();
    };
    await openRegex();
    const regex = page.locator('#regex_container');
    await expect(regex.locator('#preset_scripts_block')).toBeVisible();
    await expect(regex.locator('#game_scripts_block')).toBeVisible();
    const upload = async (scope, rule) => regex.locator(`#import_${scope}_file`).setInputFiles({ name: 'rule.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rule)) });
    await upload('regex', { id: 'shared-rule', scriptName: 'Global chain', findRegex: '/scope-start/g', replaceString: 'scope-middle', placement: [1] });
    await expect.poll(execute).toBe('scope-preset');
    await upload('game_regex', { id: 'shared-rule', scriptName: 'Game chain', findRegex: '/scope-preset/g', replaceString: 'scope-game', placement: [1] });
    await expect.poll(execute).toBe('scope-game');
    // Imported rules intentionally get fresh IDs; independently owned resources
    // may nevertheless contain equal IDs and must all participate in the chain.
    await page.evaluate(async packageId => {
        const { nativeProductClient: client } = await import('/scripts/native/product-client.js');
        const { capabilitySettings } = await import('/scripts/capability-host.js');
        const game = await client.getGameRegex(packageId);
        capabilitySettings.regex[0].id = 'shared-rule';
        game.regexScripts.find(rule => rule.scriptName === 'Game chain').id = 'shared-rule';
        await client.saveGameRegex(packageId, game);
        await (await import('/scripts/native/session-runtime.js')).nativeSessionRuntime.reload();
        await (await import('/scripts/native/regex-scopes.js')).refreshNativeRegexScopes();
    }, seed.start.packageId);
    await expect.poll(execute).toBe('scope-game');
    const game = regex.locator('#saved_game_scripts .regex-script-label').filter({ hasText: 'Game chain' });
    await game.locator('.edit_existing_regex').click();
    await page.locator('dialog[open] .regex_replace_string').fill('scope-edited');
    await page.locator('dialog[open] .popup-button-ok').click();
    await expect.poll(execute).toBe('scope-edited');
    await game.locator('.regex-toggle-on').click();
    await expect.poll(execute).toBe('scope-preset');
    await game.locator('.regex-toggle-off').click();
    await expect.poll(execute).toBe('scope-edited');
    await regex.locator('label[for="regex_bulk_edit"]').click();
    const presetChain = regex.locator('#saved_preset_scripts .regex-script-label').filter({ hasText: 'Preset chain' });
    await presetChain.locator('.regex_bulk_checkbox').check();
    await regex.locator('#bulk_disable_regex').click();
    await expect.poll(execute).toBe('scope-middle');
    await expect(regex.locator('#saved_regex_scripts .disable_regex')).not.toBeChecked();
    await expect(game.locator('.disable_regex')).not.toBeChecked();
    await presetChain.locator('.regex_bulk_checkbox').check();
    await regex.locator('#bulk_enable_regex').click();
    await expect.poll(execute).toBe('scope-edited');
    await regex.locator('label[for="regex_bulk_edit"]').click();
    await regex.locator('#open_preset_regex_editor').click();
    await page.locator('dialog[open] .regex_script_name').fill('Preset created in UI');
    await page.locator('dialog[open] .find_regex').fill('/unrelated-input/g');
    await page.locator('dialog[open] .regex_replace_string').fill('unrelated-output');
    await page.locator('dialog[open] input[name="replace_position"]').first().check();
    await page.locator('dialog[open] .popup-button-ok').click();
    await expect(regex.locator('#saved_preset_scripts')).toContainText('Preset created in UI');
    await upload('preset_regex', { id: 'shared-rule', scriptName: 'Preset imported', findRegex: '/never-match/g', replaceString: 'never', placement: [1] });
    await expect(regex.locator('#saved_preset_scripts')).toContainText('Preset imported');
    await page.evaluate(() => globalThis.toastr?.clear());
    await page.setViewportSize({ width: 1440, height: 1600 });
    await regex.locator('.regex_settings').screenshot({ path: info.outputPath('three-regex-scopes-desktop.png') });
    await page.setViewportSize({ width: 390, height: 1000 });
    await regex.locator('.regex_settings').screenshot({ path: info.outputPath('three-regex-scopes-mobile.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.setViewportSize({ width: 1440, height: 960 });
    const ownership = await page.evaluate(async ({ presetId, packageId }) => {
        const { runtimeRequest } = await import('/scripts/native/runtime-client.js');
        const { nativeProductClient } = await import('/scripts/native/product-client.js');
        const { capabilitySettings } = await import('/scripts/capability-host.js');
        const preset = await runtimeRequest('/presets/' + presetId), game = await nativeProductClient.getGameRegex(packageId);
        return { global: capabilitySettings.regex, preset: preset.regexScripts, game: game.regexScripts };
    }, { presetId, packageId: seed.start.packageId });
    expect(ownership.global.map(rule => rule.scriptName)).toEqual(['Global chain']);
    expect(ownership.preset.some(rule => rule.scriptName === 'Preset created in UI')).toBe(true);
    expect(new Set(ownership.preset.map(rule => rule.id)).size).toBe(ownership.preset.length);
    expect(ownership.game.some(rule => rule.replaceString === 'scope-edited')).toBe(true);
    const switched = await page.evaluate(async presetId => {
        const { runtimeRequest: request } = await import('/scripts/native/runtime-client.js');
        const preset = await request('/presets/' + presetId);
        const imported = await request('/presets', { method: 'POST', body: { preset, importing: true } });
        const copy = await request('/presets/' + imported.presetId);
        copy.regexScripts.find(rule => rule.scriptName === 'Preset chain').replaceString = 'scope-other-preset';
        await request('/presets/' + imported.presetId, { method: 'PUT', body: { preset: copy, expectedRevision: copy.revision } });
        const route = (await request('/configuration')).routes.find(route => route.role === 'role.narrator');
        await request('/configuration/routes', { method: 'PUT', body: { ...route,
            promptProgramRef: copy.refs.find(ref => ref.resourceType === 'core.prompt-program'),
            generationProfileRef: copy.refs.find(ref => ref.resourceType === 'core.generation-profile') } });
        return { route, importedId: imported.presetId };
    }, presetId);
    expect(switched.importedId).not.toBe(presetId);
    await expect.poll(execute).toBe('scope-other-preset');
    await page.evaluate(async route => {
        const { runtimeRequest: request } = await import('/scripts/native/runtime-client.js');
        await request('/configuration/routes', { method: 'PUT', body: route });
    }, switched.route);
    await expect.poll(execute).toBe('scope-edited');
    await page.evaluate(async () => (await import('/script.js')).saveSettings(0, { directSave: true }));
    await awaitMainUI(page, server.baseURL);
    await page.evaluate(async id => (await import('/script.js')).openNativeSession(id), session.sessionId);
    await expect.poll(execute).toBe('scope-edited');
    await page.evaluate(async () => (await import('/scripts/native/session-runtime.js')).nativeSessionRuntime.close());
    await expect.poll(execute).toBe('scope-preset');
    await page.evaluate(async id => (await import('/script.js')).openNativeSession(id), session.sessionId);
    await expect.poll(execute).toBe('scope-edited');
    await openRegex();
    await game.locator('.delete_regex').click();
    await page.locator('dialog[open] .popup-button-ok').click();
    await expect(game).toHaveCount(0);
    await expect.poll(execute).toBe('scope-preset');
    await expect(regex.locator('#saved_regex_scripts')).toContainText('Global chain');
    await expect(regex.locator('#saved_preset_scripts')).toContainText('Preset chain');
    const remainingGameRules = await page.evaluate(async packageId => (
        await (await import('/scripts/native/product-client.js')).nativeProductClient.getGameRegex(packageId)
    ).regexScripts, seed.start.packageId);
    expect(remainingGameRules.some(rule => rule.id === 'shared-rule')).toBe(false);
    const deletion = await page.evaluate(async presetId => {
        const { runtimeRequest: request } = await import('/scripts/native/runtime-client.js');
        const preset = await request('/presets/' + presetId);
        await request('/presets/' + presetId, { method: 'DELETE', body: { expectedRevision: preset.revision } });
        return request('/regex-scopes');
    }, presetId);
    expect(deletion.preset).toBeNull();
    await expect.poll(execute).toBe('scope-middle');
});
