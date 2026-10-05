import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FsEngine } from '../../../src/storage/engines/fs-engine.js';
import { buildAtriaPackageContainer, inspectAtriaPackageContainer } from '../../../src/native/package-container.js';
import { createNativeId } from '../../../src/native/index.js';
import { taskBindingFixture } from '../../native/helpers/task-binding-fixture.js';
import { seedGenerationProfiles } from '../../native/helpers/generation-fixture.js';
import { startServer, tearDownServer } from '../_lib/server.js';
import { awaitMainUI } from '../_lib/page.js';
import { seedNativeSessionDataRoot } from './_helpers.js';

if (process.env.PW_NATIVE_CHANNEL) test.use({ channel: process.env.PW_NATIVE_CHANNEL });
test.describe.configure({ mode: 'serial' });
let server, routes;

test.beforeAll(async () => {
    const seeded = await seedNativeSessionDataRoot({ suffix: 'task-binding' });
    const root = resolve(seeded.dataRoot, seeded.handle);
    const engine = new FsEngine({ directoriesByHandle: () => ({ root, assets: resolve(root, 'assets') }) });
    ({ routes } = await seedGenerationProfiles({ engine, handle: seeded.handle, endpoint: 'http://127.0.0.1:1/no-inference', roles: ['narrator', 'memory'] }));
    await engine.close();
    server = await startServer({ batchKey: 'generation', scenarioId: 'task-binding', useExistingDataRoot: seeded.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server, { removeData: true }); });

async function api(page, path, body) {
    return page.evaluate(async ({ path, body }) => {
        const response = await fetch('/api/native/' + path, { method: body === undefined ? 'GET' : 'POST', headers: window.Atria.getContext().getRequestHeaders(), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        if (!response.ok) throw new Error(await response.text()); return response.json();
    }, { path, body });
}
async function boot(page, width = 1440) {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/**', route => route.fulfill({ json: [] }));
    await awaitMainUI(page, server.baseURL);
}
async function install(page, tasks = true) {
    const f = taskBindingFixture({ tasks });
    await api(page, 'product/packages/install', { data: f.archive.toString('base64'), grantedPermissions: ['generation'] });
    return f;
}
async function openWork(page, packageId) {
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openLibrarySection('works'));
    await page.locator('[data-atria-work-id="' + packageId + '"] button').click();
    await expect(page.locator('[data-atria-work-detail]')).toHaveAttribute('data-atria-work-detail', packageId);
}
const setup = page => page.locator('[data-atria-task-binding-setup]');
const sessions = (page, id) => api(page, 'product/works/' + id).then(work => work.sessions.length);
const full = page => page.locator('#atria-game-full-root');
async function assertFull(page, title = 'Task binding Full UI') {
    await expect.poll(async () => page.evaluate(() => {
        const api = window.Atria.getContext().getCapabilityApi('game-runtime');
        const state = api.getPackageState(); return state.status === 'invalid' || state.status === 'error' ? state.errors : api.isExperienceReady();
    }), { timeout: 45000 }).toBe(true);
    await expect(full(page)).toBeVisible({ timeout: 45000 }); await expect(full(page)).toContainText(title);
    expect(await page.evaluate(() => window.Atria.getContext().getCapabilityApi('game-runtime').isExperienceReady())).toBe(true);
}

for (const width of [1440, 390]) test('Works first start saves one player route for two purposes and mounts app.root at ' + width, async ({ page }, info) => {
    await boot(page, width); const f = await install(page); await openWork(page, f.manifest.packageId);
    await page.getByRole('button', { name: 'Start New', exact: true }).click();
    await expect(setup(page).locator('[data-atria-binding-slot]')).toHaveCount(2);
    await expect(setup(page)).toContainText('case.reflection, claim.advisor, agenda.deliberation');
    expect(await sessions(page, f.manifest.packageId)).toBe(0);
    await expect(setup(page).getByRole('button', { name: 'Save and continue' })).toBeDisabled();
    await page.screenshot({ path: info.outputPath('binding-setup-' + width + '.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await setup(page).getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await sessions(page, f.manifest.packageId)).toBe(0);
    await page.getByRole('button', { name: 'Start New', exact: true }).click();
    await setup(page).getByLabel('Use one route for all purposes').selectOption(routes[0].runtimeRouteId);
    await setup(page).getByRole('button', { name: 'Save and continue' }).click();
    await assertFull(page); expect(await sessions(page, f.manifest.packageId)).toBe(1);
    await page.screenshot({ path: info.outputPath('full-' + width + '.png'), fullPage: true });
    const bindings = await page.evaluate(id => window.Atria.getContext().getCapabilityApi('game-runtime').getTaskBindings(id), f.manifest.packageId);
    expect(bindings.narrative).toEqual(bindings.structured); expect(bindings.narrative.scope).toBe('player');
    // The second start reuses valid player settings, without another setup prompt.
    await openWork(page, f.manifest.packageId); await page.getByRole('button', { name: 'Start New', exact: true }).click();
    await assertFull(page); expect(await sessions(page, f.manifest.packageId)).toBe(2); await expect(setup(page)).toHaveCount(0);
});

test('separate routes and packages without Task Runtime use the real Works start path', async ({ page }) => {
    await boot(page); const f = await install(page); await openWork(page, f.manifest.packageId);
    await page.getByRole('button', { name: 'Start New', exact: true }).click();
    await setup(page).getByLabel('Narrative', { exact: true }).selectOption(routes[0].runtimeRouteId);
    await setup(page).getByLabel('Structured', { exact: true }).selectOption(routes[1].runtimeRouteId);
    await setup(page).getByRole('button', { name: 'Save and continue' }).click(); await assertFull(page);
    const plain = await install(page, false); await openWork(page, plain.manifest.packageId);
    await page.getByRole('button', { name: 'Start New', exact: true }).click(); await assertFull(page); await expect(setup(page)).toHaveCount(0);
});

test('existing INVALID Session recovers in place without reinstalling', async ({ page }, info) => {
    await boot(page, 390); const f = await install(page);
    const base = await api(page, 'product/works/' + f.manifest.packageId + '/start', { packageVersionId: f.manifest.packageVersionId, entryPointId: f.entryPointId });
    await page.evaluate(id => window.Atria.openNativeSession(id), base.session.sessionId);
    const notice = page.locator('[data-atria-task-binding-recovery]'); await expect(notice).toBeVisible();
    await expect(notice).toContainText('Your story is kept'); await expect(full(page)).toHaveCount(0);
    await notice.getByRole('button', { name: 'Configure model purposes' }).click();
    await setup(page).getByLabel('Use one route for all purposes').selectOption(routes[0].runtimeRouteId);
    await setup(page).getByRole('button', { name: 'Save and continue' }).click(); await assertFull(page);
    expect(await page.evaluate(() => window.Atria.nativeSessionRuntime.snapshot.session.sessionId)).toBe(base.session.sessionId);
    expect(await sessions(page, f.manifest.packageId)).toBe(1);
    await page.screenshot({ path: info.outputPath('recovered-full.png'), fullPage: true });
});

test('Original Occult Western Fantasy 1.0.0 release starts Eastbank Field Register without character creation', async ({ page }, info) => {
    test.setTimeout(180000);
    // eslint-disable-next-line playwright/no-skipped-test
    test.skip(!process.env.ATRIA_TASK_BINDING_PACKAGE, 'Optional exact release supplied by local/package workspace; never vendor release assets in main.');
    await boot(page, 390);
    const conflicts = []; page.on('response', response => { if (response.request().method() === 'DELETE' && response.status() === 409) conflicts.push(new URL(response.url()).pathname); });
    const data = readFileSync(process.env.ATRIA_TASK_BINDING_PACKAGE).toString('base64');
    const preflight = await api(page, 'product/packages/preflight', { data });
    await api(page, 'product/packages/install', { data, grantedPermissions: preflight.permissions.map(item => item.permission) });
    const id = preflight.packageId; await openWork(page, id);
    await page.getByRole('button', { name: 'Start New', exact: true }).click();
    await expect(setup(page).locator('[data-atria-binding-slot]')).toHaveCount(2, { timeout: 30000 }); expect(await sessions(page, id)).toBe(0);
    await setup(page).getByLabel('Use one route for all purposes').selectOption(routes[0].runtimeRouteId);
    await setup(page).getByRole('button', { name: 'Save and continue' }).click(); await assertFull(page, /Eastbank\s*Field register/i);
    await expect(full(page)).toContainText('Step 1 of 6: Identity');
    for (const tab of ['Field notes', 'Evidence', 'Cases', 'Identity']) await expect(full(page).getByRole('button', { name: tab, exact: true })).toBeVisible();
    // Ready may publish a new lifecycle revision while the Package's initial
    // read is in flight. Its existing Refresh action must recover that stale read.
    await expect(full(page).getByText('Opening the player-safe record…', { exact: true })).not.toBeVisible({ timeout: 15000 });
    const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/native/session/frontend/request');
    await full(page).getByRole('button', { name: 'Refresh record', exact: true }).click();
    expect((await (await refreshed).json()).ok).toBe(true);
    await expect(full(page).getByText('Opening the player-safe record…', { exact: true })).not.toBeVisible({ timeout: 15000 });
    await expect(full(page).getByText(/The record could not be refreshed/)).not.toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: info.outputPath('eastbank-first-start.png'), fullPage: true });
    await info.attach('delete-409', { body: JSON.stringify(conflicts), contentType: 'application/json' }); expect(conflicts).toEqual([]);
});


test('A3 Runtime repair returns to the original startup and preserves its exact old Package version', async ({ page }, info) => {
    test.setTimeout(150000);
    await boot(page, 390); const f = await install(page); await openWork(page, f.manifest.packageId);
    const title = page.getByLabel('Session name (optional)', { exact: true });
    await title.fill('A3 original startup');
    await page.getByRole('button', { name: 'Start New', exact: true }).click();
    await setup(page).getByLabel('Narrative', { exact: true }).selectOption(routes[0].runtimeRouteId);
    await setup(page).getByRole('button', { name: 'Configure Runtime Routes', exact: true }).click();
    await expect(setup(page)).toBeHidden();
    // Install a newer default while the original startup is parked in Runtime.
    const newer = structuredClone(f.manifest); newer.packageVersionId = createNativeId('packageVersion'); newer.version = '2.0.0';
    for (const resource of newer.resources) resource.origin.packageVersionId = newer.packageVersionId;
    const archive = buildAtriaPackageContainer({ manifest: newer, sourceFiles: inspectAtriaPackageContainer(f.archive).sourceFiles }).archive;
    await api(page, 'product/packages/install', { data: archive.toString('base64'), grantedPermissions: ['generation'] });
    await page.getByRole('button', { name: 'Return to model setup', exact: true }).click();
    await expect(setup(page)).toBeVisible(); await expect(title).toHaveValue('A3 original startup');
    await expect(setup(page).getByLabel('Narrative', { exact: true })).toHaveValue(routes[0].runtimeRouteId);
    await setup(page).getByLabel('Structured', { exact: true }).selectOption(routes[1].runtimeRouteId);
    await setup(page).getByRole('button', { name: 'Save and continue', exact: true }).click();
    await assertFull(page); expect(await sessions(page, f.manifest.packageId)).toBe(1);
    const snapshot = await page.evaluate(() => Atria.nativeSessionRuntime.snapshot);
    expect(snapshot.session.packageVersionId).toBe(f.manifest.packageVersionId);
    expect(snapshot.session.displayTitle).toBe('A3 original startup');
    await page.screenshot({ path: info.outputPath('a3-runtime-repair-original-390.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
