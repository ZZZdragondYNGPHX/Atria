// SPDX-License-Identifier: AGPL-3.0-or-later
// Run only against an isolated disposable server; creates a test character.
/* global window, document */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createBlankCharacter } from '../e2e/_lib/ui-character.js';

const baseURL = process.argv[2];
assert(baseURL, 'Supply disposable server URL');
const browser = await chromium.launch({ headless: true, channel: process.argv[3] || 'msedge' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const name = `Memory graph UI ${Date.now()}`;
const root = page.locator('.memory-os-inspector');
const checks = [];
async function selectCharacter() {
    const toggle = page.locator('#rightNavDrawerIcon');
    if (await toggle.evaluate(el => el.classList.contains('closedIcon'))) await toggle.click();
    await page.locator('#rm_print_characters_block .character_select').filter({ hasText: name }).click();
    await page.waitForFunction(expected => window.Atria.getContext().characters[window.Atria.getContext().characterId]?.name === expected, name);
    await page.waitForFunction(() => !!window.Atria.getContext().getExtensionApi('memory-graph'));
}
async function open() {
    // Dispatch the existing extension settings entry; all edits below use visible form controls.
    await page.locator('#atria_rpg_memory_view_graph').dispatchEvent('click');
    await root.getByRole('status').filter({ hasText: '显示' }).waitFor();
}
async function edit(action, values) {
    const before = Object.keys((await ledger()).corrections || {}).length;
    const details = root.locator('details').filter({ has: page.locator('form') });
    if (!await details.evaluate(el => el.open)) await details.locator('summary').click();
    await root.getByLabel('操作', { exact: true }).selectOption(action);
    for (const [key, value] of Object.entries(values)) {
        const input = root.locator(`[name="${key}"]`);
        if (await input.evaluate(el => el.tagName === 'SELECT')) await input.selectOption(value);
        else await input.fill(value);
    }
    await root.locator('[name="reason"]').fill('Browser automated user correction');
    await root.getByRole('button', { name: '保存修正', exact: true }).click();
    await page.waitForFunction(async expected => Object.keys((await window.Atria.getContext().getChatState('memory_graph__provenance')).state.corrections || {}).length === expected, before + 1);
    await root.getByRole('status').filter({ hasText: '修正已保存' }).waitFor();
}
const ledger = () => page.evaluate(async () => (await window.Atria.getContext().getChatState('memory_graph__provenance')).state);
try {
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.Atria?.getContext && !document.getElementById('preloader'));
    if (await page.locator('#firstRunDisclaimer').count()) await page.locator('dialog .menu_button').filter({ hasText: /^(好的|OK)$/ }).click();
    await createBlankCharacter(page, { name, firstmes: 'Alice is at Castle.' }); await selectCharacter();
    await page.evaluate(() => { const ctx = window.Atria.getContext(); ctx.extensionSettings.memory_graph.memoryOsEnabled = true; ctx.saveSettingsDebounced(); });
    await open(); checks.push('existing graph entry opens Memory OS');
    await edit('entity', { name: 'Alice', type: 'Character' });
    await edit('entity', { name: 'Castle', type: 'Location' });
    let state = await ledger(); const alice = Object.values(state.entities).find(item => item.canonicalName === 'Alice').id;
    const castle = Object.values(state.entities).find(item => item.canonicalName === 'Castle').id;
    await edit('relation', { sourceId: alice, targetId: castle, predicate: 'located_in', text: 'Alice is at Castle.' });
    state = await ledger(); const edge = Object.keys(state.relations)[0];
    assert.equal(Object.keys(state.episodes).length, 0); assert.equal(Object.keys(state.corrections).length, 3);
    checks.push('visible forms persist entities and semantic relation without fake Episodes');
    await root.locator('.mos-list').getByRole('button', { name: 'located_in · active', exact: true }).click();
    assert((await root.locator('.mos-detail').textContent()).includes('用户修正来源'));
    checks.push('edge inspector displays manual provenance');
    await root.getByLabel('图谱范围', { exact: true }).selectOption(alice);
    await root.getByLabel('局部深度', { exact: true }).selectOption('3');
    await root.getByLabel('搜索名称 / 别名', { exact: true }).fill('Alice');
    await root.getByLabel('搜索名称 / 别名', { exact: true }).press('Tab');
    assert((await root.getByRole('status').textContent()).includes('1/1 实体'));
    checks.push('local graph and search filter real records');
    await root.getByLabel('搜索名称 / 别名', { exact: true }).fill(''); await root.getByLabel('搜索名称 / 别名', { exact: true }).press('Tab');
    await edit('alias', { targetId: alice, name: '<img src=x onerror=alert(1)>' });
    await root.locator('.mos-list').getByRole('button', { name: 'Alice · active', exact: true }).click();
    assert.equal(await root.locator('.mos-detail img').count(), 0);
    assert((await root.locator('.mos-detail').textContent()).includes('<img src=x onerror=alert(1)>'));
    checks.push('source and alias content render as text');
    await edit('reject_relation', { targetId: edge });
    assert.equal(await root.locator('.mos-list').getByRole('button', { name: 'located_in · active', exact: true }).count(), 0);
    await root.getByLabel('状态', { exact: true }).selectOption('history');
    assert.equal(await root.locator('.mos-list').getByRole('button', { name: 'located_in · rejected', exact: true }).count(), 1);
    checks.push('rejected relation leaves active graph and remains in history');
    await page.setViewportSize({ width: 390, height: 844 });
    await root.getByRole('button', { name: '适应视图', exact: true }).click();
    // Cytoscape's ResizeObserver updates its canvas after the viewport change.
    await page.waitForFunction(el => el.scrollWidth <= el.clientWidth + 2, await root.elementHandle(), { timeout: 5000 });
    const overflow = await root.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth,
        children: [...el.querySelectorAll('*')].filter(child => child.getBoundingClientRect().right > el.getBoundingClientRect().right + 2)
            .map(child => ({ tag: child.tagName, class: child.className, width: child.getBoundingClientRect().width })).slice(0, 12) }));
    assert(overflow.scroll <= overflow.width + 2, JSON.stringify(overflow));
    checks.push('390px layout has no horizontal overflow');
    if (process.argv[4]) await page.screenshot({ path: process.argv[4], fullPage: false });
    await page.reload(); await page.waitForFunction(() => !!window.Atria?.getContext && !document.getElementById('preloader'));
    await page.setViewportSize({ width: 1280, height: 900 }); await selectCharacter(); await open();
    state = await ledger(); assert(state.relations[edge].manualDisabled); assert.equal(Object.keys(state.corrections).length, 5);
    checks.push('reload preserves corrections and rejection');
    // Hold an inspector snapshot, mutate the source, then submit the real form.
    const details = root.locator('details').filter({ has: page.locator('form') }); await details.locator('summary').click();
    await root.getByLabel('操作', { exact: true }).selectOption('entity');
    await root.locator('[name="name"]').fill('Must not persist');
    await root.locator('[name="reason"]').fill('Stale inspector test');
    await page.evaluate(() => { window.Atria.getContext().chat[0].mes += ' Changed while reviewing.'; });
    await root.getByRole('button', { name: '保存修正', exact: true }).click();
    await root.getByRole('status').filter({ hasText: '未完成' }).waitFor();
    assert.equal(Object.keys((await ledger()).corrections).length, 5);
    checks.push('stale inspector refuses writes');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ browser: browser.version(), checks, pageErrors: errors }, null, 2));
} finally { await browser.close(); }
