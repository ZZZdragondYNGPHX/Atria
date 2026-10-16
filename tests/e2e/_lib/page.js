// Shared helpers used by current product tests.
export async function awaitMainUI(page, baseURL) {
    const startupErrors = [];
    const onPageError = error => startupErrors.push(`pageerror: ${error?.message || error}`);
    const onConsole = message => {
        if (message.type() === 'error') startupErrors.push(`console: ${message.text()}`);
    };
    page.on('pageerror', onPageError);
    page.on('console', onConsole);

    await page.goto(baseURL || '/');
    const gate = page.locator('#userList .userSelect:last-child');
    try {
        await gate.waitFor({ state: 'visible', timeout: 2000 });
    } catch (error) { if (error.name !== 'TimeoutError') throw error; }
    if (await gate.isVisible()) await gate.click();

    try {
        await page.waitForFunction(
            () => document.getElementById('preloader') === null && !!window.Atria?.getContext,
            undefined,
            { timeout: 30_000 },
        );
    } catch (error) {
        const state = await page.evaluate(() => ({
            href: location.href,
            preloaderPresent: document.getElementById('preloader') !== null,
            atriaPresent: Boolean(window.Atria),
            hasGetContext: Boolean(window.Atria?.getContext),
        })).catch(() => ({ href: page.url() }));
        const details = startupErrors.slice(-12).join('\n') || 'no browser console/page errors captured';
        throw new Error(
            `Atria UI failed to boot within 30s: ${JSON.stringify(state)}\n${details}`,
            { cause: error },
        );
    } finally {
        page.off('pageerror', onPageError);
        page.off('console', onConsole);
    }

    // Fresh per-spec data roots can surface the first-run "Welcome to
    // Atria" persona setup dialog after the preloader is gone. It overlays
    // the navbar/account controls used by storage/backup E2E flows, so
    // complete the standard first-run step before declaring the main UI ready.
    try {
        const onboarding = page.locator('dialog.popup[open]').filter({
            has: page.locator('#onboarding_ui_language_select'),
        }).first();
        await onboarding.waitFor({ state: 'visible', timeout: 1500 });
        await onboarding.locator('.popup-button-ok').first().click();
        await onboarding.waitFor({ state: 'hidden', timeout: 5000 });
    } catch { /* already configured / no onboarding */ }


}

export async function reloadAndAwait(page, baseURL) {
    return awaitMainUI(page, baseURL);
}

export async function openExtensionsDrawer(page) {
    const openedByShell = await page.evaluate(() => {
        const shell = window.Atria?.shell;
        const workspaceHost = shell?.getWorkspaceHost?.();
        if (!shell?.isMounted?.() || typeof workspaceHost?.openUtility !== 'function') {
            return false;
        }
        workspaceHost.openUtility('plugins');
        return true;
    }).catch(() => false);

    if (openedByShell) {
        // Compatibility settings are intentionally nested inside the explicit
        // legacy island. Open both disclosure levels using real UI gestures.
        const legacy = page.locator('[data-atria-legacy-plugins="true"]');
        await legacy.waitFor({ state: 'visible', timeout: 10_000 });
        if (!await legacy.evaluate(el => el.open)) await legacy.locator('> summary').click();
        const compatibility = page.locator('[data-atria-plugin-compatibility="true"]');
        await compatibility.waitFor({ state: 'visible', timeout: 10_000 });
        if (!await compatibility.evaluate(el => el.open).catch(() => false)) {
            await compatibility.locator('> summary').click();
        }
        await page.locator('#extensions_settings').waitFor({ state: 'visible', timeout: 10_000 });
        return;
    }

    const block = page.locator('#rm_extensions_block');
    const isOpen = await block.evaluate(el => el && !el.classList.contains('closedDrawer')).catch(() => false);
    if (isOpen) return;
    await page.locator('#extensions-settings-button .drawer-toggle').first().click();
    await block.waitFor({ state: 'visible', timeout: 5000 });
}

export async function closeAnyOpenTopSettingsDrawer(page) {
    const hadOpen = await page.evaluate(() => {
        const opens = document.querySelectorAll('#top-settings-holder .drawer-content.openDrawer:not(.pinnedOpen)');
        if (!opens.length) return false;
        for (const drawer of opens) {
            const wrapper = drawer.closest('.drawer');
            const toggle = wrapper?.querySelector(':scope > .drawer-toggle');
            toggle?.click();
        }
        return true;
    });
    if (hadOpen) {
        // Wait briefly for the close animation/state to settle.
        await page.waitForFunction(() => {
            return document.querySelectorAll('#top-settings-holder .drawer-content.openDrawer:not(.pinnedOpen)').length === 0;
        }, { timeout: 3000 }).catch(() => {});
    }
}

export async function openInlineDrawer(page, hostId) {
    const host = page.locator(`#${hostId}`);
    await host.waitFor({ state: 'attached', timeout: 5000 });
    // Most extension modules mount their HTML as `<div id="hostId">
    // <div class="inline-drawer">...</div></div>` (host is the direct
    // parent), but some wrap one more level (e.g.
    // `#translation_container > .translation_settings > .inline-drawer`,
    // `#regex_container > .regex_settings > .inline-drawer`). Look for
    // a direct child first; fall back to first descendant otherwise.
    let drawer = host.locator('> .inline-drawer').first();
    if ((await drawer.count().catch(() => 0)) === 0) {
        drawer = host.locator('.inline-drawer').first();
    }
    const content = drawer.locator('> .inline-drawer-content');
    const isHidden = await content.evaluate(el => {
        if (!el) return true;
        const style = el.style.display;
        if (style === 'none') return true;
        if (style === 'block' || style === '') {
            const computed = window.getComputedStyle(el);
            return computed.display === 'none';
        }
        return false;
    }).catch(() => true);
    if (!isHidden) return;
    await drawer.locator('> .inline-drawer-toggle').first().click();
    await content.waitFor({ state: 'visible', timeout: 5000 });
}

export async function selectCharacterByName(page, name) {
    // Dismiss onboarding modal if it ever flashes.
    const onboardingHeader = page.locator('.popup', { hasText: /Welcome to Atria|歡迎使用|欢迎使用/ }).first();
    if (await onboardingHeader.isVisible().catch(() => false)) {
        await page.locator('.popup .popup-button-cancel, .popup .popup-button-ok').first().click().catch(() => {});
        await onboardingHeader.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
    }

    const selectedThroughCompatibilityAbi = await page.evaluate(async (wantName) => {
        const shell = window.Atria?.shell;
        if (!shell?.isMounted?.()) return false;

        // N9/N10 retired Characters as Product Library authority. Legacy
        // World Info regression tests still need a non-Native Character host,
        // so use the retained ST compatibility ABI directly rather than
        // reopening the retired Library route.
        const ctx = window.Atria?.getContext?.();
        const idx = ctx?.characters?.findIndex(character => character?.name === wantName) ?? -1;
        if (idx < 0 || typeof ctx?.selectCharacterById !== 'function') {
            throw new Error(`character "${wantName}" not present in compatibility host`);
        }
        await ctx.selectCharacterById(idx, { switchMenu: false });
        return true;
    }, name).catch(() => false);

    if (!selectedThroughCompatibilityAbi) {
        const drawer = page.locator('#rightNavDrawerIcon');
        const drawerClosed = await drawer.evaluate(el => el.classList.contains('closedIcon')).catch(() => true);
        if (drawerClosed) await drawer.click();

        // If a prior character was already selected, the character surface is
        // showing the character-edit panel rather than the list. Click the
        // "Characters" sub-panel button so #rm_print_characters_block becomes
        // visible again.
        const listVisible = await page.locator('#rm_print_characters_block:visible').count().catch(() => 0);
        if (!listVisible) {
            await page.evaluate(() => {
                const btn = document.querySelector('#rm_button_characters');
                if (btn) btn.click();
            });
            await page.locator('#rm_print_characters_block').waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
        }

        const charBlock = page.locator('#rm_print_characters_block');
        await charBlock.waitFor({ state: 'visible', timeout: 10_000 });

        const card = charBlock.locator('.character_select', { hasText: name }).first();
        await card.waitFor({ state: 'visible', timeout: 10_000 });
        await card.click();
    }

    await page.waitForFunction(() => {
        const ctx = window.Atria?.getContext?.();
        return ctx && (typeof ctx.characterId === 'number' || typeof ctx.characterId === 'string');
    }, { timeout: 10_000 }).catch(() => { /* welcome panel ok */ });

    // Selecting a character opens the character editor panel inside the
    // right drawer, which then overlays the chat composer. Close the
    // drawer so subsequent send-area gestures aren't intercepted by the
    // character_name_pole / description_textarea inputs. The drawer
    // toggle is idempotent — clicking it again folds the panel away.
    await closeRightNavDrawer(page);
}

export async function closeRightNavDrawer(page) {
    const isOpen = await page.evaluate(() => {
        const i = document.querySelector('#rightNavDrawerIcon');
        return i && i.classList.contains('openIcon');
    });
    if (isOpen) {
        // jQuery click() is what ST's drawer handlers listen for; dispatch
        // a real MouseEvent on the icon's drawer-toggle ancestor so the
        // .on('click', ...) bound handler runs.
        await page.evaluate(() => {
            const i = document.querySelector('#rightNavDrawerIcon');
            const toggle = i?.closest('.drawer-toggle') || i;
            toggle?.click();
        });
        await page.waitForFunction(() => {
            const i = document.querySelector('#rightNavDrawerIcon');
            return i && i.classList.contains('closedIcon');
        }, { timeout: 3000 }).catch(() => {});
    }
}

export async function sendMessageAndAwaitReply(page, text, { timeoutMs = 120_000 } = {}) {
    // The native Composer is Play-local under R7H. Tests may arrive here
    // after visiting Library, Plugins, Runtime, or another first-class
    // workspace, so route back through the one authoritative WorkspaceHost
    // before touching #send_textarea. Legacy recovery/non-Shell hosts are
    // unchanged.
    await page.evaluate(() => {
        const shell = window.Atria?.shell;
        const workspaceHost = shell?.getWorkspaceHost?.();
        if (shell?.isMounted?.() && typeof workspaceHost?.openPlay === 'function') {
            workspaceHost.openPlay();
        }
    });
    await page.locator('#send_textarea').waitFor({ state: 'visible', timeout: 10_000 });

    // GENERATION_ENDED fires after streaming flushes ctx.chat[id].mes —
    // safer than MESSAGE_RECEIVED, which fires before the streamed reply
    // content has fully replaced the "..." placeholder.
    const generationPromise = page.evaluate((to) => new Promise((resolve, reject) => {
        const ctx = window.Atria.getContext();
        const t = setTimeout(() => reject(new Error('reply timeout')), to);
        // GENERATION_ENDED's payload is chat.length (i.e. id+1) so we
        // return chat.length-1 as the new assistant message id.
        const off = ctx.eventSource.on(ctx.eventTypes.GENERATION_ENDED, (chatLength) => {
            clearTimeout(t);
            try { ctx.eventSource.removeListener(ctx.eventTypes.GENERATION_ENDED, off); } catch { /* Preserve the existing best-effort error handling. */ }
            resolve(Math.max(0, Number(chatLength) - 1));
        });
    }), timeoutMs);

    const textarea = page.locator('#send_textarea');
    await textarea.fill(text);
    await page.locator('#send_but:not(.displayNone)').waitFor({ state: 'visible', timeout: 30_000 });
    // Any drawer-content under #top-settings-holder that's currently in
    // the .openDrawer state sits on top of #send_but and intercepts the
    // click. Close them all (the standard .drawer-toggle handler) so the
    // click lands on the composer. This is idempotent / no-op when no
    // drawer is open.
    await closeAnyOpenTopSettingsDrawer(page);
    // Dispatch the click via JS so we bypass any residual overlay (e.g.
    // a popup that closed mid-flight, a drawer mid-animation). The
    // #send_but element's bound handler reads from #send_textarea, which
    // we already filled.
    await page.evaluate(() => {
        const btn = document.querySelector('#send_but');
        if (!btn) throw new Error('#send_but not present');
        btn.click();
    });

    const replyId = await generationPromise;
    // Read the rendered DOM, not ctx.chat — that's the whole point.
    const replyText = await page.locator(`.mes[mesid="${replyId}"] .mes_text`).first().innerText({ timeout: 30_000 });
    return { replyId, text: replyText };
}

export async function editMessageViaUI(page, mesid, newText) {
    const mes = page.locator(`.mes[mesid="${mesid}"]`);
    await mes.waitFor({ state: 'visible', timeout: 10_000 });
    // The .mes_edit pencil lives inside the message; hovering reveals it
    // but force:true is enough here since we only care about the click.
    await mes.locator('.mes_edit').first().click({ force: true });
    const editArea = mes.locator('.edit_textarea, .mes_text').first();
    await editArea.waitFor({ state: 'visible', timeout: 5000 });
    // .mes_text becomes contenteditable; .fill works on textarea elements
    // only, so for the contenteditable path we select-all + type.
    const isTextarea = await editArea.evaluate(el => el.tagName.toLowerCase() === 'textarea').catch(() => false);
    if (isTextarea) {
        await editArea.fill(newText);
    } else {
        await editArea.click();
        await editArea.press('ControlOrMeta+a');
        await editArea.press('Delete');
        await editArea.type(newText);
    }
    // Listen for MESSAGE_EDITED before clicking confirm so we don't race
    // the save → re-render cycle.
    const editPromise = page.evaluate(() => new Promise((resolve, reject) => {
        const ctx = window.Atria.getContext();
        const t = setTimeout(() => reject(new Error('edit timeout')), 15_000);
        const off = ctx.eventSource.on(ctx.eventTypes.MESSAGE_EDITED, (id) => {
            clearTimeout(t);
            try { ctx.eventSource.removeListener(ctx.eventTypes.MESSAGE_EDITED, off); } catch { /* Preserve the existing best-effort error handling. */ }
            resolve(id);
        });
    }));
    await mes.locator('.mes_edit_done').first().click();
    await editPromise;
}

export async function openOptionsAndClick(page, optionId) {
    await page.locator('#options_button').click();
    const item = page.locator(`#${optionId}`);
    await item.waitFor({ state: 'visible', timeout: 5000 });
    await item.click();
    // Close the dropdown if it's still showing.
    await page.evaluate(() => {
        const opts = document.querySelector('#options');
        if (opts && opts.style.display !== 'none') opts.style.display = 'none';
    });
}

export async function continueViaUI(page, { timeoutMs = 120_000 } = {}) {
    const continuePromise = page.evaluate((to) => new Promise((resolve, reject) => {
        const ctx = window.Atria.getContext();
        const t = setTimeout(() => reject(new Error('continue timeout')), to);
        const off = ctx.eventSource.on(ctx.eventTypes.MESSAGE_RECEIVED, (id) => {
            clearTimeout(t);
            try { ctx.eventSource.removeListener(ctx.eventTypes.MESSAGE_RECEIVED, off); } catch { /* Preserve the existing best-effort error handling. */ }
            resolve(id);
        });
    }), timeoutMs);
    await openOptionsAndClick(page, 'option_continue');
    const id = await continuePromise;
    const text = await page.locator(`.mes[mesid="${id}"] .mes_text`).first().innerText({ timeout: 30_000 });
    return { id, text };
}

export async function branchFromMessageViaUI(page, mesid, { timeoutMs = 30_000 } = {}) {
    const mes = page.locator(`.mes[mesid="${mesid}"]`);
    await mes.waitFor({ state: 'visible', timeout: 10_000 });
    // Reveal the extra mes buttons (ellipsis hint) so .mes_create_branch
    // is clickable, then click.
    await mes.locator('.extraMesButtonsHint').first().click({ force: true });
    const branchBtn = mes.locator('.mes_create_branch').first();
    await branchBtn.waitFor({ state: 'visible', timeout: 5000 });
    const chatPromise = page.evaluate((to) => new Promise((resolve, reject) => {
        const ctx = window.Atria.getContext();
        const t = setTimeout(() => reject(new Error('branch timeout')), to);
        const off = ctx.eventSource.on(ctx.eventTypes.CHAT_CHANGED, (id) => {
            clearTimeout(t);
            try { ctx.eventSource.removeListener(ctx.eventTypes.CHAT_CHANGED, off); } catch { /* Preserve the existing best-effort error handling. */ }
            resolve(id);
        });
    }), timeoutMs);
    await branchBtn.click();
    return chatPromise;
}

export async function abortGenerationViaUI(page, { timeoutMs = 10_000 } = {}) {
    const stop = page.locator('#mes_stop');
    await stop.waitFor({ state: 'visible', timeout: timeoutMs });
    await stop.click();
}

export async function fillTopmostPopupAndAccept(page, text, { timeoutMs = 5000 } = {}) {
    const popup = page.locator('.popup:visible').last();
    await popup.waitFor({ state: 'visible', timeout: timeoutMs });
    const input = popup.locator('input[type="text"], textarea').first();
    await input.waitFor({ state: 'visible', timeout: timeoutMs });
    await input.fill(text);
    await popup.locator('.popup-button-ok').first().click();
}
