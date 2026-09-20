/**
 * Floor-state adapter for the search-tools extension.
 *
 * Atria stores search-agent snapshots only in its current
 * `atria_search_tools_anchors` FloorState namespace. The migration to the
 * Atria product namespace is a hard cutover: predecessor-owned search-tools
 * state is neither read, copied, replayed, nor deleted here.
 *
 * Each commit tags itself at `(userMessageChatIndex, userMessageSwipeId)`
 * so FloorState structural handlers invalidate snapshots when their anchor
 * is swiped, truncated, or branched. A small meta sidecar stores only the
 * current Atria fallback managed-entry payload used when an anchor cannot be
 * committed.
 */

import {
    getPlayableMessageAt,
    isAnchoredSnapshotStillValid,
    normalizeAnchorPlayableFloor,
} from './anchors.js';
import { STATE_ERROR_REASONS, makeStateError } from '../../state-errors.js';

const STATE_NAMESPACE = 'atria_search_tools_anchors';
const META_NAMESPACE = `${STATE_NAMESPACE}__meta`;

let floorStatePromise = null;

/**
 * Lazy singleton holding the floor-state instance for search-tools. The
 * instance lives for the page session; its data namespace is kept in sync
 * with chat structure by core driving `settleXxx` from `floor-state.js`
 * on every structural transition — callers do not need to recreate it.
 */
export async function getFloorStateInstance(context) {
    if (!floorStatePromise) {
        if (typeof context?.createFloorState !== 'function') {
            throw new Error('[search-tools] createFloorState API is unavailable in extension context.');
        }
        // Caching a rejected Promise would pin every later call to the same
        // failure even after the underlying issue clears; drop the cache on
        // failure so the next call retries from scratch.
        floorStatePromise = context.createFloorState({ namespace: STATE_NAMESPACE })
            .catch((err) => {
                floorStatePromise = null;
                throw err;
            });
    }
    return floorStatePromise;
}

/**
 * Test escape hatch: drop the cached singleton so subsequent
 * `getFloorStateInstance` calls create a fresh instance. Production code
 * never needs this — the instance lives for the page session.
 */
export function resetFloorStateInstanceForTesting() {
    floorStatePromise = null;
}

/**
 * Read the current Atria meta sidecar. The sidecar intentionally contains
 * only fallback managed entries; no schema/version marker is used to trigger
 * predecessor-state migration.
 */
export async function loadMetaSidecar(context) {
    if (typeof context?.getChatState !== 'function') {
        return { fallbackManagedEntries: [] };
    }
    const result = await context.getChatState(META_NAMESPACE, {});
    if (!result.ok) {
        console.warn(`[search-tools] meta sidecar read failed (reason=${result.reason}, hint=${result.hint})`);
        return { fallbackManagedEntries: [] };
    }
    const source = result.state && typeof result.state === 'object' ? result.state : {};
    return {
        fallbackManagedEntries: Array.isArray(source.fallbackManagedEntries)
            ? source.fallbackManagedEntries
            : [],
    };
}

async function writeMetaSidecar(context, meta) {
    if (typeof context?.updateChatState !== 'function') return false;
    const result = await context.updateChatState(META_NAMESPACE, () => meta, {
        maxOperations: 2000,
        maxRetries: 1,
    });
    if (!result.ok) {
        throw new Error(`[search-tools] meta sidecar write failed (${result.reason}): ${result.hint}`);
    }
    return true;
}

/**
 * Persist the current Atria fallback managed-entry array. This sidecar is
 * used when a snapshot cannot be anchored; it is not an import or migration
 * surface for predecessor product state.
 */
export async function persistFallbackManagedEntries(context, entries) {
    const current = await loadMetaSidecar(context);
    const safe = Array.isArray(entries) ? entries : [];
    await writeMetaSidecar(context, {
        ...current,
        fallbackManagedEntries: safe,
    });
}

/**
 * Read the data namespace as a `{ [playableFloor]: snapshot }` map.
 * Returns `{}` (not null) so callers can iterate keys without a guard.
 */
export async function loadAnchorMap(context) {
    const fs = await getFloorStateInstance(context);
    const readyResult = await fs.ready();
    if (readyResult && readyResult.ok === false) {
        console.warn(`[search-tools] floor-state ready failed (reason=${readyResult.reason}, hint=${readyResult.hint})`);
        return {};
    }
    const getResult = await fs.get();
    if (!getResult.ok) {
        console.warn(`[search-tools] floor-state get failed (reason=${getResult.reason}, hint=${getResult.hint})`);
        return {};
    }
    const data = getResult.state;
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

/**
 * Write a freshly-completed search-agent snapshot. The commit's
 * (floor, swipeId) tag is derived from the anchored user message in the
 * live chat so floor-state's structural-event handlers can correctly
 * invalidate it later.
 *
 * Returns a state envelope: `{ ok: false, reason, hint }` when the anchor
 * cannot be resolved against the current chat (the user message at that
 * playable floor is missing / no longer is_user) or the snapshot fails
 * validation, otherwise the envelope returned by `fs.patch`
 * (`{ ok: true, updated: boolean }` on success, or
 * `{ ok: false, reason, hint }` on failure). Callers should branch on
 * `result.ok` and surface non-ok envelopes to the UI as soft errors.
 *
 * @param {object} context — getContext() result
 * @param {{ playableFloor: number, hash: string }} anchor
 * @param {object} snapshot — opaque payload (the search-agent result),
 *   stored as-is under `/${playableFloor}` in the data namespace.
 * @returns {Promise<{ ok: boolean, updated?: boolean, reason?: string, hint?: string }>}
 */
export async function commitAnchorSnapshot(context, anchor, snapshot) {
    const playableFloor = normalizeAnchorPlayableFloor(anchor?.playableFloor);
    if (!playableFloor) {
        return makeStateError(STATE_ERROR_REASONS.VALIDATION_ARGS, 'invalid anchor playableFloor');
    }
    if (!snapshot || typeof snapshot !== 'object') {
        return makeStateError(STATE_ERROR_REASONS.VALIDATION_ARGS, 'snapshot must be a non-null object');
    }

    const messages = Array.isArray(context?.chat) ? context.chat : [];
    const target = getPlayableMessageAt(messages, playableFloor);
    if (!target?.message || !target.message.is_user) {
        return makeStateError(STATE_ERROR_REASONS.VALIDATION_TARGET, 'anchored user message no longer present at playable floor');
    }

    const swipeIdRaw = target.message.swipe_id;
    const swipeId = Number.isInteger(swipeIdRaw) && swipeIdRaw >= 0 ? swipeIdRaw : 0;

    const fs = await getFloorStateInstance(context);
    return fs.patch(
        [{ op: 'add', path: `/${playableFloor}`, value: snapshot }],
        { floor: target.index, swipeId },
    );
}

/**
 * Pick the highest-floor entry from `anchorMap` whose anchored user
 * message still exists and whose stored anchorHash still matches the
 * live message text. Returns `{ playableFloor, snapshot }` or null.
 *
 * Snapshots whose anchor was edited (text changed without delete) fail
 * the hash check and are skipped — they remain in the data namespace as
 * orphans, but the consumer never sees them. The orphan is reaped when
 * the floor is itself swiped or deleted, or overwritten by a new commit
 * at the same floor.
 */
export function pickLatestValidSnapshot(context, anchorMap) {
    if (!anchorMap || typeof anchorMap !== 'object') return null;
    const messages = Array.isArray(context?.chat) ? context.chat : [];
    const sortedFloors = Object.keys(anchorMap)
        .map(Number)
        .filter(Number.isInteger)
        .sort((a, b) => b - a);
    for (const playableFloor of sortedFloors) {
        const snapshot = anchorMap[playableFloor];
        if (!snapshot || typeof snapshot !== 'object') continue;
        if (!isAnchoredSnapshotStillValid(messages, playableFloor, snapshot.anchorHash)) continue;
        return { playableFloor, snapshot };
    }
    return null;
}

export const constants = Object.freeze({
    STATE_NAMESPACE,
    META_NAMESPACE,
});
