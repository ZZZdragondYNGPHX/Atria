import { el, action, disclosure, field, feedback, libraryError } from './library-ui.js';
import { translateShellText as tl } from '../atria-shell/localization.js';
import { formatShellText } from '../atria-shell/localization.js';
import { worldRecordSections, readPlayerWorldRecords, readPublicWorldHistory } from '../../shared/native-world-records.js';

const name = value => String(value).replaceAll('_', ' ').replaceAll('.', ' / ').replace(/([a-z])([A-Z])/g, '$1 $2');
const semantics = { truth: 'Recorded fact', belief: 'Belief', relationship: 'Relationship', memory: 'Memory', intention: 'Intention', open_loop: 'Open commitment', narrative: 'Story' };

function values(doc, parent, data) {
    const list = el(doc, 'dl', 'atria-world-records__values', undefined, parent);
    const append = (value, path) => {
        if (value !== null && typeof value === 'object') {
            for (const [key, item] of Object.entries(value)) append(item, path ? path + ' / ' + name(key) : name(key));
        } else {
            el(doc, 'dt', '', path, list);
            el(doc, 'dd', '', value === null ? tl('Not recorded') : String(value), list);
        }
    };
    append(data, '');
}

export function mountWorldRecords({ document: doc, root, getRuntime }) {
    let base = getRuntime().snapshot, disposed = false;
    const panel = el(doc, 'section', 'atria-world-records', undefined, root);
    const status = el(doc, 'p', '', '', panel); status.setAttribute('role', 'status');
    const refresh = action(doc, panel, 'Refresh records', () => {
        base = getRuntime().snapshot; render(); body.querySelector('summary')?.focus();
    });
    const body = el(doc, 'div', '', undefined, panel);
    const current = () => !disposed && getRuntime()?.snapshot?.revision.revisionId === base.revision.revisionId;
    const guarded = operation => { if (current()) operation(); else sync(); };
    function lazy(label, load) {
        const section = disclosure(doc, body, label); let loaded = false;
        section.addEventListener('toggle', () => {
            if (!section.open || loaded || !current()) return;
            loaded = true;
            const content = el(doc, 'div', '', undefined, section);
            try { load(content); } catch (error) { feedback(doc, content, libraryError(error), true); }
        });
    }
    function renderHistory(parent, history) {
        const form = el(doc, 'form', 'atria-world-records__query', undefined, parent);
        const label = el(doc, 'label', 'atri-library-field', undefined, form);
        el(doc, 'span', '', tl('History source'), label);
        const source = el(doc, 'select', '', undefined, label);
        source.name = 'history-source'; source.autocomplete = 'off';
        el(doc, 'option', '', tl('Recent events'), source).value = '';
        for (const item of history.sources) el(doc, 'option', '', item.label || name(item.id), source).value = item.id;
        const tick = field(doc, form, 'Game time', history.tick, 'number');
        tick.min = '0'; tick.max = String(history.tick); tick.step = '1'; tick.required = true;
        el(doc, 'p', '', formatShellText('Game clock: ${0}. Current time: ${1}.', [history.clockId, history.tick]), form);
        const search = el(doc, 'button', 'atri-library-button', tl('Read history'), form); search.type = 'submit';
        const results = el(doc, 'div', '', undefined, parent); results.setAttribute('aria-live', 'polite');
        let cursor = '', query = {};
        const load = () => guarded(() => {
            more.hidden = true;
            try {
                const page = readPublicWorldHistory(base, { ...query, ...(cursor ? { cursor } : {}) });
                for (const row of page.rows) {
                    const entry = el(doc, 'article', 'atria-world-records__entry', undefined, results);
                    el(doc, 'h4', '', row.label, entry); el(doc, 'p', '', row.date, entry);
                    el(doc, 'p', 'atria-world-records__text', row.text, entry);
                    disclosure(doc, entry, 'Sources', [row.source, row.custody].filter(Boolean).join('\n'));
                }
                cursor = page.next; more.hidden = !cursor;
                if (!page.rows.length) el(doc, 'p', '', tl(cursor ? 'No matching record on this page. Continue to earlier records.' : 'No public record at this time.'), results);
            } catch (error) { feedback(doc, results, libraryError(error), true); }
        });
        const more = action(doc, parent, 'Continue history', load); more.hidden = true;
        form.addEventListener('submit', event => {
            event.preventDefault();
            if (!form.reportValidity()) return;
            guarded(() => {
                query = source.value ? { key: source.value, tick: Number(tick.value), clockId: history.clockId } : {};
                cursor = ''; results.replaceChildren(); load();
            });
        });
        source.addEventListener('change', () => { tick.disabled = !source.value; }); tick.disabled = true;
        load();
    }
    function render() {
        body.replaceChildren(); sync();
        if (!current()) return;
        try {
            const sections = worldRecordSections(base);
            lazy('Public speakers', parent => {
                const participants = sections.participants;
                if (!participants.length) el(doc, 'p', '', tl('No public speakers recorded yet.'), parent);
                // Each entry keeps its captured public identity; identical names do not merge people.
                let remaining = participants.length;
                const entries = el(doc, 'div', '', undefined, parent);
                const append = () => guarded(() => {
                    const start = Math.max(0, remaining - 12);
                    for (const entry of participants.slice(start, remaining).reverse()) {
                        const row = el(doc, 'article', 'atria-world-records__entry', undefined, entries);
                        el(doc, 'h4', '', entry.participant.displayName, row);
                        const message = base.timeline.find(item => item.messageId === entry.messageId);
                        el(doc, 'p', 'atria-world-records__text', (message?.content ?? '').slice(0, 1200), row);
                        if (message?.content.length > 1200) el(doc, 'p', '', tl('Read the full speech in the story timeline.'), row);
                    }
                    remaining = start; more.hidden = !remaining;
                });
                const more = action(doc, parent, 'Earlier speakers', append);
                append();
            });
            lazy('Known world', parent => {
                if (!sections.views.length) el(doc, 'p', '', tl('This work has no player world records. Continue reading the story.'), parent);
                for (const viewId of sections.views) {
                    const load = target => {
                        const projection = readPlayerWorldRecords(base, viewId);
                        const entries = el(doc, 'div', '', undefined, target); let offset = 0;
                        const append = () => guarded(() => {
                            for (const item of projection.items.slice(offset, offset + 12)) {
                                const row = el(doc, 'article', 'atria-world-records__entry', undefined, entries);
                                el(doc, 'h4', '', tl(semantics[item.semantic] || 'Record'), row);
                                values(doc, row, item.data);
                                const source = disclosure(doc, row, 'Sources');
                                values(doc, source, { [tl('View')]: viewId, [tl('Source')]: item.sourceId,
                                    ...(item.epistemicStatus ? { [tl('Status')]: item.epistemicStatus, [tl('Channel')]: item.channel } : {}) });
                            }
                            offset += 12; more.hidden = offset >= projection.items.length;
                        });
                        const more = action(doc, target, 'More records', append); append();
                        if (!projection.items.length) el(doc, 'p', '', tl('No records are currently disclosed.'), target);
                        if (projection.truncated) el(doc, 'p', '', tl('This view reached its display limit. More records may exist.'), target);
                    };
                    if (sections.views.length === 1) load(parent);
                    else {
                        const section = disclosure(doc, parent, name(viewId)); let loaded = false;
                        section.addEventListener('toggle', () => {
                            if (!section.open || loaded || !current()) return;
                            loaded = true;
                            try { load(section); } catch (error) { feedback(doc, section, libraryError(error), true); }
                        });
                    }
                }
            });
            if (sections.history) lazy('World history', parent => renderHistory(parent, sections.history));
        } catch (error) { feedback(doc, body, libraryError(error), true); }
    }
    function sync() {
        if (disposed) return;
        const stale = !current(); refresh.hidden = !stale;
        status.textContent = tl(stale ? 'The story changed. Refresh to read the selected revision.' : getRuntime()?.history ? 'Reading records from the selected historical revision.' : 'Reading records from the selected story revision.');
        for (const input of body.querySelectorAll('input, select, button')) {
            if (stale) input.disabled = true;
        }
    }
    render();
    return { sync, dispose() { disposed = true; panel.remove(); } };
}
