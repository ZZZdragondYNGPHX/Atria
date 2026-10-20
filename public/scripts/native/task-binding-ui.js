import { runtimeRequest } from './runtime-client.js';
import { getTaskBindings, setTaskBinding } from './task-bindings.js';
import { mountRuntimeRoutePicker } from './runtime-route-picker.js';
import { el } from './library-ui.js';
import { translateShellText as t, formatShellText as fmt } from '../atria-shell/localization.js';

const setups = new WeakMap();
const label = id => id.replace(/[._-]+/g, ' ').replace(/\b[a-z]/g, value => value.toUpperCase());
export const isTaskBindingFailure = errors => (errors ?? []).some(error => /native_task_binding_missing|generation_capability_(unsupported|unknown)|native_generation_route_(missing|ambiguous)/.test(error));
export function taskBindingMessage(code) {
    if (code === 'generation_capability_unsupported') return t('This route does not support the capabilities required by this purpose.');
    if (code === 'generation_capability_unknown') return t('This route has no verified support for the capabilities required by this purpose.');
    if (code === 'native_generation_route_ambiguous') return t('Several primary routes match this role. Assign distinct roles or link alternatives as fallbacks.');
    if (code === 'native_generation_route_missing') return t('No route is configured for this role. Create a route with an exact Model, Generation and Prompt.');
    if (code === 'native_task_binding_missing') return t('Select an available API preset for this purpose.');
    return t('This API preset is unavailable. Check its connection, model and parameters in Runtime.');
}

// A transient first-party editor over settings, not a Package API or new store.
// Returns true only when the exact Package already has complete valid bindings.
export async function ensureTaskBindings({ document: doc, root, manifest, packageId, packageVersionId,
    host = globalThis.Atria?.shell?.getWorkspaceHost?.(), onReady, isCurrent = () => true, force = false }) {
    setups.get(root)?.abort(); root.replaceChildren();
    const taskRuntime = manifest?.runtime?.experienceContract?.taskRuntime;
    if (!taskRuntime?.tasks?.length && !taskRuntime?.turn) return true;
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
            try { await handler(); } catch { if (current()) { status.textContent = t('Could not complete model setup. Refresh the API presets and try again.'); status.setAttribute('role', 'alert'); } } finally { busy = false; panel.removeAttribute('aria-busy'); if (current()) { content.querySelectorAll('button, select').forEach(item => { item.disabled = false; }); updateSave(); } }
        }); return node;
    }
    let save; let report;
    const selected = slot => slot.routes.some(route => route.compatible && draft[slot.id]?.scope === 'player' && route.runtimeRouteId === draft[slot.id]?.runtimeRouteId);
    function updateSave() {
        const missing = report.slots.filter(slot => !selected(slot));
        const missingTurns = (report.turnRoutes ?? []).some(route => route.error);
        if (save) save.disabled = busy || Boolean(missing.length) || missingTurns;
        if (!busy) status.textContent = missing.length ? fmt('This work needs ${0} model purposes configured before it can start: ${1}.', [missing.length, missing.map(slot => t(label(slot.id))).join(', ')])
            : missingTurns ? t('Configure the required turn routes before continuing.') : t('Model purposes are ready. You can review your API presets before continuing.');
    }
    function draw(next) {
        report = next; content.replaceChildren();
        status.setAttribute('role', 'status');
        const missing = report.slots.filter(slot => slot.error);
        const missingRoles = (report.turnRoutes ?? []).filter(route => route.error);
        status.textContent = missing.length
            ? fmt('This work needs ${0} model purposes configured before it can start: ${1}.', [missing.length, missing.map(slot => t(label(slot.id))).join(', ')])
            : missingRoles.length ? t('Configure the required turn routes before continuing.')
                : t('Model purposes are ready. You can review your API presets before continuing.');
        for (const route of missingRoles) {
            const group = el(doc, 'div', 'atri-library-section', undefined, content); group.dataset.atriaTurnRoute = route.role;
            const roleName = route.role === 'intent_resolver' ? t('Intent resolver') : t('Narrator');
            el(doc, 'p', 'workspace-hint', roleName + ': ' + taskBindingMessage(route.error), group);
            if (route.requiredCapabilities.length) el(doc, 'p', 'workspace-hint', fmt('Required capabilities: ${0}', [route.requiredCapabilities.join(', ')]), group);
        }
        const pickers = new Map();
        el(doc, 'p', 'workspace-hint', t('Choose an API preset for each purpose. Model and generation parameters come from that preset; prompt text comes from this work.'), content);
        for (const slot of report.slots) {
            const group = el(doc, 'div', 'atri-library-section', undefined, content); group.dataset.atriaBindingSlot = slot.id;
            el(doc, 'p', 'workspace-hint', fmt('Used by: ${0}', [slot.tasks.join(', ')]), group);
            if (slot.requiredCapabilities.length) el(doc, 'p', 'workspace-hint', fmt('Required capabilities: ${0}', [slot.requiredCapabilities.join(', ')]), group);
            // Invalid/stale/foreign refs are never handed to the picker as a selection.
            if (!selected(slot)) delete draft[slot.id];
            const picker = mountRuntimeRoutePicker({ parent: group, label: label(slot.id), explicit: true,
                routes: slot.routes.filter(route => route.compatible), value: draft[slot.id],
                change: value => { if (value) draft[slot.id] = value; else delete draft[slot.id]; describe(); updateSave(); } });
            const summary = el(doc, 'p', 'workspace-hint', '', group);
            let warning;
            function describe() {
                const route = slot.routes.find(item => item.runtimeRouteId === draft[slot.id]?.runtimeRouteId);
                summary.textContent = route?.modelName ? fmt('Model: ${0} · output budget: ${1}', [route.modelName, route.outputTokens]) : '';
                if (route?.reasoning && Object.keys(route.reasoning).length) summary.textContent += ' · ' + fmt('Thinking: ${0}', [Object.values(route.reasoning).join(' / ')]);
                if (warning) warning.hidden = selected(slot);
            }
            describe(); picker.select.addEventListener('change', describe);
            pickers.set(slot.id, picker);
            if (slot.error) warning = el(doc, 'p', 'workspace-hint', taskBindingMessage(slot.error), group);
            describe();
            for (const route of slot.routes.filter(route => !route.compatible)) el(doc, 'p', 'workspace-hint', route.displayName + ': ' + taskBindingMessage(route.error), group);
        }
        const common = report.slots[0]?.routes.filter(route => route.compatible && report.slots.every(slot => slot.routes.some(other => other.compatible && other.runtimeRouteId === route.runtimeRouteId))) ?? [];
        if (report.slots.length > 1 && common.length) mountRuntimeRoutePicker({ parent: content, label: 'Use one API preset for all purposes', explicit: true, routes: common,
            change: value => { if (!value) return; for (const slot of report.slots) { draft[slot.id] = value; const picker = pickers.get(slot.id); picker.setValue(value); picker.select.dispatchEvent(new doc.defaultView.Event('change')); } updateSave(); } });
        if (report.slots.some(slot => !slot.routes.some(route => route.compatible))) el(doc, 'p', '', t('No compatible API preset is available. Create or configure one in Runtime, then return here.'), content);
        controls = el(doc, 'div', 'atri-library-actions', undefined, content);
        button('Configure API presets', () => host?.openRuntimeRepair
            ? host.openRuntimeRepair('routes', async () => { if (!current()) return; const next = await check(draft); if (current()) { draw(next); heading.focus(); } })
            : host?.openRuntimeSection('routes'));
        button('Refresh API presets', async () => { const next = await check(draft); if (current()) draw(next); });
        save = button('Save and continue', async () => {
            // Revalidate against current configuration before writing any settings.
            const next = await check(draft); if (!current()) return;
            if (!next.ready) { draw(next); heading.focus(); return; }
            const previous = getTaskBindings(packageId);
            for (const slot of next.slots) setTaskBinding(packageId, slot.id, slot.binding);
            // Frontend actions resolve bindings on the server. Finish the same
            // settings write before mounting, instead of racing its debounce.
            try { if (await globalThis.Atria.getContext().saveSettings() === false) throw new Error('Settings were not persisted'); } catch (error) {
                globalThis.Atria.getContext().capabilitySettings.atri_task_bindings[packageId] = previous;
                throw error;
            }
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
