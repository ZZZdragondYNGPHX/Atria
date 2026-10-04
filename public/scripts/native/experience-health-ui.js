import { ensureTaskBindings } from './task-binding-ui.js';
import { translateShellText as t } from '../atria-shell/localization.js';
import { ATRIA_EXPERIENCE_CAPABILITIES } from '../../shared/native-experience-contract.js';
import { presentationNegotiation } from './host-capabilities.js';
import { runtimeRequest } from './runtime-client.js';

export async function nativeExperienceRequest(path, body, signal) {
    const headers = globalThis.Atria?.getContext?.()?.getRequestHeaders?.() ?? {};
    const response = await fetch('/api/native/session/' + path, { method: 'POST', signal,
        headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'Experience request failed');
    return result;
}

export function mountExperienceHealth({ document, root, runtime, request = nativeExperienceRequest, invocationId = () => crypto.randomUUID() }) {
    root.classList.add('atri-experience-panel');
    const sessionId = runtime.snapshot?.session.sessionId;
    const controller = new AbortController();
    let disposed = false; let report = null; let plan = null; let busy = false; let taskReport = null;
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    const content = document.createElement('div');
    const bindingSetup = document.createElement('div');
    const current = () => !disposed && runtime.snapshot?.session.sessionId === sessionId;
    const post = (path, body = {}) => request(path, { sessionId, ...body }, controller.signal);
    function button(label, handler) {
        const node = document.createElement('button'); node.className = 'atria-native-play-actions__button'; node.type = 'button'; node.textContent = t(label); node.disabled = busy;
        node.addEventListener('click', () => void run(handler)); return node;
    }
    function paragraph(text) { const p = document.createElement('p'); p.textContent = t(text); return p; }
    async function run(fn) {
        if (busy || !current()) return;
        busy = true; status.setAttribute('role', 'status'); status.textContent = t('Working…'); content.querySelectorAll('button').forEach(node => { node.disabled = true; });
        try { await fn(); if (current()) status.textContent = t('Ready'); } catch (error) { if (current()) { status.textContent = t(error.message); status.setAttribute('role', 'alert'); } } finally { busy = false; if (current()) render(); }
    }
    async function refresh() { const value = await post('health'); if (current()) { report = value; plan = null; taskReport = null; } }
    async function preview(kind, effect = {}) {
        const value = await post('health/preview', { request: { kind, ...effect, expectedRevisionId: report.anchor.revisionId } });
        if (current()) plan = value;
    }
    function render() {
        content.replaceChildren(button('Refresh health', refresh));
        if (runtime.snapshot?.manifest?.runtime?.experienceContract?.taskRuntime) content.append(button('Configure model purposes', async () => {
            const base = runtime.snapshot;
            const retry = async () => {
                if (!current()) return;
                const api = globalThis.Atria?.getContext?.()?.getCapabilityApi?.('game-runtime');
                const result = await api?.reloadPackage?.();
                if (!result || result.status !== 'ready') throw new Error('Experience could not restart. Check Experience health.');
                await refresh();
            };
            await ensureTaskBindings({ document, root: bindingSetup, manifest: base.manifest,
                packageId: base.session.packageId, packageVersionId: base.session.packageVersionId, force: true, isCurrent: current, onReady: retry });
        }));
        if (!report) return;
        content.append(paragraph('Experience health'), paragraph(report.status));
        content.append(button('Open Diagnostics', () => globalThis.Atria?.shell?.getWorkspaceHost?.()?.openRuntimeSection('diagnostics')));
        if (runtime.snapshot?.manifest?.runtime?.experienceContract?.taskRuntime) content.append(button('Check Task bindings', async () => {
            const base = runtime.snapshot;
            const settings = globalThis.Atria?.getContext?.()?.capabilitySettings ?? {};
            const value = await runtimeRequest('/lifecycle/prepare', { method: 'POST', signal: controller.signal, body: {
                sessionId, revisionId: base.revision.revisionId, slotBindings: settings.atri_task_bindings?.[base.session.packageId] ?? {},
            } });
            if (current() && runtime.snapshot.revision.revisionId === base.revision.revisionId) taskReport = value;
        }));
        if (taskReport) {
            const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = t('Task binding diagnostics');
            const pre = document.createElement('pre'); pre.textContent = JSON.stringify(taskReport, null, 2); details.append(summary, pre); content.append(details);
        }
        const presentation = runtime.snapshot?.manifest?.runtime?.experienceContract?.presentationRuntime;
        for (const item of presentationNegotiation(presentation, document, document.defaultView)) content.append(paragraph(`${item.id} · ${t(item.status)}${item.fallback ? ' · ' + item.fallback : ''}`));
        for (const item of report.capabilities) {
            const supported = ATRIA_EXPERIENCE_CAPABILITIES[item.id]?.supported.includes(item.version);
            content.append(paragraph(`${item.id}@${item.version} · ${t(item.required ? 'Required' : 'Optional')} · ${t(supported ? 'Ready' : item.required ? 'Blocked' : 'Degraded')}`));
        }
        for (const item of report.diagnostics) {
            content.append(paragraph(item.code));
            if (item.code === 'transfer.prepared') content.append(
                button('Preview resume', () => preview('transfer.resume', { authority: item.authority, intentId: item.intentId })),
                button('Preview cancellation', () => preview('transfer.cancel', { authority: item.authority, intentId: item.intentId })),
            );
        }
        content.append(paragraph('Existing sessions keep their exact package and schema. Player and Realm are never rewound by restoring a session.'));
        if (report.repairKinds.includes('retention.compact')) content.append(button('Preview retention repair', () => preview('retention.compact')));
        if (plan) {
            const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = t('Proposed changes');
            const pre = document.createElement('pre'); pre.textContent = JSON.stringify(plan.changes, null, 2); details.append(summary, pre); details.open = true;
            content.append(details, paragraph('Review these changes before confirming. A changed session requires a fresh preview.'), button('Confirm repair', async () => {
                if (runtime.history || runtime.generation) throw new Error('Repair requires the active session');
                const saved = plan;
                await post('health/apply', { repair: { request: saved.request, token: saved.token, confirmed: true, invocationId: invocationId() } });
                if (!current()) return;
                await runtime.open(sessionId); if (current()) await refresh();
            }));
        }
    }
    root.replaceChildren(status, bindingSetup, content); render(); void run(refresh);
    return { dispose() { disposed = true; controller.abort(); root.replaceChildren(); root.classList.remove('atri-experience-panel'); } };
}
