import { validateSchemaValue } from '../scripts/native/experience/world/schema.js';
import { fields, json, text } from './native-values.js';

const SCHEMA_FIELDS = {
    string: ['minLength', 'maxLength', 'enum'],
    number: ['minimum', 'maximum', 'enum'],
    integer: ['minimum', 'maximum', 'enum'],
    boolean: ['enum'],
    object: ['properties', 'required', 'additionalProperties'],
    array: ['items', 'minItems', 'maxItems'],
};

function integerBound(value, minimum, maximum, label) {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error('Invalid ' + label);
    return value;
}

// Validate the schema itself before reusing the existing deterministic data
// validator. In particular, unsupported keywords must never be silently ignored.
export function compileDataSchema(raw, depth = 0, budget = { nodes: 0 }) {
    if (depth > 8 || ++budget.nodes > 256) throw new Error('Message dataSchema complexity exceeded');
    if (!Object.hasOwn(SCHEMA_FIELDS, raw?.type)) throw new Error('Unknown message dataSchema type');
    fields(raw, ['type', ...SCHEMA_FIELDS[raw.type]], 'Message dataSchema');
    const schema = { ...raw };
    if (raw.type === 'object') {
        if (raw.additionalProperties !== false) throw new Error('Message dataSchema objects must be closed');
        fields(raw.properties, Object.keys(raw.properties ?? {}), 'Message schema properties');
        if (Object.keys(raw.properties).length > 128) throw new Error('Too many message schema properties');
        schema.properties = Object.fromEntries(Object.entries(raw.properties).map(([key, child]) => {
            if (!text(key, 128).length) throw new Error('Empty message schema property');
            return [key, compileDataSchema(child, depth + 1, budget)];
        }));
        if (raw.required !== undefined) {
            if (!Array.isArray(raw.required) || raw.required.length > 128 || new Set(raw.required).size !== raw.required.length
                || raw.required.some(key => typeof key !== 'string' || !Object.hasOwn(schema.properties, key))) throw new Error('Invalid message schema required');
        }
    }
    if (raw.type === 'array' || raw.type === 'string') {
        const min = raw.type === 'array' ? 'minItems' : 'minLength';
        const max = raw.type === 'array' ? 'maxItems' : 'maxLength';
        const limit = raw.type === 'array' ? (budget.maxArrayItems ?? 256) : 65536;
        integerBound(raw[max], 0, limit, 'message schema ' + max);
        if (raw[min] !== undefined) integerBound(raw[min], 0, raw[max], 'message schema ' + min);
        if (raw.type === 'array') schema.items = compileDataSchema(raw.items, depth + 1, budget);
    }
    if (raw.type === 'number' || raw.type === 'integer') {
        for (const key of ['minimum', 'maximum']) {
            if (raw[key] !== undefined && (typeof raw[key] !== 'number' || !Number.isFinite(raw[key])
                || (raw.type === 'integer' && !Number.isSafeInteger(raw[key])))) throw new Error('Invalid message schema numeric bound');
        }
        if (raw.type === 'integer') {
            schema.minimum ??= Number.MIN_SAFE_INTEGER;
            schema.maximum ??= Number.MAX_SAFE_INTEGER;
        }
        if (schema.minimum > schema.maximum) throw new Error('Inverted message schema numeric bounds');
    }
    if (raw.enum !== undefined) {
        if (!Array.isArray(raw.enum) || !raw.enum.length || raw.enum.length > 256 || new Set(raw.enum).size !== raw.enum.length) throw new Error('Invalid message schema enum');
        const withoutEnum = { ...schema }; delete withoutEnum.enum;
        for (const value of raw.enum) if (!validateSchemaValue(value, withoutEnum).ok) throw new Error('Invalid message schema enum value');
    }
    return json(schema);
}
