import { test, expect } from '@playwright/test';
import { createNativeId } from '../../../src/native/identity.js';
import { knowledgeSnapshot } from '../../native/helpers/session-fixture.js';
import { startServer, tearDownServer } from '../_lib/server.js';
import { disableExtensions } from '../_lib/fixtures.js';
import { awaitMainUI } from '../_lib/page.js';
import { seedNativeSessionDataRoot } from './_helpers.js';
let server;

test.beforeAll(async () => {
    const seed = await seedNativeSessionDataRoot({ suffix: 'native-knowledge' });
    disableExtensions({ dataRoot: seed.dataRoot, names: ['stable-diffusion'] });
    server = await startServer({ batchKey: 'generation', scenarioId: 'native-knowledge', useExistingDataRoot: seed.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server); });

test('Knowledge typed delivery and invalid Source stay inside Studio Review at 390px', async ({ page }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await awaitMainUI(page, server.baseURL);
    const knowledge = knowledgeSnapshot('Harbor rules');
    knowledge.knowledgeBase.displayName = 'Harbor rules';
    knowledge.entries[0].delivery = { position: 'before', target: 'narrator' };
    const source = { format: 'atria-project-source', schemaVersion: 1,
        project: { projectId: createNativeId('project'), packageId: createNativeId('package'), displayName: 'Knowledge contracts', createdAt: 1, updatedAt: 1 },
        package: { name: 'Knowledge contracts', version: '1.0.0', actors: [], capabilities: ['narrative'], permissions: [], entryPoints: [{ entryPointId: createNativeId('entryPoint'), displayName: 'Main', actorIds: [], worldIds: [], knowledgeBindingIds: [] }] },
        resources: [], worlds: [], knowledge: [knowledge], knowledgeBindings: [], assetFiles: [], dependencies: { worlds: [], knowledge: [], knowledgeBindings: [], assets: [], resources: [] } };
    await page.evaluate(async source => {
        const response = await fetch('/api/native/studio/projects', { method: 'POST', headers: window.Atria.getContext().getRequestHeaders(), body: JSON.stringify({ source }) });
        if (!response.ok) throw new Error(await response.text());
        window.Atria.shell.getWorkspaceHost().openBuild(source.project.projectId);
    }, source);
    const studio = page.locator('[data-atria-studio-workspace]');
    await studio.locator('.atria-studio-mobile-nav').getByRole('button', { name: 'Project', exact: true }).click();
    await studio.locator('.atria-studio-resource-tree').getByRole('button', { name: 'Knowledge', exact: true }).click();
    const editor = studio.locator('.atri-studio-value-editor');
    await editor.locator('summary').filter({ hasText: /^1$/ }).click();
    await editor.locator('summary').filter({ hasText: /^delivery$/ }).click();
    await editor.getByLabel('entries.0.delivery.position', { exact: true }).selectOption('after');
    await expect(editor.getByLabel('entries.0.delivery.target', { exact: true })).toHaveValue('narrator');
    await editor.getByRole('button', { name: 'Source', exact: true }).click();
    const json = editor.getByRole('textbox', { name: 'Knowledge resource JSON' });
    const draft = JSON.parse(await json.inputValue()); draft.entries[0].delivery.position = 'before-chat';
    await json.fill(JSON.stringify(draft));
    await editor.getByRole('button', { name: 'Review Changes', exact: true }).click();
    await expect(editor.getByRole('alert')).toContainText('entries.0.delivery.position');
    await expect(json).toHaveValue(JSON.stringify(draft));
    await page.screenshot({ path: info.outputPath('knowledge-invalid-source-390.png') });
    draft.entries[0].delivery.position = 'after';
    for (const key of ['semanticHints', 'vectorHints']) {
        draft.entries[0].discovery = { [key]: [] }; await json.fill(JSON.stringify(draft));
        await editor.getByRole('button', { name: 'Review Changes', exact: true }).click();
        await expect(editor.getByRole('alert')).toContainText('entries.0.discovery.' + key);
    }
    delete draft.entries[0].discovery; await json.fill(JSON.stringify(draft));
    await editor.getByRole('button', { name: 'Review Changes', exact: true }).click();
    await studio.locator('.atria-studio-mobile-nav').getByRole('button', { name: 'More', exact: true }).click();
    await expect(studio.getByRole('button', { name: 'Apply ChangeSet', exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('knowledge-review-390.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
