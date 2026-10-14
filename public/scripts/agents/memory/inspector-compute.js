// SPDX-License-Identifier: AGPL-3.0-or-later
import { projectTemporalGraph } from './temporal-graph.js';
import { projectFacts } from './atomic-facts.js';
import { inspectMemory } from './diagnostics.js';
import { translateShellText as t } from '../../atria-shell/localization.js';

export function inspectorPayload(snapshot, mode) {
    // Chat variable tables and rollback backups are not inputs to source validation.
    const chat = snapshot.chat.map(({ memory_os_source_id, atri_native, mes, name, is_user, is_system, swipe_id }) => ({
        memory_os_source_id,
        ...(atri_native?.messageId ? { atri_native: { messageId: atri_native.messageId } } : {}),
        mes,
        name,
        is_user,
        is_system,
        swipe_id,
    }));
    const state = { ...snapshot.state, historyBuild: snapshot.state.historyBuild ? { ...snapshot.state.historyBuild, before: undefined } : undefined };
    if (mode === 'graph') {
        delete state.sources; delete state.dependencies; delete state.providerSources; delete state.providerSnapshots; delete state.historyBuild;
        state.episodes = Object.fromEntries(Object.entries(state.episodes).map(([id, { content: _content, ...episode }]) => [id, episode]));
        state.corrections = Object.fromEntries(Object.entries(state.corrections || {}).map(([id, record]) => [id, { scopeId: record.scopeId }]));
        const proof = ref => {
            if (!ref || typeof ref !== 'object') return ref;
            const rest = { ...ref }; delete rest.evidence; delete rest.reason; delete rest.fingerprint; return rest;
        };
        for (const key of ['facts', 'entities', 'relations', 'entityPending']) state[key] = Object.fromEntries(Object.entries(state[key] || {}).map(([id, value]) => {
            const record = proof(value);
            for (const field of ['supports', 'names', 'merges', 'resolutions', 'supersededBy']) if (Array.isArray(record[field])) record[field] = record[field].map(proof);
            return [id, record];
        }));
    }
    return { state, chat };
}

/** A worker owns only this read. Cancellation/closure terminates it and discards output. */
export async function computeInspector(snapshot, { mode = 'graph', query = '', signal, batch, ticket, fallback,
    workerFactory = typeof Worker === 'undefined' ? null : () => new Worker(new URL('./workers/inspector.js', import.meta.url), { type: 'module' }) } = {}) {
    const guard = () => {
        if (signal?.aborted) throw Object.assign(new Error('Inspector cancelled'), { name: 'AbortError' });
        snapshot.assertCurrent();
    };
    guard();
    const size = Object.keys(snapshot.state.facts || {}).length + Object.keys(snapshot.state.entities || {}).length + Object.keys(snapshot.state.relations || {}).length;
    if (!workerFactory) {
        if (size > 1000) throw new Error('Large graph inspection requires Web Workers in this browser');
        const result = fallback ? fallback() : mode === 'diagnostics' ? inspectMemory(snapshot, query) : {
            graph: projectTemporalGraph(snapshot.state, snapshot.chat, { includeInactive: true }), facts: projectFacts(snapshot.state, snapshot.chat, { includeInactive: true }),
        };
        guard(); return result;
    }
    const result = await new Promise((resolve, reject) => {
        let worker; let timer; let settled = false;
        const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel); worker?.terminate(); error ? reject(error) : resolve(value); };
        const cancel = () => finish(Object.assign(new Error('Inspector cancelled'), { name: 'AbortError' }));
        try {
            worker = workerFactory();
            worker.onmessage = ({ data }) => finish(data.error ? new Error(data.error) : null, data.result);
            worker.onerror = () => finish(new Error('Memory inspector worker failed'));
            signal?.addEventListener('abort', cancel, { once: true });
            if (signal?.aborted) { cancel(); return; }
            timer = setTimeout(() => finish(new Error('Memory inspector worker timed out')), 30000);
            worker.postMessage({ ...inspectorPayload(snapshot, mode), mode, query, batch, ticket });
        } catch (error) { finish(error); }
    });
    guard(); return result;
}

export async function openMemoryDiagnostics(context, snapshot) {
    const root = document.createElement('section'); root.className = 'memory-os-diagnostics';
    const heading = document.createElement('h3'); heading.textContent = t('Memory OS · Diagnostics');
    const note = document.createElement('p'); note.textContent = t('Uses local lexical and graph retrieval. No model or vector requests are sent, and access counters are preserved.');
    const label = document.createElement('label'); label.textContent = t('Query');
    const input = document.createElement('input'); input.className = 'text_pole'; input.maxLength = 4000; input.setAttribute('aria-label', t('Diagnostics query')); label.append(input);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'menu_button'; button.textContent = t('Run diagnostics');
    const results = document.createElement('pre'); results.setAttribute('role', 'status'); root.append(heading, note, label, button, results);
    const output = root.querySelector('pre'); output.style.whiteSpace = 'pre-wrap'; output.style.overflowWrap = 'anywhere'; output.style.textAlign = 'left';
    let controller; let disposed = false;
    const run = async () => {
        controller?.abort(); const current = new AbortController(); controller = current; output.textContent = t('Computing…');
        try {
            const result = await computeInspector(snapshot, { mode: 'diagnostics', query: root.querySelector('input').value, signal: current.signal });
            if (!disposed && controller === current) output.textContent = JSON.stringify(result, null, 2);
        } catch (error) { if (!disposed && controller === current) output.textContent = error.message; }
    };
    root.querySelector('button').addEventListener('click', run);
    const popup = context.callGenericPopup(root, context.POPUP_TYPE.TEXT, '', { wide: true, allowVerticalScrolling: true });
    void run();
    try { await popup; } finally { disposed = true; controller?.abort(); }
}
