import { test, expect } from '@playwright/test';
import { createNativeId } from '../../../src/native/identity.js';
import { knowledgeSnapshot } from '../../native/helpers/session-fixture.js';
import { startServer, tearDownServer } from '../_lib/server.js';
import { disableExtensions } from '../_lib/fixtures.js';
import { awaitMainUI } from '../_lib/page.js';
import { seedNativeSessionDataRoot } from './_helpers.js';
let server;

test.beforeAll(async () => {
    const seed = await seedNativeSessionDataRoot({ suffix: 'native-knowledge' });
    disableExtensions({ dataRoot: seed.dataRoot, names: ['stable-diffusion'] });
    server = await startServer({ batchKey: 'generation', scenarioId: 'native-knowledge', useExistingDataRoot: seed.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server); });

test('Knowledge typed delivery and invalid Source stay inside Studio Review at 390px', async ({ page }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await awaitMainUI(page, server.baseURL);
    const knowledge = knowledgeSnapshot('Harbor rules');
    knowledge.knowledgeBase.displayName = 'Harbor rules';
    knowledge.entries[0].delivery = { position: 'before', target: 'narrator' };
    const source = { format: 'atria-project-source', schemaVersion: 1,
        project: { projectId: createNativeId('project'), packageId: createNativeId('package'), displayName: 'Knowledge contracts', createdAt: 1, updatedAt: 1 },
        package: { name: 'Knowledge contracts', version: '1.0.0', actors: [], capabilities: ['narrative'], permissions: [], entryPoints: [{ entryPointId: createNativeId('entryPoint'), displayName: 'Main', actorIds: [], worldIds: [], knowledgeBindingIds: [] }] },
        resources: [], worlds: [], knowledge: [knowledge], knowledgeBindings: [], assetFiles: [], dependencies: { worlds: [], knowledge: [], knowledgeBindings: [], assets: [], resources: [] } };
    await page.evaluate(async source => {
        const response = await fetch('/api/native/studio/projects', { method: 'POST', headers: window.Atria.getContext().getRequestHeaders(), body: JSON.stringify({ source }) });
        if (!response.ok) throw new Error(await response.text());
        window.Atria.shell.getWorkspaceHost().openBuild(source.project.projectId);
    }, source);
    const studio = page.locator('[data-atria-studio-workspace]');
    await studio.locator('.atria-studio-mobile-nav').getByRole('button', { name: 'Project', exact: true }).click();
    await studio.locator('.atria-studio-resource-tree').getByRole('button', { name: 'Knowledge', exact: true }).click();
    const editor = studio.locator('.atri-knowledge-editor');
    await editor.locator('summary').filter({ hasText: /^Delivery$/ }).click();
    await editor.getByLabel('Delivery position', { exact: true }).selectOption('after');
    await expect(editor.getByLabel('Target kind 1', { exact: true })).toHaveValue('narrator');
    await editor.getByRole('button', { name: 'Source', exact: true }).click();
    const json = editor.getByRole('textbox', { name: 'Knowledge resource JSON' });
    const draft = JSON.parse(await json.inputValue()); draft.entries[0].delivery.position = 'before-chat';
    await json.fill(JSON.stringify(draft));
    await editor.getByRole('button', { name: 'Review Changes', exact: true }).click();
    await expect(editor.getByRole('alert')).toContainText('entries.0.delivery.position');
    await expect(json).toHaveValue(JSON.stringify(draft));
    await page.screenshot({ path: info.outputPath('knowledge-invalid-source-390.png') });
    draft.entries[0].delivery.position = 'after';
    for (const key of ['semanticHints', 'vectorHints']) {
        draft.entries[0].discovery = { [key]: [] }; await json.fill(JSON.stringify(draft));
        await editor.getByRole('button', { name: 'Review Changes', exact: true }).click();
        await expect(editor.getByRole('alert')).toContainText('entries.0.discovery.' + key);
    }
    delete draft.entries[0].discovery; await json.fill(JSON.stringify(draft));
    await editor.getByRole('button', { name: 'Review Changes', exact: true }).click();
    await studio.locator('.atria-studio-mobile-nav').getByRole('button', { name: 'More', exact: true }).click();
    await expect(studio.getByRole('button', { name: 'Apply ChangeSet', exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('knowledge-review-390.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test('Library creates first and subsequent immutable World and Knowledge revisions at 390px', async ({ page }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await awaitMainUI(page, server.baseURL);
    for (const knowledge of [false, true]) {
        const kind = knowledge ? 'knowledge' : 'worlds'; const label = knowledge ? 'Knowledge Base' : 'World';
        await page.evaluate(kind => window.Atria.shell.getWorkspaceHost().openLibrarySection(kind), kind);
        const root = page.locator('[data-atria-native-library="worlds-knowledge"]');
        await root.getByLabel('New ' + label + ' name', { exact: true }).fill('Revision test ' + label);
        await root.getByRole('button', { name: 'Create ' + label, exact: true }).click();
        const id = await root.locator(knowledge ? '[data-atria-knowledge-detail]' : '[data-atria-world-detail]').getAttribute(knowledge ? 'data-atria-knowledge-detail' : 'data-atria-world-detail');
        await root.getByRole('button', { name: 'Create first revision', exact: true }).click();
        let firstId;
        for (const index of [1, 2]) {
            if (index === 2) await root.getByRole('button', { name: 'New revision', exact: true }).click();
            const editor = root.locator(knowledge ? '.atri-knowledge-editor' : '.atri-studio-value-editor');
            await editor.getByRole('button', { name: 'Source', exact: true }).click();
            const json = editor.getByRole('textbox', { name: knowledge ? 'Knowledge revision JSON' : 'World revision JSON' });
            const draft = JSON.parse(await json.inputValue());
            if (knowledge) draft.entries[0].content = 'Harbor rule ' + index;
            else draft.baseline = { weather: index === 1 ? 'rain' : 'sun' };
            await json.fill(JSON.stringify(draft));
            await editor.getByRole('button', { name: 'Review Changes', exact: true }).click();
            const save = root.getByRole('button', { name: 'Save immutable revision', exact: true });
            if (knowledge && index === 2) {
                await page.route('**/api/native/product/knowledge/*/revisions', route => route.fulfill({ status: 503, json: { error: 'native_product_failed' } }), { times: 1 });
                await save.click(); await expect(root.getByRole('alert')).toContainText('could not finish');
                await expect(root).toContainText('Harbor rule 2');
            }
            await save.click();
            await expect(root.getByRole('status')).toContainText('Saved immutable Library revision');
            const detail = await page.evaluate(async ({ kind, id }) => (await fetch('/api/native/product/' + kind + '/' + id, { headers: window.Atria.getContext().getRequestHeaders() })).json(), { kind, id });
            const current = knowledge ? detail.knowledgeBase.currentRevisionId : detail.world.currentRevisionId;
            expect(detail.revisions).toHaveLength(index);
            if (index === 1) firstId = current;
            else {
                expect(current).not.toBe(firstId);
                if (knowledge) {
                    const old = await page.evaluate(async ({ id, firstId }) => (await fetch('/api/native/product/knowledge/' + id + '?revisionId=' + firstId, { headers: window.Atria.getContext().getRequestHeaders() })).json(), { id, firstId });
                    expect(old.entries[0].content).toBe('Harbor rule 1');
                } else expect(detail.revisions.find(item => item.worldRevisionId === firstId).baseline.weather).toBe('rain');
            }
        }
        await page.screenshot({ path: info.outputPath(kind + '-revisions-390.png') });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
});


test('Knowledge semantic editor authors conditions, relations and lifecycle without Source at 320px', async ({ page }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await awaitMainUI(page, server.baseURL);
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openLibrarySection('knowledge'));
    const root = page.locator('[data-atria-native-library="worlds-knowledge"]');
    await root.getByLabel('New Knowledge Base name', { exact: true }).fill('Semantic harbor');
    await root.getByRole('button', { name: 'Create Knowledge Base', exact: true }).click();
    const id = await root.locator('[data-atria-knowledge-detail]').getAttribute('data-atria-knowledge-detail');
    await root.getByRole('button', { name: 'Create first revision', exact: true }).click();
    const editor = root.locator('.atri-knowledge-editor');
    await editor.getByLabel('Entry title', { exact: true }).fill('Harbor lore');
    await editor.getByLabel('Entry content', { exact: true }).fill('The harbor follows the tide.');
    await editor.locator('summary').filter({ hasText: /^Discovery$/ }).click();
    await editor.getByLabel('Keywords', { exact: true }).fill('harbor\nport');
    await editor.getByLabel('Regular expressions', { exact: true }).fill('/harbor/i');
    await editor.locator('summary').filter({ hasText: /^Applicability$/ }).click();
    await editor.getByRole('button', { name: 'Add state condition', exact: true }).click();
    await editor.getByLabel('State path segments 1', { exact: true }).fill('scene\nplace');
    await editor.getByLabel('Expected value 1', { exact: true }).fill('harbor');
    await editor.getByRole('checkbox', { name: 'Activate from matching state without keywords', exact: true }).check();
    await editor.locator('summary').filter({ hasText: /^Lifecycle$/ }).click();
    await editor.getByLabel('Sticky turns', { exact: true }).fill('2');
    await editor.getByLabel('Activation probability (%)', { exact: true }).fill('75');
    await editor.locator('summary').filter({ hasText: /^Delivery$/ }).click();
    await editor.getByLabel('Delivery position', { exact: true }).selectOption('after');
    await page.screenshot({ path: info.outputPath('knowledge-semantic-320.png') });
    await editor.getByRole('button', { name: 'Add entry', exact: true }).click();
    await editor.getByLabel('Entry title', { exact: true }).fill('Harbor sequel');
    await editor.getByLabel('Entry content', { exact: true }).fill('The sequel needs the harbor lore.');
    await editor.locator('summary').filter({ hasText: /^Relations$/ }).click();
    await editor.getByRole('checkbox', { name: 'Harbor lore', exact: true }).first().check();
    await editor.getByRole('button', { name: 'Move entry up', exact: true }).click();
    await editor.getByLabel('Selected entry', { exact: true }).selectOption('1');
    await editor.getByRole('button', { name: 'Delete entry', exact: true }).click();
    await expect(editor.getByRole('alert')).toContainText('Harbor sequel');
    await editor.getByRole('button', { name: 'Add entry', exact: true }).click();
    await editor.getByRole('button', { name: 'Delete entry', exact: true }).click();
    await page.locator('dialog.popup[open] .popup-button-ok').click();
    await expect(editor.getByLabel('Selected entry', { exact: true }).locator('option')).toHaveCount(2);
    await editor.getByRole('button', { name: 'Review Changes', exact: true }).click();
    await root.getByRole('button', { name: 'Save immutable revision', exact: true }).click();
    await expect(root.getByRole('status')).toContainText('Saved immutable Library revision');
    const detail = await page.evaluate(async id => (await fetch('/api/native/product/knowledge/' + id, { headers: window.Atria.getContext().getRequestHeaders() })).json(), id);
    expect(detail.entries.map(entry => entry.metadata.title)).toEqual(['Harbor sequel', 'Harbor lore']);
    expect(detail.entries[0].relations.requiredEntryIds).toEqual([detail.entries[1].knowledgeEntryId]);
    expect(detail.entries[1]).toMatchObject({ discovery: { keywords: ['harbor', 'port'], regex: ['/harbor/i'] }, lifecycle: { probability: 75, sticky: 2 }, applicability: { stateActivation: true }, delivery: { position: 'after' } });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
