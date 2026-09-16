import { i18n, i18nFormat } from '../i18n.js';

/** Rendering owns no runtime state. Collapsed diagnostics avoid rebuilding a large text view. */
export function renderRuntimeTrace(body, runtime) {
    let details = body.querySelector('.runtime-trace');
    if (!runtime?.events?.length) { details?.remove(); return; }
    if (!details) {
        details = document.createElement('details');
        details.className = 'runtime-trace';
        details.append(document.createElement('summary'), document.createElement('pre'));
        details.addEventListener('toggle', () => { if (details.open) details.renderBody?.(); });
        body.prepend(details);
    }
    const active = runtime.runs.filter(run => !['completed', 'failed', 'cancelled'].includes(run.status)).length;
    details.querySelector('summary').textContent = i18nFormat('Execution trace: ${0} runs, ${1} active', runtime.runs.length, active);
    details.renderBody = () => {
        const events = runtime.events.filter(event => !event.type.startsWith('policy.advance.'));
        details.querySelector('pre').textContent = i18n('Latest 100 events; export includes the full execution log.') + '\n\n'
            + JSON.stringify({ runs: runtime.runs.map(({ runId, agentId, status, stepId, generation, version }) =>
                ({ runId, agentId, status, stepId, generation, version })), events: events.slice(-100) }, null, 2);
    };
    if (details.open) details.renderBody();
}
