// Shared helpers used by current product tests.
async function ensureRightDrawerOpen(page) {
    const openedByShell = await page.evaluate(() => {
        const shell = window.Atria?.shell;
        const workspaceHost = shell?.getWorkspaceHost?.();
        if (!shell?.isMounted?.() || typeof workspaceHost?.openLibrarySection !== 'function') {
            return false;
        }
        workspaceHost.openLibrarySection('characters');
        return true;
    }).catch(() => false);

    if (openedByShell) {
        await page.locator('#rm_print_characters_block').waitFor({ state: 'visible', timeout: 10_000 });
        return;
    }

    const drawer = page.locator('#rightNavDrawerIcon');
    const closed = await drawer.evaluate(el => el.classList.contains('closedIcon')).catch(() => true);
    if (closed) {
        await drawer.click();
        await page.locator('#rm_print_characters_block').waitFor({ state: 'visible', timeout: 10_000 });
    }
}

export async function createBlankCharacter(page, fields = {}) {
    await ensureRightDrawerOpen(page);
    await page.locator('#rm_button_create').click();
    const nameInput = page.locator('#character_name_pole');
    await nameInput.waitFor({ state: 'visible', timeout: 10_000 });
    if (fields.name) await nameInput.fill(fields.name);

    // Always-visible fields.
    const TOP_FIELDS = {
        description: '#description_textarea',
        firstmes: '#firstmessage_textarea',
        creator_notes: '#creator_notes_textarea',
        tags: '#tags_input',
    };
    for (const [key, sel] of Object.entries(TOP_FIELDS)) {
        if (fields[key] == null) continue;
        const loc = page.locator(sel);
        if (await loc.isVisible({ timeout: 800 }).catch(() => false)) {
            await loc.fill(String(fields[key]));
        }
    }

    // Advanced fields live in a popup opened by the "Advanced Definitions"
    // button (`#advanced_div_open` or similar). Only open it if needed.
    const ADV_FIELDS = ['personality', 'scenario', 'mes_example', 'system_prompt', 'post_history_instructions', 'creator', 'character_version'];
    const wantsAdv = ADV_FIELDS.some(k => fields[k] != null);
    if (wantsAdv) {
        const advTrigger = page.locator('#advanced_div_open, [data-action="open-advanced-def"], button:has-text("Advanced")').first();
        if (await advTrigger.isVisible({ timeout: 1500 }).catch(() => false)) {
            await advTrigger.click();
        }
        // Inline drawers within #advanced_div fold sections; expand any
        // that are closed so the textareas are visible to fill.
        await page.evaluate(() => {
            document.querySelectorAll('#advanced_div .inline-drawer-toggle, #advanced_div .inline-drawer-header').forEach(el => {
                const drawer = el.closest('.inline-drawer');
                const content = drawer?.querySelector('.inline-drawer-content');
                if (content && (content.style.display === 'none' || getComputedStyle(content).display === 'none')) {
                    el.click();
                }
            });
        });
        const ADV_MAP = {
            personality: '#personality_textarea',
            scenario: '#scenario_pole',
            mes_example: '#mes_example_textarea',
            system_prompt: '#system_prompt_textarea',
            post_history_instructions: '#post_history_instructions_textarea',
            creator: '#creator_textarea',
            character_version: '#character_version_textarea',
        };
        for (const [key, sel] of Object.entries(ADV_MAP)) {
            if (fields[key] == null) continue;
            const loc = page.locator(sel).first();
            if (await loc.isVisible({ timeout: 800 }).catch(() => false)) {
                await loc.fill(String(fields[key]));
            }
        }
    }

    // Submit via the visible label (the actual <input id="create_button">
    // is display:none in current builds).
    const submit = page.locator('#create_button_label').first();
    if (await submit.isVisible({ timeout: 1000 }).catch(() => false)) {
        await submit.click();
    } else {
        // Fallback to the input itself with force (older layouts).
        await page.locator('#create_button').click({ force: true });
    }
    if (fields.name) {
        const card = page.locator('#rm_print_characters_block .character_select', { hasText: fields.name }).first();
        await card.waitFor({ state: 'visible', timeout: 20_000 });
    }
}
