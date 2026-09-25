import { test, expect } from '@playwright/test';
import { startServer, tearDownServer } from '../_lib/server.js';
import { awaitMainUI } from '../_lib/page.js';
import { seedNativeSessionDataRoot } from './_helpers.js';
let server;

if (process.env.PW_NATIVE_CHANNEL) test.use({ channel: process.env.PW_NATIVE_CHANNEL });

test.beforeAll(async () => {
    const seed = await seedNativeSessionDataRoot({ suffix: 'knowledge-workflows' });
    server = await startServer({ batchKey: 'generation', scenarioId: 'knowledge-workflows', useExistingDataRoot: seed.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server); });

for (const width of [1440, 390]) test(`editable copies, entry CRUD and Work/Session resource choices at ${width}px`, async ({ page }, info) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 960 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await awaitMainUI(page, server.baseURL);
    const ids = await page.evaluate(async () => {
        const { nativeProductClient: c } = await import('/scripts/native/product-client.js');
        const work = (await c.listWorks())[0];
        const session = await c.startWork(work.package.packageId);
        await window.Atria.openNativeSession(session.session.sessionId);
        const knowledge = work.manifest.knowledge[0];
        window.Atria.shell.getWorkspaceHost().openLibraryResource({ scope: 'package', resourceType: 'core.knowledge', packageId: work.package.packageId, packageVersionId: work.packageVersion.packageVersionId, resourceId: knowledge.knowledgeBase.knowledgeBaseId, revision: knowledge.revision.knowledgeRevisionId });
        return { packageId: work.package.packageId, sessionId: session.session.sessionId };
    });
    await page.getByRole('button', { name: 'Create editable copy', exact: true }).click();
    await expect(page.locator('[data-atria-knowledge-detail]')).toBeVisible();
    await page.getByRole('button', { name: 'Add entry', exact: true }).click();
    await page.getByRole('textbox', { name: 'Entry title', exact: true }).fill('Player entry ' + width);
    await page.getByRole('textbox', { name: 'Entry content', exact: true }).fill('Visible lore content');
    await page.getByRole('textbox', { name: 'Keywords', exact: true }).fill('garden');
    await page.screenshot({ path: info.outputPath('entry-editor.png') });
    await page.getByRole('button', { name: 'Review Changes', exact: true }).click();
    await page.getByRole('button', { name: 'Save immutable revision', exact: true }).click();
    const row = page.locator('.atri-knowledge-entry-row').filter({ hasText: 'Player entry ' + width });
    await row.locator('summary').click();
    await expect(row.locator('.atri-knowledge-parameters')).toContainText('Activation probability');
    await row.getByRole('checkbox').uncheck();
    await page.getByRole('button', { name: 'Review Changes', exact: true }).click();
    await page.getByRole('button', { name: 'Save immutable revision', exact: true }).click();
    await expect(row.getByRole('checkbox')).not.toBeChecked();
    await page.screenshot({ path: info.outputPath('knowledge.png') });
    await row.getByRole('button', { name: 'Delete entry', exact: true }).click();
    await page.locator('dialog[open] .popup-button-ok').click();
    await page.getByRole('button', { name: 'Review Changes', exact: true }).click();
    await page.getByRole('button', { name: 'Save immutable revision', exact: true }).click();
    await expect(row).toHaveCount(0);
    await page.evaluate(id => window.Atria.shell.getWorkspaceHost().openLibraryWork(id), ids.packageId);
    await page.getByRole('button', { name: 'Configure Worlds & Knowledge' }).click();
    const setup = page.locator('.atri-resource-setup');
    await expect(setup).toBeVisible();
    const originalWorld = setup.getByRole('group', { name: 'Worlds', exact: true }).getByRole('checkbox');
    await originalWorld.uncheck();
    await setup.getByRole('button', { name: 'Save resource choices' }).click();
    await expect(setup.getByRole('group', { name: 'Worlds', exact: true }).getByRole('checkbox')).not.toBeChecked();
    const createdWorlds = await page.evaluate(async id => { const c = (await import('/scripts/native/product-client.js')).nativeProductClient; return (await c.startWork(id)).worlds; }, ids.packageId);
    expect(createdWorlds).toEqual([]);
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openLibrarySection('works'));
    const session = page.locator(`[data-atria-session-id="${ids.sessionId}"]`);
    await session.locator('summary').filter({ hasText: /^Manage$/ }).click();
    await session.getByRole('button', { name: 'Worlds & Knowledge', exact: true }).click();
    const sessionSetup = session.locator('.atri-resource-setup');
    await sessionSetup.getByRole('group', { name: 'Worlds', exact: true }).getByRole('checkbox').uncheck();
    await sessionSetup.getByRole('group', { name: 'Knowledge Bases', exact: true }).getByRole('checkbox').first().uncheck();
    await page.screenshot({ path: info.outputPath('session-resources.png') });
    await sessionSetup.getByRole('button', { name: 'Save resource choices' }).click();
    await expect(sessionSetup).toHaveCount(0);
    const actual = await page.evaluate(async ids => (await import('/scripts/native/product-client.js')).nativeProductClient.getResourceSetup(ids.packageId, { sessionId: ids.sessionId }), ids);
    expect(actual.worldRefs).toEqual([]); expect(actual.knowledgeRefs).toEqual([]);
    expect(await page.evaluate(async () => (await import('/scripts/native/session-runtime.js')).nativeSessionRuntime.snapshot.worlds)).toEqual([]);
});
