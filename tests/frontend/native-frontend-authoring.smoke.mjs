import express from 'express';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { setConfigFilePath } from '../../src/util.js';
import { createGitClient } from '../../src/git/client.js';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import { authoringFixture } from '../native/helpers/frontend-authoring-fixture.js';

const root = resolve(import.meta.dirname, '../..'), evidence = resolve(root, '.git/frontend-v3-authoring-evidence');
await mkdir(evidence, { recursive: true });
const h = await makeTempFsEngine(), fixture = authoringFixture();
setConfigFilePath(resolve(root, 'default/config.yaml'));
globalThis.DATA_ROOT = h.dataRoot;
const { createNativeStudioRouter } = await import('../../src/endpoints/native-studio.js');
const { AssetStore, KnowledgeRepo, ProjectStore, StudioPreviewHost, StudioService, WorldRepo, createNativeId } = await import('../../src/native/index.js');
const projectId = createNativeId('project'), packageId = createNativeId('package'), entryPointId = createNativeId('entryPoint');
const source = { format: 'atria-project-source', schemaVersion: 1, project: { projectId, packageId, displayName: 'Studio Frontend' },
    package: { ...fixture.source.package, name: 'Studio Frontend', version: '1.0.0', actors: [], capabilities: [], entryPoints: [{ entryPointId, displayName: 'Main', actorIds: [], worldIds: [], knowledgeBindingIds: [] }] },
    worlds: [], knowledge: [], knowledgeBindings: [], dependencies: {}, assetFiles: [] };
const projects = new ProjectStore({ directoriesByHandle: () => h.dirs });
const studio = new StudioService({ projectStore: projects, worldRepo: new WorldRepo({ engine: h.engine }), knowledgeRepo: new KnowledgeRepo({ engine: h.engine }),
    assetStore: new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs }), gitClient: createGitClient({ backend: 'builtin' }), previewHost: new StudioPreviewHost() });
const created = await studio.createProject(h.handle, source, { files: fixture.files });
const app = express(); app.use(express.json({ limit: '4mb' }));
app.use((req, _res, next) => { req.user = { profile: { handle: h.handle } }; next(); });
app.use('/api/native/studio', createNativeStudioRouter(() => ({ studio })));
app.get('/', (_req, res) => res.type('html').send('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/public/css/atria-tokens.css"><link rel="stylesheet" href="/public/css/atria-shell.css"><link rel="stylesheet" href="/public/css/atria-library.css"><link rel="stylesheet" href="/public/css/atria-build.css"><style>body{margin:0;padding:16px;font:16px system-ui;background:#202126;color:#eee}main.atria-app-shell{position:static;display:block;width:100%;height:auto;overflow:visible;max-width:960px;margin:auto}#surface{height:auto}textarea,select{box-sizing:border-box;max-width:100%;width:100%}textarea{min-height:120px}pre{white-space:pre-wrap;overflow-wrap:anywhere}button{min-height:36px;margin:4px}label{display:block}.atria-studio-preview-canvas{min-height:160px;background:white;color:black}</style><main class="atria-app-shell"><div class="atria-native-studio" id="surface"></div></main>'));
app.use('/public', express.static(resolve(root, 'public')));
const server = await new Promise(ready => { const server = app.listen(0, '127.0.0.1', () => ready(server)); });
const browser = await chromium.launch({ channel: process.env.ATRIA_BROWSER_CHANNEL || 'msedge', headless: true });
try {
    for (const width of [1440, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 1000 } }), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.evaluate(async ({ projectId, revision }) => {
            const { mountFrontendEditor } = await import('/public/scripts/native/studio-frontend-editor.js');
            globalThis.staged = [];
            globalThis.editor = await mountFrontendEditor({ document, root: document.querySelector('#surface'), projectId, baseRevision: revision,
                stageOperations: async operations => { globalThis.staged = operations; return true; } });
        }, { projectId, revision: created.revision.revision });
        const graph = page.getByRole('combobox', { name: 'Source Graph' });
        const greeting = await graph.locator('option').evaluateAll(options => options.find(option => option.textContent.includes('node · Main:greeting')).value);
        await graph.selectOption(greeting);
        const text = page.getByRole('textbox', { name: 'Native source', exact: true });
        await text.waitFor(); await page.waitForFunction(() => !document.querySelector('textarea[aria-label="Native source"]').disabled);
        await page.getByRole('textbox', { name: 'Structured value' }).fill('Browser authored');
        await page.getByRole('button', { name: 'Review structured edit', exact: true }).click();
        try { await page.waitForFunction(() => globalThis.staged.length === 1); }
        catch (error) { console.log(await page.locator('body').innerText()); throw error; }
        assert.equal(await page.evaluate(() => globalThis.staged[0].operationType), 'frontend.patch');
        await page.getByText('Browser authored', { exact: true }).waitFor();
        assert.equal((await projects.readFile(h.handle, projectId, 'frontend/Main.aui')).toString(), fixture.files.get('frontend/Main.aui').toString());
        const original = await text.inputValue();
        await text.fill('<template><script node-id="bad"/></template>');
        await page.getByRole('button', { name: 'Check source', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('textarea[aria-label="Native source"]').getAttribute('aria-invalid') === 'true');
        const error = page.getByRole('button', { name: /error.*frontend.*Main.aui/ }).first(); await error.click();
        assert.equal(await text.inputValue(), '<template><script node-id="bad"/></template>');
        await text.fill(original.replace('Hello', 'Draft Preview'));
        await page.getByRole('button', { name: 'Preview draft', exact: true }).click();
        await page.getByText('Draft Preview', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Review source changes', exact: true }).click();
        await page.waitForFunction(() => globalThis.staged[0]?.operationType === 'source.write');
        assert.equal((await studio.getRevision(h.handle, projectId)).revision, created.revision.revision);
        await page.screenshot({ path: resolve(evidence, `studio-${width}.png`), fullPage: true });
        await page.evaluate(() => globalThis.editor.dispose());
        assert.equal(await page.locator('[data-atria-frontend-editor]').count(), 0);
        assert.deepEqual(errors, []);
        await page.close();
        console.log(`PASS Studio ${width}: semantic patch, formal Preview, invalid source, diagnostic navigation, draft retention, source review, unchanged revision, disposal`);
    }
} finally { await browser.close(); await new Promise(done => server.close(done)); await h.cleanup(); }
