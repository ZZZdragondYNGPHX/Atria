import { el, action, disclosure } from './library-ui.js';
import { knowledgeFormControls } from './knowledge-form-controls.js';
import { KNOWLEDGE_CONDITION_LOGIC, KNOWLEDGE_CONDITION_OPERATORS } from './knowledge-contracts.js';
import { formatShellText as fmt, translateShellText as tl } from '../atria-shell/localization.js';

// Both entry and passage editors write the original applicability contract.
// Opening an empty form does not create a section or change its meaning.
export function mountStateConditionEditor({ document: doc, root, getValue, setValue, keywordActivation = true, fields = [], onInput = () => {} }) {
    const panel = el(doc, 'div', 'atri-knowledge-parameter-fields', undefined, root);
    function render(focus = null) {
        panel.replaceChildren();
        const applicability = getValue() ?? {}, conditions = applicability.stateConditions ?? [];
        const write = (key, value) => { applicability[key] = value; setValue(applicability); onInput(); };
        const { input, checkbox } = knowledgeFormControls(doc, () => {});
        if (fields.length) {
            let selected = '0';
            input(panel, 'Starting world field', selected, value => { selected = value; }, 'text', fields.map((field, index) => [String(index), field.label, true]));
            action(doc, panel, 'Bind selected field', () => {
                const field = fields[Number(selected)];
                conditions.push({ providerId: field.providerId, path: [...field.path], operator: 'eq', value: field.value });
                write('stateConditions', conditions); render(conditions.length - 1);
            }, { disabled: conditions.length >= 32 });
        }
        input(panel, 'Condition matching', applicability.stateConditionsLogic ?? 'all', value => write('stateConditionsLogic', value), 'text', KNOWLEDGE_CONDITION_LOGIC);
        if (keywordActivation) {
            const activate = checkbox(panel, 'Activate from matching state without keywords', applicability.stateActivation === true, value => write('stateActivation', value));
            activate.disabled = !conditions.length;
        }
        conditions.forEach((condition, index) => {
            const row = el(doc, 'div', 'atri-knowledge-rule', undefined, panel);
            el(doc, 'h4', '', tl('State condition') + ' ' + (index + 1), row);
            const field = fields.find(field => field.providerId === condition.providerId && JSON.stringify(field.path) === JSON.stringify(condition.path));
            const fieldLabel = el(doc, 'p', 'atri-library-meta', field?.label ?? tl('Custom state field'), row);
            const reference = disclosure(doc, row, 'Exact state reference');
            if (!field && !condition.path?.length) reference.open = true;
            const changed = operation => {
                operation(); setValue(applicability); onInput();
                fieldLabel.textContent = fields.find(field => field.providerId === condition.providerId && JSON.stringify(field.path) === JSON.stringify(condition.path))?.label ?? tl('Custom state field');
            };
            input(reference, fmt('State provider ${0}', [index + 1]), condition.providerId, value => changed(() => { condition.providerId = value; }));
            input(reference, fmt('State path segments ${0}', [index + 1]), Array.isArray(condition.path) ? condition.path.join('\n') : '', value => changed(() => { condition.path = value.split('\n').filter(Boolean); }), 'textarea');
            el(doc, 'p', 'atri-library-meta', tl('Enter one exact state path segment per line.'), reference);
            input(row, fmt('Comparison ${0}', [index + 1]), condition.operator ?? 'eq', value => changed(() => { condition.operator = value; }), 'text', KNOWLEDGE_CONDITION_OPERATORS);
            const type = condition.value === null ? 'null' : typeof condition.value;
            input(row, fmt('Value type ${0}', [index + 1]), type, value => {
                changed(() => { condition.value = ({ string: '', number: 0, boolean: false, null: null })[value]; }); render(index);
            }, 'text', ['string', 'number', 'boolean', 'null']);
            if (type === 'boolean') checkbox(row, fmt('Expected value ${0}', [index + 1]), condition.value, value => changed(() => { condition.value = value; }));
            else if (type !== 'null') {
                const node = input(row, fmt('Expected value ${0}', [index + 1]), condition.value, value => changed(() => {
                    condition.value = type === 'number' ? value === '' ? undefined : Number(value) : value;
                }), type === 'number' ? 'number' : 'text');
                if (type === 'number') { node.required = true; node.step = 'any'; }
            }
            action(doc, row, 'Remove condition', () => {
                conditions.splice(index, 1); applicability.stateConditions = conditions;
                if (!conditions.length && applicability.stateActivation) applicability.stateActivation = false;
                setValue(applicability); onInput(); render('add');
            });
        });
        const add = action(doc, panel, 'Add state condition', () => {
            conditions.push({ providerId: 'atri_variables', path: [], operator: 'eq', value: '' });
            write('stateConditions', conditions); render(conditions.length - 1);
        }, { disabled: conditions.length >= 32 });
        [...panel.querySelectorAll('input, select, textarea')].forEach((control, index) => {
            control.name = 'state-condition-' + index; control.autocomplete = 'off';
        });
        if (focus === 'add') add.focus();
        else if (typeof focus === 'number') {
            const row = panel.querySelectorAll('.atri-knowledge-rule')[focus];
            (row?.querySelector('details[open] input') ?? row?.querySelector('select'))?.focus();
        }
    }
    render();
    return { root: panel };
}
