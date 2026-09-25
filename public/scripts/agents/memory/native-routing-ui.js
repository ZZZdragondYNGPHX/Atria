import { mountMemoryRetrieval } from '../../native/retrieval-picker.js';
import { MEMORY_ROUTE_TASKS, normalizeMemoryRoutes } from './native-routing.js';
import { mountRuntimeRoutePicker } from '../../native/runtime-route-picker.js';
import { translateShellText as tl } from '../../atria-shell/localization.js';

export function mountMemoryRouting(parent, service) {
    mountMemoryRetrieval(parent, service);
    const doc = parent.ownerDocument;
    const form = doc.createElement('form'); form.className = 'workspace-memory-overview-section'; parent.append(form);
    const heading = doc.createElement('h3'); heading.textContent = tl('Memory Runtime Routes'); form.append(heading);
    const note = doc.createElement('p'); note.className = 'workspace-hint'; note.textContent = tl('Choose an independent route for each Memory task. Empty selections use the memory role’s primary route.'); form.append(note);
    const fields = doc.createElement('fieldset'); fields.className = 'workspace-inspector-section'; fields.setAttribute('aria-label', tl('Memory Runtime Routes')); form.append(fields);
    const draft = normalizeMemoryRoutes(service.getNativeRoutes());
    for (const [task, label] of Object.entries(MEMORY_ROUTE_TASKS)) {
        const section = doc.createElement('div'); section.className = 'workspace-inspector-section'; fields.append(section);
        mountRuntimeRoutePicker({ parent: section, role: 'memory', label, value: draft[task], change: ref => {
            if (ref) draft[task] = ref; else delete draft[task];
        } });
    }
    const save = doc.createElement('button'); save.type = 'submit'; save.textContent = tl('Save Memory routes'); form.append(save);
    const status = doc.createElement('p'); status.className = 'workspace-hint'; status.setAttribute('role', 'status'); form.append(status);
    form.addEventListener('submit', async event => {
        event.preventDefault(); if (save.disabled) return;
        save.disabled = fields.disabled = true; status.setAttribute('role', 'status'); status.textContent = tl('Saving…');
        try {
            await service.setNativeRoutes(normalizeMemoryRoutes(draft));
            if (form.isConnected) status.textContent = tl('Memory routes saved. New requests use these selections.');
        } catch {
            if (form.isConnected) { status.setAttribute('role', 'alert'); status.textContent = tl('Could not save Memory routes. Your selections are still here; retry to save them.'); status.tabIndex = -1; status.focus(); }
        } finally { save.disabled = fields.disabled = false; }
    });
    return () => form.remove();
}
