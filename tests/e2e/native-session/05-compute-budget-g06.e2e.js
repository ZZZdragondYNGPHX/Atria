import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { FsEngine } from '../../../src/storage/engines/fs-engine.js';
import { seedGenerationProfiles } from '../../native/helpers/generation-fixture.js';
import { startServer, tearDownServer } from '../_lib/server.js';
import { awaitMainUI } from '../_lib/page.js';
import { seedNativeSessionDataRoot, createAndOpenNativeSession } from './_helpers.js';

let server, seeded;
test.describe.configure({ mode: 'serial' });
if (process.env.PW_NATIVE_CHANNEL) test.use({ channel: process.env.PW_NATIVE_CHANNEL });
test.beforeAll(async () => {
    seeded = await seedNativeSessionDataRoot({ suffix: 'g06-budget' });
    const root = resolve(seeded.dataRoot, seeded.handle);
    const engine = new FsEngine({ directoriesByHandle: () => ({ root, assets: resolve(root, 'assets') }) });
    await seedGenerationProfiles({ engine, handle: seeded.handle, endpoint: 'http://127.0.0.1:1/completions' });
    await engine.close();
    server = await startServer({ batchKey: 'generation', scenarioId: 'g06-budget', useExistingDataRoot: seeded.dataRoot });
});
test.afterAll(async () => { if (server) await tearDownServer(server, { removeData: false }); });

for (const width of [1440, 390]) {
    test(`G06 shared budget edit, validation and removal at ${width}px`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await awaitMainUI(page, server.baseURL);
        await createAndOpenNativeSession(page, seeded.start);
        await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openRuntimeSection('routes'));
        const root = page.locator('[data-atria-runtime-native]');
        const open = async () => { await root.getByRole('button', { name: 'Edit narrator', exact: true }).click(); };
        await open();
        const enabled = root.getByLabel('启用共享发送额度', { exact: true });
        const requests = root.getByLabel('最大发送次数', { exact: true });
        const tokens = root.getByLabel('Token 占用上限', { exact: true });
        await expect(requests).toBeDisabled(); await expect(tokens).toBeDisabled();
        await enabled.check(); await requests.fill('33'); await tokens.fill('64000');
        await root.getByRole('button', { name: 'Save', exact: true }).click();
        expect(await requests.evaluate(input => input.validity.rangeOverflow)).toBe(true);
        await requests.fill('2');
        await page.screenshot({ path: info.outputPath(`budget-editor-${width}.png`), fullPage: true });
        await root.getByRole('button', { name: 'Save', exact: true }).click();
        await open(); await expect(enabled).toBeChecked(); await expect(requests).toHaveValue('2');
        await enabled.uncheck(); await expect(tokens).toBeDisabled();
        await root.getByRole('button', { name: 'Save', exact: true }).click();
        await open(); await expect(enabled).not.toBeChecked();
        await page.keyboard.press('Escape'); await expect(root.getByLabel('Filter routes')).toBeFocused();
        expect(errors).toEqual([]);
    });
}
