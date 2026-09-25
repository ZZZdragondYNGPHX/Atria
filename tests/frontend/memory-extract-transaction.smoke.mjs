// Disposable server only; provider replies are fixtures, host modules/storage are real.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createBlankCharacter } from '../e2e/_lib/ui-character.js';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    const page = await browser.newPage();
    await page.goto(process.argv[2]);
    await page.waitForFunction(() => window.Atria?.getContext && !document.getElementById('preloader'));
    const onboarding = page.locator('dialog[open]').filter({ has: page.locator('#onboarding_ui_language_select') });
    if (await onboarding.count()) {
        await onboarding.locator('textarea').fill('Extraction Test');
        await onboarding.locator('.popup-button-ok').click();
        await onboarding.waitFor({ state: 'hidden' });
    }
    const name = `Extraction transaction ${Date.now()}`;
    await createBlankCharacter(page, { name, firstmes: 'Roland keeps the sword.' });
    await page.locator('#rm_print_characters_block .character_select').filter({ hasText: name }).click();
    await page.waitForFunction(name => window.Atria.getContext().characters[window.Atria.getContext().characterId]?.name === name, name);
    const result = await page.evaluate(async () => {
        const ctx = window.Atria.getContext();
        const { _processPendingMessageBatchWithLLMForTest: processBatch, getDefaultNodeTypeSchema } = await import('/scripts/agents/memory/main.js');
        const { createEmptyStore } = await import('/scripts/agents/memory/persistence.js');
        Object.assign(ctx.capabilitySettings.memory_graph, { memoryOsEnabled: true, autoExtractionEnabled: false });
        ctx.chat.splice(0, ctx.chat.length, { mes: 'Roland keeps the sword.', is_user: false, name: 'Fixture' });
        await ctx.saveChat();
        const schema = getDefaultNodeTypeSchema().filter(type => type.id === 'event');
        const requests = [], store = createEmptyStore(), context = Object.create(ctx);
        const event = { name: 'atria_rpg_extract_event_create', args: { ref: 'e1', summary: '时间: 未知\n地点: 未知\n\nRoland keeps the sword.', links: [], no_link_reason: 'No grounded relation' } };
        const facts = { name: 'atri_memory_facts', args: { operations: [], graphOperations: [] } };
        const done = { name: 'atria_rpg_extract_done', args: {} };
        const responses = [[event], [facts], [done]];
        context.generateTask = async request => {
            if (Object.keys(store.nodes || {}).length) throw new Error('Premature graph write');
            requests.push({ names: request.tools.map(tool => tool.function.name), stream: request.stream, choice: request.toolChoice, mode: request.promptMode });
            return { toolCalls: responses.shift() };
        };
        const settings = { memoryOsEnabled: true, nodeTypeSchema: schema, toolCallRetryMax: 0 };
        const frames = [{ ...ctx.chat[0], seq: 1, source_index: 0 }];
        await processBatch(context, store, settings, schema, frames, 0, 0);
        const invalid = createEmptyStore();
        context.generateTask = async () => ({ toolCalls: [event, facts, facts, done] });
        let rejected = false;
        try { await processBatch(context, invalid, settings, schema, frames, 0, 0); } catch { rejected = true; }
        return { requests, eventCount: Object.values(store.nodes).filter(node => node.type === 'event').length,
            invalidCount: Object.keys(invalid.nodes).length, rejected,
            provenanceSaved: (await ctx.getChatState('memory_graph__provenance')).ok };
    });
    assert.equal(result.eventCount, 1); assert.equal(result.invalidCount, 0); assert.equal(result.rejected, true);
    assert(result.provenanceSaved);
    assert.deepEqual(result.requests.slice(1).map(request => request.names), [['atri_memory_facts'], ['atria_rpg_extract_done']]);
    assert(result.requests.every(request => request.stream === false && request.choice === 'required' && request.mode === 'task'));
    console.log(JSON.stringify({ browser: browser.version(), ...result }, null, 2));
} finally {
    await browser.close();
}
