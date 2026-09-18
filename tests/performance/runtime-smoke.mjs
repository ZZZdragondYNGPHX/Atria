// Isolated real-host smoke. No user data, credentials, provider calls or installs.
// Optional: ATRIA_TEST_BROWSER_CHANNEL=msedge (otherwise Playwright Chromium).
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import YAML from 'yaml';
import { writeWorldBook } from '../e2e/_lib/fixtures.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const scratch = await mkdtemp(resolve(tmpdir(), 'atria-performance-smoke-'));
const dataRoot = resolve(scratch, 'data');
const configPath = resolve(scratch, 'config.yaml');
const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const baseURL = 'http://127.0.0.1:' + port;
let child, browser;
let serverLog = '';
try {
    await mkdir(dataRoot, { recursive: true });
    const config = YAML.parse(await readFile(resolve(root, 'default/config.yaml'), 'utf8'));
    config.dataRoot = dataRoot;
    config.listen = false;
    config.port = port;
    config.browserLaunch.enabled = false;
    config.enableDownloadableTokenizers = false;
    await writeFile(configPath, YAML.stringify(config));
    for (const name of ['atri-public-fixture', 'atri-private-fixture']) {
        writeWorldBook({ dataRoot, name, entries: [{ content: 'SHARED_FIXTURE_BODY', constant: true, sticky: 6 }] });
    }
    child = spawn(process.execPath, ['server.js', '--configPath=' + configPath, '--dataRoot=' + dataRoot, '--port=' + port, '--browserLaunchEnabled=false', '--listen=false'], {
        cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', chunk => { serverLog = (serverLog + chunk).slice(-12000); });
    child.stderr.on('data', chunk => { serverLog = (serverLog + chunk).slice(-12000); });
    const deadline = Date.now() + 120000;
    let ready = false;
    while (Date.now() < deadline) {
        if (child.exitCode !== null) throw new Error('Server exited: ' + serverLog);
        try { ready = (await fetch(baseURL + '/csrf-token')).ok; } catch { /* startup */ }
        if (ready) break;
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!ready) throw new Error('Server readiness timeout: ' + serverLog);
    browser = await chromium.launch({ headless: true, channel: process.env.ATRIA_TEST_BROWSER_CHANNEL || undefined });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort();
    });
    await page.goto(baseURL);
    await page.waitForFunction(() => window.Atria?.getContext && !document.getElementById('preloader'), null, { timeout: 60000 });
    const result = await page.evaluate(async () => {
        const wi = await import('/scripts/world-info.js');
        const core = await import('/script.js');
        const { extension_settings } = await import('/scripts/extensions.js');
        const { regex_placement } = await import('/scripts/extensions/regex/engine.js');
        const { applyProfileWorldInfoFilter } = await import('/scripts/extensions/orchestrator/lorebook-filter.js');
        const { createWorldInfoDispatchAttribution, markWorldInfoDispatch } = await import('/scripts/atri-world-info-provenance.js');
        wi.updateWorldInfoSettings({ world_info_budget: 100, world_info_recursive: false }, ['atri-public-fixture', 'atri-private-fixture']);
        extension_settings.regex = [{
            id: 'atri-smoke-regex', scriptName: 'fixture only', findRegex: '/SHARED_FIXTURE_BODY/g',
            replaceString: 'RENDERED_FIXTURE_BODY', trimStrings: [], placement: [regex_placement.WORLD_INFO],
            disabled: false, markdownOnly: false, promptOnly: true, runOnEdit: false, substituteRegex: 0,
        }];
        let activationEvents = 0;
        let lastActivatedCount = 0;
        const onActivated = entries => {
            activationEvents += 1;
            lastActivatedCount = Array.isArray(entries) ? entries.length : 0;
        };
        core.eventSource.on(core.event_types.WORLD_INFO_ACTIVATED, onActivated);
        const metadataBeforeEvaluation = structuredClone(core.chat_metadata);
        const resolution = await core.simulateWorldInfoActivation({ chatForWI: ['fixture'], maxContext: 8192, dryRun: false });
        const metadataAfterEvaluation = structuredClone(core.chat_metadata);
        const payload = { ...resolution, worldInfoResolution: resolution };
        const before = [...payload.worldInfoBeforeEntries];
        applyProfileWorldInfoFilter(payload, { bookPattern: '^atri-private-fixture$' });
        const firstCommit = await wi.commitWorldInfoEvaluation(resolution);
        const metadataAfterCommit = structuredClone(core.chat_metadata);
        const secondCommit = await wi.commitWorldInfoEvaluation(structuredClone(resolution));
        core.eventSource.removeListener(core.event_types.WORLD_INFO_ACTIVATED, onActivated);
        const sources = payload.worldInfoResolution.worldInfoProvenance.worldInfoBeforeEntries;
        const attribution = createWorldInfoDispatchAttribution(payload.worldInfoResolution.worldInfoProvenance);
        markWorldInfoDispatch(attribution, {
            boundary: 'browser_smoke_handoff',
            providerConfirmed: false,
            mainApi: 'fixture',
            type: 'normal',
            stream: false,
        });
        const targets = Array.from({ length: 12 }, (_, i) => ({ is_group: false, avatar_url: 'fixture.png', file_name: 'fixture-' + i, char_name: 'Fixture' }));
        let retainedDuringWrite = 0;
        await core.runSerializedChatWrite(async () => {
            for (const target of targets) {
                core.seedChatMessageSnapshot(target, [{ mes: target.file_name, swipe_info: [undefined] }]);
                core.seedChatMetadataSnapshot(target, { integrity: target.file_name });
            }
            retainedDuringWrite = targets.filter(target => core.getChatMessageSnapshot(target)).length;
        });
        const retainedAfterWrite = targets.filter(target => core.getChatMessageSnapshot(target)).length;
        const wireSnapshot = core.getChatMessageSnapshot(targets.at(-1));
        const clone = core.getChatMessageSnapshot(targets.at(-1));
        clone[0].mes = 'mutated';
        const isolatedClone = core.getChatMessageSnapshot(targets.at(-1))[0].mes !== 'mutated';
        return { before, after: payload.worldInfoBeforeEntries, aggregate: payload.worldInfoString,
            sources, attribution, retainedDuringWrite, retainedAfterWrite, wireSnapshot, isolatedClone,
            metadataBeforeEvaluation, metadataAfterEvaluation, metadataAfterCommit,
            firstCommit, secondCommit, activationEvents, lastActivatedCount };
    });
    assert.deepEqual(result.before, ['RENDERED_FIXTURE_BODY', 'RENDERED_FIXTURE_BODY']);
    assert.deepEqual(result.after, ['RENDERED_FIXTURE_BODY']);
    assert.equal(result.aggregate, 'RENDERED_FIXTURE_BODY');
    assert.equal(result.sources[0].world, 'atri-public-fixture');
    assert.equal(result.attribution.sources.length, 1);
    assert.equal(result.attribution.sources[0].world, 'atri-public-fixture');
    assert.deepEqual(result.metadataAfterEvaluation, result.metadataBeforeEvaluation);
    assert.equal(result.firstCommit.committed, true);
    assert.equal(result.firstCommit.activatedEntries, 2);
    assert.equal(result.secondCommit.committed, false);
    assert.equal(result.secondCommit.reason, 'already_committed');
    assert.equal(typeof result.firstCommit.committed, 'boolean');
    assert.equal(result.activationEvents, 1);
    assert.equal(result.lastActivatedCount, 2);
    assert.equal(Object.keys(result.metadataAfterCommit.timedWorldInfo?.sticky || {}).length, 2);
    assert.equal(Object.hasOwn(result.attribution.sources[0], 'content'), false);
    assert.deepEqual(result.attribution.dispatches, [{
        sequence: 1,
        boundary: 'browser_smoke_handoff',
        providerConfirmed: false,
        mainApi: 'fixture',
        type: 'normal',
        stream: false,
    }]);
    assert.equal(result.retainedDuringWrite, 12);
    assert.equal(result.retainedAfterWrite, 1);
    assert.deepEqual(result.wireSnapshot[0].swipe_info, [null]);
    assert.equal(result.isolatedClone, true);
    assert.deepEqual(pageErrors, []);
    console.log(JSON.stringify({ kind: 'isolated-atria-host-smoke', browser: await browser.version(), viewport: '1280x900', result, pageErrors }, null, 2));
} finally {
    await browser?.close();
    if (child && child.exitCode === null) {
        const stopped = once(child, 'exit');
        child.kill();
        await stopped;
    }
    // Check the final absolute target before recursive cleanup on every OS.
    if (dirname(scratch) !== resolve(tmpdir()) || !basename(scratch).startsWith('atria-performance-smoke-')) throw new Error('Unsafe cleanup path');
    await rm(scratch, { recursive: true, force: true });
}
