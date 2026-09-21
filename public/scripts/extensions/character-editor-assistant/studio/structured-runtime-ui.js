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

function editorKind(selection) {
    if (selection?.role === 'world_schema') return STRUCTURED_RUNTIME_EDITOR.WORLD_SCHEMA;
    if (selection?.role === 'initial_state') return STRUCTURED_RUNTIME_EDITOR.INITIAL_STATE;
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
            if (target?.matches?.('[data-structured-field]')) {
                handleChange(target);
            }
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
        const shell = ensureShell();
        if (!shell) return;
        if (!kind) {
            shell.modebar.hidden = true;
            parsed = null;
            setMode('raw');
            return;
        }

        shell.modebar.hidden = false;
        try {
            parsed = parseStructuredRuntimeDocument(kind, getSourceText());
            if (kind === STRUCTURED_RUNTIME_EDITOR.WORLD_SCHEMA) renderWorldSchema();
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
        const source = serializeStructuredRuntimeDocument(nextValue);
        setSourceText(source, selection?.path || '');
        parsed = parseStructuredRuntimeDocument(kind, source);
        if (kind === STRUCTURED_RUNTIME_EDITOR.WORLD_SCHEMA) renderWorldSchema();
        else renderInitialState();
    }

    function handleChange(target) {
        const rowElement = target.closest('[data-structured-row]');
        if (!rowElement || !parsed) return;
        const row = parsed.model.rows[Number(rowElement.dataset.structuredRow)];
        const field = target.dataset.structuredField;
        if (!row || !field) return;

        try {
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

    async function validateBeforeSave() {
        const kind = editorKind(selection);
        if (!kind) return;

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
            render({ preferStructured: Boolean(editorKind(selection)) });
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
