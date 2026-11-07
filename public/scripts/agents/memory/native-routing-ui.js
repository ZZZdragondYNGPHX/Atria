import { mountMemoryRetrieval } from '../../native/retrieval-picker.js';
import { runtimeRequest, onRuntimeConfigurationChanged } from '../../native/runtime-client.js';
import { formatShellText as fmt, translateShellText as tl } from '../../atria-shell/localization.js';

// Shows which preset does memory work and where to change it.
export function mountMemoryRouting(parent, service) {
    mountMemoryRetrieval(parent, service);
    const doc = parent.ownerDocument;
    const make = (tag, className, text, into) => { const node = doc.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = tl(text); into.append(node); return node; };
    const section = make('section', 'workspace-memory-overview-section', undefined, parent);
    make('h3', '', 'Model for memory', section);
    const status = make('p', 'workspace-hint', 'Loading API presets…', section); status.setAttribute('role', 'status');
    const open = make('button', '', 'Change in Model roles', section); open.type = 'button';
    open.addEventListener('click', () => globalThis.Atria?.shell?.getWorkspaceHost?.()?.openRuntimeSection?.('routes'));
    const load = async () => {
        try {
            const config = await runtimeRequest('/configuration');
            if (!section.isConnected) return;
            const id = config.roleAssignments?.assignments?.['role.memory'];
            const preset = config.routes.find(route => route.runtimeRouteId === id);
            status.textContent = preset ? fmt('Memory extraction and the schema assistant use ${0}.', [preset.displayName])
                : tl('No model is assigned to Memory yet, so memories are not extracted. Choose one in Model roles.');
        } catch {
            if (section.isConnected) status.textContent = tl('Could not load API presets.');
        }
    };
    const stop = onRuntimeConfigurationChanged(() => section.isConnected ? load() : stop());
    void load();
    return () => { stop(); section.remove(); };
}
