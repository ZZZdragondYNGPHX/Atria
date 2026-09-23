import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { FsEngine } from '../../../src/storage/engines/fs-engine.js';
import { seedGenerationProfiles } from '../../native/helpers/generation-fixture.js';
import { startServer, tearDownServer } from '../_lib/server.js';
import { awaitMainUI } from '../_lib/page.js';
import { seedNativeSessionDataRoot } from './_helpers.js';
let server; let seeded; let profiles;
test.describe.configure({ mode: 'serial' });
if (process.env.PW_NATIVE_CHANNEL) test.use({ channel: process.env.PW_NATIVE_CHANNEL });

test.beforeAll(async () => {
    seeded = await seedNativeSessionDataRoot({ suffix: 'p7-cleanup' });
    const root = resolve(seeded.dataRoot, seeded.handle);
    const engine = new FsEngine({ directoriesByHandle: () => ({ root, assets: resolve(root, 'assets') }) });
    profiles = await seedGenerationProfiles({ engine, handle: seeded.handle, endpoint: 'http://127.0.0.1:1/completions', roles: ['narrator'] });
    await engine.close(); server = await startServer({ batchKey: 'generation', scenarioId: 'p7-cleanup', useExistingDataRoot: seeded.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server, { removeData: false }); });

for (const width of [1440, 390]) test(`P7 preferences, exact search and localization at ${width}px`, async ({ page }, info) => {
    test.setTimeout(180000); await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/text-workers', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await awaitMainUI(page, server.baseURL);
    const emptyShellBoundary = await page.evaluate(async () => {
        const { executeFirstPartyGeneration } = await import('/scripts/native/generation-compat.js');
        let legacyCalls = 0;
        try { await executeFirstPartyGeneration({ generateTask: () => { legacyCalls++; } }, 'narrator'); }
        catch (error) { return { code: error.code, legacyCalls }; }
        return { code: 'unexpected-success', legacyCalls };
    });
    expect(emptyShellBoundary).toEqual({ code: 'native_generation_context_required', legacyCalls: 0 });
    const openSettings = () => page.evaluate(() => window.Atria.shell.getWorkspaceHost().openUtility('settings'));
    const shot = name => page.screenshot({ path: info.outputPath(`${name}-${width}.png`), fullPage: true });
    await openSettings(); const settings = page.locator('[data-atria-utility-workspace="settings"]');
    await expect(settings).toContainText('Product preferences only');
    await expect(settings.locator('#user-settings-block, #enableLabMode, #auto_continue_enabled, #example_messages_behavior')).toHaveCount(0);
    await expect(settings.locator('#ui_language_select')).toBeVisible(); await shot('settings');
    await settings.getByText('Advanced appearance controls', { exact: true }).click();
    await expect(settings.locator('#themes')).toBeVisible(); await shot('appearance');
    const motion = settings.locator('#reduced_motion'); const before = await motion.isChecked();
    await motion.setChecked(!before); await expect(motion).toBeChecked({ checked: !before });
    await settings.getByRole('button', { name: 'Open Runtime Routes', exact: true }).click();
    await expect(page.locator('[data-atria-runtime-native="routes"]')).toBeVisible();
    await openSettings(); await expect(settings.locator('#reduced_motion')).toBeChecked({ checked: !before });
    await settings.locator('#reduced_motion').setChecked(before);
    await settings.getByRole('button', { name: 'Prompt Programs', exact: true }).click();
    await expect(page.locator('[data-atri-prompt-library]')).toContainText('P4 program');
    // A user command search invokes the owning exact Library route, not an injected editor.
    await page.locator('[data-atria-utility="command"]').click();
    const search = page.locator('.atria-command-input'); await search.fill(profiles.prompt.promptProgramId);
    await page.locator('.atria-command-result').filter({ hasText: 'P4 program' }).click();
    const selected = page.locator('[data-atri-resource-key][data-selected="true"]'); await expect(selected).toContainText('P4 program'); await expect(selected).toContainText('r1'); await shot('exact-search');
    expect(JSON.parse(await selected.getAttribute('data-atri-resource-key')).resourceId).toBe(profiles.prompt.promptProgramId);
    await openSettings(); await settings.locator('#ui_language_select').selectOption('zh-cn');
    await page.waitForFunction(() => document.documentElement.lang === 'zh-cn' && document.getElementById('preloader') === null);
    await openSettings(); await expect(settings).toContainText('此处仅设置产品偏好'); await shot('settings-zh');
    await settings.getByRole('button', { name: '提示词程序', exact: true }).click();
    const library = page.locator('[data-atri-prompt-library]'); await expect(library.getByRole('heading', { name: '提示词程序', exact: true })).toBeVisible();
    await library.getByRole('button', { name: '新建资源', exact: true }).click(); await expect(library.getByLabel('显示名称', { exact: true })).toBeVisible(); await shot('prompt-zh');
    await page.keyboard.press('Tab'); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
});
