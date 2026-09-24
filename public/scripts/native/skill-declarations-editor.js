import { skillDeclarationId, validateSkillDeclarations } from './skill-declarations.js';
import { knowledgeFormControls } from './knowledge-form-controls.js';
import { el, action, feedback, disclosure } from './library-ui.js';
import { translateShellText as tl } from '../atria-shell/localization.js';

export function mountSkillDeclarationsEditor({ document: doc, root, value = [], projectId, onReview,
    listSkills = () => globalThis.Atria?.getContext?.()?.skills?.list({ scope: 'all' }) ?? Promise.resolve([]) }) {
    let draft = structuredClone(value); let source = ''; let advanced = !Array.isArray(draft) || draft.some(entry => !entry || !['string', 'object'].includes(typeof entry) || Array.isArray(entry));
    if (advanced) source = JSON.stringify(draft, null, 2);
    let inventory = []; let loading = false; let loadError = null;
    const shell = el(doc, 'section', 'atri-knowledge-editor', undefined, root); shell.dataset.atriaSkillDeclarations = 'true';
    const toolbar = el(doc, 'div', 'atri-library-actions', undefined, shell);
    const body = el(doc, 'div', 'atri-knowledge-fields', undefined, shell);
    const status = el(doc, 'div', '', undefined, shell);
    const { input } = knowledgeFormControls(doc, render);
    function error(error) {
        status.replaceChildren(); feedback(doc, status, tl(error.message), true);
        const field = body.querySelector('input:invalid, textarea, input');
        if (field) { field.setAttribute('aria-invalid', 'true'); field.focus(); }
    }
    const idOf = entry => { try { return skillDeclarationId(entry); } catch { return ''; } };
    async function load() {
        loading = true; loadError = null; render();
        try {
            const entries = await listSkills();
            const byName = new Map();
            for (const entry of entries) if (entry.scope?.kind === 'global') byName.set(entry.name, entry);
            for (const entry of entries) if (entry.scope?.kind === 'project' && entry.scope.projectId === projectId) byName.set(entry.name, entry);
            inventory = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
        } catch (caught) { loadError = caught; }
        loading = false; if (shell.isConnected) render();
    }
    function render() {
        toolbar.replaceChildren(); body.replaceChildren();
        action(doc, toolbar, advanced ? 'Fields' : 'Source', () => {
            try {
                if (advanced) { const parsed = JSON.parse(source); validateSkillDeclarations(parsed); draft = parsed; } else source = JSON.stringify(draft, null, 2);
                advanced = !advanced; status.replaceChildren(); render();
            } catch (caught) { error(caught); }
        });
        if (advanced) input(body, 'Skill declarations JSON', source, text => { source = text; }, 'textarea');
        else {
            el(doc, 'p', 'atri-library-meta', tl('Declare the Skills used by this work. Removing a declaration does not delete the Skill.'), body);
            if (loading) feedback(doc, body, tl('Loading Skills…'));
            else if (loadError) {
                feedback(doc, body, tl('Could not load available Skills. Your declarations are kept.'), true);
                action(doc, body, 'Retry', load);
            } else {
                let selected = '';
                input(body, 'Available Skills', '', value => { selected = value; }, 'text', [
                    ['', 'Choose a Skill'], ...inventory.map(entry => [entry.name, entry.name + ' · ' + tl(entry.scope.kind === 'project' ? 'Project' : 'Global')]),
                ]);
                action(doc, body, 'Add selected Skill', () => {
                    if (!selected) throw new Error(tl('Choose a Skill'));
                    if (draft.some(entry => idOf(entry) === selected)) throw new Error(tl('Skill declarations must not repeat a Skill ID.'));
                    draft.push(selected); render();
                }, { disabled: !inventory.length });
            }
            if (!draft.length) el(doc, 'p', '', tl('No Skill declarations yet.'), body);
            draft.forEach((entry, index) => {
                const row = el(doc, 'section', 'atri-knowledge-rule', undefined, body);
                const id = idOf(entry); const installed = inventory.find(value => value.name === id);
                const control = input(row, 'Skill ID ' + (index + 1), id, next => {
                    if (typeof draft[index] === 'string') draft[index] = next;
                    else {
                        const item = draft[index]; const key = Object.hasOwn(item, 'skillId') ? 'skillId' : 'id';
                        item[key] = next; if (Object.hasOwn(item, 'skillId') && Object.hasOwn(item, 'id')) item.id = next;
                    }
                });
                control.required = true; control.pattern = '[A-Za-z0-9][A-Za-z0-9._:-]{0,255}'; control.autocomplete = 'off'; control.spellcheck = false;
                el(doc, 'p', 'atri-library-meta', installed?.description || tl('Not installed in this project or global scope. The declaration is retained.'), row);
                if (typeof entry === 'object') disclosure(doc, row, 'Declaration details', entry);
                action(doc, row, 'Remove declaration', () => { draft.splice(index, 1); render(); });
            });
            action(doc, body, 'Add Skill ID', () => {
                draft.push(''); render(); body.querySelectorAll('input').item(draft.length - 1)?.focus();
            });
        }
        action(doc, toolbar, 'Review Changes', async () => {
            try {
                const next = advanced ? JSON.parse(source) : draft; validateSkillDeclarations(next);
                await onReview(structuredClone(next));
            } catch (caught) { error(caught); }
        }, { primary: true });
    }
    void load();
    return { getValue: () => structuredClone(draft) };
}
