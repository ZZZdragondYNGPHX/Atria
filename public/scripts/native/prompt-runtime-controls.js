import { el, field, action } from './library-ui.js';
import { runtimeRequest } from './runtime-client.js';
import { validatePromptSelection } from './prompt-parameter-contracts.js';
import { translateShellText as tl } from '../atria-shell/localization.js';

export async function mountPromptRuntimeControls({ document: doc, root, routeId }) {
    const panel = el(doc, 'section', 'atri-prompt-runtime-controls', undefined, root);
    const status = el(doc, 'p', '', tl('Loading Prompt controls…'), panel); status.setAttribute('role', 'status');
    try {
        let { route, definitions } = await runtimeRequest('/prompt-controls/' + encodeURIComponent(routeId));
        if (!panel.isConnected) return;
        status.textContent = tl('Choices apply to this Runtime Route across sessions. Save before previewing or generating.');
        const content = el(doc, 'div', '', undefined, panel);
        let read;
        function draw(values) {
            content.replaceChildren();
            const readers = [];
            try { validatePromptSelection(definitions, values); } catch {
                const warning = el(doc, 'p', '', tl('Saved choices are no longer valid. Restore defaults or select valid values before saving.'), content); warning.setAttribute('role', 'alert');
            }
            for (const [name, definition] of Object.entries(definitions)) {
                const group = el(doc, 'fieldset', 'atri-prompt-runtime-control', undefined, content);
                el(doc, 'legend', '', definition.label || name, group);
                if (definition.description) el(doc, 'p', '', definition.description, group);
                const override = field(doc, group, 'Override default', '', 'checkbox'); override.checked = Object.hasOwn(values, name);
                override.parentElement.classList.add('atri-prompt-toggle');
                const value = override.checked ? values[name] : definition.default;
                const label = el(doc, 'label', '', definition.label || name, group);
                const input = el(doc, definition.options ? 'select' : definition.type === 'json' ? 'textarea' : 'input', '', undefined, label);
                input.setAttribute('aria-label', definition.label || name);
                input.dataset.promptParameter = name;
                if (definition.options) {
                    const empty = el(doc, 'option', '', tl('Choose…'), input); empty.value = '';
                    definition.options.forEach((option, index) => { const item = el(doc, 'option', '', option.label, input); item.value = String(index); });
                    const index = definition.options.findIndex(option => option.value === value); input.value = index < 0 ? '' : String(index);
                } else if (definition.type === 'boolean') { input.type = 'checkbox'; input.checked = value === true; label.classList.add('atri-prompt-toggle'); } else { if (definition.type === 'number') { input.type = 'number'; input.step = 'any'; } input.value = value === undefined ? '' : definition.type === 'json' ? JSON.stringify(value) : String(value); }
                input.disabled = !override.checked;
                override.addEventListener('change', () => { input.disabled = !override.checked; });
                readers.push(() => {
                    if (!override.checked) return [];
                    const selected = definition.options ? definition.options[input.value]?.value : definition.type === 'boolean' ? input.checked
                        : definition.type === 'number' ? (input.value.trim() ? Number(input.value) : NaN) : definition.type === 'json' ? JSON.parse(input.value) : input.value;
                    return [[name, selected]];
                });
                if (value === undefined) el(doc, 'small', '', tl('No authored default. Choose a value if this parameter is required.'), group);
            }
            read = () => validatePromptSelection(definitions, Object.fromEntries(readers.flatMap(reader => reader())));
            if (!Object.keys(definitions).length) el(doc, 'p', '', tl('This Prompt Program has no runtime parameters.'), content);
        }
        draw(route.promptParameters || {});
        const actions = el(doc, 'div', 'atri-runtime-actions', undefined, panel);
        const save = async parameters => {
            content.inert = actions.inert = true;
            try {
                const next = await runtimeRequest('/prompt-controls/' + encodeURIComponent(routeId), { method: 'PUT', body: { expected: route, parameters } });
                route = next;
                status.setAttribute('role', 'status'); status.textContent = tl('Prompt choices saved.');
            } finally { content.inert = actions.inert = false; }
        };
        action(doc, actions, 'Save Prompt choices', async () => {
            try { await save(read()); draw(route.promptParameters || {}); } catch { status.textContent = tl('Could not save choices. Check values or reopen controls to load current settings.'); status.setAttribute('role', 'alert'); }
        });
        action(doc, actions, 'Restore Prompt defaults', async () => {
            try { await save({}); draw({}); } catch { status.textContent = tl('Could not save choices. Check values or reopen controls to load current settings.'); status.setAttribute('role', 'alert'); }
        });
    } catch {
        status.textContent = tl('Prompt controls are unavailable. Check the route and its exact resources, then reopen.'); status.setAttribute('role', 'alert');
    }
}

export async function mountPlayPromptControls(doc, root) {
    const status = el(doc, 'p', '', tl('Loading Prompt controls…'), root);
    try {
        const { routes } = await runtimeRequest('/configuration');
        if (!status.isConnected) return;
        status.textContent = tl('Choose a Runtime Route to adjust its Prompt choices.');
        const label = el(doc, 'label', '', tl('Runtime Route'), root);
        const select = el(doc, 'select', '', undefined, label); select.setAttribute('aria-label', tl('Runtime Route'));
        for (const route of routes) { const option = el(doc, 'option', '', route.displayName, select); option.value = route.runtimeRouteId; }
        const fallbackIds = new Set(routes.flatMap(route => route.fallbackRouteRefs.map(ref => ref.runtimeRouteId)));
        const primary = routes.filter(route => route.role === 'role.narrator' && !fallbackIds.has(route.runtimeRouteId));
        if (primary.length === 1) select.value = primary[0].runtimeRouteId;
        const content = el(doc, 'div', '', undefined, root);
        const render = () => { content.replaceChildren(); if (select.value) void mountPromptRuntimeControls({ document: doc, root: content, routeId: select.value }); };
        select.addEventListener('change', render); render();
        if (!routes.length) status.textContent = tl('Create a route before compiling a preview.');
    } catch { status.textContent = tl('Prompt controls are unavailable. Check the route and its exact resources, then reopen.'); status.setAttribute('role', 'alert'); }
}
