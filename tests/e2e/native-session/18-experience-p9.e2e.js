import { test, expect } from '@playwright/test';
import { createNativeId } from '../../../src/native/identity.js';
import { startServer, tearDownServer } from '../_lib/server.js';
import { awaitMainUI } from '../_lib/page.js';
import { seedNativeSessionDataRoot } from './_helpers.js';
import { lifecycleFixture } from '../../native/helpers/lifecycle-fixture.js';
import { sessionFixture } from '../../native/helpers/session-fixture.js';
import { sharedFixture } from '../../native/helpers/shared-fixture.js';
import { buildAtriaPackageContainer } from '../../../src/native/package-container.js';

if (process.env.PW_NATIVE_CHANNEL) test.use({ channel: process.env.PW_NATIVE_CHANNEL });
let server;
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
    const seeded = await seedNativeSessionDataRoot({ suffix: 'experience-p9' });
    server = await startServer({ batchKey: 'generation', scenarioId: 'experience-p9', useExistingDataRoot: seeded.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server, { removeData: true }); });

test('P9 Play Health repair and authenticated fixed-seat Shared Host controls', async ({ page }, info) => {
    test.setTimeout(150000);
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/**', route => route.fulfill({ json: [] }));
    await awaitMainUI(page, server.baseURL);
    const f = sessionFixture(); sharedFixture(f); f.manifest.capabilities.push('game-runtime');
    const built = buildAtriaPackageContainer({ manifest: f.manifest, sourceFiles: new Map(), assetPayloads: new Map() });
    await page.evaluate(async ({ data, manifest }) => {
        const post = async (url, body) => {
            const result = await fetch('/api/native/' + url, { method: 'POST', headers: window.Atria.getContext().getRequestHeaders(), body: JSON.stringify(body) });
            if (!result.ok) throw new Error(await result.text()); return result.json();
        };
        await post('product/packages/install', { data, grantedPermissions: [] });
        const created = await post('session/create', { packageId: manifest.packageId, packageVersionId: manifest.packageVersionId, entryPointId: manifest.entryPoints[0].entryPointId });
        await window.Atria.openNativeSession(created.session.sessionId);
    }, { data: built.archive.toString('base64'), manifest: f.manifest });
    await page.locator('.atria-play-more summary').click();
    await page.getByRole('button', { name: 'Experience health', exact: true }).click();
    const drawer = page.locator('[data-atria-native-play-drawer]');
    await expect(drawer.getByRole('button', { name: 'Preview retention repair' })).toBeVisible();
    await drawer.getByRole('button', { name: 'Preview retention repair' }).click();
    await expect(drawer.getByText('Proposed changes', { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('health-repair-390.png'), fullPage: true });
    await drawer.getByRole('button', { name: 'Confirm repair', exact: true }).click();
    await expect(drawer.getByRole('button', { name: 'Confirm repair', exact: true })).toHaveCount(0);
    await page.evaluate(() => window.Atria.shell.getShell().setDockOpen(false));
    await page.locator('.atria-play-more summary').click();
    await page.getByRole('button', { name: 'Shared session', exact: true }).click();
    await drawer.getByRole('button', { name: 'Enable sharing', exact: true }).click();
    await expect(drawer.getByRole('status')).toContainText('Sharing enabled');
    await drawer.getByLabel('Host account').fill('default-user');
    await drawer.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(drawer.getByRole('button', { name: 'Open shared turn', exact: true })).toBeVisible();
    await expect(drawer.getByText('seat0 · host · Online', { exact: true })).toBeVisible();
    await drawer.getByRole('button', { name: 'Open shared turn', exact: true }).click();
    await expect(drawer.getByRole('status')).toContainText('collecting');
    await expect(drawer.getByRole('button', { name: 'Commit shared turn', exact: true })).toBeDisabled();
    await drawer.getByLabel('text', { exact: true }).fill('Host input');
    await drawer.getByRole('button', { name: 'Submit shared input', exact: true }).click();
    await drawer.getByRole('button', { name: 'Commit shared turn', exact: true }).click();
    await expect(drawer.getByRole('status')).toContainText('committed');
    await expect(drawer.getByRole('button', { name: 'Disconnect', exact: true })).toBeEnabled();
    await expect(drawer.getByRole('button', { name: 'Submit shared input', exact: true })).toBeDisabled();
    await page.screenshot({ path: info.outputPath('shared-host-390.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});


for (const width of [1440, 320]) test(`P9 Studio v3 exact preview and production Scenario at ${width}px`, async ({ page }, info) => {
    test.setTimeout(150000);
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/**', route => route.fulfill({ json: [] }));
    await awaitMainUI(page, server.baseURL);
    const projectId = createNativeId('project');
    const { lifecycleRuntime } = lifecycleFixture(); lifecycleRuntime.automations = []; lifecycleRuntime.workflows = [];
    const source = {
        format: 'atria-project-source', schemaVersion: 1,
        project: { projectId, packageId: createNativeId('package'), displayName: 'P9 Observatory', createdAt: 1, updatedAt: 1 },
        package: { name: 'P9 Observatory', version: '1.0.0', actors: [], capabilities: ['narrative', 'game-runtime'], permissions: [],
            runtime: { experience: { mode: 'component', frontend: { kind: 'native', version: 3, source: 'frontend.json' } },
                experienceContract: { schemaVersion: 1, capabilities: [{ id: 'studio-authoring', version: 2, required: true }], dataResources: [], lifecycleRuntime } },
            entryPoints: [{ entryPointId: createNativeId('entryPoint'), displayName: 'Arrival', actorIds: [], worldIds: [], knowledgeBindingIds: [] }] },
        resources: [], worlds: [], knowledge: [], knowledgeBindings: [], assetFiles: [], dependencies: { worlds: [], knowledge: [], knowledgeBindings: [], assets: [], resources: [] },
    };
    const ui = { format: 'atria-frontend-source', version: 3, primaryView: 'main', views: [{ id: 'main', root: 'Main', surface: 'chat.footer' }], components: [{ id: 'Main', source: 'Main.aui' }] };
    const contract = { state: { draft: { schema: { type: 'object', properties: { name: { type: 'string', maxLength: 80 } }, required: ['name'], additionalProperties: false }, initial: { name: '' } } }, interactions: { fill: [{ kind: 'set', target: 'draft.name', value: 'Atria' }] } };
    const aui = '<template><main node-id="root"><h1 node-id="title">Welcome to the observatory</h1><label node-id="label" for="name">Explorer</label><input node-id="name" id="name" bind:value="draft.name" /><button node-id="fill" on:click="fill">Fill name</button></main></template><contract>' + JSON.stringify(contract) + '</contract>';
    await page.evaluate(async ({ source, ui, aui }) => {
        const res = await fetch('/api/native/studio/projects', { method: 'POST', headers: window.Atria.getContext().getRequestHeaders(),
            body: JSON.stringify({ source, files: [{ path: 'frontend.json', content: JSON.stringify(ui) }, { path: 'Main.aui', content: aui }] }) });
        if (!res.ok) throw new Error(await res.text());
        await window.Atria.shell.getWorkspaceHost().openBuild(source.project.projectId);
    }, { source, ui, aui });
    await expect(page.locator('[data-atria-studio-view="overview"]')).toBeVisible();
    await page.evaluate(() => document.querySelector('[data-atria-studio-resource="ui"]').click());
    const editor = page.locator('[data-atria-frontend-editor]');
    await expect(editor).toBeVisible();
    const componentOption = editor.locator('select[aria-label="Source Graph"] option').filter({ hasText: 'component · Main' });
    await expect(componentOption).toHaveCount(1);
    await editor.getByLabel('Source Graph', { exact: true }).selectOption(await componentOption.getAttribute('value'));
    await expect(editor.getByLabel('Native source', { exact: true })).toHaveValue(aui);
    expect((await editor.boundingBox()).x).toBeGreaterThanOrEqual(0);
    expect(await editor.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`studio-document-${width}.png`), fullPage: true });
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent === 'Preview').click());
    const canvas = page.locator('.atria-studio-preview-canvas');
    await expect(canvas.getByText('Welcome to the observatory')).toBeVisible();
    await canvas.getByRole('button', { name: 'Fill name' }).click();
    await expect(canvas.getByLabel('Explorer')).toHaveValue('Atria');
    await page.screenshot({ path: info.outputPath(`preview-${width}.png`), fullPage: true });
    await page.evaluate(() => document.querySelector('[data-atria-studio-resource="simulation"]').click());
    const fixture = page.getByLabel('Scenario fixture');
    await fixture.fill(JSON.stringify({ schemaVersion: 1, steps: [
        { kind: 'lifecycle', input: { kind: 'app.command', domainId: 'notes', recordId: 'main', commandId: 'save', args: { text: 'observed' } } },
        { kind: 'assert', input: { path: 'states.atri_lifecycle.domains.notes.records.0.value.text', equals: 'observed' } },
    ] }, null, 2));
    await page.getByRole('button', { name: 'Run Simulation', exact: true }).click();
    await expect(page.locator('[data-atria-studio-view="simulation"] [role="status"]')).toHaveText('Simulation: completed');
    await page.getByText('Simulation details', { exact: true }).click();
    await expect(page.locator('[data-atria-studio-view="simulation"] pre')).toContainText('"status": "passed"');
    await page.screenshot({ path: info.outputPath(`scenario-${width}.png`), fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
});
