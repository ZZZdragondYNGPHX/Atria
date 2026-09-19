import { accountStorage } from '../util/AccountStorage.js';
import {
    filterWorldInfoWorkspaceEntries,
    getWorldInfoEntryIssues,
} from './diagnostics.js';

const DISPLAY_MODE_KEY = 'atri_world_info_workspace_display_mode';
const CONTINUOUS_CARDS_KEY = 'atri_world_info_workspace_continuous_cards';
const ACTIVE_VIEW_KEY = 'atri_world_info_workspace_active_view';

const DISPLAY_MODES = new Set(['compact', 'standard', 'full', 'custom']);
const WORKSPACE_VIEWS = new Set(['library', 'entries', 'global']);
const ROW_HEIGHT = 68;
const ROW_OVERSCAN = 6;

const state = {
    initialized: false,
    activeView: 'library',
    displayMode: 'standard',
    continuousCards: false,
    quickFilter: 'all',
    worldName: '',
    data: null,
    entries: [],
    selectedUid: '',
    selectedUids: new Set(),
    callbacks: {},
    renderToken: 0,
    listFrame: 0,
    mobileDetail: false,
};

function isMobileWorkspace() {
    return window.matchMedia?.('(max-width: 1000px)').matches ?? window.innerWidth <= 1000;
}

function normalizeDisplayMode(value) {
    return DISPLAY_MODES.has(String(value)) ? String(value) : 'standard';
}

function normalizeView(value) {
    return WORKSPACE_VIEWS.has(String(value)) ? String(value) : 'library';
}

function escapeText(value) {
    return String(value ?? '');
}

function entryTitle(entry) {
    const memo = escapeText(entry?.comment).trim();
    if (memo) return memo;
    const keys = Array.isArray(entry?.key) ? entry.key.map(value => escapeText(value).trim()).filter(Boolean) : [];
    return keys.slice(0, 2).join(', ') || `Entry #${escapeText(entry?.uid)}`;
}

function entryType(entry) {
    if (entry?.constant === true) return 'Constant';
    if (entry?.vectorized === true) return 'Vector';
    return 'Normal';
}

function entryKeywordSummary(entry) {
    const primary = Array.isArray(entry?.key) ? entry.key.map(value => escapeText(value).trim()).filter(Boolean) : [];
    if (primary.length === 0) return 'No primary keywords';
    const shown = primary.slice(0, 2).join(', ');
    return primary.length > 2 ? `${shown} +${primary.length - 2}` : shown;
}

function summarizeLifecycle(entry) {
    const parts = [];
    if (entry?.sticky != null && Number(entry.sticky) > 0) parts.push(`Sticky ${entry.sticky}`);
    if (entry?.cooldown != null && Number(entry.cooldown) > 0) parts.push(`Cooldown ${entry.cooldown}`);
    if (entry?.delay != null && Number(entry.delay) > 0) parts.push(`Delay ${entry.delay}`);
    if (entry?.excludeRecursion) parts.push('Non-recursable');
    if (entry?.preventRecursion) parts.push('Stops recursion');
    if (entry?.delayUntilRecursion) parts.push('Recursive only');
    return parts.join(' · ') || 'Defaults';
}

function summarizeState(entry) {
    const conditions = Array.isArray(entry?.stateConditions) ? entry.stateConditions.length : 0;
    const events = Array.isArray(entry?.stateEvents) ? entry.stateEvents.length : 0;
    const parts = [];
    if (conditions) parts.push(`${conditions} condition${conditions === 1 ? '' : 's'}`);
    if (events) parts.push(`${events} event${events === 1 ? '' : 's'}`);
    if (entry?.stateActivation) parts.push('persistent activation');
    return parts.join(' · ') || 'Not configured';
}

function summarizeRelationships(entry) {
    const required = Array.isArray(entry?.requiredEntries) ? entry.requiredEntries.length : 0;
    const related = Array.isArray(entry?.relatedEntries) ? entry.relatedEntries.length : 0;
    const parts = [];
    if (required) parts.push(`${required} required`);
    if (related) parts.push(`${related} related`);
    if (entry?.mutualExclusionGroup) parts.push(`Group ${entry.mutualExclusionGroup}`);
    if (entry?.budgetTier && entry.budgetTier !== 'normal') parts.push(entry.budgetTier);
    return parts.join(' · ') || 'Not configured';
}

function summarizeAdvanced(entry) {
    const parts = [];
    if (entry?.outletName) parts.push('Outlet');
    if (entry?.automationId) parts.push('Automation');
    if (entry?.group) parts.push('Inclusion group');
    if (entry?.scanDepth != null) parts.push('Scan override');
    if (entry?.caseSensitive != null) parts.push('Case override');
    if (entry?.matchWholeWords != null) parts.push('Word override');
    if (entry?.useGroupScoring != null) parts.push('Group scoring');
    return parts.length ? `${parts.length} override${parts.length === 1 ? '' : 's'}` : 'Defaults';
}

function makeSection({ key, title, summary, open = false }) {
    const details = document.createElement('details');
    details.className = `wi-inspector-section wi-inspector-section-${key}`;
    details.dataset.section = key;
    details.open = open;

    const heading = document.createElement('summary');
    heading.className = 'wi-inspector-section-heading';

    const titleEl = document.createElement('span');
    titleEl.className = 'wi-inspector-section-title';
    titleEl.textContent = title;

    const summaryEl = document.createElement('span');
    summaryEl.className = 'wi-inspector-section-summary';
    summaryEl.textContent = summary || '';

    heading.append(titleEl, summaryEl);

    const body = document.createElement('div');
    body.className = 'wi-inspector-section-body';

    details.append(heading, body);
    return { details, body };
}

function dispatchInput(element) {
    element.dispatchEvent(new Event('input', { bubbles: true }));
}

function makeRelationshipPicker(rawTextarea, kind) {
    if (!(rawTextarea instanceof HTMLTextAreaElement) || rawTextarea.dataset.workspacePicker === 'true') return;
    rawTextarea.dataset.workspacePicker = 'true';
    rawTextarea.classList.add('wi-relationship-raw');

    const wrapper = document.createElement('div');
    wrapper.className = 'wi-relationship-picker';
    wrapper.dataset.kind = kind;

    const chips = document.createElement('div');
    chips.className = 'wi-relationship-chips';

    const control = document.createElement('div');
    control.className = 'wi-relationship-picker-control';

    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'text_pole';
    input.placeholder = kind === 'required' ? 'Search required entry…' : 'Search related entry…';

    const listId = `wi-rel-${kind}-${Math.random().toString(36).slice(2)}`;
    input.setAttribute('list', listId);
    const datalist = document.createElement('datalist');
    datalist.id = listId;

    const labelToRef = new Map();
    const currentUid = String(state.selectedUid);
    for (const entry of state.entries) {
        const uid = String(entry?.uid ?? '');
        if (!uid || uid === currentUid) continue;
        const label = `#${uid} · ${entryTitle(entry)}`;
        labelToRef.set(label, uid);
        const option = document.createElement('option');
        option.value = label;
        datalist.append(option);
    }

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'menu_button menu_button_icon';
    add.innerHTML = '<i class="fa-solid fa-plus"></i><span>Add</span>';

    const readRefs = () => escapeText(rawTextarea.value)
        .split(/\r?\n/)
        .map(value => value.trim())
        .filter(Boolean);

    const labelForRef = (ref) => {
        const uid = ref.includes('#') ? ref.slice(ref.lastIndexOf('#') + 1) : ref;
        const match = state.entries.find(entry => String(entry?.uid ?? '') === String(uid));
        return match ? `#${ref} · ${entryTitle(match)}` : ref;
    };

    const writeRefs = refs => {
        rawTextarea.value = refs.join('\n');
        dispatchInput(rawTextarea);
        renderChips();
    };

    const renderChips = () => {
        chips.replaceChildren();
        for (const ref of readRefs()) {
            const chip = document.createElement('span');
            chip.className = 'wi-relationship-chip';

            const label = document.createElement('span');
            label.textContent = labelForRef(ref);

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'wi-relationship-chip-remove';
            remove.title = 'Remove';
            remove.setAttribute('aria-label', `Remove ${ref}`);
            remove.textContent = '×';
            remove.addEventListener('click', () => {
                writeRefs(readRefs().filter(value => value !== ref));
            });

            chip.append(label, remove);
            chips.append(chip);
        }
    };

    add.addEventListener('click', () => {
        const ref = labelToRef.get(input.value) || escapeText(input.value).trim();
        if (!ref) return;
        const refs = readRefs();
        if (!refs.includes(ref)) refs.push(ref);
        writeRefs(refs);
        input.value = '';
        input.focus();
    });

    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            add.click();
        }
    });

    control.append(input, datalist, add);
    wrapper.append(chips, control);
    rawTextarea.after(wrapper);
    renderChips();
}

function enhanceRelationshipEditor(root) {
    const selectionRoot = root.querySelector('.wi-entry-selection-strategy');
    if (!selectionRoot) return;
    makeRelationshipPicker(selectionRoot.querySelector('textarea[name="requiredEntriesText"]'), 'required');
    makeRelationshipPicker(selectionRoot.querySelector('textarea[name="relatedEntriesText"]'), 'related');
}

function buildInspectorSections(root, entry) {
    const edit = root.querySelector('.wi-entry-edit');
    if (!edit || edit.dataset.workspaceSections === 'true') return;
    edit.dataset.workspaceSections = 'true';

    const container = document.createElement('div');
    container.className = 'wi-inspector-sections';

    const basic = makeSection({
        key: 'basic',
        title: 'Basic',
        summary: `#${entry?.uid ?? ''} · ${entryType(entry)}`,
        open: true,
    });
    const activation = makeSection({
        key: 'activation',
        title: 'Activation',
        summary: entryKeywordSummary(entry),
        open: true,
    });
    const lifecycle = makeSection({
        key: 'lifecycle',
        title: 'Lifecycle',
        summary: summarizeLifecycle(entry),
    });
    const stateDriven = makeSection({
        key: 'state',
        title: 'State-driven',
        summary: summarizeState(entry),
    });
    const relationships = makeSection({
        key: 'relationships',
        title: 'Entry Relationships',
        summary: summarizeRelationships(entry),
    });
    const advanced = makeSection({
        key: 'advanced',
        title: 'Advanced',
        summary: summarizeAdvanced(entry),
    });

    const move = (selector, target) => {
        const node = edit.querySelector(selector);
        if (node) target.append(node);
    };

    // Recursion controls live inside the Content heading in the legacy
    // template. Detach them first so Lifecycle owns them before Content moves.
    move('.wi-entry-recursion-grid', lifecycle.body);

    move('.wi-entry-content-block', basic.body);
    move('.commentContainer', basic.body);

    move('.wi-entry-keywords-grid', activation.body);
    move('.wi-entry-filter-grid', activation.body);

    move('.wi-entry-timing-grid', lifecycle.body);

    move('.wi-entry-state-conditions', stateDriven.body);
    move('.wi-entry-state-events', stateDriven.body);

    move('.wi-entry-selection-strategy', relationships.body);

    move('.wi-entry-overrides-grid', advanced.body);
    move('.wi-entry-bottom-controls', advanced.body);
    move('.wi-entry-extra-sources', advanced.body);

    container.append(
        basic.details,
        activation.details,
        lifecycle.details,
        stateDriven.details,
        relationships.details,
        advanced.details,
    );

    const oldMain = edit.querySelector('.wi-entry-main-grid');
    const oldAdvanced = edit.querySelector('.wi-entry-advanced-settings');
    oldMain?.classList.add('displayNone');
    oldAdvanced?.classList.add('displayNone');
    edit.querySelectorAll(':scope > .wi-entry-section-title').forEach(node => node.classList.add('displayNone'));
    edit.prepend(container);

    enhanceRelationshipEditor(root);
    applyDisplayModeToInspector(root);
}

function renderInspectorIssues(entry) {
    const host = document.querySelector('#wi_workspace_inspector_issues');
    if (!host) return;
    const issues = getWorldInfoEntryIssues(entry, {
        worldName: state.worldName,
        entries: state.entries,
    });
    host.replaceChildren();
    host.classList.toggle('displayNone', issues.length === 0);

    if (!issues.length) return;
    const heading = document.createElement('strong');
    heading.textContent = `${issues.length} issue${issues.length === 1 ? '' : 's'}`;
    host.append(heading);
    const list = document.createElement('ul');
    for (const issue of issues) {
        const item = document.createElement('li');
        item.textContent = issue.message;
        item.dataset.severity = issue.severity;
        list.append(item);
    }
    host.append(list);
}

function applyDisplayModeToInspector(root = document.querySelector('#wi_workspace_inspector')) {
    if (!(root instanceof HTMLElement)) return;
    root.dataset.displayMode = state.displayMode;
    const sections = root.querySelectorAll('.wi-inspector-section');
    if (state.displayMode === 'full') {
        sections.forEach(section => { section.open = true; });
    } else if (state.displayMode === 'standard' || state.displayMode === 'custom') {
        sections.forEach(section => {
            const key = section.dataset.section;
            section.open = key === 'basic' || key === 'activation';
        });
    } else if (state.displayMode === 'compact') {
        sections.forEach(section => {
            const key = section.dataset.section;
            section.open = key === 'basic' || key === 'activation';
        });
    }

    const customButton = document.querySelector('#wi_workspace_custom_fields');
    customButton?.classList.toggle('displayNone', state.displayMode !== 'custom');
}

async function renderInspector(entry) {
    const host = document.querySelector('#wi_workspace_inspector_body');
    const empty = document.querySelector('#wi_workspace_inspector_empty');
    if (!host || !empty) return;

    const token = ++state.renderToken;
    host.replaceChildren();

    if (!entry) {
        empty.classList.remove('displayNone');
        renderInspectorIssues(null);
        return;
    }

    empty.classList.add('displayNone');
    renderInspectorIssues(entry);

    const title = document.querySelector('#wi_workspace_inspector_title');
    const meta = document.querySelector('#wi_workspace_inspector_meta');
    if (title) title.textContent = entryTitle(entry);
    if (meta) {
        meta.textContent = `#${entry.uid} · ${entryType(entry)} · Order ${Number(entry.order ?? 0)}`;
    }

    const callback = state.callbacks.renderInspector;
    if (typeof callback !== 'function') return;

    const result = await callback(entry, host);
    if (token !== state.renderToken) {
        result?.remove?.();
        return;
    }

    const root = result instanceof HTMLElement
        ? result
        : host.querySelector('.world_entry');
    if (root) {
        root.classList.add('wi-workspace-inspector-entry');
        buildInspectorSections(root, entry);
        const refreshAuthoringStatus = () => {
            renderInspectorIssues(entry);
            scheduleVirtualRows();
        };
        root.addEventListener('input', refreshAuthoringStatus);
        root.addEventListener('change', refreshAuthoringStatus);
    }
    applyDisplayModeToInspector();
}

function getFilteredEntries() {
    return filterWorldInfoWorkspaceEntries(state.entries, state.quickFilter, {
        worldName: state.worldName,
    });
}

function renderBadges(entry, issues) {
    const badges = [];
    badges.push(entryType(entry));
    if (entry?.disable === true) badges.push('Disabled');
    if (Array.isArray(entry?.stateConditions) && entry.stateConditions.length) badges.push('State');
    if (Array.isArray(entry?.stateEvents) && entry.stateEvents.length) badges.push('Event');
    if (
        (Array.isArray(entry?.requiredEntries) && entry.requiredEntries.length)
        || (Array.isArray(entry?.relatedEntries) && entry.relatedEntries.length)
    ) badges.push('Deps');
    if (entry?.budgetTier && entry.budgetTier !== 'normal') badges.push(entry.budgetTier);
    if (issues.length) badges.push(`Issues ${issues.length}`);
    return badges.slice(0, 5);
}

function renderVirtualRows() {
    state.listFrame = 0;
    const viewport = document.querySelector('#wi_workspace_entry_list');
    const canvas = document.querySelector('#wi_workspace_entry_list_canvas');
    const spacer = document.querySelector('#wi_workspace_entry_list_spacer');
    if (!viewport || !canvas || !spacer) return;

    const entries = getFilteredEntries();
    const total = entries.length;
    spacer.style.height = `${Math.max(1, total * ROW_HEIGHT)}px`;

    const height = viewport.clientHeight || 640;
    const start = Math.max(0, Math.floor(viewport.scrollTop / ROW_HEIGHT) - ROW_OVERSCAN);
    const end = Math.min(total, Math.ceil((viewport.scrollTop + height) / ROW_HEIGHT) + ROW_OVERSCAN);

    canvas.replaceChildren();
    for (let index = start; index < end; index++) {
        const entry = entries[index];
        const uid = String(entry?.uid ?? '');
        const issues = getWorldInfoEntryIssues(entry, {
            worldName: state.worldName,
            entries: state.entries,
        });

        const row = document.createElement('div');
        row.className = 'wi-workspace-entry-row';
        row.setAttribute('role', 'button');
        row.tabIndex = 0;
        row.dataset.uid = uid;
        row.style.transform = `translateY(${index * ROW_HEIGHT}px)`;
        row.classList.toggle('is-selected', uid === state.selectedUid);
        row.classList.toggle('is-disabled', entry?.disable === true);

        const select = document.createElement('input');
        select.type = 'checkbox';
        select.className = 'wi-workspace-entry-select';
        select.checked = state.selectedUids.has(uid);
        select.setAttribute('aria-label', `Select ${entryTitle(entry)}`);
        select.addEventListener('click', event => event.stopPropagation());
        select.addEventListener('change', event => {
            event.stopPropagation();
            state.callbacks.onSelectionChange?.(entry, select.checked);
        });

        const copy = document.createElement('span');
        copy.className = 'wi-workspace-entry-copy';

        const title = document.createElement('span');
        title.className = 'wi-workspace-entry-title';
        title.textContent = entryTitle(entry);

        const keyword = document.createElement('span');
        keyword.className = 'wi-workspace-entry-keywords';
        keyword.textContent = entryKeywordSummary(entry);

        const meta = document.createElement('span');
        meta.className = 'wi-workspace-entry-meta';
        meta.textContent = `#${uid} · Order ${Number(entry?.order ?? 0)}`;

        const badges = document.createElement('span');
        badges.className = 'wi-workspace-entry-badges';
        for (const value of renderBadges(entry, issues)) {
            const badge = document.createElement('span');
            badge.className = 'wi-workspace-badge';
            if (String(value).startsWith('Issues')) badge.classList.add('is-warning');
            if (value === 'Disabled') badge.classList.add('is-muted');
            badge.textContent = value;
            badges.append(badge);
        }

        copy.append(title, keyword, meta, badges);
        row.append(select, copy);
        row.addEventListener('click', () => selectWorkspaceEntry(entry));
        row.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectWorkspaceEntry(entry);
            }
        });
        canvas.append(row);
    }

    const count = document.querySelector('#wi_workspace_entry_count');
    if (count) count.textContent = `${total} entr${total === 1 ? 'y' : 'ies'}`;
}

function scheduleVirtualRows() {
    if (state.listFrame) return;
    state.listFrame = requestAnimationFrame(renderVirtualRows);
}

function selectWorkspaceEntry(entry, { render = true } = {}) {
    const uid = String(entry?.uid ?? '');
    if (!uid) return;
    state.selectedUid = uid;
    state.mobileDetail = isMobileWorkspace();
    syncMobileDrilldown();
    renderVirtualRows();
    if (render) void renderInspector(entry);
}

function syncMobileDrilldown() {
    const root = document.querySelector('#wi_workspace_shell');
    if (!root) return;
    root.classList.toggle('is-mobile-detail', isMobileWorkspace() && state.mobileDetail);
}

function renderBulkInspector() {
    const host = document.querySelector('#wi_workspace_bulk_inspector');
    if (!host) return;
    const count = state.selectedUids.size;
    if (count < 2) {
        host.classList.add('displayNone');
        return;
    }

    host.classList.remove('displayNone');
    host.querySelector('[data-role="count"]').textContent = String(count);
}

function syncSelectionUi() {
    renderBulkInspector();
    renderVirtualRows();
    const toolbar = document.querySelector('#world_entry_bulk_toolbar');
    toolbar?.classList.toggle('wi-workspace-bulk-active', state.selectedUids.size > 0);
}

function setView(view, { persist = true } = {}) {
    const next = normalizeView(view);
    state.activeView = next;
    if (persist) accountStorage.setItem(ACTIVE_VIEW_KEY, next);

    document.querySelectorAll('[data-wi-workspace-view]').forEach(button => {
        button.classList.toggle('is-active', button.dataset.wiWorkspaceView === next);
        button.setAttribute('aria-selected', String(button.dataset.wiWorkspaceView === next));
    });
    document.querySelectorAll('.wi-workspace-pane').forEach(pane => {
        pane.classList.toggle('is-active', pane.dataset.view === next);
    });

    if (next !== 'entries') {
        state.mobileDetail = false;
        syncMobileDrilldown();
    }
}

function setDisplayMode(mode) {
    state.displayMode = normalizeDisplayMode(mode);
    accountStorage.setItem(DISPLAY_MODE_KEY, state.displayMode);
    const select = document.querySelector('#wi_workspace_display_mode');
    if (select) select.value = state.displayMode;
    applyDisplayModeToInspector();
}

function setContinuousCards(enabled, { notify = true } = {}) {
    state.continuousCards = Boolean(enabled);
    accountStorage.setItem(CONTINUOUS_CARDS_KEY, String(state.continuousCards));

    document.querySelector('#wi_workspace_entries_split')?.classList.toggle('displayNone', state.continuousCards);
    document.querySelector('#wi_workspace_cards')?.classList.toggle('displayNone', !state.continuousCards);
    document.querySelector('#wi_workspace_continuous_cards')?.classList.toggle('is-active', state.continuousCards);

    if (notify) state.callbacks.onContinuousCardsChange?.(state.continuousCards);
}

function buildGlobalRulesPanels() {
    const root = document.querySelector('#wiActivationSettings');
    if (!(root instanceof HTMLElement) || root.dataset.workspaceGrouped === 'true') return;
    root.dataset.workspaceGrouped = 'true';

    const take = (id) => {
        const control = document.getElementById(id);
        if (!control) return null;
        if (control.matches('input[type="checkbox"]')) {
            return control.closest('#wiCheckboxes > label') || control.closest('label');
        }
        return control.closest('#wiSliders > div') || control.parentElement;
    };

    const sections = [
        {
            key: 'scanning',
            title: 'Scanning',
            description: 'How text is scanned and matched before entry-specific overrides.',
            ids: ['world_info_depth', 'world_info_include_names', 'world_info_case_sensitive', 'world_info_match_whole_words'],
        },
        {
            key: 'budget',
            title: 'Budget',
            description: 'How much prompt context World Info may consume.',
            ids: ['world_info_budget', 'world_info_budget_cap', 'world_info_overflow_alert'],
        },
        {
            key: 'recursion',
            title: 'Recursion',
            description: 'How recursive discovery proceeds and where it stops.',
            ids: ['world_info_recursive', 'world_info_min_activations', 'world_info_min_activations_depth_max', 'world_info_max_recursion_steps'],
        },
        {
            key: 'selection',
            title: 'Selection / Priority',
            description: 'Global ordering and scoring defaults.',
            ids: ['world_info_character_strategy', 'world_info_use_group_scoring'],
        },
    ];

    const grid = document.createElement('div');
    grid.className = 'wi-global-rules-grid';

    for (const section of sections) {
        const card = document.createElement('section');
        card.className = 'wi-global-rule-card';
        card.dataset.ruleGroup = section.key;

        const header = document.createElement('div');
        header.className = 'wi-global-rule-card-header';
        const title = document.createElement('strong');
        title.textContent = section.title;
        const description = document.createElement('small');
        description.className = 'opacity50p';
        description.textContent = section.description;
        header.append(title, description);

        const body = document.createElement('div');
        body.className = 'wi-global-rule-card-body';
        for (const id of section.ids) {
            const node = take(id);
            if (node) body.append(node);
        }

        card.append(header, body);
        grid.append(card);
    }

    root.querySelector('#wiSliders')?.remove();
    root.querySelector('#wiCheckboxes')?.remove();
    root.append(grid);
}

function buildWorkspaceDom() {
    const popup = document.querySelector('#world_popup');
    const topBlock = document.querySelector('#wiTopBlock');
    if (!popup || !topBlock || document.querySelector('#wi_workspace_shell')) return false;

    const primaryToolbar = popup.querySelector('.world_popup_primary_toolbar');
    const editorToolbar = popup.querySelector('.world_popup_editor_toolbar');
    const searchToolbar = popup.querySelector('.world_popup_search_toolbar');
    const bulkToolbar = popup.querySelector('#world_entry_bulk_toolbar');
    const cardsList = popup.querySelector('#world_popup_entries_list');
    const managerBlock = document.querySelector('#WIMultiSelector');
    const globalBlock = document.querySelector('#wiActivationSettings')?.closest('.range-block');

    const shell = document.createElement('div');
    shell.id = 'wi_workspace_shell';
    shell.className = 'wi-workspace-shell';
    shell.innerHTML = `
        <div class="wi-workspace-header">
            <div class="wi-workspace-nav" role="tablist" aria-label="World Info workspace">
                <button type="button" class="wi-workspace-nav-button" data-wi-workspace-view="library"><i class="fa-solid fa-book"></i><span>Library</span></button>
                <button type="button" class="wi-workspace-nav-button" data-wi-workspace-view="entries"><i class="fa-solid fa-list"></i><span>Entries</span></button>
                <button type="button" class="wi-workspace-nav-button" data-wi-workspace-view="global"><i class="fa-solid fa-sliders"></i><span>Global Rules</span></button>
            </div>
            <div class="wi-workspace-mode-controls">
                <select id="wi_workspace_display_mode" class="text_pole textarea_compact" title="Entry display mode">
                    <option value="compact">Compact</option>
                    <option value="standard">Standard</option>
                    <option value="full">Full</option>
                    <option value="custom">Custom</option>
                </select>
                <button id="wi_workspace_custom_fields" type="button" class="menu_button menu_button_icon displayNone"><i class="fa-solid fa-sliders"></i><span>Custom fields</span></button>
                <button id="wi_workspace_continuous_cards" type="button" class="menu_button menu_button_icon"><i class="fa-solid fa-table-columns"></i><span>Continuous Cards</span></button>
            </div>
        </div>
        <div id="wi_workspace_primary_toolbar" class="wi-workspace-primary-toolbar"></div>
        <div class="wi-workspace-panes">
            <section id="wi_workspace_library" class="wi-workspace-pane" data-view="library"></section>
            <section id="wi_workspace_entries" class="wi-workspace-pane" data-view="entries">
                <div id="wi_workspace_entries_toolbar" class="wi-workspace-entries-toolbar"></div>
                <div class="wi-workspace-entry-filterbar">
                    <div class="wi-workspace-quick-filters" role="group" aria-label="Entry filters">
                        <button type="button" class="menu_button is-active" data-wi-entry-filter="all">All</button>
                        <button type="button" class="menu_button" data-wi-entry-filter="enabled">Enabled</button>
                        <button type="button" class="menu_button" data-wi-entry-filter="special">Special</button>
                        <button type="button" class="menu_button" data-wi-entry-filter="issues">Issues</button>
                    </div>
                    <div class="wi-workspace-list-actions">
                        <small id="wi_workspace_entry_count" class="opacity50p"></small>
                        <button id="wi_workspace_select_visible" type="button" class="menu_button menu_button_icon"><i class="fa-solid fa-check-double"></i><span>Select filtered</span></button>
                    </div>
                </div>
                <div id="wi_workspace_entries_split" class="wi-workspace-entries-split">
                    <aside class="wi-workspace-entry-list-pane">
                        <div id="wi_workspace_entry_list" class="wi-workspace-entry-list" tabindex="0">
                            <div id="wi_workspace_entry_list_spacer" class="wi-workspace-entry-list-spacer"></div>
                            <div id="wi_workspace_entry_list_canvas" class="wi-workspace-entry-list-canvas"></div>
                        </div>
                    </aside>
                    <main id="wi_workspace_inspector" class="wi-workspace-inspector">
                        <button id="wi_workspace_mobile_back" type="button" class="menu_button wi-workspace-mobile-back"><i class="fa-solid fa-chevron-left"></i><span>Entries</span></button>
                        <div id="wi_workspace_bulk_inspector" class="wi-workspace-bulk-inspector displayNone">
                            <div><strong>Bulk Inspector</strong> · <span data-role="count">0</span> selected</div>
                            <small>All fields default to Keep unchanged. Use Bulk Edit to explicitly choose a field and value.</small>
                            <button type="button" class="menu_button menu_button_icon" data-action="bulk-edit"><i class="fa-solid fa-pen-to-square"></i><span>Bulk Edit…</span></button>
                        </div>
                        <div id="wi_workspace_inspector_header" class="wi-workspace-inspector-header">
                            <div class="wi-workspace-inspector-heading">
                                <strong id="wi_workspace_inspector_title">Select an entry</strong>
                                <small id="wi_workspace_inspector_meta" class="opacity50p"></small>
                            </div>
                            <div class="wi-workspace-inspector-actions">
                                <button id="wi_workspace_test_activation" type="button" class="menu_button menu_button_icon"><i class="fa-solid fa-flask"></i><span>Test Activation</span></button>
                                <button id="wi_workspace_activation_trace" type="button" class="menu_button menu_button_icon"><i class="fa-solid fa-route"></i><span>Activation Trace</span></button>
                                <details class="wi-workspace-inspector-more">
                                    <summary class="menu_button" title="More entry actions" aria-label="More entry actions"><i class="fa-solid fa-ellipsis"></i></summary>
                                    <div class="wi-workspace-inspector-menu">
                                        <button type="button" class="menu_button menu_button_icon" data-action="move-entry"><i class="fa-solid fa-right-left"></i><span>Move / Copy</span></button>
                                        <button type="button" class="menu_button menu_button_icon" data-action="duplicate-entry"><i class="fa-solid fa-copy"></i><span>Duplicate</span></button>
                                        <button type="button" class="menu_button menu_button_icon is-destructive" data-action="delete-entry"><i class="fa-solid fa-trash-can"></i><span>Delete</span></button>
                                    </div>
                                </details>
                            </div>
                        </div>
                        <div id="wi_workspace_activation_result" class="wi-workspace-activation-result displayNone" aria-live="polite"></div>
                        <div id="wi_workspace_inspector_issues" class="wi-workspace-inspector-issues displayNone"></div>
                        <div id="wi_workspace_inspector_empty" class="wi-workspace-inspector-empty">Choose an entry from the list to inspect it.</div>
                        <div id="wi_workspace_inspector_body"></div>
                    </main>
                </div>
                <div id="wi_workspace_cards" class="wi-workspace-cards displayNone"></div>
            </section>
            <section id="wi_workspace_global" class="wi-workspace-pane" data-view="global"></section>
        </div>
    `;

    popup.querySelector('hr')?.remove();
    popup.append(shell);

    if (primaryToolbar) shell.querySelector('#wi_workspace_primary_toolbar').append(primaryToolbar);
    if (editorToolbar) shell.querySelector('#wi_workspace_entries_toolbar').append(editorToolbar);
    if (searchToolbar) shell.querySelector('#wi_workspace_entries_toolbar').append(searchToolbar);
    if (bulkToolbar) shell.querySelector('#wi_workspace_entries_toolbar').append(bulkToolbar);
    if (cardsList) shell.querySelector('#wi_workspace_cards').append(cardsList);
    if (managerBlock) shell.querySelector('#wi_workspace_library').append(managerBlock);
    if (globalBlock) shell.querySelector('#wi_workspace_global').append(globalBlock);

    buildGlobalRulesPanels();
    topBlock.classList.add('displayNone');

    const managerHeader = managerBlock?.querySelector('.world_info_manager_drawer_header');
    managerHeader?.classList.add('displayNone');
    const managerContent = managerBlock?.querySelector('.inline-drawer-content');
    if (managerContent instanceof HTMLElement) managerContent.style.display = 'block';

    const globalHeader = globalBlock?.querySelector('.inline-drawer-header');
    globalHeader?.classList.add('displayNone');
    const globalContent = globalBlock?.querySelector('.inline-drawer-content');
    if (globalContent instanceof HTMLElement) globalContent.style.display = 'block';

    shell.querySelectorAll('[data-wi-workspace-view]').forEach(button => {
        button.addEventListener('click', () => setView(button.dataset.wiWorkspaceView));
    });

    shell.querySelectorAll('[data-wi-entry-filter]').forEach(button => {
        button.addEventListener('click', () => {
            state.quickFilter = button.dataset.wiEntryFilter || 'all';
            shell.querySelectorAll('[data-wi-entry-filter]').forEach(item => {
                item.classList.toggle('is-active', item === button);
            });
            const viewport = shell.querySelector('#wi_workspace_entry_list');
            if (viewport) viewport.scrollTop = 0;
            renderVirtualRows();
            const visible = getFilteredEntries();
            if (state.selectedUid && !visible.some(entry => String(entry?.uid ?? '') === state.selectedUid)) {
                state.selectedUid = '';
                void renderInspector(null);
            }
        });
    });

    shell.querySelector('#wi_workspace_entry_list')?.addEventListener('scroll', scheduleVirtualRows);
    shell.querySelector('#wi_workspace_select_visible')?.addEventListener('click', () => {
        const visible = getFilteredEntries();
        const shouldSelect = visible.some(entry => !state.selectedUids.has(String(entry?.uid ?? '')));
        for (const entry of visible) {
            state.callbacks.onSelectionChange?.(entry, shouldSelect, { deferSync: true });
        }
        state.callbacks.onSelectionBatchComplete?.();
    });
    shell.querySelector('#wi_workspace_mobile_back')?.addEventListener('click', () => {
        state.mobileDetail = false;
        syncMobileDrilldown();
    });

    shell.querySelector('#wi_workspace_display_mode')?.addEventListener('change', event => {
        setDisplayMode(event.target.value);
    });
    shell.querySelector('#wi_workspace_custom_fields')?.addEventListener('click', () => {
        document.querySelector('#world_entry_display_settings')?.click();
    });
    shell.querySelector('#wi_workspace_continuous_cards')?.addEventListener('click', () => {
        setContinuousCards(!state.continuousCards);
    });
    shell.querySelector('#wi_workspace_bulk_inspector [data-action="bulk-edit"]')?.addEventListener('click', () => {
        document.querySelector('#world_entries_bulk_set_field')?.click();
    });

    shell.querySelector('#wi_workspace_test_activation')?.addEventListener('click', async () => {
        const entry = state.entries.find(item => String(item?.uid ?? '') === state.selectedUid);
        const resultHost = shell.querySelector('#wi_workspace_activation_result');
        if (!entry || !resultHost || typeof state.callbacks.onTestActivation !== 'function') return;
        resultHost.classList.remove('displayNone');
        resultHost.textContent = 'Testing current chat with the existing World Info dry-run…';
        try {
            const result = await state.callbacks.onTestActivation(entry);
            resultHost.replaceChildren();
            const strong = document.createElement('strong');
            strong.textContent = result?.label || 'Activation test';
            const detail = document.createElement('div');
            detail.textContent = result?.detail || 'No diagnostic detail is available.';
            resultHost.append(strong, detail);
        } catch (error) {
            resultHost.textContent = `Activation test failed: ${error?.message || error}`;
        }
    });

    shell.querySelector('#wi_workspace_activation_trace')?.addEventListener('click', async () => {
        const entry = state.entries.find(item => String(item?.uid ?? '') === state.selectedUid);
        if (entry && typeof state.callbacks.onTrace === 'function') await state.callbacks.onTrace(entry);
    });

    const forwardInspectorAction = (action, selector) => {
        shell.querySelector(`[data-action="${action}"]`)?.addEventListener('click', () => {
            shell.querySelector('#wi_workspace_inspector_body')?.querySelector(selector)?.click();
            const menu = shell.querySelector('.wi-workspace-inspector-more');
            if (menu instanceof HTMLDetailsElement) menu.open = false;
        });
    };
    forwardInspectorAction('move-entry', '.move_entry_button');
    forwardInspectorAction('duplicate-entry', '.duplicate_entry_button');
    forwardInspectorAction('delete-entry', '.delete_entry_button');

    window.addEventListener('resize', () => {
        if (!isMobileWorkspace()) state.mobileDetail = false;
        syncMobileDrilldown();
        scheduleVirtualRows();
    });

    return true;
}

export function initWorldInfoWorkspace() {
    if (state.initialized) return;
    if (!buildWorkspaceDom()) return;

    state.initialized = true;
    state.displayMode = normalizeDisplayMode(accountStorage.getItem(DISPLAY_MODE_KEY));
    state.activeView = normalizeView(accountStorage.getItem(ACTIVE_VIEW_KEY));
    state.continuousCards = accountStorage.getItem(CONTINUOUS_CARDS_KEY) === 'true';

    setView(state.activeView, { persist: false });
    setDisplayMode(state.displayMode);
    setContinuousCards(state.continuousCards, { notify: false });
}

export function syncWorldInfoWorkspace({
    name = '',
    data = null,
    entries = [],
    callbacks = {},
} = {}) {
    initWorldInfoWorkspace();

    const nextName = escapeText(name).trim();
    const bookChanged = state.worldName !== nextName;
    state.worldName = nextName;
    state.data = data;
    state.entries = Array.isArray(entries) ? entries : [];
    state.callbacks = callbacks || {};

    if (bookChanged) {
        state.selectedUid = '';
        state.mobileDetail = false;
        const viewport = document.querySelector('#wi_workspace_entry_list');
        if (viewport) viewport.scrollTop = 0;
    }

    if (!nextName || !data) {
        state.selectedUid = '';
        state.entries = [];
        void renderInspector(null);
        renderVirtualRows();
        return;
    }

    setView('entries');
    renderVirtualRows();

    if (!state.selectedUid && !isMobileWorkspace()) {
        const first = getFilteredEntries()[0];
        if (first) selectWorkspaceEntry(first);
        else void renderInspector(null);
    } else if (state.selectedUid) {
        const selected = state.entries.find(entry => String(entry?.uid ?? '') === state.selectedUid);
        if (selected) void renderInspector(selected);
        else {
            state.selectedUid = '';
            void renderInspector(null);
        }
    }

    syncSelectionUi();
}

export function syncWorldInfoWorkspaceSelection(selectedUids = []) {
    state.selectedUids = new Set((selectedUids || []).map(value => String(value)));
    syncSelectionUi();
}

export function isWorldInfoWorkspaceContinuousCards() {
    return state.continuousCards;
}

export function setWorldInfoWorkspaceContinuousCards(enabled) {
    setContinuousCards(enabled);
}

export function refreshWorldInfoWorkspaceList() {
    renderVirtualRows();
}

export function decorateWorldInfoWorkspaceInspector(root, entry) {
    if (!(root instanceof HTMLElement)) return;
    buildInspectorSections(root, entry);
    renderInspectorIssues(entry);
    applyDisplayModeToInspector(root);
}

export function getWorldInfoWorkspaceStateForTests() {
    return {
        activeView: state.activeView,
        displayMode: state.displayMode,
        continuousCards: state.continuousCards,
        quickFilter: state.quickFilter,
        worldName: state.worldName,
        selectedUid: state.selectedUid,
        selectedCount: state.selectedUids.size,
        renderedRows: document.querySelectorAll('#wi_workspace_entry_list_canvas .wi-workspace-entry-row').length,
    };
}
