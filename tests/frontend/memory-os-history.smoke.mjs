// SPDX-License-Identifier: AGPL-3.0-or-later
// Disposable server only. Model responses are fixtures; persistence/UI/dispatch are real.
/* global window, document */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createBlankCharacter } from '../e2e/_lib/ui-character.js';
const baseURL = process.argv[2]; assert(baseURL, 'Supply disposable server URL');
const browser = await chromium.launch({ headless: true, channel: process.argv[3] || 'msedge' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const name = `Memory history ${Date.now()}`; const checks = [];
const root = page.locator('.memory-os-history');
const ledger = () => page.evaluate(async () => (await window.Luker.getContext().getChatState('memory_graph__provenance')).state);
async function ready() { await page.waitForFunction(() => !!window.Luker?.getContext && !document.getElementById('preloader')); }
async function selectCharacter() {
    const toggle = page.locator('#rightNavDrawerIcon');
    if (await toggle.evaluate(el => el.classList.contains('closedIcon'))) await toggle.click();
    await page.locator('#rm_print_characters_block .character_select').filter({ hasText: name }).click();
    await page.waitForFunction(expected => window.Luker.getContext().characters[window.Luker.getContext().characterId]?.name === expected, name);
    await page.waitForFunction(() => !!window.Luker.getContext().getExtensionApi('memory-graph'));
}
async function openFixture() {
    await page.evaluate(async () => {
        const { createMemoryHistoryBuilder } = await import('/scripts/extensions/memory-graph/main.js');
        const { openHistoryBuildPopup } = await import('/scripts/extensions/memory-graph/history-build-ui.js');
        const context = Object.create(window.Luker.getContext());
        context.generateTask = async request => {
            window.historyFixtureCalls++;
            if (window.historyFixtureMode === 'hold') await new Promise(resolve => { window.releaseHistoryFixture = resolve; });
            const tail = request.taskMessages.at(-1).content;
            const payload = JSON.parse(tail.slice(tail.indexOf('{"source_episodes"')).split('\n')[0]);
            const source = payload.source_episodes[0];
            const evidence = [{ episodeId: source.episodeId, excerpt: window.historyFixtureMode === 'invalid' ? 'Invented quote' : source.content }];
            return { toolCalls: [
                { name: 'luker_memory_facts', args: { operations: [{ action: 'create', type: 'explicit', text: source.content, evidence }], graphOperations: [
                    { action: 'entity', ref: 'a', name: 'Alice', type: 'Character', evidence },
                    { action: 'entity', ref: 'b', name: 'Castle', type: 'Location', evidence },
                    { action: 'relation', sourceId: 'a', targetId: 'b', predicate: 'visited', factIndex: 0, evidence },
                ] } }, { name: 'luker_rpg_extract_done', args: {} },
            ] };
        };
        window.historyFixtureCalls = 0; window.historyFixtureMode = 'valid';
        window.historyPopupPromise = openHistoryBuildPopup(context, createMemoryHistoryBuilder());
    });
    await root.waitFor();
}
async function start(expected) {
    await root.getByRole('button', { name: '开始构建', exact: true }).click();
    await root.getByRole('status').filter({ hasText: expected }).waitFor();
}
try {
    await page.goto(baseURL); await ready();
    if (await page.locator('#firstRunDisclaimer').count()) await page.locator('dialog .menu_button').filter({ hasText: /^(好的|OK)$/ }).click();
    await createBlankCharacter(page, { name, firstmes: 'Alice visited Castle 0.' }); await selectCharacter();
    await page.evaluate(async () => {
        const ctx = window.Luker.getContext(); Object.assign(ctx.extensionSettings.memory_graph, { memoryOsEnabled: true, includeWorldInfoWithPreset: false, toolCallRetryMax: 0 });
        ctx.saveSettingsDebounced();
        for (let i = 1; i < 7; i++) ctx.chat.push({ mes: `Alice visited Castle ${i}.`, is_user: false, name: 'History fixture' });
        await ctx.saveChat();
    });
    await page.locator('#luker_rpg_memory_view_graph').dispatchEvent('click');
    await page.locator('.memory-os-inspector').getByRole('button', { name: '历史构建 / 回滚', exact: true }).click();
    await root.getByRole('status').filter({ hasText: '尚未开始' }).waitFor();
    checks.push('graph opens history controls without automatic extraction');
    await page.locator('dialog:has(.memory-os-history) .popup-button-ok').click();
    await page.locator('dialog:has(.memory-os-inspector) .popup-button-ok').click();
    await openFixture(); await root.getByLabel('历史范围', { exact: true }).selectOption('custom');
    await root.locator('[name="from"]').fill('0'); await root.locator('[name="to"]').fill('6'); await start('已完成');
    let state = await ledger(); assert.equal(Object.keys(state.facts).length, 2); assert.equal(state.historyBuild.processed.length, 7);
    assert.equal(await page.evaluate(() => window.historyFixtureCalls), 2);
    checks.push('production extraction dispatch stages two batches and commits durable checkpoint');
    await start('无新增来源'); assert.equal(await page.evaluate(() => window.historyFixtureCalls), 2);
    checks.push('repeated build skips all processed sources');
    await page.reload(); await ready(); await selectCharacter(); await openFixture();
    await root.getByRole('button', { name: '回滚最近一次构建', exact: true }).click();
    await root.getByRole('status').filter({ hasText: '已回滚' }).waitFor();
    assert.equal(Object.keys((await ledger()).facts).length, 0);
    checks.push('checkpoint survives reload and rollback restores prior graph');
    await page.evaluate(() => { window.historyFixtureMode = 'invalid'; }); await start('失败');
    assert.equal(Object.keys((await ledger()).facts).length, 0);
    checks.push('invalid model evidence reports errors without publishing partial facts');
    await page.evaluate(() => { window.historyFixtureMode = 'hold'; });
    await root.getByRole('button', { name: '开始构建', exact: true }).click();
    await page.waitForFunction(() => typeof window.releaseHistoryFixture === 'function');
    await root.getByRole('button', { name: '取消构建', exact: true }).click();
    await page.evaluate(() => { window.releaseHistoryFixture(); });
    await root.getByRole('status').filter({ hasText: '已取消' }).waitFor();
    assert.equal(Object.keys((await ledger()).facts).length, 0);
    checks.push('cancel rejects late model response');
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await root.evaluate(el => el.scrollWidth <= el.clientWidth + 2));
    checks.push('390px controls have no horizontal overflow');
    if (process.argv[4]) await page.screenshot({ path: process.argv[4] });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ browser: browser.version(), checks, pageErrors: errors }, null, 2));
} finally { await browser.close(); }
