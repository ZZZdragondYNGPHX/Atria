import { mountMemoryRetrieval } from '../../native/retrieval-picker.js';
import { MEMORY_ROUTE_TASKS, normalizeMemoryRoutes } from './native-routing.js';
import { mountRuntimeRoutePicker } from '../../native/runtime-route-picker.js';
import { runtimeRequest } from '../../native/runtime-client.js';
import { translateShellText as tl } from '../../atria-shell/localization.js';

// Which API preset each memory task uses. One list load feeds every picker.
export function mountMemoryRouting(parent, service) {
    mountMemoryRetrieval(parent, service);
    const doc = parent.ownerDocument;
    const make = (tag, className, text, into) => { const node = doc.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = tl(text); into.append(node); return node; };
    const form = make('form', 'workspace-memory-overview-section', undefined, parent);
    make('h3', '', 'Models for memory tasks', form);
    make('p', 'workspace-hint', 'Leave a task on Default to use the API preset whose purpose is Memory. Changes save right away.', form);
    const fields = make('fieldset', 'workspace-memory-fields', undefined, form); fields.setAttribute('aria-label', tl('Models for memory tasks'));
    const status = make('p', 'workspace-hint', undefined, form); status.setAttribute('role', 'status');
    const actions = make('div', 'workspace-memory-form-actions', undefined, form);
    const refresh = make('button', '', 'Reload list', actions); refresh.type = 'button';
    // Choosing saves; the submit button stays only as the form's submit target.
    const save = make('button', '', 'Save', actions); save.type = 'submit'; save.hidden = true;
    const draft = normalizeMemoryRoutes(service.getNativeRoutes());
    const draw = routes => {
        fields.replaceChildren();
        for (const [task, label] of Object.entries(MEMORY_ROUTE_TASKS)) {
            mountRuntimeRoutePicker({ parent: fields, role: 'memory', label, value: draft[task], routes, change: ref => {
                if (ref) draft[task] = ref; else delete draft[task];
                form.requestSubmit();
            } });
        }
    };
    const load = async () => {
        fields.disabled = refresh.disabled = save.disabled = true; status.setAttribute('role', 'status'); status.textContent = tl('Loading API presets…');
        try {
            const config = await runtimeRequest('/configuration');
            if (!form.isConnected) return;
            const routes = config.routes.filter(route => route.role === 'role.memory');
            draw(routes);
            status.textContent = tl(routes.length ? '' : 'No API preset has Memory as its purpose yet. Open an API preset in Runtime → Models and set its purpose under Advanced.');
            save.disabled = false;
        } catch {
            if (form.isConnected) { status.setAttribute('role', 'alert'); status.textContent = tl('Could not load API presets. Reload the list to try again.'); }
        } finally { fields.disabled = refresh.disabled = false; }
    };
    refresh.addEventListener('click', load);
    form.addEventListener('submit', async event => {
        event.preventDefault(); if (save.disabled) return;
        save.disabled = fields.disabled = true; save.setAttribute('aria-busy', 'true'); status.setAttribute('role', 'status'); status.textContent = tl('Saving…');
        try {
            await service.setNativeRoutes(normalizeMemoryRoutes(draft));
            if (form.isConnected) status.textContent = tl('Saved. New memory requests use these models.');
        } catch {
            if (form.isConnected) { status.setAttribute('role', 'alert'); status.textContent = tl('Could not save. Your choices are kept; try again.'); status.tabIndex = -1; status.focus(); }
        } finally { save.disabled = fields.disabled = false; save.removeAttribute('aria-busy'); }
    });
    draw([]); void load();
    return () => form.remove();
}
