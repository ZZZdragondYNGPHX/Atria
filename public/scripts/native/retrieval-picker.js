import { listRetrievalProfiles, retrievalRef, currentRetrievalResources, followsResource } from './retrieval-client.js';
import { normalizeMemoryRetrieval } from './retrieval-contracts.js';
import { translateShellText as tl } from '../atria-shell/localization.js';

// Memory's own choice of search models. A choice names a resource; saving it
// stores that resource's newest version, and Runtime edits move it forward.
export function mountMemoryRetrieval(parent, service) {
    const doc = parent.ownerDocument;
    const form = doc.createElement('form'); form.className = 'workspace-memory-overview-section'; parent.append(form);
    const title = doc.createElement('h3'); title.textContent = tl('Memory search'); form.append(title);
    const note = doc.createElement('p'); note.className = 'workspace-hint'; note.textContent = tl('Optional. Lets memory find related entries by meaning. Changes save right away.'); form.append(note);
    const fields = doc.createElement('fieldset'); fields.className = 'workspace-memory-fields'; form.append(fields);
    const picks = {};
    let resources = [];
    for (const [mode, caption] of [['embed', 'Embedding model'], ['rerank', 'Reranking model (optional)']]) {
        const label = doc.createElement('label'); label.className = 'workspace-inspector-field'; label.textContent = tl(caption); fields.append(label);
        const select = doc.createElement('select'); select.setAttribute('aria-label', tl(caption)); label.append(select); picks[mode] = select;
        select.addEventListener('change', () => void choose(mode, select.value));
    }
    const status = doc.createElement('p'); status.className = 'workspace-hint'; status.setAttribute('role', 'status'); form.append(status);
    const manage = doc.createElement('button'); manage.type = 'button'; manage.textContent = tl('Manage search models'); manage.dataset.variant = 'plain'; form.append(manage);
    manage.addEventListener('click', () => globalThis.Atria?.shell?.getWorkspaceHost?.().openRuntimeSection('retrieval'));
    const current = () => normalizeMemoryRetrieval(service.getNativeRetrieval());
    function fill() {
        const draft = current();
        for (const [mode, select] of Object.entries(picks)) {
            select.replaceChildren();
            const option = (value, text) => { const item = doc.createElement('option'); item.value = value; item.textContent = text; select.append(item); };
            option('', tl('Off'));
            for (const item of resources.filter(item => item.mode === mode)) option(item.retrievalProfileId, item.displayName + ' · ' + item.model);
            const chosen = resources.find(item => item.mode === mode && followsResource(item, draft[mode]));
            if (draft[mode] && !chosen) option('missing', tl('Deleted model — choose another'));
            select.value = chosen?.retrievalProfileId ?? (draft[mode] ? 'missing' : '');
        }
    }
    async function choose(mode, id) {
        if (id === 'missing') return;
        const next = current(); const item = resources.find(value => value.mode === mode && value.retrievalProfileId === id);
        if (item) next[mode] = retrievalRef(item); else delete next[mode];
        fields.disabled = true; status.textContent = tl('Saving…');
        try { await service.setNativeRetrieval(normalizeMemoryRetrieval(next)); status.textContent = tl('Saved. The next memory search uses this.'); }
        catch { status.textContent = tl('Could not save. Try again.'); fill(); } finally { fields.disabled = false; }
    }
    async function load() {
        fields.disabled = true; status.textContent = tl('Loading search models…');
        try {
            resources = currentRetrievalResources(await listRetrievalProfiles());
            if (!form.isConnected) return;
            fill(); status.textContent = resources.length ? '' : tl('No search models yet. Memory works without them; add one with Manage search models.');
        } catch { if (form.isConnected) status.textContent = tl('Could not load search models. Reopen this section to try again.'); } finally { fields.disabled = false; }
    }
    fill(); void load();
}
