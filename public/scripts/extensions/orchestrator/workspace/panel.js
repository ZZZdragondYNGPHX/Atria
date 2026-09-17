import { subscribe, getCurrentRun, requestRunStop, inspectEngineNode } from '../run-state/store.js';
import { workspaceRunView } from '../../../lib/agent-workspace/projection.js';
import { CAPABILITIES } from '../../../lib/orchestration-engine/capabilities.js';
import { downloadRunTraceAsJsonl } from '../runtime-trace-export.js';
import { RUN_STARTED } from '../run-state/events.js';
import { renderGraph } from '../../../lib/agent-workspace/graph-view.js';
import { replayRuntimeEvents } from '../../../lib/agent-runtime/projection.js';
import { i18n, i18nFormat } from '../i18n.js';

const tabs = ['Presets', 'Live Run', 'Graph', 'Agents', 'Memory', 'Diagnostics'];
let root, body, nav, title, stop, pill, unsubscribe, frame, previousFocus;
let tab = 'Live Run', selection = {}, ports = {}, open = false;
let disposeTab;
let timer;
let replay = null, updateMemory;
let renderIdentity = '', pageSequence = 0;
const pageOffsets = new Map();
const el = (tag, text, parent) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = typeof text === 'string' ? i18n(text) : text; parent?.append(node); return node; };
const button = (parent, text, action) => { const node = el('button', text, parent); node.type = 'button'; node.addEventListener('click', action); return node; };
const json = (parent, value) => el('pre', JSON.stringify(value, null, 2), parent);
const detail = (parent, label, value) => { const node = el('details', undefined, parent); el('summary', label, node); node.addEventListener('toggle', () => { if (node.open && !node.querySelector('pre')) json(node, value); }); return node; };
function paged(parent, items, draw, size = 50) {
    const host = el('section', undefined, parent);
    const key = pageSequence++;
    let page = Math.min(pageOffsets.get(key) || 0, Math.max(0, Math.ceil(items.length / size) - 1));
    const paint = () => {
        pageOffsets.set(key, page);
        host.replaceChildren();
        const start = page * size;
        if (items.length > size) {
            el('p', i18nFormat('${0}–${1} of ${2}', start + 1, Math.min(start + size, items.length), items.length), host);
            button(host, 'Previous page', () => { page--; paint(); }).disabled = page === 0;
            button(host, 'Next page', () => { page++; paint(); }).disabled = start + size >= items.length;
        }
        items.slice(start, start + size).forEach(item => draw(host, item));
    };
    paint();
}
const selectedRun = () => replay || getCurrentRun();

export function configureWorkspace(next) { ports = next; }

function chooseNode(nodeId, nextTab = 'Agents') {
    selection = { runId: selectedRun()?.runId, nodeId }; tab = nextTab; render();
}

function render() {
    if (!root || !open) return;
    const identity = JSON.stringify([tab, selectedRun()?.runId, selection]);
    const sameView = identity === renderIdentity;
    const expanded = new Set(sameView ? [...body.querySelectorAll('details[open] > summary')].map(node => node.textContent) : []);
    const scroll = sameView ? body.scrollTop : 0;
    const focus = sameView && body.contains(document.activeElement) ? document.activeElement.textContent : null;
    if (!sameView) pageOffsets.clear();
    renderIdentity = identity; pageSequence = 0;
    renderContent();
    for (const summary of body.querySelectorAll('details > summary')) if (expanded.has(summary.textContent)) summary.parentElement.open = true;
    body.scrollTop = scroll;
    if (focus) [...body.querySelectorAll('button, summary')].find(node => node.textContent === focus)?.focus({ preventScroll: true });
}

function renderContent() {
    if (!root || !open) return;
    const run = selectedRun(), view = workspaceRunView(run, selection);
    if (selection.runId !== run?.runId) selection = {};
    title.textContent = `${i18n('Agent & Memory')} · ${run ? `${run.mode} · ${run.status}` : i18n('Workspace')}`;
    stop.hidden = !!replay || run?.status !== 'running'; stop.disabled = !!run?.stopRequested;
    stop.textContent = run?.stopRequested ? i18n('Stopping…') : i18n('Stop Run');
    for (const item of nav.children) { item.setAttribute('aria-selected', String(item.dataset.tab === tab)); item.tabIndex = item.dataset.tab === tab ? 0 : -1; }
    body.setAttribute('aria-labelledby', `workspace-tab-${tabs.indexOf(tab)}`);
    disposeTab?.(); disposeTab = null; updateMemory = null; body.replaceChildren();
    if (replay) button(body, 'Viewing imported trace · Return to live run', () => { replay = null; selection = {}; render(); });
    if (tab === 'Presets') { ports.renderPresets?.(body, { el, button, json, detail }); return; }
    if (view.nodeId) button(body, i18nFormat('Node: ${0} · Clear filter', view.nodeId), () => { selection = {}; render(); });
    if (view.stepId) button(body, i18nFormat('Step: ${0} · Clear step filter', view.stepId), () => { delete selection.stepId; render(); });
    if (tab === 'Live Run') {
        if (!run) { el('p', 'No active run. Start a conversation to see progress.', body); return; }
        el('p', `${run.runId} · ${view.recalls.length} recalls · ${run.runtime.events.filter(event => event.type === 'tool.execute.completed').length} tool calls`, body);
        if (run.tokensSpent) el('p', `Tokens: ${run.tokensSpent.total} · prompt ${run.tokensSpent.prompt} · completion ${run.tokensSpent.completion}`, body);
        if (view.engine) {
            el('p', i18nFormat('Preset: ${0}', view.engine.presetName || view.engine.presetId || i18n('unbound')), body);
            const output = view.engine.output;
            el('p', `Output: ${output.kind} · Owner: ${output.ownerNodeId} · ${output.status || 'pending'}`, body);
            el('p', `Arbitration: ${view.engine.arbitration.kind} · Graph revision ${view.engine.graphRevision}`, body);
            paged(body, view.engine.nodes, (parent, node) => {
                const card = el('article', undefined, parent);
                button(card, `${node.nodeId} · ${node.kind} · ${node.status} · attempts ${node.attempts}`, () => chooseNode(node.nodeId));
                button(card, 'Memory', () => chooseNode(node.nodeId, 'Memory'));
            });
        }
        el('h3', 'Execution timeline', body);
        paged(body, [...view.timeline].reverse(), (parent, event) => {
            const label = event.type.startsWith('agent.handoff') ? 'Handoff — control transfer'
                : event.type.startsWith('parallel.fanout') ? 'Delegate / fan-out'
                    : event.type.startsWith('parallel.join') ? 'Join — return to parent' : event.type;
            const entry = detail(parent, `${label} · ${event.nodeId || event.agentId || event.runId}`, event);
            if (event.stepId) button(entry, 'Inspect this step', () => { selection = { ...selection, runId: run.runId, stepId: event.stepId }; tab = 'Diagnostics'; render(); });
        });
        if (run.finalText) detail(body, 'Final output', run.finalText);
        if (run.error) el('p', run.error, body);
    } else if (tab === 'Graph') {
        el('h3', 'Run Graph', body);
        if (!view.engine) { el('p', 'No Engine graph has been projected yet.', body); return; }
        el('p', i18nFormat('Revision ${0} · ${1} nodes', view.engine.graphRevision, view.engine.nodes.length), body);
        const visual = el('details', undefined, body); el('summary', 'Visual graph', visual);
        visual.open = matchMedia('(min-width: 701px)').matches;
        const draw = () => { if (visual.open && !visual.querySelector('svg')) renderGraph(visual, view.engine, chooseNode); };
        visual.addEventListener('toggle', draw); draw();
        paged(body, view.engine.nodes, (parent, node) => button(parent, `${node.nodeId} (${node.kind}) · ${node.status}`, () => chooseNode(node.nodeId)));
        paged(body, view.engine.edges, (parent, edge) => el('p', `${edge.from} → ${edge.to} · ${edge.condition || 'always'}${edge.maxVisits ? ` · ≤ ${edge.maxVisits}` : ''}`, parent));
        detail(body, 'Dynamic tasks', view.engine.tasks);
        if (view.engine.tasks.length) {
            const tasks = el('details', undefined, body); el('summary', 'Agenda task graph · this revision', tasks);
            tasks.addEventListener('toggle', () => {
                if (!tasks.open || tasks.querySelector('svg')) return;
                renderGraph(tasks, { nodes: view.engine.tasks.map(task => ({ nodeId: task.id, kind: 'task', status: task.status })),
                    edges: view.engine.tasks.flatMap(task => task.dependsOn.map(from => ({ from, to: task.id }))) }, taskId => {
                    const agentId = view.engine.tasks.find(task => task.id === taskId)?.agentId;
                    const nodeId = view.engine.nodes.find(node => node.agentId === agentId)?.nodeId;
                    if (nodeId) chooseNode(nodeId);
                });
            });
        }
        detail(body, 'Results and provenance', view.engine.results);
        detail(body, 'Arbitration', { policy: view.engine.arbitration, state: view.engine.arbitrationState });
    } else if (tab === 'Agents') {
        if (!view.engine?.nodes.length && !run?.runtime.runs.length) el('p', 'No agents to inspect. Start a run to see their state.', body);
        paged(body, (view.engine?.nodes || []).filter(node => !view.nodeId || node.nodeId === view.nodeId), (parent, node) => {
            const card = el('article', undefined, parent);
            el('h3', node.agentId, card);
            detail(card, 'Definition · admitted Plan', { modelProfile: node.modelProfile, tools: node.tools, kind: node.kind });
            detail(card, 'Live state', { nodeId: node.nodeId, status: node.status, attempts: node.attempts,
                executions: node.executions, results: view.engine.results.filter(result => result.nodeId === node.nodeId) });
            const inspect = el('details', undefined, card); el('summary', 'Inspect instructions / task / ResultEnvelope', inspect);
            inspect.addEventListener('toggle', () => {
                if (!inspect.open) return;
                inspect.querySelector('pre')?.remove();
                try { json(inspect, replay ? { note: 'Private bodies are not included in metadata exports.' } : inspectEngineNode(run.runId, node.nodeId)); } catch (error) { el('p', error.message, inspect); }
            });
            const matrix = el('dl', undefined, card);
            for (const capability of CAPABILITIES) { el('dt', capability, matrix); el('dd', node.capabilities[capability] ? 'Allowed' : 'Denied', matrix); }
            button(card, 'This node’s Memory', () => chooseNode(node.nodeId, 'Memory'));
            button(card, 'Diagnostics', () => chooseNode(node.nodeId, 'Diagnostics'));
        }, 10);
        const admitted = new Set(view.engine?.nodes.map(node => node.agentId));
        const dynamic = run?.runtime.runs.filter(item => item.agentId && !item.engine && !admitted.has(item.agentId)) || [];
        if (dynamic.length && !view.nodeId) {
            el('h3', 'Dynamic / delegated Runtime agents', body);
            paged(body, dynamic, (parent, execution) => detail(parent, `${execution.agentId} · ${execution.status}`, execution));
        }
    } else if (tab === 'Memory') {
        const recallSection = el('details', undefined, body); el('summary', 'This Run', recallSection); recallSection.open = !!view.recalls.length;
        const recalls = el('section', undefined, recallSection);
        const getView = () => workspaceRunView(selectedRun(), selection);
        const memoryPageIndex = pageSequence;
        updateMemory = () => {
            pageSequence = memoryPageIndex;
            recalls.replaceChildren(); const current = getView();
            paged(recalls, [...current.recalls].reverse(), (parent, recall) => detail(parent, `${recall.agentId || recall.runId} · ${recall.references?.length || 0} refs · ${recall.stepId || ''}`, recall));
            if (!current.recalls.length) el('p', 'No matching recall evidence. Unobserved memory use is not inferred.', recalls);
        };
        updateMemory();
        if (!replay) disposeTab = ports.renderMemory?.(body, { el, button, json, detail, view, getView });
    } else {
        detail(body, 'Checkpoint / recovery', run?.runtime.runs.map(({ runId, version, generation, status, staleEffects }) => ({ runId, version, generation, status, staleEffects })) || []);
        detail(body, 'Context sources / token budgets', view.contexts);
        const upload = el('input', undefined, body); upload.type = 'file'; upload.accept = '.jsonl,.ndjson'; upload.setAttribute('aria-label', i18n('Replay metadata trace'));
        upload.addEventListener('change', async () => {
            try {
                const file = upload.files[0]; if (!file) return;
                if (file.size > 20 * 1024 * 1024) throw new Error(i18n('Trace import is limited to 20 MiB.'));
                const runtime = replayRuntimeEvents((await file.text()).split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line)));
                if (!upload.isConnected) return;
                if (!runtime.runs.length) throw new Error(i18n('No valid Runtime events in this trace.'));
                replay = { runId: `replay:${runtime.runs[0].runId}`, mode: 'trace', status: 'replay', runtime };
                selection = {}; render();
            } catch (error) { if (upload.isConnected) el('p', error.message, body); }
        });
        el('p', i18nFormat('${0} events. Export contains the metadata journal.', view.diagnostics.length), body);
        paged(body, [...view.diagnostics].reverse(), (parent, event) => detail(parent, `${event.type} · ${event.stepId || event.runId}`, event));
    }
}

function mount() {
    if (root) return;
    if (!document.getElementById('agent-memory-workspace-css')) {
        const css = el('link', undefined, document.head); css.id = 'agent-memory-workspace-css'; css.rel = 'stylesheet'; css.href = new URL('./panel.css', import.meta.url).href;
    }
    root = el('aside', undefined, document.body); root.id = 'agent-memory-workspace'; root.hidden = true;
    root.setAttribute('aria-label', i18n('Agent & Memory Workspace'));
    const header = el('header', undefined, root); title = el('h2', 'Agent & Memory', header);
    stop = button(header, 'Stop Run', () => requestRunStop(getCurrentRun()?.runId));
    button(header, 'Export Trace', () => downloadRunTraceAsJsonl(selectedRun()?.runtime.events));
    button(header, 'Close', closeWorkspace).className = 'workspace-close';
    nav = el('nav', undefined, root); nav.setAttribute('role', 'tablist'); nav.setAttribute('aria-label', i18n('Workspace views'));
    for (const name of tabs) {
        const item = button(nav, name, () => { tab = name; render(); }); item.dataset.tab = name; item.setAttribute('role', 'tab');
        item.id = `workspace-tab-${tabs.indexOf(name)}`; item.setAttribute('aria-controls', 'workspace-content');
        item.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault(); const index = tabs.indexOf(tab);
            tab = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
            render(); nav.children[tabs.indexOf(tab)].focus();
        });
    }
    body = el('main', undefined, root); body.id = 'workspace-content'; body.setAttribute('role', 'tabpanel');
    root.addEventListener('keydown', event => { if (event.key === 'Escape') closeWorkspace(); });
    pill = button(document.body, `● ${i18n('Running')} · ${i18n('Open Workspace')}`, () => openWorkspace()); pill.id = 'agent-memory-pill'; pill.hidden = true;
    timer = setInterval(() => {
        const run = selectedRun(); if (!run || run.status !== 'running') return;
        const seconds = Math.max(0, (performance.now() - run.startedAt) / 1000).toFixed(1);
        if (open) title.textContent = `${i18n('Agent & Memory')} · ${run.mode} · ${run.status} · ${seconds}s`;
        else pill.textContent = `● ${i18n('Running')} · ${seconds}s · ${i18n('Open Workspace')}`;
    }, 1000);
}

export function openWorkspace(initialTab) {
    initWorkspace(); mount(); if (!open) previousFocus = document.activeElement;
    if (tabs.includes(initialTab)) tab = initialTab;
    open = true; root.hidden = false; pill.hidden = true; render(); nav.children[tabs.indexOf(tab)].focus();
}

export function closeWorkspace() {
    if (!root) return;
    disposeTab?.(); disposeTab = null;
    open = false; root.hidden = true; pill.hidden = getCurrentRun()?.status !== 'running'; previousFocus?.focus?.();
}

export function initWorkspace() {
    if (unsubscribe) return;
    unsubscribe = subscribe(event => {
        if (event.type === RUN_STARTED) { replay = null; selection = {}; if (!event.quiet) openWorkspace('Live Run'); }
        if (pill) pill.hidden = open || getCurrentRun()?.status !== 'running';
        if (!open || frame || tab === 'Presets' && event.type !== 'run_cleared' || replay) return;
        frame = requestAnimationFrame(() => { frame = null; if (tab === 'Memory' && event.type !== 'run_cleared') updateMemory?.(); else render(); });
    });
}

export function destroyWorkspace() {
    disposeTab?.(); disposeTab = null;
    unsubscribe?.(); unsubscribe = null; if (frame) cancelAnimationFrame(frame); frame = null;
    clearInterval(timer); timer = null;
    root?.remove(); pill?.remove(); root = body = nav = title = stop = pill = null; open = false; selection = {}; replay = null; updateMemory = null;
    renderIdentity = ''; pageOffsets.clear();
}
