// Real browser + production modules; no user data or model/network service calls.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
async function expectText(locator, text) { await locator.getByText(text, { exact: true }).waitFor(); }
const root = resolve(fileURLToPath(new URL('../../public', import.meta.url)));
const server = createServer(async (req, res) => {
    try {
        if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Runtime projection smoke</title>'); return; }
        const path = resolve(root, `.${new URL(req.url, 'http://localhost').pathname}`);
        if (!path.startsWith(root + sep) || !/\.(js|css)$/.test(path)) throw new Error('Not an asset');
        res.setHeader('Content-Type', path.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(await readFile(path));
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
    const channel = process.env.ENGINE_BROWSER || 'msedge';
    browser = await chromium.launch({ ...(channel === 'chromium' ? {} : { channel }), headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const memoryFixture = (await readFile(new URL('../memory-graph/fixtures/large-memory.js', import.meta.url), 'utf8')).replace('../../../public/scripts/', '/scripts/');
    await page.route('**/__workspace_large.js', route => route.fulfill({contentType:'text/javascript',body:memoryFixture}));
    const cytoscape = await readFile(new URL('../../node_modules/cytoscape/dist/cytoscape.esm.min.mjs', import.meta.url), 'utf8');
    await page.route('**/__workspace_cytoscape.js', route => route.fulfill({contentType:'text/javascript',body:cytoscape}));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async () => {
        // Host constants only; persistence and Memory ports below are explicit fixtures.
        window.Atria = { getContext: () => ({ constants: { promptRoles: { SYSTEM: 0, USER: 1 }, wiPosition: {} } }) };
        const panel = await import('/scripts/extensions/orchestrator/workspace/panel.js');
        const { createPresetAuthoring } = await import('/scripts/extensions/orchestrator/workspace/authoring.js');
        const { createMemoryWorkspace } = await import('/scripts/extensions/orchestrator/workspace/memory.js');
        window.settings = JSON.parse(localStorage.getItem('settings') || '{}');
        window.scope = { character: 'test-character', conversation: 'test-chat' };
        window.memoryLoads = 0;
        window.memoryControls = {
            memoryOsEnabled: true,
            enabled: true,
            recallEnabled: true,
            autoExtractionEnabled: true,
            autoCompressionEnabled: true,
            recallMethod: 'llm',
            updateEvery: 1,
        };
        const memorySnapshot = {
            state: {
                episodes: { ep1: { id: 'ep1', sourceFloor: 2, status: 'active', content: 'Memory source text' } },
                corrections: {}, providerSources: {}, providerSnapshots: {},
            },
            chat: [],
            assertCurrent() {},
        };
        const memoryComputed = {
            graph: {
                entities: [{ id: 'memory-one', canonicalName: 'Memory One', aliases: [], type: 'Event', status: 'active',
                    supports: [{ episodeIds: ['ep1'] }] }],
                relations: [],
                pending: [],
            },
            facts: [],
        };
        const getContext = () => ({ getExtensionApi: () => ({ getWorkspacePorts: () => ({
            getStatus: () => ({ ...window.memoryControls }),
            setControl: async (name, value) => ({ ...window.memoryControls, [name]: (window.memoryControls[name] = value) }),
            load: async () => { window.memoryLoads++; return memorySnapshot; },
            inspect: async () => memoryComputed,
        }) }) });
        panel.configureWorkspace({ renderPresets: createPresetAuthoring({ getSettings: () => window.settings,
            renderProfileOptions: (kind, value, inherited) => {
                const select = document.createElement('select');
                for (const name of ['', `${kind}-one`, `${kind}-two`, value].filter((name, index, names) => names.indexOf(name) === index)) {
                    const option = document.createElement('option'); option.value = name; option.textContent = name || (inherited ? 'Use workspace default' : 'Current'); select.append(option);
                }
                return select.innerHTML;
            },
            getTools: () => [{ name: 'chat_search' }, { name: 'memory_recall' }],
            getScope: () => window.scope, save: () => localStorage.setItem('settings', JSON.stringify(window.settings)) }),
        renderMemory: createMemoryWorkspace({ getContext }) });
        panel.initWorkspace(); panel.initWorkspace(); panel.openWorkspace('Orchestration');
    });
    const workspace = page.locator('#agent-memory-workspace');
    const primaryNav = workspace.locator('.atria-workspace-mobile-nav');
    assert.equal(await primaryNav.getByRole('button').count(), 4);
    assert.deepEqual(await primaryNav.getByRole('button').allTextContents(), ['Orchestration', 'Run', 'Memory', 'Diagnostics']);
    assert.equal(await workspace.getByText('Preset Library', { exact: true }).count(), 1);
    await workspace.getByText('Workspace defaults', { exact: true }).click();
    await workspace.getByLabel('Enable agent orchestration', { exact: true }).check();
    await workspace.getByLabel('Default API profile', { exact: true }).selectOption('api-one');
    await workspace.getByLabel('Default prompt preset', { exact: true }).selectOption('prompt-one');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('settings')).enabled), true);
    assert.equal(await page.evaluate(() => window.settings.llmNodeApiPresetName), 'api-one');
    // Every shipped preset retains nonempty, role-specific capability defaults.
    assert.equal(await page.evaluate(() => window.settings.agentWorkspace.presets.every(p => p.planTemplate.agents.every(a => (p.mode === 'agenda' ? a.tools.length === 0 : a.tools.includes('*')) && a.capabilities['tool.call']))), true);
    for (const mode of ['spec', 'agenda', 'director']) {
        await workspace.locator('.workspace-preset-list button').filter({ hasText: new RegExp(mode === 'agenda' ? '^Atri-agenda' : `^${mode}`, 'i') }).click();
        const before = await page.evaluate(mode => structuredClone(window.settings.agentWorkspace.presets.find(p => p.mode === mode)), mode);
        const add = workspace.getByRole('button', { name: mode === 'spec' ? 'Append worker stage' : 'Add specialist', exact: true });
        page.once('dialog', dialog => dialog.dismiss()); await add.click();
        assert.equal(await page.evaluate(mode => window.settings.agentWorkspace.presets.find(p => p.mode === mode).planTemplate.nodes.length, mode), before.planTemplate.nodes.length);
        page.once('dialog', dialog => dialog.accept('   ')); await add.click();
        assert.equal(await workspace.getByRole('status').innerText(), 'Enter a non-empty name.');
        assert.equal(await page.evaluate(mode => window.settings.agentWorkspace.presets.find(p => p.mode === mode).planTemplate.nodes.length, mode), before.planTemplate.nodes.length);
        page.once('dialog', dialog => dialog.accept(`${mode} specialist`)); await add.click();
        const inspector = workspace.locator('.atria-workspace-inspector');
        await inspector.getByRole('heading', { name: `${mode} specialist`, exact: true }).waitFor();
        await inspector.getByLabel('Agent name', { exact: true }).fill(`${mode} renamed`);
        await inspector.getByRole('button', { name: 'Save', exact: true }).click();
        const saved = await page.evaluate(mode => JSON.parse(localStorage.getItem('settings')).agentWorkspace.presets.find(p => p.mode === mode), mode);
        assert.equal(saved.planTemplate.agents.at(-1).name, `${mode} renamed`);
        assert.equal(saved.planTemplate.nodes.length, before.planTemplate.nodes.length + 1);
        await inspector.getByText('Danger zone', { exact: true }).click();
        page.once('dialog', dialog => dialog.accept()); await inspector.getByRole('button', { name: 'Delete agent', exact: true }).click();
        const removed = await page.evaluate(mode => window.settings.agentWorkspace.presets.find(p => p.mode === mode), mode);
        assert.equal(removed.planTemplate.agents.length, before.planTemplate.agents.length);
        assert.equal(removed.planTemplate.nodes.length, before.planTemplate.nodes.length);
        assert(!JSON.stringify(removed).includes(saved.planTemplate.agents.at(-1).id));
    }
    await workspace.locator('.workspace-preset-list button').filter({ hasText: /^Spec/ }).click();
    await workspace.locator('.workspace-more-menu > summary').click();
    await workspace.getByRole('button', { name: 'Duplicate', exact: true }).click();
    await workspace.locator('.workspace-more-menu > summary').click();
    await workspace.getByRole('button', { name: 'Preset settings', exact: true }).click();
    const presetInspector = workspace.locator('.atria-workspace-inspector');
    await presetInspector.getByLabel('Name', {exact:true}).fill('Browser preset <script>');
    await presetInspector.getByRole('button', { name: 'Save', exact: true }).click();
    await workspace.getByRole('button', { name: 'Bind as conversation', exact: true }).click();
    const library = await page.evaluate(() => JSON.parse(localStorage.getItem('settings')).agentWorkspace);
    assert.equal(library.presets.length, 5);
    assert.equal(library.bindings.entries[0].scope, 'conversation');
    assert.deepEqual(Object.keys(library.bindings.entries[0]).sort(), ['presetId', 'scope', 'subjectId']);
    assert.equal(library.presets.find(p => p.id === library.bindings.entries[0].presetId).name, 'Browser preset <script>');
    assert.equal(await workspace.locator('script').count(), 0);
    const downloaded = page.waitForEvent('download');
    await workspace.locator('.workspace-more-menu > summary').click();
    await workspace.getByRole('button', { name: 'Export', exact: true }).click();
    const download = await downloaded;
    const saved = resolve(root, `../.git/workspace-native-${channel}.json`); await download.saveAs(saved);
    await workspace.locator('.workspace-library-more > summary').click();
    await workspace.getByLabel('Import native preset', { exact: true }).setInputFiles(saved);
    await page.waitForFunction(() => window.settings.agentWorkspace.presets.length === 6);
    assert.notEqual(await page.evaluate(() => window.settings.agentWorkspace.presets.at(-1).id), library.bindings.entries[0].presetId);
    await workspace.locator('.workspace-library-more > summary').click();
    page.once('dialog', dialog => dialog.accept('Named single agent preset'));
    await workspace.getByRole('button', { name: 'Single Agent template', exact: true }).click();
    await page.waitForFunction(() => window.settings.agentWorkspace.presets.length === 7);
    assert.equal(await page.evaluate(() => window.settings.agentWorkspace.presets.at(-1).name), 'Named single agent preset');
    assert.equal(await page.evaluate(() => window.settings.agentWorkspace.presets.at(-1).planTemplate.nodes.length), 1);
    const agentInspector = workspace.locator('.atria-workspace-inspector');
    await agentInspector.getByLabel('API profile', { exact: true }).selectOption('api-two');
    await agentInspector.getByLabel('Prompt profile', { exact: true }).selectOption('prompt-two');
    assert.equal(await agentInspector.getByLabel('chat_search', { exact: true }).isChecked(), true);
    await agentInspector.getByRole('button', { name: 'Deny all', exact: true }).click();
    await agentInspector.getByLabel('chat_search', { exact: true }).check();
    await agentInspector.getByRole('button', { name: 'Save', exact: true }).click();
    const agent = await page.evaluate(() => window.settings.agentWorkspace.presets.at(-1).planTemplate.agents[0]);
    assert.deepEqual(agent.tools, ['chat_search']);
    assert.deepEqual(agent.modelProfile, { apiPresetName: 'api-two', promptPresetName: 'prompt-two' });
    await agentInspector.getByLabel('chat_search', { exact: true }).uncheck();
    await agentInspector.getByLabel('API profile', { exact: true }).selectOption('');
    await agentInspector.getByRole('button', { name: 'Save', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.settings.agentWorkspace.presets.at(-1).planTemplate.agents[0].tools), []);
    assert.equal(await workspace.getByLabel('API profile', { exact: true }).inputValue(), '');
    page.once('dialog', dialog => dialog.accept('Named stage'));
    await workspace.getByRole('button', { name: 'Append worker stage', exact: true }).click();
    assert.equal(await page.evaluate(() => window.settings.agentWorkspace.presets.at(-1).planTemplate.nodes.length), 2);
    // Keyboard navigation and explicit Node capability controls use native labels.
    await workspace.locator('.atria-workspace-mobile-nav').getByRole('button', { name: 'Orchestration', exact: true }).focus();
    await page.keyboard.press('End'); assert.equal(await workspace.locator('.atria-workspace-mobile-nav').getByRole('button', { name: 'Diagnostics', exact: true }).getAttribute('aria-current'), 'page');
    await page.evaluate(async () => {
        const store = await import('/scripts/extensions/orchestrator/run-state/store.js');
        window.stops = 0; window.runId = store.startRun({ mode: 'loop', chatKey: 'test-chat', stopFn: () => window.stops++ });
        const event = (type, version, extra = {}) => store.recordRuntimeEvent({ runId: window.runId, event: {
            eventId: `event-${version}`, runId: 'engine-live', type, version, generation: 0, agentId: 'agent:owner', ...extra,
        } });
        event('run.started', 1);
        event('memory.recall.completed', 2, { stepId: 'step-1', references: [{ id: 'memory-one' }], tokens: 42 });
    });
    await workspace.locator('.atria-workspace-mobile-nav').getByRole('button', { name: 'Memory', exact: true }).click();
    await workspace.getByRole('heading', { name: 'Memory is available', exact: true }).waitFor();
    assert.equal(await workspace.getByRole('button', { name: 'Overview', exact: true }).count(), 1);
    assert.equal(await workspace.getByRole('button', { name: 'Knowledge', exact: true }).count(), 1);
    assert.equal(await workspace.getByRole('button', { name: 'Sources', exact: true }).count(), 1);
    assert.equal(await workspace.getByRole('button', { name: 'Maintenance', exact: true }).count(), 1);
    await workspace.getByRole('button', { name: 'Knowledge', exact: true }).click();
    await workspace.getByRole('button', { name: /Memory One/ }).click();
    const memoryInspector = workspace.locator('.atria-workspace-inspector');
    await memoryInspector.getByRole('heading', { name: 'Memory One', exact: true }).waitFor();
    await expectText(memoryInspector, 'step-1');
    await page.evaluate(async () => {
        const store = await import('/scripts/extensions/orchestrator/run-state/store.js');
        store.recordRuntimeEvent({runId: window.runId, event:{eventId:'later-recall',runId:'engine-live',type:'memory.recall.completed',version:3,generation:0,agentId:'agent:owner',stepId:'step-2',references:[]}});
    });
    await workspace.getByRole('button', { name: 'Overview', exact: true }).click();
    await workspace.getByText('0 references', { exact: true }).waitFor();
    assert((await page.evaluate(() => window.memoryLoads)) >= 1);
    await workspace.locator('.atria-workspace-mobile-nav').getByRole('button', { name: 'Diagnostics', exact: true }).click();
    await workspace.getByRole('button', { name: 'Stop Run', exact: true }).click();
    await page.evaluate(async () => { const panel = await import('/scripts/extensions/orchestrator/workspace/panel.js'); panel.openWorkspace('Diagnostics'); });
    assert.equal(await workspace.getByRole('button', { name: 'Stopping…', exact: true }).isDisabled(), true);
    assert.equal(await page.evaluate(() => window.stops), 1);
    const trace = await page.evaluate(async () => {
        const store = await import('/scripts/extensions/orchestrator/run-state/store.js'); store.finishRun({runId:window.runId,status:'aborted'});
        return store.getCurrentRun().runtime.events.map(event => JSON.stringify(event)).join('\n');
    });
    await workspace.getByLabel('Replay metadata trace').setInputFiles({name:'trace.jsonl',mimeType:'application/x-ndjson',buffer:Buffer.from(trace)});
    await workspace.getByRole('button', {name:'Viewing imported trace · Return to live run'}).waitFor();
    assert.equal(await workspace.getByRole('button', {name:'Stop Run',exact:true}).isVisible(), false);
    assert.equal(await page.evaluate(() => window.stops), 1);
    await workspace.getByRole('button', {name:'Viewing imported trace · Return to live run'}).click();
    await workspace.locator('.atria-workspace-mobile-nav').getByRole('button', { name: 'Memory', exact: true }).click();
    await workspace.getByRole('heading', { name: 'Memory is available', exact: true }).waitFor();
    await workspace.getByRole('button', {name:'Close',exact:true}).click();
    await page.evaluate(async () => {const panel = await import('/scripts/extensions/orchestrator/workspace/panel.js'); panel.destroyWorkspace(); panel.destroyWorkspace(); panel.openWorkspace('Orchestration');});
    assert.equal(await page.locator('#agent-memory-workspace').count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({path:resolve(root,`../.git/workspace-authoring-${channel}-mobile.png`)});
    await page.setViewportSize({width:1440,height:900});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    // Embed the real Memory snapshot/worker/graph path using a guarded fixture.
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(async () => {
        const { largeMemory } = await import('/__workspace_large.js');
        const { default: cytoscape } = await import('/__workspace_cytoscape.js');
        const { computeInspector } = await import('/scripts/extensions/memory-graph/inspector-compute.js');
        const { createMemoryWorkspace } = await import('/scripts/extensions/orchestrator/workspace/memory.js');
        const panel = await import('/scripts/extensions/orchestrator/workspace/panel.js');
        const snapshot = largeMemory(1000); window.memoryValid = true;
        snapshot.assertCurrent = () => { if (!window.memoryValid) throw new Error('fixture scope changed'); };
        const context = { getExtensionApi: () => ({ getWorkspacePorts: () => ({
            getStatus: () => ({ memoryOsEnabled:true, enabled:true, recallEnabled:true, autoExtractionEnabled:true, autoCompressionEnabled:true, recallMethod:'llm', updateEvery:1 }),
            setControl: async () => {},
            load: async () => snapshot,
            inspect: current => computeInspector(current),
            loadGraphLibrary: async () => options => { window.memoryGraph = cytoscape(options); return window.memoryGraph; },
        }) }) };
        panel.configureWorkspace({renderMemory:createMemoryWorkspace({getContext:() => context})});
        panel.openWorkspace('Memory');
    });
    await workspace.getByRole('button', {name:'Knowledge',exact:true}).click();
    await workspace.locator('.workspace-memory-record').filter({hasText:'Person 0'}).first().waitFor();
    await workspace.locator('.workspace-memory-record').filter({hasText:'Person 0'}).first().click();
    await workspace.locator('.atria-workspace-inspector').getByRole('heading',{name:'Person 0',exact:true}).waitFor();
    await page.waitForFunction(() => window.memoryGraph?.nodes().length === 250);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({path:resolve(root,`../.git/workspace-memory-${channel}-mobile.png`)});
    await page.evaluate(() => { window.memoryValid = false; });
    await workspace.locator('.workspace-memory-record').filter({hasText:'Person 1'}).first().click();
    await workspace.getByRole('status').filter({hasText:'fixture scope changed'}).waitFor();
    await workspace.getByRole('button', {name:'Close',exact:true}).click();
    await page.waitForFunction(() => window.memoryGraph.destroyed());
    // Exercise the actual locale table: dynamic labels, attributes and responsive grids.
    await page.evaluate(async () => {
        const panel = await import('/scripts/extensions/orchestrator/workspace/panel.js');
        panel.destroyWorkspace();
    });
    await page.reload();
    await page.evaluate(async () => {
        const locales = {};
        window.Atria = { getContext: () => ({
            constants: { promptRoles: { SYSTEM: 0, USER: 1 }, wiPosition: {} },
            addLocaleData: (locale, data) => { locales[locale] = { ...locales[locale], ...data }; },
            translate: text => locales['zh-cn']?.[text] || ({ Name: '名称', Duplicate: '复制', Close: '关闭' }[text]) || text,
        }) };
        const { registerLocaleData } = await import('/scripts/extensions/orchestrator/i18n.js'); registerLocaleData();
        const panel = await import('/scripts/extensions/orchestrator/workspace/panel.js');
        const { createPresetAuthoring } = await import('/scripts/extensions/orchestrator/workspace/authoring.js');
        window.settings = {};
        panel.configureWorkspace({ renderPresets: createPresetAuthoring({ getSettings: () => window.settings, save: () => {}, getScope: () => ({}) }) });
        panel.openWorkspace('Orchestration');
    });
    await workspace.getByPlaceholder('搜索预设').fill('固定流程');
    assert.equal(await workspace.locator('.workspace-preset-list button:visible').count(), 1);
    await workspace.getByPlaceholder('搜索预设').fill('');
    assert.equal(await workspace.getByRole('button', { name: '绑定当前角色', exact: true }).isDisabled(), true);
    await workspace.getByLabel('最大执行步数', { exact: true }).fill('12');
    await workspace.getByRole('button', { name: '保存定义供后续运行', exact: true }).click();
    assert.equal(await page.evaluate(() => window.settings.agentWorkspace.presets[0].planTemplate.budgets.maxSteps), 12);
    const text = await workspace.innerText();
    for (const leaked of ['Effective:', 'Selected by:', 'Bind as', 'maxSteps', 'Append worker', 'Search presets']) assert(!text.includes(leaked), leaked);
    for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => { document.querySelector('#workspace-content').scrollTop = 0; });
        const dimensions = await workspace.evaluate(node => ({ width: node.clientWidth, scroll: node.scrollWidth,
            content: node.querySelector('main').clientWidth, contentScroll: node.querySelector('main').scrollWidth }));
        assert(dimensions.scroll <= dimensions.width + 1, JSON.stringify({width, dimensions}));
        assert(dimensions.contentScroll <= dimensions.content + 1, JSON.stringify({width, dimensions}));
        await page.screenshot({path:resolve(root, `../.git/workspace-zh-${width}.png`)});
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({browser:channel,authoring:true,importExport:true,bindings:true,recallRefresh:true,memoryTeardown:true,realMemoryWorker:true,memoryGuard:true,cancelOnce:true,replay:true,pageErrors:errors}));
} finally {
    await browser?.close(); await new Promise(resolve => server.close(resolve));
}
