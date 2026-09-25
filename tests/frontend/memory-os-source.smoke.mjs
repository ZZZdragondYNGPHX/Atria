// SPDX-License-Identifier: AGPL-3.0-or-later
// Manual real-server smoke. Run ONLY against a disposable data root:
// node tests/frontend/memory-os-source.smoke.mjs <isolated-server-url> [browser-channel]
// Creates a test character and changes settings in that disposable instance.
/* global window, document */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createBlankCharacter } from '../e2e/_lib/ui-character.js';
import { editMessageViaUI } from '../e2e/_lib/page.js';

const baseURL = process.argv[2];
assert(baseURL, 'Supply the URL of a disposable Atria instance');
const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { channel: process.argv[3] } : {}) });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const pageErrors = [];
const providerChecks = [];
page.on('pageerror', error => pageErrors.push(error.message));
const name = `Memory OS smoke ${Date.now()}`;

async function ready() {
    await page.waitForFunction(() => !!window.Atria?.getContext && !document.getElementById('preloader'));
}
async function selectCharacter() {
    const toggle = page.locator('#rightNavDrawerIcon');
    if (await toggle.evaluate(el => el.classList.contains('closedIcon'))) await toggle.click();
    await page.locator('#rm_print_characters_block .character_select').filter({ hasText: name }).click();
    await page.waitForFunction(expected => {
        const ctx = window.Atria.getContext();
        return ctx.characters[ctx.characterId]?.name === expected && ctx.chat.length > 0;
    }, name);
    await page.waitForFunction(() => !!window.Atria.getContext().getCapabilityApi('memory-graph'));
}
async function snapshot() {
    return page.evaluate(async () => {
        const ctx = window.Atria.getContext();
        const main = await import('/scripts/agents/memory/main.js');
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
        const ctx = window.Atria.getContext();
        ctx.capabilitySettings.memory_graph.memoryOsEnabled = true;
        ctx.saveSettingsDebounced();
        window.memorySourceSmokeSession = await ctx.getCapabilityApi('memory-graph').openSession(ctx);
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
        const result = await session.applyMemoryBatch({ facts: [
            { action: 'create', text: 'The archive key is blue.', type: 'explicit', evidence },
            { action: 'create', text: 'Blue may identify archive access.', type: 'inferred', confidence: 1, evidence },
        ], graph: [
            { action: 'entity', ref: 'key', name: 'Archive key', type: 'Item', evidence },
            { action: 'entity', ref: 'color', name: 'Blue', type: 'Concept', evidence },
            { action: 'relation', sourceId: 'key', targetId: 'color', predicate: 'has_color', factIndex: 0, evidence },
        ] });
        return result.facts;
    });
    const factsBefore = await page.evaluate(() => window.memorySourceSmokeSession.listFacts());
    assert.equal(factsBefore.length, 2);
    assert.equal(factsBefore.find(fact => fact.type === 'inferred').confidence, 0.65);
    const graphBefore = await page.evaluate(() => window.memorySourceSmokeSession.listTemporalGraph());
    assert.equal(graphBefore.entities.length, 2);
    assert.equal(graphBefore.relations[0].predicate, 'has_color');

    const recalled = await page.evaluate(async () => {
        const ctx = window.Atria.getContext();
        ctx.capabilitySettings.memory_graph.memoryOsTokenBudget = 500;
        const result = await window.memorySourceSmokeSession.recallMemory('What color is the archive key?');
        return { text: result.text, tokenCount: result.tokenCount, selected: result.selected };
    });
    assert(recalled.text.includes('blue') || recalled.text.includes('Blue'));
    assert(recalled.selected.length > 0);
    assert(recalled.tokenCount <= 500);
    const injected = await page.evaluate(async () => {
        const ctx = window.Atria.getContext();
        ctx.capabilitySettings.memory_graph.enabled = true;
        ctx.capabilitySettings.memory_graph.recallEnabled = true;
        const main = await import('/scripts/agents/memory/main.js');
        const payload = { type: 'normal', coreChat: [...ctx.chat, { mes: 'What color is the archive key?', is_user: true }] };
        await main._handleWiAfterScanForTest(payload);
        const projection = await ctx.getCapabilityApi('memory-graph').getLastRecallProjection(ctx);
        return { projection, rescan: payload.requestRescan };
    });
    assert(injected.projection.blocks.focusPacket.includes('sources'));
    assert.equal(injected.rescan, true);

    // Optional fixed-source LoreState bridge verification, supplied from a
    // read-only research checkout. No external framework is installed in user data.
    if (process.argv[4]) {
        const bridge = await readFile(process.argv[4], 'utf8');
        await page.route('**/__memory_os_ejs_fixture.js', route => route.fulfill({ contentType: 'text/javascript', body: bridge }));
        const providers = await page.evaluate(async () => {
            const ctx = window.Atria.getContext();
            const api = ctx.getCapabilityApi('memory-graph');
            const { installEjsBridge } = await import('/__memory_os_ejs_fixture.js');
            let loreState = { version: 3, shared: { place: 'Harbor' } };
            const dispose = installEjsBridge({ eventOn: (event, cb) => ctx.eventSource.on(event, cb),
                eventRemoveListener: (event, cb) => ctx.eventSource.removeListener(event, cb), read: () => ({ state: loreState }) });
            ctx.chat[0].variables = [{ stat_data: { pilot: { place: 'Harbor' } }, schema: {} }];
            window.Mvu = { getMvuData: ({ message_id }) => structuredClone(ctx.chat[message_id].variables[0]), isDuringExtraAnalysis: () => false };
            ctx.capabilitySettings.memory_graph.memoryOsTokenBudget = 1800;
            ctx.capabilitySettings.memory_graph.memoryOsStateOwners = {};
            ctx.capabilitySettings.memory_graph.memoryOsStateMappings = [
                { providerId: 'mvu', path: ['pilot', 'place'], key: 'location', label: 'Pilot location' },
                { providerId: 'lorestate', path: ['shared', 'place'], key: 'location', label: 'Pilot location' },
            ];
            const agreed = await api.recallMemory(ctx, 'Pilot location');
            loreState = { version: 3, shared: { place: 'Castle' } };
            let invalidated = false;
            try { agreed.assertCurrent(); } catch (error) { invalidated = error.name === 'AbortError'; }
            const conflict = await api.recallMemory(ctx, 'Pilot location');
            ctx.capabilitySettings.memory_graph.memoryOsStateOwners = { location: 'mvu' };
            const owned = await api.recallMemory(ctx, 'Pilot location');
            const sourceUnchanged = ctx.chat[0].variables[0].stat_data.pilot.place === 'Harbor';
            dispose(); delete window.Mvu;
            const absent = await api.recallMemory(ctx, 'Pilot location');
            return { agreed: agreed.text, providers: agreed.providers, invalidated, conflict: conflict.text, owned: owned.text,
                sourceUnchanged, absent: absent.providers, absentText: absent.text };
        });
        assert(providers.providers.every(provider => provider.status === 'ready'));
        assert(providers.agreed.includes('Harbor'));
        assert(providers.invalidated);
        assert(providers.conflict.includes('Unresolved state conflict'));
        assert(providers.owned.includes('Harbor') && !providers.owned.includes('Castle'));
        assert(providers.sourceUnchanged);
        assert(providers.absent.every(provider => provider.status === 'absent'));
        assert(!providers.absentText.includes('Harbor'));
        providerChecks.push('real LoreState EJS bridge on actual host event bus', 'MVU getter contract fixture',
            'provider coexistence and explicit ownership', 'same-text state mutation invalidates held result',
            'read-only source preservation', 'provider disposal withdraws current fields');
    }

    await editMessageViaUI(page, 0, 'The archive key is red.');
    const after = await snapshot();
    assert.equal(after.sourceId, before.sourceId);
    assert.equal(after.store.nodes[created.id].archived, true);
    assert.equal(after.ledger.state.episodes[episodeId].status, 'stale');
    assert.equal(after.ledger.state.episodes[episodeId].content, 'The archive key is blue.');
    assert.equal(after.ledger.state.facts[factIds[0].id].status, 'stale');
    assert.deepEqual(await page.evaluate(() => window.memorySourceSmokeSession.listFacts()), []);
    assert.equal((await page.evaluate(() => window.memorySourceSmokeSession.listTemporalGraph())).relations.length, 0);
    const staleRecall = await page.evaluate(async () => {
        const result = await window.memorySourceSmokeSession.recallMemory('archive key');
        return result.text;
    });
    assert.equal(staleRecall, '');
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
    assert.equal(reloaded.ledger.state.relations[graphBefore.relations[0].id].status, 'stale');
    const replacement = await page.evaluate(async () => {
        const ctx = window.Atria.getContext();
        const session = await ctx.getCapabilityApi('memory-graph').openSession(ctx);
        return session.createNode({ type: 'event', fields: { summary: 'The archive key is red.' } });
    });
    const revised = await snapshot();
    const revisedId = revised.store.nodes[replacement.id].memoryOsEvidence.episodeIds[0];
    assert.notEqual(revisedId, episodeId);
    assert.equal(revised.store.nodes[replacement.id].archived, false);
    assert.equal(revised.ledger.state.episodes[revisedId].content, 'The archive key is red.');
    await page.evaluate(() => { window.Atria.getContext().capabilitySettings.memory_graph.memoryOsEnabled = false; });
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
        'typed entities and semantic relation persisted atomically with Fact', 'temporal graph source invalidation survives reload',
        'hybrid retrieval uses real tokenizer within budget', 'main recall handler writes FOCUS_PACKET and requests rescan',
        'source edit excludes hybrid recall results',
        ...providerChecks,
    ] }, null, 2));
} finally {
    await browser.close();
}
