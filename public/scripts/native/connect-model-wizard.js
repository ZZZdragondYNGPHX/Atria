import { translateShellText as tl, formatShellText as fmt } from '../atria-shell/localization.js';
import { createAtriaIcon } from '../atria-shell/icons.js';
import { runtimeRequest, runtimeRemediation } from './runtime-client.js';
import { connectionRequiresSecret } from '../../shared/native-connection-auth.js';
import { NATIVE_GENERATION_DEFAULTS as defaults } from '../../shared/native-generation-defaults.js';
import { newPromptPreset } from './prompt-templates.js';

/*
 * Connect a model (blueprint §4.2): one guided path through the existing
 * Runtime authorities — Secret store, Connection, credential destination
 * review, provider model discovery, Model and the Narrator Route. Every write
 * goes to the original endpoint; nothing here is a second configuration store.
 * Listing models proves the key and destination work without a paid generation.
 */
export const MODEL_SERVICES = Object.freeze([
    { id: 'anthropic', name: 'Anthropic', note: 'Claude models · API key', adapter: 'provider.anthropic', endpoint: 'https://api.anthropic.com/v1/messages', keyUrl: 'https://console.anthropic.com/settings/keys' },
    { id: 'openai', name: 'OpenAI', note: 'GPT models · API key', adapter: 'provider.openai-compatible', endpoint: 'https://api.openai.com/v1/chat/completions', keyUrl: 'https://platform.openai.com/api-keys' },
    { id: 'google', name: 'Google', note: 'Gemini models · API key', adapter: 'provider.gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta', keyUrl: 'https://aistudio.google.com/apikey' },
    { id: 'openrouter', name: 'OpenRouter', note: 'Many providers · one API key', adapter: 'provider.openai-compatible', endpoint: 'https://openrouter.ai/api/v1/chat/completions', keyUrl: 'https://openrouter.ai/keys' },
    { id: 'deepseek', name: 'DeepSeek', note: 'DeepSeek models · API key', adapter: 'provider.openai-compatible', endpoint: 'https://api.deepseek.com/v1/chat/completions', keyUrl: 'https://platform.deepseek.com/api_keys' },
    { id: 'local', name: 'On this computer', note: 'Ollama, LM Studio · no key', adapter: 'provider.openai-compatible', endpoint: 'http://127.0.0.1:11434/v1/chat/completions', local: true },
    { id: 'custom', name: 'Other compatible service', note: 'Any OpenAI-compatible endpoint', adapter: 'provider.openai-compatible', endpoint: '', custom: true },
]);

const uid = prefix => prefix + '_' + crypto.randomUUID().replaceAll('-', '');
const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
    : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);
async function digest(value) {
    const bytes = new TextEncoder().encode(canonical(value));
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
const reason = error => (error?.code ? runtimeRemediation(error.code)[0] : '') || error?.message || String(error);

/**
 * @param {{ document?: Document, host?: object, onDone?: (receipt: object) => void }} options
 * @returns {{ close: () => void }}
 */
export function openConnectModelWizard({ document: doc = globalThis.document, host = null, onDone = null } = {}) {
    const returnFocus = doc.activeElement;
    const dialog = doc.createElement('dialog');
    dialog.className = 'atria-onboard';
    dialog.setAttribute('aria-labelledby', 'atria-onboard-title');
    const el = (tag, className, text, parent) => { const node = doc.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = tl(text); parent?.append(node); return node; };
    const literal = (tag, className, text, parent) => { const node = el(tag, className, undefined, parent); node.textContent = text; return node; };
    const head = el('header', 'atria-onboard__head', undefined, dialog);
    const steps = el('ol', 'atria-onboard__steps', undefined, head);
    steps.setAttribute('aria-label', tl('Steps'));
    const stepItems = ['Service', 'Key', 'Model'].map(label => el('li', '', label, steps));
    const closeButton = el('button', 'atria-onboard__close', undefined, head); closeButton.type = 'button';
    closeButton.setAttribute('aria-label', tl('Close')); closeButton.append(createAtriaIcon(doc, 'close', { size: 18 }));
    const title = el('h2', 'atria-onboard__title', 'Connect a model', dialog); title.id = 'atria-onboard-title'; title.tabIndex = -1;
    const lead = el('p', 'atria-onboard__lead', '', dialog);
    const body = el('div', 'atria-onboard__body', undefined, dialog);
    const status = el('p', 'atria-onboard__status', undefined, dialog); status.hidden = true;
    const foot = el('footer', 'atria-onboard__foot', undefined, dialog);
    const back = el('button', 'atria-onboard__button', 'Back', foot); back.type = 'button';
    el('span', 'atria-onboard__spacer', undefined, foot);
    const next = el('button', 'atria-onboard__button atria-onboard__button--primary', 'Continue', foot); next.type = 'button';

    // Everything created so far, so a later failure never repeats or hides earlier writes.
    const state = { service: null, endpoint: '', key: '', secretId: '', connection: null, review: null, models: [], model: null, manualModel: '', receipt: [] };
    let step = 'service', busy = false, closed = false, renderToken = 0;

    function report(message, tone = '') { status.hidden = !message; status.textContent = message ? tl(message) : ''; status.dataset.tone = tone; status.setAttribute('role', tone === 'danger' ? 'alert' : 'status'); }
    function setBusy(value, label) {
        busy = value; next.disabled = value || next.dataset.blocked === 'true'; back.disabled = value;
        if (value) { next.setAttribute('aria-busy', 'true'); if (label) report(label); } else next.removeAttribute('aria-busy');
    }
    function block(blocked) { next.dataset.blocked = String(blocked); next.disabled = busy || blocked; }
    function close() {
        if (closed) return; closed = true; renderToken++;
        dialog.close(); dialog.remove();
        if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    }
    dialog.addEventListener('cancel', event => { event.preventDefault(); if (!busy) close(); });
    closeButton.addEventListener('click', () => { if (!busy) close(); });

    function show(nextStep) {
        step = nextStep; renderToken++; body.replaceChildren(); report(''); block(false);
        const index = { service: 0, key: 1, review: 1, model: 2, done: 3 }[step];
        stepItems.forEach((item, position) => { item.dataset.state = position < index ? 'done' : position === index ? 'current' : 'next'; item.setAttribute('aria-current', String(position === index)); });
        back.hidden = step === 'service' || step === 'done';
        ({ service: renderService, key: renderKey, review: renderReview, model: renderModel, done: renderDone })[step]();
        // An unchosen list starts at the title, so no card looks pre-selected.
        const focusTarget = body.querySelector('[data-autofocus]') || (step === 'service' ? title : body.querySelector('button, input, select'));
        focusTarget?.focus({ preventScroll: true });
    }

    function renderService() {
        lead.textContent = tl('Choose where your stories are written. You can add more services later in Runtime.');
        next.textContent = tl('Continue');
        const grid = el('div', 'atria-onboard__services', undefined, body);
        grid.setAttribute('role', 'radiogroup'); grid.setAttribute('aria-label', tl('Service'));
        for (const service of MODEL_SERVICES) {
            const card = el('button', 'atria-onboard__service', undefined, grid); card.type = 'button';
            card.setAttribute('role', 'radio'); card.setAttribute('aria-checked', String(state.service?.id === service.id));
            el('strong', '', service.name, card); el('span', '', service.note, card);
            card.addEventListener('click', () => { state.service = service; state.endpoint = service.endpoint; for (const item of grid.children) item.setAttribute('aria-checked', String(item === card)); block(false); });
            card.addEventListener('dblclick', () => { if (!busy) next.click(); });
        }
        if (state.service) grid.querySelector('[aria-checked="true"]')?.setAttribute('data-autofocus', '');
        block(!state.service);
    }

    function field(label, input, hint) {
        const wrap = el('label', 'atria-onboard__field', undefined, body);
        el('span', 'atria-onboard__label', label, wrap); wrap.append(input);
        if (hint) el('span', 'atria-onboard__hint', hint, wrap);
        return input;
    }
    function renderKey() {
        const service = state.service;
        lead.textContent = service.local
            ? tl('Start Ollama or LM Studio first. Atria sends requests only to the address below.')
            : service.custom ? tl('Enter the service address and its API key. Atria keeps the key in the local Secret store and never shows it again.')
                : fmt('Paste your ${0} API key. Atria keeps it in the local Secret store and never shows it again.', [service.name]);
        next.textContent = tl('Continue');
        if (service.custom || service.local) {
            const endpoint = field(service.local ? 'Local address' : 'Endpoint URL', el('input', 'atria-onboard__input'),
                'The full …/v1/chat/completions URL. No key, query or # in the address.');
            endpoint.type = 'url'; endpoint.value = state.endpoint; endpoint.dataset.autofocus = '';
            endpoint.placeholder = 'https://…/v1/chat/completions';
            endpoint.addEventListener('input', () => { state.endpoint = endpoint.value.trim(); sync(); });
            if (service.local) {
                const presets = el('div', 'atria-onboard__chips', undefined, body);
                for (const [label, url] of [['Ollama', 'http://127.0.0.1:11434/v1/chat/completions'], ['LM Studio', 'http://127.0.0.1:1234/v1/chat/completions']]) {
                    const chip = literal('button', 'atria-onboard__chip', label, presets); chip.type = 'button';
                    chip.addEventListener('click', () => { endpoint.value = url; state.endpoint = url; sync(); });
                }
            }
        }
        let key = null;
        if (!service.local) {
            key = field('API key', el('input', 'atria-onboard__input'), service.custom ? 'If the service needs no key, enter any placeholder text; OpenAI-compatible requests always send one.' : undefined);
            key.type = 'password'; key.autocomplete = 'off'; key.spellcheck = false; key.value = state.key;
            if (!service.custom) key.dataset.autofocus = '';
            key.addEventListener('input', () => { state.key = key.value.trim(); sync(); });
            if (service.keyUrl) {
                const link = literal('a', 'atria-onboard__link', fmt('Get a key from ${0}', [service.name]), body);
                link.href = service.keyUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
            }
        }
        if (state.connection) el('p', 'atria-onboard__hint', 'Changing these details saves the same connection again and needs a new destination review.', body);
        const sync = () => block(!(state.endpoint && (service.local || state.key || state.secretId || !connectionRequiresSecret(service.adapter))));
        sync();
    }

    // Store the key, save the connection, then read its credential destination.
    async function saveConnection() {
        const service = state.service;
        if (!state.secretId || state.key) {
            const value = state.key || (service.local ? 'local' : '');
            if (value || connectionRequiresSecret(service.adapter)) {
                const stored = await runtimeRequest('/secrets', { method: 'POST', body: { label: service.local ? tl('Local service (no key)') : fmt('${0} key', [service.custom ? new URL(state.endpoint).host : service.name]), value } });
                state.secretId = stored.secretId; state.key = '';
                state.receipt.push({ kind: 'Secret', label: stored.label });
            }
        }
        const profile = { schemaVersion: 1, scope: 'player', connectionProfileId: state.connection?.connectionProfileId || uid('conn'),
            displayName: service.custom ? (new URL(state.endpoint).host) : service.name, providerAdapter: service.adapter, transport: 'transport.http', endpoint: state.endpoint,
            // No adapter options: model discovery accepts only plain connections, and streaming
            // already follows the generation profile default.
            options: {},
            ...(state.secretId ? { secretRef: { scope: 'player', secretId: state.secretId } } : {}) };
        await runtimeRequest('/configuration/connections', { method: 'PUT', body: profile });
        const configuration = await runtimeRequest('/configuration');
        state.connection = configuration.connections.find(item => item.connectionProfileId === profile.connectionProfileId) || profile;
        if (!state.receipt.some(item => item.kind === 'Connection')) state.receipt.push({ kind: 'Connection', label: state.connection.displayName });
        if (!state.secretId) return null;
        const review = await runtimeRequest('/connections/credential-target/inspect', { method: 'POST', body: { connectionProfileId: state.connection.connectionProfileId } });
        if (review.connectionFingerprint !== await digest(state.connection) || review.targetFingerprint !== await digest(review.target))
            throw new Error(tl('The saved connection changed while it was being reviewed. Try again.'));
        return review;
    }

    function renderReview() {
        const { review, service } = state;
        lead.textContent = tl('Before anything is sent, confirm where this key may go. Checking this box is the only thing that allows it.');
        next.textContent = tl('Allow and continue');
        const card = el('div', 'atria-onboard__destination', undefined, body);
        const icon = el('span', 'atria-onboard__destination-icon', undefined, card); icon.append(createAtriaIcon(doc, 'shield', { size: 20 }));
        const text = el('div', '', undefined, card);
        literal('strong', '', review.target.origin || review.target.endpoint, text);
        literal('span', 'atria-onboard__mono', review.target.endpoint, text);
        el('span', '', review.target.local ? 'A service on this computer or your local network.' : 'A public service on the internet.', text);
        const consent = el('label', 'atria-onboard__consent', undefined, body);
        const box = el('input', '', undefined, consent); box.type = 'checkbox'; box.dataset.autofocus = '';
        literal('span', '', review.target.local
            ? tl('Allow Atria to send this key to this local service')
            : fmt('Allow Atria to send my ${0} key to ${1}', [service.name, new URL(review.target.endpoint).host]), consent);
        el('p', 'atria-onboard__hint', 'This permission covers only this exact address. Editing the connection later asks again.', body);
        if (review.authorized) { box.checked = true; box.disabled = true; el('p', 'atria-onboard__hint', 'This exact destination is already allowed.', body); }
        const sync = () => block(!box.checked);
        box.addEventListener('change', sync); sync();
        state.allowBox = box;
    }

    async function authorize() {
        const { review } = state;
        if (review.authorized) return;
        await runtimeRequest('/connections/credential-target/authorize', { method: 'POST', body: { connectionProfileId: state.connection.connectionProfileId,
            expectedFingerprint: review.connectionFingerprint, expectedTargetFingerprint: review.targetFingerprint, expectedPermitFingerprint: review.permitFingerprint,
            ...(review.target.local ? { allowLocal: true } : {}) } });
        state.receipt.push({ kind: 'Permission', label: review.target.origin || review.target.endpoint });
    }

    function renderModel() {
        lead.textContent = tl('Pick the model that writes your stories. Listing models sends no story text and starts no generation.');
        next.textContent = tl('Finish');
        const token = renderToken;
        const search = field('Search models', el('input', 'atria-onboard__input')); search.type = 'search'; search.dataset.autofocus = '';
        const list = el('div', 'atria-onboard__models', undefined, body); list.setAttribute('role', 'radiogroup'); list.setAttribute('aria-label', tl('Model'));
        const manualWrap = el('details', 'atria-onboard__manual', undefined, body);
        el('summary', '', 'Enter a model ID instead', manualWrap);
        const manual = el('input', 'atria-onboard__input', undefined, manualWrap); manual.value = state.manualModel; manual.setAttribute('aria-label', tl('Model ID'));
        manual.addEventListener('input', () => { state.manualModel = manual.value.trim(); if (state.manualModel) { state.model = null; paint(); } sync(); });
        const sync = () => block(!(state.model || state.manualModel));
        const paint = () => {
            list.replaceChildren();
            const query = search.value.trim().toLowerCase();
            const shown = state.models.filter(item => (item.remoteModelId + ' ' + (item.displayName || '')).toLowerCase().includes(query)).slice(0, 200);
            for (const item of shown) {
                const row = el('button', 'atria-onboard__model', undefined, list); row.type = 'button'; row.setAttribute('role', 'radio');
                row.setAttribute('aria-checked', String(state.model?.remoteModelId === item.remoteModelId));
                literal('strong', '', item.displayName || item.remoteModelId, row);
                const meta = [item.remoteModelId !== item.displayName ? item.remoteModelId : '', item.limits?.contextTokens ? fmt('${0} context tokens', [item.limits.contextTokens.toLocaleString()]) : ''].filter(Boolean).join(' · ');
                if (meta) literal('span', '', meta, row);
                row.addEventListener('click', () => { state.model = item; state.manualModel = ''; manual.value = ''; paint(); sync(); });
            }
            if (state.models.length && !shown.length) el('p', 'atria-onboard__hint', 'No model matches this search.', list);
            if (state.models.length > shown.length && shown.length === 200) el('p', 'atria-onboard__hint', fmt('Showing 200 of ${0}. Search to narrow the list.', [state.models.length]), list);
        };
        search.addEventListener('input', paint);
        sync();
        if (state.models.length) { paint(); return; }
        setBusy(true, 'Asking the service for its models…');
        runtimeRequest('/connections/probe', { method: 'POST', body: state.connection }).then(result => {
            if (token !== renderToken || closed) return;
            state.models = Array.isArray(result.models) ? result.models : [];
            report(state.models.length ? '' : 'The service is reachable but listed no models. Enter a model ID instead.');
            if (!state.models.length) manualWrap.open = true;
            paint();
        }, error => {
            if (token !== renderToken || closed) return;
            report(fmt('Could not list models: ${0} You can go back to check the address and key, or enter a model ID.', [reason(error)]), 'danger');
            manualWrap.open = true;
        }).finally(() => { if (token === renderToken) setBusy(false); sync(); });
    }

    // Model, the reading preset and the Narrator Route, in that order.
    async function finish() {
        const connectionRef = { scope: 'player', connectionProfileId: state.connection.connectionProfileId };
        const chosen = state.model || { remoteModelId: state.manualModel, displayName: state.manualModel, limits: {}, capabilities: [], provenance: [] };
        const discovered = list => list.some(item => item.kind === 'provider-discovery') ? list : [{ kind: 'user-override', source: 'Connect a model' }];
        const model = { schemaVersion: 1, scope: 'player', modelProfileId: uid('model'), displayName: chosen.displayName || chosen.remoteModelId,
            connectionProfileRef: connectionRef, remoteModelId: chosen.remoteModelId,
            limits: { contextTokens: chosen.limits?.contextTokens || defaults.contextTokens, outputTokens: chosen.limits?.outputTokens || defaults.outputTokens },
            tokenizer: { encoding: 'cl100k_base', source: 'user' },
            limitProvenance: { contextTokens: chosen.limits?.contextTokens ? discovered(chosen.provenance || []) : [{ kind: 'user-override', source: 'Connect a model' }],
                outputTokens: chosen.limits?.outputTokens ? discovered(chosen.provenance || []) : [{ kind: 'user-override', source: 'Connect a model' }] },
            capabilities: Array.isArray(chosen.capabilities) ? chosen.capabilities : [] };
        // A retried Finish reuses what an earlier attempt already saved.
        if (state.savedModel?.remoteModelId === model.remoteModelId) model.modelProfileId = state.savedModel.modelProfileId;
        else {
            await runtimeRequest('/configuration/models', { method: 'PUT', body: model });
            state.savedModel = model;
            state.receipt.push({ kind: 'Model', label: model.displayName });
        }

        let configuration = await runtimeRequest('/configuration');
        const isTemplate = item => item.preset && item.resourceType === 'core.prompt-program' && !item.archived && (item.provenance || []).some?.(entry => entry.ref === 'native.prompt.v1:roleplay');
        let preset = configuration.resources.find(isTemplate) || configuration.resources.find(item => item.preset && item.resourceType === 'core.prompt-program' && !item.archived && item.displayName === 'Roleplay / narrative');
        if (!preset) {
            const created = await runtimeRequest('/presets', { method: 'POST', body: { preset: newPromptPreset('roleplay'), importing: false } });
            configuration = await runtimeRequest('/configuration');
            preset = configuration.resources.find(item => item.preset && item.resourceId === created.presetId);
            if (!preset) throw new Error(tl('The reading preset was created but could not be read back. Open Runtime › Routes to finish.'));
            state.receipt.push({ kind: 'Prompt preset', label: tl('Roleplay / narrative') });
        }
        const promptProgramRef = { scope: 'library', resourceType: 'core.prompt-program', resourceId: preset.resourceId, revision: preset.currentRevision };
        const generationProfileRef = preset.preset.refs.find(ref => ref.resourceType === 'core.generation-profile');
        const fallbackIds = new Set(configuration.routes.flatMap(item => item.fallbackRouteRefs.map(ref => ref.runtimeRouteId)));
        const existing = configuration.routes.find(item => item.role === 'role.narrator' && !fallbackIds.has(item.runtimeRouteId));
        // An existing Narrator Route keeps its prompt; only its model changes.
        const route = existing
            ? { ...existing, modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId }, connectionProfileRef: connectionRef }
            : { schemaVersion: 1, scope: 'player', runtimeRouteId: uid('route'), displayName: tl('Narrator'), role: 'role.narrator',
                modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId }, connectionProfileRef: connectionRef,
                generationProfileRef, promptProgramRef, fallbackRouteRefs: [], policy: { timeoutMs: defaults.timeoutMs, maxRetries: 0, maxFallbackAttempts: 0 }, requirements: [] };
        await runtimeRequest('/configuration/routes', { method: 'PUT', body: route });
        state.receipt.push({ kind: existing ? 'Route updated' : 'Route', label: route.displayName });
        state.route = route;
    }

    function renderDone() {
        title.textContent = tl('Model connected');
        lead.textContent = fmt('${0} now writes your stories. Everything below was saved in Runtime, where you can change it at any time.', [state.model?.displayName || state.manualModel]);
        const list = el('ul', 'atria-onboard__receipt', undefined, body);
        for (const item of state.receipt) {
            const row = el('li', '', undefined, list);
            row.append(createAtriaIcon(doc, 'check', { size: 16 }));
            el('span', 'atria-onboard__receipt-kind', item.kind, row); literal('span', '', item.label, row);
        }
        next.textContent = tl('Done'); next.dataset.autofocus = '';
        if (host?.openRuntimeSection) {
            const open = el('button', 'atria-onboard__button', 'Open Runtime', undefined); open.type = 'button';
            foot.insertBefore(open, next); open.addEventListener('click', () => { close(); host.openRuntimeSection('routes'); });
        }
    }

    back.addEventListener('click', () => {
        if (busy) return;
        if (step === 'key') show('service');
        else if (step === 'review') show('key');
        else if (step === 'model') show(state.review ? 'review' : 'key');
    });
    next.addEventListener('click', async () => {
        if (busy || next.disabled) return;
        if (step === 'service') {
            if (state.connection && state.connection.providerAdapter !== state.service.adapter) { state.connection = null; state.secretId = ''; state.review = null; state.models = []; }
            show('key'); return;
        }
        if (step === 'done') { close(); onDone?.({ route: state.route, receipt: state.receipt }); return; }
        const token = renderToken;
        try {
            if (step === 'key') {
                setBusy(true, 'Saving the connection…');
                try { new URL(state.endpoint); } catch { throw new Error(tl('Enter a complete address beginning with https:// or http://.')); }
                state.models = []; state.model = null;
                state.review = await saveConnection();
                if (token !== renderToken || closed) return;
                setBusy(false); show(state.review ? 'review' : 'model'); return;
            }
            if (step === 'review') {
                setBusy(true, 'Saving this permission…');
                await authorize();
                if (token !== renderToken || closed) return;
                setBusy(false); show('model'); return;
            }
            if (step === 'model') {
                setBusy(true, 'Saving the model and the Narrator route…');
                await finish();
                if (token !== renderToken || closed) return;
                setBusy(false); show('done');
            }
        } catch (error) {
            if (closed) return;
            setBusy(false);
            report(reason(error), 'danger');
        }
    });

    doc.body.append(dialog);
    dialog.showModal();
    show('service');
    return { close };
}
