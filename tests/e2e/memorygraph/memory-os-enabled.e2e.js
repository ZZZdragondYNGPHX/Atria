import { test, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startServer, tearDownServer } from '../_lib/server.js';
import { createBlankCharacter } from '../_lib/ui-character.js';
import { selectCharacterByName } from '../_lib/page.js';

test.use({ launchOptions: { channel: process.env.MEMORY_OS_BROWSER || undefined } });

test('Memory OS UI flag reaches live lifecycle and survives server restart', async ({ page }) => {
    const scratch = resolve(import.meta.dirname, '../../.e2e-scratch');
    mkdirSync(scratch, { recursive: true });
    const dataRoot = mkdtempSync(resolve(scratch, 'memory-os-enabled-'));
    const userRoot = resolve(dataRoot, 'default-user');
    mkdirSync(userRoot, { recursive: true });
    const settings = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../default/content/settings.json'), 'utf8'));
    settings.firstRun = false;
    settings.extension_settings ||= {};
    // Reproduce the reported state: both visible pre-fix switches are on,
    // but the development-only OS flag has never been written by a user.
    settings.extension_settings.orchestrator = { enabled: true };
    settings.extension_settings.memory_graph = { enabled: true };
    writeFileSync(resolve(userRoot, 'settings.json'), JSON.stringify(settings));
    const server = await startServer({ batchKey: 'memorygraph', useExistingDataRoot: dataRoot });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const name = 'Memory OS activation regression';
    const toggle = page.locator('#luker_rpg_memory_os_enabled');
    const inspector = page.locator('.memory-os-inspector');
    const persisted = () => page.evaluate(async () => {
        const ctx = window.Luker.getContext();
        const response = await fetch('/api/settings/get', { method: 'POST', headers: ctx.getRequestHeaders(), body: '{}' });
        const payload = await response.json();
        return JSON.parse(payload.settings).extension_settings.memory_graph.memoryOsEnabled;
    });
    const ready = () => page.waitForFunction(() => window.Luker?.getContext?.().getExtensionApi?.('memory-graph')
        && window.Luker.getContext().getExtensionApi('orchestrator') && !document.getElementById('preloader'));
    const openMemory = () => page.evaluate(async () => {
        const { openWorkspace } = await import('/scripts/extensions/orchestrator/workspace/panel.js');
        openWorkspace('Memory');
    });
    try {
        await page.goto(server.baseURL);
        await ready();
        await createBlankCharacter(page, { name, firstmes: 'Alice keeps the map at Castle.' });
        await selectCharacterByName(page, name);
        await openMemory();
        await expect(toggle).not.toBeChecked();
        await page.getByRole('button', { name: 'Knowledge · Sources · Build & Maintenance', exact: true }).click();
        await expect(inspector.getByRole('status')).toContainText('Memory OS is disabled');

        await toggle.check();
        await inspector.getByRole('button', { name: '刷新', exact: true }).click();
        await expect(inspector.getByRole('status')).toContainText('显示');
        const live = await page.evaluate(async () => {
            const ctx = window.Luker.getContext();
            const ports = ctx.getExtensionApi('memory-graph').getWorkspacePorts(ctx);
            window.memoryOsSnapshot = await ports.load();
            window.memoryOsSnapshot.assertCurrent();
            return { key: window.memoryOsSnapshot.key, orchestration: ctx.extensionSettings.orchestrator.enabled,
                memory: ctx.extensionSettings.memory_graph.enabled };
        });
        expect(live.key).toBeTruthy();
        expect(live.orchestration).toBe(true);
        expect(live.memory).toBe(true);
        const corrections = inspector.locator('details').filter({ has: page.locator('form') });
        await corrections.locator('summary').click();
        await inspector.getByLabel('操作', { exact: true }).selectOption('entity');
        await inspector.locator('[name="name"]').fill('Castle');
        await inspector.locator('[name="type"]').selectOption('Location');
        await inspector.locator('[name="reason"]').fill('Verify enabled lifecycle writes reach persistent graph storage');
        await inspector.getByRole('button', { name: '保存修正', exact: true }).click();
        await expect(inspector.getByRole('status')).toContainText('修正已保存');
        await page.evaluate(async () => {
            const ctx = window.Luker.getContext();
            window.memoryOsSnapshot = await ctx.getExtensionApi('memory-graph').getWorkspacePorts(ctx).load();
            window.memoryOsSnapshot.assertCurrent();
        });
        await expect.poll(persisted).toBe(true);

        await toggle.uncheck();
        const disabled = await page.evaluate(async () => {
            const ctx = window.Luker.getContext();
            let stale;
            try { window.memoryOsSnapshot.assertCurrent(); } catch (error) { stale = error.name; }
            try { await ctx.getExtensionApi('memory-graph').getWorkspacePorts(ctx).load(); }
            catch (error) { return { stale, message: error.message }; }
        });
        expect(disabled).toEqual({ stale: 'AbortError', message: 'Memory OS is disabled' });
        await expect.poll(persisted).toBe(false);
        await server.restart();
        await page.reload();
        await ready();
        await selectCharacterByName(page, name);
        await openMemory();
        await expect(toggle).not.toBeChecked();
        await toggle.check();
        await expect.poll(persisted).toBe(true);

        await server.restart();
        await page.reload();
        await ready();
        await selectCharacterByName(page, name);
        await openMemory();
        await expect(toggle).toBeChecked();
        await page.getByRole('button', { name: 'Knowledge · Sources · Build & Maintenance', exact: true }).click();
        await expect(inspector.getByRole('status')).toContainText('显示');
        await expect(inspector.locator('.mos-list').getByRole('button', { name: 'Castle · active', exact: true })).toBeVisible();
        await page.setViewportSize({ width: 390, height: 844 });
        expect(await page.locator('#workspace-content').evaluate(el => el.scrollWidth <= el.clientWidth + 2)).toBe(true);
        expect(errors).toEqual([]);
    } finally {
        await tearDownServer(server);
    }
});
