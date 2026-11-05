import { mountProtocolControls } from './protocol-controls.js';
import { confirmAtriaDraftLeave, observeAtriaDrafts } from '../atria-shell/workspace-leave-guard.js';
import { renderRetrievalWorkspace } from './retrieval-workspace.js';
import { mountResourceSource } from './resource-source-editor.js';
import { NATIVE_GENERATION_DEFAULTS as generationDefaults } from '../../shared/native-generation-defaults.js';
import { formatShellText as fmt, translateShellText } from '../atria-shell/localization.js';
import { runtimeRequest, runtimeRemediation, getRuntimeEvidence } from './runtime-client.js';
import { nativeSessionRuntime } from './session-runtime.js';
import { createAtriaShellEnvironment } from '../atria-shell/environment.js';
import { createAtriaStatePanel } from '../atria-shell/primitives.js';
import { createAtriaIcon } from '../atria-shell/icons.js';
import { confirmLibraryAction, referenceRemediation } from './library-ui.js';
import { createStudioNativeId } from './studio-authoring.js';
import { nativeStudioClient } from './studio-client.js';
import { mountRuntimeSetup, normalizeChatEndpoint } from './runtime-setup.js';
import { mountPromptRuntimeControls } from './prompt-runtime-controls.js';
import { NOVELAI_IMAGE_ENDPOINT, NOVELAI_IMAGE_ADAPTERS, officialNovelaiCapabilities, novelaiConnectionCapabilities } from '../../shared/novelai-illustration.js';
import { assertComputeBudget } from '../../shared/native-compute-budget.js';
import { connectionRequiresSecret } from '../../shared/native-connection-auth.js';
import { mountApiPresetFields } from './api-preset-fields.js';
// Sent only when the reader opts in for a relay that rejects non-browser clients.
const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const sectionLabels = { routes: 'API presets', models: 'API presets', connections: 'Services', retrieval: 'Memory search', diagnostics: 'Diagnostics' };
const resourceLabels = { routes: 'API preset', models: 'API preset', connections: 'service' };
// Services are chosen by what they are for, then by protocol.
const PURPOSES = [
    ['chat', 'Chat models', 'chat', [['provider.openai-compatible', 'OpenAI-compatible'], ['provider.anthropic', 'Anthropic Claude'], ['provider.gemini', 'Google Gemini'], ['provider.raw-text', 'Text completion (legacy)']]],
    ['image', 'Image generation', 'image', [['provider.novelai-image', 'NovelAI'], ['provider.novelai-image-compatible', 'NovelAI-compatible relay'], ['provider.openai-images', 'OpenAI Images'], ['provider.gemini-image', 'Gemini images'],
        ['provider.comfyui-image', 'ComfyUI workflow'], ['provider.sd-webui-image', 'Stable Diffusion WebUI'], ['provider.forge-image', 'Forge'], ['provider.runninghub-image', 'RunningHub workflow']]],
    ['tools', 'Tools (MCP)', 'terminal', [['provider.mcp', 'MCP server']]],
    ['agents', 'Agents (A2A)', 'users', [['provider.a2a', 'A2A agent']]],
];
const purposeOf = adapter => (PURPOSES.find(([, , , adapters]) => adapters.some(([id]) => id === adapter)) || PURPOSES[0])[0];
const purposeIndex = adapter => PURPOSES.findIndex(entry => entry[0] === purposeOf(adapter));
const adapterLabel = adapter => PURPOSES.flatMap(entry => entry[3]).find(([id]) => id === adapter)?.[1] || adapter.replace('provider.', '');
const ADDRESS_HINTS = {
    'provider.openai-compatible': 'Paste the base address, such as https://api.example.com/v1. Atria adds /chat/completions.',
    'provider.raw-text': 'Paste the base address, such as http://127.0.0.1:5000/v1. Atria adds /completions.',
    'provider.anthropic': 'Usually https://api.anthropic.com/v1/messages.',
    'provider.gemini': 'Usually https://generativelanguage.googleapis.com/v1beta.',
    'provider.novelai-image': 'Uses the official NovelAI address.',
    'provider.novelai-image-compatible': 'The full generation address from your relay’s documentation.',
    'provider.openai-images': 'The API base address, such as https://api.openai.com/v1.',
    'provider.gemini-image': 'The API base address, such as https://generativelanguage.googleapis.com/v1beta.',
    'provider.comfyui-image': 'The server address, such as http://127.0.0.1:8188.',
    'provider.sd-webui-image': 'The server address, such as http://127.0.0.1:7860.',
    'provider.forge-image': 'The server address, such as http://127.0.0.1:7860.',
    'provider.runninghub-image': 'The RunningHub API base address.',
    'provider.mcp': 'The MCP server’s HTTP address.',
    'provider.a2a': 'The agent’s A2A address.',
};
const roleLabels = { illustration_prompt: 'Illustration prompt', intent_resolver: 'Intent resolver', event_interpreter: 'Event interpreter', orchestrator: 'Orchestrator', studio: 'Studio', memory: 'Memory', search: 'Search', narrator: 'Narrator', actor: 'Actor', summarizer: 'Summarizer', planner: 'Planner', critic: 'Critic', embedding: 'Embedding', reranker: 'Reranker', director: 'Director', authoring: 'Authoring' };
const ids = { connections: 'connectionProfileId', models: 'modelProfileId', routes: 'runtimeRouteId' };
const prefixes = { connections: 'conn', models: 'model', routes: 'route' };
const roles = ['narrator', 'intent_resolver', 'event_interpreter', 'orchestrator', 'studio', 'memory', 'search', 'illustration_prompt'];
const clone = value => JSON.parse(JSON.stringify(value));
const exact = item => ({ scope: 'library', resourceType: item.resourceType, resourceId: item.resourceId, revision: item.currentRevision });
const refKey = value => JSON.stringify(value, Object.keys(value).sort());
// Guard renderer shapes only. The Runtime service validates the complete contract.
function assertRuntimeEditorShape(value) {
    const reject = key => { throw new TypeError(translateShellText('Unsupported resource field shape:') + ' ' + key); };
    for (const key of ['displayName', 'providerAdapter', 'transport', 'endpoint', 'remoteModelId', 'role']) if (value[key] !== undefined && typeof value[key] !== 'string') reject(key);
    for (const key of ['options', 'networkPolicy', 'secretRef', 'connectionProfileRef', 'modelProfileRef', 'generationProfileRef', 'promptProgramRef', 'policy', 'limits', 'limitProvenance', 'tokenizer', 'messageFormat', 'providerHints', 'promptParameters', 'executionPolicy']) if (value[key] !== undefined && (!value[key] || typeof value[key] !== 'object' || Array.isArray(value[key]))) reject(key);
    for (const key of ['capabilities', 'fallbackRouteRefs', 'requirements']) if (value[key] !== undefined && !Array.isArray(value[key])) reject(key);
    for (const item of value.capabilities || []) if (!item || typeof item !== 'object' || Array.isArray(item)) reject('capabilities');
    for (const item of Object.values(value.limitProvenance || {})) if (!Array.isArray(item)) reject('limitProvenance');
}

export function mountNativeRuntimeWorkspace({ document: doc, body, section, route, host }) {
    let disposed = false; let returnToIllustrations = false; let data; let refillList = null; let scopedResources = []; let selectedRoute = route; let activeEditor = null; let restoreShell = () => {};
    const controller = new AbortController();
    const root = doc.createElement('section');
    root.className = 'atri-runtime'; root.dataset.atriaRuntimeNative = section;
    body.replaceChildren(root);
    const drafts = observeAtriaDrafts({ document: doc, root });
    const environment = createAtriaShellEnvironment(root);
    let loadingSequence = 0; let editorSequence = 0;
    let canvas = root;
    let compactDialog = null;
    function adaptEditor() {
        if (!activeEditor) return;
        const focused = doc.activeElement;
        if (environment.get().mode === 'compact') {
            if (!compactDialog) {
                // Keep the editor under the theme/component authority. The native
                // top layer supplies modal isolation without moving outside it.
                const dialog = doc.createElement('dialog'); compactDialog = dialog;
                dialog.className = 'atri-runtime-modal'; dialog.setAttribute('aria-label', translateShellText('Runtime editor'));
                body.append(dialog); dialog.append(root); dialog.showModal();
                dialog.addEventListener('cancel', event => { event.preventDefault(); root.querySelector('.atri-runtime-editor-header > button:not(:disabled)')?.click(); });
                restoreShell = () => { body.append(root); dialog.close(); dialog.remove(); compactDialog = null; restoreShell = () => {}; };
            }
        } else {
            restoreShell(); if (root.parentNode !== body) body.append(root);
            root.removeAttribute('role'); root.removeAttribute('aria-modal'); root.removeAttribute('aria-label');
        }
        if (root.contains(focused)) focused.focus({ preventScroll: true });
        if (environment.get().keyboardOpen) focused?.scrollIntoView?.({ block: 'nearest' });
    }
    environment.subscribe(adaptEditor);
    function node(tag, text, parent = canvas) {
        const el = doc.createElement(tag); if (text !== undefined) el.textContent = tag === 'pre' ? text : translateShellText(text);
        parent?.append(el); return el;
    }
    function button(text, action, parent = canvas) {
        const el = node('button', text, parent); el.type = 'button'; el.addEventListener('click', action); return el;
    }
    function notice(text, parent = canvas, error = false) {
        const el = node('p', text, parent); el.className = 'atri-runtime-notice'; el.setAttribute('role', error ? 'alert' : 'status'); return el;
    }
    function failure(error, parent) {
        const [message, target] = runtimeRemediation(error.code || error.message);
        const alert = notice(message, parent, true); alert.tabIndex = -1; alert.focus();
        if (target) button(fmt('Open ${0}', [translateShellText(sectionLabels[target] || target)]), () => host.openRuntimeSection(target), parent);
        void referenceRemediation(doc, parent, error, host);
    }
    function field(parent, label, value = '', options, multiline = false) {
        const wrap = node('label', label, parent);
        const input = node(options ? 'select' : multiline ? 'textarea' : 'input', undefined, wrap);
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
            if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
            if (event.key === 'Tab' && compactDialog?.open) {
                const controls = [...root.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary')].filter(control => control.getClientRects().length);
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
    const options = (items, key) => [['', 'Choose…'], ...items.map(item => [item[key], item.displayName + ' · ' + item[key].slice(-8), true])];
    function resourceOptions(type) {
        return [['', 'Choose an exact revision…'], ...scopedResources.filter(item => item.ref.resourceType === type && item.ref.scope !== 'library').map(item => [refKey(item.ref), item.resource.displayName + ' · ' + item.ref.revision + ' · ' + item.ref.scope, true]), ...data.resources.filter(item => item.resourceType === type && !item.archived)
            .flatMap(item => (item.revisions.length ? item.revisions : [item.currentRevision]).map(revision => [refKey({ ...exact(item), revision }), item.displayName + ' · ' + revision + ' · ' + translateShellText('Library'), true]))];
    }
    function summary(item) {
        if (section === 'connections') { let place = item.endpoint; try { place = new URL(item.endpoint).host; } catch { /* Show the stored text. */ } return translateShellText(adapterLabel(item.providerAdapter)) + ' · ' + place; }
        if (section === 'models') return fmt('${0} · ${1} context tokens', [item.remoteModelId, item.limits.contextTokens]);
        const model = data.models.find(value => value.modelProfileId === item.modelProfileRef.modelProfileId);
        const connection = data.connections.find(value => value.connectionProfileId === item.connectionProfileRef.connectionProfileId);
        // Default names already read "Service · model"; repeat only what the name omits.
        return [connection?.displayName, model?.remoteModelId].filter(part => part && !item.displayName.includes(part)).join(' · ');
    }
    function resetCanvas() {
        editorSequence += 1; refillList = null;
        canvas = root;
        activeEditor = null; root.onkeydown = null; restoreShell(); body.append(root); root.replaceChildren(); delete root.dataset.editor;
        root.removeAttribute('role'); root.removeAttribute('aria-modal'); root.removeAttribute('aria-label');
    }
    // Setup is the empty state of Models and its "add" action: one flow that
    // stores the key, the service and the API preset together.
    function openSetup({ inline = false } = {}) {
        if (inline) resetCanvas();
        else {
            ++editorSequence; activeEditor = 'setup';
            const pane = environment.get().mode !== 'compact' && root.querySelector('.atri-runtime-detail');
            if (pane) { canvas = pane; pane.replaceChildren(); root.dataset.editor = 'split'; for (const row of root.querySelectorAll('.atri-runtime-row')) row.setAttribute('aria-current', 'false'); } else { canvas = root; root.replaceChildren(); root.dataset.editor = 'true'; adaptEditor(); }
        }
        let back = null;
        if (!inline) {
            const header = node('header'); header.className = 'atri-runtime-editor-header atri-runtime-editor-header--bare';
            back = button('Back to models', () => { if (!confirmAtriaDraftLeave(doc, root)) return; renderList(); root.querySelector('.atri-runtime-listpane button')?.focus(); }, header);
        }
        const setup = mountRuntimeSetup({ doc, parent: canvas, data, host, signal: controller.signal,
            onCancel: back && (() => back.click()),
            onManual: () => edit(),
            onSaved: async () => {
                try { data = await runtimeRequest('/configuration', { signal: controller.signal }); refillList?.(); } catch { /* The done view stays; reopening Models reloads. */ }
                void host.refreshSearch?.();
            } });
        if (back) bindEditorKeyboard(back);
        setup.focus();
    }
    function renderList() {
        resetCanvas();
        if (section === 'routes' && !data.routes.length) { openSetup({ inline: true }); return; }
        heading(translateShellText(sectionLabels[section]), {
            routes: 'An API preset is a service, a model and its parameters. Stories choose one when they need a model.',
            connections: 'Services your models, image tools, MCP tools and A2A agents connect to. Keys stay on this server.',
        }[section]);
        // List-detail: the list stays put; the editor opens in the pane beside it.
        const split = node('div'); split.className = 'atri-runtime-split';
        const listPane = node('aside', undefined, split); listPane.className = 'atri-runtime-listpane';
        listPane.setAttribute('aria-label', translateShellText(sectionLabels[section]));
        const listHead = node('header', undefined, listPane); listHead.className = 'atri-runtime-listpane__head';
        const count = node('h3', undefined, listHead);
        const create = button(section === 'routes' ? 'Connect a model' : 'Add a service', () => section === 'routes' ? openSetup() : edit(), listHead);
        create.prepend(createAtriaIcon(doc, 'plus', { size: 15 }));
        const toolbar = node('div', undefined, listPane); toolbar.className = 'atri-runtime-toolbar';
        const search = field(toolbar, fmt('Filter ${0}', [translateShellText(sectionLabels[section] || section)])); search.type = 'search';
        search.placeholder = fmt('Filter ${0}', [translateShellText(sectionLabels[section] || section)]);
        toolbar.hidden = data[section].length < 6;
        const list = node('div', undefined, listPane); list.className = 'atri-runtime-list';
        const detail = node('section', undefined, split); detail.className = 'atri-runtime-detail';
        const empty = node('div', undefined, detail); empty.className = 'atri-runtime-detail__empty';
        if (section === 'routes') {
            node('p', 'Select an API preset to change its model or parameters.', empty);
        } else if (!data.connections.length) {
            node('p', 'To chat with a model, the quickest start is Models → Connect a model. Add image, MCP or A2A services here.', empty);
            button('Connect a chat model', () => host.openRuntimeSection('routes', 'new'), empty).dataset.variant = 'primary';
            button('Add a service', () => edit(), empty);
        } else node('p', 'Select a service to change its address or key.', empty);
        function fill() {
            list.replaceChildren();
            count.textContent = translateShellText(sectionLabels[section]) + ' · ' + data[section].length;
            const items = data[section].filter(item => (item.displayName + ' ' + summary(item)).toLowerCase().includes(search.value.toLowerCase()));
            if (!items.length) list.append(createAtriaStatePanel(doc, 'empty', {
                title: data[section].length ? translateShellText('No matching results.') : translateShellText('No services yet.'),
            }));
            let group = null;
            if (section === 'connections') items.sort((a, b) => purposeIndex(a.providerAdapter) - purposeIndex(b.providerAdapter));
            for (const item of items) {
                if (section === 'connections' && group !== purposeOf(item.providerAdapter)) {
                    group = purposeOf(item.providerAdapter);
                    node('h4', PURPOSES.find(entry => entry[0] === group)[1], list).className = 'atri-runtime-list__group';
                }
                const row = node('article', undefined, list); row.className = 'atri-runtime-row';
                row.dataset.atriaRuntimeItem = item[ids[section]];
                row.prepend(createAtriaIcon(doc, section === 'connections' ? PURPOSES.find(entry => entry[0] === purposeOf(item.providerAdapter))[2] : 'cube', { size: 16 }));
                const text = node('div', undefined, row); node('h3', undefined, text).textContent = item.displayName; node('p', undefined, text).textContent = summary(item);
                const editButton = button('Edit', () => edit(item), row);
                editButton.setAttribute('aria-label', translateShellText('Edit') + ' ' + item.displayName);
                row.addEventListener('click', event => { if (!event.target.closest('button')) editButton.click(); });
            }
        }
        search.addEventListener('input', fill); fill(); refillList = fill;
    }
    async function edit(original, fresh = false, cached = false) {
        const editorToken = ++editorSequence;
        activeEditor = original?.[ids[section]] || 'new';
        if (section === 'routes' && !cached) {
            const loadingPane = environment.get().mode !== 'compact' && root.querySelector('.atri-runtime-detail') || root;
            loadingPane.replaceChildren(createAtriaStatePanel(doc, 'loading', { title: translateShellText('Loading Native Runtime…') }));
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
        const pane = environment.get().mode !== 'compact' && root.querySelector('.atri-runtime-detail');
        if (pane) {
            canvas = pane; pane.replaceChildren(); root.dataset.editor = 'split';
            for (const row of root.querySelectorAll('.atri-runtime-row')) row.setAttribute('aria-current', String(row.dataset.atriaRuntimeItem === activeEditor));
        } else {
            canvas = root; root.replaceChildren(); root.dataset.editor = 'true';
            adaptEditor();
        }
        const header = node('header'); header.className = 'atri-runtime-editor-header';
        const back = button('Back to list', () => { if (!confirmAtriaDraftLeave(doc, root)) return; renderList(); root.querySelector('.atri-runtime-listpane button')?.focus(); }, header);
        if (host.hasRuntimeRepair?.()) button('Return to model setup', () => host.returnFromRuntimeRepair(), header);
        const title = node('h2', (original && !fresh ? 'Edit ' : 'New ') + resourceLabels[section], header); title.tabIndex = -1;
        const form = node('form'); form.className = 'atri-runtime-form';
        if (section === 'routes') form.classList.add('atri-api-preset-form');
        const identity = group(form, 'Identity');
        const name = field(identity, 'Name', value.displayName); name.required = true;
        identity.querySelector('legend').remove();
        let serialize, readApi;
        if (section === 'connections') {
            const initialAdapter = value.providerAdapter || 'provider.openai-compatible';
            let fields = group(form, 'Service'); fields.querySelector('legend').remove();
            const purposeLabel = node('p', 'What is this service for?', fields); purposeLabel.className = 'atri-runtime-help'; purposeLabel.id = 'atri-purpose-' + editorToken;
            const purpose = node('div', undefined, fields); purpose.className = 'atria-segmented atri-runtime-purpose';
            purpose.setAttribute('role', 'group'); purpose.setAttribute('aria-labelledby', purposeLabel.id);
            const adapter = field(fields, 'Service type', initialAdapter, PURPOSES.find(entry => entry[0] === purposeOf(initialAdapter))[3]);
            const chatTip = node('div', undefined, fields); chatTip.className = 'atri-runtime-tip';
            node('p', 'Setting up a chat model? Connect a model does the service, key and model in one step.', chatTip);
            button('Connect a model instead', () => host.openRuntimeSection('routes', 'new'), chatTip).dataset.variant = 'plain';
            const purposeButtons = PURPOSES.map(([id, label]) => {
                const item = button(label, () => setPurpose(id), purpose); item.className = 'atria-segmented__item'; item.dataset.purpose = id; return item;
            });
            function setPurpose(id, initial = false) {
                for (const item of purposeButtons) item.setAttribute('aria-pressed', String(item.dataset.purpose === id));
                const entries = PURPOSES.find(entry => entry[0] === id)[3];
                if (!initial) {
                    adapter.replaceChildren();
                    for (const [key, title] of entries) { const option = node('option', title, adapter); option.value = key; }
                    adapter.value = entries[0][0]; adapter.dispatchEvent(new doc.defaultView.Event('change'));
                }
                adapter.parentElement.hidden = entries.length === 1;
                chatTip.hidden = id !== 'chat' || Boolean(original && !fresh);
            }
            setPurpose(purposeOf(initialAdapter), true);
            const endpoint = field(fields, 'Service address', value.endpoint); endpoint.type = 'url'; endpoint.required = true; endpoint.inputMode = 'url';
            const addressHint = node('small', '', endpoint.parentElement); addressHint.className = 'atri-runtime-field-hint';
            const isChat = () => purposeOf(adapter.value) === 'chat';
            const address = () => isChat() ? normalizeChatEndpoint(adapter.value, endpoint.value) : endpoint.value.trim();
            const syncAddress = () => {
                addressHint.textContent = translateShellText(ADDRESS_HINTS[adapter.value] || '');
                if (isChat() && endpoint.value.trim() && address() !== endpoint.value.trim()) addressHint.textContent += ' ' + fmt('Atria will call ${0}', [address()]);
                endpoint.readOnly = adapter.value === 'provider.novelai-image';
            };
            endpoint.addEventListener('input', syncAddress);
            const relay = node('details', undefined, fields); relay.className = 'atri-runtime-more';
            node('summary', 'Relay capabilities', relay);
            notice('Describe what your relay supports, using the JSON from its documentation. If it forwards official NovelAI requests unchanged, use official forwarding.', relay);
            const imageCapabilities = field(relay, 'Image capabilities (JSON)', value.options?.imageCapabilities ? JSON.stringify(value.options.imageCapabilities, null, 2) : '', undefined, true);
            button('Use official protocol forwarding', () => { imageCapabilities.value = JSON.stringify(officialNovelaiCapabilities(), null, 2); }, relay);
            const userAgent = field(relay, 'User-Agent (only if your relay asks for a browser client)', value.options?.userAgent ?? '');
            button('Use a browser User-Agent', () => { userAgent.value = BROWSER_USER_AGENT; }, relay);
            const insecureLabel = node('label', undefined, relay); const insecure = node('input', undefined, insecureLabel); insecure.type = 'checkbox'; insecure.checked = value.options?.allowInsecureHttp === true;
            node('span', 'Allow a plain http:// address. Your API key is sent unencrypted; use only for a relay you trust.', insecureLabel);
            const imageExample = node('details', undefined, relay); node('summary', 'Format example', imageExample);
            notice('responseFormat: zip / json (images[].image base64) / png. Declare model IDs, maxPixels, maxSteps, samplers and noiseSchedules in models.', imageExample);
            node('pre', JSON.stringify({ responseFormat: 'zip', models: [officialNovelaiCapabilities().models[0]] }, null, 2), imageExample);
            const compatibility = node('details', undefined, fields); compatibility.className = 'atri-runtime-more';
            node('summary', 'Compatibility options', compatibility);
            const schemaMode = field(compatibility, 'Tool schema format', value.options?.toolSchemaMode || 'json-schema',
                [['json-schema', 'Standard JSON Schema'], ['string-enums', 'Gemini gateway: string enums only']]);
            notice('Use the gateway format only if your service rejects numeric or true/false choices in tools.', compatibility);
            const responseMode = field(compatibility, 'Response mode', value.options?.responseMode || (original ? 'generation-profile' : 'stream'),
                [['generation-profile', 'Follow the API preset'], ['stream', 'Always stream']]);
            compatibility.open = schemaMode.value !== 'json-schema';
            const syncCompatibility = () => {
                compatibility.hidden = adapter.value !== 'provider.openai-compatible';
                relay.hidden = adapter.value !== 'provider.novelai-image-compatible';
                if (adapter.value === 'provider.novelai-image') endpoint.value = NOVELAI_IMAGE_ENDPOINT;
                syncAddress();
            };
            adapter.addEventListener('change', syncCompatibility); syncCompatibility();
            fields = group(form, 'API key');
            const secret = field(fields, 'Saved key', value.secretRef?.secretId, [['', 'Choose…']]); secret.required = true;
            const keyHint = node('small', '', secret.parentElement); keyHint.className = 'atri-runtime-field-hint';
            const syncAuthentication = () => {
                // While a new key is being typed, Save stores it first, so no saved key is required yet.
                const typingKey = Boolean(secret.closest('fieldset')?.querySelector('.atri-runtime-keybox:not([hidden])'));
                secret.required = connectionRequiresSecret(adapter.value) && !typingKey;
                if (secret.options[0]) secret.options[0].textContent = translateShellText(connectionRequiresSecret(adapter.value) ? 'Choose…' : 'No key');
                keyHint.textContent = translateShellText(['provider.sd-webui-image', 'provider.forge-image'].includes(adapter.value) ? 'Optional. For Basic sign-in, save username:password as the key.'
                    : secret.required ? 'Keys are stored on this server and never shown again.' : 'Optional for this service.');
            };
            adapter.addEventListener('change', syncAuthentication); syncAuthentication();
            const feedback = node('div', undefined, fields);
            let inventoryVersion = 0;
            const inventory = async () => {
                const version = ++inventoryVersion;
                feedback.replaceChildren(); notice('Loading saved keys…', feedback);
                try {
                    const entries = await runtimeRequest('/secrets', { signal: controller.signal });
                    if (disposed || editorToken !== editorSequence || version !== inventoryVersion) return;
                    if (!Array.isArray(entries)) throw new Error('native_secret_inventory_unavailable');
                    const selected = secret.value; secret.replaceChildren();
                    for (const item of [{ secretId: '', label: translateShellText('Choose…') }, ...entries]) {
                        const option = node('option', undefined, secret); option.value = item.secretId;
                        option.textContent = item.label + (item.secretId ? ' · ' + item.secretId.slice(-8) : '');
                    }
                    secret.value = selected; syncAuthentication();
                    feedback.replaceChildren();
                    if (!entries.length && secret.required && createBox.hidden) openCreate.click();
                    else if (selected && !secret.value) notice('The key this service used is no longer saved. Choose another or add a new one.', feedback, true);
                } catch {
                    if (disposed || editorToken !== editorSequence || version !== inventoryVersion) return;
                    feedback.replaceChildren(); notice('Could not load saved keys. Your edits are kept.', feedback, true);
                    button('Try again', inventory, feedback);
                }
            };
            const createBox = node('div', undefined, fields); createBox.hidden = true; createBox.className = 'atri-runtime-keybox';
            const secretValue = field(createBox, 'New API key'); secretValue.type = 'password'; secretValue.autocomplete = 'new-password'; secretValue.disabled = true;
            const secretLabel = field(createBox, 'Key name (optional)'); secretLabel.maxLength = 120; secretLabel.disabled = true;
            const createFeedback = node('div', undefined, createBox);
            let creating = false;
            const storeKey = async () => {
                if (creating) return false;
                if (!secretValue.value.trim()) { createFeedback.replaceChildren(); notice('Paste the API key first.', createFeedback, true); secretValue.focus(); return false; }
                creating = true; create.disabled = cancel.disabled = true; create.setAttribute('aria-busy', 'true');
                try {
                    const label = (secretLabel.value.trim() || (name.value.trim() || translateShellText(adapterLabel(adapter.value))) + ' · ' + translateShellText('key')).slice(0, 120);
                    const item = await runtimeRequest('/secrets', { method: 'POST', body: { label, value: secretValue.value }, signal: controller.signal });
                    secretValue.value = '';
                    if (disposed || editorToken !== editorSequence) return false;
                    inventoryVersion += 1;
                    const option = node('option', undefined, secret); option.value = item.secretId; option.textContent = item.label + ' · ' + item.secretId.slice(-8);
                    secret.value = item.secretId; closeCreate();
                    feedback.replaceChildren(); notice('Key saved. Save the service to use it.', feedback);
                    return true;
                } catch {
                    if (!disposed && editorToken === editorSequence) { createFeedback.replaceChildren(); notice('Could not save the key. Try again.', createFeedback, true); secretValue.focus(); }
                    return false;
                } finally { creating = false; create.disabled = cancel.disabled = false; create.removeAttribute('aria-busy'); }
            };
            const create = button('Save key', () => void storeKey().then(ok => ok && secret.focus()), createBox);
            const closeCreate = () => { secretValue.value = ''; secretLabel.value = ''; secretValue.disabled = secretLabel.disabled = true; createBox.hidden = true; openCreate.hidden = false; syncAuthentication(); };
            const cancel = button('Cancel', () => { closeCreate(); openCreate.focus(); }, createBox);
            const openCreate = button('Add a new key', () => { createBox.hidden = false; openCreate.hidden = true; secretValue.disabled = secretLabel.disabled = false; createFeedback.replaceChildren(); syncAuthentication(); secretValue.focus(); }, fields);
            openCreate.dataset.variant = 'plain';
            createBox.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.defaultPrevented && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); event.stopPropagation(); create.click(); } });
            // A typed but unsaved key is saved first, so Save never loses it.
            form.addEventListener('submit', async event => {
                if (createBox.hidden) return;
                if (!secretValue.value.trim()) { if (!secret.value && connectionRequiresSecret(adapter.value)) { event.preventDefault(); event.stopImmediatePropagation(); createFeedback.replaceChildren(); notice('Paste the API key first.', createFeedback, true); secretValue.focus(); } return; }
                event.preventDefault(); event.stopImmediatePropagation();
                if (await storeKey()) form.requestSubmit();
            });
            void inventory();
            serialize = () => {
                if (creating || !secret.value && connectionRequiresSecret(adapter.value)) throw Object.assign(new Error('Select a stored Secret'), { code: 'native_secret_selection_required' });
                const options = { ...value.options }; for (const key of ['toolSchemaMode', 'responseMode']) delete options[key];
                delete options.imageCapabilities; delete options.userAgent; delete options.allowInsecureHttp;
                if (NOVELAI_IMAGE_ADAPTERS.includes(adapter.value)) {
                    const imageOptions = adapter.value === 'provider.novelai-image-compatible' ? { imageCapabilities: JSON.parse(imageCapabilities.value), ...(userAgent.value.trim() ? { userAgent: userAgent.value.trim() } : {}), ...(insecure.checked ? { allowInsecureHttp: true } : {}) } : {};
                    const candidate = { ...value, options: imageOptions, providerAdapter: adapter.value, transport: 'transport.http', endpoint: endpoint.value, secretRef: { scope: 'player', secretId: secret.value } };
                    novelaiConnectionCapabilities(candidate);
                    return candidate;
                }
                if (adapter.value === 'provider.openai-compatible') {
                    if (schemaMode.value !== 'json-schema') options.toolSchemaMode = schemaMode.value;
                    if (responseMode.value !== 'generation-profile') options.responseMode = responseMode.value;
                }
                const result = { ...value, options, providerAdapter: adapter.value, transport: 'transport.http', endpoint: address() };
                if (!secret.value && !connectionRequiresSecret(adapter.value)) delete result.secretRef;
                else result.secretRef = { scope: 'player', secretId: secret.value };
                return result;
            };
            const probeStatus = node('div', undefined, fields);
            const probe = button('Test connection', async () => {
                if (probe.disabled) return;
                probe.disabled = true; probe.setAttribute('aria-busy', 'true'); probeStatus.replaceChildren(); notice('Checking the service…', probeStatus);
                try {
                    const candidate = { ...serialize(), displayName: name.value };
                    const result = await runtimeRequest('/connections/probe', { method: 'POST', body: candidate, signal: controller.signal });
                    if (!disposed && editorToken === editorSequence) {
                        probeStatus.replaceChildren();
                        notice(JSON.stringify(candidate) === JSON.stringify({ ...serialize(), displayName: name.value })
                            ? fmt('Connected. The service lists ${0} models. No message was sent.', [result.models?.length ?? 0]) : translateShellText('The service changed during the check. Test again.'), probeStatus);
                    }
                } catch (error) { if (!disposed && editorToken === editorSequence) { probeStatus.replaceChildren(); failure(error, probeStatus); } } finally { probe.disabled = false; probe.removeAttribute('aria-busy'); }
            }, fields);
            const syncProbe = () => { probe.hidden = !isChat(); };
            adapter.addEventListener('change', syncProbe); syncProbe();
        } else {
            readApi = mountApiPresetFields({ doc, form, data, resources: scopedResources, route: value, field, number, group, notice, button, host,
                signal: controller.signal, isCurrent: () => !disposed && editorToken === editorSequence && form.isConnected });
            const advanced = node('details', undefined, form); advanced.className = 'atri-api-advanced'; node('summary', 'Advanced: fallbacks, limits and use outside stories', advanced);
            let fields = group(advanced, 'Default purpose outside games');
            const role = field(fields, 'Role', value.role || 'role.narrator', roles.map(item => ['role.' + item, roleLabels[item] || item]));
            notice('Games assign purposes when they select an API preset. This default is used by Studio and other tools.', fields);
            fields = group(advanced, 'Prompt outside games');
            const prompt = field(fields, 'Prompt Preset', value.promptProgramRef ? refKey(value.promptProgramRef) : '',
                [['', 'Use default context'], ...resourceOptions('core.prompt-program').slice(1)]);
            notice('Games use the work’s prompt. This choice only applies outside package tasks.', fields);
            button('Prompt Presets', () => host.openLibrarySection('prompt-presets'), fields);
            fields = group(advanced, 'Fallback order');
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
            fields = group(advanced, 'Request policy');
            const timeout = number(fields, 'Timeout milliseconds', value.policy?.timeoutMs || generationDefaults.timeoutMs, 1);
            const retries = number(fields, 'Retries before fallback', value.policy?.maxRetries ?? 0, 0);
            const attempts = number(fields, 'Maximum fallback attempts', value.policy?.maxFallbackAttempts ?? 0, 0);
            notice('Fallback mode is chosen per request: automatic, confirm or disabled. Game Runtime requests automatic; other callers default to disabled. Zero attempts disables fallback.', fields);
            const requirements = field(fields, 'Required capabilities (comma separated)', value.requirements?.join(', ') || '');
            fields = group(advanced, 'Shared compute limits', 'Requests in one run or project task share these limits, including retries and reranking. Sent requests retain their estimated usage when cost is unknown.');
            const enabled = field(fields, 'Enable shared request limits'); enabled.type = 'checkbox'; enabled.checked = Boolean(value.executionPolicy?.computeBudget);
            const requests = number(fields, 'Maximum request count', value.executionPolicy?.computeBudget?.maxRequests ?? '', 1, 32); requests.step = '1';
            const tokens = number(fields, 'Token usage limit', value.executionPolicy?.computeBudget?.maxTokens ?? '', 1); tokens.step = '1';
            const syncBudget = () => { for (const input of [requests, tokens]) { input.disabled = !enabled.checked; input.required = enabled.checked; } };
            enabled.addEventListener('change', syncBudget); syncBudget();
            notice('These limits track request counts and estimated tokens. Cost stays unknown when pricing or gateway retries are unreported. Cancelling configuration does not refund usage already incurred by this task.', fields);
            const localEnabled = field(fields, 'Enable local work budget'); localEnabled.type = 'checkbox'; localEnabled.checked = Boolean(value.executionPolicy?.computeBudget?.localWork);
            const localJobs = number(fields, 'Local work count', value.executionPolicy?.computeBudget?.localWork?.maxJobs ?? 32, 1, 32);
            const localItems = number(fields, 'Local work items', value.executionPolicy?.computeBudget?.localWork?.maxItems ?? 10000, 1, 10000);
            const localBytes = number(fields, 'Local work input bytes', value.executionPolicy?.computeBudget?.localWork?.maxInputBytes ?? 16777216, 1, 16777216);
            const syncLocalBudget = () => {
                localEnabled.disabled = !enabled.checked;
                for (const input of [localJobs, localItems, localBytes]) { input.disabled = !enabled.checked || !localEnabled.checked; input.required = enabled.checked && localEnabled.checked; }
            };
            enabled.addEventListener('change', syncLocalBudget); localEnabled.addEventListener('change', syncLocalBudget); syncLocalBudget();
            const optionalFields = group(advanced, 'Required work reserve');
            const reserveEnabled = field(optionalFields, 'Reserve required work'); reserveEnabled.type = 'checkbox'; reserveEnabled.checked = Boolean(value.executionPolicy?.optionalWork);
            const reserveRequests = number(optionalFields, 'Required work requests', value.executionPolicy?.optionalWork?.requiredCompute?.maxRequests ?? '', 1, 32);
            const reserveTokens = number(optionalFields, 'Required work token upper bound', value.executionPolicy?.optionalWork?.requiredCompute?.maxTokens ?? '', 1);
            const optionalRoles = [['rerank', 'Optional rerank'], ['model_task', 'Optional model tasks'], ['background', 'Optional Native background tasks']].map(([id, label]) => {
                const input = field(optionalFields, label); input.type = 'checkbox'; input.checked = (value.executionPolicy?.optionalWork?.roles ?? ['rerank']).includes(id); return { id, input };
            });
            const protocolFields = group(advanced, 'MCP tools and A2A agents');
            protocolFields.hidden = !data.connections.some(item => ['provider.mcp', 'provider.a2a'].includes(item.providerAdapter)) && !value.executionPolicy?.mcp && !value.executionPolicy?.a2a;
            const split = input => input.value.split(',').map(value => value.trim()).filter(Boolean);
            const mcpConnection = field(protocolFields, 'MCP connection', value.executionPolicy?.mcp?.connectionProfileId ?? '', options(data.connections.filter(item => item.providerAdapter === 'provider.mcp'), ids.connections));
            const mcpTools = field(protocolFields, 'MCP tools', value.executionPolicy?.mcp?.toolNames?.join(', ') ?? '');
            const mcpResources = field(protocolFields, 'MCP resources', value.executionPolicy?.mcp?.resourceUris?.join('\n') ?? '', undefined, true);
            const mcpAuth = field(protocolFields, 'MCP authentication', value.executionPolicy?.mcp?.auth ?? 'none', [['none', 'No key'], ['secret', 'Saved key']]);
            const a2aConnection = field(protocolFields, 'A2A connection', value.executionPolicy?.a2a?.connectionProfileId ?? '', options(data.connections.filter(item => item.providerAdapter === 'provider.a2a'), ids.connections));
            const a2aSkills = field(protocolFields, 'A2A skills', value.executionPolicy?.a2a?.skillIds?.join(', ') ?? '');
            const a2aAuth = field(protocolFields, 'A2A authentication', value.executionPolicy?.a2a?.auth ?? 'none', [['none', 'No key'], ['secret', 'Saved key']]);
            serialize = () => {
                let executionPolicy = value.executionPolicy ? clone(value.executionPolicy) : undefined;
                if (enabled.checked || reserveEnabled.checked || mcpConnection.value || a2aConnection.value) executionPolicy ??= { schemaVersion: 1, allowedModelProfileIds: [readApi().model.modelProfileId] };
                if (enabled.checked) {
                    executionPolicy ??= { schemaVersion: 1, allowedModelProfileIds: [readApi().model.modelProfileId] };
                    executionPolicy.computeBudget = assertComputeBudget({ maxRequests: Number(requests.value), maxTokens: Number(tokens.value),
                        ...(localEnabled.checked ? { localWork: { maxJobs: Number(localJobs.value), maxItems: Number(localItems.value), maxInputBytes: Number(localBytes.value) } } : {}) });
                } else if (executionPolicy) delete executionPolicy.computeBudget;
                if (executionPolicy) {
                    if (reserveEnabled.checked) executionPolicy.optionalWork = { mode: 'preserve_required', roles: optionalRoles.filter(row => row.input.checked).map(row => row.id),
                        ...(reserveRequests.value && reserveTokens.value ? { requiredCompute: { maxRequests: Number(reserveRequests.value), maxTokens: Number(reserveTokens.value) } } : {}) };
                    else delete executionPolicy.optionalWork;
                    if (mcpConnection.value) executionPolicy.mcp = { protocolVersion: '2025-11-25', connectionProfileId: mcpConnection.value, toolNames: split(mcpTools), resourceUris: mcpResources.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean), auth: mcpAuth.value };
                    else delete executionPolicy.mcp;
                    if (a2aConnection.value) executionPolicy.a2a = { protocolVersion: '1.0', connectionProfileId: a2aConnection.value, skillIds: split(a2aSkills), auth: a2aAuth.value };
                    else delete executionPolicy.a2a;
                }
                return { ...value, ...(executionPolicy ? { executionPolicy } : {}), role: role.value, ...(prompt.value ? { promptProgramRef: JSON.parse(prompt.value) } : { promptProgramRef: undefined }), fallbackRouteRefs: fallbackIds.map(runtimeRouteId => ({ scope: 'player', runtimeRouteId })), policy: { timeoutMs: Number(timeout.value), maxRetries: Number(retries.value), maxFallbackAttempts: Number(attempts.value) }, requirements: requirements.value.split(',').map(item => item.trim()).filter(Boolean) };
            };
        }
        const status = node('div', undefined, form); status.className = 'atri-runtime-status';
        const actions = node('footer', undefined, form); actions.className = 'atri-runtime-actions';
        if (original && !fresh) {
            const lifecycle = group(form, 'Manage this resource');
            button('Duplicate', () => confirmAtriaDraftLeave(doc, root) && edit({ ...clone(value), [ids[section]]: createStudioNativeId(prefixes[section]), displayName: value.displayName + ' Copy' }, true), lifecycle);
            const remove = button('Delete', async () => {
                if (remove.disabled) return;
                remove.disabled = true;
                try {
                    if (!await confirmLibraryAction('Delete this Runtime resource? Referenced items cannot be deleted.')) return;
                    if (disposed || editorToken !== editorSequence) return;
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
        const save = node('button', section === 'routes' ? 'Save API preset' : 'Save', actions); save.type = 'submit';
        const sourceEditor = section === 'routes' ? { read: () => ({ route: { ...serialize(), displayName: name.value.trim() }, ...readApi(),
            expected: { route: !original || fresh ? data.emptyFingerprint : data.routeFingerprints[value.runtimeRouteId],
                model: !original || fresh ? data.emptyFingerprint : data.modelFingerprints[value.modelProfileRef.modelProfileId] } }) }
            : mountResourceSource({ document: doc, form, label: 'Runtime resource JSON', readFields: () => ({ ...serialize(), displayName: name.value }),
                identity: { [ids[section]]: value[ids[section]], scope: value.scope, schemaVersion: value.schemaVersion },
                onFields: parsed => { assertRuntimeEditorShape(parsed); return edit(parsed, fresh || !original, true); }, isCurrent: () => !disposed && editorToken === editorSequence && form.isConnected });
        form.addEventListener('submit', async event => {
            event.preventDefault(); if (save.disabled) return;
            let body;
            try { body = sourceEditor.read(); } catch (error) {
                status.replaceChildren();
                if (error.code) failure(error, status); else notice(error.message, status, true);
                form.querySelector(':invalid')?.focus(); return;
            }
            const fields = [...form.querySelectorAll('input,textarea,select,button')];
            const disabled = fields.map(input => input.disabled); fields.forEach(input => input.disabled = true);
            status.replaceChildren(); notice('Saving…', status); save.setAttribute('aria-busy', 'true'); save.disabled = true; back.disabled = true; let saved = false;
            try {
                await runtimeRequest(section === 'routes' ? '/api-presets' : '/configuration/' + section, { method: 'PUT', body, signal: controller.signal, onCommitted: () => {
                    saved = true; form.dispatchEvent(new doc.defaultView.CustomEvent('atria-draft-committed', { bubbles: true }));
                } });
                if (disposed || editorToken !== editorSequence) return;
                status.replaceChildren();
                notice('Saved. Refreshing…', status);
                data = await runtimeRequest('/configuration', { signal: controller.signal });
                if (disposed || editorToken !== editorSequence) return;
                renderList(); notice(section === 'routes' ? 'API preset saved. Stories using it pick up these parameters on their next reply.' : 'Service saved. API presets that use it pick up the change on their next request.');
                if (section === 'connections' && returnToIllustrations) { returnToIllustrations = false; button('Back to illustration setup', () => globalThis.history.back(), canvas).dataset.variant = 'primary'; canvas.lastElementChild.focus(); } else root.querySelector('input')?.focus();
                void host.refreshSearch?.();
            } catch (error) {
                if (!disposed && editorToken === editorSequence) {
                    status.replaceChildren();
                    if (saved) { notice('Saved, but the list could not refresh. Reload to see the saved version.', status, true); button('Reload list', load, status); } else failure(error, status);
                }
            } finally {
                if (!saved) fields.forEach((input, index) => input.disabled = disabled[index]);
                save.removeAttribute('aria-busy'); save.disabled = saved; back.disabled = false;
            }
        });
        bindEditorKeyboard(back);
        title.focus();
    }
    function evidence(result, parent) {
        const snapshot = result.snapshot;
        node('h3', result.preview ? 'Compiled preview — no request sent' : 'Latest effective request', parent);
        notice(fmt('Input: ${0} / ${1} tokens · reserved output: ${2}', [snapshot.diagnostics.inputTokens, snapshot.contextPlan.budget.maxTokens, snapshot.contextPlan.budget.reservedOutputTokens]), parent);
        notice(result.preview ? 'Preview only. No request was sent.' : 'Actual request records. Cost, upstream identity and cache hits stay unknown when unreported.', parent);
        for (const [title, value] of [['Effective Request', snapshot.diagnostics.effectiveConfig], ['Capabilities and execution decisions', { capabilities: snapshot.capabilities, execution: snapshot.diagnostics.executionPlan, recovery: snapshot.diagnostics.failurePlan }],
            ['Shared request records', result.routing?.compute ?? { configured: false, observationScope: 'unavailable', currencyStatus: 'unavailable' }],
            ['Provider observations', { observation: result.response?.observation ?? null, usage: result.response?.usage ?? null, upstreamIdentity: result.response?.observation?.upstreamIdentity ?? 'unknown' }],
            ['Prompt provenance', { ref: snapshot.promptProgramRef, ir: snapshot.promptIr }], ['Context selection', snapshot.contextPlan], ['Fallback attempts', result.routing]]) {
            const details = node('details', undefined, parent); node('summary', title, details); node('pre', JSON.stringify(value, null, 2), details);
        }
    }
    function diagnostics() {
        root.replaceChildren(); heading('Diagnostics', 'Inspect the current Native context, preview routes, and use configured external services.');
        if (nativeSessionRuntime.active) mountProtocolControls({ document: doc, container: root, runtime: () => nativeSessionRuntime, signal: controller.signal });
        const latest = getRuntimeEvidence(); if (latest?.snapshot) evidence(latest, node('div'));
        const session = nativeSessionRuntime.snapshot;
        if (session) {
            const trace = node('details'); node('summary', 'Package Runtime evidence', trace);
            const tasks = session.states.atri_task_results?.records ?? [];
            node('pre', JSON.stringify({ revision: session.revision, packageVersionId: session.session.packageVersionId,
                processors: session.manifest.runtime?.experienceContract?.processingRuntime,
                tasks: tasks.map(item => ({ invocationId: item.invocationId, taskId: item.taskId, status: item.status,
                    lifecycleCause: item.lifecycleCause, production: item.production && { anchor: item.production.anchor, definitionHash: item.production.definitionHash },
                    provenance: item.provenance, authorityReceipt: item.authorityReceipt })),
                lifecycle: { workflows: session.states.atri_lifecycle?.workflows,
                    pending: session.states.atri_lifecycle?.outbox.map(item => ({ invocationId: item.invocationId, taskId: item.taskId, cause: item.cause, scopeId: item.scopeId, scopeEpoch: item.scopeEpoch, status: item.status })),
                    receipts: session.states.atri_lifecycle?.receipts },
                actions: session.states.atri_action_receipts?.receipts,
            }, null, 2), trace);
        }
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
        if (section === 'routes' && id === 'new') { if (activeEditor !== 'setup') openSetup({ inline: !data.routes.length }); return; }
        // Illustration setup links here to add an image service directly.
        if (section === 'connections' && id === 'new-image') {
            if (activeEditor !== 'new-image') { returnToIllustrations = true; if (environment.get().mode !== 'compact') renderList(); void edit({ schemaVersion: 1, scope: 'player', connectionProfileId: 'conn_' + crypto.randomUUID().replaceAll('-', ''), displayName: '', providerAdapter: 'provider.novelai-image' }, true).then(() => { activeEditor = 'new-image'; }); }
            return;
        }
        if (!item || activeEditor === id) return;
        // Arriving from the setup flow: show the list beside the editor.
        if (!root.querySelector('.atri-runtime-split') && environment.get().mode !== 'compact') renderList();
        edit(item);
    }
    async function load() {
        const sequence = ++loadingSequence;
        root.replaceChildren(createAtriaStatePanel(doc, 'loading', { title: translateShellText('Loading Native Runtime…') }));
        try {
            if (section === 'retrieval') {
                await renderRetrievalWorkspace({ root, node, field, group, button, notice, bindEditorKeyboard, confirmLeave: () => confirmAtriaDraftLeave(doc, root), signal: controller.signal, enter: () => { activeEditor = 'retrieval'; root.dataset.editor = 'true'; adaptEditor(); }, leave: () => { activeEditor = null; root.onkeydown = null; delete root.dataset.editor; restoreShell(); if (root.parentNode !== body) body.append(root); root.removeAttribute('role'); root.removeAttribute('aria-modal'); root.removeAttribute('aria-label'); } });
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
    }, dispose() { disposed = true; drafts.dispose(); environment.dispose(); restoreShell(); controller.abort(); root.remove(); } };
}
