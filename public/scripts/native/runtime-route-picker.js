import { runtimeRequest } from './runtime-client.js';
import { normalizeRuntimeRouteRef } from './runtime-route-ref.js';
import { translateShellText as tl } from '../atria-shell/localization.js';

export function mountRuntimeRoutePicker({ parent, role, value, change, label = 'API preset', routes: suppliedRoutes, explicit = false }) {
    const doc = parent.ownerDocument;
    const wrap = doc.createElement('label'); wrap.className = 'workspace-inspector-field'; wrap.textContent = tl(label);
    if (explicit) wrap.classList.add('atri-library-field');
    const select = doc.createElement('select'); select.setAttribute('aria-label', tl(label)); wrap.append(select); parent.append(wrap);
    const status = doc.createElement('p'); status.className = 'workspace-hint'; status.setAttribute('role', 'status'); parent.append(status);
    const retry = doc.createElement('button'); retry.type = 'button'; retry.textContent = tl('Refresh API presets'); parent.append(retry);
    let selected = normalizeRuntimeRouteRef(value);
    let compatibleIds = new Set();
    const fill = routes => {
        select.replaceChildren();
        const option = (id, label) => { const item = doc.createElement('option'); item.value = id; item.textContent = label; select.append(item); };
        option('', tl(explicit ? 'Choose an API preset…' : 'Use the default API preset for this purpose'));
        for (const route of routes) option(route.runtimeRouteId, route.displayName);
        if (!explicit && selected && !routes.some(route => route.runtimeRouteId === selected.runtimeRouteId)) {
            option(selected.runtimeRouteId, tl('Unavailable API preset — retained') + ' · ' + selected.runtimeRouteId.slice(-8));
            status.textContent = tl('The selected API preset is unavailable for this purpose. Choose another before running.');
        }
        select.value = selected?.runtimeRouteId || '';
    };
    fill([]);
    const load = async () => {
        select.disabled = retry.disabled = true; status.textContent = tl('Loading API presets…');
        try {
            const config = await runtimeRequest('/configuration');
            if (!parent.isConnected) return;
            status.textContent = tl('Choose an API preset. Edit its model and parameters in Runtime.');
            const routes = config.routes.filter(route => route.role === 'role.' + role);
            compatibleIds = new Set(routes.map(route => route.runtimeRouteId));
            fill(routes); select.disabled = false;
        } catch {
            if (parent.isConnected) status.textContent = tl('Could not load API presets. Refresh to try again.');
        } finally { retry.disabled = false; }
    };
    select.addEventListener('change', () => {
        selected = select.value ? normalizeRuntimeRouteRef({ scope: 'player', runtimeRouteId: select.value }) : undefined;
        status.textContent = tl(!selected || compatibleIds.has(selected.runtimeRouteId)
            ? 'Choose an API preset. Edit its model and parameters in Runtime.'
            : 'The selected API preset is unavailable for this purpose. Choose another before running.');
        change(selected);
    });
    retry.addEventListener('click', load);
    if (suppliedRoutes) {
        retry.remove(); status.remove();
        compatibleIds = new Set(suppliedRoutes.map(route => route.runtimeRouteId)); fill(suppliedRoutes);
    } else void load();
    return { setValue(value) { selected = normalizeRuntimeRouteRef(value); select.value = selected?.runtimeRouteId || ''; }, select };
}
