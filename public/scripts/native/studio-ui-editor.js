import {
    compileExperienceComponentModel,
    renderExperienceComponentModel,
} from '../extensions/game-runtime/ui/component-model.js';
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
    node.textContent = label;
    node.disabled = disabled;
    node.dataset.active = active ? 'true' : 'false';
    node.addEventListener('click', onClick);
    return node;
}

function textarea(documentRef, value, label) {
    const node = documentRef.createElement('textarea');
    node.className = 'text_pole atria-studio-editor__textarea';
    node.value = value;
    node.setAttribute('aria-label', label);
    return node;
}

function input(documentRef, value, label) {
    const node = documentRef.createElement('input');
    node.className = 'text_pole';
    node.value = value ?? '';
    node.setAttribute('aria-label', label);
    return node;
}

function select(documentRef, value, options, label) {
    const node = documentRef.createElement('select');
    node.className = 'text_pole';
    node.setAttribute('aria-label', label);
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
    caption.textContent = label;
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
        selectedId = nextSelectedId;
        statusMessage = 'Structured UI changes are local until staged for ChangeSet review.';
        render();
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
            const typeControl = select(documentRef, record.node.type, TYPES, 'Component type');
            const textControl = input(documentRef, record.node.props?.text || '', 'Component text');
            const classControl = input(documentRef, record.node.props?.className || '', 'Component class');
            const ariaControl = input(documentRef, record.node.props?.ariaLabel || '', 'Component aria label');
            properties.append(
                field(documentRef, 'Type', typeControl),
                field(documentRef, 'Text', textControl),
                field(documentRef, 'Class', classControl),
                field(documentRef, 'ARIA label', ariaControl),
            );
            properties.append(button(documentRef, 'Apply Properties', () => {
                updateModel(updateComponentNode(model, record.id, node => {
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
                }));
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
        const editor = textarea(documentRef, JSON.stringify(value, null, 2), 'Component bindings JSON');
        body.append(editor);
        body.append(button(documentRef, 'Apply Bindings', () => {
            try {
                const parsed = parseObject(editor.value, 'Bindings');
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
                statusMessage = error?.message || String(error);
                render();
            }
        }));
    }

    function renderSource(body) {
        const editor = textarea(documentRef, JSON.stringify(model, null, 2), 'Structured UI source JSON');
        body.append(editor);
        body.append(button(documentRef, 'Apply Source', () => {
            try {
                const parsed = JSON.parse(editor.value);
                validate(parsed);
                model = clone(parsed);
                selectedId = model.id;
                statusMessage = 'Structured source parsed and validated.';
                render();
            } catch (error) {
                statusMessage = error?.message || String(error);
                render();
            }
        }));
    }

    function render() {
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
        footer.append(status, button(documentRef, 'Stage UI Change', () => {
            const compiled = validate();
            onStage(clone(model), compiled);
        }));
        shell.append(footer);
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
