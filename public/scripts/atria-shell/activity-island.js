import { nativeProductClient } from '../native/product-client.js';
import { nativeStudioClient } from '../native/studio-client.js';
import { createOrchestrationClient } from '../native/orchestration/client.js';
import { describeState } from '../native/orchestration/ledger.js';
import { createAtriaIcon } from './icons.js';
import { translateShellText as tl, formatShellText as fmt } from './localization.js';

const visibleRun = new Set(['admitted', 'running', 'waiting_approval', 'reconciling', 'blocked', 'failed']);
const visibleTask = new Set(['planning', 'planned', 'working', 'evaluating', 'repair', 'conflict', 'committing', 'review', 'failed', 'blocked', 'interrupted']);
const priority = status => ['waiting_approval', 'review'].includes(status) ? 0 : ['blocked', 'failed', 'interrupted', 'conflict', 'repair'].includes(status) ? 1 : 2;
const rows = result => Array.isArray(result) ? result : result?.items ?? result?.projects ?? result?.tasks ?? [];

/** Reads original task/Run projections. No dispatch, recovery or approval here. */
export function mountActivityIsland({ document: doc, window: win, shell, host, client = createOrchestrationClient(), product = nativeProductClient, studio = nativeStudioClient }) {
    const controller = new win.AbortController();
    const listen = (node, type, callback, options = {}) => node.addEventListener(type, callback, { ...options, signal: controller.signal });
    const el = (tag, className, text, parent) => { const node = doc.createElement(tag); node.className = className; if (text) node.textContent = text; parent?.append(node); return node; };
    const root = el('section', 'atria-activity-island'); root.hidden = true;
    root.setAttribute('aria-label', tl('Agent activity'));
    shell.root.append(root);
    const summary = el('button', 'atria-activity-island__summary', '', root); summary.type = 'button'; summary.setAttribute('aria-expanded', 'false');
    summary.append(createAtriaIcon(doc, 'agents', { size: 18 }));
    const label = el('span', '', '', summary), count = el('span', 'atria-activity-island__count', '', summary);
    const panel = el('section', 'atria-activity-island__panel', '', root); panel.id = 'atria-agent-activity'; panel.hidden = true;
    panel.setAttribute('aria-label', tl('Agent activity')); summary.setAttribute('aria-controls', panel.id);
    const heading = el('header', 'atria-activity-island__header', '', panel); el('strong', '', tl('Agent activity'), heading);
    const close = el('button', 'atria-icon-button', '', heading); close.type = 'button'; close.setAttribute('aria-label', tl('Close activity')); close.append(createAtriaIcon(doc, 'close', { size: 18 }));
    const status = el('p', 'atria-activity-island__status', '', panel); status.setAttribute('role', 'status');
    const list = el('div', 'atria-activity-island__list', '', panel);
    const refresh = el('button', 'atria-activity-island__refresh', tl('Refresh activity'), panel); refresh.type = 'button';
    const live = el('span', 'atria-visually-hidden', '', root); live.setAttribute('role', 'status');
    let items = [], timer, loading = false, disposed = false, stale = false, open = false, lastSummary = '', rendered = '';
    const dismissed = new Set();
    function collapse(restore = true) { if (!open) return false; open = false; panel.hidden = true; summary.setAttribute('aria-expanded', 'false'); if (restore) summary.focus({ preventScroll: true }); position(); return true; }
    function position() {
        if (disposed || root.hidden) return;
        root.dataset.compact = String(shell.environment.get().mode === 'compact');
        const bar = shell.root.querySelector('.atria-toolbar'), area = bar?.getBoundingClientRect();
        const summaryBox = summary.getBoundingClientRect();
        const obstacles = [...(bar?.querySelectorAll('.atria-toolbar__leading, .atria-toolbar__trailing') ?? []), ...shell.root.querySelectorAll('.atria-edge-dock[aria-hidden=false], .atria-play-history-preview, [data-atria-work-hud]')]
            .map(node => node.getBoundingClientRect()).filter(box => box.width > 0 && box.height > 0);
        let top = shell.environment.get().mode === 'compact' ? (area?.bottom ?? 56) + 8 : 8;
        const left = (shell.environment.get().width - summaryBox.width) / 2, right = left + summaryBox.width;
        for (const box of obstacles.sort((a, b) => a.top - b.top)) {
            if (box.left < right + 12 && box.right > left - 12 && box.top < top + summaryBox.height + 8 && box.bottom > top - 8) top = box.bottom + 8;
        }
        root.style.setProperty('--atri-island-top', top + 'px');
        shell.root.style.setProperty('--atri-activity-band', shell.environment.get().mode === 'compact' ? '48px' : '0px');
        if (shell.environment.get().keyboardOpen) collapse(false);
    }
    function render() {
        const visible = items.filter(item => !dismissed.has(item.id)).sort((a, b) => priority(a.status) - priority(b.status) || b.updatedAt - a.updatedAt);
        root.hidden = !visible.length && !stale;
        if (root.hidden) shell.root.style.setProperty('--atri-activity-band', '0px');
        label.textContent = stale ? tl('Activity could not refresh') : visible[0]?.title ?? tl('Agent activity');
        count.textContent = String(visible.length); root.dataset.state = stale ? 'unknown' : visible[0]?.status ?? 'idle';
        const announcement = stale ? tl('Activity could not refresh') : visible.length ? fmt('${0} Agent activities', [visible.length]) : '';
        if (announcement !== lastSummary) { live.textContent = announcement; lastSummary = announcement; }
        const identity = JSON.stringify([stale, visible.map(({ id, status, title, updatedAt }) => ({ id, status, title, updatedAt }))]);
        if (rendered === identity) { position(); return; }
        rendered = identity;
        const focusedId = doc.activeElement?.closest('[data-activity-id]')?.dataset.activityId;
        list.replaceChildren();
        for (const item of visible) {
            const row = el('article', 'atria-activity-island__row', '', list); row.dataset.activityId = item.id;
            const button = el('button', 'atria-activity-island__open', '', row); button.type = 'button';
            el('strong', '', item.title, button); el('span', '', item.kind === 'run' ? describeState('run', item.status).label : tl(item.status === 'review' ? 'Ready for review' : item.status === 'planned' ? 'Plan ready' : item.status === 'repair' ? 'Needs correction' : item.status === 'conflict' ? 'Version conflict' : item.status === 'committing' ? 'Saving changes…' : item.status === 'working' ? 'In progress' : item.status === 'planning' ? 'Plan needed' : item.status === 'evaluating' ? 'Proposal check pending' : item.status === 'failed' ? 'Failed' : item.status === 'blocked' ? 'Blocked' : 'Interrupted'), button);
            button.onclick = () => { collapse(false); item.open(); };
            if (item.status === 'failed') {
                const dismiss = el('button', 'atria-icon-button', '', row); dismiss.type = 'button'; dismiss.setAttribute('aria-label', tl('Dismiss activity notice')); dismiss.append(createAtriaIcon(doc, 'close', { size: 16 }));
                dismiss.onclick = () => { dismissed.add(item.id); render(); summary.focus(); };
            }
            if (focusedId === item.id) button.focus({ preventScroll: true });
        }
        position();
    }
    async function collect(source, title, output) {
        let cursor = null;
        do {
            const page = await client.listRuns(source, cursor, 100, controller.signal); if (disposed) return;
            for (const run of page.items) if (visibleRun.has(run.status)) output.push({ id: run.runId, kind: 'run', status: run.status, title, updatedAt: run.updatedAt, open: () => host.openRun(run.runId) });
            cursor = page.cursor;
        } while (cursor);
    }
    async function refreshActivity() {
        if (loading || disposed || doc.hidden) return;
        loading = true; refresh.disabled = true; clearTimeout(timer);
        const next = [], errors = [];
        try {
            const [sessions, projects] = await Promise.allSettled([product.listSessions(), studio.listProjects({ summary: true })]);
            const jobs = [];
            if (sessions.status === 'fulfilled') for (const session of rows(sessions.value)) jobs.push(() => collect({ domain: 'native_session', sessionId: session.sessionId, entryPointId: null }, session.displayTitle || session.title || tl('Session'), next));
            else errors.push(sessions.reason);
            if (projects.status === 'fulfilled') for (const record of rows(projects.value)) {
                const project = record.project ?? record;
                jobs.push(async () => {
                    const tasks = rows(await studio.observeAgentTasks(project.projectId));
                    for (const task of tasks) if (visibleTask.has(task.status)) next.push({ id: task.taskId, kind: 'task', status: task.status, title: task.intent || project.displayName || tl('Project task'), updatedAt: task.updatedAt,
                        open: () => host.openProjectTask(project.projectId, task.taskId, task.intent) });
                    await collect({ domain: 'project', projectId: project.projectId, taskId: null }, project.displayName || tl('Project'), next);
                });
            } else errors.push(projects.reason);
            // Only an already-resolved chat selector; never resolve or bind a chat in an activity read.
            try { const remembered = JSON.parse(win.sessionStorage.getItem('atria.orchestration.runs.source') || 'null'); if (remembered?.domain === 'rp_chat') jobs.push(() => collect(remembered, tl('Chat'), next)); } catch { /* No remembered viewer source. */ }
            for (let index = 0; index < jobs.length; index += 4) {
                const batch = await Promise.allSettled(jobs.slice(index, index + 4).map(job => job()));
                for (const result of batch) if (result.status === 'rejected') errors.push(result.reason);
                if (disposed) return;
            }
            stale = errors.length > 0;
            items = stale ? [...new Map([...items, ...next].map(item => [item.id, item])).values()] : next;
            status.textContent = stale ? tl('Activity could not refresh. The previous results are retained; retry to read current tasks.') : '';
            render();
        } finally {
            loading = false; if (!disposed) { refresh.disabled = false; timer = setTimeout(refreshActivity, 15000); }
        }
    }
    listen(summary, 'click', () => { if (open) collapse(); else { open = true; panel.hidden = false; summary.setAttribute('aria-expanded', 'true'); position(); } });
    listen(close, 'click', () => collapse()); listen(refresh, 'click', refreshActivity);
    listen(doc, 'pointerdown', event => { if (open && !root.contains(event.target)) collapse(false); });
    listen(doc, 'atria-activity-back', event => { if (collapse()) event.preventDefault(); });
    const observer = new win.MutationObserver(position);
    observer.observe(shell.root, { attributes: true, subtree: true, attributeFilter: ['data-edge', 'aria-hidden'] });
    listen(doc, 'atria-agent-activity-changed', refreshActivity);
    listen(doc, 'visibilitychange', () => { if (!doc.hidden) void refreshActivity(); });
    const release = shell.environment.subscribe(position);
    void refreshActivity();
    return { refresh: refreshActivity, dispose() { disposed = true; clearTimeout(timer); controller.abort(); observer.disconnect(); release(); shell.root.style.removeProperty('--atri-activity-band'); root.remove(); } };
}
