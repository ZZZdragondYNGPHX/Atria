import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { bootstrapCustomBackend, appendConnectionProfile, markOnboarded, writeWorldBook } from '../_lib/fixtures.js';
import { startMockLLM } from '../_lib/mockLLM.js';
import { awaitMainUI } from '../_lib/page.js';
import { openWorldInfoDrawer, selectWorldBook } from '../_lib/ui-worldinfo.js';
import { startWorldInfoServer, tearDownWorldInfoServer } from './_helpers.js';

test.describe.configure({ mode: 'serial' });

let server;
let mock;

const BOOK_NAME = 'workspace-scale-book';
const ENTRY_COUNT = 1000;
const ENTRIES = Array.from({ length: ENTRY_COUNT }, (_, uid) => ({
    key: uid === 1 ? [] : [`workspace-key-${uid}`],
    keysecondary: uid % 13 === 0 ? [`secondary-${uid}`] : [],
    comment: `workspace-entry-${uid}`,
    content: uid === 1 ? '' : `Workspace synthetic content ${uid}.`,
    order: 100 + uid,
    depth: 4,
    probability: 100,
    ...(uid === 2 ? {
        stateConditions: [{ providerId: 'mvu', path: ['scene', 'phase'], operator: 'eq', value: 'night' }],
        stateActivation: true,
    } : {}),
}));

function readBook(dataRoot) {
    return JSON.parse(readFileSync(resolve(dataRoot, 'default-user', 'worlds', `${BOOK_NAME}.json`), 'utf8'));
}

async function activateBookFromLibrary(page) {
    await page.locator('[data-wi-workspace-view="library"]').click();
    const item = page.locator('.world_info_manager_item', { hasText: BOOK_NAME }).first();
    await item.waitFor({ state: 'visible', timeout: 10_000 });
    const toggle = item.locator('.world_info_manager_toggle');
    const active = await toggle.evaluate(el => el.classList.contains('is-active'));
    if (!active) await toggle.click();
}

async function openEntries(page) {
    await selectWorldBook(page, BOOK_NAME);
    await page.locator('#wi_workspace_entries.is-active').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('#wi_workspace_entry_list_canvas .wi-workspace-entry-row').first()
        .waitFor({ state: 'visible', timeout: 10_000 });
}

test.beforeAll(async () => {
    mock = await startMockLLM();
    server = await startWorldInfoServer({ specBaseName: '34-workspace-ui', scenarioId: 'workspace' });
    markOnboarded({ dataRoot: server.dataRoot });
    bootstrapCustomBackend({ dataRoot: server.dataRoot, baseURL: mock.baseURL });
    appendConnectionProfile({ dataRoot: server.dataRoot, baseURL: mock.baseURL });
    writeWorldBook({ dataRoot: server.dataRoot, name: BOOK_NAME, entries: ENTRIES });
});

test.afterAll(async () => {
    await tearDownWorldInfoServer(server);
    await mock?.stop();
});

test('desktop workspace uses Library / Entries / Global Rules and bounded list rendering', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await awaitMainUI(page, server.baseURL);
    await openWorldInfoDrawer(page);

    const shell = page.locator('#wi_workspace_shell');
    await expect(shell).toBeVisible();
    await expect(page.locator('[data-wi-workspace-view="library"]')).toBeVisible();
    await expect(page.locator('[data-wi-workspace-view="entries"]')).toBeVisible();
    await expect(page.locator('[data-wi-workspace-view="global"]')).toBeVisible();

    await activateBookFromLibrary(page);
    await page.locator('[data-wi-workspace-view="global"]').click();
    await expect(page.locator('#wi_workspace_global')).toBeVisible();
    await expect(page.locator('.wi-global-rule-card')).toHaveCount(4);

    await openEntries(page);

    const listPane = page.locator('.wi-workspace-entry-list-pane');
    const inspector = page.locator('#wi_workspace_inspector');
    const [listBox, inspectorBox] = await Promise.all([listPane.boundingBox(), inspector.boundingBox()]);
    expect(listBox?.width || 0).toBeGreaterThan(250);
    expect(inspectorBox?.width || 0).toBeGreaterThan(400);
    expect((inspectorBox?.x || 0)).toBeGreaterThan((listBox?.x || 0));

    await expect(page.locator('#wi_workspace_entry_count')).toContainText('1000');

    const virtualRows = page.locator('#wi_workspace_entry_list_canvas .wi-workspace-entry-row');
    const renderedRowCount = await virtualRows.count();
    expect(renderedRowCount).toBeGreaterThan(0);
    expect(renderedRowCount).toBeLessThan(80);
    await expect(page.locator('#world_popup_entries_list .world_entry')).toHaveCount(0);

    // Desktop auto-selects the first entry and mounts exactly one real editor.
    await expect(page.locator('#wi_workspace_inspector_body .world_entry')).toHaveCount(1);
    await expect(page.locator('.wi-inspector-section')).toHaveCount(6);
    await expect(page.locator('.wi-inspector-section-basic')).toHaveAttribute('open', '');
    await expect(page.locator('.wi-inspector-section-activation')).toHaveAttribute('open', '');

    // Display modes.
    await page.locator('#wi_workspace_display_mode').selectOption('compact');
    await expect(inspector).toHaveAttribute('data-display-mode', 'compact');
    await expect(page.locator('.wi-inspector-section-advanced')).toBeHidden();

    await page.locator('#wi_workspace_display_mode').selectOption('full');
    await expect(inspector).toHaveAttribute('data-display-mode', 'full');
    expect(await page.locator('.wi-inspector-section').evaluateAll(nodes => nodes.every(node => node.open))).toBe(true);

    await page.locator('#wi_workspace_display_mode').selectOption('custom');
    await expect(page.locator('#wi_workspace_custom_fields')).toBeVisible();

    // Issues filter should isolate deterministic problems without rendering full editors.
    await page.locator('[data-wi-entry-filter="issues"]').click();
    await expect(page.locator('#wi_workspace_entry_count')).toContainText('1 entry');
    await expect(page.locator('#wi_workspace_entry_list_canvas .wi-workspace-entry-row')).toHaveCount(1);
    await expect(page.locator('#wi_workspace_entry_list_canvas .wi-workspace-entry-row')).toContainText('workspace-entry-1');

    await page.locator('[data-wi-entry-filter="all"]').click();
    await expect(page.locator('#wi_workspace_entry_count')).toContainText('1000');

    // Contextual bulk UI appears only after selection; two selections expose safe Bulk Inspector.
    await page.locator('#wi_workspace_entry_list_canvas .wi-workspace-entry-select').nth(0).check();
    await page.locator('#wi_workspace_entry_list_canvas .wi-workspace-entry-select').nth(1).check();
    await expect(page.locator('#world_entry_bulk_toolbar')).toBeVisible();
    await expect(page.locator('#wi_workspace_bulk_inspector')).toBeVisible();
    await expect(page.locator('#wi_workspace_bulk_inspector')).toContainText('Keep unchanged');
    await page.locator('#world_entries_clear_selection').click();
    await expect(page.locator('#world_entry_bulk_toolbar')).toBeHidden();

    // Relationship picker persists the existing underlying reference format.
    await page.locator('#wi_workspace_entry_list_canvas .wi-workspace-entry-row[data-uid="0"]').click();
    const relationships = page.locator('.wi-inspector-section-relationships');
    await relationships.locator('> summary').click();
    const relationDrawer = relationships.locator('.wi-entry-selection-strategy');
    const relationContent = relationDrawer.locator('> .inline-drawer-content');
    if (!(await relationContent.isVisible())) {
        await relationDrawer.locator('> .inline-drawer-toggle').click();
    }
    const relatedPicker = relationDrawer.locator('.wi-relationship-picker[data-kind="related"]');
    await expect(relatedPicker).toBeVisible();
    await relatedPicker.locator('input[type="search"]').fill('#1 · workspace-entry-1');
    await relatedPicker.getByRole('button', { name: 'Add' }).click();
    await relationDrawer.locator('.wi-selection-strategy-save').click();
    await page.waitForTimeout(500);
    expect(readBook(server.dataRoot).entries['0'].extensions?.atria_related_entries).toContain('1');

    // Test Activation uses the existing dry-run and always produces an honest result surface.
    await page.locator('#wi_workspace_test_activation').click();
    await expect(page.locator('#wi_workspace_activation_result')).toBeVisible();
    await expect(page.locator('#wi_workspace_activation_result')).not.toHaveText('');

    // Continuous Cards restores the compatibility editor but remains bounded by pagination.
    await page.locator('#wi_workspace_continuous_cards').click();
    await expect(page.locator('#wi_workspace_cards')).toBeVisible();
    await page.locator('#world_popup_entries_list .world_entry').first().waitFor({ state: 'visible', timeout: 10_000 });
    const cards = await page.locator('#world_popup_entries_list .world_entry').count();
    expect(cards).toBeGreaterThan(0);
    expect(cards).toBeLessThanOrEqual(25);
});

test('mobile workspace uses drill-down instead of squeezed split panes', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await awaitMainUI(page, server.baseURL);
    await openWorldInfoDrawer(page);

    const drawerBox = await page.locator('#WorldInfo').boundingBox();
    expect(drawerBox?.width || 0).toBeGreaterThanOrEqual(380);
    expect(drawerBox?.height || 0).toBeGreaterThanOrEqual(800);

    await openEntries(page);
    await expect(page.locator('.wi-workspace-entry-list-pane')).toBeVisible();
    await expect(page.locator('#wi_workspace_inspector')).toBeHidden();

    await page.locator('#wi_workspace_entry_list_canvas .wi-workspace-entry-row').first().click();
    await expect(page.locator('#wi_workspace_inspector')).toBeVisible();
    await expect(page.locator('.wi-workspace-entry-list-pane')).toBeHidden();
    await expect(page.locator('#wi_workspace_mobile_back')).toBeVisible();

    await page.locator('#wi_workspace_mobile_back').click();
    await expect(page.locator('.wi-workspace-entry-list-pane')).toBeVisible();
    await expect(page.locator('#wi_workspace_inspector')).toBeHidden();

    // Full-screen mobile keeps an in-workspace close action because the
    // external drawer launcher is covered by the workspace itself.
    await page.locator('#wi_workspace_close').click();
    await expect(page.locator('#WorldInfo')).toBeHidden();
});
