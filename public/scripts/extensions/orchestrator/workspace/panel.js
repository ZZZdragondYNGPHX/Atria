import { subscribe, getCurrentRun, requestRunStop, inspectEngineNode } from '../run-state/store.js';
import { workspaceRunView } from '../../../lib/agent-workspace/projection.js';
import { CAPABILITIES } from '../../../lib/orchestration-engine/capabilities.js';
import { RUN_STARTED } from '../run-state/events.js';
import { renderGraph } from '../../../lib/agent-workspace/graph-view.js';
import { i18n, i18nFormat } from '../i18n.js';
import { createWorkspaceShell, syncWorkspaceNavigation, focusWorkspaceSection } from './shell.js';
import { renderDiagnosticsPage } from './diagnostics/page.js';

let shell, unsubscribe, frame, previousFocus, timer;
let ports = {}, open = false, disposePage;
let section = 'run', runView = 'graph', selection = {}, replay = null, updateMemory;
let renderIdentity = '', pageSequence = 0;
const pageOffsets = new Map();

const el = (tag, text, parent, className = '') => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = typeof text === 'string' ? i18n(text) : text;
    parent?.append(node);
    return node;
};
const button = (parent, text, action, className = '') => {
    const node = el('button', text, parent, className);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
};
const json = (parent, value) => el('pre', JSON.stringify(value, null, 2), parent);
const detail = (parent, label, value) => {
    const node = el('details', undefined, parent);
    el('summary', label, node);
    node.addEventListener('toggle', () => {
        if (node.open && !node.querySelector('pre')) json(node, value);
    });
    return node;
};

function paged(parent, items, draw, size = 50) {
    const host = el('section', undefined, parent, 'workspace-paged');
    const key = pageSequence++;
    let page = Math.min(pageOffsets.get(key) || 0, Math.max(0, Math.ceil(items.length / size) - 1));
    const paint = () => {
        pageOffsets.set(key, page);
        host.replaceChildren();
        const start = page * size;
        if (items.length > size) {
            const controls = el('div', undefined, host, 'workspace-pagination');
            el('span', i18nFormat('${0}–${1} of ${2}', start + 1, Math.min(start + size, items.length), items.length), controls);
            button(controls, 'Previous page', () => { page--; paint(); }).disabled = page === 0;
            button(controls, 'Next page', () => { page++; paint(); }).disabled = start + size >= items.length;
        }
        items.slice(start, start + size).forEach(item => draw(host, item));
    };
    paint();
}

const selectedRun = () => replay || getCurrentRun();

function normalizeSection(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return {
        orchestration: 'orchestration',
        run: 'run',
        memory: 'memory',
        diagnostics: 'diagnostics',
    }[normalized] || normalized;
}

export function configureWorkspace(next) {
    ports = next;
}

function setSection(next, { focus = true } = {}) {
    const normalized = normalizeSection(next);
    if (!['orchestration', 'run', 'memory', 'diagnostics'].includes(normalized)) return;
    section = normalized;
    selection = section === 'run' ? selection : {};
    render();
    if (focus) focusWorkspaceSection(shell, section);
}

function chooseNode(nodeId) {
    selection = { runId: selectedRun()?.runId, nodeId };
    section = 'run';
    render();
}

function metric(parent, label, value, hint = '') {
    const card = el('div', undefined, parent, 'workspace-metric');
    el('span', label, card, 'workspace-metric-label');
    el('strong', String(value ?? '—'), card, 'workspace-metric-value');
    if (hint) el('small', hint, card, 'workspace-metric-hint');
    return card;
}

function renderNodeInspector(run, view) {
    const inspector = shell.inspector;
    inspector.replaceChildren();
    const node = view.engine?.nodes.find(item => item.nodeId === view.nodeId);
    if (!node) {
        inspector.hidden = true;
        return;
    }
    inspector.hidden = false;
    const head = el('div', undefined, inspector, 'workspace-inspector-heading');
    el('span', 'Selected node', head, 'workspace-eyebrow');
    el('h3', node.agentId || node.nodeId, head);
    el('span', node.status || 'pending', head, `workspace-status-chip is-${node.status || 'pending'}`);

    const summary = el('section', undefined, inspector, 'workspace-inspector-section');
    el('h4', 'Run state', summary);
    const facts = el('dl', undefined, summary, 'workspace-kv');
    for (const [label, value] of [
        ['Node', node.nodeId],
        ['Kind', node.kind],
        ['Attempts', node.attempts],
        ['Executions', node.executions?.length || 0],
        ['Memory evidence', view.recalls.length],
    ]) {
        el('dt', label, facts); el('dd', String(value ?? '—'), facts);
    }

    const definition = el('section', undefined, inspector, 'workspace-inspector-section');
    el('h4', 'Definition', definition);
    if (node.modelProfile?.apiPresetName || node.modelProfile?.promptPresetName) {
        el('p', `${node.modelProfile?.apiPresetName || i18n('Inherited API')} · ${node.modelProfile?.promptPresetName || i18n('Inherited prompt')}`, definition);
    }
    if (node.tools?.length) el('p', i18nFormat('${0} tools available', node.tools.length), definition);

    const capability = el('details', undefined, inspector, 'workspace-inspector-section');
    el('summary', 'Capabilities', capability);
    const matrix = el('dl', undefined, capability, 'workspace-capability-list');
    for (const name of CAPABILITIES) {
        el('dt', name, matrix);
        const allowed = node.capabilities?.[name] === true;
        el('dd', allowed ? 'Allowed' : 'Denied', matrix, allowed ? 'is-allowed' : 'is-denied');
    }

    if (!replay) {
        const privateData = el('details', undefined, inspector, 'workspace-inspector-section');
        el('summary', 'Instructions, task and result', privateData);
        privateData.addEventListener('toggle', () => {
            if (!privateData.open || privateData.querySelector('pre')) return;
            try {
                json(privateData, inspectEngineNode(run.runId, node.nodeId));
            } catch (error) {
                el('p', error.message, privateData);
            }
        });
    }

    const actions = el('div', undefined, inspector, 'workspace-inspector-actions');
    button(actions, 'Open diagnostics', () => {
        section = 'diagnostics';
        render();
    });
    button(actions, 'Clear selection', () => {
        selection = {};
        render();
    });
}

function renderRun(run, view) {
    if (!run) {
        const empty = el('section', undefined, shell.main, 'workspace-empty-state');
        el('span', '●', empty, 'workspace-empty-icon');
        el('h3', 'No active run', empty);
        el('p', 'Start a conversation to see orchestration progress, agent activity and memory evidence here.', empty);
        shell.inspector.hidden = true;
        return;
    }

    const summary = el('section', undefined, shell.main, 'workspace-run-summary');
    const summaryHead = el('div', undefined, summary, 'workspace-section-heading');
    el('div', undefined, summaryHead, 'workspace-run-title').append(
        el('h3', view.engine?.presetName || view.engine?.presetId || run.mode),
    );
    el('span', run.status, summaryHead, `workspace-status-chip is-${run.status}`);

    const metrics = el('div', undefined, summary, 'workspace-metrics');
    metric(metrics, 'Agents', view.engine?.nodes.length || run.runtime?.runs?.filter(item => item.agentId).length || 0);
    metric(metrics, 'Internal calls', view.calls.internal);
    metric(metrics, 'Tool calls', view.calls.external);
    metric(metrics, 'Memory recalls', view.recalls.length);
    metric(metrics, 'Tokens', run.tokensSpent?.total || 0);
    metric(metrics, 'Concurrency', view.engine?.budgets?.maxConcurrency || '—');

    if (view.engine?.output) {
        const output = el('p', undefined, summary, 'workspace-run-output');
        output.textContent = `${i18n('Output owner')}: ${view.engine.output.ownerNodeId} · ${view.engine.output.status || 'pending'}`;
    }

    const switcher = el('div', undefined, shell.main, 'workspace-segmented');
    for (const [id, label] of [['graph', 'Graph'], ['timeline', 'Timeline']]) {
        const item = button(switcher, label, () => { runView = id; render(); });
        item.classList.toggle('is-active', runView === id);
        item.setAttribute('aria-pressed', String(runView === id));
    }

    if (view.nodeId) {
        const filter = el('div', undefined, shell.main, 'workspace-filter-chip');
        el('span', i18nFormat('Node: ${0}', view.nodeId), filter);
        button(filter, 'Clear', () => { selection = {}; render(); });
    }

    if (runView === 'graph') {
        if (!view.engine) {
            el('p', 'No Engine graph has been projected yet.', shell.main, 'workspace-empty-copy');
        } else {
            const graph = el('section', undefined, shell.main, 'workspace-run-graph');
            const graphHead = el('div', undefined, graph, 'workspace-section-heading');
            el('h3', 'Run Graph', graphHead);
            el('span', i18nFormat('Revision ${0} · ${1} nodes', view.engine.graphRevision, view.engine.nodes.length), graphHead, 'workspace-hint');
            const canvas = el('div', undefined, graph, 'workspace-graph-canvas');
            renderGraph(canvas, view.engine, chooseNode);

            const nodeList = el('div', undefined, graph, 'workspace-node-list');
            for (const node of view.engine.nodes) {
                const item = button(nodeList, node.agentId || node.nodeId, () => chooseNode(node.nodeId), 'workspace-node-chip');
                item.dataset.status = node.status || 'pending';
                if (node.nodeId === view.engine.output?.ownerNodeId) item.dataset.owner = 'true';
                el('small', `${node.kind} · ${node.status || 'pending'}`, item);
            }

            if (view.engine.tasks?.length) {
                const tasks = el('details', undefined, graph, 'workspace-secondary-details');
                el('summary', i18nFormat('Dynamic tasks · ${0}', view.engine.tasks.length), tasks);
                paged(tasks, view.engine.tasks, (parent, task) => {
                    const row = el('div', undefined, parent, 'workspace-task-row');
                    el('strong', task.id, row);
                    el('span', `${task.status} · ${task.agentId || ''}`, row);
                }, 20);
            }
        }
    } else {
        const timeline = el('section', undefined, shell.main, 'workspace-run-timeline');
        const head = el('div', undefined, timeline, 'workspace-section-heading');
        el('h3', 'Execution timeline', head);
        el('span', i18nFormat('${0} events', view.timeline.length), head, 'workspace-hint');
        paged(timeline, [...view.timeline].reverse(), (parent, event) => {
            const row = el('article', undefined, parent, 'workspace-timeline-event');
            const label = event.type.startsWith('agent.handoff') ? 'Handoff'
                : event.type.startsWith('parallel.fanout') ? 'Delegate'
                    : event.type.startsWith('parallel.join') ? 'Join'
                        : event.type.startsWith('model.request') ? 'Model call'
                            : event.type.startsWith('tool.execute') ? 'Tool call'
                                : event.type.startsWith('memory.recall') ? 'Memory recall'
                                    : event.type;
            el('strong', label, row);
            el('span', event.nodeId || event.agentId || event.runId || '', row);
            if (event.stepId) button(row, 'Inspect step', () => {
                selection = { ...selection, runId: run.runId, stepId: event.stepId };
                section = 'diagnostics';
                render();
            });
        });
        if (run.finalText) detail(timeline, 'Final output', run.finalText);
        if (run.error) el('p', run.error, timeline, 'workspace-error');
    }

    renderNodeInspector(run, view);
}

function renderMemoryPage(run, view) {
    shell.inspector.hidden = true;
    if (replay) {
        const empty = el('section', undefined, shell.main, 'workspace-empty-state');
        el('h3', 'Memory management is unavailable while viewing an imported trace.', empty);
        el('p', 'Return to the live run to browse and maintain the current conversation memory.', empty);
        return;
    }
    const lifecycle = ports.renderMemory?.(shell.main, {
        el,
        button,
        json,
        detail,
        inspector: shell.inspector,
        view,
        getView: () => workspaceRunView(selectedRun(), selection),
    });
    if (typeof lifecycle === 'function') {
        disposePage = lifecycle;
        updateMemory = null;
    } else {
        disposePage = lifecycle?.dispose || null;
        updateMemory = lifecycle?.updateRun || null;
    }
}

function renderDiagnostics(run, view) {
    shell.inspector.hidden = true;
    disposePage = renderDiagnosticsPage({
        parent: shell.main,
        el,
        button,
        detail,
        paged,
        run,
        view,
        replay,
        onReplay: runtime => {
            replay = { runId: `replay:${runtime.runs[0].runId}`, mode: 'trace', status: 'replay', runtime };
            selection = {};
            render();
        },
        onReturnLive: () => {
            replay = null;
            selection = {};
            render();
        },
    });
}

function renderContent() {
    if (!shell || !open) return;
    const run = selectedRun();
    const view = workspaceRunView(run, selection);
    if (selection.runId !== run?.runId) selection = {};

    syncWorkspaceNavigation(shell, section);
    shell.title.textContent = i18n('Atria Workspace');
    const workspaceContext = ports.getWorkspaceContext?.() || {};
    const scopeParts = [
        workspaceContext.character ? `${i18n('Character')}: ${workspaceContext.character}` : '',
        workspaceContext.conversation && workspaceContext.conversation !== 'invalid_target'
            ? `${i18n('Conversation')}: ${workspaceContext.conversation}`
            : '',
    ].filter(Boolean);
    shell.context.textContent = scopeParts.join(' · ') || i18n('Agent orchestration and long-term memory');
    shell.presetChip.textContent = workspaceContext.presetName
        ? `${workspaceContext.presetName} · ${i18n(workspaceContext.selectionSource || 'default')}`
        : i18n('No preset');
    shell.orchestrationToggle.checked = workspaceContext.enabled === true;
    shell.headerStatus.textContent = run ? `${run.mode} · ${i18n(run.status || 'idle')}` : '';
    shell.stop.hidden = !!replay || run?.status !== 'running';
    shell.stop.disabled = !!run?.stopRequested;
    shell.stopText.textContent = run?.stopRequested ? i18n('Stopping…') : i18n('Stop Run');

    disposePage?.();
    disposePage = null;
    updateMemory = null;
    shell.main.replaceChildren();
    shell.inspector.replaceChildren();
    shell.inspector.hidden = true;

    if (section === 'orchestration') {
        disposePage = ports.renderPresets?.(shell.main, { el, button, json, detail, inspector: shell.inspector }) || null;
        return;
    }
    if (section === 'run') {
        renderRun(run, view);
        return;
    }
    if (section === 'memory') {
        renderMemoryPage(run, view);
        return;
    }
    renderDiagnostics(run, view);
}

function render() {
    if (!shell || !open) return;
    const identity = JSON.stringify([section, runView, selectedRun()?.runId, selection]);
    const sameView = identity === renderIdentity;
    const scroll = sameView ? shell.main.scrollTop : 0;
    if (!sameView) pageOffsets.clear();
    renderIdentity = identity;
    pageSequence = 0;
    renderContent();
    shell.main.scrollTop = scroll;
}

function bindNavigationKeyboard(nav, vertical) {
    const keys = vertical ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
    for (const item of nav.children) item.addEventListener('keydown', event => {
        if (![...keys, 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const items = [...nav.children];
        const current = items.indexOf(event.currentTarget);
        const next = event.key === 'Home' ? 0
            : event.key === 'End' ? items.length - 1
                : (current + (event.key === keys[1] ? 1 : -1) + items.length) % items.length;
        const target = items[next];
        setSection(target.dataset.section, { focus: false });
        target.focus();
    });
}

function mount() {
    if (shell) return;
    if (!document.getElementById('agent-memory-workspace-css')) {
        const css = document.createElement('link');
        css.id = 'agent-memory-workspace-css';
        css.rel = 'stylesheet';
        css.href = new URL('./panel.css', import.meta.url).href;
        document.head.append(css);
    }
    shell = createWorkspaceShell({
        onNavigate: next => setSection(next, { focus: false }),
        onClose: closeWorkspace,
        onStop: () => requestRunStop(getCurrentRun()?.runId),
        onToggleOrchestration: enabled => {
            ports.setOrchestrationEnabled?.(enabled);
            render();
        },
    });
    bindNavigationKeyboard(shell.nav, true);
    bindNavigationKeyboard(shell.mobileNav, false);
    shell.root.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeWorkspace();
    });

    const pill = button(document.body, `● ${i18n('Running')} · ${i18n('Open Workspace')}`, () => openWorkspace('Run'));
    pill.id = 'agent-memory-pill';
    pill.hidden = true;
    shell.pill = pill;

    timer = setInterval(() => {
        const run = selectedRun();
        if (!run || run.status !== 'running') return;
        const seconds = Math.max(0, (performance.now() - run.startedAt) / 1000).toFixed(1);
        if (open) shell.headerStatus.textContent = `${run.mode} · ${i18n('Running')} · ${seconds}s`;
        else pill.textContent = `● ${i18n('Running')} · ${seconds}s · ${i18n('Open Workspace')}`;
    }, 1000);
}

export function openWorkspace(initialSection) {
    initWorkspace();
    mount();
    if (!open) previousFocus = document.activeElement;
    const normalized = normalizeSection(initialSection);
    if (['orchestration', 'run', 'memory', 'diagnostics'].includes(normalized)) section = normalized;
    open = true;
    shell.root.hidden = false;
    shell.pill.hidden = true;
    render();
    focusWorkspaceSection(shell, section);
}

export function closeWorkspace() {
    if (!shell) return;
    disposePage?.();
    disposePage = null;
    open = false;
    shell.root.hidden = true;
    shell.pill.hidden = getCurrentRun()?.status !== 'running';
    previousFocus?.focus?.();
}

export function initWorkspace() {
    if (unsubscribe) return;
    unsubscribe = subscribe(event => {
        if (event.type === RUN_STARTED) {
            replay = null;
            selection = {};
            if (!event.quiet) openWorkspace('Run');
        }
        if (shell?.pill) shell.pill.hidden = open || getCurrentRun()?.status !== 'running';
        if (!open || frame || section === 'orchestration' && event.type !== 'run_cleared' || replay) return;
        frame = requestAnimationFrame(() => {
            frame = null;
            if (section === 'memory' && event.type !== 'run_cleared') updateMemory?.();
            else render();
        });
    });
}

export function destroyWorkspace() {
    disposePage?.();
    disposePage = null;
    unsubscribe?.();
    unsubscribe = null;
    if (frame) cancelAnimationFrame(frame);
    frame = null;
    clearInterval(timer);
    timer = null;
    shell?.root.remove();
    shell?.pill?.remove();
    shell = null;
    open = false;
    section = 'run';
    runView = 'graph';
    selection = {};
    replay = null;
    updateMemory = null;
    renderIdentity = '';
    pageOffsets.clear();
}
