import { listRetrievalProfiles, retrievalRef } from './retrieval-client.js';
import { normalizeMemoryRetrieval } from './retrieval-contracts.js';
import { translateShellText as tl } from '../atria-shell/localization.js';

export function mountMemoryRetrieval(parent, service) {
    const doc = parent.ownerDocument; const draft = normalizeMemoryRetrieval(service.getNativeRetrieval());
    const form = doc.createElement('form'); form.className = 'workspace-memory-overview-section'; parent.append(form);
    const title = doc.createElement('h3'); title.textContent = tl('Memory search'); form.append(title);
    const note = doc.createElement('p'); note.className = 'workspace-hint'; note.textContent = tl('Optional. Lets memory find related entries by meaning. Set up search models in Runtime → Memory search, then choose them here. Changing the embedding model rebuilds the search index.'); form.append(note);
    const manage = doc.createElement('button'); manage.type = 'button'; manage.textContent = tl('Set up memory search'); manage.dataset.variant = 'plain'; form.append(manage);
    manage.addEventListener('click', () => globalThis.Atria?.shell?.getWorkspaceHost?.().openRuntimeSection('retrieval'));
    const fields = doc.createElement('fieldset'); fields.className = 'workspace-memory-fields'; form.append(fields);
    const picks = {};
    for (const [mode, caption] of [['embed', 'Embedding model'], ['rerank', 'Reranking model (optional)']]) {
        const label = doc.createElement('label'); label.className = 'workspace-inspector-field'; label.textContent = tl(caption); fields.append(label);
        const select = doc.createElement('select'); select.setAttribute('aria-label', tl(caption)); label.append(select); picks[mode] = select;
        select.addEventListener('change', () => { if (select.value) draft[mode] = JSON.parse(select.value); else delete draft[mode]; });
    }
    const status = doc.createElement('p'); status.className = 'workspace-hint'; status.setAttribute('role', 'status'); form.append(status);
    const actions = doc.createElement('div'); actions.className = 'workspace-memory-form-actions'; form.append(actions);
    const refresh = doc.createElement('button'); refresh.type = 'button'; refresh.textContent = tl('Reload list'); actions.append(refresh);
    const save = doc.createElement('button'); save.type = 'submit'; save.textContent = tl('Save'); save.dataset.variant = 'primary'; actions.append(save);
    function fill(items) {
        for (const [mode, select] of Object.entries(picks)) {
            const selected = draft[mode] ? JSON.stringify(draft[mode]) : ''; select.replaceChildren();
            const option = (value, text) => { const item = doc.createElement('option'); item.value = value; item.textContent = text; select.append(item); };
            option('', tl('Off'));
            for (const item of items.filter(item => item.mode === mode)) option(JSON.stringify(retrievalRef(item)), item.displayName + ' · ' + item.source + ' · ' + item.revision.slice(-8));
            if (selected && !Array.from(select.options).some(item => item.value === selected)) option(selected, tl('Unavailable revision — retained') + ' · ' + draft[mode].revision.slice(-8));
            select.value = selected;
        }
    }
    fill([]);
    async function load() {
        fields.disabled = refresh.disabled = save.disabled = true; status.textContent = tl('Loading search models…');
        try { const items = await listRetrievalProfiles(); if (form.isConnected) { fill(items); status.textContent = tl(items.length ? '' : 'No search models yet. Memory works without them; add one in Runtime → Memory search.'); fields.disabled = save.disabled = false; } } catch { if (form.isConnected) status.textContent = tl('Could not load search models. Your choices are kept; reload the list to try again.'); } finally { refresh.disabled = false; }
    }
    refresh.addEventListener('click', load);
    form.addEventListener('submit', async event => {
        event.preventDefault(); if (save.disabled) return; save.disabled = fields.disabled = refresh.disabled = true;
        try { await service.setNativeRetrieval(normalizeMemoryRetrieval(draft)); status.textContent = tl('Saved. New memory searches use these models.'); } catch { status.textContent = tl('Could not save. Your choices are kept; try again.'); } finally { save.disabled = fields.disabled = refresh.disabled = false; }
    });
    void load();
}
