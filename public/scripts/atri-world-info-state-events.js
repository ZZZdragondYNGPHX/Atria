// SPDX-License-Identifier: AGPL-3.0-or-later
// Pure World Info provider-snapshot and transition-event helpers.
// Runtime persistence is owned by FloorState; this module performs no I/O.

import { WORLD_INFO_CONDITION_RESULT } from './atri-world-info-state-conditions.js';

const MAX_EVENTS = 32;
const MAX_PATH_DEPTH = 12;
const MAX_FIELDS_PER_PROVIDER = 256;

function normalizePath(path) {
    if (!Array.isArray(path) || path.length === 0 || path.length > MAX_PATH_DEPTH) return null;
    const normalized = path.map(part => String(part ?? '').trim());
    return normalized.every(part => part && !['__proto__', 'constructor', 'prototype'].includes(part))
        ? normalized
        : null;
}

function isScalar(value) {
    return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function pathKey(path) {
    const normalized = normalizePath(path);
    return normalized ? JSON.stringify(normalized) : '';
}

function normalizeProviderSnapshot(raw) {
    const providers = {};
    const input = raw?.providers && typeof raw.providers === 'object' && !Array.isArray(raw.providers)
        ? raw.providers
        : {};
    for (const [providerId, provider] of Object.entries(input)) {
        const id = String(providerId || '').trim();
        if (!id) continue;
        const status = String(provider?.status || 'absent');
        const fields = {};
        if (status === 'ready' && provider?.fields && typeof provider.fields === 'object' && !Array.isArray(provider.fields)) {
            for (const [key, field] of Object.entries(provider.fields)) {
                if (Object.keys(fields).length >= MAX_FIELDS_PER_PROVIDER) break;
                const path = normalizePath(field?.path);
                if (!path || !isScalar(field?.value)) continue;
                fields[key || pathKey(path)] = { path, value: structuredClone(field.value) };
            }
        }
        providers[id] = { status, fields };
    }
    return { version: 1, providers };
}

/**
 * Detach the small scalar surface exposed by state providers.
 * @param {Array<object>} providers
 * @returns {{version:1,providers:Record<string,{status:string,fields:Record<string,{path:string[],value:unknown}>}>}}
 */
export function snapshotWorldInfoStateProviders(providers = []) {
    const snapshot = { version: 1, providers: {} };
    for (const provider of Array.isArray(providers) ? providers : []) {
        const providerId = String(provider?.providerId || '').trim();
        if (!providerId) continue;
        const status = String(provider?.status || 'absent');
        const fields = {};
        if (status === 'ready') {
            for (const field of (Array.isArray(provider?.fields) ? provider.fields : []).slice(0, MAX_FIELDS_PER_PROVIDER)) {
                const path = normalizePath(field?.path);
                if (!path || !isScalar(field?.value)) continue;
                fields[pathKey(path)] = { path, value: structuredClone(field.value) };
            }
        }
        snapshot.providers[providerId] = { status, fields };
    }
    return snapshot;
}

export function fingerprintWorldInfoStateSnapshot(snapshot) {
    return JSON.stringify(normalizeProviderSnapshot(snapshot));
}

function getSnapshotValue(snapshot, providerId, path) {
    const normalized = normalizeProviderSnapshot(snapshot);
    const provider = normalized.providers[String(providerId || '').trim()];
    if (!provider) return { known: false, reason: 'provider_absent', providerStatus: 'absent' };
    if (provider.status !== 'ready') {
        return { known: false, reason: `provider_${provider.status}`, providerStatus: provider.status };
    }
    const field = provider.fields[pathKey(path)];
    if (!field || !isScalar(field.value)) {
        return { known: false, reason: 'field_unknown', providerStatus: provider.status };
    }
    return { known: true, value: structuredClone(field.value), providerStatus: provider.status };
}

function unknown(reason, event, extra = {}) {
    return {
        status: WORLD_INFO_CONDITION_RESULT.UNKNOWN,
        reason,
        providerId: String(event?.providerId || ''),
        path: normalizePath(event?.path) || [],
        ...extra,
    };
}

/**
 * Evaluate an exact scalar transition. At least one of from/to must be present.
 * Missing baseline/current data is UNKNOWN; unknown never becomes a change.
 * @param {object} event
 * @param {object|null} previousSnapshot
 * @param {object|null} currentSnapshot
 */
export function evaluateWorldInfoStateEvent(event, previousSnapshot, currentSnapshot) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) return unknown('invalid_event', event);
    const providerId = String(event.providerId || '').trim();
    const path = normalizePath(event.path);
    const hasFrom = Object.hasOwn(event, 'from');
    const hasTo = Object.hasOwn(event, 'to');
    if (!providerId || !path || (!hasFrom && !hasTo)
        || (hasFrom && !isScalar(event.from)) || (hasTo && !isScalar(event.to))) {
        return unknown('invalid_event', event);
    }
    if (!previousSnapshot) return unknown('baseline_absent', event);

    const previous = getSnapshotValue(previousSnapshot, providerId, path);
    if (!previous.known) {
        return unknown('previous_unknown', event, {
            previousReason: previous.reason,
            previousProviderStatus: previous.providerStatus,
        });
    }
    const current = getSnapshotValue(currentSnapshot, providerId, path);
    if (!current.known) {
        return unknown('current_unknown', event, {
            currentReason: current.reason,
            currentProviderStatus: current.providerStatus,
        });
    }

    if (Object.is(previous.value, current.value)) {
        return {
            status: WORLD_INFO_CONDITION_RESULT.FALSE,
            reason: 'unchanged',
            providerId,
            path,
            previous: previous.value,
            current: current.value,
        };
    }
    if (hasFrom && !Object.is(previous.value, event.from)) {
        return {
            status: WORLD_INFO_CONDITION_RESULT.FALSE,
            reason: 'from_not_matched',
            providerId,
            path,
            previous: previous.value,
            current: current.value,
        };
    }
    if (hasTo && !Object.is(current.value, event.to)) {
        return {
            status: WORLD_INFO_CONDITION_RESULT.FALSE,
            reason: 'to_not_matched',
            providerId,
            path,
            previous: previous.value,
            current: current.value,
        };
    }

    return {
        status: WORLD_INFO_CONDITION_RESULT.TRUE,
        reason: 'transition_matched',
        providerId,
        path,
        previous: previous.value,
        current: current.value,
    };
}

/**
 * Evaluate bounded transition events with the same three-valued ALL/ANY logic
 * used by state conditions.
 */
export function evaluateWorldInfoStateEvents(events, previousSnapshot, currentSnapshot, logic = 'all') {
    const list = Array.isArray(events) ? events.slice(0, MAX_EVENTS) : [];
    const normalizedLogic = logic === 'any' ? 'any' : 'all';
    if (list.length === 0) {
        return { status: WORLD_INFO_CONDITION_RESULT.TRUE, logic: normalizedLogic, results: [], reason: 'no_events' };
    }

    const results = list.map(event => evaluateWorldInfoStateEvent(event, previousSnapshot, currentSnapshot));
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

function normalizeEventScope(scope) {
    const revisionId = String(scope?.revisionId || '').trim();
    const branchId = String(scope?.branchId || '').trim();
    const messageId = String(scope?.messageId || '').trim();
    if (revisionId || branchId || messageId) {
        return {
            ...(revisionId ? { revisionId } : {}),
            ...(branchId ? { branchId } : {}),
            ...(messageId ? { messageId } : {}),
        };
    }
    return {
        floor: Number(scope?.floor ?? -1),
        swipeId: Number(scope?.swipeId ?? 0),
    };
}

function sameEventScope(left, right) {
    const a = normalizeEventScope(left);
    const b = normalizeEventScope(right);
    return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Reuse a committed transition only for the same authority scope and same
 * current provider snapshot. Native scopes use revision/branch/message IDs;
 * classic ST scopes retain floor/swipe identity.
 */
export function resolveWorldInfoEventComparisonBaseline(runtimeState, currentSnapshot, scope) {
    const state = runtimeState && typeof runtimeState === 'object' && !Array.isArray(runtimeState)
        ? runtimeState
        : {};
    const transition = state.transition;
    const sameScope = sameEventScope(transition?.scope, scope);
    const sameCurrent = transition?.after
        && fingerprintWorldInfoStateSnapshot(transition.after) === fingerprintWorldInfoStateSnapshot(currentSnapshot);
    if (sameScope && sameCurrent && transition.before) {
        return { baseline: normalizeProviderSnapshot(transition.before), replay: true };
    }
    return {
        baseline: state.baseline ? normalizeProviderSnapshot(state.baseline) : null,
        replay: false,
    };
}

export function buildWorldInfoEventRuntimeState(previousState, comparisonBaseline, currentSnapshot, scope) {
    const normalizedCurrent = normalizeProviderSnapshot(currentSnapshot);
    const before = comparisonBaseline ? normalizeProviderSnapshot(comparisonBaseline) : null;
    const changed = before
        && fingerprintWorldInfoStateSnapshot(before) !== fingerprintWorldInfoStateSnapshot(normalizedCurrent);
    return {
        version: 1,
        baseline: normalizedCurrent,
        transition: changed ? {
            scope: normalizeEventScope(scope),
            before,
            after: normalizedCurrent,
        } : null,
    };
}
