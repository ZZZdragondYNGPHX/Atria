import { RETRIEVAL_PROVIDERS, assertRetrievalProfile, retrievalRef, normalizeMemoryRetrieval } from './retrieval-contracts.js';
import { listRetrievalProfiles, commitRetrievalProfile, listBrowserEmbeddingModels, testRetrievalProfile, deleteRetrievalProfile,
    currentRetrievalResources, followsResource, memoryRetrievalPorts } from './retrieval-client.js';
import { runtimeRequest } from './runtime-client.js';
import { translateShellText as tl, formatShellText as fmt } from '../atria-shell/localization.js';
import { mountResourceSource } from './resource-source-editor.js';

const TASKS = { embed: 'Embedding', rerank: 'Reranking' };
const PROVIDERS = { openai: 'OpenAI-compatible', cohere: 'Cohere', jina: 'Jina', mistral: 'Mistral', nomicai: 'Nomic', togetherai: 'Together AI', openrouter: 'OpenRouter',
    electronhub: 'Electron Hub', chutes: 'Chutes', nanogpt: 'NanoGPT', siliconflow: 'SiliconFlow', workers_ai: 'Cloudflare Workers AI', palm: 'Google AI Studio', vertexai: 'Google Vertex AI',
    ollama: 'Ollama', llamacpp: 'llama.cpp', vllm: 'vLLM', koboldcpp: 'KoboldCpp', extras: 'Extras', transformers: 'Local model (server)', webllm: 'In-browser model (WebGPU)', custom: 'Custom (Cohere-compatible rerank)' };
const LOCAL = ['transformers', 'webllm'];
const providerLabel = source => tl(PROVIDERS[source] || source);
// The exact request address, so a wrong base (for example a missing /v1) is visible before testing.
const requestAddress = (mode, source, endpoint) => {
    const base = endpoint.trim().replace(/\/+$/, '');
    if (!/^https?:\/\/./.test(base)) return '';
    if (mode === 'embed' && !LOCAL.includes(source) && !['ollama', 'llamacpp', 'vllm', 'koboldcpp', 'extras'].includes(source)) return base + '/embeddings';
    if (mode === 'rerank' && source === 'custom') return base.endsWith('/rerank') ? base : base + '/rerank';
    return '';
};
const TEST_FAILURES = {
    address: 'The service did not accept requests at ${0} (HTTP ${1}). Check the address — many services need /v1 at the end.',
    key: 'The service rejected the key (HTTP ${1}). Choose another key or add a new one.',
    busy: 'The service is rate-limiting requests (HTTP ${1}). Wait a moment and test again.',
    down: 'The service is failing right now (HTTP ${1}). Your settings may be fine; test again later.',
    rejected: 'The service refused the request (HTTP ${1}). Check the model name.',
    response: 'The service answered, but not with usable results. Check the model name and task.',
    unreachable: 'Could not reach ${0}. Check the address and your network.',
    timeout: 'The service did not answer within 30 seconds.',
    secret: 'The saved key is missing. Choose another key or add a new one.',
    untestable: 'This provider runs locally; memory checks it the first time it searches.',
};
export function describeRetrievalTest(result) {
    if (result.ok) return result.mode === 'embed' ? fmt('Works. The model returned ${0}-dimension embeddings in ${1} ms.', [result.dimensions, result.latencyMs]) : fmt('Works. The model ranked a test query in ${0} ms.', [result.latencyMs]);
    return fmt(TEST_FAILURES[result.reason] || TEST_FAILURES.response, [result.url || tl('this address'), result.status ?? '']);
}

export async function renderRetrievalWorkspace(ui) {
    const { root, node, field, group, button, notice, bindEditorKeyboard, enter, leave, confirmLeave = () => true, signal } = ui;
    const items = await listRetrievalProfiles();
    if (signal.aborted) return;
    if (!Array.isArray(items)) throw new TypeError('Invalid retrieval inventory');
    const resources = currentRetrievalResources(items);
    // Memory registers during startup; a direct link here can arrive first.
    let memory = memoryRetrievalPorts();
    const selection = () => { try { return normalizeMemoryRetrieval(memory?.getNativeRetrieval() ?? {}); } catch { return {}; } };
    const usedBy = resource => followsResource(resource, selection()[resource.mode]);
    // Memory follows a resource, not one of its versions: saving moves the choice along.
    const select = async (resource, ref = retrievalRef(resource)) => { if (!memory) throw new Error(tl('Memory is not available yet. Open a story first.')); await memory.setNativeRetrieval({ ...selection(), [resource.mode]: ref }); };
    const unselect = async mode => { const next = selection(); delete next[mode]; await memory.setNativeRetrieval(next); };
    root.replaceChildren(); leave();
    const header = node('header'); header.className = 'atri-runtime-heading';
    node('h2', 'Memory search', header);
    node('p', 'Search models let story memory find related entries by meaning. An embedding model does the searching; a reranking model is optional and settles close calls between memories.', header).className = 'atri-runtime-description';
    const split = node('div'); split.className = 'atri-runtime-split';
    const listPane = node('aside', undefined, split); listPane.className = 'atri-runtime-listpane'; listPane.setAttribute('aria-label', tl('Search models'));
    const listHead = node('header', undefined, listPane); listHead.className = 'atri-runtime-listpane__head';
    node('h3', fmt('Search models · ${0}', [resources.length]), listHead);
    button('Add a search model', () => edit(), listHead);
    const summary = node('p', undefined, listPane); summary.className = 'atri-runtime-help'; summary.setAttribute('role', 'status');
    const list = node('div', undefined, listPane); list.className = 'atri-runtime-list';
    const detail = node('section', undefined, split); detail.className = 'atri-runtime-detail';
    const empty = node('div', undefined, detail); empty.className = 'atri-runtime-detail__empty';
    node('p', resources.length ? 'Select a search model to change, test or delete it.' : 'No search models yet. Memory still works without one; add an embedding model to let it search by meaning.', empty);
    if (!resources.length) button('Add a search model', () => edit(), empty).dataset.variant = 'primary';
    const fill = () => {
        list.replaceChildren();
        const current = selection();
        const named = mode => resources.find(item => followsResource(item, current[mode]))?.displayName;
        summary.textContent = !memory ? tl('Open a story to choose which models memory uses.')
            : named('embed') ? fmt('Memory searches with ${0}', [named('embed')]) + (named('rerank') ? fmt(' and reranks with ${0}.', [named('rerank')]) : '.')
                : tl('Memory is not using a search model. Choose one below with “Use for memory”.');
        for (const mode of ['embed', 'rerank']) {
            const rows = resources.filter(item => item.mode === mode);
            if (!rows.length) continue;
            node('h4', TASKS[mode], list).className = 'atri-runtime-list__group';
            for (const item of rows) {
                const row = node('article', undefined, list); row.className = 'atri-runtime-row';
                row.dataset.atriaRuntimeItem = item.retrievalProfileId + ':' + item.mode;
                const text = node('div', undefined, row); node('h3', undefined, text).textContent = item.displayName;
                node('p', undefined, text).textContent = providerLabel(item.source) + ' · ' + item.model;
                if (usedBy(item)) { const badge = node('span', 'Used by memory', text); badge.className = 'atri-runtime-badge'; }
                else if (memory) button('Use for memory', async event => { event.stopPropagation(); await select(item); fill(); }, text).className = 'atri-runtime-badge atri-runtime-badge--action';
                const open = button('Edit', () => edit(item), row); open.setAttribute('aria-label', tl('Edit') + ' ' + item.displayName);
                row.addEventListener('click', event => { if (!event.target.closest('button')) open.click(); });
            }
        }
    };
    fill();
    for (let tries = 0; !memory && tries < 40 && !signal.aborted && list.isConnected; tries++) {
        await new Promise(resolve => setTimeout(resolve, 250));
        if ((memory = memoryRetrievalPorts()) && list.isConnected) fill();
    }

    function edit(previous, draft = previous) {
        if (!confirmLeave()) return;
        // Wide screens keep the list beside the editor; phones get the full-screen editor.
        const wide = !ui.compact?.() && detail.isConnected;
        const pane = wide ? detail : root;
        for (const row of list.querySelectorAll('.atri-runtime-row')) row.setAttribute('aria-current', String(Boolean(previous) && row.dataset.atriaRuntimeItem === previous.retrievalProfileId + ':' + previous.mode));
        pane.replaceChildren(); enter(); if (wide) root.dataset.editor = 'split';
        const at = (tag, text, parent = pane) => node(tag, text, parent);
        const head = at('header'); head.className = 'atri-runtime-editor-header';
        const back = button('Back to list', () => { if (confirmLeave()) reload(); }, head);
        bindEditorKeyboard(back);
        const title = at('h2', previous ? 'Edit search model' : 'Add a search model', head); title.tabIndex = -1;
        const form = at('form'); form.className = 'atri-runtime-form';
        const basics = group(form, 'Search model'); basics.querySelector('legend').remove();
        const name = field(basics, 'Name', draft?.displayName); name.required = true; name.maxLength = 120;
        // A resource keeps its task; switching task is a different resource.
        const mode = field(basics, 'Task', draft?.mode || 'embed', Object.entries(TASKS));
        if (previous) { mode.disabled = true; at('small', 'To use a different task, add a new search model.', mode.parentElement).className = 'atri-runtime-field-hint'; }
        const source = field(basics, 'Provider', draft?.source || 'openai', []);
        const model = field(basics, 'Model', draft?.model); model.required = true;
        // Pick from the provider's own list: embedding or reranking models first, everything on request.
        const modelPicker = at('div', undefined, basics); modelPicker.className = 'atri-runtime-model-picker';
        const loadModels = button('Load models', async () => {
            if (!endpoint.value.trim()) { endpoint.focus(); return; }
            loadModels.disabled = true; loadModels.setAttribute('aria-busy', 'true'); pickerStatus.textContent = tl('Loading models…');
            try {
                const result = await runtimeRequest('/retrieval/models', { method: 'POST', body: { endpoint: endpoint.value.trim(), ...(secret.value ? { secretRef: { secretId: secret.value } } : {}) }, signal });
                if (!form.isConnected) return;
                if (!result.ok) { pickerStatus.textContent = describeRetrievalTest({ ...result, url: result.url }); return; }
                available = result.models; drawModels();
            } catch (error) { if (form.isConnected) pickerStatus.textContent = error.message; } finally { loadModels.disabled = false; loadModels.removeAttribute('aria-busy'); }
        }, modelPicker);
        loadModels.dataset.variant = 'plain';
        const pickerStatus = at('small', '', modelPicker); pickerStatus.className = 'atri-runtime-field-hint'; pickerStatus.setAttribute('role', 'status');
        let available = [], showAll = false, choices = null;
        function drawModels() {
            choices?.parentElement.remove();
            const fit = available.filter(id => (mode.value === 'embed' ? /embed/i : /rerank/i).test(id));
            const shown = showAll || !fit.length ? available : fit;
            choices = field(modelPicker, 'Available models', shown.includes(model.value) ? model.value : '', [['', 'Choose…'], ...shown.map(id => [id, id, true])]);
            choices.addEventListener('change', () => { if (choices.value) model.value = choices.value; });
            pickerStatus.textContent = !fit.length ? fmt('${0} models. None is named for this task; choose carefully.', [available.length]) : showAll ? fmt('All ${0} models.', [available.length]) : fmt('${0} of ${1} models fit this task.', [fit.length, available.length]);
            if (fit.length && fit.length < available.length) {
                const toggle = button(showAll ? 'Show matching models' : 'Show all models', () => { showAll = !showAll; drawModels(); }, choices.parentElement); toggle.dataset.variant = 'plain';
            }
        }
        mode.addEventListener('change', () => { if (available.length) drawModels(); });
        const browserModels = at('div', undefined, basics);
        const browserModelStatus = at('div', undefined, browserModels);
        const browse = button('Browse browser models', async () => {
            browse.disabled = true; browserModelStatus.replaceChildren(); notice('Loading browser models…', browserModelStatus);
            try {
                const models = await listBrowserEmbeddingModels();
                if (!form.isConnected || signal.aborted) return;
                browserModelStatus.replaceChildren();
                const choices = field(browserModelStatus, 'Browser embedding model', model.value, [['', 'Choose a model'], ...models.map(item => [item.model_id, item.model_id, true])]);
                choices.addEventListener('change', () => { if (choices.value) model.value = choices.value; });
                notice('The model downloads the first time memory searches. This browser must support WebGPU.', browserModelStatus);
            } catch { if (form.isConnected) notice('Could not load browser models. Try again.', browserModelStatus, true); } finally { browse.disabled = false; }
        }, browserModels);
        const endpoint = field(basics, 'Service address', draft?.endpoint); endpoint.type = 'url'; endpoint.inputMode = 'url';
        const help = at('small', '', endpoint.parentElement); help.className = 'atri-runtime-field-hint';
        const auth = group(form, 'API key');
        const secret = field(auth, 'Saved key', draft?.secretRef?.secretId, [['', 'No key']]);
        const secretStatus = at('div', undefined, auth);
        const secrets = async () => {
            secret.disabled = true;
            try {
                const saved = await runtimeRequest('/secrets', { signal });
                if (!form.isConnected || signal.aborted) return;
                const selected = secret.value; secret.replaceChildren();
                for (const item of [{ secretId: '', label: tl('No key') }, ...saved]) { const option = at('option', undefined, secret); option.value = item.secretId; option.textContent = item.label; }
                if (selected && !saved.some(item => item.secretId === selected)) { const option = at('option', 'Missing key — choose another', secret); option.value = selected; }
                secret.value = selected; secretStatus.replaceChildren();
            } catch { if (form.isConnected) { secretStatus.replaceChildren(); notice('Could not load saved keys. Your edits are kept.', secretStatus, true); button('Try again', secrets, secretStatus); } } finally { secret.disabled = false; }
        };
        const createBox = at('div', undefined, auth); createBox.className = 'atri-runtime-keybox'; createBox.hidden = true;
        const secretValue = field(createBox, 'New API key'); secretValue.type = 'password'; secretValue.autocomplete = 'new-password';
        const storeKey = async () => {
            if (!secretValue.value.trim()) { secretValue.focus(); return false; }
            try {
                const saved = await runtimeRequest('/secrets', { method: 'POST', body: { label: ((name.value.trim() || tl('Search model')) + ' · ' + tl('key')).slice(0, 120), value: secretValue.value }, signal });
                secretValue.value = ''; if (!form.isConnected) return false;
                const option = at('option', undefined, secret); option.value = saved.secretId; option.textContent = saved.label; secret.value = saved.secretId;
                createBox.hidden = true; addKey.hidden = false; secretStatus.replaceChildren(); notice('Key saved.', secretStatus); return true;
            } catch { if (form.isConnected) { secretStatus.replaceChildren(); notice('Could not save the key. Try again.', secretStatus, true); } return false; }
        };
        button('Save key', () => void storeKey(), createBox);
        const addKey = button('Add a new key', () => { createBox.hidden = false; addKey.hidden = true; secretValue.focus(); }, auth); addKey.dataset.variant = 'plain';
        createBox.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); event.stopPropagation(); void storeKey(); } });
        const advanced = group(form, 'Provider options');
        const options = {};
        const optionDrafts = new Map(); let selectedProvider;
        const readOptions = () => Object.fromEntries(Object.entries(options).filter(([, input]) => input.value !== '').map(([key, input]) => [key, ['keep', 'lateChunking'].includes(key) ? input.value === 'true' : key === 'dimensions' ? Number(input.value) : input.value]));
        function updateOptions() {
            if (selectedProvider) optionDrafts.set(selectedProvider, readOptions());
            advanced.replaceChildren(); at('legend', 'Provider options', advanced);
            for (const key of Object.keys(options)) delete options[key];
            const providerKey = source.value + ':' + mode.value;
            const original = optionDrafts.get(providerKey) || (source.value === draft?.source && mode.value === draft?.mode ? draft.options : {});
            selectedProvider = providerKey;
            if (source.value === 'jina' && mode.value === 'embed') {
                options.dimensions = field(advanced, 'Dimensions', original?.dimensions); options.dimensions.type = 'number'; options.dimensions.min = '1'; options.dimensions.max = '65536';
                options.task = field(advanced, 'Embedding task', original?.task, [['', 'Provider default'], ...['retrieval.query', 'retrieval.passage', 'text-matching', 'classification', 'separation'].map(value => [value, value, true])]);
                options.lateChunking = field(advanced, 'Late chunking', original?.lateChunking || false, [['false', 'Disabled'], ['true', 'Enabled']]);
            }
            if (source.value === 'ollama') options.keep = field(advanced, 'Keep model loaded', original?.keep || false, [['false', 'Disabled'], ['true', 'Enabled']]);
            if (source.value === 'vertexai') {
                options.authMode = field(advanced, 'Authentication mode', original?.authMode || 'express', [['express', 'API key'], ['full', 'Service account'], ['proxy', 'Proxy bearer token']]);
                options.region = field(advanced, 'Region', original?.region || 'us-central1');
                options.projectId = field(advanced, 'Project ID', original?.projectId);
            }
            advanced.hidden = !Object.keys(options).length;
            const local = LOCAL.includes(source.value);
            browserModels.hidden = source.value !== 'webllm'; modelPicker.hidden = local;
            endpoint.parentElement.hidden = local; auth.hidden = local;
            endpoint.disabled = local; endpoint.required = !local;
            secret.required = !local && !['ollama', 'llamacpp', 'vllm', 'koboldcpp', 'extras', 'custom'].includes(source.value);
            secret.options[0].textContent = tl(secret.required ? 'Choose…' : 'No key');
            syncAddress();
        }
        function syncAddress() {
            const local = LOCAL.includes(source.value), target = requestAddress(mode.value, source.value, endpoint.value);
            help.textContent = local ? tl('Enter the model ID. Local models need no address or key.')
                : target ? fmt('Atria will call ${0}', [target]) : tl(['palm', 'vertexai'].includes(source.value) ? 'Include the API version, for example …/v1beta.' : 'The base address, such as https://api.example.com/v1.');
        }
        function updateProviders() {
            const selected = source.value; source.replaceChildren();
            for (const value of RETRIEVAL_PROVIDERS[mode.value]) { const option = at('option', undefined, source); option.value = value; option.textContent = providerLabel(value); }
            source.value = RETRIEVAL_PROVIDERS[mode.value].includes(selected) ? selected : RETRIEVAL_PROVIDERS[mode.value][0]; updateOptions();
        }
        updateProviders(); source.addEventListener('change', updateOptions); mode.addEventListener('change', updateProviders); endpoint.addEventListener('input', syncAddress); void secrets();
        // Address and key come first: the model list needs both.
        const modelGroup = group(form, 'Model'); modelGroup.querySelector('legend').remove(); modelGroup.append(model.parentElement, browserModels, modelPicker); auth.after(modelGroup);
        const id = draft?.retrievalProfileId || 'retr_' + crypto.randomUUID().replaceAll('-', '');
        // Saving always writes a fresh internal version; selections follow it.
        const revision = 'rev_' + crypto.randomUUID().replaceAll('-', '');
        const readFields = () => {
            const local = LOCAL.includes(source.value);
            return { retrievalProfileId: id, revision, displayName: name.value.trim(), mode: mode.value, source: source.value, model: model.value.trim(), endpoint: local ? '' : endpoint.value.trim(),
                ...(!local && secret.value ? { secretRef: { secretId: secret.value } } : {}), ...(draft?.headers ? { headers: draft.headers } : {}), options: readOptions() };
        };
        const memoryChoice = at('label', undefined, form); memoryChoice.className = 'atri-runtime-check';
        const useForMemory = at('input', undefined, memoryChoice); useForMemory.type = 'checkbox';
        at('span', 'Use for memory', memoryChoice);
        const syncChoice = () => {
            const chosen = previous && usedBy(previous) && previous.mode === mode.value;
            memoryChoice.hidden = !memory || chosen; useForMemory.checked = !chosen && !selection()[mode.value];
        };
        mode.addEventListener('change', syncChoice); syncChoice();
        const sourceEditor = mountResourceSource({ document: root.ownerDocument, form, label: 'Search model JSON', readFields, identity: { retrievalProfileId: id, revision },
            onFields: parsed => edit(previous, assertRetrievalProfile(parsed)), isCurrent: () => !signal.aborted && form.isConnected });
        const status = at('div', undefined, form); status.className = 'atri-runtime-status';
        const actions = at('footer', undefined, form); actions.className = 'atri-runtime-actions';
        const secondary = at('span', undefined, actions); secondary.className = 'atri-runtime-actions__secondary';
        const test = button('Test', async () => {
            status.replaceChildren();
            let profile; try { profile = assertRetrievalProfile(sourceEditor.read()); } catch (error) { notice(error.message, status, true); form.querySelector(':invalid')?.focus(); return; }
            test.disabled = true; test.setAttribute('aria-busy', 'true'); notice('Sending a short test request…', status);
            try { const result = await testRetrievalProfile(profile); if (form.isConnected) { status.replaceChildren(); notice(describeRetrievalTest(result), status, !result.ok); } }
            catch (error) { if (form.isConnected) { status.replaceChildren(); notice(error.message, status, true); } }
            finally { test.disabled = false; test.removeAttribute('aria-busy'); }
        }, secondary);
        if (previous) {
            button('Duplicate', () => edit(undefined, { ...readFields(), retrievalProfileId: undefined, displayName: fmt('${0} copy', [name.value.trim()]) }), secondary);
            const remove = button('Delete', async () => {
                const inUse = usedBy(previous);
                const { Popup, POPUP_TYPE, POPUP_RESULT } = await import('../popup.js');
                const message = inUse ? fmt(previous.mode === 'embed' ? 'Memory searches with “${0}”. Deleting it turns memory search off until you choose another model.' : 'Memory reranks with “${0}”. Deleting it turns reranking off.', [previous.displayName])
                    : fmt('Delete “${0}”?', [previous.displayName]);
                if (await new Popup(message, POPUP_TYPE.CONFIRM, '', { okButton: tl('Delete'), cancelButton: tl('Cancel') }).show() !== POPUP_RESULT.AFFIRMATIVE) return;
                remove.disabled = true;
                try {
                    await deleteRetrievalProfile(previous.retrievalProfileId, previous.mode);
                    if (inUse) await unselect(previous.mode);
                    form.dispatchEvent(new root.ownerDocument.defaultView.CustomEvent('atria-draft-committed', { bubbles: true }));
                    await renderRetrievalWorkspace(ui); notice(fmt('Deleted “${0}”.', [previous.displayName]), root.querySelector('.atri-runtime-listpane') || root);
                } catch (error) { if (form.isConnected) { status.replaceChildren(); notice(error.message, status, true); } } finally { remove.disabled = false; }
            }, secondary);
            remove.dataset.tone = 'danger';
        }
        const save = at('button', 'Save', actions); save.type = 'submit';
        form.addEventListener('submit', async event => {
            event.preventDefault(); if (save.disabled) return; status.replaceChildren(); let saved = false;
            try {
                if (!createBox.hidden && secretValue.value.trim() && !await storeKey()) return;
                const profile = assertRetrievalProfile(sourceEditor.read());
                save.disabled = back.disabled = true; notice('Saving…', status);
                await commitRetrievalProfile(profile); saved = true;
                form.dispatchEvent(new root.ownerDocument.defaultView.CustomEvent('atria-draft-committed', { bubbles: true }));
                const follows = previous && usedBy(previous) && previous.mode === profile.mode;
                const chosen = follows || useForMemory.checked && !memoryChoice.hidden;
                if (chosen) await select(profile, retrievalRef(profile));
                if (signal.aborted) return;
                await renderRetrievalWorkspace(ui);
                const changedModel = previous && (previous.model !== profile.model || previous.source !== profile.source || previous.endpoint !== profile.endpoint);
                notice(chosen ? (profile.mode === 'embed' && (!previous || changedModel || !follows) ? 'Saved. Memory uses it from the next search and re-indexes its entries then.' : 'Saved. Memory uses it from the next search.') : 'Saved.',
                    root.querySelector('.atri-runtime-listpane') || root);
            } catch (error) {
                if (form.isConnected) {
                    status.replaceChildren();
                    notice(saved ? 'Saved, but the list could not refresh. Reload to see it.' : error instanceof TypeError ? error.message : 'Could not save. Your edits are kept; try again.', status, true);
                    if (saved) button('Reload list', reload, status);
                }
            } finally { save.disabled = saved; back.disabled = false; }
        });
        (previous ? title : name).focus();
    }
    async function reload() {
        try { await renderRetrievalWorkspace(ui); } catch { if (!signal.aborted) { notice('Could not load search models. Try again.', root, true); button('Try again', reload); } }
    }
}
