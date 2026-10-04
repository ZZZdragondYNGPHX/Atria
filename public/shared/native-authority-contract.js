import { fields, json, assertJsonDeclaration } from './native-values.js';
import { taskId } from './native-task-contract.js';

const publicRefusals = Object.freeze({
    'Enterprise delegation policy': 'delegation_policy',
    'Enterprise delegation policy authority': 'delegation_unavailable',
    'Enterprise organization refuses': 'organization_refused',
    'Enterprise delegate eligible': 'delegate_unavailable',
    'Enterprise one delegate authority': 'delegate_authority',
    'Enterprise identity evidence': 'identity_evidence',
    'Artifact copy source unavailable': 'artifact_copy',
    'Lifetime must return before acting': 'personal_absence',
    'Protagonist must return before acting': 'personal_absence',
});
export function authorityPublicRefusal(error) {
    if (error?.code === 'AUTHORITY_PREPARATION_FAILED' && Object.values(publicRefusals).includes(error.publicRefusal)) return error.publicRefusal;
    return error instanceof TypeError && Object.hasOwn(publicRefusals, error.message) ? publicRefusals[error.message] : null;
}

// C1 declares/compiles only. Host execution support is deliberately not advertised.
export const AUTHORITY_LIMITS = Object.freeze({
    transactions: 64, publications: 16, readGrants: 16, readFields: 16,
    validators: 16, resolutionCases: 16, worldEvents: 16, appCommands: 24,
    clockAdvances: 1, workflowTransitions: 1, effects: 32,
    receiptBytes: 32768, observationItems: 64, observationBytes: 16384,
    declarationBytes: 1048576, formulaCharacters: 2048, formulaNodes: 256,
});

export function authorityInteger(value, min, max, label) {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError('Authority ' + label + ' limit');
    return value;
}
export function authorityList(value, limit, normalize, label, key = item => item.id ?? item) {
    if (!Array.isArray(value) || value.length > limit) throw new TypeError('Authority ' + label + ' list limit');
    const items = value.map(normalize);
    if (new Set(items.map(key)).size !== items.length) throw new TypeError('Duplicate Authority ' + label);
    return items;
}
export function authorityReference(items, id, label) {
    taskId(id);
    const item = items?.find(item => item.id === id);
    if (!item) throw new TypeError('Unknown Authority ' + label + ' reference: ' + id);
    return item;
}

export function assertAuthorityRuntime(value, lifecycle, information) {
    value = assertJsonDeclaration(value, 'Authority', AUTHORITY_LIMITS.declarationBytes);
    fields(value, ['schemaVersion', 'intentObservation', 'policy', 'canonicalClockId'], 'Authority runtime');
    if (value.schemaVersion !== 1) throw new TypeError('Authority schemaVersion must be 1');
    const observation = value.intentObservation;
    fields(observation, ['viewIds', 'maxItems', 'maxBytes'], 'Authority intent observation');
    authorityList(observation.viewIds, 16, id => {
        const view = authorityReference(information?.views, id, 'observation view');
        if (view.audience !== 'player' || !view.exposure.includes('display') || view.exposure.includes('context')
            || view.knowledge || view.memory) throw new TypeError('Authority observation requires player-safe display Views without Knowledge/Memory');
        return id;
    }, 'observation views');
    authorityInteger(observation.maxItems, 1, AUTHORITY_LIMITS.observationItems, 'observation items');
    authorityInteger(observation.maxBytes, 1, AUTHORITY_LIMITS.observationBytes, 'observation bytes');
    const policy = value.policy;
    fields(policy, ['maxReadGrants', 'maxWorldEvents', 'maxAppCommands', 'maxEffects', 'maxReceiptBytes'], 'Authority policy');
    for (const [key, limit] of Object.entries({ maxReadGrants: 'readGrants', maxWorldEvents: 'worldEvents',
        maxAppCommands: 'appCommands', maxEffects: 'effects', maxReceiptBytes: 'receiptBytes' })) {
        authorityInteger(policy[key], key === 'maxReceiptBytes' ? 1 : 0, AUTHORITY_LIMITS[limit], key);
    }
    if (value.canonicalClockId !== undefined) authorityReference(lifecycle?.clocks, value.canonicalClockId, 'canonical clock');
    return json(value);
}
