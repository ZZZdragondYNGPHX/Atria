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

async function openBookFromLibrary(page) {
    await page.locator('[data-wi-workspace-view="library"]').click();
    const item = page.locator('.world_info_manager_item', { hasText: BOOK_NAME }).first();
    await item.waitFor({ state: 'visible', timeout: 10_000 });
    await item.locator('.world_info_manager_book_icon').click();
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

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        window.localStorage.setItem('atri_world_info_workspace_active_view', 'library');
        window.localStorage.setItem('atri_world_info_workspace_continuous_cards', 'false');
        window.localStorage.setItem('atri_world_info_workspace_display_mode', 'standard');
    });
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

    // Library is a book catalogue: the duplicated active-book strip is
    // demoted, and clicking the book card itself drills into its Entries.
    await expect(page.locator('#wi_workspace_library #world_info_manager_active_panel')).toBeHidden();
    const libraryCard = page.locator('#wi_workspace_library .world_info_manager_item', { hasText: BOOK_NAME }).first();
    await expect(libraryCard).toBeVisible();
    await libraryCard.locator('.world_info_manager_book_icon').click();
    await expect(page.locator('#wi_workspace_entries')).toHaveClass(/is-active/);
    await page.locator('[data-wi-workspace-view="library"]').click();

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
    // The list is virtualized, so operate on the first materialized row rather
    // than assuming a particular UID must be in the current viewport.
    const relationRow = page.locator('#wi_workspace_entry_list_canvas .wi-workspace-entry-row').first();
    const sourceUid = await relationRow.getAttribute('data-uid');
    await relationRow.click();

    const relationships = page.locator('.wi-inspector-section-relationships');
    await relationships.locator('> summary').click();
    const relationDrawer = relationships.locator('.wi-entry-selection-strategy');
    const relationContent = relationDrawer.locator('> .inline-drawer-content');
    if (!(await relationContent.isVisible())) {
        await relationDrawer.locator('> .inline-drawer-toggle').click();
    }
    const relatedPicker = relationDrawer.locator('.wi-relationship-picker[data-kind="related"]');
    await expect(relatedPicker).toBeVisible();

    const targetUid = sourceUid === '1' ? '2' : '1';
    await relatedPicker.locator('input[type="search"]').fill(`#${targetUid} · workspace-entry-${targetUid}`);
    await relatedPicker.getByRole('button', { name: 'Add' }).click();

    const rawRelatedEntries = relationDrawer.locator('textarea[name="relatedEntriesText"]');
    await expect(rawRelatedEntries).toHaveValue(targetUid);

    await relationDrawer.locator('.wi-selection-strategy-save').click();
    await expect(relationDrawer.locator('.wi-selection-strategy-status')).toContainText(/saved/i);
    await expect.poll(
        () => readBook(server.dataRoot).entries[sourceUid].relatedEntries,
        { timeout: 10_000 },
    ).toContain(targetUid);

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

    const workspaceGeometry = await page.locator('#WorldInfo').evaluate(node => {
        const rect = node.getBoundingClientRect();
        const parentRect = node.parentElement?.getBoundingClientRect();
        return {
            width: rect.width,
            height: rect.height,
            parentWidth: parentRect?.width || 0,
            parentHeight: parentRect?.height || 0,
        };
    });
    expect(workspaceGeometry.width).toBeGreaterThan(340);
    expect(workspaceGeometry.height).toBeGreaterThan(600);
    expect(Math.abs(workspaceGeometry.width - workspaceGeometry.parentWidth)).toBeLessThanOrEqual(2);
    expect(Math.abs(workspaceGeometry.height - workspaceGeometry.parentHeight)).toBeLessThanOrEqual(2);

    // Mobile starts as a real catalogue. The native book picker is not part
    // of the product navigation; selecting a book card opens its Entries.
    await page.locator('[data-wi-workspace-view="library"]').click();
    await expect(page.locator('#wi_workspace_library #world_info_manager_active_panel')).toBeHidden();
    await expect(page.locator('.wi-workspace-primary-toolbar .world_popup_primary_select')).toBeHidden();

    const mobileBookCard = page.locator('#wi_workspace_library .world_info_manager_item', { hasText: BOOK_NAME }).first();
    await expect(mobileBookCard.locator('.world_info_manager_toggle_label')).toHaveText(/Enable globally|Disable globally/);
    await expect(mobileBookCard.locator('.world_info_manager_item_meta')).toContainText(/Globally enabled|Not global/);
    await mobileBookCard.locator('.world_info_manager_more_button').click();
    await expect(mobileBookCard.locator('.world_info_manager_more_button')).toHaveAttribute('aria-expanded', 'true');
    const mobileBookDialog = page.locator('#WorldInfo > dialog.wi-worldbook-action-sheet-dialog[open]');
    await expect(mobileBookDialog).toBeVisible();
    const mobileBookMenu = mobileBookDialog.locator('.wi-worldbook-action-sheet-portal');
    await expect(mobileBookMenu).toBeVisible();
    expect(await mobileBookDialog.evaluate(node => node.parentElement?.id === 'WorldInfo')).toBe(true);
    const mobileMenuBox = await mobileBookMenu.boundingBox();
    expect(mobileMenuBox?.y || 0).toBeGreaterThan(300);
    expect((mobileMenuBox?.y || 0) + (mobileMenuBox?.height || 0)).toBeLessThanOrEqual(900);
    await expect(mobileBookMenu.locator('.world_info_manager_export')).toBeVisible();
    await expect(mobileBookMenu.locator('.world_info_manager_rename')).toBeVisible();
    await expect(mobileBookMenu.locator('.world_info_manager_duplicate')).toBeVisible();
    await mobileBookDialog.locator('.wi-worldbook-action-sheet-close').click();
    await expect(page.locator('#WorldInfo > dialog.wi-worldbook-action-sheet-dialog[open]')).toHaveCount(0);
    await expect(mobileBookCard.locator('.world_info_manager_more_button')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#WorldInfo')).toBeVisible();
    await expect(page.locator('#wi_workspace_library')).toHaveClass(/is-active/);
    await expect(page.locator('#WIMultiSelector .inline-drawer-content')).toBeVisible();

    // Advanced cross-book search survives the visual simplification behind
    // one compact filter menu instead of occupying a permanent second row.
    const librarySearchOptions = page.locator('.wi-library-mobile-search-options');
    const librarySearchTrigger = librarySearchOptions.locator('.wi-library-mobile-search-trigger');
    await expect(librarySearchTrigger).toBeVisible();
    await librarySearchTrigger.click();
    await expect(librarySearchTrigger).toHaveAttribute('aria-expanded', 'true');
    await expect(librarySearchOptions.locator('.wi-library-mobile-search-menu')).toBeVisible();
    await librarySearchOptions.locator('[data-control="entries"]').click();
    await expect(page.locator('#world_info_manager_search_entries')).toBeChecked();
    await librarySearchOptions.locator('[data-control="entries"]').click();
    await expect(page.locator('#world_info_manager_search_entries')).not.toBeChecked();

    await openBookFromLibrary(page);

    await expect(page.locator('.wi-workspace-entry-list-pane')).toBeVisible();
    await expect(page.locator('#wi_workspace_inspector')).toBeHidden();
    await expect(page.locator('.wi-workspace-primary-toolbar')).toBeHidden();
    await expect(page.locator('.world_popup_search_toolbar .world_popup_filter_group')).toBeHidden();
    await expect(page.locator('.wi-entry-mobile-search-options')).toBeVisible();
    await expect(page.locator('#world_info_pagination')).toBeHidden();

    const [searchBox, searchHelpBox, searchOptionsBox] = await Promise.all([
        page.locator('#world_info_search').boundingBox(),
        page.locator('#world_info_search_help').boundingBox(),
        page.locator('.wi-entry-mobile-search-trigger').boundingBox(),
    ]);
    expect((searchBox?.x || 0) + (searchBox?.width || 0)).toBeLessThanOrEqual((searchHelpBox?.x || 0) + 1);
    expect((searchHelpBox?.x || 0) + (searchHelpBox?.width || 0)).toBeLessThanOrEqual((searchOptionsBox?.x || 0) + 1);

    await page.locator('.wi-entry-mobile-search-trigger').click();
    await expect(page.locator('#wi_workspace_mobile_search_mode')).toBeVisible();
    await expect(page.locator('.wi-entry-mobile-search-menu [data-control="advanced"]')).toBeVisible();
    await page.locator('#wi_workspace_mobile_search_mode').selectOption('fuzzy');
    await expect(page.locator('#world_info_search_mode')).toHaveValue('fuzzy');
    await page.locator('#wi_workspace_mobile_search_mode').selectOption('keyword');
    await page.locator('.wi-entry-mobile-search-trigger').click();

    const [headerBox, listBox, navBox] = await Promise.all([
        page.locator('.wi-workspace-header').boundingBox(),
        page.locator('.wi-workspace-entry-list-pane').boundingBox(),
        page.locator('.wi-workspace-nav').boundingBox(),
    ]);
    expect(headerBox?.height || 0).toBeLessThan(70);
    expect(listBox?.height || 0).toBeGreaterThan(430);
    expect(navBox?.y || 0).toBeGreaterThan(760);

    await page.locator('#wi_workspace_entry_list_canvas .wi-workspace-entry-row').first().click();
    await expect(page.locator('#wi_workspace_inspector')).toBeVisible();
    await expect(page.locator('.wi-workspace-entry-list-pane')).toBeHidden();
    await expect(page.locator('#wi_workspace_mobile_back')).toBeVisible();
    await expect(page.locator('.wi-workspace-nav')).toBeHidden();
    await expect(page.locator('.wi-workspace-entries-toolbar')).toBeHidden();
    await expect(page.locator('.wi-workspace-entry-filterbar')).toBeHidden();

    const contentEditor = page.locator('#wi_workspace_inspector_body textarea[name="content"]');
    await expect(contentEditor).toBeVisible();
    const contentBox = await contentEditor.boundingBox();
    expect(contentBox?.height || 0).toBeGreaterThan(300);

    await page.locator('#wi_workspace_mobile_back').click();
    await expect(page.locator('.wi-workspace-entry-list-pane')).toBeVisible();
    await expect(page.locator('#wi_workspace_inspector')).toBeHidden();

    // Full-screen mobile keeps an in-workspace close action because the
    // external drawer launcher is covered by the workspace itself.
    await page.locator('#wi_workspace_close').click();
    await expect(page.locator('#WorldInfo')).toBeHidden();
});


test('Simplified Chinese localizes Workspace-owned World Info surfaces', async ({ page }) => {
    await page.addInitScript(() => {
        window.localStorage.setItem('language', 'zh-cn');
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await awaitMainUI(page, server.baseURL);
    await openWorldInfoDrawer(page);

    await expect(page.locator('[data-wi-workspace-view="library"]')).toContainText('书库');
    await expect(page.locator('[data-wi-workspace-view="entries"]')).toContainText('条目');
    await expect(page.locator('[data-wi-workspace-view="global"]')).toContainText('全局规则');
    await expect(page.locator('#wi_workspace_continuous_cards')).toContainText('连续卡片');
    await expect(page.locator('#wi_workspace_display_mode option[value="standard"]')).toHaveText('标准');

    await page.locator('[data-wi-workspace-view="library"]').click();
    const zhBookCard = page.locator('#wi_workspace_library .world_info_manager_item', { hasText: BOOK_NAME }).first();
    await expect(zhBookCard).toBeVisible();
    await expect(zhBookCard.locator('.world_info_manager_toggle_label')).toHaveText(/全局/);
    await zhBookCard.locator('.world_info_manager_more_button').click();
    await expect(zhBookCard.locator('.world_info_manager_more_button')).toHaveAttribute('aria-expanded', 'true');
    const zhBookMenu = zhBookCard.locator('.world_info_manager_item_menu');
    await expect(zhBookMenu).toBeVisible();
    await expect(zhBookMenu.locator('.world_info_manager_export')).toContainText('导出');
    await expect(zhBookMenu.locator('.world_info_manager_rename')).toContainText('重命名');
    await expect(zhBookMenu.locator('.world_info_manager_duplicate')).toContainText('复制');
    await zhBookCard.locator('.world_info_manager_more_button').click();

    await openEntries(page);

    await expect(page.locator('.wi-inspector-section-title')).toHaveCount(6);
    const sectionTitles = await page.locator('.wi-inspector-section-title').allTextContents();
    expect(sectionTitles).toEqual([
        '基本信息',
        '激活',
        '生命周期',
        '状态驱动',
        '条目关系',
        '高级',
    ]);

    await expect(page.locator('[data-wi-entry-filter="all"]')).toHaveText('全部');
    await expect(page.locator('[data-wi-entry-filter="enabled"]')).toHaveText('已启用');
    await expect(page.locator('[data-wi-entry-filter="special"]')).toHaveText('特殊');
    await expect(page.locator('[data-wi-entry-filter="issues"]')).toHaveText('问题');

    await page.locator('[data-wi-entry-filter="issues"]').click();
    const issueRow = page.locator('#wi_workspace_entry_list_canvas .wi-workspace-entry-row').first();
    await issueRow.click();
    await expect(page.locator('#wi_workspace_inspector_issues')).toContainText('内容为空。');
    await expect(page.locator('#wi_workspace_inspector_issues')).toContainText('普通关键词驱动条目没有主关键词。');

    const relationships = page.locator('.wi-inspector-section-relationships');
    await relationships.locator('> summary').click();
    await expect(relationships.locator('.wi-relationship-picker[data-kind="required"] input[type="search"]'))
        .toHaveAttribute('placeholder', '搜索必需条目…');
    await expect(relationships.locator('.wi-relationship-picker[data-kind="related"] input[type="search"]'))
        .toHaveAttribute('placeholder', '搜索关联条目…');

    await page.locator('[data-wi-workspace-view="global"]').click();
    await expect(page.locator('.wi-global-rule-card[data-rule-group="scanning"]')).toContainText('扫描');
    await expect(page.locator('.wi-global-rule-card[data-rule-group="budget"]')).toContainText('预算');
    await expect(page.locator('.wi-global-rule-card[data-rule-group="recursion"]')).toContainText('递归');
    await expect(page.locator('.wi-global-rule-card[data-rule-group="selection"]')).toContainText('选择 / 优先级');
});
