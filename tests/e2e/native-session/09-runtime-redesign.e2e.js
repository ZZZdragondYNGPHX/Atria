import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { FsEngine } from '../../../src/storage/engines/fs-engine.js';
import { createNativeId } from '../../../src/native/identity.js';
import { seedGenerationProfiles } from '../../native/helpers/generation-fixture.js';
import { startServer, tearDownServer } from '../_lib/server.js';

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

    server = await startServer({ batchKey: 'generation', scenarioId: 'runtime-redesign', useExistingDataRoot: seeded.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server); });

test('Runtime setup identifies missing Secret and opens its owner at 320px', async ({ page }, info) => {
    await boot(page, 320); await open(page, 'routes');
    const setup = root(page).locator('details').filter({ has: page.getByText('Runtime setup', { exact: true }) });
    await expect(setup.getByRole('button', { name: 'Set up Secret', exact: true })).toBeVisible();
    await expect(setup.locator('li')).toHaveCount(6);
    await shot(page, info, 'runtime-setup-missing-secret-320');
    await setup.getByRole('button', { name: 'Set up Secret', exact: true }).click();
    await expect(root(page).getByRole('button', { name: 'New connection', exact: true })).toBeVisible();
});

test('Runtime cleanup blocks references, duplicates safely and restores archived exact Library resources', async ({ page }, info) => {
    await boot(page, 320); await open(page, 'models');
    await root(page).getByRole('button', { name: 'Edit P4 model', exact: true }).click();
    await root(page).getByRole('button', { name: 'Delete', exact: true }).click();
    await page.locator('dialog.popup[open] .popup-button-ok').click();
    await expect(root(page).getByRole('heading', { name: 'Used By', exact: true })).toBeVisible();
    await expect(root(page).locator('.atri-runtime-status')).toContainText('narrator');
    await shot(page, info, 'runtime-delete-blocked-320');
    await root(page).getByRole('button', { name: 'Duplicate', exact: true }).click();
    await root(page).getByRole('button', { name: 'Save', exact: true }).click();
    await root(page).getByRole('button', { name: 'Edit P4 model Copy', exact: true }).click();
    await root(page).getByRole('button', { name: 'Delete', exact: true }).click();
    await page.locator('dialog.popup[open] .popup-button-ok').click();
    await expect(root(page).getByRole('button', { name: 'Edit P4 model Copy', exact: true })).toHaveCount(0);
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openLibrarySection('generation-profiles'));
    const library = page.locator('.atri-prompt-library');
    await library.getByRole('button', { name: 'Used By', exact: true }).click();
    await expect(library.getByRole('status')).toContainText('narrator');
    await library.getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(library.locator('.atri-prompt-resource')).toHaveCount(0);
    await library.getByLabel('Visibility', { exact: true }).selectOption('archived');
    await expect(library.locator('.atri-prompt-resource')).toHaveCount(1);
    await page.screenshot({ path: info.outputPath('library-archive-320.png') });
    await library.getByRole('button', { name: 'Restore from archive', exact: true }).click();
    await library.getByLabel('Visibility', { exact: true }).selectOption('active');
    await expect(library.locator('.atri-prompt-resource')).toHaveCount(1);
});

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

test('Profile validation retains draft in Library and an immutable save does not repin routes', async ({ page }, info) => {
    await boot(page, 320); await light(page);
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openLibrarySection('generation-profiles'));
    const library = page.locator('.atri-prompt-library');
    await library.getByRole('button', { name: 'New revision', exact: true }).first().click();
    await library.getByLabel('Stop sequences (JSON array)').fill('not json');
    await library.getByRole('button', { name: 'Save revision', exact: true }).click();
    await expect(library.getByRole('alert')).toContainText('JSON array');
    await expect(library.getByLabel('Stop sequences (JSON array)')).toHaveValue('not json');
    await library.getByLabel('Stop sequences (JSON array)').fill('["END"]');
    await library.getByLabel('Reasoning effort (OpenAI / Anthropic adaptive)', { exact: true }).selectOption('high');
    await library.getByLabel('Cache key (OpenAI)', { exact: true }).fill('native-ux-profile');
    await library.getByLabel('Cache retention (OpenAI)', { exact: true }).selectOption('24h');
    await library.getByLabel('Cache retention (OpenAI)', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('library-provider-controls-320.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await library.getByLabel('Exact revision', { exact: true }).fill('phase5-review');
    const savedProfile = page.waitForRequest(req => req.url().endsWith('/generation/resources') && req.method() === 'POST');
    await library.getByRole('button', { name: 'Save revision', exact: true }).click();
    expect((await savedProfile).postDataJSON().resource).toMatchObject({ reasoning: { effort: 'high' }, cache: { key: 'native-ux-profile', retention: '24h' } });
    await expect(library.getByRole('status')).toContainText('Saved immutable Library revision.');
    await open(page, 'routes');
    await root(page).getByRole('button', { name: 'Edit narrator', exact: true }).click();
    expect(JSON.parse(await root(page).getByLabel('Generation — exact revision').inputValue()).revision).toBe('r1');
    await root(page).getByRole('button', { name: 'Open Generation Profiles', exact: true }).click();
    await expect(page.locator('.atri-prompt-library')).toBeVisible();
});

test('Fallback edits filter roles and preserve ordering and route identity', async ({ page }, info) => {
    await boot(page); await open(page, 'routes');
    await expect(root(page)).toContainText('Ambiguous primary routes'); await shot(page, info, 'routes-desktop');
    await root(page).getByRole('button', { name: 'Edit narrator', exact: true }).click();
    await expect(root(page).getByLabel('Add fallback route').locator(`option[value="${resources.routes[2].runtimeRouteId}"]`)).toHaveCount(0);
    await root(page).getByLabel('Add fallback route').selectOption(resources.routes[1].runtimeRouteId);
    await root(page).getByRole('button', { name: 'Add fallback', exact: true }).click();
    await root(page).getByLabel('Role', { exact: true }).selectOption('role.memory');
    await expect(root(page).getByRole('button', { name: 'Remove fallback', exact: true })).toHaveCount(0);
    await expect(root(page)).toContainText('Incompatible fallbacks were removed');
    await root(page).getByLabel('Role', { exact: true }).selectOption('role.narrator');
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
    await expect(root(page).getByRole('alert')).toContainText('Build Project');
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

test('Diagnostics selects a real Build Project and submits its exact revision at 320px', async ({ page }, info) => {
    await boot(page, 320); await light(page);
    const projectId = createNativeId('project');
    const source = { format: 'atria-project-source', schemaVersion: 1,
        project: { projectId, packageId: createNativeId('package'), displayName: 'Diagnostics world', createdAt: 10, updatedAt: 10 },
        package: { name: 'Diagnostics world', version: '1.0.0', actors: [], capabilities: ['narrative'], permissions: [], entryPoints: [{ entryPointId: createNativeId('entryPoint'), displayName: 'Main', actorIds: [], worldIds: [], knowledgeBindingIds: [] }] },
        resources: [], worlds: [], knowledge: [], knowledgeBindings: [], assetFiles: [], dependencies: { worlds: [], knowledge: [], knowledgeBindings: [], assets: [], resources: [] } };
    const exact = await page.evaluate(async source => {
        const headers = window.Atria.getContext().getRequestHeaders();
        const created = await fetch('/api/native/studio/projects', { method: 'POST', headers, body: JSON.stringify({ source }) });
        if (!created.ok) throw new Error(await created.text());
        const result = await fetch('/api/native/studio/projects/' + source.project.projectId + '/revision', { headers });
        return (await result.json()).revision;
    }, source);
    await open(page, 'diagnostics');
    await expect(root(page).getByLabel('Build Project', { exact: true })).toBeEnabled();
    await root(page).getByLabel('Build Project', { exact: true }).selectOption(projectId);
    await expect(root(page).getByLabel('Exact Project revision', { exact: true })).toHaveValue(exact);
    await root(page).getByLabel('Route to preview').selectOption(resources.routes[0].runtimeRouteId);
    const request = page.waitForRequest('**/api/native/generation/preview');
    await root(page).getByRole('button', { name: 'Compile preview' }).click();
    expect((await request).postDataJSON()).toMatchObject({ projectId, revision: exact });
    await expect(root(page).getByRole('heading', { name: 'Compiled preview — no request sent' })).toBeVisible();
    await shot(page, info, 'diagnostics-build-picker-320');
});
