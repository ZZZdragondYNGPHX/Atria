import { runtimeRequest } from './runtime-client.js';
import { getTaskBindings, setTaskBinding } from './task-bindings.js';
import { mountRuntimeRoutePicker } from './runtime-route-picker.js';
import { el } from './library-ui.js';
import { translateShellText as t, formatShellText as fmt } from '../atria-shell/localization.js';

const setups = new WeakMap();
const label = id => id.replace(/[._-]+/g, ' ').replace(/\b[a-z]/g, value => value.toUpperCase());
export const isTaskBindingFailure = errors => (errors ?? []).some(error => /native_task_binding_missing|generation_capability_(unsupported|unknown)|native_generation_route_missing/.test(error));
export function taskBindingMessage(code) {
    if (code === 'generation_capability_unsupported') return t('This route does not support the capabilities required by this purpose.');
    if (code === 'generation_capability_unknown') return t('This route has no verified support for the capabilities required by this purpose.');
    if (code === 'native_task_binding_missing') return t('Choose an available player Runtime Route for this purpose.');
    return t('This route or one of its exact dependencies is unavailable. Configure it in Runtime.');
}

// A transient first-party editor over settings, not a Package API or new store.
// Returns true only when the exact Package already has complete valid bindings.
export async function ensureTaskBindings({ document: doc, root, manifest, packageId, packageVersionId,
    host = globalThis.Atria?.shell?.getWorkspaceHost?.(), onReady, isCurrent = () => true, force = false }) {
    setups.get(root)?.abort(); root.replaceChildren();
    if (!manifest?.runtime?.experienceContract?.taskRuntime?.tasks?.length) return true;
    const controller = new AbortController(); setups.set(root, controller);
    const panel = el(doc, 'section', 'atri-library-section', undefined, root); panel.dataset.atriaTaskBindingSetup = 'true';
    const heading = el(doc, 'h3', '', t('Configure model purposes'), panel); heading.tabIndex = -1;
    const status = el(doc, 'p', '', t('Checking model purposes…'), panel); status.setAttribute('role', 'status');
    const content = el(doc, 'div', '', undefined, panel);
    const current = () => !controller.signal.aborted && panel.isConnected && isCurrent();
    const check = bindings => runtimeRequest('/task-bindings/preflight', { method: 'POST', signal: controller.signal,
        body: { packageId, packageVersionId, slotBindings: bindings } });
    let draft = getTaskBindings(packageId); let busy = false; let controls = content;
    function button(text, handler, parent = controls) {
        const node = el(doc, 'button', 'atri-library-button', t(text), parent); node.type = 'button';
        node.addEventListener('click', async () => {
            if (busy || !current()) return;
            busy = true; panel.setAttribute('aria-busy', 'true');
            content.querySelectorAll('button, select').forEach(item => { item.disabled = true; });
            try { await handler(); } catch { if (current()) { status.textContent = t('Could not complete model setup. Refresh the routes and try again.'); status.setAttribute('role', 'alert'); } } finally { busy = false; panel.removeAttribute('aria-busy'); if (current()) { content.querySelectorAll('button, select').forEach(item => { item.disabled = false; }); updateSave(); } }
        }); return node;
    }
    let save; let report;
    const selected = slot => slot.routes.some(route => route.compatible && draft[slot.id]?.scope === 'player' && route.runtimeRouteId === draft[slot.id]?.runtimeRouteId);
    function updateSave() { if (save) save.disabled = busy || !report.slots.every(selected); }
    function draw(next) {
        report = next; content.replaceChildren();
        status.setAttribute('role', 'status');
        const missing = report.slots.filter(slot => slot.error);
        status.textContent = missing.length
            ? fmt('This work needs ${0} model purposes configured before it can start: ${1}.', [missing.length, missing.map(slot => label(slot.id)).join(', ')])
            : t('Model purposes are ready. You can review your routes before continuing.');
        const pickers = new Map();
        for (const slot of report.slots) {
            const group = el(doc, 'div', 'atri-library-section', undefined, content); group.dataset.atriaBindingSlot = slot.id;
            el(doc, 'p', 'workspace-hint', fmt('Used by: ${0}', [slot.tasks.join(', ')]), group);
            if (slot.requiredCapabilities.length) el(doc, 'p', 'workspace-hint', fmt('Required capabilities: ${0}', [slot.requiredCapabilities.join(', ')]), group);
            // Invalid/stale/foreign refs are never handed to the picker as a selection.
            if (!selected(slot)) delete draft[slot.id];
            const picker = mountRuntimeRoutePicker({ parent: group, label: label(slot.id), explicit: true,
                routes: slot.routes.filter(route => route.compatible), value: draft[slot.id],
                change: value => { if (value) draft[slot.id] = value; else delete draft[slot.id]; updateSave(); } });
            pickers.set(slot.id, picker);
            if (slot.error) el(doc, 'p', 'workspace-hint', taskBindingMessage(slot.error), group);
            for (const route of slot.routes.filter(route => !route.compatible)) el(doc, 'p', 'workspace-hint', route.displayName + ': ' + taskBindingMessage(route.error), group);
        }
        const common = report.slots[0]?.routes.filter(route => route.compatible && report.slots.every(slot => slot.routes.some(other => other.compatible && other.runtimeRouteId === route.runtimeRouteId))) ?? [];
        if (report.slots.length > 1 && common.length) mountRuntimeRoutePicker({ parent: content, label: 'Use one route for all purposes', explicit: true, routes: common,
            change: value => { if (!value) return; for (const slot of report.slots) { draft[slot.id] = value; pickers.get(slot.id).setValue(value); } updateSave(); } });
        if (report.slots.some(slot => !slot.routes.some(route => route.compatible))) el(doc, 'p', '', t('No compatible Runtime Route is available. Create or configure a route in Runtime, then return here.'), content);
        controls = el(doc, 'div', 'atri-library-actions', undefined, content);
        button('Configure Runtime Routes', () => host?.openRuntimeSection('routes'));
        button('Refresh Runtime Routes', async () => { const next = await check(draft); if (current()) draw(next); });
        save = button('Save and continue', async () => {
            // Revalidate against current configuration before writing any settings.
            const next = await check(draft); if (!current()) return;
            if (!next.ready) { draw(next); heading.focus(); return; }
            for (const slot of next.slots) setTaskBinding(packageId, slot.id, slot.binding);
            status.textContent = t('Starting experience…');
            await onReady();
            if (current()) { controller.abort(); panel.remove(); }
        });
        save.classList.add('atri-library-button--primary');
        button('Cancel', () => { controller.abort(); panel.remove(); }); updateSave();
    }
    try {
        const next = await check(draft); if (!current()) return false;
        if (next.ready && !force) { controller.abort(); panel.remove(); return true; }
        draw(next); heading.focus();
    } catch {
        if (current()) {
            status.textContent = t('Could not check model purposes. No story was started. Try again.'); status.setAttribute('role', 'alert');
            button('Try again', () => ensureTaskBindings({ document: doc, root, manifest, packageId, packageVersionId, host, onReady, isCurrent, force }).then(ready => { if (ready && isCurrent()) return onReady(); }));
            button('Cancel', () => { controller.abort(); panel.remove(); });
        }
    }
    return false;
}
