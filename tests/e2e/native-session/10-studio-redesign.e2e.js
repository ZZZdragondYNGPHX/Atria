import { test, expect } from '@playwright/test';
/* eslint-disable playwright/no-conditional-in-test -- Responsive actions follow the actual compact navigation. */
import { createNativeId } from '../../../src/native/identity.js';
import { startServer, tearDownServer } from '../_lib/server.js';
import { awaitMainUI } from '../_lib/page.js';
import { seedNativeSessionDataRoot } from './_helpers.js';

let server;
test.describe.configure({ mode: 'serial' });
test.use({ actionTimeout: 12000 });
if (process.env.PW_NATIVE_CHANNEL) test.use({ channel: process.env.PW_NATIVE_CHANNEL });

test.beforeAll(async () => {
    const seeded = await seedNativeSessionDataRoot({ suffix: 'redesign-studio' });
    server = await startServer({ batchKey: 'generation', scenarioId: 'redesign-studio', useExistingDataRoot: seeded.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server, { removeData: false }); });

async function boot(page, width, locale = 'en') {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    await page.addInitScript(locale => localStorage.setItem('language', locale), locale);
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/text-workers', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await awaitMainUI(page, server.baseURL);
}
async function request(page, path, body, method = 'POST') {
    return page.evaluate(async ({ path, body, method }) => {
        const response = await fetch('/api/native/studio/' + path, { headers: window.Atria.getContext().getRequestHeaders(), ...(body ? { method, body: JSON.stringify(body) } : {}) });
        if (!response.ok) throw new Error(await response.text());
        return response.json();
    }, { path, body, method });
}
async function seedProject(page, width) {
    const projectId = createNativeId('project');
    const source = {
        format: 'atria-project-source', schemaVersion: 1,
        project: { projectId, packageId: createNativeId('package'), displayName: 'The Observatory ' + width, createdAt: 10, updatedAt: 10 },
        package: { name: 'The Observatory', version: '1.0.0', actors: [], capabilities: ['narrative', 'game-runtime'], permissions: [], entryPoints: [{ entryPointId: createNativeId('entryPoint'), displayName: 'Arrival at the observatory', actorIds: [], worldIds: [], knowledgeBindingIds: [], runtime: { experience: { mode: 'component', componentModelVersion: 1, component: 'ui/main.json', selectors: 'ui/selectors.json', surface: 'app.root' } } }] },
        resources: [], worlds: [], knowledge: [], knowledgeBindings: [], assetFiles: [], dependencies: { worlds: [], knowledge: [], knowledgeBindings: [], assets: [], resources: [] },
    };
    const model = { id: 'observatory', type: 'container', children: [{ id: 'welcome', type: 'text', props: { text: 'The stars are waiting.' } }] };
    await request(page, 'projects', { source, files: [{ path: 'ui/main.json', content: JSON.stringify(model) }, { path: 'ui/selectors.json', content: '[]' }] });
    await page.evaluate(projectId => window.Atria.shell.getWorkspaceHost().openBuild(projectId), projectId);
    await expect(page.locator('[data-atria-studio-view="overview"]')).toBeVisible();
    return projectId;
}

for (const width of [1440, 900, 320]) test(`Studio review, source, UI, conflict and Agent at ${width}px`, async ({ page }, info) => {
    test.setTimeout(150000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await boot(page, width);
    const projectId = await seedProject(page, width);
    const studio = page.locator('[data-atria-studio-workspace]');
    const center = studio.locator('.atria-studio-center');
    const activity = studio.locator('.atria-studio-activity');
    const toolbar = studio.locator('.atria-studio-topbar');
    const nav = studio.locator('.atria-studio-mobile-nav');
    const compact = width < 600;
    const shot = async name => {
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(await studio.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
        await page.screenshot({ path: info.outputPath(`${name}-${width}.png`), fullPage: true });
    };
    const navigate = async name => {
        if (compact) await nav.getByRole('button', { name: 'Project', exact: true }).click();
        await studio.locator('.atria-studio-resource-tree').getByRole('button', { name, exact: true }).click();
    };
    const apply = async () => {
        await expect(activity.getByRole('button', { name: 'Apply ChangeSet', exact: true })).toBeVisible();
        await activity.getByRole('button', { name: 'Apply ChangeSet', exact: true }).click();
        await expect(activity.getByRole('button', { name: 'Apply ChangeSet', exact: true })).toHaveCount(0);
        if (compact) await nav.getByRole('button', { name: 'Editor', exact: true }).click();
    };
    await shot('overview-dark');
    if (compact) await nav.getByRole('button', { name: 'Project', exact: true }).click();
    await studio.getByLabel('Filter project resources').fill('observatory');
    await expect(studio.locator('.atria-studio-resource-tree').getByRole('button', { name: 'Arrival at the observatory' })).toBeVisible();
    await studio.getByLabel('Filter project resources').fill('no-matching-resource');
    await expect(studio.locator('.atria-studio-resource-tree')).toContainText('No matching resources');
    await studio.getByLabel('Filter project resources').fill('');
    await navigate('EntryPoints');
    await center.getByLabel('displayName', { exact: true }).fill('A new arrival');
    const before = await request(page, `projects/${projectId}`);
    await center.getByRole('button', { name: 'Review Changes', exact: true }).click();
    await expect(activity).toContainText('Review the proposed operations');
    expect((await request(page, `projects/${projectId}`)).revision).toEqual(before.revision);
    await activity.getByText('ChangeSet details', { exact: true }).click();
    await shot('review'); await apply();
    expect((await request(page, `projects/${projectId}`)).source.package.entryPoints[0].displayName).toBe('A new arrival');
    await toolbar.getByRole('button', { name: 'Inspector', exact: true }).click();
    await expect(studio.getByRole('button', { name: 'Close Inspector' })).toBeFocused();
    await shot('inspector');
    await page.keyboard.press('Escape');
    await expect(toolbar.getByRole('button', { name: 'Inspector', exact: true })).toBeFocused();
    await navigate('UI');
    const ui = center.locator('[data-atria-studio-ui-editor]');
    await expect(ui).toContainText('The stars are waiting.');
    await shot('ui-design');
    await ui.locator('[data-atria-component-id="welcome"]').click();
    await ui.getByLabel('Component text', { exact: true }).fill('The sky is clear.');
    await ui.getByRole('button', { name: 'Structure', exact: true }).click();
    await ui.getByRole('button', { name: 'Design', exact: true }).click();
    await expect(ui.getByLabel('Component text', { exact: true })).toHaveValue('The sky is clear.');
    await expect(ui.getByRole('button', { name: 'Stage UI Change' })).toBeDisabled();
    await ui.getByRole('button', { name: 'Apply Properties' }).click();
    await ui.getByRole('button', { name: 'Source', exact: true }).click();
    const source = ui.getByLabel('Structured UI source JSON');
    const original = await source.inputValue();
    await source.fill('{ broken source');
    await ui.getByRole('button', { name: 'Apply Source', exact: true }).click();
    await expect(source).toHaveValue('{ broken source');
    await expect(ui.getByRole('alert')).toBeFocused();
    await expect(ui.getByRole('button', { name: 'Stage UI Change' })).toBeDisabled();
    await shot('ui-source-error');
    await source.fill(original.replace('The stars are waiting.', 'The sky is clear.'));
    await ui.getByRole('button', { name: 'Apply Source', exact: true }).click();
    await ui.getByRole('button', { name: 'Stage UI Change' }).click(); await apply();
    await toolbar.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(center.locator('.atria-studio-preview-canvas')).toContainText('The sky is clear.'); await shot('preview');
    await navigate('Source');
    await expect(center.getByLabel('Source editor', { exact: true })).toBeEnabled();
    expect((await center.getByLabel('Source editor', { exact: true }).boundingBox()).height).toBeGreaterThanOrEqual(compact ? 240 : 300);
    await page.route('**/api/native/studio/projects/*/source?*', route => route.fulfill({ status: 503, json: { message: 'Source is temporarily unavailable' } }));
    await center.getByRole('button', { name: 'Reload file' }).click();
    await expect(center.getByRole('alert')).toContainText('temporarily unavailable');
    await expect(center.getByRole('button', { name: 'Review Source Change' })).toBeDisabled(); await shot('source-error');
    await page.unroute('**/api/native/studio/projects/*/source?*');
    await center.getByRole('button', { name: 'Reload file' }).click();
    await expect(center.getByRole('button', { name: 'Review Source Change' })).toBeEnabled();
    await navigate('Overview');
    await center.getByLabel('Project display name').fill('Reviewed draft');
    await center.getByRole('button', { name: 'Review Changes', exact: true }).click();
    // A real concurrent authoring write advances the exact revision after inspection.
    const current = await request(page, `projects/${projectId}`);
    await request(page, `projects/${projectId}/source`, { path: 'notes.txt', content: 'Concurrent edit', baseRevision: current.revision.revision, origin: { kind: 'human', id: 'browser-other-editor' } }, 'PUT');
    await activity.getByRole('button', { name: 'Apply ChangeSet' }).click();
    await expect(activity).toContainText('Revision conflict'); await shot('conflict');
    await activity.getByRole('button', { name: 'Reload Latest' }).click();
    if (compact) await nav.getByRole('button', { name: 'Editor', exact: true }).click();
    await expect(center.getByLabel('Project display name')).toHaveValue('The Observatory ' + width);
    await toolbar.getByRole('button', { name: 'AI', exact: true }).click();
    const agent = studio.locator('[data-atria-studio-ai="agent"]');
    await agent.getByLabel('Project Agent intent').fill('Improve the welcome text');
    await page.route('**/api/native/studio/projects/*/agent/tasks', route => route.request().method() === 'POST' ? route.fulfill({ status: 503, json: { message: 'Agent is temporarily unavailable' } }) : route.continue());
    await agent.getByRole('button', { name: 'Create Task' }).click();
    // Failure may surface in Output, but the Agent draft must survive switching back.
    if (compact) await nav.getByRole('button', { name: 'AI', exact: true }).click();
    await expect(agent.getByLabel('Project Agent intent')).toHaveValue('Improve the welcome text');
    await expect(agent.getByRole('alert')).toContainText('temporarily unavailable'); await shot('agent-error');
    await page.unroute('**/api/native/studio/projects/*/agent/tasks');
    await page.keyboard.press('Escape');
    await navigate('Build'); await center.getByRole('button', { name: 'Run Preflight' }).click();
    await expect(center.locator('details')).toBeVisible(); await shot('build');
    await page.evaluate(() => { document.documentElement.style.setProperty('--SmartThemeBlurTintColor', '#ffffff'); document.documentElement.style.setProperty('--atri-safe-area-bottom', '24px'); });
    await expect(page.locator('html')).toHaveAttribute('data-atria-appearance', 'light');
    await navigate('Overview'); await shot('overview-light');
    expect(errors).toEqual([]);
});

test('Studio Chinese, large text, safe area, reduced motion and virtual keyboard', async ({ page }, info) => {
    await boot(page, 320, 'zh-cn');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedProject(page, '中文项目');
    const studio = page.locator('[data-atria-studio-workspace]');
    await expect(studio.getByRole('heading', { name: '项目概览' })).toBeVisible();
    await page.evaluate(() => {
        document.documentElement.style.fontSize = '20px';
        document.documentElement.style.setProperty('--SmartThemeBlurTintColor', '#ffffff');
        document.documentElement.style.setProperty('--atri-safe-area-bottom', '24px');
    });
    await studio.getByLabel('项目显示名称', { exact: true }).fill('长标题：来自遥远群星的观测记录');
    await page.screenshot({ path: info.outputPath('studio-zh-large-light-320.png'), fullPage: true });
    await page.evaluate(() => {
        Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => 420 });
        window.visualViewport.dispatchEvent(new Event('resize'));
    });
    await expect(studio).toHaveAttribute('data-atria-keyboard', 'open');
    await expect(studio.locator('.atria-studio-topbar .atria-studio-actions')).toBeHidden();
    await expect(studio.getByLabel('项目显示名称', { exact: true })).toHaveValue('长标题：来自遥远群星的观测记录');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('studio-zh-keyboard-320.png'), fullPage: true });
    await page.evaluate(() => { delete window.visualViewport.height; window.visualViewport.dispatchEvent(new Event('resize')); });
    await page.setViewportSize({ width: 719, height: 844 });
    await expect(studio).toHaveAttribute('data-atria-viewport', 'compact');
    await page.setViewportSize({ width: 720, height: 844 });
    await expect(studio).toHaveAttribute('data-atria-viewport', 'medium');
    await expect(studio.getByLabel('项目显示名称', { exact: true })).toHaveValue('长标题：来自遥远群星的观测记录');
    await page.screenshot({ path: info.outputPath('studio-zh-medium-720.png'), fullPage: true });
});

test('Build project list, loading failure, retry and native creation', async ({ page }, info) => {
    await boot(page, 320);
    await seedProject(page, 'List fixture');
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/api/native/studio/projects', async route => { await gate; await route.fulfill({ status: 503, json: { message: 'Projects unavailable' } }); });
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openBuild());
    await expect(page.getByText('Loading Atria Studio…', { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('project-loading-320.png'), fullPage: true }); release();
    await expect(page.getByRole('alert')).toContainText('Projects unavailable');
    await page.screenshot({ path: info.outputPath('project-retry-320.png'), fullPage: true });
    await page.unroute('**/api/native/studio/projects');
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.getByLabel('Search projects', { exact: true })).toBeVisible();
    await page.getByLabel('Search projects', { exact: true }).fill('unknown project');
    await expect(page.locator('.atria-native-studio')).toContainText('No matching projects');
    await page.getByLabel('Search projects', { exact: true }).fill('');
    await page.locator('.atria-native-studio').getByText('New Project', { exact: true }).click();
    await page.getByLabel('Project name', { exact: true }).fill('A first story');
    await page.screenshot({ path: info.outputPath('project-list-320.png'), fullPage: true });
    await page.getByRole('button', { name: 'Create Project', exact: true }).click();
    await expect(page.locator('[data-atria-studio-view="overview"]')).toBeVisible();
    await expect(page.getByLabel('Project display name')).toHaveValue('A first story');
});
