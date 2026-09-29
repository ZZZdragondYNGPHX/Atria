import { canonicalBridgeJson as canonicalJson } from '../../../public/shared/native-frontend-bridge.js';
import { taskId } from '../../../public/shared/native-task-contract.js';
import { createHash } from 'node:crypto';
import { fields, identifier, list } from '../../../public/shared/native-frontend-contract.js';
import { compileDataSchema } from '../../../public/scripts/native/experience/ui/message-templates.js';
import { validateSchemaValue } from '../../../public/scripts/native/experience/world/schema.js';

export { canonicalJson };
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const EMPTY = { type: 'object', properties: {}, additionalProperties: false };
const schema = value => compileDataSchema(value, 0, { nodes: 0, maxArrayItems: 10000 });
const equal = (a, b) => canonicalJson(a) === canonicalJson(b);

// Closed, data-only mapping: whole-input identity or a complete target object
// whose fields are public input paths/constants. No expressions or selectors.
function compileMapping(mapping, input, target) {
    if (mapping === undefined || mapping === 'identity') {
        if (!equal(input, target)) throw new TypeError('Binding schema does not match typed target');
        return 'identity';
    }
    if (!mapping || typeof mapping !== 'object') throw new TypeError('Compiled Bridge identity mismatch');
    fields(mapping, ['fields']);
    if (target.type !== 'object') throw new TypeError('Mapping target must be an object');
    fields(mapping.fields, Object.keys(target.properties));
    for (const key of target.required ?? []) if (!Object.hasOwn(mapping.fields, key)) throw new TypeError('Mapping missing required field');
    for (const [key, source] of Object.entries(mapping.fields)) {
        if (Object.hasOwn(source, 'input')) {
            fields(source, ['input']);
            if (typeof source.input !== 'string') throw new TypeError('Invalid mapping path');
            let selected = input, required = true;
            for (const part of source.input.split('.')) { identifier(part); required &&= selected?.required?.includes(part) ?? false; selected = selected?.properties?.[part]; }
            if (target.required?.includes(key) && !required) throw new TypeError('Required mapping source must be required');
            if (!selected || !equal(selected, target.properties[key])) throw new TypeError('Mapping schema mismatch');
        } else {
            fields(source, ['constant']);
            if (!validateSchemaValue(source.constant, target.properties[key]).ok) throw new TypeError('Mapping constant mismatch');
        }
    }
    return mapping;
}
export function compileBridge(source = { version: 1, bindings: [] }, experienceContract = {}) {
    fields(source, ['version', 'bindings'], 'Bridge');
    if (source.version !== 1) throw new TypeError('Bridge version must be 1');
    const bindings = list(source.bindings, binding => {
        fields(binding, ['id', 'kind', 'target', 'inputSchema', 'outputSchema', 'mapping', 'collection'], 'Binding');
        identifier(binding.id);
        let targetContract, targetInput, outputSchema;
        if (binding.kind === 'read') {
            if (binding.target.resourceId) {
                fields(binding.target, ['resourceId'], 'Read target');
                targetContract = experienceContract.dataResources?.find(item => item.resourceId === binding.target.resourceId);
                outputSchema = binding.outputSchema;
            } else {
                fields(binding.target, ['domainId'], 'Application projection');
                targetContract = experienceContract.lifecycleRuntime?.domains.find(item => item.id === binding.target.domainId);
                const item = { type: 'object', properties: { id: { type: 'string', maxLength: 64 }, value: targetContract?.recordSchema }, required: ['id', 'value'], additionalProperties: false };
                outputSchema = binding.collection ? item : { type: 'array', items: item, maxItems: 10000 };
            }
            targetInput = binding.collection ? binding.inputSchema : EMPTY;
        } else if (binding.kind === 'action') {
            fields(binding.target, ['domainId', 'commandId', 'recordId'], 'Action target');
            const domain = experienceContract.lifecycleRuntime?.domains.find(domain => domain.id === binding.target.domainId);
            const command = domain?.commands.find(command => command.id === binding.target.commandId);
            targetContract = command && { domain, command };
            targetInput = command?.argsSchema;
            outputSchema = EMPTY;
            if (binding.target.recordId !== undefined) taskId(binding.target.recordId);
        } else if (binding.kind === 'operation') {
            fields(binding.target, ['taskId', 'variantId'], 'Operation target');
            targetContract = experienceContract.taskRuntime?.tasks.find(task => task.id === binding.target.taskId);
            if (binding.target.variantId !== undefined && !targetContract?.variants.some(item => item.id === binding.target.variantId)) throw new TypeError('Unknown Task variant');
            targetInput = targetContract?.inputSchema;
            const variant = targetContract?.variants.find(item => item.id === binding.target.variantId) ?? (targetContract?.variants.length === 1 ? targetContract.variants[0] : null);
            if (!variant) throw new TypeError('Operation requires exact Task variant');
            outputSchema = variant.outputSchema;
        } else throw new TypeError('Unsupported Binding kind');
        if (!targetContract) throw new TypeError('Unknown typed Binding target: ' + binding.id);
        schema(binding.inputSchema); schema(binding.outputSchema);
        if (!equal(outputSchema, binding.outputSchema)) throw new TypeError('Binding schema does not match typed target');
        const mapping = compileMapping(binding.mapping, binding.inputSchema, targetInput);
        if (binding.collection !== undefined) {
            if (binding.kind !== 'read' || mapping !== 'identity') throw new TypeError('Collection requires Read identity query');
            const c = binding.collection;
            fields(c, ['pageSize', 'orderBy', 'filters', 'search']);
            if (!Number.isSafeInteger(c.pageSize) || c.pageSize < 1 || c.pageSize > 256) throw new TypeError('Invalid hard page size');
            identifier(c.orderBy);
            if (!['string', 'integer', 'number'].includes(outputSchema.properties?.[c.orderBy]?.type)) throw new TypeError('Stable scalar order key required');
            list(c.filters ?? [], identifier, id => id); list(c.search ?? [], identifier, id => id);
            if (binding.inputSchema.type !== 'object') throw new TypeError('Closed query required');
            for (const [key, field] of Object.entries(binding.inputSchema.properties)) {
                if (key === 'search' && c.search?.length && field.type === 'string') continue;
                if (!c.filters?.includes(key) || !equal(field, outputSchema.properties?.[key])) throw new TypeError('Undeclared query filter');
            }
            for (const key of c.filters ?? []) if (!['string', 'integer', 'number', 'boolean'].includes(outputSchema.properties?.[key]?.type)) throw new TypeError('Invalid filter');
            for (const key of c.search ?? []) if (outputSchema.properties?.[key]?.type !== 'string') throw new TypeError('Invalid search field');
        }
        return { ...binding, contractDigest: hash(canonicalJson(targetContract)), schemaDigest: hash(canonicalJson({ inputSchema: binding.inputSchema, outputSchema })),
            mapping, ...(binding.kind === 'read' ? { readPolicy: { mode: binding.collection ? 'collection' : 'snapshot', sourceAdapter: binding.target.resourceId ? 'package-data@1' : 'application@1', invalidation: 'revision' } } : {}), requirements: { features: [], permissions: [] }, receiptPolicy: 'bridge-receipt-v1', idempotencyPolicy: 'host-owned' };
    }, binding => binding.id);
    return { format: 'atria-compiled-bridge', version: 1, bindings };
}
export function validateCompiledBridge(value, contract) {
    fields(value, ['format', 'version', 'bindings']);
    if (value.format !== 'atria-compiled-bridge' || value.version !== 1 || !Array.isArray(value.bindings)) throw new TypeError('Invalid compiled Bridge');
    const source = { version: 1, bindings: value.bindings.map(binding => {
        fields(binding, ['id', 'kind', 'target', 'inputSchema', 'outputSchema', 'collection', 'contractDigest', 'schemaDigest', 'mapping', 'readPolicy', 'requirements', 'receiptPolicy', 'idempotencyPolicy']);
        const { id, kind, target, inputSchema, outputSchema, mapping, collection } = binding;
        return { id, kind, target, inputSchema, outputSchema, ...(mapping === 'identity' ? {} : { mapping }), ...(collection === undefined ? {} : { collection }) };
    }) };
    if (!equal(compileBridge(source, contract), value)) throw new TypeError('Compiled Bridge identity mismatch');
}
