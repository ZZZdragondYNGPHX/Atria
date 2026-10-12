import { fields } from './native-values.js';
import { appraisalStateSchema } from './native-appraisal-contract.js';

const string = maxLength => ({ type: 'string', maxLength });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const protectedMemoryRoles = ['identity', 'commitment', 'relationship', 'key_event'];
export const isManagedMemory = source => source?.semantic === 'memory' && Boolean(source.memoryPolicy);
export const hasInformationBasis = source => isManagedMemory(source) || source?.causalBasis === true;
export function memoryStateSchema(scopeIds = ['session']) {
    const basis = appraisalStateSchema(scopeIds).properties.basis;
    return object({ actor: string(64), text: string(12000), status: { ...string(32), enum: ['active', 'withdrawn'] }, recordedAt: { type: 'integer', minimum: 0 },
        role: { ...string(32), enum: ['detail', ...protectedMemoryRoles] }, clarity: { ...string(32), enum: ['clear', 'blurred', 'forgotten', 'reconstructed'] },
        use: { ...string(32), enum: ['willing', 'reluctant', 'unavailable'] }, basis,
        applicability: object({ goalId: string(64), until: { type: 'integer', minimum: 0 },
            exceptionRefs: { type: 'array', maxItems: 8, items: basis.properties.sourceRefs.items } }) });
}
export function assertMemoryPolicy(policy, lifecycle) {
    fields(policy, ['id', 'revision', 'mode', 'clockId', 'fadeAfter'], 'Memory policy');
    if (![policy.id, policy.revision].every(value => typeof value === 'string' && /^[a-z][a-z0-9._-]{0,63}$/.test(value))
        || !['light', 'deep'].includes(policy.mode ?? 'light') || !lifecycle.clocks.some(clock => clock.id === policy.clockId)
        || !Number.isSafeInteger(policy.fadeAfter) || policy.fadeAfter < 1) throw new TypeError('Invalid Memory policy');
}
export function assertInformationBasisSource(source, domain) {
    if (source.actorField !== 'actor' || domain.recordSchema.properties.actor?.type !== 'string'
        || domain.recordSchema.properties.basis?.type !== 'object' || !['actor', 'basis'].every(key => domain.recordSchema.required.includes(key))) throw new TypeError('Information basis requires typed Actor and basis');
    if (isManagedMemory(source)) {
        const types = { text: 'string', status: 'string', recordedAt: 'integer', role: 'string', clarity: 'string', use: 'string', applicability: 'object' };
        if (source.statusField !== 'status' || !source.fields.some(path => path.length === 1 && path[0] === 'text')
            || Object.entries(types).some(([key, type]) => domain.recordSchema.properties[key]?.type !== type || !domain.recordSchema.required.includes(key))) throw new TypeError('Memory requires declared cognitive state');
    }
}
export function assertMemoryValue(source, value) {
    const a = value.applicability;
    fields(a, ['goalId', 'until', 'exceptionRefs'], 'Memory applicability');
    if (!['active', 'withdrawn'].includes(value.status) || typeof value.text !== 'string' || !value.text.trim() || value.text.length > 12000
        || !Number.isSafeInteger(value.recordedAt) || value.recordedAt < 0 || !['detail', ...protectedMemoryRoles].includes(value.role)
        || !['clear', 'blurred', 'forgotten', 'reconstructed'].includes(value.clarity) || !['willing', 'reluctant', 'unavailable'].includes(value.use)
        || (value.role !== 'detail' || (source.memoryPolicy.mode ?? 'light') === 'light') && (['forgotten', 'reconstructed'].includes(value.clarity) || value.use === 'unavailable')
        || value.role !== 'detail' && (value.clarity !== 'clear' || value.use !== 'willing')
        || typeof a.goalId !== 'string' || a.goalId !== '' && !/^goal_[a-f0-9]{32}$/.test(a.goalId)
        || !Number.isSafeInteger(a.until) || a.until < 0 || !Array.isArray(a.exceptionRefs) || a.exceptionRefs.length > 8
        || new Set(a.exceptionRefs.map(ref => ref.itemId)).size !== a.exceptionRefs.length) throw new TypeError('Invalid Memory state');
    for (const ref of a.exceptionRefs) {
        fields(ref, ['itemId', 'fingerprint'], 'Memory exception reference');
        if (!value.basis.sourceRefs.some(source => source.itemId === ref.itemId && source.fingerprint === ref.fingerprint)) throw new TypeError('Memory exception requires its original source');
    }
}
