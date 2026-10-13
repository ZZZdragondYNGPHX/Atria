import express from 'express';
import { randomUUID } from 'node:crypto';
import { createNativeId } from '../../src/native/identity.js';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { setConfigFilePath } from '../../src/util.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { installCognitionFixture } from '../native/helpers/cognition-fixture.js';
import { services as projectServices } from '../agent-intelligence/project-fixture.js';
import { seedGenerationProfiles } from '../native/helpers/generation-fixture.js';

setConfigFilePath(resolve('default/config.yaml'));
const { createHttpGenerationProvider } = await import('../../src/native/adapters/http-generation-provider.js');
const { createNativeGenerationRouter } = await import('../../src/endpoints/native-generation.js');
const h = await makeTempFsEngineHarness(), f = await installCognitionFixture(h, 'limited', { intent: 'inform', sourceIds: ['speech-lines'] }, ({ contract }) => {
    contract.informationRuntime.sources.push({ id: 'speech-lines', kind: 'timeline', semantic: 'narrative', scopeId: 'session', fields: [['content'], ['actorId']] });
    for (const view of contract.informationRuntime.views.filter(view => ['pov', 'player'].includes(view.id))) view.sources.push('speech-lines');
});
let base = f.snapshot;
for (const content of ['这是第一条公开消息。', '这是第二条公开消息。']) base = await f.core.appendTimeline(h.handle, base.session.sessionId,
    { role: 'assistant', actorId: f.actorId, content }, { expectedRevisionId: base.revision.revisionId });
const remoteTasks = new Map(); let remoteEndpoint;
const remote = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const rpc = raw ? JSON.parse(raw) : { method: 'GetAgentCard' };
    if (rpc.method === 'notifications/initialized') { res.writeHead(202); res.end(); return; }
    res.setHeader('Content-Type', 'application/json');
    if (rpc.method === 'GetAgentCard') {
        res.end(JSON.stringify({ supportedInterfaces: [{ url: remoteEndpoint + '/rpc', protocolBinding: 'JSONRPC', protocolVersion: '1.0' }], capabilities: {},
            defaultInputModes: ['text/plain'], defaultOutputModes: ['application/json'], skills: [{ id: 'count' }] })); return;
    }
    let result;
    if (rpc.method === 'initialize') result = { protocolVersion: '2025-11-25', capabilities: { tools: {} } };
    else if (rpc.method === 'tools/list') result = { tools: [{ name: 'count' }] };
    else if (rpc.method === 'tools/call') result = { content: [{ type: 'text', text: 'Public character count' }], structuredContent: { characters: [...rpc.params.arguments.text].length } };
    else if (rpc.method === 'SendMessage') {
        const task = { id: randomUUID(), contextId: randomUUID(), status: { state: 'TASK_STATE_WORKING' }, artifacts: [{ artifactId: 'count', parts: [{ data: { characters: [...rpc.params.message.parts[0].text].length } }] }] };
        remoteTasks.set(task.id, task); result = { task };
    } else {
        result = remoteTasks.get(rpc.params.id); result.status.state = rpc.method === 'GetTask' ? 'TASK_STATE_COMPLETED' : 'TASK_STATE_CANCELED';
    }
    res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result }));
});
await new Promise(done => remote.listen(0, '127.0.0.1', done)); remoteEndpoint = `http://127.0.0.1:${remote.address().port}`;
const seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:1/not-used' });
const mcpConnection = { ...seeded.connection, connectionProfileId: createNativeId('connectionProfile'), providerAdapter: 'provider.mcp', endpoint: remoteEndpoint + '/mcp' };
const a2aConnection = { ...seeded.connection, connectionProfileId: createNativeId('connectionProfile'), providerAdapter: 'provider.a2a', endpoint: remoteEndpoint + '/rpc' };
await seeded.persistence.saveConnectionProfile(h.handle, mcpConnection); await seeded.persistence.saveConnectionProfile(h.handle, a2aConnection);
await seeded.persistence.saveRuntimeRoute(h.handle, { ...seeded.routes[0], executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [seeded.model.modelProfileId],
    mcp: { protocolVersion: '2025-11-25', connectionProfileId: mcpConnection.connectionProfileId, toolNames: ['count'], resourceUris: [], auth: 'none' },
    a2a: { protocolVersion: '1.0', connectionProfileId: a2aConnection.connectionProfileId, skillIds: ['count'], auth: 'none' },
    computeBudget: { maxRequests: 1, maxTokens: 4096, localWork: { maxJobs: 32, maxItems: 10000, maxInputBytes: 16777216 } } } });
const studio = projectServices(h).studio;
const app = express(), publicRoot = resolve('public'); app.use(express.json());
app.get('/api/native/generation/secrets', (_req, res) => res.json([]));
app.use((req, _res, next) => { req.user = { profile: { handle: h.handle } }; next(); });
app.get('/', (_req, res) => res.type('html').send('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/atria-play.css"><body><article id="one">第一条公开消息</article><article id="two">第二条公开消息</article><div id="protocol"></div><div id="workspace"></div></body></html>'));
app.get('/fixture', (_req, res) => res.json({ session: base.session, revision: base.revision, messages: base.timeline.slice(-2).map(row => ({ messageId: row.messageId, actorId: row.actorId })) }));
app.use('/api/native/generation', createNativeGenerationRouter(() => ({ ...seeded, studio, sessionCore: f.core, packageInstaller: f.packageInstaller, providers: { 'provider.openai-compatible': createHttpGenerationProvider() } })));
app.get('/api/native/session/asset/:id', async (req, res) => {
    const value = await f.assetStore.read(h.handle, req.params.id); res.type('audio/wav').send(value.bytes);
});
app.get(/.*/, async (req, res) => {
    const path = resolve(publicRoot, '.' + req.path); if (!path.startsWith(publicRoot + sep)) return res.sendStatus(404);
    try { res.type(req.path.endsWith('.js') ? 'text/javascript' : 'text/css').send(await readFile(path)); } catch { res.sendStatus(404); }
});
const server = createServer(app); await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`, browser = await chromium.launch({ channel: process.env.ATRIA_BROWSER_CHANNEL || 'chromium', headless: true });
try {
    for (const width of [1280, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 850 } }), external = [], errors = [];
        await page.route('**/*', route => { if (route.request().url().startsWith(origin + '/')) return route.continue(); external.push(route.request().url()); return route.abort(); });
        page.on('pageerror', error => errors.push(error.message));
        page.on('response', response => { if (response.url().includes('/speech/') && !response.ok()) void response.text().then(body => console.error('Speech QA HTTP', response.status(), body)); }); await page.goto(origin);
        await page.evaluate(async () => {
            const { mountSpeechControls } = await import('/scripts/native/speech-controls.js');
            const f = await (await fetch('/fixture')).json(); window.snapshot = f;
            window.controls = f.messages.map((message, index) => mountSpeechControls({ document, container: document.getElementById(index ? 'two' : 'one'), runtime: () => ({ snapshot: window.snapshot }), ...message }));
        });
        const first = page.locator('#one'), second = page.locator('#two');
        await first.getByRole('button', { name: 'Read aloud' }).click();
        const select = first.getByRole('combobox', { name: 'Voice' }); await expect(select).toBeVisible().catch(async error => { console.error('Speech QA state', await first.textContent(), errors); throw error; });
        const voice = await select.locator('option').evaluateAll(options => options.find(option => option.textContent.includes('cmn'))?.value ?? options[1].value);
        await select.selectOption(voice); await first.getByRole('button', { name: 'Read aloud' }).click();
        const audio = first.locator('audio'); await expect(audio).toBeVisible();
        assert.equal(await audio.evaluate(node => node.paused && !node.autoplay), true);
        assert.ok((await first.getByRole('button', { name: 'Read aloud' }).boundingBox()).height >= 44);
        await audio.evaluate(async node => { node.muted = true; await node.play(); });
        await expect.poll(() => audio.evaluate(node => node.currentTime)).toBeGreaterThan(0);
        await first.getByRole('button', { name: 'Stop', exact: true }).click(); await expect(audio).toBeHidden();
        assert.equal(await audio.evaluate(node => node.paused), true);
        await second.getByRole('button', { name: 'Read aloud' }).click(); await expect(second.locator('audio')).toBeVisible();
        assert.equal(await second.getByRole('combobox', { name: 'Voice' }).inputValue(), voice);
        await page.evaluate(async () => {
            const { mountProtocolControls } = await import('/scripts/native/protocol-controls.js');
            window.protocol = mountProtocolControls({ document, container: document.getElementById('protocol'), runtime: () => ({ snapshot: window.snapshot }) });
        });
        const protocol = page.locator('#protocol'); await protocol.getByRole('button', { name: 'Load services' }).click();
        await expect(protocol.getByRole('button', { name: 'Run service' })).toBeEnabled();
        const content = protocol.getByRole('combobox', { name: 'Public content' });
        const item = await content.locator('option').evaluateAll(options => options.find(option => option.textContent.includes('这是第一条'))?.value);
        await content.selectOption(item); await protocol.getByRole('combobox', { name: 'Service', exact: true }).selectOption({ label: 'MCP · count' });
        await protocol.getByRole('button', { name: 'Run service' }).click(); await expect(protocol.locator('pre')).toContainText('characters');
        await protocol.getByRole('combobox', { name: 'Service', exact: true }).selectOption({ label: 'A2A · count' });
        await protocol.getByRole('button', { name: 'Run service' }).click(); await expect(protocol.locator('pre')).toContainText('TASK_STATE_WORKING');
        await protocol.getByRole('button', { name: 'Load services' }).click();
        await expect(protocol.getByRole('combobox', { name: 'Saved remote tasks' }).locator('option')).not.toHaveCount(0);
        await protocol.getByRole('button', { name: 'Reconnect' }).click(); await expect(protocol.locator('pre')).toContainText('TASK_STATE_COMPLETED');
        await protocol.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(protocol.locator('pre')).toContainText('TASK_STATE_CANCELED');
        await page.evaluate(() => window.protocol.dispose());
        await page.evaluate(() => { window.snapshot = { ...window.snapshot, revision: { ...window.snapshot.revision, revisionId: 'changed' } }; window.controls.forEach(control => control.refresh()); });
        await expect(second.locator('audio')).toBeHidden();
        assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.evaluate(() => window.controls.forEach(control => control.dispose())); await page.close();
    }
    const editor = await browser.newPage({ viewport: { width: 390, height: 850 } });
    editor.on('pageerror', error => console.error('Editor QA pageerror', error.message));
    await editor.goto(origin);
    const mountEditor = section => editor.evaluate(async section => {
        window.editor?.dispose();
        const { mountNativeRuntimeWorkspace } = await import('/scripts/native/runtime-workspace.js');
        window.editor = mountNativeRuntimeWorkspace({ document, body: document.getElementById('workspace'), section, host: { openRuntimeSection() {}, navigate() {} } });
    }, section);
    await mountEditor('connections');
    const mcp = (await seeded.persistence.listConnectionProfiles(h.handle)).find(item => item.providerAdapter === 'provider.mcp');
    // Profile display names may match; the containing endpoint identifies the intended saved connection.
    await editor.locator('.atri-runtime-row').filter({ hasText: '/mcp' }).getByRole('button', { name: /^Edit/ }).click();
    await expect(editor.getByLabel('Stored Secret', { exact: true })).toBeEnabled();
    await editor.getByLabel('Stored Secret', { exact: true }).selectOption('');
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(editor.getByText('Saved successfully. Exact route references remain pinned.')).toBeVisible().catch(async error => { console.error('Editor QA state', (await editor.locator('body').innerText()).slice(-2000)); throw error; });
    assert.equal((await seeded.persistence.getConnectionProfile(h.handle, mcp.connectionProfileId)).secretRef, undefined);
    await mountEditor('routes');
    await editor.getByRole('button', { name: 'Edit narrator', exact: true }).click();
    await expect(editor.getByLabel('MCP tools', { exact: true })).toHaveValue('count');
    await editor.getByLabel('Reserve required work', { exact: true }).check();
    await editor.getByLabel('Required work requests', { exact: true }).fill('1');
    await editor.getByLabel('Required work token upper bound', { exact: true }).fill('1000');
    await editor.getByLabel('Optional model tasks', { exact: true }).check();
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(editor.getByText('Saved successfully. Exact route references remain pinned.')).toBeVisible().catch(async error => { console.error('Editor QA state', (await editor.locator('body').innerText()).slice(-2000)); throw error; });
    const saved = await seeded.persistence.getRuntimeRoute(h.handle, seeded.routes[0].runtimeRouteId);
    assert.deepEqual(saved.executionPolicy.optionalWork.requiredCompute, { maxRequests: 1, maxTokens: 1000 });
    assert.ok(saved.executionPolicy.optionalWork.roles.includes('model_task'));
    assert.equal(saved.executionPolicy.mcp.toolNames[0], 'count'); assert.equal(saved.executionPolicy.a2a.skillIds[0], 'count');
    await editor.evaluate(() => window.editor.dispose()); await editor.close();
    console.log(JSON.stringify({ stage: 'S28', status: 'browser_passed', widths: [1280, 390], actualWavDecoded: true,
        noAutoplay: true, stop: true, actorVoiceRetained: true, staleAudioCleared: true, realMcpControl: true, connectionAndRouteEditor: true, savedA2aReconnect: true, externalRequests: 0 }));
} finally { await browser.close(); server.closeAllConnections(); await new Promise(done => server.close(done)); remote.closeAllConnections(); await new Promise(done => remote.close(done)); await h.cleanup(); }
