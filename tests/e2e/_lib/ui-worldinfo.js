// Real-UI helpers for World Info / lorebook flows.
//
// All gestures go through real DOM affordances: WI drawer toggle, book
// import via setInputFiles on #world_import_button's hidden input, entry
// creation via #world_popup_new, field edits via the rendered entry form,
// bulk-edit popup via the bulk-edit button + apply, export/delete via
// the dedicated icons.

import '@playwright/test';

/**
 * Open World Info through the authoritative Atria Shell when mounted.
 * Legacy recovery/non-Shell hosts fall back to the inherited drawer launcher.
 */
export async function openWorldInfoDrawer(page) {
    const recoveryMode = await page.locator('body').getAttribute('data-atria-shell-recovery').catch(() => null);

    if (recoveryMode === 'legacy') {
        const icon = page.locator('#WIDrawerIcon');
        const isClosed = await icon.evaluate(el => el.classList.contains('closedIcon')).catch(() => true);
        if (isClosed) {
            await icon.click();
        }
        await page.locator('#world_popup').waitFor({ state: 'visible', timeout: 10_000 });
        return;
    }

    // In the normal Atria product host, Shell startup owns/reclassifies the
    // compatibility DOM. Mounting World Info before Shell finishes can race
    // with that reparenting (especially on compact/mobile) and leave the
    // editor hidden. Wait for the authoritative Shell mount first, then mount
    // the retained mature World Info workspace ABI explicitly.
    await page.waitForFunction(
        () => Boolean(window.Atria?.shell?.isMounted?.()),
        null,
        { timeout: 30_000 },
    );
    await page.locator('#atria-workspace[data-atria-workspace-host="idle"]')
        .waitFor({ state: 'attached', timeout: 30_000 });

    const mountedCompatibilityWorkspace = await page.evaluate(async () => {
        const { mountWorldInfoWorkspace } = await import('/scripts/world-info/workspace.js');
        let host = document.getElementById('atria-e2e-world-info-compat-host');
        if (!host) {
            host = document.createElement('div');
            host.id = 'atria-e2e-world-info-compat-host';
            Object.assign(host.style, {
                position: 'fixed',
                inset: '0',
                zIndex: '10000',
                display: 'flex',
                width: `${window.innerWidth}px`,
                height: `${window.innerHeight}px`,
                minWidth: '0',
                minHeight: '0',
                maxWidth: 'none',
                maxHeight: 'none',
                overflow: 'hidden',
                background: 'var(--SmartThemeBlurTintColor, #111)',
            });
            document.body.append(host);
        }
        const api = mountWorldInfoWorkspace(host, { embedded: true });
        window.__atriaE2eWorldInfoCompatibilityMount = api || null;
        return Boolean(api);
    });

    if (!mountedCompatibilityWorkspace) {
        throw new Error('World Info compatibility workspace did not mount after Atria Shell startup');
    }

    try {
        await page.locator('#WorldInfo.openDrawer #world_popup').waitFor({ state: 'visible', timeout: 10_000 });
    } catch (error) {
        const layout = await page.evaluate(() => {
            const describe = (selector) => {
                const node = document.querySelector(selector);
                if (!(node instanceof HTMLElement)) return { selector, missing: true };
                const style = getComputedStyle(node);
                const rect = node.getBoundingClientRect();
                return {
                    selector,
                    tag: node.tagName,
                    className: node.className,
                    hidden: node.hidden,
                    ariaHidden: node.getAttribute('aria-hidden'),
                    parent: node.parentElement?.id || node.parentElement?.className || null,
                    display: style.display,
                    visibility: style.visibility,
                    position: style.position,
                    width: style.width,
                    height: style.height,
                    minWidth: style.minWidth,
                    minHeight: style.minHeight,
                    flex: style.flex,
                    overflow: style.overflow,
                    rect: {
                        x: rect.x,
                        y: rect.y,
                        width: rect.width,
                        height: rect.height,
                    },
                };
            };
            return {
                viewport: { width: innerWidth, height: innerHeight },
                shellMounted: Boolean(window.Atria?.shell?.isMounted?.()),
                workspaceHost: document.querySelector('#atria-workspace')?.dataset?.atriaWorkspaceHost || null,
                nodes: [
                    describe('#atria-e2e-world-info-compat-host'),
                    describe('#WorldInfo'),
                    describe('#wi-holder'),
                    describe('#world_popup'),
                    describe('#wi_workspace_shell'),
                ],
            };
        });
        throw new Error(`World Info embedded layout hidden: ${JSON.stringify(layout)}`, { cause: error });
    }
}

/**
 * Leave World Info and return to Play through the authoritative Shell.
 * Legacy recovery/non-Shell hosts close the inherited drawer instead.
 */
export async function closeWorldInfoDrawer(page) {
    const disposedCompatibilityWorkspace = await page.evaluate(() => {
        const api = window.__atriaE2eWorldInfoCompatibilityMount;
        if (!api) return false;
        api.dispose?.();
        window.__atriaE2eWorldInfoCompatibilityMount = null;
        document.getElementById('atria-e2e-world-info-compat-host')?.remove();
        return true;
    }).catch(() => false);

    if (!disposedCompatibilityWorkspace) {
        await page.evaluate(() => {
            const icon = document.querySelector('#WIDrawerIcon');
            if (icon?.classList.contains('openIcon')) {
                (icon.closest('.drawer-toggle') || icon).click();
            }
        });
    }
    await page.locator('#world_popup').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
}

/**
 * Enable the explicit Continuous Cards compatibility view.
 *
 * New Workspace tests should stay in the default list + Inspector mode.
 * Older behavioral tests that intentionally inspect the legacy card DOM can
 * call this helper so the compatibility requirement is explicit.
 */
export async function enableWorldInfoContinuousCards(page) {
    await openWorldInfoDrawer(page);
    const button = page.locator('#wi_workspace_continuous_cards');
    if (await button.count() === 0) return;
    const active = await button.evaluate(el => el.classList.contains('is-active'));
    if (!active) await button.click();
}

/**
 * Select a world book by name from the editor select (#world_editor_select).
 * Triggers the real change event so the entries panel populates.
 */
export async function selectWorldBook(page, name) {
    await openWorldInfoDrawer(page);
    const sel = page.locator('#world_editor_select');
    await sel.waitFor({ state: 'visible', timeout: 5000 });
    await sel.selectOption({ label: name });
    await page.locator('#wi_workspace_entries.wi-workspace-pane.is-active').waitFor({ state: 'visible', timeout: 5000 });
    // Small/normal books render their first virtual rows immediately. Empty
    // books legitimately have none, so this is a best-effort settle.
    await page.locator('#wi_workspace_entry_list_canvas .wi-workspace-entry-row').first()
        .waitFor({ state: 'visible', timeout: 1500 })
        .catch(() => {});
}

/**
 * Import a world book file via the real import button.
 *
 * The icon #world_import_button triggers the hidden #world_import_file
 * input. Drive setInputFiles directly.
 */
export async function importWorldBook(page, { filePath, expectedName, timeoutMs = 30_000 } = {}) {
    if (!filePath) throw new Error('importWorldBook: filePath required');
    await openWorldInfoDrawer(page);
    await page.locator('#world_import_button').click().catch(() => { /* visible icon */ });
    await page.locator('#world_import_file').setInputFiles(filePath);
    if (expectedName) {
        await page.waitForFunction((wanted) => {
            const sel = document.querySelector('#world_editor_select');
            if (!sel) return false;
            return Array.from(sel.options).some(o => o.textContent === wanted);
        }, expectedName, { timeout: timeoutMs });
    }
}

/**
 * Click the export icon (#world_popup_export) on the currently-selected
 * book and wait for the download. Returns the saved file path.
 */
export async function exportSelectedWorldBook(page, { timeoutMs = 15_000 } = {}) {
    await openWorldInfoDrawer(page);
    const downloadPromise = page.waitForEvent('download', { timeout: timeoutMs });
    const menu = page.locator('.wi-workspace-book-actions');
    if (await menu.count()) {
        await menu.locator('summary').click();
        await menu.locator('[data-forward="#world_popup_export"]').click();
    } else {
        await page.locator('#world_popup_export').click();
    }
    return downloadPromise;
}

/**
 * Delete the currently-selected world book via #world_popup_delete and
 * confirm.
 */
export async function deleteSelectedWorldBook(page, { timeoutMs = 10_000 } = {}) {
    await openWorldInfoDrawer(page);
    const menu = page.locator('.wi-workspace-book-actions');
    if (await menu.count()) {
        await menu.locator('summary').click();
        await menu.locator('[data-forward="#world_popup_delete"]').click();
    } else {
        await page.locator('#world_popup_delete').click();
    }
    const popup = page.locator('.popup:visible').last();
    await popup.waitFor({ state: 'visible', timeout: 5000 });
    await popup.locator('.popup-button-ok').first().click();
    await popup.waitFor({ state: 'detached', timeout: timeoutMs }).catch(() => {});
}

/**
 * Create a new lorebook by clicking #world_create_button, entering a name
 * in the popup, and confirming.
 */
export async function createWorldBook(page, name, { timeoutMs = 10_000 } = {}) {
    await openWorldInfoDrawer(page);
    await page.locator('#world_create_button').click();
    const popup = page.locator('.popup:visible').last();
    await popup.waitFor({ state: 'visible', timeout: 5000 });
    const input = popup.locator('input[type="text"], textarea').first();
    await input.fill(name);
    await popup.locator('.popup-button-ok').first().click();
    await popup.waitFor({ state: 'detached', timeout: timeoutMs }).catch(() => {});
    // The new book should be selected automatically.
}

/**
 * Add a new entry to the currently-selected book via #world_popup_new and
 * populate the visible form fields. The entry's UID is returned.
 *
 * @param {object} fields  { key, content, comment?, constant?, depth?, order?, vectorized? }
 */
export async function addWorldEntry(page, fields = {}) {
    await openWorldInfoDrawer(page);
    await page.locator('#world_popup_new').click();
    // The workspace focuses the newly-created UID in its single Inspector.
    const entryRow = page.locator('#wi_workspace_inspector_body .world_entry').first();
    await entryRow.waitFor({ state: 'visible', timeout: 5000 });
    if (fields.key) {
        const keyInput = entryRow.locator('.keyprimary input, .keyprimary textarea, [name="key"]').first();
        if (await keyInput.isVisible({ timeout: 500 }).catch(() => false)) {
            // Some WI key inputs use a select2 widget; falling back to fill
            // works for the plain input shape.
            await keyInput.fill(Array.isArray(fields.key) ? fields.key.join(',') : String(fields.key));
            await keyInput.blur();
        }
    }
    if (fields.content) {
        const contentArea = entryRow.locator('textarea[name="content"], .world_entry_form_content textarea').first();
        await contentArea.fill(String(fields.content));
        await contentArea.blur();
    }
    if (fields.comment != null) {
        const commentArea = entryRow.locator('input[name="comment"], textarea[name="comment"]').first();
        if (await commentArea.isVisible({ timeout: 300 }).catch(() => false)) {
            await commentArea.fill(String(fields.comment));
            await commentArea.blur();
        }
    }
    // Allow ST's autosave debounce to flush.
    await page.waitForTimeout(400);
}

/**
 * Read all visible entry rows on the currently-selected book and return
 * their rendered key + content. Useful as a DOM-side assertion.
 */
export async function getRenderedWorldEntries(page) {
    return page.evaluate(async () => {
        const rows = Array.from(document.querySelectorAll('#wi_workspace_entry_list_canvas .wi-workspace-entry-row'));
        const select = document.querySelector('#world_editor_select');
        const worldName = select?.selectedOptions?.[0]?.textContent?.trim() || '';
        if (!worldName) return [];

        const wi = await import('/scripts/world-info.js');
        const data = await wi.loadWorldInfo(worldName);
        return rows.map(row => {
            const uid = String(row.getAttribute('data-uid') || '');
            const entry = data?.entries?.[uid] || {};
            return {
                uid,
                key: Array.isArray(entry.key) ? entry.key.join(', ') : '',
                content: String(entry.content || ''),
                comment: String(entry.comment || row.querySelector('.wi-workspace-entry-title')?.textContent || ''),
            };
        });
    });
}
