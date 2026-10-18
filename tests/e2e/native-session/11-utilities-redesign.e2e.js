import { test, expect } from '@playwright/test';
import express from 'express';
import { projectCommitFixture } from '../../native-orchestration/helpers/project-commit-fixture.js';
import { makeTempFsEngineHarness } from '../../storage/harness/contract-harness.js';
import { NativeGenerationHost } from '../../../src/native/adapters/generation-host.js';
import { createNativeStudioRouter } from '../../../src/endpoints/native-studio.js';
import { createNativeOrchestrationRouter } from '../../../src/endpoints/native-orchestration.js';
import { createOrchestrationAuthoringService } from '../../../src/native/orchestration/authoring-service.js';
import { RunObservationService } from '../../../src/native/orchestration/run-observation-service.js';
import { createNativeId } from '../../../src/native/identity.js';
import { startServer, tearDownServer } from '../_lib/server.js';
import { awaitMainUI } from '../_lib/page.js';
/* eslint-disable playwright/no-conditional-in-test, playwright/no-conditional-expect -- Each named viewport case exercises its own responsive composition and existing controller states. */

import { seedNativeSessionDataRoot } from './_helpers.js';

let server;
test.describe.configure({ mode: 'default' });
test.use({ actionTimeout: 12000 });

test.beforeAll(async () => {
    const seeded = await seedNativeSessionDataRoot({ suffix: 'redesign-utilities' });

    server = await startServer({ batchKey: 'generation', scenarioId: 'redesign-utilities', useExistingDataRoot: seeded.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server, { removeData: false }); });

for (const width of [1440, 900, 320]) test(`Utilities and Agents at ${width}px`, async ({ page }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/text-workers', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await awaitMainUI(page, server.baseURL);
    const shot = async name => {
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const surface = page.locator('[data-atria-utility-workspace], .atria-memory-workspace, .atria-orch, .atriaLogsWorkspace');
        expect(await surface.evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth + 1))).toBe(true);
        await page.screenshot({ path: info.outputPath(`${name}-${width}.png`), fullPage: true, animations: 'disabled' });
    };
    for (const utility of ['settings', 'plugins', 'account', 'diagnostics']) {
        await page.evaluate(id => window.Atria.shell.getWorkspaceHost().openUtility(id), utility);
        await expect(page.locator(utility === 'diagnostics' ? '.atriaLogsWorkspace' : `[data-atria-utility-workspace="${utility === 'plugins' ? 'extensions' : utility}"]`)).toBeVisible();
        if (utility === 'settings') {
            const settings = page.locator('[data-atria-utility-workspace=settings]');
            const reduced = settings.getByRole('switch', { name: 'Reduce motion', exact: true });
            const original = await reduced.isChecked();
            await reduced.setChecked(!original);
            await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openUtility('plugins'));
            await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openUtility('settings'));
            await expect(reduced).toBeChecked({ checked: !original });
            await reduced.setChecked(original);
            await settings.evaluate(node => { node.scrollTop = 0; });
            await expect(settings.getByRole('slider', { name: 'Reading size', exact: true })).toBeVisible();
            await settings.getByText('Theme compatibility', { exact: true }).click();
            await expect(settings.locator('#themes')).toBeVisible();
        }
        if (utility === 'plugins') {
            const plugins = page.locator('[data-atria-utility-workspace=extensions]');
            await plugins.locator('[data-extension-tab=plugins]').click();
            await expect(plugins.getByLabel('HTTPS repository URL')).toBeVisible();
            await shot('plugins-external');
            await plugins.getByRole('button', { name: 'Built-in tools', exact: true }).click();
            await shot('plugins-builtins');
            await plugins.locator('[data-atria-global-plugin-settings=regex] > summary').click();
            const drawer = plugins.locator('.inline-drawer-header[role=button]').first();
            await drawer.focus();
            await page.keyboard.press('Enter');
            await expect(drawer).toHaveAttribute('aria-expanded', 'true');
            await page.keyboard.press('Enter');
            await expect(drawer).toHaveAttribute('aria-expanded', 'false');
            await plugins.evaluate(node => { node.scrollTop = 0; });
        }
        if (utility === 'account') {
            const account = page.locator('[data-atria-utility-workspace=account]');
            await expect(account.locator('.userName')).not.toBeEmpty();
            await account.getByRole('button', { name: 'Settings Snapshots', exact: true }).click();
            await expect(page.locator('dialog[open]')).toBeVisible();
            await shot('snapshots-dialog');
            await page.keyboard.press('Escape');
            await expect(page.locator('dialog[open]')).toHaveCount(0);
            await account.locator('.atria-account-advanced > summary').click();
            await account.getByRole('button', { name: 'Reset Settings', exact: true }).click();
            await expect(page.locator('dialog[open]')).toBeVisible();
            await shot('reset-confirmation');
            await page.keyboard.press('Escape');
            await expect(page.locator('dialog[open]')).toHaveCount(0);
            await expect(account).toBeVisible();
            await account.evaluate(node => { node.scrollTop = 0; });
        }
        if (utility === 'diagnostics') {
            const diagnostics = page.locator('.atriaLogsWorkspace');
            await expect(diagnostics).toHaveAttribute('aria-busy', 'false');
            await shot('diagnostics-guided');
            await diagnostics.getByRole('button', { name: 'My problem just happened' }).click();
            await expect(diagnostics).toHaveClass(/is-detailing/);
            await shot('diagnostics-incident');
            await page.keyboard.press('Escape');
            await expect(diagnostics).not.toHaveClass(/is-detailing/);
            await diagnostics.getByRole('button', { name: 'Startup', exact: true }).click();
            await expect(diagnostics.locator('.atriaStartupAnalysis')).toBeVisible();
            await expect(diagnostics).toHaveAttribute('aria-busy', 'false');
            await shot('diagnostics-startup');
            await diagnostics.getByRole('button', { name: 'Expert', exact: true }).click();
            await expect(diagnostics.getByRole('button', { name: 'Expert', exact: true })).toHaveAttribute('aria-pressed', 'true');
            await diagnostics.locator('.atriaLogsSource').selectOption('frontend');
            await expect(diagnostics).toHaveAttribute('aria-busy', 'false');
            await shot('diagnostics-expert');
            await diagnostics.locator('.atriaLogsSearch').fill('not-present-utilities-fixture');
            await expect(diagnostics.locator('.atriaLogsVirtualRows')).toContainText('No log entries match');
            await diagnostics.locator('.atriaLogsSearch').fill('');
            await page.locator('.toast-close-button').evaluateAll(nodes => nodes.forEach(node => node.click()));
        }
        await shot(utility);
    }
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openAgents('home'));
    await expect(page.locator('[data-atria-agents-hub]')).toBeVisible();
    await expect(page.locator('[data-atria-agents-hub] [data-atria-agent-section]')).toHaveCount(4);
    await page.screenshot({ path: info.outputPath(`agents-${width}.png`), fullPage: true, animations: 'disabled' });
    for (const section of ['plans', 'runs', 'memory', 'diagnostics']) {
        await page.evaluate(section => window.Atria.shell.getWorkspaceHost().openAgentSection(section), section);
        if (section === 'plans' || section === 'runs') {
            const agents = page.locator('[data-atria-domain-workspace=agents]');
            await expect(agents).toBeVisible();
            await expect(agents.locator(`[data-atria-domain-section="${section}"]`)).toHaveAttribute('aria-current', 'page');
            if (section === 'plans') {
                await agents.getByRole('textbox', { name: 'New Plan name', exact: true }).fill(`Native workflow ${width}`);
                await agents.getByRole('button', { name: 'Create draft', exact: true }).click();
                await expect(agents.getByRole('button', { name: 'Validate on Host', exact: true })).toBeVisible();
                // Duplicate through the same Native draft authority; published revisions are independent.
                await page.evaluate(async () => {
                    const { createOrchestrationClient } = await import('/scripts/native/orchestration/client.js');
                    const client = createOrchestrationClient();
                    const planId = new URL(location.href).searchParams.get('atriaChild').slice('plans:'.length);
                    const source = await client.getPlan(planId);
                    const { outcome } = await client.createPlan({ definition: source.definition, dependencyPins: source.dependencyPins,
                        viewState: { ...source.viewState, title: source.viewState.title + ' copy' } });
                    Atria.shell.getNavigation().navigate('agents', { child: { id: 'plans:' + outcome.planId, label: outcome.viewState.title, kind: 'detail' } });
                });
                await expect(agents).toContainText(`Native workflow ${width} copy`);
                await agents.getByRole('button', { name: 'List', exact: true }).click();
                await agents.getByRole('list', { name: 'Nodes', exact: true }).locator('.atria-orch-row__main').first().click();
                const inspector = page.locator('.atria-orch-inspector');
                await expect(inspector).toBeVisible();
                const label = inspector.getByRole('textbox', { name: 'Label', exact: true });
                await label.focus(); await expect(label).toBeFocused();
                await shot('agent-inspector');
                await page.keyboard.press('Escape');
                await expect(inspector).toBeHidden();
                await expect(agents).toBeVisible();
                await agents.locator('[data-atria-domain-section=runs]').focus();
                await page.keyboard.press('Enter');
                await expect(page).toHaveURL(/atriaChild=runs/);
            }
        }
        if (section === 'memory') {
            const memory = page.locator('.atria-memory-workspace');
            await expect(memory.locator('.workspace-memory-page')).toBeVisible();
            await shot('memory');
            for (const name of ['Knowledge', 'Sources', 'Maintenance']) {
                await memory.locator('.workspace-subnav').getByRole('button', { name, exact: true }).click();
                await shot(`memory-${name.toLowerCase()}`);
            }
        }
        if (section === 'diagnostics') await expect(page.locator('.atriaLogsWorkspace')).toBeVisible();
        await shot(`agent-${section}`);
    }
});


test('Utilities loading, service failures and recovery on a narrow screen', async ({ page }, info) => {
    test.setTimeout(150000);
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/**', route => route.fulfill({ json: [] }));
    await awaitMainUI(page, server.baseURL);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/api/users/me', async route => { await gate; await route.fulfill({ status: 503, json: { error: 'Profile unavailable' } }); });
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openUtility('account'));
    await expect(page.locator('[data-atria-utility-workspace=account]')).toContainText('Loading your profile');
    await page.screenshot({ path: info.outputPath('account-loading-320.png') });
    release();
    await page.getByRole('button', { name: 'Try again', exact: true }).waitFor();
    await page.screenshot({ path: info.outputPath('account-error-320.png') });
    await page.unroute('**/api/users/me');
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.locator('.userName')).not.toBeEmpty();
    await page.locator('.userBackupSyncButton').click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await page.locator('.backupSyncTab[data-tab="archive"]').click();
    const nativeBackup = page.getByRole('checkbox', { name: 'Native data and projects' });
    await expect(nativeBackup).toBeChecked();
    await nativeBackup.focus();
    await page.keyboard.press('Space');
    await expect(nativeBackup).not.toBeChecked();
    await page.locator('.backupSelectRecommended').click();
    await expect(nativeBackup).toBeChecked();
    expect(await page.locator('.backupSyncCenter').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath('backup-320.png'), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await page.locator('.userStorageManagementButton').click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await page.screenshot({ path: info.outputPath('storage-320.png'), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await page.route('**/api/diagnostics/incidents/list', route => route.fulfill({ status: 503, json: { error: 'Diagnostics temporarily unavailable. Refresh to retry.' } }));
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openUtility('diagnostics'));
    await expect(page.locator('.atriaLogsFeedback')).toContainText('temporarily unavailable');
    await page.screenshot({ path: info.outputPath('diagnostics-error-320.png') });
    await page.unroute('**/api/diagnostics/incidents/list');
    await page.locator('.atriaLogsRefresh').click();
    await expect(page.locator('.atriaLogsFeedback')).toBeHidden();
    await page.route('**/api/native/extensions/plugins', route => route.fulfill({ status: 503, json: { error: 'Plugin list unavailable' } }));
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openUtility('plugins'));
    const extensions = page.locator('[data-atria-utility-workspace=extensions]');
    await extensions.locator('[data-extension-tab=plugins]').click();
    await extensions.getByRole('button', { name: 'Local scripts', exact: true }).click();
    await expect(extensions.getByRole('alert')).toContainText('Plugin list unavailable');
    await page.screenshot({ path: info.outputPath('plugins-error-320.png') });
    await page.unroute('**/api/native/extensions/plugins');
    await extensions.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(extensions.getByRole('alert')).toHaveCount(0);
});

test('Chinese utilities, light appearance, large text and keyboard', async ({ page }, info) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addInitScript(() => localStorage.setItem('language', 'zh-cn'));
    await page.route('**/api/horde/**', route => route.fulfill({ json: [] }));
    await awaitMainUI(page, server.baseURL);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => {
        document.documentElement.style.setProperty('--SmartThemeBlurTintColor', '#ffffff');
        document.documentElement.style.setProperty('--mainFontSize', '20px');
        document.documentElement.style.setProperty('--atri-safe-area-bottom', '24px');
    });
    await page.evaluate(() => document.getElementById('blur-tint-color-picker').setAttribute('color', '#ffffff'));
    await expect(page.locator('html')).toHaveAttribute('data-atria-appearance', 'light');
    for (const id of ['settings', 'account', 'plugins', 'diagnostics']) {
        await page.evaluate(id => window.Atria.shell.getWorkspaceHost().openUtility(id), id);
        await expect(page.locator(id === 'diagnostics' ? '.atriaLogsWorkspace' : `[data-atria-utility-workspace="${id === 'plugins' ? 'extensions' : id}"]`)).toBeVisible();
        if (id === 'account') await expect(page.locator('.userName')).not.toBeEmpty();
        if (id === 'diagnostics') await expect(page.locator('.atriaLogsWorkspace')).toHaveAttribute('aria-busy', 'false');
        if (id === 'plugins') await expect(page.locator('[data-atria-utility-workspace=extensions]')).toContainText('扩展');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await expect(page.locator('html')).toHaveAttribute('data-atria-appearance', 'light');
        await page.screenshot({ path: info.outputPath(`zh-light-${id}-320.png`), animations: 'disabled' });
    }
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openAgentSection('plans'));
    const agents = page.locator('[data-atria-domain-workspace=agents]');
    await expect(agents).toBeVisible();
    const name = agents.locator('.atria-orch-create input');
    await name.fill('窄屏原生草稿');
    await name.focus();
    await page.evaluate(() => {
        Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => 420 });
        window.visualViewport.dispatchEvent(new Event('resize'));
    });
    await expect(page.locator('#atria-app-shell')).toHaveAttribute('data-atria-keyboard', 'open');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('zh-agents-keyboard-320.png') });
    await page.evaluate(() => { delete window.visualViewport.height; window.visualViewport.dispatchEvent(new Event('resize')); });
    await page.setViewportSize({ width: 720, height: 844 });
    await expect(page.locator('#atria-app-shell')).toHaveAttribute('data-atria-viewport', 'medium');
    await page.screenshot({ path: info.outputPath('zh-agents-medium-720.png') });
});

test('a Host-prepared Run opens in Timeline and retains keyboard-accessible Graph at 390px', async ({ page }, info) => {
    test.setTimeout(120000);
    const f = await projectCommitFixture(makeTempFsEngineHarness);
    let listener;
    try {
        const originalSource = (await f.studio.getProject(f.h.handle, f.projectId)).source;
        const host = new NativeGenerationHost({ projectCommitAuthority: f.authority });
        const source = { domain: 'project', projectId: f.projectId, taskId: f.taskId };
        const authoring = createOrchestrationAuthoringService(f.h.engine, { projectAgent: f.agent, studio: f.studio });
        await authoring.plans.saveBinding(f.h.handle, createNativeId('orchestrationCommand'), { sourceSelector: source, planRef: f.planRef, expectedVersion: null });
        const observations = new RunObservationService({ engine: f.h.engine, projectAgent: f.agent, studio: f.studio });
        const app = express(); app.use(express.json({ limit: '8mb' }));
        app.use((req, _res, next) => { req.user = { profile: { handle: f.h.handle } }; next(); });
        app.use('/api/native/studio', createNativeStudioRouter(() => f, undefined, () => host));
        app.use('/api/native/orchestration', createNativeOrchestrationRouter(() => ({ ...authoring, observations })));
        listener = await new Promise(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
        const origin = `http://127.0.0.1:${listener.address().port}`;
        // Forward to real isolated Native routers, not a fabricated Run projection.
        const forward = async route => { const response = await route.fetch({ url: origin + new URL(route.request().url()).pathname }); await route.fulfill({ response }); };
        await page.route('**/api/native/orchestration/**', forward);
        await page.route('**/api/native/studio/**', forward);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.addInitScript(() => localStorage.setItem('language', 'en'));
        await page.route('**/api/horde/**', route => route.fulfill({ json: [] }));
        let modelRequests = 0; let dispatchRequests = 0;
        page.on('request', request => { if (/\/api\/native\/generation\/.*(?:start|execute)/.test(request.url())) modelRequests++; if (request.url().endsWith('/commit/dispatch')) dispatchRequests++; });
        await awaitMainUI(page, server.baseURL);
        await page.evaluate(() => Atria.shell.getWorkspaceHost().openAgentSection('runs'));
        const run = page.locator('[data-atria-domain-workspace=agents]');
        await run.getByLabel('Source type', { exact: true }).selectOption('project');
        await run.getByLabel('Project', { exact: true }).selectOption(f.projectId);
        await run.getByLabel('Task', { exact: true }).selectOption(f.taskId);
        await run.getByRole('button', { name: 'Prepare trusted commit', exact: true }).click();
        await expect(page).toHaveURL(/atriaChild=runs%3Aorun_|atriaChild=runs:orun_/);
        const runId = await page.evaluate(() => new URL(location.href).searchParams.get('atriaChild').slice('runs:'.length));
        const timeline = run.getByRole('button', { name: 'Timeline', exact: true });
        const graph = run.getByRole('button', { name: 'Graph', exact: true });
        await expect(timeline).toHaveAttribute('aria-pressed', 'true');
        await expect(run.getByRole('list', { name: 'Run timeline', exact: true })).toBeVisible();
        await graph.focus(); await page.keyboard.press('Enter');
        await expect(graph).toHaveAttribute('aria-pressed', 'true');
        await expect(run.locator('.atria-orch-graph')).toBeVisible();
        await timeline.click(); await expect(timeline).toHaveAttribute('aria-pressed', 'true');
        const immutable = await page.evaluate(async ({ runId, planId }) => {
            const { createOrchestrationClient } = await import('/scripts/native/orchestration/client.js');
            const client = createOrchestrationClient();
            const before = await client.observeRun(runId, null, 100);
            const draft = await client.getPlan(planId);
            await client.savePlan({ planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash,
                definition: draft.definition, dependencyPins: draft.dependencyPins, viewState: { ...draft.viewState, title: 'Independent draft edit during Run' } });
            const after = await client.observeRun(runId, null, 100);
            return { before: before.payload.planRef, after: after.payload.planRef };
        }, { runId, planId: f.planRef.planId });
        expect(immutable.before).toEqual(f.planRef); expect(immutable.after).toEqual(immutable.before);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: info.outputPath('active-run-timeline-390.png'), fullPage: true });
        await run.getByRole('button', { name: 'Request cancel…', exact: true }).click();
        await run.getByRole('button', { name: 'Request cancel', exact: true }).click();
        await expect(run.getByRole('button', { name: 'Request cancel…', exact: true })).toBeHidden();
        const final = await page.evaluate(async runId => {
            const { createOrchestrationClient } = await import('/scripts/native/orchestration/client.js');
            return (await createOrchestrationClient().observeRun(runId, null, 100)).payload;
        }, runId);
        // The original ready commit Effect remains pending: cancel fences new work,
        // and never pretends to undo or clear the durable Host record.
        expect(final.cancelRequested).toBe(true); expect(final.status).toBe('reconciling');
        expect(final.effects).toHaveLength(1); expect(final.effects[0].status).toBe('ready');
        expect(final.planRef).toEqual(f.planRef);
        expect(modelRequests).toBe(0); expect(dispatchRequests).toBe(0);
        expect((await f.agent.getTask(f.h.handle, f.projectId, f.taskId)).changeSets).toEqual([]);
        expect((await f.studio.getProject(f.h.handle, f.projectId)).source).toEqual(originalSource);
    } finally {
        await page.evaluate(() => Atria.shell.getWorkspaceHost().openAgents('home')).catch(() => {});
        await page.unroute('**/api/native/orchestration/**'); await page.unroute('**/api/native/studio/**');
        if (listener) await new Promise(resolve => listener.close(resolve));
        await f.cleanup();
    }
});
