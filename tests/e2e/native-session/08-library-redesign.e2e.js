import { openPromptSections } from './_helpers.js';
import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { buildAtriaPackageContainer, KnowledgeRepo, createNativeId } from '../../../src/native/index.js';
import { FsEngine } from '../../../src/storage/engines/fs-engine.js';
import { sessionFixture, knowledgeSnapshot, publishKnowledge, bindingFor } from '../../native/helpers/session-fixture.js';

import { startServer, tearDownServer } from '../_lib/server.js';
import { seedNativeSessionDataRoot } from './_helpers.js';

test.describe.configure({ mode: 'serial' });
let server;

test.beforeAll(async () => {
    const seeded = await seedNativeSessionDataRoot({ suffix: 'library-redesign' });
    const root = resolve(seeded.dataRoot, seeded.handle);
    const engine = new FsEngine({ directoriesByHandle: () => ({ root, assets: resolve(root, 'assets') }) });
    const knowledge = knowledgeSnapshot('The harbour keeper lights the beacon at dusk.\n\nThe last ferry follows its light through the mist.');
    await publishKnowledge(seeded, new KnowledgeRepo({ engine }), knowledge, bindingFor(knowledge, 'library'));
    await engine.close();

    server = await startServer({ batchKey: 'regression', scenarioId: 'library-redesign', useExistingDataRoot: seeded.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server); });

async function boot(page, width = 1440, locale = 'en') {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(locale => localStorage.setItem('language', locale), locale);
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await page.goto(server.baseURL);
    await page.waitForFunction(() => performance.getEntriesByName('[init] complete').length > 0, null, { timeout: 45000 });
}
async function open(page, section) { await page.evaluate(section => window.Atria.shell.getWorkspaceHost().openLibrarySection(section), section); }
async function shot(page, info, name) {
    await page.screenshot({ path: info.outputPath(`${name}.png`), animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
const popup = page => page.locator('dialog.popup[open]').last();

test('Works retry, search, real install permission review and preserved failed input', async ({ page }, info) => {
    await boot(page);
    await page.route('**/api/native/product/works', route => route.fulfill({ status: 503, json: {} }));
    await open(page, 'works');
    await expect(page.getByText('Library could not be loaded')).toBeVisible();
    await shot(page, info, 'works-error');
    await page.unroute('**/api/native/product/works');
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.locator('[data-atria-work-id]')).toHaveCount(1);
    await page.getByLabel('Search works').fill('no such story');
    await expect(page.getByText('No matching works')).toBeVisible();
    await page.getByLabel('Search works').fill('');
    const fixture = sessionFixture();
    fixture.manifest.name = 'The quiet harbour';
    fixture.manifest.description = 'Follow the last ferry through a city of stories.';
    fixture.manifest.permissions = [{ permission: 'generation', required: true, reason: 'Story replies' }];
    fixture.manifest.resources = [{ resourceType: 'core.prompt-module',
        origin: { scope: 'package', packageId: fixture.manifest.packageId, packageVersionId: fixture.manifest.packageVersionId },
        resource: { schemaVersion: 1, promptModuleId: createNativeId('promptModule'), revision: 'r1', displayName: 'Original harbour voice', target: 'system.foundation', stages: ['stage.main'], body: 'Keep the original voice.' },
    }];
    const { archive } = buildAtriaPackageContainer({ manifest: fixture.manifest, sourceFiles: new Map(), assetPayloads: new Map() });
    const install = page.locator('[data-atria-native-install]');
    await page.getByRole('button', { name: 'Install / Update .atria', exact: true }).click();
    await install.getByLabel('Choose an Atria work').setInputFiles({ name: 'harbour.atria', mimeType: 'application/octet-stream', buffer: archive });
    const submit = install.getByRole('button', { name: 'Install / Update', exact: true });
    await submit.click();
    await expect(install.getByRole('alert')).toContainText('generation');
    await install.getByRole('checkbox').check();
    await page.route('**/api/native/product/packages/install', route => route.fulfill({ status: 503, json: {} }));
    await submit.click();
    await expect(install.getByRole('alert')).toContainText('Refresh its current state');
    await expect(install.getByRole('checkbox')).toBeChecked();
    await shot(page, info, 'install-retry');
    await page.unroute('**/api/native/product/packages/install');
    await submit.click();
    await expect(install.getByRole('status')).toContainText('Work installed.');
    await install.getByRole('button', { name: 'Open Work', exact: true }).click();
    await page.getByRole('button', { name: 'Back to collection', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open The quiet harbour', exact: true })).toBeVisible();
    await shot(page, info, 'works-desktop');
});

test('Work detail starts and resumes Native progress; referenced deletion remains blocked', async ({ page }, info) => {
    await boot(page, 900); await open(page, 'works');
    await page.getByRole('button', { name: 'Open The quiet harbour', exact: true }).click();
    await expect(page.getByText('Installed versions', { exact: true })).toBeVisible();
    await shot(page, info, 'work-medium');
    await page.getByRole('button', { name: 'Start New', exact: true }).click();
    await expect(page.locator('#atria-play-product')).toBeVisible();
    await open(page, 'works');
    await page.getByRole('button', { name: 'Open The quiet harbour', exact: true }).click();
    await page.getByText('Manage work', { exact: true }).click();
    await page.getByRole('button', { name: 'Delete Work', exact: true }).click();
    await expect(popup(page)).toContainText('Delete this installed Work');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Delete Work', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Delete Work', exact: true }).click();
    await popup(page).locator('.popup-button-ok').click();
    await expect(page.locator('.atri-library-feedback[role="alert"]')).toContainText('still referenced');
    const references = page.locator('[data-atria-reference-remediation]');
    await expect(references.getByRole('heading', { name: 'Dependent Session', exact: true })).toBeVisible();
    await references.getByText('Reference details', { exact: true }).click();
    await expect(references.locator('pre').last()).toContainText('sessionId');
    await shot(page, info, 'work-delete-reference-details');
    await expect(page.locator('[data-atria-work-detail]')).toBeVisible();
    await page.locator('[data-atria-work-detail]').getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.locator('#atria-play-product')).toBeVisible();
});

test('World and Knowledge authoring keeps names, revision history and exact bindings', async ({ page }, info) => {
    await boot(page); await open(page, 'worlds');
    await page.getByLabel('New World name').fill('   ');
    await page.getByRole('button', { name: 'Create World', exact: true }).click();
    await expect(page.getByLabel('New World name')).toBeFocused();
    await page.getByLabel('New World name').fill('The distant shore');
    await page.getByRole('button', { name: 'Create World', exact: true }).click();
    await expect(page.locator('[data-atria-world-detail] h2')).toHaveText('The distant shore');
    await page.getByText('Manage resource', { exact: true }).click();
    await page.getByLabel('World name', { exact: true }).fill('The returning tide');
    await page.getByRole('button', { name: 'Rename World', exact: true }).click();
    await expect(page.locator('[data-atria-world-detail] h2')).toHaveText('The returning tide');
    await page.getByRole('button', { name: 'Delete World', exact: true }).click();
    await popup(page).locator('.popup-button-ok').click();
    await expect(page.locator('[data-atria-world-library]')).toBeVisible();
    await open(page, 'knowledge');
    await page.locator('[data-atria-knowledge-library] button').first().click();
    await expect(page.locator('[data-atria-knowledge-entry-id]').first()).toBeVisible();
    await expect(page.locator('[data-atria-revision-id]').first()).toBeVisible();
    await shot(page, info, 'knowledge-desktop');
    await page.setViewportSize({ width: 320, height: 740 });
    await shot(page, info, 'knowledge-compact');
});

test('Preset module Source retains advanced data, conflicts keep drafts and saved receipts survive remount', async ({ page }, info) => {
    await boot(page, 900); await open(page, 'prompt-presets');
    await page.getByRole('button', { name: 'New preset', exact: true }).click();
    const presetId = await page.locator('[data-atri-prompt-preset]').getAttribute('data-atri-prompt-preset');
    await page.getByRole('button', { name: 'Prompt Modules', exact: true }).click();
    await page.getByRole('button', { name: 'Module list actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'New module', exact: true }).click();
    await openPromptSections(page, 'identity');
    await page.getByLabel('Display name', { exact: true }).fill('Harbour voice');
    await openPromptSections(page, 'module');
    await page.getByLabel('Prompt body', { exact: true }).fill('Write with precise, quiet detail.');
    await page.getByRole('button', { name: 'Advanced editor', exact: true }).click();
    const json = page.getByLabel('Resource JSON — conditions, parameters, provenance');
    const resource = JSON.parse(await json.inputValue()); resource.priority = 7;
    await json.fill(JSON.stringify(resource, null, 2));
    await page.getByRole('button', { name: 'Simple editor', exact: true }).click();
    await openPromptSections(page, 'identity', 'module');
    const endpoint = '**/api/native/generation/presets/' + presetId;
    await page.route(endpoint, route => route.request().method() === 'PUT' ? route.fulfill({ status: 409, json: { error: 'revision_conflict' } }) : route.continue());
    await page.getByRole('button', { name: 'Save revision', exact: true }).click();
    await expect(page.locator('[data-atri-prompt-editor] [role="alert"]')).toBeVisible();
    await expect(page.getByLabel('Prompt body', { exact: true })).toHaveValue('Write with precise, quiet detail.');
    await shot(page, info, 'prompt-editor-medium');
    await page.unroute(endpoint);
    await page.getByRole('button', { name: 'Save revision', exact: true }).click();
    await expect(page.locator('[data-atri-prompt-preset] [role="status"]')).toContainText('Saved. Preset version');
    const row = page.locator('[data-module-id]').filter({ hasText: 'Harbour voice' });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Module actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'View / edit parameters', exact: true }).click();
    await page.getByRole('button', { name: 'Advanced editor', exact: true }).click();
    expect(JSON.parse(await json.inputValue()).priority).toBe(7);
    await page.setViewportSize({ width: 320, height: 740 }); await shot(page, info, 'prompt-exact-compact');
});

test('Preset Program and Generation save exact versions while pinned history remains available', async ({ page }, info) => {
    await boot(page); await open(page, 'prompt-presets');
    const row = page.locator('[data-atri-preset-id]').first(); await row.getByRole('button', { name: 'Open preset', exact: true }).click();
    const id = await page.locator('[data-atri-prompt-preset]').getAttribute('data-atri-prompt-preset');
    const before = await page.evaluate(async id => {
        const { runtimeRequest } = await import('/scripts/native/runtime-client.js'); return runtimeRequest('/presets/' + id);
    }, id);
    await page.getByRole('button', { name: 'Prompt Programs', exact: true }).click();
    await openPromptSections(page, 'identity', 'stages', 'stage:stage.main');
    await page.getByLabel('Display name', { exact: true }).fill('Harbour narrator');
    await page.getByLabel('Module for stage 1', { exact: true }).selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Add module', exact: true }).click();
    await shot(page, info, 'program-editor-desktop');
    await page.getByRole('button', { name: 'Save revision', exact: true }).click();
    await expect(page.locator('[data-atri-prompt-preset] [role="status"]')).toContainText('Saved. Preset version');
    await page.getByRole('button', { name: 'Back to preset', exact: true }).click();
    await page.getByRole('button', { name: 'Generation Profiles', exact: true }).click();
    await openPromptSections(page, 'identity', 'generation');
    await page.getByLabel('Display name', { exact: true }).fill('Quiet replies');
    await page.getByLabel('Maximum output tokens', { exact: true }).fill('1024');
    await page.getByLabel('Temperature', { exact: true }).fill('0.6');
    await page.setViewportSize({ width: 320, height: 740 }); await shot(page, info, 'generation-editor-compact');
    await page.getByRole('button', { name: 'Save revision', exact: true }).click();
    await expect(page.locator('[data-atri-prompt-preset] [role="status"]')).toContainText('Saved. Preset version');
    const after = await page.evaluate(async ({ id, before }) => {
        const { runtimeRequest } = await import('/scripts/native/runtime-client.js');
        const current = await runtimeRequest('/presets/' + id);
        const old = await Promise.all(before.entries.map(e => runtimeRequest('/resources/exact', { method: 'POST', body: { scope: 'library', resourceType: e.resourceType, resourceId: e.resource[e.resourceType === 'core.prompt-program' ? 'promptProgramId' : e.resourceType === 'core.prompt-module' ? 'promptModuleId' : 'generationProfileId'], revision: e.resource.revision } })));
        return { current, old };
    }, { id, before });
    expect(after.current.revision).not.toBe(before.revision);
    expect(after.old.map(e => e.snapshot)).toEqual(before.entries.map(e => e.resource));
});

test('Skills keyboard tabs, real creation, editor hash conflict and dialog focus', async ({ page }, info) => {
    await boot(page, 320); await open(page, 'skills');
    const manager = page.locator('.atria_skill_manager');
    const installed = manager.getByRole('tab', { name: 'Installed', exact: true });
    await installed.focus(); await installed.press('ArrowRight');
    await expect(manager.getByRole('tab', { name: 'Browse bundled', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(manager.getByRole('button', { name: 'Install all bundled', exact: true })).toBeVisible();
    await expect(manager.getByText('Install this', { exact: true })).toHaveCount(0);
    await shot(page, info, 'skills-bundled-compact');
    await manager.getByRole('tab', { name: 'Browse bundled', exact: true }).press('ArrowLeft');
    await manager.getByRole('button', { name: 'Create new', exact: true }).click();
    await popup(page).locator('.popup-input').fill('phase4-harbour');
    await popup(page).locator('.popup-button-ok').click();
    await expect(popup(page)).toContainText('One-line description');
    await popup(page).locator('.popup-input').fill('Describe harbour stories.');
    await popup(page).locator('.popup-button-ok').click();
    await expect(popup(page)).toContainText('Install new skill into scope');
    await popup(page).locator('.popup-button-ok').click();
    const textarea = page.locator('[data-editor-textarea]');
    await expect(textarea).toBeVisible();
    await textarea.fill((await textarea.inputValue()) + '\nKeep the tide in view.');
    await page.locator('[data-editor-save]').click();
    await expect(page.locator('#toast-container')).toContainText('Saved SKILL.md');
    await page.evaluate(async () => {
        const api = window.Atria.getContext().skills;
        const target = { scope: { kind: 'global' }, name: 'phase4-harbour', path: 'SKILL.md' };
        const current = await api.readFile(target);
        await api.writeFile({ ...target, content: current.content + '\nConcurrent edit.', expectedSha256: current.sha256 });
    });
    await textarea.fill((await textarea.inputValue()) + '\nMy unsaved draft.');
    await page.locator('[data-editor-save]').click();
    await expect(page.locator('#toast-container')).toContainText('changed on disk');
    await expect(textarea).toHaveValue(/My unsaved draft/);
    await shot(page, info, 'skill-editor-conflict-compact');
    await page.keyboard.press('Escape');
    await popup(page).getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(textarea).toHaveValue(/My unsaved draft/);
    await page.keyboard.press('Escape');
    await popup(page).getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(page.locator('[data-editor-textarea]')).toHaveCount(0);
    await expect(manager).toBeVisible();
});

test('Library compact category navigation, light theme, safe area and medium layout', async ({ page }, info) => {
    await boot(page, 320); await open(page, 'works');
    await page.evaluate(() => { document.documentElement.style.setProperty('--SmartThemeBlurTintColor', '#ffffff'); document.documentElement.style.setProperty('--atri-safe-area-bottom', '24px'); });
    await expect(page.locator('html')).toHaveAttribute('data-atria-appearance', 'light');
    await expect(page.getByRole('navigation', { name: 'Library sections', exact: true })).toBeVisible();
    await shot(page, info, 'works-light-320');
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openUtility('plugins'));
    await expect(page.locator('.atria_skill_manager')).toBeVisible();
    await shot(page, info, 'skills-light-320');
    await page.setViewportSize({ width: 900, height: 900 });
    await shot(page, info, 'skills-medium');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await shot(page, info, 'skills-desktop');
});

test('Bundled load failure offers retry and Chinese Library stays usable at 320px', async ({ page }, info) => {
    await boot(page, 320, 'zh-cn'); await open(page, 'skills');
    await page.route('**/api/skills/bundled-manifest', route => route.fulfill({ status: 503, json: { error: 'temporarily unavailable' } }));
    await page.locator('[data-skill-tab="bundled"]').click();
    const browser = page.locator('.atria_skill_manager_bundled_mount');
    await expect(browser.getByRole('alert')).toBeVisible();
    await shot(page, info, 'skills-retry-zh-320');
    await page.unroute('**/api/skills/bundled-manifest');
    await browser.locator('[data-bundled-toolbar="refresh"]').click();
    await expect(browser.locator('[data-bundled-row]').first()).toBeVisible();
    await open(page, 'works');
    await expect(page.locator('[data-atria-native-works]')).toBeVisible();
    await page.evaluate(() => { document.documentElement.style.fontSize = '20px'; });
    await shot(page, info, 'works-zh-large-text-320');
});
