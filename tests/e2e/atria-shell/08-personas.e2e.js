import { resolve } from 'node:path';
import { FsEngine } from '../../../src/storage/engines/fs-engine.js';
import { sessionFixture, installFixture } from '../../native/helpers/session-fixture.js';
import { sharedFixture } from '../../native/helpers/shared-fixture.js';
import { test, expect } from '@playwright/test';
import { startServer, tearDownServer } from '../_lib/server.js';
import { seedNativeSessionDataRoot, createAndOpenNativeSession } from '../native-session/_helpers.js';

let server, seeded, sharedStart;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
    seeded = await seedNativeSessionDataRoot({ suffix: 'personas-a4b' });
    const root = resolve(seeded.dataRoot, seeded.handle);
    const dirs = { root, assets: resolve(root, 'assets') };
    const engine = new FsEngine({ directoriesByHandle: () => dirs });
    const fixture = sessionFixture(); sharedFixture(fixture);
    sharedStart = (await installFixture({ engine, handle: seeded.handle, dirs }, fixture)).start;
    await engine.close();
    server = await startServer({ batchKey: 'regression', scenarioId: 'personas-a4b', useExistingDataRoot: seeded.dataRoot });
});
test.afterAll(async () => { await tearDownServer(server); });
async function boot(page, locale = 'en') {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(locale => localStorage.setItem('language', locale), locale);
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: {} }));
    await page.goto(server.baseURL);
    await page.waitForFunction(() => performance.getEntriesByName('[init] complete').length > 0, null, { timeout: 45000 });
}
const openLibrary = page => page.evaluate(() => window.Atria.shell.getWorkspaceHost().openLibrarySection('personas'));
async function shot(page, info, name) {
    await page.screenshot({ path: info.outputPath(name + '.png'), animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('A4b management, draft guards, default, legacy review/replay and exact search at 390px', async ({ page }, info) => {
    await boot(page); await openLibrary(page);
    const workspace = page.locator('[data-atria-personas]');
    await workspace.getByRole('button', { name: 'New Persona', exact: true }).click();
    await workspace.getByLabel('Persona name').fill('A4b Player');
    await workspace.getByLabel('Description', { exact: true }).fill('PLAYER PROVIDED');
    await workspace.getByLabel('Management notes').fill('PRIVATE NOTE');
    page.once('dialog', dialog => dialog.dismiss());
    await workspace.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(workspace.getByLabel('Persona name')).toHaveValue('A4b Player');
    await workspace.getByRole('button', { name: 'Save new revision' }).click();
    await expect(workspace.getByText('Saved successfully.', { exact: true })).toBeVisible();
    await expect(workspace.getByRole('button', { name: 'Save new revision' })).toBeDisabled();
    await workspace.getByRole('button', { name: 'Reload Latest' }).click();
    await expect(workspace.getByLabel('Management notes')).toHaveValue('PRIVATE NOTE');
    page.once('dialog', dialog => dialog.accept()); await workspace.getByRole('button', { name: 'Use as default' }).click();
    await expect(workspace.getByText('Saved successfully.', { exact: true })).toBeVisible();
    await shot(page, info, 'persona-editor');
    await openLibrary(page);
    await workspace.getByText('Import legacy Personas', { exact: true }).click();
    const raw = JSON.stringify({ personas: { 'old.png': 'Legacy Player' }, persona_descriptions: { 'old.png': { name: 'Legacy Player', description: '{{user}} {{char}}', title: 'PRIVATE LEGACY', unknown: true } }, default_persona: 'old.png', preserve: 42 });
    await workspace.getByLabel('Legacy JSON file').setInputFiles({ name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
    await workspace.getByLabel('Convert {{user}} to the captured name').check();
    await workspace.getByRole('button', { name: 'Preflight', exact: true }).click();
    await expect(workspace.getByText('Migration review', { exact: true })).toBeVisible();
    await workspace.getByText('Migration review', { exact: true }).click();
    await expect(workspace.locator('pre').filter({ hasText: 'avatar_missing' })).toBeVisible();
    await workspace.getByRole('button', { name: 'Create reviewed copies' }).click();
    await expect(workspace.getByText('Migration receipt', { exact: true })).toBeVisible();
    await expect(workspace.getByRole('button', { name: 'Create reviewed copies' })).toBeDisabled();
    await shot(page, info, 'migration-receipt');
    const count = await page.evaluate(async () => { const c = await import('/scripts/native/product-client.js'); return (await c.nativeProductClient.listPersonas({})).items.length; });
    await workspace.getByRole('button', { name: 'Preflight', exact: true }).click(); await workspace.getByRole('button', { name: 'Create reviewed copies' }).click();
    expect(await page.evaluate(async () => { const c = await import('/scripts/native/product-client.js'); return (await c.nativeProductClient.listPersonas({})).items.length; })).toBe(count);
    await workspace.getByLabel('Use legacy Personas from this account').check();
    await workspace.getByRole('button', { name: 'Preflight', exact: true }).click();
    await expect(workspace.getByText('Migration review', { exact: true })).toBeVisible();
    await openLibrary(page); await workspace.getByLabel('Search Personas').fill('Legacy Player');
    await expect(workspace.getByRole('button', { name: 'Legacy Player', exact: true })).toBeVisible();
    await workspace.getByRole('button', { name: 'Legacy Player', exact: true }).click();
    await expect(workspace.getByLabel('Persona name')).toHaveValue('Legacy Player');
    await expect(workspace.getByLabel('Description', { exact: true })).toHaveValue('Legacy Player {{char}}');
});

test('A4b session picker keeps Composer draft, Host guard, scope changes and recovery focus at 390px', async ({ page }, info) => {
    await boot(page);
    await createAndOpenNativeSession(page, seeded.start);
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openPlay());
    const composer = page.locator('#atria-play-composer'); await composer.getByLabel('Message', { exact: true }).fill('UNSENT DRAFT');
    await composer.getByRole('button', { name: 'Choose Persona' }).click();
    const picker = page.getByRole('dialog', { name: 'Choose Persona' }); await expect(picker).toBeVisible();
    await picker.getByRole('button', { name: 'Legacy Player', exact: true }).click();
    await expect(picker).toHaveCount(0); await expect(composer.getByLabel('Message', { exact: true })).toHaveValue('UNSENT DRAFT');
    await expect(composer.locator('[data-atria-persona-select]')).toHaveText('Legacy Player');
    const guard = await page.evaluate(async () => { const host = window.Atria.shell.getPlayHost().product; const runtime = window.Atria.nativeSessionRuntime;
        try { await host.headless.invoke({ service: 'host.persona', method: 'openSelector' }, {}, 'old'); } catch (error) { return error.code; } });
    expect(guard).toBe('bridge_revision_stale');
    await page.evaluate(async () => { const host = window.Atria.shell.getPlayHost().product; const runtime = window.Atria.nativeSessionRuntime; await host.headless.invoke({ service: 'host.persona', method: 'openSelector' }, {}, runtime.snapshot.revision.revisionId); });
    await expect(picker).toBeVisible(); await picker.getByLabel('Search Personas').fill('does not exist');
    await expect(picker.getByText('No matching Personas')).toBeVisible(); await picker.getByLabel('Search Personas').fill('');
    await shot(page, info, 'persona-picker'); await page.keyboard.press('Escape'); await expect(picker).toHaveCount(0);
    await expect(composer.locator('[data-atria-persona-select]')).toBeFocused();
    await page.evaluate(async () => {
        const { createFullGameHost } = await import('/scripts/native/experience/ui/full-host.js');
        const product = window.Atria.shell.getPlayHost().product;
        window.__personaFullHost = createFullGameHost(document, { shell: window.Atria.shell, nativePlayHost: window.Atria.shell.getPlayHost(),
            onPersona: () => product.openPersonaSelector(), getCapabilities: () => ({ persona: true }) });
        window.__personaFullHost.root.remove(); // Presentation failure; independent Host recovery stays mounted.
    });
    await page.locator('[data-atria-game-host-recovery]').getByText('Experience controls', { exact: true }).click();
    await page.locator('[data-atria-game-host-recovery]').getByRole('button', { name: 'Choose Persona' }).click();
    await expect(picker).toBeVisible(); await picker.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.evaluate(() => window.__personaFullHost.dispose());
});

test('A4b Chinese management labels and compact layout', async ({ page }, info) => {
    await boot(page, 'zh-cn'); await openLibrary(page);
    await expect(page.getByRole('heading', { name: '用户设定', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '新建用户设定', exact: true }).click();
    await expect(page.getByLabel('管理备注')).toBeVisible();
    await shot(page, info, 'personas-zh-cn');
});


test('A4b Shared own-seat picker uses real services and explicitly disables descriptions', async ({ page }, info) => {
    await boot(page); await createAndOpenNativeSession(page, sharedStart);
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openPlay());
    await page.locator('.atria-play-more > summary').click();
    await page.getByRole('button', { name: 'Shared session', exact: true }).click();
    const panel = page.locator('[data-atria-native-play-drawer]');
    await expect(panel.getByText('Shared descriptions are disabled. Your selection changes seat display only.', { exact: true })).toBeVisible();
    await panel.getByRole('button', { name: 'Enable sharing', exact: true }).click();
    await panel.getByText('Host account', { exact: true }).locator('..').locator('input').fill(seeded.handle);
    await panel.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(panel.getByRole('button', { name: 'Choose Persona' })).toBeEnabled();
    await panel.getByRole('button', { name: 'Choose Persona' }).click();
    const picker = page.getByRole('dialog', { name: 'Choose Persona' });
    await expect(picker.getByText('Shared descriptions are disabled. Your selection changes seat display only.', { exact: true })).toBeVisible();
    await picker.getByRole('button', { name: 'Legacy Player', exact: true }).click();
    await expect(picker).toHaveCount(0);
    await expect(panel.locator('[data-atria-shared-personas]')).toContainText('Legacy Player');
    await shot(page, info, 'shared-persona-display');
});
