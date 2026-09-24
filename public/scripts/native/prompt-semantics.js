import { el, field, action, disclosure } from './library-ui.js';
import { translateShellText as tl } from '../atria-shell/localization.js';
import { validatePromptParameters } from './prompt-parameter-contracts.js';
const clone = value => JSON.parse(JSON.stringify(value));
const key = ref => JSON.stringify(ref, Object.keys(ref).sort());
function select(doc, root, label, choices, value) {
    const wrap = el(doc, 'label', 'atri-library-field', tl(label), root), node = el(doc, 'select', '', undefined, wrap); node.setAttribute('aria-label', tl(label));
    if (value && !choices.some(([id]) => id === value)) choices = [...choices, [value, value]];
    for (const [id, text] of choices) { const option = el(doc, 'option', '', tl(text), node); option.value = id; }
    node.value = value || ''; return node;
}
function typedInput(doc, root, label, type, value) {
    if (type === 'boolean') { const node = select(doc, root, label, [['true', 'True'], ['false', 'False']], String(value ?? false)); return () => node.value === 'true'; }
    const input = field(doc, root, label, type === 'json' ? JSON.stringify(value ?? null) : value ?? '', type === 'number' ? 'number' : 'text');
    if (type === 'number') input.step = 'any';
    return () => { if (type === 'json') return JSON.parse(input.value); if (type === 'number') { if (!input.value.trim() || !Number.isFinite(Number(input.value))) throw new Error(tl('Enter a finite number.')); return Number(input.value); } return input.value; };
}

export function mountPromptCondition(doc, root, value = null, depth = 0) {
    const section = el(doc, 'fieldset', 'atri-prompt-condition', undefined, root); el(doc, 'legend', '', tl('Condition'), section);
    const initial = value?.op ? 'compare' : value?.all ? 'all' : value?.any ? 'any' : value?.not !== undefined ? 'not' : '';
    const kind = select(doc, section, 'Condition kind', [['', 'Always'], ['compare', 'Compare value'], ['all', 'All conditions'], ['any', 'Any condition'], ['not', 'Not condition']], initial);
    const body = el(doc, 'div', '', undefined, section); let read = () => null;
    function render(current) {
        body.replaceChildren();
        if (!kind.value) { read = () => null; return; }
        if (depth >= 16) { read = () => { throw new Error(tl('Condition nesting is too deep.')); }; return; }
        if (kind.value === 'compare') {
            const path = field(doc, body, 'Variable path', current?.path || '');
            el(doc, 'small', '', tl('Use param, module, local, artifact or host followed by a declared variable name.'), body);
            const op = select(doc, body, 'Comparison', [['eq', 'Equals'], ['neq', 'Does not equal'], ['in', 'Is one of'], ['exists', 'Exists'], ['gt', 'Greater than'], ['gte', 'At least'], ['lt', 'Less than'], ['lte', 'At most'], ['contains', 'Contains']], current?.op || 'eq');
            const type = select(doc, body, 'Value type', ['string', 'number', 'boolean', 'json'].map(item => [item, item]), current?.value === null || typeof current?.value === 'object' ? 'json' : typeof current?.value === 'number' || typeof current?.value === 'boolean' ? typeof current.value : 'string');
            const valueBox = el(doc, 'div', '', undefined, body); let readValue;
            function renderValue() { valueBox.replaceChildren(); readValue = typedInput(doc, valueBox, 'Comparison value', type.value, current?.value); valueBox.hidden = op.value === 'exists'; type.parentElement.hidden = op.value === 'exists'; }
            type.addEventListener('change', () => { current = null; renderValue(); }); op.addEventListener('change', () => { valueBox.hidden = op.value === 'exists'; type.parentElement.hidden = op.value === 'exists'; }); renderValue();
            read = () => {
                if (!/^(param|module|local|artifact|host)\.[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*$/.test(path.value) || path.value.split('.').some(item => ['constructor', '__proto__', 'prototype'].includes(item))) throw new Error(tl('Choose a declared variable path.'));
                const result = { op: op.value, path: path.value }; if (op.value !== 'exists') result.value = readValue();
                if (op.value === 'in' && !Array.isArray(result.value)) throw new Error(tl('Is one of requires a JSON array.'));
                return result;
            };
        } else if (kind.value === 'not') { const child = mountPromptCondition(doc, body, current?.not, depth + 1); read = () => ({ not: child() }); } else {
            const children = []; const kindValue = kind.value;
            function add(child = null) { const box = el(doc, 'div', '', undefined, body), item = { read: mountPromptCondition(doc, box, child, depth + 1) }; children.push(item); action(doc, box, 'Remove condition', () => { if (children.length > 1) { children.splice(children.indexOf(item), 1); box.remove(); } }); }
            for (const child of current?.[kindValue] || [null]) add(child);
            action(doc, body, 'Add condition', () => { if (children.length >= 64) throw new Error(tl('Too many conditions.')); add(); }); read = () => ({ [kindValue]: children.map(item => item.read()) });
        }
    }
    kind.addEventListener('change', () => render(null)); render(value); return () => read();
}

export function mountPromptParameters(doc, root, definitions = {}) {
    const section = el(doc, 'section', 'atri-prompt-parameters', undefined, root); el(doc, 'h4', '', tl('Typed parameters'), section);
    const rows = [];
    function add(name = '', definition = { type: 'string' }) {
        const row = el(doc, 'fieldset', '', undefined, section); const nameInput = field(doc, row, 'Parameter name', name);
        const type = select(doc, row, 'Parameter type', ['string', 'number', 'boolean', 'json'].map(item => [item, item]), definition.type);
        const required = field(doc, row, 'Required parameter', '', 'checkbox'); required.checked = Boolean(definition.required); required.parentElement.classList.add('atri-prompt-toggle');
        const enabled = field(doc, row, 'Use default value', '', 'checkbox'); enabled.checked = Object.hasOwn(definition, 'default'); enabled.parentElement.classList.add('atri-prompt-toggle');
        const valueBox = el(doc, 'div', '', undefined, row); let readValue;
        function draw() { valueBox.replaceChildren(); readValue = typedInput(doc, valueBox, 'Default value', type.value, definition.default); valueBox.hidden = !enabled.checked; }
        type.addEventListener('change', () => { definition = {}; draw(); }); enabled.addEventListener('change', () => { valueBox.hidden = !enabled.checked; }); draw();
        const item = { read: () => [nameInput.value, { type: type.value, required: required.checked, ...(enabled.checked ? { default: readValue() } : {}) }] }; rows.push(item);
        action(doc, row, 'Remove parameter', () => { rows.splice(rows.indexOf(item), 1); row.remove(); });
    }
    for (const [name, definition] of Object.entries(definitions)) add(name, definition);
    action(doc, section, 'Add parameter', () => add());
    return () => { const pairs = rows.map(item => item.read()); if (new Set(pairs.map(([name]) => name)).size !== pairs.length) throw new Error(tl('Parameter names must be unique.')); return validatePromptParameters(Object.fromEntries(pairs)); };
}

export function mountPromptDerive(doc, root, draft, entries, ownerRef, getStages) {
    const section = el(doc, 'section', 'atri-prompt-derive', undefined, root); el(doc, 'h4', '', tl('Derive operations'), section);
    const allowed = entries.filter(item => item.ref.scope === 'library' || ownerRef.scope === 'project' && item.ref.scope === 'project' && item.ref.projectId === ownerRef.projectId);
    const programs = allowed.filter(item => item.ref.resourceType === 'core.prompt-program' && item.ref.resourceId !== ownerRef.resourceId);
    const modules = allowed.filter(item => item.ref.resourceType === 'core.prompt-module');
    const choices = items => items.map(item => [key(item.ref), item.resource.displayName + ' · ' + item.ref.revision]);
    const parent = select(doc, section, 'Exact parent program', [['', 'No parent'], ...choices(programs)], draft.parentRef ? key(draft.parentRef) : '');
    el(doc, 'p', '', tl('Derive changes this revision only. The exact parent and module originals remain unchanged.'), section);
    const rows = [];
    function inheritedModules() {
        const result = new Map(), active = new Set();
        function visit(program) {
            if (program.parentRef) {
                const id = key(program.parentRef); if (active.has(id)) throw new Error(tl('The exact parent chain contains a cycle.')); active.add(id);
                const found = entries.find(item => key(item.ref) === id); if (!found) throw new Error(tl('The exact parent revision is unavailable.')); visit(found.resource); active.delete(id);
            }
            for (const stage of program.stages || []) for (const ref of stage.moduleRefs) result.set(ref.resourceId, entries.find(item => key(item.ref) === key(ref)));
            for (const op of program.derive || []) if (op.replacementRef) result.set(op.moduleId, entries.find(item => key(item.ref) === key(op.replacementRef)));
        }
        visit({ parentRef: parent.value ? JSON.parse(parent.value) : null, stages: getStages() }); return result;
    }
    function add(value = { op: 'disable', moduleId: '' }) {
        const row = el(doc, 'fieldset', '', undefined, section); const op = select(doc, row, 'Derive action', [['add', 'Add module'], ['disable', 'Disable module'], ['replace', 'Replace module'], ['configure', 'Configure module parameters']], value.op);
        const targetChoices = [...new Map(modules.map(item => [item.ref.resourceId, [item.ref.resourceId, item.resource.displayName]])).values()];
        const target = select(doc, row, 'Affected module', [['', 'Choose module…'], ...targetChoices], value.moduleId);
        const replacement = select(doc, row, 'Exact replacement module', [['', 'Choose exact module…'], ...choices(modules)], value.replacementRef ? key(value.replacementRef) : '');
        const configBox = el(doc, 'div', '', undefined, row); let configRead = () => ({});
        function drawConfig() {
            configBox.replaceChildren(); replacement.parentElement.hidden = !['add', 'replace'].includes(op.value); target.parentElement.hidden = op.value === 'add'; configBox.hidden = op.value !== 'configure';
            if (op.value !== 'configure') return;
            let module; try { module = inheritedModules().get(target.value)?.resource; } catch (error) { el(doc, 'p', '', error.message, configBox); }
            if (!module) { el(doc, 'p', '', tl('Select a module from the exact parent or current stages to configure it.'), configBox); configRead = () => { throw new Error(tl('The configured module is unavailable.')); }; return; }
            const fields = Object.entries(module.parameters || {}).map(([name, definition]) => {
                const box = el(doc, 'fieldset', '', undefined, configBox); el(doc, 'legend', '', name, box);
                const enabled = field(doc, box, 'Override parameter', '', 'checkbox'); enabled.checked = Object.hasOwn(value.config || {}, name); enabled.parentElement.classList.add('atri-prompt-toggle');
                const read = typedInput(doc, box, 'Parameter value', definition.type, value.config?.[name] ?? definition.default);
                return { name, enabled, read };
            });
            const unknown = Object.keys(value.config || {}).filter(name => !Object.hasOwn(module.parameters || {}, name));
            if (unknown.length) disclosure(doc, configBox, 'Unknown parameter overrides', Object.fromEntries(unknown.map(name => [name, value.config[name]])));
            configRead = () => { if (unknown.length) throw new Error(tl('Unknown parameter overrides require correction in Advanced editor.')); return Object.fromEntries(fields.filter(item => item.enabled.checked).map(item => [item.name, item.read()])); };
        }
        for (const control of [op, target]) control.addEventListener('change', () => { value.config = {}; drawConfig(); });
        parent.addEventListener('change', drawConfig); drawConfig();
        const item = { read: () => {
            const result = { op: op.value, moduleId: target.value };
            if (['add', 'replace'].includes(op.value)) { if (!replacement.value) throw new Error(tl('Choose an exact replacement module.')); result.replacementRef = JSON.parse(replacement.value); if (op.value === 'add') result.moduleId = result.replacementRef.resourceId; }
            if (!result.moduleId) throw new Error(tl('Choose an affected module.'));
            if (op.value === 'configure') result.config = configRead(); return result;
        } }; rows.push(item); action(doc, row, 'Remove derive operation', () => { rows.splice(rows.indexOf(item), 1); row.remove(); });
    }
    for (const operation of draft.derive || []) add(clone(operation)); action(doc, section, 'Add derive operation', () => add());
    return () => { const derive = rows.map(item => item.read()); if (new Set(derive.map(item => item.moduleId)).size !== derive.length) throw new Error(tl('Only one derive operation is allowed per module.')); return { parentRef: parent.value ? JSON.parse(parent.value) : null, derive }; };
}
