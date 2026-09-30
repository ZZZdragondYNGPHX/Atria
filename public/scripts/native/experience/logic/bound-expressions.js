import { fields, text } from '../../../../shared/native-values.js';
import { compileDataSchema } from '../../../../shared/native-data-schema.js';
import { assertTaskValue, taskId } from '../../../../shared/native-task-contract.js';
import { AUTHORITY_LIMITS as LIMITS, authorityInteger as integer, authorityList as list,
    authorityReference as reference } from '../../../../shared/native-authority-contract.js';
import { compileFormula } from './formula.js';

// Shared strict data-only expression/type/grant validation. No runtime reads or writes.
export const BLOCKED = new Set(['__proto__', 'prototype', 'constructor']);
const number = type => type === 'number' || type === 'integer';
export const emptySchema = () => ({ type: 'object', additionalProperties: false, properties: {} });
const idSchema = { type: 'string', minLength: 1, maxLength: 64 };

export function objectSchema(raw) {
    const schema = compileDataSchema(raw);
    if (schema.type !== 'object') throw new TypeError('Transaction schema must be a closed object');
    return schema;
}
function schemaAt(schema, parts) {
    for (const part of parts) {
        if (BLOCKED.has(part)) throw new TypeError('Unsafe Transaction path');
        if (schema?.type === 'object' && Object.hasOwn(schema.properties, part)) schema = schema.properties[part];
        else if (schema?.type === 'array' && /^(0|[1-9][0-9]*)$/.test(part) && Number(part) < schema.maxItems) schema = schema.items;
        else throw new TypeError('Unknown Transaction schema reference: ' + parts.join('.'));
    }
    return schema;
}
function fieldPath(value) {
    text(value, 256);
    const parts = value.split('.');
    if (!parts.length || parts.length > 8 || parts.some(part => !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(part) || BLOCKED.has(part))) throw new TypeError('Unsafe Transaction field path');
    return parts;
}

// Reuse the existing non-executable formula AST, with stricter roots, reference
// closure, call allowlist and static scalar types. No ambient World/data/RNG.
function expression(source, context) {
    if (!text(source, LIMITS.formulaCharacters).trim() || (source.match(/[(!+-]/g) ?? []).length > 64) throw new TypeError('Transaction formula complexity limit');
    const ast = compileFormula(source, { roots: Object.keys(context), strings: true });
    let nodes = 0;
    function infer(node, depth = 0) {
        if (++nodes > LIMITS.formulaNodes || depth > 32) throw new TypeError('Transaction formula complexity limit');
        const child = value => infer(value, depth + 1);
        const requireType = (type, expected) => {
            if (expected === 'numeric' ? !number(type) : type !== expected) throw new TypeError('Transaction formula type mismatch');
        };
        if (node.type === 'literal') return node.value === null ? 'null' : typeof node.value === 'number' && Number.isSafeInteger(node.value) ? 'integer' : typeof node.value;
        if (node.type === 'reference') {
            const [root, ...parts] = node.path;
            if (!parts.length) throw new TypeError('Transaction references must select explicit fields');
            let schema;
            if (root === 'reads') {
                const [id, ...path] = parts;
                const grant = context.reads[id];
                if (!grant || !path.length || !grant.fields.some(field => path.join('.') === field || path.join('.').startsWith(field + '.'))) throw new TypeError('Transaction read outside private grant');
                schema = schemaAt(grant.schema, path);
            } else schema = schemaAt(context[root], parts);
            if (['object', 'array'].includes(schema.type)) throw new TypeError('Transaction references must select scalar fields, not whole records');
            return schema.type;
        }
        if (node.type === 'unary') {
            const type = child(node.argument);
            requireType(type, node.operator === '!' ? 'boolean' : 'numeric');
            return node.operator === '!' ? 'boolean' : type;
        }
        if (node.type === 'binary') {
            const left = child(node.left); const right = child(node.right);
            if (['==', '!='].includes(node.operator)) {
                if (left !== right && !(number(left) && number(right))) throw new TypeError('Transaction comparison type mismatch');
                return 'boolean';
            }
            const boolean = ['&&', '||'].includes(node.operator);
            requireType(left, boolean ? 'boolean' : 'numeric'); requireType(right, boolean ? 'boolean' : 'numeric');
            if (boolean || ['<', '<=', '>', '>='].includes(node.operator)) return 'boolean';
            return left === 'integer' && right === 'integer' && node.operator !== '/' ? 'integer' : 'number';
        }
        if (node.type === 'call') {
            const arity = { min: [1, 16], max: [1, 16], clamp: [3, 3], round: [1, 1], floor: [1, 1], ceil: [1, 1], abs: [1, 1] };
            if (!Object.hasOwn(arity, node.callee)) throw new TypeError('Transaction formula function is not allowed');
            const [min, max] = arity[node.callee];
            integer(node.arguments.length, min, max, 'formula arity');
            const types = node.arguments.map(child); types.forEach(type => requireType(type, 'numeric'));
            return ['round', 'floor', 'ceil'].includes(node.callee) || types.every(type => type === 'integer') ? 'integer' : 'number';
        }
        throw new TypeError('Unsupported Transaction expression');
    }
    return infer(ast);
}
export function predicate(value, context) {
    if (expression(value, context) !== 'boolean') throw new TypeError('Transaction predicate must be boolean');
}
export function template(value, schema, context) {
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, 'formula')) {
        fields(value, ['formula'], 'Transaction expression');
        const type = expression(value.formula, context);
        if (type !== schema.type && !(schema.type === 'number' && type === 'integer')) throw new TypeError('Transaction template type mismatch');
        // C2 must validate evaluated values against this exact destination schema,
        // including enum/range/string/byte bounds, before applying any effect.
        return;
    }
    if (schema.type === 'object') {
        fields(value, Object.keys(schema.properties), 'Transaction object template');
        if ((schema.required ?? []).some(key => !Object.hasOwn(value, key))) throw new TypeError('Transaction template missing required field');
        for (const [key, item] of Object.entries(value)) template(item, schema.properties[key], context);
    } else if (schema.type === 'array') {
        if (!Array.isArray(value) || value.length < (schema.minItems ?? 0) || value.length > schema.maxItems) throw new TypeError('Transaction array template limit');
        value.forEach(item => template(item, schema.items, context));
    } else assertTaskValue(value, schema);
}
export function recordSelector(value, context) {
    template(value, idSchema, context);
    if (typeof value === 'string') taskId(value);
}
export function reads(raw, lifecycle, args) {
    return list(raw, LIMITS.readGrants, grant => {
        fields(grant, ['id', 'domainId', 'recordId', 'fields'], 'Transaction read grant');
        taskId(grant.id);
        const domain = reference(lifecycle?.domains, grant.domainId, 'read domain');
        recordSelector(grant.recordId, args ? { args } : {});
        const schema = objectSchema(domain.recordSchema);
        const paths = list(grant.fields, LIMITS.readFields, field => {
            schemaAt(schema, fieldPath(field)); return field;
        }, 'read fields');
        if (!paths.length) throw new TypeError('Transaction read requires explicit fields');
        return { ...grant, schema };
    }, 'read grants');
}
export function readContext(grants) { return Object.fromEntries(grants.map(grant => [grant.id, grant])); }
