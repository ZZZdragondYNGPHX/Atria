import { replayRuntimeEvents } from '../../../../lib/agent-runtime/projection.js';
import { downloadRunTraceAsJsonl } from '../../runtime-trace-export.js';
import { i18n, i18nFormat } from '../../i18n.js';

const MAX_TRACE_BYTES = 20 * 1024 * 1024;

function metric({ parent, el, label, value, hint = '' }) {
    const card = el('div', undefined, parent);
    card.className = 'workspace-diagnostic-metric';
    el('small', label, card);
    el('strong', String(value ?? '—'), card);
    if (hint) el('span', hint, card);
}

function checkpointRows(run) {
    return run?.runtime?.runs?.map(({ runId, version, generation, status, staleEffects }) => ({
        runId,
        version,
        generation,
        status,
        staleEffects,
    })) || [];
}

export function renderDiagnosticsPage({
    parent,
    el,
    button,
    detail,
    paged,
    run,
    view,
    replay,
    onReplay,
    onReturnLive,
}) {
    const head = el('div', undefined, parent);
    head.className = 'workspace-page-heading';

    const copy = el('div', undefined, head);
    el('span', 'Advanced', copy).className = 'workspace-eyebrow';
    el('h3', 'Diagnostics', copy);
    el('p', 'Runtime health, recovery, context budgets and trace tools.', copy).className = 'workspace-hint';

    const actions = el('div', undefined, head);
    actions.className = 'workspace-actions';

    const exportButton = button(actions, 'Export Trace', () => {
        downloadRunTraceAsJsonl(run?.runtime?.events);
    });
    exportButton.disabled = !run?.runtime?.events?.length;

    const importLabel = el('label', 'Import trace', actions);
    importLabel.className = 'workspace-file-action';
    const upload = el('input', undefined, importLabel);
    upload.type = 'file';
    upload.accept = '.jsonl,.ndjson';
    upload.setAttribute('aria-label', i18n('Replay metadata trace'));
    upload.addEventListener('change', async () => {
        const file = upload.files?.[0];
        if (!file) return;
        try {
            if (file.size > MAX_TRACE_BYTES) throw new Error(i18n('Trace import is limited to 20 MiB.'));
            const events = (await file.text())
                .split(/\r?\n/)
                .filter(line => line.trim())
                .map(line => JSON.parse(line));
            const runtime = replayRuntimeEvents(events);
            if (!upload.isConnected) return;
            if (!runtime.runs.length) throw new Error(i18n('No valid Runtime events in this trace.'));
            onReplay(runtime);
        } catch (error) {
            if (!upload.isConnected) return;
            const row = el('p', error.message, parent);
            row.className = 'workspace-error';
        }
    });

    if (replay) {
        const banner = el('div', undefined, parent);
        banner.className = 'workspace-replay-banner';
        const text = el('div', undefined, banner);
        el('strong', 'Viewing imported trace', text);
        el('small', 'Private request/response bodies are not included in metadata trace exports.', text);
        button(banner, 'Return to live run', onReturnLive);
    }

    const summary = el('section', undefined, parent);
    summary.className = 'workspace-diagnostics-summary';
    const summaryHead = el('div', undefined, summary);
    summaryHead.className = 'workspace-section-heading';
    el('h3', 'Runtime health', summaryHead);
    if (run?.status) {
        const chip = el('span', run.status, summaryHead);
        chip.className = `workspace-status-chip is-${run.status}`;
    }

    const metrics = el('div', undefined, summary);
    metrics.className = 'workspace-diagnostic-metrics';
    metric({ parent: metrics, el, label: 'Events', value: view.diagnostics.length });
    metric({ parent: metrics, el, label: 'Runtime agents', value: run?.runtime?.runs?.length || 0 });
    metric({ parent: metrics, el, label: 'Engine nodes', value: view.engine?.nodes?.length || 0 });
    metric({ parent: metrics, el, label: 'Internal calls', value: view.calls?.internal || 0 });
    metric({ parent: metrics, el, label: 'Tool calls', value: view.calls?.external || 0 });
    metric({ parent: metrics, el, label: 'Memory recalls', value: view.recalls?.length || 0 });

    const body = el('div', undefined, parent);
    body.className = 'workspace-diagnostics-grid';

    const recovery = el('section', undefined, body);
    recovery.className = 'workspace-diagnostic-card';
    const recoveryHead = el('div', undefined, recovery);
    recoveryHead.className = 'workspace-section-heading';
    el('h3', 'Checkpoint & recovery', recoveryHead);
    const checkpoints = checkpointRows(run);
    el('span', String(checkpoints.length), recoveryHead).className = 'workspace-hint';
    if (!checkpoints.length) {
        el('p', 'No runtime checkpoints are visible for the selected run.', recovery).className = 'workspace-hint';
    } else {
        for (const checkpoint of checkpoints.slice(0, 40)) {
            const row = el('div', undefined, recovery);
            row.className = 'workspace-diagnostic-row';
            const left = el('div', undefined, row);
            el('strong', checkpoint.runId, left);
            el('small', `v${checkpoint.version} · generation ${checkpoint.generation}`, left);
            const status = el('span', checkpoint.status, row);
            status.className = `workspace-status-chip is-${checkpoint.status}`;
        }
    }

    const contexts = el('section', undefined, body);
    contexts.className = 'workspace-diagnostic-card';
    const contextHead = el('div', undefined, contexts);
    contextHead.className = 'workspace-section-heading';
    el('h3', 'Context & token budgets', contextHead);
    el('span', String(view.contexts?.length || 0), contextHead).className = 'workspace-hint';

    if (!view.contexts?.length) {
        el('p', 'No context packets have been observed for this run.', contexts).className = 'workspace-hint';
    } else {
        for (const item of view.contexts.slice(-30).reverse()) {
            const row = el('details', undefined, contexts);
            row.className = 'workspace-diagnostic-context';
            const label = item.nodeId || item.agentId || item.stepId || item.runId || 'Context';
            el('summary', label, row);
            const dl = el('dl', undefined, row);
            dl.className = 'workspace-kv';
            const facts = [
                ['Step', item.stepId],
                ['Prompt tokens', item.promptTokens ?? item.tokens?.prompt],
                ['Completion tokens', item.completionTokens ?? item.tokens?.completion],
                ['Total tokens', item.totalTokens ?? item.tokens?.total],
            ].filter(([, value]) => value !== undefined && value !== null);
            for (const [labelText, value] of facts) {
                el('dt', labelText, dl);
                el('dd', String(value), dl);
            }
            detail(row, 'Raw context metadata', item);
        }
    }

    const advanced = el('details', undefined, parent);
    advanced.className = 'workspace-diagnostics-advanced';
    el('summary', 'Advanced runtime data', advanced);
    el('p', 'Raw projections and journals are intended for debugging, issue reports and replay analysis.', advanced).className = 'workspace-hint';

    if (view.engine) {
        detail(advanced, 'Engine projection', view.engine);
        detail(advanced, 'Arbitration', {
            policy: view.engine.arbitration,
            state: view.engine.arbitrationState,
        });
        detail(advanced, 'Results and provenance', view.engine.results);
    }

    const journal = el('section', undefined, advanced);
    journal.className = 'workspace-diagnostic-journal';
    const journalHead = el('div', undefined, journal);
    journalHead.className = 'workspace-section-heading';
    el('h3', i18nFormat('Runtime journal · ${0} events', view.diagnostics.length), journalHead);
    paged(journal, [...view.diagnostics].reverse(), (host, event) => {
        detail(host, `${event.type} · ${event.stepId || event.runId}`, event);
    });

    return () => {};
}
