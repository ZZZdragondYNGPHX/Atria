import { el, action, disclosure, feedback } from './library-ui.js';
import { knowledgeFormControls } from './knowledge-form-controls.js';
import { translateShellText as tl } from '../atria-shell/localization.js';
import { CONTENT_USAGES } from './knowledge-contracts.js';

const usageOptions = CONTENT_USAGES.map((id, index) => [id, ['Author background', 'Current claim', 'Historical account', 'Source claim', 'Personal belief', 'World law'][index]]);

/** Edits only this detached author draft. Text entry never remounts the input. */
export function mountAuthoredContentEditor({ document: doc, root, value, key = 'content', label = 'Entry content', defaultUsage = 'claim', maxLength = 4 * 1024 * 1024, onInput = () => {} }) {
    const { input } = knowledgeFormControls(doc, () => {});
    const panel = el(doc, 'section', 'atri-authored-editor', undefined, root);
    const area = input(panel, label, value[key] ?? '', next => {
        value[key] = next;
        const notes = value.annotations ?? [];
        const retained = notes.filter(note => note.end <= next.length && next.slice(note.start, note.end) === note.quote);
        if (retained.length !== notes.length) {
            if (retained.length) value.annotations = retained; else delete value.annotations;
            feedback(doc, panel, 'Changed passages lost their annotations in this draft. The saved source is unchanged; select text to annotate it again.');
            renderNotes();
        }
        onInput();
    }, 'textarea');
    area.rows = key === 'body' ? 12 : 8; area.maxLength = maxLength; area.name = key; area.autocomplete = 'off'; area.classList.add('atri-authored-text');
    const details = disclosure(doc, panel, 'Meaning & passage annotations');
    const summary = details.querySelector('summary');
    const description = el(doc, 'p', 'atri-library-meta', tl('Write freely. Annotations are optional and apply only to the selected passage in this revision.'), details);
    const usage = input(details, 'Source use', value.context?.usage ?? defaultUsage, next => { value.context = { ...value.context, usage: next }; }, 'text', usageOptions);
    usage.name = 'source-use';
    const contextText = (parent, target, property, caption) => {
        const control = input(parent, caption, target.context?.[property] ?? '', next => {
            const context = { usage: target.context?.usage ?? defaultUsage, ...target.context };
            if (next.trim()) context[property] = next; else delete context[property]; target.context = context;
        });
        control.maxLength = 512; control.name = (target.id ?? 'source') + '-' + property; control.autocomplete = 'off'; return control;
    };
    contextText(details, value, 'attribution', 'Attribution'); contextText(details, value, 'time', 'Source time');
    const tools = el(doc, 'div', 'atri-library-actions', undefined, details);
    const list = el(doc, 'div', 'atri-knowledge-fields', undefined, details);
    function renderNotes() {
        list.replaceChildren(); summary.textContent = tl('Meaning & passage annotations') + ((value.annotations?.length ?? 0) ? ' (' + value.annotations.length + ')' : '');
        for (const note of value.annotations ?? []) {
            const row = el(doc, 'div', 'atri-knowledge-rule', undefined, list);
            el(doc, 'blockquote', '', note.quote, row);
            const use = input(row, 'Passage use', note.context.usage, next => { note.context.usage = next; }, 'text', usageOptions); use.name = note.id + '-use';
            contextText(row, note, 'attribution', 'Attribution'); contextText(row, note, 'time', 'Source time');
            if (note.applicability?.stateConditions?.length) el(doc, 'p', 'atri-library-meta', tl('This passage has an exact state binding. Edit its conditions in Source.'), row);
            action(doc, row, 'Select passage', () => { area.focus(); area.setSelectionRange(note.start, note.end); });
            action(doc, row, 'Remove annotation', () => { value.annotations = value.annotations.filter(item => item !== note); renderNotes(); summary.focus(); });
        }
    }
    action(doc, tools, 'Annotate selected text', () => {
        const start = area.selectionStart, end = area.selectionEnd;
        if (start === end) throw new Error(tl('Select a passage in the text first.'));
        if ((value.annotations?.length ?? 0) >= 64) throw new Error(tl('This revision already has 64 passage annotations.'));
        if (value.annotations?.some(note => start < note.end && end > note.start)) throw new Error(tl('This selection overlaps an existing annotation. Select that passage to edit its use.'));
        (value.annotations ??= []).push({ id: 'passage.' + crypto.randomUUID(), start, end, quote: area.value.slice(start, end), context: { usage: usage.value } });
        value.annotations.sort((a, b) => a.start - b.start); renderNotes();
        list.querySelector('select')?.focus();
    });
    renderNotes();
    return { area, details, description };
}
