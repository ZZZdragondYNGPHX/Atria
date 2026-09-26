import { validateSchemaValue } from '../world/schema.js';
import { fields, json, text } from './v2-values.js';

export const MESSAGE_ROOTS = Object.freeze(['ui', 'prefs', 'data', 'env', 'block', 'message', 'item', 'index', 'event', 'form']);
export const MESSAGE_ACTION_POLICIES = Object.freeze(['ui-only', 'active-tail', 'fork-from-anchor']);
const ATTACHMENT_KINDS = ['claim', 'payment_request', 'item_offer', 'action_ref'];
const SCHEMA_FIELDS = {
    string: ['minLength', 'maxLength', 'enum'],
    number: ['minimum', 'maximum', 'enum'],
    integer: ['minimum', 'maximum', 'enum'],
    boolean: ['enum'],
    object: ['properties', 'required', 'additionalProperties'],
    array: ['items', 'minItems', 'maxItems'],
};

function messageId(value) {
    if (typeof value !== 'string' || !/^[a-z][a-z0-9._-]{0,63}$/.test(value) || ['__proto__', 'prototype', 'constructor'].includes(value)) throw new Error('Invalid message identifier');
    return value;
}

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
        const limit = raw.type === 'array' ? 256 : 65536;
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

/** Compile package-owned message templates with the same UI v2 compiler. */
export function compileMessageBlocks(raw = {}, compileDocument) {
    raw = json(raw);
    fields(raw, Object.keys(raw ?? {}), 'Message blocks');
    if (Object.keys(raw).length > 32) throw new Error('Message blocks allow at most 32 types');
    const entries = Object.entries(raw).map(([type, entry]) => {
        messageId(type);
        fields(entry, ['version', 'dataSchema', 'maxInstances', 'attachmentKind', 'actionPolicy', 'document'], 'Message block');
        if (entry.version !== 1) throw new Error('Unsupported message block version');
        const dataSchema = compileDataSchema(entry.dataSchema);
        if (dataSchema.type !== 'object') throw new Error('Message block dataSchema requires an object root');
        const maxInstances = entry.maxInstances === undefined ? 32 : integerBound(entry.maxInstances, 1, 32, 'message maxInstances');
        const attachmentKind = entry.attachmentKind === undefined ? null : entry.attachmentKind;
        if (entry.attachmentKind !== undefined && !ATTACHMENT_KINDS.includes(attachmentKind)) throw new Error('Unknown message attachmentKind');
        const actionPolicy = entry.actionPolicy === undefined ? 'ui-only' : entry.actionPolicy;
        if (!MESSAGE_ACTION_POLICIES.includes(actionPolicy)) throw new Error('Unknown message actionPolicy');
        const document = compileDocument(entry.document, { mode: 'component', message: true, actionPolicy });
        return [type, Object.freeze({ version: 1, dataSchema, maxInstances, attachmentKind, actionPolicy, document })];
    });
    return Object.freeze(Object.fromEntries(entries));
}

/**
 * Resolve a shared MessageProjection's flow against a compiled UI document.
 * The shared contract owns the projection envelope; this boundary owns template
 * capabilities and data. Return the original projection without rewriting it.
 */
export function validateMessageBlocks(definition, projection) {
    fields(projection, ['schemaVersion', 'flow'], 'Message projection');
    if (projection.schemaVersion !== 1) throw new Error('Unsupported message projection version');
    if (!Array.isArray(projection.flow)) throw new Error('Message projection requires flow');
    if (projection.flow.length > 128) throw new Error('Message projection flow exceeds 128 blocks');
    const blocks = definition?.messageBlocks ?? {};
    const counts = new Map(); const ids = new Set();
    for (const block of projection.flow) {
        if (block?.kind === 'prose') {
            fields(block, ['kind', 'text'], 'Message prose');
            text(block.text, 4 * 1024 * 1024);
            continue;
        }
        fields(block, ['kind', 'id', 'type', 'version', 'data'], 'Message projection block');
        if (block.kind !== 'block') throw new Error('Unknown message flow kind');
        messageId(block.id);
        if (ids.has(block.id)) throw new Error('Invalid or duplicate message block id');
        ids.add(block.id);
        if (typeof block.type !== 'string' || !Object.hasOwn(blocks, block.type)) throw new Error('Undeclared message block type');
        const template = blocks[block.type];
        if (block.version !== template.version) throw new Error('Unsupported message block version');
        const count = (counts.get(block.type) ?? 0) + 1; counts.set(block.type, count);
        if (count > template.maxInstances) throw new Error('Message block maxInstances exceeded');
        const data = json(block.data);
        const result = validateSchemaValue(data, template.dataSchema, { path: 'flow.' + block.id + '.data' });
        if (!result.ok) throw new Error('Invalid message block data: ' + result.errors.slice(0, 8).join('; '));
    }
    return projection;
}
