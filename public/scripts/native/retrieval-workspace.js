import { RETRIEVAL_PROVIDERS, assertRetrievalProfile } from './retrieval-contracts.js';
import { listRetrievalProfiles, commitRetrievalProfile } from './retrieval-client.js';
import { runtimeRequest } from './runtime-client.js';
import { translateShellText as tl } from '../atria-shell/localization.js';

export async function renderRetrievalWorkspace(ui) {
    const { root, node, field, group, button, notice, bindEditorKeyboard, enter, leave, signal } = ui;
    const profiles = await listRetrievalProfiles();
    if (signal.aborted) return;
    root.replaceChildren(); leave();
    node('h2', 'Retrieval');
    notice('Embedding and rerank resources belong to the player. Memory selects exact revisions; creating a revision never switches an existing selection.');
    const toolbar = node('div'); toolbar.className = 'atri-runtime-toolbar';
    const search = field(toolbar, 'Filter retrieval resources'); search.type = 'search';
    button('New retrieval resource', () => edit(), toolbar);
    const list = node('div'); list.className = 'atri-runtime-list';
    const fill = () => {
        list.replaceChildren();
        const found = profiles.filter(item => (item.displayName + ' ' + item.source + ' ' + item.mode).toLowerCase().includes(search.value.toLowerCase()));
        if (!found.length) notice('No retrieval resources found. Create one to configure Memory retrieval.', list);
        for (const item of found) {
            const row = node('article', undefined, list); row.className = 'atri-runtime-row';
            const text = node('div', undefined, row); node('h3', undefined, text).textContent = item.displayName;
            node('p', undefined, text).textContent = `${item.mode} · ${item.source} · ${item.model} · ${item.revision.slice(-8)}`;
            button('Create revision', () => edit(item), row);
        }
    };
    search.addEventListener('input', fill); fill();
    function edit(previous) {
        root.replaceChildren(); enter();
        const head = node('header'); head.className = 'atri-runtime-editor-header';
        const back = button('Back to retrieval', () => void reload(), head);
        bindEditorKeyboard(back);
        node('h2', previous ? 'Create retrieval revision' : 'New retrieval resource', head);
        const form = node('form'); form.className = 'atri-runtime-form';
        const identity = group(form, 'Identity');
        const name = field(identity, 'Display name', previous?.displayName); name.required = true; name.maxLength = 120;
        const mode = field(identity, 'Retrieval task', previous?.mode || 'embed', [['embed', 'Embedding'], ['rerank', 'Rerank']]);
        const provider = group(form, 'Provider connection');
        const source = field(provider, 'Provider', previous?.source || 'openai', []);
        const model = field(provider, 'Model', previous?.model); model.required = true;
        const endpoint = field(provider, 'Endpoint URL', previous?.endpoint); endpoint.type = 'url';
        const help = notice('', provider);
        const auth = group(form, 'Authentication');
        const secret = field(auth, 'Stored Secret', previous?.secretRef?.secretId, [['', 'No authentication']]);
        const secretStatus = node('div', undefined, auth);
        const secrets = async () => {
            secret.disabled = true; secretStatus.replaceChildren(); notice('Loading stored Secrets…', secretStatus);
            try {
                const items = await runtimeRequest('/secrets', { signal });
                if (!form.isConnected || signal.aborted) return;
                const selected = secret.value; secret.replaceChildren();
                for (const item of [{ secretId: '', label: tl('No authentication') }, ...items]) {
                    const option = node('option', undefined, secret); option.value = item.secretId; option.textContent = item.label;
                }
                if (selected && !items.some(item => item.secretId === selected)) { const option = node('option', 'Unavailable Secret — retained', secret); option.value = selected; }
                secret.value = selected; secretStatus.replaceChildren();
            } catch { if (form.isConnected) { secretStatus.replaceChildren(); notice('Could not load Secrets. Retry to continue.', secretStatus, true); } } finally { secret.disabled = false; }
        };
        button('Refresh Secrets', secrets, auth);
        const create = node('details', undefined, auth); node('summary', 'Create stored Secret', create);
        const secretLabel = field(create, 'Secret label'); secretLabel.maxLength = 120;
        const secretValue = field(create, 'API key'); secretValue.type = 'password'; secretValue.autocomplete = 'new-password';
        const store = button('Store Secret', async () => {
            if (store.disabled) return;
            store.disabled = true; secretStatus.replaceChildren();
            try {
                const saved = await runtimeRequest('/secrets', { method: 'POST', body: { label: secretLabel.value, value: secretValue.value }, signal });
                secretValue.value = ''; secretLabel.value = '';
                if (!form.isConnected) return;
                const option = node('option', undefined, secret); option.value = saved.secretId; option.textContent = saved.label; secret.value = saved.secretId; create.open = false;
                notice('Secret stored. It will be referenced by this retrieval revision.', secretStatus);
            } catch { if (form.isConnected) notice('Could not store Secret. Check the label and value, then retry.', secretStatus, true); } finally { store.disabled = false; }
        }, create);
        create.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); store.click(); } });
        const advanced = group(form, 'Provider options');
        const options = {};
        function updateOptions() {
            advanced.replaceChildren(); node('legend', 'Provider options', advanced);
            for (const key of Object.keys(options)) delete options[key];
            const original = source.value === previous?.source ? previous.options : {};
            if (source.value === 'jina' && mode.value === 'embed') {
                options.dimensions = field(advanced, 'Dimensions', original?.dimensions); options.dimensions.type = 'number'; options.dimensions.min = '1'; options.dimensions.max = '65536';
                options.task = field(advanced, 'Embedding task', original?.task, [['', 'Provider default'], ...['retrieval.query', 'retrieval.passage', 'text-matching', 'classification', 'separation'].map(value => [value, value])]);
                options.lateChunking = field(advanced, 'Late chunking', original?.lateChunking || false, [['false', 'Disabled'], ['true', 'Enabled']]);
            }
            if (source.value === 'ollama') options.keep = field(advanced, 'Keep model loaded', original?.keep || false, [['false', 'Disabled'], ['true', 'Enabled']]);
            if (source.value === 'vertexai') {
                options.authMode = field(advanced, 'Authentication mode', original?.authMode || 'express', [['express', 'API key'], ['full', 'Service account'], ['proxy', 'Proxy bearer token']]);
                options.region = field(advanced, 'Region', original?.region || 'us-central1');
                options.projectId = field(advanced, 'Project ID', original?.projectId);
            }
            advanced.hidden = !Object.keys(options).length;
            const local = ['transformers', 'webllm'].includes(source.value);
            endpoint.parentElement.hidden = local; auth.hidden = local;
            endpoint.disabled = local; endpoint.required = !local; secret.required = !local && !['ollama', 'llamacpp', 'vllm', 'koboldcpp', 'extras', 'custom'].includes(source.value);
            help.textContent = tl(local ? 'Enter the exact local model ID. This provider uses no endpoint or Secret.' : source.value === 'nomicai' ? 'NomicAI uses the full embedding endpoint URL.' : ['palm', 'vertexai'].includes(source.value) ? 'Google endpoint must include the API version, for example /v1 or /v1beta.' : 'Enter the provider API base URL, including its version when required.');
        }
        function updateProviders() {
            const selected = source.value; source.replaceChildren();
            for (const value of RETRIEVAL_PROVIDERS[mode.value]) { const option = node('option', undefined, source); option.value = value; option.textContent = value; }
            source.value = RETRIEVAL_PROVIDERS[mode.value].includes(selected) ? selected : RETRIEVAL_PROVIDERS[mode.value][0]; updateOptions();
        }
        updateProviders(); source.addEventListener('change', updateOptions); mode.addEventListener('change', updateProviders); void secrets();
        const actions = node('footer', undefined, form); actions.className = 'atri-runtime-actions';
        const save = node('button', 'Save exact revision', actions); save.type = 'submit';
        const status = node('div', undefined, form);
        const id = previous?.retrievalProfileId || 'retr_' + crypto.randomUUID().replaceAll('-', '');
        const revision = 'rev_' + crypto.randomUUID().replaceAll('-', '');
        form.addEventListener('submit', async event => {
            event.preventDefault(); if (save.disabled) return; status.replaceChildren();
            try {
                const values = Object.fromEntries(Object.entries(options).filter(([, input]) => input.value !== '').map(([key, input]) => [key, ['keep', 'lateChunking'].includes(key) ? input.value === 'true' : key === 'dimensions' ? Number(input.value) : input.value]));
                const local = ['transformers', 'webllm'].includes(source.value);
                const profile = assertRetrievalProfile({ retrievalProfileId: id, revision, displayName: name.value, mode: mode.value, source: source.value, model: model.value, endpoint: local ? '' : endpoint.value, ...(!local && secret.value ? { secretRef: { secretId: secret.value } } : {}), options: values });
                save.disabled = back.disabled = true;
                for (const fields of form.querySelectorAll('fieldset')) fields.disabled = true;
                await commitRetrievalProfile(profile); if (!signal.aborted) await reload();
            } catch (error) { if (form.isConnected) notice(error instanceof TypeError ? error.message : 'Could not save retrieval revision. Your edits are preserved; retry to save.', status, true); } finally {
                save.disabled = back.disabled = false;
                for (const fields of form.querySelectorAll('fieldset')) fields.disabled = false;
            }
        });
        name.focus();
    }
    async function reload() {
        try { await renderRetrievalWorkspace(ui); } catch { if (!signal.aborted) { notice('Could not load retrieval resources. Retry to continue.', root, true); button('Retry loading', reload); } }
    }
}
