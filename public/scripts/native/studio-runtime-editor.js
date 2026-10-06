import { assertNativeExperienceContract } from '../../shared/native-experience-contract.js';
import { mountStudioValueEditor } from './studio-value-editor.js';
import { translateShellText as t } from '../atria-shell/localization.js';

// Same project draft / Review / ChangeSet path as the other Studio editors.
export function mountStudioRuntimeEditor({ document: doc, root, value, onReview, onPreview }) {
    const node = (tag, text, parent) => {
        const item = doc.createElement(tag); if (text) item.textContent = t(text); parent.append(item); return item;
    };
    node('h3', 'Package Runtime', root);
    node('p', 'Define fixed rules, Tasks, Lifecycle, context derivation and Processing here. Build checks the exact source closure; Preview never sends or commits.', root);
    if (onPreview) {
        const preview = node('details', '', root); node('summary', 'Preview saved Processing', preview);
        const label = node('label', 'Processing stage', preview), stage = node('select', '', label); stage.setAttribute('aria-label', t('Processing stage'));
        for (const kind of ['output', 'context', 'presentation']) { const option = node('option', kind, stage); option.value = kind; }
        const textLabel = node('label', 'Sample text', preview), text = node('textarea', '', textLabel); text.setAttribute('aria-label', t('Sample text'));
        const run = node('button', 'Preview saved revision', preview); run.type = 'button';
        const status = node('pre', '', preview); status.setAttribute('role', 'status');
        run.addEventListener('click', async () => {
            if (run.disabled) return; run.disabled = true; run.setAttribute('aria-busy', 'true');
            try { status.textContent = JSON.stringify(await onPreview({ stage: stage.value, text: text.value }), null, 2); } catch (error) {
                status.textContent = error.message;
            } finally { run.disabled = false; run.removeAttribute('aria-busy'); }
        });
    }
    const initial = value ?? { schemaVersion: 1, capabilities: [], dataResources: [] };
    return mountStudioValueEditor({ document: doc, root, label: 'Experience contract JSON', value: initial, onReview,
        validate: assertNativeExperienceContract,
        fieldOptions: path => path.startsWith('processingRuntime.') ? path.endsWith('.stage') ? ['output', 'context', 'presentation'] : path.endsWith('.kind') ? ['trim', 'replace', 'script'] : undefined : undefined,
        renderFields({ parent, draft, renderValue, rerender }) {
            if (!draft || typeof draft !== 'object' || Array.isArray(draft) || (draft.capabilities !== undefined && !Array.isArray(draft.capabilities))
                || (draft.processingRuntime !== undefined && (!draft.processingRuntime || !Array.isArray(draft.processingRuntime.processors)))) {
                renderValue(parent, draft, '', () => {});
                node('p', 'Use Source to repair the Runtime contract before adding Processors.', parent); return;
            }
            const add = node('button', 'Add Processor', parent); add.type = 'button';
            add.addEventListener('click', () => {
                draft.capabilities ||= [];
                if (!draft.capabilities.some(item => item.id === 'processing')) draft.capabilities.push({ id: 'processing', version: 1, required: true });
                draft.processingRuntime ||= { schemaVersion: 1, processors: [] };
                const ids = new Set(draft.processingRuntime.processors.map(item => item.id)); let index = 1;
                while (ids.has('processor-' + index)) index++;
                draft.processingRuntime.processors.push({ id: 'processor-' + index, stage: 'output', kind: 'trim' }); rerender();
            });
            renderValue(parent, draft, '', () => {});
            for (const select of parent.querySelectorAll('select[name^="processingRuntime.processors."][name$=".kind"]')) {
                select.addEventListener('change', () => {
                    const index = Number(select.name.split('.')[2]); const item = draft.processingRuntime.processors[index];
                    item.kind = select.value;
                    delete item.find; delete item.replacement; delete item.source;
                    if (item.kind === 'replace') { item.find = ''; item.replacement = ''; }
                    if (item.kind === 'script') item.source = '';
                    rerender(); parent.querySelector('[name="processingRuntime.processors.' + index + '.kind"]')?.focus();
                });
            }
            for (const [index, item] of (draft.processingRuntime?.processors ?? []).entries()) {
                const row = node('div', '', parent);
                node('span', item.id, row);
                for (const [label, delta] of [['Move earlier', -1], ['Move later', 1]]) {
                    const move = node('button', label, row); move.type = 'button';
                    move.disabled = index + delta < 0 || index + delta >= draft.processingRuntime.processors.length;
                    move.addEventListener('click', () => { const list = draft.processingRuntime.processors; [list[index], list[index + delta]] = [list[index + delta], list[index]]; rerender(); });
                }
                const remove = node('button', 'Remove Processor', row); remove.type = 'button';
                remove.addEventListener('click', () => { draft.processingRuntime.processors.splice(index, 1); rerender(); });
            }
            node('p', 'Processors run in list order and fail closed. Replace uses literal text. Script requires a fixed JS/TS source and is available for output or context.', parent);
        } });
}
