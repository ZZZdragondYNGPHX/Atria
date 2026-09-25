import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { FsEngine } from '../../../src/storage/engines/fs-engine.js';
import { seedGenerationProfiles } from '../../native/helpers/generation-fixture.js';
import { startServer, tearDownServer } from '../_lib/server.js';

import { awaitMainUI } from '../_lib/page.js';
import { seedNativeSessionDataRoot } from './_helpers.js';

let server; let routes;

test.beforeAll(async () => {
    const seeded = await seedNativeSessionDataRoot({ suffix: 'native-agent-routes' });
    const root = resolve(seeded.dataRoot, seeded.handle);
    const engine = new FsEngine({ directoriesByHandle: () => ({ root, assets: resolve(root, 'assets') }) });
    const resources = await seedGenerationProfiles({ engine, handle: seeded.handle, endpoint: 'https://example.invalid/completions', roles: ['orchestrator', 'orchestrator', 'memory', 'memory'] });
    routes = resources.routes;
    routes[0].displayName = 'Writer'; routes[1].displayName = 'Reviewer';
    await resources.persistence.saveRuntimeRoute(seeded.handle, routes[0]);
    await resources.persistence.saveRuntimeRoute(seeded.handle, routes[1]);
    await engine.close();

    server = await startServer({ batchKey: 'generation', scenarioId: 'native-agent-routes', useExistingDataRoot: seeded.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server); });

test('Retrieval creates a stored Secret and a rerank revision without a legacy profile', async ({ page }) => {
    page.setDefaultTimeout(15000);
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await awaitMainUI(page, server.baseURL);
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openRuntimeSection('retrieval'));
    const root = page.locator('[data-atria-runtime-native="retrieval"]');
    await root.getByRole('button', { name: 'New retrieval resource', exact: true }).click();
    await root.getByLabel('Display name', { exact: true }).fill('Native Rerank');
    await root.getByLabel('Retrieval task', { exact: true }).selectOption('rerank');
    await root.getByLabel('Provider', { exact: true }).selectOption('cohere');
    await root.getByLabel('Model', { exact: true }).fill('rerank-v3.5');
    await root.getByLabel('Endpoint URL', { exact: true }).fill('https://example.invalid/v2');
    await root.getByText('Create stored Secret', { exact: true }).click();
    await root.getByLabel('Secret label', { exact: true }).fill('Retrieval test');
    await root.getByLabel('API key', { exact: true }).fill('fixture-only-value');
    await root.getByRole('button', { name: 'Store Secret', exact: true }).click();
    await expect(root).toContainText('Secret stored.');
    await root.getByRole('button', { name: 'Save exact revision', exact: true }).click();
    await expect(root.locator('.atri-runtime-row').filter({ hasText: 'Native Rerank' })).toBeVisible();
    const profiles = await page.evaluate(async () => (await import('/scripts/native/retrieval-client.js')).listRetrievalProfiles());
    const profile = profiles.find(item => item.displayName === 'Native Rerank');
    expect(profile).toMatchObject({ mode: 'rerank', source: 'cohere', secretRef: { secretId: expect.any(String) } });
    expect(JSON.stringify(profile)).not.toContain('fixture-only-value');
});

test('Runtime retrieval creates immutable revisions and Memory keeps exact selections at 320px', async ({ page }, info) => {
    page.setDefaultTimeout(15000);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await awaitMainUI(page, server.baseURL);
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openRuntimeSection('retrieval'));
    const root = page.locator('[data-atria-runtime-native="retrieval"]');
    await root.getByRole('button', { name: 'New retrieval resource', exact: true }).click();
    await root.getByLabel('Display name', { exact: true }).fill('Local Memory');
    await root.getByLabel('Provider', { exact: true }).selectOption('webllm');
    await root.getByLabel('Model', { exact: true }).fill('local-model-a');
    await expect(root.getByLabel('Stored Secret', { exact: true })).toBeHidden();
    await root.getByRole('button', { name: 'Back to retrieval', exact: true }).focus();
    await page.keyboard.press('Shift+Tab');
    await expect(root.getByRole('button', { name: 'Save exact revision', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(root.getByRole('button', { name: 'Back to retrieval', exact: true })).toBeFocused();
    await page.screenshot({ path: info.outputPath('retrieval-editor-320.png') });
    let releaseSave; const pendingSave = new Promise(resolve => { releaseSave = resolve; });
    await page.route('**/api/native/generation/retrieval', async route => { if (route.request().method() === 'POST') await pendingSave; await route.continue(); });
    await root.getByRole('button', { name: 'Save exact revision', exact: true }).click();
    await expect(root.getByRole('button', { name: 'Back to retrieval', exact: true })).toBeDisabled();
    await expect(root.getByLabel('Display name', { exact: true })).toBeDisabled();
    releaseSave();
    await expect(root.locator('.atri-runtime-row').filter({ hasText: 'Local Memory' })).toHaveCount(1);
    await root.locator('.atri-runtime-row').filter({ hasText: 'Local Memory' }).getByRole('button', { name: 'Create revision', exact: true }).click();
    await root.getByLabel('Model', { exact: true }).fill('local-model-b');
    await root.getByRole('button', { name: 'Save exact revision', exact: true }).click();
    await expect(root.locator('.atri-runtime-row').filter({ hasText: 'Local Memory' })).toHaveCount(2);
    const profiles = await page.evaluate(async () => (await import('/scripts/native/retrieval-client.js')).listRetrievalProfiles());
    const first = profiles.find(item => item.model === 'local-model-a');
    const second = profiles.find(item => item.model === 'local-model-b');
    expect(first.retrievalProfileId).toBe(second.retrievalProfileId); expect(first.revision).not.toBe(second.revision);
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openAgentSection('memory'));
    const workspace = page.locator('#agent-memory-workspace');
    await workspace.getByRole('button', { name: 'Maintenance', exact: true }).click();
    const form = workspace.locator('form').filter({ has: page.getByRole('heading', { name: 'Memory retrieval', exact: true }) });
    const ref = { scope: 'player', retrievalProfileId: first.retrievalProfileId, revision: first.revision };
    await expect(form.getByLabel('Embedding revision', { exact: true })).toBeEnabled();
    await form.getByLabel('Embedding revision', { exact: true }).selectOption(JSON.stringify(ref));
    await form.getByRole('button', { name: 'Save Memory retrieval', exact: true }).click();
    await expect(form).toContainText('Memory retrieval saved');
    expect(await page.evaluate(() => window.Atria.getContext().capabilitySettings.memory_graph.nativeRetrieval)).toEqual({ embed: ref });
    await form.getByRole('button', { name: 'Refresh retrieval resources', exact: true }).click();
    await expect(form.getByLabel('Embedding revision', { exact: true })).toHaveValue(JSON.stringify(ref));
    await page.screenshot({ path: info.outputPath('memory-retrieval-320.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Memory saves task-specific Native routes from its existing workspace', async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await awaitMainUI(page, server.baseURL);
    await page.evaluate(() => Object.assign(window.Atria.getContext().capabilitySettings.memory_graph, { recallApiPresetName: 'obsolete', extractPresetName: 'obsolete', ragRewriteLlmPresetName: 'obsolete' }));
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openAgentSection('memory'));
    const workspace = page.locator('#agent-memory-workspace');
    await workspace.getByRole('button', { name: 'Maintenance', exact: true }).click();
    const form = workspace.locator('form').filter({ has: page.getByRole('heading', { name: 'Memory Runtime Routes', exact: true }) });
    const tasks = ['Recall route', 'Extraction route', 'Schema assistance route', 'RAG rewrite route'];
    for (const [index, task] of tasks.entries()) {
        const select = form.getByLabel(task, { exact: true }); await expect(select).toBeEnabled();
        await expect(select.locator('option', { hasText: 'Writer' })).toHaveCount(0);
        await select.selectOption(routes[2 + index % 2].runtimeRouteId);
    }
    await form.getByRole('button', { name: 'Save Memory routes', exact: true }).click();
    await expect(form).toContainText('Memory routes saved');
    const selected = await page.evaluate(() => window.Atria.getContext().capabilitySettings.memory_graph.nativeRoutes);
    expect(Object.values(selected)).toEqual([2, 3, 2, 3].map(index => ({ scope: 'player', runtimeRouteId: routes[index].runtimeRouteId })));
    const settings = await page.evaluate(() => window.Atria.getContext().capabilitySettings.memory_graph);
    for (const key of ['recallApiPresetName', 'extractPresetName', 'ragRewriteLlmPresetName']) expect(settings).not.toHaveProperty(key);
    await workspace.getByText('Advanced memory settings and maintenance', { exact: true }).click();
    await workspace.getByText('Extraction and organization', { exact: true }).click();
    await expect(workspace.locator('.workspace-hint:visible').filter({ hasText: 'Configure this task’s Memory Runtime Route in Maintenance.' })).toBeVisible();
    await expect(workspace.locator('select[id$="_api_preset"], select[id$="_llm_preset"], #atria_rpg_memory_embedding_profile, #atria_rpg_memory_rerank_profile')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('memory-native-routes-390.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test('Agents saves distinct exact role routes at 320px', async ({ page }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await awaitMainUI(page, server.baseURL);
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openAgentSection('orchestration'));
    const workspace = page.locator('#agent-memory-workspace');
    await expect(workspace.locator('.workspace-agent-card').first()).toBeVisible();
    await workspace.locator('.workspace-more-menu > summary').click();
    await workspace.getByRole('button', { name: 'Duplicate', exact: true }).click();
    const inspector = workspace.locator('.atria-workspace-inspector');
    for (let index = 0; index < 2; index++) {
        await workspace.locator('.workspace-agent-card').nth(index).click();
        const select = inspector.getByLabel('Native Runtime Route', { exact: true });
        await expect(select).toBeEnabled();
        await expect(select.locator('option', { hasText: 'memory' })).toHaveCount(0);
        await select.selectOption(routes[index].runtimeRouteId);
        await page.screenshot({ path: info.outputPath('agent-route-' + index + '-320.png') });
        await inspector.getByRole('button', { name: 'Save', exact: true }).click();
        await inspector.getByRole('button', { name: 'Close inspector', exact: true }).click();
    }
    const selected = await page.evaluate(() => {
        const presets = window.Atria.getContext().capabilitySettings.orchestrator.agentWorkspace.presets;
        return presets.find(preset => !preset.id.startsWith('builtin-')).planTemplate.agents.slice(0, 2).map(agent => agent.modelProfile.nativeRouteRef);
    });
    expect(selected).toEqual(routes.slice(0, 2).map(route => ({ scope: 'player', runtimeRouteId: route.runtimeRouteId })));
    await workspace.locator('.workspace-agent-card').first().click();
    await expect(inspector.getByLabel('Native Runtime Route', { exact: true })).toHaveValue(routes[0].runtimeRouteId);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Native browser retrieval offers bundled embedding models without extension inference globals', async ({ page }) => {
    page.setDefaultTimeout(15000);
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await awaitMainUI(page, server.baseURL);
    await page.evaluate(() => Atria.shell.getWorkspaceHost().openRuntimeSection('retrieval'));
    const root = page.locator('[data-atria-runtime-native="retrieval"]');
    await root.getByRole('button', { name: 'New retrieval resource', exact: true }).click();
    await root.getByLabel('Provider', { exact: true }).selectOption('webllm');
    await root.getByRole('button', { name: 'Browse browser models', exact: true }).click();
    const choices = root.getByLabel('Browser embedding model', { exact: true });
    await expect(choices).toBeVisible({ timeout: 30000 });
    const id = await choices.locator('option').nth(1).getAttribute('value');
    expect(id).toBeTruthy(); await choices.selectOption(id);
    await expect(root.getByLabel('Model', { exact: true })).toHaveValue(id);
    await expect(root.getByText('The model downloads when retrieval first runs. This browser must support WebGPU.', { exact: true })).toBeVisible();
    await expect(root.getByLabel('Endpoint URL', { exact: true })).toBeHidden();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'test-results-native-ux-g8-browser-models.png', fullPage: true });
});
