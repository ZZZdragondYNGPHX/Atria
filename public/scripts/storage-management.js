import { getRequestHeaders } from '../script.js';
import { createAtriaButton, createAtriaIconButton, formatAtriaDate, setAtriaButtonLabel } from './atria-shell/components.js';
import { createAtriaIcon } from './atria-shell/icons.js';
import { translateShellText as tl, formatShellText as ft } from './atria-shell/localization.js';
import { BrowserProvider, BrowserMutator } from './browser-storage-inspector.js';
import { BrowserResourceCenter } from './browser-resource-center.js';
import { notifyStorageChange } from './native/storage-change-events.js';
import { createStorageInspector, RestMutator, RestProvider } from './storage-inspector.js';
import { StorageCenterDrawer, containStorageDialogFocus, prefersStorageReducedMotion } from './storage-center-drawer.js';
import { callGenericPopup, POPUP_RESULT, POPUP_TYPE } from './popup.js';

const labels = { sessions: 'Sessions & saves', projects: 'Works & projects', knowledge: 'Worlds & knowledge', media: 'Media & attachments',
    personas: 'Personal identities', agents: 'Agent material', settings: 'Settings & integrations', recovery: 'Backups & recycle bin',
    cache: 'Caches & temporary data', advanced: 'Advanced tools', offline: 'Offline content & local models', preferences: 'Device preferences' };
const regions = { overview: 'Overview', cleanup: 'Cleanup suggestions', recovery: 'Backups & recycle bin', tasks: 'Operation history', advanced: 'Advanced tools' };
const actions = { trash: 'Move to recycle bin', restore: 'Restore original identity', purge: 'Permanently delete', clean: 'Clean verified data', repair: 'Resume reviewed recovery', history: 'Review local Git publication' };
const states = { preview: 'Preview', pending: 'Not started', processing: 'Processing', queued: 'Waiting', running: 'Processing', succeeded: 'Succeeded', failed: 'Failed',
    stopped: 'Stopped', partial: 'Partially completed', completed: 'Completed', blocked: 'Blocked', repreview: 'Review again', interrupted: 'Interrupted — review before retrying', 'paused-review': 'Paused — review before retrying' };
const reasons = {
    native_resource_referenced: 'Another resource still uses this item. Manage its references first.',
    native_persona_referenced: 'This identity is still selected or referenced. Review its use before deleting it.',
    native_resource_running: 'This item is in use. Finish its current work in the business workspace first.',
    native_project_running: 'This project has active work. Finish or stop it in Studio first.',
    native_resource_retained_for_recovery: 'A recycle bin item still needs this resource for recovery.',
    storage_preview_stale: 'This item changed. Create a new preview.',
    native_recovery_identity_conflict: 'An original identity is already occupied. Recovery never overwrites it.',
    native_recovery_dependency_missing: 'An exact dependency or retained file is missing. Restore it before retrying.',
    native_recovery_integrity: 'The recovery closure did not pass its integrity check.',
    native_resource_owned_by_preset: 'Manage this resource through its Prompt preset.',
    native_resource_requires_domain_editor: 'Manage this protected resource in its business workspace.',
    'expired-runtime-checkpoint': 'Expired Runtime continuation data; it can no longer resume a request.',
    storage_quota_exceeded: 'There is not enough account quota for this operation. Export or permanently remove selected data first.',
    storage_usage_unavailable: 'Usage could not be measured. Refresh after storage becomes available.',
    'persistent-progress': 'Persistent Work progress is managed by the Session lifecycle.',
    'selected-persona': 'Default identity selection and migration receipts are managed in Personal identities.',
    'runtime-state': 'Runtime continuation is managed by Runtime; only verified expired entries are suggested for cleanup.',
    'owned-version-or-maintenance-data': 'This data belongs to its business owner and cannot be removed on its own.',
    'advanced-inspection': 'Inspect legacy or unidentified content in Advanced tools.',
    'account-backup-center': 'Manage this snapshot in Account backup & export.',
};
const explain = reason => tl(reasons[reason] || reason || '');
const node = (tag, className = '', text = null) => { const element = document.createElement(tag); element.className = className; if (text != null) element.textContent = String(text); return element; };
const button = (label, click, variant = 'secondary') => createAtriaButton(document, { label: tl(label), onClick: click, variant });
const icons = { overview: 'grid', cleanup: 'wand', recovery: 'stack', tasks: 'timeline', advanced: 'settings', sessions: 'chat', projects: 'folder', knowledge: 'book', media: 'image', personas: 'person', agents: 'runtime', settings: 'settings', cache: 'bolt', offline: 'import', preferences: 'settings' };
const categoryColors = { sessions: 'var(--tone-lumen)', projects: 'var(--tone-lapis)', media: 'var(--tone-umber)', knowledge: 'var(--tone-jade)', agents: 'var(--tone-dai)', personas: 'var(--tone-amber)', settings: 'var(--text-2)', recovery: 'var(--text-3)', cache: 'var(--line-strong)', offline: 'var(--tone-lapis)', preferences: 'var(--text-3)' };
const numeric = value => new Intl.NumberFormat().format(value);
const size = bytes => {
    if (bytes == null) return tl('Unavailable');
    const index = bytes < 1024 ? 0 : bytes < 1048576 ? 1 : bytes < 1073741824 ? 2 : 3;
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(bytes / 1024 ** index) + ' ' + ['B', 'KiB', 'MiB', 'GiB'][index];
};
export async function storageCenterRequest(operation, body = {}) {
    const response = await fetch('/api/users/storage/center/' + operation, { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify(body) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(explain(payload?.error || 'Storage is unavailable. Refresh to retry.'));
    return payload;
}

export class StorageCenterPanel {
    constructor({ api = storageCenterRequest, browser = new BrowserResourceCenter(), initialScope = 'server' } = {}) {
        Object.assign(this, { api, browser, scope: initialScope === 'browser' ? 'browser' : 'server', region: 'overview', data: null, category: null, query: '', offset: 0,
            selection: new Map(), safeSelection: new Set(), generation: 0, closed: false, activeTask: null, keyboard: false, detailGeneration: 0, previewGeneration: 0 });
    }
    // Shared chrome for both presentations: section nav, scope switch, status and content.
    assemble(frame, { page = false } = {}) {
        frame.addEventListener('pointerdown', () => { this.keyboard = false; frame.classList.remove('storage-center-keyboard'); }, true);
        frame.addEventListener('keydown', event => { this.keyboard = true; frame.classList.add('storage-center-keyboard'); if (!page) containStorageDialogFocus(frame, event); }, true);
        const sidebar = node('aside', 'storage-center-sidebar');
        if (!page) {
            const brand = node('div', 'storage-center-brand'), mark = node('span', 'storage-center-brand-mark'); mark.append(createAtriaIcon(document, 'sparkles'));
            brand.append(mark, node('span', 'storage-center-wordmark', 'Atria')); sidebar.append(brand, node('p', 'storage-center-workspace-label', tl('Settings workspace')));
        }
        this.nav = node('nav', 'storage-center-nav'); this.nav.setAttribute('aria-label', tl('Resource center sections'));
        for (const [key, text] of Object.entries(regions)) {
            const item = button(text, () => this.navigate(key), 'plain'); item.prepend(createAtriaIcon(document, icons[key])); item.dataset.region = key; this.nav.append(item);
        }
        this.scopeNote = node('div', 'storage-center-sidebar-note'); sidebar.append(this.nav, this.scopeNote);
        this.scopeControls = node('div', 'storage-center-scope'); this.scopeControls.setAttribute('role', 'group'); this.scopeControls.setAttribute('aria-label', tl('Storage scope'));
        for (const [key, text] of [['server', 'Server account'], ['browser', 'Current browser']]) {
            const item = button(text, () => this.changeScope(key), 'plain'); item.dataset.scope = key; this.scopeControls.append(item);
        }
        this.content = node('main', 'storage-center-content'); this.content.tabIndex = -1;
        this.status = node('div', 'storage-center-status'); this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite'); this.status.setAttribute('aria-atomic', 'true');
        this.body = node('div', 'storage-center-body'); this.body.append(this.status, this.content);
        return sidebar;
    }
    watch(frame) {
        this.drawer = new StorageCenterDrawer(frame, () => this.keyboard);
        this.drawer.dialog.addEventListener('close', () => { if (this.refreshDeferred && !this.closed) this.refreshView(); });
        const changed = event => { if (this.scope === 'server' && event.detail?.handle === this.data?.scope?.handle) void this.refresh({ background: true }); };
        document.addEventListener('atria:resources-changed', changed);
        const timer = setInterval(() => { if (document.visibilityState === 'visible') void this.refresh({ background: true }); }, 15000);
        return () => {
            this.closed = true; this.generation++; this.detailGeneration++; this.previewGeneration++; this.drawer.destroy(); clearInterval(timer);
            document.removeEventListener('atria:resources-changed', changed); if (this.activeTask?.scope === 'browser') this.browser.stop(this.activeTask.id);
        };
    }
    open() {
        const previousFocus = document.activeElement, dialog = node('dialog', 'storage-center-dialog'); this.dialog = dialog;
        dialog.setAttribute('aria-labelledby', 'storage-center-title');
        const sidebar = this.assemble(dialog);
        const header = node('header', 'storage-center-header'), breadcrumb = node('div', 'storage-center-breadcrumb');
        breadcrumb.append(node('span', '', tl('Settings')), node('span', '', '/'), node('strong', '', tl('Resource usage & safe cleanup')));
        const close = createAtriaIconButton(document, { label: tl('Close'), icon: 'close', onClick: () => dialog.close() });
        header.append(breadcrumb, this.scopeControls, close);
        dialog.append(sidebar, header, this.body); document.body.append(dialog);
        const stop = this.watch(dialog);
        dialog.addEventListener('close', event => { if (event.target !== dialog) return; stop(); dialog.remove(); previousFocus?.focus(); });
        dialog.showModal(); close.focus(); this.refresh();
        return new Promise(resolve => dialog.addEventListener('close', event => { if (event.target === dialog) resolve(); }));
    }
    // Storage center as a full utility page (P-02): section nav + main, no Inspector.
    // The scope switch joins the shell top bar when one is offered.
    mount(container, { toolbar = null } = {}) {
        const page = node('section', 'storage-center-dialog storage-center-page'); this.dialog = page;
        page.close = () => {};
        page.setAttribute('aria-labelledby', 'storage-center-title');
        const sidebar = this.assemble(page, { page: true });
        if (toolbar) toolbar.append(this.scopeControls);
        else { const header = node('header', 'storage-center-header'); header.append(this.scopeControls); page.append(header); }
        page.append(sidebar, this.body); container.replaceChildren(page);
        const stop = this.watch(page);
        this.refresh();
        return { root: page, dispose: () => { stop(); this.scopeControls.remove(); page.remove(); } };
    }
    navigate(region, category = null) {
        this.detailGeneration++; this.previewGeneration++; this.drawer.close(true);
        this.region = region; this.category = category; this.query = ''; this.offset = 0;
        this.render(); this.content.focus({ preventScroll: true }); this.body.scrollTop = 0;
    }
    changeScope(scope) {
        if (scope === this.scope) return;
        this.scope = scope; this.generation++; this.selection.clear(); this.safeSelection.clear(); this.safeInitialized = false;
        this.data = null; this.navigate('overview'); void this.refresh();
    }
    error(error) { if (!this.closed) { this.status.textContent = error.message + (this.data ? ' ' + ft('Last successful measurement: ${0}', [formatAtriaDate(this.data.completedAt)]) : ''); this.status.dataset.error = 'true'; } }
    async refresh({ background = false } = {}) {
        if (this.loadingScope === this.scope) return;
        const scope = this.scope, generation = ++this.generation; this.loadingScope = scope;
        if (!this.data) this.render();
        if (!background) { this.status.textContent = tl('Measuring resources…'); this.status.dataset.error = 'false'; this.content.setAttribute('aria-busy', 'true'); }
        if (this.refreshButton) { this.refreshButton.disabled = true; this.refreshButton.classList.add('storage-center-loading'); setAtriaButtonLabel(this.refreshButton, tl('Refreshing…')); }
        try {
            const data = scope === 'server' ? await this.api('snapshot') : await this.browser.snapshot();
            if (generation !== this.generation || this.closed) return;
            this.data = data;
            this.status.textContent = background ? '' : ft('Measured ${0}.', [formatAtriaDate(data.completedAt)]); this.status.dataset.error = 'false';
            // Keep the actual input node and IME composition alive during concurrent refreshes.
            this.refreshView();
        } catch (error) { if (generation === this.generation) this.error(error); } finally {
            if (generation === this.generation) {
                this.content.removeAttribute('aria-busy'); this.loadingScope = null;
                if (this.refreshButton) { this.refreshButton.disabled = false; this.refreshButton.classList.remove('storage-center-loading'); setAtriaButtonLabel(this.refreshButton, tl('Refresh')); }
            }
        }
    }
    refreshView() {
        if (this.taskView || this.closed) return;
        const focus = document.activeElement;
        if (this.drawer.dialog.open) { this.refreshDeferred = true; return; }
        if (this.region === 'overview' && this.category && this.drawResources) {
            const rowLabel = focus?.closest('.storage-center-resource') ? focus.getAttribute('aria-label') || focus.textContent : null;
            this.drawResources();
            if (rowLabel) {
                const replacement = [...this.content.querySelectorAll('button,input')].find(item => (item.getAttribute('aria-label') || item.textContent) === rowLabel);
                (replacement || this.content).focus({ preventScroll: true });
            }
            return;
        }
        if (this.content.contains(focus) && focus.matches('input,textarea,select,[contenteditable="true"]')) { this.refreshDeferred = true; return; }
        const label = this.content.contains(focus) && focus.tagName === 'BUTTON' ? focus.getAttribute('aria-label') || focus.textContent : null;
        const mainFocused = focus === this.content || focus === this.content.querySelector('h1');
        this.render();
        if (mainFocused) this.content.focus({ preventScroll: true });
        else if (label) [...this.content.querySelectorAll('button')].find(item => (item.getAttribute('aria-label') || item.textContent) === label)?.focus({ preventScroll: true });
    }
    heading(text, subtitle = '') {
        const header = node('div', 'storage-center-page-heading'), copy = node('div');
        const title = node('h1', '', tl(text)); title.id = 'storage-center-title'; title.tabIndex = -1; copy.append(title);
        if (subtitle) this.note(subtitle, copy);
        this.refreshButton = button('Refresh', () => this.refresh()); this.refreshButton.prepend(createAtriaIcon(document, 'retry', { size: 15 }));
        header.append(copy, this.refreshButton); this.content.append(header); return title;
    }
    note(text, parent = this.content) { parent.append(node('p', 'storage-center-note', tl(text))); }
    render() {
        if (this.closed) return;
        this.renderGeneration = (this.renderGeneration || 0) + 1;
        this.taskView = false; this.drawResources = null; this.refreshDeferred = false;
        for (const item of this.nav.children) item.setAttribute('aria-current', item.dataset.region === this.region ? 'page' : 'false');
        for (const item of this.scopeControls.children) item.setAttribute('aria-pressed', String(item.dataset.scope === this.scope));
        this.scopeNote.replaceChildren(node('strong', '', tl(this.scope === 'server' ? 'Server account' : 'This device · Current site')), node('p', '', tl('Usage is measured separately for each scope.')));
        this.content.replaceChildren();
        if (!this.data) { this.heading(this.region === 'overview' ? 'Resources & cleanup' : regions[this.region]); this.note('Measuring resources…'); this.content.setAttribute('aria-busy', 'true'); return; }
        if (this.region === 'tasks') { this.renderTasks(); return; }
        if (this.region === 'advanced') { this.renderAdvanced(); return; }
        if (this.region === 'recovery') { this.renderRecovery(); return; }
        if (this.region === 'cleanup') { this.renderCleanup(); return; }
        if (this.category) {
            this.content.append(button('Back to overview', () => this.navigate('overview'), 'plain'));
            this.heading(labels[this.category], this.scope === 'server' ? 'Inspect resources, references and available actions.' : 'This device · Current site'); this.renderResources(); return;
        }
        this.heading('Resources & cleanup', 'See your usage. Make room for what comes next.');
        const browser = this.scope === 'browser', partial = this.data.completeness === 'partial';
        if (partial) this.notice('Some storage could not be measured. The known subtotal is not a complete account total.', 'warning');
        if (!browser && this.data.quotaBytes >= 0 && this.data.totalBytes != null && this.data.totalBytes > this.data.quotaBytes) this.notice('Account quota exceeded. You can still inspect resources and clean verified data. Unexpired recovery records are retained.', 'warning');
        // Usage: a donut of measured categories beside the category cards (prototype C01).
        // Unknown or partial totals never draw a complete ring.
        const summary = node('section', 'storage-center-usage'); summary.setAttribute('aria-label', tl('Usage overview'));
        const amount = browser ? this.data.knownBytes : this.data.totalBytes ?? this.data.knownBytes;
        const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 200 200'); svg.setAttribute('class', 'storage-center-donut'); svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', ft('${0} used', [size(amount)]));
        const ring = document.createElementNS(ns, 'g'); ring.setAttribute('transform', 'rotate(-90 100 100)'); svg.append(ring);
        const circle = (color, length = null, offset = 0) => {
            const item = document.createElementNS(ns, 'circle'); item.setAttribute('cx', '100'); item.setAttribute('cy', '100'); item.setAttribute('r', '80');
            item.style.stroke = color; if (length != null) { item.setAttribute('stroke-dasharray', `${length} ${502.65 - length}`); item.setAttribute('stroke-dashoffset', String(-offset)); }
            ring.append(item);
        };
        circle('var(--surface-press)');
        const total = Object.entries(this.data.categories).filter(([key]) => key !== 'advanced').reduce((sum, [, item]) => sum + (item.bytes || 0), 0);
        if (!partial && total > 0) {
            let offset = 0;
            for (const [category, item] of Object.entries(this.data.categories)) {
                if (category === 'advanced' || !item.bytes) continue;
                const length = item.bytes / total * 502.65;
                circle(categoryColors[category] || 'var(--text-3)', Math.max(0, length - 2), offset); offset += length;
            }
        }
        const centre = document.createElementNS(ns, 'text'); centre.setAttribute('class', 'storage-center-donut__value'); centre.setAttribute('x', '100'); centre.setAttribute('y', '104'); centre.textContent = size(amount);
        const caption = document.createElementNS(ns, 'text'); caption.setAttribute('class', 'storage-center-donut__caption'); caption.setAttribute('x', '100'); caption.setAttribute('y', '126');
        caption.textContent = tl(partial ? 'Known subtotal' : browser ? 'This device · Current site' : 'Server account');
        svg.append(centre, caption);
        const side = node('div', 'storage-center-usage__side');
        const sideHead = node('div', 'storage-center-usage__head');
        sideHead.append(node('h2', '', tl(browser ? 'Current site data' : 'Categories')), node('span', 'storage-center-note', tl(browser ? 'Separate from server data' : 'Open a category; protected items open in their business workspace.')));
        const quick = node('div', 'storage-center-usage__quick');
        const chip = (text, click, tone = '') => { const control = button(text, click, 'plain'); control.classList.add('storage-center-chip'); if (tone) control.dataset.tone = tone; quick.append(control); };
        if (browser) {
            chip(ft('Site estimate ${0}', [size(this.data.totalBytes)]), () => this.navigate('advanced'));
            chip(tl('Inspect local data'), () => this.navigate('cleanup'));
        } else {
            chip(this.data.safeCleanupBytes > 0 ? ft('${0} safe to clean', [size(this.data.safeCleanupBytes)]) : tl('No safe suggestions'), () => this.navigate('cleanup'), this.data.safeCleanupBytes > 0 ? 'safe' : '');
            const recoveryBytes = this.data.recoveryUnavailable ? null : this.data.recovery.reduce((sum, item) => sum + (item.bytes || 0), 0);
            chip(ft('${0} in recycle bin', [size(recoveryBytes)]), () => this.navigate('recovery'));
        }
        sideHead.append(quick); side.append(sideHead);
        const list = node('section', 'storage-center-categories'); list.setAttribute('aria-label', tl('Resource categories'));
        for (const [category, item] of Object.entries(this.data.categories)) {
            if (category === 'advanced') continue;
            const control = button(labels[category] || category, () => this.navigate(category === 'recovery' ? 'recovery' : 'overview', category === 'recovery' ? null : category), 'plain');
            control.classList.add('storage-center-category'); control.setAttribute('aria-label', tl(labels[category] || category));
            const swatch = node('i', 'storage-center-category__swatch'); swatch.style.background = categoryColors[category] || 'var(--text-3)';
            const name = node('strong', 'storage-center-category__name', tl(labels[category] || category));
            const meta = node('span', 'storage-center-category__meta', browser ? ft('${0} objects', [numeric(item.objectCount ?? item.count)]) : ft('${0} objects · ${1} stored units', [numeric(item.objectCount), numeric(item.count)]));
            control.replaceChildren(swatch, name, node('span', 'storage-center-category__size storage-center-numeric', size(item.bytes)), meta);
            list.append(control);
        }
        side.append(list);
        const measured = node('p', 'storage-center-measured');
        measured.textContent = [tl(partial ? 'Known subtotal — some storage could not be measured' : browser ? 'This device · Current site' : 'Recycle bin data is included in the total.'), ft('Quota: ${0}', [this.data.quotaBytes === -1 ? tl('Unlimited') : size(this.data.quotaBytes)]), formatAtriaDate(this.data.completedAt)].join(' · ');
        side.append(measured);
        summary.append(svg, side); this.content.append(summary);
        const advanced = this.data.categories.advanced;
        const footer = node('div', 'storage-center-overview-footer');
        if (advanced) footer.append(button(ft('Advanced data: ${0}', [size(advanced.bytes)]), () => this.navigate('advanced'), 'plain'));
        if (this.data.physical) {
            const detail = node('details', 'storage-center-physical'); detail.append(node('summary', '', tl('Physical usage and measurement coverage')));
            this.note(ft('Measured account files: ${0}. Database allocation, indexes and delayed reclamation differ from resource data.', [size(this.data.physical.bytes)]), detail);
            if (this.data.physical.sharedDatabaseBytes === null) this.note('Physical usage of the shared database cannot be assigned to this account.', detail); footer.prepend(detail);
        }
        this.content.append(footer);
        if (browser) this.note('The site estimate and individually measured records use different methods. They are never added together.');
        if (this.data.errors.length) for (const error of this.data.errors) this.note(`${error.source}: ${error.reason}`);
    }
    notice(text, tone = 'neutral', parent = this.content) {
        const notice = node('div', 'storage-center-notice'); notice.dataset.tone = tone;
        notice.append(createAtriaIcon(document, tone === 'warning' ? 'warning' : 'info', { size: 16 }), node('p', '', tl(text))); parent.append(notice); return notice;
    }
    filtered() {
        return this.data.resources.filter(item => (!this.category || item.category === this.category) && item.name.toLocaleLowerCase().includes(this.query.toLocaleLowerCase()))
            .sort((a, b) => this.sort === 'name' ? a.name.localeCompare(b.name) : (b.bytes ?? -1) - (a.bytes ?? -1));
    }
    renderResources() {
        const toolbar = node('div', 'storage-center-filters'), search = node('input', 'text_pole'), sort = node('select', 'text_pole'), rows = node('div', 'storage-center-list');
        search.type = 'search'; search.name = 'resource-search'; search.autocomplete = 'off'; search.value = this.query; search.placeholder = tl('Search resources…'); search.setAttribute('aria-label', tl('Search resources')); sort.name = 'resource-sort'; sort.setAttribute('aria-label', tl('Sort resources'));
        for (const [value, label] of [['size', 'Largest first'], ['name', 'Name']]) { const option = node('option', '', tl(label)); option.value = value; sort.append(option); } sort.value = this.sort || 'size';
        const selectionBar = node('div', 'storage-center-selection-mount');
        const select = () => {
            this.status.textContent = ft('${0} selected', [this.selection.size]); this.status.dataset.error = 'false';
            const hadSelection = selectionBar.hasChildNodes(); selectionBar.replaceChildren();
            if (!this.selection.size) return;
            const bar = node('div', 'storage-center-selection');
            bar.append(node('span', '', ft('${0} selected', [numeric(this.selection.size)])), button('Clear selection', () => { this.selection.clear(); draw(); select(); search.focus({ preventScroll: true }); }, 'plain'));
            bar.append(button(this.scope === 'server' ? 'Preview recycle bin move' : 'Preview permanent deletion', () => this.preview(this.scope === 'server' ? 'trash' : 'purge', [...this.selection.values()]), 'primary'));
            selectionBar.append(bar);
            if (!hadSelection && !this.keyboard && !prefersStorageReducedMotion()) bar.animate([{ transform: 'translateY(8px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 160, easing: 'cubic-bezier(.23,1,.32,1)' });
        };
        const draw = () => {
            rows.replaceChildren(); const filtered = this.filtered(); this.offset = Math.min(this.offset, Math.max(0, Math.ceil(filtered.length / 50) - 1) * 50); const page = filtered.slice(this.offset, this.offset + 50);
            const controls = node('div', 'storage-center-actions');
            for (const [label, items] of [['Select current page', page], ['Select all filtered results', filtered]]) controls.append(button(label, () => { for (const item of items) if (item.managed && item.target) this.selection.set(item.id, item.target); draw(); select(); }));
            rows.append(controls);
            const table = node('div', 'storage-center-resource-table');
            if (!page.length) { const empty = node('div', 'storage-center-empty'); empty.append(createAtriaIcon(document, 'search'), node('h2', '', tl('No resources match this view.'))); rows.append(empty); }
            for (const item of page) {
                const row = node('div', 'storage-center-resource'), check = node('input'); check.type = 'checkbox'; check.name = 'resource-selection'; check.checked = this.selection.has(item.id); check.disabled = !item.managed || !item.target; check.setAttribute('aria-label', ft('Select ${0}', [item.name]));
                const checkLabel = node('label', 'storage-center-check-target'); checkLabel.append(check);
                check.addEventListener('change', () => { if (check.checked) this.selection.set(item.id, item.target); else this.selection.delete(item.id); select(); });
                const name = node('div', 'storage-center-resource-name');
                if (item.managed) name.append(button(item.name, () => this.detail(item), 'plain'));
                else name.append(node('strong', '', item.name));
                name.append(node('small', '', tl(item.managed ? 'Inspect references before processing.' : 'Managed by its owner or available in Advanced tools')));
                row.append(checkLabel, name, node('span', 'storage-center-numeric', size(item.bytes)));
                if (item.managed) row.append(createAtriaIconButton(document, { label: ft('Details: ${0}', [item.name]), icon: 'chevron-right', onClick: () => this.detail(item) }));
                else { row.append(node('span', 'storage-center-note', explain(item.reason || 'owned-version-or-maintenance-data'))); if (item.reason === 'account-backup-center') row.append(button('Account backup & export', () => this.openBackups())); }
                table.append(row);
            }
            if (page.length) rows.append(table);
            const pager = node('div', 'storage-center-actions'), previous = button('Previous', () => { this.offset = Math.max(0, this.offset - 50); draw(); }), next = button('Next', () => { this.offset += 50; draw(); });
            previous.disabled = this.offset === 0; next.disabled = this.offset + 50 >= filtered.length;
            const footer = node('div', 'storage-center-list-footer'); footer.append(node('span', '', ft('Showing ${0}–${1} of ${2}', [filtered.length ? this.offset + 1 : 0, Math.min(this.offset + 50, filtered.length), filtered.length])), pager); pager.append(previous, next); rows.append(footer); select();
        };
        const filter = () => { this.query = search.value; this.offset = 0; draw(); };
        search.addEventListener('input', event => { if (!event.isComposing) filter(); }); search.addEventListener('compositionend', filter);
        sort.addEventListener('change', () => { this.sort = sort.value; this.offset = 0; draw(); }); toolbar.append(search, sort); this.content.append(toolbar, rows, selectionBar); this.drawResources = draw; draw();
    }
    async detail(item) {
        const generation = ++this.detailGeneration, scope = this.scope;
        const content = node('div'); this.note('Checking the fixed selection…', content); content.setAttribute('aria-busy', 'true'); this.drawer.open(item.name, content);
        try {
            const checked = scope === 'server' ? await this.api('detail', { target: item.target }) : { ...item, allowed: true };
            if (this.closed || generation !== this.detailGeneration || scope !== this.scope || !this.drawer.dialog.open) return;
            content.replaceChildren(); content.removeAttribute('aria-busy');
            content.append(node('p', 'storage-center-detail-category', tl(labels[item.category] || item.category)));
            const meta = node('dl', 'storage-center-detail-meta');
            for (const [label, value] of [['Resource data', size(checked.bytes)], ['Original identity', item.target.id || item.target.path?.join(' / ')], ['Storage scope', tl(scope === 'server' ? 'Current account · Server' : 'This device · Current site')]]) {
                const row = node('div'); row.append(node('dt', '', tl(label)), node('dd', '', value)); meta.append(row);
            }
            content.append(meta, node('h3', '', tl('References & protection')));
            if (checked.recordCount != null) this.note(ft('${0} records and ${1} files are handled as one complete object.', [checked.recordCount, checked.fileCount]), content);
            if (checked.dependencyCount) this.note(ft('${0} shared or exact dependencies remain protected.', [checked.dependencyCount]), content);
            for (const related of [...(checked.references || []), ...(checked.dependencies || [])]) this.note(`${related.name} · ${related.kind}`, content);
            if (checked.relatedMediaBytes != null) this.note(ft('Referenced media: ${0}. Shared data is counted once in its own category.', [size(checked.relatedMediaBytes)]), content);
            if (checked.reason) this.notice(explain(checked.reason), 'warning', content);
            this.notice(scope === 'server' ? 'This keeps the complete recovery closure for 30 days and does not immediately release its data.' : 'Browser deletion cannot be restored from the server recycle bin.', scope === 'server' ? 'neutral' : 'warning', content);
            const controls = node('div', 'storage-center-actions');
            if (scope === 'server') controls.append(button('Open business workspace', () => this.openBusiness(item, checked), 'primary'));
            const review = button(scope === 'server' ? 'Preview recycle bin move' : 'Preview permanent deletion', () => this.preview(scope === 'server' ? 'trash' : 'purge', [item.target])); review.disabled = !checked.allowed; controls.append(review); content.append(controls);
        } catch (error) {
            if (generation !== this.detailGeneration || this.closed || scope !== this.scope) return;
            content.removeAttribute('aria-busy'); content.replaceChildren(); this.notice(error.message, 'warning', content); content.append(button('Retry', () => this.detail(item)));
        }
    }
    async openBusiness(item, checked) {
        const workspace = globalThis.Atria?.shell?.getWorkspaceHost?.(), target = item.target;
        if (!workspace) return;
        try {
            const action = {
                session: () => workspace.openSession(target.id), project: () => workspace.openBuild(target.id, item.name),
                package: () => workspace.openLibraryWork(target.id, item.name), world: () => workspace.openLibraryWorld(target.id, item.name),
                knowledge: () => workspace.openLibraryKnowledge(target.id, item.name), persona: () => workspace.openLibraryPersona(checked.personaRef, item.name),
                connection: () => workspace.openRuntimeSection('connections', target.id), model: () => workspace.openRuntimeSection('models', target.id), route: () => workspace.openRuntimeSection('routes', target.id),
                versioned: () => target.resourceType.startsWith('core.') ? workspace.openLibraryResource({ scope: 'library', resourceType: target.resourceType, resourceId: target.id, revision: checked.currentRevision }, item.name) : workspace.openUtility('plugins'),
            }[target.type];
            if (action) { const changed = await action(); if (changed !== false) this.dialog.close(); } else if (['experience', 'evidence', 'goal'].includes(target.type)) { this.dialog.close(); globalThis.Atria?.shell?.getLearningCenter?.()?.open(); } else this.status.textContent = tl('Manage this protected resource in its business workspace.');
        } catch (error) { this.error(error); }
    }
    async openBackups() {
        try {
            const [{ openBackupSyncCenter }, user] = await Promise.all([import('./backup-sync-center.js'), import('./user.js')]);
            this.dialog.close(); await openBackupSyncCenter({ handle: user.getCurrentUserHandle(), canManageGlobalExtensions: user.isAdmin(), onRestored: () => location.reload() });
        } catch (error) { this.error(error); }
    }
    renderCleanup() {
        this.heading(regions.cleanup, 'Only currently verified, rebuildable or quarantined garbage is selected by default. Business assets require your selection.');
        const suggestions = this.data.suggestions;
        if (this.scope === 'browser') this.notice('Browser deletion cannot be restored from the server recycle bin.', 'warning');
        if (!suggestions.length) {
            const empty = node('section', 'storage-center-empty'); empty.append(createAtriaIcon(document, 'check'), node('h2', '', tl('There is no verified safe cleanup to perform.'))); this.content.append(empty);
        } else {
            const card = node('section', 'storage-center-card'); card.append(node('h2', '', tl('Safe to clean')));
            const keys = new Set(suggestions.map(item => JSON.stringify(item.target)));
            if (!this.safeInitialized) { this.safeSelection = new Set(keys); this.safeInitialized = true; } else this.safeSelection = new Set([...this.safeSelection].filter(key => keys.has(key)));
            const review = button('Preview safe cleanup', () => this.preview('clean', suggestions.filter(item => this.safeSelection.has(JSON.stringify(item.target))).map(item => item.target)), 'primary');
            const summary = node('span', 'storage-center-note');
            const update = () => { summary.textContent = ft('${0} selected', [numeric(this.safeSelection.size)]); review.disabled = !this.safeSelection.size; };
            for (const item of suggestions) {
                const key = JSON.stringify(item.target), row = node('label', 'storage-center-suggestion'), check = node('input'); check.type = 'checkbox'; check.name = 'safe-cleanup'; check.checked = this.safeSelection.has(key);
                const copy = node('span'); copy.append(node('strong', '', item.name), node('small', '', explain(item.reason))); row.append(check, copy, node('span', 'storage-center-numeric', size(item.bytes)));
                check.addEventListener('change', () => { if (check.checked) this.safeSelection.add(key); else this.safeSelection.delete(key); update(); }); card.append(row);
            }
            const controls = node('div', 'storage-center-card-footer'); controls.append(summary, review); card.append(controls); this.content.append(card); update();
        }
        const manual = node('section', 'storage-center-card'); manual.append(node('h2', '', tl('Your decision')));
        this.note('Unreferenced or older resources are never selected automatically.', manual);
        for (const category of this.scope === 'server' ? ['sessions', 'media'] : ['cache', 'offline', 'preferences']) {
            const row = node('div', 'storage-center-manual-row'); row.append(node('strong', '', tl(labels[category])), button('Review business resources', () => this.navigate('overview', category), 'plain')); manual.append(row);
        }
        this.content.append(manual);
    }
    renderRecovery() {
        this.heading(regions.recovery, 'Retained for 30 days. Restored objects keep their original identities and do not restart background work.');
        if (this.scope === 'browser') { this.note('Browser actions do not promise persistent recovery. Use a new preview for any permanent deletion.'); return; }
        this.notice('Recycle bin data is included in the total. Moving an item there retains its usage for 30 days.');
        this.content.append(button('Account backup & export', () => this.openBackups()));
        for (const item of this.data.historyReviews || []) this.content.append(button(ft('Review local Git publication: ${0}', [item.name]), () => this.preview('history', [item.target])));
        const list = node('section', 'storage-center-recovery-list');
        for (const item of this.data.recovery) {
            const row = node('article', 'storage-center-recovery'), copy = node('div'); copy.append(node('h3', '', item.name));
            this.note(ft('Deleted: ${0} · Expires: ${1}', [formatAtriaDate(item.createdAt), formatAtriaDate(item.expiresAt)]), copy); copy.append(node('span', 'storage-center-numeric', size(item.bytes))); row.append(copy, node('span', 'storage-center-badge', tl(item.state)));
            row.append(button('View & restore', () => this.recoveryDetail(item))); list.append(row);
        }
        this.content.append(list);
        if (this.data.recoveryUnavailable) this.note('Recovery records could not be read. Refresh after storage becomes available.');
        else if (!this.data.recovery.length) this.note('The recycle bin is empty.');
        this.content.append(button('Inspect saved backups', () => { this.region = 'overview'; this.category = 'recovery'; this.render(); }));
    }
    recoveryDetail(item) {
        const content = node('div'), meta = node('dl', 'storage-center-detail-meta');
        for (const [label, value] of [['Original identity', item.target?.id], ['Resource data', size(item.bytes)], ['Recovery expires', formatAtriaDate(item.expiresAt)]]) {
            const row = node('div'); row.append(node('dt', '', tl(label)), node('dd', '', value || tl('Unavailable'))); meta.append(row);
        }
        content.append(meta);
        this.note(ft('${0} records and ${1} files are handled as one complete object.', [item.recordCount, item.fileCount]), content);
        this.notice('Retained for 30 days. Restored objects keep their original identities and do not restart background work.', 'neutral', content);
        const controls = node('div', 'storage-center-actions');
        for (const action of ['restore', 'purge']) {
            const control = button(actions[action], () => this.preview(action, [{ type: 'recovery', id: item.id }]), action === 'restore' ? 'primary' : 'secondary');
            control.disabled = item.state !== 'retained'; controls.append(control);
        }
        if (item.state === 'paused-review') controls.append(button('Review interrupted recovery', () => this.preview('repair', [{ type: 'recovery', id: item.id }])));
        content.append(controls); this.drawer.open(item.name, content);
    }
    async preview(action, targets) {
        if (!targets.length || this.previewBusy) return;
        const scope = this.scope, generation = ++this.previewGeneration, source = document.activeElement;
        this.previewBusy = true; if (source?.tagName === 'BUTTON') source.disabled = true;
        this.drawer.body.querySelector('[data-preview-error]')?.remove();
        this.status.textContent = tl('Checking the fixed selection…');
        try {
            const task = scope === 'server' ? await this.api('preview', { action, targets }) : await this.browser.preview(action, targets);
            if (this.closed || generation !== this.previewGeneration || scope !== this.scope) {
                if (scope === 'server') await this.api('stop', { id: task.id }); else this.browser.save({ ...task, status: 'stopped' });
                return;
            }
            this.previewReturn = { region: this.region, category: this.category };
            this.drawer.close(true); this.activeTask = task; this.renderTask(task, true);
            this.content.querySelector('h1')?.focus({ preventScroll: true }); this.body.scrollTop = 0;
        } catch (error) {
            if (generation === this.previewGeneration && scope === this.scope) {
                this.error(error);
                if (this.drawer.dialog.open) { const message = this.notice(error.message, 'warning', this.drawer.body); message.dataset.previewError = 'true'; message.setAttribute('role', 'status'); }
            }
        } finally { this.previewBusy = false; if (source?.isConnected && source.tagName === 'BUTTON') source.disabled = false; }
    }
    renderTask(task, confirm = false) {
        if (this.closed || this.scope !== task.scope) return;
        const previousLabel = this.content.contains(document.activeElement) ? document.activeElement.textContent : null;
        const scrollTop = this.body.scrollTop;
        this.taskView = true;
        this.drawResources = null;
        this.content.replaceChildren();
        this.heading(confirm ? 'Review fixed operation' : 'Operation result', actions[task.action]);
        this.note(task.scope === 'server' ? 'Current account · Server' : 'This device · Current site');
        if (task.action === 'trash') this.notice('This keeps the complete recovery closure for 30 days and does not immediately release its data.');
        if (['purge', 'clean'].includes(task.action)) this.notice('This action cannot be undone.', 'warning');
        if (task.scope === 'browser') this.notice('Keep this page open. Interrupted browser work requires a fresh review; completed changes remain effective.', 'warning');
        const pending = task.items.filter(item => item.status === 'pending'), complete = task.items.filter(item => ['succeeded', 'failed', 'blocked', 'repreview'].includes(item.status));
        const eligibleBytes = pending.some(item => item.bytes == null) ? null : pending.reduce((sum, item) => sum + item.bytes, 0);
        const metrics = node('section', 'storage-center-preview-metrics');
        for (const [label, value] of [[confirm ? 'Ready to process' : 'Objects processed', numeric(confirm ? pending.length : complete.length)], [confirm ? 'Data in this operation' : 'Processed data', size(confirm ? eligibleBytes : task.processedBytes)], ['Immediate space release', task.action === 'trash' ? size(0) : size(task.estimatedPhysicalRelease)]]) {
            const stat = node('div'); stat.append(node('span', '', tl(label)), node('strong', 'storage-center-numeric', value)); metrics.append(stat);
        }
        this.content.append(metrics);
        if (!confirm && ['running', 'queued'].includes(task.status)) {
            const progress = node('progress', 'storage-center-progress'); progress.max = task.items.length; progress.value = complete.length; progress.setAttribute('aria-label', tl('Objects processed')); this.content.append(progress);
        }
        this.note('Physical space released cannot be inferred from the amount processed. Usage is measured again after completion.');
        const listTitle = node('div', 'storage-center-section-heading'); listTitle.append(node('h2', '', tl('Fixed object list')), node('span', '', ft('Reviewed ${0}. Later matches are not included.', [formatAtriaDate(task.createdAt)]))); this.content.append(listTitle);
        if (task.action === 'history') this.note('This reconciles verified local Git files only. It does not run a model or contact a remote.');
        if (task.deduplicatedCount) this.note(ft('${0} duplicate or owned child selections are handled with their parent.', [task.deduplicatedCount]));
        const list = node('div', 'storage-center-results');
        for (const item of task.items) { const row = node('div', 'storage-center-result'); row.dataset.state = item.status; row.append(node('strong', '', item.name), node('span', 'storage-center-numeric', size(item.bytes)), node('span', 'storage-center-badge', tl(states[item.status] || item.status))); if (item.reason) this.note(explain(item.reason), row); if (item.consequences?.includes('ironman-remains-terminal')) this.note('Ironman termination is permanent. Recovery does not revive the run.', row); if (item.resumePhase) this.note(ft('Reviewed recovery phase: ${0}', [item.resumePhase]), row); if (item.consequences?.includes('permanent-deletion')) this.note('This action cannot be undone.', row); list.append(row); } this.content.append(list);
        const controls = node('div', 'storage-center-actions storage-center-preview-actions');
        if (confirm) {
            const execute = button(actions[task.action], async () => {
                execute.disabled = true;
                try {
                    if (['purge', 'clean'].includes(task.action) && !await this.confirmPermanent(task)) return;
                    if (this.closed || this.scope !== task.scope || this.activeTask?.id !== task.id) return;
                    if (task.scope === 'browser') {
                        const update = progress => { if (this.activeTask?.id === task.id) { this.activeTask = progress; if (this.taskView) this.renderTask(progress); } };
                        const result = await this.browser.execute(task.id, update); update(result); await this.remeasureAfterTask();
                    } else { await this.api('execute', { id: task.id }); this.watchTask(task.id); }
                } catch (error) { this.error(error); } finally { if (execute.isConnected) execute.disabled = false; }
            }, ['purge', 'clean'].includes(task.action) ? 'destructive' : 'primary'); execute.disabled = !task.items.some(item => item.status === 'pending'); controls.append(execute, button('Cancel', async () => { try { if (task.scope === 'server') await this.api('stop', { id: task.id }); else this.browser.save({ ...task, status: 'stopped' }); this.render(); } catch (error) { this.error(error); } }));
        } else if (['queued', 'running'].includes(task.status)) {
            const stop = button('Stop after current object', async () => {
                stop.disabled = true;
                try { if (task.scope === 'server') await this.api('stop', { id: task.id }); else this.browser.stop(task.id); this.status.textContent = tl('Stopping after the current object. Completed changes remain effective.'); } catch (error) { this.error(error); stop.disabled = false; }
            }); stop.disabled = Boolean(task.stopRequested); controls.append(stop);
        } else {
            const remaining = task.items.filter(item => item.status !== 'succeeded').map(item => item.target); if (remaining.length) controls.append(button('Review remaining items again', () => this.preview(task.action, remaining)));
            controls.append(button('Refresh resources', () => { this.selection.clear(); this.navigate('overview'); void this.refresh(); }));
        }
        this.content.append(controls); this.status.textContent = ft('Operation ${0}: ${1}', [task.id, tl(states[task.status] || task.status)]); this.status.dataset.error = 'false';
        if (previousLabel) [...controls.querySelectorAll('button')].find(item => item.textContent === previousLabel)?.focus({ preventScroll: true });
        this.body.scrollTop = scrollTop;
    }
    async confirmPermanent(task) {
        const content = node('div', 'storage-center-permanent-confirm');
        content.append(node('h2', '', tl('Confirm permanent deletion')), node('p', '', tl('This action cannot be undone.')));
        const label = node('label'), check = node('input'); check.type = 'checkbox'; check.name = 'confirm-permanent-deletion';
        label.append(check, node('span', '', tl('I reviewed this list and understand that these data cannot be recovered.'))); content.append(label);
        const result = await callGenericPopup(content, POPUP_TYPE.CONFIRM, '', {
            okButton: tl('Permanently delete'), cancelButton: tl('Back to preview'), animation: 'none',
            defaultResult: POPUP_RESULT.NEGATIVE,
            onOpen: popup => {
                const update = () => { popup.okButton.setAttribute('aria-disabled', String(!check.checked)); popup.okButton.classList.toggle('disabled', !check.checked); };
                check.addEventListener('change', update); update();
            },
            onClosing: popup => popup.result !== POPUP_RESULT.AFFIRMATIVE || check.checked,
        });
        return result === POPUP_RESULT.AFFIRMATIVE && check.checked && task.id === this.activeTask?.id;
    }
    async remeasureAfterTask() {
        const scope = this.scope;
        this.selection.clear();
        try {
            const data = scope === 'server' ? await this.api('snapshot') : await this.browser.snapshot();
            if (this.closed || scope !== this.scope) return;
            this.data = data; this.refreshView();
        } catch (error) { if (scope === this.scope) this.error(error); }
    }
    async watchTask(id) {
        if (this.closed) return;
        try {
            const task = await this.api('task', { id });
            const showing = this.taskView && this.activeTask?.id === id;
            if (this.activeTask?.id === id) this.activeTask = task;
            if (showing) this.renderTask(task);
            if (['running', 'queued'].includes(task.status)) setTimeout(() => this.watchTask(id), 700);
            else { await notifyStorageChange(task.handle, task.items.filter(item => item.status === 'succeeded').map(item => item.result?.target || item.target)); await this.remeasureAfterTask(); }
        } catch (error) { if (this.scope === 'server') this.error(error); }
    }
    async renderTasks() {
        const scope = this.scope, generation = this.renderGeneration;
        this.heading(regions.tasks);
        try {
            const tasks = scope === 'server' ? await this.api('tasks') : this.browser.tasks();
            if (this.closed || generation !== this.renderGeneration || scope !== this.scope) return;
            if (!tasks.length) { const empty = node('div', 'storage-center-empty'); empty.append(createAtriaIcon(document, 'timeline'), node('h2', '', tl('There are no recorded operations.'))); this.content.append(empty); }
            for (const task of tasks) {
                const card = node('article', 'storage-center-task-card'), title = node('div', 'storage-center-task-heading');
                title.append(node('h2', '', tl(actions[task.action])), node('span', 'storage-center-badge', tl(states[task.status] || task.status))); card.append(title);
                this.note(formatAtriaDate(task.createdAt), card);
                const done = task.items.filter(item => item.status === 'succeeded').length;
                card.append(node('strong', 'storage-center-task-count', `${numeric(done)} / ${numeric(task.items.length)}`));
                card.append(button('View operation', () => { this.activeTask = task; this.renderTask(task, task.status === 'preview'); if (['queued', 'running'].includes(task.status) && task.scope === 'server') void this.watchTask(task.id); }, 'plain')); this.content.append(card);
            }
        } catch (error) { if (!this.closed && generation === this.renderGeneration && scope === this.scope) this.error(error); }
    }
    async renderAdvanced() {
        this.heading(regions.advanced); this.note('Legacy and unidentified data still count toward usage. Raw inspection does not grant broader business deletion rights.'); if (this.scope === 'browser') this.note('This device · Current site');
        const mount = node('div', 'storage-center-inspector'); this.content.append(mount);
        const inspector = createStorageInspector({ provider: this.scope === 'server' ? new RestProvider({ kind: 'self' }) : new BrowserProvider(), mutator: this.scope === 'server' ? new RestMutator() : new BrowserMutator(), container: mount,
            onDeletePreview: this.scope === 'browser' ? path => this.preview('purge', [{ path }]) : null });
        await inspector.init();
    }
}
export function mountStorageCenterPage(container, options = {}) { return new StorageCenterPanel(options).mount(container, options); }
// Opens the full Storage center page inside the shell; standalone hosts keep the dialog.
export function openStorageManagement(options = {}) {
    const workspace = globalThis.Atria?.shell?.getWorkspaceHost?.();
    if (workspace?.openUtility) { workspace.openUtility(options.initialScope === 'browser' ? 'storage:browser' : 'storage'); return Promise.resolve(); }
    return new StorageCenterPanel(options).open();
}
