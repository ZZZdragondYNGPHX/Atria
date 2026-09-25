import { test, expect } from '@playwright/test';
import { startServer, tearDownServer } from '../_lib/server.js';
import { awaitMainUI } from '../_lib/page.js';
import { seedNativeSessionDataRoot } from './_helpers.js';
let server;

test.beforeAll(async () => {
    const seed = await seedNativeSessionDataRoot({ suffix: 'native-search' });
    server = await startServer({ batchKey: 'generation', scenarioId: 'native-search', useExistingDataRoot: seed.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server); });

test('Global Search routes exact SavePoints and orchestration, and exposes partial results with retry at 390px', async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await awaitMainUI(page, server.baseURL);
    const seeded = await page.evaluate(async () => {
        const { nativeProductClient: client } = await import('/scripts/native/product-client.js');
        const works = await client.listWorks();
        const created = await client.startWork(works[0].package.packageId, { displayTitle: 'Search voyage' });
        const save = await client.createSave(created.session.sessionId, { displayName: 'Search harbor', kind: 'manual' });
        await window.Atria.shell.getWorkspaceHost().refreshSearch();
        return { sessionId: created.session.sessionId, save };
    });
    await page.keyboard.press('Control+k');
    const input = page.getByRole('combobox', { name: 'Search commands' });
    await input.fill('Search harbor');
    await page.locator('[data-atria-command-id^="save."]').click();
    const runtime = await page.evaluate(async () => {
        const { nativeSessionRuntime: runtime } = await import('/scripts/native/session-runtime.js');
        return { id: runtime.snapshot.session.sessionId, history: Boolean(runtime.history) };
    });
    expect(runtime).toEqual({ id: seeded.sessionId, history: true });
    await page.evaluate(async () => {
        const result = window.Atria.shell.registry.list().find(item => item.id.startsWith('orchestration.') && item.title === 'Director');
        if (!result) throw new Error('Director search result missing');
        await window.Atria.shell.registry.execute(result.id);
    });
    await expect(page.locator('.workspace-preset-list button[aria-pressed="true"]')).toContainText('Director');
    await page.route('**/api/native/product/worlds', route => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
    await page.keyboard.press('Control+k');
    const status = page.locator('.atria-command-search-status');
    await expect(status).toContainText('Some results unavailable');
    await status.locator('summary').click();
    await expect(status).toContainText('Worlds');
    await input.fill('Search voyage');
    await expect(page.locator('[data-atria-command-id^="session."]')).toHaveCount(1);
    await page.screenshot({ path: info.outputPath('search-partial-390.png') });
    await page.unroute('**/api/native/product/worlds');
    await status.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(status).not.toContainText('Some results unavailable');
    await expect(status).not.toContainText('Refreshing search');
});
