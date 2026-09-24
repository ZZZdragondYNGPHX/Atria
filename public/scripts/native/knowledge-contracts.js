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
