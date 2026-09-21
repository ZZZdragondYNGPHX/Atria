import { t } from '../i18n.js';
import { accountStorage } from '../util/AccountStorage.js';
import { createLogger } from '../logging/logger.js';
import { captureFrontendIncident } from '../logging/incident-reporter.js';
import {
    filterWorldInfoWorkspaceEntries,
    getWorldInfoEntryIssues,
} from './diagnostics.js';

const worldbookLogger = createLogger('worldbook');

const DISPLAY_MODE_KEY = 'atri_world_info_workspace_display_mode';
const CONTINUOUS_CARDS_KEY = 'atri_world_info_workspace_continuous_cards';
const ACTIVE_VIEW_KEY = 'atri_world_info_workspace_active_view';

const DISPLAY_MODES = new Set(['compact', 'standard', 'full', 'custom']);
const WORKSPACE_VIEWS = new Set(['library', 'entries', 'global']);
const ROW_HEIGHT = 68;
const ROW_OVERSCAN = 6;

let embeddedMount = null;

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

function getWorkspaceContextTitle() {
    if (state.activeView === 'entries') {
        return state.worldName || t`Entries`;
    }
    if (state.activeView === 'global') {
        return t`Global Rules`;
    }
    return t`Library`;
}

function syncWorkspaceChrome() {
    const root = document.querySelector('#wi_workspace_shell');
    if (!(root instanceof HTMLElement)) return;

    const mobile = isMobileWorkspace();
    root.dataset.activeView = state.activeView;
    root.classList.toggle('has-open-book', Boolean(state.worldName));
    root.classList.toggle('is-mobile-detail', mobile && state.mobileDetail);

    // Mobile bottom navigation must be a direct child of the full-screen
    // workspace. Keeping it inside the top header creates a containing block
    // that can place an otherwise fixed/absolute nav outside the viewport.
    // Reparenting preserves the same buttons/listeners and restores the
    // desktop header structure when the viewport grows again.
    const header = root.querySelector('.wi-workspace-header');
    const nav = root.querySelector('.wi-workspace-nav');
    const controls = header?.querySelector('.wi-workspace-mode-controls');
    if (nav instanceof HTMLElement && header instanceof HTMLElement) {
        if (mobile) {
            if (nav.parentElement !== root) root.append(nav);
        } else if (nav.parentElement !== header) {
            header.insertBefore(nav, controls || null);
        }
    }

    const contextTitle = root.querySelector('#wi_workspace_context_title');
    if (contextTitle) contextTitle.textContent = getWorkspaceContextTitle();
}

function escapeText(value) {
    return String(value ?? '');
}

function entryTitle(entry) {
    const memo = escapeText(entry?.comment).trim();
    if (memo) return memo;
    const keys = Array.isArray(entry?.key) ? entry.key.map(value => escapeText(value).trim()).filter(Boolean) : [];
    return keys.slice(0, 2).join(', ') || t`Entry #${escapeText(entry?.uid)}`;
}

function entryType(entry) {
    if (entry?.constant === true) return t`Constant`;
    if (entry?.vectorized === true) return t`Vector`;
    return t`Normal`;
}

function entryKeywordSummary(entry) {
    const primary = Array.isArray(entry?.key) ? entry.key.map(value => escapeText(value).trim()).filter(Boolean) : [];
    if (primary.length === 0) return t`No primary keywords`;
    const shown = primary.slice(0, 2).join(', ');
    return primary.length > 2 ? `${shown} +${primary.length - 2}` : shown;
}

function summarizeLifecycle(entry) {
    const parts = [];
    if (entry?.sticky != null && Number(entry.sticky) > 0) parts.push(t`Sticky ${entry.sticky}`);
    if (entry?.cooldown != null && Number(entry.cooldown) > 0) parts.push(t`Cooldown ${entry.cooldown}`);
    if (entry?.delay != null && Number(entry.delay) > 0) parts.push(t`Delay ${entry.delay}`);
    if (entry?.excludeRecursion) parts.push(t`Non-recursable`);
    if (entry?.preventRecursion) parts.push(t`Stops recursion`);
    if (entry?.delayUntilRecursion) parts.push(t`Recursive only`);
    return parts.join(' · ') || t`Defaults`;
}

function summarizeState(entry) {
    const conditions = Array.isArray(entry?.stateConditions) ? entry.stateConditions.length : 0;
    const events = Array.isArray(entry?.stateEvents) ? entry.stateEvents.length : 0;
    const parts = [];
    if (conditions) parts.push(t`Conditions ${conditions}`);
    if (events) parts.push(t`Events ${events}`);
    if (entry?.stateActivation) parts.push(t`Persistent activation`);
    return parts.join(' · ') || t`Not configured`;
}

function budgetTierLabel(value) {
    switch (String(value || '').toLowerCase()) {
        case 'critical':
            return t`Critical tier`;
        case 'scene':
            return t`Scene tier`;
        case 'optional':
            return t`Optional tier`;
        default:
            return String(value || '');
    }
}

function summarizeRelationships(entry) {
    const required = Array.isArray(entry?.requiredEntries) ? entry.requiredEntries.length : 0;
    const related = Array.isArray(entry?.relatedEntries) ? entry.relatedEntries.length : 0;
    const parts = [];
    if (required) parts.push(t`Required ${required}`);
    if (related) parts.push(t`Related ${related}`);
    if (entry?.mutualExclusionGroup) parts.push(t`Group ${entry.mutualExclusionGroup}`);
    if (entry?.budgetTier && entry.budgetTier !== 'normal') parts.push(budgetTierLabel(entry.budgetTier));
    return parts.join(' · ') || t`Not configured`;
}

function summarizeAdvanced(entry) {
    const parts = [];
    if (entry?.outletName) parts.push(t`Outlet`);
    if (entry?.automationId) parts.push(t`Automation`);
    if (entry?.group) parts.push(t`Inclusion group`);
    if (entry?.scanDepth != null) parts.push(t`Scan override`);
    if (entry?.caseSensitive != null) parts.push(t`Case override`);
    if (entry?.matchWholeWords != null) parts.push(t`Word override`);
    if (entry?.useGroupScoring != null) parts.push(t`Group scoring`);
    return parts.length ? t`Overrides ${parts.length}` : t`Defaults`;
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
    input.placeholder = kind === 'required' ? t`Search required entry…` : t`Search related entry…`;

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
    add.innerHTML = `<i class="fa-solid fa-plus"></i><span>${t`Add`}</span>`;

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
            remove.title = t`Remove`;
            remove.setAttribute('aria-label', t`Remove ${ref}`);
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
        title: t`Basic`,
        summary: `#${entry?.uid ?? ''} · ${entryType(entry)}`,
        open: true,
    });
    const activation = makeSection({
        key: 'activation',
        title: t`Activation`,
        summary: entryKeywordSummary(entry),
        open: true,
    });
    const lifecycle = makeSection({
        key: 'lifecycle',
        title: t`Lifecycle`,
        summary: summarizeLifecycle(entry),
    });
    const stateDriven = makeSection({
        key: 'state',
        title: t`State-driven`,
        summary: summarizeState(entry),
    });
    const relationships = makeSection({
        key: 'relationships',
        title: t`Entry Relationships`,
        summary: summarizeRelationships(entry),
    });
    const advanced = makeSection({
        key: 'advanced',
        title: t`Advanced`,
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

    const overridesGrid = edit.querySelector('.wi-entry-overrides-grid');
    if (overridesGrid) {
        for (const child of [...overridesGrid.children]) {
            if (child.querySelector('[name="scanDepth"], [name="caseSensitive"], [name="matchWholeWords"]')) {
                activation.body.append(child);
            } else if (child.querySelector('[name="delayUntilRecursionLevel"]')) {
                lifecycle.body.append(child);
            } else {
                advanced.body.append(child);
            }
        }
        overridesGrid.remove();
    }

    const timingGrid = edit.querySelector('.wi-entry-timing-grid');
    if (timingGrid) {
        for (const child of [...timingGrid.children]) {
            if (child.querySelector('[name="sticky"], [name="cooldown"], [name="delay"]')) {
                lifecycle.body.append(child);
            } else {
                advanced.body.append(child);
            }
        }
        timingGrid.remove();
    }

    move('.wi-entry-state-conditions', stateDriven.body);
    move('.wi-entry-state-events', stateDriven.body);

    move('.wi-entry-selection-strategy', relationships.body);
    const relationshipEditor = relationships.body.querySelector('.wi-entry-selection-strategy');
    relationshipEditor?.querySelector(':scope > .inline-drawer-header')?.classList.add('displayNone');
    const relationshipContent = relationshipEditor?.querySelector(':scope > .inline-drawer-content');
    if (relationshipContent instanceof HTMLElement) relationshipContent.style.display = 'flex';

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
    heading.textContent = t`Issues ${issues.length}`;
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
        meta.textContent = `#${entry.uid} · ${entryType(entry)} · ${t`Order`} ${Number(entry.order ?? 0)}`;
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
    if (entry?.disable === true) badges.push(t`Disabled`);
    if (Array.isArray(entry?.stateConditions) && entry.stateConditions.length) badges.push(t`State`);
    if (Array.isArray(entry?.stateEvents) && entry.stateEvents.length) badges.push(t`Event`);
    if (
        (Array.isArray(entry?.requiredEntries) && entry.requiredEntries.length)
        || (Array.isArray(entry?.relatedEntries) && entry.relatedEntries.length)
    ) badges.push(t`Dependencies`);
    if (entry?.budgetTier && entry.budgetTier !== 'normal') badges.push(budgetTierLabel(entry.budgetTier));
    if (issues.length) badges.push(t`Issues ${issues.length}`);
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
        select.setAttribute('aria-label', t`Select ${entryTitle(entry)}`);
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
        meta.textContent = `#${uid} · ${t`Order`} ${Number(entry?.order ?? 0)}`;

        const badges = document.createElement('span');
        badges.className = 'wi-workspace-entry-badges';
        for (const value of renderBadges(entry, issues)) {
            const badge = document.createElement('span');
            badge.className = 'wi-workspace-badge';
            if (issues.length && value === t`Issues ${issues.length}`) badge.classList.add('is-warning');
            if (value === t`Disabled`) badge.classList.add('is-muted');
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
    if (count) count.textContent = total === 1 ? t`${total} entry` : t`${total} entries`;
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
    syncWorkspaceChrome();
}

function renderBulkInspector({ enterMobileDetail = true } = {}) {
    const host = document.querySelector('#wi_workspace_bulk_inspector');
    const inspector = document.querySelector('#wi_workspace_inspector');
    if (!host || !inspector) return;
    const count = state.selectedUids.size;
    inspector.classList.toggle('has-bulk-selection', count >= 2);
    if (count < 2) {
        host.classList.add('displayNone');
        return;
    }

    host.classList.remove('displayNone');
    host.querySelector('[data-role="count"]').textContent = String(count);
    if (enterMobileDetail && isMobileWorkspace()) {
        state.mobileDetail = true;
        syncMobileDrilldown();
    }
}

function syncSelectionUi({ enterMobileDetail = true } = {}) {
    renderBulkInspector({ enterMobileDetail });
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
    }
    syncWorkspaceChrome();
    if (next === 'entries') {
        // Mobile switches from the catalogue to a full-height virtual list.
        // A hidden scroll container may keep an old anchor near the tail.
        // Reset once more on the next frame after layout has settled.
        requestAnimationFrame(() => {
            const viewport = document.querySelector('#wi_workspace_entry_list');
            if (viewport && isMobileWorkspace() && !state.mobileDetail) viewport.scrollTop = 0;
            renderVirtualRows();
        });
    }
}

function setDisplayMode(mode) {
    state.displayMode = normalizeDisplayMode(mode);
    accountStorage.setItem(DISPLAY_MODE_KEY, state.displayMode);
    const select = document.querySelector('#wi_workspace_display_mode');
    if (select) select.value = state.displayMode;
    const mobileSelect = document.querySelector('#wi_workspace_mobile_display_mode');
    if (mobileSelect) mobileSelect.value = state.displayMode;
    applyDisplayModeToInspector();
}

function setContinuousCards(enabled, { notify = true } = {}) {
    state.continuousCards = Boolean(enabled);
    accountStorage.setItem(CONTINUOUS_CARDS_KEY, String(state.continuousCards));

    document.querySelector('#wi_workspace_entries_split')?.classList.toggle('displayNone', state.continuousCards);
    document.querySelector('#wi_workspace_cards')?.classList.toggle('displayNone', !state.continuousCards);
    document.querySelector('#wi_workspace_continuous_cards')?.classList.toggle('is-active', state.continuousCards);
    document.querySelector('#wi_workspace_mobile_continuous_cards')?.classList.toggle('is-active', state.continuousCards);
    document.querySelector('#wi_workspace_shell')?.classList.toggle('is-continuous-cards', state.continuousCards);
    document.querySelector('#world_info_pagination')?.classList.toggle('displayNone', !state.continuousCards);
    document.querySelectorAll('[data-cards-only="true"]').forEach(button => {
        button.classList.toggle('displayNone', !state.continuousCards);
    });

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
            title: t`Scanning`,
            description: t`How text is scanned and matched before entry-specific overrides.`,
            ids: ['world_info_depth', 'world_info_include_names', 'world_info_case_sensitive', 'world_info_match_whole_words'],
        },
        {
            key: 'budget',
            title: t`Budget`,
            description: t`How much prompt context World Info may consume.`,
            ids: ['world_info_budget', 'world_info_budget_cap', 'world_info_overflow_alert'],
        },
        {
            key: 'recursion',
            title: t`Recursion`,
            description: t`How recursive discovery proceeds and where it stops.`,
            ids: ['world_info_recursive', 'world_info_min_activations', 'world_info_min_activations_depth_max', 'world_info_max_recursion_steps'],
        },
        {
            key: 'selection',
            title: t`Selection / Priority`,
            description: t`Global ordering and scoring defaults.`,
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
            <div class="wi-workspace-mobile-context">
                <span class="wi-workspace-mobile-context-icon"><i class="fa-solid fa-book-open"></i></span>
                <strong id="wi_workspace_context_title">${t`Library`}</strong>
            </div>
            <div class="wi-workspace-nav" role="tablist" aria-label="${t`World Info workspace`}">
                <button type="button" class="wi-workspace-nav-button" data-wi-workspace-view="library"><i class="fa-solid fa-book"></i><span>${t`Library`}</span></button>
                <button type="button" class="wi-workspace-nav-button" data-wi-workspace-view="entries"><i class="fa-solid fa-list"></i><span>${t`Entries`}</span></button>
                <button type="button" class="wi-workspace-nav-button" data-wi-workspace-view="global"><i class="fa-solid fa-sliders"></i><span>${t`Global Rules`}</span></button>
            </div>
            <div class="wi-workspace-mode-controls">
                <div class="wi-workspace-desktop-mode-controls">
                    <select id="wi_workspace_display_mode" class="text_pole textarea_compact" title="${t`Entry display mode`}">
                        <option value="compact">${t`Compact`}</option>
                        <option value="standard">${t`Standard`}</option>
                        <option value="full">${t`Full`}</option>
                        <option value="custom">${t`Custom`}</option>
                    </select>
                    <button id="wi_workspace_custom_fields" type="button" class="menu_button menu_button_icon displayNone"><i class="fa-solid fa-sliders"></i><span>${t`Custom fields`}</span></button>
                    <button id="wi_workspace_continuous_cards" type="button" class="menu_button menu_button_icon"><i class="fa-solid fa-table-columns"></i><span>${t`Continuous Cards`}</span></button>
                </div>
                <details class="wi-workspace-mobile-options">
                    <summary class="menu_button" title="${t`Tools`}" aria-label="${t`Tools`}"><i class="fa-solid fa-ellipsis-vertical"></i></summary>
                    <div class="wi-workspace-mobile-menu">
                        <label class="wi-workspace-mobile-mode-field">
                            <span>${t`Entry display mode`}</span>
                            <select id="wi_workspace_mobile_display_mode" class="text_pole textarea_compact">
                                <option value="compact">${t`Compact`}</option>
                                <option value="standard">${t`Standard`}</option>
                                <option value="full">${t`Full`}</option>
                                <option value="custom">${t`Custom`}</option>
                            </select>
                        </label>
                        <button id="wi_workspace_mobile_custom_fields" type="button" class="menu_button menu_button_icon"><i class="fa-solid fa-sliders"></i><span>${t`Custom fields`}</span></button>
                        <button id="wi_workspace_mobile_continuous_cards" type="button" class="menu_button menu_button_icon"><i class="fa-solid fa-table-columns"></i><span>${t`Continuous Cards`}</span></button>
                        <div class="wi-workspace-mobile-menu-separator"></div>
                        <button type="button" class="menu_button menu_button_icon wi-workspace-mobile-book-action" data-forward="#world_popup_export"><i class="fa-solid fa-file-export"></i><span>${t`Export`}</span></button>
                        <button type="button" class="menu_button menu_button_icon wi-workspace-mobile-book-action" data-forward="#world_popup_name_button"><i class="fa-solid fa-pen"></i><span>${t`Rename`}</span></button>
                        <button type="button" class="menu_button menu_button_icon wi-workspace-mobile-book-action" data-forward="#world_duplicate"><i class="fa-solid fa-copy"></i><span>${t`Duplicate`}</span></button>
                        <button type="button" class="menu_button menu_button_icon wi-workspace-mobile-book-action is-destructive" data-forward="#world_popup_delete"><i class="fa-solid fa-trash-can"></i><span>${t`Delete`}</span></button>
                    </div>
                </details>
                <button id="wi_workspace_close" type="button" class="menu_button" title="${t`Close World Info Workspace`}" aria-label="${t`Close World Info Workspace`}"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>
        <div id="wi_workspace_primary_toolbar" class="wi-workspace-primary-toolbar"></div>
        <div class="wi-workspace-panes">
            <section id="wi_workspace_library" class="wi-workspace-pane" data-view="library"></section>
            <section id="wi_workspace_entries" class="wi-workspace-pane" data-view="entries">
                <div id="wi_workspace_entries_toolbar" class="wi-workspace-entries-toolbar"></div>
                <div class="wi-workspace-entry-filterbar">
                    <div class="wi-workspace-quick-filters" role="group" aria-label="${t`Entry filters`}">
                        <button type="button" class="menu_button is-active" data-wi-entry-filter="all">${t`All`}</button>
                        <button type="button" class="menu_button" data-wi-entry-filter="enabled">${t`Enabled`}</button>
                        <button type="button" class="menu_button" data-wi-entry-filter="special">${t`Special`}</button>
                        <button type="button" class="menu_button" data-wi-entry-filter="issues">${t`Issues`}</button>
                    </div>
                    <div class="wi-workspace-list-actions">
                        <small id="wi_workspace_entry_count" class="opacity50p"></small>
                        <button id="wi_workspace_select_visible" type="button" class="menu_button menu_button_icon"><i class="fa-solid fa-check-double"></i><span>${t`Select filtered`}</span></button>
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
                        <div id="wi_workspace_bulk_inspector" class="wi-workspace-bulk-inspector displayNone">
                            <div><strong>${t`Bulk Inspector`}</strong> · <span data-role="count">0</span> ${t`selected`}</div>
                            <small>${t`Safe multi-edit: nothing changes until you explicitly choose a field in Bulk Edit.`}</small>
                            <div class="wi-workspace-bulk-defaults">
                                <span>${t`Enabled`} <b>${t`Keep unchanged`}</b></span>
                                <span>${t`Activation`} <b>${t`Keep unchanged`}</b></span>
                                <span>${t`Placement`} <b>${t`Keep unchanged`}</b></span>
                                <span>${t`Lifecycle`} <b>${t`Keep unchanged`}</b></span>
                            </div>
                            <button type="button" class="menu_button menu_button_icon" data-action="bulk-edit"><i class="fa-solid fa-pen-to-square"></i><span>${t`Bulk Edit…`}</span></button>
                        </div>
                        <div id="wi_workspace_inspector_header" class="wi-workspace-inspector-header">
                            <button id="wi_workspace_mobile_back" type="button" class="menu_button wi-workspace-mobile-back" title="${t`Entries`}" aria-label="${t`Entries`}"><i class="fa-solid fa-chevron-left"></i></button>
                            <div class="wi-workspace-inspector-heading">
                                <strong id="wi_workspace_inspector_title">${t`Select an entry`}</strong>
                                <small id="wi_workspace_inspector_meta" class="opacity50p"></small>
                            </div>
                            <div class="wi-workspace-inspector-actions">
                                <button id="wi_workspace_test_activation" type="button" class="menu_button menu_button_icon"><i class="fa-solid fa-flask"></i><span>${t`Test Activation`}</span></button>
                                <button id="wi_workspace_activation_trace" type="button" class="menu_button menu_button_icon"><i class="fa-solid fa-route"></i><span>${t`Activation Trace`}</span></button>
                                <details class="wi-workspace-inspector-more">
                                    <summary class="menu_button" title="${t`More entry actions`}" aria-label="${t`More entry actions`}"><i class="fa-solid fa-ellipsis"></i></summary>
                                    <div class="wi-workspace-inspector-menu">
                                        <button type="button" class="menu_button menu_button_icon" data-action="move-entry"><i class="fa-solid fa-right-left"></i><span>${t`Move / Copy`}</span></button>
                                        <button type="button" class="menu_button menu_button_icon" data-action="duplicate-entry"><i class="fa-solid fa-copy"></i><span>${t`Duplicate`}</span></button>
                                        <button type="button" class="menu_button menu_button_icon is-destructive" data-action="delete-entry"><i class="fa-solid fa-trash-can"></i><span>${t`Delete`}</span></button>
                                    </div>
                                </details>
                            </div>
                        </div>
                        <div id="wi_workspace_activation_result" class="wi-workspace-activation-result displayNone" aria-live="polite"></div>
                        <div id="wi_workspace_inspector_issues" class="wi-workspace-inspector-issues displayNone"></div>
                        <div id="wi_workspace_inspector_empty" class="wi-workspace-inspector-empty">${t`Choose an entry from the list to inspect it.`}</div>
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

    if (primaryToolbar) {
        shell.querySelector('#wi_workspace_primary_toolbar').append(primaryToolbar);
    }
    if (editorToolbar) shell.querySelector('#wi_workspace_entries_toolbar').append(editorToolbar);

    const bookActionsHost = primaryToolbar?.querySelector('.world_popup_primary_actions');
    if (bookActionsHost) {
        const details = document.createElement('details');
        details.className = 'wi-workspace-book-actions';
        details.innerHTML = `
            <summary class="menu_button" title="${t`Lorebook actions`}" aria-label="${t`Lorebook actions`}"><i class="fa-solid fa-ellipsis"></i></summary>
            <div class="wi-workspace-overflow-menu">
                <button type="button" class="menu_button menu_button_icon" data-forward="#world_popup_export"><i class="fa-solid fa-file-export"></i><span>${t`Export`}</span></button>
                <button type="button" class="menu_button menu_button_icon" data-forward="#world_popup_name_button"><i class="fa-solid fa-pen"></i><span>${t`Rename`}</span></button>
                <button type="button" class="menu_button menu_button_icon" data-forward="#world_duplicate"><i class="fa-solid fa-copy"></i><span>${t`Duplicate`}</span></button>
                <button type="button" class="menu_button menu_button_icon is-destructive" data-forward="#world_popup_delete"><i class="fa-solid fa-trash-can"></i><span>${t`Delete`}</span></button>
            </div>
        `;
        bookActionsHost.querySelectorAll('#world_popup_export, #world_popup_name_button, #world_duplicate, #world_popup_delete')
            .forEach(node => node.classList.add('wi-workspace-action-plumbing'));
        bookActionsHost.append(details);
    }

    const entryActionsHost = editorToolbar?.querySelector('.world_popup_entry_actions');
    if (entryActionsHost) {
        const details = document.createElement('details');
        details.className = 'wi-workspace-entry-tools';
        details.innerHTML = `
            <summary class="menu_button menu_button_icon"><i class="fa-solid fa-screwdriver-wrench"></i><span>${t`Tools`}</span></summary>
            <div class="wi-workspace-overflow-menu">
                <button type="button" class="menu_button menu_button_icon" data-forward="#world_refresh"><i class="fa-solid fa-arrows-rotate"></i><span>${t`Refresh`}</span></button>
                <button type="button" class="menu_button menu_button_icon" data-forward="#world_backfill_memos"><i class="fa-solid fa-notes-medical"></i><span>${t`Fill empty titles`}</span></button>
                <button type="button" class="menu_button menu_button_icon" data-forward="#world_apply_current_sorting"><i class="fa-solid fa-arrow-down-9-1"></i><span>${t`Apply sorting as Order`}</span></button>
                <button type="button" class="menu_button menu_button_icon" data-forward="#world_entry_display_settings"><i class="fa-solid fa-eye"></i><span>${t`Custom field visibility`}</span></button>
                <button type="button" class="menu_button menu_button_icon" data-forward="#OpenAllWIEntries" data-cards-only="true"><i class="fa-solid fa-expand"></i><span>${t`Open all cards`}</span></button>
                <button type="button" class="menu_button menu_button_icon" data-forward="#CloseAllWIEntries" data-cards-only="true"><i class="fa-solid fa-compress"></i><span>${t`Close all cards`}</span></button>
            </div>
        `;
        entryActionsHost.querySelectorAll('#OpenAllWIEntries, #CloseAllWIEntries, #world_backfill_memos, #world_apply_current_sorting, #world_entry_display_settings, #world_refresh')
            .forEach(node => node.classList.add('wi-workspace-action-plumbing'));
        entryActionsHost.append(details);
    }

    shell.querySelectorAll('[data-forward]').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelector(button.dataset.forward)?.click();
            const details = button.closest('details');
            if (details instanceof HTMLDetailsElement) details.open = false;
        });
    });
    if (searchToolbar) {
        shell.querySelector('#wi_workspace_entries_toolbar').append(searchToolbar);

        if (!searchToolbar.querySelector('.wi-entry-mobile-search-options')) {
            const sourceMode = searchToolbar.querySelector('#world_info_search_mode');
            const sourceAdvanced = searchToolbar.querySelector('#world_info_search_advanced');
            const options = document.createElement('div');
            options.className = 'wi-entry-mobile-search-options';
            options.innerHTML = `
                <button type="button" class="menu_button wi-entry-mobile-search-trigger" title="${t`Search options`}" aria-label="${t`Search options`}" aria-expanded="false"><i class="fa-solid fa-filter"></i></button>
                <div class="wi-entry-mobile-search-menu displayNone">
                    <label class="wi-entry-mobile-search-mode-field">
                        <span>${t`Search mode`}</span>
                        <select id="wi_workspace_mobile_search_mode" class="text_pole textarea_compact"></select>
                    </label>
                    <button type="button" class="menu_button menu_button_icon" data-control="advanced">
                        <i class="fa-solid fa-code"></i>
                        <span>${t`Advanced syntax`}</span>
                    </button>
                </div>
            `;

            const entryTrigger = options.querySelector('.wi-entry-mobile-search-trigger');
            const entryMenu = options.querySelector('.wi-entry-mobile-search-menu');
            entryTrigger?.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const shouldOpen = entryMenu?.classList.contains('displayNone');
                entryMenu?.classList.toggle('displayNone', !shouldOpen);
                entryTrigger.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
            });
            entryMenu?.addEventListener('click', event => event.stopPropagation());

            const proxyMode = options.querySelector('#wi_workspace_mobile_search_mode');
            if (proxyMode instanceof HTMLSelectElement && sourceMode instanceof HTMLSelectElement) {
                for (const sourceOption of sourceMode.options) {
                    proxyMode.append(sourceOption.cloneNode(true));
                }
                proxyMode.value = sourceMode.value;
                proxyMode.addEventListener('change', () => {
                    sourceMode.value = proxyMode.value;
                    sourceMode.dispatchEvent(new Event('change', { bubbles: true }));
                });
                sourceMode.addEventListener('change', () => {
                    proxyMode.value = sourceMode.value;
                });
            }

            const advancedButton = options.querySelector('[data-control="advanced"]');
            const syncAdvancedState = () => {
                advancedButton?.classList.toggle('is-active', Boolean(sourceAdvanced?.checked));
            };
            advancedButton?.addEventListener('click', () => {
                if (sourceAdvanced instanceof HTMLInputElement) sourceAdvanced.click();
            });
            sourceAdvanced?.addEventListener('change', syncAdvancedState);
            syncAdvancedState();

            searchToolbar.append(options);
        }
    }
    if (bulkToolbar) shell.querySelector('#wi_workspace_entries_toolbar').append(bulkToolbar);
    if (cardsList) shell.querySelector('#wi_workspace_cards').append(cardsList);
    if (managerBlock) shell.querySelector('#wi_workspace_library').append(managerBlock);
    if (globalBlock) shell.querySelector('#wi_workspace_global').append(globalBlock);

    const managerFilters = managerBlock?.querySelector('.world_info_manager_filter_controls');
    if (managerFilters && !managerFilters.querySelector('.wi-library-mobile-search-options')) {
        const options = document.createElement('div');
        options.className = 'wi-library-mobile-search-options';
        options.innerHTML = `
            <button type="button" class="menu_button wi-library-mobile-search-trigger" title="${t`Search`}" aria-label="${t`Search`}" aria-expanded="false"><i class="fa-solid fa-filter"></i></button>
            <div class="wi-library-mobile-search-menu displayNone">
                <label for="world_info_manager_search_entries" data-control="entries">
                    <i class="fa-solid fa-file-lines"></i>
                    <span>${t`Search entries/content`}</span>
                </label>
                <label for="world_info_manager_search_advanced" data-control="advanced">
                    <i class="fa-solid fa-code"></i>
                    <span>${t`Advanced syntax`}</span>
                </label>
            </div>
        `;
        managerFilters.append(options);

        const libraryTrigger = options.querySelector('.wi-library-mobile-search-trigger');
        const libraryMenu = options.querySelector('.wi-library-mobile-search-menu');
        libraryTrigger?.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const shouldOpen = libraryMenu?.classList.contains('displayNone');
            libraryMenu?.classList.toggle('displayNone', !shouldOpen);
            libraryTrigger.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
        });
        libraryMenu?.addEventListener('click', event => event.stopPropagation());

        const syncOptionState = () => {
            const entrySearch = document.querySelector('#world_info_manager_search_entries');
            const advanced = document.querySelector('#world_info_manager_search_advanced');
            options.querySelector('[data-control="entries"]')?.classList.toggle('is-active', Boolean(entrySearch?.checked));
            options.querySelector('[data-control="advanced"]')?.classList.toggle('is-active', Boolean(advanced?.checked));
        };
        document.querySelector('#world_info_manager_search_entries')?.addEventListener('change', syncOptionState);
        document.querySelector('#world_info_manager_search_advanced')?.addEventListener('change', syncOptionState);
        syncOptionState();
    }

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
    shell.querySelector('#wi_workspace_mobile_display_mode')?.addEventListener('change', event => {
        setDisplayMode(event.target.value);
    });
    shell.querySelector('#wi_workspace_custom_fields')?.addEventListener('click', () => {
        document.querySelector('#world_entry_display_settings')?.click();
    });
    shell.querySelector('#wi_workspace_mobile_custom_fields')?.addEventListener('click', () => {
        document.querySelector('#world_entry_display_settings')?.click();
        const details = shell.querySelector('.wi-workspace-mobile-options');
        if (details instanceof HTMLDetailsElement) details.open = false;
    });
    shell.querySelector('#wi_workspace_continuous_cards')?.addEventListener('click', () => {
        setContinuousCards(!state.continuousCards);
    });
    shell.querySelector('#wi_workspace_mobile_continuous_cards')?.addEventListener('click', () => {
        setContinuousCards(!state.continuousCards);
        const details = shell.querySelector('.wi-workspace-mobile-options');
        if (details instanceof HTMLDetailsElement) details.open = false;
    });
    shell.querySelector('#wi_workspace_close')?.addEventListener('click', () => {
        document.querySelector('#WIDrawerIcon')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    shell.querySelector('#wi_workspace_bulk_inspector [data-action="bulk-edit"]')?.addEventListener('click', () => {
        document.querySelector('#world_entries_bulk_set_field')?.click();
    });

    shell.querySelector('#wi_workspace_test_activation')?.addEventListener('click', async () => {
        const entry = state.entries.find(item => String(item?.uid ?? '') === state.selectedUid);
        const resultHost = shell.querySelector('#wi_workspace_activation_result');
        if (!entry || !resultHost || typeof state.callbacks.onTestActivation !== 'function') return;
        resultHost.classList.remove('displayNone');
        resultHost.textContent = t`Testing current chat with the existing World Info dry-run…`;
        try {
            const result = await state.callbacks.onTestActivation(entry);
            resultHost.replaceChildren();
            const strong = document.createElement('strong');
            strong.textContent = result?.label || t`Activation test`;
            const detail = document.createElement('div');
            detail.textContent = result?.detail || t`No diagnostic detail is available.`;
            resultHost.append(strong, detail);
        } catch (error) {
            resultHost.textContent = t`Activation test failed: ${error?.message || error}`;
            const entryUid = String(entry?.uid ?? '');
            worldbookLogger.error('activation-test.failed', '[Worldbook] activation test failed', {
                worldName: state.worldName,
                entryUid,
                message: error?.message || String(error),
            }, { category: 'diagnostics' });
            void captureFrontendIncident({
                type: 'tool_failure',
                severity: 'error',
                primaryModule: 'worldbook',
                stage: 'activation-test',
                summary: error?.message || String(error),
                failure: error,
                environment: {
                    worldName: state.worldName,
                    entryUid,
                },
            });
        }
    });

    shell.querySelector('#wi_workspace_activation_trace')?.addEventListener('click', async () => {
        const entry = state.entries.find(item => String(item?.uid ?? '') === state.selectedUid);
        if (!entry || typeof state.callbacks.onTrace !== 'function') return;
        try {
            await state.callbacks.onTrace(entry);
        } catch (error) {
            const entryUid = String(entry?.uid ?? '');
            worldbookLogger.error('activation-trace.failed', '[Worldbook] activation trace failed', {
                worldName: state.worldName,
                entryUid,
                message: error?.message || String(error),
            }, { category: 'diagnostics' });
            void captureFrontendIncident({
                type: 'tool_failure',
                severity: 'error',
                primaryModule: 'worldbook',
                stage: 'activation-trace',
                summary: error?.message || String(error),
                failure: error,
                environment: { worldName: state.worldName, entryUid },
            });
        }
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
        syncWorkspaceChrome();
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

export function mountWorldInfoWorkspace(container, { embedded = true } = {}) {
    if (!(container instanceof HTMLElement)) {
        throw new TypeError('World Info Workspace host must be an HTMLElement');
    }

    initWorldInfoWorkspace();
    const root = document.querySelector('#WorldInfo');
    if (!(root instanceof HTMLElement)) return null;

    if (embeddedMount?.root === root) {
        if (root.parentElement !== container) container.append(root);
        return embeddedMount.api;
    }

    const originalParent = root.parentNode;
    const originalNextSibling = root.nextSibling;
    const originalClassName = root.className;
    const originalStyle = root.getAttribute('style');

    container.replaceChildren(root);
    root.dataset.atriaWorkspaceEmbedded = String(Boolean(embedded));
    root.classList.add('openDrawer');
    root.classList.remove('closedDrawer');
    root.hidden = false;

    let disposed = false;
    const api = {
        root,
        dispose() {
            if (disposed) return;
            disposed = true;
            delete root.dataset.atriaWorkspaceEmbedded;
            root.className = originalClassName;
            if (originalStyle === null) root.removeAttribute('style');
            else root.setAttribute('style', originalStyle);

            if (originalParent?.isConnected) {
                if (originalNextSibling?.parentNode === originalParent) {
                    originalParent.insertBefore(root, originalNextSibling);
                } else {
                    originalParent.append(root);
                }
            }
            if (embeddedMount?.api === api) embeddedMount = null;
        },
    };
    embeddedMount = { root, api };
    syncWorkspaceChrome();
    return api;
}

export function syncWorldInfoWorkspace({
    name = '',
    data = null,
    entries = [],
    focusUid = null,
    callbacks = {},
} = {}) {
    initWorldInfoWorkspace();

    const nextName = escapeText(name).trim();
    const bookChanged = state.worldName !== nextName;
    const openingEntriesFromAnotherView = state.activeView !== 'entries';
    state.worldName = nextName;
    state.data = data;
    state.entries = Array.isArray(entries) ? entries : [];
    state.callbacks = callbacks || {};
    syncWorkspaceChrome();
    const requestedUid = focusUid === null || focusUid === undefined
        ? ''
        : String(focusUid);

    if (bookChanged || openingEntriesFromAnotherView) {
        // Entering Entries from Library/Global must start from the top of the
        // virtual list. A hidden list can retain a large scrollTop from an
        // earlier render; reusing it can render only off-screen tail rows.
        const viewport = document.querySelector('#wi_workspace_entry_list');
        if (viewport) viewport.scrollTop = 0;
    }
    if (bookChanged) {
        state.selectedUid = '';
        state.mobileDetail = false;
    }

    if (!nextName || !data) {
        state.selectedUid = '';
        state.entries = [];
        void renderInspector(null);
        renderVirtualRows();
        return;
    }

    if (requestedUid && state.entries.some(entry => String(entry?.uid ?? '') === requestedUid)) {
        state.selectedUid = requestedUid;
        state.mobileDetail = isMobileWorkspace();
    } else if (openingEntriesFromAnotherView && isMobileWorkspace()) {
        // A catalogue → book transition always lands on the mobile entry
        // list. Detail mode is entered only after selecting an entry (or via
        // an explicit focusUid deep-link), never by inheriting stale UI state.
        state.selectedUid = '';
        state.mobileDetail = false;
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

    syncSelectionUi({ enterMobileDetail: !openingEntriesFromAnotherView });
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
