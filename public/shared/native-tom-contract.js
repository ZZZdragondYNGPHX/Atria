import { fields, json } from './native-values.js';
import { appraisalStateSchema, APPRAISAL_OUTPUT_SCHEMA } from './native-appraisal-contract.js';

const string = maxLength => ({ type: 'string', maxLength });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const prediction = () => object({ itemId: string(256), expected: string(128) });
export const TOM_OUTPUT_SCHEMA = json(object({ ...APPRAISAL_OUTPUT_SCHEMA.properties,
    hypotheses: { type: 'array', maxItems: 8, items: object({ key: string(64), perspective: { type: 'array', maxItems: 2, items: string(64) },
        text: string(2048), confidence: { type: 'integer', minimum: 0, maximum: 100 }, prediction: prediction(),
        sourceItemIds: { type: 'array', maxItems: 16, items: string(256) } }) } }));

export function hypothesisStateSchema(scopeIds = ['session']) {
    const common = appraisalStateSchema(scopeIds).properties;
    return object({ actor: common.actor, key: string(64), target: common.target, perspective: { type: 'array', maxItems: 2, items: string(64) },
        text: common.text, confidence: { type: 'integer', minimum: 0, maximum: 100 }, status: common.status, prediction: prediction(),
        policy: object({ id: string(64), revision: string(64) }), basis: common.basis, appraisal: common.appraisal });
}

export function assertHypothesisPolicy(policy) {
    fields(policy, ['id', 'revision', 'maxDepth', 'maxNodes', 'maxUpdates', 'behaviorSourceIds', 'targetField', 'outcomeField', 'observedField', 'confidenceOnContradiction'], 'Hypothesis policy');
    const id = value => { if (typeof value !== 'string' || !/^[a-z][a-z0-9._-]{0,63}$/.test(value)) throw new TypeError('Hypothesis policy identity'); };
    for (const key of ['id', 'revision', 'targetField', 'outcomeField', 'observedField']) id(policy[key]);
    for (const [key, max] of [['maxDepth', 2], ['maxNodes', 16], ['maxUpdates', 8]]) {
        if (!Number.isSafeInteger(policy[key]) || policy[key] < 1 || policy[key] > max) throw new TypeError('Hypothesis ' + key + ' limit');
    }
    if (!Array.isArray(policy.behaviorSourceIds) || !policy.behaviorSourceIds.length || policy.behaviorSourceIds.length > 8
        || new Set(policy.behaviorSourceIds).size !== policy.behaviorSourceIds.length) throw new TypeError('Hypothesis behavior sources');
    policy.behaviorSourceIds.forEach(id);
    if (new Set([policy.targetField, policy.outcomeField, policy.observedField]).size !== 3
        || !Number.isSafeInteger(policy.confidenceOnContradiction) || policy.confidenceOnContradiction < 0 || policy.confidenceOnContradiction > 100) throw new TypeError('Hypothesis observation policy');
    return json(policy);
}

export function hypothesisShapeValid(source, value) {
    const policy = source.hypothesisPolicy;
    return Boolean(policy && typeof value.key === 'string' && /^[a-z][a-z0-9._-]{0,63}$/.test(value.key)
        && Array.isArray(value.perspective) && value.perspective.length >= 1 && value.perspective.length <= policy.maxDepth
        && value.target === value.perspective[0] && value.target !== value.actor && new Set(value.perspective).size === value.perspective.length
        && value.perspective.every(id => /^actor_[a-f0-9]{32}$/.test(id))
        && Number.isSafeInteger(value.confidence) && value.confidence >= 0 && value.confidence <= 100
        && value.policy?.id === policy.id && value.policy?.revision === policy.revision
        && typeof value.prediction?.itemId === 'string' && value.prediction.itemId.length <= 256 && typeof value.prediction.expected === 'string' && value.prediction.expected.length <= 128
        && Boolean(value.prediction.itemId) === Boolean(value.prediction.expected));
}

// Reads only leaves already authorized for this consumer. Missing observation
// remains unknown; a different action never establishes an actual private mind.
export function hypothesisObservation(source, value, leaves) {
    if (!value.prediction.itemId) return 'none';
    const policy = source.hypothesisPolicy, item = leaves.get(value.prediction.itemId);
    if (!item || item.semantic !== 'truth' || !policy.behaviorSourceIds.includes(item.sourceId)
        || item.data[policy.targetField] !== value.target || item.data[policy.observedField] !== true
        || typeof item.data[policy.outcomeField] !== 'string' || !item.data[policy.outcomeField]) return 'unknown';
    return item.data[policy.outcomeField] === value.prediction.expected ? 'matched' : 'contradicted';
}
