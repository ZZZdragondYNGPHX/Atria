import { getRequestHeaders } from '../script.js';
import { createAtriaButton, formatAtriaDate } from './atria-shell/components.js';
import { translateShellText as tl, formatShellText as ft } from './atria-shell/localization.js';
import { BrowserProvider, BrowserMutator } from './browser-storage-inspector.js';
import { BrowserResourceCenter } from './browser-resource-center.js';
import { notifyStorageChange } from './native/storage-change-events.js';
import { createStorageInspector, RestMutator, RestProvider } from './storage-inspector.js';

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
            selection: new Map(), generation: 0, closed: false, activeTask: null });
    }
    open() {
        const previousFocus = document.activeElement, dialog = node('dialog', 'storage-center-dialog'); this.dialog = dialog;
        dialog.setAttribute('aria-labelledby', 'storage-center-title');
        const header = node('header', 'storage-center-header'), title = node('h1', '', tl('Resource usage & safe cleanup')); title.id = 'storage-center-title';
        const close = button('Close', () => dialog.close()); header.append(title, close);
        const toolbar = node('div', 'storage-center-scope'), label = node('label', '', tl('Storage scope'));
        this.scopeSelect = node('select', 'text_pole'); this.scopeSelect.setAttribute('aria-label', tl('Storage scope'));
        for (const [key, text] of [['server', 'Current account · Server'], ['browser', 'This device · Current site']]) { const option = node('option', '', tl(text)); option.value = key; this.scopeSelect.append(option); }
        this.scopeSelect.value = this.scope;
        this.scopeSelect.addEventListener('change', () => { this.scope = this.scopeSelect.value; this.selection.clear(); this.category = null; this.region = 'overview'; this.data = null; this.refresh(); });
        label.append(this.scopeSelect); toolbar.append(label, button('Refresh', () => this.refresh()));
        const layout = node('div', 'storage-center-layout'); this.nav = node('nav', 'storage-center-nav'); this.nav.setAttribute('aria-label', tl('Resource center sections'));
        for (const [key, text] of Object.entries(regions)) { const item = button(text, () => { this.region = key; this.category = null; this.offset = 0; this.render(); }); item.dataset.region = key; this.nav.append(item); }
        this.content = node('main', 'storage-center-content'); this.status = node('div', 'storage-center-status'); this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite');
        const body = node('div', 'storage-center-body'); body.append(this.status, this.content); layout.append(this.nav, body); dialog.append(header, toolbar, layout); document.body.append(dialog);
        const changed = event => { if (this.scope === 'server' && event.detail?.handle === this.data?.scope?.handle) void this.refresh({ background: true }); };
        document.addEventListener('atria:resources-changed', changed);
        const timer = setInterval(() => { if (document.visibilityState === 'visible') void this.refresh({ background: true }); }, 15000);
        dialog.addEventListener('close', () => { this.closed = true; this.generation++; clearInterval(timer); document.removeEventListener('atria:resources-changed', changed); if (this.activeTask?.scope === 'browser') this.browser.stop(this.activeTask.id); dialog.remove(); previousFocus?.focus(); }, { once: true });
        dialog.showModal(); close.focus(); this.refresh();
        return new Promise(resolve => dialog.addEventListener('close', resolve, { once: true }));
    }
    error(error) { if (!this.closed) { this.status.textContent = error.message + (this.data ? ' ' + ft('Last successful measurement: ${0}', [formatAtriaDate(this.data.completedAt)]) : ''); this.status.dataset.error = 'true'; } }
    async refresh({ background = false } = {}) {
        if (background && this.loadingScope === this.scope) return;
        const generation = ++this.generation; this.loadingScope = this.scope;
        if (!background) { this.status.textContent = tl('Measuring resources…'); this.status.dataset.error = 'false'; this.content.setAttribute('aria-busy', 'true'); }
        try {
            const data = this.scope === 'server' ? await this.api('snapshot') : await this.browser.snapshot();
            if (generation !== this.generation || this.closed) return;
            this.data = data;
            if (!background) this.status.textContent = ft('Measured ${0}.', [formatAtriaDate(data.completedAt)]);
            if (!background || !this.taskView) {
                const focus = document.activeElement, label = this.content.contains(focus) && focus.getAttribute('aria-label'), position = focus?.selectionStart;
                this.render();
                if (label) { const next = [...this.content.querySelectorAll('[aria-label]')].find(node => node.getAttribute('aria-label') === label); next?.focus({ preventScroll: true }); if (next?.type === 'search' && position != null) next.setSelectionRange(position, position); }
            }
        } catch (error) { if (generation === this.generation) this.error(error); } finally { if (generation === this.generation) { this.content.removeAttribute('aria-busy'); this.loadingScope = null; } }
    }
    heading(text) { const title = node('h2', '', tl(text)); title.tabIndex = -1; this.content.append(title); return title; }
    note(text, parent = this.content) { parent.append(node('p', 'storage-center-note', tl(text))); }
    render() {
        if (this.closed) return;
        this.renderGeneration = (this.renderGeneration || 0) + 1;
        this.taskView = false;
        for (const item of this.nav.children) item.setAttribute('aria-current', item.dataset.region === this.region ? 'page' : 'false');
        this.content.replaceChildren();
        if (!this.data) { this.note('Measuring resources…'); return; }
        if (this.region === 'tasks') { this.renderTasks(); return; }
        if (this.region === 'advanced') { this.renderAdvanced(); return; }
        if (this.region === 'recovery') { this.renderRecovery(); return; }
        if (this.region === 'cleanup') { this.renderCleanup(); return; }
        this.heading(this.category ? labels[this.category] : regions.overview);
        if (this.category) { this.renderResources(); return; }
        const summary = node('div', 'storage-center-summary'); summary.append(node('p', 'storage-center-number', size(this.data.totalBytes ?? this.data.knownBytes)));
        summary.append(node('p', '', tl(this.scope === 'browser' && this.data.totalBytes != null ? 'Site estimate reported by this browser' : this.data.totalBytes == null ? 'Known subtotal — some storage could not be measured' : 'Resource data saved in this account')));
        summary.append(node('p', 'storage-center-note', ft('Quota: ${0}', [this.data.quotaBytes === -1 ? tl('Unlimited') : size(this.data.quotaBytes)]))); this.content.append(summary);
        this.note(this.scope === 'browser' ? 'The site estimate and individually measured records use different methods. They are never added together.' : 'Recycle bin data is included in the total. Moving an item there retains its usage for 30 days.');
        for (const [category, total] of Object.entries(this.data.categories)) {
            if (category === 'advanced') continue;
            const row = node('div', 'storage-center-category'); row.append(button(labels[category] || category, () => { if (category === 'recovery') this.region = 'recovery'; else this.category = category; this.offset = 0; this.render(); }, 'plain'),
                node('span', '', this.scope === 'server' ? ft('${0} objects · ${1} stored units', [total.objectCount, total.count]) : ft('${0} objects', [total.objectCount ?? total.count])), node('strong', '', size(total.bytes))); this.content.append(row);
        }
        const advanced = this.data.categories.advanced;
        if (advanced) this.content.append(button(ft('Advanced data: ${0}', [size(advanced.bytes)]), () => { this.region = 'advanced'; this.render(); }, 'plain'));
        if (this.data.physical) {
            const detail = node('details', 'storage-center-physical'); detail.append(node('summary', '', tl('Physical usage and measurement coverage')));
            this.note(ft('Measured account files: ${0}. Database allocation, indexes and delayed reclamation differ from resource data.', [size(this.data.physical.bytes)]), detail);
            if (this.data.physical.sharedDatabaseBytes === null) this.note('Physical usage of the shared database cannot be assigned to this account.', detail); this.content.append(detail);
        }
        if (this.data.errors.length) { this.note('Some storage could not be measured. The known subtotal is not a complete account total.'); for (const error of this.data.errors) this.note(`${error.source}: ${error.reason}`); }
    }
    filtered() {
        return this.data.resources.filter(item => (!this.category || item.category === this.category) && item.name.toLocaleLowerCase().includes(this.query.toLocaleLowerCase()))
            .sort((a, b) => this.sort === 'name' ? a.name.localeCompare(b.name) : (b.bytes ?? -1) - (a.bytes ?? -1));
    }
    renderResources() {
        const toolbar = node('div', 'storage-center-filters'), search = node('input', 'text_pole'), sort = node('select', 'text_pole'), rows = node('div', 'storage-center-list');
        search.type = 'search'; search.value = this.query; search.placeholder = tl('Search resources'); search.setAttribute('aria-label', tl('Search resources')); sort.setAttribute('aria-label', tl('Sort resources'));
        for (const [value, label] of [['size', 'Largest first'], ['name', 'Name']]) { const option = node('option', '', tl(label)); option.value = value; sort.append(option); } sort.value = this.sort || 'size';
        const select = () => { this.status.textContent = ft('${0} selected', [this.selection.size]); };
        const draw = () => {
            rows.replaceChildren(); const filtered = this.filtered(), page = filtered.slice(this.offset, this.offset + 50);
            this.note(ft('Showing ${0}–${1} of ${2}', [filtered.length ? this.offset + 1 : 0, Math.min(this.offset + 50, filtered.length), filtered.length]), rows);
            const controls = node('div', 'storage-center-actions');
            for (const [label, items] of [['Select current page', page], ['Select all filtered results', filtered]]) controls.append(button(label, () => { for (const item of items) if (item.managed && item.target) this.selection.set(item.id, item.target); draw(); select(); }));
            controls.append(button('Clear selection', () => { this.selection.clear(); draw(); select(); })); rows.append(controls);
            if (!page.length) this.note('No resources match this view.', rows);
            for (const item of page) {
                const row = node('div', 'storage-center-resource'), check = node('input'); check.type = 'checkbox'; check.checked = this.selection.has(item.id); check.disabled = !item.managed; check.setAttribute('aria-label', ft('Select ${0}', [item.name]));
                check.addEventListener('change', () => { if (check.checked) this.selection.set(item.id, item.target); else this.selection.delete(item.id); review.disabled = !this.selection.size; select(); });
                row.append(check, node('span', 'storage-center-resource-name', item.name), node('span', '', size(item.bytes)));
                if (item.managed) row.append(button('Details', () => this.detail(item), 'plain'));
                else { row.append(node('span', 'storage-center-note', explain(item.reason || 'owned-version-or-maintenance-data'))); if (item.reason === 'account-backup-center') row.append(button('Account backup & export', () => this.openBackups())); }
                rows.append(row);
            }
            const pager = node('div', 'storage-center-actions'), previous = button('Previous', () => { this.offset = Math.max(0, this.offset - 50); draw(); }), next = button('Next', () => { this.offset += 50; draw(); });
            previous.disabled = this.offset === 0; next.disabled = this.offset + 50 >= filtered.length; pager.append(previous, next); rows.append(pager);
            const review = button(this.scope === 'server' ? 'Preview recycle bin move' : 'Preview permanent deletion', () => this.preview(this.scope === 'server' ? 'trash' : 'purge', [...this.selection.values()]), 'primary'); review.disabled = !this.selection.size; rows.append(review);
        };
        search.addEventListener('input', () => { this.query = search.value; this.offset = 0; draw(); }); sort.addEventListener('change', () => { this.sort = sort.value; this.offset = 0; draw(); }); toolbar.append(search, sort); this.content.append(toolbar, rows); draw();
    }
    async detail(item) {
        try {
            const checked = this.scope === 'server' ? await this.api('detail', { target: item.target }) : { ...item, allowed: true };
            this.content.replaceChildren(); this.heading(item.name); this.note(ft('Own data: ${0}', [size(checked.bytes)]));
            if (checked.recordCount != null) this.note(ft('${0} records and ${1} files are handled as one complete object.', [checked.recordCount, checked.fileCount]));
            if (checked.dependencyCount) this.note(ft('${0} shared or exact dependencies remain protected.', [checked.dependencyCount]));
            for (const item of [...(checked.references || []), ...(checked.dependencies || [])]) this.note(`${item.name} · ${item.kind}`);
            if (checked.relatedMediaBytes != null) this.note(ft('Referenced media: ${0}. Shared data is counted once in its own category.', [size(checked.relatedMediaBytes)]));
            if (checked.reason) this.note(explain(checked.reason));
            if (checked.allowed) this.content.append(button(this.scope === 'server' ? actions.trash : actions.purge, () => this.preview(this.scope === 'server' ? 'trash' : 'purge', [item.target]), 'destructive'));
            if (this.scope === 'server') { this.content.append(button('Open business workspace', () => this.openBusiness(item, checked))); this.content.append(button('Account backup & export', () => this.openBackups())); }
            this.content.append(button('Back', () => this.render()));
        } catch (error) { this.error(error); }
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
        this.heading(regions.cleanup); this.note('Only currently verified, rebuildable or quarantined garbage is selected by default. Business assets require your selection.');
        const suggestions = this.data.suggestions;
        if (!suggestions.length) this.note('There is no verified safe cleanup to perform.');
        else { for (const item of suggestions) this.note(`${item.name} · ${size(item.bytes)} · ${explain(item.reason)}`); this.content.append(button('Preview safe cleanup', () => this.preview('clean', suggestions.map(item => item.target)), 'primary')); }
        this.content.append(button('Review business resources', () => { this.region = 'overview'; this.category = this.scope === 'server' ? 'sessions' : 'preferences'; this.render(); }));
    }
    renderRecovery() {
        this.heading(regions.recovery);
        if (this.scope === 'browser') { this.note('Browser actions do not promise persistent recovery. Use a new preview for any permanent deletion.'); return; }
        this.note('Retained for 30 days. Restored objects keep their original identities and do not restart background work.');
        this.content.append(button('Account backup & export', () => this.openBackups()));
        for (const item of this.data.historyReviews || []) this.content.append(button(ft('Review local Git publication: ${0}', [item.name]), () => this.preview('history', [item.target])));
        for (const item of this.data.recovery) {
            const row = node('article', 'storage-center-recovery'); row.append(node('h3', '', item.name));
            this.note(ft('Deleted: ${0} · Expires: ${1}', [formatAtriaDate(item.createdAt), formatAtriaDate(item.expiresAt)]), row); this.note(`${size(item.bytes)} · ${item.state}`, row);
            const controls = node('div', 'storage-center-actions');
            for (const action of ['restore', 'purge']) { const control = button(actions[action], () => this.preview(action, [{ type: 'recovery', id: item.id }]), action === 'purge' ? 'destructive' : 'secondary'); control.disabled = item.state !== 'retained'; controls.append(control); }
            if (item.state === 'paused-review') controls.append(button('Review interrupted recovery', () => this.preview('repair', [{ type: 'recovery', id: item.id }])));
            row.append(controls); this.content.append(row);
        }
        if (this.data.recoveryUnavailable) this.note('Recovery records could not be read. Refresh after storage becomes available.');
        else if (!this.data.recovery.length) this.note('The recycle bin is empty.');
        this.content.append(button('Inspect saved backups', () => { this.region = 'overview'; this.category = 'recovery'; this.render(); }));
    }
    async preview(action, targets) {
        if (!targets.length) return;
        this.status.textContent = tl('Checking the fixed selection…');
        try { const task = this.scope === 'server' ? await this.api('preview', { action, targets }) : await this.browser.preview(action, targets); this.activeTask = task; this.renderTask(task, true); } catch (error) { this.error(error); }
    }
    renderTask(task, confirm = false) {
        if (this.closed || this.scope !== task.scope) return;
        this.taskView = true;
        this.content.replaceChildren(); this.heading(confirm ? 'Review fixed operation' : 'Operation result'); this.note(task.scope === 'server' ? 'Current account · Server' : 'This device · Current site'); this.note(actions[task.action]);
        this.note(ft('Processed data: ${0}', [size(task.processedBytes)])); this.note('Physical space released cannot be inferred from the amount processed. Usage is measured again after completion.');
        if (task.action === 'trash') this.note('This keeps the complete recovery closure for 30 days and does not immediately release its data.');
        if (['purge', 'clean'].includes(task.action)) this.note('This action cannot be undone.');
        if (task.scope === 'browser') this.note('Keep this page open. Interrupted browser work requires a fresh review; completed changes remain effective.');
        if (task.action === 'history') this.note('This reconciles verified local Git files only. It does not run a model or contact a remote.');
        if (task.deduplicatedCount) this.note(ft('${0} duplicate or owned child selections are handled with their parent.', [task.deduplicatedCount]));
        for (const item of task.items) { const row = node('div', 'storage-center-result'); row.append(node('strong', '', item.name), node('span', '', tl(states[item.status] || item.status))); if (item.reason) this.note(explain(item.reason), row); if (item.consequences?.includes('ironman-remains-terminal')) this.note('Ironman termination is permanent. Recovery does not revive the run.', row); if (item.resumePhase) this.note(ft('Reviewed recovery phase: ${0}', [item.resumePhase]), row); if (item.consequences?.includes('permanent-deletion')) this.note('This action cannot be undone.', row); this.content.append(row); }
        const controls = node('div', 'storage-center-actions');
        if (confirm) {
            const execute = button(actions[task.action], async () => {
                execute.disabled = true;
                try {
                    if (task.scope === 'browser') {
                        const update = progress => { if (this.activeTask?.id === task.id) { this.activeTask = progress; if (this.taskView) this.renderTask(progress); } };
                        const result = await this.browser.execute(task.id, update); update(result); await this.remeasureAfterTask();
                    } else { await this.api('execute', { id: task.id }); this.watchTask(task.id); }
                } catch (error) { this.error(error); execute.disabled = false; }
            }, ['purge', 'clean'].includes(task.action) ? 'destructive' : 'primary'); execute.disabled = !task.items.some(item => item.status === 'pending'); controls.append(execute, button('Cancel', async () => { try { if (task.scope === 'server') await this.api('stop', { id: task.id }); else this.browser.save({ ...task, status: 'stopped' }); this.render(); } catch (error) { this.error(error); } }));
        } else if (['queued', 'running'].includes(task.status)) controls.append(button('Stop after current object', async () => {
            if (task.scope === 'server') await this.api('stop', { id: task.id }); else this.browser.stop(task.id); this.status.textContent = tl('Stopping after the current object. Completed changes remain effective.');
        }));
        else {
            const remaining = task.items.filter(item => item.status !== 'succeeded').map(item => item.target); if (remaining.length) controls.append(button('Review remaining items again', () => this.preview(task.action, remaining)));
            controls.append(button('Refresh resources', () => { this.region = 'overview'; this.category = null; this.selection.clear(); this.refresh(); }));
        }
        this.content.append(controls); this.status.textContent = ft('Operation ${0}: ${1}', [task.id, tl(states[task.status] || task.status)]);
    }
    async remeasureAfterTask() {
        this.selection.clear(); try { this.data = this.scope === 'server' ? await this.api('snapshot') : await this.browser.snapshot(); } catch (error) { this.error(error); }
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
        } catch (error) { this.error(error); }
    }
    async renderTasks() {
        const scope = this.scope, generation = this.renderGeneration;
        this.heading(regions.tasks);
        try {
            const tasks = scope === 'server' ? await this.api('tasks') : this.browser.tasks();
            if (this.closed || generation !== this.renderGeneration || scope !== this.scope) return;
            if (!tasks.length) this.note('There are no recorded operations.');
            for (const task of tasks) this.content.append(button(`${formatAtriaDate(task.createdAt)} · ${tl(actions[task.action])} · ${tl(states[task.status] || task.status)}`, () => { this.activeTask = task; if (['queued', 'running'].includes(task.status) && task.scope === 'server') this.watchTask(task.id); else this.renderTask(task, task.status === 'preview'); }, 'plain'));
        } catch (error) { this.error(error); }
    }
    async renderAdvanced() {
        this.heading(regions.advanced); this.note('Legacy and unidentified data still count toward usage. Raw inspection does not grant broader business deletion rights.'); if (this.scope === 'browser') this.note('This device · Current site');
        const mount = node('div', 'storage-center-inspector'); this.content.append(mount);
        const inspector = createStorageInspector({ provider: this.scope === 'server' ? new RestProvider({ kind: 'self' }) : new BrowserProvider(), mutator: this.scope === 'server' ? new RestMutator() : new BrowserMutator(), container: mount,
            onDeletePreview: this.scope === 'browser' ? path => this.preview('purge', [{ path }]) : null });
        await inspector.init();
    }
}
export function openStorageManagement(options = {}) { return new StorageCenterPanel(options).open(); }
