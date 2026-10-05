import { test, expect } from '@playwright/test';
import { createNativeId } from '../../../src/native/identity.js';
import { assertActor } from '../../../src/native/contracts.js';
import { inspectAtriaSaveContainer } from '../../../src/native/save-container.js';
import { startServer, tearDownServer } from '../_lib/server.js';
import { awaitMainUI } from '../_lib/page.js';
import { seedNativeSessionDataRoot, createAndOpenNativeSession, loadNativeSnapshot } from './_helpers.js';
if (process.env.PW_NATIVE_CHANNEL) test.use({ channel: process.env.PW_NATIVE_CHANNEL });
test.use({ actionTimeout: 12000 });
let server, seeded;
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
    seeded = await seedNativeSessionDataRoot({ suffix: 'studio-actors-b1' });
    server = await startServer({ batchKey: 'generation', scenarioId: 'studio-actors-b1', useExistingDataRoot: seeded.dataRoot });
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
function source(actors, packageId = createNativeId('package')) {
    return {
        format: 'atria-project-source', schemaVersion: 1,
        project: { projectId: createNativeId('project'), packageId, displayName: 'B1 Actors 中文项目', createdAt: 10, updatedAt: 10 },
        package: { name: 'B1 Actors', version: '1.0.0', actors, capabilities: ['narrative'], permissions: [], entryPoints: [{ entryPointId: createNativeId('entryPoint'), displayName: 'Start', actorIds: actors.length ? [actors[0].actorId] : [], ...(actors.length ? { primaryActorId: actors[0].actorId } : {}), worldIds: [], knowledgeBindingIds: [] }] },
        resources: [], worlds: [], knowledge: [], knowledgeBindings: [], assetFiles: [], dependencies: { worlds: [], knowledge: [], knowledgeBindings: [], assets: [], resources: [] },
    };
}
async function open(page, project) {
    await api(page, 'studio/projects', { source: project });
    await page.evaluate(id => window.Atria.shell.getWorkspaceHost().openBuild(id), project.project.projectId);
    await expect(page.locator('[data-atria-studio-view="overview"]')).toBeVisible();
}

test('Actors old source → UI → canonical FS/save/build preserves arbitrary JSON and exact installed Session/Save', async ({ page }, info) => {
    test.setTimeout(180000); await boot(page, 1440);
    const session = await createAndOpenNativeSession(page, seeded.start);
    const beforeSession = await loadNativeSnapshot(page, session.sessionId);
    const save = await api(page, `product/sessions/${session.sessionId}/save`, { displayName: 'B1 immutable save', expectedRevisionId: beforeSession.revision.revisionId });
    const saveBefore = inspectAtriaSaveContainer(Buffer.from((await api(page, `product/sessions/${session.sessionId}/saves/${save.saveId}/export`, {})).data, 'base64')).save;
    const first = { actorId: seeded.fixture.manifest.actors[0].actorId, displayName: 'Same name', role: 'guide', profile: { description: { rich: [null, false, 1] }, personality: 'Quiet', examples: 'Primary', mes_example: 'Legacy', plugin: { values: [null, true, 3.5] } }, metadata: { opaque: { custom: [null, false, 2] } } };
    const second = { actorId: createNativeId('actor'), displayName: 'Same name', profile: {}, metadata: {} };
    const project = source([first, second], seeded.start.packageId); await open(page, project);
    const studio = page.locator('[data-atria-studio-workspace]'), center = studio.locator('.atria-studio-center'), activity = studio.locator('.atria-studio-activity');
    await studio.locator('.atria-studio-resource-tree').getByRole('button', { name: 'Actors', exact: true }).click();
    await expect(center.getByLabel('Actors resource', { exact: true })).toHaveValue(first.actorId);
    await center.getByLabel('displayName', { exact: true }).fill('Renamed');
    await center.getByLabel('profile.personality', { exact: true }).fill('Still quiet');
    await center.getByRole('button', { name: 'Remove role', exact: true }).click();
    await center.getByRole('button', { name: 'Source', exact: true }).click();
    const actorSource = center.getByLabel('Actors resource JSON', { exact: true });
    const draft = JSON.parse(await actorSource.inputValue());
    expect(draft.profile.description).toEqual(first.profile.description); expect(draft.profile.mes_example).toBe('Legacy'); expect(draft.role).toBeUndefined();
    draft.profile.plugin.newKey = { nested: [false, null, 42] }; draft.metadata.extra = [true, null, { x: 2 }]; await actorSource.fill(JSON.stringify(draft));
    await center.getByRole('button', { name: 'Review Changes', exact: true }).click();
    await expect(activity.getByRole('button', { name: 'Apply ChangeSet' })).toBeVisible();
    expect((await api(page, `studio/projects/${project.project.projectId}`)).source.package.actors[0]).toEqual(assertActor(first));
    await activity.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(actorSource).toHaveValue(JSON.stringify(draft));
    await center.getByRole('button', { name: 'Review Changes', exact: true }).click();
    await activity.getByRole('button', { name: 'Apply ChangeSet' }).click(); await expect(activity.getByRole('button', { name: 'Apply ChangeSet' })).toHaveCount(0); await expect(center.getByLabel('displayName', { exact: true })).toHaveValue('Renamed');
    const after = await api(page, `studio/projects/${project.project.projectId}`);
    expect(after.source.package).toEqual({ ...project.package, actors: [assertActor(draft), assertActor(second)] });
    for (const key of ['resources', 'worlds', 'knowledge', 'knowledgeBindings', 'assetFiles', 'dependencies']) expect(after.source[key]).toEqual(project[key]);
    await center.getByRole('button', { name: 'Collection Source' }).click(); const collection = center.getByLabel('Actors collection JSON', { exact: true });
    const third = { actorId: createNativeId('actor'), displayName: 'New', profile: { nullable: null }, metadata: {} };
    await collection.fill(JSON.stringify([second, draft, third])); await center.getByRole('button', { name: 'Review Changes' }).click();
    await activity.getByRole('button', { name: 'Apply ChangeSet' }).click(); await expect(activity.getByRole('button', { name: 'Apply ChangeSet' })).toHaveCount(0); await expect(collection).toHaveValue(/New/);
    await center.getByRole('button', { name: 'Actor fields' }).click(); await expect(center.getByLabel('Actors resource')).toHaveValue(first.actorId);
    await center.getByRole('button', { name: 'Collection Source' }).click(); await collection.fill(JSON.stringify([second]));
    await center.getByRole('button', { name: 'Review Changes' }).click(); await expect(center.getByRole('alert')).toContainText('EntryPoints');
    await collection.fill(JSON.stringify([second, draft])); await center.getByRole('button', { name: 'Review Changes' }).click();
    await activity.getByRole('button', { name: 'Apply ChangeSet' }).click(); await expect(activity.getByRole('button', { name: 'Apply ChangeSet' })).toHaveCount(0); await expect(collection).not.toHaveValue(/New/);
    const final = await api(page, `studio/projects/${project.project.projectId}`), expected = [assertActor(second), assertActor(draft)];
    const built = await api(page, `studio/projects/${project.project.projectId}/build`, { baseRevision: final.revision.revision });
    expect(built.manifest.actors).toEqual(expected); expect(built.packageVersion.packageId).toBe(project.project.packageId);
    const afterSession = await loadNativeSnapshot(page, session.sessionId);
    expect(afterSession.manifest.actors).toEqual(beforeSession.manifest.actors); expect(afterSession.session).toEqual(beforeSession.session);
    const saveAfter = inspectAtriaSaveContainer(Buffer.from((await api(page, `product/sessions/${session.sessionId}/saves/${save.saveId}/export`, {})).data, 'base64')).save;
    // Each export stamps its own time; the captured package and closure must stay exact.
    expect({ ...saveAfter, exportedAt: saveBefore.exportedAt }).toEqual(saveBefore);
    await page.screenshot({ path: info.outputPath('actors-wide-source.png'), fullPage: true });
});

test('Actors empty/Chinese 320px/maximum text/keyboard/conflict uses real project revision and retains Source', async ({ page }, info) => {
    test.setTimeout(180000); await boot(page, 320, 'zh-cn'); await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => {
        const control = document.getElementById('font_scale'); control.value = control.max; window.$(control).trigger('input', { forced: true }); document.documentElement.style.setProperty('--SmartThemeBlurTintColor', '#ffffff'); window.$('#fast_ui_mode').prop('checked', true).trigger('change');
    });
    expect(await page.evaluate(async () => (await import('/scripts/power-user.js')).power_user.font_scale)).toBe(1.5);
    const project = source([]); await open(page, project);
    const studio = page.locator('[data-atria-studio-workspace]'), center = studio.locator('.atria-studio-center'), activity = studio.locator('.atria-studio-activity'), nav = studio.locator('.atria-studio-mobile-nav');
    await nav.getByRole('button', { name: '项目', exact: true }).click(); await studio.locator('.atria-studio-resource-tree').getByRole('button', { name: '角色', exact: true }).click();
    await expect(center).toContainText('暂无角色');
    const actor = { actorId: createNativeId('actor'), displayName: '长名称：跨越星空的观测者', profile: { description: '故事中的角色', personality: false, plugin: { unknown: [null, false, 2] } }, metadata: {} };
    const collection = center.getByLabel('Actors collection JSON'); await collection.fill(JSON.stringify([actor])); await center.getByRole('button', { name: '审阅更改', exact: true }).click();
    await activity.getByRole('button', { name: '应用更改集', exact: true }).click(); await expect(activity.getByRole('button', { name: '应用更改集', exact: true })).toHaveCount(0); await nav.getByRole('button', { name: '编辑', exact: true }).click();
    await expect(center.getByRole('button', { name: '角色字段', exact: true })).toBeDisabled();
    const name = center.getByLabel('displayName', { exact: true }); await expect(name).toBeVisible(); await name.focus();
    await page.keyboard.press('Tab'); await expect(center.getByLabel('role', { exact: true })).toBeFocused(); await page.keyboard.press('Shift+Tab'); await expect(name).toBeFocused();
    await page.screenshot({ path: info.outputPath('actors-zh-320-identity.png'), fullPage: true });
    await name.fill('冲突草稿：保留原文');
    await center.getByRole('button', { name: '审阅更改', exact: true }).click();
    const current = await api(page, `studio/projects/${project.project.projectId}`);
    await page.evaluate(async ({ id, revision }) => {
        const response = await fetch(`/api/native/studio/projects/${id}/source`, { method: 'PUT', headers: window.Atria.getContext().getRequestHeaders(), body: JSON.stringify({ path: 'concurrent.txt', content: 'Another editor', baseRevision: revision, origin: { kind: 'human', id: 'actors-other-editor' } }) });
        if (!response.ok) throw new Error(await response.text());
    }, { id: project.project.projectId, revision: current.revision.revision });
    await activity.getByRole('button', { name: '应用更改集', exact: true }).click(); await expect(activity).toContainText('修订冲突');
    await activity.getByRole('button', { name: '复制角色草稿', exact: true }).click(); const exported = activity.getByLabel('角色草稿 Source');
    expect(JSON.parse(await exported.inputValue())).toEqual({ ...actor, displayName: '冲突草稿：保留原文' }); await expect(exported).toBeFocused();
    page.once('dialog', dialog => dialog.dismiss()); await activity.getByRole('button', { name: '重新载入最新版', exact: true }).click(); await expect(exported).toBeVisible();
    expect(await studio.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath('actors-zh-320-conflict.png'), fullPage: true });
    page.once('dialog', dialog => dialog.accept()); await activity.getByRole('button', { name: '重新载入最新版', exact: true }).click();
    await nav.getByRole('button', { name: '编辑', exact: true }).click(); await expect(name).toHaveValue(actor.displayName);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('actors-zh-320-fields.png'), fullPage: true });
    await page.setViewportSize({ width: 720, height: 900 }); await expect(name).toHaveValue(actor.displayName); await name.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('actors-zh-720-fields.png'), fullPage: true });
});
