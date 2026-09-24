import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { FsEngine } from '../../../src/storage/engines/fs-engine.js';
import { seedGenerationProfiles } from '../../native/helpers/generation-fixture.js';
import { startServer, tearDownServer } from '../_lib/server.js';
import { disableExtensions } from '../_lib/fixtures.js';
import { seedNativeSessionDataRoot } from './_helpers.js';

let server; let resources;
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
    const seeded = await seedNativeSessionDataRoot({ suffix: 'runtime-redesign' });
    const root = resolve(seeded.dataRoot, seeded.handle);
    const engine = new FsEngine({ directoriesByHandle: () => ({ root, assets: resolve(root, 'assets') }) });
    resources = await seedGenerationProfiles({ engine, handle: seeded.handle, endpoint: 'https://example.invalid/completions', roles: ['narrator', 'narrator', 'memory'] });
    resources.routes[1].displayName = 'Alternate narrator';
    await resources.persistence.saveRuntimeRoute(seeded.handle, resources.routes[1]);
    await engine.close();
    disableExtensions({ dataRoot: seeded.dataRoot, names: ['stable-diffusion'] });
    server = await startServer({ batchKey: 'generation', scenarioId: 'runtime-redesign', useExistingDataRoot: seeded.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server); });

test('Provider model discovery is explicit and preserves metadata provenance on narrow screens', async ({ page }, info) => {
    await boot(page, 320); await open(page, 'models');
    await root(page).getByRole('button', { name: 'Edit P4 model', exact: true }).click();
    const remote = root(page).getByLabel('Remote model ID', { exact: true }); const before = await remote.inputValue();
    const provenance = [{ kind: 'provider-discovery', source: 'Browser provider fixture', observedAt: 1234 }];
    await page.route('**/api/native/generation/connections/probe', route => route.fulfill({ json: { status: 'reachable', models: [{
        remoteModelId: 'discovered-model', displayName: 'Discovered model', limits: { contextTokens: 64000, outputTokens: 4096 },
        capabilities: [{ capability: 'generation.reasoning', state: 'supported', provenance }], provenance,
    }] } }));
    await root(page).getByRole('button', { name: 'Fetch models', exact: true }).click();
    await expect(root(page).getByLabel('Available provider models', { exact: true })).toBeEnabled();
    await expect(remote).toHaveValue(before);
    await root(page).getByLabel('Available provider models', { exact: true }).selectOption('discovered-model');
    await root(page).getByRole('button', { name: 'Use discovered metadata', exact: true }).click();
    await expect(root(page).getByLabel('Context tokens', { exact: true })).toHaveValue('64000');
    await root(page).getByLabel('Context tokens', { exact: true }).fill('32000');
    await root(page).getByLabel('Context tokens', { exact: true }).scrollIntoViewIfNeeded();
    await shot(page, info, 'discovery-metadata-320');
    const saved = page.waitForRequest(req => req.url().endsWith('/configuration/models') && req.method() === 'PUT');
    await root(page).getByRole('button', { name: 'Save', exact: true }).click();
    expect((await saved).postDataJSON()).toMatchObject({ remoteModelId: 'discovered-model', limitProvenance: { contextTokens: [{ kind: 'user-override' }], outputTokens: provenance } });
    await expect(root(page).getByRole('button', { name: 'Edit P4 model', exact: true })).toBeVisible();
});

async function boot(page, width = 1440, locale = 'en') {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(locale => localStorage.setItem('language', locale), locale);
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: {} }));
    await page.goto(server.baseURL);
    await page.waitForFunction(() => performance.getEntriesByName('[init] complete').length > 0, null, { timeout: 45000 });
}
const root = page => page.locator('[data-atria-runtime-native]');
async function open(page, section) { await page.evaluate(section => window.Atria.shell.getWorkspaceHost().openRuntimeSection(section), section); }
async function shot(page, info, name) {
    await page.screenshot({ path: info.outputPath(name + '.png'), animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await root(page).evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
}
async function light(page) {
    await page.evaluate(() => {
        document.documentElement.style.setProperty('--SmartThemeBlurTintColor', '#f6f6f8');
        document.documentElement.style.setProperty('--SmartThemeBodyColor', '#1c1c1f');
    });
    await expect(page.locator('html')).toHaveAttribute('data-atria-appearance', 'light');
}

test('Responsive editor moves across the real 719px boundary, traps focus and follows the keyboard viewport', async ({ page }, info) => {
    await boot(page, 900); await open(page, 'connections');
    await page.getByLabel('Runtime section', { exact: true }).selectOption('models');
    await root(page).getByRole('button', { name: 'Edit P4 model', exact: true }).click();
    await shot(page, info, 'model-medium');
    await page.setViewportSize({ width: 719, height: 900 });
    await expect(root(page)).toHaveAttribute('role', 'dialog');
    expect(await page.locator('.atria-app-shell').evaluate(el => el.inert)).toBe(true);
    await root(page).getByLabel('Display name').fill('Retained across resize');
    await root(page).getByRole('button', { name: 'Back to models' }).focus();
    await page.keyboard.press('Shift+Tab');
    await expect(root(page).getByRole('button', { name: 'Save', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(root(page).getByRole('button', { name: 'Back to models' })).toBeFocused();
    await page.setViewportSize({ width: 900, height: 900 });
    await expect(root(page)).not.toHaveAttribute('role', 'dialog');
    expect(await page.locator('.atria-app-shell').evaluate(el => el.inert)).toBe(false);
    await expect(root(page).getByLabel('Display name')).toHaveValue('Retained across resize');
    await page.setViewportSize({ width: 320, height: 900 }); await light(page);
    await root(page).getByLabel('Remote model ID').focus();
    await page.evaluate(() => {
        document.documentElement.style.setProperty('--atri-safe-area-top', '20px');
        document.documentElement.style.setProperty('--atri-safe-area-bottom', '18px');
        Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => 420 });
        window.visualViewport.dispatchEvent(new Event('resize'));
    });
    await expect(root(page)).toHaveAttribute('data-atria-keyboard', 'open');
    await expect.poll(async () => (await root(page).getByLabel('Remote model ID').boundingBox()).y).toBeGreaterThanOrEqual(0);
    expect((await root(page).getByLabel('Remote model ID').boundingBox()).y + (await root(page).getByLabel('Remote model ID').boundingBox()).height).toBeLessThanOrEqual(420);
    await shot(page, info, 'model-keyboard-light-320');
    await page.keyboard.press('Escape');
    await expect(root(page).getByLabel('Filter models')).toBeFocused();
    expect(await page.locator('.atria-app-shell').evaluate(el => el.inert)).toBe(false);
});

test('Model capability overrides save through Native configuration and retain exact identity', async ({ page }, info) => {
    await boot(page); await open(page, 'models');
    await root(page).getByRole('button', { name: 'Edit P4 model', exact: true }).click();
    await root(page).getByLabel('generation.tools', { exact: true }).selectOption('unsupported');
    await root(page).getByLabel('generation.tools', { exact: true }).scrollIntoViewIfNeeded();
    await shot(page, info, 'model-capabilities');
    const request = page.waitForRequest(req => req.url().endsWith('/configuration/models') && req.method() === 'PUT');
    await root(page).getByRole('button', { name: 'Save', exact: true }).click();
    const payload = (await request).postDataJSON();
    expect(payload.modelProfileId).toBe(resources.model.modelProfileId);
    expect(payload.connectionProfileRef).toEqual(resources.model.connectionProfileRef);
    expect(payload.capabilities).toContainEqual({ capability: 'generation.tools', state: 'unsupported', provenance: [{ kind: 'user-override', source: 'Runtime Models' }] });
    await expect(root(page).getByRole('button', { name: 'Edit P4 model', exact: true })).toBeVisible();
});

test('Profile validation retains draft and an immutable save does not repin routes', async ({ page }, info) => {
    await boot(page, 320); await light(page); await open(page, 'profiles');
    await root(page).getByRole('button', { name: 'Edit P4 generation', exact: true }).click();
    await root(page).getByLabel('Stop sequences (JSON array)').fill('not json');
    await root(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(root(page).getByLabel('Stop sequences (JSON array)')).toBeFocused();
    await shot(page, info, 'profile-validation-light-320');
    await root(page).getByLabel('Stop sequences (JSON array)').fill('["END"]');
    await root(page).getByLabel('Reasoning effort (OpenAI / Anthropic adaptive)', { exact: true }).selectOption('high');
    await root(page).getByLabel('Cache key (OpenAI)', { exact: true }).fill('native-ux-profile');
    await root(page).getByLabel('Cache retention (OpenAI)', { exact: true }).selectOption('24h');
    await root(page).getByLabel('Cache retention (OpenAI)', { exact: true }).scrollIntoViewIfNeeded();
    await shot(page, info, 'profile-provider-controls-320');
    await root(page).getByLabel('New exact revision').fill('phase5-review');
    const savedProfile = page.waitForRequest(req => req.url().endsWith('/configuration/profiles') && req.method() === 'PUT');
    await root(page).getByRole('button', { name: 'Save', exact: true }).click();
    expect((await savedProfile).postDataJSON()).toMatchObject({ reasoning: { effort: 'high' }, cache: { key: 'native-ux-profile', retention: '24h' } });
    await expect(root(page).getByRole('button', { name: 'Edit P4 generation', exact: true })).toBeVisible();
    await open(page, 'routes');
    await root(page).getByRole('button', { name: 'Edit narrator', exact: true }).click();
    expect(JSON.parse(await root(page).getByLabel('Generation — exact revision').inputValue()).revision).toBe('r1');
    await root(page).getByLabel('Generation — exact revision').scrollIntoViewIfNeeded();
    await shot(page, info, 'route-exact-light-320');
});

test('Fallback edits preserve role validation, ordering, failed draft and the same route identity', async ({ page }, info) => {
    await boot(page); await open(page, 'routes');
    await expect(root(page)).toContainText('Ambiguous primary routes'); await shot(page, info, 'routes-desktop');
    await root(page).getByRole('button', { name: 'Edit narrator', exact: true }).click();
    await root(page).getByLabel('Add fallback route').selectOption(resources.routes[2].runtimeRouteId);
    await root(page).getByRole('button', { name: 'Add fallback', exact: true }).click();
    await root(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(root(page).getByRole('alert')).toBeFocused();
    await shot(page, info, 'route-fallback-error');
    await root(page).getByRole('button', { name: 'Remove fallback', exact: true }).click();
    await root(page).getByLabel('Add fallback route').selectOption(resources.routes[1].runtimeRouteId);
    await root(page).getByRole('button', { name: 'Add fallback', exact: true }).click();
    const request = page.waitForRequest(req => req.url().endsWith('/configuration/routes') && req.method() === 'PUT');
    await root(page).getByRole('button', { name: 'Save', exact: true }).click();
    const payload = (await request).postDataJSON();
    expect(payload.runtimeRouteId).toBe(resources.routes[0].runtimeRouteId);
    expect(payload.fallbackRouteRefs).toEqual([{ scope: 'player', runtimeRouteId: resources.routes[1].runtimeRouteId }]);
    expect(payload.promptProgramRef).toEqual(resources.routes[0].promptProgramRef);
    await expect(root(page).getByRole('button', { name: 'Edit narrator', exact: true })).toBeVisible();
    await expect(root(page)).not.toContainText('Ambiguous primary routes');
});

test('Diagnostics reports missing pinned context locally without sending a generation request', async ({ page }, info) => {
    await boot(page, 900); await light(page); await open(page, 'diagnostics');
    await root(page).getByLabel('Route to preview').selectOption(resources.routes[0].runtimeRouteId);
    let sends = 0; page.on('request', req => { if (/\/api\/native\/generation\/generate$/.test(req.url())) sends++; });
    await root(page).getByRole('button', { name: 'Compile preview' }).click();
    await expect(root(page).getByRole('alert')).toBeFocused();
    await expect(root(page).getByRole('alert')).toContainText('Project ID');
    expect(sends).toBe(0); await shot(page, info, 'diagnostics-error-medium-light');
});

test('Chinese compact Runtime section picker, large text, filter empty and connection form', async ({ page }, info) => {
    await boot(page, 320, 'zh-cn'); await light(page); await open(page, 'connections');
    await page.evaluate(() => document.documentElement.style.setProperty('--mainFontSize', '20px'));
    const search = root(page).locator('input[type="search"]');
    await search.fill('absent'); await expect(root(page).locator('.atri-runtime-list')).toContainText('没有');
    await search.fill(''); await shot(page, info, 'connections-zh-large-320');
    await root(page).locator('.atri-runtime-row button').first().click();
    await expect(root(page).getByText('身份验证', { exact: true })).toBeVisible();
    await root(page).locator('select[name="Stored Secret"]').scrollIntoViewIfNeeded();
    await shot(page, info, 'connection-zh-light-320');
});
