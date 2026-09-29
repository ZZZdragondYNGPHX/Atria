// Opt-in real-product smoke. Starts the configured Atria checkout with fresh,
// disposable data; never opens or copies the developer's personal data directory.
import { spawn } from 'node:child_process';
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
try {
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
    const routes = json(await call('atri_api', { operation: 'list', limit: 100 }));
    const refs = json(await call('atri_reference'));
    assert.equal(refs.status, 200);
    assert.ok(refs.data.references.some(item => item.id === 'browser-extension-sdk'));
    const reference = json(await call('atri_reference', { id: 'browser-extension-sdk', limit: 2000 }));
    assert.equal(reference.status, 200);
    const projects = json(await call('atri_api', { operation: 'read', path: '/api/native/studio/projects' }));
    assert.equal(projects.status, 200);
    await call('atri_browser_open', { width: 1440, height: 1000 });
    // Phase 1 cannot dismiss onboarding or create/alter Studio projects.
    const desktop = json(await call('atri_browser_observe'));
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
    const diagnostics = json(await call('atri_browser_diagnostics'));
    await call('atri_browser_close');
    const summary = { source: status.product, routes: routes.total, unsupported: routes.unsupported,
        references: refs.data.references.length, projectsStatus: projects.status, desktopTitle: desktop.title,
        mobileViewport: mobile.viewport, runtimeSourceMatch: status.runtimeSourceMatch, scope: 'Phase 1 observation only; no Studio/Session mutation or provenance verification', diagnostics, artifacts };
    await writeFile(join(artifacts, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
} finally {
    await client?.close();
    if (server && server.exitCode === null) {
        const exited = new Promise(resolve => server.once('exit', resolve));
        server.kill();
        await Promise.race([exited, delay(10000)]);
        if (server.exitCode === null) server.kill('SIGKILL');
    }
    await writeFile(join(artifacts, 'runtime.log'), redact(log));
    if (stderr) await writeFile(join(artifacts, 'mcp-stderr.log'), redact(stderr));
    const target = await realpath(scratch);
    if (dirname(target).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() || !basename(target).startsWith('atria-mcp-runtime-')) throw new Error('Unsafe runtime cleanup path');
    await rm(target, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}
