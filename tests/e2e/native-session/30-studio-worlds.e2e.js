import { test, expect } from '@playwright/test';
import { createNativeId } from '../../../src/native/identity.js';
import { assertPackagedWorldSnapshot } from '../../../src/native/world-knowledge.js';
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
    seeded = await seedNativeSessionDataRoot({ suffix: 'studio-worlds-b1' });
    server = await startServer({ batchKey: 'generation', scenarioId: 'studio-worlds-b1', useExistingDataRoot: seeded.dataRoot });
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
function source(worlds, packageId = createNativeId('package')) {
    return { format: 'atria-project-source', schemaVersion: 1,
        project: { projectId: createNativeId('project'), packageId, displayName: 'B1 Worlds 中文项目', createdAt: 10, updatedAt: 10 },
        package: { name: 'B1 Worlds', version: '1.0.0', actors: [], capabilities: ['narrative'], permissions: [], entryPoints: [{ entryPointId: createNativeId('entryPoint'), displayName: 'Main', actorIds: [], worldIds: worlds[0] ? [worlds[0].world.worldId] : [], knowledgeBindingIds: [] }] },
        resources: [], worlds, knowledge: [], knowledgeBindings: [], assetFiles: [], dependencies: { worlds: [], knowledge: [], knowledgeBindings: [], assets: [], resources: [] },
    };
}
async function open(page, project) {
    await api(page, 'studio/projects', { source: project });
    await page.evaluate(id => window.Atria.shell.getWorkspaceHost().openBuild(id), project.project.projectId);
    await expect(page.locator('[data-atria-studio-view="overview"]')).toBeVisible();
}
function world() {
    const worldId = createNativeId('world'), worldRevisionId = createNativeId('worldRevision');
    return { world: { worldId, displayName: 'Same name', currentRevisionId: worldRevisionId, createdAt: 1, updatedAt: 2 }, revision: { worldId, worldRevisionId, baseline: { location: 'harbor', nested: { values: [null, true, 7] } }, schema: { custom: { nested: [null, false, 3] } }, knowledgeBindingIds: [], assetIds: [], metadata: { plugin: { values: [null, false, 4] } }, createdAt: 2 } };
}

test('Worlds real FS/HTTP canonical round trip preserves dependencies, installed Session/Save and startup state', async ({ page }, info) => {
    test.setTimeout(180000); await boot(page, 1440);
    const session = await createAndOpenNativeSession(page, seeded.start), before = await loadNativeSnapshot(page, session.sessionId);
    const save = await api(page, `product/sessions/${session.sessionId}/save`, { displayName: 'World snapshot', expectedRevisionId: before.revision.revisionId });
    const exportSave = async () => inspectAtriaSaveContainer(Buffer.from((await api(page, `product/sessions/${session.sessionId}/saves/${save.saveId}/export`, {})).data, 'base64')).save;
    const beforeSave = await exportSave();
    const first = world(), second = world(), project = source([first, second], seeded.start.packageId); await open(page, project);
    const studio = page.locator('[data-atria-studio-workspace]'), center = studio.locator('.atria-studio-center'), activity = studio.locator('.atria-studio-activity');
    await studio.locator('.atria-studio-resource-tree').getByRole('button', { name: 'Worlds', exact: true }).click();
    const chooser = center.getByLabel('Worlds resource', { exact: true }); await chooser.selectOption(second.world.worldId); await chooser.selectOption(first.world.worldId);
    await center.getByLabel('World name', { exact: true }).fill('Renamed World');
    await center.getByLabel('baseline.location', { exact: true }).fill('New harbor');
    await center.getByRole('button', { name: 'Source', exact: true }).click(); const editor = center.getByLabel('Worlds resource JSON');
    const draft = JSON.parse(await editor.inputValue()); draft.revision.metadata.plugin.more = { values: [null, false, 'opaque'] }; await editor.fill(JSON.stringify(draft));
    await center.getByRole('button', { name: 'Review Changes', exact: true }).click(); await expect(activity.getByRole('button', { name: 'Apply ChangeSet' })).toBeVisible();
    expect((await api(page, `studio/projects/${project.project.projectId}`)).source.worlds[0]).toEqual(assertPackagedWorldSnapshot(first));
    await activity.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(editor).toHaveValue(JSON.stringify(draft));
    await center.getByRole('button', { name: 'Review Changes' }).click(); await activity.getByRole('button', { name: 'Apply ChangeSet' }).click();
    await expect(center.getByLabel('World name')).toHaveValue('Renamed World');
    await center.getByRole('button', { name: 'Collection Source' }).click(); const collection = center.getByLabel('Worlds collection JSON');
    for (const invalid of [[], [draft, draft], [{ ...draft, extra: true }], [{ ...draft, revision: { ...draft.revision, baseline: null } }], [{ ...draft, revision: { ...draft.revision, assetIds: [createNativeId('asset')] } }]]) {
        await collection.fill(JSON.stringify(invalid)); await center.getByRole('button', { name: 'Review Changes' }).click();
        await expect(center.getByRole('alert')).toBeVisible(); await expect(collection).toHaveValue(JSON.stringify(invalid));
    }
    const third = world(); await collection.fill(JSON.stringify([second, draft, third])); await center.getByRole('button', { name: 'Review Changes' }).click(); await activity.getByRole('button', { name: 'Apply ChangeSet' }).click();
    await expect(activity.getByRole('button', { name: 'Apply ChangeSet' })).toHaveCount(0); await center.getByRole('button', { name: 'World fields' }).click();
    await expect(chooser).toHaveValue(first.world.worldId);
    await expect(studio.locator('[data-atria-studio-world-id][data-active="true"]')).toHaveAttribute('data-atria-studio-world-id', first.world.worldId);
    await page.screenshot({ path: info.outputPath('worlds-wide-fields.png'), fullPage: true });
    await center.getByRole('button', { name: 'Collection Source' }).click(); await collection.fill(JSON.stringify([second, draft])); await center.getByRole('button', { name: 'Review Changes' }).click(); await activity.getByRole('button', { name: 'Apply ChangeSet' }).click();
    await expect(activity.getByRole('button', { name: 'Apply ChangeSet' })).toHaveCount(0);
    const final = await api(page, `studio/projects/${project.project.projectId}`), expected = [second, draft].map(assertPackagedWorldSnapshot);
    expect(final.source.worlds).toEqual(expected); expect(final.source.package).toEqual(project.package);
    for (const key of ['resources', 'knowledge', 'knowledgeBindings', 'assetFiles', 'dependencies']) expect(final.source[key]).toEqual(project[key]);
    const built = await api(page, `studio/projects/${project.project.projectId}/build`, { baseRevision: final.revision.revision });
    expect(built.manifest.worlds).toEqual(expected); expect(inspectAtriaPackageContainer(Buffer.from(built.data, 'base64')).manifest.worlds).toEqual(expected);
    expect(JSON.parse(readFileSync(join(seeded.dataRoot, seeded.handle, 'projects', project.project.projectId, 'atria.project.json'), 'utf8')).worlds).toEqual(expected);
    const after = await loadNativeSnapshot(page, session.sessionId); expect(after.session).toEqual(before.session); expect(after.states).toEqual(before.states); expect(after.manifest).toEqual(before.manifest);
    const afterSave = await exportSave(); expect({ ...afterSave, exportedAt: beforeSave.exportedAt }).toEqual(beforeSave);
    const simulation = await api(page, `studio/projects/${project.project.projectId}/simulate`, { baseRevision: final.revision.revision, scenario: { schemaVersion: 1, steps: [{ kind: 'assert', input: { path: `states.atri_world_state.worlds.${first.world.worldId}.state.location`, equals: 'New harbor' } }] } });
    expect(simulation.status).toBe('completed'); expect(simulation.result.status).toBe('passed');
});

test('Worlds Chinese 320px keyboard and real conflict retain Source until explicit reload', async ({ page }, info) => {
    test.setTimeout(180000); await boot(page, 320, 'zh-cn'); await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => { const control = document.getElementById('font_scale'); control.value = control.max; window.$(control).trigger('input', { forced: true }); document.documentElement.style.setProperty('--SmartThemeBlurTintColor', '#ffffff'); window.$('#fast_ui_mode').prop('checked', true).trigger('change'); });
    const first = world(), project = source([first, world()]); await open(page, project);
    const studio = page.locator('[data-atria-studio-workspace]'), center = studio.locator('.atria-studio-center'), activity = studio.locator('.atria-studio-activity'), nav = studio.locator('.atria-studio-mobile-nav');
    await nav.getByRole('button', { name: '项目', exact: true }).click(); await studio.locator('.atria-studio-resource-tree').getByRole('button', { name: '世界', exact: true }).click();
    const name = center.getByLabel('世界名称', { exact: true }); await name.focus(); await page.keyboard.press('Tab'); await expect(center.getByText('世界初始状态', { exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab'); await expect(name).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath('worlds-zh-320-fields.png'), fullPage: true });
    await name.fill('冲突草稿：世界'); await center.getByRole('button', { name: '审阅更改', exact: true }).click();
    const current = await api(page, `studio/projects/${project.project.projectId}`);
    await page.evaluate(async ({ id, revision }) => { const response = await fetch(`/api/native/studio/projects/${id}/source`, { method: 'PUT', headers: window.Atria.getContext().getRequestHeaders(), body: JSON.stringify({ path: 'world-concurrent.txt', content: 'Other editor', baseRevision: revision, origin: { kind: 'human', id: 'world-other' } }) }); if (!response.ok) throw new Error(await response.text()); }, { id: project.project.projectId, revision: current.revision.revision });
    await activity.getByRole('button', { name: '应用更改集', exact: true }).click(); await expect(activity).toContainText('修订冲突');
    await activity.getByRole('button', { name: '复制世界草稿', exact: true }).click(); const copied = activity.getByLabel('世界草稿 Source');
    expect(JSON.parse(await copied.inputValue())).toEqual({ ...first, world: { ...first.world, displayName: '冲突草稿：世界' } }); await expect(copied).toBeFocused();
    page.once('dialog', dialog => dialog.dismiss()); await activity.getByRole('button', { name: '重新载入最新版' }).click(); await expect(copied).toBeVisible();
    await page.screenshot({ path: info.outputPath('worlds-zh-320-conflict.png'), fullPage: true });
    page.once('dialog', dialog => dialog.accept()); await activity.getByRole('button', { name: '重新载入最新版' }).click(); await nav.getByRole('button', { name: '编辑', exact: true }).click();
    await expect(name).toHaveValue(first.world.displayName); await page.setViewportSize({ width: 720, height: 900 }); await name.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('worlds-zh-720-fields.png'), fullPage: true });
});
