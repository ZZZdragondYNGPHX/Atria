// "Connect a model": the shortest path from nothing to a usable chat model.
// It writes the same authorities the full editors use — a stored key, a
// connection and an API preset (model + generation + route) — in one flow.
import { NATIVE_GENERATION_DEFAULTS as defaults } from '../../shared/native-generation-defaults.js';
import { formatShellText as fmt, translateShellText as tl } from '../atria-shell/localization.js';
import { createAtriaIcon } from '../atria-shell/icons.js';
import { generationFields, newPromptResource } from './prompt-authoring.js';
import { runtimeRequest, runtimeRemediation } from './runtime-client.js';
import { createStudioNativeId } from './studio-authoring.js';

export const CHAT_ADAPTERS = Object.freeze(['provider.openai-compatible', 'provider.openai-responses', 'provider.anthropic', 'provider.gemini', 'provider.raw-text']);

// Known services prefill the exact endpoint the adapter expects.
export const CHAT_SERVICES = Object.freeze([
    { id: 'openai', name: 'OpenAI', adapter: 'provider.openai-compatible', endpoint: 'https://api.openai.com/v1/chat/completions', keyHint: 'Create a key at platform.openai.com → API keys.' },
    { id: 'anthropic', name: 'Anthropic Claude', adapter: 'provider.anthropic', endpoint: 'https://api.anthropic.com/v1/messages', keyHint: 'Create a key at console.anthropic.com → API keys.' },
    { id: 'gemini', name: 'Google Gemini', adapter: 'provider.gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta', keyHint: 'Create a key at aistudio.google.com → Get API key.' },
    { id: 'deepseek', name: 'DeepSeek', adapter: 'provider.openai-compatible', endpoint: 'https://api.deepseek.com/chat/completions', keyHint: 'Create a key at platform.deepseek.com → API keys.' },
    { id: 'openrouter', name: 'OpenRouter', adapter: 'provider.openai-compatible', endpoint: 'https://openrouter.ai/api/v1/chat/completions', keyHint: 'Create a key at openrouter.ai → Keys. One key reaches many models.' },
    { id: 'local', name: 'Local model', detail: 'Ollama, LM Studio, KoboldCpp…', adapter: 'provider.openai-compatible', endpoint: 'http://127.0.0.1:11434/v1', optionalKey: true, editAddress: true },
    { id: 'custom', name: 'Other compatible service', detail: 'Relays and proxies with an OpenAI-style API', adapter: 'provider.openai-compatible', endpoint: '', optionalKey: true, editAddress: true },
]);

// SillyTavern and most docs give a base URL; the adapters need the exact call.
export function normalizeChatEndpoint(adapter, raw) {
    let url;
    try { url = new URL(String(raw || '').trim()); } catch { return String(raw || '').trim(); }
    const path = url.pathname.replace(/\/+$/, '');
    if (adapter === 'provider.anthropic') url.pathname = /\/messages$/.test(path) ? path : (path || '/v1') + '/messages';
    else if (adapter === 'provider.gemini') url.pathname = path.replace(/\/models$/, '') || '/v1beta';
    else if (adapter === 'provider.openai-responses') url.pathname = /\/responses$/.test(path) ? path : (path.replace(/\/(chat\/)?completions$/, '') || '/v1') + '/responses';
    else if (adapter === 'provider.raw-text') url.pathname = /\/completions$/.test(path) ? path : (path || '/v1') + '/completions';
    else if (adapter === 'provider.openai-compatible') url.pathname = /\/(chat\/)?completions$/.test(path) ? path.replace(/\/completions$/, '/chat/completions').replace(/\/chat\/chat\//, '/chat/') : (path || '/v1') + '/chat/completions';
    return url.href;
}

const PLACEHOLDER_KEY = 'no-key';
const problems = {
    native_provider_authentication_failed: ['The service rejected this API key. Check that you copied the whole key and that it is active.', 'key'],
    native_provider_unreachable: ['Atria could not reach this address. Check the address and that the service is running.', 'endpoint'],
    native_provider_endpoint_invalid: ['Enter an address that starts with http:// or https://, without a key or ? in it.', 'endpoint'],
    native_credential_insecure_target: ['Use https:// for online services. Plain http:// only works for a service on this computer.', 'endpoint'],
    native_credential_network_denied: ['Atria does not allow keys to be sent to this address. Use a public https:// address or a service on this computer.', 'endpoint'],
    native_provider_probe_unsupported: ['This service does not list its models. Type the model ID from its documentation.', 'model'],
    native_provider_response_invalid: ['The service answered, but not with a model list. Type the model ID from its documentation.', 'model'],
    native_secret_create_failed: ['Could not save the API key. Try again.', 'key'],
};
function explain(error) {
    const code = error?.code || error?.message;
    return problems[code] || [runtimeRemediation(code)[0], null];
}

export function mountRuntimeSetup({ doc, parent, data, host, signal, onCancel, onSaved, onManual }) {
    const el = (tag, className, text, into) => {
        const node = doc.createElement(tag); if (className) node.className = className;
        if (text !== undefined) node.textContent = tl(text);
        into?.append(node); return node;
    };
    const btn = (text, into, action, variant) => {
        const node = el('button', 'atria-button', text, into); node.type = 'button';
        if (variant) node.dataset.variant = variant;
        node.addEventListener('click', action); return node;
    };
    const root = el('section', 'atri-setup', undefined, parent);
    const form = el('form', 'atri-setup__form', undefined, root); form.noValidate = true;
    const head = el('header', 'atri-setup__head', undefined, form);
    const title = el('h2', '', 'Connect a chat model', head); title.tabIndex = -1;
    el('p', 'atri-setup__lead', 'Stories need one chat model. Choose your service, add its API key and pick a model. Atria checks the connection before saving.', head);

    // 1 · Service
    const step = (number, label) => {
        const box = el('fieldset', 'atri-setup__step', undefined, form);
        const legend = el('legend', '', undefined, box);
        el('span', 'atri-setup__num', String(number), legend); legend.append(doc.createTextNode(tl(label)));
        return box;
    };
    const serviceStep = step(1, 'Service');
    const choices = el('div', 'atri-setup__services', undefined, serviceStep);
    choices.setAttribute('role', 'radiogroup'); choices.setAttribute('aria-label', tl('Service'));
    const existing = data.connections.filter(item => CHAT_ADAPTERS.includes(item.providerAdapter));
    const options = [
        ...existing.map(item => ({ id: 'conn:' + item.connectionProfileId, name: item.displayName, detail: tl('Already added') + ' · ' + new URL(item.endpoint).host, connection: item, adapter: item.providerAdapter })),
        ...CHAT_SERVICES.map(item => ({ ...item, name: item.name, detail: item.detail ? tl(item.detail) : new URL(item.endpoint).host })),
    ];
    let selected = null;
    const radios = options.map((option, index) => {
        if (index === existing.length && existing.length) el('p', 'atri-setup__divider', 'Or add a new service', choices);
        const label = el('label', 'atri-setup__service', undefined, choices);
        const input = el('input', '', undefined, label); input.type = 'radio'; input.name = 'atri-setup-service'; input.value = option.id;
        const icon = el('span', 'atri-setup__service-icon', undefined, label);
        icon.append(createAtriaIcon(doc, option.connection ? 'check-circle' : option.id === 'local' ? 'desktop' : option.id === 'custom' ? 'plug' : 'globe', { size: 18 }));
        const text = el('span', 'atri-setup__service-text', undefined, label);
        el('strong', '', undefined, text).textContent = option.connection ? option.name : tl(option.name);
        el('small', '', undefined, text).textContent = option.detail;
        input.addEventListener('change', () => choose(option));
        return input;
    });

    // 2 · Address and key
    const accessStep = step(2, 'Address and API key');
    const addressWrap = el('div', 'atri-setup__address', undefined, accessStep);
    const addressToggle = el('details', 'atri-setup__address-more', undefined, addressWrap);
    const addressSummary = el('summary', '', undefined, addressToggle);
    const addressLabel = el('label', 'atri-setup__field', undefined, addressWrap);
    el('span', '', 'Service address', addressLabel);
    const endpoint = el('input', '', undefined, addressLabel); endpoint.type = 'url'; endpoint.autocomplete = 'off'; endpoint.spellcheck = false; endpoint.inputMode = 'url';
    const resolved = el('small', 'atri-setup__hint', undefined, addressLabel);
    const keyLabel = el('label', 'atri-setup__field', undefined, accessStep);
    const keyCaption = el('span', '', 'API key', keyLabel);
    const key = el('input', '', undefined, keyLabel); key.type = 'password'; key.autocomplete = 'off'; key.spellcheck = false;
    const keyHint = el('small', 'atri-setup__hint', undefined, keyLabel);
    el('p', 'atri-setup__note', 'Keys are stored on this Atria server and never shown again. You can replace a key later in Services.', accessStep);

    // 3 · Model
    const modelStep = step(3, 'Model');
    const testRow = el('div', 'atri-setup__row', undefined, modelStep);
    const test = btn('Test connection and load models', testRow, () => void probe());
    const testStatus = el('p', 'atri-setup__status', undefined, testRow); testStatus.setAttribute('role', 'status');
    const modelLabel = el('label', 'atri-setup__field', undefined, modelStep);
    el('span', '', 'Model', modelLabel);
    const model = el('input', '', undefined, modelLabel); model.autocomplete = 'off'; model.spellcheck = false;
    model.placeholder = tl('Pick from the list or type a model ID');
    const list = el('datalist', '', undefined, modelLabel); list.id = 'atri-setup-models-' + Math.random().toString(36).slice(2); model.setAttribute('list', list.id);
    const nameLabel = el('label', 'atri-setup__field', undefined, modelStep);
    el('span', '', 'Name in Atria', nameLabel);
    const name = el('input', '', undefined, nameLabel); name.autocomplete = 'off'; name.maxLength = 120;
    el('small', 'atri-setup__hint', 'Stories show this name when you choose a model.', nameLabel);

    const footer = el('footer', 'atri-setup__actions', undefined, form);
    const status = el('p', 'atri-setup__status', undefined, footer); status.setAttribute('role', 'status');
    const actionsRight = el('div', 'atria-button-row', undefined, footer);
    if (onManual) btn('Build a preset manually', actionsRight, onManual, 'plain');
    if (onCancel) btn('Cancel', actionsRight, onCancel);
    const save = el('button', 'atria-button', 'Save and use', actionsRight); save.type = 'submit'; save.dataset.variant = 'primary';

    let discovered = [], storedKey = null, connectionId = null, savedConnection = null, nameEdited = false, busy = false;
    const service = () => selected;
    const adapter = () => selected?.adapter || 'provider.openai-compatible';
    const address = () => normalizeChatEndpoint(adapter(), endpoint.value);
    function syncAddress() {
        const value = address();
        resolved.textContent = endpoint.value.trim() ? fmt('Atria will call ${0}', [value]) : '';
    }
    // Custom and local services are named by their host, which says more than "Other".
    function serviceLabel() {
        const svc = service(); if (!svc) return '';
        if (svc.connection) return svc.name;
        if (svc.editAddress) { try { return new URL(address()).host; } catch { /* Not a URL yet. */ } }
        return tl(svc.name);
    }
    function syncName() {
        if (nameEdited) return;
        const svc = service(); if (!svc) return;
        const label = serviceLabel();
        name.value = model.value.trim() ? label + ' · ' + model.value.trim() : label;
    }
    function setStatus(node, message, kind = 'status') {
        node.textContent = message ? tl(message) : ''; node.dataset.kind = kind; node.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    }
    function choose(option) {
        selected = option; discovered = []; list.replaceChildren(); setStatus(testStatus, '');
        root.dataset.service = option.id;
        for (const label of choices.querySelectorAll('.atri-setup__service')) label.classList.toggle('is-selected', label.querySelector('input').value === option.id);
        accessStep.hidden = Boolean(option.connection);
        modelStep.querySelector('.atri-setup__num').textContent = option.connection ? '2' : '3';
        if (!option.connection) {
            endpoint.value = option.endpoint;
            const editable = Boolean(option.editAddress);
            addressToggle.hidden = editable; addressLabel.hidden = !editable;
            addressSummary.textContent = fmt('Address: ${0} · Change', [option.endpoint ? new URL(option.endpoint).host : '']);
            endpoint.placeholder = option.id === 'local' ? 'http://127.0.0.1:11434/v1' : 'https://example.com/v1';
            keyCaption.textContent = tl(option.optionalKey ? 'API key (optional)' : 'API key');
            keyHint.textContent = tl(option.optionalKey ? 'Leave empty if your service does not use a key.' : option.keyHint);
            syncAddress();
        }
        storedKey = null; connectionId = null; savedConnection = null;
        syncName();
        root.dataset.ready = 'service';
    }
    addressToggle.addEventListener('toggle', () => { if (addressToggle.open) { addressLabel.hidden = false; addressToggle.hidden = true; endpoint.focus(); } });
    endpoint.addEventListener('input', () => { syncAddress(); syncName(); savedConnection = null; });
    key.addEventListener('input', () => { storedKey = null; savedConnection = null; });
    model.addEventListener('input', syncName);
    name.addEventListener('input', () => { nameEdited = Boolean(name.value.trim()); });

    function invalid(node, message) {
        node.setAttribute('aria-invalid', 'true'); node.focus();
        node.addEventListener('input', () => node.removeAttribute('aria-invalid'), { once: true });
        throw Object.assign(new Error(tl(message)), { handled: true });
    }
    function focusFor(target) { return { key, endpoint, model }[target]; }

    // Store the key once per typed value; reuse it for test and save.
    async function ensureConnection() {
        const svc = service();
        if (!svc) { radios[0]?.focus(); throw Object.assign(new Error(tl('Choose a service first.')), { handled: true }); }
        if (svc.connection) return svc.connection;
        let url; try { url = new URL(address()); } catch { addressLabel.hidden = false; addressToggle.hidden = true; invalid(endpoint, 'Enter the service address, for example https://api.example.com/v1.'); }
        if (!/^https?:$/.test(url.protocol)) invalid(endpoint, 'Enter an address that starts with http:// or https://.');
        const typed = key.value.trim();
        if (!typed && !svc.optionalKey) invalid(key, 'Paste the API key from your service.');
        const value = typed || PLACEHOLDER_KEY;
        if (!storedKey || storedKey.value !== value) {
            const secret = await runtimeRequest('/secrets', { method: 'POST', body: { label: (serviceLabel() + (typed ? '' : ' · ' + tl('no key'))).slice(0, 120), value }, signal });
            storedKey = { value, secretId: secret.secretId }; savedConnection = null;
        }
        connectionId ||= createStudioNativeId('conn');
        return { schemaVersion: 1, scope: 'player', connectionProfileId: connectionId, displayName: serviceLabel().slice(0, 120), providerAdapter: svc.adapter, transport: 'transport.http',
            endpoint: url.href, options: svc.adapter === 'provider.openai-compatible' ? { responseMode: 'stream' } : {}, secretRef: { scope: 'player', secretId: storedKey.secretId } };
    }

    async function probe() {
        if (busy) return;
        busy = true; test.disabled = true; test.setAttribute('aria-busy', 'true'); setStatus(testStatus, 'Checking the connection…');
        try {
            const connection = await ensureConnection();
            const result = await runtimeRequest('/connections/probe', { method: 'POST', body: connection, signal });
            if (!root.isConnected) return;
            discovered = result.models || []; list.replaceChildren();
            for (const item of discovered) { const option = el('option', '', undefined, list); option.value = item.remoteModelId; if (item.displayName !== item.remoteModelId) option.label = item.displayName; }
            setStatus(testStatus, discovered.length ? fmt('Connected. ${0} models available — pick one below.', [discovered.length]) : tl('Connected, but the service listed no models. Type the model ID.'), 'ok');
            if (discovered.length === 1 && !model.value) { model.value = discovered[0].remoteModelId; syncName(); }
            root.dataset.ready = 'model';
            model.focus();
        } catch (error) {
            if (!root.isConnected || error?.name === 'AbortError') return;
            if (error.handled) { setStatus(testStatus, error.message, 'error'); return; }
            const [message, target] = explain(error);
            setStatus(testStatus, message, target === 'model' ? 'warn' : 'error');
            focusFor(target)?.focus();
        } finally { busy = false; test.disabled = false; test.removeAttribute('aria-busy'); }
    }

    form.addEventListener('submit', async event => {
        event.preventDefault(); if (busy) return;
        setStatus(status, '');
        busy = true; save.disabled = true; save.setAttribute('aria-busy', 'true');
        try {
            const connection = await ensureConnection();
            const remoteModelId = model.value.trim();
            if (!remoteModelId) invalid(model, 'Choose a model, or type its ID.');
            if (!name.value.trim()) syncName();
            setStatus(status, 'Saving…');
            if (!service().connection && JSON.stringify(savedConnection) !== JSON.stringify(connection)) {
                await runtimeRequest('/configuration/connections', { method: 'PUT', body: connection, signal });
                savedConnection = connection;
            }
            const found = discovered.find(item => item.remoteModelId === remoteModelId);
            const contextTokens = found?.limits?.contextTokens || defaults.contextTokens;
            const outputTokens = found?.limits?.outputTokens || Math.min(defaults.outputTokens, Math.floor(contextTokens / 4));
            const displayName = name.value.trim().slice(0, 120);
            const draft = { ...newPromptResource('core.generation-profile'), output: {}, streaming: {} };
            const generation = { ...draft, ...generationFields(doc, doc.createElement('div'), draft, () => false, { providerAdapter: connection.providerAdapter, outputLimit: () => outputTokens })() };
            const route = { schemaVersion: 1, scope: 'player', runtimeRouteId: createStudioNativeId('route'), displayName, role: 'role.narrator', fallbackRouteRefs: [],
                policy: { timeoutMs: defaults.timeoutMs, maxRetries: 0, maxFallbackAttempts: 0 }, requirements: [] };
            const modelProfile = { schemaVersion: 1, scope: 'player', modelProfileId: createStudioNativeId('model'), displayName, remoteModelId,
                connectionProfileRef: { scope: 'player', connectionProfileId: connection.connectionProfileId },
                limits: { contextTokens, outputTokens }, tokenizer: { encoding: 'cl100k_base', source: 'user' }, capabilities: found?.capabilities || [] };
            await runtimeRequest('/api-presets', { method: 'PUT', body: { route, model: modelProfile, generation, expected: { route: data.emptyFingerprint, model: data.emptyFingerprint } }, signal });
            if (!root.isConnected) return;
            showDone(route, displayName);
            onSaved?.(route);
        } catch (error) {
            if (!root.isConnected || error?.name === 'AbortError') return;
            if (error.handled) { setStatus(status, error.message, 'error'); return; }
            const [message, target] = explain(error);
            setStatus(status, message, 'error'); focusFor(target)?.focus();
        } finally { busy = false; save.disabled = false; save.removeAttribute('aria-busy'); }
    });

    function showDone(route, displayName) {
        root.replaceChildren();
        const done = el('div', 'atri-setup__done', undefined, root);
        const mark = el('span', 'atri-setup__done-mark', undefined, done); mark.append(createAtriaIcon(doc, 'check', { size: 22 }));
        const heading = el('h2', '', undefined, done); heading.textContent = fmt('${0} is ready', [displayName]); heading.tabIndex = -1;
        el('p', '', 'Stories can now use this model. Choose it when a story asks for an API preset. You can fine-tune temperature and length at any time.', done);
        const row = el('div', 'atria-button-row', undefined, done);
        btn('Find a story', row, () => host.openLibrarySection('works'), 'primary');
        btn('Adjust parameters', row, () => host.openRuntimeSection('routes', route.runtimeRouteId));
        btn('Connect another model', row, () => host.openRuntimeSection('routes', 'new'), 'plain');
        heading.focus();
    }

    // Sensible default: preselect the only existing chat service, else nothing.
    if (existing.length === 1) { radios[0].checked = true; choose(options[0]); }
    return { root, focus: () => title.focus() };
}
