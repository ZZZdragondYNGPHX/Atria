import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { FsEngine } from '../../../src/storage/engines/fs-engine.js';
import { seedGenerationProfiles } from '../../native/helpers/generation-fixture.js';
import { startServer, tearDownServer } from '../_lib/server.js';

import { awaitMainUI } from '../_lib/page.js';
import { createAndOpenNativeSession, nativeRuntimeState, seedNativeSessionDataRoot } from './_helpers.js';

let server; let routes; let sessionStart;

test.beforeAll(async () => {
    const seeded = await seedNativeSessionDataRoot({ suffix: 'native-agent-routes' });
    sessionStart = seeded.start;
    const root = resolve(seeded.dataRoot, seeded.handle);
    const engine = new FsEngine({ directoriesByHandle: () => ({ root, assets: resolve(root, 'assets') }) });
    const resources = await seedGenerationProfiles({ engine, handle: seeded.handle, endpoint: 'https://example.invalid/completions', roles: ['narrator', 'narrator', 'memory', 'memory'] });
    routes = resources.routes;
    routes[0].displayName = 'Writer'; routes[1].displayName = 'Reviewer';
    await resources.persistence.saveRuntimeRoute(seeded.handle, routes[0]);
    await resources.persistence.saveRuntimeRoute(seeded.handle, routes[1]);
    await engine.close();

    server = await startServer({ batchKey: 'generation', scenarioId: 'native-agent-routes', useExistingDataRoot: seeded.dataRoot });
});

test.afterAll(async () => { await tearDownServer(server); });

test('Retrieval creates a stored Secret and a rerank revision without a legacy profile', async ({ page }) => {
    page.setDefaultTimeout(15000);
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await awaitMainUI(page, server.baseURL);
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openRuntimeSection('retrieval'));
    const root = page.locator('[data-atria-runtime-native="retrieval"]');
    await root.getByRole('button', { name: 'New retrieval resource', exact: true }).click();
    await root.getByLabel('Display name', { exact: true }).fill('Native Rerank');
    await root.getByLabel('Retrieval task', { exact: true }).selectOption('rerank');
    await root.getByLabel('Provider', { exact: true }).selectOption('cohere');
    await root.getByLabel('Model', { exact: true }).fill('rerank-v3.5');
    await root.getByLabel('Endpoint URL', { exact: true }).fill('https://example.invalid/v2');
    await root.getByText('Create stored Secret', { exact: true }).click();
    await root.getByLabel('Secret label', { exact: true }).fill('Retrieval test');
    await root.getByLabel('API key', { exact: true }).fill('fixture-only-value');
    await root.getByRole('button', { name: 'Store Secret', exact: true }).click();
    await expect(root).toContainText('Secret stored.');
    await root.getByRole('button', { name: 'Save exact revision', exact: true }).click();
    await expect(root.locator('.atri-runtime-row').filter({ hasText: 'Native Rerank' })).toBeVisible();
    const profiles = await page.evaluate(async () => (await import('/scripts/native/retrieval-client.js')).listRetrievalProfiles());
    const profile = profiles.find(item => item.displayName === 'Native Rerank');
    expect(profile).toMatchObject({ mode: 'rerank', source: 'cohere', secretRef: { secretId: expect.any(String) } });
    expect(JSON.stringify(profile)).not.toContain('fixture-only-value');
});

test('Runtime retrieval creates immutable revisions and Memory keeps exact selections at 320px', async ({ page }, info) => {
    page.setDefaultTimeout(15000);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await awaitMainUI(page, server.baseURL);
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openRuntimeSection('retrieval'));
    const root = page.locator('[data-atria-runtime-native="retrieval"]');
    await root.getByRole('button', { name: 'New retrieval resource', exact: true }).click();
    await root.getByLabel('Display name', { exact: true }).fill('Local Memory');
    await root.getByLabel('Provider', { exact: true }).selectOption('webllm');
    await root.getByLabel('Model', { exact: true }).fill('local-model-a');
    await expect(root.getByLabel('Stored Secret', { exact: true })).toBeHidden();
    await root.getByRole('button', { name: 'Back to retrieval', exact: true }).focus();
    await page.keyboard.press('Shift+Tab');
    await expect(root.getByRole('button', { name: 'Save exact revision', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(root.getByRole('button', { name: 'Back to retrieval', exact: true })).toBeFocused();
    await page.screenshot({ path: info.outputPath('retrieval-editor-320.png') });
    let releaseSave; const pendingSave = new Promise(resolve => { releaseSave = resolve; });
    await page.route('**/api/native/generation/retrieval', async route => { if (route.request().method() === 'POST') await pendingSave; await route.continue(); });
    await root.getByRole('button', { name: 'Save exact revision', exact: true }).click();
    await expect(root.getByRole('button', { name: 'Back to retrieval', exact: true })).toBeDisabled();
    await expect(root.getByLabel('Display name', { exact: true })).toBeDisabled();
    releaseSave();
    await expect(root.locator('.atri-runtime-row').filter({ hasText: 'Local Memory' })).toHaveCount(1);
    await root.locator('.atri-runtime-row').filter({ hasText: 'Local Memory' }).getByRole('button', { name: 'Create revision', exact: true }).click();
    await root.getByLabel('Model', { exact: true }).fill('local-model-b');
    await root.getByRole('button', { name: 'Save exact revision', exact: true }).click();
    await expect(root.locator('.atri-runtime-row').filter({ hasText: 'Local Memory' })).toHaveCount(2);
    const profiles = await page.evaluate(async () => (await import('/scripts/native/retrieval-client.js')).listRetrievalProfiles());
    const first = profiles.find(item => item.model === 'local-model-a');
    const second = profiles.find(item => item.model === 'local-model-b');
    expect(first.retrievalProfileId).toBe(second.retrievalProfileId); expect(first.revision).not.toBe(second.revision);
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openAgentSection('memory'));
    const workspace = page.locator('.atria-memory-workspace');
    await workspace.getByRole('button', { name: 'Maintenance', exact: true }).click();
    const form = workspace.locator('form').filter({ has: page.getByRole('heading', { name: 'Memory retrieval', exact: true }) });
    const ref = { scope: 'player', retrievalProfileId: first.retrievalProfileId, revision: first.revision };
    await expect(form.getByLabel('Embedding revision', { exact: true })).toBeEnabled();
    await form.getByLabel('Embedding revision', { exact: true }).selectOption(JSON.stringify(ref));
    await form.getByRole('button', { name: 'Save Memory retrieval', exact: true }).click();
    await expect(form).toContainText('Memory retrieval saved');
    expect(await page.evaluate(() => window.Atria.getContext().capabilitySettings.memory_graph.nativeRetrieval)).toEqual({ embed: ref });
    await form.getByRole('button', { name: 'Refresh retrieval resources', exact: true }).click();
    await expect(form.getByLabel('Embedding revision', { exact: true })).toHaveValue(JSON.stringify(ref));
    await page.screenshot({ path: info.outputPath('memory-retrieval-320.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Memory saves task-specific Native routes from its existing workspace', async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await awaitMainUI(page, server.baseURL);
    await page.evaluate(() => Object.assign(window.Atria.getContext().capabilitySettings.memory_graph, { recallApiPresetName: 'obsolete', extractPresetName: 'obsolete', ragRewriteLlmPresetName: 'obsolete' }));
    await page.evaluate(() => window.Atria.shell.getWorkspaceHost().openAgentSection('memory'));
    const workspace = page.locator('.atria-memory-workspace');
    await workspace.getByRole('button', { name: 'Maintenance', exact: true }).click();
    const form = workspace.locator('form').filter({ has: page.getByRole('heading', { name: 'Memory Runtime Routes', exact: true }) });
    const tasks = ['Extraction route', 'Schema assistance route'];
    for (const [index, task] of tasks.entries()) {
        const select = form.getByLabel(task, { exact: true }); await expect(select).toBeEnabled();
        await expect(select.locator('option', { hasText: 'Writer' })).toHaveCount(0);
        await select.selectOption(routes[2 + index % 2].runtimeRouteId);
    }
    await form.getByRole('button', { name: 'Save Memory routes', exact: true }).click();
    await expect(form).toContainText('Memory routes saved');
    const selected = await page.evaluate(() => window.Atria.getContext().capabilitySettings.memory_graph.nativeRoutes);
    expect(Object.values(selected)).toEqual([2, 3].map(index => ({ scope: 'player', runtimeRouteId: routes[index].runtimeRouteId })));
    const settings = await page.evaluate(() => window.Atria.getContext().capabilitySettings.memory_graph);
    for (const key of ['recallApiPresetName', 'extractPresetName', 'ragRewriteLlmPresetName']) expect(settings).not.toHaveProperty(key);
    await workspace.getByText('Advanced memory settings and maintenance', { exact: true }).click();
    await workspace.getByText('Extraction and organization', { exact: true }).click();
    await expect(workspace.locator('.workspace-hint:visible').filter({ hasText: 'Configure this task’s Memory Runtime Route in Maintenance.' })).toBeVisible();
    await expect(workspace.locator('select[id$="_api_preset"], select[id$="_llm_preset"], #atria_rpg_memory_embedding_profile, #atria_rpg_memory_rerank_profile')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('memory-native-routes-390.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test('Agents saves distinct exact node Model routes at 320px', async ({ page }, info) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await awaitMainUI(page, server.baseURL);
    const created = await page.evaluate(async routes => {
        const { createOrchestrationClient } = await import('/scripts/native/orchestration/client.js');
        const { starterDocument, newNodeId, newEdgeId } = await import('/scripts/native/orchestration/plan-draft.js');
        const client = createOrchestrationClient(), doc = starterDocument('Exact independent node routes');
        const pins = await Promise.all(routes.map((route, index) => client.inspectDependency({ pinId: index ? 'reviewer.model' : 'writer.model', port: 'model',
            resourceRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId } })));
        const writer = doc.definition.nodes.find(node => node.kind === 'agent');
        const output = doc.definition.nodes.find(node => node.kind === 'output');
        writer.label = 'Writer'; writer.dependencyPinIds = pins.map(pin => pin.pinId); writer.policy.agentPinId = null;
        const reviewer = { ...structuredClone(writer), nodeId: newNodeId(), label: 'Reviewer', inputs: [{ name: 'in', type: 'text', required: true }] };
        doc.definition.nodes.splice(1, 0, reviewer); doc.dependencyPins = pins;
        doc.definition.edges = [{ ...doc.definition.edges[0], to: { nodeId: reviewer.nodeId, port: 'in' } },
            { ...doc.definition.edges[0], edgeId: newEdgeId(), from: { nodeId: reviewer.nodeId, port: 'out' }, to: { nodeId: output.nodeId, port: 'in' } }];
        const { outcome } = await client.createPlan(doc);
        Atria.shell.getNavigation().navigate('agents', { child: { id: 'plans:' + outcome.planId, label: doc.viewState.title, kind: 'detail' } });
        return { planId: outcome.planId, pins };
    }, routes.slice(0, 2));
    const workspace = page.locator('[data-atria-domain-workspace=agents]');
    await workspace.getByRole('button', { name: 'List', exact: true }).click();
    const inspector = page.locator('.atria-orch-inspector');
    for (const [index, label] of ['Writer', 'Reviewer'].entries()) {
        await workspace.getByRole('list', { name: 'Nodes', exact: true }).locator('.atria-orch-row__main').filter({ hasText: label }).click();
        const select = inspector.getByLabel('Model pin', { exact: true });
        await expect(select).toBeEnabled();
        await expect(select.locator('option', { hasText: 'memory' })).toHaveCount(0);
        await select.selectOption(created.pins[index].pinId);
        await expect(select).toHaveValue(created.pins[index].pinId);
        await page.screenshot({ path: info.outputPath('agent-route-' + index + '-320.png') });
        await page.keyboard.press('Escape');
        await workspace.getByRole('button', { name: 'Save draft', exact: true }).click();
        await expect(workspace.locator('.atria-orch-editor')).toHaveAttribute('data-atria-draft-dirty', 'false');
    }
    const saved = await page.evaluate(async planId => {
        const { createOrchestrationClient } = await import('/scripts/native/orchestration/client.js');
        return createOrchestrationClient().getPlan(planId);
    }, created.planId);
    const agents = saved.definition.nodes.filter(node => node.kind === 'agent');
    expect(agents.map(node => saved.dependencyPins.find(pin => pin.pinId === node.policy.agentPinId).resourceRef))
        .toEqual(routes.slice(0, 2).map(route => ({ scope: 'player', runtimeRouteId: route.runtimeRouteId })));
    expect(saved.dependencyPins).toEqual(created.pins);
    await workspace.getByRole('list', { name: 'Nodes', exact: true }).locator('.atria-orch-row__main').filter({ hasText: 'Writer' }).click();
    await expect(inspector.getByLabel('Model pin', { exact: true })).toHaveValue(created.pins[0].pinId);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('B3 Native Plan rejects invalid Source without mutation and saves the retained valid draft through the Native authority', async ({ page }, info) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await awaitMainUI(page, server.baseURL);
    const baseline = await page.evaluate(async () => {
        const { createOrchestrationClient } = await import('/scripts/native/orchestration/client.js');
        const { starterDocument } = await import('/scripts/native/orchestration/plan-draft.js');
        const client = createOrchestrationClient();
        const { outcome } = await client.createPlan(starterDocument('B3 Native Source'));
        Atria.shell.getNavigation().navigate('agents', { child: { id: 'plans:' + outcome.planId, label: outcome.viewState.title, kind: 'detail' } });
        return outcome;
    });
    const rejected = await page.evaluate(async baseline => {
        const { createOrchestrationClient } = await import('/scripts/native/orchestration/client.js');
        const client = createOrchestrationClient(), definition = structuredClone(baseline.definition);
        definition.nodes[0].kind = 'invalid-native-node-kind';
        let failure = null;
        try { await client.savePlan({ planId: baseline.planId, expectedDraftVersion: baseline.draftVersion, expectedDefinitionHash: baseline.definitionHash,
            definition, dependencyPins: baseline.dependencyPins, viewState: baseline.viewState }); }
        catch (error) { failure = { status: error.status, code: error.code }; }
        return { failure, actual: await client.getPlan(baseline.planId) };
    }, baseline);
    expect(rejected.failure).toMatchObject({ status: 400, code: expect.any(String) });
    expect(rejected.actual).toEqual(baseline);
    const workspace = page.locator('[data-atria-domain-workspace=agents]');
    await workspace.getByRole('button', { name: 'List', exact: true }).click();
    await workspace.getByRole('list', { name: 'Nodes', exact: true }).locator('.atria-orch-row__main').first().click();
    const inspector = page.locator('.atria-orch-inspector');
    await inspector.getByLabel('Label', { exact: true }).fill('B3 exact Source saved');
    await page.keyboard.press('Tab'); await page.keyboard.press('Escape');
    await expect(inspector).toBeHidden();
    await workspace.getByRole('button', { name: 'Open Inspector', exact: true }).click();
    await expect(inspector.getByLabel('Label', { exact: true })).toHaveValue('B3 exact Source saved');
    await page.screenshot({ path: info.outputPath('b3-plan-source-320.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await workspace.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(workspace.locator('.atria-orch-editor')).toHaveAttribute('data-atria-draft-dirty', 'false');
    const saved = await page.evaluate(async planId => {
        const { createOrchestrationClient } = await import('/scripts/native/orchestration/client.js');
        return createOrchestrationClient().getPlan(planId);
    }, baseline.planId);
    const next = structuredClone(baseline.definition); next.nodes[0].label = 'B3 exact Source saved';
    expect(saved.definition).toEqual(next); expect(saved.dependencyPins).toEqual(baseline.dependencyPins);
    expect(saved.draftVersion).toBe(baseline.draftVersion + 1); expect(saved.definitionHash).not.toBe(baseline.definitionHash);
});

test('Native browser retrieval offers bundled embedding models without extension inference globals', async ({ page }, info) => {
    page.setDefaultTimeout(15000);
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.route('**/api/horde/status', route => route.fulfill({ json: { ok: false } }));
    await awaitMainUI(page, server.baseURL);
    await page.evaluate(() => Atria.shell.getWorkspaceHost().openRuntimeSection('retrieval'));
    const root = page.locator('[data-atria-runtime-native="retrieval"]');
    await root.getByRole('button', { name: 'New retrieval resource', exact: true }).click();
    await root.getByLabel('Provider', { exact: true }).selectOption('webllm');
    await root.getByRole('button', { name: 'Browse browser models', exact: true }).click();
    const choices = root.getByLabel('Browser embedding model', { exact: true });
    await expect(choices).toBeVisible({ timeout: 30000 });
    await expect(choices.locator('option').nth(1)).toHaveAttribute('value', /.+/);
    const id = await choices.locator('option').nth(1).getAttribute('value');
    await choices.selectOption(id);
    await expect(root.getByLabel('Model', { exact: true })).toHaveValue(id);
    await expect(root.getByText('The model downloads when retrieval first runs. This browser must support WebGPU.', { exact: true })).toBeVisible();
    await expect(root.getByLabel('Endpoint URL', { exact: true })).toBeHidden();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: info.outputPath('native-browser-models.png'), fullPage: true });
});


test('A3 Native Memory rejects a reset confirmed after switching Session without mutating either Source', async ({ page }, info) => {
    test.setTimeout(150000); await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.route('**/api/horde/**', route => route.fulfill({ json: [] }));
    await awaitMainUI(page, server.baseURL);
    const first = await createAndOpenNativeSession(page, sessionStart);
    expect(await nativeRuntimeState(page)).toMatchObject({ sessionId: first.sessionId, revisionId: first.revisionId, history: false });
    await page.evaluate(() => Atria.shell.getWorkspaceHost().openAgentSection('memory'));
    const memory = page.locator('.atria-memory-workspace');
    await memory.getByRole('button', { name: 'Maintenance', exact: true }).click();
    await expect(memory.getByRole('button', { name: 'Reset current chat memory', exact: true })).toBeEnabled();
    // Use the real workspace port so the exact rejected result remains observable
    // even when changing Session disposes the old workspace's UI operation handler.
    await page.evaluate(() => {
        const context = Atria.getContext();
        const ports = context.getCapabilityApi('memory-graph').getWorkspacePorts(context);
        window.memoryResetAttempt = ports.resetGraph().then(value => ({ ok: true, value }), error => ({ ok: false, message: error.message }));
    });
    const popup = page.locator('dialog.popup[open]').last(); await expect(popup).toBeVisible();
    let mutations = 0;
    page.on('request', req => { if (/\/api\/native\/session\/(?:state|states)/.test(req.url()) && req.method() !== 'GET') mutations++; });
    const second = await createAndOpenNativeSession(page, sessionStart);
    await popup.locator('.popup-button-ok').click();
    expect(await page.evaluate(() => window.memoryResetAttempt)).toEqual({ ok: false, message: 'The current Session changed. Reopen Memory before resetting.' });
    expect(mutations).toBe(0);
    expect(await nativeRuntimeState(page)).toMatchObject({ sessionId: second.sessionId, revisionId: second.revisionId, history: false });
    await page.evaluate(() => Atria.shell.getWorkspaceHost().openAgentSection('runs'));
    const workspace = page.locator('[data-atria-domain-workspace=agents]');
    const type = workspace.getByLabel('Source type', { exact: true });
    expect(await type.locator('option').evaluateAll(options => options.map(option => option.value)))
        .toEqual(['', 'native_session', 'project', 'rp_chat']);
    await type.selectOption('native_session');
    await workspace.getByLabel('Session', { exact: true }).selectOption(second.sessionId);
    await expect(workspace).toContainText('No Runs for this source');
    await expect(workspace.getByRole('button', { name: 'Request cancel…', exact: true })).toBeHidden();
    // Confirm that returning to the original Session finds the same Source revision.
    await page.evaluate(async sessionId => { const mod = await import('/script.js'); await mod.openNativeSession(sessionId); }, first.sessionId);
    expect(await nativeRuntimeState(page)).toMatchObject({ sessionId: first.sessionId, revisionId: first.revisionId });
    expect(mutations).toBe(0);
    await page.screenshot({ path: info.outputPath('a3-agents-session-390.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
