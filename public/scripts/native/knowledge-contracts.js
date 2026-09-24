import { WORLD_INFO_CONDITION_OPERATORS } from '../atri-world-info-state-conditions.js';

export const KNOWLEDGE_CONDITION_LOGIC = Object.freeze(['all', 'any']);
const blocked = new Set(['__proto__', 'constructor', 'prototype']);
const scalar = value => value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
function object(value, field, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(field + ' must be an object');
    for (const key of Object.keys(value)) if (!keys.includes(key)) throw new TypeError(field + '.' + key + ' is unsupported');
}

/** Pure shared contract for authoring, persistence and detached Native snapshots. */
export function normalizeKnowledgeApplicability(value) {
    if (value === undefined) return undefined;
    const field = 'KnowledgeEntry.applicability';
    object(value, field, ['stateConditions', 'stateConditionsLogic', 'stateActivation']);
    const conditions = value.stateConditions === undefined ? [] : value.stateConditions;
    if (!Array.isArray(conditions) || conditions.length > 32) throw new TypeError(field + '.stateConditions must be an array of at most 32 conditions');
    const normalized = conditions.map((condition, index) => {
        const name = field + '.stateConditions[' + index + ']';
        object(condition, name, ['providerId', 'path', 'operator', 'value']);
        if (typeof condition.providerId !== 'string' || !/^atri_[a-z0-9_]+$/.test(condition.providerId)) throw new TypeError(name + '.providerId must name a Native state provider');
        if (!Array.isArray(condition.path) || condition.path.length < 1 || condition.path.length > 12
            || condition.path.some(part => typeof part !== 'string' || !part.trim() || part !== part.trim() || blocked.has(part))) throw new TypeError(name + '.path must be a safe path of 1–12 string segments');
        const operator = condition.operator === undefined ? 'eq' : condition.operator;
        if (!WORLD_INFO_CONDITION_OPERATORS.includes(operator)) throw new TypeError(name + '.operator is unsupported');
        if (!scalar(condition.value)) throw new TypeError(name + '.value must be a finite scalar');
        if (['gt', 'gte', 'lt', 'lte'].includes(operator) && typeof condition.value !== 'number') throw new TypeError(name + '.value must be numeric for this operator');
        if (operator === 'contains' && typeof condition.value !== 'string') throw new TypeError(name + '.value must be a string for contains');
        return { providerId: condition.providerId, path: [...condition.path], operator, value: condition.value };
    });
    const logic = value.stateConditionsLogic === undefined ? 'all' : value.stateConditionsLogic;
    if (!KNOWLEDGE_CONDITION_LOGIC.includes(logic)) throw new TypeError(field + '.stateConditionsLogic must be all or any');
    if (value.stateActivation !== undefined && typeof value.stateActivation !== 'boolean') throw new TypeError(field + '.stateActivation must be boolean');
    if (value.stateActivation && !normalized.length) throw new TypeError(field + '.stateActivation requires non-empty stateConditions');
    return Object.freeze({
        ...(value.stateConditions === undefined ? {} : { stateConditions: normalized }),
        ...(value.stateConditionsLogic === undefined ? {} : { stateConditionsLogic: logic }),
        ...(value.stateActivation === undefined ? {} : { stateActivation: value.stateActivation }),
    });
}


export const KNOWLEDGE_TARGET_KINDS = Object.freeze(['narrator', 'actor', 'agent', 'user']);
export const KNOWLEDGE_DELIVERY_POSITIONS = Object.freeze(['before', 'after']);

export function normalizeKnowledgeSelector(value, field = 'KnowledgeBinding.target') {
    if (value === undefined) return undefined;
    if (Array.isArray(value)) {
        if (!value.length || value.length > 32 || value.some(item => item === undefined || Array.isArray(item))) throw new TypeError(field + ' must contain 1–32 selectors');
        return value.map((item, index) => normalizeKnowledgeSelector(item, field + '[' + index + ']'));
    }
    if (typeof value === 'string') {
        if (!KNOWLEDGE_TARGET_KINDS.includes(value)) throw new TypeError(field + ' must name a supported target kind');
        return value;
    }
    object(value, field, ['kind', 'id']);
    if (!KNOWLEDGE_TARGET_KINDS.includes(value.kind)) throw new TypeError(field + '.kind is unsupported');
    if (value.id !== undefined && (typeof value.id !== 'string' || !value.id.trim() || value.id !== value.id.trim() || value.id.length > 256)) throw new TypeError(field + '.id must be a non-empty exact identity');
    return { kind: value.kind, ...(value.id === undefined ? {} : { id: value.id }) };
}

export function normalizeKnowledgeDelivery(value, field = 'KnowledgeEntry.delivery') {
    if (value === undefined) return undefined;
    object(value, field, ['target', 'position', 'priority', 'visibility']);
    if (value.position !== undefined && !KNOWLEDGE_DELIVERY_POSITIONS.includes(value.position)) throw new TypeError(field + '.position must be before or after');
    if (value.priority !== undefined && (typeof value.priority !== 'number' || !Number.isFinite(value.priority))) throw new TypeError(field + '.priority must be a finite number');
    if (value.visibility !== undefined && (!Array.isArray(value.visibility) || value.visibility.some(item => !KNOWLEDGE_TARGET_KINDS.includes(item)) || new Set(value.visibility).size !== value.visibility.length)) throw new TypeError(field + '.visibility must contain unique supported target kinds');
    return Object.freeze({
        ...(value.target === undefined ? {} : { target: normalizeKnowledgeSelector(value.target, field + '.target') }),
        ...(value.position === undefined ? {} : { position: value.position }),
        ...(value.priority === undefined ? {} : { priority: value.priority }),
        ...(value.visibility === undefined ? {} : { visibility: [...value.visibility] }),
    });
}

export function knowledgeEditorFieldOptions(path) {
    if (/^entries\.\d+\.delivery\.position$/.test(path)) return KNOWLEDGE_DELIVERY_POSITIONS;
    if (/^entries\.\d+\.delivery\.(target(\.\d+)?(\.kind)?|visibility\.\d+)$/.test(path)) return KNOWLEDGE_TARGET_KINDS;
    if (/^entries\.\d+\.applicability\.stateConditionsLogic$/.test(path)) return KNOWLEDGE_CONDITION_LOGIC;
    return undefined;
}

export function validateKnowledgeEditorValue(value) {
    for (const [index, entry] of (value.entries || []).entries()) {
        normalizeKnowledgeDelivery(entry.delivery, 'entries.' + index + '.delivery');
        normalizeKnowledgeApplicability(entry.applicability);
    }
}
