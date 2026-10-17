import { test, expect } from '@playwright/test';
import { startServer, tearDownServer } from '../_lib/server.js';
import { awaitMainUI } from '../_lib/page.js';
import { markOnboarded } from '../_lib/fixtures.js';
import { planFixture } from '../../native-orchestration/fixtures.js';

test.use({ actionTimeout: 15000 });
let server;
test.beforeAll(async () => {
    server = await startServer({ batchKey: 'native-orchestration', scenarioId: 'workspace' });
    markOnboarded({ dataRoot: server.dataRoot });
});
test.afterAll(async () => tearDownServer(server));

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    test(`Plans, Runs and Memory on isolated Host at ${viewport.width}px`, async ({ page }, testInfo) => {
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
