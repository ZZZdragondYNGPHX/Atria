/**
 * Pure structured-editor helpers for Atria Game Studio.
 *
 * These helpers project and edit the same JSON documents consumed by Game
 * Runtime. They never create a second persisted configuration.
 */

import { validateWorldState } from '../../game-runtime/world/schema.js';

export const STRUCTURED_RUNTIME_EDITOR = Object.freeze({
    WORLD_SCHEMA: 'world_schema',
    INITIAL_STATE: 'initial_state',
});

const WORLD_TYPES = Object.freeze([
    'object',
    'array',
    'string',
    'number',
    'integer',
    'boolean',
    'null',
]);

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertJsonObject(value, label) {
    if (!isPlainObject(value)) {
        throw new Error(label + ' must be a JSON object');
    }
}

function pathLabel(path) {
    return path.length > 0 ? path.join('.') : '$';
}

function schemaAtPath(root, schemaPath) {
    let cursor = root;
    for (const segment of schemaPath) {
        if (!cursor || typeof cursor !== 'object') {
            throw new Error('World Schema editor path is no longer valid');
        }
        cursor = cursor[segment];
    }
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
        throw new Error('World Schema editor target must be an object');
    }
    return cursor;
}

function parentSchemaForProperty(root, schemaPath) {
    if (schemaPath.length < 2 || schemaPath.at(-2) !== 'properties') {
        return null;
    }
    return schemaAtPath(root, schemaPath.slice(0, -2));
}

function normalizeSchemaType(type) {
    if (typeof type === 'string' && WORLD_TYPES.includes(type)) return type;
    if (Array.isArray(type)) return type.filter(item => typeof item === 'string').join(' | ');
    return '';
}

function walkWorldSchema(schema, schemaPath, worldPath, required, rows, depth) {
    rows.push(Object.freeze({
        schemaPath: Object.freeze([...schemaPath]),
        worldPath: Object.freeze([...worldPath]),
        path: pathLabel(worldPath),
        depth,
        type: normalizeSchemaType(schema.type),
        required,
        minimum: typeof schema.minimum === 'number' ? schema.minimum : null,
        maximum: typeof schema.maximum === 'number' ? schema.maximum : null,
        minLength: Number.isInteger(schema.minLength) ? schema.minLength : null,
        maxLength: Number.isInteger(schema.maxLength) ? schema.maxLength : null,
        pattern: typeof schema.pattern === 'string' ? schema.pattern : '',
        description: typeof schema.description === 'string' ? schema.description : '',
    }));

    if (depth >= 32) return;

    const properties = isPlainObject(schema.properties) ? schema.properties : {};
    const requiredSet = new Set(
        Array.isArray(schema.required)
            ? schema.required.filter(item => typeof item === 'string')
            : [],
    );
    for (const [key, child] of Object.entries(properties)) {
        if (!isPlainObject(child)) continue;
        walkWorldSchema(
            child,
            [...schemaPath, 'properties', key],
            [...worldPath, key],
            requiredSet.has(key),
            rows,
            depth + 1,
        );
    }

    if (isPlainObject(schema.items)) {
        walkWorldSchema(
            schema.items,
            [...schemaPath, 'items'],
            [...worldPath, '[]'],
            false,
            rows,
            depth + 1,
        );
    }
}

export function buildWorldSchemaEditorModel(input) {
    assertJsonObject(input, 'World Schema');
    const rows = [];
    walkWorldSchema(input, [], [], true, rows, 0);
    return Object.freeze({
        editor: STRUCTURED_RUNTIME_EDITOR.WORLD_SCHEMA,
        rows: Object.freeze(rows),
    });
}

function parseNumberField(value, label, integer = false) {
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value);
    if (!Number.isFinite(number) || (integer && !Number.isInteger(number))) {
        throw new Error(label + ' must be a ' + (integer ? 'whole number' : 'number'));
    }
    return number;
}

export function applyWorldSchemaRowPatch(input, schemaPath, patch = {}) {
    assertJsonObject(input, 'World Schema');
    const next = clone(input);
    const target = schemaAtPath(next, schemaPath);
    const parent = parentSchemaForProperty(next, schemaPath);
    const propertyName = schemaPath.at(-1);

    if (Object.hasOwn(patch, 'type')) {
        const type = String(patch.type || '').trim();
        if (!WORLD_TYPES.includes(type)) {
            throw new Error("Unsupported World Schema type '" + type + "'");
        }
        target.type = type;
    }

    for (const field of ['minimum', 'maximum']) {
        if (!Object.hasOwn(patch, field)) continue;
        const value = parseNumberField(patch[field], field, false);
        if (value === null) delete target[field];
        else target[field] = value;
    }

    for (const field of ['minLength', 'maxLength']) {
        if (!Object.hasOwn(patch, field)) continue;
        const value = parseNumberField(patch[field], field, true);
        if (value === null) delete target[field];
        else {
            if (value < 0) throw new Error(field + ' must be >= 0');
            target[field] = value;
        }
    }

    if (Object.hasOwn(patch, 'pattern')) {
        const pattern = String(patch.pattern ?? '');
        if (pattern) {
            try {
                new RegExp(pattern);
            } catch {
                throw new Error('pattern must be a valid regular expression');
            }
            target.pattern = pattern;
        } else {
            delete target.pattern;
        }
    }

    if (Object.hasOwn(patch, 'description')) {
        const description = String(patch.description ?? '');
        if (description) target.description = description;
        else delete target.description;
    }

    if (Object.hasOwn(patch, 'required') && parent && typeof propertyName === 'string') {
        const required = new Set(
            Array.isArray(parent.required)
                ? parent.required.filter(item => typeof item === 'string')
                : [],
        );
        if (patch.required) required.add(propertyName);
        else required.delete(propertyName);
        if (required.size > 0) parent.required = [...required];
        else delete parent.required;
    }

    return next;
}

function valueType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

function walkInitialState(value, path, rows, depth) {
    const type = valueType(value);
    if (type === 'object' && isPlainObject(value) && Object.keys(value).length > 0 && depth < 32) {
        for (const [key, child] of Object.entries(value)) {
            walkInitialState(child, [...path, key], rows, depth + 1);
        }
        return;
    }
    rows.push(Object.freeze({
        path: Object.freeze([...path]),
        label: pathLabel(path),
        depth,
        type,
        value: clone(value),
    }));
}

export function buildInitialStateEditorModel(input) {
    assertJsonObject(input, 'Initial State');
    const rows = [];
    walkInitialState(input, [], rows, 0);
    return Object.freeze({
        editor: STRUCTURED_RUNTIME_EDITOR.INITIAL_STATE,
        rows: Object.freeze(rows),
    });
}

function setAtPath(root, path, value) {
    if (path.length === 0) {
        assertJsonObject(value, 'Initial State');
        return clone(value);
    }
    const next = clone(root);
    let cursor = next;
    for (const segment of path.slice(0, -1)) {
        if (!cursor || typeof cursor !== 'object') {
            throw new Error('Initial State editor path is no longer valid');
        }
        cursor = cursor[segment];
    }
    cursor[path.at(-1)] = clone(value);
    return next;
}

export function parseInitialStateEditorValue(rawValue, currentValue) {
    const type = valueType(currentValue);
    const raw = String(rawValue ?? '');
    if (type === 'string') return raw;
    if (type === 'number') {
        const number = Number(raw);
        if (!Number.isFinite(number)) throw new Error('Expected a finite number');
        return number;
    }
    if (type === 'boolean') {
        if (raw === 'true') return true;
        if (raw === 'false') return false;
        throw new Error('Expected true or false');
    }
    if (type === 'null') {
        if (raw.trim() !== 'null') throw new Error('Expected null');
        return null;
    }
    if (type === 'array' || type === 'object') {
        let value;
        try {
            value = JSON.parse(raw);
        } catch (error) {
            throw new Error('Expected valid JSON: ' + (error?.message || String(error)));
        }
        if (type === 'array' && !Array.isArray(value)) throw new Error('Expected a JSON array');
        if (type === 'object' && !isPlainObject(value)) throw new Error('Expected a JSON object');
        return value;
    }
    throw new Error("Unsupported Initial State value type '" + type + "'");
}

export function applyInitialStateRowValue(input, path, rawValue) {
    assertJsonObject(input, 'Initial State');
    let current = input;
    for (const segment of path) {
        current = current?.[segment];
    }
    return setAtPath(input, path, parseInitialStateEditorValue(rawValue, current));
}

export function parseStructuredRuntimeDocument(editor, text) {
    let value;
    try {
        value = JSON.parse(String(text));
    } catch (error) {
        throw new Error('Source is not valid JSON: ' + (error?.message || String(error)));
    }
    assertJsonObject(
        value,
        editor === STRUCTURED_RUNTIME_EDITOR.WORLD_SCHEMA ? 'World Schema' : 'Initial State',
    );

    if (editor === STRUCTURED_RUNTIME_EDITOR.WORLD_SCHEMA) {
        return { value, model: buildWorldSchemaEditorModel(value) };
    }
    if (editor === STRUCTURED_RUNTIME_EDITOR.INITIAL_STATE) {
        return { value, model: buildInitialStateEditorModel(value) };
    }
    throw new Error("Unsupported structured runtime editor '" + editor + "'");
}

export function serializeStructuredRuntimeDocument(value) {
    return JSON.stringify(value, null, 2) + '\n';
}

export function validateInitialStateAgainstSchema(initialState, schema) {
    assertJsonObject(initialState, 'Initial State');
    assertJsonObject(schema, 'World Schema');
    return validateWorldState(initialState, schema);
}
