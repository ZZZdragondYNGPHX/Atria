import { test, expect } from '@playwright/test';
import { createNativeId } from '../../../src/native/identity.js';
import { bindingFor, knowledgeSnapshot } from '../../native/helpers/session-fixture.js';
import { startServer, tearDownServer } from '../_lib/server.js';

import { awaitMainUI } from '../_lib/page.js';
import { seedNativeSessionDataRoot } from './_helpers.js';
let server;

test.beforeAll(async () => {
    const seed = await seedNativeSessionDataRoot({ suffix: 'native-knowledge' });

    server = await startServer({ batchKey: 'generation', scenarioId: 'native-knowledge', useExistingDataRoot: seed.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server); });

test('Native Knowledge prompt evaluation bypasses book settings and commits lifecycle only with the Session Draft', async ({ page }) => {
    test.setTimeout(120000);
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await awaitMainUI(page, server.baseURL);
    const snapshot = knowledgeSnapshot('The lantern reveals the harbor.');
    snapshot.entries[0].discovery = { aliases: ['lantern'] };
    snapshot.entries[0].lifecycle = { sticky: 2, cooldown: 1 };
    snapshot.entries[0].delivery = { position: 'after' };
    const binding = bindingFor(snapshot, 'session');
    const result = await page.evaluate(async ({ snapshot, binding }) => {
        const { nativeProductClient: client } = await import('/scripts/native/product-client.js');
        const { nativeSessionRuntime: runtime } = await import('/scripts/native/session-runtime.js');
        const wi = await import('/scripts/world-info.js');
        const works = await client.listWorks();
        const created = await client.startWork(works[0].package.packageId, { displayTitle: 'Knowledge evaluation', sessionBindings: [binding], sessionKnowledge: [snapshot] });
        await window.Atria.openNativeSession(created.session.sessionId);
        const old = wi.getWorldInfoSettings();
        wi.updateWorldInfoSettings({ ...old, world_info_budget: 0, world_info_budget_cap: 1 });
        try {
            const head = runtime.snapshot.revision.revisionId;
            const evaluation = await wi.getWorldInfoPrompt(['light the lantern'], 2048, true, { trigger: 'normal' });
            const detached = runtime.readState('atri_knowledge_runtime') === null;
            const native = evaluation.nativeKnowledge.entries.find(item => item.knowledgeBindingId === binding.knowledgeBindingId);
            runtime.lastContextPlan = { revisionId: head, target: { kind: 'narrator' }, sourceSelection: { selectedKnowledgeIdentities: [] } };
            const excluded = await runtime.evaluateKnowledge({ messages: ['lantern'] });
            runtime.lastContextPlan = null;
            await runtime.prepareGeneration('normal');
            const committed = await wi.commitWorldInfoEvaluation(evaluation);
            const staged = runtime.readState('atri_knowledge_runtime');
            await runtime.finalizeStoppedGeneration();
            return { after: evaluation.worldInfoAfterEntries, native, detached, committed, staged,
                excluded: excluded.entries.length, oldCandidates: await wi.getSortedEntries(),
                restored: runtime.readState('atri_knowledge_runtime'), sameHead: runtime.snapshot.revision.revisionId === head };
        } finally { wi.updateWorldInfoSettings(old); }
    }, { snapshot, binding });
    expect(result.after).toContain('The lantern reveals the harbor.');
    expect(result.native.knowledgeEntryId).toBe(snapshot.entries[0].knowledgeEntryId);
    expect(result.native).not.toHaveProperty('world'); expect(result.native).not.toHaveProperty('uid');
    expect(result.detached).toBe(true); expect(result.excluded).toBe(0); expect(result.oldCandidates).toEqual([]);
    expect(result.committed.committed).toBe(true); expect(result.staged).toBeTruthy();
    expect(result.restored).toBeNull(); expect(result.sameHead).toBe(true);
});

test('Play previews and names embedded Knowledge before confirmed Library promotion at 390px', async ({ page }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await awaitMainUI(page, server.baseURL);
    const snapshot = knowledgeSnapshot('The harbor closes at dusk.'); snapshot.knowledgeBase.displayName = 'Harbor curfew';
    const binding = bindingFor(snapshot, 'session');
    const sessionId = await page.evaluate(async ({ snapshot, binding }) => {
        const { nativeProductClient: client } = await import('/scripts/native/product-client.js');
        const works = await client.listWorks();
        const created = await client.startWork(works[0].package.packageId, { displayTitle: 'Curfew voyage', sessionBindings: [binding], sessionKnowledge: [snapshot] });
        await window.Atria.openNativeSession(created.session.sessionId); window.Atria.shell.getWorkspaceHost().openPlay();
        return created.session.sessionId;
    }, { snapshot, binding });
    await page.getByRole('button', { name: 'Timeline', exact: true }).click();
    const row = page.locator('[data-atria-embedded-knowledge="' + binding.knowledgeBindingId + '"]');
    await expect(row.getByRole('heading', { name: 'Harbor curfew', exact: true })).toBeVisible();
    await expect(row).toContainText('The harbor closes at dusk.'); await expect(row).toContainText('Curfew voyage');
    await row.getByRole('button', { name: 'Save to my Library', exact: true }).click();
    await row.getByLabel('Knowledge Base name', { exact: true }).fill('My curfew canon');
    await row.getByRole('button', { name: 'Review promotion', exact: true }).click();
    await page.screenshot({ path: info.outputPath('promotion-review-390.png') });
    await row.getByRole('button', { name: 'Confirm save to Library', exact: true }).click();
    await expect(row).toContainText('Saved to Library');
    const result = await page.evaluate(async ({ sessionId, baseId }) => {
        const { nativeProductClient: client } = await import('/scripts/native/product-client.js');
        return { session: await client.getSession(sessionId), library: await client.getKnowledge(baseId) };
    }, { sessionId, baseId: snapshot.knowledgeBase.knowledgeBaseId });
    expect(result.library.knowledgeBase.displayName).toBe('My curfew canon');
    expect(result.library.entries[0].content).toBe('The harbor closes at dusk.');
    expect(result.session.snapshot.knowledge.bindings.find(item => item.knowledgeBindingId === binding.knowledgeBindingId).source.kind).toBe('session');
    await row.getByRole('button', { name: 'Open in Library', exact: true }).click();
    await expect(page.locator('[data-atria-knowledge-detail]').getByRole('heading', { name: 'My curfew canon', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('references navigate owners and Library relationship writes wait for Studio Apply at 390px', async ({ page }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await awaitMainUI(page, server.baseURL);
    const projectId = createNativeId('project');
    const source = { format: 'atria-project-source', schemaVersion: 1, project: { projectId, packageId: createNativeId('package'), displayName: 'Reference adventure', createdAt: 1, updatedAt: 1 }, package: { name: 'Reference adventure', version: '1.0.0', actors: [], capabilities: ['narrative'], permissions: [], entryPoints: [{ entryPointId: createNativeId('entryPoint'), displayName: 'Main', actorIds: [], worldIds: [], knowledgeBindingIds: [] }] }, resources: [], worlds: [], knowledge: [], knowledgeBindings: [], assetFiles: [], dependencies: { worlds: [], knowledge: [], knowledgeBindings: [], assets: [], resources: [] } };
    const seeded = await page.evaluate(async source => {
        const { nativeProductClient: client } = await import('/scripts/native/product-client.js');
        const { nativeStudioClient: studio } = await import('/scripts/native/studio-client.js');
        const world = await client.createWorld('Reference harbor');
        const first = await client.commitWorldRevision(world.worldId, { baseRevisionId: null, content: { baseline: { weather: 'rain' } } });
        const second = await client.commitWorldRevision(world.worldId, { baseRevisionId: first.worldRevisionId, content: { baseline: { weather: 'sun' } } });
        source.dependencies.worlds = [{ worldId: world.worldId, worldRevisionId: first.worldRevisionId }];
        await studio.createProject(source);
        window.Atria.shell.getWorkspaceHost().openLibraryWorld(world.worldId, world.displayName);
        return { world, first, second };
    }, source);
    const library = page.locator('[data-atria-native-library="worlds-knowledge"]');
    await library.locator('summary').filter({ hasText: /^Manage resource$/ }).click();
    await library.getByRole('button', { name: 'Delete World', exact: true }).click();
    const blockers = library.locator('[data-atria-delete-blockers]');
    await expect(blockers).toContainText('Reference adventure');
    await blockers.getByRole('button', { name: 'Open owner', exact: true }).click();
    const studio = page.locator('[data-atria-studio-workspace]');
    const openWorlds = async () => {
        await studio.locator('.atria-studio-mobile-nav').getByRole('button', { name: 'Project', exact: true }).click();
        await studio.locator('.atria-studio-resource-tree').getByRole('button', { name: 'Worlds', exact: true }).click();
    };
    await openWorlds();
    const row = studio.locator('.atria-studio-library-relations__row').filter({ hasText: 'Reference harbor' });
    await row.getByLabel('Exact Library revision', { exact: true }).selectOption(seeded.second.worldRevisionId);
    await row.getByRole('button', { name: 'Update', exact: true }).click();
    const read = () => page.evaluate(async id => {
        const { nativeStudioClient } = await import('/scripts/native/studio-client.js'); return (await nativeStudioClient.getProject(id)).source;
    }, projectId);
    expect((await read()).dependencies.worlds[0].worldRevisionId).toBe(seeded.first.worldRevisionId);
    await studio.getByRole('button', { name: 'Apply ChangeSet', exact: true }).click();
    await expect.poll(async () => (await read()).dependencies.worlds[0].worldRevisionId).toBe(seeded.second.worldRevisionId);
    await expect(studio.getByRole('button', { name: 'Apply ChangeSet', exact: true })).toHaveCount(0);
    await openWorlds(); await row.getByRole('button', { name: 'Fork', exact: true }).click();
    expect((await read()).worlds).toHaveLength(0);
    await studio.getByRole('button', { name: 'Apply ChangeSet', exact: true }).click();
    await expect.poll(async () => (await read()).worlds.length).toBe(1);
    await expect(studio.getByRole('button', { name: 'Apply ChangeSet', exact: true })).toHaveCount(0);
    await openWorlds(); await row.getByRole('button', { name: 'Review detach', exact: true }).click();
    expect((await read()).dependencies.worlds).toHaveLength(1);
    await page.screenshot({ path: info.outputPath('relationship-detach-review-390.png') });
    await studio.getByRole('button', { name: 'Apply ChangeSet', exact: true }).click();
    await expect.poll(async () => (await read()).dependencies.worlds.length).toBe(0);
    expect((await read()).worlds[0].revision.baseline).toEqual({ weather: 'sun' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('World history compares, recreates, promotes and forks exact historical content at 390px', async ({ page }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await awaitMainUI(page, server.baseURL);
    const seeded = await page.evaluate(async () => {
        const { nativeProductClient: client } = await import('/scripts/native/product-client.js');
        const world = await client.createWorld('History harbor');
        const first = await client.commitWorldRevision(world.worldId, { baseRevisionId: null, content: { baseline: { weather: 'rain' } } });
        const second = await client.commitWorldRevision(world.worldId, { baseRevisionId: first.worldRevisionId, content: { baseline: { weather: 'sun' } } });
        window.Atria.shell.getWorkspaceHost().openLibraryWorld(world.worldId, world.displayName);
        return { world, first, second };
    });
    const root = page.locator('[data-atria-native-library="worlds-knowledge"]');
    const row = id => root.locator('[data-atria-revision-id="' + id + '"]');
    await row(seeded.first.worldRevisionId).getByRole('button', { name: 'Inspect revision', exact: true }).click();
    await expect(root).toContainText('Changed · baseline.weather');
    await root.getByRole('button', { name: 'Create revision from this', exact: true }).click();
    await expect(root.getByLabel('baseline.weather', { exact: true })).toHaveValue('rain');
    await root.getByRole('button', { name: 'Review Changes', exact: true }).click();
    await root.getByRole('button', { name: 'Save immutable revision', exact: true }).click();
    await row(seeded.second.worldRevisionId).getByRole('button', { name: 'Inspect revision', exact: true }).click();
    await root.locator('summary').filter({ hasText: /^Make current revision$/ }).click();
    await root.getByRole('button', { name: 'Confirm current revision', exact: true }).click();
    await expect(row(seeded.second.worldRevisionId)).toContainText('Current revision');
    await row(seeded.first.worldRevisionId).getByRole('button', { name: 'Inspect revision', exact: true }).click();
    await root.locator('summary').filter({ hasText: /^Fork into Library$/ }).click();
    await root.getByLabel('New resource name', { exact: true }).fill('Independent history');
    await root.getByRole('button', { name: 'Review fork', exact: true }).click();
    await page.screenshot({ path: info.outputPath('historical-fork-review-390.png') });
    await root.getByRole('button', { name: 'Create fork', exact: true }).click();
    await expect(root.getByRole('heading', { name: 'Independent history', exact: true })).toBeVisible();
    const forkDetail = root.locator('[data-atria-world-detail]');
    await expect(forkDetail).not.toHaveAttribute('data-atria-world-detail', seeded.world.worldId);
    const forkId = await forkDetail.getAttribute('data-atria-world-detail');
    const result = await page.evaluate(async ({ worldId, forkId }) => {
        const { nativeProductClient: client } = await import('/scripts/native/product-client.js');
        return { original: await client.getWorld(worldId), fork: await client.getWorld(forkId) };
    }, { worldId: seeded.world.worldId, forkId });
    expect(result.original.currentRevision.worldRevisionId).toBe(seeded.second.worldRevisionId);
    expect(result.original.revisions).toHaveLength(3);
    expect(result.fork.currentRevision.baseline).toEqual({ weather: 'rain' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Library binding management keeps exact revisions and protects historical references at 390px', async ({ page }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await awaitMainUI(page, server.baseURL);
    const seeded = await page.evaluate(async () => {
        const { nativeProductClient: client } = await import('/scripts/native/product-client.js');
        const base = await client.createKnowledge('Binding canon');
        const first = await client.commitKnowledgeRevision(base.knowledgeBaseId, { baseRevisionId: null, content: { entries: [] } });
        await client.commitKnowledgeRevision(base.knowledgeBaseId, { baseRevisionId: first.knowledgeRevisionId, content: { entries: [] } });
        const world = await client.createWorld('Binding harbor');
        window.Atria.shell.getWorkspaceHost().openLibraryKnowledge(base.knowledgeBaseId, base.displayName);
        return { base, first, world };
    });
    const root = page.locator('[data-atria-knowledge-bindings]');
    await root.getByRole('button', { name: 'Create binding', exact: true }).click();
    await root.getByLabel('Binding name', { exact: true }).fill('Navigator canon');
    await root.getByLabel('Exact Knowledge revision', { exact: true }).selectOption(seeded.first.knowledgeRevisionId);
    await root.getByLabel('Binding mode', { exact: true }).selectOption('override');
    await root.getByLabel('Priority', { exact: true }).fill('-2');
    await root.getByRole('button', { name: 'Add target rule', exact: true }).click();
    await root.getByLabel('Target kind 1', { exact: true }).selectOption('actor');
    await root.getByLabel('Exact target identity 1', { exact: true }).fill('navigator');
    await root.getByLabel('Visible to actor', { exact: true }).check();
    await root.getByRole('button', { name: 'Review binding', exact: true }).click();
    await page.route('**/api/native/product/knowledge-bindings/*', route => route.request().method() === 'PUT' ? route.fulfill({ status: 503, json: { error: 'unavailable' } }) : route.continue());
    await root.getByRole('button', { name: 'Save binding', exact: true }).click();
    await expect(root.getByRole('alert')).toBeVisible();
    await page.unroute('**/api/native/product/knowledge-bindings/*');
    await root.getByRole('button', { name: 'Save binding', exact: true }).click();
    await root.getByRole('button', { name: 'Manage binding', exact: true }).click();
    await expect(root.getByLabel('Exact Knowledge revision', { exact: true })).toHaveValue(seeded.first.knowledgeRevisionId);
    await root.locator('summary').filter({ hasText: /^Attach \/ detach Worlds$/ }).click();
    let row = root.locator('.atri-library-version').filter({ has: page.getByRole('heading', { name: 'Binding harbor', exact: true }) });
    await row.getByRole('button', { name: 'Attach binding', exact: true }).click();
    await row.getByRole('button', { name: 'Save World revision', exact: true }).click();
    await expect(root.getByRole('button', { name: 'Delete binding', exact: true })).toBeDisabled();
    await root.locator('summary').filter({ hasText: /^Attach \/ detach Worlds$/ }).click();
    row = root.locator('.atri-library-version').filter({ has: page.getByRole('heading', { name: 'Binding harbor', exact: true }) });
    await row.getByRole('button', { name: 'Detach binding', exact: true }).click();
    await row.getByRole('button', { name: 'Save World revision', exact: true }).click();
    await expect(root).toContainText('Historical revision');
    await expect(root.getByRole('button', { name: 'Delete binding', exact: true })).toBeDisabled();
    await page.screenshot({ path: info.outputPath('binding-manager-390.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const saved = await page.evaluate(async id => {
        const { nativeProductClient: client } = await import('/scripts/native/product-client.js');
        return (await client.getKnowledge(id)).bindings[0].binding;
    }, seeded.base.knowledgeBaseId);
    expect(saved).toMatchObject({ source: { knowledgeRevisionId: seeded.first.knowledgeRevisionId }, mode: 'override', priority: -2, target: { kind: 'actor', id: 'navigator' }, visibility: ['actor'] });
    await page.evaluate(world => window.Atria.shell.getWorkspaceHost().openLibraryWorld(world.worldId, world.displayName), seeded.world);
    const library = page.locator('[data-atria-native-library="worlds-knowledge"]');
    await library.getByRole('button', { name: 'New revision', exact: true }).click();
    const editor = library.locator('.atri-world-editor');
    await editor.getByLabel('baseline new field', { exact: true }).fill('weather');
    await editor.getByRole('button', { name: 'Add field', exact: true }).first().click();
    await editor.getByLabel('baseline.weather', { exact: true }).fill('rain');
    await editor.getByLabel('Navigator canon', { exact: true }).check();
    await editor.getByRole('button', { name: 'Review Changes', exact: true }).click();
    await expect(library.getByRole('heading', { name: 'Navigator canon', exact: true })).toBeVisible();
    await library.getByRole('button', { name: 'Save immutable revision', exact: true }).click();
    await expect(library.getByRole('button', { name: 'New revision', exact: true })).toBeVisible();
    const composed = await page.evaluate(async world => {
        const { nativeProductClient: client } = await import('/scripts/native/product-client.js');
        return (await client.getWorld(world.worldId)).currentRevision;
    }, seeded.world);
    expect(composed).toMatchObject({ baseline: { weather: 'rain' }, knowledgeBindingIds: [saved.knowledgeBindingId] });
    await library.getByRole('button', { name: 'New revision', exact: true }).click();
    await expect(editor.getByLabel('baseline.weather', { exact: true })).toHaveValue('rain');
    await page.screenshot({ path: info.outputPath('world-composition-390.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

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
            const editor = root.locator(knowledge ? '.atri-knowledge-editor' : '.atri-world-editor');
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
