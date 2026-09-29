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
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { redact } from '../src/policy.js';
import { SourceCatalog } from '../src/catalog.js';
import { readSourceIdentity, compareSource } from '../src/provenance.js';
import { randomUUID } from 'node:crypto';
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
        args: [join(toolRoot, 'src', 'cli.js'), '--repo', catalog.root, '--url', origin, ...(process.env.ATRIA_TEST_BROWSER_CHANNEL ? ['--browser-channel', process.env.ATRIA_TEST_BROWSER_CHANNEL] : [])], env, stderr: 'pipe' });
    transport.stderr.on('data', bytes => { stderr += bytes; });
    client = new Client({ name: 'atria-real-product-smoke', version: '1.0.0' });
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
        scope: 'Phase 3 real READ actions with disposable Session/Studio Native v3 Preview setup; no mutation through MCP', semantic, diagnostics, artifacts };
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
