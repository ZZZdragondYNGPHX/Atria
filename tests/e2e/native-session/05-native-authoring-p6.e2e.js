import { openPromptSections } from './_helpers.js';
import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { FsEngine } from '../../../src/storage/engines/fs-engine.js';
import { createNativeId } from '../../../src/native/identity.js';
import { installFixture, sessionFixture } from '../../native/helpers/session-fixture.js';
import { seedGenerationProfiles } from '../../native/helpers/generation-fixture.js';
import { startServer, tearDownServer } from '../_lib/server.js';
import { awaitMainUI } from '../_lib/page.js';
import { seedNativeSessionDataRoot } from './_helpers.js';
let server; let seeded;
test.describe.configure({ mode: 'serial' });
test.use({ actionTimeout: 12000 });
if (process.env.PW_NATIVE_CHANNEL) test.use({ channel: process.env.PW_NATIVE_CHANNEL });

test.beforeAll(async () => {
    seeded = await seedNativeSessionDataRoot({ suffix: 'p6-authoring' });
    const root = resolve(seeded.dataRoot, seeded.handle);
    const engine = new FsEngine({ directoriesByHandle: () => ({ root, assets: resolve(root, 'assets') }) });
    const profiles = await seedGenerationProfiles({ engine, handle: seeded.handle, endpoint: 'http://127.0.0.1:1/completions', roles: ['narrator', 'studio'] });
    const fixture = sessionFixture();
    const origin = { scope: 'package', packageId: fixture.manifest.packageId, packageVersionId: fixture.manifest.packageVersionId };
    const moduleRef = { ...origin, resourceType: 'core.prompt-module', resourceId: profiles.module.promptModuleId, revision: 'r1' };
    fixture.manifest.resources = [
        { resourceType: 'core.prompt-module', resource: { ...profiles.module, displayName: 'Packaged Module' }, origin },
        { resourceType: 'core.prompt-program', resource: { ...profiles.prompt, displayName: 'Packaged Prompt', stages: [{ stageId: 'stage.main', moduleRefs: [moduleRef] }] }, origin },
    ];
    await installFixture({ engine, handle: seeded.handle, dirs: { root, assets: resolve(root, 'assets') } }, fixture);
    await engine.close(); server = await startServer({ batchKey: 'generation', scenarioId: 'p6-authoring', useExistingDataRoot: seeded.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server, { removeData: false }); });

for (const width of [1440, 390]) test(`Library and Studio authoring at ${width}px`, async ({ page }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    // Optional legacy discovery is not part of Native authoring acceptance.
    // Isolate it from external Horde TLS failures; all Native endpoints stay real.
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/text-workers', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await awaitMainUI(page, server.baseURL);
    const shot = name => page.screenshot({ path: info.outputPath(`${name}-${width}.png`), fullPage: true });
    // Prompt resources now have one Library owner: Prompt Presets. Historical
    // prompt-module/program aliases must route there without restoring the retired
    // loose-resource authoring surface.
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openLibrarySection('prompt-modules'));
    await expect(page.getByRole('heading', { name: 'Prompt Presets', exact: true })).toBeVisible();
    const migration = page.getByText('Existing resources — migrate into an independent preset', { exact: true });
    await expect(migration).toBeVisible(); await migration.click();
    await page.getByRole('button', { name: 'Choose existing resources', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Prompt Programs', exact: true })).toContainText('P4 program');
    await expect(page.getByRole('combobox', { name: 'Generation Profiles', exact: true })).toContainText('P4 generation');
    await shot('library-owner');
    const projectId = createNativeId('project');
    const source = { format: 'atria-project-source', schemaVersion: 1,
        project: { projectId, packageId: createNativeId('package'), displayName: 'P6 Studio ' + width, createdAt: 10, updatedAt: 10 },
        package: { name: 'P6 Studio', version: '1.0.0', actors: [], capabilities: ['narrative'], permissions: [], entryPoints: [{ entryPointId: createNativeId('entryPoint'), displayName: 'Main', actorIds: [], worldIds: [], knowledgeBindingIds: [] }] },
        resources: [], worlds: [], knowledge: [], knowledgeBindings: [], assetFiles: [], dependencies: { worlds: [], knowledge: [], knowledgeBindings: [], assets: [], resources: [] } };
    await page.evaluate(async source => {
        const response = await fetch('/api/native/studio/projects', { method: 'POST', headers: window.Atria.getContext().getRequestHeaders(), body: JSON.stringify({ source }) });
        if (!response.ok) throw new Error(await response.text()); window.Atria.shell.getWorkspaceHost().openBuild(source.project.projectId);
    }, source);
    const studio = page.locator('[data-atria-studio-workspace]'); await expect(studio).toBeVisible();
    const navigate = async name => {
        if (width === 390) await studio.locator('.atria-studio-mobile-nav').getByRole('button', { name: 'Project', exact: true }).click();
        await studio.locator('.atria-studio-resource-tree').getByRole('button', { name, exact: true }).click();
    };
    const apply = async () => {
        if (width === 390) await studio.locator('.atria-studio-mobile-nav').getByRole('button', { name: 'More', exact: true }).click();
        await expect(studio.getByRole('button', { name: 'Apply ChangeSet', exact: true })).toBeVisible(); await shot('review');
        await studio.getByRole('button', { name: 'Apply ChangeSet', exact: true }).click();
        await expect(studio.getByRole('button', { name: 'Apply ChangeSet', exact: true })).toHaveCount(0);
    };
    await navigate('Prompt Authoring'); const view = page.locator('[data-atria-studio-view="prompt-authoring"]');
    await view.getByLabel('Resource kind').selectOption('core.prompt-module'); await view.getByRole('button', { name: 'New project resource' }).click();
    await openPromptSections(page, 'identity');
    await view.getByLabel('Display name', { exact: true }).fill('Project module ' + width);
    await openPromptSections(page, 'module');
    await view.getByLabel('Prompt body', { exact: true }).fill('Project-owned dialogue.'); await shot('studio-editor');
    await view.getByRole('button', { name: 'Review / save revision' }).click();
    const beforeApply = await page.evaluate(async projectId => {
        const result = await fetch('/api/native/studio/projects/' + projectId, { headers: window.Atria.getContext().getRequestHeaders() }); return result.json();
    }, projectId);
    expect(beforeApply.source.resources).toEqual([]); await apply();
    await navigate('Prompt Authoring'); await view.getByLabel('Resource kind').selectOption('core.prompt-module'); await expect(view).toContainText('Project module ' + width);
    await view.getByText('Compile preview — committed exact resources', { exact: true }).click();
    await view.getByLabel('Preview route').selectOption({ label: 'studio' }); await view.getByRole('button', { name: 'Compile committed Prompt' }).click();
    await expect(view).toContainText('Compiled — no request sent'); await shot('studio-preview');
    await navigate('Runtime Design'); const design = page.locator('[data-atria-studio-view="runtime-design"]');
    await design.getByLabel('Recommended Prompt', { exact: true }).selectOption({ index: 1 }); await design.getByLabel('Recommended Generation', { exact: true }).selectOption({ index: 1 });
    await design.getByRole('button', { name: 'Set role recommendation' }).click(); await design.getByRole('button', { name: 'Review runtime requirements' }).click(); await apply();
    await navigate('Runtime Design'); await expect(design.getByLabel('Recommended Prompt', { exact: true })).not.toHaveValue(''); await shot('runtime-design');
    await design.getByRole('button', { name: 'Inspect exact build closure' }).click(); await expect(design.locator('pre').first()).toContainText('core.prompt-program'); await shot('exact-closure');
    await navigate('Build'); await studio.getByRole('button', { name: 'Run Preflight', exact: true }).click();
    await page.locator('[data-atria-studio-view="build"] summary').click(); await expect(page.locator('[data-atria-studio-view="build"] pre')).toBeVisible(); await shot('build');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); expect(errors).toEqual([]);
});
