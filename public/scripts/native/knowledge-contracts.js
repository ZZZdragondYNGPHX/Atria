import { formatShellText as formatProductText } from '../atria-shell/localization.js';
import { WORLD_INFO_CONDITION_OPERATORS } from '../atri-world-info-state-conditions.js';

export const KNOWLEDGE_CONDITION_OPERATORS = WORLD_INFO_CONDITION_OPERATORS;
export const KNOWLEDGE_CONDITION_LOGIC = Object.freeze(['all', 'any']);
const blocked = new Set(['__proto__', 'constructor', 'prototype']);
const scalar = value => value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
function object(value, field, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(formatProductText('${0} must be an object', [field]));
    for (const key of Object.keys(value)) if (!keys.includes(key)) throw new TypeError(formatProductText('${0}.${1} is unsupported', [field, key]));
}

/** Pure shared contract for authoring, persistence and detached Native snapshots. */
export function normalizeKnowledgeApplicability(value) {
    if (value === undefined) return undefined;
    const field = 'KnowledgeEntry.applicability';
    object(value, field, ['stateConditions', 'stateConditionsLogic', 'stateActivation']);
    const conditions = value.stateConditions === undefined ? [] : value.stateConditions;
    if (!Array.isArray(conditions) || conditions.length > 32) throw new TypeError(formatProductText('${0}.stateConditions must be an array of at most 32 conditions', [field]));
    const normalized = conditions.map((condition, index) => {
        const name = field + '.stateConditions[' + index + ']';
        object(condition, name, ['providerId', 'path', 'operator', 'value']);
        if (typeof condition.providerId !== 'string' || !/^atri_[a-z0-9_]+$/.test(condition.providerId)) throw new TypeError(formatProductText('${0}.providerId must name a Native state provider', [name]));
        if (!Array.isArray(condition.path) || condition.path.length < 1 || condition.path.length > 12
            || condition.path.some(part => typeof part !== 'string' || !part.trim() || part !== part.trim() || blocked.has(part))) throw new TypeError(formatProductText('${0}.path must be a safe path of 1–12 string segments', [name]));
        const operator = condition.operator === undefined ? 'eq' : condition.operator;
        if (!WORLD_INFO_CONDITION_OPERATORS.includes(operator)) throw new TypeError(formatProductText('${0}.operator is unsupported', [name]));
        if (!scalar(condition.value)) throw new TypeError(formatProductText('${0}.value must be a finite scalar', [name]));
        if (['gt', 'gte', 'lt', 'lte'].includes(operator) && typeof condition.value !== 'number') throw new TypeError(formatProductText('${0}.value must be numeric for this operator', [name]));
        if (operator === 'contains' && typeof condition.value !== 'string') throw new TypeError(formatProductText('${0}.value must be a string for contains', [name]));
        return { providerId: condition.providerId, path: [...condition.path], operator, value: condition.value };
    });
    const logic = value.stateConditionsLogic === undefined ? 'all' : value.stateConditionsLogic;
    if (!KNOWLEDGE_CONDITION_LOGIC.includes(logic)) throw new TypeError(formatProductText('${0}.stateConditionsLogic must be all or any', [field]));
    if (value.stateActivation !== undefined && typeof value.stateActivation !== 'boolean') throw new TypeError(formatProductText('${0}.stateActivation must be boolean', [field]));
    if (value.stateActivation && !normalized.length) throw new TypeError(formatProductText('${0}.stateActivation requires non-empty stateConditions', [field]));
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
        if (!value.length || value.length > 32 || value.some(item => item === undefined || Array.isArray(item))) throw new TypeError(formatProductText('${0} must contain 1–32 selectors', [field]));
        return value.map((item, index) => normalizeKnowledgeSelector(item, field + '[' + index + ']'));
    }
    if (typeof value === 'string') {
        if (!KNOWLEDGE_TARGET_KINDS.includes(value)) throw new TypeError(formatProductText('${0} must name a supported target kind', [field]));
        return value;
    }
    object(value, field, ['kind', 'id']);
    if (!KNOWLEDGE_TARGET_KINDS.includes(value.kind)) throw new TypeError(formatProductText('${0}.kind is unsupported', [field]));
    if (value.id !== undefined && (typeof value.id !== 'string' || !value.id.trim() || value.id !== value.id.trim() || value.id.length > 256)) throw new TypeError(formatProductText('${0}.id must be a non-empty exact identity', [field]));
    return { kind: value.kind, ...(value.id === undefined ? {} : { id: value.id }) };
}

export function normalizeKnowledgeDelivery(value, field = 'KnowledgeEntry.delivery') {
    if (value === undefined) return undefined;
    object(value, field, ['target', 'position', 'priority', 'visibility']);
    if (value.position !== undefined && !KNOWLEDGE_DELIVERY_POSITIONS.includes(value.position)) throw new TypeError(formatProductText('${0}.position must be before or after', [field]));
    if (value.priority !== undefined && (typeof value.priority !== 'number' || !Number.isFinite(value.priority))) throw new TypeError(formatProductText('${0}.priority must be a finite number', [field]));
    if (value.visibility !== undefined && (!Array.isArray(value.visibility) || value.visibility.some(item => !KNOWLEDGE_TARGET_KINDS.includes(item)) || new Set(value.visibility).size !== value.visibility.length)) throw new TypeError(formatProductText('${0}.visibility must contain unique supported target kinds', [field]));
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

export function validateKnowledgeEditorValue(value, { complete = false } = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(formatProductText('Knowledge revision must be an object'));
    if (!Array.isArray(value.entries)) throw new TypeError(formatProductText('entries must be an array'));
    const ids = new Set(value.entries.map(entry => entry?.knowledgeEntryId));
    if (complete && ids.size !== value.entries.length) throw new TypeError(formatProductText('entries contain duplicate identities'));
    for (const [index, entry] of value.entries.entries()) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new TypeError(formatProductText('entries.${0} must be an object', [index]));
        normalizeKnowledgeDelivery(entry.delivery, `entries.${index}.delivery`);
        normalizeKnowledgeDiscovery(entry.discovery, `entries.${index}.discovery`);
        normalizeKnowledgeApplicability(entry.applicability);
        normalizeKnowledgeLifecycle(entry.lifecycle);
        const relations = normalizeKnowledgeRelations(entry.relations);
        if (complete) {
            object(entry, `entries.${index}`, ['knowledgeEntryId', 'content', 'discovery', 'applicability', 'lifecycle', 'relations', 'delivery', 'metadata']);
            if (!/^kentry_[a-f0-9]{32}$/.test(entry.knowledgeEntryId || '')) throw new TypeError(formatProductText('entries.${0}.knowledgeEntryId must be an exact identity', [index]));
            if (typeof entry.content !== 'string' || entry.content.length > 4 * 1024 * 1024) throw new TypeError(formatProductText('entries.${0}.content must be text of at most 4 MiB', [index]));
            for (const key of ['requiredEntryIds', 'relatedEntryIds']) for (const id of relations?.[key] || []) if (!ids.has(id)) throw new TypeError(formatProductText('entries.${0}.relations.${1} references a missing entry', [index, key]));
        }
    }
}


export function normalizeKnowledgeDiscovery(value, field = 'KnowledgeEntry.discovery') {
    if (value === undefined) return undefined;
    object(value, field, ['keywords', 'aliases', 'regex']);
    const result = {};
    for (const key of ['keywords', 'aliases', 'regex']) {
        if (value[key] === undefined) continue;
        const items = value[key];
        if (!Array.isArray(items) || items.some(item => typeof item !== 'string' || !item.length || item.length > 1024)
            || new Set(items).size !== items.length) throw new TypeError(formatProductText('${0}.${1} must contain unique non-empty strings of at most 1024 characters', [field, key]));
        if (key === 'regex') items.forEach((pattern, index) => { try { parseKnowledgeRegex(pattern); } catch { throw new TypeError(formatProductText('${0}.regex[${1}] must be a valid regular expression', [field, index])); } });
        result[key] = [...items];
    }
    return Object.freeze(result);
}


export function normalizeKnowledgeLifecycle(value, field = 'KnowledgeEntry.lifecycle') {
    if (value === undefined) return undefined;
    object(value, field, ['probability', 'sticky', 'cooldown', 'delay']);
    if (value.probability !== undefined && (typeof value.probability !== 'number' || !Number.isFinite(value.probability) || value.probability < 0 || value.probability > 100)) throw new TypeError(formatProductText('${0}.probability must be between 0 and 100', [field]));
    for (const key of ['sticky', 'cooldown', 'delay']) if (value[key] !== undefined && (!Number.isSafeInteger(value[key]) || value[key] < 0)) throw new TypeError(formatProductText('${0}.${1} must be a non-negative integer turn count', [field, key]));
    return Object.freeze({ ...value });
}

export function normalizeKnowledgeRelations(value, field = 'KnowledgeEntry.relations') {
    if (value === undefined) return undefined;
    object(value, field, ['requiredEntryIds', 'relatedEntryIds', 'exclusiveGroup']);
    const result = {};
    for (const key of ['requiredEntryIds', 'relatedEntryIds']) {
        if (value[key] === undefined) continue;
        if (!Array.isArray(value[key]) || value[key].some(id => !/^kentry_[a-f0-9]{32}$/.test(id)) || new Set(value[key]).size !== value[key].length) throw new TypeError(formatProductText('${0}.${1} must contain unique exact entry identities', [field, key]));
        result[key] = [...value[key]];
    }
    if (value.exclusiveGroup !== undefined) {
        if (typeof value.exclusiveGroup !== 'string' || !value.exclusiveGroup.length || value.exclusiveGroup.length > 256) throw new TypeError(formatProductText('${0}.exclusiveGroup must be a non-empty name of at most 256 characters', [field]));
        result.exclusiveGroup = value.exclusiveGroup;
    }
    return Object.freeze(result);
}


export function parseKnowledgeRegex(value) {
    const literal = /^\/(.*)\/([a-z]*)$/s.exec(value);
    const flags = literal ? literal[2] : '';
    if (/[^imsu]/.test(flags)) throw new TypeError(formatProductText('Supported regular expression flags: i, m, s, u'));
    return new RegExp(literal ? literal[1] : value, flags);
}
