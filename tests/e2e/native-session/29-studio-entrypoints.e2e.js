import { test, expect } from '@playwright/test';
import { createNativeId } from '../../../src/native/identity.js';
import { assertEntryPoint } from '../../../src/native/contracts.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inspectAtriaPackageContainer } from '../../../src/native/package-container.js';
import { inspectAtriaSaveContainer } from '../../../src/native/save-container.js';
import { startServer, tearDownServer } from '../_lib/server.js';
import { awaitMainUI } from '../_lib/page.js';
import { seedNativeSessionDataRoot, createAndOpenNativeSession, loadNativeSnapshot } from './_helpers.js';
if (process.env.PW_NATIVE_CHANNEL) test.use({ channel: process.env.PW_NATIVE_CHANNEL });
test.use({ actionTimeout: 12000 });
let server, seeded;
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
    seeded = await seedNativeSessionDataRoot({ suffix: 'studio-entrypoints-b1' });
    server = await startServer({ batchKey: 'generation', scenarioId: 'studio-entrypoints-b1', useExistingDataRoot: seeded.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server, { removeData: false }); });

async function api(page, path, body) {
    return page.evaluate(async ({ path, body }) => {
        const response = await fetch('/api/native/' + path, { headers: window.Atria.getContext().getRequestHeaders(), ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
        if (!response.ok) throw new Error(await response.text()); return response.json();
    }, { path, body });
}
async function boot(page, width, locale = 'en') {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(locale => localStorage.setItem('language', locale), locale);
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/text-workers', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await awaitMainUI(page, server.baseURL);
}
function source(entries, packageId = createNativeId('package')) {
    return {
        format: 'atria-project-source', schemaVersion: 1,
        project: { projectId: createNativeId('project'), packageId, displayName: 'B1 EntryPoints 中文项目', createdAt: 10, updatedAt: 10 },
        package: { name: 'B1 EntryPoints', version: '1.0.0', actors: [], capabilities: ['narrative'], permissions: [], entryPoints: entries },
        resources: [], worlds: [], knowledge: [], knowledgeBindings: [], assetFiles: [], dependencies: { worlds: [], knowledge: [], knowledgeBindings: [], assets: [], resources: [] },
    };
}
async function open(page, project) {
    await api(page, 'studio/projects', { source: project });
    await page.evaluate(id => window.Atria.shell.getWorkspaceHost().openBuild(id), project.project.projectId);
    await expect(page.locator('[data-atria-studio-view="overview"]')).toBeVisible();
}

function entry(id = createNativeId('entryPoint')) {
    return { entryPointId: id, displayName: 'Same name', actorIds: [], worldIds: [], knowledgeBindingIds: [],
        initialStateOverlay: { nested: { opaque: [null, false, 2] } },
        initialTimeline: [{ role: 'assistant', content: 'Opening', metadata: { opaque: { values: [null, true, 4] } } }],
        runtime: { pluginData: { values: [null, false, 8] } }, recommendations: null, orchestration: ['custom'], memory: false };
}

test('EntryPoints UI → real FS/HTTP/canonical Build preserves full structure and installed Session/Save', async ({ page }, info) => {
    test.setTimeout(180000); await boot(page, 1440);
    const session = await createAndOpenNativeSession(page, seeded.start), beforeSession = await loadNativeSnapshot(page, session.sessionId);
    const save = await api(page, `product/sessions/${session.sessionId}/save`, { displayName: 'B1 entry snapshot', expectedRevisionId: beforeSession.revision.revisionId });
    const exportSave = async () => inspectAtriaSaveContainer(Buffer.from((await api(page, `product/sessions/${session.sessionId}/saves/${save.saveId}/export`, {})).data, 'base64')).save;
    const beforeSave = await exportSave();
    const first = entry(seeded.start.entryPointId), second = entry();
    const project = source([first, second], seeded.start.packageId); await open(page, project);
    const studio = page.locator('[data-atria-studio-workspace]'), center = studio.locator('.atria-studio-center'), activity = studio.locator('.atria-studio-activity');
    await studio.locator('.atria-studio-resource-tree').getByRole('button', { name: 'EntryPoints', exact: true }).click();
    const chooser = center.getByLabel('EntryPoints resource', { exact: true }); await expect(chooser).toHaveValue(first.entryPointId);
    await chooser.selectOption(second.entryPointId); await expect(center.locator('.atri-studio-action-target')).toContainText(first.entryPointId);
    await chooser.selectOption(first.entryPointId);
    await center.getByLabel('displayName', { exact: true }).fill('Renamed');
    await center.locator('summary').filter({ hasText: /^1$/ }).click();
    await center.getByLabel('initialTimeline.0.content', { exact: true }).fill('New opening');
    await center.getByRole('button', { name: 'Source', exact: true }).click();
    const editor = center.getByLabel('EntryPoints resource JSON', { exact: true }); const draft = JSON.parse(await editor.inputValue());
    draft.runtime.pluginData.newKey = { nested: [null, true, 42] }; await editor.fill(JSON.stringify(draft));
    await center.getByRole('button', { name: 'Review Changes', exact: true }).click();
    await expect(activity.getByRole('button', { name: 'Apply ChangeSet' })).toBeVisible();
    expect((await api(page, `studio/projects/${project.project.projectId}`)).source.package.entryPoints[0]).toEqual(assertEntryPoint(first));
    await activity.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(editor).toHaveValue(JSON.stringify(draft));
    await center.getByRole('button', { name: 'Review Changes', exact: true }).click();
    await activity.getByRole('button', { name: 'Apply ChangeSet' }).click(); await expect(activity.getByRole('button', { name: 'Apply ChangeSet' })).toHaveCount(0);
    await expect(center.getByLabel('displayName', { exact: true })).toHaveValue('Renamed');
    await center.getByRole('button', { name: 'Collection Source' }).click(); const collection = center.getByLabel('EntryPoints collection JSON', { exact: true });
    for (const invalid of [[], [draft, draft], [{ ...draft, metadata: { unknown: true } }], [{ ...draft, actorIds: [createNativeId('actor')] }]]) {
        await collection.fill(JSON.stringify(invalid)); await center.getByRole('button', { name: 'Review Changes', exact: true }).click();
        await expect(center.getByRole('alert')).toBeVisible(); await expect(collection).toHaveValue(JSON.stringify(invalid));
    }
    const third = entry(); await collection.fill(JSON.stringify([second, draft, third])); await center.getByRole('button', { name: 'Review Changes' }).click();
    await activity.getByRole('button', { name: 'Apply ChangeSet' }).click(); await expect(activity.getByRole('button', { name: 'Apply ChangeSet' })).toHaveCount(0);
    await center.getByRole('button', { name: 'EntryPoint fields' }).click(); await expect(chooser).toHaveValue(first.entryPointId);
    await expect(studio.locator('[data-atria-studio-entry-point-id][data-active="true"]')).toHaveAttribute('data-atria-studio-entry-point-id', first.entryPointId);
    await expect(center.locator('.atri-studio-action-target')).toContainText(second.entryPointId);
    await page.screenshot({ path: info.outputPath('entrypoints-wide-fields.png'), fullPage: true });
    await center.getByRole('button', { name: 'Collection Source' }).click(); await collection.fill(JSON.stringify([second, draft]));
    await center.getByRole('button', { name: 'Review Changes' }).click(); await activity.getByRole('button', { name: 'Apply ChangeSet' }).click();
    await expect(activity.getByRole('button', { name: 'Apply ChangeSet' })).toHaveCount(0);
    const final = await api(page, `studio/projects/${project.project.projectId}`), expected = [assertEntryPoint(second), assertEntryPoint(draft)];
    expect(final.source.package).toEqual({ ...project.package, entryPoints: expected });
    for (const key of ['resources', 'worlds', 'knowledge', 'knowledgeBindings', 'assetFiles', 'dependencies']) expect(final.source[key]).toEqual(project[key]);
    const built = await api(page, `studio/projects/${project.project.projectId}/build`, { baseRevision: final.revision.revision });
    expect(built.manifest.entryPoints).toEqual(expected);
    expect(inspectAtriaPackageContainer(Buffer.from(built.data, 'base64')).manifest.entryPoints).toEqual(expected);
    const persisted = JSON.parse(readFileSync(join(seeded.dataRoot, seeded.handle, 'projects', project.project.projectId, 'atria.project.json'), 'utf8'));
    expect(persisted.package.entryPoints).toEqual(expected); expect(built.packageVersion.packageId).toBe(project.project.packageId);
    const previewResponse = page.waitForResponse(response => response.url().endsWith('/preview') && response.request().method() === 'POST');
    await studio.locator('.atria-studio-topbar').getByRole('button', { name: 'Preview', exact: true }).click();
    expect((await (await previewResponse).json()).preview.entryPointId).toBe(second.entryPointId);
    await expect(center.locator('[data-atria-studio-view="preview"]')).toBeVisible();
    const afterSession = await loadNativeSnapshot(page, session.sessionId); expect(afterSession.session).toEqual(beforeSession.session); expect(afterSession.manifest).toEqual(beforeSession.manifest);
    const afterSave = await exportSave(); expect({ ...afterSave, exportedAt: beforeSave.exportedAt }).toEqual(beforeSave);
    await studio.locator('.atria-studio-resource-tree').getByRole('button', { name: 'Experience', exact: true }).click();
    await expect(center.locator('.atri-studio-action-target')).toContainText(second.entryPointId);
    await studio.locator('.atria-studio-resource-tree').getByRole('button', { name: 'UI', exact: true }).click();
    await expect(center.locator('.atri-studio-action-target')).toContainText(second.entryPointId);
    await studio.locator('.atria-studio-resource-tree').getByRole('button', { name: 'Test / Simulation', exact: true }).click();
    const scenario = center.locator('textarea'); await scenario.fill(JSON.stringify({ schemaVersion: 1, entryPointId: first.entryPointId, steps: [{ kind: 'assert', input: { path: 'timeline.0.content', equals: 'New opening' } }] }));
    await expect(center.locator('.atri-studio-action-target')).toContainText(first.entryPointId);
    const simulationResponse = page.waitForResponse(response => response.url().endsWith('/simulate') && response.request().method() === 'POST');
    page.once('dialog', dialog => dialog.accept()); await center.getByRole('button', { name: 'Run Simulation', exact: true }).click();
    const simulation = await (await simulationResponse).json(); expect(simulation.status).toBe('completed'); expect(simulation.result.status).toBe('passed');
    expect((await loadNativeSnapshot(page, session.sessionId)).session).toEqual(beforeSession.session);
});

test('EntryPoints Chinese 320px maximum text/keyboard/real 409 preserves Source and explicitly discards on reload', async ({ page }, info) => {
    test.setTimeout(180000); await boot(page, 320, 'zh-cn'); await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => {
        const control = document.getElementById('font_scale'); control.value = control.max; window.$(control).trigger('input', { forced: true }); document.documentElement.style.setProperty('--SmartThemeBlurTintColor', '#ffffff'); window.$('#fast_ui_mode').prop('checked', true).trigger('change');
    });
    expect(await page.evaluate(async () => (await import('/scripts/power-user.js')).power_user.font_scale)).toBe(1.5);
    const first = entry(), second = entry(), project = source([first, second]); await open(page, project);
    const studio = page.locator('[data-atria-studio-workspace]'), center = studio.locator('.atria-studio-center'), activity = studio.locator('.atria-studio-activity'), nav = studio.locator('.atria-studio-mobile-nav');
    await nav.getByRole('button', { name: '项目', exact: true }).click(); await studio.locator('.atria-studio-resource-tree').getByRole('button', { name: '入口', exact: true }).click();
    const name = center.getByLabel('displayName', { exact: true }); await name.focus(); await page.keyboard.press('Tab'); await expect(center.locator('summary').filter({ hasText: /^角色$/ })).toBeFocused();
    await page.keyboard.press('Shift+Tab'); await expect(name).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('entrypoints-zh-320-fields.png'), fullPage: true });
    await name.fill('冲突草稿：入口原文'); await center.getByRole('button', { name: '审阅更改', exact: true }).click();
    const current = await api(page, `studio/projects/${project.project.projectId}`);
    await page.evaluate(async ({ id, revision }) => {
        const response = await fetch(`/api/native/studio/projects/${id}/source`, { method: 'PUT', headers: window.Atria.getContext().getRequestHeaders(), body: JSON.stringify({ path: 'entry-concurrent.txt', content: 'Other editor', baseRevision: revision, origin: { kind: 'human', id: 'entry-other-editor' } }) });
        if (!response.ok) throw new Error(await response.text());
    }, { id: project.project.projectId, revision: current.revision.revision });
    await activity.getByRole('button', { name: '应用更改集', exact: true }).click(); await expect(activity).toContainText('修订冲突');
    await activity.getByRole('button', { name: '复制入口草稿', exact: true }).click(); const copied = activity.getByLabel('入口草稿 Source');
    expect(JSON.parse(await copied.inputValue())).toEqual({ ...first, displayName: '冲突草稿：入口原文' }); await expect(copied).toBeFocused();
    page.once('dialog', dialog => dialog.dismiss()); await activity.getByRole('button', { name: '重新载入最新版', exact: true }).click(); await expect(copied).toBeVisible();
    expect(await studio.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath('entrypoints-zh-320-conflict.png'), fullPage: true });
    page.once('dialog', dialog => dialog.accept()); await activity.getByRole('button', { name: '重新载入最新版', exact: true }).click(); await nav.getByRole('button', { name: '编辑', exact: true }).click();
    await expect(name).toHaveValue(first.displayName); await page.setViewportSize({ width: 720, height: 900 }); await name.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('entrypoints-zh-720-fields.png'), fullPage: true });
});
