import { fields, json } from './native-values.js';

const string = maxLength => ({ type: 'string', maxLength });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const APPRAISAL_INPUT_SCHEMA = json(object({ eventItemId: string(256) }));
export const APPRAISAL_OUTPUT_SCHEMA = json(object({ significance: { ...string(32), enum: ['none', 'appraise'] }, rationale: string(1024),
    updates: { type: 'array', maxItems: 8, items: object({ kind: { ...string(32), enum: ['emotion', 'relationship'] }, dimension: string(64), target: string(64),
        delta: { type: 'integer', minimum: -100, maximum: 100 }, text: string(2048), sourceItemIds: { type: 'array', maxItems: 16, items: string(256) } }) } }));
export const appraisalTargets = binding => ['emotion', 'relationship', ...(binding.theory ? ['theory'] : [])];
export function appraisalStateSchema(scopeIds = ['session']) {
    return object({ actor: string(64), target: string(64), dimension: string(64), level: { type: 'integer', minimum: -100, maximum: 100 }, status: { ...string(32), enum: ['active', 'withdrawn'] },
        text: string(2048), rationale: string(1024), basis: object({ viewId: string(128), anchor: object({ sessionId: string(64), packageVersionId: string(64), revisionId: string(64), branchId: string(64),
            scopeEpochs: { ...object(Object.fromEntries(scopeIds.map(id => [id, { type: 'integer', minimum: 0 }]))), required: [] } }),
        sourceRefs: { type: 'array', maxItems: 16, items: object({ itemId: string(256), fingerprint: string(64) }) } }),
        appraisal: object({ origin: { ...string(16), enum: ['author', 'model'] }, invocationId: string(128), taskId: string(64), variantId: string(64), profileId: string(64), profileRevision: string(64),
            modelProfileId: string(64), modelProfileHash: string(64), requestSnapshotHash: string(64), previousHash: string(64),
            promptId: string(64), promptRevision: string(64), generationId: string(64), generationRevision: string(64) }) });
}

export function assertAppraisalBinding(binding) {
    fields(binding, ['kind', 'viewId', 'eventSourceIds', 'eventGate', 'emotion', 'relationship', 'theory', 'profile'], 'Appraisal binding');
    const id = value => { if (typeof value !== 'string' || !/^[a-z][a-z0-9._-]{0,63}$/.test(value)) throw new TypeError('Appraisal declaration identity'); };
    id(binding.viewId);
    if (!Array.isArray(binding.eventSourceIds) || !binding.eventSourceIds.length || binding.eventSourceIds.length > 16 || new Set(binding.eventSourceIds).size !== binding.eventSourceIds.length) throw new TypeError('Appraisal event sources');
    binding.eventSourceIds.forEach(id);
    fields(binding.eventGate, ['field', 'equals'], 'Appraisal event gate'); id(binding.eventGate.field);
    if (!['string', 'number', 'boolean'].includes(typeof binding.eventGate.equals)) throw new TypeError('Appraisal gate requires scalar equality');
    for (const kind of appraisalTargets(binding)) {
        fields(binding[kind], ['sourceId', 'domainId', 'commandId'], 'Appraisal target');
        Object.values(binding[kind]).forEach(id);
    }
    if (new Set(appraisalTargets(binding).map(kind => binding[kind].domainId)).size !== appraisalTargets(binding).length) throw new TypeError('Appraisal target domains must be distinct');
    const profile = binding.profile ?? { id: 'default', revision: 'v1', emotionDimensions: ['worry', 'relief'], relationshipDimensions: ['trust', 'affinity', 'respect', 'tension'], maxDelta: 25 };
    fields(profile, ['id', 'revision', 'emotionDimensions', 'relationshipDimensions', 'maxDelta'], 'Appraisal profile'); id(profile.id); id(profile.revision);
    for (const key of ['emotionDimensions', 'relationshipDimensions']) {
        if (!Array.isArray(profile[key]) || !profile[key].length || profile[key].length > 16 || new Set(profile[key]).size !== profile[key].length) throw new TypeError('Appraisal profile dimensions');
        profile[key].forEach(id);
    }
    if (!Number.isSafeInteger(profile.maxDelta) || profile.maxDelta < 0 || profile.maxDelta > 100) throw new TypeError('Appraisal profile delta');
    return { ...binding, profile };
}
