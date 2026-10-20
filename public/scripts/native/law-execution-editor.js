import { el, action, disclosure, feedback, libraryError } from './library-ui.js';
import { translateShellText as tl, formatShellText as fmt } from '../atria-shell/localization.js';

export function mountLawExecutionEditor({ document: doc, root, note, loadMechanisms, isCurrent, onInput }) {
    const section = disclosure(doc, root, 'Execution coverage');
    const status = el(doc, 'p', 'atri-library-meta', '', section);
    status.setAttribute('role', 'status');
    const describe = () => {
        status.textContent = note.execution
            ? fmt('Linked transaction: ${0}. Only this action is covered; other actions and starting points may use different rules.', [note.execution.transactionId])
            : tl('Text guidance only. No deterministic execution mechanism is linked.');
    };
    describe();
    el(doc, 'p', 'atri-library-meta', tl('Link an existing Work action. This does not change its rules, invoke it, or authorize additional effects. Action parameters are supplied through the original gameplay controls.'), section);
    const tools = el(doc, 'div', 'atri-library-actions', undefined, section);
    if (!loadMechanisms) el(doc, 'p', 'atri-library-meta', tl('Open this World in a Studio project to choose from its existing mechanisms.'), section);
    else {
        const results = el(doc, 'div', '', undefined, section);
        let busy = false;
        const read = action(doc, tools, 'Read Work mechanisms', async () => {
            if (busy) return;
            busy = true; read.disabled = true; section.setAttribute('aria-busy', 'true');
            try {
                const { items } = await loadMechanisms();
                if (!section.isConnected || !isCurrent()) return;
                results.replaceChildren();
                const form = el(doc, 'form', 'atri-knowledge-fields', undefined, results);
                const label = el(doc, 'label', 'atri-library-field', undefined, form); el(doc, 'span', '', tl('Find mechanism'), label);
                const search = el(doc, 'input', '', undefined, label); search.type = 'search'; search.name = 'law-mechanism-search'; search.maxLength = 128; search.autocomplete = 'off';
                let composing = false;
                search.addEventListener('compositionstart', () => { composing = true; }); search.addEventListener('compositionend', () => { composing = false; });
                const selectLabel = el(doc, 'label', 'atri-library-field', undefined, form); el(doc, 'span', '', tl('Work action'), selectLabel);
                const select = el(doc, 'select', '', undefined, selectLabel); select.name = 'law-mechanism'; select.autocomplete = 'off';
                const details = el(doc, 'div', '', undefined, form);
                const show = () => {
                    details.replaceChildren();
                    link.disabled = select.value === '';
                    const item = items[Number(select.value)]; if (!item || select.value === '') return;
                    el(doc, 'p', '', item.description, details);
                    el(doc, 'p', 'atri-library-meta', item.reference.logicPath + ' · ' + item.starts.map(start => start.displayName).join(', '), details);
                    el(doc, 'p', 'atri-library-meta', fmt('Original validators: ${0}. Effect kinds: ${1}.', [item.validators, item.effects.join(', ')]), details);
                    disclosure(doc, details, 'Action parameters', item.inputSchema);
                };
                const filter = () => {
                    results.querySelector(':scope > .atri-library-feedback')?.remove();
                    const previous = select.value; select.replaceChildren();
                    el(doc, 'option', '', tl('Choose a mechanism'), select).value = '';
                    let count = 0;
                    items.forEach((item, index) => {
                        if ((item.description + ' ' + item.reference.transactionId + ' ' + item.reference.logicPath).toLocaleLowerCase().includes(search.value.toLocaleLowerCase()) && count++ < 128) {
                            el(doc, 'option', '', item.reference.transactionId + ' · ' + item.description, select).value = String(index);
                        }
                    });
                    select.value = [...select.options].some(option => option.value === previous) ? previous : '';
                    show();
                    if (count > 128) feedback(doc, results, 'More mechanisms exist. Refine the search.');
                };
                select.addEventListener('change', show);
                form.addEventListener('submit', event => { event.preventDefault(); if (!composing) filter(); });
                const actions = el(doc, 'div', 'atri-library-actions', undefined, form);
                const find = el(doc, 'button', 'atri-library-button', tl('Find mechanism'), actions); find.type = 'submit';
                const link = action(doc, actions, 'Link selected mechanism', () => {
                    const item = select.value === '' ? null : items[Number(select.value)];
                    if (!item) throw new TypeError(tl('Choose a mechanism'));
                    note.execution = structuredClone(item.reference); remove.disabled = false; remove.dataset.atriaActionComplete = 'false'; onInput(); describe();
                });
                filter();
                if (note.execution && !items.some(item => ['logicPath', 'transactionId', 'digest'].every(key => item.reference[key] === note.execution[key]))) feedback(doc, results, 'The linked rule changed or is unavailable. Choose a current mechanism before building.', true);
            } catch (error) { if (section.isConnected && isCurrent()) feedback(doc, results, libraryError(error), true); } finally { busy = false; read.disabled = false; section.removeAttribute('aria-busy'); }
        });
    }
    const remove = action(doc, tools, 'Remove execution link', () => { delete note.execution; remove.dataset.atriaActionComplete = 'true'; onInput(); describe(); });
    remove.disabled = !note.execution;
    remove.dataset.atriaActionComplete = String(!note.execution);
}
