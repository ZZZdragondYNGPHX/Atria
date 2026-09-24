import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { createSkillRepository } from '../../../src/skills/repository.js';
import { createNativeId } from '../../../src/native/identity.js';
import { startServer, tearDownServer } from '../_lib/server.js';
import { disableExtensions } from '../_lib/fixtures.js';
import { awaitMainUI } from '../_lib/page.js';
import { seedNativeSessionDataRoot } from './_helpers.js';

let server;
const projectId = createNativeId('project');
const skillText = (name, text) => `---\nname: ${name}\ndescription: Native scope test\n---\n${text}`;

test.beforeAll(async () => {
    const seed = await seedNativeSessionDataRoot({ suffix: 'native-authoring' });
    disableExtensions({ dataRoot: seed.dataRoot, names: ['stable-diffusion'] });
    const repo = createSkillRepository(join(seed.dataRoot, seed.handle));
    for (const [name, scope] of [
        ['project-guide', { kind: 'project', projectId }],
        ['package-guide', { kind: 'package', packageId: seed.start.packageId, packageVersionId: seed.start.packageVersionId }],
        ['legacy-guide', { kind: 'preset', name: 'Old preset' }],
    ]) await repo.install({ scope, payload: { files: [{ path: 'SKILL.md', encoding: 'utf8', content: skillText(name, 'Original guide') }] } });
    server = await startServer({ batchKey: 'generation', scenarioId: 'native-authoring', useExistingDataRoot: seed.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server); });

test('Studio authors Skill declarations through semantic fields and Review Apply at 390px', async ({ page }, info) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await awaitMainUI(page, server.baseURL);
    const id = createNativeId('project');
    const source = { format: 'atria-project-source', schemaVersion: 1,
        project: { projectId: id, packageId: createNativeId('package'), displayName: 'Skill authoring', createdAt: 1, updatedAt: 1 },
        package: { name: 'Skill authoring', version: '1.0.0', actors: [], capabilities: ['narrative'], permissions: [],
            skills: [{ skillId: 'custom-declaration', pluginOptions: { tone: 'quiet' } }],
            entryPoints: [{ entryPointId: createNativeId('entryPoint'), displayName: 'Main', actorIds: [], worldIds: [], knowledgeBindingIds: [] }] },
        resources: [], worlds: [], knowledge: [], knowledgeBindings: [], assetFiles: [],
        dependencies: { worlds: [], knowledge: [], knowledgeBindings: [], assets: [], resources: [] } };
    await page.evaluate(async ({ source, text }) => {
        const { nativeStudioClient } = await import('/scripts/native/studio-client.js');
        await nativeStudioClient.createProject(source);
        await window.Atria.getContext().skills.install({ scope: { kind: 'project', projectId: source.project.projectId },
            payload: { files: [{ path: 'SKILL.md', encoding: 'utf8', content: text }] } });
        window.Atria.shell.getWorkspaceHost().openBuild(source.project.projectId, source.project.displayName);
    }, { source, text: skillText('author-guide', 'Guide from this project') });
    const studio = page.locator('[data-atria-studio-workspace]');
    await studio.locator('.atria-studio-mobile-nav').getByRole('button', { name: 'Project', exact: true }).click();
    await studio.locator('[data-atria-studio-resource="skills"]').click();
    const editor = studio.locator('[data-atria-skill-declarations]');
    await editor.getByLabel('Available Skills', { exact: true }).selectOption('author-guide');
    await editor.getByRole('button', { name: 'Add selected Skill', exact: true }).click();
    await expect(editor.getByLabel('Skill ID 2', { exact: true })).toHaveValue('author-guide');
    await page.screenshot({ path: info.outputPath('skill-declarations-390.png') });
    const read = () => page.evaluate(async id => {
        const { nativeStudioClient } = await import('/scripts/native/studio-client.js');
        return (await nativeStudioClient.getProject(id)).source.package.skills;
    }, id);
    await editor.getByRole('button', { name: 'Review Changes', exact: true }).click();
    expect(await read()).toEqual(source.package.skills);
    await studio.getByRole('button', { name: 'Apply ChangeSet', exact: true }).click();
    await expect.poll(read).toEqual([...source.package.skills, 'author-guide']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Skill Manager edits and moves project Skills while exact Package originals stay read-only at 390px', async ({ page }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await awaitMainUI(page, server.baseURL);
    const source = { format: 'atria-project-source', schemaVersion: 1,
        project: { projectId, packageId: createNativeId('package'), displayName: 'Skill voyage', createdAt: 1, updatedAt: 1 },
        package: { name: 'Skill voyage', version: '1.0.0', actors: [], capabilities: ['narrative'], permissions: [],
            entryPoints: [{ entryPointId: createNativeId('entryPoint'), displayName: 'Main', actorIds: [], worldIds: [], knowledgeBindingIds: [] }] },
        resources: [], worlds: [], knowledge: [], knowledgeBindings: [], assetFiles: [],
        dependencies: { worlds: [], knowledge: [], knowledgeBindings: [], assets: [], resources: [] } };
    await page.evaluate(async source => {
        const { nativeStudioClient } = await import('/scripts/native/studio-client.js');
        await nativeStudioClient.createProject(source);
        const { openSkillManagerPanel } = await import('/scripts/skills/skill-manager-panel.js');
        void openSkillManagerPanel({ context: window.Atria.getContext() });
    }, source);
    const manager = page.locator('.atria_skill_manager');
    const project = manager.locator('[data-skill-name="project-guide"]');
    const pkg = manager.locator('[data-skill-name="package-guide"]');
    await expect(project).toBeVisible(); await expect(pkg).toBeVisible();
    await expect(project.locator('..').locator('..')).toContainText('Skill voyage');
    await expect(pkg).toContainText('Package original · Read-only');
    for (const action of ['edit', 'move', 'rename', 'delete']) await expect(pkg.locator(`[data-skill-action="${action}"]`)).toHaveCount(0);
    await expect(manager.locator('[data-skill-name="legacy-guide"]')).toBeHidden();
    await pkg.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('native-skill-scopes-390.png') });
    await project.getByRole('button', { name: 'Edit', exact: true }).click();
    const editor = page.locator('[data-editor-textarea]');
    await expect(editor).toBeVisible(); await editor.fill(skillText('project-guide', 'Edited project guide'));
    await page.locator('[data-editor-save]').click();
    await expect.poll(() => page.evaluate(async projectId => {
        const result = await window.Atria.getContext().skills.readFile({ scope: { kind: 'project', projectId }, name: 'project-guide' });
        return result.content;
    }, projectId)).toContain('Edited project guide');
    await page.locator('dialog[open]').last().getByRole('button', { name: 'Close', exact: true }).click();
    await project.locator('summary').click();
    await project.getByRole('button', { name: 'Move to...', exact: true }).click();
    const picker = page.locator('.atria_skill_scope_picker');
    await expect(picker.getByLabel('Project', { exact: true }).last()).toBeVisible();
    await picker.getByRole('radio', { name: 'Global', exact: true }).check();
    await page.locator('dialog[open]').last().getByRole('button', { name: 'OK', exact: true }).click();
    await expect(page.locator('dialog[open]').last()).toContainText('References to its name are not rewritten');
    await page.locator('dialog[open]').last().getByRole('button', { name: 'Move', exact: true }).click();
    await expect(manager.locator('[data-scope-key="global"] [data-skill-name="project-guide"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
