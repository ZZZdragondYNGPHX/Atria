import { translateShellText as t } from '../atria-shell/localization.js';
import {
    compileExperienceComponentModel,
    renderExperienceComponentModel,
} from './experience/ui/component-model.js';
import {
    flattenComponentTree,
    updateComponentNode,
} from './studio-authoring.js';

const TABS = Object.freeze(['design', 'structure', 'bindings', 'source']);
const TYPES = Object.freeze(['container', 'text', 'button', 'input', 'native-slot']);

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function button(documentRef, label, onClick, { active = false, disabled = false } = {}) {
    const node = documentRef.createElement('button');
    node.type = 'button';
    node.textContent = t(label);
    node.disabled = disabled;
    node.dataset.active = active ? 'true' : 'false';
    node.addEventListener('click', async () => {
        if (node.disabled) return;
        try {
            const result = onClick();
            if (result?.then) { node.disabled = true; node.setAttribute('aria-busy', 'true'); await result; }
        } catch (error) {
            const host = node.closest('.atria-studio-ui-editor');
            const status = host?.querySelector('.atria-studio-editor-footer span');
            if (status) { status.textContent = error.message; status.setAttribute('role', 'alert'); status.tabIndex = -1; status.focus(); }
        } finally { node.disabled = disabled; node.removeAttribute('aria-busy'); }
    });
    return node;
}

function textarea(documentRef, value, label) {
    const node = documentRef.createElement('textarea');
    node.className = 'text_pole atria-studio-editor__textarea';
    node.value = value;
    node.setAttribute('aria-label', t(label));
    return node;
}

function input(documentRef, value, label) {
    const node = documentRef.createElement('input');
    node.className = 'text_pole';
    node.value = value ?? '';
    node.setAttribute('aria-label', t(label));
    return node;
}

function select(documentRef, value, options, label) {
    const node = documentRef.createElement('select');
    node.className = 'text_pole';
    node.setAttribute('aria-label', t(label));
    for (const item of options) {
        const option = documentRef.createElement('option');
        option.value = item;
        option.textContent = item;
        option.selected = item === value;
        node.append(option);
    }
    return node;
}

function field(documentRef, label, control) {
    const wrapper = documentRef.createElement('label');
    wrapper.className = 'atria-studio-field';
    const caption = documentRef.createElement('span');
    caption.textContent = t(label);
    wrapper.append(caption, control);
    return wrapper;
}

function parseObject(value, label) {
    const parsed = value.trim() ? JSON.parse(value) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new TypeError(label + ' must be a JSON object');
    }
    return parsed;
}

function selectedRecord(model, componentId) {
    return flattenComponentTree(model).find(item => item.id === componentId) || flattenComponentTree(model)[0] || null;
}

function removeComponent(model, componentId) {
    const next = clone(model);
    if (next.id === componentId) throw new Error('The root component cannot be removed');
    let removed = false;
    function visit(node) {
        if (!Array.isArray(node.children)) return;
        const index = node.children.findIndex(child => child?.id === componentId);
        if (index >= 0) {
            node.children.splice(index, 1);
            removed = true;
            return;
        }
        for (const child of node.children) visit(child);
    }
    visit(next);
    if (!removed) throw new Error('Component not found: ' + componentId);
    return next;
}

function addChild(model, parentId, child) {
    return updateComponentNode(model, parentId, node => ({
        ...node,
        children: [...(Array.isArray(node.children) ? node.children : []), child],
    }));
}

function reorder(model, componentId, direction) {
    const next = clone(model);
    let moved = false;
    function visit(node) {
        if (!Array.isArray(node.children)) return;
        const index = node.children.findIndex(child => child?.id === componentId);
        if (index >= 0) {
            const target = index + direction;
            if (target >= 0 && target < node.children.length) {
                const [item] = node.children.splice(index, 1);
                node.children.splice(target, 0, item);
                moved = true;
            }
            return;
        }
        for (const child of node.children) visit(child);
    }
    visit(next);
    return { model: next, moved };
}

export function mountStructuredUiEditor({
    document: documentRef,
    root,
    initialModel,
    mode,
    onStage,
    idFactory = () => globalThis.crypto?.randomUUID?.() || String(Date.now()),
}) {
    let model = clone(initialModel);
    let selectedId = model?.id || null;
    let activeTab = 'design';
    let statusMessage = '';
    let sourceDraft = null;
    const bindingDrafts = new Map();
    const propertyDrafts = new Map();
    const pendingDrafts = new Set();
    let invalidDraft = false;

    const shell = documentRef.createElement('section');
    shell.className = 'atria-studio-ui-editor';
    shell.dataset.atriaStudioUiEditor = 'true';
    root.replaceChildren(shell);

    function validate(nextModel = model) {
        return compileExperienceComponentModel(nextModel, { mode });
    }

    function updateModel(nextModel, nextSelectedId = selectedId) {
        validate(nextModel);
        model = clone(nextModel);
        const currentIds = new Set(flattenComponentTree(model).map(record => record.id));
        for (const id of propertyDrafts.keys()) if (!currentIds.has(id)) { propertyDrafts.delete(id); pendingDrafts.delete('properties:' + id); }
        for (const id of bindingDrafts.keys()) if (!currentIds.has(id)) { bindingDrafts.delete(id); pendingDrafts.delete(id); }
        if (!pendingDrafts.has('source')) sourceDraft = null;
        invalidDraft = false;
        selectedId = nextSelectedId;
        statusMessage = 'Structured UI changes are local until staged for ChangeSet review.';
        render();
    }

    function showError(error) {
        invalidDraft = true;
        const status = shell.querySelector('.atria-studio-editor-footer span');
        status.textContent = error?.message || String(error);
        status.setAttribute('role', 'alert'); status.tabIndex = -1; status.focus();
        shell.querySelector('.atria-studio-editor-footer button').disabled = true;
    }

    function markDraft(key) {
        pendingDrafts.add(key);
        shell.querySelector('.atria-studio-editor-footer span').textContent = t('Apply the edited fields locally before staging the UI for review.');
        shell.querySelector('.atria-studio-editor-footer button').disabled = true;
    }

    function renderTabs(container) {
        const tabs = documentRef.createElement('nav');
        tabs.className = 'atria-studio-editor-tabs';
        for (const tab of TABS) {
            tabs.append(button(documentRef, tab[0].toUpperCase() + tab.slice(1), () => {
                activeTab = tab;
                render();
            }, { active: tab === activeTab }));
        }
        container.append(tabs);
    }

    function renderDesign(body) {
        const layout = documentRef.createElement('div');
        layout.className = 'atria-studio-design';

        const canvas = documentRef.createElement('div');
        canvas.className = 'atria-studio-design__canvas';
        canvas.dataset.atriaStudioCanvas = 'true';
        const compiled = validate();
        const rendered = renderExperienceComponentModel(documentRef, compiled);
        canvas.append(rendered);
        canvas.addEventListener('click', event => {
            const target = event.target?.closest?.('[data-atria-component-id]');
            if (!target) return;
            selectedId = target.dataset.atriaComponentId;
            render();
        });

        const record = selectedRecord(model, selectedId);
        const properties = documentRef.createElement('div');
        properties.className = 'atria-studio-design__properties';
        if (record) {
            const draft = propertyDrafts.get(record.id) || { type: record.node.type, text: record.node.props?.text || '', className: record.node.props?.className || '', ariaLabel: record.node.props?.ariaLabel || '' };
            const typeControl = select(documentRef, draft.type, TYPES, 'Component type');
            const textControl = input(documentRef, draft.text, 'Component text');
            const classControl = input(documentRef, draft.className, 'Component class');
            const ariaControl = input(documentRef, draft.ariaLabel, 'Component aria label');
            for (const control of [typeControl, textControl, classControl, ariaControl]) control.addEventListener('input', () => {
                propertyDrafts.set(record.id, { type: typeControl.value, text: textControl.value, className: classControl.value, ariaLabel: ariaControl.value });
                markDraft('properties:' + record.id);
            });
            properties.append(
                field(documentRef, 'Type', typeControl),
                field(documentRef, 'Text', textControl),
                field(documentRef, 'Class', classControl),
                field(documentRef, 'ARIA label', ariaControl),
            );
            properties.append(button(documentRef, 'Apply Properties', () => {
                const nextModel = updateComponentNode(model, record.id, node => {
                    const props = { ...(node.props || {}) };
                    for (const [key, value] of [
                        ['text', textControl.value],
                        ['className', classControl.value],
                        ['ariaLabel', ariaControl.value],
                    ]) {
                        if (value) props[key] = value;
                        else delete props[key];
                    }
                    if (typeControl.value !== 'native-slot') delete props.component;
                    return {
                        ...node,
                        type: typeControl.value,
                        props,
                    };
                });
                validate(nextModel);
                pendingDrafts.delete('properties:' + record.id); propertyDrafts.delete(record.id);
                updateModel(nextModel);
            }));
        }

        layout.append(canvas, properties);
        body.append(layout);
    }

    function renderStructure(body) {
        const tree = documentRef.createElement('div');
        tree.className = 'atria-studio-structure-tree';
        for (const record of flattenComponentTree(model)) {
            const row = documentRef.createElement('div');
            row.className = 'atria-studio-structure-tree__row';
            row.dataset.atriaComponentId = record.id;
            row.dataset.active = record.id === selectedId ? 'true' : 'false';
            row.style.setProperty('--atria-tree-depth', String(record.depth));
            const choose = button(documentRef, `${record.node.type} · ${record.id}`, () => {
                selectedId = record.id;
                render();
            }, { active: record.id === selectedId });
            const controls = documentRef.createElement('span');
            controls.className = 'atria-studio-structure-tree__actions';
            controls.append(
                button(documentRef, '↑', () => {
                    const result = reorder(model, record.id, -1);
                    if (result.moved) updateModel(result.model);
                }, { disabled: record.parentId == null }),
                button(documentRef, '↓', () => {
                    const result = reorder(model, record.id, 1);
                    if (result.moved) updateModel(result.model);
                }, { disabled: record.parentId == null }),
                button(documentRef, '+', () => {
                    const compact = String(idFactory()).replaceAll('-', '').toLowerCase().slice(0, 12);
                    const child = { id: 'component_' + compact, type: 'container', children: [] };
                    updateModel(addChild(model, record.id, child), child.id);
                }, { disabled: record.node.type === 'input' || record.node.type === 'native-slot' }),
                button(documentRef, '×', () => {
                    updateModel(removeComponent(model, record.id), record.parentId || model.id);
                }, { disabled: record.parentId == null }),
            );
            for (const [index, control] of [...controls.children].entries()) {
                control.setAttribute('aria-label', `${['Move up', 'Move down', 'Add child to', 'Remove'][index]} ${record.id}`);
                control.title = control.getAttribute('aria-label');
            }
            row.append(choose, controls);
            tree.append(row);
        }
        body.append(tree);
    }

    function renderBindings(body) {
        const record = selectedRecord(model, selectedId);
        if (!record) return;
        const value = {
            bindings: record.node.bindings || {},
            actions: record.node.actions || {},
            visibility: record.node.visibility || null,
            responsive: record.node.responsive || null,
        };
        const editor = textarea(documentRef, bindingDrafts.get(record.id) ?? JSON.stringify(value, null, 2), 'Component bindings JSON');
        editor.addEventListener('input', () => { bindingDrafts.set(record.id, editor.value); markDraft(record.id); });
        body.append(editor);
        body.append(button(documentRef, 'Apply Bindings', () => {
            try {
                const parsed = parseObject(editor.value, 'Bindings');
                bindingDrafts.set(record.id, editor.value);
                pendingDrafts.delete(record.id);
                updateModel(updateComponentNode(model, record.id, node => {
                    const next = { ...node };
                    for (const key of ['bindings', 'actions']) {
                        if (parsed[key] && Object.keys(parsed[key]).length) next[key] = parsed[key];
                        else delete next[key];
                    }
                    for (const key of ['visibility', 'responsive']) {
                        if (parsed[key]) next[key] = parsed[key];
                        else delete next[key];
                    }
                    return next;
                }));
            } catch (error) {
                bindingDrafts.set(record.id, editor.value); pendingDrafts.add(record.id); showError(error);
            }
        }));
    }

    function renderSource(body) {
        const editor = textarea(documentRef, sourceDraft ?? JSON.stringify(model, null, 2), 'Structured UI source JSON');
        editor.addEventListener('input', () => { sourceDraft = editor.value; markDraft('source'); });
        body.append(editor);
        body.append(button(documentRef, 'Apply Source', () => {
            try {
                const parsed = JSON.parse(editor.value);
                validate(parsed);
                model = clone(parsed);
                sourceDraft = null; bindingDrafts.clear(); invalidDraft = false;
                propertyDrafts.clear();
                pendingDrafts.clear();
                selectedId = model.id;
                statusMessage = 'Structured source parsed and validated.';
                render();
            } catch (error) {
                sourceDraft = editor.value; showError(error);
            }
        }));
    }

    function render() {
        const focused = shell.contains(documentRef.activeElement) ? documentRef.activeElement : null;
        const focusLabel = focused?.getAttribute('aria-label');
        const focusText = focused?.tagName === 'BUTTON' ? focused.textContent : null;
        shell.replaceChildren();
        renderTabs(shell);

        const body = documentRef.createElement('div');
        body.className = 'atria-studio-editor-host';
        body.dataset.atriaStudioEditorTab = activeTab;
        if (activeTab === 'design') renderDesign(body);
        else if (activeTab === 'structure') renderStructure(body);
        else if (activeTab === 'bindings') renderBindings(body);
        else renderSource(body);
        shell.append(body);

        const footer = documentRef.createElement('footer');
        footer.className = 'atria-studio-editor-footer';
        const status = documentRef.createElement('span');
        status.textContent = statusMessage || 'Atria Structured UI · lossless shared Component Model';
        status.setAttribute('role', 'status');
        footer.append(status, button(documentRef, 'Stage UI Change', () => {
            const compiled = validate();
            return onStage(clone(model), compiled);
        }, { disabled: invalidDraft || pendingDrafts.size > 0 }));
        shell.append(footer);
        const nextFocus = [...shell.querySelectorAll('button,input,select,textarea')].find(item => focusLabel ? item.getAttribute('aria-label') === focusLabel : focusText && item.textContent === focusText);
        nextFocus?.focus({ preventScroll: true });
    }

    render();

    return {
        getModel: () => clone(model),
        select(componentId) {
            if (flattenComponentTree(model).some(item => item.id === componentId)) {
                selectedId = componentId;
                render();
            }
        },
        dispose() {
            shell.remove();
        },
    };
}
