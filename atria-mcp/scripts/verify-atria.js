// Opt-in real-product smoke. Starts the configured Atria checkout with fresh,
// disposable data; never opens or copies the developer's personal data directory.
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, readFile, writeFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { redact } from '../src/policy.js';
import { SourceCatalog } from '../src/catalog.js';
import { readSourceIdentity, compareSource } from '../src/provenance.js';
import { randomUUID } from 'node:crypto';
import { fingerprint } from '../src/kernel.js';
import { request as playwrightRequest } from 'playwright';

const toolRoot = fileURLToPath(new URL('../', import.meta.url));
const repo = process.env.ATRIA_REPO;
if (!repo) throw new Error('Set ATRIA_REPO to the current product checkout with dependencies installed.');
const catalog = await new SourceCatalog(resolve(repo)).init();
const scratch = await mkdtemp(join(tmpdir(), 'atria-mcp-runtime-'));
const artifacts = join(toolRoot, '.artifacts', 'atria-' + Date.now());
await mkdir(artifacts, { recursive: true });
const reserve = createServer();
await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
const port = reserve.address().port;
await new Promise(resolve => reserve.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const config = join(scratch, 'config.yaml');
const policyPath = join(scratch, 'mcp-policy.json');
const mutationActions = ['build.package.create', 'package.install.review', 'package.install', 'build.project.create', 'build.project.delete.owned', 'session.delete', 'session.delete.owned', 'work.delete', 'library.revision.delete', 'build.frontend.evaluate', 'build.change.apply', 'build.preview.close', 'build.simulate', 'session.rename', 'session.save', 'session.restore', 'chat.branch.fork', 'chat.branch.switch', 'work.start', 'settings.patch', 'connection.update', 'library.world.revision.create'];
await writeFile(policyPath, JSON.stringify({ version: 1, actionIds: mutationActions }));
await writeFile(config, await readFile(join(catalog.root, 'default', 'config.yaml')));
let server;
let client;
let log = '';
let stderr = '';
async function stopServer() {
    if (!server || server.exitCode !== null) return;
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill(); await Promise.race([exited, delay(10000)]);
    if (server.exitCode === null) { server.kill('SIGKILL'); await exited; }
}
async function startServer() {
    server = spawn(process.execPath, [join(catalog.root, 'server.js'), `--port=${port}`,
        `--dataRoot=${join(scratch, 'data')}`, `--configPath=${config}`, '--browserLaunchEnabled=false',
        '--listen=false', '--whitelist=127.0.0.1', '--disableCsrf=false'], {
        cwd: catalog.root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout.on('data', bytes => { log = (log + bytes).slice(-150000); });
    server.stderr.on('data', bytes => { log = (log + bytes).slice(-150000); });
    const deadline = Date.now() + 180000;
    while (true) {
        if (server.exitCode !== null) throw new Error(`Atria exited (${server.exitCode}): ${log.slice(-8000)}`);
        try { if ((await fetch(origin + '/csrf-token', { signal: AbortSignal.timeout(1000) })).ok) break; } catch { /* readiness */ }
        if (Date.now() > deadline) throw new Error(`Atria readiness timed out: ${log.slice(-8000)}`);
        await delay(500);
    }
}
try {
    await startServer();
    const bundle = await fetch(origin + '/lib.core.bundle.js', { signal: AbortSignal.timeout(15000) });
    assert.equal(bundle.status, 200, 'Real frontend bundle must be available before claiming a product UI smoke');
    await bundle.body?.cancel();
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('ATRIA_')));
    const transport = new StdioClientTransport({ command: process.execPath,
        args: [join(toolRoot, 'src', 'cli.js'), '--repo', catalog.root, '--url', origin, '--policy', policyPath, ...(process.env.ATRIA_TEST_BROWSER_CHANNEL ? ['--browser-channel', process.env.ATRIA_TEST_BROWSER_CHANNEL] : [])], env, stderr: 'pipe' });
    transport.stderr.on('data', bytes => { stderr += bytes; });
    client = new Client({ name: 'atria-real-product-smoke', version: '1.0.0' }, { capabilities: { elicitation: { form: {} } } });
    const approvalRequests = [];
    client.setRequestHandler(ElicitRequestSchema, async request => {
        const review = JSON.parse(request.params.message.slice(request.params.message.indexOf('\n') + 1));
        assert.ok(mutationActions.includes(review.action), 'Only explicitly configured disposable-fixture operations');
        assert.equal(request.params.mode, 'form'); approvalRequests.push({ action: review.action, binding: review.binding });
        // Deterministic test-client response exercises the protocol, not a claim of human UI approval.
        return { action: 'accept', content: { authorize: true, uses: 1 } };
    });
    await client.connect(transport);
    const call = async (name, args = {}) => {
        const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 90000 });
        if (result.isError) {
            for (const diagnosticTool of ['atri_browser_observe', 'atri_browser_diagnostics', 'atri_browser_screenshot']) {
                try {
                    const evidence = await client.callTool({ name: diagnosticTool, arguments: {} });
                    const image = evidence.content?.find(item => item.type === 'image');
                    if (image) await writeFile(join(artifacts, 'failure.jpg'), Buffer.from(image.data, 'base64'));
                    else await writeFile(join(artifacts, 'failure-' + diagnosticTool + '.json'), JSON.stringify(evidence, null, 2));
                } catch { /* Preserve the original failure. */ }
            }
            throw new Error(`${name}: ${JSON.stringify(result)}`);
        }
        return result;
    };
    const json = result => JSON.parse(result.content.find(item => item.type === 'text').text);
    const status = json(await call('atri_status'));
    assert.equal(status.runtimeSourceMatch, 'EXACT', JSON.stringify(status.provenance));
    assert.equal(status.provenance.browserFreshness, 'UNVERIFIABLE');
    const routes = json(await call('atri_api', { operation: 'list', limit: 100 }));
    const refs = json(await call('atri_reference'));
    assert.equal(refs.status, 200);
    assert.ok(refs.data.references.some(item => item.id === 'browser-extension-sdk'));
    const reference = json(await call('atri_reference', { id: 'browser-extension-sdk', limit: 2000 }));
    assert.equal(reference.status, 200);
    const projects = json(await call('atri_api', { operation: 'read', path: '/api/native/studio/projects' }));
    assert.equal(projects.status, 200);
    const read = async (action, input = {}) => {
        const result = json(await call('atri_read', { action, input }));
        assert.equal(result.ok, true, action + ': ' + JSON.stringify(result));
        return result.data;
    };
    const semantic = {};
    for (const action of ['session.list', 'build.project.list', 'library.list', 'work.list', 'generation.configuration', 'connection.secrets', 'settings.catalog', 'diagnostics.modules', 'diagnostics.incidents', 'diagnostics.startup.list']) {
        semantic[action] = await read(action);
    }
    // Test setup uses the normal product APIs only against this owned disposable
    // runtime. No mutation tool is added to MCP or used by the tested READ surface.
    const setup = await playwrightRequest.newContext();
    const post = async (path, data) => {
        const csrf = await setup.get(origin + '/csrf-token');
        const { token } = await csrf.json(); await csrf.dispose();
        const response = await setup.post(origin + path, { data, headers: { 'x-csrf-token': token } });
        try { const value = await response.json(); assert.equal(response.ok(), true, path + ': ' + JSON.stringify(value)); return value; }
        finally { await response.dispose(); }
    };
    try {
        const uid = prefix => prefix + '_' + randomUUID().replaceAll('-', '');
        const projectId = uid('project'), packageId = uid('pkg'), entryPointId = uid('entry');
        const source = { format: 'atria-project-source', schemaVersion: 1,
            project: { projectId, packageId, displayName: 'MCP Read Fixture', createdAt: 10, updatedAt: 10 },
            package: { name: 'MCP Read Fixture', version: '1.0.0', actors: [], capabilities: ['narrative', 'game-runtime'], permissions: [],
                runtime: { experience: { mode: 'full', frontend: { kind: 'native', version: 3, source: 'frontend/index.json' } } },
                entryPoints: [{ entryPointId, displayName: 'Main', actorIds: [], worldIds: [], knowledgeBindingIds: [] }] },
            worlds: [], knowledge: [], knowledgeBindings: [], dependencies: { worlds: [], knowledge: [], knowledgeBindings: [] }, assetFiles: [] };
        const files = [{ path: 'frontend/index.json', content: JSON.stringify({ format: 'atria-frontend-source', version: 3, primaryView: 'main', views: [{ id: 'main', root: 'Main', surface: 'app.root' }], components: [{ id: 'Main', source: 'Main.aui' }] }) },
            { path: 'frontend/Main.aui', content: '<template><main node-id="root"><p node-id="message">MCP READ Fixture</p></main></template>' }];
        await post('/api/native/studio/projects', { source, files });
        const revision = await read('build.project.revision', { projectId });
        const baseRevision = revision.revision;
        semantic.frontend = await read('build.frontend.inspect', { projectId, baseRevision });
        assert.equal(semantic.frontend.status, 'passed');
        const stale = json(await call('atri_read', { action: 'build.frontend.inspect', input: { projectId, baseRevision: 'stale' } }));
        assert.equal(stale.ok, false); assert.equal(stale.status, 409);
        semantic.source = await read('build.source.read', { projectId, path: 'frontend/Main.aui' });
        assert.match(semantic.source.content, /MCP READ Fixture/);
        semantic.validation = await read('build.validate', { projectId });
        semantic.preflight = await read('build.preflight', { projectId, baseRevision });
        await read('build.history', { projectId });
        await read('build.resource.closure', { projectId });
        const preview = await post(`/api/native/studio/projects/${projectId}/preview`, { baseRevision });
        semantic.preview = await read('build.preview.get', { previewId: preview.preview.previewId });
        await read('build.preview.list', { projectId });
        const built = await post(`/api/native/studio/projects/${projectId}/build`, { baseRevision });
        await post('/api/native/product/packages/install', { data: built.data, grantedPermissions: [] });
        const started = await post(`/api/native/product/works/${packageId}/start`, { entryPointId });
        const sessionId = started.session.sessionId;
        semantic.session = await read('session.get', { sessionId });
        await read('chat.read', { sessionId }); await read('chat.history', { sessionId }); await read('chat.branches', { sessionId });
        await read('session.saves', { sessionId }); await read('session.runtime', { sessionId });
        const packageVersionId = semantic.session.session.packageVersionId;
        await read('package.version.get', { packageId, packageVersionId });
        await read('library.exact', { ref: { resourceType: 'core.package', resourceId: packageId, revision: packageVersionId } });
        assert.equal((await read('build.project.revision', { projectId })).revision, baseRevision, 'READ did not mutate Project source');
        semantic.mutations = [];
        const mutate = async (risk, action, input) => {
            const result = json(await call('atri_' + risk, { action, input }));
            assert.equal(result.receipt.status, 'succeeded', JSON.stringify(result));
            assert.equal(result.receipt.provenance.serverBootId, status.provenance.server.serverBootId);
            semantic.mutations.push(result.receipt); return result;
        };
        const node = semantic.frontend.entries.find(row => row.kind === 'node' && row.id === 'message');
        assert.ok(node);
        const workspace = { projectId, baseRevision, workspaceId: 'workspace.mcp-verification', origin: { kind: 'plugin', id: 'atria-mcp' }, operations: [{
            operationId: 'operation.mcp-patch', operationType: 'frontend.patch', origin: { kind: 'plugin', id: 'atria-mcp' },
            target: { resourceType: 'core.project', resourceId: projectId }, input: { kind: 'node', id: 'message', componentId: 'Main', contentHash: node.contentHash, field: 'text', value: 'MCP REVIEWED Fixture' } }] };
        const inspected = json(await call('atri_read', { action: 'build.change.inspect', input: { workspace } }));
        assert.equal(inspected.ok, true);
        const evaluated = await mutate('interact', 'build.frontend.evaluate', { workspace });
        assert.equal((await read('build.project.revision', { projectId })).revision, baseRevision, 'Evaluation restored source');
        assert.match((await read('build.source.read', { projectId, path: 'frontend/Main.aui' })).content, /MCP READ Fixture/);
        const applied = await mutate('mutate', 'build.change.apply', { workspace, evaluationReceiptId: evaluated.receipt.receiptId });
        assert.match((await read('build.source.read', { projectId, path: 'frontend/Main.aui' })).content, /MCP REVIEWED Fixture/);
        const staleApply = await client.callTool({ name: 'atri_mutate', arguments: { action: 'build.change.apply', input: { workspace, evaluationReceiptId: evaluated.receipt.receiptId } } });
        assert.equal(staleApply.isError, true);
        const pv = evaluated.receipt.evaluation.preview;
        await mutate('interact', 'build.preview.close', { previewId: pv.previewId, packageVersionId: pv.packageVersionId });
        const afterRevision = applied.result.data.changeSet.resultingRevision.revision ?? applied.result.data.changeSet.resultingRevision;
        await mutate('interact', 'build.simulate', { projectId, baseRevision: afterRevision, scenario: { schemaVersion: 1, steps: [] } });
        await mutate('mutate', 'session.rename', { sessionId, expectedDisplayTitle: semantic.session.session.displayTitle ?? null, displayTitle: 'MCP Authorized Session' });
        let snapshot = await read('session.snapshot', { sessionId });
        const saved = await mutate('mutate', 'session.save', { sessionId, expectedRevisionId: snapshot.revision.revisionId, displayName: 'MCP save' });
        const fork = await mutate('mutate', 'chat.branch.fork', { sessionId, expectedRevisionId: snapshot.revision.revisionId, revisionId: snapshot.revision.revisionId });
        snapshot = await read('session.snapshot', { sessionId });
        await mutate('mutate', 'session.restore', { sessionId, expectedRevisionId: snapshot.revision.revisionId, saveId: saved.result.data.saveId });
        const ownedSession = await mutate('mutate', 'work.start', { packageId, packageVersionId, entryPointId, displayTitle: 'MCP Work start' });
        await post('/api/settings/patch', { operations: [{ op: 'add', path: '/font_scale', value: 1 }] });
        await mutate('mutate', 'settings.patch', { path: 'font_scale', expected: 1, value: 1.2 });
        assert.equal((await read('settings.get', { path: 'font_scale' })).value, 1.2);
        const world = await post('/api/native/product/worlds', { displayName: 'MCP Library world' });
        const createdRevision = await mutate('mutate', 'library.world.revision.create', { resourceId: world.worldId, baseRevisionId: null, content: { baseline: { weather: 'rain' } } });
        await mutate('mutate', 'library.world.revision.create', { resourceId: world.worldId, baseRevisionId: createdRevision.result.data.worldRevisionId, content: { baseline: { weather: 'sun' } } });
        const connectionProfileId = uid('conn');
        const connection = { schemaVersion: 1, connectionProfileId, scope: 'player', displayName: 'MCP Unused Connection', providerAdapter: 'provider.openai-compatible',
            transport: 'transport.http-json', endpoint: 'https://example.invalid/v1', networkPolicy: {}, secretRef: { secretId: 'mcp-unused', scope: 'player' }, options: {} };
        const createdConnection = await mutate('mutate', 'connection.update', { resourceId: connectionProfileId, expectedFingerprint: fingerprint(null), value: connection });
        await mutate('mutate', 'connection.update', { resourceId: connectionProfileId, expectedFingerprint: createdConnection.result.receiptEvidence.after.fingerprint, value: { ...connection, displayName: 'MCP Reviewed Connection' } });
        assert.ok(fork.receipt.after.branchId);
        semantic.approvalProtocol = { mechanism: 'MCP form elicitation; deterministic test-client acceptance, not human UX proof', requests: approvalRequests };
        const csrfForBoot = await setup.get(origin + '/csrf-token'); const bootCsrf = (await csrfForBoot.json()).token; await csrfForBoot.dispose();
        const rejectedBoot = await setup.post(origin + `/api/native/product/sessions/${sessionId}/save`, { data: {}, headers: { 'x-csrf-token': bootCsrf, 'x-atria-expected-server-boot-id': randomUUID() } });
        assert.equal(rejectedBoot.status(), 409); await rejectedBoot.dispose();
        const blockedWork = await client.callTool({ name: 'atri_destructive', arguments: { action: 'work.delete', input: { packageId, baseVersionId: packageVersionId } } });
        assert.equal(blockedWork.isError, true);
        const builtHandle = await mutate('interact', 'build.package.create', { projectId, baseRevision: afterRevision });
        const artifactId = builtHandle.result.artifact.artifactId;
        const preflightInstall = json(await call('atri_read', { action: 'package.install.preflight', input: { artifactId } }));
        const reviewed = await mutate('interact', 'package.install.review', { artifactId, preflightHash: preflightInstall.preflightHash, grantedPermissions: [] });
        await mutate('mutate', 'package.install', { artifactId, reviewReceiptId: reviewed.receipt.receiptId });
        const staleInstall = await client.callTool({ name: 'atri_mutate', arguments: { action: 'package.install', input: { artifactId, reviewReceiptId: reviewed.receipt.receiptId } } });
        assert.equal(staleInstall.isError, true);
        await mutate('destructive', 'library.revision.delete', { ref: { scope: 'library', resourceType: 'core.world', resourceId: world.worldId, revision: createdRevision.result.data.worldRevisionId } });
        await mutate('destructive', 'session.delete.owned', { sessionId: ownedSession.result.data.session.sessionId,
            expectedRevisionId: ownedSession.result.data.revision.revisionId, creatingReceiptId: ownedSession.receipt.receiptId });
        const finalSnapshot = await read('session.snapshot', { sessionId });
        await mutate('destructive', 'session.delete', { sessionId, expectedRevisionId: finalSnapshot.revision.revisionId });
        await mutate('destructive', 'work.delete', { packageId, baseVersionId: preflightInstall.target.packageVersionId });
        const tempSource = structuredClone(source); tempSource.project.projectId = uid('project'); tempSource.project.packageId = uid('pkg');
        const ownedProject = await mutate('mutate', 'build.project.create', { source: tempSource, files });
        await mutate('destructive', 'build.project.delete.owned', { projectId: tempSource.project.projectId,
            baseRevision: ownedProject.result.data.revision.revision, creatingReceiptId: ownedProject.receipt.receiptId });
        semantic.projectId = projectId; semantic.baseRevision = baseRevision; semantic.sessionId = sessionId;
    } finally { await setup.dispose(); }
    semantic.diagnosticSnapshot = json(await call('atri_diagnose_snapshot'));
    await call('atri_browser_open', { width: 1440, height: 1000 });
    // The MCP browser only observes; disposable fixture setup was performed separately.
    const desktop = json(await call('atri_browser_observe'));
    semantic.browserCapabilities = {};
    for (const action of ['memory.schema.scope', 'memory.injection', 'memory.recall.last', 'agents.presets.list', 'agents.run.get', 'agents.checkpoints', 'game.loaded.identity', 'game.llm.status']) {
        let result;
        for (let attempt = 0; attempt < 6; attempt++) {
            result = await client.callTool({ name: 'atri_read', arguments: { action, input: {} } });
            if (!result.isError) break;
            await delay(500);
        }
        semantic.browserCapabilities[action] = { available: !result.isError, result: json(result) };
    }
    assert.equal(desktop.provenance.browserFreshness, 'CURRENT');
    assert.equal(desktop.provenance.runtimeSourceMatch, 'EXACT');
    await writeFile(join(artifacts, 'desktop-snapshot.json'), JSON.stringify(desktop, null, 2));
    const saveImage = async name => {
        const image = (await call('atri_browser_screenshot')).content.find(item => item.type === 'image');
        assert.equal(image.mimeType, 'image/jpeg');
        await writeFile(join(artifacts, name + '.jpg'), Buffer.from(image.data, 'base64'));
    };
    await saveImage('desktop');
    const mobile = json(await call('atri_browser_observe', { operation: 'resize', width: 390, height: 844 }));
    await writeFile(join(artifacts, 'mobile-snapshot.json'), JSON.stringify(mobile, null, 2));
    await saveImage('mobile');
    let changedSource = 'not requested', differentRevision = 'not requested';
    if (process.env.ATRIA_VERIFY_SOURCE_CHANGE === '1') {
        const dirty = execFileSync('git', ['-C', catalog.root, 'status', '--porcelain'], { encoding: 'utf8' });
        assert.equal(dirty, '', 'Source mutation verification requires a clean disposable checkout');
        const target = join(catalog.root, 'package.json'), original = await readFile(target), changed = Buffer.concat([original, Buffer.from('\n')]);
        await writeFile(target, changed);
        try {
            const evidence = json(await call('atri_status'));
            assert.equal(evidence.runtimeSourceMatch, 'SOURCE_CHANGED_SINCE_RUNTIME_START');
            assert.equal(evidence.provenance.server.source.fingerprint, status.provenance.server.source.fingerprint, 'Startup identity is immutable');
            changedSource = evidence.runtimeSourceMatch;
        } finally {
            assert.deepEqual(await readFile(target), changed, 'Concurrent source change detected; refusing to overwrite it');
            await writeFile(target, original);
        }
        assert.equal(json(await call('atri_status')).runtimeSourceMatch, 'EXACT');
    }
    if (process.env.ATRIA_COMPARE_REPO) {
        differentRevision = compareSource(await readSourceIdentity(process.env.ATRIA_COMPARE_REPO), status.provenance.server);
        assert.equal(differentRevision, 'DIFFERENT_REVISION');
    }
    await stopServer(); await startServer();
    const restarted = json(await call('atri_status'));
    assert.notEqual(restarted.provenance.server.serverBootId, status.provenance.server.serverBootId);
    assert.equal(restarted.provenance.browserFreshness, 'STALE');
    assert.equal(restarted.runtimeSourceMatch, 'EXACT');
    await call('atri_browser_open', { reload: true });
    const reloaded = json(await call('atri_status'));
    assert.equal(reloaded.provenance.browserFreshness, 'CURRENT');
    const diagnostics = json(await call('atri_browser_diagnostics'));
    await call('atri_browser_close');
    const summary = { source: status.product, routes: routes.total, unsupported: routes.unsupported,
        references: refs.data.references.length, projectsStatus: projects.status, desktopTitle: desktop.title,
        mobileViewport: mobile.viewport, runtimeSourceMatch: status.runtimeSourceMatch,
        provenanceChecks: { changedSource, differentRevision, restart: restarted.provenance.browserFreshness, reload: reloaded.provenance.browserFreshness },
        runtime: status.provenance.server, restartedRuntime: reloaded.provenance.server,
        scope: 'Phase 5 disposable Package review/install, destructive cleanup + prior READ/mutations with deterministic trusted test-client approval', semantic, diagnostics, artifacts };
    await writeFile(join(artifacts, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({ source: summary.source, routes: summary.routes, runtimeSourceMatch: summary.runtimeSourceMatch,
        provenanceChecks: summary.provenanceChecks, readIntegration: 'passed', browserCapabilities: Object.fromEntries(Object.entries(semantic.browserCapabilities).map(([key, value]) => [key, value.available])), artifacts }, null, 2));
} finally {
    await client?.close();
    await stopServer();
    await writeFile(join(artifacts, 'runtime.log'), redact(log));
    if (stderr) await writeFile(join(artifacts, 'mcp-stderr.log'), redact(stderr));
    const target = await realpath(scratch);
    if (dirname(target).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() || !basename(target).startsWith('atria-mcp-runtime-')) throw new Error('Unsafe runtime cleanup path');
    await rm(target, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}
