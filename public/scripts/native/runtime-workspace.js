import { renderRetrievalWorkspace } from './retrieval-workspace.js';
import { formatShellText as fmt, translateShellText } from '../atria-shell/localization.js';
import { runtimeRequest, runtimeRemediation, getRuntimeEvidence } from './runtime-client.js';
import { nativeSessionRuntime } from './session-runtime.js';
import { createAtriaShellEnvironment } from '../atria-shell/environment.js';
import { createAtriaStatePanel } from '../atria-shell/primitives.js';
import { confirmLibraryAction, referenceRemediation } from './library-ui.js';
import { createStudioNativeId } from './studio-authoring.js';
import { nativeStudioClient } from './studio-client.js';
import { runtimeReadiness } from './runtime-readiness.js';
import { mountPromptRuntimeControls } from './prompt-runtime-controls.js';

const sectionLabels = { routes: 'Routes', models: 'Models', connections: 'Connections', retrieval: 'Retrieval', diagnostics: 'Diagnostics' };
const resourceLabels = { routes: 'route', models: 'model', connections: 'connection' };
const roleLabels = { intent_resolver: 'Intent resolver', event_interpreter: 'Event interpreter', orchestrator: 'Orchestrator', studio: 'Studio', memory: 'Memory', search: 'Search', narrator: 'Narrator', actor: 'Actor', summarizer: 'Summarizer', planner: 'Planner', critic: 'Critic', embedding: 'Embedding', reranker: 'Reranker', director: 'Director', authoring: 'Authoring' };
const ids = { connections: 'connectionProfileId', models: 'modelProfileId', routes: 'runtimeRouteId' };
const prefixes = { connections: 'conn', models: 'model', routes: 'route' };
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
        if (target) button(fmt('Open ${0}', [translateShellText(sectionLabels[target] || target)]), () => host.openRuntimeSection(target), parent);
        void referenceRemediation(doc, parent, error, host);
    }
    function field(parent, label, value = '', options) {
        const wrap = node('label', label, parent);
        const input = node(options ? 'select' : 'input', undefined, wrap);
        input.name = label; input.autocomplete = 'off'; input.spellcheck = false;
        input.setAttribute('aria-label', translateShellText(label));
        if (options) {
            for (const [key, title, literal] of options) { const opt = node('option', undefined, input); opt.textContent = literal ? title : translateShellText(title); opt.value = key; }
            if (value && !options.some(([key]) => key === String(value))) { const opt = node('option', fmt('${0} (retained)', [value]), input); opt.value = value; }
        }
        input.value = String(value ?? ''); return input;
    }
    function number(parent, label, value, min = 0, max) {
        const input = field(parent, label, value); input.type = 'number'; input.min = min; input.step = 'any';
        if (max !== undefined) input.max = max;
        return input;
    }
    function heading(title, description) { const header = node('header'); header.className = 'atri-runtime-heading'; node('h2', title, header); node('p', description, header).className = 'atri-runtime-description'; }
    function bindEditorKeyboard(back) {
        root.onkeydown = event => {
            if (event.key === 'Tab' && root.getAttribute('role') === 'dialog') {
                const controls = [...root.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary')].filter(control => control.getClientRects().length);
                const first = controls[0]; const last = controls.at(-1);
                if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
            }
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!back.disabled) back.click(); }
        };
    }
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
        return [['', 'Choose an exact revision…'], ...scopedResources.filter(item => item.ref.resourceType === type && item.ref.scope !== 'library').map(item => [refKey(item.ref), item.resource.displayName + ' · ' + item.ref.revision + ' · ' + item.ref.scope, true]), ...data.resources.filter(item => item.resourceType === type && !item.archived)
            .flatMap(item => (item.revisions.length ? item.revisions : [item.currentRevision]).map(revision => [refKey({ ...exact(item), revision }), item.displayName + ' · ' + revision + ' · ' + translateShellText('Library'), true]))];
    }
    function summary(item) {
        if (section === 'connections') return item.providerAdapter.replace('provider.', '') + ' · ' + item.endpoint;
        if (section === 'models') return fmt('${0} · ${1} context tokens', [item.remoteModelId, item.limits.contextTokens]);
        return fmt('${0} · ${1} fallback routes', [translateShellText(roleLabels[item.role.replace('role.', '')] || item.role), item.fallbackRouteRefs.length]);
    }
    function readiness() {
        const panel = node('details'); panel.className = 'atri-runtime-group';
        node('summary', 'Runtime setup', panel);
        const content = node('div', undefined, panel);
        const refresh = async (initial = false) => {
            content.replaceChildren(); notice('Checking configuration…', content);
            try {
                const [configuration, secrets, resources] = await Promise.all([
                    initial ? data : runtimeRequest('/configuration', { signal: controller.signal }),
                    runtimeRequest('/secrets', { signal: controller.signal }),
                    runtimeRequest('/resources', { signal: controller.signal }),
                ]);
                if (disposed || !panel.isConnected) return;
                const steps = runtimeReadiness(configuration, secrets, resources);
                content.replaceChildren();
                const next = steps.find(step => !step.ready); panel.open = !!next;
                notice(next ? 'Complete the next missing dependency, then check again.' : 'Configuration linked. Use Diagnostics to preview your exact context before generation.', content);
                const list = node('ol', undefined, content);
                for (const step of steps) {
                    const item = node('li', undefined, list);
                    node('span', step.label, item);
                    node('span', step.ready ? ' — Configured' : ' — Needs setup', item);
                    if (step === next) button(fmt('Set up ${0}', [translateShellText(step.label)]), () => step.owner === 'library' ? host.openLibrarySection(step.section) : host.openRuntimeSection(step.section), item);
                }
                if (!next) button('Open Diagnostics', () => host.openRuntimeSection('diagnostics'), content);
            } catch {
                if (disposed || !panel.isConnected) return;
                panel.open = true;
                content.replaceChildren(); notice('Could not check Runtime setup. Retry to read the current configuration.', content, true);
            }
            if (!disposed && panel.isConnected) button('Check setup again', () => refresh(), content);
        };
        let checked = false;
        panel.addEventListener('toggle', () => {
            if (panel.open && !checked) { checked = true; void refresh(true); }
        });
    }
    function renderList() {
        editorSequence += 1;
        activeEditor = null; root.onkeydown = null; restoreShell(); body.append(root); root.replaceChildren(); delete root.dataset.editor;
        root.removeAttribute('role'); root.removeAttribute('aria-modal'); root.removeAttribute('aria-label');
        heading(translateShellText(sectionLabels[section]), {
            routes: 'Choose how each role runs. Every route binds a model, connection and exact Generation and Prompt resources.',
            connections: 'Provider endpoints and exact Secret references. Credentials stay in the existing Secret store.',
            models: 'Remote model identity, context limits and capability provenance.',
        }[section]);
        readiness();
        if (section === 'routes') {
            const fallbackIds = new Set(data.routes.flatMap(item => item.fallbackRouteRefs.map(ref => ref.runtimeRouteId)));
            const missing = []; const ambiguous = [];
            for (const role of roles) {
                const matches = data.routes.filter(item => item.role === 'role.' + role && !fallbackIds.has(item.runtimeRouteId));
                if (!matches.length) missing.push(translateShellText(roleLabels[role] || role));
                if (matches.length > 1) ambiguous.push(translateShellText(roleLabels[role] || role));
            }
            if (missing.length) notice(fmt('Not configured: ${0}. Create a route for each role you use.', [missing.join(', ')]));
            if (ambiguous.length) notice(fmt('Ambiguous primary routes: ${0}. Edit roles or fallback links.', [ambiguous.join(', ')]));
        }
        const toolbar = node('div'); toolbar.className = 'atri-runtime-toolbar';
        const search = field(toolbar, fmt('Filter ${0}', [translateShellText(section)])); search.type = 'search';
        button(fmt('New ${0}', [translateShellText(resourceLabels[section])]), () => edit(), toolbar);
        const list = node('div'); list.className = 'atri-runtime-list';
        function fill() {
            list.replaceChildren();
            const items = data[section].filter(item => (item.displayName + ' ' + summary(item)).toLowerCase().includes(search.value.toLowerCase()));
            if (!items.length) list.append(createAtriaStatePanel(doc, 'empty', {
                title: data[section].length ? translateShellText('No matching results.') : fmt('No ${0} yet. Create one to get started.', [translateShellText(section)]),
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
    async function edit(original, fresh = false) {
        const editorToken = ++editorSequence;
        activeEditor = original?.[ids[section]] || 'new';
        if (section === 'routes') {
            root.replaceChildren(createAtriaStatePanel(doc, 'loading', { title: translateShellText('Loading Native Runtime…') }));
            try {
                const resources = await runtimeRequest('/resources', { signal: controller.signal });
                if (disposed || editorToken !== editorSequence) return;
                scopedResources = resources;
            } catch (error) {
                if (!disposed && editorToken === editorSequence) { renderList(); failure(error, root); }
                return;
            }
        }
        const value = original ? clone(original) : { schemaVersion: 1, scope: 'player', [ids[section]]: prefixes[section] + '_' + crypto.randomUUID().replaceAll('-', ''), displayName: '' };
        root.replaceChildren(); root.dataset.editor = 'true';
        adaptEditor();
        const header = node('header'); header.className = 'atri-runtime-editor-header';
        const back = button(fmt('Back to ${0}', [translateShellText(section)]), () => { renderList(); root.querySelector('input')?.focus(); }, header);
        const title = node('h2', fmt(original && !fresh ? 'Edit ${0}' : 'New ${0}', [translateShellText(resourceLabels[section])]), header); title.tabIndex = -1;
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
        } else {
            let fields = group(form, 'Routing');
            const role = field(fields, 'Role', value.role || 'role.narrator', roles.map(item => ['role.' + item, roleLabels[item] || item]));
            node('p', 'The model determines the connection. Generation and Prompt stay pinned to the selected revision.', fields).className = 'atri-runtime-help';
            const model = field(fields, 'Model', value.modelProfileRef?.modelProfileId, options(data.models, ids.models)); model.required = true;
            const connection = field(fields, 'Connection', value.connectionProfileRef?.connectionProfileId, options(data.connections, ids.connections)); connection.disabled = true;
            const sync = () => { connection.value = data.models.find(item => item.modelProfileId === model.value)?.connectionProfileRef.connectionProfileId || ''; }; model.addEventListener('change', sync); sync();
            fields = group(form, 'Exact resources');
            const presets = data.resources.filter(item => item.preset);
            const presetPicker = field(fields, 'Prompt Preset', '', [['', 'Keep exact resource selection'], ...presets.map(item => [item.resourceId, item.displayName, true])]);
            const generation = field(fields, 'Generation — exact revision', value.generationProfileRef ? refKey(value.generationProfileRef) : '', resourceOptions('core.generation-profile')); generation.required = true;
            const prompt = field(fields, 'Prompt — exact revision', value.promptProgramRef ? refKey(value.promptProgramRef) : '', resourceOptions('core.prompt-program')); prompt.required = true;
            const syncPreset = () => {
                const selected = presets.find(item => item.resourceId === presetPicker.value);
                if (selected) {
                    prompt.value = refKey({ scope: 'library', resourceType: 'core.prompt-program', resourceId: selected.resourceId, revision: selected.currentRevision });
                    generation.value = refKey(selected.preset.refs.find(ref => ref.resourceType === 'core.generation-profile'));
                }
                prompt.disabled = generation.disabled = Boolean(selected);
            };
            presetPicker.addEventListener('change', syncPreset);
            const currentPreset = presets.find(item => item.resourceId === value.promptProgramRef?.resourceId && item.currentRevision === value.promptProgramRef?.revision && refKey(item.preset.refs.find(ref => ref.resourceType === 'core.generation-profile')) === refKey(value.generationProfileRef));
            if (currentPreset) { presetPicker.value = currentPreset.resourceId; syncPreset(); }
            notice('Choose a preset to select its program and generation settings together. Existing exact references stay pinned.', fields);
            button('Manage models', () => host.openRuntimeSection('models'), fields);
            button('Prompt Presets', () => host.openLibrarySection('prompt-presets'), fields);
            fields = group(form, 'Fallback order');
            let fallbackIds = (value.fallbackRouteRefs || []).map(item => item.runtimeRouteId);
            const fallbackList = node('div', undefined, fields);
            function showFallbacks() {
                fallbackList.replaceChildren();
                fallbackIds.forEach((id, index) => {
                    const row = node('div', undefined, fallbackList); row.className = 'atri-runtime-toolbar';
                    node('span', undefined, row).textContent = (index + 1) + '. ' + (data.routes.find(item => item.runtimeRouteId === id)?.displayName || 'Missing route: ' + id);
                    if (index) button('Move up', () => { [fallbackIds[index - 1], fallbackIds[index]] = [id, fallbackIds[index - 1]]; showFallbacks(); fallbackList.querySelector('button')?.focus(); }, row);
                    button('Remove fallback', () => { fallbackIds = fallbackIds.filter(item => item !== id); showFallbacks(); (fallbackList.querySelector('button') || fallback).focus(); }, row);
                });
                refreshChoices();
            }
            const eligible = () => data.routes.filter(item => item.runtimeRouteId !== value.runtimeRouteId && item.role === role.value);
            const fallback = field(fields, 'Add fallback route', '', [['', 'Choose…']]);
            const addFallback = button('Add fallback', () => { if (eligible().some(item => item.runtimeRouteId === fallback.value) && !fallbackIds.includes(fallback.value)) { fallbackIds.push(fallback.value); showFallbacks(); fallback.focus(); } }, fields);
            function refreshChoices() {
                const previous = fallback.value; fallback.replaceChildren();
                for (const [id, label] of options(eligible().filter(item => !fallbackIds.includes(item.runtimeRouteId)), ids.routes)) {
                    const option = node('option', undefined, fallback); option.value = id; option.textContent = id ? label : translateShellText(label);
                }
                fallback.value = previous; addFallback.disabled = !fallback.value;
            }
            fallback.addEventListener('change', () => { addFallback.disabled = !fallback.value; });
            const fallbackStatus = node('div', undefined, fields);
            role.addEventListener('change', () => {
                const allowed = new Set(eligible().map(item => item.runtimeRouteId));
                const previous = fallbackIds.length; fallbackIds = fallbackIds.filter(id => allowed.has(id));
                fallbackStatus.replaceChildren();
                if (previous !== fallbackIds.length) notice('Incompatible fallbacks were removed from this draft after the role changed.', fallbackStatus);
                showFallbacks();
            });
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
        if (original && !fresh) {
            const lifecycle = group(form, 'Manage this resource');
            button('Duplicate', () => edit({ ...clone(value), [ids[section]]: createStudioNativeId(prefixes[section]), displayName: value.displayName + ' Copy' }, true), lifecycle);
            const remove = button('Delete', async () => {
                if (remove.disabled) return;
                remove.disabled = true;
                try {
                    if (!await confirmLibraryAction('Delete this Runtime resource? Referenced items cannot be deleted.')) return;
                    await runtimeRequest('/configuration/' + section + '/' + encodeURIComponent(value[ids[section]]), { method: 'DELETE', signal: controller.signal });
                    if (disposed || editorToken !== editorSequence) return;
                    selectedRoute = { ...selectedRoute, child: { id: section } };
                    await load();
                } catch (error) {
                    if (disposed || editorToken !== editorSequence) return;
                    status.replaceChildren(); failure(error, status);
                } finally { remove.disabled = false; }
            }, lifecycle);
            remove.className = 'atri-runtime-danger';
        }
        form.append(actions);
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
        bindEditorKeyboard(back);
        title.focus();
    }
    function evidence(result, parent) {
        const snapshot = result.snapshot;
        node('h3', result.preview ? 'Compiled preview — no request sent' : 'Latest effective request', parent);
        notice(fmt('Input: ${0} / ${1} tokens · reserved output: ${2}', [snapshot.diagnostics.inputTokens, snapshot.contextPlan.budget.maxTokens, snapshot.contextPlan.budget.reservedOutputTokens]), parent);
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
        const promptControls = node('div', undefined, routing);
        routeSelect.addEventListener('change', () => {
            promptControls.replaceChildren();
            if (routeSelect.value) void mountPromptRuntimeControls({ document: doc, root: promptControls, routeId: routeSelect.value });
        });
        if (!data.routes.length) { notice('Create a route before compiling a preview.', routing); button('Manage routes', () => host.openRuntimeSection('routes'), routing); }
        const context = group(form, 'Pinned context', nativeSessionRuntime.active ? 'The current Native session supplies the exact context.' : 'Choose a Project and its exact revision, or open a Native game.');
        const project = field(context, 'Build Project', '', [['', 'Choose…']]); const revision = field(context, 'Exact Project revision', '', [['', 'Choose…']]);
        project.required = revision.required = true;
        project.disabled = true; revision.disabled = true;
        project.parentElement.hidden = revision.parentElement.hidden = nativeSessionRuntime.active;
        if (!nativeSessionRuntime.active) {
            let inventory = []; let inventoryVersion = 0;
            const feedback = node('div', undefined, context);
            const advanced = node('details', undefined, context); node('summary', 'Advanced / raw context IDs', advanced);
            const raw = node('pre', '', advanced);
            const updateRevision = (previous = null) => {
                const selected = inventory.find(item => item.project.projectId === project.value);
                revision.replaceChildren();
                const empty = node('option', 'Choose…', revision); empty.value = '';
                if (selected) {
                    const option = node('option', undefined, revision); option.value = selected.revision.revision;
                    option.textContent = translateShellText('Current Build revision') + ' · ' + selected.revision.revision.slice(0, 12);
                    revision.value = previous === null || previous === selected.revision.revision ? selected.revision.revision : '';
                    if (previous && previous !== selected.revision.revision) notice('The Project revision changed. Select its current revision before previewing.', feedback);
                }
                revision.disabled = !selected;
                raw.textContent = JSON.stringify({ projectId: project.value || null, revision: revision.value || null }, null, 2);
            };
            project.addEventListener('change', () => { feedback.replaceChildren(); updateRevision(); });
            revision.addEventListener('change', () => { raw.textContent = JSON.stringify({ projectId: project.value, revision: revision.value }, null, 2); });
            const refreshProjects = async () => {
                const version = ++inventoryVersion; const previous = project.value; const pinned = revision.value;
                project.disabled = revision.disabled = true; feedback.replaceChildren(); notice('Loading Build Projects…', feedback);
                try {
                    const result = await nativeStudioClient.listProjects();
                    if (disposed || version !== inventoryVersion || !context.isConnected) return;
                    if (!Array.isArray(result)) throw new Error('Invalid Project inventory');
                    inventory = result; project.replaceChildren();
                    const empty = node('option', 'Choose…', project); empty.value = '';
                    for (const item of inventory) {
                        const option = node('option', undefined, project); option.value = item.project.projectId;
                        option.textContent = item.project.displayName + ' · ' + item.project.projectId.slice(-8);
                    }
                    project.value = previous; project.disabled = !inventory.length; feedback.replaceChildren(); updateRevision(pinned);
                    if (!inventory.length) notice('No Build Projects are available. Create one in Build or open a Native game.', feedback);
                } catch {
                    if (disposed || version !== inventoryVersion || !context.isConnected) return;
                    feedback.replaceChildren(); notice('Could not load Build Projects. Retry to choose an exact context.', feedback, true);
                }
            };
            button('Refresh Projects', refreshProjects, context);
            button('Open Build', () => host.openBuild(), context);
            notice('Preview uses the selected current Build revision. Later edits require an explicit refresh and selection.', context);
            void refreshProjects();
        }
        const message = field(group(form, 'Preview input'), 'Preview message', 'Preview this route.');
        const actions = node('footer', undefined, form); actions.className = 'atri-runtime-actions';
        const submit = node('button', 'Compile preview', actions); submit.type = 'submit';
        const result = node('div'); result.className = 'atri-runtime-evidence';
        form.addEventListener('submit', async event => {
            event.preventDefault(); if (submit.disabled) return; submit.disabled = true; submit.setAttribute('aria-busy', 'true'); result.replaceChildren(); notice('Compiling…', result);
            try {
                const snapshot = nativeSessionRuntime.snapshot;
                const source = nativeSessionRuntime.active ? { sessionId: snapshot.session.sessionId, revisionId: snapshot.revision.revisionId } : project.value ? { projectId: project.value, revision: revision.value } : {};
                if (!nativeSessionRuntime.active && (!source.projectId || !source.revision || project.disabled || revision.disabled)) throw Object.assign(new Error('Select a Project context'), { code: 'native_generation_context_required' });
                const selected = data.routes.find(item => item.runtimeRouteId === routeSelect.value);
                const preview = await runtimeRequest('/preview', { method: 'POST', signal: controller.signal, body: { ...source, requestId: createStudioNativeId('preview'), role: selected.role.slice(5), routeRef: { scope: 'player', runtimeRouteId: selected.runtimeRouteId }, messages: [{ role: 'user', content: message.value }] } });
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
            if (section === 'retrieval') {
                await renderRetrievalWorkspace({ root, node, field, group, button, notice, bindEditorKeyboard, signal: controller.signal, enter: () => { activeEditor = 'retrieval'; root.dataset.editor = 'true'; adaptEditor(); }, leave: () => { activeEditor = null; root.onkeydown = null; delete root.dataset.editor; restoreShell(); if (root.parentNode !== body) body.append(root); root.removeAttribute('role'); root.removeAttribute('aria-modal'); root.removeAttribute('aria-label'); } });
                return;
            }
            const configuration = await runtimeRequest('/configuration', { signal: controller.signal });
            if (disposed || sequence !== loadingSequence) return;
            data = configuration;
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
