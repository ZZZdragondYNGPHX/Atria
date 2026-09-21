import { validateSchemaValue } from '../world/schema.js';

const EVENT_TYPE_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,127}$/;
const DEFAULT_PAYLOAD_SCHEMA = Object.freeze({ type: 'object' });

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeDefinitions(definitions) {
    if (definitions instanceof Map) return [...definitions.entries()];
    if (Array.isArray(definitions)) {
        return definitions.map(definition => [definition?.type, definition]);
    }
    if (isPlainObject(definitions)) return Object.entries(definitions);
    if (definitions == null) return [];
    throw new Error('Reducer Registry definitions must be an object, Map, or array');
}

function normalizeDefinition(typeHint, raw) {
    const directReducer = typeof raw === 'function' ? raw : null;
    const source = directReducer ? {} : raw;

    if (!directReducer && !isPlainObject(source)) {
        throw new Error('Reducer definition must be a function or object');
    }

    const type = String(source?.type ?? typeHint ?? '').trim();
    if (!EVENT_TYPE_PATTERN.test(type)) {
        throw new Error('World Event type must match /^[A-Za-z][A-Za-z0-9._-]{0,127}$/');
    }

    const reduce = directReducer || source.reduce;
    if (typeof reduce !== 'function') {
        throw new Error(`Reducer '${type}' requires reduce()`);
    }

    const payloadSchema = source.payloadSchema === undefined
        ? DEFAULT_PAYLOAD_SCHEMA
        : source.payloadSchema;
    if (!isPlainObject(payloadSchema)) {
        throw new Error(`Reducer '${type}' payloadSchema must be an object`);
    }

    return Object.freeze({
        type,
        payloadSchema: clone(payloadSchema),
        reduce,
    });
}

export function createReducerRegistry(definitions = {}) {
    const entries = new Map();

    for (const [typeHint, raw] of normalizeDefinitions(definitions)) {
        const definition = normalizeDefinition(typeHint, raw);
        if (entries.has(definition.type)) {
            throw new Error(`Duplicate reducer for World Event '${definition.type}'`);
        }
        entries.set(definition.type, definition);
    }

    function validateEvent(event) {
        const type = String(event?.type || '').trim();
        const definition = entries.get(type);
        if (!definition) {
            return {
                ok: false,
                errors: [`No World reducer registered for event type '${type}'`],
            };
        }

        const result = validateSchemaValue(event?.payload ?? {}, definition.payloadSchema, {
            path: '$event.payload',
        });
        return {
            ok: result.ok,
            errors: result.errors,
        };
    }

    function toMap() {
        return new Map([...entries.values()].map(definition => [
            definition.type,
            (state, event) => {
                const validation = validateEvent(event);
                if (!validation.ok) {
                    throw new Error(
                        `World Event '${definition.type}' payload validation failed: `
                        + validation.errors.slice(0, 8).join('; '),
                    );
                }
                return definition.reduce(state, event);
            },
        ]));
    }

    function list() {
        return [...entries.values()].map(definition => ({
            type: definition.type,
            payloadSchema: clone(definition.payloadSchema),
        }));
    }

    return Object.freeze({
        size: entries.size,
        has: type => entries.has(String(type || '').trim()),
        list,
        validateEvent,
        toMap,
    });
}
