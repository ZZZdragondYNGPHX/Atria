import { t } from '../i18n.js';
import {
    buildSlowStartupItems,
    buildStartupDonut,
    buildStartupTimeline,
    getTimelineExtent,
} from './startup-analysis-model.js';

function htmlEscape(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll('\'', '&#039;');
}

function formatMs(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '—';
    if (numeric >= 1000) return `${(numeric / 1000).toFixed(numeric >= 10000 ? 1 : 2)}s`;
    return `${Math.round(numeric * 10) / 10}ms`;
}

function formatDelta(value) {
    if (value === null || value === undefined || value === '') return '—';
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '—';
    if (numeric === 0) return '±0ms';
    return `${numeric > 0 ? '+' : ''}${formatMs(numeric)}`;
}

function sessionLabel(session) {
    const when = Number.isFinite(Number(session?.completedAt || session?.createdAt))
        ? new Date(Number(session.completedAt || session.createdAt)).toLocaleString()
        : t`Unknown time`;
    const version = session?.appVersion || session?.revision || t`Unknown version`;
    return `${when} · ${version}`;
}

function shellMarkup() {
    return `
        <div class="atriaStartupAnalysis">
            <header class="atriaStartupToolbar">
                <div>
                    <span class="atriaLogsKicker">${t`Startup Analysis`}</span>
                    <h4>${t`Where startup time went`}</h4>
                </div>
                <div class="atriaStartupToolbarControls">
                    <label><span>${t`Scope`}</span>
                        <select class="text_pole atriaStartupScope">
                            <option value="client">${t`Client`}</option>
                            <option value="server">${t`Server`}</option>
                            <option value="extensions">${t`Extensions`}</option>
                        </select>
                    </label>
                    <label><span>${t`Compare with`}</span><select class="text_pole atriaStartupCompare"></select></label>
                </div>
            </header>
            <div class="atriaStartupBody">
                <aside class="atriaStartupSessionsPane">
                    <div class="atriaLogsPaneTitle">${t`Recent sessions`}</div>
                    <div class="atriaStartupSessionList"></div>
                </aside>
                <main class="atriaStartupMain">
                    <div class="atriaStartupEmpty">${t`No completed startup sessions yet. Reload Atria once and return here after APP_READY.`}</div>
                    <div class="atriaStartupContent">
                        <section class="atriaStartupHeroGrid">
                            <article class="atriaStartupCard atriaStartupDonutCard">
                                <div class="atriaStartupCardTitle"><span>${t`Phase share`}</span><span class="atriaStartupTotal"></span></div>
                                <div class="atriaStartupDonutWrap"></div>
                                <div class="atriaStartupLegend"></div>
                            </article>
                            <article class="atriaStartupCard">
                                <div class="atriaStartupCardTitle"><span>${t`Slowest work`}</span><span>${t`Top 12`}</span></div>
                                <div class="atriaStartupSlowList"></div>
                            </article>
                        </section>
                        <section class="atriaStartupCard atriaStartupCompareCard">
                            <div class="atriaStartupCardTitle"><span>${t`Session comparison`}</span><span class="atriaStartupCompareLabel"></span></div>
                            <div class="atriaStartupCompareMetrics"></div>
                        </section>
                        <section class="atriaStartupCard">
                            <div class="atriaStartupCardTitle"><span>${t`Startup timeline`}</span><span>${t`Waterfall`}</span></div>
                            <div class="atriaStartupTimeline"></div>
                        </section>
                        <section class="atriaStartupCard">
                            <div class="atriaStartupCardTitle"><span>${t`Extension activation breakdown`}</span><span class="atriaStartupExtensionCount"></span></div>
                            <div class="atriaStartupExtensionsTableWrap">
                                <table class="atriaStartupExtensionsTable">
                                    <thead><tr>
                                        <th>${t`Extension`}</th><th>${t`Total`}</th><th>${t`Script`}</th>
                                        <th>${t`Style`}</th><th>${t`Locale`}</th><th>${t`Hook`}</th><th>Δ</th>
                                    </tr></thead>
                                    <tbody></tbody>
                                </table>
                            </div>
                        </section>
                    </div>
                </main>
            </div>
        </div>
    `;
}

function donutMarkup(donut) {
    if (!donut.slices.length) {
        return `<div class="atriaStartupChartEmpty">${t`No timing slices were captured for this scope.`}</div>`;
    }
    const circles = donut.slices.map((slice, index) => {
        const start = slice.startRatio * 100;
        const percentage = slice.percentage;
        return `<circle class="atriaStartupDonutSlice atriaStartupSlice-${index % 6}" cx="50" cy="50" r="38"
            pathLength="100" fill="none" stroke-width="13" stroke-linecap="butt"
            stroke-dasharray="${percentage} ${100 - percentage}"
            stroke-dashoffset="${-start}" transform="rotate(-90 50 50)"></circle>`;
    }).join('');
    return `
        <svg class="atriaStartupDonut" viewBox="0 0 100 100" role="img" aria-label="${t`Startup timing donut chart`}">
            <circle class="atriaStartupDonutTrack" cx="50" cy="50" r="38" fill="none" stroke-width="13"></circle>
            ${circles}
            <text x="50" y="48" text-anchor="middle" class="atriaStartupDonutValue">${htmlEscape(formatMs(donut.totalMs))}</text>
            <text x="50" y="58" text-anchor="middle" class="atriaStartupDonutCaption">${t`captured`}</text>
        </svg>
    `;
}

function renderLegend(root, donut) {
    root.querySelector('.atriaStartupLegend').innerHTML = donut.slices.map((slice, index) => `
        <div class="atriaStartupLegendRow">
            <span class="atriaStartupLegendSwatch atriaStartupSlice-${index % 6}"></span>
            <span class="atriaStartupLegendName">${htmlEscape(slice.label)}</span>
            <strong>${htmlEscape(formatMs(slice.durationMs))}</strong>
            <span>${slice.percentage.toFixed(1)}%</span>
        </div>
    `).join('');
}

function renderSlowList(root, session) {
    const items = buildSlowStartupItems(session);
    root.querySelector('.atriaStartupSlowList').innerHTML = items.length
        ? items.map((item, index) => `
            <div class="atriaStartupSlowRow">
                <span class="atriaStartupRank">${index + 1}</span>
                <span><strong>${htmlEscape(item.label)}</strong><small>${htmlEscape(item.scope)}</small></span>
                <strong>${htmlEscape(formatMs(item.durationMs))}</strong>
            </div>
        `).join('')
        : `<div class="atriaStartupChartEmpty">${t`No slow items captured.`}</div>`;
}

function renderTimelineGroup(label, rows) {
    if (!rows.length) return '';
    const extent = getTimelineExtent(rows);
    if (!(extent > 0)) return '';
    return `
        <div class="atriaStartupTimelineGroup">
            <div class="atriaStartupTimelineGroupTitle">${htmlEscape(label)} <span>${htmlEscape(formatMs(extent))}</span></div>
            ${rows.map(row => {
                const left = Math.max(0, Math.min(100, (row.startMs / extent) * 100));
                const width = Math.max(1.2, Math.min(100 - left, (row.durationMs / extent) * 100));
                return `
                    <div class="atriaStartupTimelineRow">
                        <span class="atriaStartupTimelineLabel" title="${htmlEscape(row.label)}">${htmlEscape(row.label)}</span>
                        <div class="atriaStartupTimelineTrack">
                            <span class="atriaStartupTimelineBar" style="left:${left}%;width:${width}%"></span>
                        </div>
                        <strong>${htmlEscape(formatMs(row.durationMs))}</strong>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderTimeline(root, session) {
    const timeline = buildStartupTimeline(session);
    root.querySelector('.atriaStartupTimeline').innerHTML = [
        renderTimelineGroup(t`Server`, timeline.server),
        renderTimelineGroup(t`Client`, timeline.client),
        renderTimelineGroup(t`Extensions`, timeline.extensions),
    ].filter(Boolean).join('') || `<div class="atriaStartupChartEmpty">${t`No timeline data captured.`}</div>`;
}

function renderComparison(root, comparison, sessions, compareId) {
    const label = root.querySelector('.atriaStartupCompareLabel');
    const metrics = root.querySelector('.atriaStartupCompareMetrics');
    const compareSession = sessions.find(item => item.id === compareId);
    label.textContent = compareSession ? sessionLabel(compareSession) : t`No comparison`;
    if (!comparison) {
        metrics.innerHTML = `<div class="atriaStartupChartEmpty">${t`Choose another startup session to compare.`}</div>`;
        return;
    }

    const keys = [
        ['firstLoadTotalMs', t`APP_READY total`],
        ['visibleTotalMs', t`First visible`],
        ['batch2Ms', t`Batch 2`],
        ['extActivateMs', t`Extension activate`],
    ];
    metrics.innerHTML = keys.map(([key, title]) => {
        const delta = comparison.clientDeltas?.[key];
        const numeric = Number(delta);
        const state = Number.isFinite(numeric) && numeric > 0 ? 'slower' : Number.isFinite(numeric) && numeric < 0 ? 'faster' : 'same';
        return `
            <div class="atriaStartupDelta is-${state}">
                <span>${htmlEscape(title)}</span>
                <strong>${htmlEscape(formatDelta(delta))}</strong>
                <small>${state === 'slower' ? t`slower` : state === 'faster' ? t`faster` : t`unchanged`}</small>
            </div>
        `;
    }).join('');
}

function renderExtensions(root, session, comparison) {
    const rows = session?.extensions || [];
    const deltaMap = new Map((comparison?.extensionDeltas || []).map(item => [item.name, item.deltaMs]));
    root.querySelector('.atriaStartupExtensionCount').textContent = String(rows.length);
    root.querySelector('.atriaStartupExtensionsTable tbody').innerHTML = rows.length
        ? rows.map(item => `
            <tr>
                <td>${htmlEscape(item.name)}</td>
                <td><strong>${htmlEscape(formatMs(item.totalMs))}</strong></td>
                <td>${htmlEscape(formatMs(item.scriptMs))}</td>
                <td>${htmlEscape(formatMs(item.styleMs))}</td>
                <td>${htmlEscape(formatMs(item.localeMs))}</td>
                <td>${htmlEscape(formatMs(item.hookMs))}</td>
                <td>${htmlEscape(formatDelta(deltaMap.get(item.name)))}</td>
            </tr>
        `).join('')
        : `<tr><td colspan="7">${t`No per-extension timing data captured.`}</td></tr>`;
}

export function createStartupAnalysis({ root, request }) {
    root.innerHTML = shellMarkup();

    const state = {
        sessions: [],
        selectedId: '',
        compareId: '',
        session: null,
        comparison: null,
        scope: 'client',
        busy: false,
    };

    const renderSessions = () => {
        const list = root.querySelector('.atriaStartupSessionList');
        list.innerHTML = state.sessions.length
            ? state.sessions.map((session, index) => `
                <button type="button" class="atriaStartupSessionRow ${session.id === state.selectedId ? 'is-selected' : ''}" data-session-id="${htmlEscape(session.id)}">
                    <span class="atriaStartupSessionIndex">#${index + 1}</span>
                    <span><strong>${htmlEscape(session.appVersion || t`Unknown version`)}</strong><small>${htmlEscape(sessionLabel(session))}</small></span>
                </button>
            `).join('')
            : `<div class="atriaStartupChartEmpty">${t`No startup sessions stored.`}</div>`;
        list.querySelectorAll('.atriaStartupSessionRow').forEach(button => {
            button.addEventListener('click', () => {
                void selectSession(button.dataset.sessionId);
            });
        });
    };

    const populateCompare = () => {
        const select = root.querySelector('.atriaStartupCompare');
        const candidates = state.sessions.filter(item => item.id !== state.selectedId);
        if (state.compareId && !candidates.some(item => item.id === state.compareId)) state.compareId = '';
        if (!state.compareId && candidates.length) state.compareId = candidates[0].id;
        select.innerHTML = `<option value="">${t`No comparison`}</option>`
            + candidates.map(item => `<option value="${htmlEscape(item.id)}">${htmlEscape(sessionLabel(item))}</option>`).join('');
        select.value = state.compareId;
    };

    const loadComparison = async () => {
        if (!state.session || !state.compareId) {
            state.comparison = null;
            return;
        }
        try {
            const payload = await request('/startup/compare', {
                method: 'POST',
                body: { currentId: state.selectedId, previousId: state.compareId },
            });
            state.comparison = payload?.comparison || null;
        } catch {
            state.comparison = null;
        }
    };

    const render = () => {
        const empty = root.querySelector('.atriaStartupEmpty');
        const content = root.querySelector('.atriaStartupContent');
        const hasSession = Boolean(state.session);
        empty.style.display = hasSession ? 'none' : 'flex';
        content.style.display = hasSession ? 'flex' : 'none';
        renderSessions();
        populateCompare();
        if (!hasSession) return;

        const donut = buildStartupDonut(state.session, state.scope);
        root.querySelector('.atriaStartupTotal').textContent = formatMs(donut.totalMs);
        root.querySelector('.atriaStartupDonutWrap').innerHTML = donutMarkup(donut);
        renderLegend(root, donut);
        renderSlowList(root, state.session);
        renderComparison(root, state.comparison, state.sessions, state.compareId);
        renderTimeline(root, state.session);
        renderExtensions(root, state.session, state.comparison);
    };

    async function selectSession(id) {
        if (!id || state.busy) return;
        state.busy = true;
        try {
            const payload = await request('/startup/' + encodeURIComponent(id));
            state.selectedId = id;
            state.session = payload?.session || null;
            populateCompare();
            await loadComparison();
            render();
        } finally {
            state.busy = false;
        }
    }

    root.querySelector('.atriaStartupScope').addEventListener('change', event => {
        state.scope = ['server', 'client', 'extensions'].includes(event.target.value) ? event.target.value : 'client';
        render();
    });

    root.querySelector('.atriaStartupCompare').addEventListener('change', event => {
        state.compareId = String(event.target.value || '');
        void loadComparison().then(render);
    });

    return {
        async refresh() {
            if (state.busy) return;
            state.busy = true;
            try {
                const payload = await request('/startup/list', { method: 'POST', body: { limit: 20 } });
                state.sessions = Array.isArray(payload?.sessions) ? payload.sessions : [];
                const preferredId = state.sessions.some(item => item.id === state.selectedId)
                    ? state.selectedId
                    : state.sessions[0]?.id || '';
                if (!preferredId) {
                    state.selectedId = '';
                    state.session = null;
                    state.comparison = null;
                    render();
                    return;
                }
                const detail = await request('/startup/' + encodeURIComponent(preferredId));
                state.selectedId = preferredId;
                state.session = detail?.session || null;
                populateCompare();
                await loadComparison();
                render();
            } finally {
                state.busy = false;
            }
        },
    };
}
