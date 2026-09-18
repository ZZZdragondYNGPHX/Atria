// SPDX-License-Identifier: AGPL-3.0-or-later
// Pure tri-state evaluator for Atria World Info state conditions.
// No provider reads, writes, template execution, network calls or model calls.

export const WORLD_INFO_CONDITION_RESULT = Object.freeze({
    TRUE: 'true',
    FALSE: 'false',
    UNKNOWN: 'unknown',
});

const MAX_CONDITIONS = 32;
const MAX_PATH_DEPTH = 12;
export const WORLD_INFO_CONDITION_OPERATORS = Object.freeze([
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains',
]);
const operators = new Set(WORLD_INFO_CONDITION_OPERATORS);

function normalizePath(path) {
    if (!Array.isArray(path) || path.length === 0 || path.length > MAX_PATH_DEPTH) return null;
    const normalized = path.map(part => String(part ?? '').trim());
    return normalized.every(part => part && !['__proto__', 'constructor', 'prototype'].includes(part))
        ? normalized
        : null;
}

function samePath(left, right) {
    const a = normalizePath(left);
    const b = normalizePath(right);
    return Boolean(a && b && a.length === b.length && a.every((part, index) => part === b[index]));
}

function isScalar(value) {
    return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function compare(actual, operator, expected) {
    switch (operator) {
        case 'eq':
            return Object.is(actual, expected);
        case 'neq':
            return !Object.is(actual, expected);
        case 'gt':
        case 'gte':
        case 'lt':
        case 'lte': {
            if (typeof actual !== 'number' || typeof expected !== 'number'
                || !Number.isFinite(actual) || !Number.isFinite(expected)) {
                return null;
            }
            if (operator === 'gt') return actual > expected;
            if (operator === 'gte') return actual >= expected;
            if (operator === 'lt') return actual < expected;
            return actual <= expected;
        }
        case 'contains':
            return typeof actual === 'string' && typeof expected === 'string'
                ? actual.includes(expected)
                : null;
        default:
            return null;
    }
}

function unknown(reason, condition, providerStatus = '') {
    return {
        status: WORLD_INFO_CONDITION_RESULT.UNKNOWN,
        reason,
        providerId: String(condition?.providerId || ''),
        path: normalizePath(condition?.path) || [],
        operator: String(condition?.operator || ''),
        ...(providerStatus ? { providerStatus } : {}),
    };
}

/**
 * Evaluate one restricted state condition against detached provider snapshots.
 *
 * @param {object} condition
 * @param {Array<object>} providers
 * @returns {{status:'true'|'false'|'unknown',reason:string,providerId:string,path:string[],operator:string,actual?:unknown}}
 */
export function evaluateWorldInfoStateCondition(condition, providers = []) {
    if (!condition || typeof condition !== 'object' || Array.isArray(condition)) {
        return unknown('invalid_condition', condition);
    }

    const providerId = String(condition.providerId || '').trim();
    const path = normalizePath(condition.path);
    const operator = String(condition.operator || 'eq').trim().toLowerCase();
    if (!providerId || !path || !operators.has(operator) || !isScalar(condition.value)) {
        return unknown('invalid_condition', condition);
    }

    const provider = Array.isArray(providers)
        ? providers.find(item => String(item?.providerId || '') === providerId)
        : null;
    if (!provider) return unknown('provider_absent', condition, 'absent');

    const providerStatus = String(provider.status || 'absent');
    if (providerStatus !== 'ready') {
        return unknown(`provider_${providerStatus}`, condition, providerStatus);
    }

    const field = Array.isArray(provider.fields)
        ? provider.fields.find(item => samePath(item?.path, path))
        : null;
    if (!field || !isScalar(field.value)) {
        return unknown('field_unknown', condition, providerStatus);
    }

    const result = compare(field.value, operator, condition.value);
    if (result === null) {
        return unknown('incompatible_types', condition, providerStatus);
    }

    return {
        status: result ? WORLD_INFO_CONDITION_RESULT.TRUE : WORLD_INFO_CONDITION_RESULT.FALSE,
        reason: result ? 'matched' : 'not_matched',
        providerId,
        path,
        operator,
        actual: field.value,
    };
}

/**
 * Evaluate a bounded list of conditions using Kleene-style three-valued logic.
 * Unknown never becomes true merely because it is negated by `neq`.
 *
 * @param {Array<object>} conditions
 * @param {Array<object>} providers
 * @param {'all'|'any'} logic
 * @returns {{status:'true'|'false'|'unknown',logic:'all'|'any',results:Array<object>,reason:string}}
 */
export function evaluateWorldInfoStateConditions(conditions, providers = [], logic = 'all') {
    const list = Array.isArray(conditions) ? conditions.slice(0, MAX_CONDITIONS) : [];
    const normalizedLogic = logic === 'any' ? 'any' : 'all';
    if (list.length === 0) {
        return { status: WORLD_INFO_CONDITION_RESULT.TRUE, logic: normalizedLogic, results: [], reason: 'no_conditions' };
    }

    const results = list.map(condition => evaluateWorldInfoStateCondition(condition, providers));
    const hasTrue = results.some(result => result.status === WORLD_INFO_CONDITION_RESULT.TRUE);
    const hasFalse = results.some(result => result.status === WORLD_INFO_CONDITION_RESULT.FALSE);
    const hasUnknown = results.some(result => result.status === WORLD_INFO_CONDITION_RESULT.UNKNOWN);

    if (normalizedLogic === 'any') {
        if (hasTrue) return { status: WORLD_INFO_CONDITION_RESULT.TRUE, logic: normalizedLogic, results, reason: 'matched' };
        if (hasUnknown) return { status: WORLD_INFO_CONDITION_RESULT.UNKNOWN, logic: normalizedLogic, results, reason: 'unknown' };
        return { status: WORLD_INFO_CONDITION_RESULT.FALSE, logic: normalizedLogic, results, reason: 'not_matched' };
    }

    if (hasFalse) return { status: WORLD_INFO_CONDITION_RESULT.FALSE, logic: normalizedLogic, results, reason: 'not_matched' };
    if (hasUnknown) return { status: WORLD_INFO_CONDITION_RESULT.UNKNOWN, logic: normalizedLogic, results, reason: 'unknown' };
    return { status: WORLD_INFO_CONDITION_RESULT.TRUE, logic: normalizedLogic, results, reason: 'matched' };
}
