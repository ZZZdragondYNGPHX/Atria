import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { FsEngine } from '../../../src/storage/engines/fs-engine.js';
import { seedGenerationProfiles } from '../../native/helpers/generation-fixture.js';
import { startServer, tearDownServer } from '../_lib/server.js';
import { awaitMainUI } from '../_lib/page.js';
import { seedNativeSessionDataRoot } from './_helpers.js';
let server;
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
    const seeded = await seedNativeSessionDataRoot({ suffix: 'native-localization' });
    const root = resolve(seeded.dataRoot, seeded.handle);
    const engine = new FsEngine({ directoriesByHandle: () => ({ root, assets: resolve(root, 'assets') }) });
    const resources = await seedGenerationProfiles({ engine, handle: seeded.handle, endpoint: 'https://example.invalid/completions' });
    resources.model.displayName = 'Save';
    await resources.persistence.saveModelProfile(seeded.handle, resources.model);
    await engine.close();
    server = await startServer({ batchKey: 'generation', scenarioId: 'native-localization', useExistingDataRoot: seeded.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server); });

for (const language of ['zh-cn', 'zh-tw']) test(language + ' localizes loading, dynamic Runtime, Library, search and recovery while preserving user names', async ({ page }, info) => {
    await page.setViewportSize({ width: language === 'zh-cn' ? 390 : 1440, height: 900 });
    await page.addInitScript(lang => localStorage.setItem('language', lang), language);
    await awaitMainUI(page, server.baseURL);
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openRuntimeSection('routes'));
    const runtime = page.locator('[data-atria-runtime-native]');
    await expect(runtime.locator('.atri-runtime-row')).toContainText('回退路由');
    await expect(runtime).not.toContainText('fallback route');
    await expect(runtime).not.toContainText('Set up Secret');
    await expect(runtime).toContainText(language === 'zh-cn' ? '配置密钥' : '配置金鑰');
    await page.screenshot({ path: info.outputPath('runtime-' + language + '.png') });
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openRuntimeSection('models'));
    await expect(runtime.getByRole('heading', { name: 'Save', exact: true })).toBeVisible();
    await expect(runtime.locator('.atri-runtime-row')).toContainText('p4-fixture');
    await expect(runtime.locator('.atri-runtime-row')).not.toContainText('context tokens');
    const world = await page.evaluate(async () => {
        const { nativeProductClient: client } = await import('/scripts/native/product-client.js');
        const world = await client.createWorld('Play');
        await window.Atria.shell.getWorkspaceHost().refreshSearch();
        return world;
    });
    await page.keyboard.press('Control+k');
    await page.locator('.atria-command-input').fill('Play');
    const result = page.locator('[data-atria-command-id="resource.world.' + world.worldId + '"]');
    await expect(result.locator('.atria-command-result__title')).toHaveText('Play');
    await result.click();
    await expect(page.locator('[data-atria-world-detail]').getByRole('heading', { name: 'Play', exact: true })).toBeVisible();
    await expect(page.locator('.atria-toolbar__title')).toHaveText('Play');
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    await page.route('**/api/native/generation/configuration', async route => { await pending; await route.fulfill({ status: 503, json: { error: 'fixture_unavailable' } }); });
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openRuntimeSection('connections'));
    await expect(runtime).toContainText(language === 'zh-cn' ? '加载' : '載入');
    release();
    await expect(runtime.getByRole('alert')).toContainText(/请求|請求/);
    await expect(runtime).not.toContainText('Runtime could not');
    await page.screenshot({ path: info.outputPath('recovery-' + language + '.png') });
    await page.unroute('**/api/native/generation/configuration');
    await runtime.getByRole('button', { name: language === 'zh-cn' ? '重试加载' : '重試載入', exact: true }).click();
    await expect(runtime.locator('.atri-runtime-row')).toHaveCount(1);
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openUtility('plugins'));
    await expect(page.locator('[data-atria-plugin-surface="work"]')).toContainText(language === 'zh-cn' ? '作品插件' : '作品外掛');
    await expect(page.locator('[data-atria-plugin-surface="global"]')).toContainText(language === 'zh-cn' ? '全局插件' : '全域外掛');
});
