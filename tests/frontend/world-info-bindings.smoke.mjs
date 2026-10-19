// Original Browser World Info bindings; no model sender or legacy Agent mode.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createBlankCharacter } from '../e2e/_lib/ui-character.js';

const browser = await chromium.launch({ headless: true, channel: process.env.ATRIA_TEST_BROWSER_CHANNEL || undefined });
try {
    const page = await browser.newPage();
    await page.goto(process.argv[2]);
    await page.waitForFunction(() => window.Atria?.getContext && !document.getElementById('preloader'));
    const onboarding = page.locator('dialog[open]').filter({ has: page.locator('#onboarding_ui_language_select') });
    if (await onboarding.count()) {
        await onboarding.locator('textarea').fill('World Info regression');
        await onboarding.locator('.popup-button-ok').click();
        await onboarding.waitFor({ state: 'hidden' });
    }
    const name = `World Info bindings ${Date.now()}`;
    await createBlankCharacter(page, { name, firstmes: 'A test scene.' });
    await page.locator('#rm_print_characters_block .character_select').filter({ hasText: name }).click();
    await page.waitForFunction(name => window.Atria.getContext().characters[window.Atria.getContext().characterId]?.name === name, name);
    const result = await page.evaluate(async () => {
        const ctx = window.Atria.getContext();
        const wi = await import('/scripts/world-info.js');
        const books = ['agenda_main', '__MEMORY_GRAPH__', 'agenda_extra', 'agenda_chat', 'agenda_global'];
        for (const [index, book] of books.entries()) {
            await ctx.saveWorldInfo(book, { entries: { 0: { ...ctx.worldInfoEntry.template, uid: 0, key: [], constant: true,
                disable: false, order: 100, position: index === 2 ? 4 : 0, content: `FIXTURE_BOOK_${index}`, probability: 100, useProbability: false } } }, true);
        }
        await ctx.updateWorldInfoList();
        ctx.characters[ctx.characterId].data.extensions.world = books[0];
        wi.world_info.charLore ||= [];
        wi.world_info.charLore.push({ name: ctx.getCharaFilename(ctx.characterId), extraBooks: [books[1], books[2]] });
        ctx.chatWorldInfo.setSelection([books[3]]);
        await ctx.worldInfoEntry.setGlobalSelection(books[4], true, { save: false });
        await ctx.worldInfoEntry.setGlobalSelection(books[1], true, { save: false }); // duplicated global + character binding must survive
        const normal = await ctx.resolveWorldInfoForMessages([{ role: 'user', content: 'Inspect this test scene.' }]);
        return { normalIncluded: books.map((_, i) => JSON.stringify(normal).includes(`FIXTURE_BOOK_${i}`)) };
    });
    assert.deepEqual(result.normalIncluded, [true, true, true, true, true]);
    console.log(JSON.stringify({ browser: browser.version(), ...result }, null, 2));
} finally { await browser.close(); }
