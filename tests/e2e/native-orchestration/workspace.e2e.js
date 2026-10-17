import { test, expect } from '@playwright/test';
import { startServer, tearDownServer } from '../_lib/server.js';
import { awaitMainUI } from '../_lib/page.js';
import { markOnboarded } from '../_lib/fixtures.js';
import { planFixture } from '../../native-orchestration/fixtures.js';
import { makeTempMysqlEngineHarness } from '../../storage/harness/mysql-harness.js';
import { makeTempPgEngineHarness } from '../../storage/harness/pg-harness.js';

test.use({ actionTimeout: 15000 });
let server;
let database;
const storageMode = process.env.ATRIA_E2E_STORAGE_MODE ?? 'fs';

test.beforeAll(async ({ request }) => {
    if (!['fs', 'mysql', 'postgres'].includes(storageMode)) throw new Error('Unsupported workspace test storage mode');
    if (storageMode !== 'fs') {
        const variable = storageMode === 'mysql' ? 'ATRIA_TEST_MYSQL_ROOT_URL' : 'ATRIA_TEST_POSTGRES_URL';
        if (!process.env[variable]) throw new Error('Workspace SQL test requires an explicit isolated test database URL');
        database = await (storageMode === 'mysql' ? makeTempMysqlEngineHarness() : makeTempPgEngineHarness());
    }
    server = await startServer({ batchKey: 'native-orchestration', scenarioId: 'workspace-' + storageMode,
        extraConfig: database ? { 'storage.mode': storageMode, [`storage.${storageMode}.url`]: database.url,
            [`storage.${storageMode}.nativeHostTopology`]: 'direct_single_primary' } : {} });
    if (storageMode === 'fs') markOnboarded({ dataRoot: server.dataRoot });
    else {
        const csrf = await request.get(server.baseURL + '/csrf-token');
        expect(csrf.ok()).toBe(true);
        const headers = { 'x-csrf-token': (await csrf.json()).token };
        const response = await request.post(server.baseURL + '/api/settings/get', { headers, data: {} });
        expect(response.ok()).toBe(true);
        const settings = JSON.parse((await response.json()).settings);
        const saved = await request.post(server.baseURL + '/api/settings/save', { headers, data: { ...settings, firstRun: false } });
        expect(saved.ok()).toBe(true); expect(await saved.json()).toEqual({ result: 'ok' });
    }
});

test.afterAll(async () => {
    try { await tearDownServer(server); } finally { await database?.cleanup(); }
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    test(`Plans, Runs and Memory on isolated ${storageMode} Host at ${viewport.width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize(viewport);
        const requests = [];
        page.on('request', request => requests.push(request.url()));
        await awaitMainUI(page, server.baseURL);
        await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openAgentSection('plans'));
        await expect(page.getByRole('textbox', { name: 'New Plan name' })).toBeVisible();
        await expect(page.getByRole('navigation', { name: 'Agents sections' }).getByRole('button')).toHaveText(['Plans', 'Runs', 'Memory', 'Diagnostics']);
        await page.getByRole('textbox', { name: 'New Plan name' }).fill(`Browser Plan ${viewport.width}`);
        await page.getByRole('button', { name: 'Create draft', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Validate on Host', exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'List', exact: true }).click();
        await page.getByRole('list', { name: 'Nodes', exact: true }).getByRole('button', { name: 'Agent Narrator Entry', exact: true }).click();
        await expect(page.getByRole('combobox', { name: 'Context audience', exact: true })).toHaveValue('');
        await expect(page.getByText('Attach an exact Information context pin. The Host rechecks its Actor, source version and receiving audience; this selection grants no access.', { exact: true })).toBeVisible();
        const audienceSheet = page.getByRole('button', { name: 'Close sheet', exact: true }).last();
        if (await audienceSheet.isVisible()) await audienceSheet.click();
        // Replace the starter's model-dependent graph with a no-provider fixture
        // through the real Host, then exercise editing and publication in the UI.
        const plan = await page.evaluate(async document => {
            const { createOrchestrationClient } = await import('/scripts/native/orchestration/client.js');
            const client = createOrchestrationClient();
            const root = (await client.listPlans()).items.find(item => item.viewState.title === document.viewState.title);
            await client.savePlan({ ...document, planId: root.planId, expectedDraftVersion: root.draftVersion, expectedDefinitionHash: root.definitionHash });
            return root.planId;
        }, { ...planFixture(), viewState: { title: `Browser Plan ${viewport.width}`, positions: {} } });
        await page.reload();
        await page.waitForFunction(() => !document.getElementById('preloader') && window.Atria?.shell?.getWorkspaceHost);
        await expect(page.getByRole('button', { name: 'Validate on Host', exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'List', exact: true }).click();
        await page.locator('.atria-orch-row__main').filter({ hasText: 'Result' }).click();
        await page.getByLabel('Label', { exact: true }).fill('Browser verified result');
        await page.getByLabel('Label', { exact: true }).press('Tab');
        const closeSheet = page.getByRole('button', { name: 'Close sheet', exact: true }).last();
        if (await closeSheet.isVisible()) await closeSheet.click();
        await page.getByRole('button', { name: 'Save draft', exact: true }).click();
        await expect(page.locator('.atria-orch-editor')).toHaveAttribute('data-atria-draft-dirty', 'false');
        await page.getByRole('button', { name: 'Validate on Host', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Publish…', exact: true })).toBeEnabled();
        await page.getByRole('button', { name: 'Publish…', exact: true }).click();
        await page.getByRole('button', { name: 'Publish revision', exact: true }).click();
        await expect.poll(() => page.evaluate(async id => {
            const { createOrchestrationClient } = await import('/scripts/native/orchestration/client.js');
            return (await createOrchestrationClient().getPlan(id)).currentPlanRevisionId;
        }, plan)).toMatch(/^oprev_/);
        await page.screenshot({ path: testInfo.outputPath('plan-published.png'), fullPage: true });
        await page.locator('[data-atria-domain-section="runs"]').click();
        await expect(page.getByText('Choose a source', { exact: true })).toBeVisible();
        await page.getByLabel('Source type', { exact: true }).selectOption('project');
        await expect(page.getByText('No Studio Projects yet.', { exact: true })).toBeVisible();
        await page.locator('[data-atria-domain-section="memory"]').click();
        await expect(page.getByRole('heading', { name: 'Long-term memory', exact: true })).toBeVisible();
        expect(requests.filter(url => /\/scripts\/agents\/(?:orchestrator|narrative-memory|pipeline-builder|prompt-viewer)\//.test(url))).toEqual([]);
        expect(await page.evaluate(() => window.Atria.getContext().getCapabilityApi('orchestrator'))).toBeFalsy();
        expect(requests.filter(url => /\/api\/native\/generation\/(?:execute|turn|task)(?:$|\?)/.test(url))).toEqual([]);
    });
}
