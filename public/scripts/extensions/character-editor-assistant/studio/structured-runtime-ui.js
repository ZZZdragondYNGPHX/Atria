/**
 * DOM host for R6 structured runtime editors.
 *
 * The host edits the same CodeMirror buffer and source files used by the
 * existing CardApp Studio. It never persists a second configuration.
 */

import {
    STRUCTURED_RUNTIME_EDITOR,
    applyInitialStateRowValue,
    applyWorldSchemaRowPatch,
    parseStructuredRuntimeDocument,
    serializeStructuredRuntimeDocument,
    validateInitialStateAgainstSchema,
} from './structured-runtime-editors.js';
import {
    LOGIC_EDITOR_SECTION,
    addLogicEntry,
    applyFormulaExpression,
    applyLogicEntryFieldPatch,
    parseLogicStructuredDocument,
    removeLogicEntry,
} from './structured-logic-editors.js';
import {
    PROJECTION_EDITOR,
    addProjectionEntry,
    applyProjectionFieldPatch,
    parseProjectionDocument,
    previewProjectionDocument,
    removeProjectionEntry,
    serializeProjectionDocument,
} from './structured-projection-editors.js';
import { GAME_RUNTIME_ROLES } from '../../game-runtime/llm/roles.js';

function editorKind(selection) {
    if (selection?.role === 'world_schema') return STRUCTURED_RUNTIME_EDITOR.WORLD_SCHEMA;
    if (selection?.role === 'initial_state') return STRUCTURED_RUNTIME_EDITOR.INITIAL_STATE;
    return null;
}

function logicSection(selection) {
    const section = String(selection?.section || '');
    if (Object.values(LOGIC_EDITOR_SECTION).includes(section)) return section;
    return null;
}

function projectionKind(selection) {
    if (selection?.role === 'selectors') return PROJECTION_EDITOR.SELECTORS;
    if (selection?.role === 'observations') return PROJECTION_EDITOR.OBSERVATIONS;
    return null;
}

function formatValue(value) {
    if (typeof value === 'string') return value;
    if (value === null) return 'null';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

export function createStructuredRuntimeEditorHost(options = {}) {
    const documentRef = options.documentRef || document;
    const translate = typeof options.translate === 'function'
        ? options.translate
        : value => String(value || '');
    const getSourceText = options.getSourceText;
    const setSourceText = options.setSourceText;
    const getProjectNavigator = options.getProjectNavigator;
    const fetchFileContent = options.fetchFileContent;
    const notifyError = typeof options.notifyError === 'function'
        ? options.notifyError
        : () => {};
    const requestRawMeasure = typeof options.requestRawMeasure === 'function'
        ? options.requestRawMeasure
        : () => {};

    if (typeof getSourceText !== 'function' || typeof setSourceText !== 'function') {
        throw new Error('Structured Runtime Editor Host requires source-buffer access');
    }
    if (typeof getProjectNavigator !== 'function' || typeof fetchFileContent !== 'function') {
        throw new Error('Structured Runtime Editor Host requires project access');
    }

    let selection = null;
    let parsed = null;
    let mode = 'raw';
    let modebar = null;
    let container = null;
    let code = null;

    function t(value) {
        return translate(String(value || ''));
    }

    function ensureShell() {
        if (modebar && container && code) return { modebar, container, code };

        const editorArea = documentRef.querySelector('.card-app-studio-editor-area');
        code = documentRef.querySelector('[data-studio-code]');
        if (!editorArea || !code) return null;

        modebar = documentRef.createElement('div');
        modebar.className = 'card-app-studio-editor-modebar';
        modebar.hidden = true;

        const tabs = documentRef.createElement('div');
        tabs.className = 'card-app-studio-editor-mode-tabs';
        tabs.setAttribute('role', 'tablist');

        for (const [id, label] of [['structured', 'Structured'], ['raw', 'Raw Code']]) {
            const button = documentRef.createElement('button');
            button.type = 'button';
            button.className = 'card-app-studio-editor-mode';
            button.dataset.structuredMode = id;
            button.setAttribute('role', 'tab');
            button.textContent = t(label);
            tabs.appendChild(button);
        }

        const badge = documentRef.createElement('span');
        badge.className = 'card-app-studio-editor-source-badge';
        badge.textContent = t('Same source file');
        modebar.append(tabs, badge);

        container = documentRef.createElement('div');
        container.className = 'card-app-studio-structured-editor';
        container.hidden = true;

        code.before(modebar, container);

        modebar.addEventListener('click', event => {
            const button = event.target.closest('[data-structured-mode]');
            if (!button) return;
            if (button.dataset.structuredMode === 'structured') render({ preferStructured: true });
            else setMode('raw');
        });
        container.addEventListener('change', event => {
            const target = event.target;
            if (target?.matches?.('[data-structured-field], [data-logic-field], [data-formula-index], [data-projection-field]')) {
                handleChange(target);
            }
        });
        container.addEventListener('click', event => {
            const target = event.target.closest('[data-logic-action], [data-projection-action]');
            if (!target) return;
            if (target.dataset.logicAction) handleLogicAction(target);
            else void handleProjectionAction(target);
        });

        return { modebar, container, code };
    }

    function setMode(nextMode) {
        mode = nextMode === 'structured' ? 'structured' : 'raw';
        const shell = ensureShell();
        if (!shell) return;
        shell.container.hidden = mode !== 'structured';
        shell.code.hidden = mode === 'structured';
        shell.modebar.querySelectorAll('[data-structured-mode]').forEach(button => {
            const active = button.dataset.structuredMode === mode;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        if (mode === 'raw') requestRawMeasure();
    }

    function createPath(path, detail, depth) {
        const element = documentRef.createElement('span');
        element.className = 'card-app-studio-structured-path';
        element.style.setProperty('--studio-depth', String(Math.min(Number(depth) || 0, 8)));
        const title = documentRef.createElement('strong');
        title.textContent = path;
        element.appendChild(title);
        if (detail) {
            const small = documentRef.createElement('small');
            small.textContent = detail;
            element.appendChild(small);
        }
        return element;
    }

    function appendField(rowElement, label, field, value, fieldOptions = {}) {
        const wrapper = documentRef.createElement('label');
        if (fieldOptions.wide) wrapper.classList.add('wide');
        if (fieldOptions.checkbox) wrapper.classList.add('checkbox');

        const caption = documentRef.createElement('span');
        caption.textContent = label;

        let input;
        if (fieldOptions.select) {
            input = documentRef.createElement('select');
            const values = [...fieldOptions.select];
            if (value && !values.includes(String(value))) values.unshift(String(value));
            for (const item of values) {
                const option = documentRef.createElement('option');
                option.value = item;
                option.textContent = item;
                option.selected = String(value) === item;
                input.appendChild(option);
            }
        } else if (fieldOptions.multiline) {
            input = documentRef.createElement('textarea');
            input.rows = fieldOptions.rows || 5;
            input.value = value ?? '';
        } else {
            input = documentRef.createElement('input');
            input.type = fieldOptions.type || 'text';
            if (fieldOptions.min !== undefined) input.min = String(fieldOptions.min);
            if (fieldOptions.step !== undefined) input.step = String(fieldOptions.step);
            if (fieldOptions.checkbox) {
                input.type = 'checkbox';
                input.checked = Boolean(value);
            } else {
                input.value = value ?? '';
            }
        }
        input.dataset.structuredField = field;
        if (fieldOptions.checkbox) wrapper.append(input, caption);
        else wrapper.append(caption, input);
        rowElement.appendChild(wrapper);
    }

    function renderHeader(title, countLabel) {
        const header = documentRef.createElement('div');
        header.className = 'card-app-studio-structured-header';

        const identity = documentRef.createElement('div');
        const strong = documentRef.createElement('strong');
        strong.textContent = title;
        const source = documentRef.createElement('span');
        source.textContent = selection?.path || '';
        identity.append(strong, source);

        const count = documentRef.createElement('span');
        count.textContent = countLabel;
        header.append(identity, count);

        container.replaceChildren(header);
        const scroll = documentRef.createElement('div');
        scroll.className = 'card-app-studio-structured-scroll';
        container.appendChild(scroll);
        return scroll;
    }

    function renderWorldSchema() {
        const scroll = renderHeader(
            t('World Schema Editor'),
            String(parsed.model.rows.length) + ' ' + t('schema nodes'),
        );
        const types = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];

        parsed.model.rows.forEach((row, index) => {
            const element = documentRef.createElement('div');
            element.className = 'card-app-studio-structured-row schema-row';
            element.dataset.structuredRow = String(index);
            element.appendChild(createPath(row.path, row.description, row.depth));
            appendField(element, t('Type'), 'type', row.type, { select: types });
            if (row.path !== '$' && !row.path.endsWith('.[]')) {
                appendField(element, t('Required'), 'required', row.required, { checkbox: true });
            }
            if (row.type === 'number' || row.type === 'integer') {
                appendField(element, 'Min', 'minimum', row.minimum, { type: 'number' });
                appendField(element, 'Max', 'maximum', row.maximum, { type: 'number' });
            }
            if (row.type === 'string') {
                appendField(element, 'Min length', 'minLength', row.minLength, {
                    type: 'number',
                    min: 0,
                    step: 1,
                });
                appendField(element, 'Max length', 'maxLength', row.maxLength, {
                    type: 'number',
                    min: 0,
                    step: 1,
                });
                appendField(element, 'Pattern', 'pattern', row.pattern, { wide: true });
            }
            scroll.appendChild(element);
        });
    }

    function renderInitialState() {
        const scroll = renderHeader(
            t('Initial State Editor'),
            String(parsed.model.rows.length) + ' ' + t('editable values'),
        );

        parsed.model.rows.forEach((row, index) => {
            const element = documentRef.createElement('label');
            element.className = 'card-app-studio-structured-row state-row';
            element.dataset.structuredRow = String(index);
            element.appendChild(createPath(row.label, row.type, row.depth));

            let input;
            if (row.type === 'boolean') {
                input = documentRef.createElement('select');
                for (const value of ['true', 'false']) {
                    const option = documentRef.createElement('option');
                    option.value = value;
                    option.textContent = value;
                    option.selected = String(row.value) === value;
                    input.appendChild(option);
                }
            } else {
                input = documentRef.createElement('input');
                input.value = formatValue(row.value);
            }
            input.dataset.structuredField = 'value';
            element.appendChild(input);
            scroll.appendChild(element);
        });
    }

    function sectionTitle(section) {
        if (section === LOGIC_EDITOR_SECTION.COMMANDS) return t('Command Editor');
        if (section === LOGIC_EDITOR_SECTION.REDUCERS) return t('Reducer / Event Inspector');
        if (section === LOGIC_EDITOR_SECTION.RULES) return t('Rules Editor');
        return t('Interpretation Mapping Editor');
    }

    function appendLogicField(card, label, field, value, fieldOptions = {}) {
        const wrapper = documentRef.createElement('label');
        wrapper.className = 'card-app-studio-logic-field';
        if (fieldOptions.wide) wrapper.classList.add('wide');
        if (fieldOptions.checkbox) wrapper.classList.add('checkbox');

        const caption = documentRef.createElement('span');
        caption.textContent = label;

        let input;
        if (fieldOptions.multiline) {
            input = documentRef.createElement('textarea');
            input.rows = fieldOptions.rows || 5;
            input.value = value ?? '';
        } else {
            input = documentRef.createElement('input');
            input.type = fieldOptions.checkbox ? 'checkbox' : (fieldOptions.type || 'text');
            if (fieldOptions.checkbox) input.checked = Boolean(value);
            else input.value = value ?? '';
        }
        input.dataset.logicField = field;
        if (fieldOptions.checkbox) wrapper.append(input, caption);
        else wrapper.append(caption, input);
        card.appendChild(wrapper);
    }

    function renderLogicEntry(scroll, entry) {
        const card = documentRef.createElement('section');
        card.className = 'card-app-studio-logic-card';
        card.dataset.logicEntry = String(entry.index);

        const header = documentRef.createElement('div');
        header.className = 'card-app-studio-logic-card-header';
        const title = documentRef.createElement('strong');
        title.textContent = entry.label;
        const remove = documentRef.createElement('button');
        remove.type = 'button';
        remove.className = 'card-app-studio-btn small';
        remove.dataset.logicAction = 'remove';
        remove.dataset.logicEntry = String(entry.index);
        remove.textContent = t('Delete');
        header.append(title, remove);
        card.appendChild(header);

        const fields = entry.fields;
        if (parsed.model.section === LOGIC_EDITOR_SECTION.COMMANDS) {
            appendLogicField(card, 'ID', 'id', fields.id);
            appendLogicField(card, t('Description'), 'description', fields.description, { wide: true });
            appendLogicField(card, 'LLM expose', 'llmExpose', fields.llmExpose, { checkbox: true });
            appendLogicField(card, 'Args Schema', 'argsSchema', fields.argsSchema, { multiline: true, wide: true });
            appendLogicField(card, t('Validators'), 'validators', fields.validators, { multiline: true, wide: true });
            appendLogicField(card, t('Events'), 'events', fields.events, { multiline: true, wide: true });
        } else if (parsed.model.section === LOGIC_EDITOR_SECTION.REDUCERS) {
            appendLogicField(card, t('Event Type'), 'type', fields.type);
            appendLogicField(card, 'Payload Schema', 'payloadSchema', fields.payloadSchema, { multiline: true, wide: true });
            appendLogicField(card, t('Assignments'), 'assign', fields.assign, { multiline: true, wide: true });
        } else if (parsed.model.section === LOGIC_EDITOR_SECTION.RULES) {
            appendLogicField(card, 'ID', 'id', fields.id);
            appendLogicField(card, t('On Events'), 'on', fields.on, { multiline: true });
            appendLogicField(card, t('Priority'), 'priority', fields.priority, { type: 'number' });
            appendLogicField(card, t('When Formula'), 'when', fields.when, { wide: true });
            appendLogicField(card, t('Events'), 'events', fields.events, { multiline: true, wide: true });
        } else {
            appendLogicField(card, t('Semantic Event Type'), 'eventType', fields.eventType);
            appendLogicField(card, t('Command'), 'command', fields.command);
            appendLogicField(card, t('When Formula'), 'when', fields.when, { wide: true });
            appendLogicField(card, t('Arguments'), 'args', fields.args, { multiline: true, wide: true });
        }

        scroll.appendChild(card);
    }

    function renderFormulaRows(scroll) {
        if (!parsed.model.formulas.length) return;

        const group = documentRef.createElement('section');
        group.className = 'card-app-studio-formula-editor';
        const header = documentRef.createElement('div');
        header.className = 'card-app-studio-formula-header';
        const title = documentRef.createElement('strong');
        title.textContent = t('Formula Editor');
        const note = documentRef.createElement('span');
        note.textContent = t('Validated by the R3 safe Formula AST');
        header.append(title, note);
        group.appendChild(header);

        parsed.model.formulas.forEach((formula, index) => {
            const row = documentRef.createElement('label');
            row.className = 'card-app-studio-formula-row';
            const path = documentRef.createElement('span');
            path.textContent = formula.label;
            const input = documentRef.createElement('input');
            input.value = formula.expression;
            input.dataset.formulaIndex = String(index);
            row.append(path, input);
            group.appendChild(row);
        });
        scroll.appendChild(group);
    }

    function renderLogicSection() {
        const scroll = renderHeader(
            sectionTitle(parsed.model.section),
            String(parsed.model.entries.length) + ' ' + t('entries'),
        );

        const toolbar = documentRef.createElement('div');
        toolbar.className = 'card-app-studio-logic-toolbar';
        const sourceNote = documentRef.createElement('span');
        sourceNote.textContent = t('Edits compile against the live declarative Game Logic contract.');
        const add = documentRef.createElement('button');
        add.type = 'button';
        add.className = 'card-app-studio-btn small';
        add.dataset.logicAction = 'add';
        add.textContent = '+ ' + t('Add');
        toolbar.append(sourceNote, add);
        scroll.appendChild(toolbar);

        parsed.model.entries.forEach(entry => renderLogicEntry(scroll, entry));
        renderFormulaRows(scroll);
    }

    function projectionTitle(kind) {
        return kind === PROJECTION_EDITOR.SELECTORS
            ? t('Selector Editor')
            : t('Observation Editor');
    }

    function renderProjectionSection() {
        const kind = parsed.model.editor;
        const scroll = renderHeader(
            projectionTitle(kind),
            String(parsed.model.entries.length) + ' ' + t('entries'),
        );

        const toolbar = documentRef.createElement('div');
        toolbar.className = 'card-app-studio-logic-toolbar projection-toolbar';
        const note = documentRef.createElement('span');
        note.textContent = kind === PROJECTION_EDITOR.SELECTORS
            ? t('Selectors compile through the live R4 safe Formula contract.')
            : t('Observations compile into the live R5 projector contract.');

        const actions = documentRef.createElement('div');
        actions.className = 'card-app-studio-projection-actions';
        if (kind === PROJECTION_EDITOR.OBSERVATIONS) {
            const role = documentRef.createElement('select');
            role.dataset.projectionRole = '';
            for (const roleId of GAME_RUNTIME_ROLES) {
                const option = documentRef.createElement('option');
                option.value = roleId;
                option.textContent = roleId;
                option.selected = roleId === 'narrator';
                role.appendChild(option);
            }
            actions.appendChild(role);
        }

        const preview = documentRef.createElement('button');
        preview.type = 'button';
        preview.className = 'card-app-studio-btn small';
        preview.dataset.projectionAction = 'preview';
        preview.textContent = t('Preview');

        const add = documentRef.createElement('button');
        add.type = 'button';
        add.className = 'card-app-studio-btn small';
        add.dataset.projectionAction = 'add';
        add.textContent = '+ ' + t('Add');

        actions.append(preview, add);
        toolbar.append(note, actions);
        scroll.appendChild(toolbar);

        parsed.model.entries.forEach(entry => {
            const card = documentRef.createElement('section');
            card.className = 'card-app-studio-logic-card projection-card';
            card.dataset.projectionEntry = String(entry.index);

            const header = documentRef.createElement('div');
            header.className = 'card-app-studio-logic-card-header';
            const title = documentRef.createElement('strong');
            title.textContent = entry.id || (kind === PROJECTION_EDITOR.SELECTORS ? t('Selector') : t('Observation'));
            const remove = documentRef.createElement('button');
            remove.type = 'button';
            remove.className = 'card-app-studio-btn small';
            remove.dataset.projectionAction = 'remove';
            remove.dataset.projectionEntry = String(entry.index);
            remove.textContent = t('Delete');
            header.append(title, remove);
            card.appendChild(header);

            const idField = documentRef.createElement('label');
            idField.className = 'card-app-studio-logic-field';
            const idCaption = documentRef.createElement('span');
            idCaption.textContent = 'ID';
            const idInput = documentRef.createElement('input');
            idInput.value = entry.id;
            idInput.dataset.projectionField = 'id';
            idField.append(idCaption, idInput);

            const formulaField = documentRef.createElement('label');
            formulaField.className = 'card-app-studio-logic-field wide';
            const formulaCaption = documentRef.createElement('span');
            formulaCaption.textContent = t('Formula');
            const formulaInput = documentRef.createElement('input');
            formulaInput.value = entry.formula;
            formulaInput.dataset.projectionField = 'formula';
            formulaField.append(formulaCaption, formulaInput);

            card.append(idField, formulaField);
            scroll.appendChild(card);
        });

        const previewBox = documentRef.createElement('pre');
        previewBox.className = 'card-app-studio-projection-preview';
        previewBox.dataset.projectionPreview = '';
        previewBox.textContent = t('Preview uses the Source Project initial World State and does not mutate a save.');
        scroll.appendChild(previewBox);
    }

    function renderError(error) {
        container.replaceChildren();
        const box = documentRef.createElement('div');
        box.className = 'card-app-studio-structured-error';
        const title = documentRef.createElement('strong');
        title.textContent = t('Structured editor unavailable');
        const detail = documentRef.createElement('span');
        detail.textContent = error?.message || String(error);
        const hint = documentRef.createElement('span');
        hint.textContent = t('Fix the source in Raw Code, then reopen Structured view.');
        box.append(title, detail, hint);
        container.appendChild(box);
    }

    function render(renderOptions = {}) {
        const kind = editorKind(selection);
        const section = logicSection(selection);
        const projection = projectionKind(selection);
        const shell = ensureShell();
        if (!shell) return;
        if (!kind && !section && !projection) {
            shell.modebar.hidden = true;
            parsed = null;
            setMode('raw');
            return;
        }

        shell.modebar.hidden = false;
        try {
            parsed = section
                ? parseLogicStructuredDocument(section, getSourceText())
                : (projection
                    ? parseProjectionDocument(projection, getSourceText())
                    : parseStructuredRuntimeDocument(kind, getSourceText()));
            if (section) renderLogicSection();
            else if (projection) renderProjectionSection();
            else if (kind === STRUCTURED_RUNTIME_EDITOR.WORLD_SCHEMA) renderWorldSchema();
            else renderInitialState();
            setMode(renderOptions.preferStructured === true ? 'structured' : mode);
        } catch (error) {
            parsed = null;
            renderError(error);
            setMode('raw');
        }
    }

    function sync(nextValue) {
        if (!parsed) return;
        const kind = parsed.model.editor;
        const source = kind === PROJECTION_EDITOR.SELECTORS || kind === PROJECTION_EDITOR.OBSERVATIONS
            ? serializeProjectionDocument(nextValue, kind)
            : serializeStructuredRuntimeDocument(nextValue);
        setSourceText(source, selection?.path || '');
        if (kind === 'game_logic') {
            parsed = parseLogicStructuredDocument(parsed.model.section, source);
            renderLogicSection();
        } else if (kind === PROJECTION_EDITOR.SELECTORS || kind === PROJECTION_EDITOR.OBSERVATIONS) {
            parsed = parseProjectionDocument(kind, source);
            renderProjectionSection();
        } else {
            parsed = parseStructuredRuntimeDocument(kind, source);
            if (kind === STRUCTURED_RUNTIME_EDITOR.WORLD_SCHEMA) renderWorldSchema();
            else renderInitialState();
        }
    }

    function handleChange(target) {
        if (!parsed) return;

        try {
            if (parsed.model.editor === PROJECTION_EDITOR.SELECTORS || parsed.model.editor === PROJECTION_EDITOR.OBSERVATIONS) {
                const entryElement = target.closest('[data-projection-entry]');
                const field = target.dataset.projectionField;
                if (!entryElement || !field) return;
                sync(applyProjectionFieldPatch(
                    parsed.value,
                    parsed.model.editor,
                    Number(entryElement.dataset.projectionEntry),
                    field,
                    target.value,
                ));
                return;
            }

            if (parsed.model.editor === 'game_logic') {
                if (target.dataset.formulaIndex !== undefined) {
                    const formula = parsed.model.formulas[Number(target.dataset.formulaIndex)];
                    if (!formula) return;
                    sync(applyFormulaExpression(parsed.value, formula.path, target.value));
                    return;
                }

                const entryElement = target.closest('[data-logic-entry]');
                const field = target.dataset.logicField;
                if (!entryElement || !field) return;
                sync(applyLogicEntryFieldPatch(
                    parsed.value,
                    parsed.model.section,
                    Number(entryElement.dataset.logicEntry),
                    field,
                    target.type === 'checkbox' ? Boolean(target.checked) : target.value,
                ));
                return;
            }

            const rowElement = target.closest('[data-structured-row]');
            if (!rowElement) return;
            const row = parsed.model.rows[Number(rowElement.dataset.structuredRow)];
            const field = target.dataset.structuredField;
            if (!row || !field) return;

            if (parsed.model.editor === STRUCTURED_RUNTIME_EDITOR.WORLD_SCHEMA) {
                sync(applyWorldSchemaRowPatch(
                    parsed.value,
                    row.schemaPath,
                    { [field]: field === 'required' ? Boolean(target.checked) : target.value },
                ));
            } else {
                sync(applyInitialStateRowValue(parsed.value, row.path, target.value));
            }
        } catch (error) {
            notifyError(t('Structured edit rejected') + ': ' + (error?.message || String(error)));
            render({ preferStructured: true });
        }
    }

    function handleLogicAction(target) {
        if (!parsed || parsed.model.editor !== 'game_logic') return;
        const action = target.dataset.logicAction;
        try {
            if (action === 'add') {
                sync(addLogicEntry(parsed.value, parsed.model.section));
            } else if (action === 'remove') {
                sync(removeLogicEntry(
                    parsed.value,
                    parsed.model.section,
                    Number(target.dataset.logicEntry),
                ));
            }
        } catch (error) {
            notifyError(t('Structured edit rejected') + ': ' + (error?.message || String(error)));
            render({ preferStructured: true });
        }
    }

    async function previewProjection() {
        if (!parsed || ![PROJECTION_EDITOR.SELECTORS, PROJECTION_EDITOR.OBSERVATIONS].includes(parsed.model.editor)) return;
        const previewBox = container?.querySelector?.('[data-projection-preview]');
        if (!previewBox) return;

        try {
            const worldPath = getProjectNavigator()?.manifest?.world?.initial;
            const world = worldPath
                ? JSON.parse(await fetchFileContent(worldPath))
                : {};
            const role = container?.querySelector?.('[data-projection-role]')?.value || 'narrator';
            const result = previewProjectionDocument(parsed.model.editor, parsed.value, world, { role });
            previewBox.textContent = JSON.stringify(result, null, 2);
        } catch (error) {
            previewBox.textContent = t('Preview failed') + ': ' + (error?.message || String(error));
        }
    }

    async function handleProjectionAction(target) {
        if (!parsed || ![PROJECTION_EDITOR.SELECTORS, PROJECTION_EDITOR.OBSERVATIONS].includes(parsed.model.editor)) return;
        try {
            if (target.dataset.projectionAction === 'add') {
                sync(addProjectionEntry(parsed.value, parsed.model.editor));
            } else if (target.dataset.projectionAction === 'remove') {
                sync(removeProjectionEntry(
                    parsed.value,
                    parsed.model.editor,
                    Number(target.dataset.projectionEntry),
                ));
            } else if (target.dataset.projectionAction === 'preview') {
                await previewProjection();
            }
        } catch (error) {
            notifyError(t('Structured edit rejected') + ': ' + (error?.message || String(error)));
            render({ preferStructured: true });
        }
    }

    async function validateBeforeSave() {
        const kind = editorKind(selection);
        const section = logicSection(selection);
        const projection = projectionKind(selection);
        if (!kind && !section && !projection) return;
        if (section) {
            parseLogicStructuredDocument(section, getSourceText());
            return;
        }
        if (projection) {
            parseProjectionDocument(projection, getSourceText());
            return;
        }

        const current = parseStructuredRuntimeDocument(kind, getSourceText());
        const world = getProjectNavigator()?.manifest?.world;
        if (!world) return;

        let schema;
        let initial;
        if (kind === STRUCTURED_RUNTIME_EDITOR.WORLD_SCHEMA) {
            schema = current.value;
            initial = parseStructuredRuntimeDocument(
                STRUCTURED_RUNTIME_EDITOR.INITIAL_STATE,
                await fetchFileContent(world.initial),
            ).value;
        } else {
            initial = current.value;
            schema = parseStructuredRuntimeDocument(
                STRUCTURED_RUNTIME_EDITOR.WORLD_SCHEMA,
                await fetchFileContent(world.schema),
            ).value;
        }

        const validation = validateInitialStateAgainstSchema(initial, schema);
        if (!validation.ok) {
            throw new Error(
                'World Schema / Initial State mismatch: '
                + validation.errors.slice(0, 6).join('; '),
            );
        }
    }

    return Object.freeze({
        open(nextSelection) {
            selection = nextSelection || null;
            mode = 'raw';
            render({ preferStructured: Boolean(editorKind(selection) || logicSection(selection) || projectionKind(selection)) });
        },
        refresh() {
            render({ preferStructured: mode === 'structured' });
        },
        validateBeforeSave,
        destroy() {
            modebar?.remove();
            container?.remove();
            if (code) code.hidden = false;
            modebar = null;
            container = null;
            code = null;
            selection = null;
            parsed = null;
            mode = 'raw';
        },
    });
}
