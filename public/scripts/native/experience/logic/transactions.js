import { fields, json, text, assertJsonDeclaration } from '../../../../shared/native-values.js';
import { compileDataSchema } from '../../../../shared/native-data-schema.js';
import { assertTaskValue, taskId } from '../../../../shared/native-task-contract.js';
import { assertNativeExperienceContract } from '../../../../shared/native-experience-contract.js';
import { AUTHORITY_LIMITS as LIMITS, authorityInteger as integer, authorityList as list,
    authorityReference as reference } from '../../../../shared/native-authority-contract.js';
import { compileFormula } from './formula.js';

const BLOCKED = new Set(['__proto__', 'prototype', 'constructor']);
const number = type => type === 'number' || type === 'integer';
const emptySchema = () => ({ type: 'object', additionalProperties: false, properties: {} });
const idSchema = { type: 'string', minLength: 1, maxLength: 64 };

function objectSchema(raw) {
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
function predicate(value, context) {
    if (expression(value, context) !== 'boolean') throw new TypeError('Transaction predicate must be boolean');
}
function template(value, schema, context) {
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
function recordSelector(value, context) {
    template(value, idSchema, context);
    if (typeof value === 'string') taskId(value);
}
function reads(raw, lifecycle, args) {
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
function readContext(grants) { return Object.fromEntries(grants.map(grant => [grant.id, grant])); }
function validators(raw, context) {
    list(raw, LIMITS.validators, validator => {
        fields(validator, ['id', 'formula', 'error'], 'Transaction validator');
        taskId(validator.id); predicate(validator.formula, context);
        if (!text(validator.error, 512)) throw new TypeError('Transaction validator requires a static error');
        return validator;
    }, 'validators');
}
function resolution(raw, context) {
    fields(raw, ['kind', 'cases', 'fallback', 'sides'], 'Transaction Resolution');
    if (!['deterministic', 'bounded_fortune'].includes(raw.kind)) throw new TypeError('Unknown Transaction Resolution policy');
    const properties = {};
    if (raw.kind === 'bounded_fortune') {
        integer(raw.sides, 2, 1000, 'Fortune sides'); properties.roll = { type: 'integer', minimum: 1, maximum: raw.sides };
    } else if (raw.sides !== undefined) throw new TypeError('Deterministic Resolution cannot declare Fortune');
    const during = { ...context, resolution: { ...emptySchema(), properties } };
    list(raw.cases, LIMITS.resolutionCases, item => {
        fields(item, ['id', 'when', 'outcome'], 'Transaction Resolution case');
        taskId(item.id); taskId(item.outcome); predicate(item.when, during); return item;
    }, 'Resolution cases');
    taskId(raw.fallback);
    properties.outcome = { type: 'string', maxLength: 64, enum: [...new Set([...raw.cases.map(item => item.outcome), raw.fallback])] };
    return { ...emptySchema(), properties };
}
function effect(raw, context, lifecycle, reducers, authority, publication = false) {
    const guard = ['when'];
    if (raw?.when !== undefined) predicate(raw.when, context);
    switch (raw?.kind) {
        case 'world.event': {
            if (publication) throw new TypeError('Derived publication only supports typed App Commands');
            fields(raw, ['kind', 'type', 'payload', ...guard], 'Transaction World Event');
            if (typeof raw.type !== 'string' || !/^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(raw.type) || BLOCKED.has(raw.type)) throw new TypeError('Invalid Transaction World Event type');
            const reducer = reducers.find(item => item.type === raw.type);
            if (!reducer) throw new TypeError('Unknown Transaction World Event reducer');
            template(raw.payload, objectSchema(reducer.payloadSchema), context); break;
        }
        case 'app.command': {
            fields(raw, ['kind', 'domainId', 'commandId', 'recordId', 'args', ...guard], 'Transaction App Command');
            const domain = reference(lifecycle?.domains, raw.domainId, 'effect domain');
            const command = reference(domain.commands, raw.commandId, 'App Command');
            recordSelector(raw.recordId, context); template(raw.args, objectSchema(command.argsSchema), context); break;
        }
        case 'clock.advance': {
            if (publication) throw new TypeError('Derived publication cannot advance clocks');
            fields(raw, ['kind', 'commandId', 'ticks', ...guard], 'Transaction clock advance');
            const advance = reference(lifecycle?.advances, raw.commandId, 'clock advance');
            if (!authority.canonicalClockId || advance.clockId !== authority.canonicalClockId) throw new TypeError('Transaction requires the declared canonical clock');
            template(raw.ticks, { type: 'integer', minimum: 1, maximum: advance.maxTicks }, context); break;
        }
        case 'workflow.transition': {
            if (publication) throw new TypeError('Derived publication cannot transition workflows');
            fields(raw, ['kind', 'workflowId', 'transitionId', ...guard], 'Transaction workflow transition');
            const workflow = reference(lifecycle?.workflows, raw.workflowId, 'workflow');
            reference(workflow.transitions, raw.transitionId, 'workflow transition'); break;
        }
        default: throw new TypeError('Unsupported Transaction effect kind');
    }
}
function effects(raw, context, lifecycle, reducers, authority, publication = false) {
    if (!Array.isArray(raw) || raw.length > LIMITS.effects) throw new TypeError('Transaction effect list limit');
    raw.forEach(item => effect(item, context, lifecycle, reducers, authority, publication));
    return raw;
}
function budget(grants, effects, authority) {
    integer(grants, 0, authority.policy.maxReadGrants, 'read grants');
    integer(effects.length, 0, authority.policy.maxEffects, 'total effects');
    for (const [kind, max] of [['world.event', authority.policy.maxWorldEvents], ['app.command', authority.policy.maxAppCommands],
        ['clock.advance', LIMITS.clockAdvances], ['workflow.transition', LIMITS.workflowTransitions]]) {
        integer(effects.filter(item => item.kind === kind).length, 0, max, kind);
    }
}

// Declaration-only IR. Nothing here reads Session state, evaluates mechanics,
// invokes commands, publishes derived records, or installs transaction handlers.
export function compileTransactionDeclarations(raw, options) {
    const contract = assertNativeExperienceContract(options.experienceContract);
    if (!contract.authorityRuntime) throw new TypeError('Game Logic v3 requires authority-transaction capability and authorityRuntime');
    const authority = contract.authorityRuntime; const lifecycle = contract.lifecycleRuntime;
    const publications = list(raw.derivedPublications, LIMITS.publications, publication => {
        fields(publication, ['id', 'reads', 'effects'], 'Derived publication'); taskId(publication.id);
        const grants = reads(publication.reads, lifecycle);
        if (!grants.length) throw new TypeError('Derived publication requires dependency reads');
        effects(publication.effects, { reads: readContext(grants) }, lifecycle, raw.reducers ?? [], authority, true);
        if (!publication.effects.length) throw new TypeError('Derived publication requires typed output');
        budget(grants.length, publication.effects, authority);
        return publication;
    }, 'derived publications');
    // A bounded single layer of rebuildable read models: no cycles, chained
    // shadow authorities or two publishers racing to own one output domain.
    const outputs = publications.flatMap(item => [...new Set(item.effects.map(effect => effect.domainId))]);
    if (new Set(outputs).size !== outputs.length) throw new TypeError('Derived publication output has multiple owners');
    if (publications.some(item => item.reads.some(read => outputs.includes(read.domainId)))) throw new TypeError('Derived publication cannot read another derived output');
    // Count the entire hook, not just each publication in isolation.
    budget(publications.reduce((sum, item) => sum + item.reads.length, 0), publications.flatMap(item => item.effects), authority);
    const transactions = list(raw.transactions, LIMITS.transactions, transaction => {
        fields(transaction, ['id', 'verb', 'inputSchema', 'intent', 'reads', 'validators', 'resolution', 'effects', 'derivedPublications', 'receipt'], 'Transaction');
        taskId(transaction.id); taskId(transaction.verb);
        const input = objectSchema(transaction.inputSchema);
        fields(transaction.intent, ['expose', 'description'], 'Transaction intent');
        if (typeof transaction.intent.expose !== 'boolean' || !text(transaction.intent.description, 1024)) throw new TypeError('Invalid Transaction intent metadata');
        const grants = reads(transaction.reads, lifecycle, input);
        const before = { args: input, reads: readContext(grants) };
        validators(transaction.validators, before);
        const result = resolution(transaction.resolution, before);
        const context = { ...before, resolution: result };
        effects(transaction.effects, context, lifecycle, raw.reducers ?? [], authority);
        if (transaction.effects.some(item => item.kind === 'app.command' && outputs.includes(item.domainId))) throw new TypeError('Transaction cannot write derived publication output directly');
        const selected = list(transaction.derivedPublications, LIMITS.publications, id => reference(publications, id, 'derived publication'), 'publication references');
        // A declared dependency must refresh even when an effect is conditional.
        const changed = transaction.effects.filter(item => item.kind === 'app.command').map(item => item.domainId);
        if (publications.some(item => item.reads.some(read => changed.includes(read.domainId)) && !selected.includes(item))) throw new TypeError('Transaction omits an affected derived publication');
        // Reserve for the whole hook: ordinary Lifecycle effects can also trigger
        // it. C2 must enforce these same ceilings on actual expanded execution.
        budget(grants.length + publications.reduce((sum, item) => sum + item.reads.length, 0),
            [...transaction.effects, ...publications.flatMap(item => item.effects)], authority);
        fields(transaction.receipt, ['schema', 'projection', 'maxBytes'], 'Transaction safe receipt');
        const schema = objectSchema(transaction.receipt.schema);
        integer(transaction.receipt.maxBytes, 1, authority.policy.maxReceiptBytes, 'receipt bytes');
        // No private reads, World/data root, ambient selectors or arbitrary call
        // can enter this projection. Only explicit input and public Resolution.
        template(transaction.receipt.projection, schema, { args: input, resolution: result });
        if (new TextEncoder().encode(JSON.stringify(transaction.receipt.projection)).byteLength > transaction.receipt.maxBytes) throw new TypeError('Transaction receipt template byte limit');
        return transaction;
    }, 'transactions');
    if (!transactions.length) throw new TypeError('Game Logic v3 requires Transactions');
    if (new Set(transactions.map(item => item.verb)).size !== transactions.length) throw new TypeError('Duplicate Transaction verb');
    const commandIds = new Set((raw.commands ?? []).map(item => item.id));
    if (transactions.some(item => commandIds.has(item.id) || commandIds.has(item.verb))) throw new TypeError('Transaction collides with ordinary command');
    const eventTypes = (raw.reducers ?? []).map(item => item.type);
    if (new Set(eventTypes).size !== eventTypes.length) throw new TypeError('Ambiguous Transaction World Event reducer');
    return json({ transactions, derivedPublications: publications });
}

export function assertTransactionLogicJson(raw) {
    return assertJsonDeclaration(raw, 'Transaction logic', LIMITS.declarationBytes);
}
