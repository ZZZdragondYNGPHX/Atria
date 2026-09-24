import { runtimeRequest } from './runtime-client.js';
import { normalizeRuntimeRouteRef } from './runtime-route-ref.js';
import { translateShellText as tl } from '../atria-shell/localization.js';

export function mountRuntimeRoutePicker({ parent, role, value, change, label = 'Native Runtime Route' }) {
    const doc = parent.ownerDocument;
    const wrap = doc.createElement('label'); wrap.className = 'workspace-inspector-field'; wrap.textContent = tl(label);
    const select = doc.createElement('select'); select.setAttribute('aria-label', tl(label)); wrap.append(select); parent.append(wrap);
    const status = doc.createElement('p'); status.className = 'workspace-hint'; status.setAttribute('role', 'status'); parent.append(status);
    const retry = doc.createElement('button'); retry.type = 'button'; retry.textContent = tl('Refresh Runtime Routes'); parent.append(retry);
    let selected = normalizeRuntimeRouteRef(value);
    let compatibleIds = new Set();
    const fill = routes => {
        select.replaceChildren();
        const option = (id, label) => { const item = doc.createElement('option'); item.value = id; item.textContent = label; select.append(item); };
        option('', tl('Use the role’s primary route'));
        for (const route of routes) option(route.runtimeRouteId, route.displayName + ' · ' + route.runtimeRouteId.slice(-8));
        if (selected && !routes.some(route => route.runtimeRouteId === selected.runtimeRouteId)) {
            option(selected.runtimeRouteId, tl('Unavailable route — retained') + ' · ' + selected.runtimeRouteId.slice(-8));
            status.textContent = tl('The selected route is missing or has a different role. Choose a compatible route before running.');
        }
        select.value = selected?.runtimeRouteId || '';
    };
    fill([]);
    const load = async () => {
        select.disabled = retry.disabled = true; status.textContent = tl('Loading Runtime Routes…');
        try {
            const config = await runtimeRequest('/configuration');
            if (!parent.isConnected) return;
            status.textContent = tl('Select a route configured for this role. Manage routes in Runtime.');
            const routes = config.routes.filter(route => route.role === 'role.' + role);
            compatibleIds = new Set(routes.map(route => route.runtimeRouteId));
            fill(routes); select.disabled = false;
        } catch {
            if (parent.isConnected) status.textContent = tl('Could not load Runtime Routes. Refresh to try again.');
        } finally { retry.disabled = false; }
    };
    select.addEventListener('change', () => {
        selected = select.value ? normalizeRuntimeRouteRef({ scope: 'player', runtimeRouteId: select.value }) : undefined;
        status.textContent = tl(!selected || compatibleIds.has(selected.runtimeRouteId)
            ? 'Select a route configured for this role. Manage routes in Runtime.'
            : 'The selected route is missing or has a different role. Choose a compatible route before running.');
        change(selected);
    });
    retry.addEventListener('click', load); void load();
}
