import { test, expect } from '@playwright/test';
import { startServer, tearDownServer } from '../_lib/server.js';
import { awaitMainUI } from '../_lib/page.js';
import { seedNativeSessionDataRoot } from './_helpers.js';

if (process.env.PW_NATIVE_CHANNEL) test.use({ channel: process.env.PW_NATIVE_CHANNEL });
let server;
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
    const seeded = await seedNativeSessionDataRoot({ suffix: 'extensions-ui' });
    server = await startServer({ batchKey: 'generation', scenarioId: 'extensions-ui', useExistingDataRoot: seeded.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server, { removeData: true }); });

for (const width of [1440, 320]) test(`Extensions script and Skill settings at ${width}px`, async ({ page }, info) => {
    test.setTimeout(150000);
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/**', route => route.fulfill({ json: [] }));
    await awaitMainUI(page, server.baseURL);
    await page.evaluate(async () => {
        await window.Atria.getContext().skills.importBundled();
        window.Atria.shell.getWorkspaceHost().openUtility('plugins');
    });
    const root = page.locator('[data-atria-utility-workspace="extensions"]');
    await expect(root.getByRole('heading', { name: 'Extensions', exact: true })).toBeVisible();
    await root.locator('summary').filter({ hasText: /^New folder$/ }).click();
    await root.getByLabel('New folder', { exact: true }).fill('Methods ' + width);
    await root.getByRole('button', { name: 'Create folder', exact: true }).click();
    await expect(root.getByText('Methods ' + width, { exact: true }).last()).toBeVisible();
    const row = root.locator('[data-skill-name]').first();
    await row.getByText('Folder and invocation paths', { exact: true }).click();
    await row.getByLabel('Folder', { exact: true }).selectOption({ label: 'Methods ' + width });
    await row.getByLabel('Studio', { exact: true }).selectOption('always');
    await row.getByLabel('Narrative', { exact: true }).selectOption('off');
    await row.getByRole('button', { name: 'Save Skill settings', exact: true }).click();
    await expect(root.locator('[data-skill-folder]').filter({ has: page.locator('summary', { hasText: 'Methods ' + width }) }).locator('[data-skill-name]')).toHaveCount(1);
    await root.locator('.atri-skill-organization').getByLabel('Folder', { exact: true }).selectOption({ label: 'Methods ' + width });
    await root.evaluate(node => { node.scrollTop = 0; });
    await page.screenshot({ path: info.outputPath(`skills-${width}.png`), fullPage: true });
    await root.locator('[data-extension-tab="plugins"]').click();
    await root.getByRole('button', { name: 'Local scripts', exact: true }).click();
    await root.getByRole('button', { name: 'New script', exact: true }).click();
    await root.getByLabel('Name', { exact: true }).fill('UI fixture ' + width);
    await root.getByLabel('JavaScript', { exact: true }).fill('export function activate(atria) { const node = document.createElement("div"); node.id = "extension-ui-fixture"; node.textContent = "Fixture active"; atria.ui.mount(node); }');
    await root.getByLabel('Global', { exact: true }).check();
    await root.getByLabel('Enabled', { exact: true }).check();
    await page.screenshot({ path: info.outputPath(`script-editor-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    expect((await root.getByLabel('JavaScript', { exact: true }).boundingBox()).height).toBeGreaterThanOrEqual(260);
    await root.getByLabel('JavaScript', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`script-code-${width}.png`), fullPage: true });
    await root.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(root.getByRole('heading', { name: 'UI fixture ' + width, exact: true })).toBeVisible();
    await expect(page.locator('#extension-ui-fixture')).toBeVisible();
    const card = root.locator('[data-extension-id]').filter({ hasText: 'UI fixture ' + width });
    await card.getByRole('button', { name: 'Edit', exact: true }).click();
    await root.getByLabel('Enabled', { exact: true }).uncheck();
    await root.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('#extension-ui-fixture')).toHaveCount(0);
    await root.getByLabel('Import JavaScript', { exact: true }).setInputFiles({ name: 'imported.js', mimeType: 'text/javascript', buffer: Buffer.from('export function activate() {}') });
    await expect(root.getByLabel('Name', { exact: true })).toHaveValue('imported');
    await expect(root.getByLabel('Enabled', { exact: true })).not.toBeChecked();
    await root.getByRole('button', { name: 'Cancel', exact: true }).click();
    await root.getByRole('button', { name: 'Built-in tools', exact: true }).click();
    await expect(root.getByRole('heading', { name: 'Regex', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
