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
            const adapter = field(fields, 'Provider transport', value.providerAdapter || 'provider.openai-compatible', [['provider.openai-compatible', 'OpenAI-compatible messages'], ['provider.raw-text', 'Raw text completions']]);
            const endpoint = field(fields, 'Completions endpoint URL', value.endpoint); endpoint.type = 'url'; endpoint.required = true;
            fields = group(form, 'Authentication');
            const secret = field(fields, 'Exact Secret ID', value.secretRef?.secretId); secret.required = true;
            notice('Bearer authentication only. Enter the stored Secret ID, never the key value. Anthropic and Gemini transports are not available.', fields);
            serialize = () => ({ ...value, providerAdapter: adapter.value, transport: 'transport.http', endpoint: endpoint.value, secretRef: { scope: 'player', secretId: secret.value } });
        } else if (section === 'models') {
            let fields = group(form, 'Model connection');
            const connection = field(fields, 'Connection', value.connectionProfileRef?.connectionProfileId, options(data.connections, ids.connections)); connection.required = true;
            button('Manage connections', () => host.openRuntimeSection('connections'), fields);
            const remote = field(fields, 'Remote model ID', value.remoteModelId); remote.required = true;
            fields = group(form, 'Token budget');
            const context = number(fields, 'Context tokens', value.limits?.contextTokens || 16000, 1);
            const output = number(fields, 'Output token limit', value.limits?.outputTokens || 1024, 1);
            const encoding = field(fields, 'Tokenizer encoding', value.tokenizer?.encoding || 'cl100k_base', [['cl100k_base', 'cl100k_base'], ['o200k_base', 'o200k_base']]);
            fields = group(form, 'Capabilities');
            notice('Adapter metadata supports streaming for both transports, and tools / structured output for OpenAI-compatible. Model restrictions still apply. Unknown required capabilities fail closed.', fields);
            const capabilities = ['generation.streaming', 'generation.tools', 'generation.structured-output'].map(capability => {
                const existing = value.capabilities?.find(item => item.capability === capability);
                const input = field(fields, capability, existing?.state || '', [['', 'Use adapter metadata'], ['unknown', 'Unknown'], ['unsupported', 'Unsupported'], ['supported', 'Supported — explicit user override']]);
                node('small', existing ? existing.provenance.map(item => item.kind + ': ' + item.source).join(' · ') : 'Provenance: built-in adapter metadata', fields);
                return { capability, input, existing };
            });
            serialize = () => ({ ...value, connectionProfileRef: { scope: 'player', connectionProfileId: connection.value }, remoteModelId: remote.value,
                limits: { contextTokens: Number(context.value), outputTokens: Number(output.value) }, tokenizer: { encoding: encoding.value, source: 'user' },
                capabilities: [...(value.capabilities || []).filter(item => !capabilities.some(entry => entry.capability === item.capability)), ...capabilities.filter(item => item.input.value).map(item => item.existing?.state === item.input.value ? item.existing : { capability: item.capability, state: item.input.value, provenance: [{ kind: 'user-override', source: 'Runtime Models' }] })] });
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
            notice('Supported controls are shown here. Reasoning, cache, provider extensions and model hints are currently unsupported. Existing unsupported fields are preserved and preview rejects them.', fields);
            serialize = () => {
                const result = { ...value, revision: revision.value, sampling: { ...value.sampling }, output: { ...value.output, maxTokens: Number(max.value) }, streaming: { ...value.streaming, enabled: stream.value === 'true' }, stop: { ...value.stop, sequences: JSON.parse(stop.value) }, toolChoice: tools.value ? { ...value.toolChoice, value: tools.value } : {} };
                delete result.scope;
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
