import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { FsEngine } from '../../../src/storage/engines/fs-engine.js';
import { seedGenerationProfiles } from '../../native/helpers/generation-fixture.js';
import { startServer, tearDownServer } from '../_lib/server.js';
import { disableExtensions } from '../_lib/fixtures.js';
import { awaitMainUI } from '../_lib/page.js';
import { seedNativeSessionDataRoot } from './_helpers.js';

let server; let routes;

test.beforeAll(async () => {
    const seeded = await seedNativeSessionDataRoot({ suffix: 'native-agent-routes' });
    const root = resolve(seeded.dataRoot, seeded.handle);
    const engine = new FsEngine({ directoriesByHandle: () => ({ root, assets: resolve(root, 'assets') }) });
    const resources = await seedGenerationProfiles({ engine, handle: seeded.handle, endpoint: 'https://example.invalid/completions', roles: ['orchestrator', 'orchestrator', 'memory'] });
    routes = resources.routes;
    routes[0].displayName = 'Writer'; routes[1].displayName = 'Reviewer';
    await resources.persistence.saveRuntimeRoute(seeded.handle, routes[0]);
    await resources.persistence.saveRuntimeRoute(seeded.handle, routes[1]);
    await engine.close();
    disableExtensions({ dataRoot: seeded.dataRoot, names: ['stable-diffusion'] });
    server = await startServer({ batchKey: 'generation', scenarioId: 'native-agent-routes', useExistingDataRoot: seeded.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server); });

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
        const presets = window.Atria.getContext().extensionSettings.orchestrator.agentWorkspace.presets;
        return presets.find(preset => !preset.id.startsWith('builtin-')).planTemplate.agents.slice(0, 2).map(agent => agent.modelProfile.nativeRouteRef);
    });
    expect(selected).toEqual(routes.slice(0, 2).map(route => ({ scope: 'player', runtimeRouteId: route.runtimeRouteId })));
    await workspace.locator('.workspace-agent-card').first().click();
    await expect(inspector.getByLabel('Native Runtime Route', { exact: true })).toHaveValue(routes[0].runtimeRouteId);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
