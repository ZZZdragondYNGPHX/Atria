import { translateShellText } from '../atria-shell/localization.js';
import { runtimeRequest, runtimeRemediation, getRuntimeEvidence } from './runtime-client.js';
import { nativeSessionRuntime } from './session-runtime.js';
import { createAtriaShellEnvironment } from '../atria-shell/environment.js';
import { createAtriaStatePanel } from '../atria-shell/primitives.js';

const ids = { connections: 'connectionProfileId', models: 'modelProfileId', routes: 'runtimeRouteId', profiles: 'generationProfileId' };
const prefixes = { connections: 'conn', models: 'model', routes: 'route', profiles: 'genprof' };
const roles = ['narrator', 'intent_resolver', 'event_interpreter', 'orchestrator', 'studio', 'memory', 'search'];
const clone = value => JSON.parse(JSON.stringify(value));
const exact = item => ({ scope: 'library', resourceType: item.resourceType, resourceId: item.resourceId, revision: item.currentRevision });
const refKey = value => JSON.stringify(value, Object.keys(value).sort());

export function mountNativeRuntimeWorkspace({ document: doc, body, section, route, host }) {
    let disposed = false; let data; let scopedResources = []; let selectedRoute = route; let activeEditor = null; let restoreShell = () => {};
    const controller = new AbortController();
    const root = doc.createElement('section');
    root.className = 'atri-runtime'; root.dataset.atriaRuntimeNative = section;
    body.replaceChildren(root);
    const environment = createAtriaShellEnvironment(root);
    let loadingSequence = 0; let editorSequence = 0;
    function adaptEditor() {
        if (!activeEditor) return;
        const focused = doc.activeElement;
        if (environment.get().mode === 'compact') {
            if (root.parentNode !== doc.body) {
                doc.body.append(root);
                const shell = doc.querySelector('.atria-app-shell');
                if (shell) { const inert = shell.inert; shell.inert = true; restoreShell = () => { shell.inert = inert; restoreShell = () => {}; }; }
            }
            root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', translateShellText('Runtime editor'));
        } else {
            restoreShell(); if (root.parentNode !== body) body.append(root);
            root.removeAttribute('role'); root.removeAttribute('aria-modal'); root.removeAttribute('aria-label');
        }
        if (root.contains(focused)) focused.focus({ preventScroll: true });
        if (environment.get().keyboardOpen) focused?.scrollIntoView?.({ block: 'nearest' });
    }
    environment.subscribe(adaptEditor);
    function node(tag, text, parent = root) {
        const el = doc.createElement(tag); if (text !== undefined) el.textContent = tag === 'pre' ? text : translateShellText(text);
        parent?.append(el); return el;
    }
    function button(text, action, parent = root) {
        const el = node('button', text, parent); el.type = 'button'; el.addEventListener('click', action); return el;
    }
    function notice(text, parent = root, error = false) {
        const el = node('p', text, parent); el.className = 'atri-runtime-notice'; el.setAttribute('role', error ? 'alert' : 'status'); return el;
    }
    function failure(error, parent) {
        const [message, target] = runtimeRemediation(error.code || error.message);
        const alert = notice(message, parent, true); alert.tabIndex = -1; alert.focus();
        if (target) button('Open ' + target, () => host.openRuntimeSection(target), parent);
    }
    function field(parent, label, value = '', options) {
        const wrap = node('label', label, parent);
        const input = node(options ? 'select' : 'input', undefined, wrap);
        input.name = label; input.autocomplete = 'off'; input.spellcheck = false;
        input.setAttribute('aria-label', translateShellText(label));
        if (options) {
            for (const [key, title, literal] of options) { const opt = node('option', undefined, input); opt.textContent = literal ? title : translateShellText(title); opt.value = key; }
            if (value && !options.some(([key]) => key === String(value))) { const opt = node('option', String(value) + ' (retained)', input); opt.value = value; }
        }
        input.value = String(value ?? ''); return input;
    }
    function number(parent, label, value, min = 0, max) {
        const input = field(parent, label, value); input.type = 'number'; input.min = min; input.step = 'any';
        if (max !== undefined) input.max = max;
        return input;
    }
    function heading(title, description) { const header = node('header'); header.className = 'atri-runtime-heading'; node('h2', title, header); node('p', description, header).className = 'atri-runtime-description'; }
    function group(form, title, description) {
        const section = node('fieldset', undefined, form); section.className = 'atri-runtime-group';
        node('legend', title, section);
        if (description) node('p', description, section).className = 'atri-runtime-help';
        return section;
    }
    function details(parent, title, value) {
        const disclosure = node('details', undefined, parent); node('summary', title, disclosure);
        node('pre', value, disclosure); return disclosure;
    }
    const options = (items, key) => [['', 'Choose…'], ...items.map(item => [item[key], item.displayName + ' · ' + item[key].slice(-8), true])];
    function resourceOptions(type) {
        return [['', 'Choose an exact revision…'], ...scopedResources.filter(item => item.ref.resourceType === type && item.ref.scope !== 'library').map(item => [refKey(item.ref), item.resource.displayName + ' · ' + item.ref.revision + ' · ' + item.ref.scope, true]), ...data.resources.filter(item => item.resourceType === type)
            .flatMap(item => (item.revisions.length ? item.revisions : [item.currentRevision]).map(revision => [refKey({ ...exact(item), revision }), item.displayName + ' · ' + revision + ' · Library', true]))];
    }
    function summary(item) {
        if (section === 'connections') return item.providerAdapter.replace('provider.', '') + ' · ' + item.endpoint;
        if (section === 'models') return item.remoteModelId + ' · ' + item.limits.contextTokens + ' context tokens';
        if (section === 'profiles') return 'Library · exact revision ' + item.revision + ' · ' + (item.output.maxTokens || 'Model limit') + ' output tokens';
        return item.role.replace('role.', '') + ' · ' + item.fallbackRouteRefs.length + ' fallback route(s)';
    }
    function renderList() {
        editorSequence += 1;
        activeEditor = null; root.onkeydown = null; restoreShell(); body.append(root); root.replaceChildren(); delete root.dataset.editor;
        root.removeAttribute('role'); root.removeAttribute('aria-modal'); root.removeAttribute('aria-label');
        heading(translateShellText(section[0].toUpperCase() + section.slice(1)), {
            routes: 'Choose how each role runs. Every route binds a model, connection and exact Generation and Prompt resources.',
            connections: 'Provider endpoints and exact Secret references. Credentials stay in the existing Secret store.',
            models: 'Remote model identity, context limits and capability provenance.',
            profiles: 'Generation resources in your Library. Saving creates a new immutable revision; existing routes stay pinned.',
        }[section]);
        if (section === 'routes') {
            const fallbackIds = new Set(data.routes.flatMap(item => item.fallbackRouteRefs.map(ref => ref.runtimeRouteId)));
            const missing = []; const ambiguous = [];
            for (const role of roles) {
                const matches = data.routes.filter(item => item.role === 'role.' + role && !fallbackIds.has(item.runtimeRouteId));
                if (!matches.length) missing.push(role.replaceAll('_', ' '));
                if (matches.length > 1) ambiguous.push(role.replaceAll('_', ' '));
            }
            if (missing.length) notice('Not configured: ' + missing.join(', ') + '. Create a route for each role you use.');
            if (ambiguous.length) notice('Ambiguous primary routes: ' + ambiguous.join(', ') + '. Edit roles or fallback links.');
        }
        const toolbar = node('div'); toolbar.className = 'atri-runtime-toolbar';
        const search = field(toolbar, 'Filter ' + section); search.type = 'search';
        button('New ' + ({ routes: 'route', models: 'model', connections: 'connection', profiles: 'profile' }[section]), () => edit(), toolbar);
        const list = node('div'); list.className = 'atri-runtime-list';
        function fill() {
            list.replaceChildren();
            const items = data[section].filter(item => (item.displayName + ' ' + summary(item)).toLowerCase().includes(search.value.toLowerCase()));
            if (!items.length) list.append(createAtriaStatePanel(doc, 'empty', {
                title: translateShellText(data[section].length ? 'No matching results.' : 'No ' + section + ' yet. Create one to get started.'),
            }));
            for (const item of items) {
                const row = node('article', undefined, list); row.className = 'atri-runtime-row';
                const text = node('div', undefined, row); node('h3', undefined, text).textContent = item.displayName; node('p', undefined, text).textContent = summary(item);
                const editButton = button('Edit', () => edit(item), row);
                editButton.setAttribute('aria-label', translateShellText('Edit') + ' ' + item.displayName);
            }
        }
        search.addEventListener('input', fill); fill();
    }
    function edit(original) {
        const editorToken = ++editorSequence;
        activeEditor = original?.[ids[section]] || 'new';
        const value = original ? clone(original) : { schemaVersion: 1, scope: 'player', [ids[section]]: prefixes[section] + '_' + crypto.randomUUID().replaceAll('-', ''), displayName: '' };
        root.replaceChildren(); root.dataset.editor = 'true';
        adaptEditor();
        const header = node('header'); header.className = 'atri-runtime-editor-header';
        const back = button('Back to ' + section, () => { renderList(); root.querySelector('input')?.focus(); }, header);
        const title = node('h2', (original ? 'Edit ' : 'New ') + section.replace(/s$/, ''), header); title.tabIndex = -1;
        const form = node('form'); form.className = 'atri-runtime-form';
        const identity = group(form, 'Identity');
        const name = field(identity, 'Display name', value.displayName); name.required = true;
        details(identity, 'Details', value[ids[section]]);
        let serialize;
        if (section === 'connections') {
            let fields = group(form, 'Provider connection');
            const adapter = field(fields, 'Provider transport', value.providerAdapter || 'provider.openai-compatible', [['provider.openai-compatible', 'OpenAI-compatible messages'], ['provider.raw-text', 'Raw text completions'], ['provider.anthropic', 'Anthropic Messages'], ['provider.gemini', 'Gemini GenerateContent']]);
            const endpoint = field(fields, 'Completions endpoint URL', value.endpoint); endpoint.type = 'url'; endpoint.required = true;
            fields = group(form, 'Authentication');
            const secret = field(fields, 'Stored Secret', value.secretRef?.secretId, [['', 'Choose…']]); secret.required = true;
            const feedback = node('div', undefined, fields);
            let inventoryVersion = 0;
            const inventory = async () => {
                const version = ++inventoryVersion;
                feedback.replaceChildren(); notice('Loading stored Secrets…', feedback);
                try {
                    const entries = await runtimeRequest('/secrets', { signal: controller.signal });
                    if (disposed || editorToken !== editorSequence || version !== inventoryVersion) return;
                    if (!Array.isArray(entries)) throw new Error('native_secret_inventory_unavailable');
                    const selected = secret.value; secret.replaceChildren();
                    for (const item of [{ secretId: '', label: translateShellText('Choose…') }, ...entries]) {
                        const option = node('option', undefined, secret); option.value = item.secretId;
                        option.textContent = item.label + (item.secretId ? ' · ' + item.secretId.slice(-8) : '');
                    }
                    secret.value = selected;
                    feedback.replaceChildren();
                    if (!entries.length) notice('No stored Secrets. Create one to connect your provider.', feedback);
                    else if (selected && !secret.value) notice('The previously selected Secret is unavailable. Select or create another.', feedback, true);
                } catch {
                    if (disposed || editorToken !== editorSequence || version !== inventoryVersion) return;
                    feedback.replaceChildren(); notice('Could not load Secrets. Your connection edits are preserved.', feedback, true);
                    button('Retry loading Secrets', inventory, feedback);
                }
            };
            const createBox = node('div', undefined, fields); createBox.hidden = true;
            const secretLabel = field(createBox, 'Secret label'); secretLabel.maxLength = 120; secretLabel.disabled = true;
            const secretValue = field(createBox, 'API key'); secretValue.type = 'password'; secretValue.autocomplete = 'new-password'; secretValue.disabled = true;
            const createFeedback = node('div', undefined, createBox);
            let creating = false;
            const create = button('Store Secret', async () => {
                if (creating) return;
                if (!secretLabel.value.trim() || !secretValue.value.trim()) {
                    createFeedback.replaceChildren(); notice('Enter a label and API key.', createFeedback, true);
                    (!secretLabel.value.trim() ? secretLabel : secretValue).focus(); return;
                }
                creating = true; create.disabled = cancel.disabled = true; create.setAttribute('aria-busy', 'true');
                try {
                    const item = await runtimeRequest('/secrets', { method: 'POST', body: { label: secretLabel.value, value: secretValue.value }, signal: controller.signal });
                    secretValue.value = '';
                    if (disposed || editorToken !== editorSequence) return;
                    inventoryVersion += 1;
                    const option = node('option', undefined, secret); option.value = item.secretId; option.textContent = item.label + ' · ' + item.secretId.slice(-8);
                    secret.value = item.secretId; closeCreate(); secret.focus();
                    feedback.replaceChildren(); notice('Secret stored. Save the connection to use it.', feedback);
                } catch {
                    if (!disposed && editorToken === editorSequence) { createFeedback.replaceChildren(); notice('Could not store the Secret. Try again.', createFeedback, true); secretValue.focus(); }
                } finally { creating = false; create.disabled = cancel.disabled = false; create.removeAttribute('aria-busy'); }
            }, createBox);
            const closeCreate = () => { secretValue.value = ''; secretLabel.value = ''; secretValue.disabled = secretLabel.disabled = true; createBox.hidden = true; openCreate.hidden = false; };
            const cancel = button('Cancel', () => { closeCreate(); openCreate.focus(); }, createBox);
            const openCreate = button('Create Secret', () => { createBox.hidden = false; openCreate.hidden = true; secretValue.disabled = secretLabel.disabled = false; createFeedback.replaceChildren(); secretLabel.focus(); }, fields);
            createBox.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); create.click(); } });
            void inventory();
            notice('Credentials stay in the Secret store. Gemini uses the API base URL; other transports use the full generation endpoint.', fields);
            serialize = () => {
                if (creating || !secret.value) throw Object.assign(new Error('Select a stored Secret'), { code: 'native_secret_selection_required' });
                return { ...value, providerAdapter: adapter.value, transport: 'transport.http', endpoint: endpoint.value, secretRef: { scope: 'player', secretId: secret.value } };
            };
            const probeStatus = node('div', undefined, fields);
            const probe = button('Test connection', async () => {
                if (probe.disabled) return;
                probe.disabled = true; probe.setAttribute('aria-busy', 'true'); probeStatus.replaceChildren(); notice('Checking provider access…', probeStatus);
                try {
                    const candidate = { ...serialize(), displayName: name.value };
                    await runtimeRequest('/connections/probe', { method: 'POST', body: candidate, signal: controller.signal });
                    if (!disposed && editorToken === editorSequence) {
                        probeStatus.replaceChildren();
                        notice(JSON.stringify(candidate) === JSON.stringify({ ...serialize(), displayName: name.value })
                            ? 'Provider model list is reachable. No generation was sent.' : 'Connection changed during the check. Test again.', probeStatus);
                    }
                } catch (error) { if (!disposed && editorToken === editorSequence) { probeStatus.replaceChildren(); failure(error, probeStatus); } } finally { probe.disabled = false; probe.removeAttribute('aria-busy'); }
            }, fields);
        } else if (section === 'models') {
            let fields = group(form, 'Model connection');
            const connection = field(fields, 'Connection', value.connectionProfileRef?.connectionProfileId, options(data.connections, ids.connections)); connection.required = true;
            button('Manage connections', () => host.openRuntimeSection('connections'), fields);
            const remote = field(fields, 'Remote model ID', value.remoteModelId); remote.required = true;
            const discovery = node('div', undefined, fields); discovery.className = 'atri-runtime-group';
            const discoveryStatus = node('div', undefined, discovery);
            const choices = field(discovery, 'Available provider models', '', [['', 'Fetch models to choose…']]); choices.disabled = true;
            let discovered = []; let discoveryVersion = 0;
            const fetchModels = button('Fetch models', async () => {
                if (fetchModels.disabled) return;
                const version = ++discoveryVersion; const selected = data.connections.find(item => item.connectionProfileId === connection.value);
                if (!selected) { discoveryStatus.replaceChildren(); notice('Select a connection first.', discoveryStatus, true); connection.focus(); return; }
                fetchModels.disabled = true; fetchModels.setAttribute('aria-busy', 'true'); discoveryStatus.replaceChildren(); notice('Fetching available models…', discoveryStatus);
                try {
                    const result = await runtimeRequest('/connections/probe', { method: 'POST', body: selected, signal: controller.signal });
                    if (disposed || editorToken !== editorSequence || version !== discoveryVersion) return;
                    discovered = result.models; choices.replaceChildren();
                    for (const item of [{ remoteModelId: '', displayName: translateShellText('Choose…') }, ...discovered]) {
                        const option = node('option', undefined, choices); option.value = item.remoteModelId; option.textContent = item.displayName + (item.remoteModelId ? ' · ' + item.remoteModelId : '');
                    }
                    choices.disabled = !discovered.length; discoveryStatus.replaceChildren();
                    notice(discovered.length ? 'Choose a model. Fetching does not change saved configuration.' : 'No generation models returned. You can enter a model ID manually.', discoveryStatus);
                } catch (error) { if (!disposed && editorToken === editorSequence && version === discoveryVersion) { discoveryStatus.replaceChildren(); failure(error, discoveryStatus); } } finally { fetchModels.disabled = false; fetchModels.removeAttribute('aria-busy'); }
            }, discovery);
            connection.addEventListener('change', () => { discoveryVersion += 1; discovered = []; choices.replaceChildren(); choices.disabled = true; discoveryStatus.replaceChildren(); });
            fields = group(form, 'Token budget');
            const context = number(fields, 'Context tokens', value.limits?.contextTokens || 16000, 1);
            const output = number(fields, 'Output token limit', value.limits?.outputTokens || 1024, 1);
            const budgetSources = { ...value.limitProvenance };
            for (const [key, input] of [['contextTokens', context], ['outputTokens', output]]) input.addEventListener('input', () => { budgetSources[key] = [{ kind: 'user-override', source: 'Runtime Models' }]; });
            const encoding = field(fields, 'Tokenizer encoding', value.tokenizer?.encoding || 'cl100k_base', [['cl100k_base', 'cl100k_base'], ['o200k_base', 'o200k_base']]);
            fields = group(form, 'Capabilities');
            notice('All transports support streaming. Message transports support tools, structured output and reasoning. OpenAI and Anthropic support explicit cache controls. Model restrictions still apply.', fields);
            const capabilities = ['generation.streaming', 'generation.tools', 'generation.structured-output', 'generation.reasoning', 'generation.cache'].map(capability => {
                const existing = value.capabilities?.find(item => item.capability === capability);
                const input = field(fields, capability, existing?.state || '', [['', 'Use adapter metadata'], ['unknown', 'Unknown'], ['unsupported', 'Unsupported'], ['supported', 'Supported — explicit user override']]);
                node('small', existing ? existing.provenance.map(item => item.kind + ': ' + item.source).join(' · ') : 'Provenance: built-in adapter metadata', fields);
                const entry = { capability, input, existing, dirty: false };
                input.addEventListener('change', () => { entry.dirty = true; });
                return entry;
            });
            const metadata = node('div', undefined, discovery); metadata.className = 'atri-runtime-group';
            choices.addEventListener('change', () => {
                const selected = discovered.find(item => item.remoteModelId === choices.value); resetMetadata();
                if (!selected) return;
                remote.value = selected.remoteModelId;
                details(metadata, 'Discovered metadata', JSON.stringify({ limits: selected.limits, capabilities: selected.capabilities, provenance: selected.provenance }, null, 2));
                button('Use discovered metadata', () => {
                    if (remote.value !== selected.remoteModelId) return;
                    for (const [key, input] of [['contextTokens', context], ['outputTokens', output]]) {
                        if (selected.limits[key] !== undefined) { input.value = selected.limits[key]; budgetSources[key] = selected.provenance; }
                    }
                    for (const item of capabilities) {
                        const found = selected.capabilities.find(entry => entry.capability === item.capability);
                        if (found && !item.dirty && !item.existing?.provenance.some(entry => entry.kind === 'user-override')) { item.existing = found; item.input.value = found.state; }
                    }
                    notice('Metadata applied to this draft. Explicit capability overrides are preserved. Save to keep changes.', metadata);
                }, metadata);
            });
            const resetMetadata = () => {
                metadata.replaceChildren();
                for (const key of Object.keys(budgetSources)) if (budgetSources[key].some(item => item.kind === 'provider-discovery')) delete budgetSources[key];
                for (const item of capabilities) if (item.existing?.provenance.some(entry => entry.kind === 'provider-discovery')) {
                    if (!item.dirty) item.input.value = '';
                    item.existing = null;
                }
            };
            connection.addEventListener('change', resetMetadata);
            remote.addEventListener('input', () => { choices.value = ''; resetMetadata(); });
            serialize = () => ({ ...value, connectionProfileRef: { scope: 'player', connectionProfileId: connection.value }, remoteModelId: remote.value,
                limits: { contextTokens: Number(context.value), outputTokens: Number(output.value) }, tokenizer: { encoding: encoding.value, source: 'user' },
                limitProvenance: { contextTokens: budgetSources.contextTokens || [{ kind: 'user-override', source: 'Runtime Models' }], outputTokens: budgetSources.outputTokens || [{ kind: 'user-override', source: 'Runtime Models' }] },
                capabilities: [...(value.capabilities || []).filter(item => !capabilities.some(entry => entry.capability === item.capability)), ...capabilities.filter(item => item.input.value).map(item => !item.dirty && item.existing?.state === item.input.value ? item.existing : { capability: item.capability, state: item.input.value, provenance: [{ kind: 'user-override', source: 'Runtime Models' }] })] });
        } else if (section === 'profiles') {
            let fields = group(form, 'Revision', 'Saving creates a new immutable revision. Existing routes keep their selected revision.');
            const revision = field(fields, 'New exact revision', 'r-' + Date.now()); revision.required = true;
            fields = group(form, 'Sampling');
            const temperature = number(fields, 'Temperature (optional)', value.sampling?.temperature ?? '', 0);
            const topP = number(fields, 'Top P (optional)', value.sampling?.topP ?? '', 0, 1);
            fields = group(form, 'Output');
            const max = number(fields, 'Maximum output tokens', value.output?.maxTokens || 512, 1);
            const stream = field(fields, 'Streaming', String(value.streaming?.enabled ?? true), [['true', 'Enabled'], ['false', 'Disabled']]);
            const stop = field(fields, 'Stop sequences (JSON array)', JSON.stringify(value.stop?.sequences || []));
            const validateStop = () => {
                try {
                    const values = JSON.parse(stop.value);
                    stop.setCustomValidity(Array.isArray(values) && values.every(item => typeof item === 'string') ? '' : translateShellText('Enter a JSON array of text strings.'));
                } catch { stop.setCustomValidity(translateShellText('Enter a JSON array of text strings.')); }
            };
            stop.addEventListener('input', validateStop); validateStop();
            const tools = field(fields, 'Tool choice', value.toolChoice?.value || '', [['', 'Host default'], ['auto', 'Auto'], ['none', 'None'], ['required', 'Required']]);
            fields = group(form, 'Provider controls');
            notice('Use only controls supported by the selected route. OpenAI uses effort and cache key; Anthropic uses thinking mode and ephemeral cache; Gemini uses thinking budget or level. Unsupported combinations fail preview.', fields);
            const thinkingMode = field(fields, 'Thinking mode (Anthropic)', value.reasoning?.mode || '', [['', 'Default'], ['adaptive', 'Adaptive'], ['enabled', 'Token budget'], ['disabled', 'Disabled']]);
            const effort = field(fields, 'Reasoning effort (OpenAI / Anthropic adaptive)', value.reasoning?.effort || '', [['', 'Default'], ...['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].map(item => [item, item])]);
            const thinkingBudget = number(fields, 'Thinking budget tokens (Anthropic / Gemini)', value.reasoning?.budgetTokens ?? '', -1);
            const thinkingLevel = field(fields, 'Thinking level (Gemini)', value.reasoning?.level || '', [['', 'Default'], ...['minimal', 'low', 'medium', 'high'].map(item => [item, item])]);
            const cacheKey = field(fields, 'Cache key (OpenAI)', value.cache?.key || '');
            const cacheRetention = field(fields, 'Cache retention (OpenAI)', value.cache?.retention || '', [['', 'Default'], ['in_memory', 'In memory'], ['24h', '24 hours']]);
            const cacheMode = field(fields, 'Cache mode (Anthropic)', value.cache?.mode || '', [['', 'Default'], ['ephemeral', 'Ephemeral']]);
            const cacheTtl = field(fields, 'Cache lifetime (Anthropic)', value.cache?.ttl || '', [['', 'Default'], ['5m', '5 minutes'], ['1h', '1 hour']]);
            serialize = () => {
                const result = { ...value, revision: revision.value, sampling: { ...value.sampling }, output: { ...value.output, maxTokens: Number(max.value) }, streaming: { ...value.streaming, enabled: stream.value === 'true' }, stop: { ...value.stop, sequences: JSON.parse(stop.value) }, toolChoice: tools.value ? { ...value.toolChoice, value: tools.value } : {} };
                delete result.scope;
                result.reasoning = { ...value.reasoning }; result.cache = { ...value.cache };
                for (const [section, key, input] of [['reasoning', 'mode', thinkingMode], ['reasoning', 'effort', effort], ['reasoning', 'level', thinkingLevel], ['cache', 'key', cacheKey], ['cache', 'retention', cacheRetention], ['cache', 'mode', cacheMode], ['cache', 'ttl', cacheTtl]]) {
                    if (input.value) result[section][key] = input.value; else delete result[section][key];
                }
                if (thinkingBudget.value === '') delete result.reasoning.budgetTokens; else result.reasoning.budgetTokens = Number(thinkingBudget.value);
                for (const [key, input] of [['temperature', temperature], ['topP', topP]]) { if (input.value === '') delete result.sampling[key]; else result.sampling[key] = Number(input.value); }
                return result;
            };
        } else {
            let fields = group(form, 'Routing');
            const role = field(fields, 'Role', value.role || 'role.narrator', roles.map(item => ['role.' + item, item.replaceAll('_', ' ')]));
            node('p', 'The model determines the connection. Generation and Prompt stay pinned to the selected revision.', fields).className = 'atri-runtime-help';
            const model = field(fields, 'Model', value.modelProfileRef?.modelProfileId, options(data.models, ids.models)); model.required = true;
            const connection = field(fields, 'Connection', value.connectionProfileRef?.connectionProfileId, options(data.connections, ids.connections)); connection.disabled = true;
            const sync = () => { connection.value = data.models.find(item => item.modelProfileId === model.value)?.connectionProfileRef.connectionProfileId || ''; }; model.addEventListener('change', sync); sync();
            fields = group(form, 'Exact resources');
            const generation = field(fields, 'Generation — exact revision', value.generationProfileRef ? refKey(value.generationProfileRef) : '', resourceOptions('core.generation-profile')); generation.required = true;
            const prompt = field(fields, 'Prompt — exact revision', value.promptProgramRef ? refKey(value.promptProgramRef) : '', resourceOptions('core.prompt-program')); prompt.required = true;
            notice('Choose an exact resource revision. Existing Package and Project references are retained. Create or edit Prompt Programs in Library.', fields);
            button('Manage models', () => host.openRuntimeSection('models'), fields);
            button('Manage profiles', () => host.openRuntimeSection('profiles'), fields);
            button('Open Prompt Programs', () => host.openLibrarySection('prompt-programs'), fields);
            fields = group(form, 'Fallback order');
            let fallbackIds = (value.fallbackRouteRefs || []).map(item => item.runtimeRouteId);
            const fallbackList = node('div', undefined, fields);
            function showFallbacks() {
                fallbackList.replaceChildren();
                fallbackIds.forEach((id, index) => {
                    const row = node('div', undefined, fallbackList); row.className = 'atri-runtime-toolbar';
                    node('span', undefined, row).textContent = (index + 1) + '. ' + (data.routes.find(item => item.runtimeRouteId === id)?.displayName || 'Missing route: ' + id);
                    if (index) button('Move up', () => { [fallbackIds[index - 1], fallbackIds[index]] = [id, fallbackIds[index - 1]]; showFallbacks(); fallbackList.querySelector('button')?.focus(); }, row);
                    button('Remove fallback', () => { fallbackIds = fallbackIds.filter(item => item !== id); showFallbacks(); fallbackList.querySelector('button')?.focus(); }, row);
                });
            }
            const fallback = field(fields, 'Add fallback route', '', options(data.routes.filter(item => item.runtimeRouteId !== value.runtimeRouteId), ids.routes));
            button('Add fallback', () => { if (fallback.value && !fallbackIds.includes(fallback.value)) { fallbackIds.push(fallback.value); showFallbacks(); fallback.focus(); } }, fields);
            notice('Fallback routes must use the same role. They are tried in the order shown.', fields);
            showFallbacks();
            fields = group(form, 'Request policy');
            const timeout = number(fields, 'Timeout milliseconds', value.policy?.timeoutMs || 60000, 1);
            const retries = number(fields, 'Retries before fallback', value.policy?.maxRetries ?? 0, 0);
            const attempts = number(fields, 'Maximum fallback attempts', value.policy?.maxFallbackAttempts ?? 0, 0);
            notice('Fallback mode is chosen per request: automatic, confirm or disabled. Game Runtime requests automatic; other callers default to disabled. Zero attempts disables fallback.', fields);
            const requirements = field(fields, 'Required capabilities (comma separated)', value.requirements?.join(', ') || '');
            serialize = () => ({ ...value, role: role.value, modelProfileRef: { scope: 'player', modelProfileId: model.value }, connectionProfileRef: { scope: 'player', connectionProfileId: connection.value }, generationProfileRef: JSON.parse(generation.value), promptProgramRef: JSON.parse(prompt.value), fallbackRouteRefs: fallbackIds.map(runtimeRouteId => ({ scope: 'player', runtimeRouteId })), policy: { timeoutMs: Number(timeout.value), maxRetries: Number(retries.value), maxFallbackAttempts: Number(attempts.value) }, requirements: requirements.value.split(',').map(item => item.trim()).filter(Boolean) });
        }
        const status = node('div', undefined, form); status.className = 'atri-runtime-status';
        const actions = node('footer', undefined, form); actions.className = 'atri-runtime-actions';
        const save = node('button', 'Save', actions); save.type = 'submit';
        form.addEventListener('submit', async event => {
            event.preventDefault(); if (save.disabled) return;
            status.replaceChildren(); notice('Saving…', status); save.setAttribute('aria-busy', 'true'); save.disabled = true; back.disabled = true; let saved = false;
            try {
                await runtimeRequest('/configuration/' + section, { method: 'PUT', body: { ...serialize(), displayName: name.value }, signal: controller.signal });
                saved = true;
                if (disposed || editorToken !== editorSequence) return;
                status.replaceChildren();
                notice('Saved. Refreshing…', status);
                data = await runtimeRequest('/configuration', { signal: controller.signal });
                if (section === 'routes') scopedResources = await runtimeRequest('/resources', { signal: controller.signal });
                if (disposed || editorToken !== editorSequence) return;
                renderList(); notice('Saved successfully. Exact route references remain pinned.'); root.querySelector('input')?.focus();
                void host.refreshSearch?.();
            } catch (error) {
                if (!disposed && editorToken === editorSequence) {
                    status.replaceChildren();
                    if (saved) { notice('Saved, but the list could not refresh. Reload to see the saved version.', status, true); button('Reload list', load, status); } else failure(error, status);
                }
            } finally { save.removeAttribute('aria-busy'); save.disabled = saved; back.disabled = false; }
        });
        root.onkeydown = event => {
            if (event.key === 'Tab' && root.getAttribute('role') === 'dialog') {
                const controls = [...root.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary')];
                const first = controls[0]; const last = controls.at(-1);
                if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
            }
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!back.disabled) back.click(); }
        };
        title.focus();
    }
    function evidence(result, parent) {
        const snapshot = result.snapshot;
        node('h3', result.preview ? 'Compiled preview — no request sent' : 'Latest effective request', parent);
        notice('Input: ' + snapshot.diagnostics.inputTokens + ' / ' + snapshot.contextPlan.budget.maxTokens + ' tokens · reserved output: ' + snapshot.contextPlan.budget.reservedOutputTokens, parent);
        for (const [title, value] of [['Effective Request', snapshot.diagnostics.effectiveConfig], ['Capabilities and provenance', snapshot.capabilities], ['Prompt provenance', { ref: snapshot.promptProgramRef, ir: snapshot.promptIr }], ['Context selection', snapshot.contextPlan], ['Fallback attempts', result.routing]]) {
            const details = node('details', undefined, parent); node('summary', title, details); node('pre', JSON.stringify(value, null, 2), details);
        }
    }
    function diagnostics() {
        root.replaceChildren(); heading('Diagnostics', 'Compile the exact route against a pinned Native context. Preview never sends, resolves a Secret, or writes Session state.');
        const latest = getRuntimeEvidence(); if (latest?.snapshot) evidence(latest, node('div'));
        const form = node('form'); form.className = 'atri-runtime-form';
        const routing = group(form, 'Preview route');
        const routeSelect = field(routing, 'Route to preview', '', options(data.routes, ids.routes)); routeSelect.required = true;
        if (!data.routes.length) { notice('Create a route before compiling a preview.', routing); button('Manage routes', () => host.openRuntimeSection('routes'), routing); }
        const context = group(form, 'Pinned context', nativeSessionRuntime.active ? 'The current Native session supplies the exact context.' : 'Choose a Project and its exact revision, or open a Native game.');
        const project = field(context, 'Project ID (when no game is open)'); const revision = field(context, 'Project revision');
        project.disabled = revision.disabled = nativeSessionRuntime.active;
        project.parentElement.hidden = revision.parentElement.hidden = nativeSessionRuntime.active;
        const message = field(group(form, 'Preview input'), 'Preview message', 'Preview this route.');
        const actions = node('footer', undefined, form); actions.className = 'atri-runtime-actions';
        const submit = node('button', 'Compile preview', actions); submit.type = 'submit';
        const result = node('div'); result.className = 'atri-runtime-evidence';
        form.addEventListener('submit', async event => {
            event.preventDefault(); if (submit.disabled) return; submit.disabled = true; submit.setAttribute('aria-busy', 'true'); result.replaceChildren(); notice('Compiling…', result);
            try {
                const snapshot = nativeSessionRuntime.snapshot;
                const source = nativeSessionRuntime.active ? { sessionId: snapshot.session.sessionId, revisionId: snapshot.revision.revisionId } : project.value ? { projectId: project.value, revision: revision.value } : {};
                const selected = data.routes.find(item => item.runtimeRouteId === routeSelect.value);
                const preview = await runtimeRequest('/preview', { method: 'POST', signal: controller.signal, body: { ...source, requestId: 'preview-' + crypto.randomUUID(), role: selected.role.slice(5), routeRef: { scope: 'player', runtimeRouteId: selected.runtimeRouteId }, messages: [{ role: 'user', content: message.value }] } });
                if (!disposed) { result.replaceChildren(); evidence(preview, result); const title = result.querySelector('h3'); title.tabIndex = -1; title.focus(); }
            } catch (error) { if (!disposed) { result.replaceChildren(); failure(error, result); } } finally { submit.disabled = false; submit.removeAttribute('aria-busy'); }
        });
    }
    function deepLink(next) {
        const id = next?.child?.id?.split(':').slice(1).join(':');
        const item = data?.[section]?.find(item => item[ids[section]] === id);
        if (item && activeEditor !== id) edit(item);
    }
    async function load() {
        const sequence = ++loadingSequence;
        root.replaceChildren(createAtriaStatePanel(doc, 'loading', { title: translateShellText('Loading Native Runtime…') }));
        try {
            const configuration = await runtimeRequest('/configuration', { signal: controller.signal });
            const resources = section === 'routes' ? await runtimeRequest('/resources', { signal: controller.signal }) : [];
            if (disposed || sequence !== loadingSequence) return;
            data = configuration; scopedResources = resources;
            if (section === 'diagnostics') diagnostics(); else { renderList(); deepLink(selectedRoute); }
        } catch (error) { if (!disposed && sequence === loadingSequence) { root.replaceChildren(); failure(error, root); button('Retry loading', load); } }
    }
    void load();
    return { root, updateRoute(next) {
        const changed = selectedRoute?.child?.id !== next?.child?.id;
        selectedRoute = next;
        if (changed && activeEditor && !next?.child?.id?.includes(':')) { renderList(); root.querySelector('input')?.focus(); } else deepLink(next);
    }, dispose() { disposed = true; environment.dispose(); restoreShell(); controller.abort(); root.remove(); } };
}
