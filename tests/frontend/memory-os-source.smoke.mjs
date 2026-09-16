// SPDX-License-Identifier: AGPL-3.0-or-later
// Manual real-server smoke. Run ONLY against a disposable data root:
// node tests/frontend/memory-os-source.smoke.mjs <isolated-server-url> [browser-channel]
// Creates a test character and changes settings in that disposable instance.
/* global window, document */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createBlankCharacter } from '../e2e/_lib/ui-character.js';
import { editMessageViaUI } from '../e2e/_lib/page.js';

const baseURL = process.argv[2];
assert(baseURL, 'Supply the URL of a disposable Luker instance');
const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { channel: process.argv[3] } : {}) });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
const name = `Memory OS smoke ${Date.now()}`;

async function ready() {
    await page.waitForFunction(() => !!window.Luker?.getContext && !document.getElementById('preloader'));
}
async function selectCharacter() {
    const toggle = page.locator('#rightNavDrawerIcon');
    if (await toggle.evaluate(el => el.classList.contains('closedIcon'))) await toggle.click();
    await page.locator('#rm_print_characters_block .character_select').filter({ hasText: name }).click();
    await page.waitForFunction(expected => {
        const ctx = window.Luker.getContext();
        return ctx.characters[ctx.characterId]?.name === expected && ctx.chat.length > 0;
    }, name);
    await page.waitForFunction(() => !!window.Luker.getContext().getExtensionApi('memory-graph'));
}
async function snapshot() {
    return page.evaluate(async () => {
        const ctx = window.Luker.getContext();
        const main = await import('/scripts/extensions/memory-graph/main.js');
        const store = await main.ensureMemoryStoreLoaded(ctx);
        const ledger = await ctx.getChatState('memory_graph__provenance');
        return { store, ledger, sourceId: ctx.chat[0]?.memory_os_source_id };
    });
}

try {
    await page.goto(baseURL);
    await ready();
    if (await page.locator('dialog textarea').isVisible()) {
        await page.locator('dialog textarea').fill('Memory OS Tester');
        await page.locator('dialog .menu_button').filter({ hasText: /^(好的|OK)$/ }).click();
    }
    await createBlankCharacter(page, { name, firstmes: 'The archive key is blue.' });
    await selectCharacter();
    const created = await page.evaluate(async () => {
        const ctx = window.Luker.getContext();
        ctx.extensionSettings.memory_graph.memoryOsEnabled = true;
        ctx.saveSettingsDebounced();
        window.memorySourceSmokeSession = await ctx.getExtensionApi('memory-graph').openSession(ctx);
        return window.memorySourceSmokeSession.createNode({ type: 'event', fields: { summary: 'The archive key is blue.' } });
    });
    const before = await snapshot();
    assert(before.ledger.ok && before.sourceId);
    assert(before.store.nodes[created.id].memoryOsEvidence);
    assert.equal(before.store.nodes[created.id].archived, false);
    const episodeId = before.store.nodes[created.id].memoryOsEvidence.episodeIds[0];
    assert.equal(before.ledger.state.episodes[episodeId].content, 'The archive key is blue.');
    const factIds = await page.evaluate(async () => {
        const session = window.memorySourceSmokeSession;
        const [source] = session.getFactSources();
        const evidence = [{ episodeId: source.episodeId, excerpt: source.content }];
        return session.applyFacts([
            { action: 'create', text: 'The archive key is blue.', type: 'explicit', evidence },
            { action: 'create', text: 'Blue may identify archive access.', type: 'inferred', confidence: 1, evidence },
        ]);
    });
    const factsBefore = await page.evaluate(() => window.memorySourceSmokeSession.listFacts());
    assert.equal(factsBefore.length, 2);
    assert.equal(factsBefore.find(fact => fact.type === 'inferred').confidence, 0.65);

    await editMessageViaUI(page, 0, 'The archive key is red.');
    const after = await snapshot();
    assert.equal(after.sourceId, before.sourceId);
    assert.equal(after.store.nodes[created.id].archived, true);
    assert.equal(after.ledger.state.episodes[episodeId].status, 'stale');
    assert.equal(after.ledger.state.episodes[episodeId].content, 'The archive key is blue.');
    assert.equal(after.ledger.state.facts[factIds[0].id].status, 'stale');
    assert.deepEqual(await page.evaluate(() => window.memorySourceSmokeSession.listFacts()), []);
    const late = await page.evaluate(async () => {
        try {
            await window.memorySourceSmokeSession.createNode({ type: 'event', fields: { summary: 'Late blue' } });
            return 'unexpected success';
        } catch (error) { return error.name; }
    });
    assert.equal(late, 'AbortError');
    assert.equal(Object.keys((await snapshot()).store.nodes).length, 1);

    await page.reload();
    await ready();
    await selectCharacter();
    const reloaded = await snapshot();
    assert.equal(reloaded.sourceId, before.sourceId);
    assert.equal(reloaded.ledger.state.episodes[episodeId].status, 'stale');
    assert.equal(reloaded.store.nodes[created.id].archived, true);
    assert.equal(reloaded.ledger.state.facts[factIds[0].id].status, 'stale');
    const replacement = await page.evaluate(async () => {
        const ctx = window.Luker.getContext();
        const session = await ctx.getExtensionApi('memory-graph').openSession(ctx);
        return session.createNode({ type: 'event', fields: { summary: 'The archive key is red.' } });
    });
    const revised = await snapshot();
    const revisedId = revised.store.nodes[replacement.id].memoryOsEvidence.episodeIds[0];
    assert.notEqual(revisedId, episodeId);
    assert.equal(revised.store.nodes[replacement.id].archived, false);
    assert.equal(revised.ledger.state.episodes[revisedId].content, 'The archive key is red.');
    await page.evaluate(() => { window.Luker.getContext().extensionSettings.memory_graph.memoryOsEnabled = false; });
    const disabled = await snapshot();
    assert.equal(disabled.store.nodes[created.id].archived, true);
    assert.equal(disabled.store.nodes[replacement.id].archived, false);
    assert.deepEqual(pageErrors, []);
    console.log(JSON.stringify({ passed: true, browser: browser.version(), checks: [
        'public API write', 'source ID and Episode persisted', 'UI edit invalidates evidence',
        'original Episode retained', 'late session write rejected without leaked node',
        'reload preserves identity and stale exclusion', 'fresh session captures new revision',
        'disabling flag does not revive stale evidence', 'no pageerror',
        'atomic facts persisted with confidence separation', 'fact evidence invalidation survives reload',
    ] }, null, 2));
} finally {
    await browser.close();
}
