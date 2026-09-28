import { createHash } from 'node:crypto';
import { fields, identifier, list } from '../../../public/shared/native-frontend-contract.js';
import { compileDataSchema } from '../../../public/scripts/native/experience/ui/message-templates.js';

export const canonicalJson = value => {
    if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
    return JSON.stringify(value);
};
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const EMPTY = { type: 'object', properties: {}, additionalProperties: false };

// Phase 1 only links existing typed authorities. It does not invoke any target,
// expose raw services, or implement Collection Read / Bridge execution.
export function compileBridge(source = { version: 1, bindings: [] }, experienceContract = {}) {
    fields(source, ['version', 'bindings'], 'Bridge');
    if (source.version !== 1) throw new TypeError('Bridge version must be 1');
    const bindings = list(source.bindings, binding => {
        fields(binding, ['id', 'kind', 'target', 'inputSchema', 'outputSchema'], 'Binding');
        identifier(binding.id);
        let targetContract, inputSchema, outputSchema;
        if (binding.kind === 'read') {
            fields(binding.target, ['resourceId'], 'Read target');
            targetContract = experienceContract.dataResources?.find(item => item.resourceId === binding.target.resourceId);
            inputSchema = EMPTY;
            outputSchema = binding.outputSchema;
        } else if (binding.kind === 'action') {
            fields(binding.target, ['domainId', 'commandId'], 'Action target');
            targetContract = experienceContract.lifecycleRuntime?.domains.find(domain => domain.id === binding.target.domainId)
                ?.commands.find(command => command.id === binding.target.commandId);
            inputSchema = targetContract?.argsSchema;
            outputSchema = EMPTY;
        } else if (binding.kind === 'operation') {
            fields(binding.target, ['taskId'], 'Operation target');
            targetContract = experienceContract.taskRuntime?.tasks.find(task => task.id === binding.target.taskId);
            inputSchema = targetContract?.inputSchema;
            outputSchema = EMPTY;
        } else throw new TypeError('Unsupported Binding kind');
        if (!targetContract) throw new TypeError('Unknown typed Binding target: ' + binding.id);
        compileDataSchema(binding.inputSchema);
        compileDataSchema(binding.outputSchema);
        if (canonicalJson(inputSchema) !== canonicalJson(binding.inputSchema)
            || canonicalJson(outputSchema) !== canonicalJson(binding.outputSchema)) throw new TypeError('Binding schema does not match typed target');
        return { ...binding, contractDigest: hash(canonicalJson(targetContract)), schemaDigest: hash(canonicalJson({ inputSchema, outputSchema })),
            mapping: 'identity', requirements: { features: [], permissions: [] }, receiptPolicy: 'bridge-receipt-v1', idempotencyPolicy: 'host-owned' };
    });
    return { format: 'atria-compiled-bridge', version: 1, bindings };
}

export function validateCompiledBridge(value, contract) {
    fields(value, ['format', 'version', 'bindings']);
    if (value.format !== 'atria-compiled-bridge' || value.version !== 1 || !Array.isArray(value.bindings)) throw new TypeError('Invalid compiled Bridge');
    const source = { version: 1, bindings: value.bindings.map(binding => {
        fields(binding, ['id', 'kind', 'target', 'inputSchema', 'outputSchema', 'contractDigest', 'schemaDigest', 'mapping', 'requirements', 'receiptPolicy', 'idempotencyPolicy']);
        const { id, kind, target, inputSchema, outputSchema } = binding;
        return { id, kind, target, inputSchema, outputSchema };
    }) };
    if (canonicalJson(compileBridge(source, contract)) !== canonicalJson(value)) throw new TypeError('Compiled Bridge identity mismatch');
}
