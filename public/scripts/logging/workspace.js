import { getRequestHeaders } from '../../script.js';
import { isFrontendConsoleDebugLoggingEnabled } from './console-adapter.js';
import { installFrontendLogging } from './bootstrap.js';
import { frontendLogStore } from './logger.js';
import { t } from '../i18n.js';
import { POPUP_TYPE, callGenericPopup } from '../popup.js';
import { recentUserActionStore } from './recent-actions.js';
import { createSafeConfigSnapshot } from './safe-config.js';
import {
    buildVirtualWindow,
    deriveModuleHealth,
    formatWorkspaceLogEntry,
    selectIncidentForModule,
} from './workspace-model.js';

const DEFAULT_LOG_LIMIT = 500;
const MAX_RENDERED_INCIDENTS = 200;
const EXPERT_REFRESH_MS = 1500;
const GUIDED_REFRESH_MS = 5000;

let startupAnalysisModulePromise;

function loadStartupAnalysisModule() {
    return startupAnalysisModulePromise ??= import('./startup-analysis.js');
}

async function api(path, { method = 'GET', body } = {}) {
    const response = await fetch('/api/diagnostics' + path, {
        method,
        headers: getRequestHeaders(body === undefined ? { omitContentType: true } : {}),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        const error = new Error(detail.error || `Diagnostics request failed: ${response.status}`);
        error.status = response.status;
        throw error;
    }
    if (response.status === 204) return null;
    return response.json();
}

async function getVersionSnapshot() {
    try {
        const response = await fetch('/version');
        if (!response.ok) return {};
        const version = await response.json();
        return {
            appVersion: version.pkgVersion,
            revision: version.gitRevision,
            branch: version.gitBranch,
        };
    } catch {
        return {};
    }
}

function htmlEscape(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll('\'', '&#039;');
}

function healthLabel(status) {
    if (status === 'error') return t`Error`;
    if (status === 'warning') return t`Warning`;
    if (status === 'healthy') return t`Healthy`;
    return t`No recent signal`;
}

function severityIcon(severity) {
    const value = String(severity || '').toLowerCase();
    if (value === 'critical' || value === 'error') return 'fa-circle-exclamation';
    if (value === 'warning') return 'fa-triangle-exclamation';
    return 'fa-circle-info';
}

function buildWorkspaceMarkup({ canViewServerLogs }) {
    const frontendCaptureNote = isFrontendConsoleDebugLoggingEnabled()
        ? t`Frontend debug capture is enabled.`
        : t`Frontend debug capture is limited; errors remain captured.`;
    return `
        <section class="atriaLogsWorkspace" data-mode="guided">
            <header class="atriaLogsHeader">
                <div>
                    <h3><i class="fa-solid fa-stethoscope"></i> ${t`Diagnostics Workspace`}</h3>
                    <div class="menu_button_note">${t`Start with incidents. Raw logs are available in Expert mode when you need them.`}</div>
                </div>
                <div class="atriaLogsHeaderActions">
                    <div class="atriaLogsModeSwitch" role="tablist">
                        <button type="button" class="menu_button atriaLogsModeButton is-active" data-mode="guided">${t`Guided`}</button>
                        <button type="button" class="menu_button atriaLogsModeButton" data-mode="startup">${t`Startup`}</button>
                        <button type="button" class="menu_button atriaLogsModeButton" data-mode="expert">${t`Expert`}</button>
                    </div>
                    <button type="button" class="menu_button menu_button_icon atriaLogsReportNow">
                        <i class="fa-solid fa-bolt"></i><span>${t`My problem just happened`}</span>
                    </button>
                    <button type="button" class="menu_button menu_button_icon atriaLogsRefresh">
                        <i class="fa-solid fa-rotate"></i><span>${t`Refresh`}</span>
                    </button>
                </div>
            </header>

            <div class="atriaLogsGuidedView">
                <div class="atriaLogsGrid">
                    <aside class="atriaLogsNavPane">
                        <div class="atriaLogsPaneTitle">${t`Module health`}</div>
                        <div class="atriaLogsHealthList"></div>
                    </aside>
                    <main class="atriaLogsListPane">
                        <div class="atriaLogsPaneTitle">
                            <span>${t`Recent incidents`}</span>
                            <span class="atriaLogsIncidentCount"></span>
                        </div>
                        <div class="atriaLogsIncidentList" role="list"></div>
                    </main>
                    <aside class="atriaLogsDetailPane">
                        <button type="button" class="menu_button atriaLogsMobileBack"><i class="fa-solid fa-arrow-left"></i> ${t`Back`}</button>
                        <div class="atriaLogsDetailContent">
                            <div class="atriaLogsEmptyDetail">
                                <i class="fa-regular fa-file-lines"></i>
                                <strong>${t`Select an incident`}</strong>
                                <span>${t`The diagnostic package keeps the failure stage, ownership evidence, correlation IDs and key logs together.`}</span>
                            </div>
                        </div>
                    </aside>
                </div>
            </div>

            <div class="atriaLogsStartupView">
                <div class="atriaStartupAnalysisMount"></div>
            </div>

            <div class="atriaLogsExpertView">
                <div class="atriaLogsExpertToolbar">
                    <label><span>${t`Source`}</span>
                        <select class="text_pole atriaLogsSource">
                            ${canViewServerLogs ? `<option value="backend">${t`Backend`}</option>` : ''}
                            <option value="frontend">${t`Frontend`}</option>
                        </select>
                    </label>
                    <label><span>${t`Module`}</span><select class="text_pole atriaLogsModule"><option value="">${t`All modules`}</option></select></label>
                    <label><span>${t`Level`}</span>
                        <select class="text_pole atriaLogsLevel">
                            <option value="">${t`All levels`}</option>
                            <option value="error">ERROR</option><option value="warn">WARN</option>
                            <option value="info">INFO</option><option value="log">LOG</option>
                            <option value="debug">DEBUG</option><option value="trace">TRACE</option>
                        </select>
                    </label>
                    <label class="atriaLogsSearchLabel"><span>${t`Search`}</span><input type="search" class="text_pole atriaLogsSearch"></label>
                    <label class="checkbox_label"><input type="checkbox" class="atriaLogsAutoRefresh" checked><span>${t`Auto refresh`}</span></label>
                    <button type="button" class="menu_button menu_button_icon atriaLogsClear"><i class="fa-solid fa-trash"></i><span>${t`Clear current source`}</span></button>
                </div>
                <div class="atriaLogsExpertGrid">
                    <div class="atriaLogsVirtualViewport" tabindex="0">
                        <div class="atriaLogsVirtualRows"></div>
                    </div>
                    <aside class="atriaLogsRawDetail">
                        <button type="button" class="menu_button atriaLogsMobileBack"><i class="fa-solid fa-arrow-left"></i> ${t`Back`}</button>
                        <pre class="atriaLogsRawDetailPre">${t`Select a log entry to inspect its structured fields.`}</pre>
                    </aside>
                </div>
                <div class="menu_button_note atriaLogsExpertNote">${frontendCaptureNote}</div>
            </div>
        </section>
    `;
}

function renderIncidentList(root, incidents, selectedId, onSelect) {
    const list = root.querySelector('.atriaLogsIncidentList');
    const count = root.querySelector('.atriaLogsIncidentCount');
    const bounded = incidents.slice(0, MAX_RENDERED_INCIDENTS);
    count.textContent = String(incidents.length);
    if (!bounded.length) {
        list.innerHTML = `<div class="atriaLogsEmptyList"><i class="fa-regular fa-circle-check"></i><span>${t`No diagnostic incidents yet.`}</span></div>`;
        return;
    }
    list.innerHTML = bounded.map(incident => `
        <button type="button" class="atriaLogsIncidentRow ${incident.incidentId === selectedId ? 'is-selected' : ''}" data-incident-id="${htmlEscape(incident.incidentId)}">
            <i class="fa-solid ${severityIcon(incident.severity)}"></i>
            <span class="atriaLogsIncidentMain">
                <strong>${htmlEscape(incident.summary || incident.type)}</strong>
                <span>${htmlEscape(incident.primaryModule)} · ${htmlEscape(incident.stage)} · ${new Date(incident.createdAt).toLocaleString()}</span>
            </span>
            <span class="atriaLogsOwnerBadge">${htmlEscape(incident.ownership?.probableOwner || 'unknown')}</span>
        </button>
    `).join('');
    list.querySelectorAll('.atriaLogsIncidentRow').forEach(button => {
        button.addEventListener('click', () => onSelect(button.dataset.incidentId));
    });
}

function renderHealth(root, health, incidents, onIncidentSelect) {
    const list = root.querySelector('.atriaLogsHealthList');
    list.innerHTML = health.map(item => `
        <button type="button" class="atriaLogsHealthRow is-${item.status}" data-health-id="${item.id}">
            <span class="atriaLogsHealthDot"></span>
            <span class="atriaLogsHealthMain"><strong>${htmlEscape(item.label)}</strong><span>${healthLabel(item.status)}</span></span>
            <span class="atriaLogsHealthCounts">${item.errorCount ? `${item.errorCount}E` : ''}${item.warningCount ? ` ${item.warningCount}W` : ''}</span>
        </button>
    `).join('');
    list.querySelectorAll('.atriaLogsHealthRow').forEach(button => {
        button.addEventListener('click', () => {
            const item = health.find(entry => entry.id === button.dataset.healthId);
            const incident = item ? selectIncidentForModule(incidents, item) : null;
            if (incident) onIncidentSelect(incident.incidentId);
        });
    });
}

function incidentDetailMarkup(incident) {
    const correlation = Object.entries(incident.correlation || {})
        .map(([key, value]) => `<code>${htmlEscape(key)}=${htmlEscape(value)}</code>`)
        .join('');
    const evidence = (incident.evidence || []).map(item => `<li>${htmlEscape(item)}</li>`).join('');
    const causes = (incident.causeChain || []).map(item => `<li>${htmlEscape(item?.message || JSON.stringify(item))}</li>`).join('');
    const actions = (incident.recentActions || []).slice(-12).map(item =>
        `<li><strong>${htmlEscape(item.action)}</strong> <span>${htmlEscape(item.label || item.module)}</span></li>`).join('');
    return `
        <div class="atriaLogsIncidentDetailCard">
            <div class="atriaLogsIncidentDetailHeader">
                <div><span class="atriaLogsKicker">${htmlEscape(incident.type)}</span><h4>${htmlEscape(incident.summary)}</h4></div>
                <span class="atriaLogsSeverity is-${htmlEscape(incident.severity)}">${htmlEscape(incident.severity)}</span>
            </div>
            <div class="atriaLogsDetailFacts">
                <div><span>${t`Module`}</span><strong>${htmlEscape(incident.primaryModule)}</strong></div>
                <div><span>${t`Stage`}</span><strong>${htmlEscape(incident.stage)}</strong></div>
                <div><span>${t`Probable owner`}</span><strong>${htmlEscape(incident.ownership?.probableOwner || 'unknown')}</strong></div>
                <div><span>${t`Confidence`}</span><strong>${Math.round(Number(incident.ownership?.confidence || 0) * 100)}%</strong></div>
            </div>
            <div class="atriaLogsCorrelation">${correlation || `<span>${t`No correlation IDs captured.`}</span>`}</div>
            ${evidence ? `<details open><summary>${t`Evidence`}</summary><ul>${evidence}</ul></details>` : ''}
            ${causes ? `<details><summary>${t`Cause chain`}</summary><ol>${causes}</ol></details>` : ''}
            ${actions ? `<details><summary>${t`Recent actions`}</summary><ul>${actions}</ul></details>` : ''}
            <div class="atriaLogsDetailActions">
                <button type="button" class="menu_button menu_button_icon atriaLogsCopySummary" data-incident-id="${htmlEscape(incident.incidentId)}"><i class="fa-solid fa-copy"></i><span>${t`Copy diagnostic summary`}</span></button>
                <button type="button" class="menu_button menu_button_icon atriaLogsCopyFull" data-incident-id="${htmlEscape(incident.incidentId)}"><i class="fa-solid fa-box-archive"></i><span>${t`Copy full context`}</span></button>
            </div>
        </div>
    `;
}

async function copyText(text, successTitle) {
    await navigator.clipboard.writeText(String(text || ''));
    toastr.success(t`Copied to clipboard.`, successTitle);
}

function exportAsClipboardText(payload, mode) {
    if (mode === 'summary') return payload.human || JSON.stringify(payload, null, 2);
    return [
        payload.human || '',
        '',
        '--- MACHINE READABLE CONTEXT ---',
        JSON.stringify(payload, null, 2),
    ].join('\n');
}

function renderVirtualLogs(root, entries, onSelect) {
    const viewport = root.querySelector('.atriaLogsVirtualViewport');
    const rows = root.querySelector('.atriaLogsVirtualRows');
    const render = () => {
        const windowState = buildVirtualWindow({
            total: entries.length,
            scrollTop: viewport.scrollTop,
            viewportHeight: viewport.clientHeight || 420,
        });
        const slice = entries.slice(windowState.start, windowState.end);
        rows.style.paddingTop = `${windowState.topSpacer}px`;
        rows.style.paddingBottom = `${windowState.bottomSpacer}px`;
        rows.innerHTML = slice.map((entry, index) => `
            <button type="button" class="atriaLogsLogRow is-${htmlEscape(entry.level)}" data-log-index="${windowState.start + index}">
                <span class="atriaLogsLogMeta"><strong>${htmlEscape(String(entry.level || 'log').toUpperCase())}</strong><span>${htmlEscape(entry.module)}</span><time>${new Date(entry.timestamp).toLocaleTimeString()}</time></span>
                <span class="atriaLogsLogMessage">${htmlEscape(entry.message || entry.event)}</span>
            </button>
        `).join('');
        rows.querySelectorAll('.atriaLogsLogRow').forEach(button => {
            button.addEventListener('click', () => onSelect(entries[Number(button.dataset.logIndex)]));
        });
    };
    viewport.onscroll = render;
    render();
}

async function getFrontendEvidence() {
    const now = Date.now();
    const logs = frontendLogStore.query({ limit: 120 }).entries;
    const actions = recentUserActionStore.queryWindow({ before: now, beforeCount: 20, afterCount: 0 });
    const version = await getVersionSnapshot();
    const safeConfigSnapshot = createSafeConfigSnapshot({
        ...version,
        runtime: {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            online: navigator.onLine,
        },
    });
    return { logs, actions, safeConfigSnapshot };
}

export async function openLogsWorkspace({ canViewServerLogs = false } = {}) {
    installFrontendLogging();
    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildWorkspaceMarkup({ canViewServerLogs });
    const root = wrapper.firstElementChild;

    const state = {
        mode: 'guided',
        incidents: [],
        healthLogs: [],
        selectedIncidentId: '',
        expertSource: canViewServerLogs ? 'backend' : 'frontend',
        expertEntries: [],
        latestId: 0,
        closed: false,
        busy: false,
        reloadQueued: false,
        modules: { backend: [], frontend: [] },
        startupAnalysis: null,
    };

    const selectedIncident = () => state.incidents.find(item => item.incidentId === state.selectedIncidentId) || null;

    const enterMobileDetail = () => root.classList.add('is-detailing');
    const leaveMobileDetail = () => root.classList.remove('is-detailing');

    const renderDetail = async (incidentId) => {
        state.selectedIncidentId = incidentId;
        const incident = state.incidents.find(item => item.incidentId === incidentId);
        if (!incident) return;
        const detail = root.querySelector('.atriaLogsDetailContent');
        detail.innerHTML = incidentDetailMarkup(incident);
        renderIncidentList(root, state.incidents, state.selectedIncidentId, renderDetail);
        enterMobileDetail();

        detail.querySelector('.atriaLogsCopySummary')?.addEventListener('click', async () => {
            const payload = await api(`/incidents/${encodeURIComponent(incidentId)}/export`, { method: 'POST', body: { mode: 'summary' } });
            await copyText(exportAsClipboardText(payload, 'summary'), t`Diagnostic summary`);
        });
        detail.querySelector('.atriaLogsCopyFull')?.addEventListener('click', async () => {
            const payload = await api(`/incidents/${encodeURIComponent(incidentId)}/export`, { method: 'POST', body: { mode: 'full' } });
            await copyText(exportAsClipboardText(payload, 'full'), t`Full diagnostic context`);
        });
    };

    const loadGuided = async () => {
        const [incidentPayload, frontendPayload] = await Promise.all([
            api('/incidents/list', { method: 'POST', body: { limit: 200 } }),
            Promise.resolve(frontendLogStore.query({ limit: 500 })),
        ]);
        state.incidents = Array.isArray(incidentPayload?.incidents) ? incidentPayload.incidents : [];
        state.healthLogs = frontendPayload.entries || [];
        if (canViewServerLogs) {
            try {
                const backend = await api('/logs/query', { method: 'POST', body: { limit: 500 } });
                state.healthLogs.push(...(backend.entries || []));
            } catch {
                // Guided mode still works from local/frontend evidence.
            }
        }
        const health = deriveModuleHealth({ incidents: state.incidents, logs: state.healthLogs });
        renderHealth(root, health, state.incidents, renderDetail);
        renderIncidentList(root, state.incidents, state.selectedIncidentId, renderDetail);
        if (state.selectedIncidentId && !selectedIncident()) {
            state.selectedIncidentId = '';
            root.querySelector('.atriaLogsDetailContent').innerHTML = `<div class="atriaLogsEmptyDetail">${t`Select an incident`}</div>`;
        }
    };

    const populateModuleSelect = () => {
        const select = root.querySelector('.atriaLogsModule');
        const source = state.expertSource === 'backend' ? state.modules.backend : state.modules.frontend;
        const current = select.value;
        select.innerHTML = `<option value="">${t`All modules`}</option>`
            + source.map(module => `<option value="${htmlEscape(module)}">${htmlEscape(module)}</option>`).join('');
        if (source.includes(current)) select.value = current;
    };

    const expertQuery = ({ sinceId = 0 } = {}) => {
        const module = root.querySelector('.atriaLogsModule').value;
        const level = root.querySelector('.atriaLogsLevel').value;
        const text = root.querySelector('.atriaLogsSearch').value.trim();
        return {
            sinceId,
            limit: DEFAULT_LOG_LIMIT,
            ...(module ? { modules: [module] } : {}),
            ...(level ? { levels: [level] } : {}),
            ...(text ? { text } : {}),
        };
    };

    const selectRawLog = (entry) => {
        root.querySelector('.atriaLogsRawDetailPre').textContent = JSON.stringify(entry, null, 2);
        enterMobileDetail();
    };

    const loadExpert = async ({ append = false } = {}) => {
        const query = expertQuery({ sinceId: append ? state.latestId : 0 });
        let payload;
        if (state.expertSource === 'backend') {
            if (!canViewServerLogs) return;
            payload = await api('/logs/query', { method: 'POST', body: query });
        } else {
            payload = frontendLogStore.query(query);
            if (query.text) {
                const needle = query.text.toLowerCase();
                payload.entries = payload.entries.filter(entry => formatWorkspaceLogEntry(entry).toLowerCase().includes(needle));
            }
        }
        const incoming = Array.isArray(payload?.entries) ? payload.entries : [];
        state.expertEntries = append
            ? [...state.expertEntries, ...incoming].slice(-DEFAULT_LOG_LIMIT)
            : incoming.slice(-DEFAULT_LOG_LIMIT);
        state.latestId = Number(payload?.latestId) || state.latestId;
        renderVirtualLogs(root, state.expertEntries, selectRawLog);
    };

    const loadStartup = async () => {
        if (!state.startupAnalysis) {
            const module = await loadStartupAnalysisModule();
            state.startupAnalysis = module.createStartupAnalysis({
                root: root.querySelector('.atriaStartupAnalysisMount'),
                request: api,
            });
        }
        await state.startupAnalysis.refresh();
    };

    const refresh = async () => {
        if (state.closed) return;
        if (state.busy) {
            state.reloadQueued = true;
            return;
        }
        state.busy = true;
        root.classList.add('is-loading');
        try {
            if (state.mode === 'guided') await loadGuided();
            else if (state.mode === 'startup') await loadStartup();
            else await loadExpert();
        } catch (error) {
            console.error('[diagnostics-workspace] refresh failed', error);
            toastr.error(String(error?.message || error), t`Diagnostics Workspace`);
        } finally {
            root.classList.remove('is-loading');
            state.busy = false;
            if (state.reloadQueued && !state.closed) {
                state.reloadQueued = false;
                void refresh();
            }
        }
    };

    try {
        const modulesPayload = await api('/modules');
        state.modules = {
            backend: Array.isArray(modulesPayload.backend) ? modulesPayload.backend : [],
            frontend: Array.isArray(modulesPayload.frontend) ? modulesPayload.frontend : [],
        };
    } catch (error) {
        console.warn('[diagnostics-workspace] module registry unavailable', error);
    }
    populateModuleSelect();

    root.querySelectorAll('.atriaLogsModeButton').forEach(button => {
        button.addEventListener('click', () => {
            const nextMode = String(button.dataset.mode || 'guided');
            state.mode = ['guided', 'startup', 'expert'].includes(nextMode) ? nextMode : 'guided';
            root.dataset.mode = state.mode;
            root.querySelectorAll('.atriaLogsModeButton').forEach(item => item.classList.toggle('is-active', item === button));
            leaveMobileDetail();
            void refresh();
        });
    });

    root.querySelector('.atriaLogsSource')?.addEventListener('change', event => {
        state.expertSource = event.target.value === 'backend' ? 'backend' : 'frontend';
        state.expertEntries = [];
        state.latestId = 0;
        populateModuleSelect();
        void loadExpert();
    });
    for (const selector of ['.atriaLogsModule', '.atriaLogsLevel']) {
        root.querySelector(selector)?.addEventListener('change', () => {
            state.expertEntries = [];
            state.latestId = 0;
            void loadExpert();
        });
    }
    root.querySelector('.atriaLogsSearch')?.addEventListener('input', () => {
        state.expertEntries = [];
        state.latestId = 0;
        void loadExpert();
    });

    root.querySelector('.atriaLogsRefresh').addEventListener('click', refresh);
    root.querySelectorAll('.atriaLogsMobileBack').forEach(button => button.addEventListener('click', leaveMobileDetail));

    root.querySelector('.atriaLogsReportNow').addEventListener('click', async () => {
        try {
            const evidence = await getFrontendEvidence();
            const latest = [...evidence.logs].reverse().find(entry => entry.level === 'error' || entry.level === 'warn') || evidence.logs.at(-1);
            const payload = await api('/incidents/create-from-recent', {
                method: 'POST',
                body: {
                    summary: latest?.message || t`User reported a recent problem`,
                    primaryModule: latest?.module || 'uncategorized',
                    stage: latest?.event || 'reported-recently',
                    correlation: latest?.correlation || {},
                    frontendLogs: evidence.logs,
                    recentActions: evidence.actions,
                    safeConfigSnapshot: evidence.safeConfigSnapshot,
                    windowMs: 120000,
                },
            });
            toastr.success(t`Diagnostic incident captured.`, t`Diagnostics Workspace`);
            await loadGuided();
            if (payload?.incident?.incidentId) await renderDetail(payload.incident.incidentId);
        } catch (error) {
            console.error('[diagnostics-workspace] capture incident failed', error);
            toastr.error(String(error?.message || error), t`Diagnostics Workspace`);
        }
    });

    root.querySelector('.atriaLogsClear').addEventListener('click', async () => {
        try {
            if (state.expertSource === 'backend') {
                if (!canViewServerLogs) return;
                await api('/logs/clear', { method: 'POST', body: {} });
            } else {
                frontendLogStore.clear();
            }
            state.expertEntries = [];
            state.latestId = 0;
            await loadExpert();
            toastr.success(t`Logs cleared.`, t`Diagnostics Workspace`);
        } catch (error) {
            toastr.error(String(error?.message || error), t`Diagnostics Workspace`);
        }
    });

    const timer = setInterval(() => {
        if (state.closed) return;
        if (state.mode === 'expert') {
            if (root.querySelector('.atriaLogsAutoRefresh')?.checked) void loadExpert({ append: true }).catch(() => {});
        } else if (state.mode === 'guided') {
            void loadGuided().catch(() => {});
        }
    }, state.mode === 'expert' ? EXPERT_REFRESH_MS : GUIDED_REFRESH_MS);

    void refresh();

    try {
        await callGenericPopup(root, POPUP_TYPE.TEXT, '', {
            okButton: t`Close`,
            wide: true,
            large: true,
            allowVerticalScrolling: false,
            allowHorizontalScrolling: false,
        });
    } finally {
        state.closed = true;
        clearInterval(timer);
    }
}
