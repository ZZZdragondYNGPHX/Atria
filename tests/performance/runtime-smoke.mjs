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
    writeWorldBook({
        dataRoot,
        name: 'atri-unknown-condition-fixture',
        entries: [{
            content: 'UNKNOWN_CONDITION_BODY',
            constant: true,
            stateConditions: [{
                providerId: 'missing-provider',
                path: ['scene', 'place'],
                operator: 'eq',
                value: 'clocktower',
            }],
        }],
    });
    writeWorldBook({
        dataRoot,
        name: 'atri-malformed-condition-fixture',
        entries: [{
            content: 'MALFORMED_CONDITION_BODY',
            constant: true,
        }],
    });
    const malformedConditionPath = resolve(
        dataRoot,
        'default-user',
        'worlds',
        'atri-malformed-condition-fixture.json',
    );
    const malformedConditionBook = JSON.parse(await readFile(malformedConditionPath, 'utf8'));
    malformedConditionBook.entries['0'].stateConditions = { invalid: true };
    await writeFile(malformedConditionPath, JSON.stringify(malformedConditionBook, null, 4));
    writeWorldBook({
        dataRoot,
        name: 'atri-ready-condition-true-fixture',
        entries: [{
            content: 'READY_CONDITION_TRUE_BODY',
            constant: true,
            stateConditions: [{
                providerId: 'mvu',
                path: ['scene', 'place'],
                operator: 'eq',
                value: 'clocktower',
            }],
        }],
    });
    writeWorldBook({
        dataRoot,
        name: 'atri-ready-condition-false-fixture',
        entries: [{
            content: 'READY_CONDITION_FALSE_BODY',
            constant: true,
            stateConditions: [{
                providerId: 'mvu',
                path: ['scene', 'place'],
                operator: 'eq',
                value: 'castle',
            }],
        }],
    });
    writeWorldBook({
        dataRoot,
        name: 'atri-condition-author-ui-fixture',
        entries: [{
            content: 'AUTHOR_UI_CONDITION_BODY',
            constant: true,
        }],
    });
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

    const authorUiWorldIndex = await page.evaluate(async () => {
        const wi = await import('/scripts/world-info.js');
        return wi.world_names.indexOf('atri-condition-author-ui-fixture');
    });
    assert.ok(authorUiWorldIndex >= 0);
    await page.selectOption('#world_editor_select', String(authorUiWorldIndex));
    const authorUiEntry = page.locator('#world_popup_entries_list > .world_entry[uid="0"]');
    await authorUiEntry.waitFor({ state: 'visible', timeout: 15000 });
    await authorUiEntry.locator('.wi-entry-toggle').click();
    const conditionEditor = authorUiEntry.locator('.wi-entry-state-conditions');
    await conditionEditor.waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(await conditionEditor.count(), 1);
    assert.equal(await authorUiEntry.locator('textarea[name="stateConditionsJson"]').count(), 0);
    await conditionEditor.locator('> .inline-drawer-toggle').click();
    await conditionEditor.locator('.wi-state-condition-add').waitFor({ state: 'visible', timeout: 5000 });
    await conditionEditor.locator('.wi-state-condition-add').click();
    const authorConditionRow = conditionEditor.locator('.wi-state-condition-row').first();
    await authorConditionRow.waitFor({ state: 'visible', timeout: 5000 });
    await authorConditionRow.locator('.wi-state-condition-path input').fill('scene.place');
    await authorConditionRow.locator('.wi-state-condition-value-control').fill('clocktower');
    const stagedConditionsBeforeSave = await page.evaluate(async () => {
        const wi = await import('/scripts/world-info.js');
        const data = await wi.loadWorldInfo('atri-condition-author-ui-fixture');
        return structuredClone(data?.entries?.['0']?.stateConditions || []);
    });
    assert.deepEqual(stagedConditionsBeforeSave, []);
    await conditionEditor.locator('.wi-state-condition-save').click();
    await page.waitForFunction(async () => {
        const wi = await import('/scripts/world-info.js');
        const data = await wi.loadWorldInfo('atri-condition-author-ui-fixture');
        return Array.isArray(data?.entries?.['0']?.stateConditions)
            && data.entries['0'].stateConditions.length === 1;
    });
    const authoredConditions = await page.evaluate(async () => {
        const wi = await import('/scripts/world-info.js');
        const data = await wi.loadWorldInfo('atri-condition-author-ui-fixture');
        return structuredClone(data?.entries?.['0']?.stateConditions || []);
    });
    assert.deepEqual(authoredConditions, [{
        providerId: 'mvu',
        path: ['scene', 'place'],
        operator: 'eq',
        value: 'clocktower',
    }]);
    assert.equal(await conditionEditor.locator('.wi-state-condition-count').textContent(), '1');
    assert.match(await conditionEditor.locator('.wi-state-condition-status').textContent(), /saved/i);

    const result = await page.evaluate(async () => {
        const wi = await import('/scripts/world-info.js');
        const core = await import('/script.js');
        const { extension_settings } = await import('/scripts/extensions.js');
        const { regex_placement } = await import('/scripts/extensions/regex/engine.js');
        const { applyProfileWorldInfoFilter } = await import('/scripts/extensions/orchestrator/lorebook-filter.js');
        const { createWorldInfoDispatchAttribution, markWorldInfoDispatch } = await import('/scripts/atri-world-info-provenance.js');
        wi.updateWorldInfoSettings(
            { world_info_budget: 100, world_info_recursive: false },
            ['atri-public-fixture', 'atri-private-fixture', 'atri-unknown-condition-fixture', 'atri-malformed-condition-fixture'],
        );
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
        const staleResolution = await core.simulateWorldInfoActivation({
            chatForWI: ['fixture'],
            maxContext: 8192,
            dryRun: true,
        });
        staleResolution.worldInfoCommitScope = { chatId: '__stale_chat_scope__' };
        const metadataBeforeStaleCommit = structuredClone(core.chat_metadata);
        const staleCommit = await wi.commitWorldInfoEvaluation(staleResolution);
        const metadataAfterStaleCommit = structuredClone(core.chat_metadata);
        core.eventSource.removeListener(core.event_types.WORLD_INFO_ACTIVATED, onActivated);

        // W-03 real-host provider check: use a detached committed MVU snapshot
        // and prove both the true and false branches through the production
        // readStateProviders -> condition evaluator -> scanner path.
        const originalChatLength = core.chat.length;
        const previousMvu = globalThis.Mvu;
        core.chat.push({
            name: 'Fixture Assistant',
            mes: 'Committed state fixture',
            is_user: false,
            is_system: false,
            swipe_id: 0,
            variables: [{ scene: { place: 'clocktower' } }],
        });
        globalThis.Mvu = {
            isDuringExtraAnalysis: () => false,
            getMvuData: () => ({
                stat_data: { scene: { place: 'clocktower' } },
                schema: { scene: { place: 'string' } },
            }),
        };
        wi.updateWorldInfoSettings(
            { world_info_budget: 100, world_info_recursive: false },
            ['atri-ready-condition-true-fixture', 'atri-ready-condition-false-fixture'],
        );
        const readyConditionResolution = await core.simulateWorldInfoActivation({
            chatForWI: ['fixture'],
            maxContext: 8192,
            dryRun: true,
        });
        const readyConditionTrueBody = readyConditionResolution.worldInfoString.includes('READY_CONDITION_TRUE_BODY');
        const readyConditionFalseBody = readyConditionResolution.worldInfoString.includes('READY_CONDITION_FALSE_BODY');
        core.chat.splice(originalChatLength);
        if (previousMvu === undefined) delete globalThis.Mvu;
        else globalThis.Mvu = previousMvu;
        wi.updateWorldInfoSettings(
            { world_info_budget: 100, world_info_recursive: false },
            ['atri-public-fixture', 'atri-private-fixture', 'atri-unknown-condition-fixture'],
        );

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
        const stateConditionAuthorUi = {
            drawers: document.querySelectorAll('#entry_edit_template .wi-entry-state-conditions').length,
            addButtons: document.querySelectorAll('#entry_edit_template .wi-state-condition-add').length,
            saveButtons: document.querySelectorAll('#entry_edit_template .wi-state-condition-save').length,
            logicSelects: document.querySelectorAll('#entry_edit_template select[name="stateConditionLogic"]').length,
        };
        return { before, after: payload.worldInfoBeforeEntries, aggregate: payload.worldInfoString,
            sources, attribution, retainedDuringWrite, retainedAfterWrite, wireSnapshot, isolatedClone,
            metadataBeforeEvaluation, metadataAfterEvaluation, metadataAfterCommit,
            firstCommit, secondCommit, staleCommit, activationEvents, lastActivatedCount,
            metadataBeforeStaleCommit, metadataAfterStaleCommit,
            containedUnknownConditionBody: resolution.worldInfoString.includes('UNKNOWN_CONDITION_BODY'),
            containedMalformedConditionBody: resolution.worldInfoString.includes('MALFORMED_CONDITION_BODY'),
            readyConditionTrueBody, readyConditionFalseBody, stateConditionAuthorUi };
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
    assert.equal(result.staleCommit.committed, false);
    assert.equal(result.staleCommit.reason, 'scope_changed');
    assert.deepEqual(result.metadataAfterStaleCommit, result.metadataBeforeStaleCommit);
    assert.equal(typeof result.firstCommit.committed, 'boolean');
    assert.equal(result.activationEvents, 1);
    assert.equal(result.lastActivatedCount, 2);
    assert.equal(result.containedUnknownConditionBody, false);
    assert.equal(result.containedMalformedConditionBody, false);
    assert.equal(result.readyConditionTrueBody, true);
    assert.equal(result.readyConditionFalseBody, false);
    assert.deepEqual(result.stateConditionAuthorUi, {
        drawers: 1,
        addButtons: 1,
        saveButtons: 1,
        logicSelects: 1,
    });
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
