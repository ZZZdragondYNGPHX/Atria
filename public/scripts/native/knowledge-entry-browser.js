import { el, field, action, disclosure, feedback } from './library-ui.js';
import { translateShellText as tl, formatShellText as fmt } from '../atria-shell/localization.js';

export const knowledgeEntryTitle = (entry, index) => entry.metadata?.title || entry.metadata?.label
    || entry.content?.split('\n')[0].slice(0, 60) || tl('Knowledge entry') + ' ' + (index + 1);

// Presentation-only state is owned by the mounted workspace/draft, never persisted.
export function mountKnowledgeEntryBrowser({ document: doc, root, entries, state = {}, onEdit, onToggle }) {
    state.query ??= ''; state.filter ??= 'all'; state.sort ??= 'source'; state.page ??= 0; state.expanded ??= new Set();
    const panel = el(doc, 'section', 'atri-knowledge-browser', undefined, root);
    const controls = el(doc, 'div', 'atri-knowledge-browser-controls', undefined, panel);
    const search = field(doc, controls, 'Search Knowledge entries', state.query, 'search');
    const select = (caption, values, key) => {
        const label = el(doc, 'label', 'atri-library-field', tl(caption), controls);
        const node = el(doc, 'select', '', undefined, label); node.setAttribute('aria-label', tl(caption));
        for (const [value, text] of values) { const option = el(doc, 'option', '', tl(text), node); option.value = value; }
        node.value = state[key]; node.addEventListener('change', () => { state[key] = node.value; state.page = 0; render(); }); return node;
    };
    select('Entry status', [['all', 'All entries'], ['enabled', 'Enabled entries'], ['disabled', 'Disabled entries']], 'filter');
    select('Entry order', [['source', 'Authored order'], ['title', 'Title'], ['priority', 'Delivery priority']], 'sort');
    const count = el(doc, 'p', 'atri-library-meta', undefined, panel); count.setAttribute('role', 'status');
    const list = el(doc, 'div', 'atri-knowledge-entry-list', undefined, panel);
    const pages = el(doc, 'nav', 'atri-library-actions', undefined, panel); pages.setAttribute('aria-label', tl('Entry pages'));
    const pageSize = 25;
    function render() {
        list.replaceChildren(); pages.replaceChildren();
        const query = state.query.trim().toLocaleLowerCase();
        const matching = entries.map((entry, index) => ({ entry, index, title: knowledgeEntryTitle(entry, index) })).filter(({ entry, title }) => {
            const matchesState = state.filter === 'all' || (state.filter === 'disabled') === (entry.enabled === false);
            const text = [title, entry.content, entry.knowledgeEntryId, ...(entry.discovery?.keywords || []), ...(entry.discovery?.aliases || []), ...(entry.discovery?.regex || [])].join('\n');
            return matchesState && (!query || text.toLocaleLowerCase().includes(query));
        });
        if (state.sort === 'title') matching.sort((a, b) => a.title.localeCompare(b.title) || a.index - b.index);
        if (state.sort === 'priority') matching.sort((a, b) => (b.entry.delivery?.priority ?? 100) - (a.entry.delivery?.priority ?? 100) || a.index - b.index);
        state.page = Math.max(0, Math.min(state.page, Math.ceil(matching.length / pageSize) - 1));
        const start = state.page * pageSize;
        count.textContent = fmt('${0}–${1} of ${2} entries', [matching.length ? start + 1 : 0, Math.min(start + pageSize, matching.length), matching.length]);
        if (!matching.length) el(doc, 'p', 'atri-library-meta', tl(entries.length ? 'No matching entries. Change the search or status filter.' : 'No entries. Add an entry to begin this revision.'), list);
        for (const { entry, index, title } of matching.slice(start, start + pageSize)) {
            const row = el(doc, 'article', 'atri-knowledge-entry-row', undefined, list); row.dataset.atriaKnowledgeEntryId = entry.knowledgeEntryId;
            const details = el(doc, 'details', 'atri-knowledge-entry-details', undefined, row);
            const summary = el(doc, 'summary', '', undefined, details);
            el(doc, 'span', 'atri-knowledge-entry-title', title, summary);
            el(doc, 'span', 'atri-knowledge-entry-status', tl(entry.enabled === false ? 'Disabled' : 'Enabled'), summary);
            const terms = [...(entry.discovery?.keywords || []), ...(entry.discovery?.aliases || [])];
            const discovery = terms.length ? terms.slice(0, 3).join(' · ') + (terms.length > 3 ? ' …' : '')
                : entry.discovery?.regex?.length ? fmt('${0} regular expressions', [entry.discovery.regex.length]) : tl('No discovery terms');
            el(doc, 'span', 'atri-knowledge-entry-summary', discovery + ' · ' + tl(entry.delivery?.position === 'after' ? 'After' : 'Before') + ' · ' + fmt('Priority ${0}', [entry.delivery?.priority ?? 100]), summary);
            const body = el(doc, 'div', 'atri-knowledge-entry-content', undefined, details);
            const expand = () => {
                body.replaceChildren();
                if (!details.open) { state.expanded.delete(entry.knowledgeEntryId); return; }
                state.expanded.add(entry.knowledgeEntryId);
                el(doc, 'p', '', entry.content, body);
                disclosure(doc, body, 'Exact entry identity', { knowledgeEntryId: entry.knowledgeEntryId });
                disclosure(doc, body, 'Details', { discovery: entry.discovery, applicability: entry.applicability, lifecycle: entry.lifecycle, relations: entry.relations, delivery: entry.delivery });
            };
            details.open = state.expanded.has(entry.knowledgeEntryId); expand();
            details.addEventListener('toggle', () => { if (details.isConnected) expand(); });
            const actions = el(doc, 'div', 'atri-knowledge-entry-actions', undefined, row);
            if (onToggle) {
                const label = el(doc, 'label', 'atri-knowledge-entry-toggle', undefined, actions);
                const toggle = el(doc, 'input', '', undefined, label); toggle.type = 'checkbox'; toggle.checked = entry.enabled !== false;
                toggle.setAttribute('aria-label', fmt('Enable entry: ${0}', [title])); label.append(doc.createTextNode(tl('Enabled')));
                toggle.addEventListener('change', async () => {
                    const before = entry.enabled !== false; toggle.disabled = true;
                    try { await onToggle(entry, toggle.checked, index); } catch (error) { toggle.checked = before; feedback(doc, panel, error.message, true); } finally { toggle.disabled = false; }
                });
            }
            if (onEdit) action(doc, actions, 'Edit entry', () => onEdit(entry, index));
        }
        if (matching.length > pageSize) {
            action(doc, pages, 'Previous entries', () => { state.page--; render(); list.querySelector('summary')?.focus(); }, { disabled: state.page === 0 });
            action(doc, pages, 'Next entries', () => { state.page++; render(); list.querySelector('summary')?.focus(); }, { disabled: start + pageSize >= matching.length });
        }
    }
    search.addEventListener('input', () => { state.query = search.value; state.page = 0; render(); });
    render();
    return { refresh: render, focus: entryId => { const row = [...list.children].find(node => node.dataset.atriaKnowledgeEntryId === entryId); (row?.querySelector('summary') || search).focus(); } };
}
