import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { FsEngine } from '../../../src/storage/engines/fs-engine.js';
import { seedGenerationProfiles } from '../../native/helpers/generation-fixture.js';
import { startServer, tearDownServer } from '../_lib/server.js';
import { awaitMainUI } from '../_lib/page.js';
import { seedNativeSessionDataRoot, createAndOpenNativeSession } from './_helpers.js';
let server; let seeded; let resources;
test.describe.configure({ mode: 'serial' });
if (process.env.PW_NATIVE_CHANNEL) test.use({ channel: process.env.PW_NATIVE_CHANNEL });

test.beforeAll(async () => {
    seeded = await seedNativeSessionDataRoot({ suffix: 'p5-runtime' });
    const root = resolve(seeded.dataRoot, seeded.handle);
    const engine = new FsEngine({ directoriesByHandle: () => ({ root, assets: resolve(root, 'assets') }) });
    resources = await seedGenerationProfiles({ engine, handle: seeded.handle, endpoint: 'http://127.0.0.1:1/completions' });
    await engine.close();
    server = await startServer({ batchKey: 'generation', scenarioId: 'p5-runtime', useExistingDataRoot: seeded.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server, { removeData: false }); });

for (const width of [1440, 390]) {
    test(`Runtime edit and compile at ${width}px`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await awaitMainUI(page, server.baseURL);
        await createAndOpenNativeSession(page, seeded.start);
        const open = section => page.evaluate(section => window.Atria.shell.getWorkspaceHost().openRuntimeSection(section), section);
        const shot = name => page.screenshot({ path: info.outputPath(`${name}-${width}.png`), fullPage: true });
        await open('routes');
        const root = page.locator('[data-atria-runtime-native]');
        await expect(root.getByRole('button', { name: 'Edit narrator', exact: true })).toBeVisible(); await shot('routes');
        await root.getByRole('button', { name: 'Edit narrator', exact: true }).click();
        await expect(root.getByRole('heading', { name: 'Edit route', exact: true })).toBeFocused();
        await expect(root.getByLabel('Model', { exact: true })).toHaveValue(resources.model.modelProfileId); await shot('route-editor');
        if (width === 390) {
            expect(await root.evaluate(el => Math.round(el.getBoundingClientRect().height))).toBe(844);
            expect(await root.evaluate(el => el.contains(document.elementFromPoint(150, 300)))).toBe(true);
        }


        await root.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(root.getByRole('button', { name: 'Edit narrator', exact: true })).toBeVisible();
        await root.getByRole('button', { name: 'New route', exact: true }).click();
        await root.getByLabel('Display name', { exact: true }).fill('Search route ' + width);
        await root.getByLabel('Role', { exact: true }).selectOption('role.search');
        await root.getByLabel('Model', { exact: true }).selectOption(resources.model.modelProfileId);
        await root.getByLabel('Generation — exact revision').selectOption({ index: 1 });
        await root.getByLabel('Prompt — exact revision').selectOption({ index: 1 });
        await root.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(root.getByRole('button', { name: 'Edit Search route ' + width, exact: true })).toBeVisible();
        await root.getByRole('button', { name: 'Edit narrator', exact: true }).click();

        await page.keyboard.press('Escape'); await expect(root.getByLabel('Filter routes')).toBeFocused();
        await open('connections'); await root.getByRole('button', { name: 'New connection', exact: true }).click();
        await root.getByLabel('Display name', { exact: true }).fill('New connection ' + width);
        await root.getByLabel('Completions endpoint URL').fill('https://example.invalid/v1/chat/completions');
        await root.getByRole('button', { name: 'Create Secret', exact: true }).click();
        await root.getByLabel('Secret label', { exact: true }).fill('Test provider ' + width);
        await root.getByLabel('API key', { exact: true }).fill('synthetic-native-test-key');
        await root.getByRole('button', { name: 'Store Secret', exact: true }).click();
        await expect(root.getByLabel('Stored Secret', { exact: true })).not.toHaveValue('');
        await page.route('**/api/native/generation/configuration/connections', route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'native_generation_configuration_invalid' }) }));
        await root.getByRole('button', { name: 'Save', exact: true }).click(); await expect(root.getByRole('alert')).toContainText('Save failed');
        await expect(root.getByLabel('Display name', { exact: true })).toHaveValue('New connection ' + width); await shot('save-error');
        await page.unroute('**/api/native/generation/configuration/connections');
        await root.getByRole('button', { name: 'Save', exact: true }).click(); await expect(root.getByRole('button', { name: 'Edit New connection ' + width })).toBeVisible();
        await expect(root.locator('#rm_api_block')).toHaveCount(0);
        await open('models'); await root.getByRole('button', { name: 'Edit P4 model', exact: true }).click(); await expect(root).toContainText('Capabilities'); await shot('model');
        await root.getByRole('button', { name: 'Back to models', exact: true }).click();
        await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openLibrarySection('generation-profiles'));
        const library = page.locator('.atri-prompt-library');
        await library.getByRole('button', { name: 'New revision', exact: true }).first().click();
        await library.getByLabel('Maximum output tokens').fill('256'); await library.getByRole('button', { name: 'Save revision', exact: true }).click();
        await expect(library.getByRole('status')).toContainText('Saved immutable Library revision.');
        await open('diagnostics'); await root.getByLabel('Route to preview').selectOption(resources.routes[0].runtimeRouteId);
        const before = await page.evaluate(() => window.Atria.nativeSessionRuntime.snapshot.revision.revisionId);
        await root.getByRole('button', { name: 'Compile preview', exact: true }).click(); await expect(root).toContainText('Compiled preview — no request sent');
        await root.getByText('Prompt provenance', { exact: true }).click(); await shot('preview');
        expect(await page.evaluate(() => window.Atria.nativeSessionRuntime.snapshot.revision.revisionId)).toBe(before);
        await page.evaluate(id => window.Atria.shell.getWorkspaceHost().openRuntimeSection('models', id), resources.model.modelProfileId);
        await expect(root.getByLabel('Remote model ID')).toHaveValue('p4-fixture');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        expect(errors).toEqual([]);
    });

    test(`Runtime loading empty and retry at ${width}px`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 }); await awaitMainUI(page, server.baseURL);
        await page.route('**/api/native/generation/configuration', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'native_generation_configuration_unavailable' }) }));
        await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openRuntimeSection('routes'));
        const root = page.locator('[data-atria-runtime-native]'); await expect(root.getByRole('alert')).toBeVisible();
        await page.screenshot({ path: info.outputPath(`load-error-${width}.png`), fullPage: true });
        let release; const pending = new Promise(done => { release = done; }); await page.unroute('**/api/native/generation/configuration');
        await page.route('**/api/native/generation/configuration', async route => { await pending; await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ routes: [], models: [], connections: [], profiles: [], resources: [] }) }); });
        await root.getByRole('button', { name: 'Retry loading' }).click(); await expect(root).toContainText('Loading Native Runtime');
        await page.screenshot({ path: info.outputPath(`loading-${width}.png`), fullPage: true }); release();
        await expect(root).toContainText('No routes yet'); await page.screenshot({ path: info.outputPath(`empty-${width}.png`), fullPage: true });
    });
}
