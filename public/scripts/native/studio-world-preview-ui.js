import { el, disclosure, action, feedback, libraryError } from './library-ui.js';
import { nativeStudioClient } from './studio-client.js';
import { translateShellText as tl } from '../atria-shell/localization.js';

export function mountStudioWorldPreview({ document: doc, root, previewId, isCurrent }) {
    let disposed = false, loaded = false, busy = false, composing = false;
    const section = disclosure(doc, root, 'Starting world & perspectives');
    section.dataset.atriaDraftDirty = 'false';
    el(doc, 'p', 'atri-library-meta', tl('Uses the selected starting point and fixed sources, before story initialization.'), section);
    const form = el(doc, 'form', 'atri-knowledge-parameter-fields', undefined, section); form.hidden = true;
    const searchLabel = el(doc, 'label', 'atri-library-field', undefined, form);
    el(doc, 'span', '', tl('Find perspective'), searchLabel);
    const search = el(doc, 'input', '', undefined, searchLabel); search.type = 'search'; search.name = 'perspective-search'; search.autocomplete = 'off'; search.maxLength = 128;
    search.addEventListener('compositionstart', () => { composing = true; }); search.addEventListener('compositionend', () => { composing = false; });
    const label = el(doc, 'label', 'atri-library-field', undefined, form); el(doc, 'span', '', tl('Perspective'), label);
    const select = el(doc, 'select', '', undefined, label); select.name = 'perspective'; select.autocomplete = 'off';
    const submit = el(doc, 'button', 'atri-library-button', tl('Read selected perspective'), form); submit.type = 'submit';
    const status = el(doc, 'p', '', '', section); status.setAttribute('role', 'status');
    const results = el(doc, 'div', 'atri-knowledge-fields', undefined, section);
    const current = () => !disposed && isCurrent() && section.isConnected;
    async function read() {
        if (!current() || busy) return;
        const focused = form.contains(doc.activeElement) ? doc.activeElement : null;
        busy = true; submit.disabled = select.disabled = search.disabled = true;
        section.setAttribute('aria-busy', 'true'); status.textContent = tl('Reading starting world…'); results.replaceChildren();
        try {
            const result = await nativeStudioClient.getPreviewWorld(previewId, { audience: select.value || 'narrator', ...(search.value ? { search: search.value } : {}) });
            if (!current()) return;
            loaded = true; form.hidden = false;
            select.replaceChildren();
            for (const audience of result.audiences) el(doc, 'option', '', ['narrator', 'player'].includes(audience.value) ? tl(audience.label) : audience.label, select).value = audience.value;
            select.value = result.audience;
            status.textContent = result.entryPointName;
            if (result.audiencesTruncated) el(doc, 'p', '', tl('More perspectives exist. Search by the authored name.'), results);
            if (!result.items.length) el(doc, 'p', '', tl('No starting records are disclosed to this perspective.'), results);
            const entries = el(doc, 'div', '', undefined, results); let offset = 0;
            const append = () => {
                if (!current()) return;
                for (const item of result.items.slice(offset, offset + 12)) {
                    const row = disclosure(doc, entries, item.source?.[0]?.kind === 'world' ? 'World text' : item.source?.[0]?.kind === 'knowledge' ? 'Knowledge text' : 'Context item');
                    if (item.content) el(doc, 'pre', '', item.content, row);
                    else {
                        const values = el(doc, 'dl', 'atria-world-records__values', undefined, row);
                        for (const [key, value] of Object.entries(item.data ?? {})) {
                            el(doc, 'dt', '', key, values); el(doc, 'dd', '', value && typeof value === 'object' ? JSON.stringify(value) : String(value), values);
                        }
                    }
                    disclosure(doc, row, 'Sources', item.source);
                }
                offset += 12; more.hidden = offset >= result.items.length;
            };
            const more = action(doc, results, 'More records', append); append();
            if (result.truncated) el(doc, 'p', '', tl('This view reached its display limit. More records may exist.'), results);
            disclosure(doc, results, 'Preview budget', tl('Preview uses a bounded text budget. Actual request budgets depend on the chosen API preset.'));
        } catch (error) { if (current()) feedback(doc, results, libraryError(error), true); } finally {
            if (current()) {
                busy = false; submit.disabled = select.disabled = search.disabled = false; section.removeAttribute('aria-busy');
                if (!loaded) { form.hidden = false; status.textContent = ''; }
                if (focused?.isConnected && [doc.body, doc.documentElement].includes(doc.activeElement)) focused.focus();
            }
        }
    }
    form.addEventListener('submit', event => { event.preventDefault(); if (!composing) void read(); });
    section.addEventListener('toggle', () => { if (section.open && !loaded) void read(); });
    return { dispose() { disposed = true; section.remove(); } };
}
