import { translateShellText as tl, formatShellText as fmt } from '../atria-shell/localization.js';
import { createAtriaIcon } from '../atria-shell/icons.js';
import { runtimeRequest, runtimeRemediation } from './runtime-client.js';
import { openConnectModelWizard } from './connect-model-wizard.js';

/*
 * Runtime overview (blueprint §4.3): which model does each job, stated per
 * task rather than per configuration object. A route only counts as working
 * after its connection answered a model-list check in this session; saved
 * configuration alone is "not checked", never a green light.
 */
const ROLE_LABELS = { narrator: 'Narrator', intent_resolver: 'Intent resolver', event_interpreter: 'Event interpreter', orchestrator: 'Orchestrator', studio: 'Studio', memory: 'Memory', search: 'Search', illustration_prompt: 'Illustration prompt' };
const OTHER_ROLES = ['intent_resolver', 'event_interpreter', 'orchestrator', 'studio', 'memory', 'search', 'illustration_prompt'];
// Discovery cannot check these transports; their state stays "not checked".
const UNCHECKABLE = new Set(['provider.mcp', 'provider.a2a', 'provider.raw-text']);
const checks = new Map();

export function renderRuntimeOverview({ document: doc, root, data, host, signal, reload }) {
    const el = (tag, className, text, parent) => { const node = doc.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = tl(text); parent?.append(node); return node; };
    const literal = (tag, className, text, parent) => { const node = el(tag, className, undefined, parent); node.textContent = text; return node; };
    const button = (text, action, parent, primary = false) => { const node = el('button', primary ? 'atri-runtime-overview__primary' : '', text, parent); node.type = 'button'; node.addEventListener('click', action); return node; };
    root.replaceChildren();
    const header = el('header', 'atri-runtime-heading', undefined, root);
    el('h2', '', 'Overview', header);
    el('p', 'atri-runtime-description', 'Which model does each job in your stories.', header);

    const fallbackIds = new Set(data.routes.flatMap(item => item.fallbackRouteRefs.map(ref => ref.runtimeRouteId)));
    const primary = role => data.routes.filter(item => item.role === 'role.' + role && !fallbackIds.has(item.runtimeRouteId));
    const modelOf = route => data.models.find(item => item.modelProfileId === route.modelProfileRef?.modelProfileId);
    const connectionOf = (route, model) => data.connections.find(item => item.connectionProfileId === (model?.connectionProfileRef?.connectionProfileId || route.connectionProfileRef?.connectionProfileId));
    const connect = () => openConnectModelWizard({ document: doc, host, onDone: () => reload() });

    const narrator = primary('narrator');
    if (!narrator.length) {
        const empty = el('section', 'atri-runtime-overview__callout', undefined, root);
        const icon = el('span', 'atri-runtime-overview__callout-icon', undefined, empty); icon.append(createAtriaIcon(doc, 'runtime', { size: 22 }));
        const text = el('div', '', undefined, empty);
        el('strong', '', 'No model writes your stories yet', text);
        el('p', '', 'Connect a service such as Anthropic, OpenAI or a model on this computer. It takes about a minute.', text);
        button('Connect a model', connect, empty, true);
    }

    const list = el('section', 'atri-runtime-overview__tasks', undefined, root);
    list.setAttribute('aria-label', tl('Tasks'));
    const row = (role, required, parent) => {
        const routes = primary(role);
        const item = el('article', 'atri-runtime-overview__task', undefined, parent);
        const head = el('div', 'atri-runtime-overview__task-head', undefined, item);
        el('strong', '', ROLE_LABELS[role] || role, head);
        el('span', 'atri-runtime-overview__tag', required ? 'Required to play' : 'Optional', head);
        const detail = el('div', 'atri-runtime-overview__task-detail', undefined, item);
        const actions = el('div', 'atri-runtime-overview__task-actions', undefined, item);
        if (!routes.length) {
            seal(detail, 'missing', 'Not set up');
            if (role === 'narrator') button('Connect a model', connect, actions, true);
            else button('Choose a model…', () => host.openRuntimeSection('routes'), actions);
            return;
        }
        if (routes.length > 1) {
            seal(detail, 'warning', fmt('${0} routes compete for this job', [routes.length]));
            button('Resolve in Routes', () => host.openRuntimeSection('routes'), actions);
            return;
        }
        const route = routes[0], model = modelOf(route), connection = connectionOf(route, model);
        literal('span', 'atri-runtime-overview__model', [model?.displayName || tl('Missing model'), connection?.displayName || tl('Missing connection')].join(' · '), detail);
        const state = el('span', 'atri-runtime-overview__state', undefined, detail);
        if (!model || !connection) { seal(state, 'missing', 'Incomplete — open the route to fix it'); button('Open Routes', () => host.openRuntimeSection('routes'), actions); return; }
        const paint = result => {
            state.replaceChildren();
            if (!result) seal(state, 'unknown', UNCHECKABLE.has(connection.providerAdapter) ? 'Saved · this service cannot be checked here' : 'Saved · not checked yet');
            else if (result.busy) seal(state, 'busy', 'Checking…');
            else if (result.ok && result.offersModel === false) seal(state, 'warning', fmt('Reachable, but it does not list ${0}', [model.remoteModelId]));
            else if (result.ok) seal(state, 'ready', fmt('Reachable · checked ${0}', [new Date(result.at).toLocaleTimeString()]));
            else seal(state, 'error', result.message);
        };
        const run = async () => {
            checks.set(connection.connectionProfileId, { busy: true }); paint({ busy: true }); check.disabled = true;
            try {
                const result = await runtimeRequest('/connections/probe', { method: 'POST', body: connection, signal });
                const offered = Array.isArray(result.models) && result.models.length ? result.models.some(item => item.remoteModelId === model.remoteModelId) : null;
                checks.set(connection.connectionProfileId, { ok: true, offersModel: offered, at: Date.now() });
            } catch (error) {
                if (signal?.aborted) return;
                const [message] = runtimeRemediation(error.code || error.message);
                checks.set(connection.connectionProfileId, { ok: false, message: message || error.message, at: Date.now() });
            }
            if (!item.isConnected) return;
            paint(checks.get(connection.connectionProfileId)); check.disabled = false;
        };
        const check = button('Check', run, actions);
        check.hidden = UNCHECKABLE.has(connection.providerAdapter);
        if (role === 'narrator') button('Change model…', connect, actions);
        button('Edit route', () => host.openRuntimeSection('routes'), actions);
        const known = checks.get(connection.connectionProfileId);
        paint(known?.busy ? null : known);
        // The story model is checked on arrival: one model-list request, no generation.
        if (role === 'narrator' && !known && !check.hidden) void run();
    };
    row('narrator', true, list);
    // Other jobs stay one step away: the story only needs the Narrator.
    const others = el('details', 'atri-runtime-overview__others', undefined, root);
    const configured = OTHER_ROLES.filter(role => primary(role).length).length;
    el('summary', '', fmt('Other jobs · ${0} of ${1} set up', [configured, OTHER_ROLES.length]), others);
    const otherList = el('div', 'atri-runtime-overview__tasks', undefined, others);
    for (const role of OTHER_ROLES) row(role, false, otherList);

    const manage = el('nav', 'atri-runtime-overview__manage', undefined, root);
    manage.setAttribute('aria-label', tl('Detailed setup'));
    el('span', '', 'Detailed setup:', manage);
    for (const [label, section] of [['Connections', 'connections'], ['Models', 'models'], ['Routes', 'routes']]) button(label, () => host.openRuntimeSection(section), manage);
    if (narrator.length) button('Connect another model', connect, manage);

    function seal(parent, tone, text) {
        const node = el('span', 'atri-runtime-overview__seal', undefined, parent); node.dataset.tone = tone;
        const glyph = { ready: 'check', missing: 'unlink', warning: 'warning', error: 'error', unknown: 'unknown', busy: 'clock' }[tone];
        if (glyph) node.append(createAtriaIcon(doc, glyph, { size: 14 }));
        literal('span', '', tl(text), node);
        return node;
    }
}
