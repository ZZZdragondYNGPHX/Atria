// Isolated local Node + browser fixture. No real provider or user data.
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { initConfig } from '../../src/config-init.js';
import getWebpackServeMiddleware from '../../src/middleware/webpack-serve.js';
import { inspectWebpackOutput } from '../../src/middleware/webpack-manifest.js';
import getPublicLibConfig from '../../webpack.config.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture, sessionFixture } from '../native/helpers/session-fixture.js';
import { seedGenerationProfiles } from '../native/helpers/generation-fixture.js';
const temporary = await fsp.mkdtemp(path.join(os.tmpdir(), 'atria-startup-'));
const h = await makeTempFsEngineHarness(), dataRoot = path.dirname(h.dirs.root), oldRoot = h.dirs.root;
const userRoot = path.join(dataRoot, 'default-user'); await fsp.rename(oldRoot, userRoot);
for (const [key, value] of Object.entries(h.dirs)) h.dirs[key] = value.replace(oldRoot, userRoot);
h.handle = 'default-user'; h.engine._directoriesByHandle = () => h.dirs;
const settings = JSON.parse(await fsp.readFile('default/content/settings.json', 'utf8')); settings.firstRun = false;
await fsp.writeFile(path.join(userRoot, 'settings.json'), JSON.stringify(settings));
const configPath = path.join(temporary, 'config.yaml'); await fsp.copyFile('default/config.yaml', configPath);
process.env.ATRIA_WEBPACK_CACHE_ROOT = process.env.ATRIA_STARTUP_BENCH_CACHE || path.join(temporary, 'bundles'); globalThis.DATA_ROOT = dataRoot; initConfig(configPath);
const { SecretManager, SECRET_KEYS } = await import('../../src/endpoints/secrets.js');
let serverProcess, browser, serverLog = '', providerRequests = 0;
const provider = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    JSON.parse(body); providerRequests++;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: 'Local fixture response.' } }], usage: { prompt_tokens: 30, completion_tokens: 5, total_tokens: 35 } }));
});
await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
async function unusedPort() { const socket = createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve)); const port = socket.address().port; await new Promise(resolve => socket.close(resolve)); return port; }
async function startServer() {
    const port = await unusedPort(), started = performance.now();
    serverProcess = spawn(process.execPath, ['server.js', '--configPath', configPath, '--dataRoot', dataRoot, '--port', String(port),
        '--listen', 'false', '--enableIPv4', 'true', '--enableIPv6', 'false', '--browserLaunchEnabled', 'false'], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    serverProcess.stdout.on('data', data => { serverLog = (serverLog + data).slice(-24000); }); serverProcess.stderr.on('data', data => { serverLog = (serverLog + data).slice(-24000); });
    const origin = 'http://127.0.0.1:' + port;
    while (performance.now() - started < 60000) {
        if (serverProcess.exitCode !== null) throw new Error('Server exited: ' + serverLog.slice(-6000));
        try { if ((await fetch(origin)).ok) return { origin, processToHttpMs: performance.now() - started }; } catch { /* Poll local HTTP only. */ }
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Server HTTP timeout: ' + serverLog.slice(-6000));
}
async function stopServer() {
    if (!serverProcess || serverProcess.exitCode !== null) return;
    const exited = new Promise(resolve => serverProcess.once('exit', resolve)); serverProcess.kill('SIGTERM'); await exited;
}
try {
    const declaration = sessionFixture();
    declaration.manifest.runtime = { experience: { mode: 'text' }, experienceContract: { schemaVersion: 1, capabilities: [], dataResources: [] } };
    declaration.manifest.capabilities.push('game-runtime');
    const fixture = await installFixture(h, declaration), snapshot = await fixture.core.create(h.handle, fixture.start);
    const secretId = new SecretManager(h.dirs).writeSecret(SECRET_KEYS.ATRIA_RUNTIME, 'synthetic-local-only', 'Local test', { activate: false });
    const seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:' + provider.address().port + '/v1/chat/completions', roles: ['narrator'] });
    await seeded.persistence.saveConnectionProfile(h.handle, { ...seeded.connection, secretRef: { secretId, scope: 'player' } });
    const middleware = getWebpackServeMiddleware(), buildStart = performance.now();
    const coldBundle = await middleware.runWebpackCompiler(); const buildMs = performance.now() - buildStart;
    const warmStart = performance.now(), warmBundle = await middleware.runWebpackCompiler(), verifyMs = performance.now() - warmStart;
    assert.equal(warmBundle.source, 'cache'); assert.equal(inspectWebpackOutput(getPublicLibConfig()).valid, true);
    const first = await startServer();
    browser = await chromium.launch({ headless: true }); const context = await browser.newContext(); const samples = [];
    for (const cache of ['cold-browser', 'warm-browser']) {
        const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
        const navStart = performance.now(); await page.goto(first.origin);
        await page.waitForFunction(() => globalThis.__atriaStartupTiming?.appReady > 0, null, { timeout: 60000 });
        const openStart = performance.now(); await page.evaluate(id => globalThis.Atria.openNativeSession(id), snapshot.session.sessionId);
        try { await page.waitForFunction(() => document.querySelector('.atria-play-product')?.dataset.atriaPlayReadiness === 'ready', null, { timeout: 15000 }); }
        catch (error) {
            console.log('Readiness diagnostic', await page.evaluate(() => ({ readiness: document.querySelector('.atria-play-product')?.dataset.atriaPlayReadiness,
                runtimeActive: globalThis.Atria?.nativeSessionRuntime?.active, packageStatus: globalThis.Atria?.getContext?.()?.getCapabilityApi?.('game-runtime')?.getPackageState?.().status,
                packageErrors: globalThis.Atria?.getContext?.()?.getCapabilityApi?.('game-runtime')?.getPackageState?.().errors,
                experienceReady: globalThis.Atria?.getContext?.()?.getCapabilityApi?.('game-runtime')?.isExperienceReady?.(), nodes: document.querySelectorAll('[data-atria-message-id]').length })));
            throw error;
        }
        const ready = await page.evaluate(() => ({ ...globalThis.__atriaStartupTiming, nodes: document.querySelectorAll('[data-atria-message-id]').length,
            composerEnabled: [...document.querySelectorAll('.atria-play-product textarea')].some(node => !node.disabled) }));
        assert.equal(ready.composerEnabled, true); assert.ok(ready.playReady > 0); assert.ok(ready.shellInteractive > 0);
        assert.equal(providerRequests, 0, 'Readiness must not send inference');
        samples.push({ cache, navigationToObservedPlayReadyMs: performance.now() - navStart, sessionOpenToObservedPlayReadyMs: performance.now() - openStart,
            shellInteractiveMs: ready.shellInteractive, appReadyMs: ready.appReady, playReadyMs: ready.playReady, optionalReadyMs: ready.optionalReady, nodes: ready.nodes, errors });
        assert.equal(errors.length, 0, errors.join('\n'));
        if (process.env.ATRIA_STARTUP_VERIFY_SUBMIT === '1' && cache === 'warm-browser') {
            await page.locator('.atria-play-product textarea').fill('Local fixture action');
            await page.locator('.atria-play-composer__send').click();
            await page.waitForFunction(() => globalThis.Atria.nativeSessionRuntime.snapshot.timeline.some(entry => entry.content === 'Local fixture response.'), null, { timeout: 20000 });
            assert.equal(providerRequests, 1);
            const view = await fixture.core.load(h.handle, snapshot.session.sessionId);
            assert.equal(view.timeline.filter(entry => entry.content === 'Local fixture action').length, 1);
            assert.equal(view.timeline.filter(entry => entry.content === 'Local fixture response.').length, 1);
        }
        await page.close();
    }
    await context.close(); await stopServer();
    const second = await startServer(); await stopServer();
    console.log(JSON.stringify({ platform: process.platform, node: process.version, browser: browser.version(), coldBundle, warmBundle,
        buildMs, verifyMs, processToHttpMs: [first.processToHttpMs, second.processToHttpMs], samples, providerRequests,
        conditions: 'CachyOS; isolated local server and FS Session; explicit open after APP_READY; cold/warm browser cache; no real model request',
        missing: ['Windows', 'Termux device', 'physical S2', 'automatic Session resume startup'] }, null, 2));
} catch (error) { console.error(serverLog.slice(-6000)); throw error; }
finally { await browser?.close(); await stopServer(); await new Promise(resolve => provider.close(resolve)); await h.cleanup(); await fsp.rm(temporary, { recursive: true, force: true }); }
